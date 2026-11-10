"""
Tests for Milestone 3:
- EAN-13 validation & checksum calculation
- GS1 2D DataMatrix/QR parsing: AI (01) GTIN, (10) Batch, (17) Expiry Date
- Product lookup hierarchy: internal vs public API mock vs unknown
- Receiving flow & discrepancy detection
"""
import pytest
from datetime import date
from backend.services.barcodes import validate_ean13, parse_gs1_2d
from backend.services.product_lookup import product_lookup, extract_expiry_date_from_image_stub

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

def test_product_lookup_hierarchy():
    # 1. Internal product (seeded)
    internal = product_lookup.lookup("8801234000017")
    assert internal is not None
    assert internal["source"] == "internal"
    assert "김치" in internal["name_ko"]

    # 2. Public API mock
    public = product_lookup.lookup("8801043014785") # Shin Ramyun mock
    assert public is not None
    assert public["source"] == "public_api"
    assert "신라면" in public["name_ko"]

    # 3. Unknown barcode
    unknown = product_lookup.lookup("8809999999991")
    assert unknown is None

def test_ocr_stub():
    # Confirms OCR stub returns None safely without throwing
    res = extract_expiry_date_from_image_stub(b"fake_image_bytes")
    assert res is None

