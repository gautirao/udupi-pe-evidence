#!/usr/bin/env bash
# Run Playwright e2e tests using variables from .env.e2e
# Usage: bash scripts/run-e2e-local.sh [playwright args]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKTREE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$WORKTREE_ROOT/.env.e2e"
# scripts/dev-worktree-stack.sh writes this per-worktree, non-symlinked file
# when it assigns this worktree explicit ports. It is optional (single-
# worktree local dev never creates it) and, when present, wins over .env.e2e
# so this worktree's own assigned ports are what actually get used (#2078).
ENV_LOCAL_FILE="$WORKTREE_ROOT/.env.e2e.local"
# shellcheck source=./dev/lib/port-ownership.sh
source "$SCRIPT_DIR/dev/lib/port-ownership.sh"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env.e2e not found at project root."
  echo "Create it with the required variables (see README)."
  exit 1
fi

# Export vars — strip leading whitespace, skip comments and blank lines
set -a
eval "$(sed 's/^[[:space:]]*//' "$ENV_FILE" | grep -v '^#' | grep -v '^[[:space:]]*$')"
if [ -f "$ENV_LOCAL_FILE" ]; then
  echo "[e2e] Using this worktree's port override: $ENV_LOCAL_FILE"
  eval "$(sed 's/^[[:space:]]*//' "$ENV_LOCAL_FILE" | grep -v '^#' | grep -v '^[[:space:]]*$')"
fi
set +a

echo "e2e target: $PLAYWRIGHT_BASE_URL"
echo "backend:    $BACKEND_BASE_URL"
echo ""

port_of() { echo "${1##*:}"; }  # extract port from URL like http://localhost:8080
FRONTEND_PORT="$(port_of "$PLAYWRIGHT_BASE_URL")"
BACKEND_PORT="$(port_of "$BACKEND_BASE_URL")"
BACKEND_LOG="${TMPDIR:-/tmp}/backend-e2e-${BACKEND_PORT}.log"
FRONTEND_LOG="${TMPDIR:-/tmp}/frontend-e2e-${FRONTEND_PORT}.log"

# A port already in use is only safe to reuse-by-restart when it is OUR OWN
# worktree's leftover process (e.g. a previous run of this same script, or
# this worktree's own dev-worktree-stack.sh). Anything else — a sibling
# worktree's backend/frontend, most obviously — must never be touched. This
# used to unconditionally `kill` whatever held the port, which is exactly
# what took over a concurrent worktree's process during issue #2040 (#2078).
ensure_port_owned_or_free() {
  local role="$1" port="$2" timeout_seconds="$3"
  local pid cwd waited
  pid="$(port_holder_pid "$port")"
  [ -z "$pid" ] && return 0

  cwd="$(port_holder_cwd "$pid")"
  if port_holder_belongs_to_worktree "$WORKTREE_ROOT" "$cwd"; then
    echo "[e2e] $role port $port is held by this worktree's own process (pid $pid) — stopping to restart with latest code."
    kill "$pid" 2>/dev/null || true
    # A signalled process is not necessarily a DEAD process — mvn's spawned
    # java child, for one, does not die just because the wrapper script that
    # started it was killed. Sleeping a fixed interval and trusting it worked
    # let a replacement backend/frontend fail to bind while the later curl
    # health checks kept passing against the STALE process — Playwright would
    # then validate old code while this script reported success. Poll until
    # the port is actually free; fail closed if it never clears (#2078).
    waited=0
    while [ -n "$(port_holder_pid "$port")" ]; do
      if [ "$waited" -ge "$timeout_seconds" ]; then
        echo "ERROR: $role port $port is still held after ${timeout_seconds}s — pid $pid did not exit."
        echo "Refusing to start a replacement while the old process might still be serving:"
        echo "that would let Playwright validate STALE code. Stop it manually and re-run."
        exit 1
      fi
      sleep 1
      waited=$((waited + 1))
    done
    echo "[e2e] $role port $port confirmed free."
  else
    echo "ERROR: $role port $port is held by PID $pid (cwd: ${cwd:-unknown}), which does not belong to this worktree ($WORKTREE_ROOT)."
    echo "Refusing to stop another run's process. Assign this worktree a different port pair"
    echo "(scripts/dev-worktree-stack.sh --frontend-port <n> --backend-port <n>), or stop that"
    echo "process yourself if it is actually yours."
    exit 1
  fi
}

ensure_port_owned_or_free frontend "$FRONTEND_PORT" "${E2E_PORT_CLEAR_TIMEOUT_FRONTEND_SECONDS:-5}"
ensure_port_owned_or_free backend "$BACKEND_PORT" "${E2E_PORT_CLEAR_TIMEOUT_BACKEND_SECONDS:-15}"

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

# backend/run-local.sh binds to $SERVER_PORT (defaulting to backend/.env's
# value, historically 8085) unless told otherwise — without this, the backend
# started here would ignore BACKEND_PORT entirely and the health-check below
# would wait forever on the WRONG port. CORS_ALLOWED_ORIGINS is one of the
# other port-coupled knobs (see scripts/dev-worktree-stack.sh); default it
# from FRONTEND_PORT so a worktree-specific frontend origin isn't 403'd by a
# backend still allowlisting only the repo's static defaults (#2078).
export SERVER_PORT="$BACKEND_PORT"
export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-http://localhost:$FRONTEND_PORT,http://127.0.0.1:$FRONTEND_PORT}"

echo "[e2e] Starting backend..."
"$SCRIPT_DIR/../backend/run-local.sh" > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

echo "[e2e] Starting frontend..."
npm --prefix "$SCRIPT_DIR/.." run dev -- --port "$FRONTEND_PORT" > "$FRONTEND_LOG" 2>&1 &
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
    tail -30 "$BACKEND_LOG"
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
    tail -30 "$FRONTEND_LOG"
    exit 1
  fi
done
echo "[e2e] Frontend ready."
echo ""

# Use smoke as the default project only when caller has not already specified --project.
if printf '%s\n' "$@" | grep -q '^--project'; then
  npx playwright test "$@"
else
  npx playwright test "$@" --project=smoke
fi
