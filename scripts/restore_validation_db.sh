#!/usr/bin/env bash
# restore_validation_db.sh — set up a local PostGIS validation container and restore a dump.
#
# Usage:
#   ./scripts/restore_validation_db.sh [dump_path]
#
# Arguments:
#   dump_path   Path to the dump file to restore (default: tmp/validation-schema.dump).
#               Accepts .dump (pg_restore) or .sql (psql) files.
#
# The script:
#   1. Removes any existing pg-validation container.
#   2. Starts a fresh postgis/postgis:15-3.4 container on port 5434.
#   3. Restores the dump into the container.
#   4. Runs validation SQL checks.
#
# Environment:
#   PG_VALIDATION_PASSWORD   Postgres password (default: perf)
#   PG_VALIDATION_PORT       Host port to expose (default: 5434)
#
# After this script exits successfully, set:
#   export DATABASE_URL=postgresql://postgres:${PG_VALIDATION_PASSWORD}@localhost:${PG_VALIDATION_PORT}/postgres
# and run lifecycle tests:
#   python -m pytest scripts/test_lifecycle_integration.py -v

set -euo pipefail

DUMP_PATH="${1:-tmp/validation-schema.dump}"
PG_PASSWORD="${PG_VALIDATION_PASSWORD:-perf}"
PG_PORT="${PG_VALIDATION_PORT:-5434}"
CONTAINER="pg-validation"
DB_URL="postgresql://postgres:${PG_PASSWORD}@localhost:${PG_PORT}/postgres"

# ── Safety checks ────────────────────────────────────────────────────────────

if [[ ! -f "$DUMP_PATH" ]]; then
  echo "ERROR: dump file not found: $DUMP_PATH"
  echo ""
  echo "Create a schema-only dump first:"
  echo "  pg_dump \"\$SUPABASE_VALIDATION_DB_URL\" \\"
  echo "    --schema-only --no-owner --no-privileges \\"
  echo "    --clean --if-exists --format=custom \\"
  echo "    --file tmp/validation-schema.dump"
  exit 1
fi

# Reject unsupported extensions early, before touching any container
EXT="${DUMP_PATH##*.}"
if [[ "$EXT" != "dump" && "$EXT" != "sql" ]]; then
  echo "ERROR: unsupported file extension '.$EXT' — only .dump (pg_restore) and .sql (psql) are supported."
  exit 1
fi

# Warn if the dump looks like it might contain PII (non-schema .dump > 10MB)
DUMP_SIZE=$(du -k "$DUMP_PATH" | cut -f1)
if [[ "${DUMP_PATH}" != *schema* && "$DUMP_SIZE" -gt 10240 ]]; then
  echo "WARNING: dump file is ${DUMP_SIZE}KB and does not contain 'schema' in the name."
  echo "If this is a data dump, ensure it has been sanitized (no PII)."
  echo "Continue? [y/N]"
  read -r CONFIRM
  if [[ "${CONFIRM,,}" != "y" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# ── Container setup ───────────────────────────────────────────────────────────

# Check for port conflicts from other containers before starting
if docker ps --format '{{.Ports}}' | grep -q "0.0.0.0:${PG_PORT}->"; then
  CONFLICT=$(docker ps --format '{{.Names}}\t{{.Ports}}' | grep "0.0.0.0:${PG_PORT}->" | awk '{print $1}')
  echo "ERROR: port ${PG_PORT} is already bound by container '${CONFLICT}'."
  echo "Stop it first:  docker rm -f ${CONFLICT}"
  echo "Or use a different port:  PG_VALIDATION_PORT=5435 $0 $DUMP_PATH"
  exit 1
fi

echo "==> Removing existing container (if any)..."
docker rm -f "$CONTAINER" 2>/dev/null || true

echo "==> Starting PostGIS container on port ${PG_PORT}..."
docker run -d \
  --name "$CONTAINER" \
  -p "${PG_PORT}:5432" \
  -e "POSTGRES_PASSWORD=${PG_PASSWORD}" \
  postgis/postgis:15-3.4

echo "==> Waiting for Postgres to accept connections..."
for i in {1..30}; do
  if psql "$DB_URL" -c "SELECT 1" -q 2>/dev/null; then
    break
  fi
  sleep 1
done
psql "$DB_URL" -c "SELECT 1" -q 2>/dev/null || { echo "ERROR: Postgres did not become ready in 30s."; exit 1; }

# ── Restore ───────────────────────────────────────────────────────────────────

echo "==> Restoring dump: $DUMP_PATH"

if [[ "$DUMP_PATH" == *.sql ]]; then
  psql "$DB_URL" -f "$DUMP_PATH"
else
  pg_restore \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --dbname "$DB_URL" \
    "$DUMP_PATH"
fi

echo "==> Restore complete."

# ── Validation checks ─────────────────────────────────────────────────────────

echo "==> Running validation checks..."
psql "$DB_URL" <<'SQL'
\echo '--- PostGIS version ---'
SELECT PostGIS_Version();

\echo '--- Core tables ---'
SELECT
  'property_listings'    AS table_name, to_regclass('public.property_listings')    AS exists UNION ALL
SELECT 'listing_search_outbox',          to_regclass('public.listing_search_outbox')         UNION ALL
SELECT 'areas',                          to_regclass('public.areas')                          UNION ALL
SELECT 'cities',                         to_regclass('public.cities');

\echo '--- Row counts ---'
SELECT COUNT(*) AS property_listings_count FROM property_listings;

\echo '--- OpenSearch read-model columns ---'
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'property_listings'
  AND column_name IN (
    'id','status','title','locality','description',
    'area_key','city','latitude','longitude','geog','updated_at'
  )
ORDER BY column_name;
SQL

echo ""
echo "==> Validation DB ready."
echo ""
echo "    export DATABASE_URL=${DB_URL}"
echo "    export OPENSEARCH_URL=http://localhost:9200"
echo "    python -m pytest scripts/test_lifecycle_integration.py -v"
