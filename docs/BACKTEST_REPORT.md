# ShelfSense — 20-Series Walk-Forward Backtest Report (Folds 5–8 Holdout)

> **Synthetic Data Notice:** All evaluation metrics below are computed on deterministic synthetic demo data (`seed = 42`). The `20/20 (100.0%)` win share against the standard 4-week baseline is expected on synthetic data because weather and holiday multipliers (`rain_mult`, `holiday_mult`) are explicitly encoded in the synthetic generator.

## 1. Per-Series Holdout Performance (Folds 5–8)

| Menu Item | Daypart | Std Base WAPE | Hol-Aware Base WAPE | Model WAPE | FVA vs Std | FVA vs Hol-Aware | Chosen | Model Bias | Cov (0–3d) | Cov (4–6d) | Cov (All) |
|:---|:---|---:|---:|---:|---:|---:|:---:|---:|---:|---:|---:|
| 김치찌개 (Kimchi Jjigae) | dinner | 13.9% | 8.7% | 10.8% | +21.9% | -24.9% | ML | +3.65% | 87.5% | 83.3% | 85.7% |
| 김치찌개 (Kimchi Jjigae) | lunch | 11.7% | 8.4% | 7.9% | +32.5% | +6.5% | ML | +1.90% | 68.8% | 100.0% | 82.1% |
| 된장찌개 (Doenjang Jjigae) | dinner | 17.6% | 12.3% | 11.1% | +37.1% | +10.3% | ML | +3.36% | 87.5% | 100.0% | 92.9% |
| 된장찌개 (Doenjang Jjigae) | lunch | 14.8% | 10.6% | 8.2% | +45.1% | +23.3% | ML | +0.28% | 81.2% | 100.0% | 89.3% |
| 순두부찌개 (Soft Tofu Stew) | dinner | 15.7% | 11.0% | 9.4% | +39.8% | +14.3% | ML | +0.57% | 81.2% | 100.0% | 89.3% |
| 순두부찌개 (Soft Tofu Stew) | lunch | 14.9% | 9.6% | 7.1% | +52.1% | +25.8% | ML | +1.56% | 93.8% | 91.7% | 92.9% |
| 제육볶음 (Spicy Pork Stir-fry) | dinner | 16.0% | 11.4% | 11.7% | +27.0% | -2.0% | ML | +5.90% | 100.0% | 91.7% | 96.4% |
| 제육볶음 (Spicy Pork Stir-fry) | lunch | 15.7% | 8.6% | 8.8% | +44.1% | -2.3% | ML | +4.02% | 100.0% | 100.0% | 100.0% |
| 불고기 정식 (Bulgogi Set) | dinner | 15.1% | 10.5% | 10.7% | +29.5% | -1.6% | ML | +5.26% | 81.2% | 100.0% | 89.3% |
| 불고기 정식 (Bulgogi Set) | lunch | 17.1% | 12.9% | 11.0% | +35.4% | +14.6% | ML | +2.87% | 87.5% | 75.0% | 82.1% |
| 계란말이 (Rolled Omelet) | dinner | 15.9% | 13.5% | 12.5% | +21.0% | +7.0% | ML | +1.76% | 75.0% | 91.7% | 82.1% |
| 계란말이 (Rolled Omelet) | lunch | 14.6% | 10.6% | 10.3% | +29.3% | +2.6% | ML | +1.21% | 81.2% | 100.0% | 89.3% |
| 비빔밥 (Bibimbap) | dinner | 16.1% | 11.1% | 10.5% | +34.6% | +5.0% | ML | +1.69% | 62.5% | 100.0% | 78.6% |
| 비빔밥 (Bibimbap) | lunch | 16.8% | 11.8% | 11.6% | +31.0% | +1.9% | ML | +4.49% | 93.8% | 91.7% | 92.9% |
| 김치볶음밥 (Kimchi Fried Rice) | dinner | 17.9% | 11.7% | 11.8% | +34.4% | -0.2% | ML | +6.79% | 93.8% | 83.3% | 89.3% |
| 김치볶음밥 (Kimchi Fried Rice) | lunch | 15.1% | 9.6% | 8.7% | +42.3% | +9.1% | ML | +3.02% | 93.8% | 83.3% | 89.3% |
| 고등어구이 (Grilled Mackerel) | dinner | 14.8% | 9.9% | 8.9% | +39.3% | +9.8% | ML | +1.75% | 87.5% | 91.7% | 89.3% |
| 고등어구이 (Grilled Mackerel) | lunch | 12.7% | 9.6% | 6.2% | +51.2% | +35.3% | ML | +1.96% | 100.0% | 91.7% | 96.4% |
| 오징어볶음 (Spicy Squid Stir-fry) | dinner | 16.4% | 11.6% | 11.1% | +32.7% | +4.8% | ML | +0.41% | 87.5% | 91.7% | 89.3% |
| 오징어볶음 (Spicy Squid Stir-fry) | lunch | 16.8% | 12.0% | 10.5% | +37.4% | +12.6% | ML | +4.25% | 87.5% | 91.7% | 89.3% |

