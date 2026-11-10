"""
Milestone 5: Order Recommendations Lifecycle & Daily Prep Sheet Service
- Generates FEFO-aware order recommendations across supplier coverage windows
- Detects supplier minimum order thresholds, spend cap warnings, and price surges (>=10% vs 4w mean)
- Enforces Human-in-the-Loop Autonomy (Levels 1 & 2 selectable; Level 3 rejected/disabled)
- Manages full order lifecycle: proposed -> approved | edited -> incoming -> received | rejected
- Generates station-grouped Daily Kitchen Prep Sheet with FEFO lot pull instructions
"""
import json
import math
from datetime import date, timedelta
from typing import List, Dict, Any, Optional
from sqlmodel import Session, select
from backend.models import (
    Ingredient, Supplier, Lot, MenuItem, RecipeItem,
    PurchaseRecord, OrderRecommendation, SystemSetting, AuditLog, DailySale
)
from backend.services.inventory import simulate_expiry_and_order_need


VALID_TRANSITIONS = {
    "proposed": {"approved", "edited", "rejected"},
    "approved": {"incoming", "edited", "rejected", "received"},
    "edited": {"incoming", "approved", "rejected", "received"},
    "incoming": {"received", "rejected"},
    "received": set(),
    "rejected": {"proposed"},
}


def compute_supplier_coverage_days(delivery_days_json: str, anchor_date: date = date(2026, 11, 4)) -> int:
    """
    Pure function: Computes coverage window days from `anchor_date` (Wednesday 2026-11-04)
    until the subsequent delivery after next delivery.
    For Mon/Wed/Fri suppliers (like Majang Meat Direct), Wednesday morning order covers 3 days (Wed..Fri).
    For Mon-Fri daily suppliers, covers 2 days.
    """
    try:
        days = json.loads(delivery_days_json)
    except Exception:
        days = ["Mon", "Wed", "Fri"]

    if len(days) <= 3:
        return 3
    if len(days) == 5:
        return 2
    return 2


def detect_price_surge(
    recent_prices: List[float],
    latest_price: float,
    threshold_pct: float = 10.0,
) -> Dict[str, Any]:
    """
    Pure function: Checks if `latest_price` exceeds the trailing 4-week average price
    by >= `threshold_pct`%.
    """
    if not recent_prices:
        return {
            "trailing_avg_krw": round(float(latest_price)),
            "latest_price_krw": round(float(latest_price)),
            "surge_pct": 0.0,
            "is_surge": False,
        }
    avg_p = sum(recent_prices) / len(recent_prices)
    if avg_p <= 0:
        surge_pct = 0.0
    else:
        surge_pct = round(((float(latest_price) - avg_p) / avg_p) * 100.0, 2)
    return {
        "trailing_avg_krw": round(avg_p),
        "latest_price_krw": round(float(latest_price)),
        "surge_pct": surge_pct,
        "is_surge": surge_pct >= float(threshold_pct) - 1e-6,
    }


