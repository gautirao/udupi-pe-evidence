#!/usr/bin/env python3
"""Issue #2304 Slice 1 (expanded): merge Housing.com (already normalised) + 99acres
(buy/rent/commercial), apply source-specific coordinate trust + type mapping, cross-source
dedup, and emit the final combined normalised-listings.json + reports."""
import json
import os
import re
from collections import Counter, defaultdict

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
IMPORT_ISSUE = 2304

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
    ("IN|KA|Udupi|Santhekatte", "Santhekatte", 13.3876323 - 0.012, 74.7389702 - 0.012, 13.3876323 + 0.012, 74.7389702 + 0.012),
    ("IN|KA|Udupi|Brahmagiri", "Brahmagiri", 13.3412188 - 0.015, 74.7407976 - 0.015, 13.3412188 + 0.015, 74.7407976 + 0.015),
    ("IN|KA|Udupi|Kinnimulki", "Kinnimulki", 13.3234807 - 0.012, 74.7388074 - 0.012, 13.3234807 + 0.012, 74.7388074 + 0.012),
    ("IN|KA|Udupi|Kuthpady", "Kuthpady", 13.3203168 - 0.012, 74.7270290 - 0.012, 13.3203168 + 0.012, 74.7270290 + 0.012),
    ("IN|KA|Udupi|Ambagilu", "Ambagilu", 13.3710379 - 0.012, 74.7464615 - 0.012, 13.3710379 + 0.012, 74.7464615 + 0.012),
    ("IN|KA|Udupi|Adi-Udupi", "Adi-Udupi", 13.3477889 - 0.012, 74.7312050 - 0.012, 13.3477889 + 0.012, 74.7312050 + 0.012),
]

LOCALITY_ALIASES = {
    "Manipal": "IN|KA|Udupi|Manipal",
    "Kunjibettu": "IN|KA|Udupi|Kunjibettu",
    "Katapady": "IN|KA|Udupi|Katapadi",
    "Katapadi": "IN|KA|Udupi|Katapadi",
    "Brahmavar": "IN|KA|Udupi|Brahmavar",
    "Padubidri": "IN|KA|Udupi|Padubidri",
    "Shirva": "IN|KA|Udupi|Shirva",
    "Kapu": "IN|KA|Udupi|Kaup",
    "Kaup": "IN|KA|Udupi|Kaup",
    "Udupi": "IN|KA|Udupi|Udupi",
    "Santhekatte": "IN|KA|Udupi|Santhekatte",
    "Brahmagiri": "IN|KA|Udupi|Brahmagiri",
    "Kinnimulki": "IN|KA|Udupi|Kinnimulki",
    "Kuthpady": "IN|KA|Udupi|Kuthpady",
    "Ambagilu": "IN|KA|Udupi|Ambagilu",
    "Adi-udupi": "IN|KA|Udupi|Adi-Udupi",
    "Ambalpadi": "IN|KA|Udupi|Kunjibettu",
    "Chitpady": "IN|KA|Udupi|Kunjibettu",
    "Eshwar Nagar": "IN|KA|Udupi|Manipal",
    "Vidyaratna Nagar": "IN|KA|Udupi|Manipal",
    "Nittur": "IN|KA|Udupi|Udupi",
    "Hejamadi": "IN|KA|Udupi|Hejamadi",
}

OUT_OF_SCOPE_LOCALITIES = {
    "Karkala": "Separate town/taluk ~25km SE of Udupi city; no existing city mapping; also fails coordinate envelope.",
    "Kundapura": "Existing area IN|KA|Udupi|Kundapura belongs to city_slug='kundapur', a different Discover city. Out of scope.",
    "Belman": "~20km SE of Udupi city, same area as Karkala; no existing city mapping.",
    "Hiriydaka": "No existing area or OSM evidence obtained within Slice 1 effort budget; coordinate falls outside every existing/new area bbox.",
    "Perdur": "~20km NE of Udupi city (near Kundapura taluk boundary); coordinate falls outside every existing/new area bbox; not modelled as part of city_slug='udupi'.",
    "Kemmannu": "Coastal locality north of Brahmavar, well outside every existing/new area bbox; not investigated for OSM evidence within Slice 1 effort budget.",
}

UNRESOLVED_LOCALITIES = {
    "Udyavara": "Already flagged unresolved in the Housing.com pass (OSM bbox too coarse; coordinates fall outside every existing area bbox).",
}

ENVELOPE = {"min_lat": 13.0, "max_lat": 13.5, "min_lon": 74.6, "max_lon": 74.95}

