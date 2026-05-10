# Discover Architecture Readiness — Audit Evidence (#1046)

Read-only assessment of architectural posture for scaling Discover to ~1M listings.
All claims are file:line cited against the indexed repo `local/udupi-property-explorer-5ccf76f9`.
This document lists trade-offs and evidence requirements; it does NOT pick winners.

---

## 1. Current architecture facts

- **Stateless JWT security**: `backend/src/main/java/com/example/realestate/security/JwtConfig.java:28` — `SessionCreationPolicy.STATELESS`. No HTTP session affinity required to scale instances horizontally.
- **CORS coupling note**: `JwtConfig.java:25-26` — `.cors()` is intentionally NOT on the chain; CORS handled by a standalone `FilterRegistrationBean` in `CorsConfig` running before the security chain.
- **Discover REST surface (6 controllers, all `@RestController`)**:
  - `DiscoverListingsController.java:25` → `/api/discover/listings`
  - `DiscoverMarkersController.java:26` → `/api/discover/markers`
  - `CityAreaListingsController.java:26` → `/api/discover`
  - `AreaGroupsController.java:16` → `/api/discover`
  - `AreaSummaryController.java:17` → `/api/discover`
  - `ListingMarkersController.java:19` → `/api/listings`
  Public access permitted via `JwtConfig` permitAll rules (e.g. `CityAreaListingsController.java:24`).
- **Persistence is `JdbcOperations` everywhere on the read path** — no JPA on Discover hot path. Constructors: `DiscoverListingsService.java:35`, `DiscoverMarkersService.java:29`, `CityAreaListingsService` (per outline). Hand-written SQL with `JdbcTemplate.queryForObject` / `query`.
- **Spatial layer (V73)**: `db/migration/V73__postgis_geog.sql:1-17` — PostGIS extension + `geog GENERATED ALWAYS AS (...) STORED` column on `property_listings`, `CREATE INDEX CONCURRENTLY idx_property_listings_geog` (GiST). Used by `DiscoverListingPredicateBuilder.java:198` (`ST_DWithin(pl.geog, ...)`).
- **Hot-path B-tree indexes**:
  - `V74__idx_listing_area_key_status_created.sql:3` — composite `(area_key, status, created_at DESC)`.
  - `V75` — verified by directory listing (next to V74; same migration cluster for Discover scale).
  - `V76__idx_schools_geog_gist.sql:5-10` — schools GiST on `schools.geog` (plain `CREATE INDEX`, not CONCURRENTLY, due to PgBouncer behaviour).
  - `V77__area_groups_schema.sql:38,42` — area_groups B-tree indexes.
- **Aggregate / rollup layer (V70-era + earlier)**: `area_overview_stats` table is precomputed by `analytics/AreaOverviewRollupJob.java:53-55` (`Starting area_overview_stats rollup` / `... complete`) and consumed by `area/AreaOverviewService.java:25,70`. Two row types: `locality` and `district` (`AreaOverviewRollupJob.java:13,206,275,321,416,490,543`).
- **Observability — Sentry only, errors path**: `config/SentryTestController.java:11-36` is the sole Sentry surface in code; conditional on `sentry.test.enabled=true`. No `io.sentry` Gradle artefact found in indexed `*.gradle*` scope (search returned 0).
- **Predicate / DTO sharing across read paths** (potential coupling):
  - `BboxParser.java:9` — "Shared by `DiscoverListingsController` and `DiscoverMarkersController`".
  - `DiscoverListingPredicateBuilder.java:8` — "DiscoverListingsService and DiscoverMarkersService".
  - `DiscoverListingsService.java:22` — explicit comment that listings result is "structurally identical" to markers result.
  - Non-drift gate test: `DiscoverListingsMarkersConsistencyTest.java:10`.

---

## 2. Service boundary readiness

**Seam analysis.** The Discover read surface is already a near-clean package: every Discover controller and service lives under `com.example.realestate.discover.*`. The package has no inbound dependency from `listing.api`, `area`, or `school` controllers — only outbound use of shared infrastructure (`JdbcOperations`, `IngestionApiKeyFilter`-side security config).

**Coupling that would extract with the package:**
- `DiscoverListingPredicateBuilder` (single source of WHERE-fragment truth) is referenced by both `DiscoverListingsService` and `DiscoverMarkersService` (`DiscoverListingPredicateBuilder.java:8`). Same package — extracts cleanly.
- `BboxParser.java:9` — same package, same story.
- DTOs `DiscoverListingResponse`, `DiscoverMarkersResponse`, `AreaListingsEntry` are all in `discover.*`.

