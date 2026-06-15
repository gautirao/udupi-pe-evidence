"""
Container + parity tests for agricultural field parity — issue #1461.

These tests require a running OpenSearch instance. They are SKIPPED automatically
when OPENSEARCH_TEST_URL is not set, so normal dev/test runs need no container.

To run locally (requires Docker):
    docker compose -f docker-compose.opensearch.yml up -d opensearch
    # wait for health:
    curl -sf http://localhost:9200
    OPENSEARCH_TEST_URL=http://localhost:9200 python -m pytest scripts/test_opensearch_agri_container.py -v

Optional live-Postgres parity (requires a local Postgres with the schema):
    OPENSEARCH_TEST_URL=http://localhost:9200 \
    PARITY_DATABASE_URL=postgresql://user:pass@localhost:5432/mydb \
    python -m pytest scripts/test_opensearch_agri_container.py -v
"""

from __future__ import annotations

import os
import sys
import time
from decimal import Decimal
from uuid import uuid4

import pytest

# ---------------------------------------------------------------------------
# Module-level skip — no OPENSEARCH_TEST_URL → skip entire module (no container needed)
# ---------------------------------------------------------------------------
OPENSEARCH_TEST_URL = os.environ.get("OPENSEARCH_TEST_URL", "")
if not OPENSEARCH_TEST_URL:
    pytest.skip(
        "OPENSEARCH_TEST_URL not set — skipping container tests. "
        "Set OPENSEARCH_TEST_URL=http://localhost:9200 to run.",
        allow_module_level=True,
    )

# ---------------------------------------------------------------------------
# Imports (only reached when OPENSEARCH_TEST_URL is set)
# ---------------------------------------------------------------------------
from opensearchpy import OpenSearch, NotFoundError

# Allow running from repo root or scripts/ directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from scripts.opensearch_rebuild import INDEX_MAPPING, _row_to_doc

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def os_client() -> OpenSearch:
    """Return an OpenSearch client connected to the test instance."""
    client = OpenSearch(hosts=[OPENSEARCH_TEST_URL])
    # Verify connectivity — fail early with a clear message
    info = client.info()
    assert "version" in info, f"OpenSearch info() did not return version: {info}"
    return client


@pytest.fixture(scope="module")
def test_index(os_client: OpenSearch) -> str:
    """
    Create a unique test index with INDEX_MAPPING for the module run.
    Deletes it on teardown (try/finally).
    """
    index_name = f"listings_agri_test_{uuid4().hex[:8]}"
    os_client.indices.create(index=index_name, body=INDEX_MAPPING)
    try:
        yield index_name
    finally:
        try:
            os_client.indices.delete(index=index_name)
        except NotFoundError:
            pass


# ---------------------------------------------------------------------------
# Sample rows
# ---------------------------------------------------------------------------

def _agri_row(seed_id: str = "agri-001", **overrides) -> dict:
    """Return a representative agri row dict as SELECT_SQL would produce."""
    row = {
        "id": seed_id,
        "title": "[AGRI] 12-Acre Paddy Field, Padubidri",
        "locality": "Padubidri",
        "description": "Fertile paddy land near coastal highway",
        "area_key": "area_agri_padubidri",
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
        # Agri-specific fields
        "land_category": "FARMLAND",
        "water_source": "BOREWELL",
        "soil_type": "LATERITE",
        "road_access": "TARRED_ROAD",
        "cultivation_status": "CULTIVATED",
        "ownership_type": "FREEHOLD",
        "farmhouse_available": False,
        "fencing_done": True,
        # Hand-computed: equivalent to ROUND(ST_Area(boundary)::numeric / 4046.8564224, 2)
        # for a boundary enclosing ~12.5 acres.
        "computed_area_acres": Decimal("12.50"),
    }
    row.update(overrides)
    return row


