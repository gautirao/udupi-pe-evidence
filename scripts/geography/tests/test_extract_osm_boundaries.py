"""Tests for extract_osm_boundaries.py (#2422, D6 relation/multipolygon
boundary assembly) over the fixtures/boundaries_multipolygon.osm fixture.

Guarded with importorskip so the rest of the suite still runs in an
environment without osmium/shapely installed."""
import json
import os

import pytest

pytest.importorskip("osmium", reason="osmium not installed — boundary extractor test skipped")
pytest.importorskip("shapely", reason="shapely not installed — boundary extractor test skipped")

from extract_osm_boundaries import Target, TargetManifestError, _load_targets, extract  # noqa: E402

FIXTURES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
BOUNDARIES_OSM = os.path.join(FIXTURES_DIR, "boundaries_multipolygon.osm")

SOURCE_NAME = "boundaries_multipolygon.osm"
SOURCE_CHECKSUM = "deadbeef" * 8  # fixture stand-in for a real sha256 hex digest
EXTRACT_DATE = "2026-08-01"

# Matches fixtures/boundaries_multipolygon.osm's relation/way ids.
WAY_SIMPLE_CITY = 4005          # closed way, boundary tag directly on the way
RELATION_HOLE = 9001            # outer 4001 + inner 4002
RELATION_MULTIPART = 9002       # two disjoint outer rings (4003, 4004)
RELATION_BOWTIE = 9003          # self-intersecting outer ring (4006)
RELATION_NOT_IN_SOURCE = 9999   # confirmed target, absent from the fixture entirely


def _write_targets(tmp_path, targets):
    path = tmp_path / "targets.json"
    path.write_text(json.dumps(targets), encoding="utf-8")
    return str(path)


def _read_jsonl(path):
    records = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def _full_manifest():
    return [
        {
            "osm_type": "way",
            "osm_id": WAY_SIMPLE_CITY,
            "city_id": 1,
            "entity_type": "CITY",
            "area_key": None,
            "mapping_confirmed": "yes",
        },
        {
            "osm_type": "relation",
            "osm_id": RELATION_HOLE,
            "city_id": 1,
            "entity_type": "AREA",
            "area_key": "IN|KA|Test|AreaWithHole",
            "mapping_confirmed": "yes",
        },
        {
            "osm_type": "relation",
            "osm_id": RELATION_MULTIPART,
            "city_id": 1,
            "entity_type": "AREA",
            "area_key": "IN|KA|Test|MultipartArea",
            "mapping_confirmed": "yes",
        },
        {
            "osm_type": "relation",
            "osm_id": RELATION_BOWTIE,
            "city_id": 1,
            "entity_type": "AREA",
            "area_key": "IN|KA|Test|BowtieRelation",
            "mapping_confirmed": "yes",
        },
        {
            "osm_type": "relation",
            "osm_id": RELATION_NOT_IN_SOURCE,
            "city_id": 1,
            "entity_type": "AREA",
            "area_key": "IN|KA|Test|NotInSource",
            "mapping_confirmed": "yes",
        },
        {
            # Not confirmed — must be excluded entirely, never emitted as any status.
            "osm_type": "relation",
            "osm_id": RELATION_HOLE,
            "city_id": 2,
            "entity_type": "AREA",
            "area_key": "IN|KA|Other|Unconfirmed",
            "mapping_confirmed": "pending",
        },
    ]


class TestLoadTargets:
    def test_only_confirmed_rows_are_returned(self, tmp_path):
        targets_path = _write_targets(tmp_path, _full_manifest())
        targets = _load_targets(targets_path)
        assert len(targets) == 5
        assert all(t.area_key != "IN|KA|Other|Unconfirmed" for t in targets)

    def test_area_without_area_key_raises(self, tmp_path):
        targets_path = _write_targets(
            tmp_path,
            [
                {
                    "osm_type": "relation",
                    "osm_id": 1,
                    "city_id": 1,
                    "entity_type": "AREA",
                    "area_key": None,
                    "mapping_confirmed": "yes",
                }
            ],
        )
        with pytest.raises(TargetManifestError):
            _load_targets(targets_path)

    def test_city_with_area_key_raises(self, tmp_path):
        targets_path = _write_targets(
            tmp_path,
            [
                {
                    "osm_type": "way",
                    "osm_id": 1,
                    "city_id": 1,
                    "entity_type": "CITY",
                    "area_key": "should-not-be-here",
                    "mapping_confirmed": "yes",
                }
            ],
        )
        with pytest.raises(TargetManifestError):
            _load_targets(targets_path)

    def test_bad_osm_type_raises(self, tmp_path):
        targets_path = _write_targets(
            tmp_path,
            [
                {
                    "osm_type": "node",
                    "osm_id": 1,
                    "city_id": 1,
                    "entity_type": "AREA",
                    "area_key": "x",
                    "mapping_confirmed": "yes",
                }
            ],
        )
        with pytest.raises(TargetManifestError):
            _load_targets(targets_path)

    def test_non_list_top_level_raises(self, tmp_path):
        path = tmp_path / "targets.json"
        path.write_text(json.dumps({"not": "a list"}), encoding="utf-8")
        with pytest.raises(TargetManifestError):
            _load_targets(str(path))


