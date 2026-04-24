# ADR 0001 — PostGIS Adoption for Spatial Bounding-Box Queries

**Status:** Accepted  
**Date:** 2026-04-24  
**Lane:** D (D-1 through D-5)  
**Related Flyway slot:** V73 (D-2)

---

## Context

The `/discover` map endpoint serves a map viewport that must filter `property_listings` rows to those whose coordinates fall within the visible bounding box. The current spatial index (V57) is a B-tree composite on `(latitude, longitude)`:

```sql
CREATE INDEX IF NOT EXISTS idx_property_listings_lat_lon
    ON property_listings (latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
```

A B-tree on two numeric columns answers point-lookup and range-scan queries, but PostgreSQL cannot use it for a two-dimensional bounding box (`lat BETWEEN y1 AND y2 AND lon BETWEEN x1 AND x2`) in a single index scan — it degrades to a bitmap heap scan that touches all rows whose latitude is in range, then filters on longitude in memory. At scale this is O(n) in the latitude-range cardinality, not O(log n).

The markers endpoint (created by C-1 as `ListingMarkersController`) will accept `bbox` and `zoom` parameters. Without a proper spatial index, every request scans a large fraction of the table.

---

## Decision

**Adopt the PostGIS extension** and represent each listing's location as a native PostgreSQL `geography` value stored in a GENERATED column. Index it with a GiST index.

V73 (`V73__postgis_geog.sql`) will:
1. `CREATE EXTENSION IF NOT EXISTS postgis` — idempotent, no-op if already present.
2. `ALTER TABLE property_listings ADD COLUMN geog geography(Point, 4326) GENERATED ALWAYS AS (ST_MakePoint(longitude, latitude)::geography) STORED` — keeps the column in sync with `latitude`/`longitude` without application code changes.
3. `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_listings_geog ON property_listings USING GIST (geog) WHERE geog IS NOT NULL` — CONCURRENTLY avoids a table lock on large datasets; the `WHERE` clause excludes rows with null coordinates from the index.

The `ListingMarkersController` (D-4) will then issue:

```sql
ST_Intersects(geog, ST_MakeEnvelope(x1, y1, x2, y2, 4326)::geography)
```

which uses the GiST index for O(log n) I/O.

---

## Alternatives Considered

### 1. Keep B-tree + range predicate (status quo)

`lat BETWEEN y1 AND y2 AND lon BETWEEN x1 AND x2` is readable and requires no extension. However, PostgreSQL uses the B-tree for at most one of the two inequality columns in the same scan. At ~50 k live listings the query plan degrades to a bitmap heap scan with a recheck. Rejected for performance.

### 2. `earthdistance` + `cube` extension

Lighter-weight than PostGIS; supports `earth_box` circle queries. Does not natively support arbitrary bounding rectangles. Would require workarounds (over-approximate with a circle, then re-filter). Adds `cube` type complexity without the broader ecosystem benefit. Rejected.

### 3. PostGIS `geometry` instead of `geography`

`geometry` uses a flat Cartesian coordinate system (faster for large-scale global data). For small-area property data centred on coastal Karnataka (lat ≈ 13 °N), the difference in accuracy over a typical viewport (±1 °) is negligible. `geography` handles the spheroid automatically and sidesteps edge-case bugs at the prime meridian / poles that geometry can silently mishandle. Accepted as the column type for `geography`.

### 4. Partition the table by city slug

Partition-pruning can achieve bounding-box locality without PostGIS. This would require Flyway to re-create `property_listings` as a partitioned table — a multi-migration, high-risk operation that would need several expand/contract cycles. Deferred; revisit if row count exceeds 500 k.

---

## Migration Risk

| Risk | Severity | Mitigation |
|---|---|---|
| `CREATE EXTENSION` requires superuser or `CREATE` privilege on the database | **High** | Supabase grants `CREATE EXTENSION` to the `postgres` role used by Flyway. Confirmed in Supabase dashboard — PostGIS is available in the extension list. |
| GENERATED column references `longitude` then `latitude` (order matters for `ST_MakePoint`) | **Medium** | Expression is `ST_MakePoint(longitude, latitude)` — longitude first, matching PostGIS convention (x, y = lon, lat). Test with `SELECT ST_AsText(geog)` after migration. |
| `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block | **Medium** | Flyway wraps migrations in transactions by default. V73 must include `-- no transaction` at the top, or the index creation must be split into a separate migration. Chosen approach: `-- flyway:no-transaction` directive at file top. |
| Rows where `latitude IS NULL OR longitude IS NULL` produce a NULL GENERATED value | **Low** | GiST `WHERE geog IS NOT NULL` skips these rows. Query predicate `ST_Intersects` returns false for NULL, matching existing behaviour. |
| GIST index build locks the table for writes on older PostgreSQL | **Low** | `CONCURRENTLY` avoids write lock. Supabase runs PostgreSQL 15; `CREATE INDEX CONCURRENTLY` is stable. |

---

## Consequences

- D-4 (`ListingMarkersController` method bodies) can use `ST_Intersects` / `ST_MakeEnvelope` once V73 is deployed.
- D-5 (`useDiscoverMarkers.ts`) can send `bbox` params to the markers endpoint once D-4 is live.
- Any future radius/isochrone search (backlog #404) can leverage the same `geog` column without a new migration.
- Adds a PostGIS dependency to the backend test environment. Integration tests that touch `property_listings` spatially will require a PostGIS-enabled PostgreSQL instance (already satisfied by the Supabase local emulator).
