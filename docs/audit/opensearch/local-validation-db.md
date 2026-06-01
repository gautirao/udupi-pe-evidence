# Local Validation DB — Repeatable Restore Workflow

## Purpose

Provide a repeatable local PostGIS database for OpenSearch lifecycle and
integration tests, avoiding fragile per-session schema reconstruction via
Flyway migrations or stub debugging.

Future M27 integration tests (Postgres outbox → background worker → OpenSearch)
should run against a known-good local database restored from a sanitized dump.

This complements the lifecycle proof from [lifecycle-proof-1316.md](lifecycle-proof-1316.md),
which used a Flyway-migrated empty schema with synthetic data. That approach
was valid but expensive to set up repeatedly.

---

## Architecture Context

Current M27 rollout path (Kafka deferred):

```
Postgres source of truth
→ listing_search_outbox table
→ background worker / poller (opensearch_outbox_relay.py)
→ OpenSearch
```

The design remains Kafka-compatible later. This workflow does not introduce
Kafka.

---

## Required Tables

After restore, the following tables must exist:

| Table | Purpose |
|-------|---------|
| `property_listings` | Listing source-of-truth (status, FTS fields, geog) |
| `listing_search_outbox` | Outbox events for background worker |
| `areas` | Area keys referenced by listings |
| `cities` | City slugs referenced by listings |

PostGIS extension must also be present (`postgis_version()` must return a value).

### OpenSearch read-model source fields

Verify these columns exist on `property_listings` before running lifecycle tests:

- `id` — listing UUID
- `status` — visibility gate (`LIVE` → index; all others → delete)
- `title`, `locality`, `description` — FTS source
- `area_key` — area scope for Discover queries
- `city` / `locality` — city/locality source
- `latitude`, `longitude`, `geog` — geo fields
- `updated_at` — used for version ordering
- `hero_image_url` (or equivalent) — hero image source, if present

---

## Dump Options

### Option A — Schema-only (preferred for test setup)

Creates a dump with the full schema but no data. Tests insert their own
isolated rows and clean up after themselves.

```bash
pg_dump "$SUPABASE_VALIDATION_DB_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --format=custom \
  --file tmp/validation-schema.dump
```

Or as plain SQL:

```bash
pg_dump "$SUPABASE_VALIDATION_DB_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --format=plain \
  --file tmp/validation-schema.sql
```

### Option B — Sanitized data dump

If tests need realistic data volume, the dump must be sanitized before use.

#### Sanitization requirements

The following must be excluded or scrubbed before committing or sharing:

- `auth.users` and all Supabase auth tables
- Email addresses
- Phone numbers
- Owner / broker identifiers (`user_id`, `seller_id`, `supabase_user_id`)
- Private notes and rejection reasons if sensitive
- Admin-only fields
- Any customer PII

#### Sanitized dump command (example)

```bash
# Exclude auth schema entirely; scrub PII columns in property_listings
pg_dump "$SUPABASE_VALIDATION_DB_URL" \
  --exclude-schema=auth \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --format=custom \
  --file tmp/validation-sanitized.dump
```

Then apply post-dump scrubbing SQL before restoring (or restore into a staging
DB, run the scrub, then dump again):

```sql
-- Run after restore into staging container, before exporting the final dump
UPDATE property_listings
SET
  seller_name = 'Test Seller ' || id,
  phone       = NULL,
  email       = NULL
WHERE phone IS NOT NULL OR email IS NOT NULL;
```

**Never commit a dump that contains real PII.** Schema-only dumps are always safe.

---

## Local Container Setup

```bash
docker rm -f pg-validation 2>/dev/null || true

docker run -d \
  --name pg-validation \
  -p 5434:5432 \
  -e POSTGRES_PASSWORD=perf \
  postgis/postgis:15-3.4

# Wait for Postgres to be ready
sleep 3
```

Export the connection URL:

```bash
export DATABASE_URL=postgresql://postgres:perf@localhost:5434/postgres
```

---

## Restore Commands

### Custom-format dump (`.dump`)

```bash
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname "$DATABASE_URL" \
  tmp/validation-schema.dump
```

### Plain SQL dump (`.sql`)

```bash
psql "$DATABASE_URL" -f tmp/validation-schema.sql
```

---

## Validation Checks

Run after restore to confirm the DB is ready for lifecycle tests:

```sql
-- PostGIS must be installed
SELECT PostGIS_Version();

-- Core tables must exist
SELECT to_regclass('public.property_listings');
SELECT to_regclass('public.listing_search_outbox');
SELECT to_regclass('public.areas');
SELECT to_regclass('public.cities');

-- Row counts (schema-only dump = 0 rows; data dump = > 0)
SELECT COUNT(*) FROM property_listings;

-- OpenSearch read-model columns must exist
SELECT
  column_name
FROM information_schema.columns
WHERE table_name = 'property_listings'
  AND column_name IN (
    'id', 'status', 'title', 'locality', 'description',
    'area_key', 'city', 'latitude', 'longitude', 'geog', 'updated_at'
  )
ORDER BY column_name;
```

All 10 columns should appear in the last query result.

---

## Running Lifecycle Tests

With the container running and `DATABASE_URL` exported:

```bash
# Also export OpenSearch URL (assumes local OpenSearch on default port)
export OPENSEARCH_URL=http://localhost:9200

# Run the lifecycle integration test suite
python -m pytest scripts/test_lifecycle_integration.py -v
```

Tests skip automatically when `DATABASE_URL` or `OPENSEARCH_URL` is absent.

To run the full pipeline test suite:

```bash
python -m pytest scripts/test_opensearch_pipeline.py -v
```

---

## Convenience Script

The `scripts/restore_validation_db.sh` script automates container setup and
restore. See that file for usage.

---

## Git Safety

Dump files are gitignored. Never commit:

- `*.dump`
- `*.backup`
- `tmp/*.sql` (schema exports)
- Any file containing real PII

The `tmp/` directory is for local-only artefacts. See `.gitignore` for the
full pattern list.

---

## File Placement Convention

| Path | Purpose |
|------|---------|
| `tmp/validation-schema.dump` | Schema-only custom-format dump |
| `tmp/validation-schema.sql` | Schema-only plain SQL dump |
| `tmp/validation-sanitized.dump` | Sanitized data dump (never commit) |

The `tmp/` directory must not be committed. Add it to `.gitignore` if not
already present.
