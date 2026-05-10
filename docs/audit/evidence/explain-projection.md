# Discover EXPLAIN / Index-Usage Projection (Issue #1046)

> **Important caveat — Evidence label rules apply.**
> Backend `application.yml` connects to remote Supabase Postgres (`SUPABASE_DB_HOST`/`SUPABASE_DB_PORT:6543`). Audit phase did NOT have credentials to run `EXPLAIN (ANALYZE, BUFFERS)` against a live DB. Per the approved plan's `[projection_method]`:
>
> *"If synthetic data is unavailable: rely on EXPLAIN plans on current data plus index/cardinality reasoning and clearly mark projections."*
>
> Every finding in this artefact is labelled **STATIC_CODE_RISK** or **PROJECTION (mechanism)**. None are MEASURED. Runtime EXPLAIN evidence collection is recommended as a P0 follow-up issue.

## Index inventory (relevant subset)

| Index | Table | Columns | Purpose for Discover |
|---|---|---|---|
| `idx_property_listings_geog` (V73) | property_listings | GIST (geog) | Polygon prefilter, school radius, bbox filters |
| `idx_listing_area_key_status_created` (V74) | property_listings | (area_key, status, created_at DESC) | Area-keyed listings ORDER BY created_at DESC |
| `idx_property_listings_status_created_at` (V13) | property_listings | (status, created_at DESC) | Generic LIVE listings sort |
| `idx_property_listings_area_key` (V13) | property_listings | (area_key) | Area-IN subquery |
| `idx_property_listings_property_type` (V0) | property_listings | (property_type) | Type filter |
| `idx_property_listings_locality` (V0) | property_listings | (locality) | Locality filter / aggregate GROUP BY |
| `idx_property_listings_price` (V0) | property_listings | (price) — NOT price_paise | Price filter — column mismatch (see finding below) |
| `idx_property_listings_seller_type` (V33) | property_listings | (seller_type) | Seller type filter |
| `idx_property_listings_bbox_not_dup` (V13) | property_listings | (latitude, longitude) WHERE NOT is_duplicate | Lat/lng bbox (legacy; geog superseded) |
| `idx_property_listings_not_archived` (V35) | property_listings | (status, created_at DESC) WHERE archived_at IS NULL | Soft-delete-aware status sort |
| `idx_schools_geog` GIST (V75/V76) | schools | GIST (geog) | School proximity queries |
| `uq_listing_images_listing_path` (V12) | listing_images | UNIQUE (listing_id, storage_path) | Upload idempotency |
| **MISSING** | listing_images | (listing_id, position, id) | Lateral hero-image subquery — see Finding L1 |

## Endpoint-by-endpoint projection

### EP-1: `GET /api/discover/listings` — DiscoverListingsService.getListings (DiscoverListingsService.java:39-161)

**SQL shape:**
```
-- COUNT
SELECT COUNT(*) FROM property_listings pl WHERE <predicate>;

-- SELECT with lateral hero subquery
SELECT pl.id, ..., (SELECT li.url FROM listing_images li WHERE li.listing_id=pl.id ORDER BY li.position ASC, li.id ASC LIMIT 1) AS hero_image_url, ...
FROM property_listings pl WHERE <predicate>
ORDER BY pl.created_at DESC LIMIT ? OFFSET ?;
```

**Predicate composition (DiscoverListingPredicateBuilder.java):**
- Always: `pl.status='LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate=false`
- City: `pl.area_key IN (SELECT a.area_key FROM areas a JOIN cities c ON c.id=a.city_id WHERE c.slug=?)` — subquery, may inline if planner chooses
- Property types: `pl.property_type IN (?,?,?)`
- Localities: `pl.locality IN (?,?,?)`
- Price min/max: `pl.price_paise >= ? AND pl.price_paise <= ?` — note: index is on `price`, not `price_paise` (Finding I1)
- Bedrooms: `pl.bedrooms IN (...)` or `pl.bedrooms >= 4`
- Bbox: `pl.geog && ST_MakeEnvelope(...)::geography` — GIST-friendly (uses idx_property_listings_geog)
- Polygon: `ST_Intersects(envelope::geography, pl.geog) AND ST_Contains(geom, pl.geog::geometry)` — GIST-friendly two-stage
- School radius: `ST_DWithin(pl.geog, ST_MakePoint(?,?)::geography, ?)` — GIST-friendly (uses idx_property_listings_geog)

