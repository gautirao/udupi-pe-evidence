# Discover Query Latency Metrics

Runtime latency metrics for the three Discover query paths, emitted via Micrometer and
scraped at `/actuator/prometheus` (requires `ROLE_ADMIN`). Implemented in issue #1249.

---

## Metric Names

| Metric name | Service class | Instrumented method |
|---|---|---|
| `discover.markers.query.latency.seconds` | `DiscoverMarkersService` | `getMarkers()` |
| `discover.listings.query.latency.seconds` | `DiscoverListingsService` | `getListings()` |
| `discover.search.query.latency.seconds` | Reserved (planned) | — |

> `discover.search.query.latency.seconds` is reserved for a future dedicated search
> service. Currently, FTS queries through `getListings()` are tagged with
> `query_path=search` on the `discover.listings.query.latency.seconds` metric.

---

## Tag Reference

### `query_path`

Identifies the structural shape of the query. Values are enum-only — no user input
is ever used as a tag value (cardinality policy, see below).

| Value | When set | Metric |
|---|---|---|
| `bbox` | No school radius, no FTS `q` (default viewport query) | markers + listings |
| `radius` | `schoolLat` + `schoolLon` + `schoolRadiusKm` set, no `q` | listings |
| `search` | FTS `q` set, no school radius | listings |
| `radius_search` | Both `schoolLat/schoolLon/schoolRadiusKm` and `q` set | listings |

`DiscoverMarkersService.getMarkers()` always uses `query_path=bbox` because the markers
endpoint does not currently accept `q` or school-radius parameters.

### `result_status`

| Value | Condition |
|---|---|
| `success` | Query completed with one or more results |
| `empty` | Query completed with zero results |
| `error` | `DataAccessException` thrown (general DB error) |
| `malformed_fts` | `DataAccessException` thrown on an FTS path and the exception message contains `"tsquery"` or `"syntax error"` — indicates a PostgreSQL FTS syntax failure |

---

## Cardinality Policy

**Enum-only tags. No user-supplied values are ever used as tag values.**

Every `.tag(key, value)` call uses either a hardcoded string literal or a local
variable set from one of the approved enum values listed above. Method parameters
such as `q`, `userId`, `schoolId`, `lat`, `lon`, or `radius` are never passed
directly as tag values.

This keeps cardinality bounded to:
- `query_path`: 4 values
- `result_status`: 4 values
- Combined with metric name: max 3 × 4 × 4 = 48 time series

---

## Cache Metrics (PLANNED, NOT ACTIVE)

A `cache_result` tag (`hit` / `miss` / `skip`) is planned but **not yet implemented**.

Caffeine cache candidates identified for a follow-up issue:
- **QP-1a** — basic area listings (high-frequency, stable result set)
- **QP-2** — area aggregation counts
- **QP-5** — city stats summary

This section will be updated when the cache layer is introduced.

---

## PostGIS Performance Baseline

Latency baselines measured at 100k-row scale with PostGIS enabled
(see `docs/audit/postgis-baseline-1k-10k-100k.md`):

| Query | Metric (`query_path`) | p50 baseline @ 100k | p99 baseline @ 100k |
|---|---|---|---|
| QP-1c bbox listings (no radius/FTS) | `bbox` | ~40 ms | ~102 ms |
| QP-3b school-radius listings | `radius` | ~20 ms | ~40 ms |

Use these as SLO reference points when configuring alerting thresholds on the
`discover.listings.query.latency.seconds` histogram.

---

## Endpoint

```
GET /actuator/prometheus
Authorization: Bearer <token with ROLE_ADMIN>
```

Returns Prometheus text format. Example output for the markers metric:

```
# HELP discover_markers_query_latency_seconds_bucket
# TYPE discover_markers_query_latency_seconds histogram
discover_markers_query_latency_seconds_bucket{query_path="bbox",result_status="success",le="0.005",...} 0
discover_markers_query_latency_seconds_bucket{query_path="bbox",result_status="success",le="0.05",...} 12
...
discover_markers_query_latency_seconds_count{query_path="bbox",result_status="success",...} 42
discover_markers_query_latency_seconds_sum{query_path="bbox",result_status="success",...} 1.234
```

