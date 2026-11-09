@echo off
setlocal
cd /d "%~dp0"

set "PY310=%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
if not exist "%PY310%" (echo Python 3.10 is required. Install it for this Windows user, then rerun this file.& exit /b 1)
where npm >nul 2>&1 || (echo Node.js 18+ is required.& exit /b 1)

call "%PY310%" -m pip install --upgrade pip
call "%PY310%" -m pip install -r backend\requirements.txt -r backend\requirements-ncmapss.txt
if errorlevel 1 exit /b 1
if not exist frontend\node_modules call npm --prefix frontend install

start "AeroTwin API with N-CMAPSS" /B cmd /c "set PYTHONPATH=backend&& ""%PY310%"" -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
echo Starting AeroTwin with original turbofan models at http://localhost:5173/#/ncmapss
call npm --prefix frontend run dev -- --host 127.0.0.1