## 2. Volume-Weighted Overall Summary (Folds 5–8)

- **Volume-Weighted Model WAPE**: `9.97%`
- **Volume-Weighted Standard 4-Week Baseline WAPE**: `15.28%` (Model FVA: `+34.78%`)
- **Volume-Weighted Holiday-Aware 4-Week Baseline WAPE**: `10.54%` (Model FVA: `+5.47%`)
- **Volume-Weighted Model Bias**: `+2.92%` (`+` = over-forecasting)
- **Volume-Weighted Standard Baseline Bias**: `+8.26%`
- **Volume-Weighted Holiday-Aware Baseline Bias**: `+1.07%`
- **Share of Series Beating Standard Baseline**: `20/20 (100.0%)` *(expected on synthetic data)*
- **Share of Series Beating Holiday-Aware Baseline**: `15/20 (75.0%)`

### Series Where Model Is Worse Than Standard Baseline
- None (`0/20` series)

### Series Where Model Is Worse Than Holiday-Aware Baseline
- 김치찌개 (Kimchi Jjigae) [dinner] — Model 10.85% vs Hol-Aware Base 8.69%
- 제육볶음 (Spicy Pork Stir-fry) [dinner] — Model 11.67% vs Hol-Aware Base 11.44%
- 제육볶음 (Spicy Pork Stir-fry) [lunch] — Model 8.78% vs Hol-Aware Base 8.58%
- 불고기 정식 (Bulgogi Set) [dinner] — Model 10.66% vs Hol-Aware Base 10.49%
- 김치볶음밥 (Kimchi Fried Rice) [dinner] — Model 11.76% vs Hol-Aware Base 11.74%

## 3. Pooled Interval Coverage by Horizon Bucket (Folds 5–8)

- **Single-`q90` Calibration (before per-bucket split)**: Days 0–3 = `86.88%`, Days 4–6 = `85.00%`
- **Per-Horizon-Bucket `q90` Calibration (Folds 1–4)**:
  - **Short Horizons (Days 0–3)**: `86.56%`
  - **Far Horizons (Days 4–6)**: `92.92%`
  - **Overall Pooled Coverage (Days 0–6)**: `89.29%` (Target: `85.0%–95.0%`)

## 4. Empirical Ingredient Safety Buffer (`ING-PORK` / 돼지 앞다리살)

- **1-Day Empirical P90 Summed-Demand Residual Buffer (`Buffer(1d)`)**: `1.32 kg`
- **5-Day Empirical P90 Summed-Demand Residual Buffer (`Buffer(5d)`)**: `3.63 kg`
- **5 × 1-Day Linear Sum (`5 * Buffer(1d)`)**: `6.60 kg`
- **Sub-Additivity Ratio (`Buffer(5d) / (5 * Buffer(1d))`)**: `0.550` (`55.0%` of linear sum; `Buffer(5d) / Buffer(1d) = 2.75x < 5.0x`)
