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

port_of() { echo "${1##*:}"; }  # extract port from URL like http://localhost:8080
FRONTEND_PORT="$(port_of "$PLAYWRIGHT_BASE_URL")"
BACKEND_PORT="$(port_of "$BACKEND_BASE_URL")"

port_in_use() { lsof -ti:"$1" >/dev/null 2>&1; }

# Always kill any existing process on the port before starting.
# Reusing a running server risks running against stale/wrong code
# (e.g. a different project's Vite server on the same port).
if port_in_use "$FRONTEND_PORT"; then
  echo "[e2e] Frontend running on $FRONTEND_PORT — stopping to restart with latest code."
  lsof -ti:"$FRONTEND_PORT" | xargs kill 2>/dev/null || true
  sleep 1
fi

if port_in_use "$BACKEND_PORT"; then
  echo "[e2e] Backend running on $BACKEND_PORT — stopping to restart with latest code."
  lsof -ti:"$BACKEND_PORT" | xargs kill 2>/dev/null || true
  sleep 2
fi

# Warn if .env.e2e still has placeholder credentials
if [[ "${SMOKE_USER_EMAIL:-}" == *"@example.com"* ]] || \
   [[ "${BROKER_EMAIL:-${DEALER_EMAIL:-}}" == *"@example.com"* ]] || \
   [[ "${ADMIN_EMAIL:-}" == *"@example.com"* ]]; then
  echo "WARNING: .env.e2e contains placeholder credentials (*@example.com)."
  echo "Auth-dependent tests will skip instead of running."
  echo "To run them, replace placeholder values with real Supabase test user"
  echo "credentials. See docs/TESTING.md for setup instructions."
  echo ""
fi

BACKEND_PID=""
FRONTEND_PID=""

echo "[e2e] Starting backend..."
"$SCRIPT_DIR/../backend/run-local.sh" > /tmp/backend-e2e.log 2>&1 &
BACKEND_PID=$!

echo "[e2e] Starting frontend..."
npm --prefix "$SCRIPT_DIR/.." run dev -- --port "$FRONTEND_PORT" > /tmp/frontend-e2e.log 2>&1 &
FRONTEND_PID=$!

# Cleanup on exit — stop services we started
cleanup() {
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
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
TIMEOUT=60
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

npx playwright test "$@" --project=smoke
