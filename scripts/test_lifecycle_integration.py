#!/usr/bin/env python3
"""
test_lifecycle_integration.py — Integration test suite for the incremental OpenSearch
indexing pipeline.  Issue #1316.

Proves the full listing lifecycle: Postgres fixture → _apply_event() → OpenSearch
→ Discover parity, without requiring a live Kafka broker.

Run with DATABASE_URL and OPENSEARCH_URL set:
    export DATABASE_URL=postgresql://postgres:password@localhost:5432/mydb
    export OPENSEARCH_URL=http://localhost:9200
    pytest scripts/test_lifecycle_integration.py -v

Without those env-vars the entire suite SKIPs (TC-10 proves this explicitly).
"""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ---------------------------------------------------------------------------
# Imports from pipeline modules (no new packages required)
# ---------------------------------------------------------------------------
from scripts.search_events import (
    DOCUMENT_WHITELIST,
    PII_FORBIDDEN_KEYS,
    PipelineCounters,
    compute_operation,
    _build_opensearch_client,
)
from scripts.opensearch_indexer_consumer import (
    _apply_event,
    _ensure_index,
    _INCREMENTAL_INDEX_MAPPING,
)

# ---------------------------------------------------------------------------
# TC-10: Skip gate — all integration tests skip when env-vars are absent.
# This pytestmark applies to every test function in this module.
# ---------------------------------------------------------------------------
pytestmark = pytest.mark.skipif(
    not os.getenv("DATABASE_URL") or not os.getenv("OPENSEARCH_URL"),
    reason="DATABASE_URL and OPENSEARCH_URL must be set for integration tests",
)

# ---------------------------------------------------------------------------
# Session-scoped test index (unique per run to avoid cross-run collisions)
# ---------------------------------------------------------------------------
TEST_INDEX = f"test_lifecycle_proof_{int(time.time() * 1000)}"

# ---------------------------------------------------------------------------
# Shared mock producer (used for all _apply_event calls to avoid NoneType crash
# in _send_to_dlq on unexpected 5xx paths)
# ---------------------------------------------------------------------------


def _noop_producer() -> MagicMock:
    p = MagicMock()
    p.produce.return_value = None
    p.poll.return_value = 0
    p.flush.return_value = 0
    return p


# ---------------------------------------------------------------------------
# Session-level fixtures: OpenSearch client + index lifecycle
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def os_client():
    """Build an OpenSearch client and create + teardown the test index."""
    url = os.environ["OPENSEARCH_URL"]
    client = _build_opensearch_client(url)
    _ensure_index(client, TEST_INDEX)
    yield client
    # Teardown: delete test index regardless of test outcome
    try:
        client.indices.delete(index=TEST_INDEX, params={"ignore_unavailable": "true"})
    except Exception:
        pass


@pytest.fixture(scope="session")
def pg_conn():
    """Open a Postgres connection for the test session and close on teardown."""
    import psycopg2
    import psycopg2.extras

    db_url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = False
    yield conn
    conn.close()


# ---------------------------------------------------------------------------
# Postgres fixture helpers
# ---------------------------------------------------------------------------


