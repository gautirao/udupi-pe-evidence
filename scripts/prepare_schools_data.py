#!/usr/bin/env python3
"""
prepare_schools_data.py
=======================
Full Kaggle+OSM schools pipeline for Karnataka.

Usage
-----
    python scripts/prepare_schools_data.py \\
        scripts/data/schools/raw/kaggle_schools.csv \\
        scripts/data/schools/raw/hdx_hotosm_karnataka_schools.geojson \\
        scripts/data/schools/output/

Outputs (all written to <output_dir>):
    karnataka_schools_seed.sql        — INSERT … ON CONFLICT DO UPDATE for matched rows
    karnataka_schools_unmatched.csv   — rows without a GeoJSON coordinate match
    karnataka_schools_matched_review.csv — summary of matched rows for spot-checking

Pipeline steps
--------------
1. Load Kaggle CSV, filter to Karnataka, deduplicate by udise_code.
2. Load HDX/OSM GeoJSON school features.
3. Normalise names and districts.
4. Match Kaggle rows to OSM features (Tier 1 exact+district, Tier 2 exact global,
   Tier 3 fuzzy within district bounding box).
5. Write SQL seed (matched only), unmatched CSV, and matched-review CSV.
"""

import sys
import os
import csv
import re
import json
import datetime
from dataclasses import dataclass
from typing import Optional

# ---------------------------------------------------------------------------
# India coordinate bounding box (sanity check for GeoJSON coordinates)
# ---------------------------------------------------------------------------
INDIA_LAT_MIN, INDIA_LAT_MAX = 8.0, 37.5
INDIA_LON_MIN, INDIA_LON_MAX = 68.0, 97.5

# ---------------------------------------------------------------------------
# Karnataka district bounding boxes  (lat_min, lat_max, lon_min, lon_max)
# Approximate ±1.5° around each district centroid.
# ---------------------------------------------------------------------------
DISTRICT_BBOX: dict[str, tuple[float, float, float, float]] = {
    "BENGALURU URBAN":   (12.7, 13.4, 77.3, 77.9),
    "BENGALURU RURAL":   (12.7, 13.4, 77.0, 77.7),
    "MYSURU":            (11.8, 12.6, 76.2, 77.0),
    "TUMAKURU":          (13.0, 14.0, 76.8, 77.5),
    "KOLAR":             (12.7, 13.5, 77.8, 78.5),
    "CHIKKABALLAPURA":   (13.2, 13.8, 77.5, 78.2),
    "RAMANAGARA":        (12.5, 13.0, 77.2, 77.8),
    "MANDYA":            (12.1, 12.7, 76.5, 77.2),
    "HASSAN":            (12.6, 13.3, 75.8, 76.5),
    "KODAGU":            (11.8, 12.7, 75.5, 76.3),
    "CHIKKAMAGALURU":    (12.8, 13.7, 75.5, 76.3),
    "SHIVAMOGGA":        (13.5, 14.5, 74.8, 76.0),
    "DAVANGERE":         (14.0, 14.8, 75.5, 76.1),
    "CHITRADURGA":       (13.8, 14.8, 76.0, 76.8),
    "BELAGAVI":          (15.5, 16.5, 74.3, 75.4),
    "DHARWAD":           (15.1, 15.7, 74.7, 75.3),
    "HUBBALLI":          (15.2, 15.5, 75.0, 75.3),
    "GADAG":             (15.2, 15.8, 75.3, 76.0),
    "HAVERI":            (14.5, 15.1, 75.1, 75.7),
    "VIJAYAPURA":        (16.5, 17.2, 75.5, 76.2),
    "BAGALKOT":          (15.8, 16.5, 75.3, 76.0),
    "KALABURAGI":        (17.0, 17.8, 76.5, 77.5),
    "RAICHUR":           (15.8, 16.7, 76.7, 77.7),
    "KOPPAL":            (15.2, 15.9, 76.0, 76.6),
    "BALLARI":           (14.8, 15.6, 76.5, 77.3),
    "VIJAYANAGARA":      (14.9, 15.6, 76.2, 76.9),
    "YADGIR":            (16.5, 17.2, 76.8, 77.6),
    "BIDAR":             (17.5, 18.2, 76.6, 77.4),
    "UDUPI":             (13.1, 13.8, 74.5, 75.2),
    "DAKSHINA KANNADA":  (12.5, 13.1, 74.6, 75.6),
    "UTTARA KANNADA":    (13.8, 15.1, 74.0, 75.4),
    "CHAMARAJANAGAR":    (11.6, 12.3, 76.8, 77.5),
}

