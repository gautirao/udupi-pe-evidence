#!/usr/bin/env bash
# scripts/dev/seed-navigation-hierarchy-fixture.sh — #1956 PR-5
#
# Applies scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql to the ALREADY-RUNNING local
# fixture Postgres container (started by scripts/db/restore-test-fixture.sh /
# scripts/dev/local-fixture-backend.sh). Additive-only, idempotent — safe to re-run any number of
# times against a container other sessions may also be using.
#
# This script does NOT touch apps/api/run-local.sh or any already-running Spring Boot process. The
# navigation cache only reloads a city's tree on its own eager startup preload or a promotion event
# (see NavigationGraphCache/NavigationCachePreloadRunner) — never on a raw navigation_nodes write —
# so seeded rows are invisible to an already-running backend until a FRESH backend process starts
# against this same database. Deliberately out of scope here: starting/restarting any backend
# process requires its own explicit step (see the README note this script prints at the end) and is
# never done automatically by a DB-only seed script.
#
# Usage (from anywhere, once the fixture container is already up):
#   bash scripts/dev/seed-navigation-hierarchy-fixture.sh
#
# Optional overrides (same defaults as scripts/dev/local-fixture-backend.sh):
#   PG_TEST_PORT       Host port for the local fixture (default: 5434)
#   PG_TEST_PASSWORD   Postgres superuser password for the fixture (default: fixture_test_only)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SEED_FILE="${REPO_ROOT}/scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql"
LISTINGS_SEED_FILE="${REPO_ROOT}/scripts/db/fixtures/navigation-hierarchy-fixture-listings-seed.sql"

PG_TEST_PORT="${PG_TEST_PORT:-5434}"
PG_TEST_PASSWORD="${PG_TEST_PASSWORD:-fixture_test_only}"

echo ">>> Validating prerequisites..."

for BIN in docker psql; do
  if ! command -v "$BIN" &>/dev/null; then
    echo "ERROR: required command not found: $BIN" >&2
    exit 1
  fi
done

if [[ ! -f "$SEED_FILE" ]]; then
  echo "ERROR: $SEED_FILE not found." >&2
  exit 1
fi

if [[ ! -f "$LISTINGS_SEED_FILE" ]]; then
  echo "ERROR: $LISTINGS_SEED_FILE not found." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Safety gate (fail-closed, mirrors scripts/dev/local-fixture-backend.sh Step D) — never touches a
# database this isn't provably the disposable local fixture container.
# ---------------------------------------------------------------------------

echo ">>> Running safety gate..."

CONTAINER_ID="$(docker ps --filter name=pg-test-fixture --filter status=running -q || true)"
if [[ -z "$CONTAINER_ID" ]]; then
  echo "ERROR: safety gate: fixture container 'pg-test-fixture' not running. Start it first via" >&2
  echo "       scripts/db/restore-test-fixture.sh or scripts/dev/local-fixture-backend.sh." >&2
  exit 1
fi

if ! PGPASSWORD="$PG_TEST_PASSWORD" psql -h localhost -p "$PG_TEST_PORT" -U postgres -d postgres -c 'SELECT 1' &>/dev/null; then
  echo "ERROR: safety gate: unable to reach local fixture Postgres at localhost:${PG_TEST_PORT}." >&2
  exit 1
fi

echo ">>> Safety gate passed (local fixture confirmed running and reachable on localhost:${PG_TEST_PORT})."

# ---------------------------------------------------------------------------
# Apply the additive, idempotent seed
# ---------------------------------------------------------------------------

echo ">>> Applying ${SEED_FILE}..."
PGPASSWORD="$PG_TEST_PASSWORD" psql -h localhost -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$SEED_FILE"

echo ">>> Applying ${LISTINGS_SEED_FILE}..."
PGPASSWORD="$PG_TEST_PASSWORD" psql -h localhost -p "$PG_TEST_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$LISTINGS_SEED_FILE"

echo ">>> Navigation hierarchy fixture seed applied (nodes + listings)."
echo ">>> NOTE: these rows are NOT yet visible to any already-running backend (the navigation cache"
echo "    reloads only on its own startup preload or a promotion event). To make them visible without"
echo "    disturbing a shared backend on the reserved port, start a SEPARATE backend process on an"
echo "    unused port against this same fixture database, e.g.:"
echo "      SKIP_BACKEND_ENV_LOAD=true SUPABASE_DB_HOST=localhost SUPABASE_DB_PORT=${PG_TEST_PORT} \\"
echo "      SUPABASE_DB_NAME=postgres SUPABASE_DB_USER=postgres SUPABASE_DB_PASSWORD=<PG_TEST_PASSWORD> \\"
echo "      SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL=false \\"
echo "      SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSLMODE=disable SPRING_FLYWAY_ENABLED=false \\"
echo "      SERVER_PORT=<unused-port> \\"
echo "      apps/api/run-local.sh"
echo "    Restarting or mutating the SHARED backend process requires separate explicit authorisation."
