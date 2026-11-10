"""
Milestone 7 & Full End-to-End (M1-M7) Verification Tests:
1. Morning Summary Dashboard endpoint (`/api/summary/morning`)
2. Batch Settings Update (`/api/settings/update`) & Level 3 Autonomy Guard + Immutable Audit Log (`/api/audit-logs`)
3. Full Cross-Milestone E2E Workflow (M1 -> M7):
   - M1/M2: Health, Demo Clock & Prep/Forecast readiness
   - M3: GS1 2D barcode lookup
   - M4: Expiry-risk check & physical spot-count variance adjustment
   - M5: Order recommendation generation & full lifecycle (proposed -> approved -> incoming -> received)
   - M6: Waste logging (with FEFO depletion) & Korean labor schedule draft + early-cut simulation
   - M7: Morning summary & full audit trail verification
"""
from datetime import date
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from backend.main import app
from backend.database import engine
from backend.models import Lot, OrderRecommendation, WasteLog, StockSnapshot, AuditLog, SystemSetting

client = TestClient(app)


def test_morning_summary_and_settings_audit():
    try:
        # 1. Morning Summary
        res_sum = client.get("/api/summary/morning")
        assert res_sum.status_code == 200
        body = res_sum.json()

        assert body["demo_clock"] == "2026-11-04 09:00:00"
        assert body["kpis"]["prime_cost_pct"] == 58.8
        assert body["kpis"]["forecast_wape_pct"] == 9.97
        assert body["inventory_alerts"]["urgent_lots_count"] >= 1
        assert body["ordering_alerts"]["pork_highlight"]["recommended_qty"] == 25.0
        assert body["prep_and_labor"]["peak_front_staff"] == 4
        assert "추정치" in body["prep_and_labor"]["disclaimer_ko"]

        # 2. Settings Update: Level 3 must be rejected
        res_bad = client.post(
            "/api/settings/update",
            json={"settings": {"autonomy_level": 3}},
        )
        assert res_bad.status_code == 400

        # Valid settings update (2027 min wage preset 10,700 -> restore to 10,320)
        res_ok = client.post(
            "/api/settings/update",
            json={"settings": {"min_wage_krw": 10700, "autonomy_level": 2}},
        )
        assert res_ok.status_code == 200
        assert res_ok.json()["settings"]["min_wage_krw"] == "10700"

        # 3. Audit Log check
        res_audit = client.get("/api/audit-logs?action=setting_changed")
        assert res_audit.status_code == 200
        logs = res_audit.json()
        assert len(logs) >= 1
        assert logs[0]["action"] == "setting_changed"
    finally:
        with Session(engine) as session:
            s_wage = session.exec(select(SystemSetting).where(SystemSetting.key == "min_wage_krw")).first()
            if s_wage:
                s_wage.value = "10320"
                session.add(s_wage)
            for o in session.exec(select(OrderRecommendation)).all():
                session.delete(o)
            for a in session.exec(select(AuditLog)).all():
                session.delete(a)
            session.commit()


def test_full_e2e_workflow_m1_through_m7():
    created_waste_id = None
    try:
        # M1: Health & Settings
        assert client.get("/api/health").json()["status"] == "ok"

        # M3: Scan GS1 2D payload
        scan_res = client.post(
            "/api/scan/lookup",
            json={"barcode_payload": "(01)08801234000017(17)261120(10)LOT-KIMCHI-01"},
        )
        assert scan_res.status_code == 200
        assert scan_res.json()["is_gs1"] is True
        assert scan_res.json()["extracted_expiry"] == "2026-11-20"

        # M4: Spot count adjustment on Pork Shoulder (6.0 -> 5.5 kg)
        spot_res = client.post(
            "/api/inventory/spot-count",
            json={"ingredient_id": 1, "counted_qty": 5.5, "reason": "E2E spot check"},
        )
        assert spot_res.status_code == 200
        assert spot_res.json()["variance_qty"] == -0.5

        # M5: Generate Order Recommendations & run lifecycle (proposed -> approved -> incoming -> received)
        ord_res = client.get("/api/orders/recommendations?refresh=true")
        assert ord_res.status_code == 200
        orders = ord_res.json()["orders"]
        first_id = orders[0]["id"]

        assert client.post(f"/api/orders/{first_id}/transition", json={"target_status": "approved"}).status_code == 200
        assert client.post(f"/api/orders/{first_id}/transition", json={"target_status": "incoming"}).status_code == 200
        assert client.post(f"/api/orders/{first_id}/transition", json={"target_status": "received"}).status_code == 200

        # M6: Waste log & Labor draft
        w_res = client.post(
            "/api/waste",
            json={"ingredient_id": 1, "quantity": 0.2, "reason": "expired", "notes": "E2E test discard"},
        )
        assert w_res.status_code == 200
        created_waste_id = w_res.json()["id"]

        l_res = client.get("/api/labor/draft")
        assert l_res.status_code == 200
        assert l_res.json()["canonical_budget_summary"]["draft_labor_pct"] == 27.6

        # M7: Verify all E2E actions are captured in Audit Log
        audit_res = client.get("/api/audit-logs?limit=20")
        assert audit_res.status_code == 200
        actions_logged = {a["action"] for a in audit_res.json()}
        assert "count_adjusted" in actions_logged
        assert "order_approved" in actions_logged
        assert "order_dispatched" in actions_logged
        assert "order_received" in actions_logged
        assert "waste_logged" in actions_logged
    finally:
        with Session(engine) as session:
            pork_lot_a = session.exec(select(Lot).where(Lot.batch_number == "BATCH-PORK-001")).first()
            if pork_lot_a:
                pork_lot_a.quantity = 4.0
                pork_lot_a.status = "active"
                session.add(pork_lot_a)
            for l in session.exec(select(Lot).where(Lot.batch_number.like("ORD-%"))).all():
                session.delete(l)
            if created_waste_id:
                w_obj = session.get(WasteLog, created_waste_id)
                if w_obj:
                    session.delete(w_obj)
            for s in session.exec(select(StockSnapshot).where(StockSnapshot.snapshot_date == date(2026, 11, 4))).all():
                session.delete(s)
            for o in session.exec(select(OrderRecommendation)).all():
                session.delete(o)
            for a in session.exec(select(AuditLog)).all():
                session.delete(a)
            session.commit()
