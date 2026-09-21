#!/usr/bin/env bash
# scripts/dev/local-fixture-backend.sh — #1981
#
# Local Spring Boot -> disposable local Postgres/PostGIS fixture -> hosted
# Supabase Auth, for genuine browser testing without touching the shared
# remote Supabase database.
#
# Flow:
#   1. Validate prerequisites (docker/psql/curl/jq + required env files).
#   2. Restore a throwaway PostGIS fixture via scripts/db/restore-test-fixture.sh
#      (reused verbatim — no second Flyway/fixture implementation here).
#   3. Run a hard, fail-closed safety gate proving all DB traffic below this
#      point can only ever reach the local fixture container.
#   4. Log in to hosted Supabase Auth (password grant) and idempotently seed
#      auth.users + public.user_roles for admin (required) and broker /
#      smoke-user (best-effort), via scripts/dev/lib/e2e-identity-seed.sh —
#      the same canonical seed scripts/run-e2e-local.sh uses (#2427).
#   5. exec apps/api/run-local.sh with SKIP_BACKEND_ENV_LOAD=true and local
#      datasource overrides, keeping hosted JWT validation (SUPABASE_PROJECT_REF).
#
# Usage (from anywhere):
#   bash scripts/dev/local-fixture-backend.sh
#
# Required files (not sourced for their DB_* values — see below):
#   apps/api/.env  — SUPABASE_PROJECT_REF, AI_API_KEY
#   .env.e2e       — ADMIN_EMAIL, ADMIN_PASSWORD
#   .env           — VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
#
# IMPORTANT: this script sources ALL of apps/api/.env (Step B), which may include
# SUPABASE_DB_HOST/PORT/PASSWORD (the remote datasource values) if present — but
# it never dereferences/uses those specific values afterward. It only ever
# constructs its own local fixture datasource values (localhost / PG_TEST_PORT /
# PG_TEST_PASSWORD), which always win in Step G's explicit overrides. There is
# no code path here that can resolve to a remote database.
#
# Optional overrides:
#   PG_TEST_PORT       Host port for the local fixture (default: 5434)
#   PG_TEST_PASSWORD   Postgres superuser password for the fixture (default: fixture_test_only)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# The canonical fixture identity seed, shared with scripts/run-e2e-local.sh
# (#2427). Steps E and F below are thin callers of it.
# shellcheck source=lib/e2e-identity-seed.sh
source "${SCRIPT_DIR}/lib/e2e-identity-seed.sh"
# shellcheck source=lib/port-ownership.sh
source "${SCRIPT_DIR}/lib/port-ownership.sh"

BACKEND_ENV_FILE="${REPO_ROOT}/apps/api/.env"
E2E_ENV_FILE="${REPO_ROOT}/.env.e2e"
ROOT_ENV_FILE="${REPO_ROOT}/.env"
RESTORE_SCRIPT="${REPO_ROOT}/scripts/db/restore-test-fixture.sh"

# ---------------------------------------------------------------------------
# Step A — Prerequisite validation
# ---------------------------------------------------------------------------

echo ">>> Validating prerequisites..."

for BIN in docker psql curl jq; do
  if ! command -v "$BIN" &>/dev/null; then
    echo "ERROR: required command not found: $BIN" >&2
    exit 1
  fi
done

if [[ ! -f "$BACKEND_ENV_FILE" ]]; then
  echo "ERROR: $BACKEND_ENV_FILE not found (needed for SUPABASE_PROJECT_REF / AI_API_KEY)." >&2
  exit 1
fi

if [[ ! -f "$E2E_ENV_FILE" ]]; then
  echo "ERROR: $E2E_ENV_FILE not found (needed for ADMIN_EMAIL / ADMIN_PASSWORD)." >&2
  exit 1
fi

if [[ ! -f "$ROOT_ENV_FILE" ]]; then
  echo "ERROR: $ROOT_ENV_FILE not found (needed for VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)." >&2
  exit 1
fi

if [[ ! -f "$RESTORE_SCRIPT" ]]; then
  echo "ERROR: $RESTORE_SCRIPT not found." >&2
  exit 1
fi

if [[ ! -x "$RESTORE_SCRIPT" ]]; then
  echo "ERROR: $RESTORE_SCRIPT is not executable. Run: chmod +x $RESTORE_SCRIPT" >&2
  exit 1
fi

echo ">>> Prerequisites present."

# ---------------------------------------------------------------------------
# Load required vars from .env, .env.e2e, apps/api/.env — never for SUPABASE_DB_*
# ---------------------------------------------------------------------------

# A caller (e.g. scripts/dev-worktree-stack.sh, scripts/run-e2e-local.sh) may
# already have exported a per-worktree CORS_ALLOWED_ORIGINS. apps/api/.env also
# defines it, and `source` always wins over an existing exported value — so
# without this, the caller's origin is silently clobbered by backend/.env's
# hardcoded allowlist (#2285; same class as run-local.sh's #2078 SERVER_PORT
# handling). Preserve it and restore it after the source.
CALLER_CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-}"

