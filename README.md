# ShelfSense

<img src="docs/logo.png" alt="ShelfSense logo" width="96" />

ShelfSense is a bilingual (Korean / English) back-of-house operations prototype built for an independent Korean restaurant, **서울 김치찌개집 (Seoul Kimchi Jjigae House)**. It handles daily demand forecasting, barcode and GS1 2D receiving, FEFO inventory tracking, supplier ordering, prep sheets, waste logging, and labor scheduling under Korean labor standards.

All data in this repository is deterministic synthetic demo data (`seed = 42`), anchored to a simulated clock of **Wednesday, 2026-11-04 09:00**.

## Features

- **Demand Forecasting**: Walk-forward 7-day forecast across 10 menu items and 2 dayparts using `HistGradientBoostingRegressor`, evaluated with an 8-fold rolling-origin backtest against 4-week moving-average baselines (9.97% holdout WAPE, 89.29% pooled P90 coverage).
- **Barcode & GS1 2D Receiving**: Browser camera and preset scanner (`@zxing/browser`) for EAN-13 and GS1 2D payloads (`AI 01` GTIN, `AI 17` 소비기한, `AI 10` batch), backed by a 3-tier product lookup (internal catalog, public food API fallback, and one-time registration) and incoming order discrepancy checks.
- **FEFO Inventory & Expiry Risk**: First-Expired, First-Out lot depletion, supplier coverage-window expiry-risk simulation (excluding lots that expire before use), and physical spot-count variance adjustments.
- **Human-in-the-Loop Ordering**: Pack-rounded order recommendations with price-surge and spend-cap checks. Supports Autonomy Level 1 (suggest) and Level 2 (one-tap approve); Level 3 (full auto-order) is permanently disabled so the owner approves every order.
- **Daily Prep & Waste**: Station-grouped prep sheet incorporating yield loss and earliest-expiring lot pull instructions, paired with FEFO-linked waste logging.
- **Korean Labor Scheduling**: Weekly schedule draft and slow-shift early-cut simulator checked against the 2026 statutory minimum wage (`₩10,320/hr`), mandatory rest breaks, weekly hour caps, 주휴수당 (`>= 15h/wk`), and 5+ employee overtime multipliers. All figures are scheduling estimates and do not execute payroll.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, `@zxing/browser`, `i18next`
- **Backend**: Python, FastAPI, SQLModel, SQLite, pandas, scikit-learn, `holidays`

## Getting Started

### Windows (PowerShell)

```powershell
# Set up Python virtual environment and install dependencies
.\run.ps1 setup

# Regenerate the deterministic SQLite database (seed=42)
.\run.ps1 seed

# Run backend pytest suite, frontend unit tests, and production build
.\run.ps1 test

# Start FastAPI (http://127.0.0.1:8000) and Vite (http://localhost:5173)
.\run.ps1 dev
```

### macOS / Linux

```bash
make setup
make seed
make test
make dev
```

## Project Structure

```text
backend/
  main.py                  # FastAPI application and static SPA server
  models.py                # SQLModel database schema
  seed.py                  # Deterministic synthetic data generator (seed=42)
  services/                # Forecasting, barcode parsing, FEFO inventory, ordering, labor
  scripts/                 # Build-time forecast cache and backtest report scripts
  tests/                   # Pytest unit and integration suite (40 tests)
frontend/
  src/components/          # 8 operational views and Vitest unit tests
  src/i18n/                # Korean and English locale dictionaries
  src/index.css            # Design tokens and component styles
docs/
  BACKTEST_REPORT.md       # 20-series rolling-origin backtest metrics
  STATUS.md                # Milestone verification log
```

## Deployment

The repository includes a multi-stage [`Dockerfile`](Dockerfile) and [`render.yaml`](render.yaml) that build the React frontend and serve it from FastAPI on a single origin. During the image build, `backend/scripts/precompute_forecast.py` precomputes the 7-day forecast cache so low-CPU instances can serve forecast requests immediately without training at runtime.

To run the production container locally:

```bash
docker build -t shelfsense .
docker run -p 7860:7860 shelfsense
```

Then open `http://localhost:7860`.

## Documentation

- [`DESIGN.md`](DESIGN.md): Visual system, typography, and layout rules
- [`AGENTS.md`](AGENTS.md): Domain constraints and test fixtures
- [`docs/BACKTEST_REPORT.md`](docs/BACKTEST_REPORT.md): Rolling-origin backtest evaluation
- [`docs/STATUS.md`](docs/STATUS.md): Test and audit summary
