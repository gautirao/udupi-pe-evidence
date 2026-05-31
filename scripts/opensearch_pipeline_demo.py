#!/usr/bin/env python3
"""
opensearch_pipeline_demo.py — End-to-end scenario demo for the incremental pipeline.
Issue #1312 — LOCAL/DEV prototype.

Demonstrates all 7 listing lifecycle scenarios PLUS idempotent-replay and
out-of-order invariants, with explicit OpenSearch assertions per scenario.

Prerequisites (all running locally):
    docker compose -f docker-compose.opensearch.yml up -d
    docker compose -f docker-compose.kafka.yml up -d
    export DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
    export KAFKA_BOOTSTRAP_SERVERS=localhost:9092
    export OPENSEARCH_URL=http://localhost:9200

Run:
    python scripts/opensearch_pipeline_demo.py

The demo inserts outbox rows directly (bypassing the relay for simplicity),
then applies them via the consumer's _apply_event logic directly against
OpenSearch and reports PASS/FAIL per scenario.
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from scripts.search_events import (
    DEDICATED_INDEX_DEFAULT,
    PipelineCounters,
    _check_kafka_safety_gate,
    compute_operation,
    compute_version,
    validate_dedicated_index,
    Operation,
)
from scripts.opensearch_rebuild import _build_opensearch_client

DEMO_INDEX = os.environ.get("OPENSEARCH_INDEX", "listings_incremental_demo")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_event(
    listing_id: str,
    event_type: str,
    status: str | None,
    occurred_at: datetime,
    source_updated_at: datetime | None = None,
) -> dict:
    """Build a synthetic pipeline event dict."""
    if source_updated_at is None:
        source_updated_at = occurred_at
    operation = compute_operation(status)
    event: dict = {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "event_version": 1,
        "aggregate_type": "LISTING",
        "listing_id": listing_id,
        "occurred_at": occurred_at.isoformat(),
        "source_updated_at": source_updated_at.isoformat(),
        "status": status,
        "operation": operation.value,
    }
    if operation == Operation.INDEX:
        event["document"] = {
            "id": listing_id,
            "title": f"Demo listing {listing_id[:8]}",
            "locality": "Udupi",
            "description": "Demo listing for pipeline scenario testing",
            "area_key": "area_demo_001",
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
    return event


def _apply(os_client: Any, event: dict, counters: PipelineCounters) -> bool:
    """Apply a single event using the consumer's logic (imported inline)."""
    from scripts.opensearch_indexer_consumer import _apply_event  # noqa: PLC0415

    processed_at = datetime.now(timezone.utc)
    return _apply_event(os_client, _noop_producer(), event, DEMO_INDEX, counters, processed_at)


class _noop_producer:
    """Stub producer that discards DLQ messages in the demo."""
    def produce(self, **kwargs): pass
    def poll(self, *args): pass
    def flush(self, *args): return 0


def _doc_exists(os_client: Any, listing_id: str) -> bool:
    try:
        return os_client.exists(index=DEMO_INDEX, id=listing_id)
    except Exception:
        return False


def _refresh(os_client: Any) -> None:
    os_client.indices.refresh(index=DEMO_INDEX)


def _assert(condition: bool, msg: str) -> None:
    if not condition:
        print(f"  FAIL: {msg}")
    else:
        print(f"  PASS: {msg}")


# ---------------------------------------------------------------------------
# Scenario runner
# ---------------------------------------------------------------------------


