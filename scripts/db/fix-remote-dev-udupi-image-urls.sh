#!/usr/bin/env bash
# scripts/db/fix-remote-dev-udupi-image-urls.sh
#
# One-off repair for issue #2304: Housing.com-sourced listing_images.url rows
# were inserted with an unresolved CDN template placeholder ("version") that
# 417s at request time. This applies data/imports/udupi-properties-2304/fix-image-urls.sql,
# an idempotent UPDATE keyed on parsed_data->>'importIssue' = '2304' and the
# exact broken URL, against the remote development DB.
#
# !! EXPLICITLY NOT PRODUCTION !!
# !! Repairs existing test fixture data only, no DDL, no new rows !!
#
# Usage:
#   ALLOW_REMOTE_DEV_UDUPI_LISTINGS_SEED=true TARGET_ENV=remote-dev bash scripts/db/fix-remote-dev-udupi-image-urls.sh
#
# Set DRY_RUN=true to verify the safety guards without resolving a password or invoking psql.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMPORT_DIR="${SCRIPT_DIR}/../../data/imports/udupi-properties-2304"
FIX_FILE="${IMPORT_DIR}/fix-image-urls.sql"

# ---------------------------------------------------------------------------
# 1. Enforce confirmation & target environment safety guards
# ---------------------------------------------------------------------------
if [[ "${ALLOW_REMOTE_DEV_UDUPI_LISTINGS_SEED:-}" != "true" ]]; then
  echo "ERROR: Safety violation. Must set ALLOW_REMOTE_DEV_UDUPI_LISTINGS_SEED=true to modify remote dev DB." >&2
  exit 1
fi

if [[ "${TARGET_ENV:-}" != "remote-dev" ]]; then
  echo "ERROR: Safety violation. Must set TARGET_ENV=remote-dev to modify remote dev DB." >&2
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
# 2a. Fail-closed dev-project identity check (same pattern as
# seed-remote-dev-udupi-listings.sh — see that file for rationale).
# ---------------------------------------------------------------------------
readonly EXPECTED_DEV_PG_USER="postgres.elyqnysyqbqoxqqrpiir"
if [[ "${PG_USER}" != "${EXPECTED_DEV_PG_USER}" ]]; then
  echo "ERROR: CRITICAL SAFETY VIOLATION. Resolved PG_USER '${PG_USER}' does not match the known Udupi dev project user (${EXPECTED_DEV_PG_USER})." >&2
  echo "Refusing to proceed. This identity check cannot be bypassed via REMOTE_DEV_DB_USER." >&2
  exit 1
fi

if [[ "${DRY_RUN:-}" == "true" ]]; then
  echo "DRY RUN: safety guards passed (TARGET_ENV=remote-dev, PG_USER=${PG_USER} matches expected dev project). Would proceed to apply ${FIX_FILE} to ${PG_HOST}:${PG_PORT}/${PG_NAME}. Exiting before password resolution / psql."
  exit 0
fi

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
  echo "ERROR: CRITICAL SAFETY VIOLATION. Modifying production is prohibited." >&2
  exit 1
fi

echo "============================================================================="
echo "WARNING: Repairing Udupi listing_images.url rows in REMOTE DEV DB"
echo "Host: ${PG_HOST}:${PG_PORT}/${PG_NAME}"
echo "User: ${PG_USER}"
echo "TARGET_ENV: ${TARGET_ENV}"
echo "============================================================================="

if [[ ! -f "${FIX_FILE}" ]]; then
  echo "ERROR: Fix file not found: ${FIX_FILE}" >&2
  exit 1
fi

if ! command -v psql &>/dev/null; then
  echo "ERROR: psql not found on PATH. Install PostgreSQL client tools first." >&2
  exit 1
fi

export PGPASSWORD="${PG_PASSWORD}"

echo "==> Applying Udupi listing_images.url repair..."
psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_NAME}" -v ON_ERROR_STOP=1 -f "${FIX_FILE}"

echo "==> Remote dev Udupi image-url repair complete."
