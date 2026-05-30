# PostGIS Geo-Query Baseline — QP-1c and QP-3b at 1k / 10k / 100k

**Purpose:** Durable comparison baseline for PostGIS geospatial query paths.
Used later to compare Postgres/PostGIS against OpenSearch for the Discover read model.

**Issues:** #1299 (geog proof), #1297 (area_key fix), #1295 (original baseline)
**Date:** 2026-05-30
**Container:** `postgis/postgis:14-3.3` (localhost:5434, non-production)
**City slug:** `udupi`
**Generator:** `scripts/gen_perf_listings.py --seed=42`
**Harness:** `scripts/run_explain_harness.py`
**Raw EXPLAIN files:** `docs/audit/evidence/explain/live/postgis-1k/`, `postgis-10k/`, `postgis-100k/`

---

## Environment

| Item | Value |
|------|-------|
| PostgreSQL version | 14.23 (postgres:14 base) |
| PostGIS version | 3.3.4 |
| Host platform | Apple Silicon (ARM64) + Rosetta amd64 emulation |
| `pl.geog` column | `geography(Point,4326)` GENERATED ALWAYS AS STORED (V73 migration) |
| GiST index | `idx_property_listings_geog` — partial, `WHERE geog IS NOT NULL` |
| ANALYZE run | After each insert, before harness run |
| Timing caveat | Rosetta emulation inflates wall-clock vs native production; plan structure and index choice are the meaningful artefacts |

---

## Dataset Characteristics (all volumes, seed=42)

| Volume | geog non-null | Udupi area_key | Manipal | Mangaluru | Bengaluru | Kundapura |
|--------|---------------|----------------|---------|-----------|-----------|-----------|
| 1k     | 1000/1000     | 621 (62.1%)    | 111 (11.1%) | 91 (9.1%) | 90 (9.0%) | 87 (8.7%) |
| 10k    | 10000/10000   | 5999 (60.0%)   | 1004 (10.0%) | 1029 (10.3%) | 1011 (10.1%) | 957 (9.6%) |
| 100k   | 100000/100000 | 59840 (59.8%)  | 10121 (10.1%) | 9995 (10.0%) | 10128 (10.1%) | 9916 (9.9%) |

Area_key distribution is stable across volumes — no cross-cluster fallback, consistent with #1297 fix.

---

## QP-1c — Listings SELECT with school-radius (ST_DWithin)

Query: `ST_DWithin(pl.geog, ST_MakePoint(lon, lat)::geography, 2000)` — 2km radius around a fixed Udupi school point.

| Metric | 1k | 10k | 100k |
|--------|----|-----|------|
| Status | MEASURED | MEASURED | MEASURED |
| Execution time | 74.713 ms | 71.035 ms | 102.590 ms |
| Planning time | 25.513 ms | 22.530 ms | 25.522 ms |
| GiST index used? | No (status btree) | **Yes — BitmapAnd** | **Yes — BitmapAnd** |
| Indexes used | `idx_property_listings_status` | `idx_property_listings_geog` + `idx_property_listings_area_key` | `idx_property_listings_geog` + `idx_property_listings_area_key` |
| Rows passing geo+area filter | 38 | 517 | 5,175 |
| Rows removed by exact ST_DWithin | 962 (filter on status scan) | ~15/loop × 12 | ~141/loop × 12 |
| Rows returned | 20 | 20 | 20 |
| Sort memory | n/a | top-N heapsort 31kB | top-N heapsort 30kB |
| Sort spill to disk | n/a | No | No |

**Plan evolution:**

- **1k:** Status btree index scan + ST_DWithin post-filter. Planner prefers full status-index sweep over GiST probe because at 1k the dataset is small enough that a full scan is cheaper than a spatial index setup.
- **10k:** Switches to `BitmapAnd(idx_property_listings_geog, idx_property_listings_area_key)`. The GiST index probes the bounding box of the 2km radius circle (`_st_expand`) to narrow candidates before the exact `ST_DWithin` recheck in the heap scan.
- **100k:** Same BitmapAnd plan. GiST probe returns ~6,867 bbox candidates per area loop; exact ST_DWithin removes ~141/loop; 5,175 rows survive total. Plan structure is stable.

---

## QP-3b — Markers with bbox (`&&` operator)

Query: `pl.geog && ST_MakeEnvelope(west, south, east, north, 4326)::geography` — Udupi core bbox.

| Metric | 1k | 10k | 100k |
|--------|----|-----|------|
| Status | MEASURED | MEASURED | MEASURED |
| Execution time | 3.146 ms | 9.168 ms | 40.401 ms |
| Planning time | 21.359 ms | 21.765 ms | 21.476 ms |
| GiST index used? | **Yes — direct** | **Yes — BitmapAnd** | **Yes — BitmapAnd** |
| Indexes used | `idx_property_listings_geog` | `idx_property_listings_geog` + `idx_property_listings_area_key` | `idx_property_listings_geog` + `idx_property_listings_area_key` |
| Rows matching bbox + area filter | 91 | 1,047 | 10,601 |
| Rows returned | 91 (< 1001 sentinel) | 1,001 (LIMIT sentinel hit) | 1,001 (LIMIT sentinel hit) |
| Sort memory | quicksort 35kB | quicksort 160kB | top-N heapsort 226kB |
| Sort spill to disk | No | No | No |

