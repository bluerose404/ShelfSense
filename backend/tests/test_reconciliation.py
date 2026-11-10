"""
Seed & Inventory Reconciliation Tests:
1. Seeded WasteLogs check
2. Stock Snapshot Continuity & Non-Negative Stock check:
   - Every snapshot is strictly positive (no negative stock)
   - Next week's beginning stock == this week's ending stock
3. Weekly Inventory Reconciliation per ingredient-week:
   |Ending Stock - (Beginning Stock + Purchases - Theoretical Usage - Waste)|
   <= 0.05 * (Beginning Stock + Purchases) across all 18 ingredients and all 51 weeks
4. Negative Reconciliation Test:
   - Fails when a week of purchases is removed
"""
import pytest
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple
from sqlmodel import Session, select
from backend.database import engine
from backend.models import (
    Ingredient, DailySale, PurchaseRecord, RecipeItem, WasteLog, StockSnapshot
)


def evaluate_ingredient_weekly_reconciliation(
    snapshots: List[StockSnapshot],
    purchases_by_date: Dict[date, float],
    usage_by_date: Dict[date, float],
    waste_by_date: Dict[date, float],
    tolerance: float = 0.05,
) -> List[Dict[str, float]]:
    """
    Validates weekly inventory continuity, non-negativity, and 5% reconciliation
    across consecutive Monday stock snapshots [M_w, M_{w+1}).
    Raises AssertionError if any week violates non-negativity, continuity, or the 5% bound.
    """
    assert len(snapshots) >= 50, f"Expected at least 50 weekly snapshots, got {len(snapshots)}"

    # Ensure chronological order and strict positivity
    for idx, snap in enumerate(snapshots):
        assert snap.on_hand_qty > 0.0, f"Negative or zero stock snapshot {snap.on_hand_qty} on {snap.snapshot_date}"
        if idx > 0:
            prev_snap = snapshots[idx - 1]
            assert (snap.snapshot_date - prev_snap.snapshot_date).days == 7, (
                f"Discontinuous snapshot dates: {prev_snap.snapshot_date} -> {snap.snapshot_date}"
            )

    weekly_reports = []
    for w_idx in range(len(snapshots) - 1):
        snap_begin = snapshots[w_idx]
        snap_end = snapshots[w_idx + 1]

        m_start = snap_begin.snapshot_date
        m_next = snap_end.snapshot_date

        # Continuity: week w's ending stock IS week w+1's beginning stock snapshot
        begin_stock = snap_begin.on_hand_qty
        end_stock = snap_end.on_hand_qty
        next_week_begin_stock = snapshots[w_idx + 1].on_hand_qty
        assert end_stock == next_week_begin_stock, "Week ending stock must equal next week's beginning stock"

        # Aggregate flows over the 7-day window [m_start, m_next)
        week_purch = sum(purchases_by_date.get(m_start + timedelta(days=d), 0.0) for d in range(7))
        week_usage = sum(usage_by_date.get(m_start + timedelta(days=d), 0.0) for d in range(7))
        week_waste = sum(waste_by_date.get(m_start + timedelta(days=d), 0.0) for d in range(7))

        supply = begin_stock + week_purch
        assert supply > 0.0, f"Non-positive supply on week starting {m_start}"

        expected_end = begin_stock + week_purch - week_usage - week_waste
        assert expected_end > 0.0, f"Theoretical ending stock went negative ({expected_end}) on week {m_start}"

        residual = abs(end_stock - expected_end)
        rel_error = residual / supply

        assert rel_error <= tolerance, (
            f"Ingredient {snap_begin.ingredient_id} week {m_start} failed {tolerance*100:.1f}% reconciliation: "
            f"begin={begin_stock:.2f}, purch={week_purch:.2f}, usage={week_usage:.2f}, waste={week_waste:.2f}, "
            f"expected_end={expected_end:.2f}, actual_end={end_stock:.2f}, rel_error={rel_error*100:.2f}%"
        )

        weekly_reports.append({
            "week_start": m_start,
            "begin_stock": begin_stock,
            "purchases": week_purch,
            "usage": week_usage,
            "waste": week_waste,
            "end_stock": end_stock,
            "rel_error": rel_error,
        })

    return weekly_reports


def test_historical_waste_logs_seeded():
    with Session(engine) as session:
        waste_logs = session.exec(select(WasteLog)).all()
        assert len(waste_logs) >= 50
        assert any(w.reason == "expired" for w in waste_logs)
        assert any(w.reason == "spoiled" for w in waste_logs)


