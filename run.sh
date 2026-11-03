#!/usr/bin/env bash
# Launches the SAR-Landslide-GenAI FastAPI backend + Next.js frontend together.
# Usage: ./run.sh   (Ctrl+C stops both)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

# Resolve the backend virtualenv's Python (Windows venv layout vs POSIX layout).
if [ -x "$BACKEND_DIR/.venv/Scripts/python.exe" ]; then
  PYTHON_BIN="$BACKEND_DIR/.venv/Scripts/python.exe"
elif [ -x "$BACKEND_DIR/.venv/bin/python" ]; then
  PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
else
  echo "No backend/.venv found. Create one first:"
  echo "  python -m venv backend/.venv"
  echo "  backend/.venv/Scripts/pip install -r backend/requirements.txt   (Windows)"
  echo "  backend/.venv/bin/pip install -r backend/requirements.txt      (macOS/Linux)"
  exit 1
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "frontend/node_modules not found — running npm install first..."
  (cd "$FRONTEND_DIR" && npm install)
fi

echo "Starting FastAPI backend on http://localhost:8000 ..."
(cd "$BACKEND_DIR" && "$PYTHON_BIN" -m uvicorn app.main:app --reload --port 8000) &
BACKEND_PID=$!

echo "Starting Next.js frontend on http://localhost:3000 ..."
(cd "$FRONTEND_DIR" && npm run dev) &
FRONTEND_PID=$!

cleanup() {
  echo ""
  echo "Shutting down..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM

wait
