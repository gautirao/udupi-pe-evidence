# Perf Listing Generator

Generates synthetic `property_listings` rows tagged with the `[PERF]` prefix
for load-testing the Discover feature at up to 1M listing scale.

## Purpose and safe environments

This tool is for **local and staging databases only**. It inserts rows that
are real PostgreSQL data (not mocks), so Discover, search indexes, and all
queries behave as they would in production under load.

**NEVER run against the production database.**

The `[PERF]` prefix in every title is the safety tag: cleanup deletes exactly
`WHERE title LIKE '[PERF]%'`. Never use this prefix in real listing titles.

## Installation

```bash
pip install -r scripts/requirements-perf.txt
```

Requires Python 3.11+.

## Required environment variable

```bash
export PERF_DB_URL="postgresql://user:password@localhost:5432/dbname"
```

Use a local or staging database connection string. The env var is an
alternative to the `--db-url` flag.

## Example commands

### Dry run (no DB writes — inspect plan and sample row)

```bash
python scripts/gen_perf_listings.py --count=1000 --dry-run
```

### Insert 10K rows (deterministic, reproducible)

```bash
python scripts/gen_perf_listings.py --count=10000 --seed=42 --db-url=$PERF_DB_URL
```

### Insert 1M rows (batched, streaming — ~100 batches of 10K)

```bash
python scripts/gen_perf_listings.py --count=1000000 --seed=42 --db-url=$PERF_DB_URL
```

Progress is printed after each 10K batch. Each batch commits independently,
so the run is resumable (re-run with a different seed; existing `[PERF]` rows
are unaffected since titles are unique within a seeded run).

### Insert with an explicit broker user ID

Use this when the target DB has no entries in the `profiles` table (e.g. a
freshly-migrated empty DB):

```bash
python scripts/gen_perf_listings.py \
  --count=10000 \
  --seed=42 \
  --broker-id=00000000-0000-0000-0000-000000000001 \
  --db-url=$PERF_DB_URL
```

The UUID must exist in `profiles.user_id` for RLS policies to work correctly.
If no `profiles` row exists and `--broker-id` is omitted, the script exits
with a clear error message.

### Cleanup (delete all [PERF] rows)

```bash
python scripts/gen_perf_listings.py \
  --cleanup \
  --confirm-delete-generated \
  --db-url=$PERF_DB_URL
```

The `--confirm-delete-generated` flag is required to prevent accidental
deletion. The script prints the row count before and after, and verifies that
0 rows remain.

## Guaranteed keywords and approximate counts per 1000 rows

Each title uses one of seven templates. With seed=42 and 1000 rows the
distribution is approximately uniform (±5%):

| Template keyword         | Approx rows per 1000 |
|--------------------------|----------------------|
| garden villa in          | ~143                 |
| sea view apartment in    | ~143                 |
| student rental near      | ~143                 |
| 2BHK house in            | ~143                 |
| land parcel              | ~143                 |
| commercial space         | ~143                 |
| 3BHK flat                | ~142                 |

Exact counts vary by seed.

## Property type distribution per 1000 rows (approximate)

| Type        | Weight | Approx rows |
|-------------|--------|-------------|
| house       | 35%    | ~350        |
| apartment   | 30%    | ~300        |
| land        | 20%    | ~200        |
| commercial  | 15%    | ~150        |

## Coordinate clusters

| Cluster    | Approx centre          | % of rows |
|------------|------------------------|-----------|
| Udupi      | 13.35°N, 74.78°E       | 60%       |
| Manipal    | 13.35°N, 74.79°E       | 10%       |
| Kundapura  | 13.62°N, 74.69°E       | 10%       |
| Mangaluru  | 12.87°N, 74.84°E       | 10%       |
| Bengaluru  | 12.97°N, 77.59°E       | 10%       |

## Schema notes

- `search_vector` is a `GENERATED ALWAYS AS ... STORED` column (V18). PostgreSQL
  auto-populates it on INSERT. The generator never sets it explicitly.
- `listing_number` has `NOT NULL DEFAULT nextval(...)` with a UNIQUE constraint
  (V29). PostgreSQL auto-assigns it from the sequence. The generator never
  sets it explicitly.
- `price_paise` stores the price in paise (1 INR = 100 paise). This is the
  canonical price column per V11.
- `area_key` is looked up from the `areas` table at startup and mapped to the
  nearest coordinate cluster. If the areas table is empty, `area_key` is NULL
  (the column is nullable per V6).
- `status` is set to `'LIVE'` so rows are visible in Discover queries.
- `listing_purpose` defaults to `'sale'` (matches the V32 column default).

## WARNING

Never use the `[PERF]` prefix in real listing titles. The cleanup command
deletes **all** rows matching `title LIKE '[PERF]%'` without further
discrimination. A real listing with this prefix will be deleted during cleanup.

---

## Running the EXPLAIN Harness

After generating a dataset with `gen_perf_listings.py`, run the EXPLAIN ANALYZE harness to capture Postgres query plans.

### Prerequisites

- Python 3.11+
- `psycopg2-binary` installed (`pip install -r scripts/requirements-perf.txt`)
- A Postgres database with PostGIS and pgcrypto extensions
- At least one populated `cities` row with slug `udupi` and associated `areas` rows
- `PERF_DB_URL` environment variable set

### Step 1: Generate a dataset

```bash
python scripts/gen_perf_listings.py --count=10000 --seed=42 --db-url=$PERF_DB_URL
```

