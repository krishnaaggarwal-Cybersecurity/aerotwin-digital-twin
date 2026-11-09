#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required. Install Python 3.10+ and retry."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required. Install Node.js 18+ and retry."
  exit 1
fi

if [ -d .venv ] && { ! .venv/bin/python --version >/dev/null 2>&1 || ! .venv/bin/pip --version >/dev/null 2>&1; }; then
  backup_dir=".venv.broken-$(date +%Y%m%d%H%M%S)"
  echo "Existing virtual environment is invalid; preserving it as $backup_dir."
  mv .venv "$backup_dir"
fi

if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install -r backend/requirements.txt

if [ ! -d frontend/node_modules ]; then
  npm --prefix frontend install
fi

api_port="${API_PORT:-8000}"
export VITE_API_URL="${VITE_API_URL:-http://127.0.0.1:$api_port}"

echo "Starting AeroTwin backend at http://localhost:$api_port (API docs: /docs)"
PYTHONPATH=backend .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$api_port" &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" 2>/dev/null || true' EXIT INT TERM

echo "Starting AeroTwin dashboard at http://localhost:5173"
npm --prefix frontend run dev -- --host 127.0.0.1
