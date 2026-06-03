#!/usr/bin/env bash
# scripts/db/restore-test-fixture.sh
#
# Set up a local throwaway PostGIS container, apply all Flyway migrations
# (V0..V83) via the Flyway 10.20.1 Docker image, then load the synthetic
# E2E seed data.
#
# NEVER run against a real/production database — this script drops and
# recreates the container from scratch on every run.
#
# Usage:
#   bash scripts/db/restore-test-fixture.sh
#
# Environment (all optional — defaults are shown):
#   PG_TEST_PASSWORD   Postgres superuser password       (default: fixture_test_only)
#   PG_TEST_PORT       Host port to bind                 (default: 5434)
#   SKIP_SEED          Set to "true" to skip seed step   (default: unset / false)
#
# On success the script prints the DATABASE_URL to stdout. Capture it:
#   export DATABASE_URL=$(bash scripts/db/restore-test-fixture.sh | grep '^postgresql://')
#
# Exit codes:
#   0  success
#   1  pre-check or runtime failure

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MIGRATION_DIR="${REPO_ROOT}/backend/src/main/resources/db/migration"
SEED_FILE="${SCRIPT_DIR}/fixtures/discover-smoke-seed.sql"

PG_PASSWORD="${PG_TEST_PASSWORD:-fixture_test_only}"
PG_PORT="${PG_TEST_PORT:-5434}"
CONTAINER="pg-test-fixture"
DB_NAME="postgres"
DB_USER="postgres"

# Intentionally NOT exported — never leak the password to subshell env via DATABASE_URL print
_DB_URL="postgresql://${DB_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${DB_NAME}"

# Flyway image must match the version managed by Spring Boot 3.4.1 BOM → 10.20.1
FLYWAY_IMAGE="flyway/flyway:10.20.1"

# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------

if ! command -v docker &>/dev/null; then
  echo "ERROR: docker not found. Install Docker Desktop or Docker Engine first." >&2
  exit 1
fi

if ! docker info &>/dev/null; then
  echo "ERROR: Docker daemon is not running. Start Docker and retry." >&2
  exit 1
fi

if [[ ! -d "${MIGRATION_DIR}" ]]; then
  echo "ERROR: Migration directory not found: ${MIGRATION_DIR}" >&2
  echo "Run this script from the repository root or ensure backend/src/main/resources/db/migration exists." >&2
  exit 1
fi

if [[ ! -f "${SEED_FILE}" ]]; then
  echo "ERROR: Seed file not found: ${SEED_FILE}" >&2
  exit 1
fi

# Count migrations (V*.sql files)
MIGRATION_COUNT=$(find "${MIGRATION_DIR}" -name "V*.sql" | wc -l | tr -d ' ')
echo "==> Found ${MIGRATION_COUNT} Flyway migration file(s) in ${MIGRATION_DIR}"

# ---------------------------------------------------------------------------
# Port conflict check
# ---------------------------------------------------------------------------

if docker ps --format '{{.Ports}}' 2>/dev/null | grep -q "[0-9.]*:${PG_PORT}->"; then
  CONFLICT=$(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null \
    | grep "[0-9.]*:${PG_PORT}->" | awk '{print $1}' || true)
  echo "ERROR: Port ${PG_PORT} is already bound by container '${CONFLICT}'." >&2
  echo "Stop it first:  docker rm -f ${CONFLICT}" >&2
  echo "Or override:    PG_TEST_PORT=5435 $0" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Container lifecycle
# ---------------------------------------------------------------------------

echo "==> Removing existing test-fixture container (if any)..."
docker rm -f "${CONTAINER}" 2>/dev/null || true

echo "==> Starting PostGIS container (postgis/postgis:15-3.4) on port ${PG_PORT}..."
docker run -d \
  --name "${CONTAINER}" \
  -p "127.0.0.1:${PG_PORT}:5432" \
  -e "POSTGRES_PASSWORD=${PG_PASSWORD}" \
  -e "POSTGRES_DB=${DB_NAME}" \
  -e "POSTGRES_USER=${DB_USER}" \
  postgis/postgis:15-3.4

# ---------------------------------------------------------------------------
# Health-check: wait for Postgres to accept connections
# ---------------------------------------------------------------------------

