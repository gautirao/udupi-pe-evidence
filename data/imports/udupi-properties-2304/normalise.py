#!/usr/bin/env python3
"""Issue #2304 Slice 1 normalisation pipeline: raw Apify output -> normalised listings + reports."""
import json
import re
from collections import Counter, defaultdict

RAW_PATH = "/Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer/data/imports/udupi-properties-2304/raw-apify-output.json"
OUT_DIR = "/Users/gouthamrao/Documents/workspaces/lovable/udupi-property-explorer/data/imports/udupi-properties-2304"

IMPORT_ISSUE = 2304

# Existing canonical Udupi areas (V71), city_slug='udupi'
EXISTING_AREAS = [
    ("IN|KA|Udupi|Manipal", "Manipal", 13.3400, 74.7800, 13.3700, 74.8200),
    ("IN|KA|Udupi|Kunjibettu", "Kunjibettu", 13.3200, 74.7300, 13.3500, 74.7600),
    ("IN|KA|Udupi|Amoghapura", "Amoghapura", 13.3200, 74.7200, 13.3500, 74.7500),
    ("IN|KA|Udupi|Katapadi", "Katapadi", 13.3400, 74.7600, 13.3700, 74.8000),
    ("IN|KA|Udupi|Malpe", "Malpe", 13.3400, 74.6900, 13.3700, 74.7200),
    ("IN|KA|Udupi|Saligrama", "Saligrama", 13.3000, 74.7700, 13.3300, 74.8000),
    ("IN|KA|Udupi|Brahmavar", "Brahmavar", 13.4100, 74.7400, 13.4500, 74.7700),
    ("IN|KA|Udupi|Padubidri", "Padubidri", 13.1700, 74.7700, 13.2000, 74.8000),
    ("IN|KA|Udupi|Udupi", "Udupi", 13.3200, 74.7200, 13.3700, 74.7700),
    ("IN|KA|Udupi|Hejamadi", "Hejamadi", 13.1600, 74.8000, 13.1800, 74.8300),
    ("IN|KA|Udupi|Shirva", "Shirva", 13.1900, 74.7700, 13.2200, 74.8000),
    ("IN|KA|Udupi|Kaup", "Kaup", 13.2100, 74.7300, 13.2300, 74.7700),
]

# New areas backed by real OSM Nominatim evidence (coords consistent with actual listing coordinates)
NEW_AREAS = [
    # area_key, name, osm_lat, osm_lon, buffer_deg
    ("IN|KA|Udupi|Santhekatte", "Santhekatte", 13.3876323, 74.7389702, 0.012),
    ("IN|KA|Udupi|Brahmagiri", "Brahmagiri", 13.3412188, 74.7407976, 0.015),
    ("IN|KA|Udupi|Kinnimulki", "Kinnimulki", 13.3234807, 74.7388074, 0.012),
    ("IN|KA|Udupi|Kuthpady", "Kuthpady", 13.3203168, 74.7270290, 0.012),
    ("IN|KA|Udupi|Ambagilu", "Ambagilu", 13.3710379, 74.7464615, 0.012),
    ("IN|KA|Udupi|Adi-Udupi", "Adi-Udupi", 13.3477889, 74.7312050, 0.012),
]

