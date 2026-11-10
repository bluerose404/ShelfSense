# ShelfSense — single-container image (FastAPI API + built React frontend)
# Target: Hugging Face Spaces (Docker SDK, app_port 7860). Also works on Render/Railway/Fly.

# ---------- Stage 1: build the React frontend ----------
FROM node:24-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: Python runtime ----------
FROM python:3.15-slim

# Deterministic single-threaded BLAS/OpenMP (AGENTS.md rule) + runtime settings
ENV OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    VECLIB_MAXIMUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/home/user/app \
    SHELFSENSE_WARMUP=1 \
    PORT=7860

# Hugging Face Spaces runs containers as UID 1000; the SQLite DB must be writable.
RUN useradd -m -u 1000 user
WORKDIR /home/user/app

COPY --chown=user backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY --chown=user backend/ backend/
COPY --chown=user --from=frontend /build/frontend/dist frontend/dist

USER user
EXPOSE 7860

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