def _non_agri_row(seed_id: str = "house-001") -> dict:
    """Return a non-agri (HOUSE) row with all agri columns absent/None."""
    return {
        "id": seed_id,
        "title": "3BHK House in Udupi",
        "locality": "Udupi",
        "description": "Nice residential house",
        "area_key": "area_udupi_north",
        "property_type": "HOUSE",
        "seller_type": "OWNER",
        "bedrooms": 3,
        "bathrooms": 2,
        "price_paise": 8000000,
        "latitude": 13.3409,
        "longitude": 74.7421,
        "status": "LIVE",
        "created_at": None,
        "updated_at": None,
        "first_published_at": None,
        "last_updated_at": None,
        "back_to_market_at": None,
        "city_slug": "udupi",
        "hero_image_url": "https://example.com/house.jpg",
        "listing_number": 2001,
        "land_area": None,
        "land_area_unit": None,
        "built_area": Decimal("1200"),
        "built_area_unit": "SQFT",
        "rera_number": None,
        "trust_tier": None,
        "possession_status": None,
        "listing_purpose": "SALE",
        # All agri columns None (as non-agri rows return from LEFT JOIN / NULL columns)
        "land_category": None,
        "water_source": None,
        "soil_type": None,
        "road_access": None,
        "cultivation_status": None,
        "ownership_type": None,
        "farmhouse_available": None,
        "fencing_done": None,
        "computed_area_acres": None,
    }


def _refresh(os_client: OpenSearch, index_name: str) -> None:
    os_client.indices.refresh(index=index_name)


def _get_doc(os_client: OpenSearch, index_name: str, doc_id: str) -> dict:
    result = os_client.get(index=index_name, id=doc_id)
    return result["_source"]


# ---------------------------------------------------------------------------
# LOCAL_CONTAINER_OPENSEARCH tests
# ---------------------------------------------------------------------------

class TestIndexCreationAndMapping:
    """Test 1: index creation with new mapping succeeds; mapping types are correct."""

    def test_index_exists(self, os_client: OpenSearch, test_index: str):
        assert os_client.indices.exists(index=test_index)

    def test_mapping_land_category_keyword(self, os_client: OpenSearch, test_index: str):
        mapping = os_client.indices.get_mapping(index=test_index)
        props = mapping[test_index]["mappings"]["properties"]
        assert props["land_category"]["type"] == "keyword", (
            f"Expected keyword, got {props['land_category']}"
        )

    def test_mapping_farmhouse_available_boolean(self, os_client: OpenSearch, test_index: str):
        mapping = os_client.indices.get_mapping(index=test_index)
        props = mapping[test_index]["mappings"]["properties"]
        assert props["farmhouse_available"]["type"] == "boolean"

    def test_mapping_computed_area_acres_double(self, os_client: OpenSearch, test_index: str):
        mapping = os_client.indices.get_mapping(index=test_index)
        props = mapping[test_index]["mappings"]["properties"]
        assert props["computed_area_acres"]["type"] == "double"

    def test_mapping_water_source_keyword(self, os_client: OpenSearch, test_index: str):
        mapping = os_client.indices.get_mapping(index=test_index)
        props = mapping[test_index]["mappings"]["properties"]
        assert props["water_source"]["type"] == "keyword"

    def test_mapping_fencing_done_boolean(self, os_client: OpenSearch, test_index: str):
        mapping = os_client.indices.get_mapping(index=test_index)
        props = mapping[test_index]["mappings"]["properties"]
        assert props["fencing_done"]["type"] == "boolean"


class TestIndexAndRetrieve:
    """Test 2: index a sample agri doc, refresh, retrieve."""

    def test_index_agri_doc(self, os_client: OpenSearch, test_index: str):
        row = _agri_row(seed_id="retrieve-test-001")
        doc = _row_to_doc(row, test_index)
        assert doc is not None
        resp = os_client.index(index=test_index, id=doc["_id"], body=doc["_source"])
        assert resp["result"] in ("created", "updated")
        _refresh(os_client, test_index)
        src = _get_doc(os_client, test_index, doc["_id"])
        assert src["land_category"] == "FARMLAND"
        assert src["water_source"] == "BOREWELL"
        assert src["fencing_done"] is True
        assert src["farmhouse_available"] is False
        assert abs(src["computed_area_acres"] - 12.50) < 0.01


class TestExactFilter:
    """Test 3: term query on land_category returns the agri doc."""

    def test_term_land_category(self, os_client: OpenSearch, test_index: str):
        row = _agri_row(seed_id="filter-test-001", land_category="FARMLAND")
        doc = _row_to_doc(row, test_index)
        assert doc is not None
        os_client.index(index=test_index, id=doc["_id"], body=doc["_source"])
        _refresh(os_client, test_index)

        resp = os_client.search(
            index=test_index,
            body={
                "query": {"term": {"land_category": "FARMLAND"}},
            },
        )
        hit_ids = [h["_id"] for h in resp["hits"]["hits"]]
        assert doc["_id"] in hit_ids, (
            f"Expected doc {doc['_id']} in hits for land_category=FARMLAND; got {hit_ids}"
        )