### Step 2: Run the harness

```bash
# Run all 8 query paths at 10k volume
python scripts/run_explain_harness.py --volume=10k --db-url=$PERF_DB_URL

# Run a single query path
python scripts/run_explain_harness.py --volume=10k --query=QP-1c --db-url=$PERF_DB_URL

# Dry run: print SQL without connecting to DB
python scripts/run_explain_harness.py --dry-run
```

### Step 3: Review results

Results are written to `docs/audit/evidence/explain/live/<volume>/`.

Fill in `docs/audit/query-baseline-report.md` from the harness summary output.

### Step 4: Compare at larger volumes

To compare query plans at different data volumes:

```bash
# 10k
python scripts/gen_perf_listings.py --count=10000 --seed=42 --db-url=$PERF_DB_URL
python scripts/run_explain_harness.py --volume=10k --db-url=$PERF_DB_URL
python scripts/gen_perf_listings.py --cleanup --confirm-delete-generated --db-url=$PERF_DB_URL

# 100k
python scripts/gen_perf_listings.py --count=100000 --seed=42 --db-url=$PERF_DB_URL
python scripts/run_explain_harness.py --volume=100k --db-url=$PERF_DB_URL
python scripts/gen_perf_listings.py --cleanup --confirm-delete-generated --db-url=$PERF_DB_URL
```

### Safety

This script is **read-only**. It runs all EXPLAIN queries in a `READ ONLY` transaction that is rolled back. It never modifies application data.

**Only use against LOCAL or STAGING databases. Never use against production.**

---

## Database prerequisites (V73 schema — geospatial paths)

The harness query paths **QP-1c** (school-radius ST_DWithin) and **QP-3b** (bbox `&&` operator)
require the `geog` geography column and PostGIS to be present on the target database.

If either is missing the harness degrades gracefully: those two queries are skipped with
`DATA_GAP` status in the summary table and the per-query `.txt` file contains a clear note
explaining what to apply. All other query paths (QP-1a/1b/1d/2/3a/5) run normally.

### Idempotent provisioning SQL (perf DB only)

A helper script is provided at `scripts/perf_db_apply_geog.sql`. Apply it against the
**non-production** perf container:

```bash
psql $PERF_DB_URL -f scripts/perf_db_apply_geog.sql
```

Or apply the three statements inline:

```sql
-- 1. PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. geog generated column (mirrors V73 migration)
ALTER TABLE property_listings
    ADD COLUMN IF NOT EXISTS geog geography(Point,4326)
    GENERATED ALWAYS AS (
        CASE
            WHEN latitude IS NOT NULL AND longitude IS NOT NULL
            THEN ST_MakePoint(longitude, latitude)::geography
            ELSE NULL
        END
    ) STORED;

-- 3. GiST spatial index
CREATE INDEX IF NOT EXISTS idx_property_listings_geog
    ON property_listings USING GIST (geog)
    WHERE geog IS NOT NULL;
```

> **Note:** This SQL is NOT a Flyway migration. It is a manual provisioning helper for
> the throwaway perf container. The equivalent production change is already in
> `V73__add_geog_column.sql`. Never apply this to the production database.

The `geog` column is `GENERATED ALWAYS AS ... STORED`, so `gen_perf_listings.py` correctly
omits it from `INSERT_COLUMNS` — PostgreSQL auto-populates it from `latitude`/`longitude`
on every INSERT. After provisioning, all inserted `[PERF]` rows will have a non-null `geog`
value (assuming `latitude` and `longitude` are non-null, which is guaranteed by the generator).

### Container image note

The standard `postgres:14` Docker image does **not** include PostGIS. To use a PostGIS-capable
perf container, switch to `postgis/postgis:14-3.3` (or any `14-*` PostGIS image):

```bash
docker run -d --name perf-pg-geo \
  -e POSTGRES_PASSWORD=perf \
  -p 5434:5432 \
  postgis/postgis:14-3.3
```

Then re-apply migrations and run `perf_db_apply_geog.sql`.

---

## area_key distribution fix (Issue #1297)

**Previous behaviour:** `_load_area_keys` queried `SELECT area_key FROM public.areas LIMIT 20`
(heap-ordered). The 20 rows returned could omit all 3 Udupi-cluster keys, causing the
`next(iter(available_keys))` cross-cluster fallback to assign 80%+ of rows to one arbitrary
key (observed: 0% Udupi rows in a 10k dataset).

**Fixed behaviour (v1297+):** The function now queries the 5 specific preferred keys via
`SELECT area_key FROM public.areas WHERE area_key = ANY(%s)`. Each cluster maps to its OWN
preferred key if present, or `None` if absent. There is no cross-cluster fallback — a missing
key produces `NULL` for that cluster only (which is valid since `area_key` is nullable per V6).
The result is fully deterministic: same DB state → same mapping on every run.

Expected area_key distribution with a correctly seeded areas table and `seed=42`:

| Cluster    | area_key                       | % of rows |
|------------|--------------------------------|-----------|
| udupi      | IN\|KA\|Udupi\|Udupi          | ~60%      |
| manipal    | IN\|KA\|Udupi\|Manipal         | ~10%      |
| kundapura  | IN\|KA\|Udupi\|Kundapura       | ~10%      |
| mangaluru  | IN\|KA\|Mangalore\|Kadri       | ~10%      |
| bengaluru  | IN\|KA\|Bengaluru\|Koramangala | ~10%      |