# Locality string -> canonical area_key, either an existing area (alias) or a new area defined above.
LOCALITY_ALIASES = {
    "Manipal": "IN|KA|Udupi|Manipal",
    "Kunjibettu": "IN|KA|Udupi|Kunjibettu",
    "Katapady": "IN|KA|Udupi|Katapadi",
    "Brahmavar": "IN|KA|Udupi|Brahmavar",
    "Padubidri": "IN|KA|Udupi|Padubidri",
    "Shirva": "IN|KA|Udupi|Shirva",
    "Kapu": "IN|KA|Udupi|Kaup",
    "Udupi": "IN|KA|Udupi|Udupi",
    "Santhekatte": "IN|KA|Udupi|Santhekatte",
    "Brahmagiri": "IN|KA|Udupi|Brahmagiri",
    "Kinnimulki": "IN|KA|Udupi|Kinnimulki",
    "Kuthpady": "IN|KA|Udupi|Kuthpady",
    "Ambagilu": "IN|KA|Udupi|Ambagilu",
    "Adi-udupi": "IN|KA|Udupi|Adi-Udupi",
    # Per-locality-name aliasing verified by listing-coordinate containment inside an existing area bbox
    # (see area-mapping-report.md for the containment check).
    "Ambalpadi": "IN|KA|Udupi|Kunjibettu",
    "Chitpady": "IN|KA|Udupi|Kunjibettu",
    "Eshwar Nagar": "IN|KA|Udupi|Manipal",
    "Vidyaratna Nagar": "IN|KA|Udupi|Manipal",
    "Nittur": "IN|KA|Udupi|Udupi",
}

# Localities that failed OSM verification (Nominatim result geographically contradicts the real
# listing coordinates by many km -> most likely a same-named place elsewhere in Udupi district) or
# that could not be found in OSM at all and do not fall inside any existing area bbox either.
UNRESOLVED_LOCALITIES = {
    "Kukkikatte": "OSM match (13.3896,74.8268) is ~7km from actual listing coordinates (~13.323,74.769) - likely a different same-named place; no reliable evidence.",
    "Santhosh Nagara": "OSM match resolves to Hemmady/Kundapura taluk (~30km north) - name collision, not the Udupi-city locality implied by the listing.",
    "Doddanagudde": "OSM match (13.3727,74.8287) is ~8km from actual listing coordinate (13.3567,74.7531) - likely a different same-named place.",
    "Bailoor": "OSM match resolves to Kundapura taluk (~35km north) - name collision.",
    "Badanidiyoor": "No OSM match found; listing coordinate (13.384,74.719) falls outside every existing area bbox by ~1-1.5km on both axes - insufficient evidence to place it.",
    "Dasharath Nagar": "No OSM match found; listing coordinates fall just outside the Manipal bbox (~300-400m) - too close to call reliably without OSM confirmation.",
    "Tenkanidyoor": None,  # resolved per-listing below (majority Udupi, one Malpe) - kept, not unresolved
    "Maruthi Veethika": None,  # resolved per-listing below (Katapadi/Udupi split) - kept, not unresolved
    "Hayagriva Nagar": None,  # resolved per-listing below (mostly Katapadi); 1 of 3 falls outside every bbox
    "Udyavara": "OSM match found but its bounding box (~13.20-13.35 lat, 74.69-74.94 lon) is taluk-scale, too coarse to serve as area boundary evidence; the 2 real listing coordinates (13.310-13.318, 74.736) do not fall inside any existing area bbox either.",
}

# Out-of-scope: real places, but a different city/taluk entirely (not part of city_slug='udupi').
OUT_OF_SCOPE_LOCALITIES = {
    "Karkala": "Separate town/taluk ~25km SE of Udupi city; not modelled as any existing app city; coordinates also fail the Udupi coordinate envelope (lon > 74.95).",
    "Kundapura": "Existing area IN|KA|Udupi|Kundapura already exists but belongs to city_slug='kundapur' (a different Discover city), not city_slug='udupi'. Out of scope for this import.",
    "Belman": "~20km SE of Udupi city, same general area as Karkala; no existing city mapping.",
}

# property configuration type (Housing.com) -> (property_type, listing_family) on CURRENT schema enums
# (chk_listing_property_type as of V103; chk_listing_listing_family as of V102)
TYPE_MAP = {
    "Apartment": ("apartment", "RESIDENTIAL"),
    "Villa": ("villa", "RESIDENTIAL"),
    "Independent House": ("house", "RESIDENTIAL"),
    "Plot": ("residential_plot", "RESIDENTIAL"),
}
# Ambiguous Housing.com types with no clean single-value match on the current enum -> excluded, never guessed.
AMBIGUOUS_TYPES = {"Duplex", "Farm House", "Independent Floor", "Studio", "Penthouse"}

