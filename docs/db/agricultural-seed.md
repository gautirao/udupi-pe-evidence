# Agricultural Listings Seed

## Overview

`scripts/db/fixtures/agricultural-listings-seed.sql` is a local-only, opt-in add-on seed that inserts synthetic agricultural land listings into the local test fixture database. It exists to support local Discover development and manual testing of the agriculture discovery journey (clusters, polygon rendering, detail panel, fallback markers).

This seed is intentionally **not** wired into `restore-test-fixture.sh`. Keeping it opt-in ensures the `[E2E]` residential fixture used by automated tests remains deterministic and unaffected.

---

## What It Creates

### Areas seeded (from V71 — already present after migrations)

| Area | `area_key` |
|---|---|
| Brahmavar | `IN\|KA\|Udupi\|Brahmavar` |
| Shirva | `IN\|KA\|Udupi\|Shirva` |
| Padubidri | `IN\|KA\|Udupi\|Padubidri` |

### Listings

| Area | Count | Total acreage | Boundary polygons | No boundary |
|---|---|---|---|---|
| Brahmavar | 4 | 18.5 ac | 3 | 1 (fallback marker test) |
| Shirva | 3 | 12.0 ac | 3 | 0 |
| Padubidri | 2 | 17.0 ac | 2 | 0 |
| **Total** | **9** | **47.5 ac** | **8** | **1** |

All listings: `status=LIVE`, `property_type=agricultural_land`, `is_valid=true`, `is_duplicate=false`, title prefixed `[AGRI]`.

The single no-boundary row (`a6210001-0000-0000-0000-000000000004`, Brahmavar, 2.0 ac) tests the fallback-to-marker rendering path in the Discover map.

---

## How to Run

### Step 1 — bring up the fixture DB (if not already running)

```bash
bash scripts/db/restore-test-fixture.sh
```

This starts a PostGIS container on port 5434 (default), applies all Flyway migrations, and loads the residential `[E2E]` seed.

### Step 2 — apply the agricultural seed

```bash
bash scripts/db/seed-agricultural-listings.sh
```

#### Raw psql one-liner (equivalent)

```bash
PGPASSWORD=fixture_test_only psql \
  -h localhost -p 5434 -U postgres -d postgres \
  -v ON_ERROR_STOP=1 \
  -f scripts/db/fixtures/agricultural-listings-seed.sql
```

To use a non-default port or password:

```bash
PG_TEST_PORT=5435 PG_TEST_PASSWORD=mypassword bash scripts/db/seed-agricultural-listings.sh
```

---

## Idempotency

The seed uses `ON CONFLICT (id) DO UPDATE` on all listing rows, so it is fully safe to re-run. Key columns (status, area_key, boundary, land_area, agri attributes) are refreshed on each run. The broker-ensure DO-block uses `ON CONFLICT DO NOTHING` / `DO UPDATE` so it is also safe whether run standalone or after the residential seed.

---

## Reset / Re-run

Re-running `seed-agricultural-listings.sh` is safe — it is a no-op for rows that already exist with matching values, and updates any rows where values differ.

For a full fixture reset (drop all data and reapply from scratch):

```bash
bash scripts/db/restore-test-fixture.sh
bash scripts/db/seed-agricultural-listings.sh
```

To remove only the agricultural seed rows without resetting the residential data:

```sql
DELETE FROM property_listings WHERE title LIKE '[AGRI]%';
```

---

## Manual Discover Test Flow

1. Start the backend and frontend locally.
2. Navigate to **Discover** and search for or select **Agricultural Land** as the property type.
3. Select **Brahmavar** — expect: 4 agri listings, total area ≈18.5 ac, 🌾 cluster on map.
4. Select **Shirva** — expect: 3 agri listings, total area ≈12.0 ac, 🌾 cluster on map.
5. Select **Padubidri** — expect: 2 agri listings, total area ≈17.0 ac, 🌾 cluster on map.
6. Zoom in to level ≥16 — saved boundary polygons should render on the map for the 8 rows that have a boundary.
7. Click a polygon — the agri detail panel should open showing title, acreage, attributes, and the boundary disclaimer.
8. Confirm the single no-boundary Brahmavar plot (2-Acre Cultivated Plot) still appears as a fallback marker / cluster point (no polygon rendered, no boundary disclaimer).

---

## Verification Queries

Run these against the local fixture DB to confirm the seed applied correctly. All expect the numbers documented above.

```sql
-- Total agricultural_land rows
SELECT COUNT(*) FROM property_listings WHERE property_type = 'agricultural_land';

-- LIVE rows only
SELECT COUNT(*) FROM property_listings
  WHERE property_type = 'agricultural_land' AND status = 'LIVE';

-- Rows WITH a boundary polygon
SELECT COUNT(*) FROM property_listings
  WHERE property_type = 'agricultural_land' AND boundary IS NOT NULL;

-- Rows WITHOUT a boundary polygon (expect 1 — the fallback marker test row)
SELECT COUNT(*) FROM property_listings
  WHERE property_type = 'agricultural_land' AND boundary IS NULL;

-- Invalid boundary geometries — expect 0 rows
SELECT id, title FROM property_listings
  WHERE property_type = 'agricultural_land'
    AND boundary IS NOT NULL
    AND NOT ST_IsValid(boundary::geometry);

-- Per-area breakdown (AreaSummaryService predicate)
SELECT area_key, COUNT(*)
  FROM property_listings
  WHERE status = 'LIVE'
    AND archived_at IS NULL
    AND is_duplicate = false
    AND LOWER(property_type::text) = 'agricultural_land'
  GROUP BY area_key
  ORDER BY area_key;
```

Expected output from the last query:

```
          area_key          | count
----------------------------+-------
 IN|KA|Udupi|Brahmavar      |     4
 IN|KA|Udupi|Padubidri      |     2
 IN|KA|Udupi|Shirva         |     3
```
