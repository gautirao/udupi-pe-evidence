# Incremental OpenSearch Indexing Pipeline — Issue #1312

**LOCAL/DEV PROTOTYPE ONLY.** Kafka-backed transactional outbox → OpenSearch
incremental indexing for listing lifecycle events.

---

## Overview

```
Listing lifecycle change
    ↓ (Python simulator writes outbox rows — Spring backend not yet wired)
listing_search_outbox (Postgres, V81 migration)
    ↓ opensearch_outbox_relay.py (polls WHERE published_at IS NULL)
Kafka topic: listing.search.events  (Redpanda, 127.0.0.1:9092)
    ↓ opensearch_indexer_consumer.py
OpenSearch index: listings_incremental_v1
```

The outbox→relay→consumer spine is **production-shaped** and can be reused
verbatim when the Spring Boot backend is wired. Only the simulator is throwaway.

---

## Event Schema (v1)

Topic: `listing.search.events`  
DLQ:   `listing.search.events.dlq`  
Key:   `listing_id` (per-listing Kafka ordering)  
Encoding: JSON UTF-8

| Field | Type | Notes |
|---|---|---|
| event_id | UUID | Unique per event (idempotency/audit) |
| event_type | string | One of 7 types below |
| event_version | int | v1=1; unknown version → DLQ, fail-closed |
| aggregate_type | string | Always "LISTING" |
| listing_id | string | OpenSearch `_id`; Kafka message key |
| occurred_at | TIMESTAMPTZ | When the lifecycle event occurred |
| source_updated_at | TIMESTAMPTZ | Drives external version (epoch_millis) |
| status | string | Listing status at event time |
| operation | INDEX\|DELETE | Producer hint only — consumer **recomputes from status** |
| document | object | Present ONLY when operation=INDEX; 18 public fields only |

### 7 Event Types

| Event type | Typical status | Consumer action |
|---|---|---|
| LISTING_CREATED | DRAFT (or LIVE) | INDEX iff LIVE, else DELETE |
| LISTING_APPROVED | LIVE | INDEX |
| LISTING_UPDATED | LIVE or non-LIVE | INDEX iff LIVE, else DELETE |
| LISTING_UNPUBLISHED | UNPUBLISHED | DELETE |
| LISTING_REJECTED | REJECTED | DELETE |
| LISTING_ARCHIVED | ARCHIVED | DELETE |
| LISTING_DELETED | (null) | DELETE |

---

## Visibility Invariant

**`operation = INDEX` if and only if `status == 'LIVE'`; `DELETE` for all other statuses.**

The consumer **recomputes** the operation from the `status` field — it never
trusts the producer's `operation` field. This is the single source of truth
and prevents any non-LIVE listing from reaching the search index.

---

## Idempotency

All OpenSearch mutations use `version_type=external_gte`,  
`version = epoch_millis(source_updated_at)` (fallback: `epoch_millis(occurred_at)`).

| Scenario | Result |
|---|---|
| RC-1(a): DELETE(T2) then stale INDEX(T1) | 409 → SKIPPED; doc stays deleted |
| RC-1(b): INDEX(T2) then older INDEX(T1) | 409 → SKIPPED; T2 retained |
| Exact duplicate (same version T) | external_gte allows equal → harmless re-write or 409; no corruption |
| Stale DELETE(T1) after INDEX(T2) | 409 → SKIPPED; newer live state wins |
| DELETE of absent doc | 404 → SKIPPED (idempotent success) |
| 5xx | DLQ produced; offset NOT committed; retried on next poll |

### Prototype Limitation — gc_deletes

The prototype index is created with `index.gc_deletes=5m`. Within this window,
a DELETE's versioned tombstone prevents a stale INDEX from resurrecting the doc.

**After the 5-minute window**, the tombstone is purged. A very-late stale INDEX
arriving after expiry **could resurrect a deleted document**. This is a known
prototype limitation.

**Production hardening** (explicitly deferred to M27 rollout):
- Maintain a persistent per-listing `last_seen_version` table, OR
- Use a compacted topic with last-write semantics.

---

## Bring-Up

### 1. Start local OpenSearch + Redpanda

```bash
docker compose -f docker-compose.opensearch.yml up -d
docker compose -f docker-compose.kafka.yml up -d
```

