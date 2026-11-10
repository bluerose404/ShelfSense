"""
Milestone 4: Inventory FEFO Depletion, Expiry-Risk Simulation & Spot Count Service
- Pure functions for FEFO lot depletion, supplier-window expiry-risk & order need calculation
  (including the canonical Pork Shoulder 21.6kg + 2.16kg buffer - 2.0kg usable -> 21.76kg -> 25kg fixture),
  and physical spot-count variance calculation.
- Database-backed helpers for live expiry-risk simulation and spot-count adjustments with AuditLog.
"""
import json
import math
from datetime import date, timedelta
from typing import List, Dict, Any, Optional
from sqlmodel import Session, select
from backend.models import Ingredient, Lot, RecipeItem, StockSnapshot, AuditLog


def deplete_lots_fefo(
    lots: List[Dict[str, Any]],
    demand_qty: float,
    as_of_date: date,
) -> Dict[str, Any]:
    """
    Pure function: Depletes active lots in strict FEFO (First-Expired, First-Out) order
    (expiry_date asc, received_date asc, id asc) for a given as_of_date.
    Lots with expiry_date < as_of_date are treated as expired and cannot satisfy demand.
    """
    remaining_demand = round(max(0.0, float(demand_qty)), 6)
    expired_lots: List[Dict[str, Any]] = []
    usable_candidates: List[Dict[str, Any]] = []

    for lot in lots:
        lot_copy = dict(lot)
        exp_d = (
            date.fromisoformat(lot_copy["expiry_date"])
            if isinstance(lot_copy["expiry_date"], str)
            else lot_copy["expiry_date"]
        )
        rec_d = (
            date.fromisoformat(lot_copy.get("received_date", "2026-11-01"))
            if isinstance(lot_copy.get("received_date", "2026-11-01"), str)
            else lot_copy.get("received_date", date(2026, 11, 1))
        )
        lot_copy["_exp_date"] = exp_d
        lot_copy["_rec_date"] = rec_d

        if float(lot_copy.get("quantity", 0.0)) <= 0 or lot_copy.get("status", "active") != "active":
            continue
        if exp_d < as_of_date:
            lot_copy["depleted_qty"] = 0.0
            lot_copy["remaining_qty"] = round(float(lot_copy["quantity"]), 4)
            lot_copy["status_after"] = "expired"
            expired_lots.append(lot_copy)
        else:
            usable_candidates.append(lot_copy)

    # Sort usable lots by (expiry_date asc, received_date asc, id asc)
    usable_candidates.sort(key=lambda x: (x["_exp_date"], x["_rec_date"], x.get("id", 0)))

    total_depleted = 0.0
    updated_lots: List[Dict[str, Any]] = []

    for lot_copy in usable_candidates:
        avail = float(lot_copy["quantity"])
        if remaining_demand > 0 and avail > 0:
            used = min(avail, remaining_demand)
            rem = round(avail - used, 4)
            remaining_demand = round(remaining_demand - used, 6)
            total_depleted = round(total_depleted + used, 4)
        else:
            used = 0.0
            rem = round(avail, 4)

        lot_copy["depleted_qty"] = round(used, 4)
        lot_copy["remaining_qty"] = rem
        lot_copy["status_after"] = "depleted" if rem <= 1e-6 else "active"
        del lot_copy["_exp_date"]
        del lot_copy["_rec_date"]
        updated_lots.append(lot_copy)

    for exp_lot in expired_lots:
        del exp_lot["_exp_date"]
        del exp_lot["_rec_date"]

    return {
        "requested_demand_qty": round(float(demand_qty), 4),
        "total_depleted_qty": round(total_depleted, 4),
        "unmet_shortfall_qty": round(max(0.0, remaining_demand), 4),
        "updated_lots": updated_lots,
        "expired_lots": expired_lots,
    }


