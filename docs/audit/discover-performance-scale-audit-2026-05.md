# Discover Performance & Scale Audit — May 2026

**Issue:** #1162  
**Date:** 2026-05-27  
**Author:** Architect spike (read-only — no production code modified)  
**DB status:** Database unavailable during audit. No EXPLAIN ANALYZE was run. All scale estimates are derived from code inspection + Postgres/PostGIS well-known behaviour at stated data volumes.

---

## Definitive Answers (summary box)

| Question | Answer |
|----------|--------|
| Is DB-backed contextual search (FTS via Postgres GIN) acceptable short-term? | **Yes** — until P95 FTS query latency exceeds 200 ms on `/api/discover/listings?q=...` with GIN in use, OR until a faceted-search/autocomplete product requirement is raised. Neither applies today. |
| What breaks first at each scale tier? | **1M:** COUNT(*) before SELECT in `DiscoverListingsService` becomes the first pain point; ST_DWithin manageable with GiST. **10M:** ST_DWithin candidate explosion in dense areas + GIN write contention during bulk ingestion. **100M:** Postgres FTS and PostGIS throughput are both exhausted; OpenSearch required. |
| Is a single school-context BFF endpoint worth building? | **No** — not now. The four concurrent queries are already parallel (TanStack Query). Trigger: measured waterfall showing >300 ms cascade delay from a sequential dependency chain, evidenced by RUM data. |
| When should Elasticsearch/OpenSearch be introduced? | Primary trigger: P95 FTS latency >200 ms (measured). Secondary: P95 ST_DWithin >300 ms. Scale: >500K LIVE listings AND >500 inserts/min. Feature: autocomplete, faceted sidebar counts, or BM25-ranked relevance. Do not adopt speculatively before one of these triggers is hit. |

---

## 1. Discover Endpoint Inventory

