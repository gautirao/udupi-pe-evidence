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
#   4. Log in to hosted Supabase Auth (password grant) as ADMIN_EMAIL, exactly
#      mirroring e2e/admin-approval.spec.ts's call shape.
#   5. Idempotently seed auth.users + public.user_roles('admin') for that
#      admin's UUID inside the local fixture.
#   6. exec backend/run-local.sh with SKIP_BACKEND_ENV_LOAD=true and local
#      datasource overrides, keeping hosted JWT validation (SUPABASE_PROJECT_REF).
#
# Usage (from anywhere):
#   bash scripts/dev/local-fixture-backend.sh
#
# Required files (not sourced for their DB_* values — see below):
#   backend/.env   — SUPABASE_PROJECT_REF, AI_API_KEY
#   .env.e2e       — ADMIN_EMAIL, ADMIN_PASSWORD
#   .env           — VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
#
# IMPORTANT: this script sources ALL of backend/.env (Step B), which may include
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

BACKEND_ENV_FILE="${REPO_ROOT}/backend/.env"
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
# Load required vars from .env, .env.e2e, backend/.env — never for SUPABASE_DB_*
# ---------------------------------------------------------------------------

set -a
# shellcheck source=/dev/null
source "$ROOT_ENV_FILE"
# shellcheck source=/dev/null
source "$E2E_ENV_FILE"
# shellcheck source=/dev/null
source "$BACKEND_ENV_FILE"
set +a

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
# Step B — Effective fixture config
# ---------------------------------------------------------------------------

PG_TEST_PORT="${PG_TEST_PORT:-5434}"
PG_TEST_PASSWORD="${PG_TEST_PASSWORD:-fixture_test_only}"
export PG_TEST_PORT PG_TEST_PASSWORD

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

echo ">>> Logging in to hosted Supabase Auth as ADMIN_EMAIL..."

export JQ_ADMIN_PASSWORD="$ADMIN_PASSWORD"
LOGIN_BODY="$(jq -n --arg email "$ADMIN_EMAIL" '{email: $email, password: env.JQ_ADMIN_PASSWORD}')"
unset JQ_ADMIN_PASSWORD

LOGIN_RESPONSE="$(curl -sS -X POST "${VITE_SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "Content-Type: application/json" \
  -H "apikey: ${VITE_SUPABASE_PUBLISHABLE_KEY}" \
  -d "$LOGIN_BODY")"

ADMIN_UUID="$(echo "$LOGIN_RESPONSE" | jq -r '.user.id // empty')"
ACCESS_TOKEN="$(echo "$LOGIN_RESPONSE" | jq -r '.access_token // empty')"

UUID_REGEX='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

if [[ ! "$ADMIN_UUID" =~ $UUID_REGEX ]]; then
  echo "ERROR: hosted Supabase Auth login did not return a valid user id." >&2
  exit 1
fi

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "ERROR: hosted Supabase Auth login did not return an access token." >&2
  exit 1
fi

echo ">>> Hosted Supabase Auth login succeeded (user id: $ADMIN_UUID)"

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
echo ">>> NOTE: this script execs backend/run-local.sh at the end (Step G) to keep it in the"
echo "    foreground, and bash's EXIT trap does NOT fire across exec. The token file above"
echo "    therefore intentionally survives past this script's own lifetime — use it before"
echo "    restarting the fixture, or remove it manually: rm -f $TOKEN_FILE"

# ---------------------------------------------------------------------------
# Step F — Idempotent, transactional identity seed
# ---------------------------------------------------------------------------

echo ">>> Seeding local admin identity (idempotent)..."

# NOTE: this INSERT INTO auth.users does NOT fire the V0.1 on_auth_user_created
# trigger (which would otherwise auto-insert a 'user' role via NEW.email /
# NEW.raw_user_meta_data, columns this fixture's minimal auth.users stub
# doesn't have). That trigger was already dropped by
# scripts/db/fixtures/discover-smoke-seed.sql (loaded during Step C's
# restore-test-fixture.sh run) specifically to make this kind of insert safe.
# So no implicit 'user' role gets auto-assigned here, unlike what would
# happen against a real Supabase-managed auth.users table — only the
# explicit 'admin' row below is created by this script.
PGPASSWORD="$PG_TEST_PASSWORD" psql -h localhost -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
BEGIN;
INSERT INTO auth.users (id) VALUES ('${ADMIN_UUID}') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role) VALUES ('${ADMIN_UUID}', 'admin') ON CONFLICT (user_id, role) DO NOTHING;
COMMIT;
SQL

echo ">>> Local admin identity seeded (auth.users + user_roles 'admin')."

# ---------------------------------------------------------------------------
# Step G — Start Spring Boot in the foreground against the local fixture
# ---------------------------------------------------------------------------

echo ">>> Starting Spring Boot against the local fixture (hosted JWT validation retained)..."

# SPRING_FLYWAY_ENABLED=false: restore-test-fixture.sh (Step C) already applied every
# migration to this fixture via its own Docker Flyway run against a temp copy of the
# migration files with CONCURRENTLY stripped for throwaway-fixture safety — those temp
# files checksum differently than backend/src/main/resources/db/migration's real files.
# Spring Boot's embedded Flyway would re-validate on startup and fail with checksum
# mismatches for every affected migration. The fixture's schema is already correct and
# complete (asserted by restore-test-fixture.sh's own flyway_schema_history row-count
# check), so embedded Flyway has nothing to do here and must be disabled for this path only.
SKIP_BACKEND_ENV_LOAD=true \
SUPABASE_DB_HOST=localhost \
SUPABASE_DB_PORT="$PG_TEST_PORT" \
SUPABASE_DB_NAME=postgres \
SUPABASE_DB_USER=postgres \
SUPABASE_DB_PASSWORD="$PG_TEST_PASSWORD" \
SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL=false \
SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSLMODE=disable \
SPRING_FLYWAY_ENABLED=false \
SUPABASE_PROJECT_REF="$SUPABASE_PROJECT_REF" \
AI_API_KEY="${AI_API_KEY:-}" \
exec "${REPO_ROOT}/backend/run-local.sh"
