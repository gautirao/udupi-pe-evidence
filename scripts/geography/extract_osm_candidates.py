#!/usr/bin/env python3
"""Extracts NODE + SIMPLE CLOSED WAY OSM place candidates within a bbox into
raw candidate JSONL (issue #1900 AC1).

Administrative-relation/multipolygon area-assembly is explicitly DEFERRED to
a future PR (design decision D6) — see docs/ops/city-geography-preparation.md.
This script never attempts osmium.area.AreaManager relation assembly and
never emits an unassembled/unfiltered administrative relation.

Reuses the extraction approach proven in
docs/audit/evidence/issue-1900-provider-viability/scripts/extract_candidates_v4_corrected.py,
restricted to nodes + simple closed ways, with ONE deliberate correction
(issue #1900 D4/R5): a point (node) candidate's bbox is left as
[None, None, None, None] — NEVER filled with the degenerate point-as-bbox
that the investigation-only v4 script used. A synthesised point bbox would
make GeometryTrust.classify() report VERIFIED for a candidate with no real
extent, which #1900 must never do (point-only candidates classify
PROVISIONAL, see scripts/geography/geometry_trust.py).

osmium is imported LAZILY inside extract() so the rest of the scripts/
geography/ package (area_key, geometry_trust, city_config, the CSV/JSON
builders) never requires osmium to be installed.

Source: OpenStreetMap. Contains data from OpenStreetMap, licensed under the
Open Database Licence (ODbL) 1.0. (c) OpenStreetMap contributors.
https://www.openstreetmap.org/copyright
"""
from __future__ import annotations

import argparse
import json

PLACE_TYPES = {
    "city", "town", "suburb", "quarter", "neighbourhood", "village", "hamlet",
    "locality", "isolated_dwelling",
}
NAME_TAG_KEYS = [
    "name", "official_name", "short_name", "alt_name", "old_name",
    "name:kn", "name:en", "loc_name", "int_name",
]


def _tag_dict(tags) -> dict:
    return {t.k: t.v for t in tags}


def _relevant(tags: dict) -> bool:
    """NODE + SIMPLE CLOSED WAY filter: place=* only. Deliberately does NOT
    match boundary=administrative — that is the deferred relation-assembly
    path (D6), never emitted here even as an unfiltered way."""
    return tags.get("place") in PLACE_TYPES


def _in_bbox(lon: float, lat: float, bbox: tuple[float, float, float, float]) -> bool:
    return bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]


def _make_record(city, osm_type, osm_id, tags, geom_type, centroid, bbox) -> dict:
    return {
        "city": city,
        "provider": "osm",
        "osm_type": osm_type,
        "osm_id": osm_id,
        "place": tags.get("place"),
        "boundary": tags.get("boundary"),
        "admin_level": tags.get("admin_level"),
        "names": {k: v for k, v in tags.items() if k in NAME_TAG_KEYS},
        "postal_code": tags.get("addr:postcode") or tags.get("postal_code"),
        "wikidata": tags.get("wikidata"),
        "wikipedia": tags.get("wikipedia"),
        "geometry_type": geom_type,
        "centroid": centroid,
        "bbox": bbox,
        "all_tags": tags,
    }


def extract(pbf_path: str, city: str, bbox: tuple[float, float, float, float], out_path: str) -> dict:
    """Runs the NODE + SIMPLE CLOSED WAY extraction. Returns a counts dict."""
    import osmium  # lazy: extraction-only dependency
    import shapely.wkb as wkblib
    from shapely.geometry import Polygon

    wkbfab = osmium.geom.WKBFactory()
    counts = {
        "node": 0, "way": 0, "way_skipped_not_closed": 0, "way_skipped_bad_geometry": 0,
        "way_skipped_invalid_geometry": 0,
    }

    with open(out_path, "w", encoding="utf-8") as out_fh:
        file_processor = osmium.FileProcessor(pbf_path).with_locations()
        for obj in file_processor:
            if obj.is_node():
                tags = _tag_dict(obj.tags)
                if not tags or not _relevant(tags):
                    continue
                loc = obj.location
                if not loc.valid():
                    continue
                lon, lat = loc.lon, loc.lat
                if not _in_bbox(lon, lat, bbox):
                    continue
                # D4/R5: NEVER synthesise a bbox from a point — bbox stays null.
                rec = _make_record(city, "node", obj.id, tags, "Point", [lon, lat], [None, None, None, None])
                out_fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                counts["node"] += 1

            elif obj.is_way():
                tags = _tag_dict(obj.tags)
                if not tags or not _relevant(tags):
                    continue
                if not obj.is_closed():
                    counts["way_skipped_not_closed"] += 1
                    continue
                try:
                    # WKBFactory has no create_polygon() for a bare way in the
                    # installed pyosmium version (create_multipolygon() only
                    # accepts assembled osmium.osm.Area objects). Build the
                    # polygon from the way's own closed node-location ring via
                    # create_linestring() instead, matching the proven
                    # approach's centroid/bbox semantics for a simple closed
                    # way.
                    wkb = wkbfab.create_linestring(obj)
                    ring = wkblib.loads(bytes.fromhex(wkb))
                    shp = Polygon(ring.coords)
                except Exception:
                    counts["way_skipped_bad_geometry"] += 1
                    continue
                # ADDITIONAL (rework): a self-intersecting or degenerate
                # (zero-area) ring must never be emitted as polygon
                # geometry — check validity/emptiness/area explicitly
                # rather than trusting whatever Polygon(ring.coords)
                # happened to construct.
                if not shp.is_valid or shp.is_empty or shp.area <= 0:
                    counts["way_skipped_invalid_geometry"] += 1
                    continue
                centroid = shp.centroid
                if not _in_bbox(centroid.x, centroid.y, bbox):
                    continue
                rec = _make_record(
                    city, "way", obj.id, tags, "Polygon(way)",
                    [centroid.x, centroid.y], list(shp.bounds))
                out_fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                counts["way"] += 1

    return counts


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pbf", help="path to a local .osm.pbf or .osm XML file (never committed to git)")
    parser.add_argument("city", help="city label, e.g. 'udupi' or 'bangalore'")
    parser.add_argument("min_lon", type=float)
    parser.add_argument("min_lat", type=float)
    parser.add_argument("max_lon", type=float)
    parser.add_argument("max_lat", type=float)
    parser.add_argument("out", help="output raw candidate JSONL path")
    args = parser.parse_args(argv)

    bbox = (args.min_lon, args.min_lat, args.max_lon, args.max_lat)
    counts = extract(args.pbf, args.city, bbox, args.out)
    print(json.dumps({"city": args.city, "bbox": list(bbox), "counts": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