**Plan evolution:**

- **1k:** Direct GiST Index Scan — 91 markers fall within the bbox, LIMIT 1001 not reached.
- **10k:** BitmapAnd plan. 1,047 markers qualify, LIMIT 1001 sentinel is hit — clients receive the overflow hint. 160kB sort stays in memory.
- **100k:** Same BitmapAnd plan. 10,601 markers qualify; 1,001 returned after top-N heapsort (226kB, no disk spill). The "too many markers" sentinel is definitively triggered — clients should show a density heatmap rather than individual pins at this scale.

---

## Scaling Summary

| Query | 1k→10k growth | 10k→100k growth | Notes |
|-------|--------------|-----------------|-------|
| QP-1c exec time | 74.7ms → 71.0ms (≈flat) | 71.0ms → 102.6ms (+44%) | Planning overhead dominates at low volumes; near-linear data cost 10k→100k |
| QP-3b exec time | 3.1ms → 9.2ms (3×) | 9.2ms → 40.4ms (4.4×) | Scales super-linearly due to growing bbox match set + sort; marker density drives cost |
| QP-1c rows scanned | 38 | 517 | 5,175 | Linear with dataset — radius stays fixed, more candidates in bbox |
| QP-3b bbox matches | 91 | 1,047 | 10,601 | ~10× per decade as expected |

---

## Interpretation

### What 1k proved

The PostGIS environment is correctly set up: `postgis:14-3.3` image, V73 migration applied, `pl.geog` generated column non-null on all inserted rows, `perf_db_apply_geog.sql` idempotent. QP-1c and QP-3b both return real rows with no `DATA_GAP`. This resolves the ENV-BLOCKED gap from the original #1295 baseline.

The 1k planner choice (status btree for QP-1c) is a dataset-size artifact, not a schema problem. The GiST index exists and is used by QP-3b even at 1k.

### What 10k proved

The planner switches to GiST for both queries at 10k after `ANALYZE`. `BitmapAnd(idx_property_listings_geog, idx_property_listings_area_key)` is the stable plan shape that combines spatial and relational filters efficiently. This is the intended production index path. The sort stays in memory; no disk spill.

### What 100k proved

GiST holds as the primary access path at 100k. The BitmapAnd plan structure is identical to 10k — the planner does not regress. Memory usage stays well under shared_buffers limits (largest sort: 226kB for QP-3b). No spills, no sequential scans.

QP-3b at 100k definitively confirms the "too many markers" scenario (~10,601 matching markers, LIMIT 1001 sentinel always hit). This is expected product behaviour at city scale — the frontend should render a density layer, not individual pins.

QP-1c at 100k (102ms) is slow relative to the product's latency target, but ~25ms of that is planning overhead and an unknown amount is Rosetta emulation. The GiST index is correctly engaged; the remaining execution cost (heap fetches across 5,175 qualifying rows) is inherent to cross-area school-radius queries without a covering index.

### Is PostGIS acceptable as a short-term baseline?

**Yes, for the current Udupi production scale.** At real production volumes (likely 1k–10k LIVE listings initially), QP-1c runs in 71–75ms and QP-3b in 3–9ms with GiST indexes engaged. Both are within a single server round-trip budget for non-interactive map operations.

The 100k numbers show the ceiling: QP-3b at 40ms and QP-1c at 102ms are marginal but not catastrophic — production would benefit from caching the aggregates (QP-5/QP-2, already recommended in the main baseline) before the spatial queries become the bottleneck.

### Why these numbers are still useful if OpenSearch becomes the main read model

The PostGIS baseline serves three roles when OpenSearch is introduced:

1. **Regression threshold:** If OpenSearch QP-1c/QP-3b latency exceeds these numbers at equal scale, PostGIS was better and the migration needs justification beyond latency.
2. **Fallback SLA:** If OpenSearch is unavailable, the product can fall back to PostGIS. These numbers define the fallback behaviour.
3. **Index verification:** The BitmapAnd GiST plan at 10k/100k confirms that V73 + `idx_property_listings_geog` are correctly deployed. OpenSearch geo queries should be validated against the same fixed school point and bbox used here.

### What should be measured next in #1249

#1249 (metrics/observability) should instrument these specific paths in production:

- **p50/p99 of `/api/discover/markers`** — the endpoint that drives QP-3b; 100k baseline shows this is the first to show marker-density pressure.
- **p50/p99 of school-radius listing queries** — maps to QP-1c; 100k shows ~100ms at emulated scale; production native hardware may be 30–50ms.
- **Cache hit rate for QP-5 / QP-2 / QP-1a** — already recommended in main baseline as the primary cache candidates; confirm in production before adding index work.
- **`EXPLAIN (ANALYZE, BUFFERS)` samples in production** — one per path per week at first, to catch plan regression as row count grows.

---

## Cleanup

| Volume | Rows generated | Cleanup result |
|--------|---------------|----------------|
| 1k | 1,000 | Deleted — 0 PERF rows remaining |
| 10k | 10,000 | Deleted — 0 PERF rows remaining |
| 100k | 100,000 | Deleted — 0 PERF rows remaining |

All `[PERF]`-tagged rows removed after each harness run. The non-production `perf-pg` container (`postgis/postgis:14-3.3`) remains running for future runs; it holds no application data.
