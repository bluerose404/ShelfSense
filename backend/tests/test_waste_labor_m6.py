"""
Milestone 6 Tests:
1. Canonical Pure-Function Fixture: Labor Budget & Peak Staffing (AGENTS.md)
   - Sales: ₩4,000,000, 30% target = ₩1,200,000 budget
   - Draft: 92 hours * ₩12,000 = ₩1,104,000 = 27.6%
   - Peak Front Staffing: 48 covers/hour at 14 per staff -> 4 front staff
2. Korean Labor Standards Act (근로기준법) pure-function checks:
   - 2026 Minimum Wage (₩10,320/hr)
   - Statutory breaks (4h -> 30m, 8h -> 60m)
   - 주휴수당 (Weekly Holiday Allowance threshold at >= 15h/week)
   - 5+ employee overtime/night/holiday 1.5x multiplier toggle
3. Early-Cut Simulator pure function
4. FastAPI Waste Log & Labor Draft endpoints
"""
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from backend.main import app
from backend.database import engine
from backend.models import Lot, WasteLog, AuditLog, SystemSetting
from backend.services.waste_labor import (
    compute_labor_budget_and_peak_staffing,
    check_korean_labor_rules,
    simulate_early_cut,
)

client = TestClient(app)


def test_labor_budget_and_peak_staffing_fixture():
    """
    Required Pure-Function Fixture from AGENTS.md:
    Sales 4,000,000 won, 30% target = 1,200,000 won budget,
    92-hour draft at 12,000 won = 1,104,000 won = 27.6%;
    48 covers/hour at 14 per staff -> 4 front staff.
    """
    res = compute_labor_budget_and_peak_staffing(
        projected_sales_krw=4_000_000,
        target_labor_pct=30.0,
        draft_hours=92.0,
        avg_hourly_wage_krw=12_000,
        peak_covers_per_hour=48.0,
        covers_per_staff_per_hour=14.0,
    )

    assert res["labor_budget_krw"] == 1_200_000
    assert res["draft_cost_krw"] == 1_104_000
    assert res["draft_labor_pct"] == 27.6
    assert res["within_budget"] is True
    assert res["peak_front_staff"] == 4


def test_korean_labor_rules_pure_function():
    # 1. Compliant full-time 8h shift with 60m break, 35h/wk paid, 2h overtime (5+ employees = True)
    ok_check = check_korean_labor_rules(
        hourly_wage_krw=12_000,
        shift_duration_hours=8.0,
        break_minutes=60,
        weekly_paid_hours=35.0,
        max_weekly_hours=40.0,
        min_wage_krw=10_320,
        has_5_plus_employees=True,
        overtime_hours=2.0,
    )
    assert ok_check["min_wage_ok"] is True
    assert ok_check["break_ok"] is True
    assert ok_check["juhyu_eligible"] is True
    # 주휴수당 for 35h/wk at 12,000/hr = (35/40)*8*12,000 = 84,000
    assert ok_check["juhyu_allowance_krw"] == 84_000
    # 2h overtime premium at +50% = 12,000
    assert ok_check["premium_pay_krw"] == 12_000
    assert len(ok_check["violations"]) == 0

    # 2. Same 2h overtime when has_5_plus_employees = False -> premium_pay_krw == 0
    under5_check = check_korean_labor_rules(
        hourly_wage_krw=12_000,
        shift_duration_hours=8.0,
        break_minutes=60,
        weekly_paid_hours=35.0,
        max_weekly_hours=40.0,
        min_wage_krw=10_320,
        has_5_plus_employees=False,
        overtime_hours=2.0,
    )
    assert under5_check["premium_pay_krw"] == 0

    # 3. Sub-minimum wage (< 10,320) and insufficient break on 8h shift (30m < 60m) + < 15h/wk (no 주휴수당)
    viol_check = check_korean_labor_rules(
        hourly_wage_krw=10_000,
        shift_duration_hours=8.0,
        break_minutes=30,
        weekly_paid_hours=14.0,
        max_weekly_hours=20.0,
        min_wage_krw=10_320,
    )
    assert viol_check["min_wage_ok"] is False
    assert viol_check["break_ok"] is False
    assert viol_check["juhyu_eligible"] is False
    assert viol_check["juhyu_allowance_krw"] == 0
    assert len(viol_check["violations"]) == 2


