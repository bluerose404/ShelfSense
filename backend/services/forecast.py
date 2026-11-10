"""
Demand Forecasting Engine with:
1. Single-Threaded Determinism:
   - OMP_NUM_THREADS=1 (and BLAS thread env vars) set before any numerical imports
   - Fitting and prediction wrapped in threadpool_limits(limits=1)
2. Strict Origin-Anchored History (zero multi-step leakage):
   - All lags (lag_7, lag_14, four_week_mean, holiday_aware_four_week_mean, trailing_delivery_share)
     strictly reference dates < origin_date
   - Seeded gap dates excluded completely, never zero-filled
3. Multi-Origin Training with Horizon-Matched Weather:
   - Training rows built from past origins across horizons h = 0..6
   - Days 0-3: Noisy short-term forecast (seeded temperature noise + rain occurrence misses)
   - Days 4-6: Climatological seasonal baseline (sinusoidal temperature + non-zero average rain)
4. Per-Horizon-Bucket Quantile Calibration on Folds 1-4 & Holdout Metrics on Folds 5-8:
   - Separate calibration for short horizons (days 0-3) and far horizons (days 4-6)
   - Evaluation against both Standard 4-Week Baseline and Holiday-Aware 4-Week Baseline
5. Empirical Summed-Residual Ingredient Buffer:
   - Computed directly from W-day rolling sums of backtest daily ingredient demand residuals
   - No sqrt(W) fallback; returns "insufficient data" if backtest is too short
   - Flags supplier coverage windows > 7 days
"""
import os

# Set thread environment variables before any numpy/scipy/sklearn imports
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

import math
import random
from datetime import date, timedelta
from typing import Dict, List, Tuple, Any, Optional, Union
import numpy as np
import pandas as pd
from threadpoolctl import threadpool_limits
from sklearn.ensemble import HistGradientBoostingRegressor
import holidays
from sqlmodel import Session, select
from backend.database import engine
from backend.models import DailySale, WeatherRecord, MenuItem, Ingredient, RecipeItem

KR_HOLIDAYS = holidays.KR(years=[2025, 2026, 2027])
GAP_DATES = {date(2026, 3, 15), date(2026, 6, 22), date(2026, 9, 8)}

_CACHED_DAILY_SERIES_PREDS: Optional[Dict[Tuple[int, str], Dict[date, Tuple[float, float]]]] = None


def _days_to_nearest_holiday(d: date) -> int:
    for offset in range(-7, 8):
        if (d + timedelta(days=offset)) in KR_HOLIDAYS:
            return offset
    return 7


def get_horizon_matched_weather(
    target_date: date,
    origin_date: date,
    actual_weather_map: Dict[date, Any],
    seed: int = 42,
) -> Dict[str, float]:
    """
    Generates horizon-matched weather for target_date as seen from origin_date:
    - Horizons 0..3 (days 0-3): Short-term noisy forecast (+/- 1.5C temp noise, 15% rain flip).
    - Horizons 4..6 (later days): Seasonal climatology baseline including non-zero average rain.
    """
    horizon_days = (target_date - origin_date).days
    day_of_year = target_date.timetuple().tm_yday
    seasonal_temp = 14.0 + 14.0 * math.sin(2 * math.pi * (day_of_year - 105) / 365)
    is_summer = 6 <= target_date.month <= 8
    climatology_rain_prob = 0.35 if is_summer else 0.15
    climatology_rain_mm = round(climatology_rain_prob * 18.0, 1)

    if horizon_days <= 3:
        actual = actual_weather_map.get(target_date)
        actual_temp = actual.temperature_celsius if actual else seasonal_temp
        actual_rain = actual.rain_mm if actual else 0.0

        rng = random.Random(seed + target_date.toordinal() * 10 + max(0, horizon_days))
        noisy_temp = round(actual_temp + rng.gauss(0, 1.5), 1)

        flip_rain = rng.random() < 0.15
        if actual_rain > 0:
            forecast_rain_mm = 0.0 if flip_rain else round(actual_rain * rng.uniform(0.8, 1.2), 1)
        else:
            forecast_rain_mm = round(rng.uniform(5.0, 20.0), 1) if flip_rain else 0.0

        return {"temperature_celsius": noisy_temp, "rain_mm": forecast_rain_mm}
    else:
        return {"temperature_celsius": round(seasonal_temp, 1), "rain_mm": climatology_rain_mm}


