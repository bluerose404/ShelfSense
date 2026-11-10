---
title: ShelfSense
emoji: 🍲
colorFrom: red
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
short_description: Bilingual EN/KO back-of-house assistant (synthetic demo)
---

# ShelfSense (쉘프센스) — Autonomous Back-of-House Assistant Prototype

> **Bilingual (Korean / English) Back-of-House Operations Prototype for "서울 김치찌개집" (Seoul Kimchi Jjigae House)**  
> **Synthetic Demo Data Only (`seed = 42`) · Simulated Demo Clock: Wednesday `2026-11-04 09:00:00`**

---

## 1. Overview
**ShelfSense** is a bilingual (한국어 / English) decision-support prototype designed for independent Korean restaurants. It unifies:
1. **M1 — Deterministic Synthetic Data & Schema**: 12 months (`2025-11-04` to `2026-11-03`) of weather- and holiday-driven sales across 10 dishes (9 main dishes, 1 side dish `계란말이`), 18 ingredients, 40 EAN-13 packaged products, weekly inventory snapshots with strict week-to-week continuity and $\le 5\%$ reconciliation, and isolated RNG streams per table.
2. **M2 — Walk-Forward Demand Forecasting Engine**: 8-fold rolling-origin backtest (`HistGradientBoostingRegressor` vs. Standard 4-Week & Holiday-Aware 4-Week baselines) with origin-anchored lags, horizon-matched weather (`h = 0..3` noisy forecast, `h = 4..6` seasonal climatology), per-horizon-bucket P90 calibration (`89.29%` pooled holdout coverage), and empirical summed-residual ingredient buffers.
3. **M3 — Barcode & GS1 2D Scan Receiving**: `@zxing/browser` live camera/preset scanner for EAN-13 and GS1 2D (`AI (01)` GTIN, `AI (17)` **소비기한**, `AI (10)` Batch), 3-tier product lookup (`Internal DB -> Public Food API Mock -> One-Time Registration`), incoming order receiving match with discrepancy detection, and FEFO stock table.
4. **M4 — FEFO Depletion, Supplier-Window Expiry-Risk & Spot Count**: Pure FEFO lot depletion, supplier coverage window expiry-risk simulation (excluding lots expiring before use window ends), and physical spot-count variance adjustment with `StockSnapshot` and `AuditLog`.
5. **M5 — Human-in-the-Loop Order Lifecycle & Daily Prep Sheet**: Full order lifecycle (`proposed -> approved | edited -> incoming -> received | rejected`), Autonomy Levels 1–2 (with Level 3 permanently disabled), price surge (`+12%`) & spend cap alerts, and station-grouped Daily Kitchen Prep Sheet with FEFO first-lot pull instructions.
6. **M6 — Waste Analytics, Korean Labor Standards Act Draft & Early-Cut Simulator**: FEFO-linked waste logging, weekly labor schedule draft checked against 2026 minimum wage (`₩10,320/hr`), statutory rest breaks (`4h -> 30m`, `8h -> 1h`), weekly hours caps, **주휴수당** (`>= 15h/wk`), and 5+ employee `1.5x` multipliers (with explicit non-payroll disclaimer), plus a slow-shift Early-Cut Simulator.
7. **M7 — Executive Morning Summary, Settings & Immutable Audit Log**: Unified morning brief dashboard (`Prime Cost 58.8%`, urgent **소비기한** alerts, one-tap order approval, prep & labor snapshot), guardrails configuration, and immutable `AuditLog` viewer.

---

## 2. Quick Start (Windows PowerShell)

Run all commands from the project root (`e:\ShelfSense\ShelfSense`):

```powershell
# 1. Create clean Python venv and install pinned backend + frontend dependencies
.\run.ps1 setup

# 2. Regenerate the deterministic synthetic SQLite database (seed=42)
.\run.ps1 seed

# 3. Run full test & build suite (Backend pytest + Frontend Vitest + TypeScript/Vite build)
.\run.ps1 test

# 4. Launch FastAPI backend (http://127.0.0.1:8000) and Vite frontend (http://localhost:5173)
.\run.ps1 dev
```

---

## 3. Key Verification Benchmarks & Canonical Fixtures

