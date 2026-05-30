# Discover Query Baseline — Postgres

**Dataset:** 10k synthetic `[PERF]`-tagged rows (seed=42)
**DB:** localhost:5434 (non-production Docker, PostgreSQL 14.23)
**Migrations applied:** 81 (V1–V80, V65 absent)
**Harness city slug:** `bangalore` (see Known Limitations §b — generator area_key bug routed PERF rows here, not `udupi`)
**Harness run:** 2026-05-29
**Evidence files:** `docs/audit/evidence/explain/live/10k/*.txt`

---

## Summary Table

| Query ID | Description | Planning (ms) | Execution (ms) | Top Plan Node | Index Used | Actual Rows | Status |
|----------|-------------|---------------|----------------|---------------|------------|-------------|--------|
| QP-1a | Listings COUNT (city only) | 0.792 | 4.252 | Aggregate → Nested Loop × 10 | idx_property_listings_area_key (Index Scan) | 8,971 | MEASURED |
| QP-1b | Listings SELECT page + lateral hero-image | 0.392 | 5.624 | Limit → top-N heapsort → Nested Loop × 10 | idx_property_listings_area_key (Index Scan) | 8,971 scanned; 20 returned | MEASURED |
| QP-1c | Listings SELECT with school-radius (ST_DWithin) | N/A | N/A | — | — | N/A | DATA_GAP — `pl.geog` column absent from schema |
| QP-1d | Listings SELECT with FTS keyword | 3.599 | 3.437 | Limit → top-N heapsort → Nested Loop × 10 | idx_property_listings_area_key (Index Scan); FTS applied as row filter — GIN NOT used in access path | 322 matched area+FTS filter; 20 returned to caller | MEASURED |
| QP-2 | Aggregates GROUP BY locality | 0.225 | 8.154 | Limit → Sort → GroupAggregate → Nested Loop × 10 | idx_property_listings_area_key (Index Scan) | 8,971 sorted; 11 locality groups produced; 6 returned to caller (LIMIT 6) | MEASURED |
| QP-3a | Markers city-only (LIMIT 1001) | 0.193 | 5.717 | Limit → top-N heapsort (230 kB) → Nested Loop × 10 | idx_property_listings_area_key (Index Scan) | 8,971 scanned; 1,001 returned | MEASURED |
| QP-3b | Markers with bbox (`&&` operator) | N/A | N/A | — | — | N/A | DATA_GAP — `pl.geog` column absent from schema |
| QP-5 | City-area listings (ROW_NUMBER PARTITION BY area_key) | 0.284 | 17.130 | Subquery Scan → WindowAgg → Sort 2,716 kB → Nested Loop × 10 | idx_property_listings_area_key (Index Scan) | 8,971 sorted; 8,961 discarded; 10 returned | MEASURED |

---

## Key Findings

### Finding 1 — Planner row-estimate failure (all 6 measured paths)

Every plan estimated ~5 rows where 8,971 actually qualified. Root cause: the `areas` table statistics show an estimated 460 rows but the actual count is 37, inflating the planner's denominator for per-area cardinality. The per-area estimate (~22 rows × 1 estimated area match = ~22 total) is ~400× lower than the 8,971 actual. The planner chose strategies suited to a 5-row result (Index Scan in a Nested Loop) that happen to be correct at 10k scale. At 100k+ scale the bad estimate may cause the planner to persist with Index Scan past the point where a Seq Scan or Bitmap Heap Scan would be faster.

### Finding 2 — QP-5 (window query) is the dominant bottleneck at 17.1 ms

The `ROW_NUMBER() OVER (PARTITION BY area_key ORDER BY created_at DESC)` pattern requires a full sort of every qualifying row before the window function can emit results. At 8,971 rows: quicksort consumed 2,716 kB of memory and ~13 of the 17.1 ms total execution time (Sort node actual: 12.768–13.263 ms). The outer subquery filter then discards 8,961 of 8,971 rows (keeping `rn <= 5` per area). No composite index on `(area_key, created_at DESC)` exists to avoid this sort. At 100k rows the sort will likely spill to disk. This is the single strongest caching candidate.

### Finding 3 — QP-2 (aggregates) costs 8.2 ms with 805 kB sort, recomputed every request

`GROUP BY locality` requires a full sort of 8,971 rows (quicksort, 805 kB) as input to `GroupAggregate`. The Sort node alone accounts for ~7 of the 8.154 ms (Sort node actual time: 7.016–7.432 ms on 8,971 rows). The output is 6 locality groups — a small, stable result recomputed from scratch on every API call. No index on locality supports a pre-sorted scan to avoid this sort. Second-strongest caching candidate, naturally co-locates with QP-1a.

