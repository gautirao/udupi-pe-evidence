#!/usr/bin/env python3
"""Disposable prototype extractor for issue #1900 provider-viability investigation.

Reads an .osm.pbf extract (Geofabrik) and emits one JSON-lines record per
candidate locality/administrative feature within a bbox, retaining raw tags
and OSM identity for later reconciliation. Investigation-only: does not
write to any database, does not call any network geocoder.

Usage:
    python3 extract_candidates.py <input.osm.pbf> <city_label> <min_lon> <min_lat> <max_lon> <max_lat> <output.jsonl>
"""
import sys
import json
import osmium
import shapely.wkb as wkblib
from osmium.geom import WKBFactory

PLACE_TYPES = {
    "city", "town", "suburb", "quarter", "neighbourhood", "village", "hamlet",
    "locality", "isolated_dwelling",
}

NAME_TAG_KEYS = [
    "name", "official_name", "short_name", "alt_name", "old_name",
    "name:kn", "name:en", "loc_name", "int_name",
]

wkbfab = WKBFactory()


def tag_dict(tags):
    return {t.k: t.v for t in tags}


def bbox_of(geom):
    return list(geom.bounds)


def centroid_of(geom):
    c = geom.centroid
    return [c.x, c.y]


class CandidateHandler(osmium.SimpleHandler):
    def __init__(self, city_label, bbox, out_fh):
        super().__init__()
        self.city_label = city_label
        self.min_lon, self.min_lat, self.max_lon, self.max_lat = bbox
        self.out_fh = out_fh
        self.counts = {"node": 0, "way": 0, "relation": 0, "written": 0}

    def _in_bbox(self, lon, lat):
        return (self.min_lon <= lon <= self.max_lon) and (self.min_lat <= lat <= self.max_lat)

    def _relevant(self, tags):
        place = tags.get("place")
        boundary = tags.get("boundary")
        return (place in PLACE_TYPES) or (boundary == "administrative")

    def _emit(self, elem_type, elem_id, tags, geom_type, geometry_wkb, lon_hint=None, lat_hint=None):
        try:
            shp = wkblib.loads(bytes.fromhex(geometry_wkb))
        except Exception:
            shp = None

        if shp is not None:
            cx, cy = centroid_of(shp)
            bbox = bbox_of(shp)
            geom_available = True
        elif lon_hint is not None:
            cx, cy = lon_hint, lat_hint
            bbox = [lon_hint, lat_hint, lon_hint, lat_hint]
            geom_available = True
        else:
            return

        if not self._in_bbox(cx, cy):
            return

        names = {k: v for k, v in tags.items() if k in NAME_TAG_KEYS}
        record = {
            "city": self.city_label,
            "provider": "osm_geofabrik_southern_zone",
            "osm_type": elem_type,
            "osm_id": elem_id,
            "place": tags.get("place"),
            "boundary": tags.get("boundary"),
            "admin_level": tags.get("admin_level"),
            "names": names,
            "postal_code": tags.get("addr:postcode") or tags.get("postal_code"),
            "wikidata": tags.get("wikidata"),
            "wikipedia": tags.get("wikipedia"),
            "geometry_type": geom_type,
            "geometry_available": geom_available,
            "centroid": [cx, cy],
            "bbox": bbox,
            "all_tags": tags,
        }
        self.out_fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        self.counts["written"] += 1

    def node(self, n):
        self.counts["node"] += 1
        tags = tag_dict(n.tags)
        if not tags or not self._relevant(tags):
            return
        if not n.location.valid():
            return
        self._emit("node", n.id, tags, "Point", None, n.location.lon, n.location.lat)

    def way(self, w):
        self.counts["way"] += 1
        tags = tag_dict(w.tags)
        if not tags or not self._relevant(tags):
            return
        try:
            wkb = wkbfab.create_linestring(w)
        except Exception:
            return
        self._emit("way", w.id, tags, "LineString/Way", wkb)

    def relation(self, r):
        self.counts["relation"] += 1
        tags = tag_dict(r.tags)
        if not tags or not self._relevant(tags):
            return
        # Relations (multipolygons) require a location-indexed pass to build
        # geometry; recorded here as identity+tags only (geometry resolved
        # in a second pass via osmium.FileProcessor + area assembly if needed).
        record = {
            "city": self.city_label,
            "provider": "osm_geofabrik_southern_zone",
            "osm_type": "relation",
            "osm_id": r.id,
            "place": tags.get("place"),
            "boundary": tags.get("boundary"),
            "admin_level": tags.get("admin_level"),
            "names": {k: v for k, v in tags.items() if k in NAME_TAG_KEYS},
            "postal_code": tags.get("addr:postcode") or tags.get("postal_code"),
            "wikidata": tags.get("wikidata"),
            "wikipedia": tags.get("wikipedia"),
            "geometry_type": "Relation(members-only, polygon not resolved in pass 1)",
            "geometry_available": False,
            "centroid": None,
            "bbox": None,
            "all_tags": tags,
        }
        self.out_fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        self.counts["written"] += 1


def main():
    if len(sys.argv) != 8:
        print(__doc__)
        sys.exit(1)
    pbf_path, city_label, min_lon, min_lat, max_lon, max_lat, out_path = sys.argv[1:8]
    bbox = (float(min_lon), float(min_lat), float(max_lon), float(max_lat))
    with open(out_path, "w", encoding="utf-8") as out_fh:
        handler = CandidateHandler(city_label, bbox, out_fh)
        handler.apply_file(pbf_path, locations=True, idx="flex_mem")
    print(json.dumps({"city": city_label, "bbox": bbox, "counts": handler.counts}, indent=2))


if __name__ == "__main__":
    main()
