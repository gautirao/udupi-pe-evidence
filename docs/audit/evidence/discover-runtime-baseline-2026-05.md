# Discover Backend EXPLAIN + Public Endpoint Timing Baseline — Phase 2 (Issue #1061)

> **Phase:** 2 (runtime). Follow-up to the Phase 1 static/projection audit shipped under #1046 / PR #1060.
> **Captured:** 2026-05-10 UTC.
> **Approved plan:** `.claude/handoffs/issue-1061/001-plan-review-response.toml` (ChatGPT PLAN_REVIEW APPROVED with constraints).
> **WORKDONE_REVIEW response:** `.claude/handoffs/issue-1061/workdone-review-response.toml` (NEEDS_FIXES → Path B reframe; this document reflects that reframe).
> **Author:** Main agent (Opus). No sub-agents invoked.
> **Scope:** Evidence collection only. No source / migration / config / behaviour changes.

This document is **scoped as Path B** per the ChatGPT WORKDONE_REVIEW response: **Backend EXPLAIN baseline + public endpoint timing baseline** only. The original Phase 2 intent also covered browser-level HAR / Playwright trace evidence for the 8 Discover journey states; that part **was not captured this cycle** and is recorded as **NOT_MEASURED** with an explicit unblock path. AC3 is therefore **PARTIAL**, not complete.

This document converts Phase 1's STATIC_CODE_RISK and PROJECTION (mechanism) findings into MEASURED data wherever the current dataset can support it. Where the dataset is too small to confirm a 1M-scale projection, findings are labelled **NOT_DISPROVED** rather than CONFIRMED.

---

## 1. Dataset baseline at measurement time

Captured via `psql` against the production Supabase pooler (host redacted; credentials sourced from local `backend/.env` and never committed) under `BEGIN READ ONLY` guard.

| Table | Total rows | LIVE / visible | Notes |
|---|---:|---:|---|
| `property_listings` | 1,466 | **13** (LIVE + `archived_at IS NULL` + `is_duplicate=false`) | Per-city: udupi 12 / mangalore 0 / kundapur 0 / bangalore 0 visible |
| `schools` | 294 | 274 notable; 287 with `area_key`; all 294 with `district` | |
| `listing_images` | 2,706 | — | Hero subquery target |
| `areas` | 33 | — | |
| `cities` | 4 | — | bangalore, mangalore, udupi, kundapur |
| `area_overview_stats` | 5 | — | (locality + district rows; 4 are locality scope) |
| `area_groups` | 10 | — | |
| `area_group_members` | 23 | — | |

> **Critical caveat:** The visible dataset is **13 LIVE listings** (all in Udupi). Postgres often chooses sequential or non-spatial index plans on tiny tables regardless of available indexes. Every PROJECTION about behaviour at 100k / 1M rows is therefore **NOT_DISPROVED at this dataset size** — measurement cannot _confirm_ the cliff, but no measurement contradicts it either. The Phase 1 §10 P1-5 (synthetic 10k/100k seed) follow-up remains the only path to MEASURED CONFIRMED labels for the COUNT-cliff / GROUP-BY-cliff / unbounded-markers projections.

Full inventory: `docs/audit/evidence/explain/00-dataset-baseline.txt`.

---

## 2. Extensions, indexes, and observability — corrections to Phase 1

Several Phase 1 architecture-readiness statements are **DISPROVED** or **WEAKENED** by direct measurement against `pg_extension` / `pg_indexes`.

| Phase 1 claim | Phase 1 ref | Measured reality | Verdict |
|---|---|---|---|
| `pg_stat_statements` extension **ABSENT** | `architecture-readiness.md` §5; `discover-scale-audit-2026-05.md` §5, §8 | `SELECT * FROM pg_extension WHERE extname='pg_stat_statements'` → version **1.11** installed | **DISPROVED — pg_stat_statements IS installed.** Phase 1 §10 P3-9 ("`pg_stat_statements` + `auto_explain` extensions") is partially obsolete — only `auto_explain` is missing. Query telemetry foundation is already present and unused. |
| Composite `(listing_id, position, id)` on `listing_images` **MISSING** (audit recommends L1) | `explain-projection.md` Index inventory + L1; `discover-scale-audit-2026-05.md` §3 Index gaps | `idx_listing_images_listing_position` exists: `(listing_id, "position")` (no `id` suffix). EXPLAIN of EP-1.b shows the lateral hero subquery uses this index (`Index Scan using idx_listing_images_listing_position`). | **WEAKENED — the index exists in 2-column form.** The 3-column suggestion `(listing_id, position, id)` is a marginal improvement (eliminates the residual sort on `id` to break `position` ties); not a missing-index defect. Hero-subquery plan uses Incremental Sort with `Presorted Key: position` (Sort Method quicksort, Avg Memory 25kB). Cliff hypothesis dependent on tie-breaking volume at 1M rows. |
| `idx_property_listings_price` is on legacy `price` column and unused | `explain-projection.md` EP-1.D | `pg_indexes` confirms `idx_property_listings_price` is on `(price)` column; **`price` column still exists** (visible in EXPLAIN VERBOSE Output of EP-1.a) but the predicate uses `pl.price_paise` so the index is unused. EP-1.e (price-filter EXPLAIN) shows the planner picks `idx_property_listings_status_created_at` and applies the price predicate as a post-index Filter. | **CONFIRMED at static-evidence level.** PROJECTION at 1M (no usable price-only index path) is **NOT_DISPROVED** — too few visible rows for the planner to choose anything other than the status partial index. |
| `pg_class.reltuples` / count-estimator path  | implied by §10 P1-5 | Available (standard Postgres feature). | No-op — no Phase 1 claim to contradict; flagged here as a confirmed available mitigation. |

`auto_explain` status: `SHOW shared_preload_libraries;` returned its setting (one row, value not parsed here — see `00-dataset-baseline.txt`). The Phase 1 statement that `auto_explain` is ABSENT remains **PARTIALLY_MEASURED** (extension status checked; module-load setting captured but value should be hand-inspected before relying on it).

---

## 3. Backend EXPLAIN ANALYZE evidence (AC2)

