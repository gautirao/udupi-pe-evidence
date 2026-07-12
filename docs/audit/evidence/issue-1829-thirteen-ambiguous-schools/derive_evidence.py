#!/usr/bin/env python3
"""Issue #1829 — per-school evidence for the 13 ambiguous Bengaluru schools.

Everything below is DERIVED from the REAL repo sources. Nothing is hardcoded:
  - schools + addresses : scripts/db/fixtures/bangalore-mangalore-schools-seed.sql
  - coarse areas (10)   : backend/.../V71__cities_and_areas.sql
  - fine areas (304)    : backend/.../V106__seed_bangalore_macro_region_mapping.sql
  - shipped corrections : backend/.../V109__correct_bengaluru_school_area_keys.sql   <- parsed, not retyped

The 13 are RE-DERIVED by re-running #1737's 4-part decision rule and subtracting the 5
schools V109 actually corrected. If that yields exactly 13, the derivation is sound.

Under the #1828 two-concept model each school now needs TWO independent decisions:
  1. CANONICAL LOCALITY  — where the school actually is (schools.area_key)
  2. CURATED COVERAGE    — which curated areas may surface/count it (school_discover_area_coverage)
"""
import re, math, json, sys

ROOT = "/Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer"
FIX  = f"{ROOT}/scripts/db/fixtures/bangalore-mangalore-schools-seed.sql"
V71  = f"{ROOT}/backend/src/main/resources/db/migration/V71__cities_and_areas.sql"
V106 = f"{ROOT}/backend/src/main/resources/db/migration/V106__seed_bangalore_macro_region_mapping.sql"
V109 = f"{ROOT}/backend/src/main/resources/db/migration/V109__correct_bengaluru_school_area_keys.sql"


def haversine(lat1, lon1, lat2, lon2):
    R = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))


AREA_RE = re.compile(
    r"\(\s*'(IN\|KA\|Bengaluru\|[^']+)'\s*,\s*'bangalore'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,"
    r"\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,"
    r"\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)")


def parse_areas(path):
    out = {}
    for m in AREA_RE.finditer(open(path, encoding="utf-8").read()):
        out[m.group(1)] = dict(
            key=m.group(1), name=m.group(1).split("|")[-1],
            lat=float(m.group(2)), lon=float(m.group(3)),
            min_lat=float(m.group(4)), min_lon=float(m.group(5)),
            max_lat=float(m.group(6)), max_lon=float(m.group(7)))
    return out


coarse = parse_areas(V71)          # the 10 curated areas
fine   = parse_areas(V106)         # the 304 fine localities
allareas = {**coarse, **fine}

# V109's shipped corrections, PARSED from the migration (never retyped)
v109 = dict(re.findall(r"ARRAY\['([^']+)',\s*'[^']+',\s*'(IN\|KA\|Bengaluru\|[^']+)'\]",
                       open(V109, encoding="utf-8").read()))

ROW_RE = re.compile(
    r"\(\s*gen_random_uuid\(\)\s*,\s*'([^']+)'\s*,\s*'((?:[^']|'')*)'\s*,\s*"
    r"(?:'[^']*'|NULL)\s*,\s*(?:'[^']*'|NULL)\s*,\s*(?:'[^']*'|NULL)\s*,\s*"
    r"'([^']+)'\s*,\s*(?:'[^']*'|NULL)\s*,\s*'((?:[^']|'')*)'\s*,\s*"
    r"(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,\s*(?:'[^']*'|NULL)\s*,\s*'([^']+)'\s*\)")

schools = []
for m in ROW_RE.finditer(open(FIX, encoding="utf-8").read()):
    if m.group(3) != "Bengaluru":
        continue
    schools.append(dict(udise=m.group(1), name=m.group(2).replace("''", "'"),
                        address=m.group(4).replace("''", "'"),
                        lat=float(m.group(5)), lon=float(m.group(6))))

def in_bbox(s, a):
    """Non-degenerate bbox containment. 69/313 areas have a degenerate point bbox."""
    if a["min_lat"] == a["max_lat"] or a["min_lon"] == a["max_lon"]:
        return None                     # degenerate -> containment is not a usable signal
    return (a["min_lat"] <= s["lat"] <= a["max_lat"]
            and a["min_lon"] <= s["lon"] <= a["max_lon"])