| HTTP method + path | Controller class (file) | Service / query method | Auth | Query type | Keyword `q` status (post-#1184/#1187) |
|---|---|---|---|---|---|
| `GET /api/discover/cities/{city}/listings` | `CityAreaListingsController` | `CityAreaListingsService.getAreaListings()` | **PUBLIC** | Single SQL round-trip: LEFT JOIN `areas`→`property_listings` with ROW_NUMBER() OVER PARTITION window; filters on LEFT JOIN ON clause | **Wired** — added by #1184; `websearch_to_tsquery` in ON clause (`CityAreaListingsService.java` line 116) |
| `GET /api/discover/markers` | `DiscoverMarkersController` | `DiscoverMarkersService.getMarkers()` via `DiscoverListingPredicateBuilder.build()` | **AUTH** | Single SQL: shared WHERE fragment, ST_DWithin spatial, up to 5 000 markers | **NOT wired** — `null` literal passed at `DiscoverMarkersController.java` line 98; correctness gap (see Section 2) |
| `GET /api/discover/listings` | `DiscoverListingsController` | `DiscoverListingsService.getListings()` via `DiscoverListingPredicateBuilder.build()` | **AUTH** | Two SQL round-trips: COUNT(*) then paginated SELECT ... LIMIT ? OFFSET ? | **Wired** — added by #1187; threads through `DiscoverListingsController` → `DiscoverListingsService` → `DiscoverListingPredicateBuilder` line 216 |
| `GET /api/public/schools/{id}` | `SchoolController` | `SchoolService.findById()` | **PUBLIC** | PK lookup | N/A |
| `GET /api/public/schools/search` | `SchoolController` | `SchoolService.search()` | **PUBLIC** | FTS / LIKE on `schools` table | N/A |
| `GET /api/public/schools/nearby` | `SchoolController` | `SchoolService.findNearby()` | **PUBLIC** | ST_DWithin on `schools.geog` (V75/V76) | N/A |
| `GET /api/public/schools/by-area` | `SchoolController` | `SchoolService.findByArea()` | **PUBLIC** | `school_area_key` column lookup (V79/V80) | N/A |
| `GET /api/discover/areas` | `DiscoverAreasController` (assumed) | Areas query on `areas` + `cities` tables | **PUBLIC** | Simple SELECT + city slug filter | N/A |

**Notes on #1184 / #1187 q status:**
- #1184 (merged): Added `q` to the PUBLIC area-scoped endpoint `GET /api/discover/cities/{city}/listings`. The FTS clause is placed in the LEFT JOIN ON condition (not WHERE) so areas with zero keyword-matching listings still appear with `listings: []`. Correct.
- #1187 (merged): Added `q` to the AUTH `GET /api/discover/listings` endpoint through all four Java layers. Correct.
- **Gap:** `GET /api/discover/markers` still passes `q = null` (hardcoded at `DiscoverMarkersController.java` line 98). This means a keyword search (`q=villa`) will return filtered listing cards and a filtered listing count, but the map markers will show the unfiltered set. This is a correctness divergence that must be closed before keyword search ships to users.

---

## 2. Current DB / FTS / PostGIS Strategy

### Full-text search (FTS)

Migration `V18__add_listing_fts_vector.sql` added a generated stored column:

```sql
ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS search_vector tsvector
        GENERATED ALWAYS AS (
            to_tsvector('english',
                coalesce(title, '') || ' ' ||
                coalesce(locality, '') || ' ' ||
                coalesce(description, ''))
        ) STORED;

CREATE INDEX IF NOT EXISTS idx_property_listings_search_vector
    ON public.property_listings USING gin(search_vector);
```

Coverage: `title`, `locality`, `description` only. Fields like `property_type`, `seller_type`, `listing_purpose` are not tokenised into `search_vector`; they are filtered via exact-match predicates separately.

Query pattern — both endpoints that support `q` use the same operator:

```sql
-- CityAreaListingsService.java line 116 (LEFT JOIN ON clause)
AND pl.search_vector @@ websearch_to_tsquery('english', ?)

-- DiscoverListingPredicateBuilder.java line 216 (WHERE fragment)
AND pl.search_vector @@ websearch_to_tsquery('english', ?)
```

`websearch_to_tsquery` supports quoted phrases, negation (`-`), and OR — adequate for property discovery.

### PostGIS / geospatial

Migration `V73__postgis_geog.sql` added a generated stored geography column:

```sql
ALTER TABLE property_listings
    ADD COLUMN IF NOT EXISTS geog geography(Point, 4326)
        GENERATED ALWAYS AS (
            CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL
                THEN ST_MakePoint(longitude, latitude)::geography
                ELSE NULL
            END
        ) STORED;

CREATE INDEX IF NOT EXISTS idx_property_listings_geog
    ON property_listings USING GIST (geog)
    WHERE geog IS NOT NULL;
```

> **Note:** The migration uses a `${concurrently_keyword}` Flyway placeholder that resolves to `CONCURRENTLY` on non-pgBouncer targets.

Three spatial predicate patterns in `DiscoverListingPredicateBuilder.java`:

**School-radius (ST_DWithin)** — lines 186–192:
```sql
AND ST_DWithin(pl.geog, ST_MakePoint(?, ?)::geography, ?)
-- params: schoolLon, schoolLat, radiusKm * 1000.0 (metres)
-- default radius: 2.0 km when schoolLat/schoolLon provided but radiusKm absent
```

**Viewport bbox (`&&` overlap)** — lines 200–207:
```sql
AND pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography
-- params: west, south, east, north
```

**Drawn polygon (two-stage)** — lines 158–177:
```sql
-- Stage 1: GiST prefilter (envelope intersect)
AND ST_Intersects(ST_Envelope(ST_GeomFromText(?, 4326))::geography, pl.geog)
-- Stage 2: exact containment
AND ST_Contains(ST_GeomFromText(?, 4326), pl.geog::geometry)
```

The two-stage polygon approach is correct: Stage 1 uses the GiST index to prune to the bounding box cheaply; Stage 2 runs the exact `ST_Contains` only on the surviving candidates.

### Area-scoped listing query (PUBLIC path)

`CityAreaListingsService.java`: single SQL with `ROW_NUMBER() OVER (PARTITION BY a.area_key ORDER BY pl.created_at DESC)` in a subquery, capped at `MAX_LIMIT = 20` (line 39). The `DEFAULT_LIMIT = 5` (line 38) applies when the client sends no `limitPerArea` param. The frontend `useDiscoverMapData` sends `limitPerArea: 50`, which the backend clamps to 20 server-side. This is intentional and documented in the codebase.

The LEFT JOIN structure ensures areas with zero matching listings still appear in the response (with `listings: []`), which is the correct behaviour for the area-cards right panel.

### AUTH paginated listing query (two SQL round-trips)

`DiscoverListingsService.java` lines 48–49 + 56–93:

```java
// Round-trip 1: COUNT — no pagination, same WHERE
String countSql = "SELECT COUNT(*) FROM property_listings pl WHERE " + whereFragment;
Long total = jdbc.queryForObject(countSql, Long.class, baseParams.toArray());

// Round-trip 2: paginated SELECT with LIMIT / OFFSET
// ... ORDER BY pl.created_at DESC LIMIT ? OFFSET ?
```

Both round-trips execute the full `DiscoverListingPredicateBuilder` WHERE fragment. The COUNT is used to compute `totalPages` for the pagination UI. This is the primary scale risk in the backend (see Section 3).

### TanStack Query client-side caching

| Hook | Endpoint | `staleTime` |
|------|----------|-------------|
| `useDiscoverAreas` | `GET /api/discover/areas` | 300 000 ms (5 min) |
| `useDiscoverMarkers` | `GET /api/discover/markers` (public, static) | 300 000 ms |
| `useDiscoverFilteredMarkers` | `GET /api/discover/markers` (auth, filter-aware) | 60 000 ms |
| `useDiscoverCityListings` | `GET /api/discover/cities/{city}/listings` | 60 000 ms |
| `useDiscoverListings` | `GET /api/discover/listings` | 60 000 ms |

These `staleTime` values are appropriate for a slow-changing real-estate inventory. They deduplicate within a single browser tab; they do not benefit cross-tab or cross-session requests. HTTP `Cache-Control` headers on public endpoints would extend cache benefit to the CDN/edge layer (see Section 7).

---

## 3. Scale Risk Assessment

### At 1M listings

| Flow | Risk level | What breaks first |
|------|------------|-------------------|
| `COUNT(*)` in `DiscoverListingsService` | **HIGH** | With an unselective filter set (no area, no FTS, no radius), COUNT becomes a sequential scan of 1M rows even with partial indexes. P95 latency likely 200–500 ms on typical cloud Postgres hardware. |
| OFFSET deep-page | **MEDIUM** | `OFFSET N` requires the DB to scan and discard N rows before returning results. At page 100 with size 20, OFFSET = 2 000. At 1M rows this is fast, but at deep pages with a slow filter it compounds. Not yet critical at 1M. |
| ST_DWithin (school-radius) | **LOW-MEDIUM** | GiST prunes to bbox before exact distance check. At 1M listings with ~30% having valid `geog` (300K rows), a 5 km radius in a dense area scans perhaps 10K–50K candidates post-prune. Manageable. |
| GIN FTS | **LOW** | GIN `@@` operator is O(log N) per tsquery term. At 1M listings FTS combined with high-selectivity predicates (status=LIVE + area_key IN ...) is fast. GIN index size: ~50–200 MB. |
| Marker cardinality | **LOW** | `DiscoverMarkersController` hardcaps at 5 000 markers; WARN logged if truncated. Not a DB risk — a UX correctness risk if dense areas always truncate. |
| Frontend orchestration | **NEGLIGIBLE** | Four concurrent TanStack Query hooks with HTTP/2 multiplexing. No sequential dependency cascade at current scale. |

**First failure at 1M: COUNT(*) on `GET /api/discover/listings` with broad filter sets.**

### At 10M listings

| Flow | Risk level | What breaks first |
|------|------------|-------------------|
| COUNT(*) | **CRITICAL** | A full-table COUNT with a partial or non-selective WHERE is a multi-second operation. The "N properties found" display blocks page render. |
| OFFSET deep-page | **HIGH** | At page 500 (OFFSET 10 000), the DB scans and discards 10K rows before returning 20. Combined with a slow COUNT, pagination becomes unusable at depth. |
| ST_DWithin dense-area | **HIGH** | 10M listings, 30% with geog = 3M candidate rows. A 10 km radius in a dense city post-GiST-prune could produce 500K–1M exact-distance evaluations. GiST alone is not sufficient; a partial index on `(geog) WHERE status = 'LIVE' AND archived_at IS NULL` would reduce the scanned set meaningfully. |
| GIN write contention | **MEDIUM** | At 10M listings, the GIN index on `search_vector` is 500 MB–2 GB. Concurrent INSERTs/UPDATEs cause GIN pending-list growth; if `autovacuum` cannot keep up, GIN scan degrades until a full index rebuild. Not a risk at current write rates (real-estate inventory is slow-changing), but a risk during bulk ingestion. |
| Marker 5 000 cap | **MEDIUM** | At 10M listings, broad filter sets return tens of thousands of markers. The 5 000 cap causes significant map information loss. Cluster-based aggregation (server-side) becomes necessary. |

**First failure at 10M: COUNT(*) + ST_DWithin candidate explosion in dense cities.**

### At 100M listings

All Postgres-backed flows are exhausted:
- COUNT(*) is unmaintainable without `reltuples` approximation or a separate pre-aggregated counter.
- OFFSET pagination requires replacement with keyset/cursor pagination.
- GIN FTS throughput is bounded by Postgres connection pool; cannot scale horizontally.
- PostGIS `ST_DWithin` on a single-node instance cannot handle concurrent spatial queries at this volume.
- OpenSearch (or Elasticsearch) is required for both FTS and geo queries.

**Ranked failure order at 100M:** COUNT(*) → OFFSET deep-page → ST_DWithin throughput → GIN update contention → Postgres connection pool saturation.

---

## 4. Query / Index Risk Register

| Hot query | Supporting index | Index used? | Risk | Recommended mitigation |
|-----------|-----------------|-------------|------|------------------------|
| AUTH paginated listings — COUNT(*) WHERE status=LIVE AND area_key IN (...) | `idx_listing_area_key_status_created` (V74): `(area_key, status, created_at DESC)` | Yes for area-scoped queries. Partial-match on status=LIVE. Not helpful for cross-area or no-area queries. | HIGH at 1M+ with broad filters | Add approximate COUNT via `pg_class.reltuples` for the UI "N properties found" display; reserve exact COUNT for export/API consumers only. |
| AUTH paginated listings — SELECT ... ORDER BY created_at DESC LIMIT ? OFFSET ? | `idx_listing_area_key_status_created` (V74) + `idx_listings_trust_ranking` (V62) | V74 for ORDER BY `created_at DESC` when area filter present. V62 for trust-rank sort. | HIGH (OFFSET) at 10M+ deep pages | Replace OFFSET pagination with keyset pagination (cursor on `created_at + id`). |
| AUTH markers — ST_DWithin(pl.geog, school_point, radius_m) | `idx_property_listings_geog` (V73 GiST, partial `WHERE geog IS NOT NULL`) | Yes — GiST supports ST_DWithin on geography. | MEDIUM at 1M, HIGH at 10M+ in dense areas | Add partial index `ON property_listings USING GIST (geog) WHERE status = 'LIVE' AND archived_at IS NULL` as V81. Reduces scanned set to LIVE rows only. |
| AUTH markers — bbox `&&` operator | `idx_property_listings_geog` (V73 GiST) | Yes — GiST supports `&&` on geography. | LOW at 1M, MEDIUM at 10M+ | Same partial LIVE-only GiST index as above. |
| AUTH markers — polygon ST_Intersects + ST_Contains | `idx_property_listings_geog` (V73 GiST) prefilter via envelope | Yes (Stage 1). Stage 2 exact containment on surviving candidates only. | LOW-MEDIUM | No mitigation needed until 10M+. |
| PUBLIC area listings — FTS websearch_to_tsquery in LEFT JOIN ON | `idx_property_listings_search_vector` (V18 GIN) | Yes — `@@` operator uses GIN. Combined with ROW_NUMBER window, candidate set is area-bounded before ranking. | LOW | Confirm via EXPLAIN ANALYZE (see Section 9). |
| AUTH listings — FTS websearch_to_tsquery in WHERE fragment | `idx_property_listings_search_vector` (V18 GIN) | Yes — `@@` operator uses GIN. BUT combined selectivity with other predicates determines whether planner prefers GIN or another index first. | LOW-MEDIUM | Run EXPLAIN ANALYZE to confirm GIN chosen by planner when combined with city/area predicates. |
| school-area-key lookup — `WHERE school_area_key = ?` | V79 adds `area_key` column + `idx_schools_area_key ON schools(area_key)` (line 11); V80 adds trigger. | Yes — `idx_schools_area_key` (V79, `schools(area_key)`) | LOW (index exists; schools table is small) | None required — index already present. |
| Area-first city slug validation — `SELECT COUNT(*) FROM cities WHERE slug = ?` in `CityAreaListingsService` | No explicit index on `cities.slug` seen in migrations reviewed. | UNVERIFIED | LOW (cities table is small; full scan is fast) | Add unique index on `cities(slug)` if not already present (likely added by V71 `cities_and_areas.sql` — verify). |

---

## 5. Single School-Context Endpoint Assessment

### Proposed endpoint shape

A hypothetical `GET /api/discover/schools/{id}/context` would bundle:

```json
{
  "school": { "id", "name", "latitude", "longitude", "areaKey", "board", "category", "prominenceTier" },
  "radiusKm": 3.0,
  "areaListings": { "areaKey", "listings": [...], "totalCount" },
  "markers": { "markers": [...], "truncated": false },
  "counts": { "totalListings", "withinRadius" }
}
```

### Trade-off analysis

**Latency.** The four current calls (`useDiscoverCityListings`, `useDiscoverFilteredMarkers`, `useDiscoverListings`, `useSchoolById`) are fired concurrently by `useDiscoverMapData`. The bottleneck is the slowest individual call — likely `useDiscoverListings` (two SQL round-trips). Combining into one HTTP call does not reduce DB query count; it shifts parallelism from client-side fetch concurrency to server-side sequential or parallel execution, which is harder to reason about and harder to cache.

**Over-fetch.** School detail is essentially static. Markers refresh on filter change. Paginated listings change on page navigation. Bundling forces re-fetching all data on any state transition, including pagination events.

**Caching.** TanStack Query caches each hook independently with distinct keys. `useDiscoverAreas` and `useSchoolById`-equivalent calls use `staleTime: 300_000`; dynamic endpoints use `staleTime: 60_000`. A combined endpoint must pick one stale time — either over-caching dynamic listing data or under-caching static school detail. Independent caches are superior.

**Cache invalidation.** When the user moves the radius slider, only the markers and listings re-fetch. With a combined endpoint, the entire bundle re-fetches including unchanged school detail.

**Auth/anon divergence.** The combined endpoint must handle the auth boundary internally. The current split (`useDiscoverCityListings` = PUBLIC; `useDiscoverFilteredMarkers` / `useDiscoverListings` = AUTH) is a clean boundary that maps directly to `DiscoverMarkersController` (auth-required) vs `CityAreaListingsController` (public). A combined endpoint would either return different payload shapes based on JWT presence (a correctness and maintainability hazard) or require two endpoint variants.

**Coupling.** The combined controller would require `DiscoverListingPredicateBuilder`, `CityAreaListingsService`, `DiscoverMarkersService`, and `SchoolService` wired together — significant coupling for services designed with single responsibility.

**Network savings.** Three fewer HTTP round-trips at current scale. With HTTP/2 multiplexing (standard on modern infrastructure), these are zero-cost multiplexed streams, not sequential connections.

### Verdict: NOT worth building now

**Trigger condition for reconsideration:** Measured browser waterfall profiling (RUM data or Lighthouse trace) shows a sequential dependency chain — school ID fetched first, its lat/lon fed to the marker query as a second fetch — causing a user-perceptible cascade delay of >300 ms at P75. This would indicate that the marker query is not actually parallel with the school-detail fetch due to a data dependency. In the current code, `useDiscoverFilteredMarkers` receives `schoolLat` and `schoolLon` as props from `useDiscoverMapData`, which means the coordinates must be known before the marker query can fire. If `useSchoolById` is the source of those coordinates (i.e., they are not in URL state), a real cascade exists. Verify via waterfall trace before building the BFF endpoint.

---

## 6. Elasticsearch / OpenSearch Readiness

### Current Postgres FTS limits

| Dimension | Postgres GIN + tsvector | OpenSearch |
|-----------|------------------------|------------|
| Ranking quality | `ts_rank` / `ts_rank_cd` — TF-IDF approximation, no BM25 | BM25 native, field boosting, learning-to-rank |
| Fuzzy / partial match | No native prefix/fuzzy (prefix via `to_tsquery('english', 'term:*')` workaround only) | Edge n-gram, n-gram analyzers |
| Autocomplete | No native support | `search_as_you_type` field type |
| Faceted counts | Requires separate `GROUP BY` queries (additional round-trips) | Aggregations native, O(1) per bucket |
| Geo + text combined | Multiple predicates; planner chooses index per predicate, not combined | Single query plan for geo + text |
| Write amplification | Generated column — GIN update on every INSERT/UPDATE touching title/locality/description | Async index lag via outbox; decoupled write path |
| Horizontal scale | Bounded by Postgres connection pool and single-node throughput | Shardable, horizontally scalable |

### When to move (definitive trigger thresholds)

| Trigger | Metric | Action |
|---------|--------|--------|
| **Primary** | P95 FTS query latency >200 ms on `GET /api/discover/listings?q=...` with GIN in use (measured via slow-query log or EXPLAIN ANALYZE on staging at production data volume) | Evaluate OpenSearch for text search path |
| **Secondary** | P95 `ST_DWithin` school-radius query latency >300 ms (measured at target listing count in staging) | Evaluate OpenSearch `geo_distance` or partitioned GiST partial index |
| **Scale** | Total LIVE listing count >500K AND write rate >500 inserts/min | GIN update contention likely; evaluate async indexing path |
| **Feature** | Autocomplete, fuzzy search, faceted sidebar counts, or BM25-ranked relevance required as product features | OpenSearch regardless of scale — Postgres cannot deliver these well |

Do not adopt OpenSearch before one of these triggers is confirmed with measurement.

### Fields to index in OpenSearch (when adopted)

```
listing_id          keyword   (join-back / dedup)
status              keyword   (filter: LIVE only)
area_key            keyword   (filter)
city_slug           keyword   (filter — resolved via areas join today; denormalise here)
title               text      (analyzed, english analyzer)
locality            text + keyword (text for FTS; keyword for facet)
description         text      (analyzed, english)
geo_point           geo_point (lat/lon — OpenSearch native type; replaces geog column)
price_paise         long      (range filter, sort)
bedrooms            integer   (terms filter, facet)
property_type       keyword   (terms filter, facet)
seller_type         keyword   (terms filter, facet)
listing_purpose     keyword   (terms filter)
trust_tier          keyword   (terms filter)
created_at          date      (range filter, sort)
first_published_at  date      (range filter)
back_to_market_at   date      (range filter for backOnMarket filter)
rera_number         keyword   (exists filter for reraRegistered)
search_vector       NOT indexed — Postgres-only generated column; omit from OpenSearch doc
```

### Sync strategy recommendation

| Strategy | Verdict |
|----------|---------|
| Periodic full reindex (cron) | Bootstrap only. Lag = cron interval; misses deletes; slow at 1M+ rows. |
| Dual-write (sync from `ListingService.save()`) | Not recommended. Partial failure (Postgres commits, OpenSearch call fails) breaks consistency. Violates "external calls not on sync path" principle. |
| **Transactional outbox** | **Recommended.** Insert `listing_index_events` row in the same transaction as the listing write. Separate `@Scheduled` poller reads events, calls OpenSearch bulk API, marks as processed. Consistent (outbox + listing write are atomic); retryable; decoupled. Lag typically 5–15 s — acceptable for real-estate inventory. |
| CDC / Debezium + Kafka | Overkill until Kafka is justified independently. Significant ops overhead. |

The transactional outbox fits the existing Spring Boot + Postgres stack. A `@Scheduled` poller is a known pattern in the codebase. No new infrastructure components are required beyond OpenSearch itself.

---

## 7. Proposed Target Architecture

### Recommended near-term shape (no BFF, no OpenSearch yet)

**Keep the granular hook structure.** The current four-concurrent-query design in `useDiscoverMapData` is structurally correct. Each hook has an independent TanStack Query cache with appropriate stale times. Do not consolidate.

**Resolve the `q` gap in `DiscoverMarkersController` (line 98).** The `null` literal passed as the `q` field to `DiscoverListingPredicateBuilder.Filters` means markers are always unfiltered even when a keyword search is active. Wire `q` from `@RequestParam(name = "q", required = false)` through the controller → `Filters` record → `DiscoverListingPredicateBuilder.build()` line 216. This is a one-line controller change + one field already supported in `Filters` and `DiscoverListingPredicateBuilder`. This must be closed before keyword search ships to users.

**Add HTTP `Cache-Control` headers on public endpoints.** `GET /api/discover/areas`, `GET /api/public/schools/*` (popular, by-area), and `GET /api/discover/cities/{city}/listings` (when no auth-gated dynamic params are present) can safely carry:
```
Cache-Control: public, max-age=60, stale-while-revalidate=300
```
This allows CDN/edge caching and eliminates repeat network round-trips across browser tabs and sessions. The current `staleTime` in TanStack Query only deduplicates within a single browser tab. This is a Spring `@GetMapping` + response header change; no frontend change required.

**Resolve the #1193 anon school-radius gap at the backend.** The correct fix is extending `GET /api/discover/cities/{city}/listings` to accept `schoolLat`, `schoolLon`, `schoolRadiusKm` and applying `ST_DWithin` in the LEFT JOIN ON clause (mirroring `DiscoverListingPredicateBuilder.java` lines 186–192). This is a PUBLIC endpoint change — no auth required. It eliminates the client-side haversine approximation and the single-area limitation for anonymous users. Filed as issue #1193.

**Add approximate COUNT.** Replace the exact `SELECT COUNT(*) FROM property_listings pl WHERE ...` round-trip in `DiscoverListingsService` (line 48) with an estimated count for the "N properties found" display. Use `pg_class.reltuples` filtered by a selectivity factor derived from present predicates, or accept a `X+ properties` display when the estimate is imprecise. Reserve exact COUNT for export endpoints only. This is the highest-priority backend change for scale.

**No BFF, no Redis yet.** A BFF aggregation layer is not justified (see Section 5). Redis/Memcached is not justified until read traffic on `GET /api/discover/areas` or `GET /api/discover/cities/*` exceeds ~50 req/s sustained, at which point Postgres connection saturation (not query duration) becomes the constraint.

**Where caching belongs:**
- Within a browser tab: TanStack Query stale times (already correct)
- Across tabs/sessions: HTTP `Cache-Control` on public endpoints (to add)
- App-level: none needed until connection pool saturation observed
- Search: Postgres GIN (current, adequate until trigger thresholds hit)

---

## 8. Ranked Backlog Proposal

| Rank | Title | Scope | Priority | Trigger / Dependency |
|------|-------|-------|----------|---------------------|
| 1 | **Wire `q` in `DiscoverMarkersController`** | One `@RequestParam` + one `Filters` field. Closes correctness gap at `DiscoverMarkersController.java` line 98. Markers and listings diverge on keyword search today. | **CRITICAL** | No dependency. Must ship before keyword search reaches users. |
| 2 | **Query-plan measurement harness** | SQL script (or Spring dev-profile interceptor) that runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for the five critical Discover queries against a production-volume dataset snapshot. Emits P50/P95 timings. See Section 9 for exact commands. | **HIGH** | No infra dependency. This is the evidence base for all subsequent decisions. Do first. |
| 3 | **#1193 anon school-radius backend fix** | Extend `GET /api/discover/cities/{city}/listings` to accept `schoolLat`, `schoolLon`, `schoolRadiusKm` and apply ST_DWithin in the LEFT JOIN ON clause. PUBLIC endpoint. Resolves product gap logged in #1193. | **HIGH** | No infra dependency. Unblocks anonymous school-first journey correctness. |
| 4 | **Slow-query log baseline** | Enable Postgres `log_min_duration_statement = 200` on staging. Run representative Discover traffic (school-radius, FTS, area listing queries). Capture the 10 worst plans. Document index hit rates. | **HIGH** | Needs staging with representative data volume. Run in parallel with rank 2. |
| 5 | **Approximate COUNT for `DiscoverListingsService`** | Replace `SELECT COUNT(*) FROM property_listings pl WHERE ...` with a `reltuples`-based estimate for the UI "N properties found" display. Exact count retained for API export use only. First backend scale mitigation; unblocks COUNT risk at 1M+. | **HIGH** | Depends on rank 2 (confirm COUNT is the bottleneck via EXPLAIN). |
| 6 | **HTTP `Cache-Control` on public Discover endpoints** | Add `Cache-Control: public, max-age=60, stale-while-revalidate=300` to `GET /api/discover/areas`, `GET /api/public/schools/popular`, `/by-area`, and `GET /api/discover/cities/{city}/listings` (when no dynamic auth-gated params). Enables CDN/edge caching. Non-breaking. | **MEDIUM** | No dependency. Low engineering cost, high read-volume benefit. |
| 7 | **Partial GiST index for LIVE listings** | Add migration V81 (or next available): `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_listings_geog_live ON property_listings USING GIST (geog) WHERE status = 'LIVE' AND archived_at IS NULL;` Reduces ST_DWithin candidate set to LIVE rows only. Helps ST_DWithin at 1M+ LIVE listings in dense areas. | **MEDIUM** | Depends on rank 2 (confirm GiST scan falls back to full index via EXPLAIN). |
| 8 | **Operational monitoring: Discover query latency** | Instrument `CityAreaListingsService`, `DiscoverListingsService`, `DiscoverMarkersService` with Micrometer `Timer` recording query duration by endpoint and filter combination. Expose via `/actuator/metrics`. Prerequisite for detecting when OpenSearch trigger thresholds (Section 6) are approached. | **MEDIUM** | Spring Boot Actuator dependency assumed present (UNVERIFIED — check `pom.xml`). Low engineering cost. |
| 9 | **Index hardening: `search_vector` FTS coverage audit** | Audit whether `search_vector` (V18: `title + locality + description`) should cover `listing_purpose`, `property_type`. Run representative keyword queries against staging; identify whether users search for those terms. Add V81+ migration only if coverage gap is demonstrated. Do not add speculatively. | **MEDIUM** | Depends on rank 2 + 4 (query analysis). |
| 10 | **Load-test tooling: Discover journey** | k6 or Gatling script simulating the school-first journey (school select → radius change → area change) at 10×, 50×, 100× concurrent users. Target: identify Postgres connection pool saturation point and per-endpoint P95 under load. | **MEDIUM** | Needs staging with representative data. Run after rank 4 (slow-query log baseline). |
| 11 | **Keyset / cursor pagination for `DiscoverListingsService`** | Replace `OFFSET ?` with keyset pagination on `(created_at, id)`. Eliminates deep-page scan cost. Required at 10M+ listings with active pagination. | **LOW** (now) / **HIGH** at 10M | Trigger: OFFSET deep-page latency observed at scale (rank 2 measurement). |
| 12 | **OpenSearch spike / POC** | Single-node OpenSearch in staging. Index 100K listing sample using transactional outbox. Benchmark FTS and `geo_distance` against Postgres equivalents. Output: latency comparison + storage cost estimate. Do not ship to production. | **LOW** | Trigger: P95 FTS latency >200 ms (Section 6), OR faceted-search/autocomplete product requirement raised. Do NOT do speculatively. |
| 13 | **School-context BFF endpoint** (`GET /api/discover/schools/{id}/context`) | Aggregated school + area listings + markers payload. | **LOW** | Trigger: measured waterfall showing >300 ms cascade delay from sequential school-ID → lat/lon → marker fetch (evidenced by RUM data). Currently parallel; no cascade confirmed. |

---

## 9. How to Capture Runtime Evidence (EXPLAIN)

The database was unavailable during this audit. The following `EXPLAIN (ANALYZE, BUFFERS)` commands must be run against a staging or production database with a representative dataset (minimum 50K LIVE listings; ideally a production snapshot) to confirm or refute the scale assessments above.

### 9a. Area-scoped listing query (PUBLIC path)

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
    sub.area_key,
    sub.area_name,
    sub.listing_id,
    sub.price_paise,
    sub.property_type,
    sub.locality,
    sub.created_at,
    sub.trust_tier
FROM (
    SELECT
        a.area_key,
        a.name AS area_name,
        pl.id AS listing_id,
        pl.price_paise,
        pl.property_type,
        pl.locality,
        pl.created_at,
        pl.trust_tier,
        ROW_NUMBER() OVER (PARTITION BY a.area_key ORDER BY pl.created_at DESC) AS rn
    FROM areas a
    JOIN cities c ON c.id = a.city_id
    LEFT JOIN property_listings pl
        ON pl.area_key = a.area_key
        AND pl.status = 'LIVE'
        -- add FTS clause here if q is active:
        -- AND pl.search_vector @@ websearch_to_tsquery('english', 'villa')
    WHERE c.slug = 'udupi'
      AND a.area_key IN ('kunjibettu', 'manipal', 'udupi-city')
) sub
WHERE sub.rn <= 20 OR sub.listing_id IS NULL
ORDER BY sub.area_key, sub.rn;
-- Expected: idx_listing_area_key_status_created (V74) Index Scan; ROW_NUMBER window
-- Watch for: sequential scan on property_listings if IN list is large
```

### 9b. School-radius ST_DWithin (AUTH markers path)

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*)
FROM property_listings pl
WHERE pl.status = 'LIVE'
  AND pl.archived_at IS NULL
  AND pl.is_duplicate = false
  AND pl.area_key IN (
      SELECT a.area_key FROM areas a
      JOIN cities c ON c.id = a.city_id
      WHERE c.slug = 'udupi'
  )
  AND ST_DWithin(
      pl.geog,
      ST_MakePoint(74.7421, 13.3409)::geography,  -- Manipal school approx lon/lat
      3000.0  -- 3 km radius in metres
  );
-- Expected: idx_property_listings_geog (V73 GiST) Index Scan; Bitmap Heap Scan on property_listings
-- Watch for: Seq Scan fallback (means GiST planner cost estimate is off for this data distribution)
-- If GiST not used: run ANALYZE property_listings; then retry
```

### 9c. FTS websearch_to_tsquery (AUTH listings path)

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*)
FROM property_listings pl
WHERE pl.status = 'LIVE'
  AND pl.archived_at IS NULL
  AND pl.is_duplicate = false
  AND pl.area_key IN (
      SELECT a.area_key FROM areas a
      JOIN cities c ON c.id = a.city_id
      WHERE c.slug = 'udupi'
  )
  AND pl.search_vector @@ websearch_to_tsquery('english', 'villa near beach');