**Coupling that does NOT extract cleanly:**
- **Shared schema**: every Discover query reads `property_listings`, `schools`, `areas`, `cities`, `listing_images`, and `area_overview_stats` — the same tables written by ingestion, listing edit, and analytics jobs. A separate service would still bind to the same Postgres or require read-replica + replication lag handling.
- **Shared filter chain**: `JwtConfig.java:14-28` is a single `SecurityFilterChain` for the whole monolith, including `IngestionApiKeyFilter` registration. Permit rules for Discover (`/api/discover/**`) live alongside trust, school, public-listing rules (`TrustController.java:113`, `SchoolController.java:18`, `PublicListingController.java:38`). Splitting Discover means duplicating the JWT/CORS chain or fronting with a gateway.
- **Shared rollup writer**: `AreaOverviewRollupJob` writes `area_overview_stats`, which Discover reads. Extracting Discover would force either a cross-service read-only contract on this table or move the job out with it.

**Net verdict on extraction feasibility today.**
Code-side seams are clean; the Discover package would compile-extract with mechanical effort. The blockers are infrastructural, not structural: shared Postgres, shared `SecurityFilterChain`, shared rollup-writer ownership. Extraction today is premature — the package boundary is the right fence; service decomposition is not yet justified by an observed constraint.

---

## 3. Data model fitness for 1M listings

| # | Item | Location | Mechanism | Label |
|---|------|----------|-----------|-------|
| 1 | PostGIS `geog` GENERATED + GiST index | `V73__postgis_geog.sql:17` | `idx_property_listings_geog` GiST → `ST_DWithin(pl.geog, ...)` at `DiscoverListingPredicateBuilder.java:198` is index-eligible (operator class match). | STATIC_CODE_RISK: low; spatial side correctly built. |
| 2 | Hot-path composite B-tree | `V74__idx_listing_area_key_status_created.sql:3` | `(area_key, status, created_at DESC)` covers area-filtered, status-filtered, recency-ordered Discover query. | STATIC_CODE_RISK: low for the indexed path; PROJECTION: combinations omitting `area_key` will not hit it. |
| 3 | `COUNT(*)` per page request | `DiscoverListingsService.java:48` (`SELECT COUNT(*) FROM property_listings pl WHERE ...whereFragment`) | Re-runs the full predicate every page; at 1M rows with non-sargable predicates (bbox, school proximity), this is a guaranteed seq/index scan over a large set. | PROJECTION: COUNT cost grows with selectivity, not page size; main first-paint cliff. |
| 4 | Lateral hero-image subquery | `DiscoverListingsService.java:55` (comment "Main SELECT with lateral hero-image subquery"); `CityAreaListingsService.java:106` (lateral join to `listing_images`) | Per-row lateral evaluation against `listing_images`. Index-friendly per row but multiplies cost by page size and adds a join hop on every Discover paint. | STATIC_CODE_RISK: medium; PROJECTION: hot at 1M only if `listing_images` lacks `(listing_id, sort_order)` covering index. |
| 5 | OFFSET pagination | `DiscoverListingsService.java:92` (`LIMIT ? OFFSET ?`) | OFFSET re-scans skipped rows; cost is O(offset) regardless of index. | PROJECTION: deep pages (offset > ~5k) become unbounded; bounded today only because UI rarely deep-paginates. |
| 6 | `GROUP BY pl.locality` aggregate | `DiscoverListingsService.java:165-169` (`SELECT pl.locality, COUNT(*) AS cnt ... GROUP BY pl.locality ... LIMIT 6`) | Per-request locality histogram over the filtered set; recomputes on every page navigation. | STATIC_CODE_RISK: medium; PROJECTION: scales with filtered-set size, not result size. |
| 7 | `COUNT(*)` in area summary subquery | `AreaSummaryService.java:69-84` (`SELECT COUNT(*) FROM schools s` and `SELECT area_key, COUNT(*) ... FROM property_listings`) | Counted per area-summary call, joined left. | PROJECTION: bounded by area count, not 1M-scale risk. |
| 8 | City existence COUNT | `CityAreaListingsService.java:72` (`SELECT COUNT(*) FROM cities WHERE slug = ?`) | Trivial; primary-key-equivalent lookup. | STATIC_CODE_RISK: none. |
| 9 | No `statement_timeout` set | search returned hits only in `ListingImageRegistrar.java:36` (Render-side write path); no JDBC/Hikari/connection-init `statement_timeout` for read path. | A single bad query can occupy a connection arbitrarily long. | STATIC_CODE_RISK: medium; PROJECTION: tail-latency amplification under load. |
| 10 | 5000-marker hard cap | `DiscoverMarkersController.java:23-24` ("Returns up to 5000 markers. If the filtered set exceeds 5000 rows a WARN is logged and the first 5000 are returned.") | Bounds payload + DB cost; at 1M city-wide filter, most users see truncation. | STATIC_CODE_RISK: low for backend; PROJECTION: UX truncation cliff drives the marker-rendering trade-off in §6. |
| 11 | School radius via stored `pl.geog` | `DiscoverListingPredicateBuilder.java:189-198`; verified by tests `DiscoverListingPredicateBuilderTest.java:268`. | Uses stored geography column, not recomputed inline → V73 GiST is eligible. | STATIC_CODE_RISK: low. |