### Finding 4 — QP-3a (markers) sorts 8,971 rows for every request, always overflows the 1,001 sentinel

`ORDER BY pl.id LIMIT 1001` over 8,971 candidates forces a top-N heapsort (230 kB). `pl.id` is a UUID (random order) so no index walk delivers rows in id order with the area_key compound filter already applied. At 8,971 qualifying rows the LIMIT 1,001 sentinel is always exceeded, meaning the client always receives the overflow hint — yet the full 8,971-row sort is paid in full on every request to discover this fact. At 100k rows this becomes the dominant per-request cost for the markers endpoint.

### Finding 5 — QP-1d (FTS): GIN index not used; FTS applied as row filter; planning overhead equals execution

The planner chose `idx_property_listings_area_key` Index Scan and applied the FTS predicate as a post-scan row filter (visible as `Filter: ... AND (search_vector @@ '...')`, `Rows Removed by Filter: 865` per loop, across 10 loops = 8,650 rows filtered). The GIN index `idx_property_listings_search_vector` was not used in the access path. Additionally, planning time (3.599 ms) exceeded execution time (3.437 ms) — the planner spends more time choosing a plan than running it. At higher volumes, the row-filter approach degrades faster than a GIN bitmap approach; fixing statistics or adding a composite index may unlock the GIN path.

### Finding 6 — QP-1a (COUNT) scans full qualifying set at 4.25 ms; no shortcut

`COUNT(*)` drives the full 8,971-row Nested Loop — there is no covering index that allows count without fetching rows. At 10k this is 4.25 ms; it scales linearly with qualifying row count unless a dedicated counter or covering index is introduced. Called alongside QP-2 on every Discover page load, caching both together is the natural fix.

### Finding 7 — QP-1b lateral hero-image cost currently understated

The lateral `SubPlan 1` (hero-image per returned row) executed 20 times and returned 0 images each time — `listing_images` is empty. Each lookup used `idx_listing_images_listing_position` (correct index, ~0.001 ms). With real images the cost per page request will be 20 × one index seek. The structural cost is real but not quantified in this baseline.

---

## Per-Path Bottleneck Summary

| Path | Bottleneck | Evidence |
|------|-----------|----------|
| QP-1a (COUNT) | Full Nested Loop over 8,971 rows for COUNT(*) — no shortcut; 4.25 ms | QP-1a.txt: Nested Loop rows=8971; Execution 4.252 ms |
| QP-1b (page) | Sort over 8,971 rows (top-N heapsort 31 kB) to extract 20; lateral cost understated (listing_images empty) | QP-1b.txt: Sort "top-N heapsort Memory: 31kB"; SubPlan 1 rows=0 |
| QP-1c (radius) | DATA_GAP — `pl.geog` absent | Parse error at harness; no .txt written |
| QP-1d (FTS) | GIN bypassed; FTS as row filter (865 removed/loop × 10 = 8,650 total); 322 rows survive area+FTS filter; 20 returned to caller; planning time ≥ execution | QP-1d.txt: Nested Loop rows=322; "Rows Removed by Filter: 865"; Limit rows=20; Planning 3.599 ms vs Exec 3.437 ms |
| QP-2 (aggregates) | Full sort of 8,971 rows (quicksort 805 kB) for GROUP BY; 7 of 8.2 ms in Sort node; recomputed every request | QP-2.txt: Sort "quicksort Memory: 805kB"; Execution 8.154 ms |
| QP-3a (markers) | top-N heapsort (230 kB) over 8,971 rows for ORDER BY pl.id; always exceeds 1,001 sentinel at this scale | QP-3a.txt: Sort "top-N heapsort Memory: 230kB"; Execution 5.717 ms |
| QP-3b (bbox) | DATA_GAP — `pl.geog` absent | Parse error at harness; no .txt written |
| QP-5 (window) | Full sort of 8,971 rows (quicksort 2,716 kB) for WindowAgg; 8,961 rows discarded after window; 17.1 ms | QP-5.txt: Sort "quicksort Memory: 2716kB"; Execution 17.130 ms |

---

## Recommendation

**Next priority: #1248 (application-layer cache), targeting QP-5 and QP-2 first.**

Rationale grounded in the 6 measured plans:

