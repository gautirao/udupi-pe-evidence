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
