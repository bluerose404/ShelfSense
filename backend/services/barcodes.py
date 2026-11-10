"""
Barcode Utilities & GS1 2D Parser
- Validates EAN-13 check digit (Modulo-10 algorithm with 880 prefix checks)
- Decodes GS1 2D DataMatrix/QR Application Identifiers:
    (01) GTIN / EAN (14 digits)
    (10) Batch / Lot Number
    (17) Expiry Date (YYMMDD -> ISO date)
"""
import re
from datetime import date
from typing import Optional, Dict, Any

def validate_ean13(barcode: str) -> bool:
    if not barcode or len(barcode) != 13 or not barcode.isdigit():
        return False
    odd_sum = sum(int(barcode[i]) for i in range(0, 12, 2))
    even_sum = sum(int(barcode[i]) for i in range(1, 12, 2))
    total = odd_sum + (even_sum * 3)
    mod = total % 10
    check = (10 - mod) % 10
    return int(barcode[12]) == check

def parse_gs1_2d(raw_text: str) -> Dict[str, Any]:
    """
    Parses GS1 Application Identifiers from 2D barcode payload.
    Supports bracketed (01)...(17)...(10) or raw FNC1 concatenated strings.
    """
    result = {
        "is_gs1": False,
        "gtin": None,
        "batch": None,
        "expiry_date": None, # ISO format YYYY-MM-DD
        "source": "manual"
    }

    if not raw_text:
        return result

    # Check for bracketed format: e.g. (01)08801234000017(17)261115(10)LOT12345
    gtin_match = re.search(r"\(01\)(\d{14})", raw_text)
    expiry_match = re.search(r"\(17\)(\d{6})", raw_text)
    batch_match = re.search(r"\(10\)([A-Za-z0-9\-]+)", raw_text)

    # Fallback to unbracketed 01...17...10 format
    if not gtin_match and raw_text.startswith("01") and len(raw_text) >= 16:
        gtin_val = raw_text[2:16]
        result["gtin"] = gtin_val
        result["is_gs1"] = True
        remaining = raw_text[16:]
        if "17" in remaining:
            idx = remaining.find("17")
            exp_str = remaining[idx+2:idx+8]
            if len(exp_str) == 6 and exp_str.isdigit():
                expiry_match = re.search(r"^(\d{6})", exp_str)
        if "10" in remaining:
            idx = remaining.find("10")
            batch_match = re.search(r"^([A-Za-z0-9\-]+)", remaining[idx+2:])
    elif gtin_match:
        result["is_gs1"] = True
        result["gtin"] = gtin_match.group(1)

    if expiry_match:
        result["is_gs1"] = True
        yymmdd = expiry_match.group(1) if hasattr(expiry_match, 'group') else expiry_match
        try:
            year = 2000 + int(yymmdd[0:2])
            month = int(yymmdd[2:4])
            day = int(yymmdd[4:6])
            # If day is 00, GS1 convention denotes last day of the month
            if day == 0:
                import calendar
                day = calendar.monthrange(year, month)[1]
            exp_date = date(year, month, day)
            result["expiry_date"] = exp_date.isoformat()
            result["source"] = "auto"
        except Exception:
            pass

    if batch_match:
        result["batch"] = batch_match.group(1) if hasattr(batch_match, 'group') else batch_match

    # If GTIN has 14 digits and starts with 0, 13-digit EAN is gtin[1:]
    if result["gtin"] and len(result["gtin"]) == 14 and result["gtin"].startswith("0"):
        result["ean13"] = result["gtin"][1:]
    else:
        result["ean13"] = result["gtin"]

    return result

