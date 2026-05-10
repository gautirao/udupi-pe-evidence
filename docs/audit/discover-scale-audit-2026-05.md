# Discover Scale & Performance Audit — Phase 1 (Static / Projection)

> **Issue:** [#1046](https://github.com/.../issues/1046) — Verify Discover can scale from 10 to 1M listings without UX degradation.
> **Milestone:** [#18 discover-scale-and-performance-foundation](https://github.com/.../milestone/18)
> **Status:** **PHASE 1 — STATIC / PROJECTION AUDIT ONLY.** This is **not** the full measured baseline anticipated by the original plan's AC3 (runtime EXPLAIN) and AC5 (HAR/Playwright). Runtime evidence collection is intentionally deferred to a Phase 2 follow-up issue (P0-2) because DB credentials and Playwright/auth fixtures were not available to the audit phase. Recommendations below P0-2 are **PROVISIONAL** and may be reprioritised, deferred, or rejected after Phase 2 measurements land.
> **Approved plan:** PLAN_REVIEW rev 2 APPROVED by ChatGPT (handoff TOMLs gitignored under `.claude/handoffs/issue-1046/`).
> **Evidence labels (per approved `[projection_method]`):** every finding tagged `MEASURED`, `PLANNER_ESTIMATE`, `STATIC_CODE_RISK`, or `PROJECTION (mechanism)`. **NO finding in this Phase 1 report is labelled MEASURED.**

## Evidence corpus

- `docs/audit/evidence/frontend-findings.md` — 15 frontend findings + journey hook table + Top-5 culprits.
- `docs/audit/evidence/architecture-readiness.md` — backend service-boundary, data-model, cache, observability evidence (file:line citations).
- `docs/audit/evidence/explain-projection.md` — endpoint-by-endpoint SQL + index-usage projection per the approved fallback rules.

## Caveats

1. **No runtime EXPLAIN ANALYZE.** Backend `application.yml` connects to remote Supabase. Audit phase had no DB credentials. All DB findings are STATIC_CODE_RISK or PROJECTION with named mechanism.
2. **No HAR / Playwright traces captured.** Capturing per-journey waterfall requires booting both servers + auth credentials + Playwright runs. Static FE evidence is exhaustive (15 findings, journey-by-journey hook table) but per-journey network artefact collection is deferred to a P0 follow-up.
3. **No synthetic 10k/100k probe** — staging DB / seed access not available. Per `[projection_method]` fallback, projections are mechanism-cited.
4. **Architect's earlier estimate of 5000-marker cap is corrected to 1000** — `DiscoverMarkersService.CAP=1000` (`DiscoverMarkersService.java:24`).

---

## 1. Executive summary + observed symptoms

Discover is **architecturally close to scalable** for the 10–10k range thanks to:
- stateless JWT (`backend/src/main/java/com/example/realestate/security/JwtConfig.java:23,28`),
- a stored `geography(Point,4326)` generated column on `property_listings` with GiST index (V73), schools.geog GIST (V75/V76),
- a shared `DiscoverListingPredicateBuilder` ensuring listings + markers + aggregates filter on identical predicates,
- precomputed area rollups (`V2`, `V4`, `V70 area_overview_stats`),
- public Discover GETs are anonymous (CDN-cacheable in principle).

However, **observed slowness at <100 listings is consistent with frontend hot-path issues, not database throughput.** Top-3 culprits (STATIC_CODE_RISK):
1. `MapDiscovery.tsx:447-458` — inline IIFE rebuilds the marker `listings` array on every render → `MarkerClusterLayer` tears down + re-adds the entire cluster layer per parent render.
2. Three overlapping endpoints (`/listings`, `/markers`, `/cities/{city}/listings`) fire concurrently in area-selected state with unstable filter-object query keys.
3. Panels gate on `isLoading`, not `isFetching` — refetches render stale data without a spinner, perceived as "didn't update".

**At 1M listings the architecture has three structural blockers (PROJECTION):**
1. `/api/discover/markers` has CAP=1000 with `ORDER BY pl.id` and no required viewport-bounds → returns "first 1000 by id" rather than viewport-relevant markers.
2. `SELECT COUNT(*)` runs on every paginated listings request alongside the page query → full filtered scan at 1M (mechanism: aggregate scan).
3. `GROUP BY locality` aggregates recomputed per `includeAggregates=true` request → full filtered scan at 1M (mechanism: aggregate scan).

**No production-blocking architectural debt.** Carve-out / service extraction / Redis layer / vector tiles are NOT required pre-MVP. Lightweight fixes (marker memoisation, query coalescing, viewport-required, COUNT cache, HTTP cache headers) carry most of the value.

---

## 2. Discover journey request paths

| Journey state | Hooks fired (enabled=true) | Backend endpoints hit | Coalescing |
|---|---|---|---|
| City landing (guided-entry) | useDiscoverAreas, useAreaGroups, useTrendsOptions, useDiscoverListings (auth & !q), useDiscoverFilteredMarkers (auth & zoom>12) | `/api/discover/areas`, `/api/discover/area-groups`, `/api/discover/listings`, `/api/discover/markers` | bbox snapped + 300ms debounce; filters re-keyed immediately |
| Area-groups-landing | + focusedGroupAreas memo (no new query) | same | same |
| Area-marker-selected | + useDiscoverCityListings | + `/api/discover/cities/{city}/listings` | placeholderData on cityListings only |
| Area + filters | same set; all three queries re-fire on filter change | same | NO `keepPreviousData` on listings/markers |
| School-first landing (school-browse) | base set | base set | same |
| Schools-in-area | + useSchoolsByArea (infinite query) | + `/api/public/schools/by-area` | size=20 page |
| School-selected nearby-homes | + useSchoolById; listings + markers re-keyed with schoolLat/schoolLon/radiusKm | + `/api/public/schools/{id}` + listings + markers (school-radius branch of predicate) | none |
| Browser Back/Forward | useDiscoverUrlState re-reads URL params; dependent queries re-fire on city/area key change | same | partial (snap + debounce) |

**Network evidence label:** STATIC_CODE_RISK (no HAR captured); see frontend-findings.md Q1 for citation.

**Risk concentration:** in `area-selected + filters`, 3 backend round-trips fan out concurrently to overlapping data; cold-start latency on Render compounds. PROJECTION at 1M (mechanism: request waterfall + duplicate hook firing).

---

## 3. Database + geospatial query audit

Full per-endpoint analysis: `docs/audit/evidence/explain-projection.md`. Highlights:

| Endpoint | File:Line | Index utilisation | Risk@1M | Label |
|---|---|---|---|---|
| `/api/discover/listings` | DiscoverListingsService.java:39-161 | GiST on geog (good); area_key+status+created_at composite (V74); price_paise has NO usable index (idx is on dropped/legacy `price`) | High | STATIC_CODE_RISK + PROJECTION |
| `/api/discover/listings?includeAggregates=true` | DiscoverListingsService.java:163-184 | locality B-tree; full filtered scan for GROUP BY locality | High | PROJECTION (aggregate scan) |
| `/api/discover/markers` | DiscoverMarkersService.java:33-63 | GiST on geog when bbox/polygon present; full table scan otherwise; CAP=1000 | Critical without viewport-required | PROJECTION (unbounded marker payload) |
| `/api/discover/cities/{city}/listings` | CityAreaListingsController.java:58 | per-area lookup; bounded by limitPerArea=5 | Low | likely fine; needs SQL audit |
| `/api/discover/areas` | AreaSummaryController.java:36 | reads `area_overview_stats` rollup | Low | freshness SLO unknown |
| `/api/discover/area-groups` | AreaGroupsController.java:35 | seeded slow-changing data | Low | cacheable; no Cache-Control today |
| `/api/public/schools/popular` | SchoolController.java:117 | not deep-audited | UNKNOWN | needs audit |
| `/api/public/schools/by-area` | SchoolController.java:164 | GIST on schools.geog (V75/V76) | Medium | should be index-friendly |
| `/api/public/schools/nearby` | SchoolController.java:70 | GIST on schools.geog | Medium | should be index-friendly |

Confirmed predicate-builder spatial usage (`DiscoverListingPredicateBuilder.java:148-205`) is **GiST-friendly**:
- Polygon: two-stage `ST_Intersects(envelope::geography, pl.geog)` + `ST_Contains(geom, pl.geog::geometry)`.
- School radius: `ST_DWithin(pl.geog, ST_MakePoint(lon,lat)::geography, metres)`.
- Bbox: `pl.geog && ST_MakeEnvelope(...)::geography`.

No runtime `::geography` casts on rows that would defeat the index. Predicate construction is solid.

**Index gaps surfaced (do not implement here):**
- L1: composite `listing_images(listing_id, position, id)` for hero subquery — currently only `UNIQUE (listing_id, storage_path)` (V12).
- L2: index on `price_paise` (current `idx_property_listings_price` is on legacy `price` column).
- L3: `pg_stat_statements` + `auto_explain` extensions ABSENT — no ongoing query telemetry.

---

## 4. API scalability + boundedness audit

| Concern | Status | File:Line | Label |
|---|---|---|---|
| Pagination caps on `/api/discover/listings` | size param exists; no enforced max documented | DiscoverListingsController.java:45 | STATIC_CODE_RISK — verify max-size guard |
| Marker hard cap | CAP=1000 with overflow detection | DiscoverMarkersService.java:24 | STATIC_CODE_RISK (cap exists; `truncated` flag unused by FE) |
| Viewport-bounded markers required? | Optional; predicate accepts bbox but does not require it | DiscoverListingPredicateBuilder.java:194-205 | STATIC_CODE_RISK |
| Marker truncation metadata | `truncated` boolean returned | DiscoverMarkersService.java:60 | OK on backend; FE consumer absent (frontend Finding #14) |
| Aggregate/count endpoint design | COUNT inline with paged listings | DiscoverListingsService.java:47-49 | STATIC_CODE_RISK |
| Frontend ever fetches all listings? | NO — paged or marker-capped | — | OK |
| Marker payload weight | slim (id, lat, lon, pricePaise, locality) | DiscoverMarkersResponse | OK |
| Filter-change refetch storm | yes — 3 endpoints concurrently in area-selected+filters | useDiscoverMapData.ts:111-152 | STATIC_CODE_RISK |
| Debounce/coalesce | partial (bbox snap+debounce; filter state un-debounced) | useDiscoverPageState.ts:218-241 | STATIC_CODE_RISK |
| Failed marker observability | log.warn on cap hit; no metric | DiscoverMarkersService.java:58 | STATIC_CODE_RISK |
| HTTP cache headers on public Discover GETs | ABSENT | — | STATIC_CODE_RISK (CDN-cacheable opportunity) |
| Rate limiting on Discover | NOT in Discover paths | — | STATIC_CODE_RISK at scale |

---

## 5. Frontend React Query, rendering, and loading-state audit

Full table (15 findings) in `docs/audit/evidence/frontend-findings.md`. Top concerns by impact:

| # | Finding | File:Line | Severity | Label |
|---|---|---|---|---|
| 1 | Inline IIFE rebuilds `PropertyMap` listings prop on every render | MapDiscovery.tsx:447-458 | HIGH | STATIC_CODE_RISK (Marker array rebuild) |
| 2 | `filters` raw object embedded in query keys | useDiscoverListings.ts:77; useDiscoverFilteredMarkers.ts:36 | MEDIUM | STATIC_CODE_RISK |
| 3 | Filter state set synchronously while URL write debounced | useDiscoverPageState.ts:218-241 | MEDIUM | STATIC_CODE_RISK |
| 4 | No `keepPreviousData` on listings/markers — loading flicker | useDiscoverListings.ts:76-113; useDiscoverFilteredMarkers.ts:35-68 | MEDIUM | STATIC_CODE_RISK |
| 5 | Panels gate `isLoading` not `isFetching` — stale cards no spinner | DiscoverRightPanel.tsx:166-167,207-208,216-217 | MEDIUM | STATIC_CODE_RISK |
| 6 | Cold-load waterfall on school-selected deep link | useDiscoverMapData.ts:100-158 | MEDIUM | PLANNER_ESTIMATE |
| 13 | 3 overlapping endpoints in area-selected+filters | useDiscoverMapData.ts:111-152 | MEDIUM | STATIC_CODE_RISK |
| 15 | useDiscoverUrlState returns fresh `state` object every render | useDiscoverUrlState.ts:352-362 | MEDIUM | STATIC_CODE_RISK |
| 14 | `truncated` flag from markers response unused | useDiscoverFilteredMarkers.ts:17 | LOW | STATIC_CODE_RISK |
| 11 | `useDiscoverMarkers` appears unused (dead code candidate) | useDiscoverMarkers.ts:17-38 | LOW | STATIC_CODE_RISK |

---

## 6. Map rendering scalability audit

Strategy by volume:

| Listings | Current ability | Gap | Mechanism |
|---|---|---|---|
| 10 | OK (direct markers + cluster) | none | — |
| 100 | OK structurally; "feels slow" symptom | Marker-cluster rebuild on every parent render | Marker array rebuild (Finding #1) |
| 10k | UNVERIFIED — needs profiler trace | likely OK with current cluster + viewport debounce, IF Finding #1 fixed | Marker array rebuild compounds; loading-state ambiguity worsens |
| 100k | Not supported by current marker endpoint without enforced viewport | Need server-side viewport+filter truncation guarantee | Unbounded marker payload |
| 1M | Not supported | Need viewport-required + clustering or vector tiles | Unbounded marker payload + DOM cost |

Current marker rendering: Leaflet `L.markerClusterGroup` (PropertyMap.tsx). Icons cached at module level (PropertyMap.tsx:48-82) — good. Cluster rebuilds when `listings` reference changes — bad given Finding #1.

`AREA_LAYER_MAX_ZOOM=12` (MapDiscovery.tsx:33) gates area markers vs property markers — zoom-band strategy already in place. PROJECTION: at 1M, area-marker layer (~30 areas) remains cheap; property-marker layer must move to either (a) server-clustered points, (b) vector tiles (e.g. MapLibre + tegola/martin), or (c) viewport-bounded raw markers with strict cap + truncation UX. Architecture trade-off enumerated (not selected) in `architecture-readiness.md` §6.

---

## 7. Cache, aggregates, and freshness strategy

**Current state:**
- Rollup tables: `V2 area_price_weekly`, `V4 area_stats_latest`, `V70 area_overview_stats`. ETL/job-populated, refresh cadence not visible in repo.
- No materialized views; no `REFRESH MATERIALIZED VIEW` calls.
- No application cache layer (`@Cacheable`/`@EnableCaching`/Caffeine/RedisTemplate ABSENT in `backend/src/main/java`).
- No HTTP cache headers (`Cache-Control`/`ETag`) on Discover responses.

**What is recomputed per request that could be precomputed/cached:**
- `/api/discover/area-groups` — slow-changing seeded data; ideal for `Cache-Control: public, max-age=...`.
- `/api/discover/areas` — slow-changing; HTTP cache + ETag candidate.
- `/api/discover/listings COUNT(*)` — could be cached per (city, filter-hash) or approximated via `pg_class.reltuples` / count-estimator.
- `topLocalities` aggregates (DiscoverListingsService:153-171) — should live in `area_overview_stats` (already partially populated).

**Trade-offs (do not pick — for follow-up):**
- Caffeine in-process: cheap, no infra, breaks cross-pod cache hits.
- Redis: real shared cache, operational cost.
- CDN/HTTP caching of public GETs: cheapest at scale, requires correct headers + purge strategy.
- MV with `REFRESH CONCURRENTLY` vs continued rollup-job vs CDC.

---

## 8. Architecture readiness

Full evidence: `docs/audit/evidence/architecture-readiness.md`. Summary:

- **Stateless workload:** confirmed — JWT, no HttpSession, public GETs `permitAll` (`JwtConfig.java:23,28,42-49`). API is horizontally scalable today.
- **Real scaling ceiling:** JDBC connection pool + PgBouncer pooler (`SUPABASE_DB_PORT:6543` = pooler), not JVM count. Audit recommendation: capture pool/pooler headroom under target concurrency before scale-out.
- **Service extraction (Discover-as-service):** code-side seam is clean (single Java package). Blockers are infrastructural — shared schema (writes to `property_listings`/`schools`/`area_overview_stats` come from listings/ingestion/admin), shared `SecurityFilterChain`, shared exception handler / CORS / rate-limit beans. **Not justified pre-1M**.
- **API gateway:** `/api/discover/**` permit rules co-located with all other rules. Future gateway must mirror these. Trade-off: duplication vs removing per-endpoint `permitAll` from app.
- **Observability:** Sentry present (errors only); Micrometer / `@Timed` ABSENT; OpenTelemetry/tracing ABSENT; `auto_explain`/`pg_stat_statements` ABSENT; structured JSON logging ABSENT (slf4j unstructured `log.debug`).

---

## 9. Risk table — 10 / 100 / 10k / 1M listings

Severity scale: `🟢 OK` / `🟡 measurable risk` / `🟠 likely UX cliff` / `🔴 architectural blocker`.

| Layer | 10 | 100 | 10k | 1M |
|---|---|---|---|---|
| **DB — geospatial predicates** | 🟢 GiST works | 🟢 | 🟢 GiST + bbox required | 🟡 GiST + bbox + viewport-required mandatory |
| **DB — COUNT(*) per page** | 🟢 | 🟢 | 🟡 | 🔴 full filtered scan; need cache or estimate |
| **DB — GROUP BY locality aggregates** | 🟢 | 🟢 | 🟡 | 🔴 full filtered scan; precompute via rollup |
| **DB — lateral hero subquery** | 🟢 | 🟢 | 🟡 | 🟠 needs `(listing_id, position, id)` composite |
| **DB — OFFSET pagination depth** | 🟢 | 🟢 | 🟡 | 🟠 keyset pagination needed for SEO/scrapers |
| **API — markers CAP=1000 without viewport-required** | 🟢 | 🟢 | 🟠 returns first-1000-by-id, not viewport | 🔴 unbounded payload risk |
| **API — duplicate fan-out (listings+markers+cityListings)** | 🟢 | 🟡 | 🟡 | 🟠 cold-start compounds |
| **API — HTTP cache headers** | 🟢 | 🟢 | 🟡 cacheable opportunities | 🟠 must cache slow-changing GETs |
| **FE — Marker array rebuild (Finding #1)** | 🟡 | 🟠 dominant slowness contributor | 🔴 cluster rebuild O(n) every render | 🔴 |
| **FE — Unstable queryKey on filters** | 🟢 | 🟡 hashing cost per render | 🟠 | 🟠 |
| **FE — Loading-state ambiguity** | 🟡 | 🟡 perceived "didn't update" | 🟡 | 🟡 |
| **FE — Marker truncation UX** | 🟢 | 🟢 | 🟠 user unaware data missing | 🔴 |
| **Map — current cluster strategy** | 🟢 | 🟢 | 🟡 verify with profiler | 🔴 needs server clustering or vector tiles |
| **Arch — stateless scaling** | 🟢 | 🟢 | 🟢 | 🟡 pool/PgBouncer ceiling |
| **Arch — observability** | 🟡 | 🟡 | 🟠 EXPLAIN/timing ABSENT | 🔴 production blind without metrics |

---

## 10. P0–P3 prioritised roadmap

Each item: rationale, label of supporting evidence, effort tier (S/M/L), depends-on.

> **PROVISIONAL beyond P0-2.** Phase 1 evidence is static/projection-only. P0-2 (runtime EXPLAIN + HAR baseline) is the gate that converts STATIC_CODE_RISK / PROJECTION findings into MEASURED data. Once Phase 2 lands, P1–P3 items below MAY be re-prioritised, removed, or expanded based on measured evidence. Treat the cost/effort estimates accordingly.

**On WORKDONE_REVIEW APPROVED_FOR_PR, only Issue 2 (P0-2) will be created on GitHub.** The remaining 7 follow-ups stay drafted in §11 of this report; they will be created only after Phase 2 measurements either confirm or revise their priority. The user may explicitly approve creating all 8 simultaneously if desired.

### P0 — Correctness & perceived slowness (immediate)

**P0-1. Frontend marker hot-path memoisation pass.**
Fix Finding #1 (`MapDiscovery.tsx:447-458` IIFE), Finding #15 (`useDiscoverUrlState` returns fresh state object), Finding #4 (add `keepPreviousData` to listings + markers queries), Finding #5 (panels use `isFetching` overlay).
*Rationale:* Most likely single cause of "feels slow at <100 listings".
*Evidence:* STATIC_CODE_RISK (frontend-findings.md #1, #4, #5, #15).
*Effort:* M. *Depends-on:* none.

**P0-2. Runtime evidence collection — EXPLAIN + HAR baseline.**
Capture `EXPLAIN (ANALYZE, BUFFERS)` for the 7 named Discover endpoints against current production-like data; capture HAR/Playwright traces for the 8 journey states. Persist artefacts under `docs/audit/evidence/`.
*Rationale:* All current DB findings are PROJECTION/STATIC_CODE_RISK. Runtime evidence converts them to MEASURED, sharpens P1 prioritisation.
*Evidence:* PROJECTION limit acknowledged in `[projection_method]` fallback rules.
*Effort:* M. *Depends-on:* DB credentials + dev seed of representative size.

**P0-3. Surface marker truncation in UI.**
Frontend Finding #14 — `truncated: true` from `/api/discover/markers` is silently ignored. User sees a partial marker set with no indication.
*Effort:* S. *Depends-on:* P0-1 hot-path pass.

### P1 — Scalable API/query foundation

**P1-4. Bounded API contract: enforce viewport-required + max-size on markers, max-size cap on listings, keyset pagination on listings.**
Markers must require bbox or polygon (or schoolLat/schoolLon). Add 200 max page size on `/api/discover/listings`. Switch to keyset (`WHERE created_at < ?`) for deep-page browsing.
*Rationale:* PROJECTION at 100k+ infeasible without viewport-required (mechanism: unbounded marker payload).
*Effort:* L. *Depends-on:* P0-2 evidence to confirm the cliffs measured.

**P1-5. COUNT + topLocalities cache or rollup.**
COUNT(*) per page request and `GROUP BY locality` aggregates both run full filtered scans. Either (a) cache per (city, filter-hash) with short TTL, (b) approximate via `pg_class.reltuples` / count-estimator, or (c) precompute into existing `area_overview_stats`.
*Rationale:* PROJECTION (aggregate scan) at 1M.
*Effort:* M. *Depends-on:* trade-off decision (architect input).

**P1-6. HTTP cache headers + CDN policy on public Discover GETs.**
`/api/discover/area-groups`, `/api/discover/areas`, `/api/discover/listings` (read-only, public). Add `Cache-Control: public, max-age=...` + `ETag` per resource. Pair with FE `staleTime` alignment.
*Effort:* S. *Depends-on:* freshness SLO confirmation.

**P1-7. Index gaps L1+L2: composite `listing_images(listing_id, position, id)`; replace stale `idx_property_listings_price` with index on `price_paise` (or drop if `price` column dead).**
*Effort:* S. *Depends-on:* P0-2 EXPLAIN confirms hero-subquery cost.

### P2 — Large-volume map rendering

**P2-8. Map rendering strategy decision (10k → 1M).**
Architect-led trade-off: server-clustered markers vs vector tiles (MapLibre/martin/tegola) vs viewport-bounded raw markers with strict cap+truncation UX. Includes prototype + cost estimate.
*Effort:* L. *Depends-on:* P0-2 baseline + P1-4 viewport-required.

### P3 — Service / infra evolution

**P3-9. Observability foundation.**
Micrometer `@Timed` on Discover endpoints; `pg_stat_statements` + `auto_explain` extensions; structured JSON logging with request_id. No service split yet — instrument the monolith first.
*Effort:* M. *Depends-on:* none.

(Service extraction / read-replica / Redis layer / API gateway are explicitly **deferred** until P0–P3 above are exhausted. Architecture readiness write-up §6 enumerates options for when justified by measured load.)

---

## 11. Draft follow-up issues (NOT yet created on GitHub)

**Phase 1 → Phase 2 plan:**
- On WORKDONE_REVIEW APPROVED_FOR_PR: only **Issue 2 (P0-2 runtime baseline)** is created on GitHub against milestone #18.
- Issues 1, 3, 4, 5, 6, 7, 8 remain in this report as **provisional drafts**. They will be created on GitHub only after Phase 2 measurements either confirm their priority (recreating them as-is) or revise them (re-drafted then created).
- The user may at any point explicitly waive this gate and approve creating all 8 simultaneously.

### Issue 1 — `[DISCOVER][PERF][P0] Frontend marker hot-path memoisation pass`
**Body:**
> Fix the dominant frontend contributors to "feels slow at <100 listings":
>
> 1. `src/pages/MapDiscovery.tsx:447-458` — replace the inline IIFE construction of the `listings` prop with a `useMemo` keyed off the underlying `markerListings`/`areaMarkerListings` references so `MarkerClusterLayer` (`src/components/map/PropertyMap.tsx:438-486`) does not tear down + re-add the entire cluster layer on every parent render.
> 2. `src/hooks/useDiscoverUrlState.ts:352-362` — return a stable `state` object via `useMemo` keyed off the URL param primitives so consumers do not re-render when nothing meaningful changed.
> 3. Add `placeholderData: keepPreviousData` to `useDiscoverListings` and `useDiscoverFilteredMarkers` to soft-transition through filter changes.
> 4. Switch panels in `src/components/discover/DiscoverRightPanel.tsx:166-167,207-208,216-217` to gate visible loading state on `isFetching` (or `isLoading || isFetching`) so refetches show a spinner.
>
> Acceptance: React Profiler trace shows MarkerClusterLayer effect does NOT fire on unrelated parent state changes; `keepPreviousData` confirmed on listings/markers; `isFetching` overlay visible on filter change; no test regressions.
> Refs: docs/audit/discover-scale-audit-2026-05.md §10 P0-1.

### Issue 2 — `[DISCOVER][PERF][P0] Capture runtime EXPLAIN + HAR baseline`
**Body:**
> All DB findings in the audit (`docs/audit/discover-scale-audit-2026-05.md` §3) are STATIC_CODE_RISK or PROJECTION because audit phase had no DB credentials and no Playwright/Auth setup.
>
> Capture and commit under `docs/audit/evidence/`:
> - `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` for all 7 named Discover endpoints (`docs/audit/evidence/explain-projection.md`) at current Supabase row counts. Record dataset size caveats.
> - HAR or Playwright traces per the 8 journey states (`docs/audit/evidence/frontend-findings.md` Q1).
>
> Acceptance: artefacts present; risk table re-labelled where MEASURED converts STATIC_CODE_RISK/PROJECTION; cliffs prioritised in P1 sharpened.
> Refs: §10 P0-2.

### Issue 3 — `[DISCOVER][UX][P0] Surface marker truncation in UI`
**Body:**
> `/api/discover/markers` returns `truncated: boolean` (`backend/src/main/java/com/example/realestate/discover/DiscoverMarkersService.java:60`) but the consumer ignores it (`src/hooks/useDiscoverFilteredMarkers.ts:17` — type defines field; no UI surface).
>
> Add a non-blocking banner / toast on the map when `truncated=true` indicating the user is viewing a partial marker set; recommend zooming in or applying filters.
>
> Acceptance: when CAP=1000 is hit, user sees clear UX signal; static + interaction test added.
> Refs: §10 P0-3.

### Issue 4 — `[DISCOVER][API][P1] Bounded API contract: viewport-required markers, max-size + keyset pagination on listings`
**Body:**
> Make Discover's bounded-payload guarantee structural, not best-effort:
>
> 1. `/api/discover/markers` MUST require at least one of (bbox, polygon, schoolLat+schoolLon). Reject 400 otherwise. Update `DiscoverMarkersController` + add controller test.
> 2. `/api/discover/listings`: enforce max page size (e.g. 200). Reject sizes above cap.
> 3. Switch from `LIMIT/OFFSET` to keyset pagination (`WHERE created_at < ? OR (created_at = ? AND id < ?)`) for deep-page browsing while keeping legacy first-page behaviour.
> 4. Add `SET LOCAL statement_timeout = 5000` on Discover read-only transactions.
>
> Acceptance: contract tests confirm; backwards-compatible at first page; deep-page benchmark shows constant time.
> Refs: §10 P1-4.

### Issue 5 — `[DISCOVER][PERF][P1] Cache or precompute COUNT(*) and topLocalities aggregates`
**Body:**
> `DiscoverListingsService.getListings` runs a `SELECT COUNT(*)` per page request (DiscoverListingsService.java:47-49); `buildAggregates` runs a `GROUP BY pl.locality` per `includeAggregates=true` request (DiscoverListingsService.java:163-184). At 1M rows both become full filtered scans.
>
> Decision required (architect): (a) Caffeine cache per `(city, filter-hash)` with short TTL; (b) approximate count via `pg_class.reltuples` for unfiltered city COUNT; (c) move topLocalities into `area_overview_stats` (V70) and refresh via existing rollup job.
>
> Acceptance: ADR committed; selected path implemented; benchmark shows COUNT and topLocalities < 50ms p95 at 1M rows (synthetic seed).
> Refs: §10 P1-5.

### Issue 6 — `[DISCOVER][PERF][P1] HTTP cache headers + CDN policy for public Discover GETs`
**Body:**
> `/api/discover/area-groups`, `/api/discover/areas`, and (with care) `/api/discover/listings` are anonymous-public reads (`JwtConfig.java:42-49`). Add appropriate `Cache-Control` + `ETag` headers; align FE `staleTime` with server max-age. Confirm CDN/Cloudflare can edge-cache on the deploy host.
>
> Acceptance: response headers verified; FE `staleTime` consistent with server max-age; cache-hit ratio measured at edge.
> Refs: §10 P1-6.

### Issue 7 — `[DISCOVER][PERF][P1] Index gaps: composite on listing_images, replace stale price index`
**Body:**
> Two index gaps surfaced by the audit (`docs/audit/evidence/explain-projection.md`):
>
> 1. `listing_images` lacks `(listing_id, position, id)` composite supporting the lateral hero-image subquery in `DiscoverListingsService:55-58`.
> 2. `idx_property_listings_price` (V0) is on `price` column; current schema uses `price_paise` (since V11+). Either drop the dead index and create `idx_property_listings_price_paise`, or confirm `price` column is dead and clean up.
>
> Use Flyway expand/contract; Supabase pooler does not support `CREATE INDEX CONCURRENTLY` per V73 comment, so apply on a low-traffic window.
>
> Acceptance: EXPLAIN confirms new indexes used by hero subquery and price-only filters; migration committed; rollback path noted.
> Refs: §10 P1-7.

### Issue 8 — `[DISCOVER][MAP][P2] Decide map rendering strategy at 10k→1M`
**Body:**
> Architecture spike: choose between (a) server-clustered marker endpoint, (b) vector tiles via MapLibre + martin/tegola, (c) viewport-bounded raw markers with strict cap + truncation UX (current direction extended). Trade-offs enumerated in `docs/audit/evidence/architecture-readiness.md` §6.
>
> Acceptance: ADR committed; prototype demonstrating chosen path at 10k+ markers; ops/cost estimate.
> Refs: §10 P2-8. Depends on §10 P0-2 baseline + P1-4 viewport-required.

(Optional Issue 9 — `[DISCOVER][OBSERVABILITY][P3] Micrometer + pg_stat_statements + structured logging` — included in roadmap §10 P3-9 but **not** drafted as one of the 5–8 follow-ups; user/architect can add to backlog directly if desired. Cap respected at 8 issues.)

---

## Confirmation (per workdone_requirements — Phase 1 Static Audit)

- Final audit report: `docs/audit/discover-scale-audit-2026-05.md` ✅
- Evidence artefacts: `docs/audit/evidence/architecture-readiness.md`, `docs/audit/evidence/frontend-findings.md`, `docs/audit/evidence/explain-projection.md` ✅
- Endpoint coverage: 10 endpoints addressed at static/projection level; deeper SQL audit + EXPLAIN deferred to P0-2 ⚠ (Phase 2)
- Frontend coverage: 24 hooks/components named in approved plan all addressed in §5 + frontend-findings.md ✅
- Evidence labels applied: every finding tagged STATIC_CODE_RISK / PLANNER_ESTIMATE / PROJECTION ✅ (NO MEASURED — Phase 1 limitation)
- Runtime EXPLAIN evidence: NOT CAPTURED — deferred to P0-2 (Phase 2) ⚠
- HAR/Playwright evidence: NOT CAPTURED — deferred to P0-2 (Phase 2) ⚠
- Risk table: §9 ✅
- P0–P3 roadmap: §10 ✅ (P1–P3 items marked PROVISIONAL pending Phase 2)
- Follow-up issues drafted (8 — within 5–8 cap): §11 ✅; only Issue 2 (P0-2) created on GitHub per Phase 1 gate
- NO source/test/migration/data files changed ✅
- NO `.claude/agents/*` changes shipping in this PR ✅ (operational tool config kept local; reverted from branch)
- `.claude/state/` and `.claude/handoffs/` are gitignored — neither ships in the PR ✅
- Final shipping scope = `docs/audit/**` only ✅
- NO GitHub follow-up issues created until WORKDONE_REVIEW APPROVED_FOR_PR (then only Issue 2) ✅
- All audit agents on Opus ✅