echo "==> Waiting for Postgres to become ready..."
ATTEMPTS=0
MAX_ATTEMPTS=30
until PGPASSWORD="${PG_PASSWORD}" psql -h localhost -p "${PG_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
      -c "SELECT 1" -q 2>/dev/null; do
  ATTEMPTS=$(( ATTEMPTS + 1 ))
  if [[ "${ATTEMPTS}" -ge "${MAX_ATTEMPTS}" ]]; then
    echo "ERROR: Postgres did not become ready after ${MAX_ATTEMPTS}s." >&2
    docker logs "${CONTAINER}" >&2
    exit 1
  fi
  sleep 1
done
echo "==> Postgres is ready."

# ---------------------------------------------------------------------------
# Verify PostGIS extension is available (it ships in the image but confirm)
# ---------------------------------------------------------------------------

POSTGIS_VER=$(PGPASSWORD="${PG_PASSWORD}" psql -h localhost -p "${PG_PORT}" -U "${DB_USER}" \
  -d "${DB_NAME}" -t -A -c "SELECT postgis_lib_version();" 2>/dev/null || echo "")
if [[ -z "${POSTGIS_VER}" ]]; then
  echo "ERROR: PostGIS extension not available in container." >&2
  exit 1
fi
echo "==> PostGIS version: ${POSTGIS_VER}"

# ---------------------------------------------------------------------------
# Apply Flyway migrations via Docker image
#
# Strategy:
#   1. Apply V0 (pure DDL, no Supabase deps) directly via psql.
#   2. Apply V0.1 (Supabase auth.users deps) via psql with error suppression
#      — the statements that fail (auth.users FK, auth.uid() triggers) are
#      non-fatal for our fixture; we tolerate the errors and proceed.
#      Alternatively: use Flyway `baseline` at version 0.1 to mark both as done.
#   3. Run Flyway from V1..V83 using -baselineOnMigrate=true -baselineVersion=0.1
#      which tells Flyway "treat everything up to 0.1 as already applied".
#
#   History table: flyway_schema_history (Flyway 10.x default).
# ---------------------------------------------------------------------------

echo "==> Applying Flyway migrations (image: ${FLYWAY_IMAGE})..."

# Step 1: Create Supabase-managed roles that many migrations reference.
# On a bare PostGIS container these roles do not exist; creating them as
# empty roles lets GRANT / POLICY / RLS statements succeed without enforcing
# real access control (which is fine for a throwaway test fixture).
echo "==> Creating Supabase-compatible roles (anon, authenticated, service_role)..."
PGPASSWORD="${PG_PASSWORD}" psql -h localhost -p "${PG_PORT}" -U "${DB_USER}" \
  -d "${DB_NAME}" -q <<'ROLES_SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;
-- auth schema stub: V0.1 references auth.users as a FK target.
-- Create a minimal auth.users table so the FK constraint can be added.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);
-- auth.uid() function stub: used in RLS policies
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULL::UUID;
$$ LANGUAGE SQL STABLE;
ROLES_SQL

# Step 2: Apply V0 (initial schema — pure DDL, safe on bare PostGIS)
echo "==> Applying V0 (initial schema) via psql..."
PGPASSWORD="${PG_PASSWORD}" psql -h localhost -p "${PG_PORT}" -U "${DB_USER}" \
  -d "${DB_NAME}" -q -f "${MIGRATION_DIR}/V0__initial_schema.sql"

# Step 3: Apply V0.1 (auth RLS policies — now works because auth.users + roles exist)
# Errors are tolerated (some statements may fail on edge-case Postgres versions) but
# are surfaced to stderr so they are visible in CI logs rather than silently swallowed.
echo "==> Applying V0.1 (auth RLS policies — any errors will be shown below)..."
V01_LOG=$(mktemp)
if ! PGPASSWORD="${PG_PASSWORD}" psql -h localhost -p "${PG_PORT}" -U "${DB_USER}" \
  -d "${DB_NAME}" -q -f "${MIGRATION_DIR}/V0.1__auth_rls_policies.sql" 2>"${V01_LOG}"; then
  echo "==> V0.1 exited non-zero (expected for Supabase-specific statements):" >&2
  cat "${V01_LOG}" >&2
