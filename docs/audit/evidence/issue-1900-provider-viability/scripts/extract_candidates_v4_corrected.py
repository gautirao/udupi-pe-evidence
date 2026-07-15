#!/usr/bin/env python3
"""Two-full-scan prototype extractor v4 (issue #1900 provider-viability).

v3 correctly fixed the area-geometry defect but used 3 full-file scans
(separate node/way pass + AreaManager first_pass_handler + area second
pass), which ran long enough to be killed by the harness's background-task
ceiling. v4 merges the node/way extraction into the SAME iteration as the
area second pass (both come from one FileProcessor(...).with_areas(mgr)
iteration), leaving exactly 2 full-file scans:
  1. mgr.first_pass_handler() — cheap tag-only scan, collects candidate areas
  2. FileProcessor(...).with_locations().with_areas(mgr) — one iteration
     yielding nodes, ways, AND fully-assembled areas together

Investigation-only: no DB writes, no network geocoding.
"""
import sys
import json
import osmium
import osmium.area as area
import shapely.wkb as wkblib

PLACE_TYPES = {
    "city", "town", "suburb", "quarter", "neighbourhood", "village", "hamlet",
    "locality", "isolated_dwelling",
}
NAME_TAG_KEYS = ["name", "official_name", "short_name", "alt_name", "old_name",
                 "name:kn", "name:en", "loc_name", "int_name"]
wkbfab = osmium.geom.WKBFactory()


def tag_dict(tags):
    return {t.k: t.v for t in tags}


def relevant(tags):
    return (tags.get("place") in PLACE_TYPES) or (tags.get("boundary") == "administrative")


def in_bbox(lon, lat, bbox):
    return bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]


def make_record(city, osm_type, osm_id, tags, geom_type, geom_available, centroid, bbox):
    return {
        "city": city,
        "provider": "osm_geofabrik_southern_zone",
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
        "geometry_available": geom_available,
        "centroid": centroid,
        "bbox": bbox,
        "all_tags": tags,
    }


def main():
    if len(sys.argv) != 8:
        print(__doc__)
        sys.exit(1)
    pbf_path, city, min_lon, min_lat, max_lon, max_lat, out_path = sys.argv[1:8]
    bbox = (float(min_lon), float(min_lat), float(max_lon), float(max_lat))

    counts = {"node": 0, "way_polygon": 0, "area_seen": 0, "area_written": 0,
              "way_skipped_as_area_member": 0}

    mgr = area.AreaManager()
    osmium.apply(pbf_path, mgr.first_pass_handler())

    with open(out_path, "w", encoding="utf-8") as out_fh:
        fp = osmium.FileProcessor(pbf_path).with_locations().with_areas(mgr)
        for obj in fp:
            if obj.is_area():
                counts["area_seen"] += 1
                tags = tag_dict(obj.tags)
                if not tags or not relevant(tags):
                    continue
                try:
                    wkb = wkbfab.create_multipolygon(obj)
                    shp = wkblib.loads(bytes.fromhex(wkb))
                except Exception:
                    continue
                c = shp.centroid
                if not in_bbox(c.x, c.y, bbox):
                    continue
                osm_type = "way" if obj.from_way() else "relation"
                rec = make_record(city, osm_type, obj.orig_id(), tags,
                                   "Polygon/MultiPolygon(area)", True,
                                   [c.x, c.y], list(shp.bounds))
                out_fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                counts["area_written"] += 1

            elif obj.is_node():
                tags = tag_dict(obj.tags)
                if not tags or not relevant(tags):
                    continue
                loc = obj.location
                if not loc.valid():
                    continue
                lon, lat = loc.lon, loc.lat
                if not in_bbox(lon, lat, bbox):
                    continue
                counts["node"] += 1
                rec = make_record(city, "node", obj.id, tags, "Point", True,
                                   [lon, lat], [lon, lat, lon, lat])
                out_fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

            elif obj.is_way():
                # Ways consumed as multipolygon members are still surfaced by
                # with_areas() as plain ways; a way that is itself part of an
                # already-emitted area would double-count, so only take
                # standalone closed ways whose tags are NOT boundary=admin
                # relations members (best-effort heuristic for this
                # prototype: keep place=* closed ways, skip boundary=
                # administrative ways since those are virtually always area
                # members already emitted above).
                tags = tag_dict(obj.tags)
                if not tags or not relevant(tags) or not obj.is_closed():
                    continue
                if tags.get("boundary") == "administrative":
                    counts["way_skipped_as_area_member"] += 1
                    continue
                try:
                    wkb = wkbfab.create_polygon(obj)
                    shp = wkblib.loads(bytes.fromhex(wkb))
                except Exception:
                    continue
                c = shp.centroid
                if not in_bbox(c.x, c.y, bbox):
                    continue
                counts["way_polygon"] += 1
                rec = make_record(city, "way", obj.id, tags, "Polygon(way)", True,
                                   [c.x, c.y], list(shp.bounds))
                out_fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    print(json.dumps({"city": city, "bbox": bbox, "counts": counts}, indent=2))


if __name__ == "__main__":
    main()
