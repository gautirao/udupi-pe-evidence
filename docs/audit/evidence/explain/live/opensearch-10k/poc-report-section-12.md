# Section 12 to append to docs/architecture/opensearch-poc-report.md
# 
# Apply with:
#   tail -n +14 docs/audit/evidence/explain/live/opensearch-10k/poc-report-section-12.md \
#       >> docs/architecture/opensearch-poc-report.md
#
# Or unlock the file in Finder (Get Info -> uncheck "Locked"), then the agent
# can write it directly on the next run.
#
# ---BEGIN SECTION 12---
#
# NOTE: This file is a staging copy. The target is:
#   docs/architecture/opensearch-poc-report.md
#

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

Apply all Flyway migrations up to at least V73 (the `geog geography` column migration),
which adds the `geog` column required by the `ST_DWithin` / `&&` geo queries.
Point `DATABASE_URL` at the perf container, then run:

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