---

## Shadow-Read / Parity Metrics (issue #1318)

Shadow mode fires a fire-and-forget OpenSearch query alongside every Postgres-primary
response. It is activated by `discover.opensearch.shadow-enabled=true` combined with
`discover.opensearch.enabled=false`. No query result is altered.

### Configuration

| Property | Default | Description |
|---|---|---|
| `discover.opensearch.shadow-enabled` | `false` | Enable shadow mode |
| `discover.opensearch.shadow-timeout-ms` | `500` | Wall-clock budget for shadow OS call (ms) |
| `discover.opensearch.shadow-sample-rate` | `1.0` | Fraction of requests to shadow (0.0–1.0) |
| `discover.opensearch.shadow-top-n` | `10` | Number of top results used for order-overlap metric |

### Metric Names

| Metric name | Type | When emitted |
|---|---|---|
| `discover.opensearch.shadow.count` | Counter | Every shadow decision: MATCH, MISMATCH, TIMEOUT, ERROR, SKIPPED |
| `discover.opensearch.shadow.count_delta` | DistributionSummary | MATCH and MISMATCH comparisons; records `abs(pgCount - osCount)` |
| `discover.opensearch.shadow.mismatch_pct` | DistributionSummary | MATCH and MISMATCH; `(missing + extra) / max(pgCount,1) * 100` |
| `discover.opensearch.shadow.missing_count` | DistributionSummary | MATCH and MISMATCH; IDs in Postgres but absent from OpenSearch |
| `discover.opensearch.shadow.extra_count` | DistributionSummary | MATCH and MISMATCH; IDs in OpenSearch but absent from Postgres |
| `discover.opensearch.shadow.top_n_overlap` | DistributionSummary | Ordered query types only (see below); fraction of top-N that overlap |
| `discover.opensearch.shadow.latency` | Timer | Wall time of the shadow OpenSearch call |

### Tag Reference (all shadow metrics)

All shadow metrics carry exactly three tags. No user-supplied values are ever used as tag values.

| Tag key | Values |
|---|---|
| `query_type` | `KEYWORD`, `BBOX`, `SCHOOL_RADIUS`, `POLYGON`, `CITY_BROWSE`, `MARKERS` |
| `comparison_status` | `MATCH`, `MISMATCH`, `TIMEOUT`, `ERROR`, `SKIPPED` |
| `result_status` | `POSTGRES_ONLY`, `POSTGRES_SHADOW_OK`, `POSTGRES_SHADOW_TIMEOUT`, `POSTGRES_SHADOW_ERROR`, `POSTGRES_SHADOW_SKIPPED` |

### `query_type` values

Derived from field PRESENCE in the query object — never from field values.

| Value | Condition |
|---|---|
| `KEYWORD` | `q` is non-null and non-blank |
| `SCHOOL_RADIUS` | `schoolLat`, `schoolLon`, `schoolRadiusKm` all present |
| `POLYGON` | `polygon` list is non-null and non-empty |
| `BBOX` | `bbox` is present |
| `CITY_BROWSE` | None of the above (city-scoped browse) |
| `MARKERS` | Markers endpoint (always; set by the runner directly) |

### Top-N overlap and the MARKERS NOT_COMPARABLE case

`discover.opensearch.shadow.top_n_overlap` is emitted only when the query type's sort
order is the same in Postgres and OpenSearch:

- **Listings paths** (KEYWORD / BBOX / SCHOOL_RADIUS / POLYGON / CITY_BROWSE):
  both use `created_at DESC` → orders match → top-N overlap is comparable → **metric emitted**.
- **MARKERS path**: Postgres uses `ORDER BY id ASC`; OpenSearch uses `created_at DESC` →
  orders differ → top-N overlap is NOT_COMPARABLE → **metric NOT emitted** for MARKERS.

### Cardinality

Shadow metrics add at most:
- `query_type` × `comparison_status` × `result_status` = 6 × 5 × 5 = 150 time series
  (in practice far fewer since not all combinations occur)

All tag values are enum-derived constants — user input is never propagated into tag values.
