param (
    [string]$Command = "dev"
)

$ErrorActionPreference = "Stop"

# Enforce single-threaded BLAS/OpenMP determinism across all commands
$env:OMP_NUM_THREADS = "1"
$env:OPENBLAS_NUM_THREADS = "1"
$env:MKL_NUM_THREADS = "1"
$env:VECLIB_MAXIMUM_THREADS = "1"
$env:NUMEXPR_NUM_THREADS = "1"
$env:PYTHONPATH = "."

if ($Command -eq "setup") {
    Write-Host "Setting up ShelfSense Python virtual environment (venv)..." -ForegroundColor Cyan
    if (Test-Path ".\venv") {
        Write-Host "Removing existing venv..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force ".\venv"
    }

    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3.13 -m venv venv
        if ($LASTEXITCODE -ne 0) {
            & py -3 -m venv venv
        }
    } else {
        & python -m venv venv
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create Python virtual environment."
        exit $LASTEXITCODE
    }

    Write-Host "Installing pinned backend requirements..." -ForegroundColor Cyan
    & .\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install backend requirements."
        exit $LASTEXITCODE
    }

    if (-not (Test-Path "frontend\node_modules")) {
        Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
        Push-Location frontend
        npm install
        if ($LASTEXITCODE -ne 0) {
            Pop-Location
            Write-Error "Failed to install frontend dependencies."
            exit $LASTEXITCODE
        }
        Pop-Location
    }

    Write-Host "Setup completed successfully!" -ForegroundColor Green
}
elseif ($Command -eq "dev") {
    Write-Host "Starting ShelfSense Backend and Frontend..." -ForegroundColor Cyan
    Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "`$env:OMP_NUM_THREADS='1'; `$env:OPENBLAS_NUM_THREADS='1'; `$env:MKL_NUM_THREADS='1'; `$env:VECLIB_MAXIMUM_THREADS='1'; `$env:NUMEXPR_NUM_THREADS='1'; `$env:PYTHONPATH='.'; .\venv\Scripts\uvicorn backend.main:app --reload --port 8000"
    Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"
    Write-Host "Services started! Frontend: http://localhost:5173, Backend: http://127.0.0.1:8000" -ForegroundColor Green
}
elseif ($Command -eq "test") {
    Write-Host "Running Backend Tests (pytest)..." -ForegroundColor Cyan
    & .\venv\Scripts\pytest backend\tests
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backend pytest failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }

    Write-Host "Running Frontend Unit Tests (vitest) & Build Check..." -ForegroundColor Cyan
    Push-Location frontend
    npm test
    if ($LASTEXITCODE -ne 0) {
        $code = $LASTEXITCODE
        Pop-Location
        Write-Error "Frontend vitest failed with exit code $code"
        exit $code
    }
    npm run build
    if ($LASTEXITCODE -ne 0) {
        $code = $LASTEXITCODE
        Pop-Location
        Write-Error "Frontend build failed with exit code $code"
        exit $code
    }
    Pop-Location
    Write-Host "All Tests Completed!" -ForegroundColor Green
}
elseif ($Command -eq "seed") {
    Write-Host "Generating Synthetic Dataset (Seed=42)..." -ForegroundColor Cyan
    & .\venv\Scripts\python.exe -m backend.seed
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Database seeding failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
    Write-Host "Database seeded successfully!" -ForegroundColor Green
}
else {
    Write-Host "Unknown command: $Command. Use: setup | dev | test | seed" -ForegroundColor Red
    exit 1
}
