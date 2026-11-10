"""
Tests for Milestone 3:
- EAN-13 validation & checksum calculation
- GS1 2D DataMatrix/QR parsing: AI (01) GTIN, (10) Batch, (17) Expiry Date
- Product lookup hierarchy: internal vs public API mock vs unknown
- FastAPI Scan & Receiving endpoints: lookup, one-time product registration, OCR stub,
  receiving match against incoming orders, discrepancy detection, and FEFO stock table sorting
"""
from datetime import date
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from backend.main import app
from backend.database import engine
from backend.models import Product, Lot, OrderRecommendation, AuditLog, Ingredient
from backend.services.barcodes import validate_ean13, parse_gs1_2d
from backend.services.product_lookup import product_lookup, extract_expiry_date_from_image_stub

client = TestClient(app)


def test_ean13_validator():
    # Valid EAN-13
    assert validate_ean13("8801234000017")
    # Invalid check digit
    assert not validate_ean13("8801234000018")
    # Invalid length
    assert not validate_ean13("88012340000")
    # Non-digit
    assert not validate_ean13("880123400001A")


def test_gs1_2d_payload_parser():
    # Sample bracketed GS1 QR / DataMatrix payload
    raw_payload = "(01)08801234000017(17)261115(10)LOT-PORK-99"
    parsed = parse_gs1_2d(raw_payload)

    assert parsed["is_gs1"] is True
    assert parsed["gtin"] == "08801234000017"
    assert parsed["ean13"] == "8801234000017"
    assert parsed["expiry_date"] == "2026-11-15"
    assert parsed["batch"] == "LOT-PORK-99"
    assert parsed["source"] == "auto"

    # Unbracketed GS1 payload with day '00' (end of month)
    unbracketed = "01088012340000241726110010BATCH02"
    parsed_unb = parse_gs1_2d(unbracketed)
    assert parsed_unb["is_gs1"] is True
    assert parsed_unb["ean13"] == "8801234000024"
    assert parsed_unb["expiry_date"] == "2026-11-30"
    assert parsed_unb["batch"] == "BATCH02"


def test_product_lookup_hierarchy():
    # 1. Internal product (seeded)
    internal = product_lookup.lookup("8801234000017")
    assert internal is not None
    assert internal["source"] == "internal"
    assert "김치" in internal["name_ko"]

    # 2. Public API mock
    public = product_lookup.lookup("8801043014785")  # Shin Ramyun mock
    assert public is not None
    assert public["source"] == "public_api"
    assert "신라면" in public["name_ko"]
    assert public["ingredient_id"] is not None

    # 3. Unknown barcode
    unknown = product_lookup.lookup("8809999900016")
    assert unknown is None


