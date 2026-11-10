"""
Tests for Milestone 2:
- Rolling-origin walk-forward backtest structure and metric bounds verification
- WAPE & Bias calculation check
- Sales CSV import checker test (identifies gaps, duplicates, unknown items)
"""
import numpy as np
from backend.services.forecast import (
    calculate_wape, calculate_bias, ForecastEngine, fetch_training_dataframe
)
from backend.services.sales_importer import check_sales_csv_data


def test_wape_bias_metrics():
    actuals = np.array([100.0, 150.0, 200.0])
    preds = np.array([110.0, 140.0, 190.0])
    # abs diff: 10 + 10 + 10 = 30. sum actuals = 450. WAPE = 30 / 450 = 0.06666...
    wape = calculate_wape(actuals, preds)
    assert round(wape, 4) == 0.0667

    # bias: (110 - 100) + (140 - 150) + (190 - 200) = 10 - 10 - 10 = -10 / 450 = -0.0222...
    bias = calculate_bias(actuals, preds)
    assert round(bias, 4) == -0.0222


def test_rolling_backtest_structure_and_metrics():
    engine = ForecastEngine()
    df = fetch_training_dataframe()
    assert not df.empty

    # Run rolling backtest
    results = engine.run_rolling_backtest(df, num_folds=8, fold_days=7)
    assert "series" in results
    assert "overall" in results
    assert len(results["series"]) == 20

    # Ensure all 20 series received valid backtest metrics
    for key, res in results["series"].items():
        assert "selected_model" in res
        assert res["selected_model"] in ["ml", "baseline"]
        assert 0.0 <= res["baseline_wape"] <= 1.0
        assert 0.0 <= res["model_wape"] <= 1.0
        assert "q90_buffer" in res
        assert res["q90_buffer"] >= 0.0


def test_sales_csv_import_checker():
    # Test CSV with an unknown menu item, duplicate row, negative qty, and a gap
    csv_data = """date,daypart,menu_code,portions_sold,portions_dine_in,portions_delivery,revenue_krw
2026-10-01,lunch,MENU-KIMCHI-JJIGAE,40,30,10,360000
2026-10-01,lunch,MENU-KIMCHI-JJIGAE,40,30,10,360000
2026-10-02,lunch,UNKNOWN-PIZZA,10,10,0,100000
2026-10-02,dinner,MENU-KIMCHI-JJIGAE,-5,0,0,-45000
2026-10-05,lunch,MENU-KIMCHI-JJIGAE,35,25,10,315000
""".encode("utf-8")

    report = check_sales_csv_data(csv_data)
    assert not report["valid"]  # has negative quantity error
    assert any("negative" in err for err in report["errors"])
    assert any("Unknown menu items" in warn for warn in report["warnings"])
    assert any("duplicate" in warn for warn in report["warnings"])
    assert any("gap" in warn for warn in report["warnings"])
