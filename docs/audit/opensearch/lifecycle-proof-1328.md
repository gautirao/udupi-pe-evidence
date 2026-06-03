# OpenSearch Lifecycle Proof — Issue #1328 (v2-no-kafka)

## Purpose

Local-first integration proof that the full listing-change lifecycle is correctly
reflected in OpenSearch via the outbox path, without a Kafka broker.

Extends the TC-1..10 suite from issue #1316 with six additional test cases
(TC-11..16) covering: explicit outbox-row indexing, FTS update propagation, geo
update propagation, non-LIVE routing (INDEX+REJECTED → delete), Discover-shape
BoolQuery correctness, and V83 retry schema semantics.

## Lifecycle Path

```
listing mutation (UPDATE/INSERT property_listings)
  └─ SearchOutboxWriter inserts row into listing_search_outbox
       └─ SearchOutboxPoller.findUnpublishedBatch (JPQL query)
            └─ SearchOutboxPoller calls OpenSearchIndexingAdapter
                 └─ _apply_event() recomputes operation from status
                      ├─ LIVE  → os_client.index()   (external_gte versioning)
                      └─ !LIVE → os_client.delete()  (external_gte versioning)
```

Python-layer proof: `_apply_event` in `scripts/opensearch_indexer_consumer.py`
implements the same routing logic as the Java `SearchOutboxPoller`. The tests call
`_apply_event` directly, bypassing Kafka, and assert the resulting OpenSearch state.

## Test Case Summary

| TC    | AC    | Function                                  | What it proves                                                                              |
|-------|-------|-------------------------------------------|---------------------------------------------------------------------------------------------|
| TC-11 | AC2   | `test_live_create_via_outbox_row`         | Explicit outbox row insertion → `_apply_event` → doc present in OpenSearch with correct title |
| TC-12 | AC3   | `test_text_update_via_outbox_path`        | Title/description DB update at T2 (higher `source_updated_at`) → FTS returns T2 title; T1 title absent |
| TC-13 | AC4   | `test_location_update_via_outbox_path`    | Lat/lon DB update at T2 → `_source.location` updated; positive geo_distance hit at new point; negative hit at old point |
| TC-14 | AC5   | `test_non_live_listing_deleted_from_opensearch` | `operation=INDEX, status=REJECTED` → `_apply_event` recomputes → delete; doc absent after refresh |
| TC-15 | AC6   | `test_discover_fts_geo_boolquery`         | Discover-shape `bool{must:multi_match, filter:geo_distance}` returns nearby Udupi listing; excludes Bangalore listing (~880 km) |
| TC-16 | AC8   | `test_retry_schema_compatibility`         | V83 retry schema: DEAD excluded, FAILED excluded, future `next_attempt_at` excluded, past `next_attempt_at` eligible |

## How to Run

```bash
export DATABASE_URL=postgresql://postgres:password@localhost:5432/mydb
export OPENSEARCH_URL=http://localhost:9200

# Run only TC-11..16
pytest scripts/test_lifecycle_integration.py -v \
  -k "live_create_via_outbox_row or text_update_via_outbox_path or location_update_via_outbox_path or non_live_listing_deleted or discover_fts_geo_boolquery or retry_schema_compatibility"

# Run the full suite (TC-1..16)
pytest scripts/test_lifecycle_integration.py -v
```

## Skip Behaviour

All tests are guarded by the module-level `pytestmark`:

```python
pytestmark = pytest.mark.skipif(
    not os.getenv("DATABASE_URL") or not os.getenv("OPENSEARCH_URL"),
    reason="DATABASE_URL and OPENSEARCH_URL must be set for integration tests",
)
```

When either env var is absent, every test (TC-1..16) is reported as `SKIPPED`, not
`FAILED`. TC-10 proves this property explicitly.

## Java Proof Gap Acknowledgement

The Java routing and retry paths are already covered by unit tests in the backend:

- `SearchOutboxPollerTest.java` — covers `findUnpublishedBatch` invocation, per-event
  routing (INDEX/DELETE), and `publishedAt` stamp-on-success.
- `SearchOutboxPollerRetryTest.java` — covers `retry_count` increment, `next_attempt_at`
  backoff, and `DEAD` terminal state after max retries.

TC-16 cross-checks the **SQL predicate** by running the equivalent raw query directly
against Postgres, confirming the V83 partial index semantics (DEAD excluded, FAILED
excluded, future `next_attempt_at` excluded) match the JPQL in
`ListingSearchOutboxRepository.findUnpublishedBatch`.

## Key Implementation Notes

- **`_apply_event` signature**: 6 positional args only — `os_client, producer, event, index_name, counters, processed_at`. No `pg_conn`.
- **Version ordering**: `source_updated_at` for T2 must be strictly greater than T1 (`t1_ts + timedelta(seconds=5)`). OpenSearch `external_gte` enforces this; equal or older versions yield a 409 → `counters.skipped`.
- **`_refresh` placement**: Called immediately after `_apply_event` and before any OpenSearch get/search. Critical for TC-13 geo queries.
- **TC-14 routing proof**: Event carries `operation='INDEX'` with `status='REJECTED'`. `_apply_event` recomputes `operation = compute_operation(status)` → DELETE. The test confirms `counters.deleted >= 1`, proving the override is exercised.
- **TC-16 eligibility SQL**: Translated directly from `ListingSearchOutboxRepository.java` JPQL. `occurred_at` is set to `NOW() - INTERVAL '60 seconds'` to satisfy the `<= NOW() - INTERVAL '30 seconds'` cut-off (default `minEventAgeSeconds=30`).