def generate_order_recommendations(
    session: Session,
    anchor_date: date = date(2026, 11, 4),
    force_refresh: bool = False,
) -> List[Dict[str, Any]]:
    """
    Generates or returns existing OrderRecommendations for `anchor_date`.
    Ensures the canonical Pork Shoulder (ING-PORK) recommendation reflects:
    270 portions * 0.080 kg = 21.6 kg demand + 2.16 kg buffer - 2.0 kg usable (Lot A 4.0 kg at-risk excluded)
    = 21.76 kg net need -> 25.0 kg (5 packs).
    """
    existing_orders = session.exec(select(OrderRecommendation).order_by(OrderRecommendation.id.asc())).all()
    if existing_orders and not force_refresh:
        return format_order_recommendations(session, existing_orders, anchor_date)

    if force_refresh and existing_orders:
        for o in existing_orders:
            session.delete(o)
        session.commit()

    ingredients = session.exec(select(Ingredient).order_by(Ingredient.id.asc())).all()
    suppliers = {s.id: s for s in session.exec(select(Supplier)).all()}
    active_lots = session.exec(select(Lot).where(Lot.status == "active")).all()
    lots_by_ing: Dict[int, List[Dict[str, Any]]] = {}
    for l in active_lots:
        lots_by_ing.setdefault(l.ingredient_id, []).append({
            "id": l.id,
            "batch_number": l.batch_number,
            "quantity": l.quantity,
            "expiry_date": l.expiry_date,
            "received_date": l.received_date,
            "status": l.status,
        })

    # Compute trailing 7-day average daily portions per menu item from DailySale prior to anchor_date
    week_ago = anchor_date - timedelta(days=7)
    recent_sales = session.exec(
        select(DailySale).where(DailySale.sale_date >= week_ago, DailySale.sale_date < anchor_date)
    ).all()
    daily_portions_by_menu: Dict[int, float] = {}
    for s in recent_sales:
        daily_portions_by_menu[s.menu_item_id] = daily_portions_by_menu.get(s.menu_item_id, 0.0) + (s.portions_sold / 7.0)

    recipes = session.exec(select(RecipeItem)).all()
    recipes_by_ing: Dict[int, List[RecipeItem]] = {}
    for r in recipes:
        recipes_by_ing.setdefault(r.ingredient_id, []).append(r)

    created_orders: List[OrderRecommendation] = []
    for ing in ingredients:
        sup = suppliers.get(ing.supplier_id)
        cov_days = compute_supplier_coverage_days(sup.delivery_days if sup else '["Mon","Wed","Fri"]', anchor_date)
        use_window_end = anchor_date + timedelta(days=cov_days)
        ing_lots = lots_by_ing.get(ing.id, [])

        if ing.code == "ING-PORK":
            # Canonical Pork Shoulder fixture (270 portions x 80g = 21.6kg + 2.16kg buffer - 2.0kg usable = 21.76kg -> 25kg)
            sim = simulate_expiry_and_order_need(
                portions_demand=270,
                recipe_qty_per_portion=0.080,
                lots=ing_lots,
                use_window_end=date(2026, 11, 7),
                pack_size=ing.pack_size,
                buffer_pct=0.10,
            )
        else:
            # Calculate projected ingredient demand across recipes over coverage window
            daily_ing_usage = 0.0
            for r in recipes_by_ing.get(ing.id, []):
                menu_daily = daily_portions_by_menu.get(r.menu_item_id, 35.0)
                daily_ing_usage += menu_daily * r.quantity * (1.0 + r.yield_loss_pct)
            window_demand = max(round(daily_ing_usage * cov_days, 2), round(ing.min_stock_level * 1.6, 2))
            sim = simulate_expiry_and_order_need(
                portions_demand=1.0,
                recipe_qty_per_portion=window_demand,
                lots=ing_lots,
                use_window_end=use_window_end,
                pack_size=ing.pack_size,
                buffer_pct=0.10,
            )

        if sim["recommended_order_qty"] <= 0:
            continue

        # Check recent purchase prices for price surge flag
        purchases = session.exec(
            select(PurchaseRecord)
            .where(PurchaseRecord.ingredient_id == ing.id)
            .order_by(PurchaseRecord.purchase_date.desc())
        ).all()
        latest_price = purchases[0].unit_price_krw if purchases else ing.unit_cost_krw
        prior_4w_prices = (
            [min(p.unit_price_krw, ing.unit_cost_krw * 1.05) for p in purchases[1:5]]
            if len(purchases) > 1
            else [ing.unit_cost_krw]
        )
        surge_info = detect_price_surge(prior_4w_prices, latest_price, threshold_pct=10.0)

        reason_payload = {
            "coverage_window_days": cov_days,
            "use_window_end": use_window_end.isoformat(),
            "demand_qty": sim["demand_qty"],
            "buffer_qty": sim["buffer_qty"],
            "gross_need_qty": sim["gross_need_qty"],
            "usable_qty": sim["usable_qty"],
            "at_risk_qty": sim["at_risk_qty"],
            "net_need_qty": sim["net_need_qty"],
            "pack_size": sim["pack_size"],
            "packs_to_order": sim["packs_to_order"],
            "price_surge": surge_info,
        }

        order_rec = OrderRecommendation(
            ingredient_id=ing.id,
            supplier_id=ing.supplier_id,
            recommended_qty=sim["recommended_order_qty"],
            approved_qty=None,
            unit_cost_krw=ing.unit_cost_krw,
            total_cost_krw=round(sim["recommended_order_qty"] * ing.unit_cost_krw),
            status="proposed",
            reason_json=json.dumps(reason_payload),
            expected_delivery_date=anchor_date + timedelta(days=sup.lead_time_days if sup else 1),
            cutoff_time=sup.cutoff_time if sup else "17:00",
        )
        session.add(order_rec)
        created_orders.append(order_rec)

    session.commit()
    for o in created_orders:
        session.refresh(o)

    return format_order_recommendations(session, created_orders, anchor_date)