set -a
# shellcheck source=/dev/null
source "$ROOT_ENV_FILE"
# shellcheck source=/dev/null
source "$E2E_ENV_FILE"
# shellcheck source=/dev/null
source "$BACKEND_ENV_FILE"
set +a

if [[ -n "$CALLER_CORS_ALLOWED_ORIGINS" ]]; then
  CORS_ALLOWED_ORIGINS="$CALLER_CORS_ALLOWED_ORIGINS"
  export CORS_ALLOWED_ORIGINS
  echo ">>> CORS_ALLOWED_ORIGINS overridden by caller: $CORS_ALLOWED_ORIGINS (apps/api/.env value ignored)"
fi

if [[ -z "${VITE_SUPABASE_URL:-}" || -z "${VITE_SUPABASE_PUBLISHABLE_KEY:-}" ]]; then
  echo "ERROR: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing from $ROOT_ENV_FILE." >&2
  exit 1
fi

if [[ -z "${ADMIN_EMAIL:-}" || -z "${ADMIN_PASSWORD:-}" ]]; then
  echo "ERROR: ADMIN_EMAIL / ADMIN_PASSWORD missing from $E2E_ENV_FILE." >&2
  exit 1
fi

if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "ERROR: SUPABASE_PROJECT_REF missing from $BACKEND_ENV_FILE." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# AUTH_MODE selection (#2236 Part B) — option2 when .env.e2e.auth exists at
# the repo root, option1 (today's behaviour) otherwise.
#
# When .env.e2e.auth is ABSENT this block is a no-op: no new validation, no
# new echo, no variable overrides — the option1 path below is byte-identical
# to this script's behaviour before this change.
# ---------------------------------------------------------------------------

ENV_E2E_AUTH_FILE="${REPO_ROOT}/.env.e2e.auth"
AUTH_MODE="option1"
if [[ -f "$ENV_E2E_AUTH_FILE" ]]; then
  AUTH_MODE="option2"
fi

if [[ "$AUTH_MODE" == "option2" ]]; then
  # shellcheck source=lib/e2e-auth-common.sh
  source "${SCRIPT_DIR}/lib/e2e-auth-common.sh"

  # Fail-closed on: file absent (already ruled out above), any required key
  # missing/empty, or mode != 600 — all reported as E2E_AUTH_PROJECT_NOT_CONFIGURED.
  if ! _e2e_auth_load_and_validate "$ENV_E2E_AUTH_FILE"; then
    exit 1
  fi

  # Same production-collision guard as provision-e2e-auth-identities.sh.
  PROD_REF_SOURCE="$(_e2e_auth_detect_production_ref "$REPO_ROOT")"
  if ! _e2e_auth_collision_guard "$E2E_SUPABASE_PROJECT_REF" "$PROD_REF_SOURCE"; then
    exit 1
  fi

  # Issuer/browser coherence: the ref in the login URL must equal the ref
  # that gets exported to Spring below — a mismatch is otherwise a blanket
  # 401 with zero diagnostic.
  if ! _e2e_auth_coherence_assert "$E2E_SUPABASE_URL" "$E2E_SUPABASE_PROJECT_REF" "E2E_SUPABASE_URL vs E2E_SUPABASE_PROJECT_REF"; then
    exit 1
  fi

  echo ">>> AUTH_MODE=option2 (.env.e2e.auth present) — pointing browser + backend at the dedicated E2E Supabase project (${E2E_SUPABASE_PROJECT_REF})."

  # Point the login endpoint/apikey/identities used below at the E2E
  # project instead of hosted production Supabase Auth.
  VITE_SUPABASE_URL="$E2E_SUPABASE_URL"
  VITE_SUPABASE_PUBLISHABLE_KEY="$E2E_SUPABASE_ANON_KEY"
  ADMIN_EMAIL="$E2E_ADMIN_EMAIL"
  ADMIN_PASSWORD="$E2E_ADMIN_PASSWORD"
  BROKER_EMAIL="$E2E_BROKER_EMAIL"
  BROKER_PASSWORD="$E2E_BROKER_PASSWORD"
  DEALER_EMAIL="$E2E_DEALER_EMAIL"
  DEALER_PASSWORD="$E2E_DEALER_PASSWORD"
  SMOKE_USER_EMAIL="$E2E_USER_EMAIL"
  SMOKE_USER_PASSWORD="$E2E_USER_PASSWORD"

  # This is the WHOLE backend mechanism — no Spring code change needed.
  # apps/api/src/main/resources/application.yml:46 does pure env
  # substitution: issuer-uri: https://${SUPABASE_PROJECT_REF}.supabase.co/auth/v1
  SUPABASE_PROJECT_REF="$E2E_SUPABASE_PROJECT_REF"
