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


# ---------------------------------------------------------------------------
# Test 9: _load_area_keys — all 5 preferred keys present
# ---------------------------------------------------------------------------

def test_load_area_keys_all_present():
    """When all 5 preferred keys are in the areas table, each cluster maps to its OWN key."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    # fetchall returns all 5 preferred keys
    all_keys = list(gen.CLUSTER_FALLBACK_AREA_KEYS.values())
    mock_cursor.fetchall.return_value = [(k,) for k in all_keys]

    result = gen._load_area_keys(mock_conn)

    # Every cluster must map to its OWN preferred key (no cross-cluster substitution)
    for cluster_name, expected_key in gen.CLUSTER_FALLBACK_AREA_KEYS.items():
        assert result[cluster_name] == expected_key, (
            f"Cluster {cluster_name!r}: expected {expected_key!r}, got {result[cluster_name]!r}"
        )

    # Confirm the SQL used = ANY(%s) and NOT LIMIT 20
    executed_sql = mock_cursor.execute.call_args[0][0]
    assert "= ANY(%s)" in executed_sql, (
        f"Expected parameterised '= ANY(%s)' in SQL, got: {executed_sql!r}"
    )
    assert "LIMIT 20" not in executed_sql, (
        f"Old 'LIMIT 20' pattern must not appear in SQL, got: {executed_sql!r}"
    )


# ---------------------------------------------------------------------------
# Test 10: _load_area_keys — Udupi-cluster keys missing (regression test)
# ---------------------------------------------------------------------------

def test_load_area_keys_udupi_keys_missing():
    """When Udupi/Manipal/Kundapura keys are absent, those clusters map to None.

    This is the regression test for DEFECT 1: the old code used next(iter(available_keys))
    cross-cluster fallback, causing udupi/manipal/kundapura to get a Mangalore or
    Bengaluru key instead of None.
    """
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    # Only Mangalore and Bengaluru keys present; all 3 Udupi-cluster keys missing
    partial_keys = [
        gen.CLUSTER_FALLBACK_AREA_KEYS["mangaluru"],
        gen.CLUSTER_FALLBACK_AREA_KEYS["bengaluru"],
    ]
    mock_cursor.fetchall.return_value = [(k,) for k in partial_keys]

    result = gen._load_area_keys(mock_conn)

    # Udupi-cluster must map to None — NOT to any Mangalore/Bengaluru key
    for cluster_name in ("udupi", "manipal", "kundapura"):
        assert result[cluster_name] is None, (
            f"Cluster {cluster_name!r} must be None when its preferred key is absent, "
            f"got {result[cluster_name]!r}"
        )
        # Explicitly confirm it did NOT get a cross-cluster key (old bug)
        assert result[cluster_name] not in partial_keys, (
            f"Cluster {cluster_name!r} must not fall back to a cross-cluster key"
        )

    # Mangalore and Bengaluru must still map correctly
    assert result["mangaluru"] == gen.CLUSTER_FALLBACK_AREA_KEYS["mangaluru"]
    assert result["bengaluru"] == gen.CLUSTER_FALLBACK_AREA_KEYS["bengaluru"]


# ---------------------------------------------------------------------------
# Test 11: _load_area_keys — empty result → all clusters None
# ---------------------------------------------------------------------------

def test_load_area_keys_empty_result():
    """When fetchall returns [], all clusters map to None."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    mock_cursor.fetchall.return_value = []

    result = gen._load_area_keys(mock_conn)

    assert set(result.keys()) == set(gen.CLUSTER_FALLBACK_AREA_KEYS.keys()), (
        "Result must have all cluster keys"
    )
    for cluster_name, value in result.items():
        assert value is None, (
            f"Cluster {cluster_name!r}: expected None for empty result, got {value!r}"
        )


# ---------------------------------------------------------------------------
# Test 12: SQL uses = ANY(%s) parameterised form, not LIMIT 20
# ---------------------------------------------------------------------------

def test_load_area_keys_sql_is_parameterised():
    """The SQL query must use = ANY(%s) and NOT LIMIT 20.

    This guards against regression to the old 'LIMIT 20' pattern which allowed
    heap-order to omit the Udupi-cluster keys.
    """
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    mock_cursor.fetchall.return_value = []  # empty is fine — we only care about SQL shape

    gen._load_area_keys(mock_conn)

    # The first positional arg to execute() is the SQL string
    executed_sql = mock_cursor.execute.call_args[0][0]
    assert "= ANY(%s)" in executed_sql, (
        f"SQL must use '= ANY(%s)' parameterised form, got: {executed_sql!r}"
    )
    assert "LIMIT 20" not in executed_sql, (
        f"SQL must NOT contain 'LIMIT 20', got: {executed_sql!r}"
    )
