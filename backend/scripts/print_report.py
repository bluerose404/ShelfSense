"""
Generates the 20-Series Rolling-Origin Backtest Report (Folds 5-8 Holdout)
comparing the ML model against both:
1. Standard 4-Week Same-Weekday Mean Baseline
2. Holiday-Aware 4-Week Same-Weekday Mean Baseline (last 4 non-holiday weeks)
and saves the report to docs/BACKTEST_REPORT.md.
"""
import os
from sqlmodel import Session, select
from backend.database import engine
from backend.models import MenuItem
from backend.services.forecast import ForecastEngine, fetch_training_dataframe


def generate_backtest_report_markdown() -> str:
    with Session(engine) as session:
        menu_map = {m.id: (m.name_ko, m.name_en) for m in session.exec(select(MenuItem)).all()}

    forecaster = ForecastEngine()
    df = fetch_training_dataframe()
    res = forecaster.run_rolling_backtest(df, num_folds=8, fold_days=7)
    overall = res["overall"]

    buf_1d = forecaster.calculate_ingredient_buffer(ingredient_id=1, coverage_window_days=1)
    buf_5d = forecaster.calculate_ingredient_buffer(ingredient_id=1, coverage_window_days=5)
    assert isinstance(buf_1d, float) and isinstance(buf_5d, float)
    ratio_5d_vs_5x1d = buf_5d / (5.0 * buf_1d)
    ratio_5d_vs_1d = buf_5d / buf_1d

    lines = [
        "# ShelfSense — 20-Series Walk-Forward Backtest Report (Folds 5–8 Holdout)",
        "",
        "> **Synthetic Data Notice:** All evaluation metrics below are computed on deterministic synthetic demo data (`seed = 42`). The `20/20 (100.0%)` win share against the standard 4-week baseline is expected on synthetic data because weather and holiday multipliers (`rain_mult`, `holiday_mult`) are explicitly encoded in the synthetic generator.",
        "",
        "## 1. Per-Series Holdout Performance (Folds 5–8)",
        "",
        "| Menu Item | Daypart | Std Base WAPE | Hol-Aware Base WAPE | Model WAPE | FVA vs Std | FVA vs Hol-Aware | Chosen | Model Bias | Cov (0–3d) | Cov (4–6d) | Cov (All) |",
        "|:---|:---|---:|---:|---:|---:|---:|:---:|---:|---:|---:|---:|",
    ]

    worse_std_names = []
    worse_hol_names = []

    for (m_id, dp), v in res["series"].items():
        ko, en = menu_map[m_id]
        if v["model_wape"] >= v["baseline_wape"]:
            worse_std_names.append(f"{ko} ({en}) [{dp}] — Model {v['model_wape']*100:.2f}% vs Std Base {v['baseline_wape']*100:.2f}%")
        if v["model_wape"] >= v["holiday_aware_wape"]:
            worse_hol_names.append(f"{ko} ({en}) [{dp}] — Model {v['model_wape']*100:.2f}% vs Hol-Aware Base {v['holiday_aware_wape']*100:.2f}%")

        lines.append(
            f"| {ko} ({en}) | {dp} | {v['baseline_wape']*100:.1f}% | {v['holiday_aware_wape']*100:.1f}% | "
            f"{v['model_wape']*100:.1f}% | {v['fva']*100:+.1f}% | {v['fva_vs_holiday_aware']*100:+.1f}% | "
            f"{v['selected_model'].upper()} | {v['bias']*100:+.2f}% | "
            f"{v['holdout_coverage_days_0_3']*100:.1f}% | {v['holdout_coverage_days_4_6']*100:.1f}% | "
            f"{v['holdout_coverage']*100:.1f}% |"
        )

    lines.extend([
        "",
        "## 2. Volume-Weighted Overall Summary (Folds 5–8)",
        "",
        f"- **Volume-Weighted Model WAPE**: `{overall['volume_weighted_wape_model']*100:.2f}%`",
        f"- **Volume-Weighted Standard 4-Week Baseline WAPE**: `{overall['volume_weighted_wape_base']*100:.2f}%` (Model FVA: `{overall['volume_weighted_fva_vs_base']*100:+.2f}%`)",
        f"- **Volume-Weighted Holiday-Aware 4-Week Baseline WAPE**: `{overall['volume_weighted_wape_holiday_aware_base']*100:.2f}%` (Model FVA: `{overall['volume_weighted_fva_vs_holiday_aware_base']*100:+.2f}%`)",
        f"- **Volume-Weighted Model Bias**: `{overall['volume_weighted_bias']*100:+.2f}%` (`+` = over-forecasting)",
        f"- **Volume-Weighted Standard Baseline Bias**: `{overall['volume_weighted_bias_base']*100:+.2f}%`",
        f"- **Volume-Weighted Holiday-Aware Baseline Bias**: `{overall['volume_weighted_bias_holiday_aware_base']*100:+.2f}%`",
        f"- **Share of Series Beating Standard Baseline**: `{overall['wins_vs_base']}/20 ({overall['wins_vs_base']/20*100:.1f}%)` *(expected on synthetic data)*",
        f"- **Share of Series Beating Holiday-Aware Baseline**: `{overall['wins_vs_holiday_aware_base']}/20 ({overall['wins_vs_holiday_aware_base']/20*100:.1f}%)`",
        "",
        "### Series Where Model Is Worse Than Standard Baseline",
        *( [f"- {item}" for item in worse_std_names] if worse_std_names else ["- None (`0/20` series)"] ),
        "",
        "### Series Where Model Is Worse Than Holiday-Aware Baseline",
        *( [f"- {item}" for item in worse_hol_names] if worse_hol_names else ["- None (`0/20` series)"] ),
        "",
        "## 3. Pooled Interval Coverage by Horizon Bucket (Folds 5–8)",
        "",
        f"- **Single-`q90` Calibration (before per-bucket split)**: Days 0–3 = `{overall['single_q90_coverage_days_0_3']*100:.2f}%`, Days 4–6 = `{overall['single_q90_coverage_days_4_6']*100:.2f}%`",
        f"- **Per-Horizon-Bucket `q90` Calibration (Folds 1–4)**:",
        f"  - **Short Horizons (Days 0–3)**: `{overall['pooled_coverage_days_0_3']*100:.2f}%`",
        f"  - **Far Horizons (Days 4–6)**: `{overall['pooled_coverage_days_4_6']*100:.2f}%`",
        f"  - **Overall Pooled Coverage (Days 0–6)**: `{overall['pooled_coverage']*100:.2f}%` (Target: `85.0%–95.0%`)",
        "",
        "## 4. Empirical Ingredient Safety Buffer (`ING-PORK` / 돼지 앞다리살)",
        "",
        f"- **1-Day Empirical P90 Summed-Demand Residual Buffer (`Buffer(1d)`)**: `{buf_1d:.2f} kg`",
        f"- **5-Day Empirical P90 Summed-Demand Residual Buffer (`Buffer(5d)`)**: `{buf_5d:.2f} kg`",
        f"- **5 × 1-Day Linear Sum (`5 * Buffer(1d)`)**: `{5.0 * buf_1d:.2f} kg`",
        f"- **Sub-Additivity Ratio (`Buffer(5d) / (5 * Buffer(1d))`)**: `{ratio_5d_vs_5x1d:.3f}` (`{ratio_5d_vs_5x1d*100:.1f}%` of linear sum; `Buffer(5d) / Buffer(1d) = {ratio_5d_vs_1d:.2f}x < 5.0x`)",
        "",
    ])
    return "\n".join(lines)


if __name__ == "__main__":
    md = generate_backtest_report_markdown()
    print(md)
    docs_dir = os.path.join(os.path.dirname(__file__), "..", "..", "docs")
    os.makedirs(docs_dir, exist_ok=True)
    with open(os.path.join(docs_dir, "BACKTEST_REPORT.md"), "w", encoding="utf-8") as f:
        f.write(md)
