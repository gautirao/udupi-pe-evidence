"""
test_gen_perf_listings.py — Unit tests for gen_perf_listings.py.

No live DB required — psycopg2 is mocked throughout.

Run:
    python -m pytest scripts/test_gen_perf_listings.py -v
"""

import importlib.util
import sys
import types
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Import the module under test
# ---------------------------------------------------------------------------

# Stub psycopg2 before importing so the module can be imported without the
# actual driver installed (test-only environment).
_psycopg2_stub = types.ModuleType("psycopg2")
_psycopg2_stub.connect = MagicMock()
_psycopg2_extras_stub = types.ModuleType("psycopg2.extras")
_psycopg2_extras_stub.execute_values = MagicMock()
sys.modules.setdefault("psycopg2", _psycopg2_stub)
sys.modules.setdefault("psycopg2.extras", _psycopg2_extras_stub)

# Load gen_perf_listings from the same directory as this test file, regardless
# of where pytest is invoked from (repo root or scripts/ directory).
_HERE = Path(__file__).parent
_MODULE_PATH = _HERE / "gen_perf_listings.py"
_spec = importlib.util.spec_from_file_location("gen_perf_listings", _MODULE_PATH)
gen = importlib.util.module_from_spec(_spec)  # type: ignore[arg-type]
_spec.loader.exec_module(gen)  # type: ignore[union-attr]


# Fixed "now" for deterministic timestamp generation in tests
_NOW = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Test 1: Row count and [PERF] prefix
# ---------------------------------------------------------------------------

def test_generate_rows_count_and_prefix():
    """generate_rows(100, seed=42) must return exactly 100 rows, all titled '[PERF]...'"""
    rows = gen.generate_rows(100, seed=42, now=_NOW)
    assert len(rows) == 100, f"Expected 100 rows, got {len(rows)}"
    for i, row in enumerate(rows):
        assert row["title"].startswith("[PERF]"), (
            f"Row {i} title does not start with '[PERF]': {row['title']!r}"
        )


# ---------------------------------------------------------------------------
# Test 2: Coordinate bounds
# ---------------------------------------------------------------------------

def test_coordinate_bounds():
    """All generated coordinates must be within plausible India bounds."""
    rows = gen.generate_rows(1000, seed=42, now=_NOW)
    for i, row in enumerate(rows):
        lat = row["latitude"]
        lon = row["longitude"]
        assert 11.0 <= lat <= 18.0, (
            f"Row {i}: latitude {lat} outside [11, 18]"
        )
        assert 73.0 <= lon <= 79.0, (
            f"Row {i}: longitude {lon} outside [73, 79]"
        )


# ---------------------------------------------------------------------------
# Test 3: Determinism
# ---------------------------------------------------------------------------

def test_determinism():
    """generate_rows with the same seed must produce identical results on two calls."""
    rows_a = gen.generate_rows(100, seed=42, now=_NOW)
    rows_b = gen.generate_rows(100, seed=42, now=_NOW)
    assert len(rows_a) == len(rows_b)
    for i, (a, b) in enumerate(zip(rows_a, rows_b)):
        # Compare all fields that must be deterministic
        assert a["title"] == b["title"], f"Row {i}: title mismatch"
        assert a["property_type"] == b["property_type"], f"Row {i}: property_type mismatch"
        assert a["price_paise"] == b["price_paise"], f"Row {i}: price_paise mismatch"
        assert abs(a["latitude"] - b["latitude"]) < 1e-12, f"Row {i}: latitude mismatch"
        assert abs(a["longitude"] - b["longitude"]) < 1e-12, f"Row {i}: longitude mismatch"
        assert a["locality"] == b["locality"], f"Row {i}: locality mismatch"
        assert a["description"] == b["description"], f"Row {i}: description mismatch"


# ---------------------------------------------------------------------------
# Test 4: Property type distribution
# ---------------------------------------------------------------------------

def test_property_type_distribution():
    """generate_rows(1000, seed=42) must include all 4 property types."""
    rows = gen.generate_rows(1000, seed=42, now=_NOW)
    types_seen = {row["property_type"] for row in rows}
    expected = {"house", "apartment", "land", "commercial"}
    assert expected.issubset(types_seen), (
        f"Missing property types: {expected - types_seen}"
    )


# ---------------------------------------------------------------------------
# Test 5: --dry-run exits 0 without any DB write
# ---------------------------------------------------------------------------

def test_dry_run_no_db_call():
    """--dry-run must exit 0 and must not call psycopg2.connect."""
    mock_connect = MagicMock()
    with patch.object(gen, "_connect", mock_connect):
        result = gen.main(["--dry-run", "--count=50", "--seed=1"])

    assert result == 0, f"Expected exit code 0, got {result}"
    mock_connect.assert_not_called()


# ---------------------------------------------------------------------------
# Test 6: --cleanup without --confirm-delete-generated must exit non-zero
# ---------------------------------------------------------------------------

def test_cleanup_guard_no_flag():
    """--cleanup without --confirm-delete-generated must raise SystemExit with non-zero code."""
    with pytest.raises(SystemExit) as exc_info:
        gen.main([
            "--cleanup",
            "--db-url=postgresql://localhost/test",
        ])
    assert exc_info.value.code != 0, (
        f"Expected non-zero exit code, got {exc_info.value.code}"
    )


# ---------------------------------------------------------------------------
# Test 7: search_vector must never appear in any row dict
# ---------------------------------------------------------------------------

def test_no_search_vector_in_rows():
    """No row produced by generate_rows must contain a 'search_vector' key."""
    rows = gen.generate_rows(200, seed=42, now=_NOW)
    for i, row in enumerate(rows):
        assert "search_vector" not in row, (
            f"Row {i} unexpectedly contains 'search_vector' key"
        )


# ---------------------------------------------------------------------------
# Test 8: commit-per-batch invariant
# ---------------------------------------------------------------------------

def test_insert_batches_commits_per_batch():
    """_insert_batches must commit after each batch, including the final partial batch."""
    import math

    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    count = 25000  # 3 batches: 10K + 10K + 5K
    expected_commits = math.ceil(count / gen.BATCH_SIZE)  # 3

    with patch("psycopg2.extras.execute_values"):
        gen._insert_batches(
            conn=mock_conn,
            count=count,
            seed=42,
            cluster_area_keys=gen.CLUSTER_FALLBACK_AREA_KEYS,
            created_by="00000000-0000-0000-0000-000000000001",
        )

    assert mock_conn.commit.call_count == expected_commits, (
        f"Expected {expected_commits} commits for {count} rows, got {mock_conn.commit.call_count}"
    )
