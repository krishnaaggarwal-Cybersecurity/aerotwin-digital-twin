@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>&1 || (echo Python 3.10 is required for the original BiLSTM runtime.& exit /b 1)
python --version 2>&1 | findstr /c:"3.10." >nul || (echo This optional runtime requires Python 3.10. Install it, then rerun this file.& exit /b 1)
where npm >nul 2>&1 || (echo Node.js 18+ is required.& exit /b 1)

if not exist .venv-ncmapss python -m venv .venv-ncmapss
call .venv-ncmapss\Scripts\python -m pip install --upgrade pip
call .venv-ncmapss\Scripts\pip install -r backend\requirements.txt -r backend\requirements-ncmapss.txt
if errorlevel 1 exit /b 1
if not exist frontend\node_modules call npm --prefix frontend install

start "AeroTwin API with N-CMAPSS" /B cmd /c "set PYTHONPATH=backend&& .venv-ncmapss\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
echo Starting AeroTwin with original turbofan models at http://localhost:5173/#/ncmapss
call npm --prefix frontend run dev -- --host 127.0.0.1