# ---------------------------------------------------------------------------
# District alias normalisation
# ---------------------------------------------------------------------------
DISTRICT_ALIAS_MAP: dict[str, str] = {
    "BANGALORE URBAN": "BENGALURU URBAN",
    "BANGALORE RURAL": "BENGALURU RURAL",
    "BANGALORE":       "BENGALURU URBAN",
    "MYSORE":          "MYSURU",
    "BELGAUM":         "BELAGAVI",
    "SHIMOGA":         "SHIVAMOGGA",
    "DAKSHIN KANNADA": "DAKSHINA KANNADA",
    "SOUTH KANARA":    "DAKSHINA KANNADA",
    "NORTH CANARA":    "UTTARA KANNADA",
    "BIJAPUR":         "VIJAYAPURA",
    "GULBARGA":        "KALABURAGI",
    "TUMKUR":          "TUMAKURU",
    "HOSPET":          "VIJAYANAGARA",
    "BELLARY":         "BALLARI",
    "CHITRADURGA":     "CHITRADURGA",
}


def normalise_district(d: str) -> str:
    d = d.upper().strip()
    return DISTRICT_ALIAS_MAP.get(d, d)


# ---------------------------------------------------------------------------
# Name normalisation
# ---------------------------------------------------------------------------
NAME_REPLACEMENTS: list[tuple[str, str]] = [
    (r"\bGOVT\b",            "GOVERNMENT"),
    (r"\bGOVT\.",            "GOVERNMENT"),
    (r"\bSCH\b",             "SCHOOL"),
    (r"\bVIDHYALAYA\b",      "VIDYALAYA"),
    (r"\bSR SEC\b",          "SENIOR SECONDARY"),
    (r"\bSR\. SEC\b",        "SENIOR SECONDARY"),
    (r"\bHIGHER PRIMARY\b",  "HIGHER PRIMARY"),
    (r"\bLOWER PRIMARY\b",   "LOWER PRIMARY"),
]


def normalise_name(s: str) -> str:
    s = s.upper()
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    for pattern, replacement in NAME_REPLACEMENTS:
        s = re.sub(pattern, replacement, s)
    return s.strip()


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass
class KaggleSchool:
    serial_no: Optional[str]
    udise_code: str
    school_name: str
    district: str           # raw from CSV
    norm_district: str      # normalised
    block: Optional[str]
    village: Optional[str]
    cluster: Optional[str]
    location: Optional[str]
    state_mgmt: Optional[str]
    national_mgmt: Optional[str]
    school_category: Optional[str]
    school_type: Optional[str]
    school_status: Optional[str]


@dataclass
class OsmFeature:
    osm_name: str
    norm_name: str
    osm_id: Optional[int]
    latitude: float
    longitude: float


@dataclass
class MatchedSchool:
    school: KaggleSchool
    feature: OsmFeature
    confidence: str   # high | medium | low
    method: str       # exact_name_district | exact_name_only | fuzzy_name_district


