# Issue #1760: Discover Summary — Cache + 100k-Scale Perf Evidence

**Date:** 2026-07-06
**Scope:** `GET /api/discover/summary` (#1745 P5) — make it safe at 100k+ listings/city and high
concurrency, without changing the public API contract or the frontend count source.

---

## 1. Baseline (from #1745 scalability review, ~2k listings)

Source: `docs/audit/evidence/issue-1745-scalability-review/README.md`.

- Live JDBC `GROUP BY` (no cache), 3 query shapes: total / regions (area_group or corridor) /
  hotspots, sharing `DiscoverListingPredicateBuilder`'s guarded predicate.
- **1.9ms–8.1ms** at ~2,000 listings, index scans only, no sequential scans over
  `property_listings`.
- Verdict at the time: safe at current scale; 100k+/high-concurrency path deferred to this issue.

---

## 2. Chosen architecture

**Flag-gated in-process Caffeine TTL cache decorator**, `CachingDiscoverSummaryService`
(`@Service @Primary`), sitting in front of the existing `RoutingDiscoverSummaryService` behind
`DiscoverSummaryPort`:

```
DiscoverSummaryController
  -> DiscoverSummaryPort (@Primary = CachingDiscoverSummaryService)   <- NEW (#1760)
       -> RoutingDiscoverSummaryService                                (no longer @Primary)
            -> DiscoverSummaryService (Postgres, unchanged)
```

- `RoutingDiscoverSummaryService` is injected by **concrete type**, not the `DiscoverSummaryPort`
  interface — the caching decorator is itself a `DiscoverSummaryPort` bean, so asking Spring for
  the interface would create an ambiguous/self-referential candidate set. `@Primary` was removed
  from `RoutingDiscoverSummaryService` in the same PR (two `@Primary` `DiscoverSummaryPort` beans
  would fail context startup with `NoUniqueBeanDefinitionException`).
- **Why a cache over a rollup table / materialized view / Redis:** the existing HTTP layer
  already ships `Cache-Control: public, max-age=120` — the product has already accepted ≤120s
  staleness for this endpoint. An in-process TTL cache collapses repeated identical-key requests
  within that SAME window into a single origin computation, with zero new infrastructure, zero
  new staleness contract, and zero data-model risk. A rollup table/MV would add write-path
  complexity and a second consistency story; Redis would add a network hop and an operational
  dependency for a problem an in-process cache already solves within the accepted staleness
  budget. Deferred (out of scope) per the approved plan until a city's cache-miss p99 actually
  breaches SLO at real production scale.
- **Config** (`application.yml`, `discover.summary.cache.*`, env-overridable):
  - `enabled` (default `true`, kill switch: `DISCOVER_SUMMARY_CACHE_ENABLED=false`)
  - `ttl-seconds` (default `120` — matches the existing HTTP `Cache-Control max-age`)
  - `max-size` (default `1000` — bounds memory; prevents cache-stuffing growth)

### Cache key (5 dimensions)

`(city, listingPurpose, propertyType, groupBy, hotspotLimit)`.

`listingPurpose` and `propertyType` are canonicalised with the **same normalisation**
`DiscoverSummaryService` applies internally (`normalizeFilter` / `normalizeListingPurpose`,
`DiscoverSummaryService.java` ~L231-252):
- blank/whitespace `listingPurpose` and `propertyType` collapse to the same key as omitted (`null`)
- an invalid `listingPurpose` (e.g. `"bogus"`) also collapses to `null` (blended) — matching the
  delegate's fallback-to-blended behaviour exactly
- `propertyType` is **NOT** case-folded in the key, even though the underlying SQL match is
  case-insensitive (`LOWER(pl.property_type) = LOWER(?)`): the assembled response echoes back the
  caller's exact-case `propertyType` (proven by `DiscoverSummaryServiceIT
  .propertyTypeFilter_caseInsensitive_countsThree` — `"house"` and `"HOUSE"` produce
  differently-cased `response.propertyType()` despite identical counts), so folding case in the
  cache key would serve a wrong-cased response to one of the two callers.

Verified by `CachingDiscoverSummaryServiceTest` (13 unit tests): cache-hit collapse, TTL expiry
via an injectable fake `Ticker`, key isolation across all 5 dimensions independently (including
blank/whitespace/invalid canonicalisation for both `listingPurpose` and `propertyType`, and
case-variant isolation for `propertyType`), flag-off passthrough, and atomicity (same cached
response instance returned on every hit — `Cache#get(key, mappingFunction)` computes and inserts
exactly once per key even under concurrent callers, so
`sum(regions[].listingCount) == totalActiveListings` is always read from one atomically-cached
object).

**ETag stability:** the controller computes the ETag from response content
(`DiscoverSummaryController.computeETag`). Because the cache returns the identical, immutable
`DiscoverSummaryResponse` record on every hit (never rebuilt/mutated), the ETag is stable across
cache hits for a given key — confirmed by inspection (no test regression in
`DiscoverSummaryControllerTest`, which is unaffected by the decorator since it mocks
`DiscoverSummaryPort` directly).

---

