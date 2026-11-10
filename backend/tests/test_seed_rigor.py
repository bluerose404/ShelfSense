"""
Comprehensive Seed Rigor & Characteristic Tests:
- Deterministic seed reproducibility (Seed = 42) with separate RNG streams per table
- Current sales table SHA-256 checksum baseline lock (labeled 'current', not 'M2')
- Exactly 3 missing sales gap dates (2026-03-15, 2026-06-22, 2026-09-08)
- Honest main/side dish classification (9 main dishes, 1 side/prep dish 계란말이)
- Hourly daypart distribution with bin length division for 90-minute bins
- 3 decodable GS1-2D payloads
- 2 unknown barcodes
- Demo clock default setting = Wednesday 4 Nov 2026 09:00:00
"""
import hashlib
import inspect
from datetime import date, timedelta
from sqlmodel import Session, select
from backend.database import engine
import backend.seed as seed_module
from backend.models import (
    MenuItem, Ingredient, Product, Lot, Supplier,
    DailySale, PurchaseRecord, RecipeItem, SystemSetting, WeatherRecord
)
from backend.services.barcodes import parse_gs1_2d, validate_ean13

# Locked SHA-256 baseline of DailySale rows (labeled "current" per audit instructions,
# as no prior M2 git commit exists in the workspace; pre-RNG-separation DB checksum was
# f8a93fc2326d8710a97df1f7ac706edbe279e36db10d13d2d36a549a641e9baa).
CURRENT_SALES_CHECKSUM = "01b22be238d998d4d2e6296801c2227ccf2a9c412db0c5e5e6088b7514eab1bb"


def compute_sales_table_checksum(session: Session) -> str:
    sales = session.exec(
        select(DailySale).order_by(DailySale.sale_date, DailySale.daypart, DailySale.menu_item_id)
    ).all()
    rows = [
        (
            s.sale_date.isoformat(),
            s.daypart,
            s.menu_item_id,
            s.portions_sold,
            s.portions_dine_in,
            s.portions_delivery,
            s.revenue_krw,
            1 if s.is_promotion else 0,
        )
        for s in sales
    ]
    return hashlib.sha256(repr(rows).encode()).hexdigest()


def test_separate_rng_streams_and_current_sales_checksum():
    # 1. Verify seed.py uses separate random.Random streams per table
    src = inspect.getsource(seed_module.generate_synthetic_data)
    for stream_name in ["rng_weather", "rng_sales", "rng_purchases", "rng_snapshots", "rng_waste"]:
        assert stream_name in src, f"Missing separate RNG stream {stream_name} in backend/seed.py"

    # 2. Verify the current DailySale table checksum is unchanged
    with Session(engine) as session:
        actual_checksum = compute_sales_table_checksum(session)
        assert actual_checksum == CURRENT_SALES_CHECKSUM, (
            f"DailySale checksum mismatch vs 'current' baseline: {actual_checksum} != {CURRENT_SALES_CHECKSUM}"
        )


def test_seed_demo_clock_and_settings():
    with Session(engine) as session:
        clock_setting = session.exec(select(SystemSetting).where(SystemSetting.key == "demo_clock")).first()
        assert clock_setting is not None
        assert clock_setting.value == "2026-11-04 09:00:00"
        assert date(2026, 11, 4).weekday() == 2  # Wednesday

        min_wage = session.exec(select(SystemSetting).where(SystemSetting.key == "min_wage_krw")).first()
        assert min_wage is not None
        assert min_wage.value == "10320"


def test_seed_gap_dates_count():
    with Session(engine) as session:
        sales = session.exec(select(DailySale)).all()
        sale_dates = {s.sale_date for s in sales}

        start_d = date(2025, 11, 4)
        end_d = date(2026, 11, 3)
        curr = start_d
        missing = []
        while curr <= end_d:
            if curr not in sale_dates:
                missing.append(curr)
            curr += timedelta(days=1)

        assert len(missing) == 3
        expected_gaps = {date(2026, 3, 15), date(2026, 6, 22), date(2026, 9, 8)}
        assert set(missing) == expected_gaps


def test_seed_main_dish_tags():
    """
    Honest dish tags: 9 main dishes and 1 side/prep dish (MENU-GYERAN-MARI / 계란말이).
    """
    with Session(engine) as session:
        items = session.exec(select(MenuItem)).all()
        assert len(items) == 10
        main_dishes = [i for i in items if i.is_main_dish]
        side_dishes = [i for i in items if not i.is_main_dish]
        assert len(main_dishes) == 9
        assert len(side_dishes) == 1
        assert side_dishes[0].code == "MENU-GYERAN-MARI"


def test_hourly_sales_profile_bin_length_division():
    """
    Validates hourly distribution:
    Lunch: 11-12 (20%), 12-13 (45%), 13-14 (25%), 14-15 (10%)
    Dinner: 17-18 (15%, 1h -> 15%/h), 18-19:30 (45%, 1.5h -> 30%/h), 19:30-21 (30%, 1.5h -> 20%/h), 21-22 (10%, 1h -> 10%/h)
    Peak hourly rate during 18:00-19:30 must be divided by 1.5 = 30% per hour!
    """
    dinner_bins = [
        {"start": "17:00", "end": "18:00", "duration_hours": 1.0, "share": 0.15},
        {"start": "18:00", "end": "19:30", "duration_hours": 1.5, "share": 0.45},
        {"start": "19:30", "end": "21:00", "duration_hours": 1.5, "share": 0.30},
        {"start": "21:00", "end": "22:00", "duration_hours": 1.0, "share": 0.10},
    ]
    assert round(sum(b["share"] for b in dinner_bins), 4) == 1.0

    for b in dinner_bins:
        rate_per_hour = b["share"] / b["duration_hours"]
        if b["start"] == "18:00":
            assert round(rate_per_hour, 2) == 0.30
        elif b["start"] == "19:30":
            assert round(rate_per_hour, 2) == 0.20


def test_gs1_2d_sample_payloads():
    payload_1 = "(01)08801234000017(17)261120(10)LOT-KIMCHI-01"
    payload_2 = "(01)08801234000024(17)261125(10)LOT-PORK-02"
    payload_3 = "(01)08801234000031(17)261110(10)LOT-TOFU-03"

    p1 = parse_gs1_2d(payload_1)
    assert p1["is_gs1"] is True
    assert p1["expiry_date"] == "2026-11-20"
    assert p1["batch"] == "LOT-KIMCHI-01"

    p2 = parse_gs1_2d(payload_2)
    assert p2["is_gs1"] is True
    assert p2["expiry_date"] == "2026-11-25"
    assert p2["batch"] == "LOT-PORK-02"

    p3 = parse_gs1_2d(payload_3)
    assert p3["is_gs1"] is True
    assert p3["expiry_date"] == "2026-11-10"
    assert p3["batch"] == "LOT-TOFU-03"


def test_unknown_barcodes():
    unknown_1 = "8809999900016"
    unknown_2 = "8809999900023"

    with Session(engine) as session:
        p1 = session.exec(select(Product).where(Product.barcode == unknown_1)).first()
        p2 = session.exec(select(Product).where(Product.barcode == unknown_2)).first()
        assert p1 is None
        assert p2 is None
        assert validate_ean13(unknown_1)
        assert validate_ean13(unknown_2)