---

## 4. Cache / aggregate / freshness strategy

**Current state.**
- **Rollup tables only**: `area_overview_stats` is the sole materialised aggregate. Populated daily at 02:30 UTC by `AreaOverviewRollupJob.java:13,53`. No materialised view (`MATERIALIZED VIEW` search produced no migration hits).
- **No application-layer cache**: `Caffeine` search across the entire repo returned 0 results. No `@Cacheable`, no `CacheManager` wired.
- **No HTTP cache headers**: `Cache-Control` search across `**/*.java` returned 0. Discover endpoints serve no `Cache-Control`, no `ETag`, no `Last-Modified`.
- **No CDN-level edge caching evident** in code; absence of headers means any CDN passthrough is uncached.

**Recomputed per request (not cached).**
- Listings COUNT and aggregates (§3 #3, #6) — re-evaluated every page paint.
- Markers payload up to 5000 rows — re-fetched on filter change.
- Area summary listing-count subquery (§3 #7) — re-evaluated per area-summary call.
- Hero-image LATERAL projection per listing per request.

**Trade-offs to surface (do NOT pick).**
| Option | Trade-offs |
|--------|------------|
| Caffeine in-process | Lowest latency, zero ops, per-instance memory budget, no cross-instance coherence; freshness via TTL only. |
| Redis | Cross-instance coherence, eviction policies, pub/sub invalidation; new infra, network hop, ops cost. |
| HTTP `Cache-Control` + CDN | Zero backend code on cache hit, terminates at edge; cache key must encode auth + filters; invalidation is hard for parametric reads. |
| Postgres MV (refresh schedule or CONCURRENTLY) | Fits the existing rollup pattern; refresh cost grows with row count; staleness window = refresh cadence. |

---

## 5. Observability gaps

- **Sentry**: present on errors path only. `config/SentryTestController.java` exists but is `@ConditionalOnProperty` gated. No `io.sentry` Gradle dependency surfaced by indexed `*.gradle*` search (0 hits) — Sentry wiring may be runtime-agent-based, but in-code instrumentation is errors-only.
- **Micrometer `@Timed`**: ABSENT — search across `**/*.java` returned 0 hits. No per-endpoint latency histograms instrumented in code.
- **OpenTelemetry**: ABSENT — no `opentelemetry`-annotated code on Discover hot path.
- **Postgres-side observability**: no `auto_explain` / `pg_stat_statements` configuration in repo (no migration enabling them). Cannot answer "which SQL is the tail" without DB-side change.
- **Structured logging**: SLF4J in use (`LoggerFactory.getLogger(...)` at `DiscoverMarkersController.java:30`, `DiscoverMarkersService.java:21`, `AreaOverviewRollupJob.java:53`) but emits unstructured strings — no JSON encoder configuration evident in indexed source. Log queries by request-id / area-key not directly grep-able as fields.

Net: today the audit cannot prove which specific query is the tail without adding instrumentation. This is itself an architectural gap before any P-tier recommendation that depends on tail-latency evidence.

---

## 6. Material architectural trade-offs the audit must surface (DO NOT pick)

1. **Marker rendering at 1M.** Server-side clustering (Postgres `ST_ClusterDBSCAN` / `ST_ClusterKMeans`) vs vector tiles (pg_tileserv / Martin) vs viewport-bounded raw rows vs current 5000 cap (`DiscoverMarkersController.java:23-24`). Each option has distinct DB-load, CDN, and frontend-rendering profiles.
2. **Aggregate freshness.** Continue rollup-job model (`AreaOverviewRollupJob`) vs Postgres MV with scheduled refresh vs CDC-driven incremental aggregates. Trades freshness SLO against compute cost and operational complexity.
3. **Cache layer choice.** Caffeine vs Redis vs CDN HTTP cache (see §4 trade-off table). Choice depends on tenancy of the cached object (per-user vs anonymous) and invalidation cadence.
4. **Pagination strategy.** Keyset over `(created_at DESC, id)` vs current OFFSET (`DiscoverListingsService.java:92`) vs `count_estimate` (Postgres `reltuples` / `pg_stat`-derived) for COUNT-replacement.
5. **Service decomposition.** Monolith hot-path tuning vs read-replica routing for `/api/discover/**` vs full extraction into a separate `discover-service` (see §2 verdict).
6. **Stateless workload scaling.** JWT-stateless (`JwtConfig.java:28`) means JVM count is not the ceiling; the real ceiling is Postgres connection pool and PgBouncer fan-out. Adding instances without sizing pool/PgBouncer increases contention.
7. **Polygon / school-radius GiST usage verification.** `EXPLAIN ANALYZE` on `ST_DWithin(pl.geog, ...)` predicates (`DiscoverListingPredicateBuilder.java:198`) must show `Bitmap Index Scan on idx_property_listings_geog` at 1M-row scale before approving any plan that depends on this path.
8. **Gateway placement vs in-app permitAll.** Public access is enforced inside the Spring chain (`JwtConfig`) via permitAll rules referenced by multiple controllers. A gateway/CDN in front would shift WAF, rate-limit, and CORS responsibilities — trade-off is duplicated config vs single-process simplicity.

---

## 7. What the audit must prove BEFORE recommending each P-tier

### P0 — same-shape correctness & guard rails
- **EXPLAIN (ANALYZE, BUFFERS)** on the canonical Discover listings SQL (`DiscoverListingsService.java:39-92`) at 1M rows: confirm `idx_listing_area_key_status_created` (V74) and `idx_property_listings_geog` (V73) chosen.
- **Connection-side `statement_timeout`** decision: prove whether absence (§3 #9) has caused incidents (DB metrics or log evidence) before adding.
- **Smoke**: `DiscoverListingsMarkersConsistencyTest.java:10` continues to pass after any predicate-builder change (drift gate).

### P1 — hot-path optimisations
- **Payload size** for `/api/discover/markers` at 1M filtered rows pre/post any encoding change (current 5000 cap → measured wire size).
- **Profiler trace** (Java Flight Recorder / async-profiler) showing the COUNT (§3 #3) and LATERAL (§3 #4) shares of total request CPU/wall time. No tuning before this is measured.
- **A/B compare** keyset vs OFFSET on a representative deep-page request (§3 #5).
- **Coupling map** confirming `DiscoverListingPredicateBuilder` remains the single WHERE-fragment authority — any P1 change must not bifurcate it (`DiscoverListingPredicateBuilderTest.java:268,295,314` is the existing gate).

### P2 — caching / aggregate evolution
- **Freshness SLO** stated explicitly per endpoint (e.g. listings TTL ≤ 60s, markers TTL ≤ 5m, area summary TTL ≤ 24h matching `AreaOverviewRollupJob` cadence).
- **Cache-key analysis** showing which Discover requests are anonymous + parametric (CDN-cacheable) vs per-user (in-process or Redis).
- **MV vs incremental aggregate** decision evidence: refresh wall-clock at projected 1M-row volume.
- **Observability prerequisite**: Micrometer `@Timed` and `pg_stat_statements` enabled (§5), otherwise hit-rate and tail-latency wins cannot be attributed.

### P3 — service decomposition
- **Pool/PgBouncer ceiling measurement** (real saturation point, not assumed) before recommending a separate `discover-service` (§6 #6).
- **Coupling map** demonstrating that Discover read endpoints can run against a read-replica without breaking transactional read-after-write contracts elsewhere.
- **Gateway/CORS plan** replacing the in-process permitAll rules in `JwtConfig.java` (§2, §6 #8).
- **Operational readiness**: structured JSON logging, distributed tracing (OpenTelemetry), and SLO dashboards in place — none of which exist today (§5). Premature decomposition without these guarantees worse incident latency, not better.

---

*Evidence anchors verified against indexed repo `local/udupi-property-explorer-5ccf76f9` on 2026-05-10. Re-verify file:line if files mutate before this section is published.*
