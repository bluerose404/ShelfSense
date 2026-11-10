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
    lots = session.exec(select(Lot).where(Lot.status == "active")).all()
    result = []
    # Join ingredient details
    for l in lots:
        ing = session.exec(select(Ingredient).where(Ingredient.id == l.ingredient_id)).first()
        prod = session.exec(select(Product).where(Product.id == l.product_id)).first() if l.product_id else None
        result.append({
            "id": l.id,
            "ingredient_id": l.ingredient_id,
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
    
    # 1. Parse GS1 2D barcode payload if applicable
    gs1_info = parse_gs1_2d(raw)
    barcode_to_lookup = gs1_info["ean13"] if gs1_info["is_gs1"] and gs1_info["ean13"] else raw

    # 2. Lookup Product in Hierarchy
    prod = product_lookup.lookup(barcode_to_lookup)

    # 3. Check for matching incoming orders
    incoming_order = None
    if prod and prod.get("ingredient_id"):
        order = session.exec(
            select(OrderRecommendation).where(
                OrderRecommendation.ingredient_id == prod["ingredient_id"],
                OrderRecommendation.status == "incoming"
            )
        ).first()
        if order:
            incoming_order = {
                "id": order.id,
                "recommended_qty": order.recommended_qty,
                "approved_qty": order.approved_qty,
                "expected_delivery_date": order.expected_delivery_date.isoformat() if order.expected_delivery_date else None
            }

    return {
        "raw_payload": raw,
        "barcode": barcode_to_lookup,
        "is_gs1": gs1_info["is_gs1"],
        "extracted_expiry": gs1_info["expiry_date"],
        "extracted_batch": gs1_info["batch"],
        "product": prod,
        "incoming_order": incoming_order
    }

@app.post("/api/scan/register-product")
def register_product(req: RegisterProductRequest, session: Session = Depends(get_session)):
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
    session.commit()
    session.refresh(prod)
    return prod

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
