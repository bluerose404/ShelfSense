# ShelfSense — Project Status & Pre-M3 Audit Report

**Last Updated:** 2026-11-10  
**Simulated Demo Clock:** Wednesday, `2026-11-04 09:00:00`  
**Restaurant Profile:** 서울 김치찌개집 (Seoul Kimchi Jjigae House) — Synthetic Demo Data Only

---

## 1. Milestone Inventory

> **Workspace Note:** The project root is located at `e:\ShelfSense\ShelfSense` (nested one directory inside `e:\ShelfSense`).

| Milestone | Scope | Current Status | Existing Files |
| :--- | :--- | :--- | :--- |
| **M1** | Skeleton, models, seed data, i18n shell | **Complete** (Step 0 & Step 1 / Audit #6 verified) | `backend/database.py`, `backend/models.py`, `backend/seed.py`, `backend/shelfsense.db`, `frontend/src/App.tsx`, `frontend/src/i18n/index.ts`, `frontend/src/i18n/locales/{en,ko}.json`, `backend/tests/test_seed.py`, `backend/tests/test_seed_rigor.py`, `backend/tests/test_reconciliation.py`, `run.ps1`, `Makefile`, `.gitignore` |
| **M2** | Forecast engine, backtest, sales CSV checker, forecast screen | **Complete** (All 8 Pre-M3 Audit items verified DONE) | `backend/services/forecast.py`, `backend/services/weather.py`, `backend/services/sales_importer.py`, `backend/scripts/print_report.py`, `docs/BACKTEST_REPORT.md`, `docs/forecast_chart.png`, `frontend/src/components/ForecastView.tsx`, `frontend/src/components/ForecastView.test.ts`, `backend/tests/test_forecast.py`, `backend/tests/test_forecast_evaluation.py`, `backend/tests/test_forecast_leakage.py` |
| **M3** | Scan flow, product lookup adapter, receiving match, stock table | **Backend Partially Scaffolded / Frontend Not Started** | `backend/services/barcodes.py`, `backend/services/product_lookup.py`, `/api/scan/*` routes in `backend/main.py`, `backend/tests/test_barcodes.py` |
| **M4** | FEFO depletion, expiry-risk simulation, spot count | **Not Started** (models only) | `Lot` & `StockSnapshot` models in `backend/models.py` |
| **M5** | Order recommendations with lifecycle, prep sheet | **Not Started** (models only) | `OrderRecommendation` & `RecipeItem` models in `backend/models.py` |
| **M6** | Waste log, labor draft with Korean rule checks, early-cut simulator | **Not Started** (models only) | `WasteLog`, `StaffMember`, `ShiftRecord` models in `backend/models.py` |
| **M7** | Morning summary, settings, docs, end-to-end test | **Not Started** (models only) | `SystemSetting` & `AuditLog` models in `backend/models.py` |

---

## 2. Pre-M3 Audit Checklist (All 8 Items DONE)

| # | Audit Requirement | Status | Evidence (Files & Tests) | Verification Summary |
| :-: | :--- | :---: | :--- | :--- |
| **1** | **Leakage test**: retrains the model on a dataset where sales and delivery portions on/after the forecast origin are perturbed; predictions match within `1e-9`; thread count is 1 (`OMP_NUM_THREADS` set before imports, verified). | **DONE** | `run.ps1`, `backend/tests/conftest.py`, `backend/services/forecast.py` (`threadpool_limits(limits=1)`), `backend/tests/test_forecast_leakage.py` (`test_single_thread_environment_and_threadpool_limits_verified`, `test_forecast_future_leakage_perturbation_with_retraining` — PASSED) | Thread count = 1 verified at runtime; retraining after perturbing sales (`+500`) and delivery (`+250`) on/after `origin_date` matches within `< 1e-9`. |
| **2** | **Origin-anchored features & horizon-matched weather**: all history features (`lag_7`, `lag_14`, `four_week_mean`, `trailing_delivery_share`) anchored to forecast origin; training rows built from many past origins with horizon-matched weather (noisy forecast-like weather for days 0–3, seasonal climatology incl. average rain for later days). | **DONE** | `backend/services/forecast.py` (`compute_origin_features_for_target`, `get_horizon_matched_weather`, `build_training_features_up_to_origin`, `generate_7day_forecast`), `backend/tests/test_forecast_leakage.py::test_training_rows_multi_origin_and_horizon_matched_weather` (PASSED) | Training dataset spans horizons $h \in \{0,\dots,6\}$ across past origins with zero target-date lag leakage and horizon-matched weather. |
| **3** | **Gap dates excluded**: the 3 seeded gap dates (`2026-03-15`, `2026-06-22`, `2026-09-08`) are excluded from training and rolling means, never zero-filled. | **DONE** | `backend/services/forecast.py` (`GAP_DATES`, `fetch_training_dataframe`), `backend/tests/test_forecast_evaluation.py::test_gap_days_excluded_not_zero_filled` (PASSED), `backend/tests/test_seed_rigor.py::test_seed_gap_dates_count` (PASSED) | Gap dates are absent from `DailySale` and omitted from rolling windows rather than coerced to `0`. |
| **4** | **Upper bound calibration & pooled coverage**: upper bound calibrated on backtest folds 1–4; pooled coverage on folds 5–8 across all 20 item-daypart series is between 85% and 95%. | **DONE** | `backend/services/forecast.py` (`run_rolling_backtest` — per-horizon-bucket `q90_short` on days 0–3 and `q90_far` on days 4–6 calibrated on folds 1–4), `backend/tests/test_forecast_evaluation.py::test_rolling_backtest_pooled_coverage_and_20series_metrics` (PASSED) | Folds 5–8 coverage: **Days 0–3 = `86.56%`**, **Days 4–6 = `92.92%`**, **Overall Pooled = `89.29%`** (all within `[85%, 95%]`, no global scaling fudge). |
| **5** | **Ingredient buffer**: computed from residuals of summed demand over the supplier window; sub-additivity test; flag windows over 7 days. | **DONE** | `backend/services/forecast.py` (`calculate_ingredient_buffer`), `backend/tests/test_forecast_evaluation.py::test_buffer_sub_additivity_and_flags` (PASSED) | Empirical summed residuals (no $\sqrt{W}$ fallback): `ING-PORK` 1d = `1.32 kg`, 5d = `3.63 kg`, `5x1d` = `6.60 kg` (`5d / 5x1d = 0.550`); windows $>7$d flagged; short backtest returns `"insufficient data"`. |
| **6** | **Seed rigor & reconciliation**: separate RNG streams per table; sales table checksum locked (`"current"` baseline); purchases, weekly stock snapshots (with continuity & no negative stock) and waste logs reconcile within 5% of `(beginning stock + purchases)` per ingredient-week, with a negative test that fails when a week of purchases is removed; honest dish tags (9 main, 1 side); 3 GS1 2D payloads; 2 unknown barcodes; demo clock = Wednesday `2026-11-04 09:00`. | **DONE** | `backend/seed.py`, `backend/tests/test_seed_rigor.py`, `backend/tests/test_reconciliation.py` (all PASSED) | Separate RNG streams (`rng_weather`, `rng_sales`, `rng_purchases`, `rng_snapshots`, `rng_waste`); `"current"` checksum `01b22be2...`; 918 ingredient-weeks reconcile $\le 5\%$; negative test fails at `76.5%`. |
| **7** | **20-series backtest report**: baseline WAPE, model WAPE, FVA, chosen model (folds 5–8); volume-weighted overall WAPE and bias; share of series where model beats baseline; list any series where it is worse. Never change data generator to improve results. | **DONE** | `backend/scripts/print_report.py`, `docs/BACKTEST_REPORT.md`, `backend/tests/test_forecast_evaluation.py` (PASSED) | Full 20-series table generated in `docs/BACKTEST_REPORT.md` vs. both Standard 4-Week Baseline (`15.28%` WAPE, `20/20` win share labeled as expected on synthetic data) and Holiday-Aware 4-Week Baseline (`10.54%` WAPE, `15/20` win share, 5 worse series listed). |
| **8** | **Forecast chart**: stacks `median + (upper - median)`, with no double counting; a screenshot is saved in `docs/`. | **DONE** | `frontend/src/components/ForecastView.tsx` (`aggregateDailyForecastTotals`), `frontend/src/components/ForecastView.test.ts` (Vitest — PASSED), `backend/tests/test_forecast_evaluation.py::test_rolling_backtest_pooled_coverage_and_20series_metrics` (PASSED), `docs/forecast_chart.png` | `upperDelta = max(0, upperTotal - medianCovers)` verified in Vitest (`medianCovers + upperDelta === upperTotal`); `upper >= median` asserted in API; live app screenshot saved to `docs/forecast_chart.png`. |

---

## 3. Backtest Evaluation, Horizon Coverage & Baseline Comparison Summary

### Bias Sign Convention
$$\text{Bias} = \frac{\sum (\text{preds} - \text{actuals})}{\sum \text{actuals}}$$
- **Positive (`+`)**: Over-forecasting ($\text{preds} > \text{actuals}$).
- **Negative (`-`)**: Under-forecasting ($\text{preds} < \text{actuals}$).

### Overall Holdout Metrics (Folds 5–8, Seed Checksum `01b22be2`)
| Metric | ML Model (`HistGradientBoosting`) | Standard 4-Week Baseline | Holiday-Aware 4-Week Baseline |
| :--- | :---: | :---: | :---: |
| **Folds 5–8 Volume-Weighted WAPE** | **`9.97%`** | `15.28%` | `10.54%` |
| **Folds 5–8 Volume-Weighted Bias** | **`+2.92%`** | `+8.26%` | `+1.07%` |
| **Folds 1–4 Volume-Weighted Bias** | **`+0.11%`** | `-4.06%` | `+1.19%` |
| **Model FVA vs. Baseline (Folds 5–8)** | — | **`+34.78%`** | **`+5.47%`** |
| **Model Win Share (Folds 5–8)** | — | **`20/20 (100.0%)`** *(synthetic data)* | **`15/20 (75.0%)`** |
| **Series Worse Than Baseline** | — | `None (0 series)` | `5 series` (`MENU-KIMCHI-JJIGAE/dinner`, `MENU-JEYUK/dinner`, `MENU-JEYUK/lunch`, `MENU-BULGOGI/dinner`, `MENU-KIMCHI-FRIED-RICE/dinner`) |

### Pooled Upper-Bound Coverage by Horizon Bucket (Folds 5–8)
| Horizon Bucket | Single `q90` Coverage | Per-Horizon-Bucket `q90` Coverage (`q90_short` / `q90_far` calibrated on Folds 1–4) | Target Range |
| :--- | :---: | :---: | :---: |
| **Days 0–3 (Noisy Forecast Weather)** | `86.88%` (`278 / 320`) | **`86.56%`** (`277 / 320`) | `85.0% – 95.0%` |
| **Days 4–6 (Seasonal Climatology Weather)** | `85.00%` (`204 / 240`) | **`92.92%`** (`223 / 240`) | `85.0% – 95.0%` |
| **All Horizons Pooled (Days 0–6)** | `86.07%` (`482 / 560`) | **`89.29%`** (`500 / 560`) | `85.0% – 95.0%` |

### Empirical Ingredient Safety Buffer (`ING-PORK` / 돼지 앞다리살)
- **1-Day Buffer (`W = 1`)**: `1.32 kg`
- **5-Day Buffer (`W = 5`)**: `3.63 kg`
- **Linear Sum (`5 × Buffer(1d)`)**: `6.60 kg`
- **Sub-Additivity Ratio (`Buffer(5d) / (5 × Buffer(1d))`)**: **`0.550`** (`55.0%` of linear sum; `2.75x < 5.0x`)
