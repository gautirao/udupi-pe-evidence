# Agricultural Listings Seed — Developer Guide

## Overview

Test/dev/local data only. Provides 21 LIVE agricultural land listings across
multiple regional directions and all 4 distance bands for validating the #1408
regional classification model. DO NOT run against production.

## Quick Start

### 1. Restore fixture database

```bash
cd scripts/db
./restore-test-fixture.sh
```

Ports: 5434 (primary) / 5435 (replica).
Applies migrations through the current repository migration set, including the regional classification schema.

### 2. Run residential seed (recommended first)

```bash
psql "postgresql://postgres:postgres@localhost:5434/postgres" \
  -f fixtures/discover-smoke-seed.sql
```

### 3. Run agricultural seed

```bash
psql "postgresql://postgres:postgres@localhost:5434/postgres" \
  -f fixtures/agricultural-listings-seed.sql
```

Expected output: `NOTICE:  Seed assertions passed: 21 LIVE [AGRI] listings total (19 with boundary, 2 without), Brahmavar=4, Shirva=3, Padubidri=2, ...`

### 4. Run #1408 regional classification backfill

Start the Spring backend pointed at the fixture DB with the backfill flag enabled:

```bash
SPRING_APPLICATION_JSON='{"app":{"regional-classification":{"backfill-enabled":true}}}' \
  ./mvnw -pl backend spring-boot:run \
  -Dspring-boot.run.arguments="--spring.datasource.url=jdbc:postgresql://localhost:5434/postgres"
```

Or equivalently (application.properties override):

```
app.regional-classification.backfill-enabled=true
spring.datasource.url=jdbc:postgresql://localhost:5434/postgres
```

The backfill runs on startup via `RegionalClassificationBackfillRunner` (ApplicationRunner).
Expected log: `RegionalClassificationBackfill: complete upserted=15 errors=0` (15 = 12 V71 Udupi areas + 3 synthetic test areas).

### 5. Verify (quick SQL check)

```sql
-- Non-empty regional groups for Udupi
SELECT direction_key, distance_band_key, COUNT(pl.id) AS listing_count
FROM regional_area_classifications rac
JOIN property_listings pl
  ON pl.area_key = rac.area_key
  AND pl.status = 'LIVE'
  AND pl.property_type = 'agricultural_land'
WHERE rac.city_key = 'udupi'
GROUP BY rac.direction_key, rac.distance_band_key
ORDER BY rac.distance_band_key, rac.direction_key;
-- Expected: 7 rows
```

---

## Seed Coverage

### Udupi regional groups (after backfill)

| Direction | Band   | Area               | Listings | Boundary |
|-----------|--------|--------------------|----------|----------|
| N         | 0–10   | Brahmavar          | 4        | 3+1null  |
| E         | 0–10   | Manipal            | 2        | 2        |
| W         | 0–10   | Malpe              | 2        | 2        |
| S         | 10–25  | Shirva + Padubidri | 5        | 5        |
| N         | 25–50  | NorthMidTest *     | 2        | 1+1null  |
| S         | 25–50  | SouthFarTest *     | 2        | 2        |
| E         | 50+    | EastFarTest *      | 2        | 2        |

`*` = synthetic test-only area (inserted by this seed, not a V71 area)

**Total: 21 agri listings, 19 with boundary polygon, 2 with NULL boundary (one near/0-10, one far/25-50).**

### Kundapur regional groups (after backfill)

| Direction | Band  | Area      | Listings |
|-----------|-------|-----------|----------|
| NW        | 0–10  | Kundapura | 2        |

---

## City-Relative Classification Demo

The #1408 backfill classifies each area relative to its own city's geographic centre.

**Live evidence (after backfill):**

| area_key                  | city_key | direction | band | distance_km |
|---------------------------|----------|-----------|------|-------------|
| IN\|KA\|Udupi\|Brahmavar  | udupi    | N         | 0_10 | 9.8         |
| IN\|KA\|Udupi\|Kundapura  | kundapur | NW        | 0_10 | 0.5         |

This demonstrates that each city has its own independent classification — the same framework applied to each city's centre independently.

**As-shipped limitation (documented):** The same physical area can have a different classification relative to different cities. Brahmavar (13.4286°N, 74.7540°E) is:

- **N / 0_10** relative to Udupi (13.3409°N, 74.7421°E) — 9.8 km north
- **S / 10_25** relative to Kundapur (13.6218°N, 74.6943°E) — 22.4 km south

The #1408 backfill filters areas strictly by `city_id` (city membership), so Brahmavar (city_id=udupi) is only classified under city_key='udupi', not under 'kundapur'. This is a correct design choice (each area belongs to one city for discover purposes). The mathematical Brahmavar-vs-Kundapur value above is documented here for context. If a future issue requires cross-city area classification, that is a new feature outside the scope of #1408 or #1411.

---

## Synthetic Test Areas

Three test-only areas are inserted by this seed (NOT a Flyway migration):

| area_key                        | centroid lat | centroid lon | expected direction | expected band |
|---------------------------------|--------------|--------------|--------------------|---------------|
| IN\|KA\|Udupi\|NorthMidTest     | 13.6112      | 74.7421      | N                  | 25_50         |
| IN\|KA\|Udupi\|SouthFarTest     | 13.0706      | 74.7421      | S                  | 25_50         |
| IN\|KA\|Udupi\|EastFarTest      | 13.3409      | 75.2516      | E                  | 50_up         |

These exist in `public.areas` with city_id = udupi after running this seed. They are identifiable by their `[TEST]` name suffix. They are required because V71 supplies no Udupi-city areas beyond 20.6 km from the Udupi centre (all 12 V71 Udupi areas are in the 0_10 or 10_25 bands).