class TestNumericAndSort:
    """Test 4: range query on computed_area_acres + sort by price_paise."""

    def test_range_computed_area_acres(self, os_client: OpenSearch, test_index: str):
        row = _agri_row(seed_id="numeric-test-001", computed_area_acres=Decimal("8.00"), price_paise=9000000)
        doc = _row_to_doc(row, test_index)
        assert doc is not None
        os_client.index(index=test_index, id=doc["_id"], body=doc["_source"])
        _refresh(os_client, test_index)

        resp = os_client.search(
            index=test_index,
            body={
                "query": {
                    "range": {
                        "computed_area_acres": {"gte": 7.0, "lte": 9.0}
                    }
                },
                "sort": [{"price_paise": {"order": "asc"}}],
            },
        )
        hit_ids = [h["_id"] for h in resp["hits"]["hits"]]
        assert doc["_id"] in hit_ids, (
            f"Expected doc {doc['_id']} in range 7–9 acres; got {hit_ids}"
        )

    def test_sort_price_paise_desc(self, os_client: OpenSearch, test_index: str):
        # Just verify the sort request itself succeeds (no error)
        resp = os_client.search(
            index=test_index,
            body={
                "query": {"match_all": {}},
                "sort": [{"price_paise": {"order": "desc"}}],
                "size": 5,
            },
        )
        assert "hits" in resp


class TestGeoQuery:
    """Test 5: geo_bounding_box query on 'location' field returns doc."""

    def test_geo_bounding_box(self, os_client: OpenSearch, test_index: str):
        # lat=13.1782, lon=74.7582 (Padubidri)
        row = _agri_row(seed_id="geo-test-001", latitude=13.1782, longitude=74.7582)
        doc = _row_to_doc(row, test_index)
        assert doc is not None
        os_client.index(index=test_index, id=doc["_id"], body=doc["_source"])
        _refresh(os_client, test_index)

        resp = os_client.search(
            index=test_index,
            body={
                "query": {
                    "geo_bounding_box": {
                        "location": {
                            "top_left": {"lat": 13.20, "lon": 74.70},
                            "bottom_right": {"lat": 13.10, "lon": 74.80},
                        }
                    }
                }
            },
        )
        hit_ids = [h["_id"] for h in resp["hits"]["hits"]]
        assert doc["_id"] in hit_ids, (
            f"Expected geo hit for {doc['_id']} inside bounding box; got {hit_ids}"
        )


class TestNullSafeIndexing:
    """Test 6: agri doc with None water_source and computed_area_acres indexes without error."""

    def test_null_agri_fields_index_without_error(self, os_client: OpenSearch, test_index: str):
        row = _agri_row(
            seed_id="null-safe-001",
            water_source=None,
            computed_area_acres=None,
        )
        doc = _row_to_doc(row, test_index)
        assert doc is not None

        resp = os_client.index(index=test_index, id=doc["_id"], body=doc["_source"])
        assert resp["result"] in ("created", "updated")
        _refresh(os_client, test_index)

        src = _get_doc(os_client, test_index, doc["_id"])
        assert "water_source" not in src, "water_source=None must be absent from indexed doc"
        assert "computed_area_acres" not in src, "computed_area_acres=None must be absent from indexed doc"


class TestNonAgriCompat:
    """Test 7: non-agri doc indexes without agri keys; mapping remains valid."""

    def test_non_agri_doc_no_agri_keys(self, os_client: OpenSearch, test_index: str):
        agri_keys = {
            "land_category", "water_source", "soil_type", "road_access",
            "cultivation_status", "ownership_type", "farmhouse_available",
            "fencing_done", "computed_area_acres",
        }
        row = _non_agri_row(seed_id="house-compat-001")
        doc = _row_to_doc(row, test_index)
        assert doc is not None

        resp = os_client.index(index=test_index, id=doc["_id"], body=doc["_source"])
        assert resp["result"] in ("created", "updated")
        _refresh(os_client, test_index)

        src = _get_doc(os_client, test_index, doc["_id"])
        leaked = agri_keys & set(src.keys())
        assert leaked == set(), f"Agri keys leaked into non-agri doc: {leaked}"