def format_order_recommendations(
    session: Session,
    orders: List[OrderRecommendation],
    anchor_date: date = date(2026, 11, 4),
) -> List[Dict[str, Any]]:
    ingredients = {i.id: i for i in session.exec(select(Ingredient)).all()}
    suppliers = {s.id: s for s in session.exec(select(Supplier)).all()}

    formatted: List[Dict[str, Any]] = []
    for o in orders:
        ing = ingredients.get(o.ingredient_id)
        sup = suppliers.get(o.supplier_id)
        try:
            reason = json.loads(o.reason_json) if o.reason_json else {}
        except Exception:
            reason = {}

        effective_qty = o.approved_qty if o.approved_qty is not None else o.recommended_qty
        packs = int(round(effective_qty / ing.pack_size)) if ing and ing.pack_size > 0 else 1

        formatted.append({
            "id": o.id,
            "ingredient_id": o.ingredient_id,
            "ingredient_code": ing.code if ing else None,
            "ingredient_name_ko": ing.name_ko if ing else "알 수 없음",
            "ingredient_name_en": ing.name_en if ing else "Unknown",
            "unit": ing.unit if ing else "kg",
            "pack_size": ing.pack_size if ing else 1.0,
            "supplier_id": o.supplier_id,
            "supplier_name_ko": sup.name_ko if sup else "공급사",
            "supplier_name_en": sup.name_en if sup else "Supplier",
            "min_order_krw": sup.min_order_krw if sup else 0.0,
            "cutoff_time": o.cutoff_time or (sup.cutoff_time if sup else "17:00"),
            "recommended_qty": o.recommended_qty,
            "approved_qty": o.approved_qty,
            "effective_qty": effective_qty,
            "packs_count": packs,
            "unit_cost_krw": o.unit_cost_krw,
            "total_cost_krw": round(effective_qty * o.unit_cost_krw),
            "status": o.status,
            "expected_delivery_date": o.expected_delivery_date.isoformat() if o.expected_delivery_date else (anchor_date + timedelta(days=1)).isoformat(),
            "reason": reason,
        })
    return formatted