-- Expected: idx_property_listings_search_vector (V18 GIN) Bitmap Index Scan
-- Watch for: planner choosing seq scan over GIN (unlikely, but possible if city subquery selectivity is low
--            and the planner sees the combined selectivity as high)
-- Check: "Bitmap Heap Scan" + "Recheck Cond" lines confirm GIN was used
```

### 9d. COUNT(*) pagination — broad filter (scale risk)

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*)
FROM property_listings pl
WHERE pl.status = 'LIVE'
  AND pl.archived_at IS NULL
  AND pl.is_duplicate = false
  AND pl.area_key IN (
      SELECT a.area_key FROM areas a
      JOIN cities c ON c.id = a.city_id
      WHERE c.slug = 'udupi'
  );
-- This is the worst case: no additional filter predicates (no area, no FTS, no radius).
-- Expected at current scale: fast (small dataset). At 1M: 200–500 ms likely.
-- Watch for: "Seq Scan on property_listings" with high "rows=..." — this is the COUNT risk.
-- If slow: evaluate pg_class.reltuples estimate as mitigation (rank 5 in backlog).
```

### 9e. Marker aggregation — all markers for a city (AUTH, no filter)

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT pl.id, pl.latitude, pl.longitude, pl.price_paise
FROM property_listings pl
WHERE pl.status = 'LIVE'
  AND pl.archived_at IS NULL
  AND pl.is_duplicate = false
  AND pl.area_key IN (
      SELECT a.area_key FROM areas a
      JOIN cities c ON c.id = a.city_id
      WHERE c.slug = 'udupi'
  )
