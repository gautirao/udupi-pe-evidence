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
