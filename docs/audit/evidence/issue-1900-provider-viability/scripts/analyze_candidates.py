#!/usr/bin/env python3
"""Coverage/quality metrics + sample-locality lookup for issue #1900 investigation."""
import sys
import json
from collections import Counter, defaultdict

SAMPLE_NAMES = {
    "bangalore": ["Hebbal", "Yelahanka", "JP Nagar", "Jayanagar", "Whitefield",
                  "Electronic City", "Koramangala", "Indiranagar"],
    "udupi": ["Udupi", "Manipal", "Brahmavar", "Kapu", "Malpe", "Santhekatte",
              "Parkala", "Kunjibettu"],
}


def norm(s):
    return s.strip().lower() if s else s


def load(path):
    recs = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                recs.append(json.loads(line))
    return recs


def analyze(city, path):
    recs = load(path)
    total = len(recs)
    by_place = Counter(r["place"] for r in recs if r["place"])
    by_admin = Counter(r["admin_level"] for r in recs if r["admin_level"])
    by_osmtype = Counter(r["osm_type"] for r in recs)
    geom_poly = sum(1 for r in recs if r["osm_type"] in ("way", "relation"))
    geom_point = sum(1 for r in recs if r["osm_type"] == "node")
    has_kn = sum(1 for r in recs if r["names"].get("name:kn"))
    has_en = sum(1 for r in recs if r["names"].get("name:en") or r["names"].get("name"))
    has_postal = sum(1 for r in recs if r.get("postal_code"))
    has_wikidata = sum(1 for r in recs if r.get("wikidata"))

    name_groups = defaultdict(list)
    for r in recs:
        nm = norm(r["names"].get("name"))
        if nm:
            name_groups[nm].append(r)
    dupes = {k: v for k, v in name_groups.items() if len(v) > 1}

    sample_report = []
    for target in SAMPLE_NAMES[city]:
        matches = [r for r in recs if norm(r["names"].get("name")) == norm(target)]
        sample_report.append({
            "target": target,
            "found": len(matches) > 0,
            "match_count": len(matches),
            "matches": [
                {
                    "osm_type": m["osm_type"], "osm_id": m["osm_id"],
                    "place": m["place"], "boundary": m["boundary"],
                    "admin_level": m["admin_level"],
                    "has_polygon": m["osm_type"] in ("way", "relation"),
                    "centroid": m["centroid"],
                    "postal_code": m.get("postal_code"),
                }
                for m in matches
            ],
        })

    return {
        "city": city,
        "total_candidates": total,
        "by_place_type": dict(by_place),
        "by_admin_level": dict(by_admin),
        "by_osm_type": dict(by_osmtype),
        "geometry_polygon_or_way_count": geom_poly,
        "geometry_point_only_count": geom_point,
        "pct_polygon_or_way": round(100 * geom_poly / total, 1) if total else 0,
        "pct_point_only": round(100 * geom_point / total, 1) if total else 0,
        "pct_with_kannada_name": round(100 * has_kn / total, 1) if total else 0,
        "pct_with_name": round(100 * has_en / total, 1) if total else 0,
        "pct_with_postal_code": round(100 * has_postal / total, 1) if total else 0,
        "pct_with_wikidata": round(100 * has_wikidata / total, 1) if total else 0,
        "duplicate_name_count": len(dupes),
        "duplicate_name_samples": list(dupes.keys())[:15],
        "sample_locality_report": sample_report,
    }


if __name__ == "__main__":
    city, path = sys.argv[1], sys.argv[2]
    print(json.dumps(analyze(city, path), indent=2, ensure_ascii=False))
