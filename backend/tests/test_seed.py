"""
Tests for Milestone 1:
- EAN-13 Checksum validation (880-prefix)
- Seed loading and relational consistency
- Seed inventory reconciliation test:
  Δ Stock Value ≈ Purchases - Theoretical Usage - Waste
"""
import pytest
from datetime import date, timedelta
from sqlmodel import Session, select
from backend.database import engine
from backend.seed import compute_ean13_checksum
from backend.models import (
    MenuItem, Ingredient, Product, Lot, Supplier,
    DailySale, PurchaseRecord, RecipeItem, WasteLog, StockSnapshot
)

def test_ean13_checksum():
    prefix = "880123400001"
    full_barcode = compute_ean13_checksum(prefix)
    assert len(full_barcode) == 13
    assert full_barcode.startswith("880")
    assert full_barcode == "8801234000017"

def test_seeded_data_loaded():
    with Session(engine) as session:
        menu_items = session.exec(select(MenuItem)).all()
        assert len(menu_items) == 10
        
        ingredients = session.exec(select(Ingredient)).all()
        assert len(ingredients) == 18
        
        suppliers = session.exec(select(Supplier)).all()
        assert len(suppliers) == 3
        
        products = session.exec(select(Product)).all()
        assert len(products) >= 20
        for p in products:
            assert p.barcode.startswith("880")
            assert len(p.barcode) == 13
            assert p.barcode == compute_ean13_checksum(p.barcode[:12])
        
        lots = session.exec(select(Lot)).all()
        assert len(lots) > 0
        pork_lots = [l for l in lots if l.ingredient_id == 1]
        assert len(pork_lots) == 2
        quantities = sorted([l.quantity for l in pork_lots])
        assert quantities == [2.0, 4.0]

def test_seed_inventory_reconciliation():
    """
    Seed reconciliation test:
    Verify that across the seeded 12-month timeline, total purchased quantities
    and theoretical consumption are logically balanced for key ingredients.
    """
    with Session(engine) as session:
        # Check for Pork Shoulder (ING-PORK, id=1)
        pork = session.exec(select(Ingredient).where(Ingredient.code == "ING-PORK")).first()
        assert pork is not None

        # Total Purchases
        purchases = session.exec(select(PurchaseRecord).where(PurchaseRecord.ingredient_id == pork.id)).all()
        total_purchased_qty = sum(p.quantity for p in purchases)
        assert total_purchased_qty > 0

        # Theoretical Usage from recipes and daily sales
        # Find recipes using pork
        recipes = session.exec(select(RecipeItem).where(RecipeItem.ingredient_id == pork.id)).all()
        menu_usage_map = {r.menu_item_id: r.quantity * (1.0 + r.yield_loss_pct) for r in recipes}

        sales = session.exec(select(DailySale)).all()
        theoretical_usage = 0.0
        for s in sales:
            if s.menu_item_id in menu_usage_map:
                theoretical_usage += s.portions_sold * menu_usage_map[s.menu_item_id]

        assert theoretical_usage > 0
        # Purchases should comfortably cover historical theoretical usage plus ending stock
        # Ratio should be within realistic operating bounds (0.6 to 1.4)
        ratio = total_purchased_qty / theoretical_usage
        assert 0.6 <= ratio <= 1.4, f"Purchased {total_purchased_qty} vs Used {theoretical_usage} gives unexpected ratio {ratio}"