fi
if [[ -s "${V01_LOG}" ]]; then
  echo "==> V0.1 stderr (tolerated):" >&2
  cat "${V01_LOG}" >&2
fi
rm -f "${V01_LOG}"

# Detect the Docker host address (macOS vs Linux)
if docker run --rm alpine sh -c "getent hosts host.docker.internal" &>/dev/null; then
  DOCKER_HOST_ADDR="host.docker.internal"
else
  # Linux: use the docker bridge gateway
  DOCKER_HOST_ADDR=$(docker network inspect bridge \
    --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null || echo "172.17.0.1")
fi

FLYWAY_URL="jdbc:postgresql://${DOCKER_HOST_ADDR}:${PG_PORT}/${DB_NAME}"

# Step 3: Run Flyway to apply V1..V83.
# -baselineOnMigrate=true + -baselineVersion=0.1 tells Flyway:
#   "The DB already has schema through version 0.1; apply everything after that."
# Flyway creates flyway_schema_history, inserts a baseline row for 0.1, then
# applies V1..V83 in order.
docker run --rm \
  --add-host="host.docker.internal:host-gateway" \
  -v "${MIGRATION_DIR}:/flyway/sql:ro" \
  "${FLYWAY_IMAGE}" \
  -url="${FLYWAY_URL}" \
  -user="${DB_USER}" \
  -password="${PG_PASSWORD}" \
  -locations="filesystem:/flyway/sql" \
  -baselineOnMigrate=true \
  -baselineVersion=0.1 \
  "-placeholders.concurrently_keyword=" \
  migrate

echo "==> Flyway migration complete."

# ---------------------------------------------------------------------------
# Backfill V65 Java migration record
#
# V65__EncryptPhoneAtRest is a Flyway Java migration (BaseJavaMigration) at
# classpath:com/example/realestate/migration. The Flyway Docker container only
# runs SQL files, so it never writes a V65 row. Spring Boot's embedded Flyway
# scans both SQL and Java locations; finding V65 on the classpath but absent
# from flyway_schema_history it throws FlywayValidateException on startup.
#
# The migration is fully idempotent: it selects profiles rows where phone IS
# NOT NULL AND phone NOT LIKE 'ENC:%'. The fixture seed inserts no phone data,
# so V65 is a provable no-op. Inserting a synthetic JDBC row here is correct
# and does not affect the schema in any way.
#
# type=JDBC identifies Java migrations; checksum=NULL is correct (Flyway does
# not compute checksums for Java migrations); installed_rank=85 is beyond the
# 83 SQL rows already inserted.
# ---------------------------------------------------------------------------

PGPASSWORD="${PG_PASSWORD}" psql -h localhost -p "${PG_PORT}" -U "${DB_USER}" \
  -d "${DB_NAME}" -t -A \
  -c "INSERT INTO flyway_schema_history
        (installed_rank, version, description, type, script, checksum,
         installed_by, installed_on, execution_time, success)
      VALUES
        (85, '65', 'EncryptPhoneAtRest', 'JDBC',
         'com.example.realestate.migration.V65__EncryptPhoneAtRest',
         NULL, 'fixture', now(), 0, true)
      ON CONFLICT (installed_rank) DO NOTHING;" 2>/dev/null
echo "==> V65 Java migration record backfilled in flyway_schema_history."

# ---------------------------------------------------------------------------
# Assert migration count in flyway_schema_history
# ---------------------------------------------------------------------------

APPLIED=$(PGPASSWORD="${PG_PASSWORD}" psql -h localhost -p "${PG_PORT}" -U "${DB_USER}" \
  -d "${DB_NAME}" -t -A \
  -c "SELECT COUNT(*) FROM flyway_schema_history WHERE success = true;" 2>/dev/null || echo "0")

echo "==> Flyway: ${APPLIED} rows in flyway_schema_history (expected exactly 84)."