ENVELOPE = {"min_lat": 13.0, "max_lat": 13.5, "min_lon": 74.6, "max_lon": 74.95}


def area_bbox(area_key):
    for k, name, minlat, minlon, maxlat, maxlon in EXISTING_AREAS:
        if k == area_key:
            return minlat, minlon, maxlat, maxlon
    for k, name, lat, lon, buf in NEW_AREAS:
        if k == area_key:
            return lat - buf, lon - buf, lat + buf, lon + buf
    return None


def resolve_area(locality, lat, lon):
    """Returns (area_key, area_label, reason) or (None, None, reason) if unresolved/out-of-scope."""
    if locality in OUT_OF_SCOPE_LOCALITIES:
        return None, None, f"out_of_scope: {OUT_OF_SCOPE_LOCALITIES[locality]}"
    if locality in LOCALITY_ALIASES:
        key = LOCALITY_ALIASES[locality]
        name = key.rsplit("|", 1)[-1]
        return key, name, "alias"
    if locality in UNRESOLVED_LOCALITIES and UNRESOLVED_LOCALITIES[locality] is not None:
        return None, None, f"unresolved: {UNRESOLVED_LOCALITIES[locality]}"
    # Per-listing containment: does this exact coordinate fall inside an existing area bbox?
    for k, name, minlat, minlon, maxlat, maxlon in EXISTING_AREAS:
        if minlat <= lat <= maxlat and minlon <= lon <= maxlon:
            return k, name, f"per_listing_containment_in_{name}"
    return None, None, "unresolved: locality not in OSM, not aliased, and coordinate falls outside every existing area bbox"


def main():
    with open(RAW_PATH) as f:
        raw = json.load(f)

    resale = [d for d in raw if d.get("propertyType") == "resale"]
    excluded_project = len(raw) - len(resale)

    stats = Counter()
    stats["raw_total"] = len(raw)
    stats["excluded_project_rows"] = excluded_project
    stats["resale_total"] = len(resale)

    coord_exclusions = []
    type_exclusions = []
    area_exclusions = []
    duplicate_coord_exclusions = []

    # Pass 1: coordinate validation (0,0 / envelope / swap)
    candidates = []
    for d in resale:
        lat, lon = d.get("latitude"), d.get("longitude")
        listing_id = d.get("id")
        if lat is None or lon is None:
            coord_exclusions.append((listing_id, "missing_coordinates"))
            continue
        if lat == 0 and lon == 0:
            coord_exclusions.append((listing_id, "zero_zero"))
            continue
        if not (ENVELOPE["min_lat"] <= lat <= ENVELOPE["max_lat"] and ENVELOPE["min_lon"] <= lon <= ENVELOPE["max_lon"]):
            # check for a lat/lon swap that would actually fall in envelope
            if ENVELOPE["min_lat"] <= lon <= ENVELOPE["max_lat"] and ENVELOPE["min_lon"] <= lat <= ENVELOPE["max_lon"]:
                coord_exclusions.append((listing_id, f"lat_lon_swap_suspected({lat},{lon})"))
            else:
                coord_exclusions.append((listing_id, f"out_of_envelope({lat},{lon})"))
            continue
        candidates.append(d)

    # Pass 2: exact-coordinate cluster check (>5 listings sharing one exact coord, not same building)
    coord_groups = defaultdict(list)
    for d in candidates:
        coord_groups[(round(d["latitude"], 6), round(d["longitude"], 6))].append(d)
    filtered = []
    for coord, group in coord_groups.items():
        if len(group) > 5:
            titles = {g.get("title") for g in group}
            addrs = {g.get("address") for g in group}
            if len(titles) > 2 or len(addrs) > 2:
                for g in group:
                    duplicate_coord_exclusions.append((g.get("id"), f"shared_coord_cluster_{len(group)}_dissimilar"))
                continue
        filtered.append((coord, group))

    # Pass 3: property type mapping (drop ambiguous), area mapping (drop unresolved/out-of-scope)
    normalised = []
    area_counts = Counter()
    unresolved_counts = Counter()

    for coord, group in filtered:
        for d in group:
            configs = d.get("configurations") or []
            cfg_type = configs[0].get("propertyType") if configs else None
            if cfg_type in AMBIGUOUS_TYPES or cfg_type is None:
                type_exclusions.append((d.get("id"), cfg_type or "no_configuration"))
                continue
            if cfg_type not in TYPE_MAP:
                type_exclusions.append((d.get("id"), f"unmapped_type:{cfg_type}"))
                continue
            property_type, listing_family = TYPE_MAP[cfg_type]

            locality = d.get("locality")
            area_key, area_label, reason = resolve_area(locality, d["latitude"], d["longitude"])
            if area_key is None:
                area_exclusions.append((d.get("id"), locality, reason))
                unresolved_counts[locality] += 1
                continue
            area_counts[(locality, area_key)] += 1

            price = d.get("price") or {}
            price_value = price.get("min")
            if price_value is None or price_value <= 0:
                coord_exclusions.append((d.get("id"), "missing_or_nonpositive_price"))
                continue

            bedrooms = d.get("bedrooms")
            area_val = d.get("builtUpArea") or d.get("area")
            area_unit = "sqft" if (d.get("builtUpAreaUnit") or d.get("areaUnit") or "").lower() in ("sq.ft", "sqft") else None

            normalised.append({
                "housingListingId": d.get("id"),
                "property_type": property_type,
                "listing_family": listing_family,
                "area_key": area_key,
                "area_label": area_label,
                "locality": locality,
                "latitude": d["latitude"],
                "longitude": d["longitude"],
                "price": int(price_value),
                "price_paise": int(price_value) * 100,
                "bedrooms": bedrooms,
                "bathrooms": d.get("bathrooms"),
                "built_area": area_val,
                "built_area_unit": area_unit,
                "land_area": area_val if property_type == "residential_plot" else None,
                "land_area_unit": area_unit if property_type == "residential_plot" else None,
                "listing_purpose": "sale" if d.get("transactionType") == "buy" else "rent",
                "facing": d.get("facing"),
                "property_age": d.get("ageOfProperty"),
                "title": d.get("title"),
                "photoUrls": d.get("images") or [],
                "coverImageUrl": d.get("coverImageUrl"),
            })

    stats["excluded_coord_invalid"] = len(coord_exclusions)
    stats["excluded_duplicate_coord_cluster"] = len(duplicate_coord_exclusions)
    stats["excluded_ambiguous_type"] = len(type_exclusions)
    stats["excluded_area_unresolved_or_oos"] = len(area_exclusions)
    stats["final_normalised_count"] = len(normalised)

    with open(f"{OUT_DIR}/normalised-listings.json", "w") as f:
        json.dump(normalised, f, indent=2)

    # area-bbox-evidence.json
    evidence = {
        "new_areas_osm_evidence": [
            {"area_key": k, "name": n, "osm_lat": lat, "osm_lon": lon, "buffer_deg": buf,
             "bbox": {"min_lat": lat - buf, "min_lon": lon - buf, "max_lat": lat + buf, "max_lon": lon + buf}}
            for k, n, lat, lon, buf in NEW_AREAS
        ],
        "source": "OpenStreetMap Nominatim (nominatim.openstreetmap.org/search), single lookups, structured query 'q=<locality>, Udupi, Karnataka, India'",
    }
    with open(f"{OUT_DIR}/area-bbox-evidence.json", "w") as f:
        json.dump(evidence, f, indent=2)

    # coordinate-quality-report.md
    coord_reasons = Counter(r for _, r in coord_exclusions)
    dup_reasons = Counter(r for _, r in duplicate_coord_exclusions)
    with open(f"{OUT_DIR}/coordinate-quality-report.md", "w") as f:
        f.write("# Coordinate Quality Report - Issue #2304 Slice 1\n\n")
        f.write(f"Raw dataset items: {stats['raw_total']} (project-type builder listings excluded: {stats['excluded_project_rows']})\n\n")
        f.write(f"Resale (individual) listings examined: {stats['resale_total']}\n\n")
        f.write("## Coordinate validation exclusions\n\n")
        f.write(f"Total excluded for coordinate/price reasons: {stats['excluded_coord_invalid']}\n\n")
        for reason, count in coord_reasons.most_common():
            f.write(f"- {reason}: {count}\n")
        f.write("\n## Shared-exact-coordinate cluster exclusions (>5 listings, dissimilar title/address)\n\n")
        f.write(f"Total excluded: {stats['excluded_duplicate_coord_cluster']}\n\n")
        for reason, count in dup_reasons.most_common():
            f.write(f"- {reason}: {count}\n")
        f.write(f"\nEnvelope used: lat [{ENVELOPE['min_lat']}, {ENVELOPE['max_lat']}], lon [{ENVELOPE['min_lon']}, {ENVELOPE['max_lon']}]\n")
        f.write("No geocoding fallback was used for any listing point; coordinates are exactly as scraped from Housing.com's own JSON-LD/API geo fields.\n")

    # area-mapping-report.md
    with open(f"{OUT_DIR}/area-mapping-report.md", "w") as f:
        f.write("# Area Mapping Report - Issue #2304 Slice 1\n\n")
        f.write("## Source locality -> canonical area -> count\n\n")
        f.write("| Source locality | Canonical area_key | Count |\n|---|---|---|\n")
        for (locality, area_key), count in sorted(area_counts.items(), key=lambda x: -x[1]):
            f.write(f"| {locality} | {area_key} | {count} |\n")
        f.write("\n## New areas added (OSM Nominatim evidence-backed)\n\n")
        for k, n, lat, lon, buf in NEW_AREAS:
            f.write(f"- `{k}` ({n}): OSM center ({lat}, {lon}), bbox buffer {buf} deg\n")
        f.write("\n## Out-of-scope localities (excluded - different city/taluk)\n\n")
        for loc, reason in OUT_OF_SCOPE_LOCALITIES.items():
            f.write(f"- {loc}: {reason}\n")
        f.write("\n## Unresolved localities (excluded - insufficient evidence)\n\n")
        for locality, count in unresolved_counts.items():
            reason = UNRESOLVED_LOCALITIES.get(locality, "coordinate outside every existing area bbox, no OSM match")
            f.write(f"- {locality} ({count} listing(s)): {reason}\n")
        f.write("\n## Excluded rows by reason\n\n")
        f.write(f"- Builder 'project' rows (multi-unit price/area ranges, not single real listings): {stats['excluded_project_rows']}\n")
        f.write(f"- Ambiguous property-type mapping (Duplex/Farm House/Independent Floor/Studio/Penthouse - no clean single-value schema match): {stats['excluded_ambiguous_type']}\n")
        f.write(f"- Coordinate validation: {stats['excluded_coord_invalid']}\n")
        f.write(f"- Shared-coordinate cluster (dissimilar building): {stats['excluded_duplicate_coord_cluster']}\n")
        f.write(f"- Area unresolved/out-of-scope: {stats['excluded_area_unresolved_or_oos']}\n")
        f.write(f"\n## Final normalised (importable) count: {stats['final_normalised_count']}\n")

    print(json.dumps(stats, indent=2))
    print("\nType exclusions:", Counter(r for _, r in type_exclusions))
    print("\nArea exclusion detail:", area_exclusions)


if __name__ == "__main__":
    main()