# 99acres residential propertyType vocabulary -> (property_type, listing_family) on CURRENT schema enums.
NINETYNINE_RESIDENTIAL_TYPE_MAP = {
    "Residential Apartment": ("apartment", "RESIDENTIAL"),
    "Residential Land": ("residential_plot", "RESIDENTIAL"),
}
NINETYNINE_RESIDENTIAL_AMBIGUOUS = {"Other", "Studio Apartment", "Builder Floor", "Duplex Builder Floor"}

# 99acres commercial propertyType vocabulary -> (property_type, listing_family)
NINETYNINE_COMMERCIAL_TYPE_MAP = {
    "Commercial Shops": ("commercial", "COMMERCIAL"),
    "Commercial Showrooms": ("commercial", "COMMERCIAL"),
    "Ready to move office space": ("commercial_building", "COMMERCIAL"),
    "Bare shell office space": ("commercial_building", "COMMERCIAL"),
    "Ware House": ("warehouse", "COMMERCIAL"),
    "Commercial Land/Inst. Land": ("commercial_land", "COMMERCIAL"),
    "Industrial Lands/Plots": ("commercial_land", "COMMERCIAL"),
    "Agricultural/Farm Land": ("agricultural_land", "AGRICULTURAL"),
}
NINETYNINE_COMMERCIAL_AMBIGUOUS = {"Factory", "Guest-House/Banquet-Halls", "Hotel/Resorts", "Other"}


def resolve_area(locality, lat, lon):
    if locality in OUT_OF_SCOPE_LOCALITIES:
        return None, None, f"out_of_scope: {OUT_OF_SCOPE_LOCALITIES[locality]}"
    if locality in LOCALITY_ALIASES:
        key = LOCALITY_ALIASES[locality]
        return key, key.rsplit("|", 1)[-1], "alias"
    if locality in UNRESOLVED_LOCALITIES:
        return None, None, f"unresolved: {UNRESOLVED_LOCALITIES[locality]}"
    for k, name, minlat, minlon, maxlat, maxlon in EXISTING_AREAS:
        if minlat <= lat <= maxlat and minlon <= lon <= maxlon:
            return k, name, f"per_listing_containment_in_{name}"
    return None, None, "unresolved: locality not aliased, no OSM evidence gathered, coordinate outside every area bbox"


def coordinate_trusted_rows(raw_rows):
    """99acres-specific: exclude any row whose exact coordinate is shared with a row that does
    NOT carry the identical building/project name (positive evidence of locality-centroid
    fallback for this source - see 'Hi Point Royal' cluster finding in area-mapping-report.md)."""
    groups = defaultdict(list)
    untrusted = []
    for x in raw_rows:
        lat, lon = x.get("latitude"), x.get("longitude")
        if lat is None or lon is None:
            untrusted.append((x, "missing_coordinates"))
            continue
        groups[(round(lat, 6), round(lon, 6))].append(x)

    trusted = []
    for coord, items in groups.items():
        if len(items) == 1:
            trusted.append(items[0])
            continue
        names = set()
        for it in items:
            bn = (it.get("buildingName") or "").strip().lower()
            pn = (it.get("projectName") or "").strip().lower()
            names.add(bn or pn or None)
        if len(names) == 1 and None not in names:
            trusted.extend(items)
        else:
            for it in items:
                untrusted.append((it, f"shared_coord_locality_centroid_suspected_{coord}_{len(items)}_listings"))
    return trusted, untrusted


def map_residential_type(title, ptype):
    if ptype in NINETYNINE_RESIDENTIAL_TYPE_MAP:
        return NINETYNINE_RESIDENTIAL_TYPE_MAP[ptype]
    if ptype == "Independent House/Villa":
        t = (title or "").lower()
        if "villa" in t:
            return ("villa", "RESIDENTIAL")
        if "house" in t:
            return ("house", "RESIDENTIAL")
        return None
    return None


def map_commercial_type(ptype):
    return NINETYNINE_COMMERCIAL_TYPE_MAP.get(ptype)


# 99acres commercial propertyType -> CommercialFieldOptions.VALID_COMMERCIAL_SUBTYPES
# ({SHOP, OFFICE, BUILDING, WAREHOUSE, LAND}). Only set where the mapping is unambiguous
# given our own property_type classification above - never guessed independently of it.
NINETYNINE_COMMERCIAL_SUBTYPE_MAP = {
    "Commercial Shops": "SHOP",
    "Commercial Showrooms": "SHOP",
    "Ready to move office space": "OFFICE",
    "Bare shell office space": "OFFICE",
}
# property_type values that map 1:1 onto a subtype regardless of the raw 99acres label
PROPERTY_TYPE_TO_SUBTYPE = {
    "commercial_building": "BUILDING",
    "warehouse": "WAREHOUSE",
    "commercial_land": "LAND",
}


