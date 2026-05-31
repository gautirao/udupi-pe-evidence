"""
Tests for the incremental OpenSearch indexing pipeline — issue #1312.

Mirrors scripts/test_opensearch_rebuild.py (unittest + mock, no live broker,
no live OpenSearch, no live Postgres).

Run with:
    python -m pytest scripts/test_opensearch_pipeline.py -v

Also verify existing rebuild tests still pass:
    python -m pytest scripts/test_opensearch_rebuild.py -v
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, call, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ---------------------------------------------------------------------------
# Modules under test (import after path adjustment)
# ---------------------------------------------------------------------------
from scripts.search_events import (
    DEDICATED_INDEX_DEFAULT,
    DOCUMENT_WHITELIST,
    FORBIDDEN_REBUILD_ALIAS,
    FORBIDDEN_REBUILD_PREFIX,
    PII_FORBIDDEN_KEYS,
    EventType,
    Operation,
    PipelineCounters,
    _check_db_safety_gate,
    _check_kafka_safety_gate,
    _parse_kafka_host,
    compute_operation,
    compute_version,
    validate_dedicated_index,
)
from scripts.opensearch_indexer_consumer import (
    _apply_event,
    _do_delete,
    _do_index,
    _extract_status_code,
    _handle_opensearch_exc,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_counters() -> PipelineCounters:
    return PipelineCounters()


def _ts(offset_seconds: int = 0) -> datetime:
    return datetime(2026, 5, 31, 10, 0, 0, tzinfo=timezone.utc) + timedelta(
        seconds=offset_seconds
    )


def _make_event(
    listing_id: str = "listing-001",
    event_type: str = "LISTING_APPROVED",
    status: str | None = "LIVE",
    source_updated_at: datetime | None = None,
    occurred_at: datetime | None = None,
    include_document: bool = True,
) -> dict:
    if occurred_at is None:
        occurred_at = _ts(0)
    if source_updated_at is None:
        source_updated_at = occurred_at
    operation = compute_operation(status)
    event: dict = {
        "event_id": "evt-001",
        "event_type": event_type,
        "event_version": 1,
        "aggregate_type": "LISTING",
        "listing_id": listing_id,
        "occurred_at": occurred_at.isoformat(),
        "source_updated_at": source_updated_at.isoformat(),
        "status": status,
        "operation": operation.value,
    }
    if operation == Operation.INDEX and include_document:
        event["document"] = {
            "id": listing_id,
            "title": "Test listing",
            "locality": "Udupi",
            "description": "Test",
            "area_key": "area_001",
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


def _noop_producer() -> MagicMock:
    p = MagicMock()
    p.flush.return_value = 0
    return p


# ===========================================================================
# 1. Visibility derivation — all 7 event types + both LIVE and non-LIVE status
# ===========================================================================


class TestComputeOperation(unittest.TestCase):
    """Visibility rule: INDEX iff status=='LIVE', else DELETE."""

    def test_live_status_is_index(self):
        self.assertEqual(compute_operation("LIVE"), Operation.INDEX)

    def test_draft_is_delete(self):
        self.assertEqual(compute_operation("DRAFT"), Operation.DELETE)

    def test_pending_is_delete(self):
        self.assertEqual(compute_operation("PENDING"), Operation.DELETE)

    def test_rejected_is_delete(self):
        self.assertEqual(compute_operation("REJECTED"), Operation.DELETE)

    def test_archived_is_delete(self):
        self.assertEqual(compute_operation("ARCHIVED"), Operation.DELETE)

    def test_unpublished_is_delete(self):
        self.assertEqual(compute_operation("UNPUBLISHED"), Operation.DELETE)

    def test_none_status_is_delete(self):
        # LISTING_DELETED often has null status
        self.assertEqual(compute_operation(None), Operation.DELETE)

    def test_empty_string_is_delete(self):
        self.assertEqual(compute_operation(""), Operation.DELETE)

    def test_consumer_recomputes_operation_ignores_producer_field(self):
        """Consumer must recompute from status — not trust the operation field in the event."""
        # Event says operation=INDEX but status=REJECTED → consumer must derive DELETE
        event = _make_event(status="REJECTED")
        event["operation"] = "INDEX"  # attacker/bug sets this incorrectly
        # The consumer's _apply_event derives operation from status via compute_operation
        # This test verifies compute_operation(status) gives DELETE regardless of event["operation"]
        derived = compute_operation(event["status"])
        self.assertEqual(derived, Operation.DELETE)
        # And an INDEX on a LIVE listing should still work
        event_live = _make_event(status="LIVE")
        event_live["operation"] = "DELETE"  # incorrect producer field
        derived_live = compute_operation(event_live["status"])
        self.assertEqual(derived_live, Operation.INDEX)


# ===========================================================================
# 2. Consumer apply_event enforces visibility (recomputes from status)
# ===========================================================================


class TestApplyEventVisibility(unittest.TestCase):
    """apply_event must derive INDEX/DELETE from status, not from event['operation']."""

    def _apply(self, event: dict, os_mock: MagicMock) -> None:
        counters = _make_counters()
        _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )
        return counters

    def test_non_live_status_calls_delete_not_index(self):
        """REJECTED status → delete must be called, index must not be called."""
        event = _make_event(status="REJECTED")
        event["operation"] = "INDEX"  # producer incorrectly set this
        os_mock = MagicMock()
        os_mock.delete.return_value = {"result": "deleted"}
        counters = _make_counters()
        _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )
        os_mock.delete.assert_called_once()
        os_mock.index.assert_not_called()

    def test_live_status_calls_index_not_delete(self):
        """LIVE status → index must be called, delete must not be called."""
        event = _make_event(status="LIVE")
        event["operation"] = "DELETE"  # producer incorrectly set this
        os_mock = MagicMock()
        os_mock.index.return_value = {"result": "created"}
        counters = _make_counters()
        _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )
        os_mock.index.assert_called_once()
        os_mock.delete.assert_not_called()

    def test_all_non_live_statuses_call_delete(self):
        for status in ["DRAFT", "PENDING", "REJECTED", "ARCHIVED", "UNPUBLISHED", None]:
            with self.subTest(status=status):
                event = _make_event(status=status, event_type="LISTING_UPDATED")
                os_mock = MagicMock()
                os_mock.delete.return_value = {"result": "deleted"}
                counters = _make_counters()
                _apply_event(
                    os_mock, _noop_producer(), event, "listings_incremental_v1",
                    counters, _ts(0)
                )
                os_mock.delete.assert_called_once()
                os_mock.index.assert_not_called()


# ===========================================================================
# 3. PII absence — 6 forbidden keys must never appear in indexed document
# ===========================================================================


class TestPiiAbsenceInDocument(unittest.TestCase):
    PII_KEYS = ["user_id", "seller_id", "phone", "email", "supabase_user_id", "rejectionReason"]

    def test_pii_forbidden_keys_constant(self):
        """PII_FORBIDDEN_KEYS must contain all 6 forbidden fields."""
        for key in self.PII_KEYS:
            self.assertIn(key, PII_FORBIDDEN_KEYS)

    def test_document_whitelist_constant_has_18_fields(self):
        """DOCUMENT_WHITELIST must contain exactly the 18 public fields."""
        expected_18 = frozenset([
            "id", "title", "locality", "description", "area_key", "city_slug",
            "property_type", "seller_type", "bedrooms", "bathrooms", "price_paise",
            "latitude", "longitude", "location", "status", "created_at",
            "hero_image_url",
        ])
        self.assertEqual(DOCUMENT_WHITELIST, expected_18)

    def test_document_sent_to_opensearch_has_no_pii(self):
        """Whitelist excludes PII keys (blacklisted keys are not in DOCUMENT_WHITELIST)."""
        event = _make_event(status="LIVE")
        for pii_key in self.PII_KEYS:
            event["document"][pii_key] = "secret-value"

        os_mock = MagicMock()
        os_mock.index.return_value = {"result": "created"}
        counters = _make_counters()

        _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )

        body = os_mock.index.call_args[1]["body"]
        for pii_key in self.PII_KEYS:
            self.assertNotIn(pii_key, body, f"PII key '{pii_key}' must not be in indexed body")

    def test_non_blacklisted_sensitive_field_excluded_by_whitelist(self):
        """
        POSITIVE WHITELIST PROOF: a field NOT in the 6-key blacklist but also
        NOT in DOCUMENT_WHITELIST (e.g. 'owner_notes', 'internal_score') must
        also be excluded from the indexed body. A pure denylist would pass this
        through; the whitelist approach correctly blocks it.
        """
        event = _make_event(status="LIVE")
        event["document"]["owner_notes"] = "private seller notes"
        event["document"]["internal_score"] = 99
        event["document"]["flagged_by_admin"] = True

        os_mock = MagicMock()
        os_mock.index.return_value = {"result": "created"}
        counters = _make_counters()

        _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )

        body = os_mock.index.call_args[1]["body"]
        self.assertNotIn("owner_notes", body,
                         "Non-whitelisted field 'owner_notes' must be excluded")
        self.assertNotIn("internal_score", body,
                         "Non-whitelisted field 'internal_score' must be excluded")
        self.assertNotIn("flagged_by_admin", body,
                         "Non-whitelisted field 'flagged_by_admin' must be excluded")

    def test_whitelisted_fields_pass_through(self):
        """Whitelisted fields must be present in the indexed body."""
        event = _make_event(status="LIVE")
        event["document"]["hero_image_url"] = "https://example.com/img.jpg"

        os_mock = MagicMock()
        os_mock.index.return_value = {"result": "created"}
        counters = _make_counters()

        _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )

        body = os_mock.index.call_args[1]["body"]
        # 15 scalar whitelisted fields (city_slug/hero_image_url may be absent when None)
        always_present = [
            "id", "title", "locality", "description", "area_key",
            "property_type", "seller_type", "bedrooms", "bathrooms", "price_paise",
            "latitude", "longitude", "location", "status", "created_at",
        ]
        for f in always_present:
            self.assertIn(f, body, f"Whitelisted field '{f}' must be present in indexed body")
        # hero_image_url was set — must be present
        self.assertIn("hero_image_url", body)


# ===========================================================================
# 4. Idempotency — version_type='external_gte' on both INDEX and DELETE
# ===========================================================================


class TestIdempotencyVersioning(unittest.TestCase):
    def test_index_uses_external_gte_version(self):
        """INDEX must pass version and version_type='external_gte' to os_client.index."""
        event = _make_event(status="LIVE", source_updated_at=_ts(100))
        os_mock = MagicMock()
        os_mock.index.return_value = {"result": "created"}
        counters = _make_counters()

        _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )

        call_kwargs = os_mock.index.call_args[1]
        params = call_kwargs.get("params", {})
        self.assertEqual(params.get("version_type"), "external_gte")
        self.assertIsNotNone(params.get("version"))
        self.assertIsInstance(params["version"], int)
        self.assertGreater(params["version"], 0)

    def test_delete_uses_external_gte_version(self):
        """DELETE must pass version and version_type='external_gte' to os_client.delete."""
        event = _make_event(status="ARCHIVED", event_type="LISTING_ARCHIVED",
                            source_updated_at=_ts(200))
        os_mock = MagicMock()
        os_mock.delete.return_value = {"result": "deleted"}
        counters = _make_counters()

        _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )

        call_kwargs = os_mock.delete.call_args[1]
        params = call_kwargs.get("params", {})
        self.assertEqual(params.get("version_type"), "external_gte")
        self.assertIsNotNone(params.get("version"))
        self.assertIsInstance(params["version"], int)
        self.assertGreater(params["version"], 0)

    def test_version_derived_from_source_updated_at(self):
        """compute_version uses source_updated_at when available."""
        ts = datetime(2026, 5, 31, 10, 0, 0, tzinfo=timezone.utc)
        version = compute_version(ts, None)
        expected = int(ts.timestamp() * 1000)
        self.assertEqual(version, expected)

    def test_version_falls_back_to_occurred_at(self):
        """compute_version uses occurred_at when source_updated_at is None."""
        ts = datetime(2026, 5, 31, 10, 0, 0, tzinfo=timezone.utc)
        version = compute_version(None, ts)
        expected = int(ts.timestamp() * 1000)
        self.assertEqual(version, expected)

    def test_index_409_counted_as_skipped_not_failure(self):
        """HTTP 409 on INDEX → counted SKIPPED, not failures; offset is committed (True)."""
        event = _make_event(status="LIVE")
        os_mock = MagicMock()
        exc = Exception("ConflictError(409, version_conflict)")
        exc.status_code = 409
        os_mock.index.side_effect = exc
        counters = _make_counters()

        commit = _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertTrue(commit, "409 INDEX → should commit offset")
        self.assertEqual(counters.skipped, 1)
        self.assertEqual(counters.failures, 0)

    def test_delete_409_counted_as_skipped(self):
        """HTTP 409 on DELETE → counted SKIPPED; offset committed."""
        event = _make_event(status="ARCHIVED", event_type="LISTING_ARCHIVED")
        os_mock = MagicMock()
        exc = Exception("ConflictError(409, version_conflict)")
        exc.status_code = 409
        os_mock.delete.side_effect = exc
        counters = _make_counters()

        commit = _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertTrue(commit)
        self.assertEqual(counters.skipped, 1)
        self.assertEqual(counters.failures, 0)


# ===========================================================================
# 5. Idempotency out-of-order scenarios
# ===========================================================================


class TestIdempotencyOutOfOrder(unittest.TestCase):
    """RC-1(a), RC-1(b), exact-duplicate, stale-delete."""

    def test_rc1a_delete_then_stale_index_skipped(self):
        """RC-1(a): DELETE(T2) applied, then stale INDEX(T1) → 409 → SKIPPED, doc stays deleted."""
        # The DELETE is already applied (versioned tombstone in OpenSearch at T2).
        # Now the stale INDEX(T1) arrives — OpenSearch returns 409.
        event_stale = _make_event(status="LIVE", source_updated_at=_ts(10))  # T1 < T2
        os_mock = MagicMock()
        exc = Exception("ConflictError(409, version_conflict)")
        exc.status_code = 409
        os_mock.index.side_effect = exc  # stale → rejected
        counters = _make_counters()

        commit = _apply_event(
            os_mock, _noop_producer(), event_stale, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertTrue(commit)
        self.assertEqual(counters.skipped, 1, "Stale INDEX after DELETE → SKIPPED")
        self.assertEqual(counters.failures, 0)

    def test_rc1b_newer_index_then_older_index_skipped(self):
        """RC-1(b): INDEX(T2) applied, then older INDEX(T1) → 409 → SKIPPED, T2 retained."""
        event_stale = _make_event(status="LIVE", source_updated_at=_ts(10))  # T1
        os_mock = MagicMock()
        exc = Exception("ConflictError(409, version_conflict)")
        exc.status_code = 409
        os_mock.index.side_effect = exc
        counters = _make_counters()

        commit = _apply_event(
            os_mock, _noop_producer(), event_stale, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertTrue(commit)
        self.assertEqual(counters.skipped, 1, "Stale INDEX → SKIPPED, T2 retained")

    def test_exact_duplicate_index_succeeds(self):
        """Exact-duplicate event (same version): external_gte allows equal → re-index (no error)."""
        event = _make_event(status="LIVE", source_updated_at=_ts(100))
        os_mock = MagicMock()
        os_mock.index.return_value = {"result": "noop"}
        counters = _make_counters()

        commit = _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertTrue(commit)
        self.assertEqual(counters.indexed, 1)
        self.assertEqual(counters.failures, 0)

    def test_stale_delete_after_newer_index_skipped(self):
        """Stale DELETE(T1) after INDEX(T2): 409 → SKIPPED, newer live state wins."""
        event_stale_del = _make_event(
            status="ARCHIVED", event_type="LISTING_ARCHIVED", source_updated_at=_ts(5)
        )  # T1 < T2 of the existing doc
        os_mock = MagicMock()
        exc = Exception("ConflictError(409, version_conflict)")
        exc.status_code = 409
        os_mock.delete.side_effect = exc
        counters = _make_counters()

        commit = _apply_event(
            os_mock, _noop_producer(), event_stale_del, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertTrue(commit)
        self.assertEqual(counters.skipped, 1, "Stale DELETE → SKIPPED")


# ===========================================================================
# 6. Kafka safety gate — 5 cases
# ===========================================================================


class TestKafkaSafetyGate(unittest.TestCase):
    def test_localhost_passes(self):
        """127.0.0.1:9092 → gate passes without raising."""
        _check_kafka_safety_gate("127.0.0.1:9092")  # must not raise

    def test_redpanda_passes(self):
        """redpanda:9092 → gate passes (docker-compose service hostname)."""
        _check_kafka_safety_gate("redpanda:9092")  # must not raise

    def test_kafka_hostname_passes(self):
        """kafka:9092 → gate passes."""
        _check_kafka_safety_gate("kafka:9092")

    def test_localhost_name_passes(self):
        """localhost:9092 → gate passes."""
        _check_kafka_safety_gate("localhost:9092")

    def test_ipv6_loopback_passes(self):
        """[::1]:9092 → gate passes."""
        _check_kafka_safety_gate("[::1]:9092")

    def test_remote_host_raises_and_client_never_constructed(self):
        """
        Remote host → gate raises EnvironmentError BEFORE any Kafka client is constructed.
        The Kafka client constructor must NEVER be called.
        """
        # Patch Producer at confluent_kafka level to detect if it is ever constructed.
        with patch("scripts.opensearch_outbox_relay.Producer") as mock_producer_cls:
            with self.assertRaises(EnvironmentError) as ctx:
                _check_kafka_safety_gate("broker.prod.example.com:9092")
            # Gate raises with the offending host in the message.
            self.assertIn("broker.prod.example.com", str(ctx.exception))
            # Producer constructor must never have been called.
            mock_producer_cls.assert_not_called()
        # Additionally, verify the error message does NOT contain credentials
        try:
            _check_kafka_safety_gate("broker.prod.example.com:9092")
        except EnvironmentError as e:
            self.assertNotIn("password", str(e).lower())
            self.assertNotIn("secret", str(e).lower())

    def test_remote_host_in_run_relay_never_constructs_producer(self):
        """
        In run_relay, the Producer constructor must NEVER be called when the gate raises.
        Producer is imported at module level in the relay; patch confluent_kafka.Producer
        to detect construction attempts.
        """
        import scripts.opensearch_outbox_relay as relay_mod  # noqa: PLC0415
        import argparse  # noqa: PLC0415

        with patch.object(relay_mod, "_check_kafka_safety_gate",
                          side_effect=EnvironmentError("blocked")):
            with patch("scripts.opensearch_outbox_relay.Producer") as mock_producer_cls:
                args = argparse.Namespace(
                    db_url="postgresql://u:p@localhost/db",
                    bootstrap_servers="broker.prod.example.com:9092",
                    batch=100,
                    poll_ms=500,
                    once=True,
                )
                with self.assertRaises(SystemExit):
                    relay_mod.run_relay(args)
                mock_producer_cls.assert_not_called()

    def test_mixed_entry_one_remote_raises(self):
        """localhost:9092,evil.example.com:9092 → gate raises (every entry must be safe)."""
        with self.assertRaises(EnvironmentError) as ctx:
            _check_kafka_safety_gate("localhost:9092,evil.example.com:9092")
        self.assertIn("evil.example.com", str(ctx.exception))

    def test_empty_bootstrap_raises(self):
        """Empty KAFKA_BOOTSTRAP_SERVERS → gate raises (fail-closed)."""
        with self.assertRaises(EnvironmentError):
            _check_kafka_safety_gate("")

    def test_none_bootstrap_raises(self):
        """None KAFKA_BOOTSTRAP_SERVERS → gate raises (fail-closed)."""
        with self.assertRaises(EnvironmentError):
            _check_kafka_safety_gate(None)

    def test_whitespace_only_bootstrap_raises(self):
        """Whitespace-only KAFKA_BOOTSTRAP_SERVERS → gate raises."""
        with self.assertRaises(EnvironmentError):
            _check_kafka_safety_gate("   ")


# ===========================================================================
# 7. Relay: mark-published-after-ack + ack-then-DB-fail
# ===========================================================================


class TestRelayMarkPublished(unittest.TestCase):
    def _run_relay_once(self, rows, mock_producer):
        """Helper: drive run_relay(--once) with given rows and producer mock."""
        import scripts.opensearch_outbox_relay as relay_mod  # noqa: PLC0415
        import argparse  # noqa: PLC0415

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_cur.__enter__ = lambda s: s
        mock_cur.__exit__ = MagicMock(return_value=False)
        mock_conn.__enter__ = lambda s: s
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cur

        args = argparse.Namespace(
            db_url="postgresql://u:p@localhost/db",
            bootstrap_servers="localhost:9092",
            batch=100,
            poll_ms=500,
            once=True,
        )
        with patch("scripts.opensearch_outbox_relay.Producer", return_value=mock_producer):
            with patch("scripts.opensearch_outbox_relay.psycopg2.connect",
                       return_value=mock_conn):
                with patch.object(relay_mod, "_fetch_unpublished", return_value=rows):
                    with patch.object(relay_mod, "_mark_published") as mock_mark:
                        try:
                            relay_mod.run_relay(args)
                        except Exception:
                            pass
                        return mock_mark, mock_producer

    def test_mark_published_called_after_flush(self):
        """
        _mark_published must be called only AFTER producer.flush() succeeds (returns 0).
        This test FAILS if mark_published is called before or instead of flush:
        we track call ordering via a shared call log and assert flush appears
        before any mark_* call.
        """
        import scripts.opensearch_outbox_relay as relay_mod  # noqa: PLC0415
        import argparse  # noqa: PLC0415

        call_order: list[str] = []

        mock_producer = MagicMock()
        mock_producer.produce.side_effect = lambda **kwargs: call_order.append("produce")
        mock_producer.flush.side_effect = lambda timeout=30: (
            call_order.append("flush") or 0  # returns 0 = all delivered
        )

        rows = [{"id": 1, "listing_id": "lid-1", "payload": '{"event_type": "LISTING_APPROVED"}'}]

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_cur.__enter__ = lambda s: s
        mock_cur.__exit__ = MagicMock(return_value=False)
        mock_conn.__enter__ = lambda s: s
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cur

        args = argparse.Namespace(
            db_url="postgresql://u:p@localhost/db",
            bootstrap_servers="localhost:9092",
            batch=100,
            poll_ms=500,
            once=True,
        )

        def tracking_mark(cur, row_id):
            call_order.append(f"mark_{row_id}")

        with patch("scripts.opensearch_outbox_relay.Producer", return_value=mock_producer):
            with patch("scripts.opensearch_outbox_relay.psycopg2.connect",
                       return_value=mock_conn):
                with patch.object(relay_mod, "_fetch_unpublished", return_value=rows):
                    with patch.object(relay_mod, "_mark_published",
                                      side_effect=tracking_mark):
                        try:
                            relay_mod.run_relay(args)
                        except Exception:
                            pass

        # Assert flush was recorded at all (relay did its job)
        self.assertIn("flush", call_order,
                      "flush must be called — broker ack is required before marking published")
        # Assert mark_1 was called (row was marked published on success)
        self.assertIn("mark_1", call_order,
                      "_mark_published must be called for row id=1 when flush succeeds")
        # Critical ordering assertion: flush must appear BEFORE the first mark_*
        flush_idx = call_order.index("flush")
        mark_idx = call_order.index("mark_1")
        self.assertLess(
            flush_idx, mark_idx,
            f"flush must appear before mark_published in call order, "
            f"but got: {call_order}"
        )

    def test_flush_failure_leaves_row_unpublished(self):
        """If flush returns undelivered > 0, _mark_published must NOT be called."""
        import scripts.opensearch_outbox_relay as relay_mod  # noqa: PLC0415
        import argparse  # noqa: PLC0415

        rows = [{"id": 1, "listing_id": "lid-1", "payload": '{"event_type": "LISTING_APPROVED"}'}]

        mock_producer = MagicMock()
        mock_producer.flush.return_value = 1  # 1 undelivered → at-least-once re-send

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_cur.__enter__ = lambda s: s
        mock_cur.__exit__ = MagicMock(return_value=False)
        mock_conn.__enter__ = lambda s: s
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cur

        args = argparse.Namespace(
            db_url="postgresql://u:p@localhost/db",
            bootstrap_servers="localhost:9092",
            batch=100,
            poll_ms=500,
            once=True,
        )

        with patch("scripts.opensearch_outbox_relay.Producer", return_value=mock_producer):
            with patch("scripts.opensearch_outbox_relay.psycopg2.connect",
                       return_value=mock_conn):
                # side_effect=[rows, []] — first call returns the row (flush fails → continue),
                # second call returns empty list → args.once break path terminates the loop.
                with patch.object(relay_mod, "_fetch_unpublished",
                                  side_effect=[rows, []]):
                    with patch.object(relay_mod, "_mark_published") as mock_mark:
                        try:
                            relay_mod.run_relay(args)
                        except Exception:
                            pass
                        # _mark_published must NOT have been called when flush had undelivered > 0
                        mock_mark.assert_not_called()


# ===========================================================================
# 8. Offset commit ordering
# ===========================================================================


class TestOffsetCommitOrdering(unittest.TestCase):
    def test_write_5xx_returns_false_no_commit(self):
        """INDEX 5xx → _apply_event returns False (do NOT commit offset)."""
        event = _make_event(status="LIVE")
        os_mock = MagicMock()
        exc = Exception("ServiceUnavailableError(503)")
        exc.status_code = 503
        os_mock.index.side_effect = exc
        counters = _make_counters()

        commit = _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertFalse(commit, "5xx INDEX → must NOT commit offset")
        self.assertEqual(counters.failures, 1)

    def test_delete_5xx_returns_false_no_commit(self):
        """DELETE 5xx → _apply_event returns False (do NOT commit offset)."""
        event = _make_event(status="ARCHIVED", event_type="LISTING_ARCHIVED")
        os_mock = MagicMock()
        exc = Exception("ServiceUnavailableError(503)")
        exc.status_code = 503
        os_mock.delete.side_effect = exc
        counters = _make_counters()

        commit = _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertFalse(commit, "5xx DELETE → must NOT commit offset")
        self.assertEqual(counters.failures, 1)

    def test_successful_index_returns_true_commit(self):
        """Successful INDEX → returns True (commit offset)."""
        event = _make_event(status="LIVE")
        os_mock = MagicMock()
        os_mock.index.return_value = {"result": "created"}
        counters = _make_counters()

        commit = _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertTrue(commit)

    def test_successful_delete_returns_true_commit(self):
        """Successful DELETE → returns True (commit offset)."""
        event = _make_event(status="REJECTED", event_type="LISTING_REJECTED")
        os_mock = MagicMock()
        os_mock.delete.return_value = {"result": "deleted"}
        counters = _make_counters()

        commit = _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertTrue(commit)

    def test_network_error_no_status_code_returns_false_no_commit(self):
        """
        Network/connection/timeout error (no .status_code) → retryable.
        Must return False (do NOT commit offset) so the event is retried.
        Must NOT route to DLQ (DLQ has no reprocessor; routing here silently drops events).
        """
        event = _make_event(status="LIVE")
        os_mock = MagicMock()
        # Simulate a network error with no status_code attribute
        network_exc = ConnectionError("Connection refused — broker unreachable")
        # Explicitly verify no status_code attribute
        self.assertFalse(hasattr(network_exc, "status_code"))
        os_mock.index.side_effect = network_exc
        counters = _make_counters()
        mock_producer = _noop_producer()

        commit = _apply_event(
            os_mock, mock_producer, event, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertFalse(commit, "Network error → must NOT commit offset (retryable)")
        self.assertEqual(counters.failures, 1)
        # DLQ must NOT be produced to for a retryable network error
        mock_producer.produce.assert_not_called()

    def test_network_error_on_delete_returns_false_no_commit(self):
        """Network error on DELETE → retryable, no commit, no DLQ."""
        event = _make_event(status="ARCHIVED", event_type="LISTING_ARCHIVED")
        os_mock = MagicMock()
        network_exc = ConnectionError("timeout")
        os_mock.delete.side_effect = network_exc
        counters = _make_counters()
        mock_producer = _noop_producer()

        commit = _apply_event(
            os_mock, mock_producer, event, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertFalse(commit)
        self.assertEqual(counters.failures, 1)
        mock_producer.produce.assert_not_called()


# ===========================================================================
# 9. DELETE 404 = success vs DELETE 5xx = DLQ
# ===========================================================================


class TestDeleteErrorHandling(unittest.TestCase):
    def test_delete_404_is_success(self):
        """DELETE 404 → SKIPPED (idempotent success), offset committed."""
        event = _make_event(status="ARCHIVED", event_type="LISTING_ARCHIVED")
        os_mock = MagicMock()
        exc = Exception("NotFoundError(404)")
        exc.status_code = 404
        os_mock.delete.side_effect = exc
        counters = _make_counters()

        commit = _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertTrue(commit, "DELETE 404 → must commit offset")
        self.assertEqual(counters.skipped, 1)
        self.assertEqual(counters.failures, 0)

    def test_delete_5xx_routes_to_dlq(self):
        """DELETE 5xx → failure counted + DLQ produced, offset NOT committed."""
        event = _make_event(status="ARCHIVED", event_type="LISTING_ARCHIVED")
        os_mock = MagicMock()
        exc = Exception("ServiceUnavailableError(503)")
        exc.status_code = 503
        os_mock.delete.side_effect = exc
        counters = _make_counters()
        mock_producer = _noop_producer()

        commit = _apply_event(
            os_mock, mock_producer, event, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertFalse(commit)
        self.assertEqual(counters.failures, 1)
        mock_producer.produce.assert_called()  # DLQ must be produced to


# ===========================================================================
# 10. INDEX 409 = skipped vs INDEX 5xx = DLQ
# ===========================================================================


class TestIndexErrorHandling(unittest.TestCase):
    def test_index_409_is_skipped_not_error(self):
        """INDEX 409 → SKIPPED, not a failure; offset committed."""
        event = _make_event(status="LIVE")
        os_mock = MagicMock()
        exc = Exception("ConflictError(409)")
        exc.status_code = 409
        os_mock.index.side_effect = exc
        counters = _make_counters()

        commit = _apply_event(
            os_mock, _noop_producer(), event, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertTrue(commit)
        self.assertEqual(counters.skipped, 1)
        self.assertEqual(counters.failures, 0)

    def test_index_5xx_routes_to_dlq_no_commit(self):
        """INDEX 5xx → DLQ produced, failure counted, offset NOT committed."""
        event = _make_event(status="LIVE")
        os_mock = MagicMock()
        exc = Exception("InternalError(500)")
        exc.status_code = 500
        os_mock.index.side_effect = exc
        counters = _make_counters()
        mock_producer = _noop_producer()

        commit = _apply_event(
            os_mock, mock_producer, event, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertFalse(commit)
        self.assertEqual(counters.failures, 1)
        mock_producer.produce.assert_called()  # DLQ


# ===========================================================================
# 11. Dedicated index validation
# ===========================================================================


class TestDedicatedIndexValidation(unittest.TestCase):
    def test_valid_dedicated_index_passes(self):
        """listings_incremental_v1 is a valid dedicated index."""
        validate_dedicated_index("listings_incremental_v1")  # must not raise

    def test_rebuild_alias_rejected(self):
        """listings_read (full-rebuild alias) → ValueError."""
        with self.assertRaises(ValueError) as ctx:
            validate_dedicated_index("listings_read")
        self.assertIn("listings_read", str(ctx.exception))

    def test_rebuild_versioned_pattern_rejected(self):
        """listings_v20260531_123456 matches listings_v* → ValueError."""
        with self.assertRaises(ValueError) as ctx:
            validate_dedicated_index("listings_v20260531_123456")
        self.assertIn("listings_v", str(ctx.exception))

    def test_rebuild_prefix_rejected(self):
        """listings_vABC also matches listings_v* → ValueError."""
        with self.assertRaises(ValueError):
            validate_dedicated_index("listings_vanything")

    def test_custom_index_name_passes(self):
        """A custom index name like 'my_test_index' passes."""
        validate_dedicated_index("my_test_index")


# ===========================================================================
# 12. Counter increments
# ===========================================================================


class TestCounterIncrements(unittest.TestCase):
    def test_indexed_increments_on_live(self):
        event = _make_event(status="LIVE")
        os_mock = MagicMock()
        os_mock.index.return_value = {"result": "created"}
        counters = _make_counters()
        _apply_event(os_mock, _noop_producer(), event, "listings_incremental_v1", counters, _ts(0))
        self.assertEqual(counters.indexed, 1)
        self.assertEqual(counters.deleted, 0)
        self.assertEqual(counters.skipped, 0)
        self.assertEqual(counters.failures, 0)

    def test_deleted_increments_on_non_live(self):
        event = _make_event(status="REJECTED", event_type="LISTING_REJECTED")
        os_mock = MagicMock()
        os_mock.delete.return_value = {"result": "deleted"}
        counters = _make_counters()
        _apply_event(os_mock, _noop_producer(), event, "listings_incremental_v1", counters, _ts(0))
        self.assertEqual(counters.deleted, 1)
        self.assertEqual(counters.indexed, 0)

    def test_skipped_increments_on_409(self):
        event = _make_event(status="LIVE")
        os_mock = MagicMock()
        exc = Exception("ConflictError(409)")
        exc.status_code = 409
        os_mock.index.side_effect = exc
        counters = _make_counters()
        _apply_event(os_mock, _noop_producer(), event, "listings_incremental_v1", counters, _ts(0))
        self.assertEqual(counters.skipped, 1)

    def test_failures_increments_on_5xx(self):
        event = _make_event(status="LIVE")
        os_mock = MagicMock()
        exc = Exception("ServerError(500)")
        exc.status_code = 500
        os_mock.index.side_effect = exc
        counters = _make_counters()
        _apply_event(os_mock, _noop_producer(), event, "listings_incremental_v1", counters, _ts(0))
        self.assertEqual(counters.failures, 1)

    def test_skipped_increments_on_delete_404(self):
        event = _make_event(status="ARCHIVED", event_type="LISTING_ARCHIVED")
        os_mock = MagicMock()
        exc = Exception("NotFoundError(404)")
        exc.status_code = 404
        os_mock.delete.side_effect = exc
        counters = _make_counters()
        _apply_event(os_mock, _noop_producer(), event, "listings_incremental_v1", counters, _ts(0))
        self.assertEqual(counters.skipped, 1)


# ===========================================================================
# 13. Lag tracking
# ===========================================================================


class TestLagTracking(unittest.TestCase):
    def test_lag_recorded_and_stats_computed(self):
        counters = PipelineCounters()
        occurred = _ts(0)
        processed = _ts(2)  # 2s later = 2000ms
        counters.record_lag(occurred, processed)
        stats = counters.lag_stats()
        self.assertAlmostEqual(stats["p50_ms"], 2000.0, delta=1.0)
        self.assertAlmostEqual(stats["max_ms"], 2000.0, delta=1.0)

    def test_lag_stats_empty_when_no_samples(self):
        counters = PipelineCounters()
        self.assertEqual(counters.lag_stats(), {})

    def test_lag_recorded_in_apply_event(self):
        event = _make_event(status="LIVE", occurred_at=_ts(0))
        os_mock = MagicMock()
        os_mock.index.return_value = {"result": "created"}
        counters = _make_counters()
        processed_at = _ts(5)  # 5s after occurred_at
        _apply_event(os_mock, _noop_producer(), event, "listings_incremental_v1",
                     counters, processed_at)
        self.assertTrue(len(counters._lag_samples) > 0)


# ===========================================================================
# 14. Unknown event version → DLQ (fail-closed)
# ===========================================================================


class TestUnknownEventVersion(unittest.TestCase):
    def test_unknown_version_routes_to_dlq(self):
        """event_version=99 → DLQ produced, failure counted, offset committed."""
        event = _make_event(status="LIVE")
        event["event_version"] = 99  # unknown future version
        os_mock = MagicMock()
        counters = _make_counters()
        mock_producer = _noop_producer()

        commit = _apply_event(
            os_mock, mock_producer, event, "listings_incremental_v1",
            counters, _ts(0)
        )

        self.assertTrue(commit, "Unknown version → commit offset (unprocessable)")
        mock_producer.produce.assert_called()  # DLQ
        self.assertEqual(counters.failures, 1)
        # OpenSearch must NOT be called for unknown version
        os_mock.index.assert_not_called()
        os_mock.delete.assert_not_called()


# ===========================================================================
# 15. _parse_kafka_host
# ===========================================================================


class TestParseKafkaHost(unittest.TestCase):
    def test_host_port(self):
        self.assertEqual(_parse_kafka_host("localhost:9092"), "localhost")

    def test_ipv6_bracketed(self):
        self.assertEqual(_parse_kafka_host("[::1]:9092"), "::1")

    def test_hostname_only(self):
        self.assertEqual(_parse_kafka_host("redpanda"), "redpanda")

    def test_ip_port(self):
        self.assertEqual(_parse_kafka_host("127.0.0.1:9092"), "127.0.0.1")

    def test_bare_ipv6_loopback(self):
        """
        Bare unbracketed IPv6 '::1:9092': rsplit(':',1) → left='::1', right='9092'.
        The extracted host '::1' is in the allowlist → gate passes.
        """
        host = _parse_kafka_host("::1:9092")
        self.assertEqual(host, "::1")
        # Gate must pass for this host
        _check_kafka_safety_gate("::1:9092")  # must not raise


# ===========================================================================
# 16. DATABASE_URL safety gate
# ===========================================================================


class TestDbSafetyGate(unittest.TestCase):
    def test_localhost_db_url_passes(self):
        """postgresql://user:pass@localhost:5432/db → gate passes."""
        _check_db_safety_gate("postgresql://user:pass@localhost:5432/db")  # must not raise

    def test_127_db_url_passes(self):
        """postgresql://user:pass@127.0.0.1:5432/db → gate passes."""
        _check_db_safety_gate("postgresql://user:pass@127.0.0.1:5432/db")

    def test_remote_db_url_raises(self):
        """postgresql://user:pass@prod.example.com:5432/db → EnvironmentError."""
        with self.assertRaises(EnvironmentError) as ctx:
            _check_db_safety_gate("postgresql://user:pass@prod.example.com:5432/db")
        # Error must NOT echo the password
        self.assertNotIn("pass", str(ctx.exception))

    def test_empty_db_url_raises(self):
        """Empty DATABASE_URL → EnvironmentError (fail-closed)."""
        with self.assertRaises(EnvironmentError):
            _check_db_safety_gate("")

    def test_none_db_url_raises(self):
        """None DATABASE_URL → EnvironmentError (fail-closed)."""
        with self.assertRaises(EnvironmentError):
            _check_db_safety_gate(None)

    def test_relay_gates_db_url_before_connect(self):
        """
        run_relay must call _check_db_safety_gate before psycopg2.connect.
        When the DB gate raises, psycopg2.connect must NEVER be called.
        """
        import scripts.opensearch_outbox_relay as relay_mod  # noqa: PLC0415
        import argparse  # noqa: PLC0415

        args = argparse.Namespace(
            db_url="postgresql://u:p@prod.example.com/db",
            bootstrap_servers="localhost:9092",
            batch=100,
            poll_ms=500,
            once=True,
        )
        with patch("scripts.opensearch_outbox_relay.psycopg2.connect") as mock_connect:
            with self.assertRaises(SystemExit):
                relay_mod.run_relay(args)
            mock_connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