fi

# ---------------------------------------------------------------------------
# Step B — Effective fixture config
# ---------------------------------------------------------------------------

PG_TEST_PORT="${PG_TEST_PORT:-5434}"
PG_TEST_PASSWORD="${PG_TEST_PASSWORD:-fixture_test_only}"
export PG_TEST_PORT PG_TEST_PASSWORD

TARGET_SERVER_PORT="${SERVER_PORT:-8085}"
HOLDING_PID="$(port_holder_pid "$TARGET_SERVER_PORT")"
if [[ -n "$HOLDING_PID" ]]; then
  echo "ERROR: backend port ${TARGET_SERVER_PORT} is already held by PID ${HOLDING_PID}." >&2
  echo "Refusing to start local fixture backend on an occupied port." >&2
  exit 1
fi

echo ">>> Effective fixture config: PG_TEST_PORT=${PG_TEST_PORT} (password masked)"

# ---------------------------------------------------------------------------
# Step C — Restore the fixture (reused verbatim; suppress only the final
# postgresql://... line, which embeds the password)
# ---------------------------------------------------------------------------

echo ">>> Restoring local fixture via ${RESTORE_SCRIPT}..."
bash "$RESTORE_SCRIPT" | grep -v '^postgresql://'
RESTORE_EXIT="${PIPESTATUS[0]}"
if [[ "$RESTORE_EXIT" -ne 0 ]]; then
  echo "ERROR: ${RESTORE_SCRIPT} failed (exit ${RESTORE_EXIT})." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step D — Safety gate (fail-closed, in order, before any DB write or auth)
# ---------------------------------------------------------------------------

echo ">>> Running safety gate..."

# D1: host is fixed to localhost in this script's own logic below — there is
# no variable anywhere in this file that could redirect it to a remote host.

# D2: fixture container must be running.
CONTAINER_ID="$(docker ps --filter name=pg-test-fixture --filter status=running -q || true)"
if [[ -z "$CONTAINER_ID" ]]; then
  echo "ERROR: safety gate: fixture container not running — did restore-test-fixture.sh fail silently?" >&2
  exit 1
fi

# D3: local fixture Postgres must be reachable.
if ! PGPASSWORD="$PG_TEST_PASSWORD" psql -h localhost -p "$PG_TEST_PORT" -U postgres -d postgres -c 'SELECT 1' &>/dev/null; then
  echo "ERROR: safety gate: unable to reach local fixture Postgres at localhost:${PG_TEST_PORT}." >&2
  exit 1
fi

echo ">>> Safety gate passed (local fixture confirmed running and reachable on localhost:${PG_TEST_PORT})."

# ---------------------------------------------------------------------------
# Step E — Hosted Supabase Auth login (only after the safety gate passes)
# ---------------------------------------------------------------------------

# Step E and Step F are now one call into scripts/dev/lib/e2e-identity-seed.sh
# (#2427): logging in and seeding the resulting UUID were always a single
# operation, and scripts/run-e2e-local.sh needs the identical operation against
# its own ephemeral fixture. Keeping two copies is what let the E2E gate ship
# without any seeding at all. Admin stays REQUIRED here, exactly as before —
# this script cannot do its job without an admin identity in the fixture.

export E2E_SEED_PG_HOST=localhost
export E2E_SEED_PG_PORT="$PG_TEST_PORT"
export E2E_SEED_PG_PASSWORD="$PG_TEST_PASSWORD"

echo ">>> Seeding local admin identity (idempotent, required)..."
if ! e2e_seed_identity admin "$ADMIN_EMAIL" "$ADMIN_PASSWORD" admin required; then
  echo "ERROR: could not seed the required admin identity into the local fixture." >&2
  exit 1
fi

ADMIN_UUID="$E2E_SEED_LAST_UUID"
ACCESS_TOKEN="$E2E_SEED_LAST_TOKEN"

echo ">>> Supabase Auth login succeeded and admin identity seeded (user id: $ADMIN_UUID)"

# Clean up token files left behind by previous runs (the EXIT trap below can't
# fire across this script's own final exec — see the note further down) before
# creating this run's file. Only ever globs this script's own discoverable
# prefix, never a bare wildcard.
rm -f "${TMPDIR:-/tmp}"/local-fixture-backend-token.* 2>/dev/null || true

TOKEN_FILE="$(mktemp "${TMPDIR:-/tmp}/local-fixture-backend-token.XXXXXX")"
chmod 600 "$TOKEN_FILE"
trap 'rm -f "$TOKEN_FILE"' EXIT
printf '%s' "$ACCESS_TOKEN" > "$TOKEN_FILE"

