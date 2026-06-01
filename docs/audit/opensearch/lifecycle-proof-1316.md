# OpenSearch Lifecycle Proof — Issue #1316

## Issue Summary

Issue #1316 requires an integration test suite that proves the full listing
lifecycle through the incremental OpenSearch indexing pipeline end-to-end,
without requiring a live Kafka broker. The suite validates:

- Visibility invariant: `status == 'LIVE'` → INDEX; all other statuses → DELETE
- PII absence: 6 forbidden keys (`user_id`, `seller_id`, `phone`, `email`,
  `supabase_user_id`, `rejectionReason`) never appear in `_source`
- Field whitelist: every `_source` key is a member of `DOCUMENT_WHITELIST` (18 fields)
- Idempotency: duplicate events with the same `source_updated_at` do not produce
  duplicate documents
- Lag measurement: `PipelineCounters.lag_stats()` returns `p50_ms / p95_ms / max_ms`
- Discover parity: OpenSearch result IDs match the Postgres Discover predicate
  for a scoped test city

## Approach

**Bypass Kafka entirely.** The pipeline's `_apply_event()` function in
`scripts/opensearch_indexer_consumer.py` is a pure function that takes an event
`dict`, an OpenSearch client, and a `PipelineCounters` instance. By calling it
directly we prove the full Postgres → OpenSearch → Discover data path without
needing a broker.

Each test:
1. Inserts isolated `cities` + `areas` + `property_listings` rows via psycopg2
2. Constructs an event dict matching the pipeline's schema
3. Calls `_apply_event()` directly
4. Asserts the expected OpenSearch state after `indices.refresh()`
5. Cleans up Postgres + OpenSearch in `try/finally`

A session-scoped OpenSearch index (`test_lifecycle_proof_{epoch_ms}`) is created
at session start and deleted at session teardown. A session-scoped Postgres
connection is reused across tests.

All tests are guarded by a `pytestmark` that SKIPs the entire module when
`DATABASE_URL` or `OPENSEARCH_URL` is absent from the environment.

## Test Case Table

| TC | Function | Description |
|----|----------|-------------|
| TC-1 | `test_live_listing_indexed` | LISTING_APPROVED / status=LIVE → doc in OpenSearch; all _source keys ⊆ WHITELIST; no PII |
| TC-2 | `test_draft_not_indexed` | LISTING_CREATED / status=DRAFT → NotFoundError; deleted or skipped counter > 0 |
| TC-3 | `test_pending_review_not_indexed` | LISTING_CREATED / status=PENDING_REVIEW → NotFoundError |
| TC-4 | `test_rejected_removes_from_index` | Index LIVE first; LISTING_REJECTED (higher version) → NotFoundError |
| TC-5 | `test_archived_removes_from_index` | Index LIVE first; LISTING_ARCHIVED (higher version) → NotFoundError |
| TC-6 | `test_lag_measured` | LIVE event with measured occurred_at → lag_stats() returns p50_ms/p95_ms/max_ms >= 0 |
| TC-7 | `test_field_whitelist_no_pii` | Document with PII keys injected → _source has no PII; all keys ⊆ WHITELIST |
| TC-8 | `test_discover_parity` | OpenSearch IDs == Postgres Discover predicate IDs (scoped to isolated test city) |
| TC-9 | `test_idempotency_duplicate_event` | Replay identical event (same source_updated_at) → exactly 1 doc; failures=0 |
| TC-10 | `test_skip_when_env_absent` | Suite SKIPs (not FAILS) when DATABASE_URL or OPENSEARCH_URL is absent |

## Setup Instructions

### 1. Start local OpenSearch

```bash
# Using the project's opensearch compose file if present:
docker compose -f docker-compose.opensearch.yml up -d

# Or start a standalone OpenSearch 2.x container:
docker run -d \
  --name opensearch-test \
  -p 9200:9200 \
  -e "discovery.type=single-node" \
  -e "DISABLE_SECURITY_PLUGIN=true" \
  opensearchproject/opensearch:2.13.0
```

### 2. Start local Postgres

The test requires a Postgres instance with the full Flyway migration schema applied
(through at least V29 for `listing_number` and V73 for the `geog` generated column).

The local dev Postgres instance (Supabase local or Docker) works if migrations are current.

### 3. Set environment variables

