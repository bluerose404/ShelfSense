"""
Milestone 4 Tests:
1. Canonical Pure-Function Fixture: Pork Shoulder (돼지 앞다리살) Expiry-Risk & Order Calculation
   - 270 portions * 80 g (0.080 kg) = 21.6 kg demand
   - 10% safety buffer = 2.16 kg (gross = 23.76 kg)
   - Lot A (4.0 kg) expires before use window -> excluded / at-risk
   - Lot B (2.0 kg) usable -> net need = 21.6 + 2.16 - 2.0 = 21.76 kg -> order 25.0 kg (5 kg packs)
2. Pure FEFO Lot Depletion (`deplete_lots_fefo`)
3. Pure Spot-Count Variance (`compute_spot_count_variance`)
4. FastAPI M4 Endpoints (`/api/inventory/expiry-risk`, `/api/inventory/deplete-fefo`, `/api/inventory/spot-count`)
"""
from datetime import date
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from backend.main import app
from backend.database import engine
from backend.models import Lot, StockSnapshot, AuditLog
from backend.services.inventory import (
    deplete_lots_fefo,
    simulate_expiry_and_order_need,
    compute_spot_count_variance,
)

client = TestClient(app)


def test_pork_shoulder_expiry_risk_and_order_fixture():
    """
    Required Pure-Function Fixture from AGENTS.md:
    Pork shoulder 270 portions x 80 g = 21.6 kg, 10% buffer = 2.16 kg,
    Lot A 4.0 kg expires before the use window, Lot B 2.0 kg usable
    -> need 21.76 kg -> order 25 kg (5 kg packs).
    """
    lots = [
        {
            "id": 1,
            "batch_number": "BATCH-PORK-001",
            "quantity": 4.0,
            "expiry_date": date(2026, 11, 5),  # Expires before coverage window end (2026-11-07)
            "status": "active",
        },
        {
            "id": 2,
            "batch_number": "BATCH-PORK-002",
            "quantity": 2.0,
            "expiry_date": date(2026, 11, 9),  # Usable across coverage window
            "status": "active",
        },
    ]

    res = simulate_expiry_and_order_need(
        portions_demand=270,
        recipe_qty_per_portion=0.080,
        lots=lots,
        use_window_end=date(2026, 11, 7),
        pack_size=5.0,
        buffer_pct=0.10,
    )

    assert res["demand_qty"] == 21.6
    assert res["buffer_qty"] == 2.16
    assert res["gross_need_qty"] == 23.76
    assert res["at_risk_qty"] == 4.0
    assert res["usable_qty"] == 2.0
    assert res["net_need_qty"] == 21.76
    assert res["packs_to_order"] == 5
    assert res["recommended_order_qty"] == 25.0


def test_fefo_depletion_pure_function():
    lots = [
        {"id": 10, "quantity": 2.0, "expiry_date": "2026-11-09", "received_date": "2026-11-02", "status": "active"},
        {"id": 11, "quantity": 4.0, "expiry_date": "2026-11-05", "received_date": "2026-10-29", "status": "active"},
        {"id": 12, "quantity": 1.5, "expiry_date": "2026-11-01", "received_date": "2026-10-25", "status": "active"},
    ]

    # Deplete 4.5 kg as of 2026-11-04:
    # - Lot 12 (expiry 2026-11-01) is already expired -> untouched
    # - Lot 11 (expiry 2026-11-05, 4.0 kg) is depleted first -> remaining 0.0 kg
    # - Lot 10 (expiry 2026-11-09, 2.0 kg) is depleted by 0.5 kg -> remaining 1.5 kg
    out = deplete_lots_fefo(lots, demand_qty=4.5, as_of_date=date(2026, 11, 4))

    assert out["total_depleted_qty"] == 4.5
    assert out["unmet_shortfall_qty"] == 0.0
    assert len(out["expired_lots"]) == 1
    assert out["expired_lots"][0]["id"] == 12

    upd_by_id = {u["id"]: u for u in out["updated_lots"]}
    assert upd_by_id[11]["depleted_qty"] == 4.0
    assert upd_by_id[11]["remaining_qty"] == 0.0
    assert upd_by_id[11]["status_after"] == "depleted"

    assert upd_by_id[10]["depleted_qty"] == 0.5
    assert upd_by_id[10]["remaining_qty"] == 1.5
    assert upd_by_id[10]["status_after"] == "active"


def test_spot_count_variance_pure_function():
    v = compute_spot_count_variance(system_qty=6.0, counted_qty=5.2, unit_cost_krw=11000)
    assert v["system_qty"] == 6.0
    assert v["counted_qty"] == 5.2
    assert v["variance_qty"] == -0.8
    assert v["variance_krw"] == -8800
    assert v["requires_adjustment"] is True


def test_m4_expiry_risk_and_spot_count_api():
    try:
        # 1. Expiry-risk summary across all 18 ingredients
        res_risk = client.get("/api/inventory/expiry-risk?coverage_window_days=3")
        assert res_risk.status_code == 200
        risk_list = res_risk.json()
        assert len(risk_list) == 18

        pork_risk = next(r for r in risk_list if r["ingredient_code"] == "ING-PORK")
        assert pork_risk["at_risk_qty"] == 4.0
        assert pork_risk["usable_qty"] == 2.0
        assert pork_risk["total_on_hand_qty"] == 6.0

        # 2. Non-destructive FEFO depletion simulation via API
        res_sim = client.post(
            "/api/inventory/deplete-fefo",
            json={"ingredient_id": pork_risk["ingredient_id"], "demand_qty": 4.5, "commit": False},
        )
        assert res_sim.status_code == 200
        sim_body = res_sim.json()
        assert sim_body["total_depleted_qty"] == 4.5
        assert sim_body["unmet_shortfall_qty"] == 0.0

        # 3. Physical spot count adjustment (6.0 kg -> 5.0 kg) and restore back to 6.0 kg
        res_spot = client.post(
            "/api/inventory/spot-count",
            json={
                "ingredient_id": pork_risk["ingredient_id"],
                "counted_qty": 5.0,
                "reason": "Evening line check variance",
            },
        )
        assert res_spot.status_code == 200
        spot_body = res_spot.json()
        assert spot_body["system_qty"] == 6.0
        assert spot_body["counted_qty"] == 5.0
        assert spot_body["variance_qty"] == -1.0
        assert spot_body["variance_krw"] == -11000
    finally:
        # Restore Pork Lot A back to 4.0 kg and remove test StockSnapshot / AuditLog rows
        with Session(engine) as session:
            pork_lot_a = session.exec(
                select(Lot).where(Lot.batch_number == "BATCH-PORK-001")
            ).first()
            if pork_lot_a:
                pork_lot_a.quantity = 4.0
                pork_lot_a.status = "active"
                session.add(pork_lot_a)

            test_snaps = session.exec(
                select(StockSnapshot).where(StockSnapshot.snapshot_date == date(2026, 11, 4))
            ).all()
            for s in test_snaps:
                session.delete(s)

            for a in session.exec(select(AuditLog)).all():
                session.delete(a)

            session.commit()
