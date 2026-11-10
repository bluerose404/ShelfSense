# AGENTS.md — ShelfSense Architecture, Rules & Fixtures

## 1. Project Overview
**ShelfSense** is a bilingual (English / Korean) prototype of an autonomous back-of-house assistant for a fictional Korean restaurant, **"서울 김치찌개집" (Seoul Kimchi Jjigae House)**.
- **Synthetic Data Only**: All sales, weather, inventory lots, purchases, waste logs, and staff schedules are 100% synthetic and deterministic (`seed = 42`).
- **Simulated Demo Clock**: Wednesday `2026-11-04 09:00:00`.

---

## 2. Tech Stack & Commands
- **Frontend**: Vite + React 19 + TypeScript + Tailwind CSS v4 + Recharts + `@zxing/browser` (barcode/QR scanning) + `i18next` / `react-i18next` (EN/KO).
- **Backend**: FastAPI + SQLModel + SQLite (`backend/shelfsense.db`), `pandas`, `scikit-learn` (`HistGradientBoostingRegressor`), `python-holidays` (`holidays.KR`).
- **Windows CLI Commands** (run from `e:\ShelfSense\ShelfSense`):
  - `.\run.ps1 test` — Runs backend `pytest` suite and frontend `npm run build` (`tsc -b && vite build`).
  - `.\run.ps1 dev` — Starts FastAPI backend on `http://127.0.0.1:8000` and Vite dev server on `http://localhost:5173`.
  - `.\run.ps1 seed` — Regenerates the deterministic synthetic SQLite database (`seed=42`).

---

## 3. Milestones Roadmap (M1–M7)
- **M1**: Skeleton, SQLModel schema, deterministic seed data (`seed=42`), bilingual i18n shell.
- **M2**: Demand forecast engine, 8-fold rolling-origin backtest, sales CSV integrity checker, forecast screen (`ForecastView`).
- **M3**: Barcode scan flow (`@zxing/browser`, EAN-13 & GS1 2D DataMatrix/QR), product lookup adapter (internal DB -> public API mock -> one-time registration), receiving order match, stock table.
- **M4**: FEFO (First-Expired, First-Out) lot depletion, expiry-risk simulation across supplier windows, spot count adjustment.
- **M5**: Order recommendations with full lifecycle (`proposed -> approved/edited -> incoming -> received | rejected`), daily prep sheet.
- **M6**: Waste log, labor schedule draft with Korean Labor Standards Act checks, early-cut simulator.
- **M7**: Morning summary dashboard, settings & audit log viewer, documentation, end-to-end verification.

---

## 4. Non-Negotiable Domain & Engineering Rules
1. **Human-in-the-Loop Autonomy**:
   - Owner approves everything. Only **Autonomy Level 1** (Suggest) and **Level 2** (One-tap approve) are selectable; **Level 3** (Full auto-order) must be shown **disabled** in the UI.
2. **Labor & Payroll**:
   - No real payroll execution. All labor figures are scheduling estimates and must display an explicit disclaimer.
   - Korean labor checks: 2026 minimum wage (`₩10,320/hr`), break rules (4h -> 30m, 8h -> 1h), weekly hours cap, 주휴수당 (weekly holiday allowance threshold at 15h/wk), and 5+ employee overtime/night/holiday multipliers (toggleable in Settings).
3. **Terminology & Badges**:
   - Always use **소비기한** (Use-by / Expiry Date), never 유통기한.
   - Display the **"Demo data" / "데모 데이터"** badge visibly on every screen.
4. **Forecasting & Data Integrity Rules**:
   - Never change the synthetic data generator to artificially improve model metrics.
   - Set `OMP_NUM_THREADS=1` (and related BLAS thread env vars) before importing NumPy/SciPy/scikit-learn so predictions are deterministic within `1e-9`.
   - All lag and rolling features (`lag_7`, `lag_14`, `four_week_mean`, `trailing_delivery_share`) must be strictly anchored to `origin_date` with zero future leakage.
   - Training rows must be built from past origins using horizon-matched weather (noisy forecast for days 0–3; seasonal climatology with non-zero average rain for days 4–6).
   - The 3 seeded gap dates (`2026-03-15`, `2026-06-22`, `2026-09-08`) must be excluded from training and rolling means, never zero-filled.
   - Upper bound quantile is calibrated on backtest folds 1–4; pooled coverage on holdout folds 5–8 across all 20 item-daypart series must fall within **85%–95%**.
   - Ingredient safety buffer is computed from residuals of summed demand over the supplier coverage window (sub-additive across days) and flags windows > 7 days.
   - Forecast chart stacks `median + (upper - median)` with no double counting.

---

## 5. Required Pure-Function Test Fixtures
Tests for ordering and labor must call pure functions with these exact fixed inputs and verify the exact outputs:

1. **Ordering & FEFO Expiry-Risk Fixture (Pork Shoulder / 돼지 앞다리살)**:
   - **Demand**: `270 portions` × `80 g (0.080 kg)` = **`21.6 kg`**
   - **Safety Buffer (10%)**: **`2.16 kg`** (Gross requirement = `21.6 + 2.16 = 23.76 kg`)
   - **Inventory Lots**:
     - **Lot A**: `4.0 kg` expires before the use window -> **excluded / at-risk** (`0.0 kg` usable towards net order)
     - **Lot B**: `2.0 kg` expires within/after use window -> **usable** (`2.0 kg`)
   - **Net Need**: `21.6 + 2.16 - 2.0` = **`21.76 kg`**
   - **Rounded Order (`5 kg` packs)**: **`25.0 kg`** (`5 packs`)

2. **Labor Budget & Peak Staffing Fixture**:
   - **Projected Sales**: `₩4,000,000`
   - **Target Labor % (`30%`)**: Budget = **`₩1,200,000`**
   - **Draft Schedule**: `92 hours` × `₩12,000/hr` = **`₩1,104,000`** = **`27.6%`** of sales (within budget)
   - **Peak Front-of-House Staffing**: `48 covers/hour` at `14 covers per staff` -> `ceil(48 / 14)` = **`4 front staff`**

3. **Hourly Dinner Profile Fixture (90-Minute Bin Division)**:
   - Dinner shares: `17:00–18:00` (`15%`, 1.0h -> `15%/hr`), `18:00–19:30` (`45%`, 1.5h -> **`30%/hr`**), `19:30–21:00` (`30%`, 1.5h -> **`20%/hr`**), `21:00–22:00` (`10%`, 1.0h -> `10%/hr`).
