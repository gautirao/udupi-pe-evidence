#!/usr/bin/env bash
# scripts/db/seed-agricultural-listings.sh
#
# Apply the synthetic [AGRI] agricultural listings seed to the local test fixture DB.
#
# !! NEVER run against a real/production database !!
# !! This seed inserts fabricated test data only !!
#
# Prerequisites:
#   1. A local PostGIS container must already be running with all Flyway
#      migrations applied — run scripts/db/restore-test-fixture.sh first.
#   2. psql must be available on PATH.
#
# Usage:
#   bash scripts/db/seed-agricultural-listings.sh
#
# Environment (all optional — defaults are shown):
#   PG_TEST_PASSWORD   Postgres superuser password   (default: fixture_test_only)
#   PG_TEST_PORT       Host port to connect to        (default: 5434)
#
# Exit codes:
#   0  success
#   1  pre-check or runtime failure

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_FILE="${SCRIPT_DIR}/fixtures/agricultural-listings-seed.sql"

PG_PASSWORD="${PG_TEST_PASSWORD:-fixture_test_only}"
PG_PORT="${PG_TEST_PORT:-5434}"
DB_NAME="postgres"
DB_USER="postgres"

# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------

if [[ ! -f "${SEED_FILE}" ]]; then
  echo "ERROR: Seed file not found: ${SEED_FILE}" >&2
  exit 1
fi

if ! command -v psql &>/dev/null; then
  echo "ERROR: psql not found on PATH. Install PostgreSQL client tools first." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Apply seed
# ---------------------------------------------------------------------------

echo "==> Applying agricultural listings seed to localhost:${PG_PORT}/${DB_NAME}..."
echo "==> Seed file: ${SEED_FILE}"

PGPASSWORD="${PG_PASSWORD}" psql \
  -h localhost \
  -p "${PG_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -v ON_ERROR_STOP=1 \
  -f "${SEED_FILE}"

echo "==> Agricultural seed applied."