# ---------------------------------------------------------------------------
# Step 1 — Load Kaggle CSV (Karnataka only)
# ---------------------------------------------------------------------------
def load_kaggle(path: str) -> tuple[list[KaggleSchool], int, int, int, int]:
    """
    Returns (schools, total_rows, raw_karnataka, dropped_dupes, dropped_invalid).
    dropped_invalid counts rows missing school_name or udise_code.
    """
    total_rows = 0
    raw_karnataka = 0
    dropped_invalid = 0
    dropped_dupes = 0
    seen_udise: set[str] = set()
    schools: list[KaggleSchool] = []

    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            total_rows += 1
            state_val = (row.get("state") or "").strip()
            if state_val.lower() != "karnataka":
                continue
            raw_karnataka += 1

            school_name = (row.get("school_name") or "").strip()
            udise_code = (row.get("udise_code") or "").strip()

            if not school_name or not udise_code:
                dropped_invalid += 1
                continue

            if udise_code in seen_udise:
                dropped_dupes += 1
                continue
            seen_udise.add(udise_code)

            district_raw = (row.get("district") or "").strip()
            schools.append(KaggleSchool(
                serial_no=       (row.get("serial_no") or "").strip() or None,
                udise_code=      udise_code,
                school_name=     school_name,
                district=        district_raw,
                norm_district=   normalise_district(district_raw),
                block=           (row.get("block") or "").strip() or None,
                village=         (row.get("village") or "").strip() or None,
                cluster=         (row.get("cluster") or "").strip() or None,
                location=        (row.get("location") or "").strip() or None,
                state_mgmt=      (row.get("state_mgmt") or "").strip() or None,
                national_mgmt=   (row.get("national_mgmt") or "").strip() or None,
                school_category= (row.get("school_category") or "").strip() or None,
                school_type=     (row.get("school_type") or "").strip() or None,
                school_status=   (row.get("school_status") or "").strip() or None,
            ))

    return schools, total_rows, raw_karnataka, dropped_dupes, dropped_invalid


# ---------------------------------------------------------------------------
# Step 2 — Load GeoJSON school features
# ---------------------------------------------------------------------------
def load_geojson(path: str) -> tuple[list[OsmFeature], int]:
    """
    Returns (features, raw_feature_count).
    Filters: Point geometry, name present, amenity == 'school' when field is present,
    coordinates within India bounding box.
    """
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)

    raw_count = len(data.get("features", []))
    features: list[OsmFeature] = []

    for feat in data.get("features", []):
        geom = feat.get("geometry")
        if not geom or geom.get("type") != "Point":
            continue

        coords = geom.get("coordinates")
        if not coords or len(coords) < 2:
            continue

        lon, lat = coords[0], coords[1]
        try:
            lat = float(lat)
            lon = float(lon)
        except (TypeError, ValueError):
            continue

        # India bounding box sanity check
        if not (INDIA_LAT_MIN <= lat <= INDIA_LAT_MAX and
                INDIA_LON_MIN <= lon <= INDIA_LON_MAX):
            continue

        props = feat.get("properties") or {}
        name = (props.get("name") or "").strip()
        if not name:
            continue

        amenity = props.get("amenity")
        if amenity is not None and amenity != "school":
            continue

        osm_id_raw = props.get("osm_id")
        osm_id: Optional[int] = None
        if osm_id_raw is not None:
            try:
                osm_id = int(osm_id_raw)
            except (TypeError, ValueError):
                pass

        features.append(OsmFeature(
            osm_name=  name,
            norm_name= normalise_name(name),
            osm_id=    osm_id,
            latitude=  lat,
            longitude= lon,
        ))

    return features, raw_count


# ---------------------------------------------------------------------------
# Step 3 — Build lookup indexes
# ---------------------------------------------------------------------------
def build_indexes(features: list[OsmFeature]) -> dict[str, list[OsmFeature]]:
    """Returns by_norm_name: normalised name → list of matching features."""
    index: dict[str, list[OsmFeature]] = {}
    for f in features:
        index.setdefault(f.norm_name, []).append(f)
    return index


def features_in_bbox(
    candidates: list[OsmFeature],
    bbox: Optional[tuple[float, float, float, float]],
) -> list[OsmFeature]:
    if bbox is None:
        return []
    lat_min, lat_max, lon_min, lon_max = bbox
    return [
        c for c in candidates
        if lat_min <= c.latitude <= lat_max and lon_min <= c.longitude <= lon_max
    ]