def map_commercial_subtype(property_type, raw_99acres_ptype):
    if property_type in PROPERTY_TYPE_TO_SUBTYPE:
        return PROPERTY_TYPE_TO_SUBTYPE[property_type]
    return NINETYNINE_COMMERCIAL_SUBTYPE_MAP.get(raw_99acres_ptype)


# CommercialFieldOptions.VALID_COMMERCIAL_FURNISHING_STATUSES = {UNFURNISHED, SEMI_FURNISHED,
# FURNISHED, PLUG_AND_PLAY}. 99acres' own furnishing text maps onto the first three unambiguously;
# "Plug-and-play" never appears in the source, so that value is never produced here (not guessed).
NINETYNINE_FURNISHING_MAP = {
    "unfurnished": "UNFURNISHED",
    "semi-furnished": "SEMI_FURNISHED",
    "semi furnished": "SEMI_FURNISHED",
    "furnished": "FURNISHED",
}


def map_commercial_furnishing_status(raw_furnishing):
    if not raw_furnishing:
        return None
    return NINETYNINE_FURNISHING_MAP.get(raw_furnishing.strip().lower())


def normalise_99acres_row(d, listing_purpose, property_type, listing_family):
    price = d.get("price")
    return {
        "source": "99acres",
        "housingListingId": f"99acres:{d.get('listingId')}",
        "property_type": property_type,
        "listing_family": listing_family,
        "locality": d.get("locality"),
        "latitude": d["latitude"],
        "longitude": d["longitude"],
        "price": int(price) if price else None,
        "price_paise": int(price) * 100 if price else None,
        "bedrooms": d.get("bedrooms"),
        "bathrooms": d.get("bathrooms"),
        "built_area": d.get("area"),
        "built_area_unit": "sqft" if (d.get("areaUnit") or "").lower() in ("sqft", "sq.ft", "sq ft") else None,
        "land_area": d.get("area") if property_type in ("residential_plot", "commercial_land", "agricultural_land") else None,
        "land_area_unit": "sqft" if property_type in ("residential_plot", "commercial_land", "agricultural_land") and (d.get("areaUnit") or "").lower() in ("sqft", "sq.ft", "sq ft") else None,
        "listing_purpose": listing_purpose,
        "facing": d.get("facing"),
        "property_age": d.get("ageOfProperty"),
        "title": d.get("title"),
        "photoUrls": (d.get("images") or [])[:6],
        "coverImageUrl": (d.get("images") or [None])[0],
        "floor_number": d.get("floor"),
        "total_floors": d.get("totalFloors"),
        "furnishing_status": d.get("furnishing"),
    }


