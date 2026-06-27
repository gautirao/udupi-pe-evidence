#!/usr/bin/env bash
# scripts/db/seed-bangalore-mangalore-schools.sh
#
# Apply the Bangalore and Mangalore CBSE/ICSE schools seed to the local test DB.
#
# !! NEVER run against a real/production database !!

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_FILE="${SCRIPT_DIR}/fixtures/bangalore-mangalore-schools-seed.sql"

PG_PASSWORD="${PG_TEST_PASSWORD:-fixture_test_only}"
PG_PORT="${PG_TEST_PORT:-5434}"
DB_NAME="postgres"
DB_USER="postgres"

if [[ ! -f "${SEED_FILE}" ]]; then
  echo "ERROR: Seed file not found: ${SEED_FILE}" >&2
  exit 1
fi

if ! command -v psql &>/dev/null; then
  echo "ERROR: psql not found on PATH." >&2
  exit 1
fi

echo "==> Applying Bangalore & Mangalore schools seed to localhost:${PG_PORT}/${DB_NAME}..."
PGPASSWORD="${PG_PASSWORD}" psql \
  -h localhost \
  -p "${PG_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -v ON_ERROR_STOP=1 \
  -f "${SEED_FILE}"

echo "==> Seed applied successfully."
