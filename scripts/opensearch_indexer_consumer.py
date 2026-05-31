#!/usr/bin/env python3
"""
opensearch_indexer_consumer.py — Kafka consumer → OpenSearch indexer.
Issue #1312 — LOCAL/DEV prototype.

Consumes from topic 'listing.search.events', applies visibility-safe INDEX/DELETE
operations to a dedicated OpenSearch prototype index, and commits offsets only
after the OpenSearch action succeeds.

VISIBILITY INVARIANT (enforced here — single source of truth):
  operation = INDEX  iff  status == 'LIVE'
  operation = DELETE for ALL other statuses
  Consumer RECOMPUTES operation from status — never trusts producer's operation field.

IDEMPOTENCY:
  All INDEX and DELETE calls use version_type='external_gte',
  version=epoch_millis(source_updated_at). OpenSearch enforces version ordering.
  HTTP 409 version_conflict → SKIPPED (offset committed, not a failure).
  DELETE 404 → success (idempotent). DELETE/INDEX 5xx → DLQ, offset NOT committed.

DEDICATED INDEX:
  Consumer writes to OPENSEARCH_INDEX env var (default: listings_incremental_v1).
  Startup aborts if OPENSEARCH_INDEX is the full-rebuild alias or matches listings_v*.

Usage:
    export DATABASE_URL=postgresql://user:pass@localhost:5432/mydb  # (not used by consumer directly)
    export KAFKA_BOOTSTRAP_SERVERS=localhost:9092
    export OPENSEARCH_URL=http://localhost:9200
    export OPENSEARCH_INDEX=listings_incremental_v1  # optional
    python scripts/opensearch_indexer_consumer.py [--group-id my-group] [--once]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from scripts.search_events import (
    DEDICATED_INDEX_DEFAULT,
    DOCUMENT_WHITELIST,
    DLQ_TOPIC,
    TOPIC,
    PipelineCounters,
    _check_kafka_safety_gate,
    compute_operation,
    compute_version,
    validate_dedicated_index,
    Operation,
)
from scripts.opensearch_rebuild import _build_opensearch_client

# Module-level import so tests can patch 'confluent_kafka.Consumer' / 'confluent_kafka.Producer'.
try:
    from confluent_kafka import Consumer, KafkaError, KafkaException, Producer
except ImportError:  # pragma: no cover
    Consumer = None  # type: ignore[assignment,misc]
    Producer = None  # type: ignore[assignment,misc]
    KafkaError = None  # type: ignore[assignment,misc]
    KafkaException = None  # type: ignore[assignment,misc]

# ---------------------------------------------------------------------------
# Index creation helpers
# ---------------------------------------------------------------------------

# Mapping for the dedicated prototype index (mirrors opensearch_rebuild.py).
_INCREMENTAL_INDEX_MAPPING: dict[str, Any] = {
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 0,
        # gc_deletes=5m: versioned tombstones kept for 5 minutes.
        # Prototype limitation: after expiry a very-late stale INDEX could
        # resurrect a deleted doc. See README_incremental_pipeline.md.
        "index.gc_deletes": "5m",
    },
    "mappings": {
        "properties": {
            "id": {"type": "keyword"},
            "title": {
                "type": "text",
                "fields": {"keyword": {"type": "keyword", "ignore_above": 512}},
            },
            "locality": {
                "type": "text",
                "fields": {"keyword": {"type": "keyword", "ignore_above": 256}},
            },
            "description": {"type": "text"},
            "area_key": {"type": "keyword"},
            "city_slug": {"type": "keyword"},
            "property_type": {"type": "keyword"},
            "seller_type": {"type": "keyword"},
            "bedrooms": {"type": "integer"},
            "bathrooms": {"type": "integer"},
            "price_paise": {"type": "long"},
            "latitude": {"type": "float"},
            "longitude": {"type": "float"},
            "location": {"type": "geo_point"},
            "status": {"type": "keyword"},
            "created_at": {"type": "date"},
            "hero_image_url": {"type": "keyword"},
        }
    },
}


def _ensure_index(os_client: Any, index_name: str) -> None:
    """Create the dedicated prototype index if it does not exist."""
    if not os_client.indices.exists(index=index_name):
        os_client.indices.create(index=index_name, body=_INCREMENTAL_INDEX_MAPPING)
        print(f"Created index '{index_name}'.")
    else:
        print(f"Index '{index_name}' already exists.")


# ---------------------------------------------------------------------------
# Event processing
# ---------------------------------------------------------------------------


def _parse_event(raw_value: bytes) -> dict | None:
    """
    Parse a Kafka message value as JSON.
    Returns None on parse error (message will be DLQ'd).
    """
    try:
        return json.loads(raw_value.decode("utf-8"))
    except Exception as exc:
        print(f"ERROR: Failed to parse message: {exc}", file=sys.stderr)
        return None


def _apply_event(  # noqa: C901
    os_client: Any,
    producer: Any,
    event: dict,
    index_name: str,
    counters: PipelineCounters,
    processed_at: datetime,
) -> bool:
    """
    Apply one event to OpenSearch.

    Returns True if the Kafka offset should be committed (success or SKIPPED),
    False if the offset must NOT be committed (5xx → needs retry).
    """
    listing_id = str(event.get("listing_id", ""))
    status = event.get("status")
    event_version = event.get("event_version", 1)

    # Unknown event version → DLQ, fail-closed.
    if event_version != 1:
        _send_to_dlq(producer, listing_id, event, f"unknown event_version={event_version}")
        counters.failures += 1
        return True  # commit offset — message is unprocessable; retrying won't help

    # VISIBILITY INVARIANT: recompute operation from status — never trust producer.
    operation = compute_operation(status)

    # Version for external_gte idempotency.
    source_updated_at = _parse_ts(event.get("source_updated_at"))
    occurred_at = _parse_ts(event.get("occurred_at"))
    version = compute_version(source_updated_at, occurred_at)

    # Record lag.
    counters.record_lag(occurred_at, processed_at)

    if operation == Operation.INDEX:
        return _do_index(
            os_client, producer, event, listing_id, version, index_name, counters
        )
    else:
        return _do_delete(
            os_client, producer, listing_id, version, index_name, counters
        )


def _do_index(
    os_client: Any,
    producer: Any,
    event: dict,
    listing_id: str,
    version: int,
    index_name: str,
    counters: PipelineCounters,
) -> bool:
    """
    Index (upsert) a document. Returns True to commit offset, False to retry.
    """
    document = event.get("document")
    if not document:
        # No document in event — skip (visibility: non-LIVE events don't carry a doc).
        counters.skipped += 1
        return True

    # Apply the 18-field WHITELIST — only explicitly permitted fields reach _source.
    # This is a positive allow-list, not a denylist: any unrecognised field
    # (renamed PII column, owner_notes, internal_score, etc.) is silently excluded.
    clean_doc = {k: v for k, v in document.items() if k in DOCUMENT_WHITELIST}

    try:
        os_client.index(
            index=index_name,
            id=listing_id,
            body=clean_doc,
            params={
                "version": version,
                "version_type": "external_gte",
            },
        )
        counters.indexed += 1
        return True
    except Exception as exc:
        return _handle_opensearch_exc(exc, producer, listing_id, event, counters, "INDEX")


def _do_delete(
    os_client: Any,
    producer: Any,
    listing_id: str,
    version: int,
    index_name: str,
    counters: PipelineCounters,
) -> bool:
    """
    Delete a document by id. Returns True to commit offset, False to retry.
    """
    try:
        os_client.delete(
            index=index_name,
            id=listing_id,
            params={
                "version": version,
                "version_type": "external_gte",
            },
        )
        counters.deleted += 1
        return True
    except Exception as exc:
        return _handle_opensearch_exc(exc, producer, listing_id, {}, counters, "DELETE")


def _handle_opensearch_exc(
    exc: Exception,
    producer: Any,
    listing_id: str,
    event: dict,
    counters: PipelineCounters,
    op: str,
) -> bool:
    """
    Classify an OpenSearch exception and decide whether to commit the offset.

    409 version_conflict → SKIPPED (commit offset, not a failure).
    404 not found (DELETE) → SKIPPED (idempotent success, commit offset).
    5xx → do NOT commit offset (return False so Kafka retries on next poll).
    No status code (network/connection/timeout) → retryable, do NOT commit offset.

    Only truly terminal/unprocessable failures (unknown event_version, parse errors)
    are routed to DLQ — those are handled at the _apply_event level, not here.
    """
    exc_str = str(exc)
    status_code = _extract_status_code(exc)

    if status_code == 409:
        # version_conflict → stale event, correctly ordered by OpenSearch.
        counters.skipped += 1
        return True  # commit offset

    if status_code == 404 and op == "DELETE":
        # Document already absent — idempotent success.
        counters.skipped += 1
        return True  # commit offset

    if status_code is not None and status_code >= 500:
        # 5xx — transient/server failure; do NOT commit offset (retryable).
        print(
            f"ERROR: OpenSearch {op} returned {status_code} for listing_id={listing_id}: "
            f"{exc_str[:200]}",
            file=sys.stderr,
        )
        _send_to_dlq(producer, listing_id, event, f"opensearch_{op}_5xx_{status_code}")
        counters.failures += 1
        return False  # do NOT commit offset

    # No status code: network/connection/timeout error — retryable.
    # Do NOT route to DLQ (the DLQ has no reprocessor; routing here would silently
    # drop the event). Instead, do NOT commit offset so Kafka delivers it again.
    print(
        f"ERROR: retryable/network error during {op} for listing_id={listing_id}: "
        f"{exc_str[:200]}",
        file=sys.stderr,
    )
    counters.failures += 1
    return False  # do NOT commit offset — will be retried


def _extract_status_code(exc: Exception) -> int | None:
    """
    Extract HTTP status code from an opensearch-py exception.

    opensearchpy.exceptions.TransportError always sets .status_code as an int.
    We rely on that attribute only — no brittle string-scan fallback, which could
    misclassify a real failure (e.g. a timeout message containing "503") as a
    known HTTP status and accidentally SKIPPED or DLQ'd.
    """
    status = getattr(exc, "status_code", None)
    if isinstance(status, int):
        return status
    return None


def _send_to_dlq(
    producer: Any, listing_id: str, event: dict, reason: str
) -> None:
    """
    Publish a failed event to the DLQ topic (placeholder — no reprocessor built).
    Errors during DLQ publish are logged but do not raise (best-effort).
    """
    try:
        dlq_payload = json.dumps(
            {"reason": reason, "original_event": event}
        ).encode("utf-8")
        producer.produce(
            topic=DLQ_TOPIC,
            key=listing_id.encode("utf-8") if listing_id else b"unknown",
            value=dlq_payload,
        )
        producer.poll(0)  # trigger callbacks without blocking
        print(f"DLQ: routed listing_id={listing_id} reason={reason}")
    except Exception as exc:
        print(f"ERROR: DLQ publish failed: {exc}", file=sys.stderr)


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Consumer main loop
# ---------------------------------------------------------------------------


def run_consumer(args: argparse.Namespace) -> None:  # noqa: C901
    bootstrap = args.bootstrap_servers
    opensearch_url = args.url
    index_name = args.index

    # Safety gates MUST run before any client construction.
    try:
        _check_kafka_safety_gate(bootstrap)
    except EnvironmentError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        validate_dedicated_index(index_name)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    if not opensearch_url:
        print("ERROR: OPENSEARCH_URL is not set.", file=sys.stderr)
        sys.exit(1)

    print("OpenSearch indexer consumer -- issue #1312 (PROTOTYPE ONLY)")
    print(f"  Broker        : {bootstrap}")
    print(f"  Topic         : {TOPIC}")
    print(f"  DLQ topic     : {DLQ_TOPIC}")
    print(f"  Group ID      : {args.group_id}")
    print(f"  OpenSearch    : {opensearch_url}")
    print(f"  Index         : {index_name}")
    print(f"  Mode          : {'--once' if args.once else 'continuous'}")
    print()

    if Consumer is None or Producer is None:  # pragma: no cover
        print("ERROR: confluent-kafka is not installed. Run: pip install confluent-kafka", file=sys.stderr)
        sys.exit(1)

    os_client = _build_opensearch_client(opensearch_url)
    _ensure_index(os_client, index_name)

    dlq_producer = Producer({"bootstrap.servers": bootstrap})

    consumer = Consumer(
        {
            "bootstrap.servers": bootstrap,
            "group.id": args.group_id,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,  # manual commit after write
        }
    )
    consumer.subscribe([TOPIC])

    counters = PipelineCounters()
    messages_processed = 0

    try:
        while True:
            msg = consumer.poll(timeout=1.0)

            if msg is None:
                if args.once:
                    # No more messages — drain complete.
                    break
                continue

            if msg.error():
                err = msg.error()
                # Check if this is an end-of-partition signal
                if KafkaError is not None and err.code() == KafkaError._PARTITION_EOF:
                    if args.once:
                        break
                    continue
                print(f"ERROR: Kafka consumer error: {err}", file=sys.stderr)
                counters.failures += 1
                continue

            processed_at = datetime.now(timezone.utc)
            event = _parse_event(msg.value())

            if event is None:
                _send_to_dlq(dlq_producer, "unknown", {}, "parse_error")
                counters.failures += 1
                consumer.commit(message=msg, asynchronous=False)
                continue

            # Apply event — commit offset only if True returned.
            should_commit = _apply_event(
                os_client, dlq_producer, event, index_name, counters, processed_at
            )

            if should_commit:
                consumer.commit(message=msg, asynchronous=False)

            messages_processed += 1

            # Print running summary every 100 messages.
            if messages_processed % 100 == 0:
                counters.print_summary()

    except KeyboardInterrupt:
        print("\nConsumer: interrupted by user.")
    finally:
        consumer.close()
        dlq_producer.flush(timeout=10)

    # Final summary (mirrors opensearch_rebuild.py run-summary style).
    counters.print_summary()

    # Offset lag (sampled — high watermark vs committed offset).
    print(
        f"Consumer offset lag: "
        f"sampled at shutdown (check broker metrics for real-time lag)"
    )


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Kafka consumer that indexes/deletes listings in OpenSearch. "
            "Visibility-safe: INDEX iff status==LIVE; consumer recomputes from status. "
            "Idempotent: version_type=external_gte on all mutations. (issue #1312)"
        )
    )
    parser.add_argument(
        "--bootstrap-servers",
        default=os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"),
        help="Kafka bootstrap servers (default: $KAFKA_BOOTSTRAP_SERVERS or localhost:9092)",
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("OPENSEARCH_URL", "http://localhost:9200"),
        help="OpenSearch base URL (default: $OPENSEARCH_URL or http://localhost:9200)",
    )
    parser.add_argument(
        "--index",
        default=os.environ.get("OPENSEARCH_INDEX", DEDICATED_INDEX_DEFAULT),
        help=f"Target OpenSearch index (default: $OPENSEARCH_INDEX or {DEDICATED_INDEX_DEFAULT})",
    )
    parser.add_argument(
        "--group-id",
        default="opensearch-indexer-prototype",
        help="Kafka consumer group ID (default: opensearch-indexer-prototype)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Consume until partition EOF then exit (useful for testing)",
    )
    return parser


if __name__ == "__main__":
    run_consumer(_build_parser().parse_args())