ORDER BY pl.created_at DESC
LIMIT 5000;
-- Expected: idx_listing_area_key_status_created (V74) or idx_listings_trust_ranking (V62)
-- Watch for: ORDER BY + LIMIT forcing a sort of the full filtered set before applying LIMIT
--            (i.e., "Sort" node above "Seq Scan") — this invalidates the index benefit.
-- If sort is materialised: add (area_key, status, created_at DESC) covering index with id, latitude, longitude.
```

---

## Appendix: Source File Reference

Migration files and frontend hooks verified against source at commit on 2026-05-27; Java service/controller line numbers (CityAreaListingsService MAX_LIMIT, DiscoverMarkersController q=null ~line 98, DiscoverListingsService COUNT lines, DiscoverListingPredicateBuilder ST_DWithin lines) are cited from investigation but were not independently verified by the review toolchain (Java not indexed) — treat those line numbers as approximate.

| File | Key verified facts |
|------|--------------------|
| `backend/.../discover/CityAreaListingsService.java` | `MAX_LIMIT = 20` (line 39), `DEFAULT_LIMIT = 5` (line 38); FTS clause in LEFT JOIN ON (line 116); single SQL round-trip with ROW_NUMBER window |
| `backend/.../discover/DiscoverMarkersController.java` | `null` literal for `q` field at line 98; accepts `schoolLat`, `schoolLon`, `schoolRadiusKm` params |
| `backend/.../discover/DiscoverListingsService.java` | Two SQL round-trips: COUNT at line 48–49, paginated SELECT at lines 56–93; ORDER BY `created_at DESC LIMIT ? OFFSET ?` |
| `backend/.../discover/DiscoverListingPredicateBuilder.java` | ST_DWithin lines 186–192; bbox lines 200–207; polygon two-stage lines 158–177; FTS lines 214–218; default radius 2.0 km (line 187) |
| `backend/src/main/resources/db/migration/V18__add_listing_fts_vector.sql` | `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', title + locality + description)) STORED`; GIN index `idx_property_listings_search_vector` |
| `backend/src/main/resources/db/migration/V73__postgis_geog.sql` | `geog geography(Point,4326) GENERATED ALWAYS AS (ST_MakePoint(lon,lat)::geography) STORED`; GiST index `idx_property_listings_geog WHERE geog IS NOT NULL` |
| `backend/src/main/resources/db/migration/V74__idx_listing_area_key_status_created.sql` | `(area_key, status, created_at DESC)` composite index |
| `backend/src/main/resources/db/migration/V62__add_trust_ranking_sort_index.sql` | `(trust_tier ASC, ranking_score DESC, created_at DESC)` index |
| `src/hooks/useDiscoverCityListings.ts` | `staleTime: 60_000` |
| `src/hooks/useDiscoverListings.ts` | `staleTime: 60_000` |
| `src/hooks/useDiscoverFilteredMarkers.ts` | `staleTime: 60_000` |
| `src/hooks/useDiscoverAreas.ts` | `staleTime: 300_000` |
| `src/hooks/useDiscoverMarkers.ts` | `staleTime: 300_000` |
| `backend/src/main/resources/db/migration/V79__add_school_area_key.sql` | `area_key TEXT NULL REFERENCES areas(area_key)` column added to `schools`; `idx_schools_area_key ON schools(area_key)` (line 11); spatial backfill via ST_DWithin + district normalisation |
| Flyway ceiling | V80 (`V80__school_area_key_trigger.sql`); V65 absent (V64 → V66 gap); next migration = V81 |