def test_ocr_stub():
    # Confirms OCR stub returns None safely without throwing
    res = extract_expiry_date_from_image_stub(b"fake_image_bytes")
    assert res is None

    # Also verify HTTP endpoint /api/scan/ocr-expiry
    resp = client.post(
        "/api/scan/ocr-expiry",
        files={"file": ("expiry.jpg", b"fake_image_bytes", "image/jpeg")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "stub"
    assert body["extracted_expiry"] is None


def test_scan_api_lookup_register_receive_and_order_match():
    created_prod_id = None
    created_lot_id = None
    created_order_id = None
    try:
        # 1. GS1 2D scan lookup -> auto expiry
        res_gs1 = client.post(
            "/api/scan/lookup",
            json={"barcode_payload": "(01)08801234000017(17)261120(10)LOT-KIMCHI-01"},
        )
        assert res_gs1.status_code == 200
        d_gs1 = res_gs1.json()
        assert d_gs1["is_gs1"] is True
        assert d_gs1["ean13_valid"] is True
        assert d_gs1["extracted_expiry"] == "2026-11-20"
        assert d_gs1["expiry_source"] == "auto"
        assert d_gs1["product"]["source"] == "internal"

        # 2. 1D EAN-13 scan lookup -> estimated expiry from standard_shelf_life_days
        res_1d = client.post(
            "/api/scan/lookup",
            json={"barcode_payload": "8801234000017"},
        )
        assert res_1d.status_code == 200
        d_1d = res_1d.json()
        assert d_1d["is_gs1"] is False
        assert d_1d["expiry_source"] == "estimated"
        assert d_1d["estimated_expiry"] == "2026-12-04"

        # 3. Unknown barcode lookup -> register one-time product -> lookup succeeds
        unknown_code = "8809999900016"
        res_unk = client.post("/api/scan/lookup", json={"barcode_payload": unknown_code})
        assert res_unk.status_code == 200
        assert res_unk.json()["product"] is None
        assert res_unk.json()["ean13_valid"] is True

        res_reg = client.post(
            "/api/scan/register-product",
            json={
                "barcode": unknown_code,
                "name_ko": "테스트 특선 포기김치 10kg",
                "name_en": "Test Special Pogi Kimchi 10kg",
                "maker": "서울식품",
                "food_type": "김치류",
                "pack_size": 10.0,
                "unit": "kg",
                "standard_shelf_life_days": 30,
                "ingredient_id": 2,
            },
        )
        assert res_reg.status_code == 200
        reg_prod = res_reg.json()
        assert reg_prod["source"] == "internal"
        created_prod_id = reg_prod["product_id"]

        # 4. Create an incoming order for Pork Shoulder (ingredient_id=1) and test receiving match + discrepancy
        with Session(engine) as session:
            pork = session.exec(select(Ingredient).where(Ingredient.code == "ING-PORK")).first()
            pork_id = pork.id
            order = OrderRecommendation(
                ingredient_id=pork_id,
                supplier_id=pork.supplier_id,
                recommended_qty=25.0,
                approved_qty=25.0,
                unit_cost_krw=11000.0,
                total_cost_krw=275000.0,
                status="incoming",
                reason_json='{"test": true}',
                expected_delivery_date=date(2026, 11, 4),
                cutoff_time="16:00",
            )
            session.add(order)
            session.commit()
            session.refresh(order)
            created_order_id = order.id

        # Lookup Pork Shoulder product (8801234000147) and verify incoming_order is attached
        res_pork = client.post("/api/scan/lookup", json={"barcode_payload": "8801234000147"})
        assert res_pork.status_code == 200
        pork_lookup = res_pork.json()
        assert pork_lookup["incoming_order"] is not None
        assert pork_lookup["incoming_order"]["id"] == created_order_id

        # Receive 20.0 kg against 25.0 kg ordered -> discrepancy detected, order transitions to 'received'
        res_rec = client.post(
            "/api/scan/receive",
            json={
                "ingredient_id": pork_id,
                "product_id": pork_lookup["product"]["product_id"],
                "quantity": 20.0,
                "unit_cost_krw": 11000,
                "expiry_date": "2026-11-11",
                "source": "auto",
                "batch_number": "BATCH-TEST-PORK",
                "matched_order_id": created_order_id,
            },
        )
        assert res_rec.status_code == 200
        rec_data = res_rec.json()
        created_lot_id = rec_data["lot_id"]
        assert rec_data["discrepancy"] is not None
        assert "25.0" in rec_data["discrepancy"] and "20.0" in rec_data["discrepancy"]

        with Session(engine) as session:
            updated_order = session.get(OrderRecommendation, created_order_id)
            assert updated_order.status == "received"

        # 5. Verify /api/lots returns active lots sorted by FEFO (expiry_date ascending)
        res_lots = client.get("/api/lots")
        assert res_lots.status_code == 200
        lots_list = res_lots.json()
        assert len(lots_list) >= 19
        expiry_dates = [l["expiry_date"] for l in lots_list]
        assert expiry_dates == sorted(expiry_dates)
    finally:
        with Session(engine) as session:
            if created_lot_id:
                l_obj = session.get(Lot, created_lot_id)
                if l_obj:
                    session.delete(l_obj)
            if created_order_id:
                o_obj = session.get(OrderRecommendation, created_order_id)
                if o_obj:
                    session.delete(o_obj)
            if created_prod_id:
                p_obj = session.get(Product, created_prod_id)
                if p_obj:
                    session.delete(p_obj)
            for a_obj in session.exec(select(AuditLog)).all():
                session.delete(a_obj)
            session.commit()