def simulate_expiry_and_order_need(
    portions_demand: float,
    recipe_qty_per_portion: float,
    lots: List[Dict[str, Any]],
    use_window_end: date,
    pack_size: float,
    buffer_pct: float = 0.10,
    yield_loss_pct: float = 0.0,
    explicit_buffer_qty: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Pure function for FEFO expiry-risk and supplier-window order calculation.

    Canonical Pork Shoulder Fixture:
    - portions_demand = 270, recipe_qty_per_portion = 0.080 kg -> demand_qty = 21.6 kg
    - buffer_pct = 0.10 -> buffer_qty = 2.16 kg -> gross_need_qty = 23.76 kg
    - Lot A (4.0 kg, expiry_date < use_window_end) -> excluded / at-risk (4.0 kg)
    - Lot B (2.0 kg, expiry_date >= use_window_end) -> usable (2.0 kg)
    - net_need_qty = 21.6 + 2.16 - 2.0 = 21.76 kg
    - pack_size = 5.0 kg -> packs_to_order = 5 -> recommended_order_qty = 25.0 kg
    """
    demand_qty = round(float(portions_demand) * float(recipe_qty_per_portion) * (1.0 + float(yield_loss_pct)), 4)
    if explicit_buffer_qty is not None:
        buffer_qty = round(float(explicit_buffer_qty), 4)
    else:
        buffer_qty = round(demand_qty * float(buffer_pct), 4)

    gross_need_qty = round(demand_qty + buffer_qty, 4)

    usable_qty = 0.0
    at_risk_qty = 0.0
    lot_breakdown: List[Dict[str, Any]] = []

    # Sort lots in FEFO order (expiry_date asc)
    sorted_lots = sorted(
        lots,
        key=lambda l: (
            date.fromisoformat(l["expiry_date"]) if isinstance(l["expiry_date"], str) else l["expiry_date"],
            l.get("id", 0),
        ),
    )

    for lot in sorted_lots:
        qty = round(float(lot.get("quantity", 0.0)), 4)
        if qty <= 0 or lot.get("status", "active") != "active":
            continue
        exp_d = (
            date.fromisoformat(lot["expiry_date"])
            if isinstance(lot["expiry_date"], str)
            else lot["expiry_date"]
        )
        # If lot expires before the supplier coverage / use window ends, it is at-risk and excluded
        if exp_d < use_window_end:
            at_risk_qty = round(at_risk_qty + qty, 4)
            lot_breakdown.append({
                "id": lot.get("id"),
                "batch_number": lot.get("batch_number"),
                "quantity": qty,
                "expiry_date": exp_d.isoformat(),
                "classification": "at_risk_excluded",
            })
        else:
            usable_qty = round(usable_qty + qty, 4)
            lot_breakdown.append({
                "id": lot.get("id"),
                "batch_number": lot.get("batch_number"),
                "quantity": qty,
                "expiry_date": exp_d.isoformat(),
                "classification": "usable",
            })

    net_need_qty = round(max(0.0, gross_need_qty - usable_qty), 4)
    if net_need_qty > 0 and pack_size > 0:
        packs_to_order = int(math.ceil(net_need_qty / float(pack_size) - 1e-9))
        recommended_order_qty = round(packs_to_order * float(pack_size), 4)
    else:
        packs_to_order = 0
        recommended_order_qty = 0.0

    return {
        "portions_demand": portions_demand,
        "recipe_qty_per_portion": recipe_qty_per_portion,
        "demand_qty": demand_qty,
        "buffer_qty": buffer_qty,
        "gross_need_qty": gross_need_qty,
        "usable_qty": usable_qty,
        "at_risk_qty": at_risk_qty,
        "net_need_qty": net_need_qty,
        "pack_size": float(pack_size),
        "packs_to_order": packs_to_order,
        "recommended_order_qty": recommended_order_qty,
        "lot_breakdown": lot_breakdown,
    }


def compute_spot_count_variance(
    system_qty: float,
    counted_qty: float,
    unit_cost_krw: float,
) -> Dict[str, Any]:
    """
    Pure function: Computes physical spot-count variance against system on-hand stock.
    """
    sys_q = round(float(system_qty), 4)
    cnt_q = round(max(0.0, float(counted_qty)), 4)
    variance_qty = round(cnt_q - sys_q, 4)
    variance_krw = round(variance_qty * float(unit_cost_krw))
    variance_pct = round((variance_qty / sys_q) * 100.0, 2) if sys_q > 0 else 0.0

    return {
        "system_qty": sys_q,
        "counted_qty": cnt_q,
        "variance_qty": variance_qty,
        "variance_krw": variance_krw,
        "variance_pct": variance_pct,
        "requires_adjustment": abs(variance_qty) > 1e-4,
    }


def get_all_ingredients_expiry_risk_summary(
    session: Session,
    anchor_date: date = date(2026, 11, 4),
    coverage_window_days: int = 3,
) -> List[Dict[str, Any]]:
    """
    Evaluates FEFO usable vs. at-risk stock across all 18 ingredients over the
    supplier coverage window [anchor_date, anchor_date + coverage_window_days].
    """
    use_window_end = anchor_date + timedelta(days=coverage_window_days)
    ingredients = session.exec(select(Ingredient).order_by(Ingredient.id.asc())).all()
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

    summaries: List[Dict[str, Any]] = []
    for ing in ingredients:
        ing_lots = lots_by_ing.get(ing.id, [])
        # Estimate window demand from min_stock_level or default 1.5 packs
        est_window_demand = round(ing.min_stock_level * (coverage_window_days / 3.0), 2)
        sim = simulate_expiry_and_order_need(
            portions_demand=1.0,
            recipe_qty_per_portion=est_window_demand,
            lots=ing_lots,
            use_window_end=use_window_end,
            pack_size=ing.pack_size,
            buffer_pct=0.10,
        )
        total_on_hand = round(sim["usable_qty"] + sim["at_risk_qty"], 4)
        summaries.append({
            "ingredient_id": ing.id,
            "ingredient_code": ing.code,
            "name_ko": ing.name_ko,
            "name_en": ing.name_en,
            "unit": ing.unit,
            "pack_size": ing.pack_size,
            "unit_cost_krw": ing.unit_cost_krw,
            "coverage_window_days": coverage_window_days,
            "use_window_end": use_window_end.isoformat(),
            "total_on_hand_qty": total_on_hand,
            "usable_qty": sim["usable_qty"],
            "at_risk_qty": sim["at_risk_qty"],
            "at_risk_value_krw": round(sim["at_risk_qty"] * ing.unit_cost_krw),
            "est_window_demand_qty": sim["demand_qty"],
            "buffer_qty": sim["buffer_qty"],
            "net_need_qty": sim["net_need_qty"],
            "recommended_order_qty": sim["recommended_order_qty"],
            "packs_to_order": sim["packs_to_order"],
            "lot_breakdown": sim["lot_breakdown"],
        })

    return summaries


def apply_spot_count_adjustment(
    session: Session,
    ingredient_id: int,
    counted_qty: float,
    reason: str = "Physical spot count adjustment",
    as_of_date: date = date(2026, 11, 4),
) -> Dict[str, Any]:
    """
    Adjusts active lots for `ingredient_id` in FEFO order so total on-hand matches `counted_qty`,
    creates a StockSnapshot, and logs an AuditLog ('count_adjusted').
    """
    ing = session.get(Ingredient, ingredient_id)
    if not ing:
        raise ValueError(f"Ingredient {ingredient_id} not found")

    active_lots = session.exec(
        select(Lot)
        .where(Lot.ingredient_id == ingredient_id, Lot.status == "active")
        .order_by(Lot.expiry_date.asc(), Lot.received_date.asc(), Lot.id.asc())
    ).all()

    system_qty = round(sum(l.quantity for l in active_lots), 4)
    variance = compute_spot_count_variance(system_qty, counted_qty, ing.unit_cost_krw)

    target_qty = variance["counted_qty"]
    diff = variance["variance_qty"]

    if abs(diff) > 1e-4:
        if diff < 0:
            # Shrinkage / unrecorded usage: deplete earliest-expiring lots first (FEFO)
            to_remove = round(-diff, 4)
            for l in active_lots:
                if to_remove <= 0:
                    break
                removed = min(l.quantity, to_remove)
                l.quantity = round(l.quantity - removed, 4)
                to_remove = round(to_remove - removed, 4)
                if l.quantity <= 1e-6:
                    l.quantity = 0.0
                    l.status = "depleted"
                session.add(l)
        else:
            # Surplus found: add to latest-expiring active lot, or create a manual lot if none active
            to_add = round(diff, 4)
            if active_lots:
                latest_lot = active_lots[-1]
                latest_lot.quantity = round(latest_lot.quantity + to_add, 4)
                if latest_lot.quantity > latest_lot.original_quantity:
                    latest_lot.original_quantity = latest_lot.quantity
                session.add(latest_lot)
            else:
                new_lot = Lot(
                    ingredient_id=ing.id,
                    quantity=to_add,
                    original_quantity=to_add,
                    unit_cost_krw=ing.unit_cost_krw,
                    received_date=as_of_date,
                    expiry_date=as_of_date + timedelta(days=ing.shelf_life_days),
                    source="manual",
                    status="active",
                    batch_number=f"SPOT-{ing.code}-{as_of_date.strftime('%m%d')}",
                )
                session.add(new_lot)

    # Record StockSnapshot & AuditLog
    snapshot = StockSnapshot(
        snapshot_date=as_of_date,
        ingredient_id=ing.id,
        on_hand_qty=target_qty,
        stock_value_krw=round(target_qty * ing.unit_cost_krw),
    )
    session.add(snapshot)

    audit = AuditLog(
        action="count_adjusted",
        entity_type="Ingredient",
        entity_id=str(ing.id),
        details_json=json.dumps({
            "ingredient_code": ing.code,
            "system_qty": variance["system_qty"],
            "counted_qty": variance["counted_qty"],
            "variance_qty": variance["variance_qty"],
            "variance_krw": variance["variance_krw"],
            "reason": reason,
        }),
    )
    session.add(audit)
    session.commit()

    return {
        "ingredient_id": ing.id,
        "ingredient_code": ing.code,
        "name_ko": ing.name_ko,
        "name_en": ing.name_en,
        "unit": ing.unit,
        **variance,
        "reason": reason,
    }