def run_demo() -> None:  # noqa: C901
    opensearch_url = os.environ.get("OPENSEARCH_URL", "http://localhost:9200")
    bootstrap = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")

    # Safety gates
    try:
        _check_kafka_safety_gate(bootstrap)
    except EnvironmentError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        validate_dedicated_index(DEMO_INDEX)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    print("OpenSearch incremental pipeline demo -- issue #1312 (PROTOTYPE ONLY)")
    print(f"  OpenSearch : {opensearch_url}")
    print(f"  Demo index : {DEMO_INDEX}")
    print()

    os_client = _build_opensearch_client(opensearch_url)

    # Create demo index with gc_deletes=5m
    from scripts.opensearch_indexer_consumer import _ensure_index, _INCREMENTAL_INDEX_MAPPING  # noqa: PLC0415
    # Use a copy with demo-friendly settings
    if os_client.indices.exists(index=DEMO_INDEX):
        os_client.indices.delete(index=DEMO_INDEX)
        print(f"Deleted pre-existing demo index '{DEMO_INDEX}'")
    _ensure_index(os_client, DEMO_INDEX)
    print()

    base_time = datetime.now(timezone.utc)
    counters = PipelineCounters()
    results: list[tuple[str, bool]] = []

    # -----------------------------------------------------------------------
    # Scenario 1: LISTING_CREATED (status=DRAFT) → DELETE (not LIVE)
    # -----------------------------------------------------------------------
    print("Scenario 1: LISTING_CREATED (status=DRAFT) → should NOT be indexed")
    lid1 = str(uuid.uuid4())
    ev = _make_event(lid1, "LISTING_CREATED", "DRAFT", base_time)
    _apply(os_client, ev, counters)
    _refresh(os_client)
    exists = _doc_exists(os_client, lid1)
    _assert(not exists, f"DRAFT listing {lid1[:8]} must NOT be in index")
    results.append(("S1: LISTING_CREATED(DRAFT)→not-indexed", not exists))
    print()

    # -----------------------------------------------------------------------
    # Scenario 2: LISTING_APPROVED (status=LIVE) → INDEX
    # -----------------------------------------------------------------------
    print("Scenario 2: LISTING_APPROVED (status=LIVE) → should be indexed")
    lid2 = str(uuid.uuid4())
    t2 = base_time + timedelta(seconds=10)
    ev = _make_event(lid2, "LISTING_APPROVED", "LIVE", t2)
    _apply(os_client, ev, counters)
    _refresh(os_client)
    exists = _doc_exists(os_client, lid2)
    _assert(exists, f"LIVE listing {lid2[:8]} must be in index")
    results.append(("S2: LISTING_APPROVED(LIVE)→indexed", exists))
    print()

    # -----------------------------------------------------------------------
    # Scenario 3: LISTING_UPDATED (status=LIVE) → INDEX (update)
    # -----------------------------------------------------------------------
    print("Scenario 3: LISTING_UPDATED (status=LIVE) → should update doc in index")
    t3 = base_time + timedelta(seconds=20)
    ev = _make_event(lid2, "LISTING_UPDATED", "LIVE", t3)
    ev["document"]["title"] = "Updated title for demo"
    _apply(os_client, ev, counters)
    _refresh(os_client)
    doc = os_client.get(index=DEMO_INDEX, id=lid2)
    updated_title = doc["_source"].get("title") == "Updated title for demo"
    _assert(updated_title, f"Updated title must be reflected in index")
    results.append(("S3: LISTING_UPDATED(LIVE)→updated", updated_title))
    print()

    # -----------------------------------------------------------------------
    # Scenario 4: LISTING_UNPUBLISHED → DELETE
    # -----------------------------------------------------------------------
    print("Scenario 4: LISTING_UNPUBLISHED → should be removed from index")
    t4 = base_time + timedelta(seconds=30)
    ev = _make_event(lid2, "LISTING_UNPUBLISHED", "UNPUBLISHED", t4)
    _apply(os_client, ev, counters)
    _refresh(os_client)
    exists = _doc_exists(os_client, lid2)
    _assert(not exists, f"UNPUBLISHED listing {lid2[:8]} must NOT be in index")
    results.append(("S4: LISTING_UNPUBLISHED→removed", not exists))
    print()

    # -----------------------------------------------------------------------
    # Scenario 5: LISTING_REJECTED → DELETE (on a fresh listing)
    # -----------------------------------------------------------------------
    print("Scenario 5: LISTING_REJECTED → should be absent from index")
    lid5 = str(uuid.uuid4())
    t5 = base_time + timedelta(seconds=40)
    ev = _make_event(lid5, "LISTING_REJECTED", "REJECTED", t5)
    _apply(os_client, ev, counters)
    _refresh(os_client)
    exists = _doc_exists(os_client, lid5)
    _assert(not exists, f"REJECTED listing {lid5[:8]} must NOT be in index")
    results.append(("S5: LISTING_REJECTED→not-indexed", not exists))
    print()

    # -----------------------------------------------------------------------
    # Scenario 6: LISTING_ARCHIVED → DELETE
    # -----------------------------------------------------------------------
    print("Scenario 6: LISTING_ARCHIVED → should be absent from index")
    lid6 = str(uuid.uuid4())
    t6 = base_time + timedelta(seconds=50)
    ev = _make_event(lid6, "LISTING_ARCHIVED", "ARCHIVED", t6)
    _apply(os_client, ev, counters)
    _refresh(os_client)
    exists = _doc_exists(os_client, lid6)
    _assert(not exists, f"ARCHIVED listing {lid6[:8]} must NOT be in index")
    results.append(("S6: LISTING_ARCHIVED→not-indexed", not exists))
    print()

    # -----------------------------------------------------------------------
    # Scenario 7: LISTING_DELETED → DELETE (404=success on absent doc)
    # -----------------------------------------------------------------------
    print("Scenario 7: LISTING_DELETED on absent doc → 404 treated as success (idempotent)")
    lid7 = str(uuid.uuid4())
    t7 = base_time + timedelta(seconds=60)
    pre_del = counters.deleted + counters.skipped
    ev = _make_event(lid7, "LISTING_DELETED", None, t7)
    _apply(os_client, ev, counters)
    post_del = counters.deleted + counters.skipped
    _assert(post_del > pre_del, f"LISTING_DELETED on absent doc must increment deleted or skipped")
    results.append(("S7: LISTING_DELETED(absent)→success", post_del > pre_del))
    print()

    # -----------------------------------------------------------------------
    # Scenario 8: Idempotent replay — same event twice
    # -----------------------------------------------------------------------
    print("Scenario 8: Idempotent replay — exact-duplicate LISTING_APPROVED")
    lid8 = str(uuid.uuid4())
    t8 = base_time + timedelta(seconds=70)
    ev = _make_event(lid8, "LISTING_APPROVED", "LIVE", t8)
    _apply(os_client, ev, counters)
    _refresh(os_client)
    pre_skipped = counters.skipped
    _apply(os_client, ev, counters)  # second apply of same event
    _refresh(os_client)
    still_exists = _doc_exists(os_client, lid8)
    # external_gte allows equal version → second apply is a harmless re-index or 409
    _assert(still_exists, f"Doc {lid8[:8]} must still exist after duplicate apply")
    results.append(("S8: idempotent-replay→doc-intact", still_exists))
    print()

    # -----------------------------------------------------------------------
    # Scenario RC-1(a): Out-of-order — DELETE(T2) then stale UPDATE(T1)
    # -----------------------------------------------------------------------
    print("Scenario RC-1(a): DELETE(T2) then stale INDEX(T1) → 409 SKIPPED, stays deleted")
    lid_rc1a = str(uuid.uuid4())
    t_create = base_time + timedelta(seconds=80)
    t_update = base_time + timedelta(seconds=90)
    t_delete = base_time + timedelta(seconds=100)

    # Index with T_update first
    ev_live = _make_event(lid_rc1a, "LISTING_APPROVED", "LIVE", t_update)
    _apply(os_client, ev_live, counters)
    # Apply DELETE with T_delete
    ev_del = _make_event(lid_rc1a, "LISTING_DELETED", None, t_delete)
    _apply(os_client, ev_del, counters)
    _refresh(os_client)
    # Now apply stale INDEX with T_create (older than delete)
    pre_skip = counters.skipped
    ev_stale = _make_event(lid_rc1a, "LISTING_UPDATED", "LIVE", t_create)
    _apply(os_client, ev_stale, counters)
    _refresh(os_client)
    still_deleted = not _doc_exists(os_client, lid_rc1a)
    _assert(still_deleted, f"Doc {lid_rc1a[:8]} must remain deleted after stale INDEX")
    results.append(("RC-1(a): DELETE(T2)+stale-INDEX(T1)→stays-deleted", still_deleted))
    print()

    # -----------------------------------------------------------------------
    # Scenario RC-1(b): Newer INDEX already in, then older INDEX arrives
    # -----------------------------------------------------------------------
    print("Scenario RC-1(b): INDEX(T2) then older INDEX(T1) → 409 SKIPPED, T2 retained")
    lid_rc1b = str(uuid.uuid4())
    t_v1 = base_time + timedelta(seconds=110)
    t_v2 = base_time + timedelta(seconds=120)

    ev_v2 = _make_event(lid_rc1b, "LISTING_APPROVED", "LIVE", t_v2)
    ev_v2["document"]["title"] = "Version T2 title"
    _apply(os_client, ev_v2, counters)
    _refresh(os_client)

    pre_skip2 = counters.skipped
    ev_v1 = _make_event(lid_rc1b, "LISTING_UPDATED", "LIVE", t_v1)
    ev_v1["document"]["title"] = "Version T1 title (stale)"
    _apply(os_client, ev_v1, counters)
    _refresh(os_client)

    doc = os_client.get(index=DEMO_INDEX, id=lid_rc1b)
    title_retained = doc["_source"].get("title") == "Version T2 title"
    _assert(title_retained, f"T2 title must be retained after stale T1 INDEX")
    results.append(("RC-1(b): INDEX(T2)+stale-INDEX(T1)→T2-retained", title_retained))
    print()

    # -----------------------------------------------------------------------
    # PII assertion: no forbidden keys in any indexed document
    # -----------------------------------------------------------------------
    print("PII check: assert no forbidden keys in indexed documents")
    from scripts.search_events import PII_FORBIDDEN_KEYS  # noqa: PLC0415
    doc = os_client.get(index=DEMO_INDEX, id=lid2) if _doc_exists(os_client, lid2) else None
    # Use lid8 which should still be live
    doc8 = os_client.get(index=DEMO_INDEX, id=lid8)
    src = doc8["_source"]
    forbidden_present = [k for k in PII_FORBIDDEN_KEYS if k in src]
    _assert(len(forbidden_present) == 0, f"No PII keys in document (found: {forbidden_present})")
    results.append(("PII: no forbidden keys in doc", len(forbidden_present) == 0))
    print()

    # -----------------------------------------------------------------------
    # Final summary
    # -----------------------------------------------------------------------
    counters.print_summary()
    print()
    print("=" * 60)
    print("DEMO RESULTS:")
    passed = sum(1 for _, ok in results if ok)
    for name, ok in results:
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name}")
    print()
    print(f"  {passed}/{len(results)} scenarios passed")
    print("=" * 60)

    if passed < len(results):
        sys.exit(1)


if __name__ == "__main__":
    run_demo()