```bash
# DATABASE_URL — point to a local/throwaway Postgres (the pg_conn fixture
# connects directly via psycopg2; no safety gate is applied, so do NOT point
# this at a production database)
export DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres

# OPENSEARCH_URL
export OPENSEARCH_URL=http://localhost:9200
```

## How to Run

```bash
# Collect only (verify 10 tests discovered — no DB/OS required):
pytest scripts/test_lifecycle_integration.py --collect-only -v

# Full integration suite (requires DATABASE_URL + OPENSEARCH_URL):
pytest scripts/test_lifecycle_integration.py -v

# Without env vars — confirms skip-not-fail behaviour:
env -u DATABASE_URL -u OPENSEARCH_URL \
  pytest scripts/test_lifecycle_integration.py -v
```

## Evidence

### pytest --collect-only output (10 tests discovered)

```
============================= test session starts ==============================
collecting ... collected 10 items

<Dir udupi-property-explorer>
  <Dir scripts>
    <Module test_lifecycle_integration.py>
      <Function test_live_listing_indexed>
        TC-1: LISTING_APPROVED event with status=LIVE → doc present in OpenSearch.
      <Function test_draft_not_indexed>
        TC-2: LISTING_CREATED event with status=DRAFT → NotFoundError after refresh.
      <Function test_pending_review_not_indexed>
        TC-3: LISTING_CREATED event with status=PENDING_REVIEW → NotFoundError.
      <Function test_rejected_removes_from_index>
        TC-4: Index LIVE listing first; then LISTING_REJECTED event removes it.
      <Function test_archived_removes_from_index>
        TC-5: Index LIVE listing first; then LISTING_ARCHIVED event removes it.
      <Function test_lag_measured>
        TC-6: LIVE listing event → counters.lag_stats() returns p50_ms/p95_ms/max_ms >= 0.
      <Function test_field_whitelist_no_pii>
        TC-7: Event.document containing PII fields → _source has NO PII, all keys ⊆ WHITELIST.
      <Function test_discover_parity>
        TC-8: IDs from OpenSearch query match IDs from Postgres Discover predicate (scoped to test city).
      <Function test_idempotency_duplicate_event>
        TC-9: Replaying identical event (same source_updated_at) → 1 doc; counters reflect correct behaviour.
      <Function test_skip_when_env_absent>
        TC-10: Integration tests skip (not fail) when DATABASE_URL or OPENSEARCH_URL is absent.

========================= 10 tests collected in 0.08s ==========================
```

### Skip-gate verification (env vars absent)

```
============================= test session starts ==============================
collecting ... collected 10 items

scripts/test_lifecycle_integration.py::test_live_listing_indexed SKIPPED [ 10%]
scripts/test_lifecycle_integration.py::test_draft_not_indexed SKIPPED    [ 20%]
scripts/test_lifecycle_integration.py::test_pending_review_not_indexed SKIPPED [ 30%]
scripts/test_lifecycle_integration.py::test_rejected_removes_from_index SKIPPED [ 40%]
scripts/test_lifecycle_integration.py::test_archived_removes_from_index SKIPPED [ 50%]
scripts/test_lifecycle_integration.py::test_lag_measured SKIPPED          [ 60%]
scripts/test_lifecycle_integration.py::test_field_whitelist_no_pii SKIPPED [ 70%]
scripts/test_lifecycle_integration.py::test_discover_parity SKIPPED       [ 80%]
scripts/test_lifecycle_integration.py::test_idempotency_duplicate_event SKIPPED [ 90%]
scripts/test_lifecycle_integration.py::test_skip_when_env_absent SKIPPED  [100%]

============================= 10 skipped in 0.09s ==============================
```

### TC-6 lag API note

`PipelineCounters` (in `scripts/search_events.py`) exposes
`record_lag(occurred_at, processed_at)` to record a sample and `lag_stats()` to
read back the aggregate, returning `{"p50_ms", "p95_ms", "max_ms"}` (it returns
`{}` when zero samples have been recorded). The lag sample is populated inside
`opensearch_indexer_consumer._apply_event`, which calls `counters.record_lag(...)`
whenever the event carries `occurred_at`, so by the time TC-6 inspects the
counters a sample exists. TC-6 calls `counters.lag_stats()` (the real method —
there is no `lag_percentiles()`) and prints the measured values under `pytest -s`.

### Full integration suite — LIVE run: 10 passed (real)

Run against a live PostGIS Postgres + live OpenSearch on 2026-06-01.