**QP-5 (17.1 ms)** and **QP-2 (8.2 ms)** are the two most expensive paths. Both share the same properties that make caching effective: small output (10 rows and 6 rows respectively), pure read aggregations with no side effects, and outputs that are stable within a city between listing mutations. A short-TTL cache (30–60 seconds per city slug) eliminates the dominant sort costs on every Discover page load. **QP-1a (COUNT, 4.25 ms)** co-locates with QP-2 as a per-city aggregate and should be cached in the same entry.

Together, caching QP-5 + QP-2 + QP-1a removes 17.1 + 8.2 + 4.3 = ~29.6 ms of per-request DB work on the hot Discover path (assuming these queries execute serially on the same request; actual per-user-request saving depends on whether the Discover endpoints issue them serially or concurrently — concurrent execution would reduce the wall-clock saving to the slowest uncached path, not the sum).

**#1249 (metrics/observability)** is the right second step — instrument p50/p99 latency per query path in production before investing in backend index changes. The 10k baseline alone cannot predict production behaviour at real traffic volumes; observability data will confirm whether cache hit rates are sufficient or whether additional index work is needed.

**Backend query/index changes** are third priority: stale planner statistics (Finding 1) self-correct with periodic ANALYZE; the GIN bypass for FTS (Finding 5) needs a statistics fix or a composite index on `(area_key, search_vector)` before it surfaces as a regression at scale. Neither is urgent at 10k rows.

**A 100k/1M re-run is warranted** after two prerequisites: (a) fix the generator area_key bug (Known Limitations §b) so PERF rows land in the target city; (b) resolve the `pl.geog` DATA_GAP (Known Limitations §a) so QP-1c/QP-3b can be measured. At 100k rows the QP-5 sort (2,716 kB at 10k) will likely spill to disk, QP-3a will require a strategy change, and the FTS plan will shift — none visible at 10k.

---

## Known Limitations