class TestNoPII:
    """Test 8: indexed docs must not contain any PII fields."""

    _PII_KEYS = frozenset({
        "survey_number", "user_id", "seller_id", "supabase_user_id",
        "phone", "email",
    })

    def test_no_pii_in_indexed_agri_doc(self, os_client: OpenSearch, test_index: str):
        row = _agri_row(seed_id="no-pii-001")
        doc = _row_to_doc(row, test_index)
        assert doc is not None

        os_client.index(index=test_index, id=doc["_id"], body=doc["_source"])
        _refresh(os_client, test_index)

        src = _get_doc(os_client, test_index, doc["_id"])
        found_pii = self._PII_KEYS & set(src.keys())
        assert found_pii == set(), f"PII keys found in indexed doc: {found_pii}"

    def test_no_pii_in_indexed_non_agri_doc(self, os_client: OpenSearch, test_index: str):
        row = _non_agri_row(seed_id="house-no-pii-001")
        doc = _row_to_doc(row, test_index)
        assert doc is not None

        os_client.index(index=test_index, id=doc["_id"], body=doc["_source"])
        _refresh(os_client, test_index)

        src = _get_doc(os_client, test_index, doc["_id"])
        found_pii = self._PII_KEYS & set(src.keys())
        assert found_pii == set(), f"PII keys found in indexed non-agri doc: {found_pii}"


# ---------------------------------------------------------------------------
# PARITY tests
# ---------------------------------------------------------------------------

class TestParityFallback:
    """
    FALLBACK parity test — always runs (no live Postgres required).

    Constructs a deterministic Postgres-DERIVED row (exactly the values SELECT_SQL
    would return for a representative agri listing, including hand-computed
    computed_area_acres), passes it through _row_to_doc, indexes into the container,
    fetches, and asserts the indexed doc field values match the Postgres-derived expectations.

    This proves the row→doc→index mapping preserves Postgres-derived values even
    when no live PG is wired up.
    """

    # Representative Postgres-derived expected values (mirrors SELECT_SQL output)
    _EXPECTED = {
        "property_type": "AGRICULTURAL",
        "price_paise": 15000000,
        "land_area": 15.0,
        "land_area_unit": "ACRES",
        # computed_area_acres: ROUND(ST_Area(boundary)::numeric / 4046.8564224, 2)
        # For a boundary enclosing ~15.0 acres: 15.0 * 4046.8564224 = 60702.85 sqm
        # ST_Area returns 60702.85 → / 4046.8564224 → ROUND(..., 2) = 15.00
        "computed_area_acres": 15.0,
        "water_source": "WELL",
        "land_category": "PLANTATION",
        "farmhouse_available": True,
        "fencing_done": False,
        "latitude": 13.3500,
        "longitude": 74.7600,
    }

    def test_fallback_row_transform_parity(self, os_client: OpenSearch, test_index: str):
        """Row → _row_to_doc → index → fetch: all expected field values preserved exactly."""
        row = _agri_row(
            seed_id="parity-fallback-001",
            price_paise=self._EXPECTED["price_paise"],
            land_area=Decimal(str(self._EXPECTED["land_area"])),
            land_area_unit=self._EXPECTED["land_area_unit"],
            computed_area_acres=Decimal(str(self._EXPECTED["computed_area_acres"])),
            water_source=self._EXPECTED["water_source"],
            land_category=self._EXPECTED["land_category"],
            farmhouse_available=self._EXPECTED["farmhouse_available"],
            fencing_done=self._EXPECTED["fencing_done"],
            latitude=self._EXPECTED["latitude"],
            longitude=self._EXPECTED["longitude"],
        )
        doc = _row_to_doc(row, test_index)
        assert doc is not None

        os_client.index(index=test_index, id=doc["_id"], body=doc["_source"])
        _refresh(os_client, test_index)

        src = _get_doc(os_client, test_index, doc["_id"])

        assert src["property_type"] == self._EXPECTED["property_type"]
        assert src["price_paise"] == self._EXPECTED["price_paise"]
        assert abs(src.get("land_area", 0) - self._EXPECTED["land_area"]) < 0.01
        assert src["land_area_unit"] == self._EXPECTED["land_area_unit"]
        assert abs(src["computed_area_acres"] - self._EXPECTED["computed_area_acres"]) < 0.01
        assert src["water_source"] == self._EXPECTED["water_source"]
        assert src["land_category"] == self._EXPECTED["land_category"]
        assert src["farmhouse_available"] is self._EXPECTED["farmhouse_available"]
        assert src["fencing_done"] is self._EXPECTED["fencing_done"]
        # location geo_point: stored as lat/lon dict or [lon, lat] — handle both
        loc = src.get("location", {})
        if isinstance(loc, dict):
            assert abs(loc["lat"] - self._EXPECTED["latitude"]) < 0.001
            assert abs(loc["lon"] - self._EXPECTED["longitude"]) < 0.001
        else:
            # Some OS versions return [lon, lat] array
            assert abs(loc[1] - self._EXPECTED["latitude"]) < 0.001
            assert abs(loc[0] - self._EXPECTED["longitude"]) < 0.001


