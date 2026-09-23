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

# ---------------------------------------------------------------------------
# 2b. Fail-closed import-owner identity precondition (issue #2307).
#
# import.sql's profiles/property_listings rows hardcode
# testdealer@example.com's auth.users.id. If that identity is absent (or
# present under a different id) on the target project, applying import.sql
# would either fail deep inside psql on profiles_user_id_fkey with no
# actionable context, or silently attach every imported listing to the
# wrong account. Verify it first and abort here, before touching psql, with
# a clear message instead.
#
# IMPORT_OWNER_SUPABASE_PROJECT_REF/_URL are FORCE-DERIVED from PG_USER
# (already validated above against EXPECTED_DEV_PG_USER) -- deliberately NOT
# a "${VAR:-default}" pattern, so neither can be independently overridden by
# a value already present in the caller's environment (#2307 code review
# cycle 2, HIGH-1). Before this fix, an operator (or a misconfigured CI env)
# with either var pre-set could cause the identity check to verify against
# project X while the write below lands on project Y -- passing the guard
# while checking nothing relevant to where the data actually goes. Deriving
# both, unconditionally, from the SAME PG_USER that pins psql's own target
# makes that divergence structurally impossible, matching the "cannot be
# bypassed via env override" guarantee the PG_USER check itself already
# gives 2a above. IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY has no default and
# is NOT touched here -- it must still be supplied ephemerally by the caller
# (see scripts/dev/provision-import-owner-identity.sh's header for the
# secret-handling contract); if it is missing, that script itself fails
# closed with an actionable message.
#
# Placed BEFORE `export PGPASSWORD` below (#2307 code review cycle 2,
# MEDIUM finding): PG_PASSWORD already holds the resolved DB password as a
# local shell variable at this point, but it is not yet exported into the
# environment and no DB connection has been attempted -- this guard runs
# before either of those, not after, so a failure here never puts the real
# DB credential into the environment for the failing run.
# ---------------------------------------------------------------------------
IMPORT_OWNER_SUPABASE_PROJECT_REF="${PG_USER#postgres.}"
IMPORT_OWNER_SUPABASE_URL="https://${IMPORT_OWNER_SUPABASE_PROJECT_REF}.supabase.co"
export IMPORT_OWNER_SUPABASE_PROJECT_REF IMPORT_OWNER_SUPABASE_URL
if ! "${SCRIPT_DIR}/../dev/provision-import-owner-identity.sh"; then
  echo "ERROR: import-owner identity precondition failed (see above) -- refusing to apply ${IMPORT_FILE}." >&2
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
