"""Tests for extract_osm_candidates.py over the tiny_city.osm fixture
(#1900 AC1). Guarded with importorskip so the rest of the suite still runs
in an environment without osmium/shapely installed."""
import json
import os

import pytest

osmium = pytest.importorskip("osmium", reason="osmium not installed — extractor test skipped")
pytest.importorskip("shapely", reason="shapely not installed — extractor test skipped")

from extract_osm_candidates import extract  # noqa: E402  (after importorskip)

FIXTURES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fixtures")
TINY_CITY_OSM = os.path.join(FIXTURES_DIR, "tiny_city.osm")

# Matches the fixture's file-level comment: 74.70,13.30,74.80,13.40 keeps
# 6 of the 7 place=* nodes (excludes node 1007 at lat=14.00/lon=75.50) and
# the 1 simple closed way (centroid ~74.7575,13.3425).
TEST_BBOX = (74.70, 13.30, 74.80, 13.40)


def _read_jsonl(path):
    records = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


class TestExtract:
    def test_node_count_and_bbox_filter(self, tmp_path):
        out_path = tmp_path / "out.jsonl"
        counts = extract(TINY_CITY_OSM, "testcity", TEST_BBOX, str(out_path))
        assert counts["node"] == 6
        records = _read_jsonl(str(out_path))
        node_records = [r for r in records if r["osm_type"] == "node"]
        assert len(node_records) == 6
        names = {r["names"].get("name") for r in node_records}
        assert "OutsideBboxCity" not in names
        assert "TestCity" in names

    def test_way_count(self, tmp_path):
        out_path = tmp_path / "out.jsonl"
        counts = extract(TINY_CITY_OSM, "testcity", TEST_BBOX, str(out_path))
        assert counts["way"] == 1
        records = _read_jsonl(str(out_path))
        way_records = [r for r in records if r["osm_type"] == "way"]
        assert len(way_records) == 1
        assert way_records[0]["names"].get("name") == "TestNeighbourhood"

    def test_way_has_real_bbox_not_degenerate(self, tmp_path):
        out_path = tmp_path / "out.jsonl"
        extract(TINY_CITY_OSM, "testcity", TEST_BBOX, str(out_path))
        records = _read_jsonl(str(out_path))
        way = next(r for r in records if r["osm_type"] == "way")
        min_lon, min_lat, max_lon, max_lat = way["bbox"]
        assert min_lon < max_lon
        assert min_lat < max_lat

    def test_self_intersecting_and_degenerate_ways_are_skipped_and_counted(self, tmp_path):
        # ADDITIONAL (rework, geometry validity): a self-intersecting
        # "bowtie" ring and a zero-area (collinear) ring must both be
        # skipped (never emitted as polygon geometry) and separately
        # counted — not silently merged into way_skipped_bad_geometry.
        out_path = tmp_path / "out.jsonl"
        counts = extract(TINY_CITY_OSM, "testcity", TEST_BBOX, str(out_path))
        assert counts["way"] == 1
        assert counts["way_skipped_invalid_geometry"] == 2
        records = _read_jsonl(str(out_path))
        way_names = {r["names"].get("name") for r in records if r["osm_type"] == "way"}
        assert "BowtieInvalidWay" not in way_names
        assert "DegenerateZeroAreaWay" not in way_names
        assert "TestNeighbourhood" in way_names

    def test_node_bbox_is_never_synthesised_from_point(self, tmp_path):
        # D4/R5: node (point) candidates must carry bbox=[null,null,null,null]
        # — never a degenerate point-as-bbox — so GeometryTrust classifies
        # them PROVISIONAL, not a fabricated VERIFIED.
        out_path = tmp_path / "out.jsonl"
        extract(TINY_CITY_OSM, "testcity", TEST_BBOX, str(out_path))
        records = _read_jsonl(str(out_path))
        node_records = [r for r in records if r["osm_type"] == "node"]
        for record in node_records:
            assert record["bbox"] == [None, None, None, None]
            assert record["centroid"][0] is not None
            assert record["centroid"][1] is not None
