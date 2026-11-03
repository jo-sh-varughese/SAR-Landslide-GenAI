#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting diffusion-explainer backend (http://127.0.0.1:8010) and frontend (http://localhost:5731)..."

if [ -f "$DIR/backend/.venv/Scripts/python.exe" ]; then
  PYBIN="$DIR/backend/.venv/Scripts/python.exe"   # Windows venv layout
else
  PYBIN="$DIR/backend/.venv/bin/python"           # macOS/Linux venv layout
fi

(cd "$DIR/backend" && "$PYBIN" -m uvicorn app.main:app --port 8010) &
BACKEND_PID=$!

(cd "$DIR/frontend" && npm run dev) &
FRONTEND_PID=$!

echo "Backend PID:  $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Backend docs:  http://127.0.0.1:8010/docs"
echo "Frontend app:  http://localhost:5731"
echo ""
echo "Press Ctrl+C to stop both."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