def test_early_cut_simulator_pure_function():
    sim = simulate_early_cut(
        projected_covers_per_hour=48.0,
        actual_covers_per_hour=24.0,
        scheduled_front_staff=4,
        covers_per_staff_per_hour=14.0,
        cut_hours=1.5,
        hourly_wage_krw=10_500,
        staff_current_weekly_hours=16.0,
        min_staff_floor=2,
    )
    # 24 covers / 14 = ceil(1.71) = 2 active staff -> can cut 2 of the 4 scheduled staff
    assert sim["recommended_active_staff"] == 2
    assert sim["removable_staff_count"] == 2
    # Direct wage saved: 2 staff * 1.5h * 10,500 = 31,500 KRW
    assert sim["direct_wage_saved_krw"] == 31_500
    # 16.0h - 1.5h = 14.5h (< 15.0h 주휴수당 threshold)
    assert sim["crossed_below_15h_juhyu"] is True
    assert sim["juhyu_saved_krw"] == 33_600


def test_m6_waste_and_labor_api():
    created_waste_id = None
    try:
        # 1. GET /api/waste
        res_w = client.get("/api/waste?limit=10")
        assert res_w.status_code == 200
        w_body = res_w.json()
        assert w_body["total_logs_count"] > 0
        assert len(w_body["recent_logs"]) == 10

        # 2. POST /api/waste (log 0.5 kg pork waste -> depletes BATCH-PORK-001 in FEFO order)
        res_post_w = client.post(
            "/api/waste",
            json={
                "ingredient_id": 1,
                "quantity": 0.5,
                "reason": "spoiled",
                "notes": "Surface discoloration check",
            },
        )
        assert res_post_w.status_code == 200
        created_waste = res_post_w.json()
        created_waste_id = created_waste["id"]
        assert created_waste["cost_krw"] == 5500

        # 3. GET /api/labor/draft
        res_labor = client.get("/api/labor/draft")
        assert res_labor.status_code == 200
        l_body = res_labor.json()
        assert "추정치" in l_body["disclaimer_ko"]
        assert "scheduling estimates" in l_body["disclaimer_en"]
        assert l_body["canonical_budget_summary"]["labor_budget_krw"] == 1_200_000
        assert l_body["canonical_budget_summary"]["draft_cost_krw"] == 1_104_000
        assert l_body["canonical_budget_summary"]["draft_labor_pct"] == 27.6
        assert l_body["canonical_budget_summary"]["peak_front_staff"] == 4
        assert len(l_body["staff_schedule"]) == 8

        # 4. POST /api/labor/early-cut
        res_cut = client.post(
            "/api/labor/early-cut",
            json={
                "projected_covers_per_hour": 48.0,
                "actual_covers_per_hour": 24.0,
                "scheduled_front_staff": 4,
                "covers_per_staff_per_hour": 14.0,
                "cut_hours": 1.5,
                "hourly_wage_krw": 10500.0,
                "staff_current_weekly_hours": 16.0,
                "min_staff_floor": 2,
            },
        )
        assert res_cut.status_code == 200
        assert res_cut.json()["removable_staff_count"] == 2
    finally:
        with Session(engine) as session:
            pork_lot_a = session.exec(select(Lot).where(Lot.batch_number == "BATCH-PORK-001")).first()
            if pork_lot_a:
                pork_lot_a.quantity = 4.0
                pork_lot_a.status = "active"
                session.add(pork_lot_a)
            if created_waste_id:
                w_obj = session.get(WasteLog, created_waste_id)
                if w_obj:
                    session.delete(w_obj)
            for a_obj in session.exec(select(AuditLog)).all():
                session.delete(a_obj)
            setting = session.exec(select(SystemSetting).where(SystemSetting.key == "has_5_plus_employees")).first()
            if setting:
                setting.value = "true"
                session.add(setting)
            session.commit()
