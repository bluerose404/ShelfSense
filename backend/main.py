from fastapi import FastAPI, Depends, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from datetime import date, datetime, timedelta
from typing import Optional, Dict, Any
from pydantic import BaseModel
from backend.database import get_session
from backend.models import (
    SystemSetting, MenuItem, Ingredient, Supplier, Product, Lot, DailySale,
    OrderRecommendation, AuditLog
)
from backend.services.forecast import ForecastEngine, fetch_training_dataframe
from backend.services.sales_importer import check_sales_csv_data
from backend.services.barcodes import validate_ean13, parse_gs1_2d
from backend.services.product_lookup import product_lookup, extract_expiry_date_from_image_stub
from backend.services.inventory import (
    deplete_lots_fefo,
    simulate_expiry_and_order_need,
    get_all_ingredients_expiry_risk_summary,
    apply_spot_count_adjustment,
)
from backend.services.ordering import (
    generate_order_recommendations,
    transition_order_lifecycle,
    generate_daily_prep_sheet,
)
from backend.services.waste_labor import (
    get_waste_logs_and_summary,
    record_waste_event,
    generate_weekly_labor_draft,
    simulate_early_cut,
)

app = FastAPI(title="ShelfSense API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_cached_backtest = None
_cached_forecast = None

class ScanLookupRequest(BaseModel):
    barcode_payload: str

class RegisterProductRequest(BaseModel):
    barcode: str
    name_ko: str
    name_en: str
    maker: str
    food_type: str
    pack_size: float
    unit: str
    standard_shelf_life_days: int
    ingredient_id: int

class ReceiveLotRequest(BaseModel):
    ingredient_id: int
    product_id: Optional[int] = None
    quantity: float
    unit_cost_krw: float
    expiry_date: str # YYYY-MM-DD
    source: str = "manual" # auto, manual, estimated, photo
    batch_number: Optional[str] = None
    matched_order_id: Optional[int] = None

class SpotCountRequest(BaseModel):
    ingredient_id: int
    counted_qty: float
    reason: str = "Physical spot count adjustment"

class FefoDepleteRequest(BaseModel):
    ingredient_id: int
    demand_qty: float
    commit: bool = False

class OrderTransitionRequest(BaseModel):
    target_status: str  # approved, edited, incoming, received, rejected
    approved_qty: Optional[float] = None
    note: str = ""

class AutonomyUpdateRequest(BaseModel):
    autonomy_level: int

class WasteCreateRequest(BaseModel):
    ingredient_id: int
    quantity: float
    reason: str  # expired, spoiled, dropped, over_prepared, leftover, other
    notes: str = ""
    lot_id: Optional[int] = None

class EarlyCutSimRequest(BaseModel):
    projected_covers_per_hour: float = 48.0
    actual_covers_per_hour: float = 24.0
    scheduled_front_staff: int = 4
    covers_per_staff_per_hour: float = 14.0
    cut_hours: float = 1.5
    hourly_wage_krw: float = 10500.0
    staff_current_weekly_hours: float = 16.0
    min_staff_floor: int = 2

class FivePlusToggleRequest(BaseModel):
    has_5_plus_employees: bool

class SettingsBatchUpdateRequest(BaseModel):
    settings: Dict[str, Any]

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "ShelfSense", "demo": True}

@app.get("/api/settings")
def get_settings(session: Session = Depends(get_session)):
    settings = session.exec(select(SystemSetting)).all()
    return {s.key: s.value for s in settings}

@app.get("/api/menu")
def get_menu(session: Session = Depends(get_session)):
    return session.exec(select(MenuItem)).all()

@app.get("/api/ingredients")
def get_ingredients(session: Session = Depends(get_session)):
    return session.exec(select(Ingredient)).all()

@app.get("/api/products")
def get_products(session: Session = Depends(get_session)):
    return session.exec(select(Product)).all()

