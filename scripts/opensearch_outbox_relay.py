#!/usr/bin/env python3
"""
opensearch_outbox_relay.py — Outbox-to-Kafka relay.
Issue #1312 — LOCAL/DEV prototype.

Polls listing_search_outbox WHERE published_at IS NULL ORDER BY id ASC LIMIT batch,
publishes each row to Kafka keyed by listing_id (in id order to preserve per-listing
ordering), then marks published_at AFTER broker ack.

At-least-once delivery guarantee:
  - published_at is set AFTER the broker ack (flush before advance).
  - If the process dies after ack but before the DB update, the row remains
    unpublished and will be re-sent on restart. The consumer's idempotency
    (external_gte versioning) absorbs the duplicate.

Modes:
  --once   : drain all unpublished rows, then exit.
  --follow : poll continuously (default); Ctrl-C to stop.

Usage:
    export DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
    export KAFKA_BOOTSTRAP_SERVERS=localhost:9092
    python scripts/opensearch_outbox_relay.py [--once] [--batch 100] [--poll-ms 500]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any

import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from scripts.search_events import (
    TOPIC,
    _check_db_safety_gate,
    _check_kafka_safety_gate,
    _safe_db_url_display,
)

# Module-level import so tests can patch 'confluent_kafka.Producer'.
# confluent-kafka may not be installed in all environments (e.g. CI without the
# native library); if so, scripts that don't actually call Kafka still import fine.
try:
    from confluent_kafka import Producer
except ImportError:  # pragma: no cover
    Producer = None  # type: ignore[assignment,misc]

# ---------------------------------------------------------------------------
# Relay core
# ---------------------------------------------------------------------------


def _fetch_unpublished(cur: Any, batch: int) -> list[dict]:
    cur.execute(
        """
        SELECT id, listing_id, payload
        FROM listing_search_outbox
        WHERE published_at IS NULL
        ORDER BY id ASC
        LIMIT %s
        FOR UPDATE SKIP LOCKED
        """,
        (batch,),
    )
    return [dict(r) for r in cur.fetchall()]


def _mark_published(cur: Any, row_id: int) -> None:
    cur.execute(
        "UPDATE listing_search_outbox SET published_at = now() WHERE id = %s",
        (row_id,),
    )


def run_relay(args: argparse.Namespace) -> None:  # noqa: C901
    db_url = args.db_url
    bootstrap = args.bootstrap_servers

    # Safety gates MUST run before any client is constructed.
    try:
        _check_db_safety_gate(db_url)
    except EnvironmentError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        _check_kafka_safety_gate(bootstrap)
    except EnvironmentError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    print("OpenSearch outbox relay -- issue #1312 (PROTOTYPE ONLY)")
    print(f"  DB URL     : {_safe_db_url_display(db_url)}")
    print(f"  Broker     : {bootstrap}")
    print(f"  Topic      : {TOPIC}")
    print(f"  Batch      : {args.batch}")
    print(f"  Mode       : {'--once (drain+exit)' if args.once else '--follow (continuous)'}")
    print()

    if Producer is None:  # pragma: no cover
        print("ERROR: confluent-kafka is not installed. Run: pip install confluent-kafka", file=sys.stderr)
        sys.exit(1)

    producer = Producer({"bootstrap.servers": bootstrap})

    conn = psycopg2.connect(db_url)
    total_published = 0

    try:
        while True:
            with conn:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    rows = _fetch_unpublished(cur, args.batch)

                    if not rows:
                        if args.once:
                            break
                        time.sleep(args.poll_ms / 1000.0)
                        continue

                    for row in rows:
                        listing_id = str(row["listing_id"])
                        payload_bytes = json.dumps(row["payload"]).encode("utf-8")
                        if isinstance(row["payload"], str):
                            payload_bytes = row["payload"].encode("utf-8")

                        # Produce keyed by listing_id (per-listing ordering guarantee).
                        producer.produce(
                            topic=TOPIC,
                            key=listing_id.encode("utf-8"),
                            value=payload_bytes,
                        )

                    # Flush ensures ALL messages are acked by the broker before
                    # we mark any row as published. At-least-once: if flush fails,
                    # the exception propagates; rows stay unpublished → re-sent.
                    undelivered = producer.flush(timeout=30)
                    if undelivered > 0:
                        print(
                            f"WARNING: {undelivered} message(s) not delivered after flush.",
                            file=sys.stderr,
                        )
                        # Do NOT mark published — rows will be retried.
                        continue

                    # Mark published AFTER ack (at-least-once).
                    for row in rows:
                        _mark_published(cur, row["id"])

                    batch_count = len(rows)
                    total_published += batch_count
                    print(
                        f"Relay: published {batch_count} row(s)  "
                        f"(total={total_published}  "
                        f"ids={rows[0]['id']}–{rows[-1]['id']})"
                    )

                    if args.once and len(rows) < args.batch:
                        # Last partial batch — drain complete.
                        break

    except KeyboardInterrupt:
        print("\nRelay: interrupted by user.")
    finally:
        conn.close()

    print(f"\nRelay complete: {total_published} row(s) published.")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Outbox-to-Kafka relay for the incremental indexing prototype. "
            "Polls listing_search_outbox for unpublished rows and publishes "
            "them to Kafka keyed by listing_id. (issue #1312)"
        )
    )
    parser.add_argument(
        "--db-url",
        default=os.environ.get("DATABASE_URL", ""),
        help="Postgres connection URL (default: $DATABASE_URL)",
    )
    parser.add_argument(
        "--bootstrap-servers",
        default=os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"),
        help="Kafka bootstrap servers (default: $KAFKA_BOOTSTRAP_SERVERS or localhost:9092)",
    )
    parser.add_argument(
        "--batch",
        type=int,
        default=100,
        metavar="N",
        help="Max rows per poll batch (default: 100)",
    )
    parser.add_argument(
        "--poll-ms",
        type=int,
        default=500,
        metavar="MS",
        help="Poll interval in milliseconds when no rows found (default: 500)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Drain all unpublished rows and exit (default: follow mode)",
    )
    return parser


if __name__ == "__main__":
    run_relay(_build_parser().parse_args())