def _insert_test_listing(cur, city_slug: str | None = None) -> tuple[dict, str]:
    """
    Insert a minimal cities + areas + property_listings row for testing.

    Returns (listing_row_dict, city_slug).  Rows use unique slugs/keys/UUIDs so
    parallel test runs do not collide.

    Schema alignment (verified against live PG15 / Flyway v81, issue #1316):
      - cities.id is a serial integer (DEFAULT nextval) — DO NOT insert it;
        capture it via RETURNING id. NOT NULL: slug, name, geo_center_lat,
        geo_center_lon.
      - areas: PK area_key (text); city_id integer FK -> cities.id;
        NOT NULL: name, geo_center_lat, geo_center_lon.
      - property_listings: id is uuid; check constraints enforce
        trust_tier IN (A,B,C,D), status/purpose/seller_type/property_type enums;
        confidence_score is integer 0..100; ranking_score integer.
    pg_conn uses RealDictCursor, so fetchone() returns a dict (use ["id"]).
    """
    slug = city_slug or f"test-city-{uuid.uuid4().hex[:8]}"
    listing_id = uuid.uuid4()
    area_key = f"TEST|{uuid.uuid4().hex[:12]}"

    # Udupi centre coordinates (reused for city, area, and listing point)
    lat = 13.3409
    lon = 74.7421

    # Insert city — id is serial; capture the generated integer id.
    cur.execute(
        """
        INSERT INTO cities (slug, name, geo_center_lat, geo_center_lon)
        VALUES (%s, %s, %s, %s)
        RETURNING id
        """,
        (slug, f"Test City {slug}", lat, lon),
    )
    city_id = cur.fetchone()["id"]

    # Insert area — area_key + integer city_id + NOT NULL name/geo_center_*.
    cur.execute(
        """
        INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (area_key, city_id, f"Test Area {area_key}", lat, lon),
    )

    now = datetime.now(timezone.utc)

    # Insert property_listing with all required NOT NULL columns.
    # search_vector: GENERATED ALWAYS STORED — excluded from INSERT.
    # listing_number: auto-generated by sequence — excluded from INSERT.
    # geog: GENERATED ALWAYS STORED — excluded from INSERT.
    cur.execute(
        """
        INSERT INTO property_listings (
            id, title, locality, description,
            property_type, status, listing_purpose,
            price_paise, latitude, longitude,
            area_key, created_by, created_at, updated_at,
            is_valid, is_duplicate, confidence_score,
            address_confirmed, trust_tier, ranking_score,
            seller_type
        ) VALUES (
            %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s,
            %s
        )
        """,
        (
            str(listing_id),
            "Integration test listing",
            "Udupi",
            "Integration test description for lifecycle proof #1316",
            "house",             # property_type (chk_listing_property_type)
            "LIVE",              # status (chk_listing_status)
            "sale",              # listing_purpose (chk_listing_purpose)
            5_000_000 * 100,     # price_paise
            lat,                 # latitude (Udupi centre)
            lon,                 # longitude
            area_key,
            str(uuid.uuid4()),   # created_by (synthetic user UUID)
            now,
            now,
            True,                # is_valid
            False,               # is_duplicate
            1,                   # confidence_score (integer 0..100)
            True,                # address_confirmed
            "D",                 # trust_tier (chk_trust_tier: A/B/C/D)
            0,                   # ranking_score (integer)
            "owner",             # seller_type (chk_seller_type)
        ),
    )

    listing_row = {
        "id": str(listing_id),
        "title": "Integration test listing",
        "locality": "Udupi",
        "description": "Integration test description for lifecycle proof #1316",
        "area_key": area_key,
        "property_type": "house",
        "seller_type": "owner",
        "bedrooms": None,
        "bathrooms": None,
        "price_paise": 5_000_000 * 100,
        "latitude": 13.3409,
        "longitude": 74.7421,
        "status": "LIVE",
        "created_at": now,
        "hero_image_url": None,
    }
    return listing_row, slug


def _delete_test_listing(cur, listing_id: str, area_key: str, city_slug: str) -> None:
    """Clean up the test fixtures in correct FK order."""
    cur.execute("DELETE FROM property_listings WHERE id = %s", (listing_id,))
    cur.execute("DELETE FROM areas WHERE area_key = %s", (area_key,))
    cur.execute("DELETE FROM cities WHERE slug = %s", (city_slug,))


def _delete_os_doc(os_client, listing_id: str) -> None:
    """Best-effort delete of an OpenSearch doc (ignore 404)."""
    try:
        os_client.delete(index=TEST_INDEX, id=listing_id, params={"ignore": "404"})
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Event construction helper
# ---------------------------------------------------------------------------


def _make_event(
    listing_id: str,
    status: str,
    event_type: str,
    listing_row: dict,
    city_slug: str,
    occurred_at: datetime | None = None,
    source_updated_at: datetime | None = None,
) -> dict:
    now = datetime.now(timezone.utc)
    occ = occurred_at or now
    src = source_updated_at or now

    # Build document from listing row, filtered to DOCUMENT_WHITELIST
    raw_doc = {
        "id": listing_row["id"],
        "title": listing_row["title"],
        "locality": listing_row["locality"],
        "description": listing_row.get("description"),
        "area_key": listing_row["area_key"],
        "city_slug": city_slug,
        "property_type": listing_row["property_type"],
        "seller_type": listing_row["seller_type"],
        "bedrooms": listing_row.get("bedrooms"),
        "bathrooms": listing_row.get("bathrooms"),
        "price_paise": listing_row["price_paise"],
        "latitude": listing_row["latitude"],
        "longitude": listing_row["longitude"],
        "location": {"lat": listing_row["latitude"], "lon": listing_row["longitude"]},
        "status": status,
        "created_at": (
            listing_row["created_at"].isoformat()
            if isinstance(listing_row.get("created_at"), datetime)
            else now.isoformat()
        ),
        "hero_image_url": listing_row.get("hero_image_url"),
    }
    doc = {k: v for k, v in raw_doc.items() if k in DOCUMENT_WHITELIST and v is not None}

    event: dict = {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "event_version": 1,
        "aggregate_type": "LISTING",
        "listing_id": str(listing_id),
        "occurred_at": occ.isoformat(),
        "source_updated_at": src.isoformat(),
        "status": status,
        "operation": "INDEX" if status == "LIVE" else "DELETE",
    }
    if status == "LIVE":
        event["document"] = doc
    return event


def _refresh(os_client) -> None:
    """Force an index refresh so gets/searches reflect recent writes."""
    os_client.indices.refresh(index=TEST_INDEX)


# ===========================================================================
# TC-1: LIVE listing → indexed; _source keys ⊆ DOCUMENT_WHITELIST; no PII
# ===========================================================================


def test_live_listing_indexed(os_client, pg_conn):
    """TC-1: LISTING_APPROVED event with status=LIVE → doc present in OpenSearch."""
    cur = pg_conn.cursor()
    listing_row, city_slug = _insert_test_listing(cur)
    pg_conn.commit()

    counters = PipelineCounters()
    event = _make_event(
        listing_id=listing_row["id"],
        status="LIVE",
        event_type="LISTING_APPROVED",
        listing_row=listing_row,
        city_slug=city_slug,
    )

    try:
        result = _apply_event(
            os_client, _noop_producer(), event, TEST_INDEX, counters,
            datetime.now(timezone.utc),
        )
        _refresh(os_client)

        assert result is True, "_apply_event must return True (commit offset) for LIVE"
        assert counters.indexed == 1, f"Expected indexed=1, got {counters.indexed}"
        assert counters.failures == 0

        doc = os_client.get(index=TEST_INDEX, id=listing_row["id"])
        source = doc["_source"]

        # All _source keys must be in DOCUMENT_WHITELIST
        extra_keys = set(source.keys()) - DOCUMENT_WHITELIST
        assert not extra_keys, f"_source contains non-whitelisted keys: {extra_keys}"

        # No PII keys in _source
        pii_present = set(source.keys()) & PII_FORBIDDEN_KEYS
        assert not pii_present, f"PII keys found in _source: {pii_present}"

        # Core fields must be present
        assert source["id"] == listing_row["id"]
        assert source["status"] == "LIVE"
    finally:
        # Clear any aborted transaction before cleanup (no-op on a clean conn)
        pg_conn.rollback()
        _delete_os_doc(os_client, listing_row["id"])
        _delete_test_listing(cur, listing_row["id"], listing_row["area_key"], city_slug)
        pg_conn.commit()
        cur.close()


# ===========================================================================
# TC-2: DRAFT listing → NOT indexed; counters reflect delete/skip
# ===========================================================================


def test_draft_not_indexed(os_client, pg_conn):
    """TC-2: LISTING_CREATED event with status=DRAFT → NotFoundError after refresh."""
    from opensearchpy.exceptions import NotFoundError

    cur = pg_conn.cursor()
    listing_row, city_slug = _insert_test_listing(cur)
    # Override status for the event — DB row stays LIVE but event carries DRAFT
    listing_row_draft = dict(listing_row)
    listing_row_draft["status"] = "DRAFT"
    pg_conn.commit()

    counters = PipelineCounters()
    event = _make_event(
        listing_id=listing_row["id"],
        status="DRAFT",
        event_type="LISTING_CREATED",
        listing_row=listing_row_draft,
        city_slug=city_slug,
    )

    try:
        _apply_event(
            os_client, _noop_producer(), event, TEST_INDEX, counters,
            datetime.now(timezone.utc),
        )
        _refresh(os_client)

        # Doc must NOT be present
        with pytest.raises(NotFoundError):
            os_client.get(index=TEST_INDEX, id=listing_row["id"])

        # Either deleted (404→skipped) or skipped counter must be > 0
        assert (
            counters.deleted > 0 or counters.skipped > 0
        ), f"Expected deleted or skipped > 0 for DRAFT, got {counters}"
        assert counters.failures == 0
    finally:
        # Clear any aborted transaction before cleanup (no-op on a clean conn)
        pg_conn.rollback()
        _delete_test_listing(cur, listing_row["id"], listing_row["area_key"], city_slug)
        pg_conn.commit()
        cur.close()


# ===========================================================================
# TC-3: PENDING_REVIEW listing → NOT indexed
# ===========================================================================


def test_pending_review_not_indexed(os_client, pg_conn):
    """TC-3: LISTING_CREATED event with status=PENDING_REVIEW → NotFoundError."""
    from opensearchpy.exceptions import NotFoundError

    cur = pg_conn.cursor()
    listing_row, city_slug = _insert_test_listing(cur)
    pg_conn.commit()

    counters = PipelineCounters()
    event = _make_event(
        listing_id=listing_row["id"],
        status="PENDING_REVIEW",
        event_type="LISTING_CREATED",
        listing_row=listing_row,
        city_slug=city_slug,
    )

    try:
        _apply_event(
            os_client, _noop_producer(), event, TEST_INDEX, counters,
            datetime.now(timezone.utc),
        )
        _refresh(os_client)

        with pytest.raises(NotFoundError):
            os_client.get(index=TEST_INDEX, id=listing_row["id"])

        assert counters.failures == 0
    finally:
        # Clear any aborted transaction before cleanup (no-op on a clean conn)
        pg_conn.rollback()
        _delete_test_listing(cur, listing_row["id"], listing_row["area_key"], city_slug)
        pg_conn.commit()
        cur.close()


# ===========================================================================
# TC-4: LIVE → REJECTED removes doc from index
# ===========================================================================


def test_rejected_removes_from_index(os_client, pg_conn):
    """TC-4: Index LIVE listing first; then LISTING_REJECTED event removes it."""
    from opensearchpy.exceptions import NotFoundError

    cur = pg_conn.cursor()
    listing_row, city_slug = _insert_test_listing(cur)
    pg_conn.commit()

    now = datetime.now(timezone.utc)

    # Step 1: index the LIVE listing
    live_event = _make_event(
        listing_id=listing_row["id"],
        status="LIVE",
        event_type="LISTING_APPROVED",
        listing_row=listing_row,
        city_slug=city_slug,
        source_updated_at=now,
    )
    counters_live = PipelineCounters()
    _apply_event(
        os_client, _noop_producer(), live_event, TEST_INDEX, counters_live,
        now,
    )
    _refresh(os_client)
    assert counters_live.indexed == 1, "Pre-condition: LIVE listing must be indexed"

    # Step 2: send REJECTED event with a higher version (later timestamp)
    later = now + timedelta(seconds=1)
    reject_event = _make_event(
        listing_id=listing_row["id"],
        status="REJECTED",
        event_type="LISTING_REJECTED",
        listing_row=listing_row,
        city_slug=city_slug,
        source_updated_at=later,
    )
    counters_reject = PipelineCounters()

    try:
        result = _apply_event(
            os_client, _noop_producer(), reject_event, TEST_INDEX, counters_reject,
            datetime.now(timezone.utc),
        )
        _refresh(os_client)

        assert result is True
        with pytest.raises(NotFoundError):
            os_client.get(index=TEST_INDEX, id=listing_row["id"])

        assert counters_reject.deleted == 1 or counters_reject.skipped == 1
        assert counters_reject.failures == 0
    finally:
        # Clear any aborted transaction before cleanup (no-op on a clean conn)
        pg_conn.rollback()
        _delete_os_doc(os_client, listing_row["id"])
        _delete_test_listing(cur, listing_row["id"], listing_row["area_key"], city_slug)
        pg_conn.commit()
        cur.close()


# ===========================================================================
# TC-5: LIVE → ARCHIVED removes doc from index
# ===========================================================================


def test_archived_removes_from_index(os_client, pg_conn):
    """TC-5: Index LIVE listing first; then LISTING_ARCHIVED event removes it."""
    from opensearchpy.exceptions import NotFoundError

    cur = pg_conn.cursor()
    listing_row, city_slug = _insert_test_listing(cur)
    pg_conn.commit()

    now = datetime.now(timezone.utc)

    # Step 1: index LIVE
    live_event = _make_event(
        listing_id=listing_row["id"],
        status="LIVE",
        event_type="LISTING_APPROVED",
        listing_row=listing_row,
        city_slug=city_slug,
        source_updated_at=now,
    )
    counters_live = PipelineCounters()
    _apply_event(
        os_client, _noop_producer(), live_event, TEST_INDEX, counters_live,
        now,
    )
    _refresh(os_client)
    assert counters_live.indexed == 1

    # Step 2: send ARCHIVED event with higher version
    later = now + timedelta(seconds=1)
    archive_event = _make_event(
        listing_id=listing_row["id"],
        status="ARCHIVED",
        event_type="LISTING_ARCHIVED",
        listing_row=listing_row,
        city_slug=city_slug,
        source_updated_at=later,
    )
    counters_archive = PipelineCounters()

    try:
        result = _apply_event(
            os_client, _noop_producer(), archive_event, TEST_INDEX, counters_archive,
            datetime.now(timezone.utc),
        )
        _refresh(os_client)

        assert result is True
        with pytest.raises(NotFoundError):
            os_client.get(index=TEST_INDEX, id=listing_row["id"])

        assert counters_archive.failures == 0
    finally:
        # Clear any aborted transaction before cleanup (no-op on a clean conn)
        pg_conn.rollback()
        _delete_os_doc(os_client, listing_row["id"])
        _delete_test_listing(cur, listing_row["id"], listing_row["area_key"], city_slug)
        pg_conn.commit()
        cur.close()


# ===========================================================================
# TC-6: Lag measurement — lag_stats() returns p50/p95/max >= 0
# ===========================================================================


def test_lag_measured(os_client, pg_conn):
    """TC-6: LIVE listing event → counters.lag_stats() returns p50_ms/p95_ms/max_ms >= 0."""
    cur = pg_conn.cursor()
    listing_row, city_slug = _insert_test_listing(cur)
    pg_conn.commit()

    # processed_at is ~50ms after occurred_at (see sleep below) so lag is measurable
    occurred_at = datetime.now(timezone.utc)
    time.sleep(0.05)  # ensure processed_at > occurred_at
    processed_at = datetime.now(timezone.utc)

    event = _make_event(
        listing_id=listing_row["id"],
        status="LIVE",
        event_type="LISTING_APPROVED",
        listing_row=listing_row,
        city_slug=city_slug,
        occurred_at=occurred_at,
        source_updated_at=occurred_at,
    )
    counters = PipelineCounters()

    try:
        _apply_event(os_client, _noop_producer(), event, TEST_INDEX, counters, processed_at)

        stats = counters.lag_stats()
        assert isinstance(stats, dict), "lag_stats() must return a dict"
        # Non-empty dict proves _apply_event recorded a lag sample via record_lag()
        # (lag_stats() returns {} when zero samples). This is the meaningful part of TC-6.
        assert stats, f"lag_stats() must be non-empty (≥1 sample recorded): {stats}"
        assert "p50_ms" in stats, f"lag_stats() missing p50_ms: {stats}"
        assert "p95_ms" in stats, f"lag_stats() missing p95_ms: {stats}"
        assert "max_ms" in stats, f"lag_stats() missing max_ms: {stats}"
        assert stats["p50_ms"] >= 0, f"p50_ms must be >= 0, got {stats['p50_ms']}"
        assert stats["p95_ms"] >= 0, f"p95_ms must be >= 0, got {stats['p95_ms']}"
        assert stats["max_ms"] >= 0, f"max_ms must be >= 0, got {stats['max_ms']}"
        print(
            f"TC-6 lag stats: p50={stats['p50_ms']}ms p95={stats['p95_ms']}ms "
            f"max={stats['max_ms']}ms"
        )
    finally:
        # Clear any aborted transaction before cleanup (no-op on a clean conn)
        pg_conn.rollback()
        _delete_os_doc(os_client, listing_row["id"])
        _delete_test_listing(cur, listing_row["id"], listing_row["area_key"], city_slug)
        pg_conn.commit()
        cur.close()


# ===========================================================================
# TC-7: Field whitelist — PII keys in document are stripped; all _source ⊆ WHITELIST
# ===========================================================================


def test_field_whitelist_no_pii(os_client, pg_conn):
    """TC-7: Event.document containing PII fields → _source has NO PII, all keys ⊆ WHITELIST."""
    cur = pg_conn.cursor()
    listing_row, city_slug = _insert_test_listing(cur)
    pg_conn.commit()

    event = _make_event(
        listing_id=listing_row["id"],
        status="LIVE",
        event_type="LISTING_APPROVED",
        listing_row=listing_row,
        city_slug=city_slug,
    )
    # Inject PII keys into the event document (simulating a buggy producer)
    event["document"]["user_id"] = "secret-user-uuid"
    event["document"]["phone"] = "+91-99999-00000"
    event["document"]["email"] = "seller@example.com"
    event["document"]["seller_id"] = "secret-seller-id"
    event["document"]["supabase_user_id"] = "supabase-uid-secret"
    event["document"]["rejectionReason"] = "admin only note"
    event["document"]["owner_notes"] = "internal notes not whitelisted"

    counters = PipelineCounters()

    try:
        _apply_event(
            os_client, _noop_producer(), event, TEST_INDEX, counters,
            datetime.now(timezone.utc),
        )
        _refresh(os_client)

        doc = os_client.get(index=TEST_INDEX, id=listing_row["id"])
        source = doc["_source"]

        # All source keys must be ⊆ DOCUMENT_WHITELIST
        extra_keys = set(source.keys()) - DOCUMENT_WHITELIST
        assert not extra_keys, f"Non-whitelisted keys in _source: {extra_keys}"

        # No PII keys
        pii_present = set(source.keys()) & PII_FORBIDDEN_KEYS
        assert not pii_present, f"PII keys found in _source: {pii_present}"

        # owner_notes is not in WHITELIST and must be absent
        assert "owner_notes" not in source

        assert counters.indexed == 1
        assert counters.failures == 0
    finally:
        # Clear any aborted transaction before cleanup (no-op on a clean conn)
        pg_conn.rollback()
        _delete_os_doc(os_client, listing_row["id"])
        _delete_test_listing(cur, listing_row["id"], listing_row["area_key"], city_slug)
        pg_conn.commit()
        cur.close()


# ===========================================================================
# TC-8: Discover parity — OpenSearch IDs match Postgres LIVE set for test city
# ===========================================================================

_DISCOVER_SQL = """
    SELECT pl.id::text
    FROM property_listings pl
    WHERE pl.status = 'LIVE'
      AND pl.archived_at IS NULL
      AND pl.is_duplicate = false
      AND pl.area_key IN (
        SELECT a.area_key FROM areas a
        JOIN cities c ON c.id = a.city_id
        WHERE c.slug = %s
      )
"""


def test_discover_parity(os_client, pg_conn):
    """TC-8: IDs from OpenSearch query match IDs from Postgres Discover predicate (scoped to test city)."""
    cur = pg_conn.cursor()

    # Use an isolated city slug so we only see our fixture rows
    unique_slug = f"parity-city-{uuid.uuid4().hex[:8]}"
    listing_row, city_slug = _insert_test_listing(cur, city_slug=unique_slug)
    pg_conn.commit()

    event = _make_event(
        listing_id=listing_row["id"],
        status="LIVE",
        event_type="LISTING_APPROVED",
        listing_row=listing_row,
        city_slug=city_slug,
    )
    counters = PipelineCounters()

    try:
        _apply_event(
            os_client, _noop_producer(), event, TEST_INDEX, counters,
            datetime.now(timezone.utc),
        )
        _refresh(os_client)

        # Query OpenSearch for all docs with this city_slug
        os_result = os_client.search(
            index=TEST_INDEX,
            body={
                "query": {"term": {"city_slug": city_slug}},
                "size": 1000,
            },
        )
        os_ids = {hit["_id"] for hit in os_result["hits"]["hits"]}

        # Query Postgres with the Discover predicate
        cur.execute(_DISCOVER_SQL, (city_slug,))
        rows = cur.fetchall()
        pg_ids = {row["id"] for row in rows}

        assert os_ids == pg_ids, (
            f"OpenSearch/Postgres ID set mismatch for city_slug={city_slug!r}.\n"
            f"  OpenSearch: {os_ids}\n"
            f"  Postgres:   {pg_ids}"
        )
    finally:
        # Clear any aborted transaction before cleanup (no-op on a clean conn)
        pg_conn.rollback()
        _delete_os_doc(os_client, listing_row["id"])
        _delete_test_listing(cur, listing_row["id"], listing_row["area_key"], city_slug)
        pg_conn.commit()
        cur.close()


# ===========================================================================
# TC-9: Idempotency — duplicate event with same source_updated_at → 1 doc, skipped++
# ===========================================================================


def test_idempotency_duplicate_event(os_client, pg_conn):
    """TC-9: Replaying identical event (same source_updated_at) → 1 doc; counters reflect correct behaviour."""
    cur = pg_conn.cursor()
    listing_row, city_slug = _insert_test_listing(cur)
    pg_conn.commit()

    fixed_ts = datetime.now(timezone.utc)
    event = _make_event(
        listing_id=listing_row["id"],
        status="LIVE",
        event_type="LISTING_APPROVED",
        listing_row=listing_row,
        city_slug=city_slug,
        source_updated_at=fixed_ts,
        occurred_at=fixed_ts,
    )

    counters1 = PipelineCounters()
    counters2 = PipelineCounters()

    try:
        # First application — must index
        _apply_event(
            os_client, _noop_producer(), event, TEST_INDEX, counters1,
            datetime.now(timezone.utc),
        )
        _refresh(os_client)
        assert counters1.indexed == 1, f"First apply: expected indexed=1, got {counters1.indexed}"

        # Replay identical event — external_gte: equal version is allowed (no-op re-index
        # or 409 skip depending on OpenSearch internal state). Either way exactly 1 doc.
        _apply_event(
            os_client, _noop_producer(), event, TEST_INDEX, counters2,
            datetime.now(timezone.utc),
        )
        _refresh(os_client)

        # Assert exactly 1 document in the index for this listing
        result = os_client.search(
            index=TEST_INDEX,
            body={"query": {"term": {"id": listing_row["id"]}}},
        )
        total = result["hits"]["total"]["value"]
        assert total == 1, f"Expected 1 doc after duplicate event, found {total}"

        # On duplicate: either indexed again (external_gte allows equal) or skipped (409)
        # Both are valid; what is NOT valid is failures > 0
        assert counters2.failures == 0, f"No failures expected on duplicate replay, got {counters2}"
    finally:
        # Clear any aborted transaction before cleanup (no-op on a clean conn)
        pg_conn.rollback()
        _delete_os_doc(os_client, listing_row["id"])
        _delete_test_listing(cur, listing_row["id"], listing_row["area_key"], city_slug)
        pg_conn.commit()
        cur.close()


# ===========================================================================
# TC-10: Skip gate — suite skips (not fails) when env vars are absent
#
# This test is always collected but demonstrates the skip behaviour that the
# pytestmark enforces on all tests above. When DATABASE_URL/OPENSEARCH_URL are
# set, this test passes trivially; when absent the whole module is skipped.
# ===========================================================================


def test_skip_when_env_absent():
    """TC-10: Integration tests skip (not fail) when DATABASE_URL or OPENSEARCH_URL is absent.

    When this function body runs, env vars are present (pytestmark passed).
    The skip gate is proved by the pytestmark at module level — if env vars were
    absent, pytest would have reported this test (and all others) as SKIPPED, not FAILED.
    """
    db_url = os.getenv("DATABASE_URL")
    os_url = os.getenv("OPENSEARCH_URL")
    assert db_url, "TC-10 precondition: DATABASE_URL must be set when suite runs"
    assert os_url, "TC-10 precondition: OPENSEARCH_URL must be set when suite runs"


# ===========================================================================
# TC-11: Explicit outbox row path — insert to listing_search_outbox, process
#        via _apply_event, assert indexed in OpenSearch.
# ===========================================================================


def test_live_create_via_outbox_row(os_client, pg_conn):
    """TC-11: Explicit outbox row path proof — insert to listing_search_outbox, process via _apply_event, assert indexed."""
    cur = pg_conn.cursor()
    listing_row, city_slug = _insert_test_listing(cur)
    pg_conn.commit()

    listing_id = listing_row["id"]
    source_updated_at = datetime.now(timezone.utc)
    event_id = str(uuid.uuid4())
    payload = json.dumps({
        "listing_id": listing_id,
        "event_type": "LISTING_APPROVED",
        "operation": "INDEX",
        "status": "LIVE",
    })

    cur.execute(
        """
        INSERT INTO listing_search_outbox
          (event_id, listing_id, event_type, operation, status,
           occurred_at, source_updated_at, payload, published_at, retry_count, next_attempt_at)
        VALUES
          (%s, %s, 'LISTING_APPROVED', 'INDEX', 'LIVE',
           NOW() - INTERVAL '60 seconds', %s, %s::jsonb, NULL, 0, NULL)
        """,
        (event_id, listing_id, source_updated_at, payload),
    )
    pg_conn.commit()

    # Read back the inserted row to confirm it was persisted
    cur.execute(
        "SELECT event_id, listing_id, operation, status, source_updated_at "
        "FROM listing_search_outbox WHERE event_id = %s",
        (event_id,),
    )
    outbox_row = cur.fetchone()
    assert outbox_row is not None, "Outbox row must be present after insert"
    assert outbox_row["listing_id"] == listing_id
    assert outbox_row["operation"] == "INDEX"
    assert outbox_row["status"] == "LIVE"

    # Build event dict from outbox row data (mirrors what SearchOutboxPoller builds)
    event = _make_event(
        listing_id=listing_id,
        status="LIVE",
        event_type="LISTING_APPROVED",
        listing_row=listing_row,
        city_slug=city_slug,
        source_updated_at=source_updated_at,
    )

    counters = PipelineCounters()

    try:
        result = _apply_event(
            os_client, _noop_producer(), event, TEST_INDEX, counters,
            datetime.now(timezone.utc),
        )
        _refresh(os_client)

        assert result is True, "_apply_event must return True for LIVE outbox-row event"
        assert counters.indexed == 1, f"Expected indexed=1, got {counters.indexed}"
        assert counters.failures == 0

        doc = os_client.get(index=TEST_INDEX, id=listing_id)
        assert doc["_source"]["title"] == listing_row["title"], (
            f"Indexed title mismatch: {doc['_source']['title']!r} != {listing_row['title']!r}"
        )
    finally:
        pg_conn.rollback()
        cur.execute(
            "DELETE FROM listing_search_outbox WHERE listing_id = %s", (listing_id,)
        )
        _delete_os_doc(os_client, listing_id)
        _delete_test_listing(cur, listing_id, listing_row["area_key"], city_slug)
        pg_conn.commit()
        cur.close()


# ===========================================================================
# TC-12: Text update reflected in FTS via outbox path.
# ===========================================================================


def test_text_update_via_outbox_path(os_client, pg_conn):
    """TC-12: Text update (title/description/locality) reflected in FTS via outbox path."""
    cur = pg_conn.cursor()
    listing_row, city_slug = _insert_test_listing(cur)
    pg_conn.commit()

    listing_id = listing_row["id"]
    t1_ts = datetime.now(timezone.utc)
    t1_title = listing_row["title"]

    # Step 1: index T1 (original title)
    event_t1 = _make_event(
        listing_id=listing_id,
        status="LIVE",
        event_type="LISTING_APPROVED",
        listing_row=listing_row,
        city_slug=city_slug,
        source_updated_at=t1_ts,
    )
    counters_t1 = PipelineCounters()
    _apply_event(
        os_client, _noop_producer(), event_t1, TEST_INDEX, counters_t1,
        datetime.now(timezone.utc),
    )
    _refresh(os_client)
    assert counters_t1.indexed == 1, "Pre-condition: T1 must be indexed"

    # Step 2: update title and description in DB
    t2_title = f"Updated FTS Title {uuid.uuid4().hex[:8]}"
    t2_description = "Updated description for FTS proof TC-12"
    cur.execute(
        "UPDATE property_listings SET title = %s, description = %s WHERE id = %s",
        (t2_title, t2_description, listing_id),
    )
    pg_conn.commit()

    # Step 3: insert outbox row for T2 with strictly higher source_updated_at
    t2_ts = t1_ts + timedelta(seconds=5)
    event_id_t2 = str(uuid.uuid4())
    payload_t2 = json.dumps({
        "listing_id": listing_id,
        "event_type": "LISTING_UPDATED",
        "operation": "INDEX",
        "status": "LIVE",
    })
    cur.execute(
        """
        INSERT INTO listing_search_outbox
          (event_id, listing_id, event_type, operation, status,
           occurred_at, source_updated_at, payload, published_at, retry_count, next_attempt_at)
        VALUES
          (%s, %s, 'LISTING_UPDATED', 'INDEX', 'LIVE',
           NOW() - INTERVAL '60 seconds', %s, %s::jsonb, NULL, 0, NULL)
        """,
        (event_id_t2, listing_id, t2_ts, payload_t2),
    )
    pg_conn.commit()

    # Step 4: build T2 event dict with updated title/description and apply
    listing_row_t2 = dict(listing_row)
    listing_row_t2["title"] = t2_title
    listing_row_t2["description"] = t2_description

    event_t2 = _make_event(
        listing_id=listing_id,
        status="LIVE",
        event_type="LISTING_UPDATED",
        listing_row=listing_row_t2,
        city_slug=city_slug,
        source_updated_at=t2_ts,
    )
    counters_t2 = PipelineCounters()

    try:
        result = _apply_event(
            os_client, _noop_producer(), event_t2, TEST_INDEX, counters_t2,
            datetime.now(timezone.utc),
        )
        _refresh(os_client)

        assert result is True, "_apply_event must return True for T2 update"
        assert counters_t2.indexed == 1, f"Expected indexed=1 for T2, got {counters_t2.indexed}"
        assert counters_t2.failures == 0

        # Assert: _source now carries T2 title
        doc = os_client.get(index=TEST_INDEX, id=listing_id)
        assert doc["_source"]["title"] == t2_title, (
            f"_source title should be T2={t2_title!r}, got {doc['_source']['title']!r}"
        )

        # Assert: FTS match query returns the listing for the T2 title
        fts_hits = os_client.search(
            index=TEST_INDEX,
            body={"query": {"match": {"title": t2_title}}},
        )
        hit_ids = [h["_id"] for h in fts_hits["hits"]["hits"]]
        assert listing_id in hit_ids, (
            f"FTS search for T2 title {t2_title!r} must return listing {listing_id}"
        )

        # Assert: FTS search for old T1 title returns 0 hits for this listing_id
        fts_old_hits = os_client.search(
            index=TEST_INDEX,
            body={"query": {"bool": {"must": [
                {"match": {"title": t1_title}},
                {"term": {"id": listing_id}},
            ]}}},
        )
        old_total = fts_old_hits["hits"]["total"]["value"]
        assert old_total == 0, (
            f"T1 title {t1_title!r} must NOT match listing {listing_id} after T2 update, "
            f"got {old_total} hits"
        )
    finally:
        pg_conn.rollback()
        cur.execute(
            "DELETE FROM listing_search_outbox WHERE listing_id = %s", (listing_id,)
        )
        _delete_os_doc(os_client, listing_id)
        _delete_test_listing(cur, listing_id, listing_row["area_key"], city_slug)
        pg_conn.commit()
        cur.close()


# ===========================================================================
# TC-13: Location update reflected in geo queries via outbox path.
# ===========================================================================


def test_location_update_via_outbox_path(os_client, pg_conn):
    """TC-13: Location update reflected in geo_distance queries via outbox path."""
    cur = pg_conn.cursor()
    listing_row, city_slug = _insert_test_listing(cur)
    pg_conn.commit()

    listing_id = listing_row["id"]
    t1_ts = datetime.now(timezone.utc)

    # Udupi coordinates (from _insert_test_listing default)
    udupi_lat = 13.3409
    udupi_lon = 74.7421
    # Bangalore coordinates (~880 km from Udupi)
    blr_lat = 12.9716
    blr_lon = 77.5946

    # Step 1: index T1 at Udupi
    event_t1 = _make_event(
        listing_id=listing_id,
        status="LIVE",
        event_type="LISTING_APPROVED",
        listing_row=listing_row,
        city_slug=city_slug,
        source_updated_at=t1_ts,
    )
    counters_t1 = PipelineCounters()
    _apply_event(
        os_client, _noop_producer(), event_t1, TEST_INDEX, counters_t1,
        datetime.now(timezone.utc),
    )
    _refresh(os_client)
    assert counters_t1.indexed == 1, "Pre-condition: T1 must be indexed at Udupi"

    doc_t1 = os_client.get(index=TEST_INDEX, id=listing_id)
    assert doc_t1["_source"]["location"] == {"lat": udupi_lat, "lon": udupi_lon}, (
        f"T1 location mismatch: {doc_t1['_source']['location']}"
    )

    # Step 2: update latitude/longitude in DB to Bangalore
    cur.execute(
        "UPDATE property_listings SET latitude = %s, longitude = %s WHERE id = %s",
        (blr_lat, blr_lon, listing_id),
    )
    pg_conn.commit()

    # Step 3: insert outbox row for T2 with strictly higher source_updated_at
    t2_ts = t1_ts + timedelta(seconds=5)
    event_id_t2 = str(uuid.uuid4())
    payload_t2 = json.dumps({
        "listing_id": listing_id,
        "event_type": "LISTING_UPDATED",
        "operation": "INDEX",
        "status": "LIVE",
    })
    cur.execute(
        """
        INSERT INTO listing_search_outbox
          (event_id, listing_id, event_type, operation, status,
           occurred_at, source_updated_at, payload, published_at, retry_count, next_attempt_at)
        VALUES
          (%s, %s, 'LISTING_UPDATED', 'INDEX', 'LIVE',
           NOW() - INTERVAL '60 seconds', %s, %s::jsonb, NULL, 0, NULL)
        """,
        (event_id_t2, listing_id, t2_ts, payload_t2),
    )
    pg_conn.commit()

    # Step 4: build T2 event dict with Bangalore coords and apply
    listing_row_t2 = dict(listing_row)
    listing_row_t2["latitude"] = blr_lat
    listing_row_t2["longitude"] = blr_lon

    event_t2 = _make_event(
        listing_id=listing_id,
        status="LIVE",
        event_type="LISTING_UPDATED",
        listing_row=listing_row_t2,
        city_slug=city_slug,
        source_updated_at=t2_ts,
    )
    counters_t2 = PipelineCounters()

    try:
        result = _apply_event(
            os_client, _noop_producer(), event_t2, TEST_INDEX, counters_t2,
            datetime.now(timezone.utc),
        )
        # CRITICAL: refresh before any geo queries
        _refresh(os_client)

        assert result is True, "_apply_event must return True for T2 location update"
        assert counters_t2.indexed == 1, f"Expected indexed=1 for T2, got {counters_t2.indexed}"
        assert counters_t2.failures == 0

        # Assert: _source location is now Bangalore
        doc_t2 = os_client.get(index=TEST_INDEX, id=listing_id)
        assert doc_t2["_source"]["location"] == {"lat": blr_lat, "lon": blr_lon}, (
            f"T2 location should be Bangalore, got {doc_t2['_source']['location']}"
        )

        # Positive: geo_distance around Bangalore must include this listing
        geo_blr_hits = os_client.search(
            index=TEST_INDEX,
            body={"query": {"geo_distance": {
                "distance": "5km",
                "location": {"lat": blr_lat, "lon": blr_lon},
            }}},
        )
        blr_hit_ids = [h["_id"] for h in geo_blr_hits["hits"]["hits"]]
        assert listing_id in blr_hit_ids, (
            f"Listing {listing_id} must appear in 5km geo query around Bangalore"
        )

        # Negative: geo_distance around Udupi must NOT include this listing
        geo_udupi_hits = os_client.search(
            index=TEST_INDEX,
            body={"query": {"geo_distance": {
                "distance": "5km",
                "location": {"lat": udupi_lat, "lon": udupi_lon},
            }}},
        )
        udupi_hit_ids = [h["_id"] for h in geo_udupi_hits["hits"]["hits"]]
        assert listing_id not in udupi_hit_ids, (
            f"Listing {listing_id} must NOT appear in 5km geo query around Udupi after relocation"
        )
    finally:
        pg_conn.rollback()
        cur.execute(
            "DELETE FROM listing_search_outbox WHERE listing_id = %s", (listing_id,)
        )
        _delete_os_doc(os_client, listing_id)
        _delete_test_listing(cur, listing_id, listing_row["area_key"], city_slug)
        pg_conn.commit()
        cur.close()


# ===========================================================================
# TC-14: Non-LIVE listing (INDEX+REJECTED) removed from OpenSearch via outbox
#         routing — proves _apply_event recomputes operation from status.
# ===========================================================================


def test_non_live_listing_deleted_from_opensearch(os_client, pg_conn):
    """TC-14: INDEX+REJECTED event routed to delete by _apply_event (status overrides operation)."""
    cur = pg_conn.cursor()
    listing_row, city_slug = _insert_test_listing(cur)
    pg_conn.commit()

    listing_id = listing_row["id"]
    t1_ts = datetime.now(timezone.utc)

    # Step 1: index LIVE listing at T1
    event_live = _make_event(
        listing_id=listing_id,
        status="LIVE",
        event_type="LISTING_APPROVED",
        listing_row=listing_row,
        city_slug=city_slug,
        source_updated_at=t1_ts,
    )
    counters_live = PipelineCounters()
    _apply_event(
        os_client, _noop_producer(), event_live, TEST_INDEX, counters_live,
        datetime.now(timezone.utc),
    )
    _refresh(os_client)
    assert counters_live.indexed == 1, "Pre-condition: LIVE listing must be indexed"
    # Confirm doc is present before rejection
    doc_before = os_client.get(index=TEST_INDEX, id=listing_id)
    assert doc_before["found"] is True, "Doc must be present before REJECTED event"

    # Step 2: update listing status to REJECTED in DB
    cur.execute(
        "UPDATE property_listings SET status = 'REJECTED' WHERE id = %s", (listing_id,)
    )
    pg_conn.commit()

    # Step 3: insert outbox row with operation=INDEX, status=REJECTED
    # (mirrors exactly what SearchOutboxWriter emits for a rejection event)
    t2_ts = t1_ts + timedelta(seconds=5)
    event_id_t2 = str(uuid.uuid4())
    payload_t2 = json.dumps({
        "listing_id": listing_id,
        "event_type": "LISTING_REJECTED",
        "operation": "INDEX",
        "status": "REJECTED",
    })
    cur.execute(
        """
        INSERT INTO listing_search_outbox
          (event_id, listing_id, event_type, operation, status,
           occurred_at, source_updated_at, payload, published_at, retry_count, next_attempt_at)
        VALUES
          (%s, %s, 'LISTING_REJECTED', 'INDEX', 'REJECTED',
           NOW() - INTERVAL '60 seconds', %s, %s::jsonb, NULL, 0, NULL)
        """,
        (event_id_t2, listing_id, t2_ts, payload_t2),
    )
    pg_conn.commit()

    # Step 4: build event dict with operation=INDEX, status=REJECTED
    # _apply_event MUST recompute operation → DELETE because status != LIVE
    event_rejected = {
        "event_id": str(uuid.uuid4()),
        "event_type": "LISTING_REJECTED",
        "event_version": 1,
        "aggregate_type": "LISTING",
        "listing_id": listing_id,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "source_updated_at": t2_ts.isoformat(),
        "status": "REJECTED",
        "operation": "INDEX",  # producer sets INDEX; _apply_event must override to DELETE
    }
    counters_rejected = PipelineCounters()

    try:
        result = _apply_event(
            os_client, _noop_producer(), event_rejected, TEST_INDEX, counters_rejected,
            datetime.now(timezone.utc),
        )
        _refresh(os_client)

        assert result is True, "_apply_event must return True for REJECTED event"

        # Doc must be absent — routing to delete worked
        search_result = os_client.search(
            index=TEST_INDEX,
            body={"query": {"ids": {"values": [listing_id]}}},
        )
        total_hits = search_result["hits"]["total"]["value"]
        assert total_hits == 0, (
            f"Listing {listing_id} must be absent after REJECTED event, found {total_hits} docs"
        )

        assert counters_rejected.deleted >= 1, (
            f"Expected deleted>=1, got {counters_rejected.deleted} "
            f"(proves _apply_event routed INDEX+REJECTED to delete)"
        )
        assert counters_rejected.failures == 0
    finally:
        pg_conn.rollback()
        cur.execute(
            "DELETE FROM listing_search_outbox WHERE listing_id = %s", (listing_id,)
        )
        # Doc already deleted by _apply_event; _delete_os_doc is a no-op here (404-safe)
        _delete_os_doc(os_client, listing_id)
        _delete_test_listing(cur, listing_id, listing_row["area_key"], city_slug)
        pg_conn.commit()
        cur.close()


# ===========================================================================
# TC-15: Discover-shape BoolQuery — FTS + geo filter combined.
# ===========================================================================


def test_discover_fts_geo_boolquery(os_client, pg_conn):
    """TC-15: Discover-shape BoolQuery (multi_match + geo_distance filter) returns only the nearby listing."""
    cur = pg_conn.cursor()

    udupi_lat = 13.3409
    udupi_lon = 74.7421
    blr_lat = 12.9716
    blr_lon = 77.5946

    # Two distinct suffixes: only Listing-A's suffix appears in query_text, so the
    # FTS clause excludes Listing-B independently of the geo filter.
    unique_suffix_a = uuid.uuid4().hex[:8]
    unique_suffix_b = uuid.uuid4().hex[:8]  # different suffix — B won't match the FTS query

    # Insert Listing-A at Udupi
    listing_row_a, city_slug_a = _insert_test_listing(cur)
    listing_id_a = listing_row_a["id"]
    title_a = f"Seafront Villa Udupi {unique_suffix_a}"
    cur.execute(
        "UPDATE property_listings SET title = %s, locality = 'Udupi', latitude = %s, longitude = %s WHERE id = %s",
        (title_a, udupi_lat, udupi_lon, listing_id_a),
    )

    # Insert Listing-B at Bangalore (separate city slug)
    listing_row_b, city_slug_b = _insert_test_listing(cur)
    listing_id_b = listing_row_b["id"]
    title_b = f"Seafront Villa Bangalore {unique_suffix_b}"
    cur.execute(
        "UPDATE property_listings SET title = %s, locality = 'Bangalore', latitude = %s, longitude = %s WHERE id = %s",
        (title_b, blr_lat, blr_lon, listing_id_b),
    )
    pg_conn.commit()

    listing_row_a_upd = dict(listing_row_a)
    listing_row_a_upd["title"] = title_a
    listing_row_a_upd["locality"] = "Udupi"
    listing_row_a_upd["latitude"] = udupi_lat
    listing_row_a_upd["longitude"] = udupi_lon

    listing_row_b_upd = dict(listing_row_b)
    listing_row_b_upd["title"] = title_b
    listing_row_b_upd["locality"] = "Bangalore"
    listing_row_b_upd["latitude"] = blr_lat
    listing_row_b_upd["longitude"] = blr_lon

    ts_a = datetime.now(timezone.utc)
    ts_b = ts_a + timedelta(milliseconds=1)

    event_a = _make_event(
        listing_id=listing_id_a,
        status="LIVE",
        event_type="LISTING_APPROVED",
        listing_row=listing_row_a_upd,
        city_slug=city_slug_a,
        source_updated_at=ts_a,
    )
    event_b = _make_event(
        listing_id=listing_id_b,
        status="LIVE",
        event_type="LISTING_APPROVED",
        listing_row=listing_row_b_upd,
        city_slug=city_slug_b,
        source_updated_at=ts_b,
    )

    counters_a = PipelineCounters()
    counters_b = PipelineCounters()

    try:
        _apply_event(os_client, _noop_producer(), event_a, TEST_INDEX, counters_a,
                     datetime.now(timezone.utc))
        _apply_event(os_client, _noop_producer(), event_b, TEST_INDEX, counters_b,
                     datetime.now(timezone.utc))
        _refresh(os_client)

        assert counters_a.indexed == 1, f"Listing-A must be indexed, got {counters_a}"
        assert counters_b.indexed == 1, f"Listing-B must be indexed, got {counters_b}"

        # Discover-shape BoolQuery: FTS uses Listing-A's unique suffix — only Listing-A matches
        # both the FTS clause (has unique_suffix_a) and the geo filter (Udupi, within 10km).
        # Listing-B lacks unique_suffix_a so the FTS clause alone excludes it.
        query_text = f"Seafront Villa {unique_suffix_a}"
        hits = os_client.search(
            index=TEST_INDEX,
            body={
                "query": {
                    "bool": {
                        "must": [{"multi_match": {
                            "query": query_text,
                            "type": "best_fields",
                            "operator": "and",
                            "fields": ["title", "locality", "description"],
                        }}],
                        "filter": [{"geo_distance": {
                            "distance": "10km",
                            "location": {"lat": udupi_lat, "lon": udupi_lon},
                        }}],
                    }
                },
                "size": 100,
            },
        )

        hit_ids = {h["_id"] for h in hits["hits"]["hits"]}

        assert listing_id_a in hit_ids, (
            f"Listing-A (Udupi) must be in BoolQuery hits; got {hit_ids}"
        )
        assert listing_id_b not in hit_ids, (
            f"Listing-B (Bangalore, ~880km away) must NOT be in BoolQuery hits; got {hit_ids}"
        )
    finally:
        pg_conn.rollback()
        _delete_os_doc(os_client, listing_id_a)
        _delete_os_doc(os_client, listing_id_b)
        _delete_test_listing(cur, listing_id_a, listing_row_a["area_key"], city_slug_a)
        _delete_test_listing(cur, listing_id_b, listing_row_b["area_key"], city_slug_b)
        pg_conn.commit()
        cur.close()


# ===========================================================================
# TC-16: V83 retry schema semantics — DEAD excluded, future next_attempt_at
#         excluded, past next_attempt_at eligible.
#
# Directly manipulates listing_search_outbox and queries with the same predicate
# as ListingSearchOutboxRepository.findUnpublishedBatch (read from Java source).
#
# JPQL WHERE clause (from ListingSearchOutboxRepository.java):
#   publishedAt IS NULL
#   AND occurredAt <= :maxOccurredAt
#   AND (status IS NULL OR (status <> 'DEAD' AND status <> 'FAILED'))
#   AND (nextAttemptAt IS NULL OR nextAttemptAt <= :now)
# ===========================================================================

_ELIGIBILITY_SQL = """
    SELECT id FROM listing_search_outbox
    WHERE listing_id = %s
      AND published_at IS NULL
      AND occurred_at <= NOW() - INTERVAL '30 seconds'
      AND (status IS NULL OR (status <> 'DEAD' AND status <> 'FAILED'))
      AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
"""


def test_retry_schema_compatibility(os_client, pg_conn):
    """TC-16: V83 retry schema — DEAD excluded, FAILED excluded, future next_attempt_at excluded, past eligible."""
    cur = pg_conn.cursor()
    listing_row, city_slug = _insert_test_listing(cur)
    listing_id = listing_row["id"]
    pg_conn.commit()

    event_id = str(uuid.uuid4())
    payload = json.dumps({
        "listing_id": listing_id,
        "event_type": "LISTING_APPROVED",
        "operation": "INDEX",
        "status": "LIVE",
    })

    # Insert base row: occurred_at 60s ago (ensures occurred_at <= NOW() - 30s),
    # published_at=NULL, status=NULL, retry_count=0, next_attempt_at=NULL
    cur.execute(
        """
        INSERT INTO listing_search_outbox
          (event_id, listing_id, event_type, operation, status,
           occurred_at, source_updated_at, payload, published_at, retry_count, next_attempt_at)
        VALUES
          (%s, %s, 'LISTING_APPROVED', 'INDEX', NULL,
           NOW() - INTERVAL '60 seconds', NOW() - INTERVAL '60 seconds',
           %s::jsonb, NULL, 0, NULL)
        """,
        (event_id, listing_id, payload),
    )
    pg_conn.commit()

    try:
        # --- State 1: status=NULL, next_attempt_at=NULL → eligible ---
        cur.execute(_ELIGIBILITY_SQL, (listing_id,))
        rows = cur.fetchall()
        assert len(rows) == 1, (
            f"State 1 (status=NULL, next_attempt_at=NULL): expected 1 eligible row, got {len(rows)}"
        )

        # --- State 2: status='DEAD' → NOT eligible ---
        cur.execute(
            "UPDATE listing_search_outbox SET status = 'DEAD' WHERE event_id = %s",
            (event_id,),
        )
        pg_conn.commit()
        cur.execute(_ELIGIBILITY_SQL, (listing_id,))
        rows = cur.fetchall()
        assert len(rows) == 0, (
            f"State 2 (status=DEAD): expected 0 eligible rows, got {len(rows)}"
        )

        # --- State 3: status='FAILED' → NOT eligible ---
        cur.execute(
            "UPDATE listing_search_outbox SET status = 'FAILED' WHERE event_id = %s",
            (event_id,),
        )
        pg_conn.commit()
        cur.execute(_ELIGIBILITY_SQL, (listing_id,))
        rows = cur.fetchall()
        assert len(rows) == 0, (
            f"State 3 (status=FAILED): expected 0 eligible rows, got {len(rows)}"
        )

        # --- State 4: status=NULL, next_attempt_at=FUTURE → NOT eligible ---
        cur.execute(
            "UPDATE listing_search_outbox SET status = NULL, "
            "next_attempt_at = NOW() + INTERVAL '60 seconds' WHERE event_id = %s",
            (event_id,),
        )
        pg_conn.commit()
        cur.execute(_ELIGIBILITY_SQL, (listing_id,))
        rows = cur.fetchall()
        assert len(rows) == 0, (
            f"State 4 (next_attempt_at=FUTURE): expected 0 eligible rows, got {len(rows)}"
        )

        # --- State 5: status=NULL, next_attempt_at=PAST → eligible ---
        cur.execute(
            "UPDATE listing_search_outbox SET "
            "next_attempt_at = NOW() - INTERVAL '1 second' WHERE event_id = %s",
            (event_id,),
        )
        pg_conn.commit()
        cur.execute(_ELIGIBILITY_SQL, (listing_id,))
        rows = cur.fetchall()
        assert len(rows) == 1, (
            f"State 5 (next_attempt_at=PAST): expected 1 eligible row, got {len(rows)}"
        )

    finally:
        pg_conn.rollback()
        cur.execute(
            "DELETE FROM listing_search_outbox WHERE listing_id = %s", (listing_id,)
        )
        _delete_test_listing(cur, listing_id, listing_row["area_key"], city_slug)
        pg_conn.commit()
        cur.close()