Live stack:

- **Postgres:** PostgreSQL 15.8 + PostGIS 3.4.3, Flyway schema at **v81**
  (real `property_listings`, `areas`, `cities`, `listing_search_outbox`).
  Container `pg-1316`, `localhost:5434`, db `postgres`.
- **OpenSearch:** `opensearchproject/opensearch:2.13.0` (container
  `opensearch-poc`) at `http://localhost:9200`, healthy.

Command (env vars inline — they do not persist between shells):

```bash
DATABASE_URL=postgresql://postgres:perf@localhost:5434/postgres \
OPENSEARCH_URL=http://localhost:9200 \
python3 -m pytest scripts/test_lifecycle_integration.py -v -s
```

Real result transcript:

```
collecting ... collected 10 items

scripts/test_lifecycle_integration.py::test_live_listing_indexed Created index 'test_lifecycle_proof_1780304600178'.
PASSED
scripts/test_lifecycle_integration.py::test_draft_not_indexed PASSED
scripts/test_lifecycle_integration.py::test_pending_review_not_indexed PASSED
scripts/test_lifecycle_integration.py::test_rejected_removes_from_index PASSED
scripts/test_lifecycle_integration.py::test_archived_removes_from_index PASSED
scripts/test_lifecycle_integration.py::test_lag_measured TC-6 lag stats: p50=55.004999999999995ms p95=55.004999999999995ms max=55.004999999999995ms
PASSED
scripts/test_lifecycle_integration.py::test_field_whitelist_no_pii PASSED
scripts/test_lifecycle_integration.py::test_discover_parity PASSED
scripts/test_lifecycle_integration.py::test_idempotency_duplicate_event PASSED
scripts/test_lifecycle_integration.py::test_skip_when_env_absent PASSED

============================== 10 passed in 0.64s ==============================
```

**Summary line: `10 passed in 0.64s`** (a prior run in the same session reported
`10 passed in 0.99s` without `-s`; both real). **TC-6 measured lag:
p50=55.00ms p95=55.00ms max=55.00ms** — a single recorded sample (one event per
test), where lag = `processed_at - occurred_at` and the test injects a 50ms
`time.sleep` between the two timestamps, so ~55ms is expected.

## Schema Notes

The `_insert_test_listing` helper inserts into `cities`, `areas`, and
`property_listings` aligned to the live schema (verified via `\d` against
`pg-1316`, Flyway v81):

- `cities.id`: serial integer (`DEFAULT nextval`) — **not** inserted; captured via
  `RETURNING id` (the integer is then used as `areas.city_id`). NOT NULL columns
  supplied: `slug`, `name`, `geo_center_lat`, `geo_center_lon`.
- `areas`: PK `area_key` (text); `city_id` integer FK → `cities.id`. NOT NULL
  columns supplied: `name`, `geo_center_lat`, `geo_center_lon`.
- `property_listings.id`: uuid. Check constraints enforced by the fixture values:
  `property_type='house'`, `status='LIVE'`, `listing_purpose='sale'`,
  `seller_type='owner'`, `trust_tier='D'` (must be A/B/C/D); `confidence_score`
  and `ranking_score` are integers.
- `property_listings.search_vector` / `listing_number` / `geog`: generated /
  sequence-backed — excluded from INSERT.
- All test rows use unique slugs / area_keys / UUIDs and TC-8 uses an isolated
  `city_slug` to prevent cross-test collision in Discover parity.

## What Could Break

1. **NOT NULL / check-constraint additions** — future migrations adding NOT NULL
   columns without defaults, or tightening the `property_type` / `status` /
   `listing_purpose` / `seller_type` / `trust_tier` check constraints, will break
   the `cities` / `areas` / `property_listings` INSERTs until the helper is
   updated to match. The fixture currently mirrors the live v81 schema exactly.

3. **TC-4/TC-5 version advancement** — the rejection/archive event advances the
   version with `now + timedelta(seconds=1)`. This avoids the `second must be in
   0..59` overflow that manual `now.second + 1` arithmetic hits when the test runs
   at a second boundary (`now.second == 59`).

4. **TC-9 idempotency semantics** — OpenSearch `external_gte` allows equal-version
   re-index (not a 409), so `counters2.indexed` may be 1 rather than `skipped` being 1.
   The test correctly accepts both outcomes; only `failures > 0` is an assertion failure.