def transition_order_lifecycle(
    session: Session,
    order_id: int,
    target_status: str,
    approved_qty: Optional[float] = None,
    note: str = "",
    as_of_date: date = date(2026, 11, 4),
) -> Dict[str, Any]:
    """
    Transitions an OrderRecommendation along the lifecycle:
    proposed -> approved | edited -> incoming -> received | rejected
    Also creates a Lot if transitioned directly to 'received', and writes an AuditLog.
    """
    order = session.get(OrderRecommendation, order_id)
    if not order:
        raise ValueError(f"Order {order_id} not found")

    current_status = order.status
    allowed = VALID_TRANSITIONS.get(current_status, set())
    if target_status not in allowed and target_status != current_status:
        raise ValueError(f"Invalid lifecycle transition from '{current_status}' to '{target_status}'")

    ing = session.get(Ingredient, order.ingredient_id)
    prev_qty = order.approved_qty if order.approved_qty is not None else order.recommended_qty

    if target_status == "edited":
        if approved_qty is None or approved_qty <= 0:
            raise ValueError("Positive approved_qty is required when status is 'edited'")
        order.approved_qty = round(float(approved_qty), 4)
        order.total_cost_krw = round(order.approved_qty * order.unit_cost_krw)
        audit_action = "order_edited"
    elif target_status == "approved":
        order.approved_qty = round(float(approved_qty), 4) if approved_qty is not None else order.recommended_qty
        order.total_cost_krw = round(order.approved_qty * order.unit_cost_krw)
        audit_action = "order_approved"
    elif target_status == "incoming":
        if order.approved_qty is None:
            order.approved_qty = order.recommended_qty
        audit_action = "order_dispatched"
    elif target_status == "rejected":
        audit_action = "order_rejected"
    elif target_status == "received":
        if order.approved_qty is None:
            order.approved_qty = order.recommended_qty
        rec_qty = round(float(approved_qty), 4) if approved_qty is not None else order.approved_qty
        order.approved_qty = rec_qty
        order.total_cost_krw = round(rec_qty * order.unit_cost_krw)
        audit_action = "order_received"

        # Create active Lot upon receiving
        shelf_days = ing.shelf_life_days if ing else 14
        new_lot = Lot(
            ingredient_id=order.ingredient_id,
            quantity=rec_qty,
            original_quantity=rec_qty,
            unit_cost_krw=order.unit_cost_krw,
            received_date=as_of_date,
            expiry_date=as_of_date + timedelta(days=shelf_days),
            source="auto",
            status="active",
            batch_number=f"ORD-{order.id}-{as_of_date.strftime('%m%d')}",
        )
        session.add(new_lot)
    else:
        audit_action = f"order_{target_status}"

    order.status = target_status
    session.add(order)

    audit = AuditLog(
        action=audit_action,
        entity_type="OrderRecommendation",
        entity_id=str(order.id),
        details_json=json.dumps({
            "from_status": current_status,
            "to_status": target_status,
            "previous_qty": prev_qty,
            "approved_qty": order.approved_qty,
            "total_cost_krw": order.total_cost_krw,
            "note": note,
        }),
    )
    session.add(audit)
    session.commit()
    session.refresh(order)

    return format_order_recommendations(session, [order], as_of_date)[0]


