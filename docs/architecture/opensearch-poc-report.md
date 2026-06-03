# OpenSearch POC Report — Discover Listing Read-Model
**Status:** POC COMPLETE — real data run 2026-05-30  
**Issue:** #1309  
**Related ADR:** docs/architecture/discover-opensearch-search-architecture.md

---

## Local POC Environment

| Item | Value |
|------|-------|
| PostGIS image | `postgis/postgis:14-3.3` (localhost:5434, non-production) |
| PostgreSQL version | 14.23 |
| PostGIS version | 3.3.4 |
| OpenSearch image | `opensearchproject/opensearch:2.13.0` |
| OpenSearch mode | Single-node, security disabled (`DISABLE_SECURITY_PLUGIN=true`) |
| Port | `127.0.0.1:9200` (loopback only) |
| DATABASE_URL | `postgresql://****:****@localhost:5434/postgres` (perf-pg container, non-production) |
| Dataset size | 1 000 LIVE rows |
| Generator | `scripts/gen_perf_listings.py --count 1000 --seed 42` |
| Cleanup | `[PERF]`-tagged rows; run `gen_perf_listings.py --cleanup` to remove |

---

## 1. Objective

Validate OpenSearch 2.13 as a Discover search read-model by indexing
`property_listings` (LIVE rows) and running the four key Discover query
patterns against the index. Compare results to Postgres baselines from
`docs/audit/postgis-baseline-1k-10k-100k.md` to determine whether OpenSearch
meets or beats Postgres at current LIVE volumes, and to assess readiness for
scale adoption.

---

## 2. Setup

| Component | Value |
|-----------|-------|
| OpenSearch image | `opensearchproject/opensearch:2.13.0` |
| Mode | Single-node, security plugin disabled (local dev only) |
| Port binding | `127.0.0.1:9200` (loopback only) |
| Index | `listings_poc` |
| Shards / replicas | 1 / 0 (local POC) |

Scripts used:

| Script | Purpose |
|--------|---------|
| `scripts/opensearch_backfill.py` | Create index mapping, bulk-load LIVE rows from Postgres |
| `scripts/opensearch_query_poc.py` | Run 4 query prototypes, print latency vs Postgres baseline |
| `scripts/requirements-opensearch.txt` | Python dependencies (`opensearch-py`, `psycopg2-binary`) |

---

## 3. Backfill Results

| Metric | Value |
|--------|-------|
| Postgres rows read (`WHERE status='LIVE'`) | 1 000 |
| Rows indexed into OpenSearch | 1 000 |
| Rows skipped (null lat/lon) | 0 |
| Indexing failures | 0 |
| Batch 1 (500 docs) | 179.0ms → 2 794 docs/sec |
| Batch 2 (500 docs) | 123.3ms → 4 055 docs/sec |
| Total indexing time | 0.3s → 2 867 docs/sec overall |
| OpenSearch doc count after backfill | 1 000 (verified: `GET /listings_poc/_count`) |

---

## 4. Index Mapping

Fields indexed (15 fields, all public-safe):

