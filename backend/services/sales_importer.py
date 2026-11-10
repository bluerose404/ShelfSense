"""
Sales CSV Importer & Data Quality Checker:
Validates and reports:
- Missing days in date sequences
- Duplicate rows
- Negative quantities
- Unknown menu items
"""
import io
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlmodel import Session, select
from backend.database import engine
from backend.models import MenuItem, DailySale

def check_sales_csv_data(file_content: bytes) -> Dict[str, Any]:
    df = pd.read_csv(io.BytesIO(file_content))
    
    # Expected columns: date, daypart, menu_code, portions_sold, portions_dine_in, portions_delivery, revenue_krw
    errors = []
    warnings = []
    
    with Session(engine) as session:
        valid_codes = {m.code for m in session.exec(select(MenuItem)).all()}

    # 1. Unknown Menu Items
    if "menu_code" in df.columns:
        unknown_codes = set(df["menu_code"].dropna()) - valid_codes
        if unknown_codes:
            warnings.append(f"Unknown menu items found: {', '.join(unknown_codes)}")

    # 2. Negative Quantities
    if "portions_sold" in df.columns:
        neg_count = (df["portions_sold"] < 0).sum()
        if neg_count > 0:
            errors.append(f"Found {neg_count} rows with negative portions sold.")

    # 3. Duplicate Rows
    if {"date", "daypart", "menu_code"}.issubset(df.columns):
        dupes = df.duplicated(subset=["date", "daypart", "menu_code"]).sum()
        if dupes > 0:
            warnings.append(f"Found {dupes} duplicate entries.")

    # 4. Missing Date Gaps
    if "date" in df.columns:
        df["parsed_date"] = pd.to_datetime(df["date"], errors="coerce")
        valid_dates = df["parsed_date"].dropna().dt.date.unique()
        if len(valid_dates) > 1:
            sorted_dates = sorted(valid_dates)
            curr = sorted_dates[0]
            missing_dates = []
            date_set = set(sorted_dates)
            while curr <= sorted_dates[-1]:
                if curr not in date_set:
                    missing_dates.append(curr.isoformat())
                curr += timedelta(days=1)
            if missing_dates:
                warnings.append(f"Missing {len(missing_dates)} date gaps in sequence: {', '.join(missing_dates[:5])}{'...' if len(missing_dates) > 5 else ''}")

    return {
        "total_rows": len(df),
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }

