#!/usr/bin/env python3
"""
prepare_schools_data.py
=======================
Full Kaggle+OSM schools pipeline for Karnataka — Pass 1 (school POI) + Pass 2
(locality centroid fallback).

Usage
-----
    python scripts/prepare_schools_data.py \\
        scripts/data/schools/raw/kaggle_schools.csv \\
        scripts/data/schools/raw/hdx_hotosm_karnataka_schools.geojson \\
        scripts/data/schools/output/ \\
        [scripts/data/schools/raw/hdx_hotosm_karnataka_places.geojson]

The 4th argument (places GeoJSON) is optional.  If omitted the script tries to
auto-detect it alongside the schools GeoJSON.  If the file is absent, Pass 2 is
skipped with a clear warning.

Outputs (all written to <output_dir>):
    karnataka_schools_seed.sql                    — INSERT … ON CONFLICT DO UPDATE
    karnataka_schools_unmatched.csv               — rows without any coordinate match
    karnataka_schools_matched_review.csv          — Pass 1 matches for spot-checking
    karnataka_schools_place_matched_review.csv    — Pass 2 matches for spot-checking

Pipeline steps
--------------
Pass 1 — School POI matching
1. Load Kaggle CSV, filter to Karnataka, deduplicate by udise_code.
2. Load HDX/OSM GeoJSON school features.
3. Normalise names and districts.
4. Match Kaggle rows to OSM features (Tier 1 exact+district, Tier 2 exact global,
   Tier 3 fuzzy within district bounding box).

Pass 2 — Locality centroid fallback (if places GeoJSON present)
5. Load HDX/OSM GeoJSON place features (village, hamlet, town, …).
6. For each unmatched school: attempt Tier A (village exact), Tier B (block exact),
   Tier C (village fuzzy ≥ 90) within the school's district bbox.
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

# Place types accepted for Pass 2 locality centroid matching
ACCEPTED_PLACE_TYPES: frozenset[str] = frozenset({
    "village", "hamlet", "town", "suburb", "locality", "neighbourhood", "quarter",
})


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
class PlaceFeature:
    place_name: str
    norm_name: str
    place_type: str
    latitude: float
    longitude: float


@dataclass
class MatchedSchool:
    school: KaggleSchool
    feature: OsmFeature
    confidence: str            # high | medium | low
    method: str                # exact_name_district | exact_name_only | fuzzy_name_district
    coordinate_source: str     # hdx_school_poi
    coordinate_precision: str  # exact_school


@dataclass
class PlaceMatchedSchool:
    school: KaggleSchool
    place: PlaceFeature
    confidence: str            # medium | low
    method: str                # place_village_exact | place_block_exact | place_village_fuzzy
    coordinate_source: str     # hdx_place_centroid
    coordinate_precision: str  # approximate_village


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
# Step 2b — Load GeoJSON place features (Pass 2)
# ---------------------------------------------------------------------------
def load_places_geojson(path: str) -> tuple[list[PlaceFeature], int]:
    """
    Returns (place_features, raw_feature_count).
    Filters: Point geometry, name present, place in ACCEPTED_PLACE_TYPES,
    coordinates within India bounding box.
    """
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)

    raw_count = len(data.get("features", []))
    features: list[PlaceFeature] = []

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

        place_type = (props.get("place") or "").strip().lower()
        if place_type not in ACCEPTED_PLACE_TYPES:
            continue

        features.append(PlaceFeature(
            place_name= name,
            norm_name=  normalise_name(name),
            place_type= place_type,
            latitude=   lat,
            longitude=  lon,
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


def build_place_district_index(
    places: list[PlaceFeature],
) -> dict[str, list[PlaceFeature]]:
    """
    Bucket place features by district.  Each place is added to every district
    whose bounding box contains it.  For Karnataka the bboxes don't overlap
    significantly so most places land in exactly one bucket.
    """
    index: dict[str, list[PlaceFeature]] = {d: [] for d in DISTRICT_BBOX}
    for p in places:
        for district, (lat_min, lat_max, lon_min, lon_max) in DISTRICT_BBOX.items():
            if lat_min <= p.latitude <= lat_max and lon_min <= p.longitude <= lon_max:
                index[district].append(p)
    return index


# ---------------------------------------------------------------------------
# Step 4 — Run Pass 1 matching (school POI)
# ---------------------------------------------------------------------------
def match_schools(
    schools: list[KaggleSchool],
    features: list[OsmFeature],
    by_norm_name: dict[str, list[OsmFeature]],
) -> tuple[list[MatchedSchool], list[KaggleSchool], int, int, int]:
    from rapidfuzz import fuzz

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
            if len(in_bbox) >= 1:
                matched.append(MatchedSchool(
                    school=              school,
                    feature=             in_bbox[0],
                    confidence=          "high",
                    method=              "exact_name_district",
                    coordinate_source=   "hdx_school_poi",
                    coordinate_precision="exact_school",
                ))
                tier1_count += 1
                continue

        # Tier 1b: no bbox but exactly one global exact candidate
        if not bbox and len(candidates) == 1:
            matched.append(MatchedSchool(
                school=              school,
                feature=             candidates[0],
                confidence=          "high",
                method=              "exact_name_only",
                coordinate_source=   "hdx_school_poi",
                coordinate_precision="exact_school",
            ))
            tier1_count += 1
            continue

        # --- Tier 2: exact name globally, single candidate ---
        if len(candidates) == 1:
            matched.append(MatchedSchool(
                school=              school,
                feature=             candidates[0],
                confidence=          "medium",
                method=              "exact_name_only",
                coordinate_source=   "hdx_school_poi",
                coordinate_precision="exact_school",
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
                school=              school,
                feature=             best_feature,
                confidence=          confidence,
                method=              "fuzzy_name_district",
                coordinate_source=   "hdx_school_poi",
                coordinate_precision="exact_school",
            ))
            tier3_count += 1
        else:
            unmatched.append(school)

    return matched, unmatched, tier1_count, tier2_count, tier3_count


# ---------------------------------------------------------------------------
# Step 4b — Run Pass 2 matching (locality centroid fallback)
# ---------------------------------------------------------------------------
def match_schools_pass2(
    unmatched: list[KaggleSchool],
    place_district_index: dict[str, list[PlaceFeature]],
) -> tuple[list[PlaceMatchedSchool], list[KaggleSchool], int, int, int]:
    """
    Tier A: village exact (normalised) within district bbox → confidence=medium
    Tier B: block exact (normalised) within district bbox   → confidence=low
    Tier C: village fuzzy token_sort_ratio >= 90 within bbox → confidence=low
    """
    from rapidfuzz import fuzz

    pass2_matched: list[PlaceMatchedSchool] = []
    still_unmatched: list[KaggleSchool] = []

    tier_a_count = 0
    tier_b_count = 0
    tier_c_count = 0

    for school in unmatched:
        norm_district = school.norm_district
        candidates = place_district_index.get(norm_district, [])

        # Prefer village, fall back to block as the locality query
        village_raw = school.village or ""
        block_raw = school.block or ""
        norm_village = normalise_name(village_raw) if village_raw else ""
        norm_block = normalise_name(block_raw) if block_raw else ""

        matched_place: Optional[PlaceFeature] = None
        confidence = ""
        method = ""

        # --- Tier A: village exact ---
        if norm_village:
            for p in candidates:
                if p.norm_name == norm_village:
                    matched_place = p
                    confidence = "medium"
                    method = "place_village_exact"
                    break

        # --- Tier B: block exact ---
        if matched_place is None and norm_block:
            for p in candidates:
                if p.norm_name == norm_block:
                    matched_place = p
                    confidence = "low"
                    method = "place_block_exact"
                    break

        # --- Tier C: village fuzzy >= 90 ---
        if matched_place is None and norm_village:
            best_score = 0.0
            best_place: Optional[PlaceFeature] = None
            for p in candidates:
                score = fuzz.token_sort_ratio(norm_village, p.norm_name)
                if score > best_score:
                    best_score = score
                    best_place = p
            if best_score >= 90 and best_place is not None:
                matched_place = best_place
                confidence = "low"
                method = "place_village_fuzzy"

        if matched_place is not None:
            if method == "place_village_exact":
                tier_a_count += 1
            elif method == "place_block_exact":
                tier_b_count += 1
            else:
                tier_c_count += 1

            pass2_matched.append(PlaceMatchedSchool(
                school=              school,
                place=               matched_place,
                confidence=          confidence,
                method=              method,
                coordinate_source=   "hdx_place_centroid",
                coordinate_precision="approximate_village",
            ))
        else:
            still_unmatched.append(school)

    return pass2_matched, still_unmatched, tier_a_count, tier_b_count, tier_c_count


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
    "osm_id, osm_name, latitude, longitude, match_confidence, match_method, "
    "coordinate_source, coordinate_precision"
)


def _write_sql_batch(
    out,
    batch_items: list,
    is_pass1: bool,
) -> None:
    """
    Write one INSERT … VALUES … ON CONFLICT batch.

    batch_items is a list of MatchedSchool (Pass 1) or PlaceMatchedSchool (Pass 2).
    """
    out.write(f"INSERT INTO public.schools ({SQL_COLUMNS})\nVALUES\n")
    for idx, m in enumerate(batch_items):
        s = m.school
        separator = "," if idx < len(batch_items) - 1 else ""

        if is_pass1:
            f = m.feature
            lat = f.latitude
            lon = f.longitude
            osm_id_sql = _sql_bigint(f.osm_id)
            osm_name_sql = _sql_str(f.osm_name)
        else:
            p = m.place
            lat = p.latitude
            lon = p.longitude
            osm_id_sql = "NULL"
            osm_name_sql = "NULL"

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
            f"{osm_id_sql}, "
            f"{osm_name_sql}, "
            f"{lat:.6f}, "
            f"{lon:.6f}, "
            f"{_sql_str(m.confidence)}, "
            f"{_sql_str(m.method)}, "
            f"{_sql_str(m.coordinate_source)}, "
            f"{_sql_str(m.coordinate_precision)}"
            f"){separator}\n"
        )
    out.write(
        "ON CONFLICT (udise_code) DO UPDATE SET\n"
        "    latitude             = EXCLUDED.latitude,\n"
        "    longitude            = EXCLUDED.longitude,\n"
        "    osm_id               = EXCLUDED.osm_id,\n"
        "    osm_name             = EXCLUDED.osm_name,\n"
        "    match_confidence     = EXCLUDED.match_confidence,\n"
        "    match_method         = EXCLUDED.match_method,\n"
        "    coordinate_source    = EXCLUDED.coordinate_source,\n"
        "    coordinate_precision = EXCLUDED.coordinate_precision;\n\n"
    )


def write_sql_seed(
    path: str,
    pass1_matched: list[MatchedSchool],
    pass2_matched: list[PlaceMatchedSchool],
    stats_header: str,
) -> None:
    with open(path, "w", encoding="utf-8") as out:
        out.write(stats_header)
        out.write("\n")

        total_matched = len(pass1_matched) + len(pass2_matched)
        if total_matched == 0:
            out.write("-- No matched rows to insert.\n")
            return

        # Pass 1 batches
        if pass1_matched:
            out.write("-- Pass 1: School POI matches\n")
            batches = [
                pass1_matched[i:i + BATCH_SIZE]
                for i in range(0, len(pass1_matched), BATCH_SIZE)
            ]
            for batch in batches:
                _write_sql_batch(out, batch, is_pass1=True)

        # Pass 2 batches
        if pass2_matched:
            out.write("-- Pass 2: Locality centroid fallback matches\n")
            batches = [
                pass2_matched[i:i + BATCH_SIZE]
                for i in range(0, len(pass2_matched), BATCH_SIZE)
            ]
            for batch in batches:
                _write_sql_batch(out, batch, is_pass1=False)


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


def write_place_matched_review_csv(
    path: str,
    matched: list[PlaceMatchedSchool],
) -> None:
    fieldnames = [
        "udise_code", "school_name", "district", "village", "block",
        "place_name", "place_type", "latitude", "longitude",
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
                "village":          m.school.village or "",
                "block":            m.school.block or "",
                "place_name":       m.place.place_name,
                "place_type":       m.place.place_type,
                "latitude":         f"{m.place.latitude:.6f}",
                "longitude":        f"{m.place.longitude:.6f}",
                "match_confidence": m.confidence,
                "match_method":     m.method,
            })


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    if len(sys.argv) < 4 or len(sys.argv) > 5:
        print(
            "Usage: python scripts/prepare_schools_data.py "
            "<kaggle_csv> <schools_geojson> <output_dir> [places_geojson]"
        )
        sys.exit(1)

    kaggle_path   = sys.argv[1]
    geojson_path  = sys.argv[2]
    output_dir    = sys.argv[3]

    # Determine places GeoJSON path — explicit 4th arg or auto-detect
    if len(sys.argv) == 5:
        places_path: Optional[str] = sys.argv[4]
    else:
        # Auto-detect alongside the schools GeoJSON
        candidate = os.path.join(
            os.path.dirname(geojson_path),
            "hdx_hotosm_karnataka_places.geojson",
        )
        places_path = candidate if os.path.isfile(candidate) else None

    for path in (kaggle_path, geojson_path):
        if not os.path.isfile(path):
            sys.exit(f"ERROR: File not found: {path}")

    os.makedirs(output_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # Pass 1 — School POI matching
    # ------------------------------------------------------------------
    print("Loading Kaggle CSV (this may take ~30 s for 336 MB)...")
    schools, total_rows, raw_karnataka, dropped_dupes, dropped_invalid = load_kaggle(kaggle_path)
    print(f"  Kaggle rows loaded: {len(schools)}")

    print("Loading GeoJSON school features...")
    features, geojson_raw_count = load_geojson(geojson_path)
    print(f"  GeoJSON school features kept: {len(features)}")

    by_norm_name = build_indexes(features)
    print("Pass 1: matching schools to OSM school features...")
    pass1_matched, unmatched_after_p1, tier1_count, tier2_count, tier3_count = match_schools(
        schools, features, by_norm_name
    )
    print(f"  Pass 1 matched: {len(pass1_matched)}")

    # ------------------------------------------------------------------
    # Pass 2 — Locality centroid fallback
    # ------------------------------------------------------------------
    pass2_matched: list[PlaceMatchedSchool] = []
    tier_a_count = tier_b_count = tier_c_count = 0
    places_loaded = 0
    pass2_status_line = "SKIPPED — file not found"

    if places_path is None or not os.path.isfile(places_path):
        print()
        print(
            "[Phase 2] hdx_hotosm_karnataka_places.geojson not found — skipping locality "
            "fallback. Download from HDX and re-run for improved coverage."
        )
        still_unmatched = unmatched_after_p1
    else:
        print(f"Loading OSM place features from {places_path}...")
        places, places_raw_count = load_places_geojson(places_path)
        places_loaded = len(places)
        places_status_line = str(places_loaded)
        print(f"  Place features kept: {places_loaded} (from {places_raw_count} raw)")

        place_district_index = build_place_district_index(places)
        print("Pass 2: locality centroid fallback for unmatched schools...")
        pass2_matched, still_unmatched, tier_a_count, tier_b_count, tier_c_count = (
            match_schools_pass2(unmatched_after_p1, place_district_index)
        )
        pass2_status_line = str(places_loaded)
        print(f"  Pass 2 matched: {len(pass2_matched)}")

    # ------------------------------------------------------------------
    # Write outputs
    # ------------------------------------------------------------------
    total_matched = len(pass1_matched) + len(pass2_matched)

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
        f"--\n"
        f"-- === Pass 1: School POI matching ===\n"
        f"-- GeoJSON school features loaded:    {geojson_raw_count}\n"
        f"--   (school features kept):          {len(features)}\n"
        f"-- Tier 1 matches (exact+district):   {tier1_count}\n"
        f"-- Tier 2 matches (exact name only):  {tier2_count}\n"
        f"-- Tier 3 matches (fuzzy school):     {tier3_count}\n"
        f"-- Pass 1 matched:                    {len(pass1_matched)}\n"
        f"--\n"
        f"-- === Pass 2: Locality centroid fallback ===\n"
        f"-- OSM place features loaded:         {pass2_status_line}\n"
        f"-- Tier A matches (village exact):    {tier_a_count}\n"
        f"-- Tier B matches (block exact):      {tier_b_count}\n"
        f"-- Tier C matches (village fuzzy):    {tier_c_count}\n"
        f"-- Pass 2 matched:                    {len(pass2_matched)}\n"
        f"--\n"
        f"-- === Total ===\n"
        f"-- Total usable rows (Pass 1 + 2):    {total_matched}\n"
        f"-- Still unmatched:                   {len(still_unmatched)}\n"
        f"-- Final SQL insert row count:        {total_matched}\n"
    )

    seed_path         = os.path.join(output_dir, "karnataka_schools_seed.sql")
    unmatch_path      = os.path.join(output_dir, "karnataka_schools_unmatched.csv")
    review_path       = os.path.join(output_dir, "karnataka_schools_matched_review.csv")
    place_review_path = os.path.join(output_dir, "karnataka_schools_place_matched_review.csv")

    print("Writing SQL seed...")
    write_sql_seed(seed_path, pass1_matched, pass2_matched, stats_header)

    print("Writing unmatched CSV...")
    write_unmatched_csv(unmatch_path, still_unmatched)

    print("Writing Pass 1 matched review CSV...")
    write_matched_review_csv(review_path, pass1_matched)

    print("Writing Pass 2 place-matched review CSV...")
    write_place_matched_review_csv(place_review_path, pass2_matched)

    # ------------------------------------------------------------------
    # Verification summary
    # ------------------------------------------------------------------
    print()
    print("=== Pass 1: School POI matching ===")
    print(f"GeoJSON school features loaded:    {geojson_raw_count}")
    print(f"  (school features kept):          {len(features)}")
    print(f"Tier 1 matches (exact+district):   {tier1_count}")
    print(f"Tier 2 matches (exact name only):  {tier2_count}")
    print(f"Tier 3 matches (fuzzy school):     {tier3_count}")
    print(f"Pass 1 matched:                    {len(pass1_matched)}")
    print()
    print("=== Pass 2: Locality centroid fallback ===")
    print(f"OSM place features loaded:         {pass2_status_line}")
    print(f"Tier A matches (village exact):    {tier_a_count}")
    print(f"Tier B matches (block exact):      {tier_b_count}")
    print(f"Tier C matches (village fuzzy):    {tier_c_count}")
    print(f"Pass 2 matched:                    {len(pass2_matched)}")
    print()
    print("=== Total ===")
    print(f"Total usable rows (Pass 1 + 2):    {total_matched}")
    print(f"Still unmatched:                   {len(still_unmatched)}")
    print(f"Final SQL insert row count:        {total_matched}")
    print()
    print(f"Output: {seed_path}")
    print(f"Output: {unmatch_path}")
    print(f"Output: {review_path}")
    print(f"Output: {place_review_path}")


if __name__ == "__main__":
    main()
