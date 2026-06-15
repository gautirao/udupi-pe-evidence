"""
Tests for scripts/opensearch_rebuild.py — issue #1315.

No real DB or OpenSearch connection required; all external calls are mocked.

Run with:
    python -m pytest scripts/test_opensearch_rebuild.py -v
"""

from __future__ import annotations

import argparse
import re
import sys
import unittest
from unittest.mock import MagicMock, call, patch

# ---------------------------------------------------------------------------
# Import the module under test
# ---------------------------------------------------------------------------
import importlib
import os

# Allow running from repo root or scripts/ directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from opensearchpy import NotFoundError as OpenSearchNotFoundError

from scripts.opensearch_rebuild import (
    _atomic_alias_swap,
    _check_safety_gates,
    _generate_index_name,
    _is_safe_url,
    _row_to_doc,
    _validate_count,
    run_rebuild,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_args(**kwargs) -> argparse.Namespace:
    """Return a Namespace with all run_rebuild defaults, overridable by kwargs."""
    defaults = dict(
        url="http://localhost:9200",
        db_url="postgresql://user:pass@localhost:5432/testdb",
        batch_size=500,
        count=None,
        max_count_delta=0,
        max_failures=0,
        cleanup_old=False,
        cleanup_stale=False,
        allow_non_localhost=False,
        alias="listings_read",
        dry_run=False,
    )
    defaults.update(kwargs)
    return argparse.Namespace(**defaults)


def _make_valid_row(**overrides) -> dict:
    """Return a minimal valid Postgres row dict for _row_to_doc."""
    row = {
        "id": 42,
        "title": "Nice house",
        "locality": "Udupi",
        "description": "Great view",
        "area_key": "area_001",
        "property_type": "HOUSE",
        "seller_type": "OWNER",
        "bedrooms": 3,
        "bathrooms": 2,
        "price_paise": 5000000,
        "latitude": 13.3409,
        "longitude": 74.7421,
        "status": "LIVE",
        "created_at": None,
        "city_slug": "udupi",
        "hero_image_url": "https://example.com/img.jpg",
    }
    row.update(overrides)
    return row


# ---------------------------------------------------------------------------
# 1. _generate_index_name format
# ---------------------------------------------------------------------------

class TestGenerateIndexName(unittest.TestCase):
    def test_generate_index_name_format(self):
        name = _generate_index_name()
        self.assertRegex(name, r"^listings_v\d{8}_\d{6}$")


# ---------------------------------------------------------------------------
# 2–4. _is_safe_url
# ---------------------------------------------------------------------------

class TestIsSafeUrl(unittest.TestCase):
    def test_is_safe_url_localhost(self):
        self.assertTrue(_is_safe_url("http://localhost:9200"))

    def test_is_safe_url_127(self):
        self.assertTrue(_is_safe_url("http://127.0.0.1:9200"))

    def test_is_safe_url_ipv6(self):
        # urllib.parse.urlparse parses "[::1]" as hostname "::1"
        self.assertTrue(_is_safe_url("http://[::1]:9200"))

    def test_is_safe_url_external(self):
        self.assertFalse(_is_safe_url("http://opensearch.prod.example.com:9200"))

    def test_is_safe_url_empty_string(self):
        # Empty URL: urlparse gives hostname=None -> treated as safe (no host to block)
        self.assertTrue(_is_safe_url(""))

    def test_is_safe_url_unix_socket(self):
        # Unix socket style: hostname=None -> treated as safe (local process communication)
        self.assertTrue(_is_safe_url("unix:///var/run/postgresql"))


# ---------------------------------------------------------------------------
# 5–7. _validate_count
# ---------------------------------------------------------------------------

class TestValidateCount(unittest.TestCase):
    def test_validate_count_exact(self):
        # pg=100, null_coord=5, indexed=95, delta=0 → True
        result = _validate_count(pg_live_count=100, null_coord_count=5, indexed_count=95, max_delta=0)
        self.assertTrue(result)

    def test_validate_count_within_delta(self):
        # pg=100, null_coord=5, indexed=94, max_delta=1 → True (|95-94|=1 <= 1)
        result = _validate_count(pg_live_count=100, null_coord_count=5, indexed_count=94, max_delta=1)
        self.assertTrue(result)

    def test_validate_count_exceeds_delta(self):
        # pg=100, null_coord=5, indexed=93, max_delta=1 → False (|95-93|=2 > 1)
        result = _validate_count(pg_live_count=100, null_coord_count=5, indexed_count=93, max_delta=1)
        self.assertFalse(result)


# ---------------------------------------------------------------------------
# 8–11. _row_to_doc
# ---------------------------------------------------------------------------

class TestRowToDoc(unittest.TestCase):
    def test_row_to_doc_null_coord_returns_none(self):
        row = _make_valid_row(latitude=None)
        self.assertIsNone(_row_to_doc(row, "listings_v20260101_120000"))

    def test_row_to_doc_null_lon_returns_none(self):
        row = _make_valid_row(longitude=None)
        self.assertIsNone(_row_to_doc(row, "listings_v20260101_120000"))

    def test_row_to_doc_valid_row(self):
        row = _make_valid_row()
        doc = _row_to_doc(row, "listings_v20260101_120000")
        self.assertIsNotNone(doc)
        self.assertEqual(doc["_index"], "listings_v20260101_120000")
        self.assertEqual(doc["_id"], "42")
        src = doc["_source"]
        self.assertEqual(src["id"], "42")
        self.assertEqual(src["city_slug"], "udupi")
        self.assertEqual(src["hero_image_url"], "https://example.com/img.jpg")
        self.assertEqual(src["location"], {"lat": 13.3409, "lon": 74.7421})
        self.assertAlmostEqual(src["latitude"], 13.3409, places=4)
        self.assertAlmostEqual(src["longitude"], 74.7421, places=4)

    def test_row_to_doc_null_city_slug_omitted(self):
        row = _make_valid_row(city_slug=None)
        doc = _row_to_doc(row, "listings_v20260101_120000")
        self.assertIsNotNone(doc)
        self.assertNotIn("city_slug", doc["_source"])

    def test_row_to_doc_null_hero_omitted(self):
        row = _make_valid_row(hero_image_url=None)
        doc = _row_to_doc(row, "listings_v20260101_120000")
        self.assertIsNotNone(doc)
        self.assertNotIn("hero_image_url", doc["_source"])


# ---------------------------------------------------------------------------
# 12–13. _check_safety_gates
# ---------------------------------------------------------------------------

class TestSafetyGates(unittest.TestCase):
    def test_safety_gate_non_localhost_exits(self):
        args = _make_args(url="http://opensearch.prod.example.com:9200")
        with self.assertRaises(SystemExit) as cm:
            _check_safety_gates(args)
        self.assertEqual(cm.exception.code, 1)

    def test_safety_gate_db_url_non_localhost_exits(self):
        args = _make_args(db_url="postgresql://user:pass@prod.example.com:5432/db")
        with self.assertRaises(SystemExit) as cm:
            _check_safety_gates(args)
        self.assertEqual(cm.exception.code, 1)

    def test_safety_gate_allows_with_flag(self):
        args = _make_args(
            url="http://opensearch.prod.example.com:9200",
            allow_non_localhost=True,
        )
        # Should not raise or exit
        _check_safety_gates(args)


# ---------------------------------------------------------------------------
# 14–15. _atomic_alias_swap
# ---------------------------------------------------------------------------

class TestAtomicAliasSwap(unittest.TestCase):
    def test_atomic_alias_swap_first_run(self):
        """old_index=None -> actions has only 'add', no 'remove'."""
        client = MagicMock()
        _atomic_alias_swap(client, "listings_read", None, "listings_v20260101_120000")
        client.indices.update_aliases.assert_called_once()
        body = client.indices.update_aliases.call_args[1]["body"]
        actions = body["actions"]
        self.assertEqual(len(actions), 1)
        self.assertIn("add", actions[0])
        self.assertNotIn("remove", actions[0])
        self.assertEqual(actions[0]["add"]["index"], "listings_v20260101_120000")
        self.assertEqual(actions[0]["add"]["alias"], "listings_read")

    def test_atomic_alias_swap_subsequent_run(self):
        """old_index set -> actions has both 'remove' and 'add'."""
        client = MagicMock()
        _atomic_alias_swap(
            client,
            "listings_read",
            "listings_v20260101_120000",
            "listings_v20260531_093000",
        )
        client.indices.update_aliases.assert_called_once()
        body = client.indices.update_aliases.call_args[1]["body"]
        actions = body["actions"]
        self.assertEqual(len(actions), 2)
        action_types = {list(a.keys())[0] for a in actions}
        self.assertIn("remove", action_types)
        self.assertIn("add", action_types)
        remove_action = next(a for a in actions if "remove" in a)
        add_action = next(a for a in actions if "add" in a)
        self.assertEqual(remove_action["remove"]["index"], "listings_v20260101_120000")
        self.assertEqual(add_action["add"]["index"], "listings_v20260531_093000")


# ---------------------------------------------------------------------------
# 16. run_rebuild --dry-run: no bulk() or update_aliases() called
# ---------------------------------------------------------------------------

class TestDryRun(unittest.TestCase):
    @patch("scripts.opensearch_rebuild.psycopg2.connect")
    @patch("scripts.opensearch_rebuild._build_opensearch_client")
    @patch("scripts.opensearch_rebuild.bulk")
    def test_dry_run_no_indexing(self, mock_bulk, mock_os_client, mock_pg_connect):
        """With --dry-run, no bulk() or update_aliases() should be called."""
        # Set up mock Postgres cursor to return a count
        mock_cur = MagicMock()
        mock_cur.__enter__ = lambda s: s
        mock_cur.__exit__ = MagicMock(return_value=False)
        mock_cur.fetchone.return_value = {"count": 42}

        mock_conn = MagicMock()
        mock_conn.__enter__ = lambda s: s
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cur
        mock_pg_connect.return_value = mock_conn

        args = _make_args(dry_run=True)

        run_rebuild(args)

        # bulk must never have been called
        mock_bulk.assert_not_called()
        # OpenSearch client should not even be instantiated on dry run
        mock_os_client.assert_not_called()
        # Specifically, update_aliases must not be called
        if mock_os_client.return_value.indices.update_aliases.called:
            self.fail("update_aliases was called during --dry-run")


# ---------------------------------------------------------------------------
# 17. --count partial run suppresses alias swap
# ---------------------------------------------------------------------------

class TestPartialRunSuppressesAliasSwap(unittest.TestCase):
    @patch("scripts.opensearch_rebuild.psycopg2.connect")
    @patch("scripts.opensearch_rebuild._build_opensearch_client")
    @patch("scripts.opensearch_rebuild.bulk")
    def test_count_partial_run_suppresses_alias_swap(
        self, mock_bulk, mock_os_client, mock_pg_connect
    ):
        """With --count set, update_aliases must NOT be called and sys.exit(1) raised."""
        # Postgres mock: count=100, fetchall returns one valid row per call
        mock_cur = MagicMock()
        mock_cur.__enter__ = lambda s: s
        mock_cur.__exit__ = MagicMock(return_value=False)
        mock_cur.fetchone.return_value = {"count": 100}
        mock_cur.fetchall.return_value = [_make_valid_row()]

        mock_conn = MagicMock()
        mock_conn.__enter__ = lambda s: s
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cur
        mock_pg_connect.return_value = mock_conn

        # OpenSearch mock: count() returns 1 (matches 1 doc indexed)
        mock_client = MagicMock()
        # Simulate "no alias exists yet" — get_alias returns empty dict -> _get_alias_current_target returns None
        mock_client.indices.get_alias.return_value = {}
        mock_client.count.return_value = {"count": 1}
        mock_os_client.return_value = mock_client

        # bulk() returns success for 1 doc
        mock_bulk.return_value = (1, [])

        # max_count_delta=100 intentionally absorbs the mismatch so execution reaches
        # the partial-run guard (the guard's correctness, not count-validation, is under test)
        args = _make_args(count=10, max_count_delta=100)

        with self.assertRaises(SystemExit) as cm:
            run_rebuild(args)
        self.assertEqual(cm.exception.code, 1)
        mock_client.indices.update_aliases.assert_not_called()


# ---------------------------------------------------------------------------
# 18. Bulk failure over threshold exits without swapping alias
# ---------------------------------------------------------------------------

class TestBulkFailureOverThreshold(unittest.TestCase):
    @patch("scripts.opensearch_rebuild.psycopg2.connect")
    @patch("scripts.opensearch_rebuild._build_opensearch_client")
    @patch("scripts.opensearch_rebuild.bulk")
    def test_bulk_failure_over_threshold_exits(
        self, mock_bulk, mock_os_client, mock_pg_connect
    ):
        """When bulk() errors exceed --max-failures, sys.exit(1) and update_aliases NOT called."""
        mock_cur = MagicMock()
        mock_cur.__enter__ = lambda s: s
        mock_cur.__exit__ = MagicMock(return_value=False)
        mock_cur.fetchone.return_value = {"count": 5}
        mock_cur.fetchall.return_value = [_make_valid_row(id=i) for i in range(1, 6)]

        mock_conn = MagicMock()
        mock_conn.__enter__ = lambda s: s
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cur
        mock_pg_connect.return_value = mock_conn

        mock_client = MagicMock()
        # Simulate "no alias exists yet" — get_alias returns empty dict -> _get_alias_current_target returns None
        mock_client.indices.get_alias.return_value = {}
        mock_os_client.return_value = mock_client

        # bulk() reports 3 errors; max_failures=0
        fake_errors = [{"index": {"error": "mapping error"}}] * 3
        mock_bulk.return_value = (2, fake_errors)

        args = _make_args(max_failures=0)

        with self.assertRaises(SystemExit) as cm:
            run_rebuild(args)
        self.assertEqual(cm.exception.code, 1)
        mock_client.indices.update_aliases.assert_not_called()


# ---------------------------------------------------------------------------
# 19. Agricultural field parity tests (issue #1461)
# ---------------------------------------------------------------------------

def _make_agri_row(**overrides) -> dict:
    """Return a representative agri Postgres row as SELECT_SQL would return it."""
    from decimal import Decimal
    row = {
        "id": 99,
        "title": "[AGRI] 12-Acre Paddy Field, Padubidri",
        "locality": "Padubidri",
        "description": "Fertile paddy land near highway",
        "area_key": "area_agri_001",
        "property_type": "AGRICULTURAL",
        "seller_type": "OWNER",
        "bedrooms": None,
        "bathrooms": None,
        "price_paise": 12500000,
        "latitude": 13.1782,
        "longitude": 74.7582,
        "status": "LIVE",
        "created_at": None,
        "updated_at": None,
        "first_published_at": None,
        "last_updated_at": None,
        "back_to_market_at": None,
        "city_slug": "udupi",
        "hero_image_url": None,
        "listing_number": 1001,
        "land_area": Decimal("12.0"),
        "land_area_unit": "ACRES",
        "built_area": None,
        "built_area_unit": None,
        "rera_number": None,
        "trust_tier": None,
        "possession_status": None,
        "listing_purpose": "SALE",
        # Agri-specific
        "land_category": "FARMLAND",
        "water_source": "BOREWELL",
        "soil_type": "LATERITE",
        "road_access": "TARRED_ROAD",
        "cultivation_status": "CULTIVATED",
        "ownership_type": "FREEHOLD",
        "farmhouse_available": False,
        "fencing_done": True,
        "computed_area_acres": Decimal("12.50"),
    }
    row.update(overrides)
    return row


class TestRowToDocAgriFields(unittest.TestCase):
    """Tests for _row_to_doc covering agricultural field parity (issue #1461)."""

    _INDEX = "listings_v20261001_120000"

    def test_agri_row_all_fields_present(self):
        """Full agri row → doc._source contains all 9 agri fields with correct values."""
        row = _make_agri_row()
        doc = _row_to_doc(row, self._INDEX)
        self.assertIsNotNone(doc)
        src = doc["_source"]

        self.assertEqual(src["land_category"], "FARMLAND")
        self.assertEqual(src["water_source"], "BOREWELL")
        self.assertEqual(src["soil_type"], "LATERITE")
        self.assertEqual(src["road_access"], "TARRED_ROAD")
        self.assertEqual(src["cultivation_status"], "CULTIVATED")
        self.assertEqual(src["ownership_type"], "FREEHOLD")
        self.assertIs(src["farmhouse_available"], False)
        self.assertIs(src["fencing_done"], True)
        self.assertAlmostEqual(src["computed_area_acres"], 12.50, places=2)
        self.assertIsInstance(src["computed_area_acres"], float)

    def test_water_source_not_available_preserved(self):
        """water_source='NOT_AVAILABLE' is a real keyword and must NOT be omitted."""
        row = _make_agri_row(water_source="NOT_AVAILABLE")
        doc = _row_to_doc(row, self._INDEX)
        self.assertIsNotNone(doc)
        self.assertIn("water_source", doc["_source"])
        self.assertEqual(doc["_source"]["water_source"], "NOT_AVAILABLE")

    def test_water_source_none_omitted(self):
        """water_source=None → key absent from _source (null-omission)."""
        row = _make_agri_row(water_source=None)
        doc = _row_to_doc(row, self._INDEX)
        self.assertIsNotNone(doc)
        self.assertNotIn("water_source", doc["_source"])

    def test_farmhouse_available_false_preserved(self):
        """farmhouse_available=False must be present as False (not omitted — null != false)."""
        row = _make_agri_row(farmhouse_available=False)
        doc = _row_to_doc(row, self._INDEX)
        self.assertIsNotNone(doc)
        self.assertIn("farmhouse_available", doc["_source"])
        self.assertIs(doc["_source"]["farmhouse_available"], False)

    def test_farmhouse_available_none_omitted(self):
        """farmhouse_available=None → key absent from _source."""
        row = _make_agri_row(farmhouse_available=None)
        doc = _row_to_doc(row, self._INDEX)
        self.assertIsNotNone(doc)
        self.assertNotIn("farmhouse_available", doc["_source"])

    def test_farmhouse_available_true_preserved(self):
        """farmhouse_available=True must be present as True."""
        row = _make_agri_row(farmhouse_available=True)
        doc = _row_to_doc(row, self._INDEX)
        self.assertIsNotNone(doc)
        self.assertIs(doc["_source"]["farmhouse_available"], True)

    def test_fencing_done_false_preserved(self):
        """fencing_done=False must be present (not omitted)."""
        row = _make_agri_row(fencing_done=False)
        doc = _row_to_doc(row, self._INDEX)
        self.assertIsNotNone(doc)
        self.assertIn("fencing_done", doc["_source"])
        self.assertIs(doc["_source"]["fencing_done"], False)

    def test_fencing_done_none_omitted(self):
        """fencing_done=None → key absent from _source."""
        row = _make_agri_row(fencing_done=None)
        doc = _row_to_doc(row, self._INDEX)
        self.assertIsNotNone(doc)
        self.assertNotIn("fencing_done", doc["_source"])

    def test_computed_area_acres_decimal_converted_to_float(self):
        """Decimal from Postgres ROUND(...) is converted to Python float."""
        from decimal import Decimal
        row = _make_agri_row(computed_area_acres=Decimal("12.50"))
        doc = _row_to_doc(row, self._INDEX)
        self.assertIsNotNone(doc)
        src = doc["_source"]
        self.assertIn("computed_area_acres", src)
        self.assertIsInstance(src["computed_area_acres"], float)
        self.assertAlmostEqual(src["computed_area_acres"], 12.50, places=2)

    def test_computed_area_acres_none_omitted(self):
        """computed_area_acres=None (NULL boundary) → key absent from _source."""
        row = _make_agri_row(computed_area_acres=None)
        doc = _row_to_doc(row, self._INDEX)
        self.assertIsNotNone(doc)
        self.assertNotIn("computed_area_acres", doc["_source"])

    def test_no_pii_fields_in_source(self):
        """No PII columns must appear in _source regardless of what the row contains."""
        pii_keys = {
            "survey_number", "user_id", "seller_id", "supabase_user_id",
            "phone", "email", "owner_name", "rejection_reason",
        }
        # Inject PII-like keys into the row dict to prove they are never copied through
        row = _make_agri_row(
            user_id="user-uuid-abc",
            seller_id="seller-uuid-xyz",
            supabase_user_id="supa-uuid-123",
            survey_number="SRV/123/456",
            phone="+919999999999",
            email="seller@example.com",
            owner_name="Test Owner",
            rejection_reason="incomplete docs",
        )
        doc = _row_to_doc(row, self._INDEX)
        self.assertIsNotNone(doc)
        present = pii_keys & set(doc["_source"].keys())
        self.assertEqual(present, set(), msg=f"PII keys found in _source: {present}")

    def test_computed_area_acres_zero_preserved(self):
        """computed_area_acres=0.0 must be present (proves `is None` omission, not falsiness).

        0.0 is a legitimate value (boundary resolves to zero acres via ST_Area rounding).
        The null-omission loop uses `is None`, so 0.0 must survive and not be stripped.
        """
        from decimal import Decimal
        row = _make_agri_row(computed_area_acres=Decimal("0.0"))
        doc = _row_to_doc(row, self._INDEX)
        self.assertIsNotNone(doc)
        self.assertIn("computed_area_acres", doc["_source"])
        self.assertEqual(doc["_source"]["computed_area_acres"], 0.0)
        self.assertIsInstance(doc["_source"]["computed_area_acres"], float)

    def test_non_agri_row_has_no_agri_keys(self):
        """Non-agri row (HOUSE, all agri columns None) → none of the 9 agri keys present.

        This proves byte-compat with pre-#1461 indexed docs: existing non-agri
        listings are not polluted with empty agri fields.
        """
        agri_keys = {
            "land_category", "water_source", "soil_type", "road_access",
            "cultivation_status", "ownership_type", "farmhouse_available",
            "fencing_done", "computed_area_acres",
        }
        row = _make_valid_row(
            property_type="HOUSE",
            land_category=None,
            water_source=None,
            soil_type=None,
            road_access=None,
            cultivation_status=None,
            ownership_type=None,
            farmhouse_available=None,
            fencing_done=None,
            computed_area_acres=None,
        )
        doc = _row_to_doc(row, self._INDEX)
        self.assertIsNotNone(doc)
        present = agri_keys & set(doc["_source"].keys())
        self.assertEqual(present, set(), msg=f"Agri keys leaked into non-agri doc: {present}")


if __name__ == "__main__":
    unittest.main()
