#!/usr/bin/env bash
# scripts/db/export-test-fixture.sh
#
# Export a SCHEMA-ONLY dump from the local test fixture container
# for sharing or version-controlled reference.
#
# !! WARNING: NEVER run against a production database !!
# !! This script only targets localhost containers.   !!
# !! Always verify the DATABASE_URL before proceeding. !!
#
# What is exported:
#   Schema only (--schema-only): DDL, indexes, types, enums, triggers.
#   NO table data — no user rows, no listing rows, no PII.
#
# What is deliberately NOT exported:
#   - auth.* schema (Supabase-owned; not in our Flyway migrations)
#   - storage.* schema (Supabase-owned)
#   - Any table data (--schema-only enforces this)
#
# Usage:
#   # Start the fixture first:
#   bash scripts/db/restore-test-fixture.sh
#
#   # Then export:
#   bash scripts/db/export-test-fixture.sh
#
#   # With a custom output path:
#   OUTPUT_PATH=tmp/my-schema.sql bash scripts/db/export-test-fixture.sh
#
# Environment (all optional — defaults shown):
#   PG_TEST_PASSWORD   Postgres fixture password   (default: fixture_test_only)
#   PG_TEST_PORT       Fixture port                (default: 5434)
#   OUTPUT_PATH        Where to write the dump     (default: tmp/fixture-schema.sql)
#
# The dump can be applied to a fresh container with:
#   psql "$DATABASE_URL" -f tmp/fixture-schema.sql
#
# Refreshing the committed fixture:
#   1. Run restore-test-fixture.sh to get a clean migrated container.
#   2. Run this script to export the schema.
#   3. Commit the updated file at scripts/db/fixtures/ if desired.
#      (Do NOT commit data dumps or files containing PII.)

set -euo pipefail

PG_PASSWORD="${PG_TEST_PASSWORD:-fixture_test_only}"
PG_PORT="${PG_TEST_PORT:-5434}"
DB_USER="postgres"
DB_NAME="postgres"
OUTPUT_PATH="${OUTPUT_PATH:-tmp/fixture-schema.sql}"

# ---------------------------------------------------------------------------
# Safety: verify this is a localhost target
# ---------------------------------------------------------------------------

echo "==> Target: localhost:${PG_PORT}/${DB_NAME}"
echo "==> Output: ${OUTPUT_PATH}"
echo ""
echo "!! WARNING: Verify this is your LOCAL TEST FIXTURE, not a production DB !!"
echo ""

# Verify container exists and is running
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^pg-test-fixture$"; then
  echo "ERROR: Container 'pg-test-fixture' is not running." >&2
  echo "Start it first: bash scripts/db/restore-test-fixture.sh" >&2
  exit 1
fi

# Double-check by querying for the E2E marker row — production DBs won't have it
HAS_E2E=$(PGPASSWORD="${PG_PASSWORD}" psql -h localhost -p "${PG_PORT}" -U "${DB_USER}" \
  -d "${DB_NAME}" -t -A \
  -c "SELECT COUNT(*) FROM property_listings WHERE title LIKE '[E2E]%';" 2>/dev/null || echo "-1")

if [[ "${HAS_E2E}" == "-1" ]]; then
  echo "ERROR: Cannot connect to database at localhost:${PG_PORT}." >&2
  exit 1
fi

if [[ "${HAS_E2E}" -eq 0 ]]; then
  echo "WARNING: No [E2E] rows found. The fixture may not have been seeded." >&2
  echo "         Proceeding with schema-only export anyway..."
fi

# ---------------------------------------------------------------------------
# Create output directory if needed
# ---------------------------------------------------------------------------

OUTPUT_DIR="$(dirname "${OUTPUT_PATH}")"
mkdir -p "${OUTPUT_DIR}"

# ---------------------------------------------------------------------------
# Export: schema-only, public schema only, no owner/privilege declarations
# ---------------------------------------------------------------------------

echo "==> Exporting schema-only dump to ${OUTPUT_PATH}..."

PGPASSWORD="${PG_PASSWORD}" pg_dump \
  -h localhost \
  -p "${PG_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --schema-only \
  --schema=public \
  --no-owner \
  --no-privileges \
  --no-comments \
  --file="${OUTPUT_PATH}"

# Verify output was created and non-empty
if [[ ! -s "${OUTPUT_PATH}" ]]; then
  echo "ERROR: Export produced an empty file: ${OUTPUT_PATH}" >&2
  exit 1
fi

DUMP_SIZE=$(du -k "${OUTPUT_PATH}" | cut -f1)
echo "==> Export complete: ${OUTPUT_PATH} (${DUMP_SIZE} KB)"
echo ""
echo "    This is a SCHEMA-ONLY dump — no data, no PII."
echo "    Safe to commit to version control for reference."
echo ""
echo "    To apply to a fresh container:"
echo "      psql \"\$DATABASE_URL\" -f ${OUTPUT_PATH}"