def main():
    # Read from the preserved Housing.com-only audit-trail file, never from
    # normalised-listings.json itself - that file is this script's OUTPUT (the combined
    # dataset), so reading it back as input would double-count 99acres rows on any re-run.
    with open(f"{OUT_DIR}/normalised-listings-housingcom-only.json") as f:
        hc_listings = json.load(f)
    for x in hc_listings:
        x["source"] = "housing.com"

    with open(f"{OUT_DIR}/raw-99acres-buy-output.json") as f:
        buy_raw = json.load(f)
    with open(f"{OUT_DIR}/raw-99acres-rent-output.json") as f:
        rent_raw = json.load(f)
    with open(f"{OUT_DIR}/raw-99acres-commercial-output.json") as f:
        commercial_raw = json.load(f)

    stats = Counter()
    stats["housing_com_final"] = len(hc_listings)
    stats["99acres_buy_raw"] = len(buy_raw)
    stats["99acres_rent_raw"] = len(rent_raw)
    stats["99acres_commercial_raw"] = len(commercial_raw)

    coord_trust_exclusions = []
    type_exclusions = []
    area_exclusions = []
    envelope_exclusions = []

    def process(raw_rows, purpose, is_commercial):
        trusted, untrusted = coordinate_trusted_rows(raw_rows)
        coord_trust_exclusions.extend(untrusted)
        out = []
        for d in trusted:
            lat, lon = d["latitude"], d["longitude"]
            if not (ENVELOPE["min_lat"] <= lat <= ENVELOPE["max_lat"] and ENVELOPE["min_lon"] <= lon <= ENVELOPE["max_lon"]):
                envelope_exclusions.append((d.get("listingId"), f"out_of_envelope({lat},{lon})"))
                continue
            if not d.get("price"):
                envelope_exclusions.append((d.get("listingId"), "missing_or_zero_price"))
                continue
            ptype = d.get("propertyType")
            if is_commercial:
                if ptype in NINETYNINE_COMMERCIAL_AMBIGUOUS or ptype is None:
                    type_exclusions.append((d.get("listingId"), ptype or "none"))
                    continue
                mapped = map_commercial_type(ptype)
            else:
                if ptype in NINETYNINE_RESIDENTIAL_AMBIGUOUS or ptype is None:
                    type_exclusions.append((d.get("listingId"), ptype or "none"))
                    continue
                mapped = map_residential_type(d.get("title"), ptype)
            if mapped is None:
                type_exclusions.append((d.get("listingId"), f"unmapped:{ptype}"))
                continue
            property_type, listing_family = mapped

            locality = d.get("locality")
            area_key, area_label, reason = resolve_area(locality, lat, lon)
            if area_key is None:
                area_exclusions.append((d.get("listingId"), locality, reason))
                continue

            row = normalise_99acres_row(d, purpose, property_type, listing_family)
            if is_commercial:
                row["commercial_subtype"] = map_commercial_subtype(property_type, ptype)
                row["commercial_furnishing_status_typed"] = map_commercial_furnishing_status(d.get("furnishing"))
            row["area_key"] = area_key
            row["area_label"] = area_label
            out.append(row)
        return out

    acres_buy = process(buy_raw, "sale", is_commercial=False)
    acres_rent = process(rent_raw, "rent", is_commercial=False)
    acres_commercial = process(commercial_raw, "sale", is_commercial=True)

    acres_all = acres_buy + acres_rent + acres_commercial
    stats["99acres_final_before_dedup"] = len(acres_all)
    stats["99acres_buy_final"] = len(acres_buy)
    stats["99acres_rent_final"] = len(acres_rent)
    stats["99acres_commercial_final"] = len(acres_commercial)

    # ---- Cross-source dedup: Housing.com vs 99acres ----
    # same locality + coordinate within ~50m + price within 5% + same/similar bedrooms -> same physical listing.
    def haversine_m(lat1, lon1, lat2, lon2):
        from math import radians, sin, cos, sqrt, atan2
        r = 6371000
        p1, p2 = radians(lat1), radians(lat2)
        dp = radians(lat2 - lat1)
        dl = radians(lon2 - lon1)
        a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
        return 2 * r * atan2(sqrt(a), sqrt(1 - a))

    cross_dupes = []
    acres_kept = []
    for a in acres_all:
        matched = False
        for h in hc_listings:
            if h["listing_purpose"] != a["listing_purpose"]:
                continue
            if a["price"] is None or h["price"] is None or h["price"] == 0:
                continue
            dist = haversine_m(a["latitude"], a["longitude"], h["latitude"], h["longitude"])
            price_diff = abs(a["price"] - h["price"]) / h["price"]
            # Null-bedroom escape hatch is only safe when NEITHER side is residential (e.g. plots,
            # commercial land legitimately have no bedroom count). If either side is RESIDENTIAL,
            # 99acres commercial/plot rows always carry bedrooms=None by construction, which would
            # otherwise let them silently match any nearby similarly-priced residential listing.
            if a["listing_family"] == "RESIDENTIAL" or h["listing_family"] == "RESIDENTIAL":
                beds_match = a["bedrooms"] == h["bedrooms"]
            else:
                beds_match = True
            if dist <= 50 and price_diff <= 0.05 and beds_match:
                cross_dupes.append((a["housingListingId"], h["housingListingId"], round(dist, 1), round(price_diff, 3)))
                matched = True
                break
        if not matched:
            acres_kept.append(a)

    stats["cross_source_duplicates_merged"] = len(cross_dupes)
    stats["99acres_final_after_dedup"] = len(acres_kept)

    combined = hc_listings + acres_kept
    stats["combined_final_total"] = len(combined)

    with open(f"{OUT_DIR}/normalised-listings.json", "w") as f:
        json.dump(combined, f, indent=2)

    with open(f"{OUT_DIR}/99acres-coordinate-trust-report.md", "w") as f:
        f.write("# 99acres Coordinate Trust Finding - Issue #2304 (source expansion)\n\n")
        f.write(
            "**Finding**: 99acres frequently returns a locality-level centroid coordinate instead of a "
            "genuine per-listing GPS pin, indistinguishable from real per-building precision on its face.\n\n"
            "Concrete evidence: in the Udupi buy dataset, coordinate (13.347199, 74.788029) is shared by 4 "
            "listings. 3 of them carry `buildingName: \"Hi Point Royal\"` (a real named building in Manipal - "
            "a legitimate same-building case). The 4th, listing U92843234, has `buildingName: null`, "
            "`projectName: null`, and no relation to Hi Point Royal beyond sharing `locality: \"Manipal\"` - "
            "yet shares the exact same coordinate to 6 decimal places. This proves the coordinate is a "
            "Manipal-locality fallback, not a real pin, for at least the unnamed-building row.\n\n"
            "Other clusters confirm the pattern at locality granularity: Shirva (4 listings, 1 coord, no "
            "shared building name), Kaup (4), Brahmavar (12), Karkala (9), Kundapura (7), Hiriydaka (4), "
            "Perdur (4), Udyavara (4) - all single-coordinate clusters of otherwise-unrelated listings.\n\n"
            "**Rule applied**: a listing's coordinate is trusted only if (a) it is unique across the dataset, "
            "or (b) it is shared exclusively with other listings carrying the identical non-null "
            "buildingName/projectName (genuine same-building, multiple real units). Any other shared "
            "coordinate is treated as an untrustworthy locality-centroid fallback and every listing sharing "
            "it is excluded - this is stricter than the plan's literal '>5 listings' threshold because we "
            "have positive evidence (the Hi Point Royal case) that even small same-coordinate groups on this "
            "source can mix one real building pin with unrelated listings.\n\n"
        )
        f.write("## Coordinate-trust exclusion counts by source-mode\n\n")
        f.write(f"- Buy: raw {stats['99acres_buy_raw']}\n")
        f.write(f"- Rent: raw {stats['99acres_rent_raw']}\n")
        f.write(f"- Commercial: raw {stats['99acres_commercial_raw']}\n")
        f.write(f"- Total coordinate-trust exclusions (all modes): {len(coord_trust_exclusions)}\n")

    with open(f"{OUT_DIR}/area-mapping-report-v2-99acres.md", "w") as f:
        f.write("# 99acres Area Mapping / Exclusion Report - Issue #2304 (source expansion)\n\n")
        f.write("## Out-of-scope localities (different city/taluk)\n\n")
        for loc, reason in OUT_OF_SCOPE_LOCALITIES.items():
            f.write(f"- {loc}: {reason}\n")
        f.write("\n## Unresolved localities\n\n")
        for loc, reason in UNRESOLVED_LOCALITIES.items():
            f.write(f"- {loc}: {reason}\n")
        f.write("\n## Area/type/envelope exclusion detail\n\n")
        f.write(f"- Ambiguous property-type mapping excluded: {len(type_exclusions)} ({Counter(r for _, r in type_exclusions)})\n")
        f.write(f"- Envelope/price exclusions: {len(envelope_exclusions)} ({Counter(r.split('(')[0] for _, r in envelope_exclusions)})\n")
        f.write(f"- Area unresolved/out-of-scope exclusions: {len(area_exclusions)}\n")
        for lid, loc, reason in area_exclusions:
            f.write(f"  - {lid} ({loc}): {reason}\n")

    with open(f"{OUT_DIR}/cross-source-dedup-report.md", "w") as f:
        f.write("# Cross-Source Deduplication Report - Issue #2304\n\n")
        f.write(
            "Heuristic: same listing_purpose + coordinate within 50m + price within 5%, plus a "
            "bedroom check -> treated as the same physical property; the 99acres row is dropped in "
            "favour of the already-validated Housing.com row. The bedroom check requires an exact "
            "match when either side is a RESIDENTIAL-family listing (99acres commercial/plot rows "
            "always carry bedrooms=None by construction, so a null-tolerant check there would let "
            "them silently match any nearby similarly-priced residential listing); for a pair where "
            "neither side is RESIDENTIAL (e.g. two plots), the bedroom check is skipped entirely.\n\n"
        )
        f.write(f"Cross-source duplicates merged: {len(cross_dupes)}\n\n")
        f.write("| 99acres id | Housing.com id | distance(m) | price diff |\n|---|---|---|---|\n")
        for a_id, h_id, dist, pdiff in cross_dupes:
            f.write(f"| {a_id} | {h_id} | {dist} | {pdiff} |\n")

    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