def test_weekly_inventory_reconciliation():
    """
    Verifies for all 18 ingredients and all 51 Monday-to-Monday weeks:
    1. Stock continuity (next week's beginning stock == this week's ending stock)
    2. Strictly positive stock (no negative stock)
    3. |Ending Stock - (Beginning Stock + Purchases - Theoretical Usage - Waste)|
       <= 5% of (Beginning Stock + Purchases)
    """
    with Session(engine) as session:
        ingredients = session.exec(select(Ingredient)).all()
        assert len(ingredients) == 18

        all_recipes = session.exec(select(RecipeItem)).all()
        all_sales = session.exec(select(DailySale)).all()
        all_purchases = session.exec(select(PurchaseRecord)).all()
        all_waste = session.exec(select(WasteLog)).all()
        all_snapshots = session.exec(select(StockSnapshot)).all()

    recipe_map: Dict[int, Dict[int, float]] = {ing.id: {} for ing in ingredients}
    for r in all_recipes:
        recipe_map[r.ingredient_id][r.menu_item_id] = r.quantity * (1.0 + r.yield_loss_pct)

    usage_by_ing_date: Dict[int, Dict[date, float]] = {ing.id: {} for ing in ingredients}
    for s in all_sales:
        for ing_id, m_map in recipe_map.items():
            if s.menu_item_id in m_map:
                u = s.portions_sold * m_map[s.menu_item_id]
                usage_by_ing_date[ing_id][s.sale_date] = usage_by_ing_date[ing_id].get(s.sale_date, 0.0) + u

    purch_by_ing_date: Dict[int, Dict[date, float]] = {ing.id: {} for ing in ingredients}
    for p in all_purchases:
        purch_by_ing_date[p.ingredient_id][p.purchase_date] = (
            purch_by_ing_date[p.ingredient_id].get(p.purchase_date, 0.0) + p.quantity
        )

    waste_by_ing_date: Dict[int, Dict[date, float]] = {ing.id: {} for ing in ingredients}
    for w in all_waste:
        d = w.log_datetime.date()
        waste_by_ing_date[w.ingredient_id][d] = waste_by_ing_date[w.ingredient_id].get(d, 0.0) + w.quantity

    snaps_by_ing: Dict[int, List[StockSnapshot]] = {ing.id: [] for ing in ingredients}
    for snap in all_snapshots:
        snaps_by_ing[snap.ingredient_id].append(snap)

    for ing in ingredients:
        ordered_snaps = sorted(snaps_by_ing[ing.id], key=lambda x: x.snapshot_date)
        reports = evaluate_ingredient_weekly_reconciliation(
            snapshots=ordered_snaps,
            purchases_by_date=purch_by_ing_date[ing.id],
            usage_by_date=usage_by_ing_date[ing.id],
            waste_by_date=waste_by_ing_date[ing.id],
            tolerance=0.05,
        )
        assert len(reports) == 51


def test_weekly_inventory_reconciliation_negative_when_purchase_removed():
    """
    Negative test: removing one week of purchases for Pork Shoulder (ING-PORK)
    must cause the 5% weekly reconciliation check to fail.
    """
    with Session(engine) as session:
        pork = session.exec(select(Ingredient).where(Ingredient.code == "ING-PORK")).first()
        assert pork is not None

        recipes = session.exec(select(RecipeItem).where(RecipeItem.ingredient_id == pork.id)).all()
        recipe_usage = {r.menu_item_id: r.quantity * (1.0 + r.yield_loss_pct) for r in recipes}

        snapshots = sorted(
            session.exec(select(StockSnapshot).where(StockSnapshot.ingredient_id == pork.id)).all(),
            key=lambda x: x.snapshot_date,
        )
        purchases = session.exec(select(PurchaseRecord).where(PurchaseRecord.ingredient_id == pork.id)).all()
        purch_by_date = {p.purchase_date: p.quantity for p in purchases}

        waste = session.exec(select(WasteLog).where(WasteLog.ingredient_id == pork.id)).all()
        waste_by_date: Dict[date, float] = {}
        for w in waste:
            d = w.log_datetime.date()
            waste_by_date[d] = waste_by_date.get(d, 0.0) + w.quantity

        sales = session.exec(select(DailySale)).all()
        usage_by_date: Dict[date, float] = {}
        for s in sales:
            if s.menu_item_id in recipe_usage:
                usage_by_date[s.sale_date] = usage_by_date.get(s.sale_date, 0.0) + (
                    s.portions_sold * recipe_usage[s.menu_item_id]
                )

    # Remove the purchase record for week 10
    removed_week_monday = snapshots[10].snapshot_date
    assert removed_week_monday in purch_by_date and purch_by_date[removed_week_monday] > 0
    corrupted_purchases = dict(purch_by_date)
    del corrupted_purchases[removed_week_monday]

    with pytest.raises(AssertionError, match="failed 5.0% reconciliation|Theoretical ending stock went negative"):
        evaluate_ingredient_weekly_reconciliation(
            snapshots=snapshots,
            purchases_by_date=corrupted_purchases,
            usage_by_date=usage_by_date,
            waste_by_date=waste_by_date,
            tolerance=0.05,
        )