For each Discover SQL path, we ran `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` inside `BEGIN READ ONLY; SET LOCAL statement_timeout='30s'; ... ; ROLLBACK;` against current Supabase data. Each artefact contains the exact SQL, parameter values, plan, index usage, actual-vs-estimated rows, buffers, planning + execution time.

### 3.1 Per-endpoint plan summary

| EP | Endpoint / variant | Plan top operator | Index used | Buffers (shared hit) | Planning | Execution | Verdict vs Phase 1 |
|---|---|---|---|---:|---:|---:|---|
| **EP-1.a** | `/api/discover/listings` — COUNT(*) city-only | Aggregate → Nested Loop Semi Join | `idx_property_listings_status_created_at` (partial, `WHERE is_duplicate=false`) + `areas_pkey` + `cities_pkey` (Memoize) | 37 | 0.362 ms | **0.153 ms** | PROJECTION (aggregate scan cliff at 1M) — **NOT_DISPROVED** (13 rows can't prove cliff) |
| **EP-1.b** | `/api/discover/listings` — page query (lateral hero) city-only | Limit → Sort (created_at DESC) + SubPlan 1 (Incremental Sort over `idx_listing_images_listing_position`) | `idx_property_listings_status_created_at` + lateral `idx_listing_images_listing_position` (Phase 1 thought this was missing) | 37 + 42 (subplan) | **4.020 ms** | **9.626 ms** | Hero-subquery cliff (L1) — **WEAKENED**: 2-col composite already exists; 3-col composite is a residual sort-elimination, not missing infra. Planning time (4ms) is **40% of execution** — measurable surprise. |
| **EP-1.c** | `/api/discover/listings` — page query with bbox | Limit → Index Scan + Filter `(geog && envelope::geography)` | Same status-partial index; bbox `&&` applied as Filter, **NOT** GiST | 13 | 0.42 ms | 0.171 ms | PROJECTION (GiST bbox path used at scale) — **NOT_DISPROVED**: at 13 rows the planner skips GiST; at scale it should switch. Confirmed predicate operator (`&&`) is GiST-eligible. |
| **EP-1.d** | `/api/discover/listings` — page query school radius (5km) | Limit → Nested Loop + Filter `ST_DWithin(pl.geog, ...)` | Same status-partial index; `ST_DWithin` applied as Filter (idx_property_listings_geog GiST not chosen at 13 rows) | 13 | 0.47 ms | 0.18 ms | Same as EP-1.c — **NOT_DISPROVED** at scale |
| **EP-1.e** | `/api/discover/listings` — price filter | Limit → Sort + Nested Loop + Filter `price_paise BETWEEN ?,?` | Same status-partial index; price predicate applied as Filter | 13 | 0.38 ms | 0.114 ms | EP-1.D (stale price index) — **CONFIRMED at code level**; cliff at 1M still **NOT_DISPROVED** |
| **EP-2** | `/api/discover/listings?includeAggregates=true` — GROUP BY locality | Limit → Sort → GroupAggregate (Sort) | Same status-partial index | 13 | 0.41 ms | 0.118 ms | PROJECTION (aggregate full scan at 1M) — **NOT_DISPROVED** at 13 rows |
| **EP-3.a** | `/api/discover/markers` — city only (NO bbox) | Limit → Index Scan + Nested Loop Semi Join | Same status-partial index | 13 | 0.42 ms | 0.155 ms | PROJECTION (unbounded marker payload at scale) — **NOT_DISPROVED**. The 13-row return is correct behaviour; cliff hypothesis is about volume, not query shape. |
| **EP-3.b** | `/api/discover/markers` — bbox | Limit → Index Scan + Filter `geog && envelope` + Nested Loop Semi Join | Same status-partial index; bbox `&&` as Filter (3 rows removed by filter) | 13 | 0.47 ms | 0.171 ms | At scale the planner should switch to GiST — **NOT_DISPROVED** |
| **EP-4** | `/api/listings/markers` (legacy) — bbox | Sort → Nested Loop + Index Scan + Filter | `idx_property_listings_status_created_at` (status IN (LIVE,SCRAPED) prevents partial index match) + lat/lon BETWEEN filter (no GiST) | small | 4.90 ms | small | Legacy controller is alive (returned 200 from probe). Plans differ from EP-3 because of `status IN ('SCRAPED','LIVE')` and lat/lon BETWEEN instead of geog. **CONFIRMED dead-or-legacy ambiguity from Phase 1**: endpoint is live but uses the older lat/lon path. |
| **EP-5** | `/api/discover/cities/{city}/listings` (city=udupi, areas=2, limit=5) | Incremental Sort → WindowAgg → Sort + Nested Loop + Bitmap | **`idx_listing_area_key_status_created`** (V74 composite — perfect fit) | 26 | 0.42 ms | **3.59 ms** | Phase 1 said "likely fine; needs SQL audit" — **CONFIRMED healthy** (correct composite index hit). WindowAgg `ROW_NUMBER() OVER (PARTITION BY area_key)` confirmed. |
| **EP-6** | `/api/discover/areas` (city=udupi) | Sort → HashAggregate + LEFT JOINs + per-area SubPlan school COUNT | `cities_slug_key` + Seq Scan areas (33 rows) + Seq Scan area_overview_stats (4 rows) + `idx_property_listings_status_created_at` + **`idx_schools_area_key` (Index Only Scan)** for the inline school COUNT subquery | 26 | **1.64 ms** | **0.357 ms** | Phase 1 §3 said "rollup table read" — **CONFIRMED healthy**. Per-area school COUNT subquery uses `idx_schools_area_key` index-only scan; no leak. Planning > execution (1.64 vs 0.36 ms). |
| **EP-7** | `/api/discover/area-groups` (city=udupi) | Sort → Nested Loop + Index Scans | `cities_slug_key` + `idx_area_groups_city_active_order` + `idx_area_group_members_group_order` | small | 0.29 ms | **0.067 ms** | Phase 1 §10 P1-6 cacheable candidate — **CONFIRMED healthy**; query is already fast enough that the cacheability is more about reducing backend hits than fixing slowness. |
| **EP-8** | `/api/public/schools/popular` (city=udupi, limit=5) | Limit → Incremental Sort → Nested Loop + Hash Join + Sort + Seq Scan areas | `idx_schools_name` scanned 45 schools to find 5 matching district subquery | small | 1.05 ms | **1.52 ms** | Phase 1 said "not deep-audited / UNKNOWN" — **MEASURED**: walks 45 schools by name order under prominence_tier='notable' filter + district IN subquery. At 1M schools the index-scan would still walk by name order which is non-selective; can degrade unless district predicate is moved. **NOT_DISPROVED** at current scale, but newly MEASURED. |
| **EP-9** | `/api/public/schools/by-area` (area=Udupi/Manipal, size=20) | Limit → Sort → Index Scan `(s.area_key = ?)` | `idx_schools_area_key` | small | 0.12 ms | **0.087 ms** | Phase 1 said "GIST hit on schools.geog" — **DISPROVED**: this endpoint uses FK `area_key` matching (V79), NOT geog at all. The query is index-friendly via `idx_schools_area_key`. **CONFIRMED healthy** (different mechanism than Phase 1 thought). |
| **EP-10** | `/api/public/schools/nearby` (lat=13.29 lon=74.74 radius=5km) | Sort → **Seq Scan on schools** + Filter `ST_DWithin(ST_Point(lon,lat)::geography, ...)` | **NONE — `idx_schools_geog` GiST is NOT USED** | 86 | 0.17 ms | **83.7 ms** | Phase 1 said "GIST hit on schools.geog" — **DISPROVED + new MEASURED finding**: the SchoolRepository SQL uses `ST_DWithin(ST_Point(s.longitude, s.latitude)::geography, ...)` — a **recomputed** point expression on the lat/lon columns, NOT the stored `s.geog` column. GiST cannot be used on a recomputed expression. **293 rows removed by Filter** at 294-row table. **Linear scaling**: at 100k schools this becomes ~28 seconds. This is a new measurable defect not in Phase 1 §3. |

### 3.2 Per-finding artefact links

- `docs/audit/evidence/explain/00-dataset-baseline.txt` — counts + indexes + extensions
- `docs/audit/evidence/explain/EP-1a-listings-count-city-only.txt`
- `docs/audit/evidence/explain/EP-1b-listings-page-city-only.txt`
- `docs/audit/evidence/explain/EP-1c-listings-page-bbox.txt`
- `docs/audit/evidence/explain/EP-1d-listings-school-radius.txt`
- `docs/audit/evidence/explain/EP-1e-listings-price-filter.txt`
- `docs/audit/evidence/explain/EP-2-aggregates-group-by-locality.txt`
- `docs/audit/evidence/explain/EP-3a-markers-city-only.txt`
- `docs/audit/evidence/explain/EP-3b-markers-bbox.txt`
- `docs/audit/evidence/explain/EP-4-listing-markers-legacy-bbox.txt`
- `docs/audit/evidence/explain/EP-5-city-area-listings.txt`
- `docs/audit/evidence/explain/EP-6-discover-areas.txt`
- `docs/audit/evidence/explain/EP-7-area-groups.txt`
- `docs/audit/evidence/explain/EP-8-schools-popular.txt`
- `docs/audit/evidence/explain/EP-9-schools-by-area.txt`
- `docs/audit/evidence/explain/EP-10-schools-nearby.txt`

### 3.3 New findings surfaced by EXPLAIN (not in Phase 1)

- **NF-1 — `/api/public/schools/nearby` does not use `idx_schools_geog`.** ~~Recomputed point expression in `ST_DWithin(ST_Point(s.longitude, s.latitude)::geography, ...)` (see `SchoolRepository.java:79-88`) defeats the GiST index on `schools.geog`. **MEASURED + CONFIRMED** via EP-10 plan (Seq Scan + Filter, 293 rows removed). Linear scaling. **NEW — not in Phase 1.**~~ **RESOLVED — 2026-05-16 via issue #1063 / branch `fix/1063-schools-nearby-geog-index`.** `SchoolRepository.findNearbySchools` now uses `ST_DWithin(s.geog, ST_MakePoint(:lon, :lat)::geography, :radiusMeters)` and `ST_Distance(s.geog, ST_MakePoint(:lon, :lat)::geography)`, replacing the recomputed `ST_Point(s.longitude, s.latitude)::geography` expression. The stored `s.geog` column (V75 GENERATED ALWAYS STORED) matches the `idx_schools_geog` GiST index predicate (V76 `ON schools USING GIST (geog) WHERE geog IS NOT NULL`) exactly, enabling an Index Scan instead of the measured 83.7 ms Seq Scan. BEFORE plan archived in `docs/audit/evidence/explain/EP-10-schools-nearby.txt`; AFTER plan to be captured at next dev DB session (see AFTER block in EP-10 file). Regression guard: `SchoolRepositoryTest` (new, `@Tag("integration")`, 4 tests) verifies ordering, distance magnitudes, radius exclusion, and the `geog IS NOT NULL` invariant.
- **NF-2 — Planning time can equal or exceed execution time at small scale.** Planning Time / Execution Time examples: EP-1.b 4.02 / 9.63 ms; EP-6 1.64 / 0.36 ms; EP-1.a 0.36 / 0.15 ms. At 1M rows execution dominates and this becomes irrelevant; at current scale the planner cost can be tuned via prepared-statement caching. Worth noting in observability follow-ups.
- **NF-3 — `idx_property_listings_status_created_at` (V13) is the universal index winner.** Every Discover listings/markers EXPLAIN converged on this partial index (`WHERE is_duplicate=false`, B-tree on `(status, created_at DESC)`). The V74 `idx_listing_area_key_status_created` composite was only chosen by EP-5 (the per-area path that drives by `area_key=`). V13 is doing more work in this codebase than V74. The implication: at scale, `area_key` filtering may be redundant with what V13 already provides via Nested Loop Semi Join, depending on selectivity. **NEW — implication for Phase 1 §10 P1-7 index gaps recommendation.**

---

## 4. Public endpoint timing summary (AC3 PARTIAL — browser HAR outstanding)

### 4.1 What this section IS and IS NOT

**WHAT IT IS:** A **per-endpoint timing summary** captured via `curl -w "<timing-format>"` against the deployed Render instance (`https://udupi-property-explorer.onrender.com`). 3 sequential warm trials per endpoint with TLS / DNS / connect / TTFB / total / payload-byte breakdown. Endpoint-level evidence only.

**WHAT IT IS NOT:** It is **NOT browser-level HAR / Playwright journey waterfall evidence**. Sequential curl probes cannot show:

- which requests fire **in parallel** within a journey state,
- duplicate / overlapping requests caused by React Query key instability,
- request firing pattern caused by URL state changes or map movement,
- Browser Back/Forward (S8) network behaviour,
- the actual loading-state UX (`isLoading` vs `isFetching` per Phase 1 Finding #5),
- the actual `keepPreviousData` flicker behaviour (Phase 1 Finding #4),
- the actual marker-cluster rebuild cost (Phase 1 Finding #1).

Browser HAR for the 8 journey states **was not captured this cycle**. AC3 is therefore **PARTIAL** — see §4.5 below.

The ChatGPT PLAN_REVIEW response permitted "a summarised network table" as an alternative to raw HAR; the WORKDONE_REVIEW response clarified that this allowance covered **browser-derived** summarised tables, not curl-only endpoint tables. This section honours that clarification by reframing the section title from "HAR / trace baseline" to **"Public endpoint timing summary"** and downgrading the per-state status to PARTIALLY_MEASURED / NOT_MEASURED accordingly.

Artefact: `docs/audit/evidence/har/endpoint-summary.txt` — endpoint-level only.

> **Cold start signal (endpoint-level, MEASURED):** First probe (`/api/discover/areas?city=udupi`) returned in **43.4 s** — Render free-tier cold start. Subsequent warm probes returned in **0.36–0.97 s**. This is a real cold-start tax on the first request of any anonymous-public Discover journey. This is the only journey-relevant data point that survives the curl-only methodology: it is observed at the network layer, not the browser layer.

### 4.2 BLOCKER 1 — JWT requirement on listings/markers (states S1, S2, S3, S4, S7)

A planning assumption from Phase 1 architecture-readiness §1 — *"Public access permitted via JwtConfig permitAll rules"* — over-generalised. Measurement against `JwtConfig.java:32-66` and curl probes confirms:

- **permitAll (anonymous):** `/api/discover/areas`, `/api/discover/cities/*/listings`, `/api/discover/area-groups`, `/api/discover/areas/*/listings`, `/api/listings/markers`, `/api/public/schools/**`, `/api/public/listings/**`, `/api/public/areas/*/overview`, `/api/public/areas/trending`, `/api/trends/**`
- **JWT required (NOT permitAll):** `/api/discover/listings`, `/api/discover/markers`

Anonymous curl probes against `/api/discover/listings?city=udupi*` and `/api/discover/markers?city=udupi*` return **HTTP 401** in every trial. The frontend reflects this: `useDiscoverListings` and `useDiscoverFilteredMarkers` are gated by an `auth &&` enable flag (`frontend-findings.md` Q1, "useDiscoverListings (auth & !q)").

**Consequence for AC3:**

- Journey states **S1 (city landing), S2 (area-groups landing), S3 (area-marker-selected), S4 (area-selected + filters), S7 (school-selected nearby-homes)** all fire `useDiscoverListings` and `useDiscoverFilteredMarkers` once the user authenticates. Without an authenticated JWT fixture, those endpoints cannot be exercised this Phase 2 cycle.
- Journey states **S5 (school-first landing — popular schools)** and **S6 (schools-in-area)** rely on `/api/public/schools/popular` and `/api/public/schools/by-area` — both anonymous; these states **CAN** be measured anonymously and **WERE** measured.
- Journey state **S8 (Back/Forward navigation)** is a URL-state mechanism (validated in #1043) that re-fires whatever endpoints the destination state demands — its measurement reduces to whichever combination of S1–S7 the user navigates through.

**No fake evidence shipped:** S1–S4, S7 are labelled **NOT_MEASURED — auth fixture required** below.

**Smallest unblock for BLOCKER 1:** Seed a test broker account on the deployed instance, obtain a JWT via the normal login flow, then capture browser HAR while walking through S1–S4 + S7 in Chrome with DevTools open (File → Save all as HAR). No committed script required; manual capture only. The committed `endpoint-summary.txt` would gain the corresponding authenticated-request entries on its next pass.

### 4.3 BLOCKER 2 — browser HAR not captured for any journey state (S1–S8)

This Phase 2 cycle did not capture browser-level HAR / Playwright trace evidence for **any** of the 8 journey states. The curl-driven `endpoint-summary.txt` provides endpoint-level timing but not browser-level waterfall.

| State | Browser HAR / Playwright trace | Public endpoint timing only |
|---|---|---|
| S1 city landing | NOT_MEASURED | partial (EP-6, EP-7 only — anonymous) |
| S2 area-groups landing | NOT_MEASURED | partial (EP-6, EP-7 only) |
| S3 area-marker-selected | NOT_MEASURED | partial (EP-5, EP-6, EP-7 only) |
| S4 area-selected + filters | NOT_MEASURED | partial (EP-5, EP-6, EP-7 only) |
| S5 school-first landing / popular schools | NOT_MEASURED | endpoint timing MEASURED (EP-6, EP-7, EP-8) |
| S6 schools-in-area | NOT_MEASURED | endpoint timing MEASURED (EP-9) |
| S7 school-selected nearby-homes | NOT_MEASURED | NOT_MEASURED — also blocked by JWT |
| S8 Browser Back/Forward | NOT_MEASURED | NOT_INDEPENDENTLY_MEASURABLE |

**Smallest unblock for BLOCKER 2:** Open the deployed Discover page in Chrome, navigate through states S5 → S6 (anonymous-feasible), DevTools Network tab → "Save all as HAR with content", drop the file(s) into `docs/audit/evidence/har/`. Repeat for S1–S4 + S7 after BLOCKER 1 is cleared. No code change required; no Playwright script.

### 4.4 Per-state coverage table (endpoint timing only)

This table records **endpoint-level public timing** per state. **Browser HAR / Playwright trace = NOT_MEASURED for ALL states (S1–S8)** — see §4.3.

| State | Hooks (Phase 1) | Endpoints fired | Public endpoint timing | Browser HAR / trace |
|---|---|---|---|---|
| **S1** city landing / guided-entry | discoverAreas, areaGroups, trendsOptions, **discoverListings (auth)**, **discoverFilteredMarkers (auth & zoom>12)** | EP-6 + EP-7 + (trends) + EP-1 + EP-3 | PARTIALLY_MEASURED — EP-6 + EP-7 timed; EP-1/EP-3 401 (JWT) | NOT_MEASURED |
| **S2** area-groups landing | + `focusedGroupAreas` memo | same as S1 | PARTIALLY_MEASURED (same gap as S1) | NOT_MEASURED |
| **S3** area-marker-selected | + `useDiscoverCityListings` | + EP-5 | PARTIALLY_MEASURED — EP-5 (0.7–1.0 s TTFB, 2.2 KB), EP-6, EP-7 timed; EP-1/EP-3 401 | NOT_MEASURED |
| **S4** area-selected + filters | same as S3 — three queries re-fire on filter change | same as S3 | PARTIALLY_MEASURED (same as S3) | NOT_MEASURED |
| **S5** school-first landing / popular schools | base set + behaviour | EP-6 + EP-7 + EP-8 | MEASURED (anonymous): EP-6 (0.36–0.47 s), EP-7 (0.47–0.57 s), EP-8 (0.57–0.65 s) | NOT_MEASURED |
| **S6** schools-in-area | + useSchoolsByArea | + EP-9 | MEASURED (anonymous): EP-9 (0.53–1.95 s TTFB; 4.0 KB) | NOT_MEASURED |
| **S7** school-selected nearby-homes | + useSchoolById; listings + markers re-keyed with school params | + (school-by-id) + EP-1.d + EP-3.c | NOT_MEASURED (JWT) | NOT_MEASURED |
| **S8** Browser Back/Forward | `useDiscoverUrlState` re-reads URL params | inherits destination state | NOT_INDEPENDENTLY_MEASURABLE | NOT_MEASURED |

**Critical implication:** Phase 1 frontend findings that depend on **measured waterfall evidence** — Finding #1 (marker rebuild on every render), #2 (unstable query keys), #3 (sync state vs debounced URL), #4 (no `keepPreviousData`), #5 (`isLoading` vs `isFetching`), #6 (cold-load waterfall), #13 (3 overlapping endpoints in area-selected+filters), #15 (`useDiscoverUrlState` fresh state) — remain **NOT_DISPROVED at the static evidence level only**. Phase 2 measurement did not advance them to MEASURED + CONFIRMED. Any implementation follow-up depending on these findings must be marked **WAIT** or **PARTIALLY_MEASURED** until browser HAR is captured. This is reflected in §6 recommendations.

### 4.5 Render free-tier cold-start signal

Phase 1 §10 noted *"cold-start latency on Render compounds"* (Finding #13 mechanism). **MEASURED + CONFIRMED**: cold start observed at **43.4 s** on the first probe of `/api/discover/areas`. Warm probes resume in **0.36 s** range. Any user landing on the Discover page after server idle observes the full cold-start tax on their first endpoint, then warm latency for every concurrent endpoint that follows.

### 4.6 Marker truncation (`truncated:true`) was not exercised

The `DiscoverMarkersResponse.truncated` flag fires when the result set exceeds `CAP=1000`. The current visible dataset is 13 markers across Udupi; truncation cannot be triggered. **NOT_MEASURED — dataset too small to exercise.** Phase 1 frontend Finding #14 (`truncated` flag unused in UI) remains **CONFIRMED at code level**, unchanged by Phase 2 measurement.

---

## 5. Phase 1 finding relabel table (AC4)

For each labelled Phase 1 finding, restated with measurement verdict. **Quality labels** are MEASURED / PARTIALLY_MEASURED / NOT_MEASURED. **Verdict labels** are CONFIRMED / WEAKENED / DISPROVED / NOT_DISPROVED.

### 5.1 Database / SQL findings (from `explain-projection.md`, mirrored in `discover-scale-audit-2026-05.md` §3, §9)

| ID | Phase 1 finding | Phase 1 label | Quality | Verdict | Notes |
|---|---|---|---|---|---|
| EP-1.A | COUNT(*) per page request → aggregate scan cliff at 1M | STATIC_CODE_RISK + PROJECTION | PARTIALLY_MEASURED | NOT_DISPROVED | EP-1.a executes in 0.153 ms at 13 rows. Mechanism (full filtered scan) is correctly identified; cliff unverifiable without synthetic seed. |
| EP-1.B | Lateral hero subquery without composite index | STATIC_CODE_RISK | MEASURED | **WEAKENED** | `idx_listing_images_listing_position` (`listing_id, position`) **exists** and is used by EP-1.b. The 3-col `(listing_id, position, id)` is an optimisation, not a missing-index defect. |
| EP-1.C | LIMIT/OFFSET pagination cliff at deep pages | STATIC_CODE_RISK + PROJECTION | NOT_MEASURED | NOT_DISPROVED | Cannot exercise deep OFFSET on 13 visible rows. Mechanism still valid. |
| EP-1.D | `idx_property_listings_price` on stale `price` column | STATIC_CODE_RISK | MEASURED | **CONFIRMED** | `pg_indexes` confirms; EP-1.e shows planner falls back to status partial index. |
| EP-1.E | `area_key IN (SELECT ...)` subquery should hash-join | STATIC_CODE_RISK | MEASURED | **CONFIRMED** | All EP-1 / EP-3 plans use Nested Loop Semi Join with `areas_pkey` + Memoize on `cities_pkey`. Selectivity tiny → planner picks Nested Loop; would hash-join at scale. Healthy. |
| EP-1.F | No `SET LOCAL statement_timeout` | STATIC_CODE_RISK | NOT_MEASURED | NOT_DISPROVED | Backend code does not set per-request timeout. Can't measure incident frequency at current load. Mechanism valid. |
| EP-2.A | GROUP BY locality recomputed per request | STATIC_CODE_RISK + PROJECTION | PARTIALLY_MEASURED | NOT_DISPROVED | EP-2 executes in 0.118 ms at 13 rows. Cliff at 1M not verifiable without seed. |
| EP-3.A | CAP=1000 markers cap | STATIC_CODE_RISK | MEASURED | **CONFIRMED** | Code at `DiscoverMarkersService.java:24`. Not exercised (dataset too small). |
| EP-3.B | `ORDER BY pl.id` not spatially selective | STATIC_CODE_RISK | MEASURED | **CONFIRMED** | EP-3.a plan confirms. |
| EP-3.C | No viewport-required guard on markers | STATIC_CODE_RISK + PROJECTION | MEASURED | **CONFIRMED** | EP-3.a returns full 13 rows without bbox. Unbounded mechanism confirmed. Cliff at 1M not verified. |
| EP-4 | `/api/listings/markers` legacy — dead or alive? | (needs audit) | MEASURED | **CONFIRMED ALIVE** | Anonymous probe returns 200 with payload (1190 B). EP-4 plan exists. Recommend further dead-code analysis since FE hook table did not enumerate a hook firing it. |
| EP-5 | `/api/discover/cities/{city}/listings` healthy projection | (needs audit) | MEASURED | **CONFIRMED HEALTHY** | EP-5 uses V74 composite index. 3.59 ms execution at 13 rows / 2 areas. |
| EP-6 | `/api/discover/areas` reads rollup | (low risk) | MEASURED | **CONFIRMED HEALTHY** | 0.36 ms execution. Per-area school-count subquery uses index-only scan. |
| EP-7 | `/api/discover/area-groups` cacheable | (low risk) | MEASURED | **CONFIRMED HEALTHY** | 0.067 ms execution. Strongest cache candidate. |
| EP-8 | `/api/public/schools/popular` UNKNOWN | UNKNOWN | MEASURED | **CONFIRMED at current scale; NOT_DISPROVED at 1M** | Walks `idx_schools_name` under district filter — 45 schools scanned to find 5. At 1M-school city could degrade. |
| EP-9 | `/api/public/schools/by-area` "GIST on schools.geog" | (low/medium) | MEASURED | **DISPROVED MECHANISM** | Endpoint uses `idx_schools_area_key` FK match, NOT geog. Healthy via different mechanism. |
| EP-10 | `/api/public/schools/nearby` "GIST on schools.geog" | (low/medium) | MEASURED | **DISPROVED + new defect** | Recomputed `ST_Point(s.longitude, s.latitude)` defeats `idx_schools_geog`. Seq Scan + Filter. **NEW finding (NF-1) — not in Phase 1.** Linear scaling. |
| L1 | Missing composite on `listing_images(listing_id, position, id)` | STATIC_CODE_RISK | MEASURED | **WEAKENED** | 2-col composite already exists. 3-col is residual sort-elimination. |
| L2 | `idx_property_listings_price_paise` missing | STATIC_CODE_RISK | MEASURED | **CONFIRMED** | Index on legacy `price` column still exists; predicate uses `price_paise`. |
| L3 | `pg_stat_statements` ABSENT | STATIC_CODE_RISK | MEASURED | **DISPROVED** | Extension installed (v1.11). |

### 5.2 Frontend findings (from `frontend-findings.md`)

| # | Finding | Phase 1 severity / label | Quality | Verdict | Notes |
|---|---|---|---|---|---|
| 1 | IIFE rebuilds `PropertyMap.listings` prop every render | HIGH STATIC_CODE_RISK | NOT_MEASURED | NOT_DISPROVED | React Profiler trace not captured this cycle (would have required browser session with auth). Code-level claim still valid. |
| 2 | `filters` raw object embedded in query keys | MEDIUM STATIC_CODE_RISK | NOT_MEASURED | NOT_DISPROVED | React Query devtools needed; not captured. |
| 3 | Filter state set synchronously while URL debounced | MEDIUM STATIC_CODE_RISK | NOT_MEASURED | NOT_DISPROVED | Same as #2. |
| 4 | No `keepPreviousData` on listings/markers | MEDIUM STATIC_CODE_RISK | NOT_MEASURED | NOT_DISPROVED | Requires auth + filter interaction. |
| 5 | Panels gate on `isLoading` not `isFetching` | MEDIUM STATIC_CODE_RISK | NOT_MEASURED | NOT_DISPROVED | Same as #4. |
| 6 | Cold-load waterfall on school-selected deep link | MEDIUM PLANNER_ESTIMATE | PARTIALLY_MEASURED | NOT_DISPROVED | Cold-start of Render (43.4 s observed) **does** compound waterfall — confirmed at infra layer. Per-state sequencing un-measured. |
| 7 | useSchoolsByArea queryKey unstable arrays | LOW STATIC_CODE_RISK | NOT_MEASURED | NOT_DISPROVED | |
| 8 | `focusBounds` memo `?? []` allocates | LOW STATIC_CODE_RISK | NOT_MEASURED | NOT_DISPROVED | |
| 9 | `effectiveFilters` memo depends on unstable `filters` | LOW STATIC_CODE_RISK | NOT_MEASURED | NOT_DISPROVED | |
| 10 | `activeContextChips` memo unstable deps | LOW STATIC_CODE_RISK | NOT_MEASURED | NOT_DISPROVED | |
| 11 | `useDiscoverMarkers` dead | LOW STATIC_CODE_RISK | MEASURED | **CONFIRMED** | Phase 1 grep confirmed; no measurement contradicts. |
| 12 | `discoverAreas.filter(includes(...))` O(n×m) | LOW STATIC_CODE_RISK | NOT_MEASURED | NOT_DISPROVED | Bounded at MVP volume. |
| 13 | 3 overlapping endpoints in area-selected+filters | MEDIUM STATIC_CODE_RISK | PARTIALLY_MEASURED | NOT_DISPROVED | Auth-gated states (S3/S4) blocked from full HAR; backend per-endpoint timing captured (EP-1, EP-3, EP-5 each warm 0.2–1.0 s; cold > 40 s). Concurrent firing pattern documented in Phase 1 hook table. |
| 14 | Marker `truncated` flag unused in UI | LOW STATIC_CODE_RISK | NOT_MEASURED (cannot trigger) | NOT_DISPROVED at code level | 13-row dataset cannot trigger CAP=1000. Code-level claim stands. |
| 15 | `useDiscoverUrlState` returns fresh state every render | MEDIUM STATIC_CODE_RISK | NOT_MEASURED | NOT_DISPROVED | |

### 5.3 Architecture readiness corrections

| Item | Phase 1 claim | Phase 2 verdict | Notes |
|---|---|---|---|
| Stateless JWT | Confirmed at code level | **CONFIRMED at code level (no behaviour test)** | Same as Phase 1. |
| Discover endpoints "public" | Over-generalised | **PARTIALLY DISPROVED** | `/api/discover/listings` and `/api/discover/markers` require JWT. See §4.2. |
| 5000-marker cap | Already corrected to 1000 in Phase 1 audit | **CONFIRMED at code level** | `DiscoverMarkersService.CAP=1000`. |
| Sentry errors only | Confirmed at code level | NOT_MEASURED | Same as Phase 1. |
| Micrometer absent | Confirmed at code level | **CONFIRMED at code level** | Same as Phase 1. |
| `pg_stat_statements` absent | DISPROVED (§2 above) | **DISPROVED** | Installed at v1.11. |
| `auto_explain` absent | Confirmed at code level | PARTIALLY_MEASURED | `shared_preload_libraries` captured in baseline file; not parsed. |
| Structured logging absent | Confirmed at code level | NOT_MEASURED | |

---

## 6. Recommendation: which of Phase 1 §11 draft follow-ups to create / revise / discard (AC5)

> **Important constraint:** Per ChatGPT PLAN_REVIEW APPROVED constraint and explicit user instruction, **no GitHub follow-up issues are created in #1061**. The recommendations below are advisory; issue creation is a separate user-approved step.

### Issue 1 — `[DISCOVER][PERF][P0] Frontend marker hot-path memoisation pass`
**Recommendation: WAIT (PARTIALLY_MEASURED).**
**Rationale:** All 4 sub-items (IIFE memoisation, `useDiscoverUrlState` stable state, `keepPreviousData`, `isFetching` gating) depend on **measured waterfall / Profiler evidence** that Phase 2 did not capture (browser HAR + React Profiler trace NOT_MEASURED for all S1–S8). The static code-level evidence from Phase 1 stands, but per the ChatGPT WORKDONE_REVIEW Path B framing, frontend implementation follow-ups depending on waterfall evidence must be marked WAIT until browser HAR (or a React Profiler trace) confirms the rebuild cost / refetch storm. Unblock = capture browser HAR per §4.3 unblock path. Until then, this issue remains in the Phase 1 draft pool.
**Caveat:** The user may explicitly accept static Phase 1 evidence as sufficient and override this WAIT. That is a product call, not a measurement call.

### Issue 3 — `[DISCOVER][UX][P0] Surface marker truncation in UI`
**Recommendation: PARTIALLY_MEASURED — defer creation until truncation is actually triggered by browser session OR until user explicitly waives the waterfall-evidence gate.**
**Rationale:** CAP=1000 + `truncated:true` flag + FE consumer absence are all CONFIRMED at code level (Phase 1). However, the defect's user-visible severity (when does a user actually hit CAP?) requires either (a) browser HAR showing the truncated response or (b) synthetic-seed measurement. Phase 2 captured neither. This is a real defect but its priority should be backed by measurement before shipping.

### Issue 4 — `[DISCOVER][API][P1] Bounded API contract: viewport-required markers + max-size + keyset pagination`
**Recommendation: REVISE before creating.**
**Suggested deltas:**
- **Keep** sub-item 1 (viewport-required markers).
- **Keep** sub-item 2 (max-size 200 on `/api/discover/listings`).
- **Defer** sub-item 3 (keyset pagination) — NOT_DISPROVED but unmeasured at any deep-page volume. Make a separate issue when SEO/scraper deep-paging is observed.
- **Defer** sub-item 4 (`SET LOCAL statement_timeout`) — EP-1.F NOT_MEASURED. Make a smaller, focused issue ("Add 30s statement_timeout to Discover read-only transactions") once observability (Issue 9) is in place to detect real incidents.

### Issue 5 — `[DISCOVER][PERF][P1] Cache or precompute COUNT(*) and topLocalities aggregates`
**Recommendation: WAIT.**
**Rationale:** Phase 2 cannot CONFIRM the cliff at 13 rows. Creating this issue now risks committing to a Caffeine vs Redis vs MV trade-off without measured evidence of the cliff. **Pair with a synthetic-seed follow-up** (the Phase 1 §10 P0-2 sub-item C that we could not exercise) before deciding on the mitigation. If a seed becomes available, this issue is then a 1-line decision: pick (a), (b), or (c).

### Issue 6 — `[DISCOVER][PERF][P1] HTTP cache headers + CDN policy for public Discover GETs`
**Recommendation: CREATE AS DRAFTED (one of the few items with measured backing).**
**Rationale:** EP-6 (areas), EP-7 (area-groups), and EP-4 (legacy markers) are CONFIRMED anonymous endpoints with CONFIRMED slow-changing data. Endpoint timing is MEASURED warm at sub-second; cold-start was MEASURED at 43.4 s. Effort is small (S). This issue does NOT depend on browser waterfall evidence — it only depends on confirmed cacheable endpoints, which Phase 2 measured. This is the cheapest measurement-backed win in the Phase 1 roadmap.

### Issue 7 — `[DISCOVER][PERF][P1] Index gaps: composite on listing_images, replace stale price index`
**Recommendation: REVISE before creating.**
**Suggested deltas:**
- **Sub-item 1 (listing_images composite):** WEAKENED — change body to *"Add `id` suffix to existing `idx_listing_images_listing_position` (currently `(listing_id, position)`) → become `(listing_id, position, id)` to eliminate the residual sort-on-id break-tie shown in EP-1.b plan. Optional optimisation, not a missing-index defect."*
- **Sub-item 2 (stale price index):** CONFIRMED — keep as drafted. Either replace with `idx_property_listings_price_paise` or drop entirely if `price` column is dead. EP-1.e plan shows no usable price index in current behaviour.
- **Add a third sub-item:** *"Fix `SchoolRepository.findNearbySchools` to use `s.geog` directly instead of `ST_Point(s.longitude, s.latitude)::geography` — enables `idx_schools_geog` GiST."* (NEW MEASURED finding NF-1.) This is the highest-impact new finding from Phase 2 and naturally belongs in the index-gaps issue.

### Issue 8 — `[DISCOVER][MAP][P2] Decide map rendering strategy at 10k→1M`
**Recommendation: WAIT.**
**Rationale:** Architecture-spike issue. Depends on synthetic seed + viewport-required (Issue 4). No value created until those measurements exist.

### Optional Issue 9 — `[DISCOVER][OBSERVABILITY][P3] Micrometer + pg_stat_statements + structured logging`
**Recommendation: REVISE.**
**Suggested deltas:**
- Body now says *"`pg_stat_statements` extension is INSTALLED (v1.11) — only Micrometer `@Timed`, `auto_explain`, and structured JSON logging remain."* The pg_stat_statements line item is already done.
- This issue becomes higher-value than Phase 1 priced it. With `pg_stat_statements` already available, adding a one-line `auto_explain.log_min_duration_statement=500ms` setting on Supabase + a periodic snapshot of `pg_stat_statements_info` would convert most current STATIC_CODE_RISK / PROJECTION findings to measured-in-production within a week. Promote to P1 (was P3).

### New issue surfaced by Phase 2 (not in Phase 1 §11) — backend-only, measurement-backed

**Suggested new issue:** `[DISCOVER][PERF][P0] /api/public/schools/nearby Seq Scans schools — replace recomputed point with stored s.geog`
- **Body:** `SchoolRepository.findNearbySchools` (`SchoolRepository.java:79-88`) uses `ST_DWithin(ST_Point(s.longitude, s.latitude)::geography, ...)` which is a recomputed expression and cannot use the existing `idx_schools_geog` GiST index. EP-10 EXPLAIN shows **Seq Scan + Filter** on schools (293 rows removed of 294). Change to `ST_DWithin(s.geog, ST_MakePoint(?, ?)::geography, ?)` — identical semantics; uses index.
- **Effort:** S.
- **Acceptance:** Re-run EP-10 EXPLAIN — confirm `Index Scan using idx_schools_geog` replaces Seq Scan; execution time at 294 rows drops from ~83 ms to sub-millisecond.
- **Backed by:** MEASURED evidence (EP-10 plan). Does NOT depend on browser HAR.
- **Note:** Could be merged into the revised Issue 7 above as a third sub-item.

### Outstanding measurement work (separate follow-up if still needed)

**Browser HAR / Playwright trace baseline for the 8 Discover journey states remains OUTSTANDING.** A separate follow-up should be created **only if** the user still wants browser-level waterfall evidence:
- For S5 + S6 (anonymous-feasible): manual Chrome DevTools HAR capture, no code change required. Drop `.har` files into `docs/audit/evidence/har/`.
- For S1–S4 + S7 (auth-gated): seed test broker + JWT first, then capture as above.
- For S8 (Back/Forward): browser session traversal across S1–S7.

This is intentionally **not** drafted as a third Phase 2 follow-up issue in this PR — its priority depends on whether the user wants the static Phase 1 evidence to be sufficient for FE follow-ups (in which case the WAIT recommendations above flip to CREATE) or wants measurement first (in which case browser HAR is the prerequisite).

---

## 7. AC coverage table

| AC | Status | Evidence |
|---|---|---|
| AC1 — runtime baseline doc created | DONE | this file |
| AC2 — backend EXPLAIN evidence for all feasible paths; blockers documented | DONE | §3 + 15 EP files under `docs/audit/evidence/explain/` |
| AC3 — frontend HAR / Playwright trace for journey states | **PARTIAL** | Public endpoint timing captured for anonymous-feasible endpoints (§4 + `endpoint-summary.txt`). **Browser HAR / Playwright trace NOT_MEASURED for all S1–S8.** Two BLOCKERS documented (§4.2 JWT requirement; §4.3 browser HAR not captured) with smallest-unblock paths. Path B reframe per ChatGPT WORKDONE_REVIEW. |
| AC4 — Phase 1 findings re-labelled | DONE | §5 |
| AC5 — recommendation per Phase 1 §11 follow-ups + new finding | DONE (with WAIT verdicts on waterfall-dependent FE follow-ups) | §6 |
| AC6 — no source/test/migration/config/data changes | DONE | only `docs/audit/evidence/**` modified; `.claude/handoffs/issue-1061/**` is gitignored audit trail |
| AC7 — WORKDONE_REVIEW submitted (this is rev 2 after Path B reframe) | in progress | — |
| AC8 — Opus-only | DONE | main agent only; no sub-agents invoked |

---

## 8. Honesty / blocker summary (per ChatGPT WORKDONE_REVIEW Path B reframe)

- **Auth blocker for S1–S4, S7 (BLOCKER 1)** — documented in §4.2. Cites JwtConfig.java:32-66; curl 401 evidence in `endpoint-summary.txt`.
- **Browser HAR / Playwright trace not captured (BLOCKER 2)** — documented in §4.3. Affects ALL S1–S8 browser-level waterfall evidence. The curl-driven endpoint timing is **NOT** a substitute for browser HAR.
- **Dataset blocker for cliff-confirmation** — §1 names 13 visible rows; all aggregate-scan / unbounded-marker projections labelled NOT_DISPROVED rather than CONFIRMED. Synthetic 10k/100k probe remains outstanding.
- **No PII in committed artefacts.** EXPLAIN VERBOSE Output blocks contain column references only, no row values. Bbox / lat-lon literals are public coordinates. No DB credentials. No cookies / Authorization headers / session tokens in `endpoint-summary.txt`.
- **No Playwright capture script created.** Method B remains DEFERRED per the PLAN_REVIEW approval; reaffirmed by Path B.
- **Method A (manual DevTools HAR) was not executed.** This is the gap that triggered NEEDS_FIXES and the Path B reframe. Documented as BLOCKER 2.
- **No GitHub follow-up issues created.** Recommendations in §6 are advisory only.
- **Frontend implementation follow-ups depending on waterfall evidence (Issues 1, 3 from Phase 1 §11) are marked WAIT.** Backend-only / measurement-backed follow-ups (Issue 6, revised Issue 7, new schools/nearby fix) remain CREATE.