| Benchmark / Fixture | Verified Result | Test File |
| :--- | :--- | :--- |
| **Holdout Forecast Accuracy (Folds 5–8, 20 Series)** | Model WAPE **`9.97%`** vs. Standard Baseline `15.28%` (FVA `+34.78%`, `20/20` synthetic win share) and Holiday-Aware Baseline `10.54%` (FVA `+5.47%`, `15/20` win share); Model Bias **`+2.92%`** | [`test_forecast_evaluation.py`](file:///e:/ShelfSense/ShelfSense/backend/tests/test_forecast_evaluation.py) |
| **Pooled Upper-Bound (P90) Coverage (Folds 5–8)** | Days 0–3: **`86.56%`** · Days 4–6: **`92.92%`** · Overall Pooled: **`89.29%`** (Target `85%–95%`) | [`test_forecast_evaluation.py`](file:///e:/ShelfSense/ShelfSense/backend/tests/test_forecast_evaluation.py) |
| **Zero Future Leakage & Determinism** | `OMP_NUM_THREADS=1` + `threadpool_limits(1)`; retraining after perturbing future sales/deliveries matches within **`< 1e-9`** | [`test_forecast_leakage.py`](file:///e:/ShelfSense/ShelfSense/backend/tests/test_forecast_leakage.py) |
| **Empirical Summed-Residual Buffer (`ING-PORK`)** | `Buffer(1d) = 1.32 kg`, `Buffer(5d) = 3.63 kg`, `5 × Buffer(1d) = 6.60 kg` (Ratio **`0.550`**, strictly sub-additive) | [`test_forecast_evaluation.py`](file:///e:/ShelfSense/ShelfSense/backend/tests/test_forecast_evaluation.py) |
| **Pork Shoulder Expiry-Risk & Order Fixture** | `270 × 0.080 kg = 21.6 kg` demand + `2.16 kg` (10%) buffer - `2.0 kg` Lot B usable (`4.0 kg` Lot A excluded as at-risk) = `21.76 kg` net -> **`25.0 kg` (`5 × 5 kg` packs)** | [`test_inventory_m4.py`](file:///e:/ShelfSense/ShelfSense/backend/tests/test_inventory_m4.py) |
| **Labor Budget & Peak Staffing Fixture** | `₩4,000,000` sales × `30%` = **`₩1,200,000`** budget; `92h × ₩12,000` = **`₩1,104,000` (`27.6%`)**; `48 covers/hr ÷ 14` = **`4 front staff`** | [`test_waste_labor_m6.py`](file:///e:/ShelfSense/ShelfSense/backend/tests/test_waste_labor_m6.py) |

---

## 4. Documentation Index
- [`AGENTS.md`](file:///e:/ShelfSense/ShelfSense/AGENTS.md) — Architecture, non-negotiable domain rules, and required fixtures.
- [`docs/STATUS.md`](file:///e:/ShelfSense/ShelfSense/docs/STATUS.md) — Milestone M1–M7 inventory and Pre-M3 Audit checklist evidence.
- [`docs/BACKTEST_REPORT.md`](file:///e:/ShelfSense/ShelfSense/docs/BACKTEST_REPORT.md) — Full 20-series rolling-origin backtest evaluation report.
- [`docs/forecast_chart.png`](file:///e:/ShelfSense/ShelfSense/docs/forecast_chart.png) — Screenshot of the live running application showing the non-double-counted stacked 7-day forecast chart.


---

## Deployment (Hugging Face Spaces — Docker)

The repo ships a single-container [`Dockerfile`](Dockerfile): it builds the React frontend and serves it from FastAPI on port `7860`, so the UI and `/api/*` share one origin.

1. Create a Space at https://huggingface.co/new-space → **SDK: Docker** → **Blank**.
2. Push this repo to the Space:
   ```bash
   git remote add space https://huggingface.co/spaces/<your-username>/ShelfSense
   git push space main
   ```
   (Use a Hugging Face access token with **write** permission as the password.)
3. The Space builds automatically and is served at `https://<your-username>-shelfsense.hf.space`.

Notes:
- The YAML header at the top of this README is the Spaces config (`sdk: docker`, `app_port: 7860`).
- The forecast is pre-trained in a background thread at startup (`SHELFSENSE_WARMUP=1`); the Forecast tab is ready ~1–2 minutes after boot.
- Free Spaces storage is ephemeral: the SQLite DB resets to the deterministic `seed=42` demo state on every restart.
- Local Docker test: `docker build -t shelfsense . && docker run -p 7860:7860 shelfsense` → http://localhost:7860
