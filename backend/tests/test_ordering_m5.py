"""
Milestone 5 Tests:
1. Pure function tests for price-surge detection (>=10% vs 4-week trailing mean) and supplier coverage window
2. Order recommendations generation (verifying Pork Shoulder 25.0 kg recommendation & price surge alert)
3. Full order lifecycle transitions: proposed -> edited -> incoming -> received, plus proposed -> rejected & approve-all
4. Human-in-the-loop autonomy guard: Level 1 & 2 allowed, Level 3 rejected with HTTP 400
5. Daily Prep Sheet generation with station breakdown and FEFO first-lot pull guidance
"""
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from backend.main import app
from backend.database import engine
from backend.models import OrderRecommendation, Lot, AuditLog, SystemSetting
from backend.services.ordering import detect_price_surge, compute_supplier_coverage_days

client = TestClient(app)


def test_detect_price_surge_and_coverage_pure_functions():
    surge = detect_price_surge([11000, 11000, 11000, 11000], 12320, threshold_pct=10.0)
    assert surge["is_surge"] is True
    assert surge["surge_pct"] == 12.0

    no_surge = detect_price_surge([11000, 11000, 11000, 11000], 11200, threshold_pct=10.0)
    assert no_surge["is_surge"] is False
    assert no_surge["surge_pct"] == 1.82

    assert compute_supplier_coverage_days('["Mon", "Wed", "Fri"]') == 3
    assert compute_supplier_coverage_days('["Mon", "Tue", "Wed", "Thu", "Fri"]') == 2


def test_order_recommendations_and_full_lifecycle():
    try:
        # 1. Generate order recommendations
        res = client.get("/api/orders/recommendations?refresh=true")
        assert res.status_code == 200
        body = res.json()
        orders = body["orders"]
        assert len(orders) > 0

        # Check Pork Shoulder (ING-PORK) recommendation matches canonical fixture & price surge flag
        pork_order = next(o for o in orders if o["ingredient_code"] == "ING-PORK")
        assert pork_order["recommended_qty"] == 25.0
        assert pork_order["packs_count"] == 5
        assert pork_order["status"] == "proposed"
        assert pork_order["reason"]["demand_qty"] == 21.6
        assert pork_order["reason"]["buffer_qty"] == 2.16
        assert pork_order["reason"]["usable_qty"] == 2.0
        assert pork_order["reason"]["at_risk_qty"] == 4.0
        assert pork_order["reason"]["net_need_qty"] == 21.76
        assert pork_order["reason"]["price_surge"]["is_surge"] is True

        pork_order_id = pork_order["id"]

        # 2. Lifecycle: proposed -> edited (30.0 kg)
        res_edit = client.post(
            f"/api/orders/{pork_order_id}/transition",
            json={"target_status": "edited", "approved_qty": 30.0, "note": "Weekend banquet buffer"},
        )
        assert res_edit.status_code == 200
        assert res_edit.json()["status"] == "edited"
        assert res_edit.json()["approved_qty"] == 30.0
        assert res_edit.json()["total_cost_krw"] == 330000

        # 3. Lifecycle: edited -> incoming
        res_inc = client.post(
            f"/api/orders/{pork_order_id}/transition",
            json={"target_status": "incoming", "note": "Sent to Majang Meat Direct"},
        )
        assert res_inc.status_code == 200
        assert res_inc.json()["status"] == "incoming"

        # 4. Lifecycle: incoming -> received (creates active Lot)
        res_rec = client.post(
            f"/api/orders/{pork_order_id}/transition",
            json={"target_status": "received", "approved_qty": 30.0, "note": "Delivered on time"},
        )
        assert res_rec.status_code == 200
        assert res_rec.json()["status"] == "received"

        # 5. Lifecycle: proposed -> rejected on second order
        second_order_id = orders[1]["id"]
        res_rej = client.post(
            f"/api/orders/{second_order_id}/transition",
            json={"target_status": "rejected", "note": "Sufficient stock on hand"},
        )
        assert res_rej.status_code == 200
        assert res_rej.json()["status"] == "rejected"

        # 6. One-tap approve all remaining proposed orders
        res_all = client.post("/api/orders/approve-all")
        assert res_all.status_code == 200
        assert res_all.json()["approved_count"] >= 1

        # 7. Autonomy Level guard: Level 3 must be rejected with HTTP 400
        res_lvl3 = client.post("/api/settings/autonomy", json={"autonomy_level": 3})
        assert res_lvl3.status_code == 400

        res_lvl1 = client.post("/api/settings/autonomy", json={"autonomy_level": 1})
        assert res_lvl1.status_code == 200
        assert res_lvl1.json()["autonomy_level"] == 1

        res_lvl2 = client.post("/api/settings/autonomy", json={"autonomy_level": 2})
        assert res_lvl2.status_code == 200
        assert res_lvl2.json()["autonomy_level"] == 2
    finally:
        with Session(engine) as session:
            # Remove test lots created by order receiving (batch_number starting with ORD-)
            ord_lots = session.exec(select(Lot).where(Lot.batch_number.like("ORD-%"))).all()
            for l in ord_lots:
                session.delete(l)
            for o in session.exec(select(OrderRecommendation)).all():
                session.delete(o)
            for a in session.exec(select(AuditLog)).all():
                session.delete(a)
            setting = session.exec(select(SystemSetting).where(SystemSetting.key == "autonomy_level")).first()
            if setting:
                setting.value = "2"
                session.add(setting)
            session.commit()


def test_daily_prep_sheet_endpoint():
    res = client.get("/api/prep/sheet")
    assert res.status_code == 200
    sheet = res.json()
    assert sheet["target_date"] == "2026-11-04"
    assert len(sheet["dishes"]) == 10
    assert len(sheet["ingredient_totals"]) == 18

    # Verify Pork Shoulder first FEFO lot to pull is BATCH-PORK-001 (expiring 2026-11-05)
    pork_prep = next(i for i in sheet["ingredient_totals"] if i["ingredient_code"] == "ING-PORK")
    assert pork_prep["fefo_lot_batch"] == "BATCH-PORK-001"
    assert pork_prep["fefo_lot_expiry"] == "2026-11-05"
