"""Precompute the /api/forecast/7day payload to a JSON file.

Run at Docker build time so low-CPU hosts (e.g. Render free tier) never have to
train the 20-series HistGradientBoosting backtest at runtime. The model, data and
seed are unchanged; this only caches the deterministic output.

Usage (from repo root):
    python -m backend.scripts.precompute_forecast [output_path]
"""
import os

# Deterministic single-threaded BLAS/OpenMP (AGENTS.md) before importing NumPy/sklearn.
for _var in (
    "OMP_NUM_THREADS",
    "OPENBLAS_NUM_THREADS",
    "MKL_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS",
    "NUMEXPR_NUM_THREADS",
):
    os.environ.setdefault(_var, "1")

import json
import sys
import time
from pathlib import Path

from fastapi.encoders import jsonable_encoder

from backend.main import FORECAST_CACHE_PATH, compute_forecast_payload


def main() -> None:
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else FORECAST_CACHE_PATH
    started = time.time()
    payload = jsonable_encoder(compute_forecast_payload())
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)
    print(
        f"Wrote forecast cache to {out_path} "
        f"({out_path.stat().st_size:,} bytes) in {time.time() - started:.1f}s"
    )


if __name__ == "__main__":
    main()