> **Note (#1311):** The 15-field count reflects the #1309 live-run snapshot. `city_slug` and `hero_image_url` are now derivable via join/subquery and added to the backfill — see §9 (RESOLVED) and [discover-read-model-fields-and-fts-alignment.md](discover-read-model-fields-and-fts-alignment.md).

| Field | OpenSearch type | Source column | Notes |
|-------|-----------------|---------------|-------|
| `id` | `keyword` | `id` | Document `_id` |
| `title` | `text` + `.keyword` | `title` | `keyword` sub-field for sorting |
| `locality` | `text` + `.keyword` | `locality` | `keyword` sub-field for sorting |
| `description` | `text` | `description` | Full-text only |
| `area_key` | `keyword` | `area_key` | Exact-match filter |
| `property_type` | `keyword` | `property_type` | Facet / filter |
| `seller_type` | `keyword` | `seller_type` | Facet / filter |
| `bedrooms` | `integer` | `bedrooms` | Range filter |
| `bathrooms` | `integer` | `bathrooms` | Range filter |
| `price_paise` | `long` | `price_paise` | Range filter |
| `latitude` | `float` | `latitude` | Stored for reference |
| `longitude` | `float` | `longitude` | Stored for reference |
| `location` | `geo_point` | derived: `{lat, lon}` | Used for geo queries |
| `status` | `keyword` | `status` | Backfill filters `WHERE status='LIVE'` |
| `created_at` | `date` | `created_at` | ISO-8601 |

**Security note:** `city_slug` and `hero_image_url` were in the original design but do not
exist as columns in `property_listings` — removed from mapping and SELECT on discovery.
No PII fields (user_id, seller_id, phone, email, supabase_user_id) are present.
Verified live: `sorted(doc.keys())` returns exactly the 15 fields above.

> Rows with NULL `latitude` or `longitude` are skipped during backfill.
> `location` (geo_point) is derived from the Postgres `latitude`/`longitude` columns,
> not the generated `geog geography` column.

---

## 5. Query Results

All four queries ran against the 1 000-doc `listings_poc` index (local PostGIS perf DB, seed=42).

| Query | Pattern | PG count | OS count | Delta | PG latency | OS `os_took` | OS client | Verdict |
|-------|---------|---:|---:|---:|---:|---:|---:|---------|
| QP-1c | `geo_distance` 2 km from Udupi centre (13.3409°N, 74.7421°E) | 38 | 38 | **0** | 67.7ms | 56ms | 64.1ms | PARITY |
| QP-3b | `geo_bounding_box` Udupi core (13.32–13.36°N, 74.72–74.77°E) | 85 | 85 | **0** | 1.6ms | 7ms | 11.7ms | PARITY (PG faster at 1k) |
| QP-1d | `multi_match` FTS "sea view apartment" | 134 | 408 | -274 | 2.4ms | 18ms | 24.2ms | SEMANTIC DIFF (expected) |
| QP-combo | FTS "sea view" + `geo_distance` 5 km | 41 | 41 | **0** | — | 6ms | 10.2ms | PARITY |

**Notes on PG latency:** Measured via `EXPLAIN ANALYZE` on perf-pg 1k dataset. PG QP-3b (1.6ms) uses btree index on `latitude`/`longitude` columns at 1k scale. At 100k the PostGIS baseline shows 40ms — OpenSearch `os_took` 7ms would be faster there.

**PG query used for parity:** `websearch_to_tsquery('english', ...)` via the V18 `search_vector` GIN index.

---

## 6. Parity Analysis

### 6.1 Geo distance: `geo_distance` vs `ST_DWithin` — PARITY

`geo_distance` uses Haversine (spherical earth); `ST_DWithin` with `geography` uses WGS-84 geodesic.
For distances ≤20 km the difference is <0.1%. **Count delta is 0** for QP-1c and QP-combo at 1k.

### 6.2 FTS: `multi_match` vs `websearch_to_tsquery` — SEMANTIC DIFFERENCE (expected)

| Dimension | OpenSearch `multi_match` | Postgres `websearch_to_tsquery` |
|-----------|--------------------------|----------------------------------|
| Default operator | OR (BM25 ranking) | AND (all terms required) |
| "sea view apartment" | Matches any term → 408 results | Requires all three → 134 results |
| Stemming | Standard analyser | English dictionary (stem + stop-words) |
| Ranking | BM25 `_score` | `ts_rank` float |

The count difference (134 vs 408) is **expected and documented** — not a bug.
For Discover keyword search, configuring `operator: "and"` in the `multi_match` query would
bring counts into alignment at the cost of lower recall on partial matches.

### 6.3 Bbox: `geo_bounding_box` vs `lat/lon BETWEEN` — PARITY

Count delta = 0. OpenSearch `geo_bounding_box` on a `geo_point` field is semantically equivalent
to a lat/lon range filter when using the same coordinate bounds. At 1k, Postgres btree is faster
(1.6ms vs 7ms os_took); this advantage narrows at higher volumes where the GiST index takes over.

---

## 7. Adoption Trigger Assessment

Reference ADR: `docs/architecture/discover-opensearch-search-architecture.md`

| Trigger | Threshold | Current status | Met? |
|---------|-----------|----------------|------|
| P95 FTS latency | > 200ms | 18ms `os_took` (OpenSearch 1k); 2.4ms (Postgres 1k) | **No** |
| P95 ST_DWithin latency | > 300ms | 67.7ms (Postgres 1k); 56ms (OS 1k) | **No** |
| LIVE listing volume | > 500K | 1 000 LIVE rows in perf DB | **No** |
| Insert rate | > 500/min sustained | Not measured; well below threshold at current volume | **No** |

**Assessment:** No adoption triggers are met at current volume. OpenSearch is validated as a
viable upgrade path. Parity is confirmed for geo queries. FTS semantic difference is documented
and manageable via `operator: "and"`.

---

## 8. Safety Verification

| Check | Result |
|-------|--------|
| Indexed fields | 15 fields — explicit whitelist SELECT (no `SELECT *`) |
| PII fields | NONE — verified live against running index |
| `user_id`, `seller_id`, `phone`, `email`, `supabase_user_id` | Absent from mapping and SELECT |
| `status='LIVE'` filter | Enforced in WHERE clause; confirmed 1 000/1 000 rows are LIVE |
| Credentials | `DATABASE_URL` and `OPENSEARCH_URL` from `os.environ` only; `_safe_db_url_display()` strips credentials from logs |
| Port binding | `127.0.0.1:9200` (loopback only) |
| Secrets committed | None — `.env` files not committed |

---

## 9. Gaps and Next Steps

| Gap | Severity | Status | Next issue |
|-----|----------|--------|-----------|
| `city_slug` does not exist on `property_listings` — removed from mapping | Low | **RESOLVED (#1311)** — added via `areas → cities` join in backfill SELECT + `keyword` mapping field. Acquisition strategy + pitfall documented in [discover-read-model-fields-and-fts-alignment.md §2.3](discover-read-model-fields-and-fts-alignment.md#23-city_slug-acquisition-strategy). | — |
| `hero_image_url` does not exist on `property_listings` — removed from mapping | Low | **RESOLVED (#1311)** — added via `listing_images` correlated subquery (ORDER BY position ASC, id ASC LIMIT 1) in backfill SELECT + `keyword` mapping field. NULL-safe. See [discover-read-model-fields-and-fts-alignment.md §2.4](discover-read-model-fields-and-fts-alignment.md#24-hero_image_url-acquisition-strategy). | — |
| FTS `operator: "and"` not set — counts diverge from Postgres | Advisory | **ADDRESSED (#1311)** — `opensearch_fts_compare.py` compares 5 strategies (OR, AND best_fields, AND cross_fields, MSM-100%, MSM-75%) with Postgres baseline. Recommended default: `type:best_fields operator:and`. See [discover-read-model-fields-and-fts-alignment.md §1.4](discover-read-model-fields-and-fts-alignment.md#14-recommended-discover-default-fts-strategy). | Configure per-query in production wiring (#1254) |
| Latency comparison at 10k/100k not yet run | Advisory | Open | Re-run generator with `--count 10000` / `100000` |
| Postgres parity for QP-combo not measured (no baseline) | Low | Open | Add in next scale run |
| OFFSET/LIMIT pagination in backfill — server-side cursor needed at 100k+ | Low | Open | #1254 |
| Full reindex pipeline (CDC/Kafka/outbox) | Out of scope for POC | Open | #1254 / ADR Phase 2 |

---

## 10. Recommendation

**Proceed to #1254 (observability model).** The read-model shape is proven:

- Geo queries (distance, bbox) have **perfect parity** at 1k.
- FTS parity is achievable with `operator: "and"` (documented semantic gap).
- Backfill script indexes 1k in 0.3s (2 867 docs/sec); production scale is tractable.
- Security audit passed (Gate F): 15 public-safe fields, 0 PII.

Postgres remains the right store at current LIVE volume (~13 LIVE rows production).
OpenSearch is validated and ready for the next phase when volume triggers are approached.

---

## 11. How to Run

### Prerequisites
- Docker (with Compose v2: `docker compose`)
- Python 3.9+
- Local PostGIS DB (NOT production) — e.g. `postgis/postgis:14-3.3` on port 5434

### Steps

```bash
# 1. Start OpenSearch
docker compose -f docker-compose.opensearch.yml up -d

# 2. Confirm health
curl -s http://localhost:9200

# 3. Install Python dependencies
pip install -r scripts/requirements-opensearch.txt

# 4. Set environment variables (local DB only — never production)
export DATABASE_URL=postgresql://postgres:perf@localhost:5434/postgres
export OPENSEARCH_URL=http://localhost:9200

# 5. Generate test data (optional — skip if perf DB has LIVE rows)
PERF_DB_URL=$DATABASE_URL python3 scripts/gen_perf_listings.py --count 1000 --seed 42

# 6. Backfill LIVE listings into OpenSearch
python3 scripts/opensearch_backfill.py

# 7. Run query prototypes and compare latency
python3 scripts/opensearch_query_poc.py

# 8. Teardown
docker compose -f docker-compose.opensearch.yml down -v
PERF_DB_URL=$DATABASE_URL python3 scripts/gen_perf_listings.py --cleanup --confirm-delete-generated
```

### Actual backfill output (1k dataset, seed=42, 2026-05-30)

```
Connecting to Postgres: postgresql://****:****@localhost:5434/postgres
OpenSearch URL: http://127.0.0.1:9200
Created index 'listings_poc'.
Total LIVE rows to index: 1000 | batch_size=500 | batches=2
Batch 1/2: indexed 500 docs in 179.0ms, 2794 docs/sec
Batch 2/2: indexed 500 docs in 123.3ms, 4055 docs/sec

Backfill complete: 1000 docs indexed in 0.3s (2867 docs/sec total)
```

### Actual query output (1k dataset, 2026-05-30)

```
Index 'listings_poc' found — 1000 documents.

Query      Pattern                Hits       OpenSearch   Postgres baseline
---------------------------------------------------------------------------
QP-1c      geo_distance             38   client=  64.1ms os_took=  56ms   Postgres baseline: ~40ms (100k rows)
QP-3b      geo_bounding_box         85   client=  11.7ms os_took=   7ms   Postgres baseline: ~40ms (100k rows, LIMIT 1001)
QP-1d      multi_match FTS         408   client=  24.2ms os_took=  18ms   Postgres baseline: GIN index
QP-combo   FTS+geo                  41   client=  10.2ms os_took=   6ms   Postgres baseline: compound predicate
---------------------------------------------------------------------------
```

---

## 12. Scale Comparison (10k / 100k)

### Prerequisites

To reproduce a scale comparison run, complete these steps in order:

**1. Start local PostGIS perf container**

```bash
docker run --rm -d -p 5434:5432 \
  -e POSTGRES_PASSWORD=postgres \
  --name perf-pg \
  postgis/postgis:14-3.3
```

**2. Apply migrations**

Apply all Flyway migrations (current ceiling V83; V73 adds the `geog geography(Point,4326)`
generated column required by `ST_DWithin` / `&&` geo queries; V65 is a Java migration handled
natively by `mvnw`). Point `DATABASE_URL` at the perf container, then run:

```bash
./mvnw -pl backend flyway:migrate -Dflyway.url=jdbc:postgresql://localhost:5434/postgres \
  -Dflyway.user=postgres -Dflyway.password=postgres
```

**3. Generate synthetic LIVE data**

```bash
python scripts/gen_perf_listings.py \
  --count 10000 \
  --seed 42 \
  --db-url postgresql://postgres:postgres@localhost:5434/postgres
```

For 100k: `--count 100000` (same seed for reproducibility).

**4. Start local OpenSearch**

```bash
docker run --rm -d -p 9200:9200 \
  -e discovery.type=single-node \
  -e DISABLE_SECURITY_PLUGIN=true \
  --name opensearch-local \
  opensearchproject/opensearch:2.13.0
```

**5. Run the scale comparison**

```bash
python scripts/opensearch_scale_compare.py \
  --volume 10k \
  --db-url postgresql://postgres:postgres@localhost:5434/postgres \
  --opensearch-url http://localhost:9200
```

Results are written to
`docs/audit/evidence/explain/live/opensearch-{volume}/opensearch-compare.json`.

Add `--cleanup` to delete the scale index after the run.

---

### Scale comparison table

1k numbers are carried forward from §5 (real run, 2026-05-30, seed=42).
10k numbers are from the live run on 2026-06-03 (postgis/postgis:15-3.4, localhost:5434, seed=42, 10 000 LIVE rows).
100k: DEFERRED — 10k establishes the primary parity baseline; 100k run requires ~100k-row
data generation and longer OpenSearch backfill; tracked as a follow-up issue.

> **FTS note:** QP-1d uses `type:best_fields operator:and` in the 10k/100k runs
> (per §12.3 below), which aligns OpenSearch semantics with Postgres `websearch_to_tsquery`.
> The 1k `os_took` of 18ms used OR-default (#1309 baseline) — counts are not directly comparable.

> **PG latency note:** 10k PG latency figures (1–2 ms) are `COUNT(*)` wall-clock on a warm
> connection, not `EXPLAIN ANALYZE`; the §1299 baseline (71 ms QP-1c at 10k) includes planning
> overhead + buffer I/O from `EXPLAIN (ANALYZE, BUFFERS)`. Both figures are correct and measure
> different things. The OS `took` column (server-side) and `OS client ms` column (end-to-end
> including network round-trip) are both shown for OpenSearch.

| Query | 1k PG (ms) | 1k OS took (ms) | 10k PG (ms) | 10k OS took (ms) | 10k OS client (ms) | 100k PG (ms) | 100k OS took (ms) | 10k delta | 100k delta |
|-------|:----------:|:---------------:|:-----------:|:----------------:|:------------------:|:------------:|:-----------------:|:---------:|:----------:|
| QP-1c    | 67.7 | 56 | 1.6 | 77  | 90.1 | 100k — DEFERRED | — | +0.0% | — |
| QP-3b    | 1.6  | 7  | 0.8 | 20  | 45.7 | 100k — DEFERRED | — | +0.1% | — |
| QP-1d    | 2.4  | 18 (OR-default) | 1.1 | 16 | 27.0 | 100k — DEFERRED | — | +0.0% | — |
| QP-combo | —    | 6  | 1.6 | 7   | 15.1 | 100k — DEFERRED | — | +0.2% | — |

---

### FTS semantics note (QP-1d)

The 1k POC in §5 used OpenSearch `multi_match` with OR-default, which produced a
count of 408 vs Postgres 134 — a known semantic difference documented in §6.2.

From issue #1311 onward, all scale runs use:

```json
{
  "type": "best_fields",
  "operator": "and"
}
```

This aligns OpenSearch semantics with `websearch_to_tsquery('english', ...)`, which requires
all terms to be present. `type:best_fields` scores the best-matching field rather than
summing across fields, matching the Postgres single-vector approach.

The `opensearch_scale_compare.py` script hard-asserts this via:

```python
assert qp1d_body["query"]["multi_match"].get("operator") == "and", \
    "FTS operator not set to 'and' — QP-1d body misconfigured"
```

This assertion is evaluated before the query is sent; a misconfigured body will exit
immediately with an `AssertionError` rather than silently returning inflated counts.

---

### Count delta analysis (10k run)

**Geo queries (QP-1c, QP-3b, QP-combo):** Deltas of 0–1 doc (+0.0% to +0.2%) are
within floating-point boundary tolerance for geo_distance / geo_bounding_box. These are
expected and not indicative of an indexing defect. Postgres `ST_DWithin` uses exact
PostGIS spheroid arithmetic; OpenSearch uses Lucene spatial which uses a slightly
different distance model for boundary points.

*QP-3b methodology note:* Postgres uses `LIMIT 1001` (a sentinel for "too many markers"),
so `pg_count` is capped at 1001. OpenSearch uses `track_total_hits: true` which returns
the uncapped total (os_count=1002 here). The delta (+1) is not evidence of an indexing
gap — it shows the bbox contains at least 1001 Postgres matches and exactly 1002 OS
matches. For exact total-count parity, remove the `LIMIT` on both sides in a future run.

**FTS query (QP-1d):** Delta is exactly 0 (+0.0%). With `operator:and` + `type:best_fields`,
OpenSearch requires all terms in at least one field, matching `websearch_to_tsquery`
AND-semantics precisely for this synthetic dataset (titles use verbatim template strings).

**Backfill stats (10k live run, 2026-06-03):**
- Postgres LIVE rows indexed: 10 000
- OpenSearch indexed: 10 000 (0 failed, 0 skipped)
- Throughput: 6 650 docs/sec
- Index size: 3 904 564 bytes (3.7 MB)
- Index name: `listings_scale_10k`

---

### 100k deferral

100k: DEFERRED — 10k establishes the primary parity baseline; 100k run requires
~100k-row data generation and longer OpenSearch backfill; tracked as a follow-up issue.