@app.get("/api/lots")
def get_lots(session: Session = Depends(get_session)):
    today = date(2026, 11, 4)
    lots = session.exec(
        select(Lot)
        .where(Lot.status == "active")
        .order_by(Lot.expiry_date.asc(), Lot.received_date.asc(), Lot.id.asc())
    ).all()
    result = []
    # Join ingredient details in FEFO order
    for l in lots:
        ing = session.exec(select(Ingredient).where(Ingredient.id == l.ingredient_id)).first()
        prod = session.exec(select(Product).where(Product.id == l.product_id)).first() if l.product_id else None
        days_left = (l.expiry_date - today).days
        if days_left < 0:
            expiry_status = "expired"
        elif days_left <= 2:
            expiry_status = "urgent"
        elif days_left <= 5:
            expiry_status = "warning"
        else:
            expiry_status = "good"

        result.append({
            "id": l.id,
            "ingredient_id": l.ingredient_id,
            "ingredient_code": ing.code if ing else None,
            "ingredient_name_ko": ing.name_ko if ing else "알 수 없음",
            "ingredient_name_en": ing.name_en if ing else "Unknown",
            "unit": ing.unit if ing else "kg",
            "product_name_ko": prod.name_ko if prod else None,
            "product_name_en": prod.name_en if prod else None,
            "quantity": l.quantity,
            "original_quantity": l.original_quantity,
            "unit_cost_krw": l.unit_cost_krw,
            "received_date": l.received_date.isoformat(),
            "expiry_date": l.expiry_date.isoformat(),
            "days_until_expiry": days_left,
            "expiry_status": expiry_status,
            "source": l.source,
            "status": l.status,
            "batch_number": l.batch_number
        })
    return result

@app.get("/api/forecast/7day")
def get_7day_forecast():
    global _cached_backtest, _cached_forecast
    engine = ForecastEngine()
    df = fetch_training_dataframe()
    if _cached_backtest is None:
        _cached_backtest = engine.run_rolling_backtest(df, num_folds=8, fold_days=7)
    
    anchor_date = date(2026, 11, 4)
    if _cached_forecast is None:
        _cached_forecast = engine.generate_7day_forecast(df, _cached_backtest, anchor_date)
    return {
        "forecast": _cached_forecast,
        "backtest_summary": {
            f"{k[0]}_{k[1]}": v for k, v in _cached_backtest.get("series", {}).items()
        },
        "overall": _cached_backtest.get("overall", {})
    }

@app.post("/api/forecast/check-csv")
async def check_csv_sales(file: UploadFile = File(...)):
    content = await file.read()
    return check_sales_csv_data(content)

@app.post("/api/scan/lookup")
def scan_lookup(req: ScanLookupRequest, session: Session = Depends(get_session)):
    raw = req.barcode_payload.strip()
    today = date(2026, 11, 4)

    # 1. Parse GS1 2D barcode payload if applicable
    gs1_info = parse_gs1_2d(raw)
    barcode_to_lookup = gs1_info["ean13"] if gs1_info["is_gs1"] and gs1_info["ean13"] else raw
    ean13_valid = validate_ean13(barcode_to_lookup)

    # 2. Lookup Product in Hierarchy (Internal -> Public API Mock -> None)
    prod = product_lookup.lookup(barcode_to_lookup)

    # 3. Determine expiry date and source (GS1 auto vs shelf-life estimated vs manual)
    estimated_expiry = None
    expiry_source = "manual"
    if gs1_info["expiry_date"]:
        estimated_expiry = gs1_info["expiry_date"]
        expiry_source = "auto"
    elif prod and prod.get("standard_shelf_life_days"):
        estimated_expiry = (today + timedelta(days=int(prod["standard_shelf_life_days"]))).isoformat()
        expiry_source = "estimated"

    # 4. Check for matching incoming orders
    incoming_order = None
    if prod and prod.get("ingredient_id"):
        order = session.exec(
            select(OrderRecommendation).where(
                OrderRecommendation.ingredient_id == prod["ingredient_id"],
                OrderRecommendation.status == "incoming"
            )
        ).first()
        if order:
            ing = session.exec(select(Ingredient).where(Ingredient.id == order.ingredient_id)).first()
            sup = session.exec(select(Supplier).where(Supplier.id == order.supplier_id)).first()
            incoming_order = {
                "id": order.id,
                "ingredient_id": order.ingredient_id,
                "ingredient_name_ko": ing.name_ko if ing else None,
                "ingredient_name_en": ing.name_en if ing else None,
                "unit": ing.unit if ing else "kg",
                "supplier_name_ko": sup.name_ko if sup else None,
                "supplier_name_en": sup.name_en if sup else None,
                "recommended_qty": order.recommended_qty,
                "approved_qty": order.approved_qty,
                "expected_delivery_date": order.expected_delivery_date.isoformat() if order.expected_delivery_date else None
            }

    return {
        "raw_payload": raw,
        "barcode": barcode_to_lookup,
        "ean13_valid": ean13_valid,
        "is_gs1": gs1_info["is_gs1"],
        "extracted_expiry": gs1_info["expiry_date"],
        "estimated_expiry": estimated_expiry,
        "expiry_source": expiry_source,
        "extracted_batch": gs1_info["batch"],
        "product": prod,
        "incoming_order": incoming_order
    }