**(a) `pl.geog` DATA_GAP — QP-1c and QP-3b cannot be measured.**
`property_listings` has no PostGIS geography column named `geog` despite 81 migrations applied. The harness SQL (sourced from `DiscoverListingPredicateBuilder.java`, issue #1246) references `pl.geog` for `ST_DWithin` (school-radius) and `&&` (bbox). Two possible root causes: (1) a `geog` migration exists in the backend source but was not applied to this Docker DB; (2) the harness SQL is stale and production uses an inline expression (`ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography`) rather than a stored column. Existing indexes use btree on (latitude, longitude), not GiST on geography. This discrepancy needs investigation before the spatial paths can be baselined. File as a follow-up against the harness or the DB setup.

**(b) Generator area_key bug — baseline measured under city-slug=`bangalore`, not `udupi`.**
`gen_perf_listings.py`'s `_load_area_keys()` queries `SELECT area_key FROM areas LIMIT 20`. In this DB's natural sort order the first 20 rows are Bengaluru/Mangalore keys; Udupi keys appear later. The `_pick()` fallback assigned non-Udupi keys to all clusters: 8,971 PERF rows landed under `c.slug='bangalore'`, 1,029 under `mangalore`, 0 under `udupi`. The harness was run with `--city-slug=bangalore` to obtain real measurements. Query plans are representative (same schema, same indexes, same join shape); absolute timings are specific to this 8,971-row dataset. Fix: use an `ORDER BY` or city-scoped area_key lookup instead of `LIMIT 20`. File as a follow-up against `gen_perf_listings.py`.

**(c) `listing_images` not seeded — QP-1b/QP-1d lateral hero-image cost understated.**
The generator does not insert rows into `listing_images`. The lateral subquery in QP-1b and QP-1d found 0 images on every lookup. Production cost per page will be 20 × one index seek via `idx_listing_images_listing_position`. The structural cost is real but not quantified in this baseline.

**(d) Stale planner statistics.**
No `ANALYZE` was run after the 10k insert. `areas` shows estimated 460 rows vs actual 37; all 6 plans underestimated qualifying rows by ~400×. The chosen strategies were correct at 10k scale but plan stability at 100k+ is not guaranteed without accurate statistics. Before any 100k/1M re-run, `ANALYZE property_listings, areas;` must be executed immediately after the generator insert and before the harness, so stale-statistics plan-choice masking does not carry over into the higher-volume results.

---

## Data Coverage Probe Results

Raw evidence: `docs/audit/evidence/explain/live/10k/data-coverage-probe.txt`

The post-cleanup `COUNT(*)=0` assertion and the `pl.geog` / `listing_images` probes were captured live and are in that file. The city-distribution figures below were observed during the fix-cycle-1 harness run against the live 10k dataset; the dataset was subsequently cleaned up and cannot be re-queried, but the observations are recorded verbatim in the evidence file.

| Probe | Result | Source |
|-------|--------|--------|
| City distribution of PERF rows | `bangalore`: 8,971 / `mangalore`: 1,029 / `udupi`: 0 | Observed fix-cycle-1 run; recorded in data-coverage-probe.txt |
| PERF rows matching BASE_WHERE (`bangalore`) | 8,971 | Observed fix-cycle-1 run; recorded in data-coverage-probe.txt |
| `pl.geog` column existence | Absent (ERROR on probe) | data-coverage-probe.txt — live capture |
| `listing_images` rows | 0 | data-coverage-probe.txt — live capture |
| PERF rows remaining after cleanup | 0 | data-coverage-probe.txt — live capture (fix-cycle-2) |

---

## Follow-up Proof — PostGIS Geog Baseline (Issue #1299)

**Date:** 2026-05-30
**Container:** `postgis/postgis:14-3.3` (port 5434, non-production, Rosetta/amd64 on Apple Silicon)
**Dataset:** 1k synthetic `[PERF]`-tagged rows (seed=42)
**City slug:** `udupi`
**Evidence files:** `docs/audit/evidence/explain/live/postgis-1k/QP-1c.txt`, `QP-3b.txt`

This section closes the two DATA_GAP entries from the original baseline (Known Limitations §a and §b).
Both gaps are now resolved: the `pl.geog` column is confirmed present and populated, and area_key
distribution is correct after the #1297 fix.

### Setup commands

```bash
# 1. Start PostGIS-enabled container
docker run -d --name perf-pg -e POSTGRES_PASSWORD=perf -p 5434:5432 postgis/postgis:14-3.3

# 2. Apply all migrations (V0–V80) with V73 placeholder substituted
for f in $(ls -v backend/src/main/resources/db/migration/V*.sql); do
  sed 's/\${concurrently_keyword}/CONCURRENTLY /g' "$f" | psql "$PERF_DB_URL"
done

# 3. Insert test broker profile (plain postgres — no Supabase auth roles)
psql "$PERF_DB_URL" -c "INSERT INTO profiles (user_id, email) VALUES ('00000000-0000-0000-0000-000000000001', 'perf@test.local') ON CONFLICT (user_id) DO NOTHING;"

# 4. Apply perf_db_apply_geog.sql (idempotent — all IF NOT EXISTS)
psql "$PERF_DB_URL" -f scripts/perf_db_apply_geog.sql

# 5. Generate 1k rows
python3 scripts/gen_perf_listings.py --count=1000 --seed=42 \
  --broker-id=00000000-0000-0000-0000-000000000001 --db-url="$PERF_DB_URL"

# 6. Run geo queries
python3 scripts/run_explain_harness.py --volume=postgis-1k \
  --query=QP-1c --db-url="$PERF_DB_URL" --count-check=1000
python3 scripts/run_explain_harness.py --volume=postgis-1k \
  --query=QP-3b --db-url="$PERF_DB_URL" --count-check=1000
```

All commands exited 0.

### Geog column and area_key verification

| Probe | Result |
|-------|--------|
| PostGIS extension | `postgis 3.3.4` — confirmed via `SELECT extname, extversion FROM pg_extension` |
| `geog` column on `property_listings` | Present — `geography(Point,4326)` GENERATED ALWAYS AS STORED |
| PERF rows total | 1,000 |
| PERF rows with non-null `geog` | 1,000 (0 null) |
| Area_key distribution (city=udupi) | Udupi: 621 (62.1%), Manipal: 111 (11.1%), Kundapura: 87 (8.7%), Mangaluru: 91 (9.1%), Bengaluru: 90 (9.0%) |

Area_key distribution matches the expected clusters from #1297 — no cross-cluster fallback, no 0% Udupi.

### QP-1c — Listings SELECT with school-radius (ST_DWithin)

| Metric | Value |
|--------|-------|
| Status | MEASURED — no DATA_GAP |
| Planning time | 25.513 ms |
| Execution time | 74.713 ms |
| Top plan node | Limit → Result → Sort → Nested Loop Semi Join |
| Index used | `idx_property_listings_status` (status Index Scan) |
| Actual rows returned | 20 |
| ST_DWithin filter | Applied as row filter after status scan; 962 rows removed by filter; 38 survived |

**Plan note:** At 1k scale the planner chose the status btree index over the GiST spatial index. This is
expected — 1k rows are small enough that a status scan + `ST_DWithin` post-filter is cheaper than a
spatial probe. The `geog` column evaluated correctly (no error, real rows returned). At 10k+ scale the
GiST index is expected to take over as the spatial predicate becomes more selective. Evidence:
`docs/audit/evidence/explain/live/postgis-1k/QP-1c.txt`.

### QP-3b — Markers with bbox (`&&` operator)

| Metric | Value |
|--------|-------|
| Status | MEASURED — no DATA_GAP |
| Planning time | 21.359 ms |
| Execution time | 3.146 ms |
| Top plan node | Limit → Sort → Nested Loop Semi Join |
| Index used | **`idx_property_listings_geog` (GiST spatial Index Scan)** |
| Index condition | `geog && ST_MakeEnvelope(...)::geography` |
| Actual rows returned | 91 |

**Plan note:** GiST index used directly for the `&&` bbox predicate — confirmed spatial index path. This
is the intended production behaviour. Evidence: `docs/audit/evidence/explain/live/postgis-1k/QP-3b.txt`.

### Known Limitations update

**(a) RESOLVED.** `pl.geog` is present and populated. V73 applied successfully on `postgis/postgis:14-3.3`.
QP-1c and QP-3b both return real rows at 1k scale with no DATA_GAP. The original gap was purely a
container image issue — `postgres:14` has no PostGIS; `postgis/postgis:14-3.3` does.

**(b) RESOLVED.** Area_key distribution is correct after the #1297 fix to `_load_area_keys()`.
Udupi cluster receives 62.1% of generated rows as expected. The harness ran against `city-slug=udupi`
with real Udupi-area data.

### 10k re-run — GiST index confirmed

**Dataset:** 10k synthetic `[PERF]`-tagged rows (seed=42, same PostGIS container, ANALYZE run after insert)
**Evidence files:** `docs/audit/evidence/explain/live/postgis-10k/QP-1c.txt`, `QP-3b.txt`

| Probe | Result |
|-------|--------|
| Generated rows with non-null `geog` | 10,000 / 10,000 |
| Area_key — Udupi cluster | 5,999 (60.0%); Manipal 1,004 (10.0%); Mangaluru 1,029 (10.3%); Bengaluru 1,011 (10.1%); Kundapura 957 (9.6%) |

**QP-1c at 10k:**

| Metric | Value |
|--------|-------|
| Execution time | 71.035 ms |
| Top plan node | Limit → Sort (top-N heapsort 31kB) → Nested Loop → BitmapAnd |
| Indexes used | **`idx_property_listings_geog` (GiST Bitmap Index Scan) + `idx_property_listings_area_key` (Bitmap Index Scan)** |
| GiST index condition | `geog && _st_expand(school_point, 2000m)` — spatial bounding box probe |
| ST_DWithin applied | Exact distance filter in Bitmap Heap Scan recheck (15 rows removed per area loop) |
| Actual rows returned | 20 |

At 10k scale the planner switched from the status btree scan (1k) to a `BitmapAnd` combining both spatial
and area_key indexes. `idx_property_listings_geog` is now the primary access path for the radius predicate.
This is the expected production behaviour.

**QP-3b at 10k:**

| Metric | Value |
|--------|-------|
| Execution time | 9.168 ms |
| Top plan node | Limit → Sort (quicksort 160kB) → Nested Loop → BitmapAnd |
| Indexes used | **`idx_property_listings_geog` (GiST Bitmap Index Scan) + `idx_property_listings_area_key` (Bitmap Index Scan)** |
| GiST index condition | `geog && envelope_geography` — direct bbox probe |
| Actual rows returned | 1,001 (LIMIT sentinel hit — all markers returned) |

GiST `idx_property_listings_geog` is the primary access path for the bbox predicate at 10k, consistent
with the 1k result but now intersected with `idx_property_listings_area_key` via BitmapAnd.

### Remaining gaps (none blocking)

All required correctness and index-path proofs are complete:

- `pl.geog` non-null at 1k, 10k, and 100k ✓
- QP-1c GiST index used at 10k and 100k ✓ (status btree at 1k is a dataset-size artifact, not a schema issue)
- QP-3b GiST index used at 1k, 10k, and 100k ✓

The ~71–102ms runtimes for QP-1c include ~22–25ms planning overhead and Rosetta/amd64-on-ARM64
emulation cost. Absolute timings are not directly comparable to production. The index selection and
plan structure are the meaningful artefacts.

**Durable cross-volume baseline:** `docs/audit/postgis-baseline-1k-10k-100k.md` —
full 1k/10k/100k tables, plan evolution, interpretation, and #1249 recommendations.