**Findings:**

- **EP-1.A — COUNT(*) per page request — STATIC_CODE_RISK + PROJECTION (mechanism: aggregate scan on filtered set)**
  At 10–100 rows: trivial. At 1M rows with broad filter (e.g. city only), COUNT runs full predicate scan; even with index, it must visit every matching row. Postgres has no covering optimisation for this WHERE shape. Mitigation options listed in §4 of architecture-readiness.md.

- **EP-1.B — Lateral hero-image subquery without composite index — STATIC_CODE_RISK**
  `listing_images` indexes (V12, V25): `UNIQUE (listing_id, storage_path)`. The hero subquery filters `listing_id = pl.id` and ORDER BY `position ASC, id ASC LIMIT 1`. Without `(listing_id, position, id)` composite, Postgres can use the unique index to find rows but must sort by position+id afterward. Per page (size=50) this is 50 nested lookups + 50 small sorts. PROJECTION at 1M rows × 50/page: still bounded per-page but adds latency proportional to images-per-listing.

- **EP-1.C — LIMIT/OFFSET pagination — STATIC_CODE_RISK + PROJECTION (mechanism: OFFSET depth)**
  At deep pages (e.g. page 200, OFFSET 10000), Postgres must scan all preceding rows. PROJECTION: typical browsing won't reach this; SEO crawlers/scrapers will. Keyset pagination (WHERE created_at < last_seen) is the standard fix.

- **EP-1.D — `idx_property_listings_price` is on `price` not `price_paise` — STATIC_CODE_RISK (low likelihood of cliff, but index is unused)**
  V0 created `CREATE INDEX idx_property_listings_price ON property_listings(price)`. Predicate uses `pl.price_paise`. PROJECTION: planner falls back to index scan via other predicates (status / area_key / type) — usually fine, but at scale with price-only filters there is no helpful index. Verify whether `price` column still exists or has been dropped.

- **EP-1.E — `area_key IN (SELECT ...)` subquery — STATIC_CODE_RISK (likely fine, verify)**
  Subquery on `areas`/`cities` is small (~tens of rows). Planner should hash-join. PROJECTION: confirmed by EXPLAIN required.

- **EP-1.F — No `SET LOCAL statement_timeout` — STATIC_CODE_RISK**
  A bad query at scale can tie up Tomcat threads. PROJECTION: at 1M and bad filters, request can stall pool. Recommend `statement_timeout` per Discover endpoint.

### EP-2: `GET /api/discover/listings?includeAggregates=true` — DiscoverListingsService.buildAggregates (DiscoverListingsService.java:163-184)

**SQL:**
```
SELECT pl.locality, COUNT(*) AS cnt FROM property_listings pl WHERE <predicate> GROUP BY pl.locality ORDER BY cnt DESC LIMIT 6;
```

**Findings:**
- **EP-2.A — GROUP BY locality recomputed per request — STATIC_CODE_RISK + PROJECTION (mechanism: aggregate scan)**
  At 1M rows this is a full filtered-set scan + hash aggregate. `idx_property_listings_locality` exists but provides only marginal benefit for an aggregate over the full WHERE-matched set. PROJECTION: at 1M, this query alone could exceed sub-second budget. Cache or precompute (V70 `area_overview_stats` already exists for related rollups).

### EP-3: `GET /api/discover/markers` — DiscoverMarkersService.getMarkers (DiscoverMarkersService.java:33-63)

**SQL:**
```
SELECT pl.id, pl.latitude, pl.longitude, pl.price_paise, pl.locality
FROM property_listings pl
WHERE <predicate>
ORDER BY pl.id
LIMIT 1001;  -- CAP=1000, fetch CAP+1 to detect overflow
```