# ---------------------------------------------------------------------------
# Step 4 — Run matching
# ---------------------------------------------------------------------------
def match_schools(
    schools: list[KaggleSchool],
    features: list[OsmFeature],
    by_norm_name: dict[str, list[OsmFeature]],
) -> tuple[list[MatchedSchool], list[KaggleSchool]]:
    from rapidfuzz import fuzz

    # Build a spatial index: list of features bucketed by district bbox.
    # For Tier 3 we need to quickly retrieve all features within a bbox.
    # We store the full feature list and filter per school — acceptable given
    # the dataset sizes (~13k OSM features, ~82k Kaggle rows).

    matched: list[MatchedSchool] = []
    unmatched: list[KaggleSchool] = []

    tier1_count = 0
    tier2_count = 0
    tier3_count = 0

    for school in schools:
        norm_name = normalise_name(school.school_name)
        norm_district = school.norm_district
        bbox = DISTRICT_BBOX.get(norm_district)
        candidates = by_norm_name.get(norm_name, [])

        # --- Tier 1: exact name + within district bbox ---
        if bbox and candidates:
            in_bbox = features_in_bbox(candidates, bbox)
            if len(in_bbox) == 1:
                matched.append(MatchedSchool(
                    school=     school,
                    feature=    in_bbox[0],
                    confidence= "high",
                    method=     "exact_name_district",
                ))
                tier1_count += 1
                continue
            # Multiple in bbox — still exact, use first (no ambiguity resolution needed)
            if len(in_bbox) > 1:
                matched.append(MatchedSchool(
                    school=     school,
                    feature=    in_bbox[0],
                    confidence= "high",
                    method=     "exact_name_district",
                ))
                tier1_count += 1
                continue

        # Tier 1b: no bbox but exactly one global exact candidate
        if not bbox and len(candidates) == 1:
            matched.append(MatchedSchool(
                school=     school,
                feature=    candidates[0],
                confidence= "high",
                method=     "exact_name_only",
            ))
            tier1_count += 1
            continue

        # --- Tier 2: exact name globally, single candidate ---
        if len(candidates) == 1:
            matched.append(MatchedSchool(
                school=     school,
                feature=    candidates[0],
                confidence= "medium",
                method=     "exact_name_only",
            ))
            tier2_count += 1
            continue

        # --- Tier 3: fuzzy within district bbox ---
        if bbox is None:
            unmatched.append(school)
            continue

        bbox_features = features_in_bbox(features, bbox)
        if not bbox_features:
            unmatched.append(school)
            continue

        best_score = 0.0
        best_feature: Optional[OsmFeature] = None
        for candidate in bbox_features:
            score = fuzz.token_sort_ratio(norm_name, candidate.norm_name)
            if score > best_score:
                best_score = score
                best_feature = candidate

        if best_score >= 88 and best_feature is not None:
            confidence = "medium" if best_score >= 93 else "low"
            matched.append(MatchedSchool(
                school=     school,
                feature=    best_feature,
                confidence= confidence,
                method=     "fuzzy_name_district",
            ))
            tier3_count += 1
        else:
            unmatched.append(school)

    return matched, unmatched, tier1_count, tier2_count, tier3_count


# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------
def _sql_str(val: Optional[str]) -> str:
    if val is None:
        return "NULL"
    return "'" + val.replace("'", "''") + "'"


def _sql_bigint(val: Optional[int]) -> str:
    return str(val) if val is not None else "NULL"


# ---------------------------------------------------------------------------
# Step 5 — Write outputs
# ---------------------------------------------------------------------------
BATCH_SIZE = 500

SQL_COLUMNS = (
    "udise_code, name, board, board_type, state, district, source, "
    "serial_no, block, village, cluster, location, state_mgmt, national_mgmt, "
    "school_category, school_type, school_status, "
    "osm_id, osm_name, latitude, longitude, match_confidence, match_method"
)