@app.post("/api/scan/ocr-expiry")
async def ocr_expiry_stub(file: UploadFile = File(...)):
    content = await file.read()
    extracted = extract_expiry_date_from_image_stub(content)
    return {
        "status": "stub",
        "extracted_expiry": extracted.isoformat() if extracted else None,
        "source": "photo",
        "message_ko": "OCR 스텁(Stub) 모드: 실제 이미지 OCR은 범위 외이므로 소비기한을 직접 확인·입력해 주세요.",
        "message_en": "OCR Stub Mode: Real image OCR is out of scope; please verify and enter the Use-by Date (소비기한) manually."
    }

@app.post("/api/scan/register-product")
def register_product(req: RegisterProductRequest, session: Session = Depends(get_session)):
    if not validate_ean13(req.barcode):
        raise HTTPException(status_code=400, detail="Invalid EAN-13 barcode check digit")

    existing = session.exec(select(Product).where(Product.barcode == req.barcode)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Product already exists")

    prod = Product(
        barcode=req.barcode,
        name_ko=req.name_ko,
        name_en=req.name_en,
        maker=req.maker,
        food_type=req.food_type,
        pack_size=req.pack_size,
        unit=req.unit,
        standard_shelf_life_days=req.standard_shelf_life_days,
        ingredient_id=req.ingredient_id
    )
    session.add(prod)

    audit = AuditLog(
        action="product_registered",
        entity_type="Product",
        details_json=f'{{"barcode": "{req.barcode}", "name_ko": "{req.name_ko}", "ingredient_id": {req.ingredient_id}}}'
    )
    session.add(audit)
    session.commit()
    session.refresh(prod)
    return product_lookup.lookup(req.barcode)

@app.get("/api/orders/incoming")
def get_incoming_orders(session: Session = Depends(get_session)):
    orders = session.exec(
        select(OrderRecommendation).where(OrderRecommendation.status == "incoming")
    ).all()
    result = []
    for o in orders:
        ing = session.exec(select(Ingredient).where(Ingredient.id == o.ingredient_id)).first()
        sup = session.exec(select(Supplier).where(Supplier.id == o.supplier_id)).first()
        result.append({
            "id": o.id,
            "ingredient_id": o.ingredient_id,
            "ingredient_code": ing.code if ing else None,
            "ingredient_name_ko": ing.name_ko if ing else "알 수 없음",
            "ingredient_name_en": ing.name_en if ing else "Unknown",
            "unit": ing.unit if ing else "kg",
            "supplier_name_ko": sup.name_ko if sup else None,
            "supplier_name_en": sup.name_en if sup else None,
            "recommended_qty": o.recommended_qty,
            "approved_qty": o.approved_qty,
            "expected_delivery_date": o.expected_delivery_date.isoformat() if o.expected_delivery_date else None,
            "status": o.status,
        })
    return result

@app.post("/api/orders/demo-incoming")
def create_demo_incoming_orders(session: Session = Depends(get_session)):
    """
    Creates or resets 3 sample 'incoming' orders for demo receiving match
    (ING-KIMCHI 20kg, ING-PORK 25kg, ING-TOFU 20 unit) on 2026-11-04.
    """
    today = date(2026, 11, 4)
    demo_specs = [
        ("ING-KIMCHI", 20.0),
        ("ING-PORK", 25.0),
        ("ING-TOFU", 20.0),
    ]
    created_ids = []
    for code, qty in demo_specs:
        ing = session.exec(select(Ingredient).where(Ingredient.code == code)).first()
        if not ing:
            continue
        existing = session.exec(
            select(OrderRecommendation).where(
                OrderRecommendation.ingredient_id == ing.id,
                OrderRecommendation.status == "incoming"
            )
        ).first()
        if existing:
            created_ids.append(existing.id)
            continue
        order = OrderRecommendation(
            ingredient_id=ing.id,
            supplier_id=ing.supplier_id,
            recommended_qty=qty,
            approved_qty=qty,
            unit_cost_krw=ing.unit_cost_krw,
            total_cost_krw=round(qty * ing.unit_cost_krw),
            status="incoming",
            reason_json=f'{{"demo": true, "note": "Demo incoming order for {ing.code}"}}',
            expected_delivery_date=today,
            cutoff_time="17:00",
        )
        session.add(order)
        session.commit()
        session.refresh(order)
        created_ids.append(order.id)
    return {"status": "ok", "incoming_order_ids": created_ids}

@app.post("/api/scan/receive")
def receive_lot(req: ReceiveLotRequest, session: Session = Depends(get_session)):
    try:
        exp_date = datetime.strptime(req.expiry_date, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid expiry date format, expected YYYY-MM-DD")

    today = date(2026, 11, 4) # Demo clock date

    lot = Lot(
        ingredient_id=req.ingredient_id,
        product_id=req.product_id,
        quantity=req.quantity,
        original_quantity=req.quantity,
        unit_cost_krw=req.unit_cost_krw,
        received_date=today,
        expiry_date=exp_date,
        source=req.source,
        status="active",
        batch_number=req.batch_number
    )
    session.add(lot)

    # If linked to an incoming order, transition its state to received
    discrepancy = None
    if req.matched_order_id:
        order = session.exec(select(OrderRecommendation).where(OrderRecommendation.id == req.matched_order_id)).first()
        if order:
            order.status = "received"
            expected_qty = order.approved_qty or order.recommended_qty
            if abs(req.quantity - expected_qty) > 0.01:
                discrepancy = f"Quantity mismatch: ordered {expected_qty}, received {req.quantity}"
            session.add(order)

    # Audit Log
    audit = AuditLog(
        action="scan_received",
        entity_type="Lot",
        details_json=f'{{"qty": {req.quantity}, "source": "{req.source}", "expiry": "{req.expiry_date}", "discrepancy": "{discrepancy or "none"}"}}'
    )
    session.add(audit)
    session.commit()
    session.refresh(lot)

    return {
        "status": "success",
        "lot_id": lot.id,
        "discrepancy": discrepancy
    }

@app.get("/api/inventory/expiry-risk")
def get_expiry_risk(coverage_window_days: int = 3, session: Session = Depends(get_session)):
    today = date(2026, 11, 4)
    return get_all_ingredients_expiry_risk_summary(
        session=session,
        anchor_date=today,
        coverage_window_days=coverage_window_days,
    )

@app.post("/api/inventory/deplete-fefo")
def run_fefo_depletion(req: FefoDepleteRequest, session: Session = Depends(get_session)):
    today = date(2026, 11, 4)
    active_lots = session.exec(
        select(Lot)
        .where(Lot.ingredient_id == req.ingredient_id, Lot.status == "active")
        .order_by(Lot.expiry_date.asc(), Lot.received_date.asc(), Lot.id.asc())
    ).all()

    lot_dicts = [
        {
            "id": l.id,
            "batch_number": l.batch_number,
            "quantity": l.quantity,
            "expiry_date": l.expiry_date.isoformat(),
            "received_date": l.received_date.isoformat(),
            "status": l.status,
        }
        for l in active_lots
    ]

    result = deplete_lots_fefo(lot_dicts, req.demand_qty, today)

    if req.commit:
        for upd in result["updated_lots"]:
            lot_obj = session.get(Lot, upd["id"])
            if lot_obj:
                lot_obj.quantity = upd["remaining_qty"]
                lot_obj.status = upd["status_after"]
                session.add(lot_obj)
        session.commit()

    return result

@app.post("/api/inventory/spot-count")
def spot_count_adjust(req: SpotCountRequest, session: Session = Depends(get_session)):
    try:
        return apply_spot_count_adjustment(
            session=session,
            ingredient_id=req.ingredient_id,
            counted_qty=req.counted_qty,
            reason=req.reason,
            as_of_date=date(2026, 11, 4),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/orders/recommendations")
def get_order_recommendations(refresh: bool = False, session: Session = Depends(get_session)):
    orders = generate_order_recommendations(
        session=session,
        anchor_date=date(2026, 11, 4),
        force_refresh=refresh,
    )
    settings_map = {s.key: s.value for s in session.exec(select(SystemSetting)).all()}
    spend_cap_krw = float(settings_map.get("spend_cap_krw", "1000000"))
    autonomy_level = int(settings_map.get("autonomy_level", "2"))
    total_active_spend = sum(
        o["total_cost_krw"] for o in orders if o["status"] != "rejected"
    )
    return {
        "orders": orders,
        "autonomy_level": autonomy_level,
        "spend_cap_krw": spend_cap_krw,
        "total_active_spend_krw": total_active_spend,
        "spend_cap_exceeded": total_active_spend > spend_cap_krw,
    }

@app.post("/api/orders/{order_id}/transition")
def transition_order(order_id: int, req: OrderTransitionRequest, session: Session = Depends(get_session)):
    try:
        updated = transition_order_lifecycle(
            session=session,
            order_id=order_id,
            target_status=req.target_status,
            approved_qty=req.approved_qty,
            note=req.note,
            as_of_date=date(2026, 11, 4),
        )
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/orders/approve-all")
def approve_all_proposed_orders(session: Session = Depends(get_session)):
    proposed = session.exec(
        select(OrderRecommendation).where(OrderRecommendation.status == "proposed")
    ).all()
    approved_list = []
    for o in proposed:
        upd = transition_order_lifecycle(
            session=session,
            order_id=o.id,
            target_status="approved",
            approved_qty=o.recommended_qty,
            note="One-tap approve all (Autonomy Level 2)",
            as_of_date=date(2026, 11, 4),
        )
        approved_list.append(upd)
    return {"status": "ok", "approved_count": len(approved_list), "orders": approved_list}

@app.post("/api/settings/autonomy")
def update_autonomy_level(req: AutonomyUpdateRequest, session: Session = Depends(get_session)):
    if req.autonomy_level not in (1, 2):
        raise HTTPException(
            status_code=400,
            detail="Autonomy Level 3 (Full auto-order) is disabled by human-in-the-loop policy. Only Level 1 or Level 2 is allowed.",
        )
    setting = session.exec(select(SystemSetting).where(SystemSetting.key == "autonomy_level")).first()
    if setting:
        setting.value = str(req.autonomy_level)
        session.add(setting)
        session.add(
            AuditLog(
                action="setting_changed",
                entity_type="SystemSetting",
                entity_id="autonomy_level",
                details_json=f'{{"autonomy_level": {req.autonomy_level}}}',
            )
        )
        session.commit()
    return {"status": "ok", "autonomy_level": req.autonomy_level}

@app.get("/api/prep/sheet")
def get_prep_sheet(session: Session = Depends(get_session)):
    return generate_daily_prep_sheet(session=session, target_date=date(2026, 11, 4))

@app.get("/api/waste")
def get_waste(limit: int = 40, session: Session = Depends(get_session)):
    return get_waste_logs_and_summary(session=session, limit=limit)

@app.post("/api/waste")
def post_waste(req: WasteCreateRequest, session: Session = Depends(get_session)):
    try:
        return record_waste_event(
            session=session,
            ingredient_id=req.ingredient_id,
            quantity=req.quantity,
            reason=req.reason,
            notes=req.notes,
            lot_id=req.lot_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/labor/draft")
def get_labor_draft(session: Session = Depends(get_session)):
    return generate_weekly_labor_draft(session=session)

@app.post("/api/labor/early-cut")
def run_early_cut_sim(req: EarlyCutSimRequest):
    return simulate_early_cut(
        projected_covers_per_hour=req.projected_covers_per_hour,
        actual_covers_per_hour=req.actual_covers_per_hour,
        scheduled_front_staff=req.scheduled_front_staff,
        covers_per_staff_per_hour=req.covers_per_staff_per_hour,
        cut_hours=req.cut_hours,
        hourly_wage_krw=req.hourly_wage_krw,
        staff_current_weekly_hours=req.staff_current_weekly_hours,
        min_staff_floor=req.min_staff_floor,
    )

@app.post("/api/settings/five-plus")
def toggle_five_plus_employees(req: FivePlusToggleRequest, session: Session = Depends(get_session)):
    setting = session.exec(select(SystemSetting).where(SystemSetting.key == "has_5_plus_employees")).first()
    val_str = "true" if req.has_5_plus_employees else "false"
    if setting:
        setting.value = val_str
        session.add(setting)
        session.add(
            AuditLog(
                action="setting_changed",
                entity_type="SystemSetting",
                entity_id="has_5_plus_employees",
                details_json=f'{{"has_5_plus_employees": {val_str}}}',
            )
        )
        session.commit()
    return {"status": "ok", "has_5_plus_employees": req.has_5_plus_employees}

@app.post("/api/settings/update")
def update_settings_batch(req: SettingsBatchUpdateRequest, session: Session = Depends(get_session)):
    if "autonomy_level" in req.settings and int(req.settings["autonomy_level"]) not in (1, 2):
        raise HTTPException(
            status_code=400,
            detail="Autonomy Level 3 (Full auto-order) is disabled by human-in-the-loop policy.",
        )

    updated_keys = []
    for k, v in req.settings.items():
        if k == "demo_clock":
            continue  # demo_clock is fixed to 2026-11-04 09:00:00
        s_obj = session.exec(select(SystemSetting).where(SystemSetting.key == k)).first()
        if s_obj:
            s_obj.value = str(v).lower() if isinstance(v, bool) else str(v)
            session.add(s_obj)
            updated_keys.append(k)

    session.add(
        AuditLog(
            action="setting_changed",
            entity_type="SystemSetting",
            entity_id=",".join(updated_keys),
            details_json=str(req.settings).replace("'", '"'),
        )
    )
    session.commit()
    all_settings = session.exec(select(SystemSetting)).all()
    return {"status": "ok", "settings": {s.key: s.value for s in all_settings}}

@app.get("/api/audit-logs")
def get_audit_logs(limit: int = 50, action: Optional[str] = None, session: Session = Depends(get_session)):
    stmt = select(AuditLog).order_by(AuditLog.id.desc())
    if action and action != "all":
        stmt = stmt.where(AuditLog.action == action)
    logs = session.exec(stmt).all()[:limit]
    return [
        {
            "id": a.id,
            "timestamp": a.timestamp.isoformat(),
            "action": a.action,
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "details_json": a.details_json,
        }
        for a in logs
    ]

@app.get("/api/summary/morning")
def get_morning_summary(session: Session = Depends(get_session)):
    today = date(2026, 11, 4)
    settings_map = {s.key: s.value for s in session.exec(select(SystemSetting)).all()}

    # 1. Inventory & urgent 소비기한 alerts
    lots_data = get_lots(session=session)
    urgent_lots = [l for l in lots_data if l["days_until_expiry"] <= 2]

    # 2. Order recommendations
    orders_data = generate_order_recommendations(session=session, anchor_date=today, force_refresh=False)
    proposed_orders = [o for o in orders_data if o["status"] == "proposed"]
    pork_order = next((o for o in orders_data if o["ingredient_code"] == "ING-PORK"), None)

    # 3. Prep sheet totals
    prep_sheet = generate_daily_prep_sheet(session=session, target_date=today)
    today_median_covers = sum(d["total_median_portions"] for d in prep_sheet["dishes"])
    today_upper_covers = sum(d["total_upper_portions"] for d in prep_sheet["dishes"])

    # 4. Waste & Labor summaries
    waste_summary = get_waste_logs_and_summary(session=session, limit=10)
    recent_week_waste_krw = sum(w["cost_krw"] for w in waste_summary["recent_logs"][:18])
    labor_draft = generate_weekly_labor_draft(session=session)
    canon_labor = labor_draft["canonical_budget_summary"]

    food_cost_pct = 31.2
    labor_cost_pct = canon_labor["draft_labor_pct"]  # 27.6%
    prime_cost_pct = round(food_cost_pct + labor_cost_pct, 1)  # 58.8%

    return {
        "demo_clock": settings_map.get("demo_clock", "2026-11-04 09:00:00"),
        "autonomy_level": int(settings_map.get("autonomy_level", "2")),
        "kpis": {
            "projected_weekly_sales_krw": canon_labor["projected_sales_krw"],
            "food_cost_pct": food_cost_pct,
            "labor_cost_pct": labor_cost_pct,
            "target_labor_pct": canon_labor["target_labor_pct"],
            "prime_cost_pct": prime_cost_pct,
            "forecast_wape_pct": 9.97,
            "baseline_wape_pct": 15.28,
            "holiday_aware_baseline_wape_pct": 10.54,
            "pooled_coverage_pct": 89.29,
            "recent_week_waste_krw": recent_week_waste_krw,
        },
        "inventory_alerts": {
            "total_active_lots": len(lots_data),
            "urgent_lots_count": len(urgent_lots),
            "urgent_lots": urgent_lots,
        },
        "ordering_alerts": {
            "total_orders_count": len(orders_data),
            "proposed_orders_count": len(proposed_orders),
            "total_proposed_spend_krw": sum(o["total_cost_krw"] for o in proposed_orders),
            "pork_highlight": pork_order,
        },
        "prep_and_labor": {
            "today_median_covers": today_median_covers,
            "today_upper_covers": today_upper_covers,
            "peak_front_staff": canon_labor["peak_front_staff"],
            "labor_budget_krw": canon_labor["labor_budget_krw"],
            "labor_draft_cost_krw": canon_labor["draft_cost_krw"],
            "disclaimer_ko": labor_draft["disclaimer_ko"],
            "disclaimer_en": labor_draft["disclaimer_en"],
        },
    }
