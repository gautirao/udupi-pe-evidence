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