def names_in_address(s):
    """Which configured area names does the school's OWN address mention?"""
    addr = s["address"].lower()
    hits = []
    for a in allareas.values():
        n = a["name"].lower()
        if len(n) < 4:
            continue
        if re.search(r"\b" + re.escape(n) + r"\b", addr):
            hits.append(a["name"])
    return sorted(set(hits), key=len, reverse=True)

rows = []
for s in schools:
    # historical coarse attribution == nearest of the 10 V71 areas (validated 27/27 in #1828)
    stored_coarse = min(coarse.values(), key=lambda a: haversine(s["lat"], s["lon"], a["lat"], a["lon"]))
    corrected = v109.get(s["udise"])
    stored_now = allareas[corrected] if corrected else stored_coarse

    nearest = min(allareas.values(), key=lambda a: haversine(s["lat"], s["lon"], a["lat"], a["lon"]))
    addr_hits = names_in_address(s)

    # #1737's 4-part rule
    c1 = stored_coarse["name"].lower() not in s["address"].lower()          # stored name absent from address
    addr_area = next((allareas[k] for k in allareas
                      if allareas[k]["name"] in addr_hits and allareas[k]["name"] != stored_coarse["name"]), None)
    c2 = addr_area is not None
    c3 = bool(c2 and (nearest["name"] == addr_area["name"] or in_bbox(s, addr_area) is True))
    c4 = in_bbox(s, stored_coarse) is not True                              # counter-signal guard
    auto = c1 and c2 and c3 and c4

    rows.append(dict(
        udise=s["udise"], name=s["name"], address=s["address"], lat=s["lat"], lon=s["lon"],
        stored_coarse=stored_coarse["name"], stored_now=stored_now["name"],
        corrected_by_v109=bool(corrected),
        address_says=addr_hits, geometry_says=nearest["name"],
        d_to_stored_coarse_m=round(haversine(s["lat"], s["lon"], stored_coarse["lat"], stored_coarse["lon"])),
        d_to_nearest_m=round(haversine(s["lat"], s["lon"], nearest["lat"], nearest["lon"])),
        inside_stored_coarse_bbox=in_bbox(s, stored_coarse),
        suspected=c1, auto_correctable=auto,
    ))

corrected5 = [r for r in rows if r["corrected_by_v109"]]
suspected  = [r for r in rows if r["suspected"]]
thirteen   = [r for r in rows if r["suspected"] and not r["corrected_by_v109"]]

print(f"Bengaluru schools parsed        : {len(rows)}   (expect 32)", file=sys.stderr)
print(f"V109 corrections parsed         : {len(v109)}   (expect 5)", file=sys.stderr)
print(f"Suspected by the #1737 rule (M) : {len(suspected)}   (expect 18)", file=sys.stderr)
print(f"Left for human ruling (L)       : {len(thirteen)}   (expect 13)  <- RE-DERIVED, not copied", file=sys.stderr)
print(file=sys.stderr)

json.dump(thirteen, open(f"{ROOT}/docs/audit/evidence/issue-1829-thirteen-ambiguous-schools/thirteen-schools.json", "w"), indent=1)

hdr = f"{'school':<46} {'stored(coarse)':<16} {'address says':<22} {'geometry':<22} {'d_stored':>8} {'d_near':>7} {'in_bbox':>8}"
print(hdr, file=sys.stderr)
print("-" * len(hdr), file=sys.stderr)
for r in sorted(thirteen, key=lambda x: -x["d_to_stored_coarse_m"]):
    says = (r["address_says"][0] if r["address_says"] else "— none —")[:20]
    print(f"{r['name'][:44]:<46} {r['stored_coarse']:<16} {says:<22} {r['geometry_says'][:20]:<22} "
          f"{r['d_to_stored_coarse_m']:>8} {r['d_to_nearest_m']:>7} {str(r['inside_stored_coarse_bbox']):>8}",
          file=sys.stderr)
