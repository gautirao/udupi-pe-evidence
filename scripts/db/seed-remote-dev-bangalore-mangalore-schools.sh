#!/usr/bin/env bash
# scripts/db/seed-remote-dev-bangalore-mangalore-schools.sh
#
# Seed Bangalore and Mangalore CBSE/ICSE schools data
# on the remote development DB used by deployed Pages/dev e2e.
#
# !! EXPLICITLY NOT PRODUCTION !!
# !! This script inserts test fixture data only !!
#
# Usage:
#   ALLOW_REMOTE_DEV_SCHOOLS_SEED=true TARGET_ENV=remote-dev bash scripts/db/seed-remote-dev-bangalore-mangalore-schools.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_FILE="${SCRIPT_DIR}/fixtures/bangalore-mangalore-schools-seed.sql"

# ---------------------------------------------------------------------------
# 1. Enforce confirmation & target environment safety guards
# ---------------------------------------------------------------------------
if [[ "${ALLOW_REMOTE_DEV_SCHOOLS_SEED:-}" != "true" ]]; then
  echo "ERROR: Safety violation. Must set ALLOW_REMOTE_DEV_SCHOOLS_SEED=true to seed remote dev DB." >&2
  exit 1
fi

if [[ "${TARGET_ENV:-}" != "remote-dev" ]]; then
  echo "ERROR: Safety violation. Must set TARGET_ENV=remote-dev to seed remote dev DB." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Resolve database connection parameters
# ---------------------------------------------------------------------------
PG_HOST="${REMOTE_DEV_DB_HOST:-aws-1-eu-west-1.pooler.supabase.com}"
PG_PORT="${REMOTE_DEV_DB_PORT:-6543}"
PG_USER="${REMOTE_DEV_DB_USER:-postgres.elyqnysyqbqoxqqrpiir}"
PG_NAME="${REMOTE_DEV_DB_NAME:-postgres}"
PG_PASSWORD="${REMOTE_DEV_DB_PASSWORD:-${SUPABASE_DB_PASSWORD:-}}"

if [[ -z "${PG_PASSWORD}" ]]; then
  if [[ -f "${SCRIPT_DIR}/../../backend/.env" ]]; then
    PG_PASSWORD=$(grep "^SUPABASE_DB_PASSWORD=" "${SCRIPT_DIR}/../../backend/.env" | cut -d= -f2- || true)
  fi
fi

if [[ -z "${PG_PASSWORD}" ]]; then
  echo "ERROR: Database password not found. Set REMOTE_DEV_DB_PASSWORD or SUPABASE_DB_PASSWORD." >&2
  exit 1
fi

# Guard against accidental production runs
if [[ "${TARGET_ENV}" == "production" || "${PG_HOST}" == *"prod"* ]]; then
  echo "ERROR: CRITICAL SAFETY VIOLATION. Seeding against production is prohibited." >&2
  exit 1
fi

echo "============================================================================="
echo "WARNING: Seeding Bangalore & Mangalore schools fixture data into REMOTE DEV DB"
echo "Host: ${PG_HOST}:${PG_PORT}/${PG_NAME}"
echo "User: ${PG_USER}"
echo "TARGET_ENV: ${TARGET_ENV}"
echo "============================================================================="

if [[ ! -f "${SEED_FILE}" ]]; then
  echo "ERROR: Seed file not found: ${SEED_FILE}" >&2
  exit 1
fi

if ! command -v psql &>/dev/null; then
  echo "ERROR: psql not found on PATH. Install PostgreSQL client tools first." >&2
  exit 1
fi

export PGPASSWORD="${PG_PASSWORD}"

# ---------------------------------------------------------------------------
# 3. Apply seed
# ---------------------------------------------------------------------------
echo "==> Applying Bangalore & Mangalore schools seed..."
psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_NAME}" -v ON_ERROR_STOP=1 -f "${SEED_FILE}"

echo "==> Remote dev Bangalore & Mangalore schools seed complete."