Verify:
```bash
curl http://localhost:9200/
rpk cluster info --brokers 127.0.0.1:9092
```

### 2. Install Python dependencies

```bash
pip install -r scripts/requirements.txt pytest
```

### 3. Configure environment

```bash
export DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
export KAFKA_BOOTSTRAP_SERVERS=localhost:9092
export OPENSEARCH_URL=http://localhost:9200
export OPENSEARCH_INDEX=listings_incremental_v1   # optional
```

### 4. Run the Flyway migration (V81)

Apply via your local Spring Boot startup or directly:

```bash
./mvnw -pl backend flyway:migrate
```

---

## Run the Pipeline

### Terminal 1 — Simulator (insert outbox rows)

```bash
python scripts/opensearch_outbox_simulator.py --scenario all --listing-id <uuid>
```

### Terminal 2 — Relay (outbox → Kafka)

```bash
python scripts/opensearch_outbox_relay.py --once
# Or continuous:
python scripts/opensearch_outbox_relay.py --follow
```

### Terminal 3 — Consumer (Kafka → OpenSearch)

```bash
python scripts/opensearch_indexer_consumer.py --once
# Or continuous:
python scripts/opensearch_indexer_consumer.py
```

### Verify in OpenSearch

```bash
curl http://localhost:9200/listings_incremental_v1/_count
curl http://localhost:9200/listings_incremental_v1/_search?pretty
```

---

## Run the Demo Script

Demonstrates all 7 lifecycle scenarios + idempotent-replay + out-of-order invariants
with explicit OpenSearch assertions:

```bash
python scripts/opensearch_pipeline_demo.py
```

Expected output: all scenarios PASS.

---

## Run Unit Tests

```bash
# New pipeline tests (no live broker, no live OpenSearch):
python -m pytest scripts/test_opensearch_pipeline.py -v

# Confirm existing rebuild tests still pass (must stay 23 green):
python -m pytest scripts/test_opensearch_rebuild.py -v

# Both together:
python -m pytest scripts/test_opensearch_pipeline.py scripts/test_opensearch_rebuild.py -v
```

---

## Safety Gates

All scripts validate environment before constructing any client:

| Variable | Gate |
|---|---|
| `KAFKA_BOOTSTRAP_SERVERS` | Every host in allowlist: `localhost, 127.0.0.1, ::1, redpanda, kafka` |
| `OPENSEARCH_URL` | Hostname must be localhost/127.0.0.1/::1 |
| `DATABASE_URL` | Hostname must be localhost/127.0.0.1/::1 |
| `OPENSEARCH_INDEX` | Must not be `listings_read` or match `listings_v*` |

Any violation → `EnvironmentError` + non-zero exit **before** any client is constructed.

---

## DLQ (Placeholder)

Failed events are produced to `listing.search.events.dlq` (same broker).
No reprocessor is built — DLQ reprocessing is **explicitly deferred** to M27.
Monitor the DLQ topic to detect failures:

```bash
rpk topic consume listing.search.events.dlq --brokers 127.0.0.1:9092
```

---

## What This Is NOT

- Not a production deployment.
- Not a repoint of the Discover read path — the `listings_read` alias is untouched.
- The Spring Boot backend does **not** emit events; the simulator is a throwaway stub.
- No 10k/100k scale testing (that is #1313).

---

## Files

| File | Purpose |
|---|---|
| `V81__listing_search_outbox.sql` | Outbox table DDL (Flyway migration) |
| `docker-compose.kafka.yml` | Redpanda local broker |
| `scripts/search_events.py` | Shared: enums, safety gates, visibility rule, helpers |
| `scripts/opensearch_outbox_simulator.py` | SIMULATOR: writes outbox rows (throwaway) |
| `scripts/opensearch_outbox_relay.py` | Relay: outbox → Kafka |
| `scripts/opensearch_indexer_consumer.py` | Consumer: Kafka → OpenSearch |
| `scripts/opensearch_pipeline_demo.py` | Demo: 7-scenario + invariant assertions |
| `scripts/test_opensearch_pipeline.py` | Unit tests (pytest, all mocked) |
| `scripts/requirements.txt` | Python dependencies |
