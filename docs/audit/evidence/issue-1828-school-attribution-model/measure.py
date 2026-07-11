#!/usr/bin/env python3
"""Measure school -> area centroid distances from the REAL repo sources.

Sources (no hardcoded duplicates):
  - schools:       scripts/db/fixtures/bangalore-mangalore-schools-seed.sql
  - coarse areas:  backend/src/main/resources/db/migration/V71__cities_and_areas.sql
  - fine areas:    backend/src/main/resources/db/migration/V106__seed_bangalore_macro_region_mapping.sql
"""
import re, math, json, sys

ROOT = "/Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer"
FIX = f"{ROOT}/scripts/db/fixtures/bangalore-mangalore-schools-seed.sql"
V71 = f"{ROOT}/backend/src/main/resources/db/migration/V71__cities_and_areas.sql"
V106 = f"{ROOT}/backend/src/main/resources/db/migration/V106__seed_bangalore_macro_region_mapping.sql"


def haversine(lat1, lon1, lat2, lon2):
    R = 6371008.8  # mean earth radius, metres
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# --- parse area VALUES rows: ('IN|KA|Bengaluru|X', 'bangalore', 'X', 'Bengaluru', lat, lon, minlat, minlon, maxlat, maxlon)
AREA_RE = re.compile(
    r"\(\s*'(IN\|KA\|Bengaluru\|[^']+)'\s*,\s*'bangalore'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,"
    r"\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,"
    r"\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)"
)


def parse_areas(path):
    out = {}
    txt = open(path, encoding="utf-8").read()
    for m in AREA_RE.finditer(txt):
        key = m.group(1)
        out[key] = dict(
            key=key,
            lat=float(m.group(2)), lon=float(m.group(3)),
            min_lat=float(m.group(4)), min_lon=float(m.group(5)),
            max_lat=float(m.group(6)), max_lon=float(m.group(7)),
        )
    return out


coarse = parse_areas(V71)
fine = parse_areas(V106)
allareas = {**coarse, **fine}

# --- parse school rows from the fixture
SCHOOL_RE = re.compile(
    r"\(\s*gen_random_uuid\(\)\s*,\s*'([^']+)'\s*,\s*'((?:[^']|'')+)'\s*,"  # udise, name
    r"(?:[^,]*,){6}"                                                        # board..source..address? -> re-derive below
)

# The fixture column list:
# (id, udise_code, name, board, board_type, state, district, source, address, latitude, longitude, prominence_tier, area_key)
ROW_RE = re.compile(
    r"\(\s*gen_random_uuid\(\)\s*,\s*"
    r"'([^']+)'\s*,\s*"                    # 1 udise_code
    r"'((?:[^']|'')*)'\s*,\s*"             # 2 name
    r"(?:'[^']*'|NULL)\s*,\s*"             # board
    r"(?:'[^']*'|NULL)\s*,\s*"             # board_type
    r"(?:'[^']*'|NULL)\s*,\s*"             # state
    r"'([^']+)'\s*,\s*"                    # 3 district
    r"(?:'[^']*'|NULL)\s*,\s*"             # source
    r"'((?:[^']|'')*)'\s*,\s*"             # 4 address
    r"(-?\d+\.?\d*)\s*,\s*"                # 5 lat
    r"(-?\d+\.?\d*)\s*,\s*"                # 6 lon
    r"(?:'[^']*'|NULL)\s*,\s*"             # prominence_tier
    r"'([^']+)'\s*\)"                      # 7 area_key (inert, but = the historical coarse value)
)

txt = open(FIX, encoding="utf-8").read()
schools = []
for m in ROW_RE.finditer(txt):
    schools.append(dict(
        udise=m.group(1),
        name=m.group(2).replace("''", "'"),
        district=m.group(3),
        address=m.group(4).replace("''", "'"),
        lat=float(m.group(5)),
        lon=float(m.group(6)),
        seed_area=m.group(7),
    ))

