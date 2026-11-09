@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>&1 || (echo Python 3.10+ is required.& exit /b 1)
where npm >nul 2>&1 || (echo Node.js 18+ is required.& exit /b 1)

if not exist .venv python -m venv .venv
call .venv\Scripts\python -m pip install --upgrade pip
call .venv\Scripts\pip install -r backend\requirements.txt
if not exist frontend\node_modules call npm --prefix frontend install

start "AeroTwin Backend" /B cmd /c "set PYTHONPATH=backend&& .venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
echo Starting AeroTwin dashboard at http://localhost:5173
call npm --prefix frontend run dev -- --host 127.0.0.1
