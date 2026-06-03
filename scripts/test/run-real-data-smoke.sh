#!/usr/bin/env bash
# scripts/test/run-real-data-smoke.sh
#
# Spin up the local PostGIS test fixture, then run the Discover real-data
# smoke E2E suite against it.
#
# This script:
#   1. Runs scripts/db/restore-test-fixture.sh to get a healthy fixture DB.
#   2. Captures the DATABASE_URL produced by that script.
#   3. Passes DATABASE_URL as an env var to the smoke test run so the
#      backend uses the ephemeral fixture — NOT the default localhost:5432
#      production DB and NOT any .env.seed values.
#   4. Runs: bash scripts/run-e2e-local.sh --project=full e2e/discover-real-data-smoke.spec.ts
#   5. On completion (pass or fail) prints the result and optionally tears
#      down the container.
#
# Graceful degradation:
#   - Docker not available     → clear error, non-zero exit.
#   - Fixture setup fails      → error printed, non-zero exit (no E2E run).
#   - J3 creds not set         → J3 auto-skips inside the spec (expected).
#   - Fixture DB not healthy   → error from restore-test-fixture.sh, non-zero exit.
#
# J3 note:
#   J3 (authenticated school-radius) skips gracefully when
#   PLAYWRIGHT_BROKER_EMAIL and PLAYWRIGHT_BROKER_PASSWORD are unset.
#   This is the expected behaviour when running without broker credentials.
#
# Usage:
#   bash scripts/test/run-real-data-smoke.sh
#
# Environment (all optional):
#   PG_TEST_PASSWORD         Postgres fixture password  (default: fixture_test_only)
#   PG_TEST_PORT             Fixture port               (default: 5434)
#   PLAYWRIGHT_BROKER_EMAIL  Broker email for J3        (default: unset → J3 skips)
#   PLAYWRIGHT_BROKER_PASSWORD Broker password for J3   (default: unset → J3 skips)
#   KEEP_FIXTURE             Set to "true" to leave the container running after tests
#   BACKEND_BASE_URL         Override backend URL for the smoke spec
#                            (default: http://localhost:8085 via run-e2e-local.sh)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RESTORE_SCRIPT="${REPO_ROOT}/scripts/db/restore-test-fixture.sh"
E2E_RUNNER="${REPO_ROOT}/scripts/run-e2e-local.sh"
SMOKE_SPEC="e2e/discover-real-data-smoke.spec.ts"

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

if [[ ! -f "${RESTORE_SCRIPT}" ]]; then
  echo "ERROR: restore script not found: ${RESTORE_SCRIPT}" >&2
  exit 1
fi

if [[ ! -f "${E2E_RUNNER}" ]]; then
  echo "ERROR: E2E runner not found: ${E2E_RUNNER}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Port conflict check
# ---------------------------------------------------------------------------

PG_PORT="${PG_TEST_PORT:-5434}"
if docker ps --format '{{.Ports}}' 2>/dev/null | grep -q "[0-9.]*:${PG_PORT}->"; then
  CONFLICT=$(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null \
    | grep "[0-9.]*:${PG_PORT}->" | awk '{print $1}' || true)
  echo "ERROR: Port ${PG_PORT} already bound by container '${CONFLICT}'." >&2
  echo "Stop it first:  docker rm -f ${CONFLICT}" >&2
  echo "Or override:    PG_TEST_PORT=5435 $0" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# J3 credential status
# ---------------------------------------------------------------------------

BROKER_EMAIL="${PLAYWRIGHT_BROKER_EMAIL:-}"
BROKER_PASSWORD="${PLAYWRIGHT_BROKER_PASSWORD:-}"
if [[ -z "${BROKER_EMAIL}" || -z "${BROKER_PASSWORD}" ]]; then
  echo "==> NOTE: PLAYWRIGHT_BROKER_EMAIL / PLAYWRIGHT_BROKER_PASSWORD not set."
  echo "    J3 (authenticated school-radius) will be skipped automatically by the spec."
  echo "    This is expected for local CI runs without broker credentials."
else
  echo "==> Broker credentials detected — J3 will run."
fi

# ---------------------------------------------------------------------------
# Step 1: Set up the fixture
# ---------------------------------------------------------------------------

echo ""
echo "==> Step 1/3: Setting up PostGIS test fixture..."
echo ""

# Capture stdout; restore script prints DATABASE_URL as the last non-empty line
PG_PASSWORD="${PG_TEST_PASSWORD:-fixture_test_only}"
FIXTURE_OUTPUT=$(bash "${RESTORE_SCRIPT}" 2>&1)
RESTORE_EXIT=$?

echo "${FIXTURE_OUTPUT}"

if [[ "${RESTORE_EXIT}" -ne 0 ]]; then
  echo "" >&2
  echo "ERROR: restore-test-fixture.sh failed (exit ${RESTORE_EXIT})." >&2
  exit 1
fi

# Extract the DATABASE_URL line (postgresql://...)
DATABASE_URL=$(echo "${FIXTURE_OUTPUT}" | grep '^postgresql://' | tail -1)
if [[ -z "${DATABASE_URL}" ]]; then
  echo "ERROR: Could not extract DATABASE_URL from restore-test-fixture.sh output." >&2
  exit 1
fi

# Safety check: must be localhost only — never allow a remote URL here
if ! echo "${DATABASE_URL}" | grep -qE '@localhost:|@127\.0\.0\.1:'; then
  echo "ERROR: DATABASE_URL does not point to localhost. Refusing to proceed." >&2
  echo "  Got host: $(echo "${DATABASE_URL}" | sed 's|.*@||;s|/.*||')" >&2
  exit 1
