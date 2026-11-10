"""
Synthetic Data Generator for Seoul Kimchi Jjigae House (서울 김치찌개집)
Seed = 42 for 100% deterministic reproducibility.
Uses separate RNG streams per table so changes to inventory/purchases/waste
never perturb weather or sales generation.
"""
import math
import random
import json
from datetime import date, timedelta, datetime, timezone
import holidays
from sqlmodel import Session, select
from backend.database import engine, create_db_and_tables
from backend.models import (
    SystemSetting, Supplier, Ingredient, MenuItem, RecipeItem, Product,
    Lot, DailySale, PurchaseRecord, StockSnapshot, WeatherRecord,
    StaffMember, ShiftRecord, OrderRecommendation, AuditLog, WasteLog
)


def compute_ean13_checksum(prefix12: str) -> str:
    """Computes the 13th modulo-10 check digit for a 12-digit EAN prefix."""
    odd_sum = sum(int(prefix12[i]) for i in range(0, 12, 2))
    even_sum = sum(int(prefix12[i]) for i in range(1, 12, 2))
    total = odd_sum + (even_sum * 3)
    mod = total % 10
    check = (10 - mod) % 10
    return f"{prefix12}{check}"


def generate_synthetic_data(seed: int = 42):
    # Dedicated, independent RNG streams per table
    rng_weather = random.Random(f"{seed}:weather")
    rng_sales = random.Random(f"{seed}:sales")
    rng_purchases = random.Random(f"{seed}:purchases")
    rng_snapshots = random.Random(f"{seed}:snapshots")
    rng_waste = random.Random(f"{seed}:waste")

    create_db_and_tables()

    with Session(engine) as session:
        # Clear existing tables if any
        session.query(DailySale).delete()
        session.query(PurchaseRecord).delete()
        session.query(StockSnapshot).delete()
        session.query(WasteLog).delete()
        session.query(Lot).delete()
        session.query(RecipeItem).delete()
        session.query(MenuItem).delete()
        session.query(Product).delete()
        session.query(Ingredient).delete()
        session.query(Supplier).delete()
        session.query(StaffMember).delete()
        session.query(ShiftRecord).delete()
        session.query(WeatherRecord).delete()
        session.query(SystemSetting).delete()
        session.query(OrderRecommendation).delete()
        session.query(AuditLog).delete()
        session.commit()

        # 1. System Settings
        settings = [
            SystemSetting(key="demo_clock", value="2026-11-04 09:00:00", description="Simulated current time (Wednesday)"),
            SystemSetting(key="language", value="ko", description="UI Language (ko / en)"),
            SystemSetting(key="buffer_pct", value="10", description="Order safety buffer percentage"),
            SystemSetting(key="spend_cap_krw", value="1000000", description="Per-order spend cap warning limit"),
            SystemSetting(key="price_flag_pct", value="10", description="Price surge alert threshold vs 4w avg (%)"),
            SystemSetting(key="target_labor_pct", value="30", description="Target labor cost % of sales"),
            SystemSetting(key="min_wage_krw", value="10320", description="Minimum hourly wage (2026: 10320, 2027: 10700)"),
            SystemSetting(key="autonomy_level", value="2", description="1=Suggest, 2=One-tap approve, 3=Auto order"),
            SystemSetting(key="has_5_plus_employees", value="true", description="Labor standard act 5+ employees provisions"),
            SystemSetting(key="dishes_per_cover", value="1.0", description="Main dish portions per dining cover"),
        ]
        session.add_all(settings)
        session.commit()

        # 2. Suppliers
        suppliers = [
            Supplier(id=1, name_ko="CJ제일제당 유통", name_en="CJ CheilJedang Distribution", lead_time_days=1, delivery_days=json.dumps(["Mon", "Tue", "Wed", "Thu", "Fri"]), cutoff_time="17:00", min_order_krw=100000),
            Supplier(id=2, name_ko="마장동 축산유통", name_en="Majang Meat Direct", lead_time_days=1, delivery_days=json.dumps(["Mon", "Wed", "Fri"]), cutoff_time="16:00", min_order_krw=150000),
            Supplier(id=3, name_ko="가락농수산 청과물", name_en="Garak Wholesale Produce", lead_time_days=1, delivery_days=json.dumps(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]), cutoff_time="19:00", min_order_krw=50000),
        ]
        session.add_all(suppliers)
        session.commit()

        # 3. 18 Key Ingredients
        raw_ingredients = [
            ("ING-PORK", "돼지 앞다리살", "Pork Shoulder", "kg", 5.0, 11000, 7, 2, 10.0),
            ("ING-KIMCHI", "묵은지/숙성김치", "Aged Kimchi", "kg", 10.0, 4500, 30, 3, 20.0),
            ("ING-TOFU", "찌개용 두부", "Stew Tofu", "unit", 10.0, 1500, 10, 1, 10.0),
            ("ING-SCALLION", "대파", "Scallion", "kg", 2.0, 3800, 7, 3, 4.0),
            ("ING-ONION", "양파", "Onion", "kg", 10.0, 2200, 14, 3, 10.0),
            ("ING-GARLIC", "다진마늘", "Minced Garlic", "kg", 1.0, 8500, 21, 3, 2.0),
            ("ING-CHILI-FLAKE", "고춧가루", "Chili Flakes (Gochugaru)", "kg", 1.0, 22000, 90, 1, 2.0),
            ("ING-EGG", "계란 (대란 30구)", "Eggs (30-tray)", "unit", 30.0, 7000, 25, 1, 30.0),
            ("ING-RICE", "신동진 백미", "White Rice", "kg", 20.0, 52000, 180, 1, 20.0),
            ("ING-BEEF", "소고기(불고기용)", "Beef Chuck Slices", "kg", 3.0, 24000, 6, 2, 6.0),
            ("ING-ZUCCHINI", "애호박", "Korean Zucchini", "unit", 10.0, 1800, 7, 3, 10.0),
            ("ING-BEANSPROUT", "콩나물", "Soybean Sprouts", "kg", 3.0, 2800, 5, 3, 3.0),
            ("ING-SOYPASTE", "재래식 된장", "Fermented Soybean Paste", "kg", 3.0, 13500, 180, 1, 3.0),
            ("ING-SOYSAUCE", "진간장", "Dark Soy Sauce", "l", 1.8, 8200, 365, 1, 3.6),
            ("ING-SESAMEOIL", "참기름", "Sesame Oil", "l", 1.0, 19500, 180, 1, 2.0),
            ("ING-MACKEREL", "자반 고등어", "Salted Mackerel", "unit", 10.0, 2800, 14, 2, 10.0),
            ("ING-SQUID", "손질 오징어", "Cleaned Squid", "kg", 2.0, 14000, 10, 2, 4.0),
            ("ING-CABBAGE", "배추", "Napa Cabbage", "kg", 10.0, 3200, 10, 3, 10.0),
        ]
        ingredients_dict = {}
        for code, n_ko, n_en, unit, p_size, cost, shelf, sup_id, min_stk in raw_ingredients:
            ing = Ingredient(
                code=code, name_ko=n_ko, name_en=n_en, unit=unit,
                pack_size=p_size, unit_cost_krw=cost, shelf_life_days=shelf,
                supplier_id=sup_id, min_stock_level=min_stk
            )
            session.add(ing)
            ingredients_dict[code] = ing
        session.commit()

        # 4. 10 Menu Items (honestly tagged: 9 main dishes, 1 side/prep dish 계란말이)
        menu_items_raw = [
            ("MENU-KIMCHI-JJIGAE", "김치찌개", "Kimchi Jjigae", 9000, True, "kitchen"),
            ("MENU-DOENJANG-JJIGAE", "된장찌개", "Doenjang Jjigae", 8500, True, "kitchen"),
            ("MENU-SUNDUBU-JJIGAE", "순두부찌개", "Soft Tofu Stew", 9000, True, "kitchen"),
            ("MENU-JEYUK", "제육볶음", "Spicy Pork Stir-fry", 10000, True, "kitchen"),
            ("MENU-BULGOGI", "불고기 정식", "Bulgogi Set", 12000, True, "kitchen"),
            ("MENU-GYERAN-MARI", "계란말이", "Rolled Omelet", 7000, False, "prep"),
            ("MENU-BIBIMBAP", "비빔밥", "Bibimbap", 9000, True, "kitchen"),
            ("MENU-KIMCHI-BOKKEUM", "김치볶음밥", "Kimchi Fried Rice", 8500, True, "kitchen"),
            ("MENU-MACKEREL", "고등어구이", "Grilled Mackerel", 10000, True, "grill"),
            ("MENU-OJINGEO", "오징어볶음", "Spicy Squid Stir-fry", 11000, True, "kitchen"),
        ]
        menus_dict = {}
        for code, n_ko, n_en, price, is_main, station in menu_items_raw:
            m = MenuItem(code=code, name_ko=n_ko, name_en=n_en, price_krw=price, is_main_dish=is_main, station=station)
            session.add(m)
            menus_dict[code] = m
        session.commit()

        # 5. Recipes Mapping (qty in ingredient base units, yield loss)
        recipes_raw = [
            # Kimchi Jjigae
            ("MENU-KIMCHI-JJIGAE", "ING-PORK", 0.080, 0.0),  # Exactly 80g
            ("MENU-KIMCHI-JJIGAE", "ING-KIMCHI", 0.150, 0.05),
            ("MENU-KIMCHI-JJIGAE", "ING-TOFU", 0.33, 0.02),
            ("MENU-KIMCHI-JJIGAE", "ING-SCALLION", 0.03, 0.05),
            ("MENU-KIMCHI-JJIGAE", "ING-GARLIC", 0.01, 0.0),
            # Doenjang Jjigae
            ("MENU-DOENJANG-JJIGAE", "ING-SOYPASTE", 0.04, 0.0),
            ("MENU-DOENJANG-JJIGAE", "ING-TOFU", 0.33, 0.02),
            ("MENU-DOENJANG-JJIGAE", "ING-ZUCCHINI", 0.25, 0.05),
            ("MENU-DOENJANG-JJIGAE", "ING-ONION", 0.05, 0.05),
            ("MENU-DOENJANG-JJIGAE", "ING-SCALLION", 0.03, 0.05),
            # Sundubu Jjigae
            ("MENU-SUNDUBU-JJIGAE", "ING-TOFU", 0.5, 0.02),
            ("MENU-SUNDUBU-JJIGAE", "ING-EGG", 1.0, 0.0),
            ("MENU-SUNDUBU-JJIGAE", "ING-CHILI-FLAKE", 0.015, 0.0),
            ("MENU-SUNDUBU-JJIGAE", "ING-SCALLION", 0.03, 0.05),
            # Jeyuk Bokkeum
            ("MENU-JEYUK", "ING-PORK", 0.180, 0.05),
            ("MENU-JEYUK", "ING-ONION", 0.06, 0.05),
            ("MENU-JEYUK", "ING-SCALLION", 0.04, 0.05),
            ("MENU-JEYUK", "ING-CHILI-FLAKE", 0.02, 0.0),
            # Bulgogi Set
            ("MENU-BULGOGI", "ING-BEEF", 0.180, 0.04),
            ("MENU-BULGOGI", "ING-ONION", 0.05, 0.05),
            ("MENU-BULGOGI", "ING-SOYSAUCE", 0.03, 0.0),
            ("MENU-BULGOGI", "ING-SESAMEOIL", 0.01, 0.0),
            # Gyeran Mari
            ("MENU-GYERAN-MARI", "ING-EGG", 4.0, 0.02),
            ("MENU-GYERAN-MARI", "ING-SCALLION", 0.02, 0.05),
            # Bibimbap
            ("MENU-BIBIMBAP", "ING-RICE", 0.150, 0.02),
            ("MENU-BIBIMBAP", "ING-BEANSPROUT", 0.06, 0.05),
            ("MENU-BIBIMBAP", "ING-ZUCCHINI", 0.2, 0.05),
            ("MENU-BIBIMBAP", "ING-EGG", 1.0, 0.0),
            ("MENU-BIBIMBAP", "ING-SESAMEOIL", 0.01, 0.0),
            # Kimchi Bokkeumbap
            ("MENU-KIMCHI-BOKKEUM", "ING-RICE", 0.150, 0.02),
            ("MENU-KIMCHI-BOKKEUM", "ING-KIMCHI", 0.100, 0.05),
            ("MENU-KIMCHI-BOKKEUM", "ING-EGG", 1.0, 0.0),
            # Mackerel Grill
            ("MENU-MACKEREL", "ING-MACKEREL", 1.0, 0.0),
            # Squid Stir-fry
            ("MENU-OJINGEO", "ING-SQUID", 0.180, 0.05),
            ("MENU-OJINGEO", "ING-ONION", 0.05, 0.05),
            ("MENU-OJINGEO", "ING-CABBAGE", 0.08, 0.05),
            ("MENU-OJINGEO", "ING-CHILI-FLAKE", 0.02, 0.0),
        ]
        all_recipes = []
        for m_code, i_code, qty, loss in recipes_raw:
            rec = RecipeItem(
                menu_item_id=menus_dict[m_code].id,
                ingredient_id=ingredients_dict[i_code].id,
                quantity=qty,
                yield_loss_pct=loss
            )
            session.add(rec)
            all_recipes.append(rec)
        session.commit()

        # 6. 40 Packaged Products with VALID EAN-13 Barcodes (880 Prefix + Modulo-10 checksum)
        products_meta = [
            ("CJ 비비고 썰은배추김치 10kg", "CJ Bibigo Sliced Kimchi 10kg", "CJ제일제당", "김치류", 10.0, "kg", 30, "ING-KIMCHI"),
            ("종가집 전라도포기김치 10kg", "Jongga Pogi Kimchi 10kg", "대상", "김치류", 10.0, "kg", 35, "ING-KIMCHI"),
            ("풀무원 찌개용 부침두부 1kg (10팩)", "Pulmuone Stew Tofu 10-pack", "풀무원", "두부류", 10.0, "unit", 14, "ING-TOFU"),
            ("CJ 행복한콩 찌개두부 10구", "CJ Happy Bean Stew Tofu 10-pack", "CJ제일제당", "두부류", 10.0, "unit", 12, "ING-TOFU"),
            ("국산 신선 세척 대파 2kg", "Washed Fresh Scallion 2kg", "가락농산", "농산물", 2.0, "kg", 7, "ING-SCALLION"),
            ("깐양파 특품 10kg망", "Peeled Onion 10kg Bag", "햇살농업", "농산물", 10.0, "kg", 14, "ING-ONION"),
            ("국내산 100% 깐마늘 다짐용 1kg", "Peeled Garlic 1kg", "마늘나라", "양념채소", 1.0, "kg", 21, "ING-GARLIC"),
            ("청정원 태양초 고춧가루 1kg", "Chungjungone Sun-dried Gochugaru 1kg", "대상", "고춧가루", 1.0, "kg", 90, "ING-CHILI-FLAKE"),
            ("오뚜기 고소한 참기름 1L", "Ottogi Sesame Oil 1L", "오뚜기", "식용유지류", 1.0, "l", 180, "ING-SESAMEOIL"),
            ("샘표 양조간장 501 1.8L", "Sempio Brewed Soy Sauce 501 1.8L", "샘표", "간장", 1.8, "l", 365, "ING-SOYSAUCE"),
            ("해찬들 재래식된장 3kg", "Haechandle Traditional Doenjang 3kg", "CJ제일제당", "장류", 3.0, "kg", 180, "ING-SOYPASTE"),
            ("농협 무항생제 신선대란 30구", "NongHyup Fresh Large Eggs 30-egg", "농협축산", "난류", 30.0, "unit", 25, "ING-EGG"),
            ("신동진 일등쌀 20kg", "Shindongjin First Grade Rice 20kg", "농협양곡", "곡류", 20.0, "kg", 180, "ING-RICE"),
            ("마장동 신선 앞다리살(제육/찌개) 5kg", "Majang Fresh Pork Shoulder 5kg", "마장축산", "식육류", 5.0, "kg", 7, "ING-PORK"),
            ("호주산 냉장 소고기 척롤 슬라이스 3kg", "Aussie Beef Chuck Roll 3kg", "글로벌미트", "식육류", 3.0, "kg", 6, "ING-BEEF"),
            ("애호박 1박스 (10개들이)", "Korean Zucchini Box (10 pcs)", "가락청과", "채소류", 10.0, "unit", 7, "ING-ZUCCHINI"),
            ("국산 일자 콩나물 3kg", "Korean Soybean Sprouts 3kg", "풀빛농원", "나물류", 3.0, "kg", 5, "ING-BEANSPROUT"),
            ("부산 손질 자반고등어 10미", "Busan Salted Mackerel 10 fish", "동해수산", "수산물", 10.0, "unit", 14, "ING-MACKEREL"),
            ("원양산 냉동 손질오징어 2kg", "Frozen Cleaned Squid 2kg", "원양식품", "수산물", 2.0, "kg", 10, "ING-SQUID"),
            ("강원 고랭지 통배추 10kg", "Gangwon Highland Napa Cabbage 10kg", "평창영농", "채소류", 10.0, "kg", 10, "ING-CABBAGE"),
        ]
        for i in range(21, 41):
            base_ing = raw_ingredients[(i - 1) % len(raw_ingredients)]
            products_meta.append((
                f"식자재 베스트 {base_ing[1]} {int(base_ing[4])}{base_ing[3]}",
                f"Best Wholesale {base_ing[2]} {int(base_ing[4])}{base_ing[3]}",
                "한국식자재유통",
                "가공식품",
                float(base_ing[4]),
                base_ing[3],
                base_ing[6],
                base_ing[0]
            ))

        for idx, item in enumerate(products_meta, start=1):
            prefix = f"8801234{idx:05d}"
            barcode = compute_ean13_checksum(prefix)
            prod = Product(
                barcode=barcode,
                name_ko=item[0],
                name_en=item[1],
                maker=item[2],
                food_type=item[3],
                pack_size=item[4],
                unit=item[5],
                standard_shelf_life_days=item[6],
                ingredient_id=ingredients_dict[item[7]].id
            )
            session.add(prod)
        session.commit()

        # 7. Staff Roster (8 Staff Members)
        staff_data = [
            ("김철수", "Kim Chulsoo", "kitchen", 12500, 40, "full_time"),
            ("이영희", "Lee Younghee", "prep", 11000, 35, "full_time"),
            ("박민호", "Park Minho", "server", 10500, 30, "part_time"),
            ("최수진", "Choi Sujin", "server", 10320, 20, "part_time"),
            ("정태양", "Jung Taeyang", "kitchen", 12000, 40, "full_time"),
            ("강지우", "Kang Jiwoo", "prep", 10500, 25, "part_time"),
            ("윤다은", "Yoon Daeun", "dishwasher", 10320, 25, "part_time"),
            ("송재원", "Song Jaewon", "dishwasher", 10320, 20, "part_time"),
        ]
        staff_members = []
        for ko, en_name, role, wage, max_hrs, emp_type in staff_data:
            s = StaffMember(
                name_ko=ko, name_en=en_name, role=role,
                hourly_wage_krw=wage, max_weekly_hours=max_hrs,
                employment_type=emp_type,
                availability=json.dumps({
                    "Mon": ["lunch", "dinner"], "Tue": ["lunch", "dinner"],
                    "Wed": ["lunch", "dinner"], "Thu": ["lunch", "dinner"],
                    "Fri": ["lunch", "dinner"], "Sat": ["lunch", "dinner"], "Sun": ["lunch", "dinner"]
                })
            )
            session.add(s)
            staff_members.append(s)
        session.commit()

        # 8A. Weather Table (dedicated rng_weather stream)
        kr_holidays = holidays.KR(years=[2025, 2026])
        start_date = date(2025, 11, 4)
        end_date = date(2026, 11, 3)
        gap_dates = {date(2026, 3, 15), date(2026, 6, 22), date(2026, 9, 8)}

        all_weather = []
        weather_by_date = {}
        curr_date = start_date
        while curr_date <= end_date:
            day_of_year = curr_date.timetuple().tm_yday
            temp = round(14.0 + 14.0 * math.sin(2 * math.pi * (day_of_year - 105) / 365) + rng_weather.uniform(-3, 3), 1)
            is_rainy = rng_weather.random() < (0.35 if 6 <= curr_date.month <= 8 else 0.15)
            rain_mm = round(rng_weather.uniform(5.0, 45.0), 1) if is_rainy else 0.0
            cond = "rainy" if is_rainy else ("cloudy" if rng_weather.random() < 0.25 else "sunny")

            weather = WeatherRecord(
                record_date=curr_date,
                rain_mm=rain_mm,
                temperature_celsius=temp,
                condition=cond
            )
            all_weather.append(weather)
            weather_by_date[curr_date] = weather
            curr_date += timedelta(days=1)

        # 8B. DailySale & ShiftRecord Tables (dedicated rng_sales stream)
        all_sales = []
        all_shifts = []
        curr_date = start_date
        while curr_date <= end_date:
            is_gap_day = curr_date in gap_dates
            is_kr_holiday = curr_date in kr_holidays
            is_weekend = curr_date.weekday() >= 5
            is_rainy = weather_by_date[curr_date].rain_mm > 0

            if not is_gap_day:
                rain_mult = 1.25 if is_rainy else 1.0
                weekend_mult = 1.35 if is_weekend else 1.0
                holiday_mult = 1.40 if is_kr_holiday else 1.0

                for daypart in ["lunch", "dinner"]:
                    part_mult = 1.2 if daypart == "dinner" else 0.95
                    for m_code, m_obj in menus_dict.items():
                        base_portions = {
                            "MENU-KIMCHI-JJIGAE": 42,
                            "MENU-DOENJANG-JJIGAE": 28,
                            "MENU-SUNDUBU-JJIGAE": 22,
                            "MENU-JEYUK": 30,
                            "MENU-BULGOGI": 18,
                            "MENU-GYERAN-MARI": 15,
                            "MENU-BIBIMBAP": 16,
                            "MENU-KIMCHI-BOKKEUM": 14,
                            "MENU-MACKEREL": 12,
                            "MENU-OJINGEO": 14,
                        }[m_code]

                        factor = rain_mult * weekend_mult * holiday_mult * part_mult * rng_sales.uniform(0.85, 1.15)
                        portions = max(2, int(round(base_portions * factor)))
                        delivery_ratio = rng_sales.uniform(0.20, 0.35)
                        delivery_qty = int(round(portions * delivery_ratio))
                        dine_in_qty = portions - delivery_qty
                        revenue = portions * m_obj.price_krw

                        sale = DailySale(
                            sale_date=curr_date,
                            daypart=daypart,
                            menu_item_id=m_obj.id,
                            portions_sold=portions,
                            portions_dine_in=dine_in_qty,
                            portions_delivery=delivery_qty,
                            revenue_krw=revenue,
                            is_promotion=(rng_sales.random() < 0.05)
                        )
                        all_sales.append(sale)

                for s_mem in staff_members[:5]:
                    all_shifts.append(ShiftRecord(
                        staff_id=s_mem.id,
                        shift_date=curr_date,
                        daypart="lunch",
                        start_time="11:00",
                        end_time="15:00",
                        break_minutes=30,
                        actual_hours=3.5,
                        wage_krw=3.5 * s_mem.hourly_wage_krw * (1.5 if is_kr_holiday else 1.0),
                        is_holiday=is_kr_holiday,
                        is_night=False
                    ))
                for s_mem in [staff_members[0], staff_members[2], staff_members[3], staff_members[4], staff_members[6]]:
                    all_shifts.append(ShiftRecord(
                        staff_id=s_mem.id,
                        shift_date=curr_date,
                        daypart="dinner",
                        start_time="17:00",
                        end_time="22:00",
                        break_minutes=30,
                        actual_hours=4.5,
                        wage_krw=4.5 * s_mem.hourly_wage_krw * (1.5 if is_kr_holiday else 1.0),
                        is_holiday=is_kr_holiday,
                        is_night=False
                    ))
            curr_date += timedelta(days=1)

        # 8C. Weekly Inventory Snapshots, Purchases, and Waste Logs
        # Uses dedicated rng_purchases, rng_snapshots, and rng_waste streams.
        # Enforces:
        # 1. Continuity: next week's beginning stock == this week's ending stock
        # 2. Strictly positive stock (never negative)
        # 3. Per-ingredient-week reconciliation within 5% of (beginning stock + purchases)
        recipe_usage_by_ing = {ing.id: {} for ing in ingredients_dict.values()}
        for r in all_recipes:
            recipe_usage_by_ing[r.ingredient_id][r.menu_item_id] = r.quantity * (1.0 + r.yield_loss_pct)

        daily_ing_usage = {ing.id: {} for ing in ingredients_dict.values()}
        for s in all_sales:
            for ing_id, menu_map in recipe_usage_by_ing.items():
                if s.menu_item_id in menu_map:
                    u = s.portions_sold * menu_map[s.menu_item_id]
                    daily_ing_usage[ing_id][s.sale_date] = daily_ing_usage[ing_id].get(s.sale_date, 0.0) + u

        mondays = []
        d = start_date
        while d <= end_date:
            if d.weekday() == 0:
                mondays.append(d)
            d += timedelta(days=1)

        all_purchases = []
        all_snapshots = []
        all_waste = []

        for code, ing in ingredients_dict.items():
            # Initial beginning stock on first Monday M_0
            curr_begin_qty = round(ing.pack_size * rng_snapshots.uniform(2.0, 3.0), 2)
            all_snapshots.append(StockSnapshot(
                snapshot_date=mondays[0],
                ingredient_id=ing.id,
                on_hand_qty=curr_begin_qty,
                stock_value_krw=round(curr_begin_qty * ing.unit_cost_krw)
            ))

            # Iterate over all closed Monday-to-Monday weeks [M_w, M_{w+1})
            for w_idx in range(len(mondays) - 1):
                m_start = mondays[w_idx]
                m_next = mondays[w_idx + 1]

                # Theoretical usage during [m_start, m_next)
                u_week = sum(
                    daily_ing_usage[ing.id].get(m_start + timedelta(days=offset), 0.0)
                    for offset in range(7)
                )

                # Weekly logged waste (1.5% to 3.0% of usage)
                w_qty = round(max(0.05, u_week * rng_waste.uniform(0.015, 0.030)), 2)
                w_reason = rng_waste.choice(["expired", "spoiled", "over_prepared", "dropped"])
                all_waste.append(WasteLog(
                    log_datetime=datetime(m_start.year, m_start.month, m_start.day, 22, 0, 0, tzinfo=timezone.utc),
                    ingredient_id=ing.id,
                    lot_id=None,
                    quantity=w_qty,
                    cost_krw=round(w_qty * ing.unit_cost_krw),
                    reason=w_reason,
                    notes="Weekly trim and quality discard"
                ))

                # Purchase on Monday m_start (in whole pack_size multiples)
                price_var = rng_purchases.uniform(0.95, 1.05)
                if code == "ING-PORK" and m_start.day <= 7:
                    price_var = 1.12
                curr_unit_price = round(ing.unit_cost_krw * price_var)

                target_end_qty = 2.2 * ing.pack_size
                needed_qty = u_week + w_qty + target_end_qty - curr_begin_qty
                purch_packs = max(1, int(round(needed_qty / ing.pack_size)))
                while curr_begin_qty + (purch_packs * ing.pack_size) - u_week - w_qty < 1.0 * ing.pack_size:
                    purch_packs += 1

                purch_qty = round(purch_packs * ing.pack_size, 2)
                all_purchases.append(PurchaseRecord(
                    purchase_date=m_start,
                    ingredient_id=ing.id,
                    quantity=purch_qty,
                    unit_price_krw=curr_unit_price,
                    total_cost_krw=round(purch_qty * curr_unit_price),
                    supplier_id=ing.supplier_id
                ))

                # Theoretical ending stock and actual ending stock (with <= 2.5% unexplained shrinkage/variance)
                expected_end = curr_begin_qty + purch_qty - u_week - w_qty
                supply = curr_begin_qty + purch_qty
                shrinkage_rate = rng_snapshots.uniform(-0.025, 0.015)
                next_begin_qty = round(max(0.5 * ing.pack_size, expected_end + shrinkage_rate * supply), 2)

                # Continuity: week w's ending stock is recorded as Monday M_{w+1}'s StockSnapshot
                all_snapshots.append(StockSnapshot(
                    snapshot_date=m_next,
                    ingredient_id=ing.id,
                    on_hand_qty=next_begin_qty,
                    stock_value_krw=round(next_begin_qty * ing.unit_cost_krw)
                ))
                curr_begin_qty = next_begin_qty

            # Final Monday (2026-11-02) purchase for the active demo week
            last_monday = mondays[-1]
            price_var = rng_purchases.uniform(0.95, 1.05)
            if code == "ING-PORK" and last_monday.day <= 7:
                price_var = 1.12
            curr_unit_price = round(ing.unit_cost_krw * price_var)
            last_purch_qty = round(ing.pack_size * 2, 2)
            all_purchases.append(PurchaseRecord(
                purchase_date=last_monday,
                ingredient_id=ing.id,
                quantity=last_purch_qty,
                unit_price_krw=curr_unit_price,
                total_cost_krw=round(last_purch_qty * curr_unit_price),
                supplier_id=ing.supplier_id
            ))

        session.add_all(all_weather)
        session.add_all(all_sales)
        session.add_all(all_shifts)
        session.add_all(all_purchases)
        session.add_all(all_snapshots)
        session.add_all(all_waste)
        session.commit()

        # 9. Active Initial Inventory Lots (as of demo clock Wednesday 2026-11-04)
        pork_ing = ingredients_dict["ING-PORK"]
        pork_lot_a = Lot(
            ingredient_id=pork_ing.id,
            quantity=4.0,
            original_quantity=5.0,
            unit_cost_krw=11000,
            received_date=date(2026, 10, 29),
            expiry_date=date(2026, 11, 5),  # Expires tomorrow Thursday
            source="manual",
            status="active",
            batch_number="BATCH-PORK-001"
        )
        pork_lot_b = Lot(
            ingredient_id=pork_ing.id,
            quantity=2.0,
            original_quantity=5.0,
            unit_cost_krw=11000,
            received_date=date(2026, 11, 2),
            expiry_date=date(2026, 11, 9),  # Expires next Monday
            source="auto",
            status="active",
            batch_number="BATCH-PORK-002"
        )
        session.add(pork_lot_a)
        session.add(pork_lot_b)

        for code, ing in ingredients_dict.items():
            if code == "ING-PORK":
                continue
            lot = Lot(
                ingredient_id=ing.id,
                quantity=ing.pack_size * 1.5,
                original_quantity=ing.pack_size * 2,
                unit_cost_krw=ing.unit_cost_krw,
                received_date=date(2026, 11, 2),
                expiry_date=date(2026, 11, 2) + timedelta(days=ing.shelf_life_days),
                source="auto",
                status="active",
                batch_number=f"BATCH-{code}-01"
            )
            session.add(lot)
        session.commit()

    print(f"Successfully generated synthetic dataset for Seoul Kimchi Jjigae House (Seed={seed}).")


if __name__ == "__main__":
    generate_synthetic_data(seed=42)
