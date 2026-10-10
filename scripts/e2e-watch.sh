#!/usr/bin/env bash
# e2e-watch.sh — Run E2E tests in a visible browser you can watch.
#
# Starts (or reuses) the backend and frontend dev servers, then launches
# Playwright in headed mode with a single worker so you can follow along.
#
# Usage:
#   bash scripts/e2e-watch.sh                       # run all tests (normal speed)
#   bash scripts/e2e-watch.sh broker-listing-form    # run one spec file
#   bash scripts/e2e-watch.sh -g "GF1"              # run tests matching name
#   bash scripts/e2e-watch.sh --debug                # pause on failure (inspector)
#   bash scripts/e2e-watch.sh --slow                 # slow-motion mode (800ms between actions)
#   bash scripts/e2e-watch.sh --slow --project=journey  # watch one journey slowly
#   bash scripts/e2e-watch.sh --slow e2e/journey/broker-listing-creation.spec.ts
#
# Slow mode:
#   Adds --slow-mo=800 so every Playwright action (click, fill, navigate)
#   pauses 800ms, making the flow human-watchable. Combine with --debug
#   to also pause on failure and open the Playwright Inspector.
#
# Prerequisites:
#   - .env.e2e at project root (credentials for test users)
#   - apps/api/.env (database connection for Spring Boot)
#   - Playwright browsers installed: npx playwright install chromium
set -euo pipefail
set -m

# #2750: this runs the LEGACY Playwright estate (playwright.config.ts projects), which is being retired.
echo "[e2e-watch] LEGACY Playwright suite - NOT the authoritative E2E gate. Run: npm run test:e2e:gate" >&2

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."
ENV_FILE="$PROJECT_ROOT/.env.e2e"
# shellcheck source=dev/lib/port-ownership.sh
source "$SCRIPT_DIR/dev/lib/port-ownership.sh"

# ── Parse --slow flag (consume it before passing $@ to Playwright) ───────────
SLOW_MODE=""
REMAINING_ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--slow" ]; then
    SLOW_MODE="1"
  else
    REMAINING_ARGS+=("$arg")
  fi
done
set -- "${REMAINING_ARGS[@]+"${REMAINING_ARGS[@]}"}"

# Export SLOW_MO env var — read by playwright.config.ts → launchOptions.slowMo
# Initialise to empty so `set -u` does not trip on later checks.
export SLOW_MO="${SLOW_MO:-}"
if [ -n "$SLOW_MODE" ]; then
  export SLOW_MO=800
fi

# ── Load .env.e2e ────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env.e2e not found. Copy .env.e2e.example and fill in real credentials."
  exit 1
fi

set -a
eval "$(sed 's/^[[:space:]]*//' "$ENV_FILE" | grep -v '^#' | grep -v '^[[:space:]]*$')"
set +a

FRONTEND_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:5174}"
BACKEND_URL="${BACKEND_BASE_URL:-http://localhost:8085}"
FRONTEND_PORT="${FRONTEND_URL##*:}"
BACKEND_PORT="${BACKEND_URL##*:}"

echo "┌─────────────────────────────────────────┐"
if [ -n "$SLOW_MO" ]; then
echo "│  E2E Watch Mode (SLOW — 800ms/action)   │"
else
echo "│  E2E Watch Mode                         │"
fi
echo "│  Frontend: $FRONTEND_URL              │"
echo "│  Backend:  $BACKEND_URL              │"
echo "└─────────────────────────────────────────┘"
echo ""

# ── Service health checks ────────────────────────────────────────────────────
port_in_use() { lsof -ti:"$1" >/dev/null 2>&1; }
service_ok() { curl -sf "$1" > /dev/null 2>&1; }

BACKEND_PID=""
FRONTEND_PID=""

CLEANUP_DONE=0
cleanup() {
  local exit_code=$?
  if [ "$CLEANUP_DONE" -eq 1 ]; then
    return $exit_code
  fi
  CLEANUP_DONE=1

  [ -n "${BACKEND_PID:-}" ] && terminate_service "backend" "$BACKEND_PID" "${BACKEND_PORT:-}" 3
  [ -n "${FRONTEND_PID:-}" ] && terminate_service "frontend" "$FRONTEND_PID" "${FRONTEND_PORT:-}" 3
  verify_ports_released "${FRONTEND_PORT:-}" "${BACKEND_PORT:-}" || true
  return $exit_code
}

handle_signal() {
  local sig="$1"
  echo "[e2e-watch] Received signal $sig — cleaning up and exiting..." >&2
  cleanup
  trap - "$sig"
  kill -s "$sig" "$$" 2>/dev/null || exit 1
}

trap cleanup EXIT
trap 'handle_signal INT' INT
trap 'handle_signal TERM' TERM
trap 'handle_signal HUP' HUP

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
  "$PROJECT_ROOT/apps/api/run-local.sh" > /tmp/e2e-backend.log 2>&1 &
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
if [ -n "$SLOW_MO" ]; then
  echo "━━━ Running Playwright (headed, 1 worker, slow-mo 800ms) ━━━"
else
  echo "━━━ Running Playwright (headed, 1 worker) ━━━"
fi
echo ""

# ── Run Playwright ───────────────────────────────────────────────────────────
# --headed:    show the browser window
# --workers=1: one test at a time so you can follow along
# --reporter=list: simple console output (no html report noise)
# SLOW_MO env var: read by playwright.config.ts → launchOptions.slowMo
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
  echo "  • Slow mode:             bash scripts/e2e-watch.sh --slow -g 'GF1'"
  echo "  • Debug mode (pause):    bash scripts/e2e-watch.sh --debug -g 'GF1'"
  echo "  • Slow + debug:          bash scripts/e2e-watch.sh --slow --debug -g 'GF1'"
  echo "  • One journey slowly:    bash scripts/e2e-watch.sh --slow --project=journey"
  echo "  • View HTML report:      npx playwright show-report"
fi

exit $EXIT_CODE
