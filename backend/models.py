from typing import Optional, List
from datetime import date, datetime, timezone
from sqlmodel import SQLModel, Field, Relationship

class SystemSetting(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(unique=True, index=True)
    value: str
    description: Optional[str] = None

class Supplier(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name_ko: str
    name_en: str
    lead_time_days: int
    delivery_days: str # JSON list e.g. ["Mon", "Wed", "Fri"]
    cutoff_time: str # "18:00"
    min_order_krw: float = 0.0

class Ingredient(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(unique=True, index=True)
    name_ko: str
    name_en: str
    unit: str # kg, g, unit, l, ml
    pack_size: float
    unit_cost_krw: float
    shelf_life_days: int
    supplier_id: Optional[int] = Field(default=None, foreign_key="supplier.id")
    min_stock_level: float = 0.0

class MenuItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(unique=True, index=True)
    name_ko: str
    name_en: str
    price_krw: float
    is_main_dish: bool = True
    station: str = "kitchen" # kitchen, prep, grill

class RecipeItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    menu_item_id: int = Field(foreign_key="menuitem.id")
    ingredient_id: int = Field(foreign_key="ingredient.id")
    quantity: float # in ingredient's base unit
    yield_loss_pct: float = 0.0 # e.g. 0.05 = 5% loss

class Product(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    barcode: str = Field(unique=True, index=True) # EAN-13 or custom
    name_ko: str
    name_en: str
    maker: str
    food_type: str
    pack_size: float
    unit: str
    standard_shelf_life_days: int
    ingredient_id: Optional[int] = Field(default=None, foreign_key="ingredient.id")

class Lot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    ingredient_id: int = Field(foreign_key="ingredient.id", index=True)
    product_id: Optional[int] = Field(default=None, foreign_key="product.id")
    quantity: float
    original_quantity: float
    unit_cost_krw: float
    received_date: date
    expiry_date: date = Field(index=True)
    source: str = "auto" # auto (GS1), manual, photo, estimated
    status: str = "active" # active, depleted, expired, discarded
    batch_number: Optional[str] = None

class DailySale(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    sale_date: date = Field(index=True)
    daypart: str # lunch, dinner
    menu_item_id: int = Field(foreign_key="menuitem.id", index=True)
    portions_sold: int
    portions_dine_in: int
    portions_delivery: int
    revenue_krw: float
    is_promotion: bool = False

class PurchaseRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    purchase_date: date = Field(index=True)
    ingredient_id: int = Field(foreign_key="ingredient.id")
    quantity: float
    unit_price_krw: float
    total_cost_krw: float
    supplier_id: Optional[int] = Field(default=None, foreign_key="supplier.id")

class StockSnapshot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    snapshot_date: date = Field(index=True)
    ingredient_id: int = Field(foreign_key="ingredient.id")
    on_hand_qty: float
    stock_value_krw: float

class WeatherRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    record_date: date = Field(unique=True, index=True)
    rain_mm: float
    temperature_celsius: float
    condition: str # sunny, rainy, cloudy, snowy

class StaffMember(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name_ko: str
    name_en: str
    role: str # kitchen, prep, server, dishwasher
    hourly_wage_krw: float
    max_weekly_hours: float
    employment_type: str # full_time, part_time
    availability: str # JSON map: {"Mon": ["lunch", "dinner"], ...}

class ShiftRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    staff_id: int = Field(foreign_key="staffmember.id", index=True)
    shift_date: date = Field(index=True)
    daypart: str
    start_time: str # "11:00"
    end_time: str   # "15:00"
    break_minutes: int = 0
    actual_hours: float
    wage_krw: float
    is_holiday: bool = False
    is_night: bool = False

class OrderRecommendation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    ingredient_id: int = Field(foreign_key="ingredient.id")
    supplier_id: int = Field(foreign_key="supplier.id")
    recommended_qty: float
    approved_qty: Optional[float] = None
    unit_cost_krw: float
    total_cost_krw: float
    status: str = "proposed" # proposed, approved, edited, incoming, received, rejected
    reason_json: str # JSON with demand, buffer, usable_stock, at_risk_stock, rounding
    expected_delivery_date: Optional[date] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    cutoff_time: str = ""

class WasteLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    log_datetime: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
    ingredient_id: int = Field(foreign_key="ingredient.id")
    lot_id: Optional[int] = Field(default=None, foreign_key="lot.id")
    quantity: float
    cost_krw: float
    reason: str # expired, spoiled, dropped, over_prepared, leftover, other
    notes: Optional[str] = None

class AuditLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
    action: str # order_approved, order_edited, order_rejected, waste_logged, scan_received, count_adjusted, setting_changed
    entity_type: str
    entity_id: Optional[str] = None
    details_json: str # JSON payload with changes and justification