def write_sql_seed(
    path: str,
    matched: list[MatchedSchool],
    stats_header: str,
) -> None:
    with open(path, "w", encoding="utf-8") as out:
        out.write(stats_header)
        out.write("\n")

        if not matched:
            out.write("-- No matched rows to insert.\n")
            return

        batches = [matched[i:i + BATCH_SIZE] for i in range(0, len(matched), BATCH_SIZE)]
        for batch in batches:
            out.write(
                f"INSERT INTO public.schools ({SQL_COLUMNS})\nVALUES\n"
            )
            for idx, m in enumerate(batch):
                s = m.school
                f = m.feature
                separator = "," if idx < len(batch) - 1 else ""
                out.write(
                    f"    ("
                    f"{_sql_str(s.udise_code)}, "
                    f"{_sql_str(s.school_name)}, "
                    f"NULL, "                         # board — not in Kaggle source
                    f"NULL, "                         # board_type — not in Kaggle source
                    f"'Karnataka', "
                    f"{_sql_str(s.district)}, "
                    f"'KAGGLE+OSM', "
                    f"{_sql_str(s.serial_no)}, "
                    f"{_sql_str(s.block)}, "
                    f"{_sql_str(s.village)}, "
                    f"{_sql_str(s.cluster)}, "
                    f"{_sql_str(s.location)}, "
                    f"{_sql_str(s.state_mgmt)}, "
                    f"{_sql_str(s.national_mgmt)}, "
                    f"{_sql_str(s.school_category)}, "
                    f"{_sql_str(s.school_type)}, "
                    f"{_sql_str(s.school_status)}, "
                    f"{_sql_bigint(f.osm_id)}, "
                    f"{_sql_str(f.osm_name)}, "
                    f"{f.latitude:.6f}, "
                    f"{f.longitude:.6f}, "
                    f"{_sql_str(m.confidence)}, "
                    f"{_sql_str(m.method)}"
                    f"){separator}\n"
                )
            out.write(
                "ON CONFLICT (udise_code) DO UPDATE SET\n"
                "    latitude         = EXCLUDED.latitude,\n"
                "    longitude        = EXCLUDED.longitude,\n"
                "    match_confidence = EXCLUDED.match_confidence,\n"
                "    match_method     = EXCLUDED.match_method;\n\n"
            )


def write_unmatched_csv(path: str, unmatched: list[KaggleSchool]) -> None:
    fieldnames = [
        "serial_no", "udise_code", "school_name", "state", "district",
        "block", "village", "cluster", "location", "school_status",
    ]
    with open(path, "w", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=fieldnames)
        writer.writeheader()
        for s in unmatched:
            writer.writerow({
                "serial_no":   s.serial_no or "",
                "udise_code":  s.udise_code,
                "school_name": s.school_name,
                "state":       "Karnataka",
                "district":    s.district,
                "block":       s.block or "",
                "village":     s.village or "",
                "cluster":     s.cluster or "",
                "location":    s.location or "",
                "school_status": s.school_status or "",
            })