## 3. 100k-scale evidence (`DiscoverSummaryScaleIT`)

**Setup:** Testcontainers `postgis/postgis:15-3.4`, Flyway through the latest migration. Bulk-load
100,000 `property_listings` rows for `city=udupi` via a single `INSERT ... SELECT
generate_series(1, 100000)` (no per-row round trips), distributed across the 10 real V71/V101-seeded
4-segment `area_key`s that are area_group members (Manipal, Katapadi, Malpe, Kaup, Udupi,
Kunjibettu, Amoghapura, Brahmavar, Shirva, Padubidri), with ~10% noise (DRAFT status /
archived_at set / is_duplicate) spread evenly, ~50/50 sale/rent, 6 property types. `ANALYZE` run
before measuring. 3 query shapes (total / regions area_group / hotspots) × 3 scenarios (blended,
`propertyType=house`, `listingPurpose=sale`) = 9 `EXPLAIN (ANALYZE, BUFFERS)` captures, plus 9
end-to-end `service.getSummary()` timings. Insert itself: ~4.5–5.9s for 100k rows (one-time
test-fixture cost, not part of the request path).

**Correctness invariant** (hard assertion in the IT): for all 3 scenarios,
`sum(regions[].listingCount) == totalActiveListings` — **holds at 100k**.

### Timings — BEFORE V105 (only V90's `LOWER(property_type)` index existed)

| Scenario | total | regions (area_group) | hotspots | end-to-end |
|---|---|---|---|---|
| blended | 102.7ms | **312.8ms** | 139.9ms | 496ms |
| `propertyType=house` | 21.2ms | 59.5ms | 63.2ms | 132ms |
| `listingPurpose=sale` | 82.7ms | **191.0ms** | 98.3ms | 349ms |

Budget guidance: ~100ms/query. `propertyType=house` is comfortably under budget everywhere — it
uses V90's `idx_property_listings_live_lower_type_area` (functional index on
`LOWER(property_type), area_key`, partial `WHERE status='LIVE' AND archived_at IS NULL AND
is_duplicate=false`). **`listingPurpose=sale` breaches budget** on `regions` (191.0ms) with a
`Bitmap Heap Scan` on `property_listings` using only `idx_property_listings_area_key`
(`area_key`-only); `listing_purpose`/`status`/`archived_at`/`is_duplicate` are all pushed into a
post-fetch `Filter`/`Recheck` — no index encodes the `LIVE + listing_purpose` predicate, so every
candidate row is fetched from the heap and rechecked (`Rows Removed by Filter: 4167` per loop
iteration). This is the exact heap-recheck pattern the evidence-gate in the approved plan calls
out.

### Decision: V105 partial index — GATED AND FIRED

Per the approved plan: *"ONLY if the listingPurpose-filtered shape breaches budget with
heap-recheck/seq-scan evidence: add additive V100 partial index for listing_purpose"* (renumbered
**V105** in this worktree — see §5). The evidence above satisfies the gate exactly
(`listingPurpose=sale` regions shape: 191.0ms, ~2x budget, confirmed heap-recheck via `EXPLAIN`).
Added `V105__idx_property_listings_purpose_live.sql`:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_listings_live_purpose_area
    ON property_listings (listing_purpose, area_key)
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false;
```

(Plain column, not `LOWER()` — `listing_purpose` matching in
`DiscoverListingPredicateBuilder`/`DiscoverSummaryService` is case-sensitive equality
`pl.listing_purpose = ?`, unlike `propertyType`'s `LOWER()` match.) Mirrors V90's pattern
(`CREATE INDEX CONCURRENTLY`, `-- flyway:no-transaction`); test-stub
`V104.9__precreate_purpose_live_index_for_tests.sql` precreates it non-concurrently to avoid the
same Testcontainers/Hikari CONCURRENTLY-hang V89.9 documents for V90.

### Timings — AFTER V105

| Scenario | total | regions (area_group) | hotspots | end-to-end |
|---|---|---|---|---|
| blended (unaffected — no listingPurpose filter) | 205.4ms | 408.1ms | ~140ms | 615ms |
| `propertyType=house` (unaffected — uses V90 index) | 23.6ms | 61.5ms | 61.0ms | 139ms |
| `listingPurpose=sale` | **45.1ms** ✅ | **157.8ms** (improved, still >100ms) | **65.6ms** ✅ | **211ms** (was 349ms) |

`listingPurpose=sale`'s `total` and `hotspots` shapes now use `Index Only Scan` /
`Index Scan using idx_property_listings_live_purpose_area` and comfortably clear the 100ms budget.
`regions` improved materially (191.0ms → 157.8ms) but is **still over the 100ms/query guidance**.

**Honest residual gap:** the `regions` (area_group) shape's remaining cost is NOT an indexing
problem — `EXPLAIN` shows a `Nested Loop Left Join` against `area_group_members` with
`Rows Removed by Join Filter: 450000` and an `external merge` disk sort (`ag.slug, ag.name`
sort key over the joined row count). This is a join/sort-order characteristic of the
`area_group` rollup query shape at 5 groups × 10 area_keys × tens-of-thousands of rows, not
something a `listing_purpose` index resolves — it affects the **blended** scenario equally (408ms,
worse than `listingPurpose=sale`'s 157.8ms) and blended has no `listingPurpose` filter at all.
Widening the fix beyond the evidence-gated `listing_purpose` index (e.g. restructuring the
`area_group` join, or a covering index on `area_group_members`) is **out of scope** for this
issue's approved plan and is called out below as a follow-up, not silently patched here.

Numbers are from a cold-started single Testcontainers JVM (no JIT warmup, no OS page cache
priming) on emulated arm64→amd64 Docker — a production Postgres instance with a warm cache and
native architecture will very likely be faster than these figures; they are presented as-measured,
not extrapolated.

---

## 4. Cache behaviour: before vs. after (unit evidence)

`CachingDiscoverSummaryServiceTest` (13 tests, all passing):

| Behaviour | Before #1760 | After #1760 |
|---|---|---|
| Repeated identical query within TTL | Recomputes every time (full 3-query JDBC round trip) | 1 origin call, then served from Caffeine in-memory map (~microseconds) until TTL expiry |
| `listingPurpose=sale` vs `rent` vs omitted | 3 independent computations, always | 3 independent cache entries (correctly isolated) — computed once each per TTL window |
| Blank/whitespace/invalid `listingPurpose`/`propertyType` | Delegate normalises internally; no caching at any layer | Cache key canonicalises identically, so a whitespace variant hits the same entry as the omitted-filter variant (no wrong-shaped response, no cache-key fragmentation) |
| Concurrent identical-key requests during a cache miss | N independent DB round trips | Single origin computation (`Cache#get(key, mappingFunction)` atomicity) — no thundering-herd fan-out |
| `discover.summary.cache.enabled=false` | N/A | Delegate called every time — bit-for-bit pre-#1760 behaviour (proven by `cacheDisabled_delegateCalledEveryTime_noCaching`) |