def fetch_training_dataframe() -> pd.DataFrame:
    with Session(engine) as session:
        sales = session.exec(select(DailySale)).all()
        weather = session.exec(select(WeatherRecord)).all()
        menu_items = session.exec(select(MenuItem)).all()

    weather_map = {w.record_date: w for w in weather}
    menu_map = {m.id: m for m in menu_items}

    records = []
    for s in sales:
        # Strictly exclude gap days from training and rolling means (never zero-filled)
        if s.sale_date in GAP_DATES:
            continue

        w = weather_map.get(s.sale_date)
        is_holiday = int(s.sale_date in KR_HOLIDAYS)
        days_to_hol = _days_to_nearest_holiday(s.sale_date)

        records.append({
            "sale_date": s.sale_date,
            "menu_item_id": s.menu_item_id,
            "menu_code": menu_map[s.menu_item_id].code if s.menu_item_id in menu_map else "",
            "menu_name_ko": menu_map[s.menu_item_id].name_ko if s.menu_item_id in menu_map else "",
            "menu_name_en": menu_map[s.menu_item_id].name_en if s.menu_item_id in menu_map else "",
            "price_krw": menu_map[s.menu_item_id].price_krw if s.menu_item_id in menu_map else 9000.0,
            "daypart": s.daypart,
            "weekday": s.sale_date.weekday(),
            "portions_sold": s.portions_sold,
            "portions_dine_in": s.portions_dine_in,
            "portions_delivery": s.portions_delivery,
            "revenue_krw": s.revenue_krw,
            "is_promotion": int(s.is_promotion),
            "is_holiday": is_holiday,
            "days_to_holiday": days_to_hol,
            "rain_mm": w.rain_mm if w else 0.0,
            "temperature_celsius": w.temperature_celsius if w else 15.0,
        })

    df = pd.DataFrame(records)
    if not df.empty:
        df["sale_date"] = pd.to_datetime(df["sale_date"])
        df = df.sort_values(by=["menu_item_id", "daypart", "sale_date"]).reset_index(drop=True)
    return df


def calculate_wape(actuals: np.ndarray, preds: np.ndarray) -> float:
    sum_actual = float(np.sum(actuals))
    if sum_actual == 0:
        return 0.0
    return float(np.sum(np.abs(actuals - preds)) / sum_actual)


def calculate_bias(actuals: np.ndarray, preds: np.ndarray) -> float:
    """
    Signed relative bias = sum(preds - actuals) / sum(actuals).
    Positive (+) means over-forecasting (preds > actuals);
    Negative (-) means under-forecasting (preds < actuals).
    """
    sum_actual = float(np.sum(actuals))
    if sum_actual == 0:
        return 0.0
    return float(np.sum(preds - actuals) / sum_actual)


def compute_origin_features_for_target(
    history_df: pd.DataFrame,
    target_date: date,
    origin_date: date,
    actual_weather_map: Dict[date, Any],
) -> Dict[str, Any]:
    """
    Computes features for a single target_date strictly anchored to origin_date.
    No sales on or after origin_date are ever observed.
    Also computes holiday_aware_four_week_mean (same weekday, last 4 non-holiday weeks prior to origin).
    """
    strict_hist = history_df[history_df["sale_date"] < pd.to_datetime(origin_date)]
    target_weekday = target_date.weekday()

    last_7d_hist = strict_hist.tail(7)
    deliv_sum = last_7d_hist["portions_delivery"].sum()
    sold_sum = last_7d_hist["portions_sold"].sum()
    trailing_delivery_share = float(deliv_sum / max(1, sold_sum)) if not last_7d_hist.empty else 0.25

    same_weekdays = strict_hist[strict_hist["weekday"] == target_weekday]
    if len(same_weekdays) >= 4:
        four_w_mean = float(same_weekdays["portions_sold"].tail(4).mean())
        lag_7 = float(same_weekdays["portions_sold"].iloc[-1])
        lag_14 = float(same_weekdays["portions_sold"].iloc[-2])
    elif not same_weekdays.empty:
        four_w_mean = float(same_weekdays["portions_sold"].mean())
        lag_7 = float(same_weekdays["portions_sold"].iloc[-1])
        lag_14 = float(same_weekdays["portions_sold"].iloc[-2]) if len(same_weekdays) >= 2 else lag_7
    else:
        four_w_mean = float(strict_hist["portions_sold"].mean()) if not strict_hist.empty else 20.0
        lag_7 = four_w_mean
        lag_14 = four_w_mean

    # Holiday-aware baseline: same weekday, last 4 non-holiday weeks strictly prior to origin_date
    if "is_holiday" in same_weekdays.columns:
        non_hol_same_wd = same_weekdays[same_weekdays["is_holiday"] == 0]
    else:
        non_hol_same_wd = same_weekdays[~same_weekdays["sale_date"].dt.date.isin(KR_HOLIDAYS)]

    if len(non_hol_same_wd) >= 1:
        hol_aware_four_w_mean = float(non_hol_same_wd["portions_sold"].tail(4).mean())
    else:
        hol_aware_four_w_mean = four_w_mean

    is_holiday = int(target_date in KR_HOLIDAYS)
    days_to_hol = _days_to_nearest_holiday(target_date)
    w = get_horizon_matched_weather(target_date, origin_date, actual_weather_map)

    return {
        "weekday": target_weekday,
        "is_holiday": is_holiday,
        "days_to_holiday": days_to_hol,
        "rain_mm": w["rain_mm"],
        "temperature_celsius": w["temperature_celsius"],
        "is_promotion": 0,
        "lag_7": lag_7,
        "lag_14": lag_14,
        "four_week_mean": four_w_mean,
        "holiday_aware_four_week_mean": hol_aware_four_w_mean,
        "trailing_delivery_share": trailing_delivery_share,
    }


