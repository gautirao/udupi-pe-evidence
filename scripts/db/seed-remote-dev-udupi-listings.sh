#!/usr/bin/env bash
# scripts/db/seed-remote-dev-udupi-listings.sh
#
# Apply the Udupi district listings import (issue #2304) to the remote
# development DB used by deployed Pages/dev e2e: new area seeds, then the
# 104 property listings owned by the existing testdealer@example.com account.
#
# !! EXPLICITLY NOT PRODUCTION !!
# !! This script inserts test fixture data only !!
#
# Usage:
#   ALLOW_REMOTE_DEV_UDUPI_LISTINGS_SEED=true TARGET_ENV=remote-dev bash scripts/db/seed-remote-dev-udupi-listings.sh
#
# Set DRY_RUN=true to verify the safety guards (including the PG_USER dev
# project identity check) without resolving a password or invoking psql.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMPORT_DIR="${SCRIPT_DIR}/../../data/imports/udupi-properties-2304"
AREA_SEED_FILE="${IMPORT_DIR}/area-seed.sql"
IMPORT_FILE="${IMPORT_DIR}/import.sql"

# ---------------------------------------------------------------------------
# 1. Enforce confirmation & target environment safety guards
# ---------------------------------------------------------------------------
if [[ "${ALLOW_REMOTE_DEV_UDUPI_LISTINGS_SEED:-}" != "true" ]]; then
  echo "ERROR: Safety violation. Must set ALLOW_REMOTE_DEV_UDUPI_LISTINGS_SEED=true to seed remote dev DB." >&2
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

# ---------------------------------------------------------------------------
# 2a. Fail-closed dev-project identity check.
#
# The pooler host (PG_HOST) is shared, environment-agnostic infrastructure —
# it never contains a "prod" substring even when it fronts a production
# project, so it cannot identify which database gets written to. PG_USER
# (postgres.<project-ref>) is the value that actually pins the target
# project. This check cannot be bypassed via REMOTE_DEV_DB_USER: if the
# resolved user does not match the known Udupi dev project's user, refuse
# before resolving a password or touching the network.
# ---------------------------------------------------------------------------
readonly EXPECTED_DEV_PG_USER="postgres.elyqnysyqbqoxqqrpiir"
if [[ "${PG_USER}" != "${EXPECTED_DEV_PG_USER}" ]]; then
  echo "ERROR: CRITICAL SAFETY VIOLATION. Resolved PG_USER '${PG_USER}' does not match the known Udupi dev project user (${EXPECTED_DEV_PG_USER})." >&2
  echo "Refusing to proceed. This identity check cannot be bypassed via REMOTE_DEV_DB_USER." >&2
  exit 1
fi

if [[ "${DRY_RUN:-}" == "true" ]]; then
  echo "DRY RUN: safety guards passed (TARGET_ENV=remote-dev, PG_USER=${PG_USER} matches expected dev project). Would proceed to apply ${AREA_SEED_FILE} and ${IMPORT_FILE} to ${PG_HOST}:${PG_PORT}/${PG_NAME}. Exiting before password resolution / psql."
  exit 0
fi

PG_PASSWORD="${REMOTE_DEV_DB_PASSWORD:-${SUPABASE_DB_PASSWORD:-}}"

if [[ -z "${PG_PASSWORD}" ]]; then
  if [[ -f "${SCRIPT_DIR}/../../apps/api/.env" ]]; then
    PG_PASSWORD=$(grep "^SUPABASE_DB_PASSWORD=" "${SCRIPT_DIR}/../../apps/api/.env" | cut -d= -f2- || true)
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
echo "WARNING: Seeding Udupi listings fixture data into REMOTE DEV DB"
echo "Host: ${PG_HOST}:${PG_PORT}/${PG_NAME}"
echo "User: ${PG_USER}"
echo "TARGET_ENV: ${TARGET_ENV}"
echo "============================================================================="

if [[ ! -f "${AREA_SEED_FILE}" ]]; then
  echo "ERROR: Area seed file not found: ${AREA_SEED_FILE}" >&2
  exit 1
fi

if [[ ! -f "${IMPORT_FILE}" ]]; then
  echo "ERROR: Import file not found: ${IMPORT_FILE}" >&2
  exit 1
fi

if ! command -v psql &>/dev/null; then
  echo "ERROR: psql not found on PATH. Install PostgreSQL client tools first." >&2
  exit 1
fi

export PGPASSWORD="${PG_PASSWORD}"

# ---------------------------------------------------------------------------
# 3. Apply area seed and listings import
# ---------------------------------------------------------------------------
echo "==> Applying Udupi area seed..."
psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_NAME}" -v ON_ERROR_STOP=1 -f "${AREA_SEED_FILE}"

echo "==> Applying Udupi listings import..."
psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_NAME}" -v ON_ERROR_STOP=1 -f "${IMPORT_FILE}"

echo "==> Remote dev Udupi listings seed complete."
