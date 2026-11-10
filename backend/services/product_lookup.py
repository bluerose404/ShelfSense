"""
Product Lookup Adapter Interface and OCR Stub:
Hierarchy:
1. ShelfSense Saved Restaurant Products
2. Mock Public Food Barcode Database (representing public APIs e.g. 식품안전나라)
3. Unknown -> Returns None so UI triggers the one-time registration form.
"""
from typing import Optional, Dict, Any
from datetime import date
from sqlmodel import Session, select
from backend.database import engine
from backend.models import Product, Ingredient

# Mock external national food database for public barcode lookup
MOCK_PUBLIC_FOOD_API = {
    "8801043014785": {
        "name_ko": "농심 신라면 120g (멀티 5입)",
        "name_en": "Nongshim Shin Ramyun 120g (5-pack)",
        "maker": "농심",
        "food_type": "유탕면류",
        "pack_size": 5.0,
        "unit": "unit",
        "standard_shelf_life_days": 180,
        "linked_ingredient_code": "ING-RICE" # fallback link
    },
    "8801062870119": {
        "name_ko": "롯데 칠성사이다 355ml",
        "name_en": "Lotte Chilsung Cider 355ml",
        "maker": "롯데칠성음료",
        "food_type": "탄산음료",
        "pack_size": 24.0,
        "unit": "unit",
        "standard_shelf_life_days": 365,
        "linked_ingredient_code": None
    }
}

class ProductLookupAdapter:
    def lookup(self, barcode: str) -> Optional[Dict[str, Any]]:
        # 1. Local saved restaurant products
        with Session(engine) as session:
            p = session.exec(select(Product).where(Product.barcode == barcode)).first()
            if p:
                ing = session.exec(select(Ingredient).where(Ingredient.id == p.ingredient_id)).first() if p.ingredient_id else None
                return {
                    "source": "internal",
                    "product_id": p.id,
                    "barcode": p.barcode,
                    "name_ko": p.name_ko,
                    "name_en": p.name_en,
                    "maker": p.maker,
                    "food_type": p.food_type,
                    "pack_size": p.pack_size,
                    "unit": p.unit,
                    "standard_shelf_life_days": p.standard_shelf_life_days,
                    "ingredient_id": p.ingredient_id,
                    "ingredient_name_ko": ing.name_ko if ing else None,
                    "ingredient_name_en": ing.name_en if ing else None,
                    "unit_cost_krw": ing.unit_cost_krw if ing else 0.0
                }

        # 2. Public API mock
        if barcode in MOCK_PUBLIC_FOOD_API:
            data = MOCK_PUBLIC_FOOD_API[barcode]
            return {
                "source": "public_api",
                "product_id": None,
                "barcode": barcode,
                **data
            }

        # 3. Not found
        return None

product_lookup = ProductLookupAdapter()

def extract_expiry_date_from_image_stub(image_bytes: bytes) -> Optional[date]:
    """
    Clearly designated STUB for OCR-based printed date detection.
    Real image OCR is out of scope per specification.
    """
    return None

