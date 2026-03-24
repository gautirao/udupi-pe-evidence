#!/usr/bin/env bash
# e2e-watch.sh — Run E2E tests in a visible browser you can watch.
#
# Starts (or reuses) the backend and frontend dev servers, then launches
# Playwright in headed mode with a single worker so you can follow along.
#
# Usage:
#   bash scripts/e2e-watch.sh                     # run all tests
#   bash scripts/e2e-watch.sh broker-listing-form  # run one spec file
#   bash scripts/e2e-watch.sh -g "GF1"            # run tests matching name
#   bash scripts/e2e-watch.sh --debug              # pause on failure (inspector)
#
# Prerequisites:
#   - .env.e2e at project root (credentials for test users)
#   - backend/.env (database connection for Spring Boot)
#   - Playwright browsers installed: npx playwright install chromium
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."
ENV_FILE="$PROJECT_ROOT/.env.e2e"

# ── Load .env.e2e ────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env.e2e not found. Copy .env.e2e.example and fill in real credentials."
  exit 1
fi

set -a
eval "$(sed 's/^[[:space:]]*//' "$ENV_FILE" | grep -v '^#' | grep -v '^[[:space:]]*$')"
set +a

FRONTEND_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:5173}"
BACKEND_URL="${BACKEND_BASE_URL:-http://localhost:8085}"
FRONTEND_PORT="${FRONTEND_URL##*:}"
BACKEND_PORT="${BACKEND_URL##*:}"

echo "┌─────────────────────────────────────────┐"
echo "│  E2E Watch Mode                         │"
echo "│  Frontend: $FRONTEND_URL              │"
echo "│  Backend:  $BACKEND_URL              │"
echo "└─────────────────────────────────────────┘"
echo ""

# ── Service health checks ────────────────────────────────────────────────────
port_in_use() { lsof -ti:"$1" >/dev/null 2>&1; }
service_ok() { curl -sf "$1" > /dev/null 2>&1; }

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null && echo "[cleanup] Stopped backend ($BACKEND_PID)" || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null && echo "[cleanup] Stopped frontend ($FRONTEND_PID)" || true
}
trap cleanup EXIT

# ── Backend ──────────────────────────────────────────────────────────────────
if port_in_use "$BACKEND_PORT"; then
  if service_ok "$BACKEND_URL/actuator/health"; then
    echo "✅ Backend already running on :$BACKEND_PORT"
  else
    echo "❌ Port $BACKEND_PORT in use but /actuator/health not responding."
    echo "   Stop the process on that port and retry."
    exit 1
  fi
else
  echo "🚀 Starting backend..."
  "$PROJECT_ROOT/backend/run-local.sh" > /tmp/e2e-backend.log 2>&1 &
  BACKEND_PID=$!
  echo "   PID $BACKEND_PID — log at /tmp/e2e-backend.log"

  TIMEOUT=90
  ELAPSED=0
  while ! service_ok "$BACKEND_URL/actuator/health"; do
    sleep 2
    ELAPSED=$((ELAPSED + 2))
    if [ $ELAPSED -ge $TIMEOUT ]; then
      echo "❌ Backend didn't start in ${TIMEOUT}s. Last 20 lines:"
      tail -20 /tmp/e2e-backend.log
      exit 1
    fi
    printf "\r   Waiting for backend... %ds / %ds" "$ELAPSED" "$TIMEOUT"
  done
  printf "\r✅ Backend ready (%ds)                    \n" "$ELAPSED"
fi

# ── Frontend ─────────────────────────────────────────────────────────────────
if port_in_use "$FRONTEND_PORT"; then
  if service_ok "$FRONTEND_URL"; then
    echo "✅ Frontend already running on :$FRONTEND_PORT"
  else
    echo "❌ Port $FRONTEND_PORT in use but not responding."
    echo "   Stop the process on that port and retry."
    exit 1
  fi
else
  echo "🚀 Starting frontend (Vite dev server)..."
  npm --prefix "$PROJECT_ROOT" run dev > /tmp/e2e-frontend.log 2>&1 &
  FRONTEND_PID=$!
  echo "   PID $FRONTEND_PID — log at /tmp/e2e-frontend.log"

  TIMEOUT=30
  ELAPSED=0
  while ! service_ok "$FRONTEND_URL"; do
    sleep 2
    ELAPSED=$((ELAPSED + 2))
    if [ $ELAPSED -ge $TIMEOUT ]; then
      echo "❌ Frontend didn't start in ${TIMEOUT}s. Last 20 lines:"
      tail -20 /tmp/e2e-frontend.log
      exit 1
    fi
    printf "\r   Waiting for frontend... %ds / %ds" "$ELAPSED" "$TIMEOUT"
  done
  printf "\r✅ Frontend ready (%ds)                   \n" "$ELAPSED"
fi

echo ""
echo "━━━ Running Playwright (headed, 1 worker) ━━━"
echo ""

# ── Run Playwright ───────────────────────────────────────────────────────────
# --headed:    show the browser window
# --workers=1: one test at a time so you can follow along
# --reporter=list: simple console output (no html report noise)
# Remaining args ($@) are passed through — use them for file filters, -g, --debug
npx playwright test \
  --headed \
  --workers=1 \
  --reporter=list \
  "$@"

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ All tests passed."
else
  echo "❌ Some tests failed (exit $EXIT_CODE)."
  echo ""
  echo "Tips:"
  echo "  • Re-run a single test:  bash scripts/e2e-watch.sh -g 'GF1'"
  echo "  • Debug mode (pause):    bash scripts/e2e-watch.sh --debug -g 'GF1'"
  echo "  • View HTML report:      npx playwright show-report"
fi

exit $EXIT_CODE