---

## Idempotency

Running the seed script twice is safe:

- Area rows: `ON CONFLICT (area_key) DO UPDATE` — centroid edits propagate
- Listing rows: `ON CONFLICT (id) DO UPDATE` — all fields refreshed to seed values
- No duplicate listings or area rows are created

Running the backfill twice is also safe:

- `ON CONFLICT (city_key, area_key) DO UPDATE` in `RegionalClassificationBackfillService`
- Same geometry → same classification → stable values

---

## Manual Discover Test Steps

After running seed + backfill + starting the backend:

1. **Verify regional groups endpoint:**
   ```
   GET http://localhost:8080/api/discover/regional-area-groups?city=udupi&propertyType=agricultural_land
   ```
   Expected: JSON with 7 non-empty groups covering N/E/W/S across all 4 bands.

2. **Verify Kundapur groups:**
   ```
   GET http://localhost:8080/api/discover/regional-area-groups?city=kundapur&propertyType=agricultural_land
   ```
   Expected: JSON with >= 1 group (NW/0_10, Kundapura).

3. **Open Discover in browser** (http://localhost:5173/discover?city=udupi) after starting the frontend dev server. Area groups should appear with agri listings.

---

## OpenSearch Compatibility Note

This seed data is **compatible** with a future OpenSearch index. The seeded listings follow the same schema as residential listings and will be ingested if an OpenSearch rebuild (`scripts/opensearch_rebuild.py`) is run against the fixture DB. No OpenSearch changes are made by this issue — OpenSearch implementation is out of scope.

---

## Verification SQL

Run these after `restore-test-fixture.sh` + seed + backfill:

```sql
-- (a) Total agri count
SELECT COUNT(*) FROM property_listings
WHERE status='LIVE' AND title LIKE '[AGRI]%' AND property_type='agricultural_land';
-- Expected: 21

-- (b) Per-area counts
SELECT area_key, COUNT(*) FROM property_listings
WHERE status='LIVE' AND title LIKE '[AGRI]%' AND property_type='agricultural_land'
GROUP BY area_key ORDER BY area_key;
-- Expected: 9 rows with Brahmavar=4, EastFarTest=2, Kundapura=2, Malpe=2, Manipal=2,
--           NorthMidTest=2, Padubidri=2, Shirva=3, SouthFarTest=2

-- (c) Boundary coverage
SELECT COUNT(*) FILTER (WHERE boundary IS NOT NULL) AS with_boundary,
       COUNT(*) FILTER (WHERE boundary IS NULL) AS without_boundary
FROM property_listings WHERE status='LIVE' AND title LIKE '[AGRI]%' AND property_type='agricultural_land';
-- Expected: with_boundary=19, without_boundary=2

-- (d) Invalid boundary = 0
SELECT COUNT(*) FROM property_listings
WHERE title LIKE '[AGRI]%' AND status='LIVE'
  AND boundary IS NOT NULL AND NOT ST_IsValid(boundary::geometry);
-- Expected: 0

-- (e) NULL geog = 0
SELECT COUNT(*) FROM property_listings WHERE title LIKE '[AGRI]%' AND status='LIVE' AND geog IS NULL;
-- Expected: 0

-- (f) Classification rows per city (after backfill)
SELECT city_key, COUNT(*) FROM regional_area_classifications GROUP BY city_key ORDER BY city_key;
-- Expected: kundapur >= 3, udupi >= 15

-- (g) All bands and directions covered (udupi)
SELECT DISTINCT distance_band_key FROM regional_area_classifications WHERE city_key='udupi' ORDER BY 1;
SELECT DISTINCT direction_key FROM regional_area_classifications WHERE city_key='udupi' ORDER BY 1;
-- Expected bands: 0_10, 10_25, 25_50, 50_up
-- Expected directions (at minimum): E, N, S, W

-- (h) City-relative proof + synthetic area classification
SELECT area_key, city_key, direction_key, distance_band_key, round(distance_km::numeric,1) AS dist_km
FROM regional_area_classifications
WHERE area_key IN (
  'IN|KA|Udupi|Brahmavar','IN|KA|Udupi|Kundapura',
  'IN|KA|Udupi|NorthMidTest','IN|KA|Udupi|SouthFarTest','IN|KA|Udupi|EastFarTest'
) ORDER BY area_key;
-- Expected:
--   Brahmavar:     city_key='udupi',     N,  0_10,  9.8
--   EastFarTest:   city_key='udupi',     E,  50_up, 55.1
--   Kundapura:     city_key='kundapur',  NW, 0_10,  0.5
--   NorthMidTest:  city_key='udupi',     N,  25_50, 30.1
--   SouthFarTest:  city_key='udupi',     S,  25_50, 30.1

-- (i) Idempotency (run seed twice, run backfill twice, then check stable counts)
SELECT COUNT(*) FROM property_listings WHERE title LIKE '[AGRI]%' AND status='LIVE';  -- 21
SELECT COUNT(*) FROM regional_area_classifications;  -- same as after first run
```

---

## Remote Development Restoration (#1647)

To restore agricultural discovery seed data and regional classifications on the **remote development DB** (used by deployed Pages/dev e2e):

```bash
ALLOW_REMOTE_DEV_AGRI_SEED=true TARGET_ENV=remote-dev ./scripts/db/seed-remote-dev-agricultural-listings.sh
```

**Safety guards:**
- Requires explicit environment variables (`ALLOW_REMOTE_DEV_AGRI_SEED=true` and `TARGET_ENV=remote-dev`).
- Explicitly warns before execution.
- Will not run against production.
- Completely idempotent (`ON CONFLICT DO UPDATE`).