ben = [s for s in schools if s["district"] == "Bengaluru"]
print(f"parsed: {len(coarse)} coarse V71 bangalore areas, {len(fine)} fine V106 areas, "
      f"{len(schools)} schools ({len(ben)} Bengaluru)", file=sys.stderr)

# V109 shipped corrections (canonical, already in DB) - from the migration itself
V109 = {
    "APIFY-BAN-JAYA-01": "IN|KA|Bengaluru|JP Nagar",
    "APIFY-BAN-JAYA-05": "IN|KA|Bengaluru|JP Nagar",
    "APIFY-BAN-HEBB-01": "IN|KA|Bengaluru|Mallasandra",
    "APIFY-BAN-MARA-04": "IN|KA|Bengaluru|Kaggadasapura",
    "APIFY-BAN-MARA-06": "IN|KA|Bengaluru|Panathur",
}

rows = []
# NOTE: PR #1827 EDITED the seed fixture, so seed_area now holds the CORRECTED fine value for the
# 5 V109 schools -- it is NOT the historical coarse attribution. Recover the historical value the
# way the #1737 audit validated it: nearest centroid over ONLY the 10 coarse V71 areas, which
# reproduces all 32 original seed literals exactly (32/32). Self-deriving; immune to fixture edits.
mismatch = 0
for s in ben:
    stored = V109.get(s["udise"], s["seed_area"])   # live DB state post-V109
    ca = min(coarse.values(), key=lambda a: haversine(s["lat"], s["lon"], a["lat"], a["lon"]))
    coarse_home = ca["key"]
    if s["udise"] not in V109 and coarse_home != s["seed_area"]:
        mismatch += 1
        print(f"  !! coarse-derivation mismatch {s['udise']}: derived={coarse_home} seed={s['seed_area']}",
              file=sys.stderr)
    d_coarse = haversine(s["lat"], s["lon"], ca["lat"], ca["lon"])
    st = allareas.get(stored)
    d_stored = haversine(s["lat"], s["lon"], st["lat"], st["lon"]) if st else None
    # nearest over full catalogue
    nearest = min(allareas.values(), key=lambda a: haversine(s["lat"], s["lon"], a["lat"], a["lon"]))
    d_near = haversine(s["lat"], s["lon"], nearest["lat"], nearest["lon"])
    rows.append(dict(
        udise=s["udise"], name=s["name"], lat=s["lat"], lon=s["lon"],
        coarse_home=coarse_home.split("|")[-1],
        dist_to_coarse_centroid_m=round(d_coarse) if d_coarse else None,
        stored_now=stored.split("|")[-1],
        dist_to_stored_m=round(d_stored) if d_stored else None,
        nearest_of_313=nearest["key"].split("|")[-1],
        dist_to_nearest_m=round(d_near),
        corrected_by_v109=s["udise"] in V109,
    ))

rows.sort(key=lambda r: r["dist_to_coarse_centroid_m"] or 0)
print(json.dumps(rows, indent=1))
print(f"coarse-derivation cross-check vs untouched seed literals: {mismatch} mismatches "
      f"(expect 0 -> validates the derivation)", file=sys.stderr)

# threshold sweep: if canonical moves to nearest-of-313, how many schools remain within
# X metres of their ORIGINAL coarse area centroid (i.e. would still earn 'nearby' coverage)?
print("\n=== threshold sweep: schools within X m of their coarse-area centroid ===", file=sys.stderr)
from collections import Counter
for thr in (2000, 2500, 3000, 3500, 4000, 5000, 6000, 8000, 10000):
    keep = [r for r in rows if r["dist_to_coarse_centroid_m"] <= thr]
    per = Counter(r["coarse_home"] for r in keep)
    zeroed = sorted({r["coarse_home"] for r in rows} - set(per))
    print(f"  {thr:>5} m -> {len(keep):>2}/{len(rows)} schools keep coarse coverage; "
          f"coarse areas at ZERO: {zeroed if zeroed else 'none'}", file=sys.stderr)