@pytest.mark.skipif(
    not os.environ.get("PARITY_DATABASE_URL"),
    reason="PARITY_DATABASE_URL not set — skipping live Postgres parity test (must be a local DB)",
)
class TestParityLivePostgres:
    """
    PRIMARY parity test — runs only when PARITY_DATABASE_URL is set.

    PARITY_DATABASE_URL must point to a local/dev Postgres instance. A localhost
    safety check is enforced before connecting (mirrors the rebuild script's own
    --allow-non-localhost invariant — this test must never connect to prod).

    Connects to a real Postgres instance, runs SELECT_SQL (LIMIT 5 agri rows),
    builds docs via _row_to_doc, indexes into the container, then asserts each
    indexed doc's agri field values match the Postgres-derived row values exactly.
    """

    def test_postgres_to_opensearch_parity(self, os_client: OpenSearch, test_index: str):
        import psycopg2
        import psycopg2.extras
        from scripts.opensearch_rebuild import SELECT_SQL, _is_safe_url

        db_url = os.environ.get("PARITY_DATABASE_URL")
        if not _is_safe_url(db_url):
            pytest.skip(
                f"PARITY_DATABASE_URL does not appear to be a local/dev instance "
                f"(localhost/127.0.0.1/::1 required). "
                f"Refusing to connect to a potentially non-local database."
            )
        conn = psycopg2.connect(db_url)
        conn.set_session(readonly=True, autocommit=True)

        # LIMIT to a handful of agri rows to keep the test fast
        agri_sql = (
            SELECT_SQL.rstrip().rstrip(";")
            + " AND pl.property_type = 'AGRICULTURAL' LIMIT 5"
        )

        rows = []
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(agri_sql)
            rows = cur.fetchall()
        conn.close()

        if not rows:
            pytest.skip("No AGRICULTURAL rows returned from Postgres — skipping parity check")

        for row in rows:
            row_dict = dict(row)
            doc = _row_to_doc(row_dict, test_index)
            if doc is None:
                continue  # null-coord row — skip (correct behaviour)

            os_client.index(index=test_index, id=doc["_id"], body=doc["_source"])

        _refresh(os_client, test_index)

        for row in rows:
            row_dict = dict(row)
            doc = _row_to_doc(row_dict, test_index)
            if doc is None:
                continue

            src = _get_doc(os_client, test_index, doc["_id"])

            # Core fields
            assert src["property_type"] == row_dict["property_type"]
            assert src["price_paise"] == row_dict["price_paise"]

            # Agri fields — compare only when non-None in the source row
            for field in ("land_category", "water_source", "soil_type",
                          "road_access", "cultivation_status", "ownership_type"):
                pg_val = row_dict.get(field)
                if pg_val is not None:
                    assert src.get(field) == pg_val, (
                        f"Field {field}: expected {pg_val!r}, got {src.get(field)!r}"
                    )
                else:
                    assert field not in src, (
                        f"Field {field} should be absent for None PG value; found {src.get(field)!r}"
                    )

            for bool_field in ("farmhouse_available", "fencing_done"):
                pg_val = row_dict.get(bool_field)
                if pg_val is not None:
                    assert src.get(bool_field) == pg_val, (
                        f"Boolean {bool_field}: expected {pg_val}, got {src.get(bool_field)}"
                    )
                else:
                    assert bool_field not in src

            pg_acres = row_dict.get("computed_area_acres")
            if pg_acres is not None:
                assert abs(src["computed_area_acres"] - float(pg_acres)) < 0.01
            else:
                assert "computed_area_acres" not in src

            # geo location
            loc = src.get("location", {})
            pg_lat = float(row_dict["latitude"])
            pg_lon = float(row_dict["longitude"])
            if isinstance(loc, dict):
                assert abs(loc["lat"] - pg_lat) < 0.001
                assert abs(loc["lon"] - pg_lon) < 0.001
            else:
                assert abs(loc[1] - pg_lat) < 0.001
                assert abs(loc[0] - pg_lon) < 0.001
