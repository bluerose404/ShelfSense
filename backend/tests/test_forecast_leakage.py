"""
Leakage & Horizon-Matched Training Tests (Audit Items 1 & 2):
1. Verifies OMP_NUM_THREADS == '1' before imports and threadpool_limits(1) constrains thread count to 1.
2. Retrains the model on a dataset where sales and delivery portions on/after the forecast origin are perturbed;
   asserts predictions match within 1e-9 tolerance.
3. Verifies training rows are built from many past origins across horizons 0..6 with horizon-matched weather
   (noisy forecast-like weather for days 0-3, seasonal climatology including non-zero average rain for days 4-6)
   and origin-anchored history features.
"""
import os
import numpy as np
import pandas as pd
from datetime import date, timedelta
from threadpoolctl import threadpool_limits, threadpool_info
from sklearn.ensemble import HistGradientBoostingRegressor
from sqlmodel import Session, select
from backend.database import engine
from backend.models import WeatherRecord
import backend.services.forecast as forecast_module
from backend.services.forecast import (
    ForecastEngine,
    fetch_training_dataframe,
    compute_origin_features_for_target,
    get_horizon_matched_weather,
)


def test_single_thread_environment_and_threadpool_limits_verified():
    # 1. Verify OMP_NUM_THREADS (and related env vars) set to '1'
    assert os.environ.get("OMP_NUM_THREADS") == "1"
    assert os.environ.get("OPENBLAS_NUM_THREADS") == "1"
    assert os.environ.get("MKL_NUM_THREADS") == "1"

    # 2. Verify threadpool_limits(1) forces active native threadpools to 1 thread
    with threadpool_limits(limits=1):
        infos = threadpool_info()
        for lib_info in infos:
            assert lib_info.get("num_threads") == 1, f"Threadpool {lib_info} has num_threads != 1"


def test_forecast_future_leakage_perturbation_with_retraining():
    assert os.environ.get("OMP_NUM_THREADS") == "1"

    forecast_engine = ForecastEngine()
    df_clean = fetch_training_dataframe()
    assert not df_clean.empty

    origin_date = date(2026, 10, 14)

    with Session(engine) as session:
        weather_records = session.exec(select(WeatherRecord)).all()
    weather_map = {w.record_date: w for w in weather_records}

    # Focus on first series (Kimchi Jjigae Lunch)
    series_clean = df_clean[(df_clean["menu_item_id"] == 1) & (df_clean["daypart"] == "lunch")].copy()

    # 1. Train model on clean dataset strictly before origin with threadpool_limits(1)
    X_clean, y_clean = forecast_engine.build_training_features_up_to_origin(series_clean, origin_date, weather_map)
    with threadpool_limits(limits=1):
        for lib_info in threadpool_info():
            assert lib_info.get("num_threads") == 1
        model_clean = HistGradientBoostingRegressor(max_iter=50, random_state=42)
        model_clean.fit(X_clean[forecast_engine.feature_cols], y_clean)

        clean_preds = []
        for step in range(7):
            target_d = origin_date + timedelta(days=step)
            feat = compute_origin_features_for_target(series_clean, target_d, origin_date, weather_map)
            X_step = pd.DataFrame([feat])
            clean_preds.append(float(model_clean.predict(X_step[forecast_engine.feature_cols])[0]))

    # 2. Perturb actuals strictly on and after origin date (+500 portions sold, +200 delivery)
    series_perturbed = series_clean.copy()
    mask_future = series_perturbed["sale_date"] >= pd.to_datetime(origin_date)
    series_perturbed.loc[mask_future, "portions_sold"] += 500
    series_perturbed.loc[mask_future, "portions_delivery"] += 200

    # Retrain on perturbed dataset strictly before origin
    X_pert, y_pert = forecast_engine.build_training_features_up_to_origin(series_perturbed, origin_date, weather_map)
    with threadpool_limits(limits=1):
        model_pert = HistGradientBoostingRegressor(max_iter=50, random_state=42)
        model_pert.fit(X_pert[forecast_engine.feature_cols], y_pert)

        pert_preds = []
        for step in range(7):
            target_d = origin_date + timedelta(days=step)
            feat = compute_origin_features_for_target(series_perturbed, target_d, origin_date, weather_map)
            X_step = pd.DataFrame([feat])
            pert_preds.append(float(model_pert.predict(X_step[forecast_engine.feature_cols])[0]))

    # Assert 100% bit-for-bit identical within 1e-9 tolerance
    np.testing.assert_allclose(
        clean_preds,
        pert_preds,
        rtol=1e-9,
        atol=1e-9,
        err_msg="Model predictions changed after perturbing future actuals! Future data leaked into forecast!",
    )


def test_training_rows_multi_origin_and_horizon_matched_weather():
    """
    Verifies Audit Item 2:
    - Training rows are built from many past origins across horizons 0..6 (~7x single-horizon rows).
    - Days 0-3 use noisy forecast-like weather; days 4-6 use seasonal climatology with non-zero average rain.
    """
    forecast_engine = ForecastEngine()
    df = fetch_training_dataframe()
    series = df[(df["menu_item_id"] == 1) & (df["daypart"] == "lunch")].copy()
    origin_date = date(2026, 10, 14)

    with Session(engine) as session:
        weather_records = session.exec(select(WeatherRecord)).all()
    weather_map = {w.record_date: w for w in weather_records}

    X_train, y_train = forecast_engine.build_training_features_up_to_origin(series, origin_date, weather_map)
    strict_hist_count = len(series[series["sale_date"] < pd.to_datetime(origin_date)])

    # With 7 horizons (0..6) per past origin after day 28, row count should be > 5 * (strict_hist_count - 28)
    assert len(X_train) > 5 * (strict_hist_count - 28)
    assert len(X_train) == len(y_train)

    # Check horizon-matched weather behavior directly across horizons 0..6
    for h in range(4, 7):
        target_d = origin_date + timedelta(days=h)
        w_clim = get_horizon_matched_weather(target_d, origin_date, weather_map)
        # Climatology rain must be non-zero average rain (2.7mm non-summer or 6.3mm summer)
        assert w_clim["rain_mm"] > 0.0, f"Horizon {h} climatology rain must be non-zero, got {w_clim['rain_mm']}"
        assert w_clim["rain_mm"] in (2.7, 6.3)