fi

echo ""
echo "==> Fixture DATABASE_URL captured (host: localhost:${PG_PORT})."
# Do NOT echo the full URL here (contains password). Log a redacted version.
REDACTED_URL=$(echo "${DATABASE_URL}" | sed 's|://[^:]*:[^@]*@|://***:***@|')
echo "    Redacted: ${REDACTED_URL}"

# ---------------------------------------------------------------------------
# B2 (AC5): Convert fixture URL to JDBC form for Spring Boot datasource override.
#
# Spring Boot property priority: OS environment > application.yml.
# run-local.sh does `mvn -DskipTests spring-boot:run` with NO -Dspring.datasource.*
# flags, so SPRING_DATASOURCE_* env vars we export here will outrank the
# application.yml placeholders (${SUPABASE_DB_HOST} etc.).
# run-e2e-local.sh sources .env.e2e (frontend/Playwright vars only) and does not
# export SPRING_DATASOURCE_* either — our values are never overwritten.
#
# URL conversion: postgresql://user:pass@host:port/db
#              →  jdbc:postgresql://host:port/db
# SSL is NOT required for a localhost fixture (sslmode=require breaks local psql).
# Username and password are extracted and passed as separate Spring props.
# ---------------------------------------------------------------------------

# Extract components from postgresql://user:pass@host:port/db
_FIXTURE_HOST_PORT=$(echo "${DATABASE_URL}" | sed 's|.*@||;s|/[^/]*$||')
_FIXTURE_DB=$(echo "${DATABASE_URL}"       | sed 's|.*/||')
_FIXTURE_USER=$(echo "${DATABASE_URL}"     | sed 's|.*://||;s|:.*||')
_FIXTURE_PASS=$(echo "${DATABASE_URL}"     | sed 's|.*://[^:]*:||;s|@.*||')

# sslmode=disable: the plain PostGIS container does not support SSL.
# Without this the JDBC driver negotiates SSL and the connection is refused.
SPRING_DATASOURCE_URL="jdbc:postgresql://${_FIXTURE_HOST_PORT}/${_FIXTURE_DB}?sslmode=disable"
SPRING_DATASOURCE_USERNAME="${_FIXTURE_USER}"
# password assigned but never echoed
SPRING_DATASOURCE_PASSWORD="${_FIXTURE_PASS}"
# Neutralise application.yml L11-12:
#   spring.datasource.hikari.data-source-properties.ssl: true
#   spring.datasource.hikari.data-source-properties.sslmode: require
# HikariCP reads these via dataSourceProperties, so they must be overridden
# independently of the JDBC URL's sslmode parameter.
SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL=false
SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSLMODE=disable

# BACKEND_BASE_URL: default to local backend so the smoke spec's school pre-fetch
# and waitForResponse calls hit the fixture-backed backend, not the cloud default.
BACKEND_BASE_URL="${BACKEND_BASE_URL:-http://localhost:8085}"

echo "==> Spring datasource wired to fixture (SPRING_DATASOURCE_URL=$(echo "${SPRING_DATASOURCE_URL}" | sed 's|//.*@|//***:***@|'))."
echo "==> BACKEND_BASE_URL=${BACKEND_BASE_URL}"

# ---------------------------------------------------------------------------
# Teardown trap (runs on EXIT regardless of pass/fail, unless KEEP_FIXTURE=true)
# ---------------------------------------------------------------------------

cleanup() {
  if [[ "${KEEP_FIXTURE:-false}" != "true" ]]; then
    echo ""
    echo "==> Tearing down test fixture container..."
    docker rm -f pg-test-fixture 2>/dev/null || true
    echo "==> Container removed."
  else
    echo ""
    echo "==> KEEP_FIXTURE=true — leaving container running."
    echo "    Remove manually: docker rm -f pg-test-fixture"
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Step 2: Run the smoke spec
# ---------------------------------------------------------------------------

echo ""
echo "==> Step 2/3: Running real-data smoke spec..."
echo "    Spec: ${SMOKE_SPEC}"
echo ""

E2E_EXIT=0
DATABASE_URL="${DATABASE_URL}" \
  SPRING_DATASOURCE_URL="${SPRING_DATASOURCE_URL}" \
  SPRING_DATASOURCE_USERNAME="${SPRING_DATASOURCE_USERNAME}" \
  SPRING_DATASOURCE_PASSWORD="${SPRING_DATASOURCE_PASSWORD}" \
  SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL="${SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSL}" \
  SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSLMODE="${SPRING_DATASOURCE_HIKARI_DATA_SOURCE_PROPERTIES_SSLMODE}" \
  BACKEND_BASE_URL="${BACKEND_BASE_URL}" \
  PLAYWRIGHT_BROKER_EMAIL="${BROKER_EMAIL}" \
  PLAYWRIGHT_BROKER_PASSWORD="${BROKER_PASSWORD}" \
  bash "${E2E_RUNNER}" --project=full "${SMOKE_SPEC}" || E2E_EXIT=$?

# ---------------------------------------------------------------------------
# Step 3: Report
# ---------------------------------------------------------------------------

echo ""
echo "==> Step 3/3: Result"
if [[ "${E2E_EXIT}" -eq 0 ]]; then
  echo "    PASS — discover-real-data-smoke all journeys passed."
else
  echo "    FAIL — discover-real-data-smoke exited with code ${E2E_EXIT}." >&2
fi

exit "${E2E_EXIT}"