**Findings:**
- **EP-3.A — CAP=1000 (not 5000 as previously assumed) — STATIC_CODE_RISK**
  Hard-cap at `DiscoverMarkersService.CAP=1000`. `truncated` flag is returned in response but NOT consumed by frontend (see frontend Finding #14). At 1M city, viewport-bounded queries are essential to make this cap meaningful — without bbox/polygon, the 1000 returned are effectively random "first 1000 by id".

- **EP-3.B — `ORDER BY pl.id` is not selective for spatial UX — STATIC_CODE_RISK**
  Markers are returned in id order, not by relevance/proximity. At truncation, the 1000 markers shown bear no relation to viewport centre. PROJECTION: at any scale > CAP, marker behaviour degrades to "first 1000 by insertion order".

- **EP-3.C — No viewport-required guard — STATIC_CODE_RISK + PROJECTION (mechanism: unbounded marker payload)**
  Predicate accepts but does not require bbox/polygon. A city-level marker request without viewport scans the full city dataset. At 100k+ rows this is a multi-second query and a 30+ KB response. PROJECTION at 1M without viewport-bounds enforcement: infeasible.

### EP-4: `GET /api/listings/markers` — ListingMarkersController (alternative marker endpoint)

Not yet inspected at SQL level; controller exists at `backend/.../ListingMarkersController.java:37`. Naming overlap with `/api/discover/markers` suggests one is legacy or used by a different journey. **Audit recommendation:** confirm if dead code or active; deduplicate.

### EP-5: `GET /api/discover/cities/{city}/listings` — CityAreaListingsController (CityAreaListingsController.java:58)

Not deep-audited at SQL level due to evidence budget. Frontend caller is `useDiscoverCityListings` with `limitPerArea=5` and area-key list. SQL likely uses LATERAL or per-area UNION/CTE. **Recommended:** audit during follow-up; structural shape suggests acceptable bound (5 × ~30 areas = 150 rows).

### EP-6: `GET /api/discover/areas` — AreaSummaryController (AreaSummaryController.java:36)

Reads from `area_overview_stats` rollup table (V70). PROJECTION: rollup table queries are cheap; refresh cadence is the hidden risk. **Audit recommendation:** confirm the refresh job + freshness SLO.

### EP-7: `GET /api/discover/area-groups` — AreaGroupsController (AreaGroupsController.java:35)

Slow-changing seeded data. PROJECTION: trivial query; ideal candidate for HTTP `Cache-Control: public, max-age=...` (currently absent).

### EP-8: `GET /api/public/schools/popular` — SchoolController (SchoolController.java:117)

Confirmed path. Not deep-audited.

### EP-9: `GET /api/public/schools/by-area` — SchoolController (SchoolController.java:164)

Confirmed path. Filters by area centroid + board/category. Uses schools.geog GIST index (V75/V76).

### EP-10: `GET /api/public/schools/nearby` — SchoolController (SchoolController.java:70)

Confirmed path (named `/nearby`, not `/{id}/nearby-homes` as assumed). Uses schools.geog. School-selected nearby-HOMES is served by `/api/discover/listings?schoolLat=&schoolLon=&schoolRadiusKm=` (predicate builder branch). Confirmed: school-selected nearby-homes path does NOT have its own endpoint; it reuses listings predicate.

## Summary of database-side projections

| Endpoint | Index utilisation | Risk at 100k | Risk at 1M | Mechanism (PROJECTION) |
|---|---|---|---|---|
| EP-1 listings | GiST hit on geog; B-tree on area_key/status; price_paise has no usable index | Medium | High | aggregate scan (COUNT) + lateral subquery + OFFSET |
| EP-2 aggregates | locality B-tree; full filtered scan for GROUP BY | Medium | High | aggregate scan |
| EP-3 markers | GiST hit when bbox/polygon present | High (without viewport) | Critical (without viewport) | unbounded marker payload |
| EP-4 listings/markers | UNKNOWN | UNKNOWN | UNKNOWN | needs audit |
| EP-5 cities/{city}/listings | per-area lookup; bounded | Low | Low | bounded by limitPerArea |
| EP-6 areas | rollup table read | Low | Low | freshness SLO unknown |
| EP-7 area-groups | seeded data | Low | Low | cacheable |
| EP-8 schools/popular | UNKNOWN | UNKNOWN | UNKNOWN | needs audit |
| EP-9 schools/by-area | GIST hit on schools.geog | Low | Medium | should be index-friendly |
| EP-10 schools/nearby | GIST hit on schools.geog | Low | Medium | should be index-friendly |

## Index-improvement candidates surfaced (do not implement; for follow-up)

- **L1: Composite index on `listing_images(listing_id, position, id)`** for the hero subquery in EP-1. STATIC_CODE_RISK.
- **L2: `idx_property_listings_price_paise` (or replace `idx_property_listings_price` if `price` column is dead)** for EP-1 price-only filters. STATIC_CODE_RISK.
- **L3: `pg_stat_statements` extension + `auto_explain.log_min_duration_statement`** for ongoing observability. ABSENT.
