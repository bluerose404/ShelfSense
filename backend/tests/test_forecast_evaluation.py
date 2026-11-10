"""
Tests for:
1. Strict Gap-Day Exclusion (never zero-filled)
2. Pooled Interval Coverage across all 20 series on Folds 5-8 (target 85-95%)
   including per-horizon-bucket coverage (days 0-3 vs days 4-6)
3. Empirical Summed-Residual Ingredient Buffer:
   - Sub-additivity: Buffer(5d) < 5 * Buffer(1d) from actual summed residuals (no sqrt(W) fallback)
   - Returns "insufficient data" when backtest history is too short
   - Flags windows > 7 days
4. 20-Series Volume-Weighted Evaluation Report (vs Standard and Holiday-Aware baselines)
5. 7-Day Forecast API & upper >= median guarantee
"""
import numpy as np
from datetime import date
from sqlmodel import Session, select
from backend.database import engine
from backend.models import DailySale
from backend.services.forecast import (
    ForecastEngine, fetch_training_dataframe, GAP_DATES
)


def test_gap_days_excluded_not_zero_filled():
    df = fetch_training_dataframe()
    dates_in_df = set(df["sale_date"].dt.date)
    for g_date in GAP_DATES:
        assert g_date not in dates_in_df, f"Gap date {g_date} leaked into training dataset!"

    with Session(engine) as session:
        for g_date in GAP_DATES:
            sales = session.exec(select(DailySale).where(DailySale.sale_date == g_date)).all()
            assert len(sales) == 0, f"Gap date {g_date} was unexpectedly found in DB sales table!"


def test_buffer_sub_additivity_and_flags():
    engine = ForecastEngine()
    # 1. Empirical summed-residual buffer for pork shoulder (ING-PORK, id=1)
    buf_1d = engine.calculate_ingredient_buffer(ingredient_id=1, coverage_window_days=1)
    buf_5d = engine.calculate_ingredient_buffer(ingredient_id=1, coverage_window_days=5)

    assert isinstance(buf_1d, float) and buf_1d > 0
    assert isinstance(buf_5d, float) and buf_5d > 0
    # Sub-additivity from actual summed residuals (no sqrt(W) fallback)
    assert buf_5d < 5 * buf_1d, f"Buffer failed sub-additivity: 5d {buf_5d} not < 5 * 1d ({5 * buf_1d})"

    # 2. Verify window > 7 days flag
    details_5d = engine.calculate_ingredient_buffer(ingredient_id=1, coverage_window_days=5, return_details=True)
    assert isinstance(details_5d, dict)
    assert details_5d["status"] == "ok"
    assert details_5d["window_exceeds_7d"] is False
    assert details_5d["warning"] is None

    details_10d = engine.calculate_ingredient_buffer(ingredient_id=1, coverage_window_days=10, return_details=True)
    assert isinstance(details_10d, dict)
    assert details_10d["status"] == "ok"
    assert details_10d["window_exceeds_7d"] is True
    assert details_10d["warning"] is not None

    # 3. Verify "insufficient data" when backtest is too short (no sqrt(W) fallback)
    short_res = engine.calculate_ingredient_buffer(ingredient_id=1, coverage_window_days=5, max_backtest_days=6)
    assert short_res == "insufficient data"


def test_rolling_backtest_pooled_coverage_and_20series_metrics():
    engine = ForecastEngine()
    df = fetch_training_dataframe()

    results = engine.run_rolling_backtest(df, num_folds=8, fold_days=7)

    overall = results["overall"]
    pooled_cov = overall["pooled_coverage"]
    cov_0_3 = overall["pooled_coverage_days_0_3"]
    cov_4_6 = overall["pooled_coverage_days_4_6"]

    # Assert pooled coverage across all 20 series on holdout folds 5-8 is in [85%, 95%]
    assert 0.85 <= pooled_cov <= 0.95, f"Pooled coverage {pooled_cov} outside [0.85, 0.95] target window!"
    assert 0.85 <= cov_0_3 <= 0.95, f"Short-horizon coverage {cov_0_3} outside [0.85, 0.95]!"
    assert 0.85 <= cov_4_6 <= 0.95, f"Far-horizon coverage {cov_4_6} outside [0.85, 0.95]!"

    # Check overall volume-weighted WAPE and Bias (unchanged < 0.05 threshold)
    assert overall["volume_weighted_wape_model"] < 0.20
    assert abs(overall["volume_weighted_bias"]) < 0.05

    # Verify model beats both standard baseline and holiday-aware baseline overall
    assert overall["volume_weighted_wape_model"] < overall["volume_weighted_wape_base"]
    assert overall["volume_weighted_wape_model"] < overall["volume_weighted_wape_holiday_aware_base"]

    # Verify all 20 series are evaluated
    series_dict = results["series"]
    assert len(series_dict) == 20

    # Verify 7-day forecast generation and upper >= median assertion
    forecast_7d = engine.generate_7day_forecast(df, results, anchor_date=date(2026, 11, 4))
    assert len(forecast_7d) == 140  # 20 series * 7 days
    for item in forecast_7d:
        assert item["upper_portions"] >= item["median_portions"]