echo ">>> Access token written to: $TOKEN_FILE (mode 600; build your own 'Authorization: Bearer \$(cat $TOKEN_FILE)' header)"
if [[ "${MOCK_FAIL_AFTER_TOKEN:-}" == "true" ]]; then
  exit 1
fi
echo ">>> NOTE: this script execs apps/api/run-local.sh at the end (Step G) to keep it in the"
echo "    foreground, and bash's EXIT trap does NOT fire across exec. The token file above"
echo "    therefore intentionally survives past this script's own lifetime — use it before"
echo "    restarting the fixture, or remove it manually: rm -f $TOKEN_FILE"

# ---------------------------------------------------------------------------
# Step F — Best-effort broker/user identity seed (#2221)
#
# Step E above seeds ONLY the admin identity, which is a hard requirement for
# this script. Broker and smoke-user accounts authenticate fine against hosted
# Supabase Auth (their JWTs are valid) but — like admin before this — have zero
# public.user_roles rows in a freshly-restored local fixture, so every
# role-gated request they make 403s.
#
# Unlike admin, these are BEST-EFFORT: many flows don't need them, and .env.e2e
# may legitimately omit broker/smoke-user credentials (placeholder or absent),
# in which case those tests already skip themselves gracefully. A failure here
# must never abort the whole script.
# ---------------------------------------------------------------------------

e2e_seed_identity broker \
  "${BROKER_EMAIL:-${DEALER_EMAIL:-}}" \
  "${BROKER_PASSWORD:-${DEALER_PASSWORD:-}}" \
  broker best-effort || true
e2e_seed_identity smoke-user "${SMOKE_USER_EMAIL:-}" "${SMOKE_USER_PASSWORD:-}" user best-effort || true

# ---------------------------------------------------------------------------
# Step G — Start Spring Boot in the foreground against the local fixture
# ---------------------------------------------------------------------------

echo ">>> Starting Spring Boot against the local fixture (hosted JWT validation retained)..."

# SPRING_FLYWAY_ENABLED=false: restore-test-fixture.sh (Step C) already applied every
# migration to this fixture via its own Docker Flyway run against a temp copy of the
# migration files with CONCURRENTLY stripped for throwaway-fixture safety — those temp
# files checksum differently than apps/api/src/main/resources/db/migration's real files.
# Spring Boot's embedded Flyway would re-validate on startup and fail with checksum
# mismatches for every affected migration. The fixture's schema is already correct and
# complete (asserted by restore-test-fixture.sh's own flyway_schema_history row-count
# check), so embedded Flyway has nothing to do here and must be disabled for this path only.
# RATE_LIMIT_DISCOVER_REQUESTS_PER_MINUTE (#1956 AC6.15): DiscoverRateLimitFilter keys the public
# discover GET bucket on the remote IP, and with trust-forwarded-header=false every Playwright worker
# on this machine shares one IP — so a parallel E2E batch collapses into a SINGLE 120 req/min bucket
# and specs start failing on 429s that have nothing to do with the code under test. Verified directly:
# a live curl during a failing batch returned 429,429,429,429,429,200 on the conversion seam's
# navigation-path endpoint.
# The limit is RAISED rather than the filter DISABLED, deliberately. Setting
# RATE_LIMIT_DISCOVER_ENABLED=false would take the filter out of the request path entirely and E2E
# would stop covering it, which could hide a real regression in the limiter itself. Keeping it enabled
# at a high ceiling removes the harness capacity artefact while leaving the filter wired.
# Still overridable from the caller's environment, so a developer testing the limiter can export a low
# value and get the production behaviour back.
# SPRING_TASK_SCHEDULING_ENABLED=false (#2569, set further below alongside SPRING_FLYWAY_ENABLED):
# background @Scheduled jobs (rollups, outbox pollers, retention jobs) have no business running
# against this disposable local fixture — see SchedulingSuppressionConfig (issue #2114) for the
# mechanism this actually wires into.
RATE_LIMIT_DISCOVER_REQUESTS_PER_MINUTE="${RATE_LIMIT_DISCOVER_REQUESTS_PER_MINUTE:-6000}" \
SKIP_BACKEND_ENV_LOAD=true \
SUPABASE_DB_HOST=localhost \
SUPABASE_DB_PORT="$PG_TEST_PORT" \
SUPABASE_DB_NAME=postgres \
SUPABASE_DB_USER=postgres \
SUPABASE_DB_PASSWORD="$PG_TEST_PASSWORD" \
SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL=false \
SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSLMODE=disable \
SPRING_FLYWAY_ENABLED=false \
SPRING_TASK_SCHEDULING_ENABLED=false \
SUPABASE_PROJECT_REF="$SUPABASE_PROJECT_REF" \
AI_API_KEY="${AI_API_KEY:-}" \
exec "${REPO_ROOT}/apps/api/run-local.sh"