class TestExtract:
    def _run(self, tmp_path):
        targets_path = _write_targets(tmp_path, _full_manifest())
        out_path = tmp_path / "out.jsonl"
        counts = extract(
            BOUNDARIES_OSM,
            targets_path,
            SOURCE_NAME,
            SOURCE_CHECKSUM,
            EXTRACT_DATE,
            str(out_path),
        )
        return counts, _read_jsonl(str(out_path))

    def test_counts_and_one_record_per_confirmed_target(self, tmp_path):
        counts, records = self._run(tmp_path)
        assert counts["targets_confirmed"] == 5
        assert len(records) == 5
        # The unconfirmed sixth manifest row must never appear in the output.
        assert all(r["area_key"] != "IN|KA|Other|Unconfirmed" for r in records)

    def test_simple_closed_way_city_is_valid(self, tmp_path):
        _, records = self._run(tmp_path)
        rec = next(r for r in records if r["entity_type"] == "CITY")
        assert rec["status"] == "VALID"
        assert rec["geometry_wkt"] is not None
        assert rec["geometry_wkt"].upper().startswith("MULTIPOLYGON")
        assert rec["osm_element_type"] == "way"
        assert rec["osm_element_id"] == WAY_SIMPLE_CITY

    def test_relation_with_hole_is_valid_and_smaller_than_outer_ring_area(self, tmp_path):
        _, records = self._run(tmp_path)
        rec = next(r for r in records if r["area_key"] == "IN|KA|Test|AreaWithHole")
        assert rec["status"] == "VALID"
        assert rec["osm_element_type"] == "relation"
        assert rec["osm_element_id"] == RELATION_HOLE

        import shapely.wkt as shapely_wkt

        shp = shapely_wkt.loads(rec["geometry_wkt"])
        # Outer ring is a 0.04deg x 0.04deg square (area ~0.0016); the hole
        # removes a 0.02deg x 0.02deg square (~0.0004) from the middle, so
        # the assembled polygon's area must be strictly less than the
        # un-holed outer ring's area — proving the inner ring was honoured
        # as a hole, not dropped or unioned away.
        outer_ring_area = 0.04 * 0.04
        assert shp.area < outer_ring_area
        assert shp.area > 0

    def test_multipart_relation_yields_two_polygons(self, tmp_path):
        _, records = self._run(tmp_path)
        rec = next(r for r in records if r["area_key"] == "IN|KA|Test|MultipartArea")
        assert rec["status"] == "VALID"

        import shapely.wkt as shapely_wkt

        shp = shapely_wkt.loads(rec["geometry_wkt"])
        assert shp.geom_type == "MultiPolygon"
        assert len(shp.geoms) == 2

    def test_self_intersecting_relation_is_quarantined_not_repaired(self, tmp_path):
        _, records = self._run(tmp_path)
        rec = next(r for r in records if r["area_key"] == "IN|KA|Test|BowtieRelation")
        assert rec["status"] == "QUARANTINED"
        assert rec["geometry_wkt"] is None
        assert rec["unavailable_reason"]

    def test_confirmed_target_absent_from_source_is_explicit_not_dropped(self, tmp_path):
        _, records = self._run(tmp_path)
        rec = next(r for r in records if r["area_key"] == "IN|KA|Test|NotInSource")
        assert rec["status"] == "ABSENT_IN_SOURCE"
        assert rec["geometry_wkt"] is None
        assert rec["unavailable_reason"]

    def test_provenance_fields_are_threaded_through(self, tmp_path):
        _, records = self._run(tmp_path)
        rec = next(r for r in records if r["entity_type"] == "CITY")
        assert rec["geometry_source"] == "OSM"
        assert rec["osm_source_name"] == SOURCE_NAME
        assert rec["osm_source_checksum_sha256"] == SOURCE_CHECKSUM
        assert rec["osm_extract_date"] == EXTRACT_DATE