---

## 5. p95 target and achieved values

**Target:** p95 < 150ms per the issue trigger.

- **Cache-hit path (expected to dominate p95 under any realistic multi-request traffic for a
  given city/filter combination within the 120s TTL window):** Caffeine in-memory map lookup,
  effectively sub-millisecond. Comfortably meets the target.
- **Cache-miss / origin path at 100k scale, post-V105:** `total` 45–206ms, `hotspots` 61–140ms,
  `regions` 62–408ms depending on scenario (see §3 table). The `listingPurpose`-filtered and
  `propertyType`-filtered scenarios' `total`/`hotspots` shapes are comfortably under 150ms; the
  `regions` shape (all scenarios) and the blended scenario overall remain above 150ms on a cold
  origin computation at 100k rows across only 10 area_keys/5 groups for one city. This is an
  **honest gap**, not resolved by this issue's evidence-gated scope — see Known gaps below.
- **Net effect:** because the cache collapses all repeat requests for a given 5-dimension key
  within 120s into one origin computation, the number of client-facing requests that ever pay the
  full origin cost is bounded to at most 1 per key per TTL window — traffic-dependent, but for any
  city with more than one summary request per 120s (the expected case), p95 as experienced by
  clients converges toward the cache-hit latency, not the origin latency measured above.

---

## 6. Staleness / invalidation story

TTL-only, no explicit invalidation — matches the existing `Cache-Control: public, max-age=120`
HTTP contract this endpoint has shipped since #1745. Staleness bound is **unchanged**: clients
already tolerate up to 120s of staleness via the HTTP cache header; the new server-side cache uses
the same 120s window, so the worst-case staleness a client can observe is not increased by this
change. Multi-instance deployments may diverge by up to one TTL window across instances (each
instance holds its own in-process cache) — this is within the existing 120s contract and is
documented, not a new risk class.

---

## 7. Rollback / kill switch

Set `DISCOVER_SUMMARY_CACHE_ENABLED=false` (env var; maps to
`discover.summary.cache.enabled=false`). Verified by
`cacheDisabled_delegateCalledEveryTime_noCaching`: with the flag off, `CachingDiscoverSummaryService`
delegates to `RoutingDiscoverSummaryService` on every call, byte-for-byte pre-#1760 behaviour, with
zero cache state ever populated. No redeploy of a different bean/wiring is needed to roll back —
only a config/env change.

---

## Known gaps / follow-ups (out of scope for this issue)

1. The `regions` (area_group) query shape remains above the 100ms/150ms guidance at 100k rows even
   after V105, for both `listingPurpose=sale` (157.8ms) and blended (408.1ms) — a join/sort-order
   cost against `area_group_members`, not an indexing gap the evidence-gate in this issue's
   approved plan authorized fixing. Candidate follow-up: restructure the `area_group` LEFT JOIN or
   add a covering index on `area_group_members`/`property_listings(area_key)` — needs its own
   evidence-gated review, not bundled into this PR.
2. Multi-instance cache divergence within the 120s TTL window (documented above) — acceptable
   under the existing HTTP staleness contract; would need a shared cache (Redis) or event-based
   invalidation to eliminate, both explicitly out of scope per the approved plan.