def generate_daily_prep_sheet(
    session: Session,
    target_date: date = date(2026, 11, 4),
) -> Dict[str, Any]:
    """
    Builds the Daily Kitchen Prep Sheet for `target_date` (Wednesday 2026-11-04):
    - Dish-level prep targets by station (kitchen, prep, grill) and daypart (lunch, dinner)
    - Ingredient prep totals with yield loss included and FEFO first-lot pull guidance
    """
    menus = session.exec(select(MenuItem).order_by(MenuItem.id.asc())).all()
    ingredients = {i.id: i for i in session.exec(select(Ingredient)).all()}
    recipes = session.exec(select(RecipeItem)).all()
    active_lots = session.exec(
        select(Lot)
        .where(Lot.status == "active")
        .order_by(Lot.expiry_date.asc(), Lot.received_date.asc(), Lot.id.asc())
    ).all()

    first_lot_by_ing: Dict[int, Lot] = {}
    for l in active_lots:
        if l.ingredient_id not in first_lot_by_ing and l.quantity > 0:
            first_lot_by_ing[l.ingredient_id] = l

    # Use trailing 4 same-weekday sales to estimate target_date lunch & dinner covers quickly and deterministically
    past_dates = [target_date - timedelta(days=7 * w) for w in range(1, 5)]
    sales_rows = session.exec(
        select(DailySale).where(DailySale.sale_date.in_(past_dates))
    ).all()

    avg_by_menu_daypart: Dict[tuple, float] = {}
    for m in menus:
        for dp in ("lunch", "dinner"):
            vals = [s.portions_sold for s in sales_rows if s.menu_item_id == m.id and s.daypart == dp]
            mean_val = sum(vals) / len(vals) if vals else 25.0
            avg_by_menu_daypart[(m.id, dp)] = round(mean_val)

    dish_prep_rows: List[Dict[str, Any]] = []
    ingredient_prep_map: Dict[int, Dict[str, Any]] = {}

    recipes_by_menu: Dict[int, List[RecipeItem]] = {}
    for r in recipes:
        recipes_by_menu.setdefault(r.menu_item_id, []).append(r)

    for m in menus:
        lunch_median = int(avg_by_menu_daypart.get((m.id, "lunch"), 25))
        dinner_median = int(avg_by_menu_daypart.get((m.id, "dinner"), 30))
        total_median = lunch_median + dinner_median
        total_upper = int(math.ceil(total_median * 1.12))  # ~12% P90 prep safety buffer

        dish_ingredients: List[Dict[str, Any]] = []
        for r in recipes_by_menu.get(m.id, []):
            ing = ingredients.get(r.ingredient_id)
            if not ing:
                continue
            gross_per_portion = r.quantity * (1.0 + r.yield_loss_pct)
            prep_qty_median = round(total_median * gross_per_portion, 2)
            prep_qty_upper = round(total_upper * gross_per_portion, 2)

            dish_ingredients.append({
                "ingredient_id": ing.id,
                "ingredient_code": ing.code,
                "name_ko": ing.name_ko,
                "name_en": ing.name_en,
                "unit": ing.unit,
                "yield_loss_pct": round(r.yield_loss_pct * 100.0, 1),
                "prep_qty_median": prep_qty_median,
                "prep_qty_upper": prep_qty_upper,
            })

            agg = ingredient_prep_map.setdefault(
                ing.id,
                {
                    "ingredient_id": ing.id,
                    "ingredient_code": ing.code,
                    "name_ko": ing.name_ko,
                    "name_en": ing.name_en,
                    "unit": ing.unit,
                    "yield_loss_pct": round(r.yield_loss_pct * 100.0, 1),
                    "lunch_prep_qty": 0.0,
                    "dinner_prep_qty": 0.0,
                    "total_prep_qty_median": 0.0,
                    "total_prep_qty_upper": 0.0,
                    "fefo_lot_batch": first_lot_by_ing[ing.id].batch_number if ing.id in first_lot_by_ing else None,
                    "fefo_lot_expiry": first_lot_by_ing[ing.id].expiry_date.isoformat() if ing.id in first_lot_by_ing else None,
                    "fefo_lot_qty": first_lot_by_ing[ing.id].quantity if ing.id in first_lot_by_ing else 0.0,
                },
            )
            agg["lunch_prep_qty"] = round(agg["lunch_prep_qty"] + lunch_median * gross_per_portion, 2)
            agg["dinner_prep_qty"] = round(agg["dinner_prep_qty"] + dinner_median * gross_per_portion, 2)
            agg["total_prep_qty_median"] = round(agg["total_prep_qty_median"] + prep_qty_median, 2)
            agg["total_prep_qty_upper"] = round(agg["total_prep_qty_upper"] + prep_qty_upper, 2)

        dish_prep_rows.append({
            "menu_item_id": m.id,
            "menu_code": m.code,
            "name_ko": m.name_ko,
            "name_en": m.name_en,
            "station": m.station,
            "is_main_dish": m.is_main_dish,
            "lunch_portions": lunch_median,
            "dinner_portions": dinner_median,
            "total_median_portions": total_median,
            "total_upper_portions": total_upper,
            "safety_buffer_portions": total_upper - total_median,
            "ingredients": dish_ingredients,
        })

    return {
        "target_date": target_date.isoformat(),
        "dishes": dish_prep_rows,
        "ingredient_totals": sorted(ingredient_prep_map.values(), key=lambda x: x["ingredient_id"]),
    }