def write_matched_review_csv(path: str, matched: list[MatchedSchool]) -> None:
    fieldnames = [
        "udise_code", "school_name", "district",
        "osm_name", "osm_id", "latitude", "longitude",
        "match_confidence", "match_method",
    ]
    with open(path, "w", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=fieldnames)
        writer.writeheader()
        for m in matched:
            writer.writerow({
                "udise_code":       m.school.udise_code,
                "school_name":      m.school.school_name,
                "district":         m.school.district,
                "osm_name":         m.feature.osm_name,
                "osm_id":           m.feature.osm_id or "",
                "latitude":         f"{m.feature.latitude:.6f}",
                "longitude":        f"{m.feature.longitude:.6f}",
                "match_confidence": m.confidence,
                "match_method":     m.method,
            })


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    if len(sys.argv) != 4:
        print(
            "Usage: python scripts/prepare_schools_data.py "
            "<kaggle_csv> <geojson> <output_dir>"
        )
        sys.exit(1)

    kaggle_path  = sys.argv[1]
    geojson_path = sys.argv[2]
    output_dir   = sys.argv[3]

    for path in (kaggle_path, geojson_path):
        if not os.path.isfile(path):
            sys.exit(f"ERROR: File not found: {path}")

    os.makedirs(output_dir, exist_ok=True)

    # --- Step 1: Load Kaggle ---
    print("Loading Kaggle CSV (this may take ~30 s for 336 MB)...")
    schools, total_rows, raw_karnataka, dropped_dupes, dropped_invalid = load_kaggle(kaggle_path)
    print(f"  Kaggle rows loaded: {len(schools)}")

    # --- Step 2: Load GeoJSON ---
    print("Loading GeoJSON...")
    features, geojson_raw_count = load_geojson(geojson_path)
    print(f"  GeoJSON school features kept: {len(features)}")

    # --- Step 3+4: Build indexes and match ---
    by_norm_name = build_indexes(features)
    print("Matching schools to OSM features...")
    matched, unmatched, tier1_count, tier2_count, tier3_count = match_schools(
        schools, features, by_norm_name
    )

    # --- Step 7: Write outputs ---
    now_iso = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    stats_header = (
        f"-- Karnataka schools seed — generated by scripts/prepare_schools_data.py\n"
        f"-- Generated: {now_iso}\n"
        f"-- Source: Kaggle UDISE CSV + HDX OSM GeoJSON\n"
        f"--\n"
        f"-- Total Kaggle rows (all states):    {total_rows}\n"
        f"-- Karnataka rows extracted:          {raw_karnataka}\n"
        f"-- Duplicate UDISE rows dropped:      {dropped_dupes}\n"
        f"-- Missing name/udise dropped:        {dropped_invalid}\n"
        f"-- GeoJSON features loaded:           {geojson_raw_count}\n"
        f"--   (school features kept):          {len(features)}\n"
        f"-- Tier 1 matches (exact+district):   {tier1_count}\n"
        f"-- Tier 2 matches (exact name only):  {tier2_count}\n"
        f"-- Tier 3 matches (fuzzy):            {tier3_count}\n"
        f"-- Unmatched (no coordinate):         {len(unmatched)}\n"
        f"-- Final SQL insert row count:        {len(matched)}\n"
    )

    seed_path    = os.path.join(output_dir, "karnataka_schools_seed.sql")
    unmatch_path = os.path.join(output_dir, "karnataka_schools_unmatched.csv")
    review_path  = os.path.join(output_dir, "karnataka_schools_matched_review.csv")

    print("Writing SQL seed...")
    write_sql_seed(seed_path, matched, stats_header)

    print("Writing unmatched CSV...")
    write_unmatched_csv(unmatch_path, unmatched)

    print("Writing matched review CSV...")
    write_matched_review_csv(review_path, matched)

    # --- Step 8: Print verification summary ---
    print()
    print("=== Verification Summary ===")
    print(f"Total Kaggle rows (all states):    {total_rows}")
    print(f"Karnataka rows extracted:          {raw_karnataka}")
    print(f"Duplicate UDISE rows dropped:      {dropped_dupes}")
    print(f"Missing name/udise dropped:        {dropped_invalid}")
    print(f"GeoJSON features loaded:           {geojson_raw_count}")
    print(f"  (school features kept):          {len(features)}")
    print(f"Tier 1 matches (exact+district):   {tier1_count}")
    print(f"Tier 2 matches (exact name only):  {tier2_count}")
    print(f"Tier 3 matches (fuzzy):            {tier3_count}")
    print(f"Unmatched (no coordinate):         {len(unmatched)}")
    print(f"Final SQL insert row count:        {len(matched)}")
    print()
    print(f"Output: {seed_path}")
    print(f"Output: {unmatch_path}")
    print(f"Output: {review_path}")


if __name__ == "__main__":
    main()
