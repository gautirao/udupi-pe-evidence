#!/usr/bin/env bash
# Run Playwright e2e tests using variables from .env.e2e
# Usage: bash scripts/run-e2e-local.sh [playwright args]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.e2e"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env.e2e not found at project root."
  echo "Create it with the required variables (see README)."
  exit 1
fi

# Export vars — strip leading whitespace, skip comments and blank lines
set -a
eval "$(sed 's/^[[:space:]]*//' "$ENV_FILE" | grep -v '^#' | grep -v '^[[:space:]]*$')"
set +a

echo "e2e target: $PLAYWRIGHT_BASE_URL"
echo "backend:    $BACKEND_BASE_URL"
echo ""

# Start backend via run-local.sh
echo "[e2e] Starting backend..."
"$SCRIPT_DIR/../backend/run-local.sh" > /tmp/backend-e2e.log 2>&1 &
BACKEND_PID=$!

# Start frontend (Vite dev server)
echo "[e2e] Starting frontend..."
npm --prefix "$SCRIPT_DIR/.." run dev > /tmp/frontend-e2e.log 2>&1 &
FRONTEND_PID=$!

# Cleanup on exit (success or failure)
cleanup() {
  echo "[e2e] Stopping backend (pid $BACKEND_PID) and frontend (pid $FRONTEND_PID)..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for backend
echo "[e2e] Waiting for backend on $BACKEND_BASE_URL..."
TIMEOUT=60
ELAPSED=0
until curl -sf "$BACKEND_BASE_URL/actuator/health" > /dev/null 2>&1; do
  sleep 2; ELAPSED=$((ELAPSED + 2))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "[e2e] Backend did not start in ${TIMEOUT}s. Log:"
    tail -30 /tmp/backend-e2e.log
    exit 1
  fi
done
echo "[e2e] Backend ready."

# Wait for frontend
echo "[e2e] Waiting for frontend on $PLAYWRIGHT_BASE_URL..."
ELAPSED=0
until curl -sf "$PLAYWRIGHT_BASE_URL" > /dev/null 2>&1; do
  sleep 2; ELAPSED=$((ELAPSED + 2))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "[e2e] Frontend did not start in ${TIMEOUT}s. Log:"
    tail -30 /tmp/frontend-e2e.log
    exit 1
  fi
done
echo "[e2e] Frontend ready."
echo ""

npx playwright test "$@"
