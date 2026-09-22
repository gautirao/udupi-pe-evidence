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
# shellcheck source=./dev/lib/e2e-identity-seed.sh
source "$SCRIPT_DIR/dev/lib/e2e-identity-seed.sh"

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
# Enable job control so background jobs get distinct process groups
set -m

ensure_port_owned_or_free() {
  local role="$1" port="$2" timeout_seconds="$3"
  local pid cwd waited
  pid="$(port_holder_pid "$port")"
  [ -z "$pid" ] && return 0

  cwd="$(port_holder_cwd "$pid")"
  if port_holder_belongs_to_worktree "$WORKTREE_ROOT" "$cwd"; then
    echo "[e2e] $role port $port is held by this worktree's own process (pid $pid) — stopping to restart with latest code."
    terminate_service "$role" "$pid" "$port" "$timeout_seconds"
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
E2E_DB_CONTAINER_NAME=""

CLEANUP_DONE=0
cleanup() {
  local exit_code=$?
  if [ "$CLEANUP_DONE" -eq 1 ]; then
    return $exit_code
  fi
  CLEANUP_DONE=1

  [ -n "${BACKEND_PID:-}" ] && terminate_service "backend" "$BACKEND_PID" "${BACKEND_PORT:-}" 3
  [ -n "${FRONTEND_PID:-}" ] && terminate_service "frontend" "$FRONTEND_PID" "${FRONTEND_PORT:-}" 3
  [ -n "${E2E_DB_CONTAINER_NAME:-}" ] && docker rm -f "$E2E_DB_CONTAINER_NAME" >/dev/null 2>&1 || true

  verify_ports_released "${FRONTEND_PORT:-}" "${BACKEND_PORT:-}" || true
  return $exit_code
}

handle_signal() {
  local sig="$1"
  echo "[e2e] Received signal $sig — cleaning up and exiting..." >&2
  cleanup
  trap - "$sig"
  kill -s "$sig" "$$" 2>/dev/null || exit 1
}

trap cleanup EXIT
trap 'handle_signal INT' INT
trap 'handle_signal TERM' TERM
trap 'handle_signal HUP' HUP

# ---------------------------------------------------------------------------
# Ephemeral local Postgres/PostGIS fixture (#2422 follow-up)
#
# Without this, apps/api/run-local.sh (invoked below) falls through to
# whatever apps/api/.env resolves for SUPABASE_DB_HOST/PORT/etc — in a
# worktree configured against the shared hosted Supabase pooler, every
# backend start (and hence every Flyway migration this script triggers) would
# hit a shared, production-adjacent database. That already happened once
# (issue #2422 push incident, cleaned up manually). Start our OWN disposable
# PostGIS container, scoped to this run, and point the backend at it instead.
#
# This deliberately does NOT reuse scripts/dev/local-fixture-backend.sh's
# "pg-test-fixture" container — that name is a machine-wide singleton other
# concurrent worktrees/agents may be using right now; colliding with it would
# corrupt their runs. A unique name (worktree + PID) and a probed-free port
# avoid that collision. (scripts/dev-worktree-stack.sh has the identical
# shared-DB fallthrough gap but is intentionally left untouched here — it is
# in active use by other concurrent worktrees right now; tracked as a
# follow-up, not fixed in this change.)
# ---------------------------------------------------------------------------

WORKTREE_SLUG="$(basename "$WORKTREE_ROOT" | tr -c 'a-zA-Z0-9' '-')"
E2E_DB_CONTAINER_NAME="pg-e2e-${WORKTREE_SLUG}-$$"
E2E_DB_PASSWORD="${E2E_DB_PASSWORD:-e2e_local_only}"

# find_free_port() (worktree-derived base port so concurrent worktrees rarely
# collide, never reusing a port something else already holds) now lives in
# scripts/dev/lib/port-ownership.sh (#2568), shared with
# scripts/dev/local-fixture-backend.sh instead of being duplicated here.
E2E_DB_PORT_BASE=$(( (BACKEND_PORT * 7) % 20000 + 20000 ))
E2E_DB_PORT="$(find_free_port "$E2E_DB_PORT_BASE")" || exit 1

echo "[e2e] Starting ephemeral local Postgres/PostGIS fixture ($E2E_DB_CONTAINER_NAME on port $E2E_DB_PORT)..."
# #2446: E2E_FIXTURE_PROFILE (unset = default legacy-Udupi fixture; `udupi-canonical`
# = the dedicated canonical-Udupi smoke profile) is passed through EXPLICITLY so the
# selection is visible in this log rather than inherited silently. It only ever
# changes what is seeded into THIS run's disposable container.
echo "[e2e] Fixture profile: ${E2E_FIXTURE_PROFILE:-default}"
PG_TEST_CONTAINER_NAME="$E2E_DB_CONTAINER_NAME" \
PG_TEST_PORT="$E2E_DB_PORT" \
PG_TEST_PASSWORD="$E2E_DB_PASSWORD" \
E2E_FIXTURE_PROFILE="${E2E_FIXTURE_PROFILE:-}" \
bash "$SCRIPT_DIR/db/restore-test-fixture.sh" | grep -v '^postgresql://'
RESTORE_EXIT="${PIPESTATUS[0]}"
if [ "$RESTORE_EXIT" -ne 0 ]; then
  echo "ERROR: local E2E DB fixture setup failed (exit $RESTORE_EXIT)." >&2
  exit 1
fi

# Safety gate: confirm the fixture we're about to point the backend at is a
# local container we just started, reachable on localhost — before any
# credential is read or the backend is launched against it.
E2E_DB_CONTAINER_ID="$(docker ps --filter "name=${E2E_DB_CONTAINER_NAME}" --filter status=running -q || true)"
if [ -z "$E2E_DB_CONTAINER_ID" ]; then
  echo "ERROR: safety gate: local E2E DB fixture container '$E2E_DB_CONTAINER_NAME' not running." >&2
  exit 1
fi
if ! PGPASSWORD="$E2E_DB_PASSWORD" psql -h localhost -p "$E2E_DB_PORT" -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
  echo "ERROR: safety gate: unable to reach local E2E DB fixture at localhost:${E2E_DB_PORT}." >&2
  exit 1
fi
echo "[e2e] Local E2E DB fixture ready (localhost:${E2E_DB_PORT})."

# ---------------------------------------------------------------------------
# Seed the fixture's identities (#2427)
#
# The fixture restored above carries a public.user_roles row only for a
# synthetic seeded broker, never for the live Supabase accounts this suite
# logs in as. Without this, every authenticated request to the backend started
# below returns
#   403 {"error":"Requires broker, dealer, user, or admin role"}
# even with a perfectly valid hosted-Supabase JWT. See
# scripts/dev/lib/e2e-identity-seed.sh for the full mechanism.
#
# Concretely, this is what broke the pre-push gate: e2e/global-setup.ts's
# POST /api/listings 403'd, no fixture listing was ever created, and all seven
# broker-dashboard-v2 / broker-listing-quality specs failed downstream of it.
#
# All three are BEST-EFFORT, deliberately. .env.e2e may legitimately hold
# placeholder credentials (the *@example.com warning above covers that case),
# and those setups are expected to degrade into auth-dependent tests skipping
# themselves — not into the whole gate refusing to start. Each failure prints
# a warning naming the consequence.
#
# Runs AFTER the safety gate, so it can only ever write to the container this
# script just started.
# ---------------------------------------------------------------------------
export E2E_SEED_PG_HOST=localhost
export E2E_SEED_PG_PORT="$E2E_DB_PORT"
export E2E_SEED_PG_PASSWORD="$E2E_DB_PASSWORD"

echo "[e2e] Seeding fixture identities (admin / broker / smoke-user)..."
e2e_seed_identity admin "${ADMIN_EMAIL:-}" "${ADMIN_PASSWORD:-}" admin best-effort || true
e2e_seed_identity broker \
  "${BROKER_EMAIL:-${DEALER_EMAIL:-}}" \
  "${BROKER_PASSWORD:-${DEALER_PASSWORD:-}}" \
  broker best-effort || true
e2e_seed_identity smoke-user "${SMOKE_USER_EMAIL:-}" "${SMOKE_USER_PASSWORD:-}" user best-effort || true

# The backend still needs SUPABASE_PROJECT_REF/AI_API_KEY for hosted JWT
# validation even though the DB_* values below bypass apps/api/.env entirely —
# read only those two, the same way scripts/dev/local-fixture-backend.sh does
# (#1981), never the file's SUPABASE_DB_* values.
BACKEND_ENV_FILE="$SCRIPT_DIR/../apps/api/.env"
if [ ! -f "$BACKEND_ENV_FILE" ]; then
  echo "ERROR: $BACKEND_ENV_FILE not found (needed for SUPABASE_PROJECT_REF / AI_API_KEY)." >&2
  exit 1
fi
E2E_SUPABASE_PROJECT_REF="$(grep -E '^SUPABASE_PROJECT_REF=' "$BACKEND_ENV_FILE" | tail -1 | cut -d= -f2-)"
E2E_AI_API_KEY="$(grep -E '^AI_API_KEY=' "$BACKEND_ENV_FILE" | tail -1 | cut -d= -f2-)"
if [ -z "$E2E_SUPABASE_PROJECT_REF" ]; then
  echo "ERROR: SUPABASE_PROJECT_REF missing from $BACKEND_ENV_FILE." >&2
  exit 1
fi

# apps/api/run-local.sh binds to $SERVER_PORT (defaulting to apps/api/.env's
# value, historically 8085) unless told otherwise — without this, the backend
# started here would ignore BACKEND_PORT entirely and the health-check below
# would wait forever on the WRONG port. CORS_ALLOWED_ORIGINS is one of the
# other port-coupled knobs (see scripts/dev-worktree-stack.sh); default it
# from FRONTEND_PORT so a worktree-specific frontend origin isn't 403'd by a
# backend still allowlisting only the repo's static defaults (#2078).
export SERVER_PORT="$BACKEND_PORT"
export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-http://localhost:$FRONTEND_PORT,http://127.0.0.1:$FRONTEND_PORT}"
# VITE_API_BASE_URL is the third port-coupled knob (see scripts/dev-worktree-
# stack.sh, which already exports it): what the APP itself calls (apps/web/
# src/lib/api.ts, default :8085). Without this, a worktree assigned a
# non-default BACKEND_PORT gets a frontend that silently keeps calling :8085 —
# the backend started above never sees that traffic, and every API-dependent
# test in this run fails with a false-negative CORS/connection error instead
# of exercising the backend this script just started.
export VITE_API_BASE_URL="$BACKEND_BASE_URL"

# Point the backend at the local fixture above instead of apps/api/.env's
# datasource — the whole point of this block (#2422 follow-up). Mirrors
# scripts/dev/local-fixture-backend.sh Step G's override set exactly.
export SKIP_BACKEND_ENV_LOAD=true
export SUPABASE_DB_HOST=localhost
export SUPABASE_DB_PORT="$E2E_DB_PORT"
export SUPABASE_DB_NAME=postgres
export SUPABASE_DB_USER=postgres
export SUPABASE_DB_PASSWORD="$E2E_DB_PASSWORD"
export SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL=false
export SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSLMODE=disable
# restore-test-fixture.sh already applied every migration to this fixture
# (see its own flyway_schema_history row-count assertion); Spring Boot's
# embedded Flyway would otherwise re-validate against checksums that don't
# match the CONCURRENTLY-stripped copy it migrated with, and fail startup.
export SPRING_FLYWAY_ENABLED=false
# #2569: background @Scheduled jobs (rollups, outbox pollers, retention jobs)
# have no business running against this disposable, short-lived E2E fixture —
# see SchedulingSuppressionConfig (issue #2114) for the mechanism this actually
# wires into.
export SPRING_TASK_SCHEDULING_ENABLED=false
export SUPABASE_PROJECT_REF="$E2E_SUPABASE_PROJECT_REF"
export LOCAL_DEV_STORAGE_ENABLED="${LOCAL_DEV_STORAGE_ENABLED:-true}"
export AI_API_KEY="$E2E_AI_API_KEY"

for role_spec in "backend:$BACKEND_PORT" "frontend:$FRONTEND_PORT"; do
  role="${role_spec%%:*}"
  port="${role_spec##*:}"
  check_pid="$(port_holder_pid "$port")"
  if [ -n "$check_pid" ]; then
    echo "ERROR: $role port $port is currently held by PID $check_pid prior to service start." >&2
    echo "Refusing to start $role on an occupied port." >&2
    exit 1
  fi
done

echo "[e2e] Starting backend..."
"$SCRIPT_DIR/../apps/api/run-local.sh" > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

echo "[e2e] Starting frontend..."
npm --prefix "$SCRIPT_DIR/../apps/web" run dev -- --port "$FRONTEND_PORT" > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

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