# Expected count = 84:
#   1  baseline row for V0.1 (Flyway -baselineOnMigrate inserts this)
#  82  applied rows for V1..V83, V65 absent as SQL (V64→V66 gap in SQL files)
#   1  synthetic JDBC row for V65__EncryptPhoneAtRest (Java migration, no-op on empty fixture)
# Total = 84 rows with success = true.
if [[ "${APPLIED}" -ne 84 ]]; then
  echo "ERROR: Expected exactly 84 rows in flyway_schema_history, got ${APPLIED}." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Verify PostGIS and geog column exist post-migration
# ---------------------------------------------------------------------------

POSTGIS_CHECK=$(PGPASSWORD="${PG_PASSWORD}" psql -h localhost -p "${PG_PORT}" -U "${DB_USER}" \
  -d "${DB_NAME}" -t -A \
  -c "SELECT postgis_version();" 2>/dev/null || echo "")
if [[ -z "${POSTGIS_CHECK}" ]]; then
  echo "ERROR: postgis_version() returned empty after migration." >&2
  exit 1
fi
echo "==> PostGIS version (post-migrate): ${POSTGIS_CHECK}"

GEOG_COL=$(PGPASSWORD="${PG_PASSWORD}" psql -h localhost -p "${PG_PORT}" -U "${DB_USER}" \
  -d "${DB_NAME}" -t -A \
  -c "SELECT column_name FROM information_schema.columns
      WHERE table_name = 'property_listings' AND column_name = 'geog';" 2>/dev/null || echo "")
if [[ "${GEOG_COL}" != "geog" ]]; then
  echo "ERROR: property_listings.geog column not found after migration (V73 may have failed)." >&2
  exit 1
fi
echo "==> geog column confirmed on property_listings."

# ---------------------------------------------------------------------------
# Load seed data
# ---------------------------------------------------------------------------

if [[ "${SKIP_SEED:-false}" == "true" ]]; then
  echo "==> SKIP_SEED=true — skipping seed load."
else
  echo "==> Loading synthetic E2E seed data from ${SEED_FILE}..."
  PGPASSWORD="${PG_PASSWORD}" psql -h localhost -p "${PG_PORT}" -U "${DB_USER}" \
    -d "${DB_NAME}" -f "${SEED_FILE}"
  echo "==> Seed load complete."
fi

# ---------------------------------------------------------------------------
# Row-count validation
# ---------------------------------------------------------------------------

echo "==> Running row-count validation..."
PGPASSWORD="${PG_PASSWORD}" psql -h localhost -p "${PG_PORT}" -U "${DB_USER}" \
  -d "${DB_NAME}" <<'SQL'
\echo '--- cities ---'
SELECT COUNT(*) AS city_count FROM cities;
\echo '--- areas (Udupi city) ---'
SELECT COUNT(*) AS udupi_area_count FROM areas a
  JOIN cities c ON c.id = a.city_id WHERE c.slug = 'udupi';
\echo '--- schools with area_key (Manipal) ---'
SELECT COUNT(*) AS manipal_school_count FROM schools WHERE area_key = 'IN|KA|Udupi|Manipal';
\echo '--- LIVE [E2E] listings ---'
SELECT COUNT(*) AS live_e2e_count FROM property_listings
  WHERE status = 'LIVE' AND title LIKE '[E2E]%';
\echo '--- LIVE [E2E] Manipal apartment listings ---'
SELECT COUNT(*) AS manipal_apartment_count FROM property_listings
  WHERE status = 'LIVE' AND title LIKE '[E2E]%'
    AND area_key = 'IN|KA|Udupi|Manipal'
    AND LOWER(title) LIKE '%apartment%';
\echo '--- geog centroid sample (Manipal listings) ---'
SELECT ST_AsText(geog::geometry) AS point FROM property_listings
  WHERE status = 'LIVE' AND area_key = 'IN|KA|Udupi|Manipal' AND title LIKE '[E2E]%'
  LIMIT 2;
SQL

# ---------------------------------------------------------------------------
# Print DATABASE_URL (password intentionally included — localhost only)
# ---------------------------------------------------------------------------

echo ""
echo "==> Fixture ready."
echo ""
echo "    Container : ${CONTAINER}"
echo "    Port      : ${PG_PORT}"
echo ""
# Print the DATABASE_URL on its own line so callers can grep/capture it
echo "postgresql://${DB_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${DB_NAME}"