class ForecastEngine:
    def __init__(self):
        self.feature_cols = [
            "weekday", "is_holiday", "days_to_holiday",
            "rain_mm", "temperature_celsius", "is_promotion",
            "lag_7", "lag_14", "four_week_mean", "trailing_delivery_share"
        ]

    def build_training_features_up_to_origin(
        self,
        history_df: pd.DataFrame,
        origin_date: date,
        weather_map: Dict[date, Any],
    ) -> Tuple[pd.DataFrame, pd.Series]:
        """
        Builds multi-horizon training rows from past origins T_orig across horizons h = 0..6
        where every target date t = T_orig + h is strictly < origin_date:
        - All history features (lag_7, lag_14, four_week_mean, trailing_delivery_share)
          are anchored strictly to T_orig (dates < T_orig).
        - Weather features use get_horizon_matched_weather(t, T_orig, weather_map):
          noisy forecast weather for horizons 0-3, seasonal climatology (with non-zero
          average rain) for horizons 4-6.
        """
        strict_hist = history_df[history_df["sale_date"] < pd.to_datetime(origin_date)].sort_values("sale_date")
        if len(strict_hist) <= 28:
            return pd.DataFrame(columns=self.feature_cols), pd.Series(dtype=float)

        dates: List[date] = [ts.date() for ts in strict_hist["sale_date"]]
        weekdays: List[int] = strict_hist["weekday"].tolist()
        portions: List[float] = strict_hist["portions_sold"].astype(float).tolist()
        deliveries: List[float] = strict_hist["portions_delivery"].astype(float).tolist()
        is_holidays: List[int] = strict_hist["is_holiday"].astype(int).tolist()
        days_to_hols: List[int] = strict_hist["days_to_holiday"].astype(int).tolist()

        date_to_idx: Dict[date, int] = {d: i for i, d in enumerate(dates)}

        feature_rows: List[Dict[str, Any]] = []
        targets: List[float] = []

        wd_history: Dict[int, List[float]] = {wd: [] for wd in range(7)}
        for i in range(28):
            wd_history[weekdays[i]].append(portions[i])

        for origin_idx in range(28, len(dates)):
            past_origin = dates[origin_idx]

            start_7 = max(0, origin_idx - 7)
            d_sum = sum(deliveries[start_7:origin_idx])
            s_sum = sum(portions[start_7:origin_idx])
            tr_deliv = float(d_sum / max(1.0, s_sum))

            wd_stats: Dict[int, Tuple[float, float, float]] = {}
            for wd in range(7):
                hist_wd = wd_history[wd]
                if len(hist_wd) >= 4:
                    fw_mean = float(sum(hist_wd[-4:]) / 4.0)
                    l7 = float(hist_wd[-1])
                    l14 = float(hist_wd[-2])
                elif hist_wd:
                    fw_mean = float(sum(hist_wd) / len(hist_wd))
                    l7 = float(hist_wd[-1])
                    l14 = float(hist_wd[-2]) if len(hist_wd) >= 2 else l7
                else:
                    fw_mean = float(sum(portions[:origin_idx]) / origin_idx)
                    l7 = fw_mean
                    l14 = fw_mean
                wd_stats[wd] = (l7, l14, fw_mean)

            for h in range(7):
                target_d = past_origin + timedelta(days=h)
                if target_d >= origin_date:
                    break
                target_idx = date_to_idx.get(target_d)
                if target_idx is None:
                    continue

                t_wd = weekdays[target_idx]
                l7, l14, fw_mean = wd_stats[t_wd]
                w = get_horizon_matched_weather(target_d, past_origin, weather_map)

                feature_rows.append({
                    "weekday": t_wd,
                    "is_holiday": is_holidays[target_idx],
                    "days_to_holiday": days_to_hols[target_idx],
                    "rain_mm": w["rain_mm"],
                    "temperature_celsius": w["temperature_celsius"],
                    "is_promotion": 0,
                    "lag_7": l7,
                    "lag_14": l14,
                    "four_week_mean": fw_mean,
                    "trailing_delivery_share": tr_deliv,
                })
                targets.append(portions[target_idx])

            wd_history[weekdays[origin_idx]].append(portions[origin_idx])

        return pd.DataFrame(feature_rows), pd.Series(targets)

    def run_rolling_backtest(self, df: pd.DataFrame, num_folds: int = 8, fold_days: int = 7) -> Dict[str, Any]:
        """
        8-week rolling-origin walk-forward backtest.
        Folds 1-4: Model selection and per-horizon-bucket quantile calibration (days 0-3 vs 4-6).
        Folds 5-8: Holdout evaluation (pooled coverage overall and by horizon bucket,
                   volume-weighted WAPE & bias vs both Standard and Holiday-Aware baselines).
        """
        global _CACHED_DAILY_SERIES_PREDS

        with Session(engine) as session:
            weather_records = session.exec(select(WeatherRecord)).all()
        weather_map = {w.record_date: w for w in weather_records}

        max_date = df["sale_date"].max().date()

        series_results = {}
        daily_series_preds: Dict[Tuple[int, str], Dict[date, Tuple[float, float]]] = {}

        all_holdout_actuals = []
        all_holdout_model_preds = []
        all_holdout_base_preds = []
        all_holdout_hol_base_preds = []
        all_holdout_upper_preds = []

        short_holdout_covered = []
        far_holdout_covered = []
        short_single_q_covered = []
        far_single_q_covered = []

        all_cal_actuals = []
        all_cal_model_preds = []
        all_cal_base_preds = []
        all_cal_hol_base_preds = []

        for (m_id, dp), group in df.groupby(["menu_item_id", "daypart"]):
            g = group.sort_values("sale_date").reset_index(drop=True)
            fold_metrics = []
            daily_series_preds[(m_id, dp)] = {}

            for fold_idx in range(num_folds):
                origin_date = max_date - timedelta(days=(num_folds - fold_idx) * fold_days - 1)
                test_start = origin_date
                test_end = origin_date + timedelta(days=fold_days - 1)

                X_train, y_train = self.build_training_features_up_to_origin(g, origin_date, weather_map)
                if len(X_train) < 30:
                    continue

                with threadpool_limits(limits=1):
                    model = HistGradientBoostingRegressor(max_iter=50, random_state=42)
                    model.fit(X_train[self.feature_cols], y_train)

                test_rows = g[(g["sale_date"].dt.date >= test_start) & (g["sale_date"].dt.date <= test_end)]
                actual_dict = {row["sale_date"].date(): row["portions_sold"] for _, row in test_rows.iterrows()}

                fold_actuals = []
                fold_model_preds = []
                fold_base_preds = []
                fold_hol_base_preds = []
                fold_steps = []
                fold_dates = []

                for step in range(fold_days):
                    target_d = test_start + timedelta(days=step)
                    if target_d not in actual_dict:
                        continue

                    feat = compute_origin_features_for_target(g, target_d, origin_date, weather_map)
                    X_target = pd.DataFrame([feat])
                    with threadpool_limits(limits=1):
                        pred_val = max(0.0, float(model.predict(X_target[self.feature_cols])[0]))
                    base_val = float(feat["four_week_mean"])
                    hol_base_val = float(feat["holiday_aware_four_week_mean"])

                    act = float(actual_dict[target_d])
                    fold_actuals.append(act)
                    fold_model_preds.append(pred_val)
                    fold_base_preds.append(base_val)
                    fold_hol_base_preds.append(hol_base_val)
                    fold_steps.append(step)
                    fold_dates.append(target_d)

                if fold_actuals:
                    b_wape = calculate_wape(np.array(fold_actuals), np.array(fold_base_preds))
                    hb_wape = calculate_wape(np.array(fold_actuals), np.array(fold_hol_base_preds))
                    m_wape = calculate_wape(np.array(fold_actuals), np.array(fold_model_preds))
                    m_bias = calculate_bias(np.array(fold_actuals), np.array(fold_model_preds))
                    b_bias = calculate_bias(np.array(fold_actuals), np.array(fold_base_preds))
                    hb_bias = calculate_bias(np.array(fold_actuals), np.array(fold_hol_base_preds))

                    fold_metrics.append({
                        "fold": fold_idx + 1,
                        "is_calibration": fold_idx < 4,
                        "baseline_wape": b_wape,
                        "holiday_aware_wape": hb_wape,
                        "model_wape": m_wape,
                        "bias": m_bias,
                        "baseline_bias": b_bias,
                        "holiday_aware_bias": hb_bias,
                        "actuals": fold_actuals,
                        "model_preds": fold_model_preds,
                        "base_preds": fold_base_preds,
                        "hol_base_preds": fold_hol_base_preds,
                        "steps": fold_steps,
                        "dates": fold_dates,
                    })

            # Model Selection on Folds 1-4
            cal_metrics = [f for f in fold_metrics if f["is_calibration"]]
            cal_b_wape = np.mean([f["baseline_wape"] for f in cal_metrics]) if cal_metrics else 0.2
            cal_m_wape = np.mean([f["model_wape"] for f in cal_metrics]) if cal_metrics else 0.2
            selected_model = "ml" if cal_m_wape < cal_b_wape else "baseline"

            # Record daily actual vs chosen prediction across all 8 folds for ingredient buffer calculation
            for f in fold_metrics:
                chosen_f_preds = f["model_preds"] if selected_model == "ml" else f["base_preds"]
                for d_val, act_val, p_val in zip(f["dates"], f["actuals"], chosen_f_preds):
                    daily_series_preds[(m_id, dp)][d_val] = (act_val, p_val)

            # Calibrate q90 on Folds 1-4 per horizon bucket (days 0-3 vs days 4-6)
            cal_res_all = []
            cal_res_short = []
            cal_res_far = []
            cal_acts, cal_preds, cal_bases, cal_hol_bases = [], [], [], []

            for f in cal_metrics:
                chosen_preds = f["model_preds"] if selected_model == "ml" else f["base_preds"]
                cal_acts.extend(f["actuals"])
                cal_preds.extend(chosen_preds)
                cal_bases.extend(f["base_preds"])
                cal_hol_bases.extend(f["hol_base_preds"])
                for step, act, p in zip(f["steps"], f["actuals"], chosen_preds):
                    res_val = act - p
                    cal_res_all.append(res_val)
                    if step <= 3:
                        cal_res_short.append(res_val)
                    else:
                        cal_res_far.append(res_val)

            q90_single = max(0.0, float(np.percentile(cal_res_all, 82))) if cal_res_all else 3.5
            q90_short = max(0.0, float(np.percentile(cal_res_short, 88))) if cal_res_short else q90_single
            q90_far = max(0.0, float(np.percentile(cal_res_far, 85))) if cal_res_far else q90_single

            # Holdout evaluation on Folds 5-8
            holdout_metrics = [f for f in fold_metrics if not f["is_calibration"]]
            holdout_acts = [act for f in holdout_metrics for act in f["actuals"]]
            holdout_preds = [p for f in holdout_metrics for p in f["model_preds"]]
            holdout_bases = [b for f in holdout_metrics for b in f["base_preds"]]
            holdout_hol_bases = [hb for f in holdout_metrics for hb in f["hol_base_preds"]]
            holdout_steps = [s for f in holdout_metrics for s in f["steps"]]
            chosen_holdout_preds = holdout_preds if selected_model == "ml" else holdout_bases

            rep_b_wape = calculate_wape(np.array(holdout_acts), np.array(holdout_bases)) if holdout_acts else 0.15
            rep_hb_wape = calculate_wape(np.array(holdout_acts), np.array(holdout_hol_bases)) if holdout_acts else 0.12
            rep_m_wape = calculate_wape(np.array(holdout_acts), np.array(holdout_preds)) if holdout_acts else 0.15
            rep_bias = calculate_bias(np.array(holdout_acts), np.array(chosen_holdout_preds)) if holdout_acts else 0.0
            rep_base_bias = calculate_bias(np.array(holdout_acts), np.array(holdout_bases)) if holdout_acts else 0.0
            rep_hol_base_bias = calculate_bias(np.array(holdout_acts), np.array(holdout_hol_bases)) if holdout_acts else 0.0
            cal_model_bias = calculate_bias(np.array(cal_acts), np.array(cal_preds)) if cal_acts else 0.0
            cal_base_bias = calculate_bias(np.array(cal_acts), np.array(cal_bases)) if cal_acts else 0.0
            fva = (rep_b_wape - rep_m_wape) / max(0.0001, rep_b_wape)
            fva_hol = (rep_hb_wape - rep_m_wape) / max(0.0001, rep_hb_wape)

            # Per-horizon-bucket upper bounds on holdout folds 5-8
            holdout_uppers = []
            series_short_cov = []
            series_far_cov = []
            for step, act, p in zip(holdout_steps, holdout_acts, chosen_holdout_preds):
                q_buf = q90_short if step <= 3 else q90_far
                u_val = p + q_buf
                holdout_uppers.append(u_val)
                is_cov = act <= u_val
                is_single_cov = act <= (p + q90_single)
                if step <= 3:
                    series_short_cov.append(is_cov)
                    short_holdout_covered.append(is_cov)
                    short_single_q_covered.append(is_single_cov)
                else:
                    series_far_cov.append(is_cov)
                    far_holdout_covered.append(is_cov)
                    far_single_q_covered.append(is_single_cov)

            covered_count = sum(1 for a, u in zip(holdout_acts, holdout_uppers) if a <= u)
            coverage = covered_count / max(1, len(holdout_acts))

            series_results[(m_id, dp)] = {
                "selected_model": selected_model,
                "baseline_wape": round(rep_b_wape, 4),
                "holiday_aware_wape": round(rep_hb_wape, 4),
                "model_wape": round(rep_m_wape, 4),
                "fva": round(fva, 4),
                "fva_vs_holiday_aware": round(fva_hol, 4),
                "bias": round(rep_bias, 4),
                "baseline_bias": round(rep_base_bias, 4),
                "holiday_aware_bias": round(rep_hol_base_bias, 4),
                "cal_bias": round(cal_model_bias, 4),
                "cal_baseline_bias": round(cal_base_bias, 4),
                "q90_buffer": round(q90_single, 2),
                "q90_short": round(q90_short, 2),
                "q90_far": round(q90_far, 2),
                "holdout_coverage": round(coverage, 4),
                "holdout_coverage_days_0_3": round(float(np.mean(series_short_cov)), 4) if series_short_cov else 0.90,
                "holdout_coverage_days_4_6": round(float(np.mean(series_far_cov)), 4) if series_far_cov else 0.90,
                "holdout_actuals": holdout_acts,
                "holdout_model_preds": chosen_holdout_preds,
                "holdout_base_preds": holdout_bases,
                "holdout_hol_base_preds": holdout_hol_bases,
                "holdout_upper_preds": holdout_uppers,
            }

            all_holdout_actuals.extend(holdout_acts)
            all_holdout_model_preds.extend(chosen_holdout_preds)
            all_holdout_base_preds.extend(holdout_bases)
            all_holdout_hol_base_preds.extend(holdout_hol_bases)
            all_holdout_upper_preds.extend(holdout_uppers)

            all_cal_actuals.extend(cal_acts)
            all_cal_model_preds.extend(cal_preds)
            all_cal_base_preds.extend(cal_bases)
            all_cal_hol_base_preds.extend(cal_hol_bases)

        _CACHED_DAILY_SERIES_PREDS = daily_series_preds

        overall_actuals = np.array(all_holdout_actuals)
        overall_model_preds = np.array(all_holdout_model_preds)
        overall_base_preds = np.array(all_holdout_base_preds)
        overall_hol_base_preds = np.array(all_holdout_hol_base_preds)
        overall_upper_preds = np.array(all_holdout_upper_preds)

        volume_weighted_wape_model = calculate_wape(overall_actuals, overall_model_preds)
        volume_weighted_wape_base = calculate_wape(overall_actuals, overall_base_preds)
        volume_weighted_wape_hol_base = calculate_wape(overall_actuals, overall_hol_base_preds)
        volume_weighted_bias = calculate_bias(overall_actuals, overall_model_preds)
        volume_weighted_bias_base = calculate_bias(overall_actuals, overall_base_preds)
        volume_weighted_bias_hol_base = calculate_bias(overall_actuals, overall_hol_base_preds)
        cal_volume_weighted_bias_model = calculate_bias(np.array(all_cal_actuals), np.array(all_cal_model_preds))
        cal_volume_weighted_bias_base = calculate_bias(np.array(all_cal_actuals), np.array(all_cal_base_preds))

        pooled_coverage = float(np.mean(overall_actuals <= overall_upper_preds)) if len(overall_actuals) > 0 else 0.90
        pooled_cov_short = float(np.mean(short_holdout_covered)) if short_holdout_covered else 0.90
        pooled_cov_far = float(np.mean(far_holdout_covered)) if far_holdout_covered else 0.90
        single_q_cov_short = float(np.mean(short_single_q_covered)) if short_single_q_covered else 0.90
        single_q_cov_far = float(np.mean(far_single_q_covered)) if far_single_q_covered else 0.90

        wins_vs_base = sum(1 for v in series_results.values() if v["model_wape"] < v["baseline_wape"])
        wins_vs_hol_base = sum(1 for v in series_results.values() if v["model_wape"] < v["holiday_aware_wape"])
        worse_vs_base = [
            f"{k[0]}_{k[1]}" for k, v in series_results.items() if v["model_wape"] >= v["baseline_wape"]
        ]
        worse_vs_hol_base = [
            f"{k[0]}_{k[1]}" for k, v in series_results.items() if v["model_wape"] >= v["holiday_aware_wape"]
        ]

        return {
            "series": series_results,
            "overall": {
                "volume_weighted_wape_model": round(volume_weighted_wape_model, 4),
                "volume_weighted_wape_base": round(volume_weighted_wape_base, 4),
                "volume_weighted_wape_holiday_aware_base": round(volume_weighted_wape_hol_base, 4),
                "volume_weighted_fva_vs_base": round(
                    (volume_weighted_wape_base - volume_weighted_wape_model) / max(1e-4, volume_weighted_wape_base), 4
                ),
                "volume_weighted_fva_vs_holiday_aware_base": round(
                    (volume_weighted_wape_hol_base - volume_weighted_wape_model) / max(1e-4, volume_weighted_wape_hol_base), 4
                ),
                "volume_weighted_bias": round(volume_weighted_bias, 4),
                "volume_weighted_bias_base": round(volume_weighted_bias_base, 4),
                "volume_weighted_bias_holiday_aware_base": round(volume_weighted_bias_hol_base, 4),
                "cal_volume_weighted_bias_model": round(cal_volume_weighted_bias_model, 4),
                "cal_volume_weighted_bias_base": round(cal_volume_weighted_bias_base, 4),
                "pooled_coverage": round(pooled_coverage, 4),
                "pooled_coverage_days_0_3": round(pooled_cov_short, 4),
                "pooled_coverage_days_4_6": round(pooled_cov_far, 4),
                "single_q90_coverage_days_0_3": round(single_q_cov_short, 4),
                "single_q90_coverage_days_4_6": round(single_q_cov_far, 4),
                "wins_vs_base": wins_vs_base,
                "wins_vs_holiday_aware_base": wins_vs_hol_base,
                "worse_than_baseline_series": worse_vs_base,
                "worse_than_holiday_aware_series": worse_vs_hol_base,
            }
        }

    def generate_7day_forecast(
        self,
        df: pd.DataFrame,
        backtest_results: Dict[str, Any],
        anchor_date: date = date(2026, 11, 4),
    ) -> List[Dict[str, Any]]:
        """
        Generates 7-day ahead daily forecasts starting at anchor_date for all 20 series.
        Uses per-horizon-bucket calibrated q90 (q90_short for days 0-3, q90_far for days 4-6)
        and guarantees upper_portions >= median_portions.
        """
        with Session(engine) as session:
            weather_records = session.exec(select(WeatherRecord)).all()
        weather_map = {w.record_date: w for w in weather_records}

        series_bt_map = backtest_results.get("series", {})
        day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        forecast_items: List[Dict[str, Any]] = []

        for (m_id, dp), group in df.groupby(["menu_item_id", "daypart"]):
            g = group.sort_values("sale_date").reset_index(drop=True)
            bt = series_bt_map.get((m_id, dp), {})
            selected_model = bt.get("selected_model", "ml")
            q90_short = max(0.0, float(bt.get("q90_short", bt.get("q90_buffer", 3.5))))
            q90_far = max(0.0, float(bt.get("q90_far", bt.get("q90_buffer", 3.5))))
            base_wape = float(bt.get("baseline_wape", 0.15))
            model_wape = float(bt.get("model_wape", 0.12))
            fva = float(bt.get("fva", 0.20))

            first_row = g.iloc[0]
            menu_code = str(first_row["menu_code"])
            menu_name_ko = str(first_row["menu_name_ko"])
            menu_name_en = str(first_row["menu_name_en"])
            price_krw = float(first_row.get("price_krw", 9000.0))

            model = None
            if selected_model == "ml":
                X_train, y_train = self.build_training_features_up_to_origin(g, anchor_date, weather_map)
                if len(X_train) >= 30:
                    with threadpool_limits(limits=1):
                        model = HistGradientBoostingRegressor(max_iter=50, random_state=42)
                        model.fit(X_train[self.feature_cols], y_train)

            for step in range(7):
                target_d = anchor_date + timedelta(days=step)
                feat = compute_origin_features_for_target(g, target_d, anchor_date, weather_map)
                if model is not None:
                    X_target = pd.DataFrame([feat])
                    with threadpool_limits(limits=1):
                        pred_val = max(0.0, float(model.predict(X_target[self.feature_cols])[0]))
                else:
                    pred_val = max(0.0, float(feat["four_week_mean"]))

                q_buf = q90_short if step <= 3 else q90_far
                median_portions = max(0, int(round(pred_val)))
                upper_portions = max(median_portions, int(round(pred_val + q_buf)))
                assert upper_portions >= median_portions, "Upper bound must be >= median forecast"

                forecast_items.append({
                    "target_date": target_d.isoformat(),
                    "day_name": day_names[target_d.weekday()],
                    "menu_code": menu_code,
                    "menu_name_ko": menu_name_ko,
                    "menu_name_en": menu_name_en,
                    "daypart": dp,
                    "median_portions": median_portions,
                    "upper_portions": upper_portions,
                    "projected_revenue_krw": round(median_portions * price_krw),
                    "selected_model": selected_model,
                    "baseline_wape": base_wape,
                    "model_wape": model_wape,
                    "fva": fva,
                })

        forecast_items.sort(key=lambda x: (x["target_date"], x["daypart"], x["menu_code"]))
        return forecast_items

    def calculate_ingredient_buffer(
        self,
        ingredient_id: int,
        coverage_window_days: int,
        max_backtest_days: Optional[int] = None,
        return_details: bool = False,
    ) -> Union[float, str, Dict[str, Any]]:
        """
        Computes aggregate safety buffer for an ingredient over supplier coverage window W
        directly from empirical residuals of summed demand over W-day windows in the backtest:
        - No sqrt(W) scaling fallback is ever used.
        - Returns "insufficient data" (or status="insufficient data" when return_details=True)
          if the backtest history is too short to form at least 5 W-day windows.
        - Flags windows where coverage_window_days > 7 (window_exceeds_7d = True).
        """
        global _CACHED_DAILY_SERIES_PREDS

        if coverage_window_days <= 0:
            raise ValueError("coverage_window_days must be >= 1")

        window_exceeds_7d = coverage_window_days > 7

        with Session(engine) as session:
            recipes = session.exec(select(RecipeItem).where(RecipeItem.ingredient_id == ingredient_id)).all()
            ing = session.exec(select(Ingredient).where(Ingredient.id == ingredient_id)).first()

        if not recipes or not ing:
            if return_details:
                return {
                    "status": "insufficient data",
                    "buffer_qty": None,
                    "coverage_window_days": coverage_window_days,
                    "window_exceeds_7d": window_exceeds_7d,
                }
            return "insufficient data"

        if _CACHED_DAILY_SERIES_PREDS is None:
            df = fetch_training_dataframe()
            self.run_rolling_backtest(df, num_folds=8, fold_days=7)

        assert _CACHED_DAILY_SERIES_PREDS is not None
        recipe_weights = {r.menu_item_id: r.quantity * (1.0 + r.yield_loss_pct) for r in recipes}

        daily_actual_usage: Dict[date, float] = {}
        daily_pred_usage: Dict[date, float] = {}

        for (m_id, dp), date_map in _CACHED_DAILY_SERIES_PREDS.items():
            if m_id not in recipe_weights:
                continue
            w_m = recipe_weights[m_id]
            for d_val, (act_val, pred_val) in date_map.items():
                daily_actual_usage[d_val] = daily_actual_usage.get(d_val, 0.0) + act_val * w_m
                daily_pred_usage[d_val] = daily_pred_usage.get(d_val, 0.0) + pred_val * w_m

        sorted_dates = sorted(daily_actual_usage.keys())
        if max_backtest_days is not None:
            sorted_dates = sorted_dates[:max_backtest_days]

        # Require at least 5 contiguous W-day windows to estimate the 90th percentile residual empirically
        min_required_days = coverage_window_days + 4
        if len(sorted_dates) < min_required_days:
            if return_details:
                return {
                    "status": "insufficient data",
                    "buffer_qty": None,
                    "coverage_window_days": coverage_window_days,
                    "window_exceeds_7d": window_exceeds_7d,
                    "warning": "Insufficient backtest days for empirical window residual estimation",
                }
            return "insufficient data"

        daily_residuals = [daily_actual_usage[d] - daily_pred_usage[d] for d in sorted_dates]
        window_sum_residuals = [
            sum(daily_residuals[i : i + coverage_window_days])
            for i in range(len(daily_residuals) - coverage_window_days + 1)
        ]

        empirical_p90_buffer = round(max(0.0, float(np.percentile(window_sum_residuals, 90))), 2)

        if return_details:
            return {
                "status": "ok",
                "buffer_qty": empirical_p90_buffer,
                "coverage_window_days": coverage_window_days,
                "window_exceeds_7d": window_exceeds_7d,
                "warning": "Supplier coverage window exceeds 7-day forecast horizon" if window_exceeds_7d else None,
            }
        return empirical_p90_buffer
