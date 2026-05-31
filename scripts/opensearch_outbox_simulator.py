#!/usr/bin/env python3
"""
opensearch_outbox_simulator.py — Outbox row producer (SIMULATOR / TEST ONLY).
Issue #1312 — LOCAL/DEV prototype.

##########################################################################
# PROTOTYPE BANNER                                                        #
# This script SIMULATES the producer side of the transactional outbox.   #
# The Spring Boot backend does NOT yet write outbox rows.                 #
# This simulator exists solely for local prototype / testing purposes     #
# and is THROWAWAY once the backend is wired.                             #
# DO NOT use this in production or shared environments.                   #
##########################################################################

Writes rows into listing_search_outbox mimicking the 7 listing lifecycle
transitions. The outbox schema (V81) is the same contract a future Spring
@Transactional writer would populate in the same tx as the listing change.

Usage:
    export DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
    python scripts/opensearch_outbox_simulator.py [--listing-id UUID] [--scenario all]

Scenarios:
    all (default) — inserts one row per event type to simulate a full lifecycle
    created       — LISTING_CREATED (status=DRAFT)
    approved      — LISTING_APPROVED (status=LIVE)
    updated       — LISTING_UPDATED (status=LIVE)
    unpublished   — LISTING_UNPUBLISHED (status=UNPUBLISHED)
    rejected      — LISTING_REJECTED (status=REJECTED)
    archived      — LISTING_ARCHIVED (status=ARCHIVED)
    deleted       — LISTING_DELETED (status=None)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from scripts.search_events import (
    EventType,
    Operation,
    _check_db_safety_gate,
    _safe_db_url_display,
    compute_operation,
    compute_version,
)

# ---------------------------------------------------------------------------
# Lifecycle scenario definitions
# ---------------------------------------------------------------------------

# Each scenario: (event_type, status, time_offset_seconds)
# time_offset_seconds is relative to base_time to simulate monotonic progression.
_LIFECYCLE_SCENARIOS: list[tuple[EventType, str | None, int]] = [
    (EventType.LISTING_CREATED,     "DRAFT",       0),
    (EventType.LISTING_APPROVED,    "LIVE",        10),
    (EventType.LISTING_UPDATED,     "LIVE",        20),
    (EventType.LISTING_UNPUBLISHED, "UNPUBLISHED", 30),
    (EventType.LISTING_REJECTED,    "REJECTED",    40),
    (EventType.LISTING_ARCHIVED,    "ARCHIVED",    50),
    (EventType.LISTING_DELETED,     None,          60),
]

_SCENARIO_MAP: dict[str, tuple[EventType, str | None, int]] = {
    et.value.lower().replace("listing_", ""): (et, status, offset)
    for et, status, offset in _LIFECYCLE_SCENARIOS
}


def _build_payload(
    listing_id: str,
    event_type: EventType,
    status: str | None,
    occurred_at: datetime,
    source_updated_at: datetime,
    event_id: str,
) -> dict[str, Any]:
    """
    Build the JSON payload for an outbox row.

    The payload mirrors the Kafka event wire schema defined in [event_schema].
    A document body is included ONLY for INDEX events (operation=INDEX iff status==LIVE).
    No PII fields are included.
    """
    operation = compute_operation(status)

    payload: dict[str, Any] = {
        "event_id": event_id,
        "event_type": event_type.value,
        "event_version": 1,
        "aggregate_type": "LISTING",
        "listing_id": listing_id,
        "occurred_at": occurred_at.isoformat(),
        "source_updated_at": source_updated_at.isoformat(),
        "status": status,
        "operation": operation.value,
    }

    if operation == Operation.INDEX:
        # Minimal synthetic document for simulator purposes only.
        # Real documents come from the DB query in the consumer.
        payload["document"] = {
            "id": listing_id,
            "title": f"Simulated listing {listing_id[:8]}",
            "locality": "Udupi",
            "description": "Simulator-generated listing for prototype testing",
            "area_key": "area_sim_001",
            "city_slug": "udupi",
            "property_type": "HOUSE",
            "seller_type": "OWNER",
            "bedrooms": 3,
            "bathrooms": 2,
            "price_paise": 5_000_000,
            "latitude": 13.3409,
            "longitude": 74.7421,
            "location": {"lat": 13.3409, "lon": 74.7421},
            "status": status,
            "created_at": occurred_at.isoformat(),
        }

    return payload


def insert_outbox_row(
    cur: Any,
    listing_id: str,
    event_type: EventType,
    status: str | None,
    occurred_at: datetime,
    source_updated_at: datetime,
) -> str:
    """Insert one outbox row and return the event_id."""
    event_id = str(uuid.uuid4())
    operation = compute_operation(status)
    payload = _build_payload(
        listing_id, event_type, status, occurred_at, source_updated_at, event_id
    )

    cur.execute(
        """
        INSERT INTO listing_search_outbox
            (event_id, aggregate_type, listing_id, event_type, event_version,
             operation, status, occurred_at, source_updated_at, payload)
        VALUES
            (%(event_id)s, %(aggregate_type)s, %(listing_id)s, %(event_type)s,
             %(event_version)s, %(operation)s, %(status)s, %(occurred_at)s,
             %(source_updated_at)s, %(payload)s)
        """,
        {
            "event_id": event_id,
            "aggregate_type": "LISTING",
            "listing_id": listing_id,
            "event_type": event_type.value,
            "event_version": 1,
            "operation": operation.value,
            "status": status,
            "occurred_at": occurred_at,
            "source_updated_at": source_updated_at,
            "payload": json.dumps(payload),
        },
    )
    return event_id


def run_simulator(args: argparse.Namespace) -> None:
    db_url = args.db_url

    # Safety gate MUST run before psycopg2.connect.
    try:
        _check_db_safety_gate(db_url)
    except EnvironmentError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    print("OpenSearch outbox simulator -- issue #1312 (PROTOTYPE ONLY)")
    print(f"  DB URL     : {_safe_db_url_display(db_url)}")
    print(f"  Listing ID : {args.listing_id}")
    print(f"  Scenario   : {args.scenario}")
    print()

    base_time = datetime.now(timezone.utc)

    if args.scenario == "all":
        scenarios = _LIFECYCLE_SCENARIOS
    else:
        key = args.scenario.lower()
        if key not in _SCENARIO_MAP:
            print(
                f"ERROR: unknown scenario '{args.scenario}'. "
                f"Valid: all, {', '.join(sorted(_SCENARIO_MAP.keys()))}",
                file=sys.stderr,
            )
            sys.exit(1)
        scenarios = [_SCENARIO_MAP[key]]

    conn = psycopg2.connect(db_url)
    try:
        with conn:
            with conn.cursor() as cur:
                inserted = 0
                for event_type, status, offset_secs in scenarios:
                    occurred_at = base_time + timedelta(seconds=offset_secs)
                    source_updated_at = occurred_at
                    event_id = insert_outbox_row(
                        cur,
                        args.listing_id,
                        event_type,
                        status,
                        occurred_at,
                        source_updated_at,
                    )
                    operation = compute_operation(status)
                    print(
                        f"  Inserted: event_type={event_type.value:<22} "
                        f"status={str(status):<14} "
                        f"operation={operation.value:<6}  "
                        f"event_id={event_id[:8]}..."
                    )
                    inserted += 1

        print(f"\nSimulator: {inserted} outbox row(s) inserted for listing_id={args.listing_id}")
    finally:
        conn.close()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "PROTOTYPE SIMULATOR — writes listing_search_outbox rows to mimic "
            "the 7 listing lifecycle transitions. "
            "The Spring Boot backend does NOT yet write outbox rows. (issue #1312)"
        )
    )
    parser.add_argument(
        "--db-url",
        default=os.environ.get("DATABASE_URL", ""),
        help="Postgres connection URL (default: $DATABASE_URL)",
    )
    parser.add_argument(
        "--listing-id",
        default=str(uuid.uuid4()),
        help="Listing ID to simulate (default: random UUID)",
    )
    parser.add_argument(
        "--scenario",
        default="all",
        choices=["all"] + list(_SCENARIO_MAP.keys()),
        help="Lifecycle scenario to simulate (default: all)",
    )
    return parser


if __name__ == "__main__":
    run_simulator(_build_parser().parse_args())
