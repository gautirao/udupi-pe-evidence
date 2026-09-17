#!/usr/bin/env python3
"""#2575 — housing.com export → V136 staging candidates + reject report.

SCOPE, STATED FIRST BECAUSE IT IS THE THING MOST EASILY MISREAD. This lane did NOT
acquire these records. The export arrived from the owner; this adapter is ingestion
only. See the acquisition record on PR #2597.

WHY A SECOND ADAPTER RATHER THAN A PROFILE ON THE 99ACRES ONE. `adapter_99acres_commercial.py`
maps a 99acres capture shape. housing.com emits a different vocabulary, a different
area model and a different money model. Folding both into one file would make every
99acres profile a hostage to a housing change. The OUTPUT contract is shared — this
emits exactly the candidate/reject shape `load_staging_sql.py` already consumes — so
the join to V136 stays single-sourced. The duplication is in mapping, not in loading.

COMMERCIAL ONLY, AND THE 34 AGRICULTURAL RECORDS ARE DEFERRED, NOT REJECTED.
V136 declares `commercial_import_batch`/`commercial_import_candidate`, and
`chk_cic_subtype` admits only the canonical five commercial values. AGRICULTURAL_LAND
has no representable home: `commercial_subtype` would have to be NULL and there is no
agricultural subtype column. Those 34 rows passed every data-quality gate — they have
no table. A reject means "failed a gate"; calling them rejects would be false.

  🔴 THIS IS WHY DEFERRAL IS AN EXPLICIT STATUS AND NOT AN ABSENCE. If the reject
  report were generated as "everything not staged", the 34 would land in it BY
  CONSTRUCTION and the count would still reconcile to 3,147 — silently converting a
  schema gap into 34 fabricated data-quality failures. The manifest therefore carries
  staged + deferred + rejected as three separate counts that must sum to the input, so
  a reader sees nothing was lost without having to subtract.

THE ROUTING PAIR. `property_type` and `commercial_subtype` move TOGETHER. Setting the
subtype alone stages a row under the wrong routing; it does NOT fail at staging, and
surfaces only at promotion, where an OFFICE routed to the building table is
structurally unrepresentable. See SUBTYPE_ROUTING and its test, which asserts the PAIR
— a test that checks `commercial_subtype` alone passes on exactly that defect.

MONEY. housing.com has no rent field: every row carries its money in `price`, for SALE
and RENT alike. V136's chk_cic_purpose_money requires a rent row to hold no sale price
band. Mapping `price` straight through would both fail that CHECK and reproduce the
sale-band-on-a-rent-row defect the constraint exists to prevent, so RENT money is
routed to `monthly_rent` and the sale columns are left NULL.

PII. V136 has no seller columns, so seller data can only reach the database inside
`raw_payload` — which V136's own comment describes as "PII-sanitised". It is stripped
here. Dropping the NAME field alone is not enough: `sellerProfileUrl` carries identity
in its URL slug, so the URL goes too. Removing a field is not the same as removing the
value it also appears in.

Usage:
  adapter_housing_commercial.py --commercial commercial.jsonl.json \
      --agricultural agricultural.jsonl.json \
      --out-candidates housing-staging-candidates.json \
      --out-rejects housing-reject-report.json \
      --out-capture housing-capture.json \
      --out-manifest housing-import-manifest.json
"""
from __future__ import annotations

import argparse
import json
import sys

SOURCE_PLATFORM = "housing.com"
BATCH_IDENTIFIER = "housing_inventory_2026-09-16"

# The routing PAIR. Both columns, together — see the module docstring.
SUBTYPE_ROUTING = {
    "OFFICE": ("commercial", "OFFICE"),
    "SHOP": ("commercial", "SHOP"),
    "COMMERCIAL_BUILDING": ("commercial_building", "BUILDING"),
    "WAREHOUSE": ("warehouse", "WAREHOUSE"),
    "COMMERCIAL_LAND": ("commercial_land", "LAND"),
}

# housing.com spells Bengaluru both ways within one export. Both denote one city, so
# they are normalised for grouping; the source spelling survives in raw_payload.
CITY_NORMALISATION = {"bangalore": "Bengaluru", "bengaluru": "Bengaluru"}

# Seller identity. sellerProfileUrl is listed because a denylist that removes the NAME
# and keeps the profile URL has not removed the person.
PII_FIELDS = frozenset({
    "sellerName", "sellerId", "sellerFirm", "sellerType", "sellerProfileUrl",
    "sellerPhoneMasked", "sellerIsPrime", "sellerIsCertified",
})

# Hard geography gate. Deliberately INDIA-wide rather than Karnataka-tight: a
# coordinate outside India is unambiguously wrong, whereas a Karnataka-tight box would
# reject on a border case that may be a genuine listing. Out-of-Karnataka rows are
# COUNTED and reported as a data-quality observation instead of being rejected on a
# guess — the number is evidence, the rejection would be an assumption.
INDIA_BOUNDS = (6.0, 37.5, 68.0, 97.5)       # lat_min, lat_max, lon_min, lon_max
KARNATAKA_BOUNDS = (11.5, 18.6, 74.0, 78.7)

PLOT_AREA_TYPES = frozenset({"Plot Area"})


def read_jsonl(path):
    records = []
    with open(path, encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{path}:{lineno}: unparseable JSON line: {exc}")
    return records


def in_bounds(lat, lon, bounds):
    if lat is None or lon is None:
        return False
    lo_lat, hi_lat, lo_lon, hi_lon = bounds
    return lo_lat <= lat <= hi_lat and lo_lon <= lon <= hi_lon


def sanitise(record):
    """raw_payload snapshot with seller identity removed."""
    return {k: v for k, v in record.items() if k not in PII_FIELDS}


def normalise_city(value):
    if not value:
        return None
    return CITY_NORMALISATION.get(str(value).strip().lower(), str(value).strip())


def reject(record, reason, detail=None):
    return {
        "source_platform": SOURCE_PLATFORM,
        "source_listing_id": record.get("sourceListingId"),
        "source_url": record.get("sourceUrl"),
        "raw_property_type": record.get("propertyType"),
        "reject_reason": reason,
        "detail": detail,
    }


# Active Canonical Areas mapping: (city_normalised, locality_lower) -> (area_key, area_label)
# Sourced from DB / migrations (public.areas where lifecycle_status = 'ACTIVE').
CANONICAL_AREAS = {
    # Bengaluru
    ("Bengaluru", "hsr layout"): ("IN|KA|Bengaluru|HSR Layout", "HSR Layout"),
    ("Bengaluru", "jp nagar"): ("IN|KA|Bengaluru|JP Nagar", "JP Nagar"),
    ("Bengaluru", "koramangala"): ("IN|KA|Bengaluru|Koramangala", "Koramangala"),
    ("Bengaluru", "indiranagar"): ("IN|KA|Bengaluru|Indiranagar", "Indiranagar"),
    ("Bengaluru", "whitefield"): ("IN|KA|Bengaluru|Whitefield", "Whitefield"),
    ("Bengaluru", "electronic city"): ("IN|KA|Bengaluru|Electronic City", "Electronic City"),
    ("Bengaluru", "jayanagar"): ("IN|KA|Bengaluru|Jayanagar", "Jayanagar"),
    ("Bengaluru", "rajajinagar"): ("IN|KA|Bengaluru|Rajajinagar", "Rajajinagar"),
    ("Bengaluru", "marathahalli"): ("IN|KA|Bengaluru|Marathahalli", "Marathahalli"),
    ("Bengaluru", "yelahanka"): ("IN|KA|Bengaluru|Yelahanka", "Yelahanka"),
    ("Bengaluru", "hebbal"): ("IN|KA|Bengaluru|Hebbal", "Hebbal"),
    ("Bengaluru", "banashankari"): ("IN|KA|Bengaluru|Banashankari", "Banashankari"),
    ("Bengaluru", "bellandur"): ("IN|KA|Bengaluru|Bellandur", "Bellandur"),
    ("Bengaluru", "sarjapur road"): ("IN|KA|Bengaluru|Sarjapur Road", "Sarjapur Road"),
    ("Bengaluru", "begur"): ("IN|KA|Bengaluru|Begur", "Begur"),
    ("Bengaluru", "bommanahalli"): ("IN|KA|Bengaluru|Bommanahalli", "Bommanahalli"),
    ("Bengaluru", "varthur"): ("IN|KA|Bengaluru|Varthur", "Varthur"),
    ("Bengaluru", "k r puram"): ("IN|KA|Bengaluru|K R Puram", "K R Puram"),
    ("Bengaluru", "kr puram"): ("IN|KA|Bengaluru|K R Puram", "K R Puram"),
    ("Bengaluru", "thanisandra"): ("IN|KA|Bengaluru|Thanisandra", "Thanisandra"),
    ("Bengaluru", "ashok nagar"): ("IN|KA|Bengaluru|Ashok Nagar", "Ashok Nagar"),

    # Udupi
    ("Udupi", "manipal"): ("IN|KA|Udupi|Manipal", "Manipal"),
    ("Udupi", "kundapura"): ("IN|KA|Udupi|Kundapura", "Kundapura"),
    ("Udupi", "kundapur"): ("IN|KA|Udupi|Kundapura", "Kundapura"),
    ("Udupi", "santhekatte"): ("IN|KA|Udupi|Santhekatte", "Santhekatte"),
    ("Udupi", "brahmagiri"): ("IN|KA|Udupi|Brahmagiri", "Brahmagiri"),
    ("Udupi", "kinnimulki"): ("IN|KA|Udupi|Kinnimulki", "Kinnimulki"),
    ("Udupi", "kuthpady"): ("IN|KA|Udupi|Kuthpady", "Kuthpady"),
    ("Udupi", "ambagilu"): ("IN|KA|Udupi|Ambagilu", "Ambagilu"),
    ("Udupi", "adi-udupi"): ("IN|KA|Udupi|Adi-Udupi", "Adi-Udupi"),
    ("Udupi", "adi udupi"): ("IN|KA|Udupi|Adi-Udupi", "Adi-Udupi"),
    ("Udupi", "udupi"): ("IN|KA|Udupi|Udupi", "Udupi"),
    ("Udupi", "brahmavar"): ("IN|KA|Udupi|Brahmavar", "Brahmavar"),
    ("Udupi", "katapadi"): ("IN|KA|Udupi|Katapadi", "Katapadi"),
    ("Udupi", "katapady"): ("IN|KA|Udupi|Katapadi", "Katapadi"),
    ("Udupi", "malpe"): ("IN|KA|Udupi|Malpe", "Malpe"),
    ("Udupi", "saligrama"): ("IN|KA|Udupi|Saligrama", "Saligrama"),
    ("Udupi", "padubidri"): ("IN|KA|Udupi|Padubidri", "Padubidri"),
    ("Udupi", "shirva"): ("IN|KA|Udupi|Shirva", "Shirva"),
    ("Udupi", "kaup"): ("IN|KA|Udupi|Kaup", "Kaup"),
    ("Udupi", "kapu"): ("IN|KA|Udupi|Kaup", "Kaup"),
    ("Udupi", "kunjibettu"): ("IN|KA|Udupi|Kunjibettu", "Kunjibettu"),
    ("Udupi", "ashok nagar"): ("IN|KA|Udupi|Ashok Nagar", "Ashok Nagar"),

    # Mangalore
    ("Mangalore", "kadri"): ("IN|KA|Mangalore|Kadri", "Kadri"),
    ("Mangalore", "attavar"): ("IN|KA|Mangalore|Attavar", "Attavar"),
    ("Mangalore", "balmatta"): ("IN|KA|Mangalore|Balmatta", "Balmatta"),
    ("Mangalore", "hampankatta"): ("IN|KA|Mangalore|Hampankatta", "Hampankatta"),
    ("Mangalore", "pumpwell"): ("IN|KA|Mangalore|Pumpwell", "Pumpwell"),
    ("Mangalore", "kankanady"): ("IN|KA|Mangalore|Kankanady", "Kankanady"),
    ("Mangalore", "surathkal"): ("IN|KA|Mangalore|Surathkal", "Surathkal"),
    ("Mangalore", "falnir"): ("IN|KA|Mangalore|Falnir", "Falnir"),
}

# Approved aliases in public.area_alias -> (city_normalised, locality_lower) -> (area_key, area_label)
CANONICAL_ALIASES = {
    ("Bengaluru", "itpl"): ("IN|KA|Bengaluru|Whitefield", "Whitefield"),
    ("Mangalore", "kadri hills"): ("IN|KA|Mangalore|Kadri", "Kadri"),
}


def resolve_canonical_area(city, locality):
    """Resolve city and locality against ACTIVE canonical areas and approved aliases.

    Resolution is strictly city-scoped, keyed by (city_normalised, locality_lower).
    Returns dict with area_key, area_label, area_resolution_status, area_resolution_method, area_resolution_reason.
    """
    if not locality:
        return {
            "area_key": None,
            "area_label": None,
            "area_resolution_status": "UNRESOLVED",
            "area_resolution_method": None,
            "area_resolution_reason": "unresolved_locality_empty",
        }

    city_norm = normalise_city(city)
    if not city_norm:
        return {
            "area_key": None,
            "area_label": None,
            "area_resolution_status": "UNRESOLVED",
            "area_resolution_method": None,
            "area_resolution_reason": "unresolved_city_empty",
        }

    raw_loc = str(locality).strip()
    norm_loc = raw_loc.lower()
    key = (city_norm, norm_loc)

    if key in CANONICAL_AREAS:
        area_key, area_label = CANONICAL_AREAS[key]
        return {
            "area_key": area_key,
            "area_label": area_label,
            "area_resolution_status": "RESOLVED",
            "area_resolution_method": "CANONICAL_KEY",
            "area_resolution_reason": "exact_canonical_locality_match",
        }

    if key in CANONICAL_ALIASES:
        area_key, area_label = CANONICAL_ALIASES[key]
        return {
            "area_key": area_key,
            "area_label": area_label,
            "area_resolution_status": "RESOLVED",
            "area_resolution_method": "ALIAS",
            "area_resolution_reason": "approved_alias_match",
        }

    return {
        "area_key": None,
        "area_label": None,
        "area_resolution_status": "UNRESOLVED",
        "area_resolution_method": None,
        "area_resolution_reason": "unresolved_locality_not_found",
    }


def build_candidate(record):
    """Map one housing.com commercial record onto the V136 candidate contract.

    Returns (candidate, None) or (None, reject).
    """
    listing_id = record.get("sourceListingId")
    if not listing_id:
        return None, reject(record, "missing_source_listing_id")

    raw_subtype = record.get("propertySignalSubtype")
    routing = SUBTYPE_ROUTING.get(raw_subtype)
    if routing is None:
        # Unknown source labels stay explicit rejects rather than being forced into
        # the nearest subtype (#2575 taxonomy rule).
        return None, reject(record, "unsupported_commercial_type", str(raw_subtype))
    property_type, commercial_subtype = routing

    raw_purpose = record.get("purpose")
    purpose = {"SALE": "sale", "RENT": "rent"}.get(raw_purpose)
    if purpose is None:
        return None, reject(record, "malformed_source_record", f"purpose={raw_purpose!r}")

    lat, lon = record.get("latitude"), record.get("longitude")
    if lat is None or lon is None:
        return None, reject(record, "malformed_source_record", "missing coordinates")
    if not in_bounds(lat, lon, INDIA_BOUNDS):
        return None, reject(record, "wrong_geography", f"({lat}, {lon}) outside India")

    price = record.get("price")
    if (
        price is None
        or record.get("isPriceOnRequest") is True
        or record.get("priceOnRequest") is True
        or str(record.get("displayPrice", "")).strip().lower() == "price on request"
        or str(record.get("priceDisplay", "")).strip().lower() == "price on request"
    ):
        # Durable ruling: Price-on-Request / missing price listings rejected with reason PRICE_ON_REQUEST_UNSUPPORTED
        return None, reject(record, "PRICE_ON_REQUEST_UNSUPPORTED", "Price on request listings are unsupported in commercial staging")

    try:
        price_val = int(price)
    except (ValueError, TypeError):
        return None, reject(record, "PRICE_ON_REQUEST_UNSUPPORTED", f"invalid price value {price!r}")

    # Money: rent money must never occupy the sale columns (chk_cic_purpose_money).
    if purpose == "rent":
        money = {"price": None, "price_paise": None, "monthly_rent": price_val}
    else:
        money = {"price": price_val, "price_paise": price_val * 100, "monthly_rent": None}

    # Area: a Plot Area measurement is land area and must not be emitted as built-up.
    area_value, area_unit, area_type = (
        record.get("areaValue"), record.get("areaUnit"), record.get("areaType"))
    if area_type in PLOT_AREA_TYPES:
        built_area, built_unit, land_area, land_unit = None, None, area_value, area_unit
    else:
        built_area, built_unit, land_area, land_unit = area_value, area_unit, None, None

    city = normalise_city(record.get("city"))
    area_res = resolve_canonical_area(city, record.get("locality"))

    return {
        "source_platform": SOURCE_PLATFORM,
        "source_listing_id": str(listing_id),
        "source_url": record.get("sourceUrl"),
        "source_property_type": record.get("propertyType"),
        "source_transaction_type": raw_purpose,
        "scraped_at": record.get("scrapedAt"),
        "source_updated_at": record.get("updatedAt"),
        "city": city,
        "locality": record.get("locality"),
        "area_key": area_res["area_key"],
        "area_label": area_res["area_label"],
        "area_resolution_status": area_res["area_resolution_status"],
        "area_resolution_method": area_res["area_resolution_method"],
        "area_resolution_reason": area_res["area_resolution_reason"],
        "latitude": lat,
        "longitude": lon,
        "property_family": "COMMERCIAL",
        "property_type": property_type,
        "commercial_subtype": commercial_subtype,
        "listing_purpose": purpose,
        **money,
        "built_area": built_area,
        "built_area_unit": built_unit,
        "land_area": land_area,
        "land_area_unit": land_unit,
        # housing.com exposes floors only as free text ("3 out of 5"); V136 wants
        # integers. Left NULL rather than guessed — the text survives in raw_payload.
        "floor_number": None,
        "total_floors": None,
        "washrooms": None,
        "commercial_furnishing_status": None,
        "title": record.get("title"),
        # V136's commercial_import_batch.city is NOT NULL, and the established
        # convention is one batch per city. The city therefore travels on the
        # candidate's own run block and the emit step groups by it — rather than
        # inventing a composite "Bengaluru+Udupi" value that is not a city.
        "run": {
            "source_platform": SOURCE_PLATFORM,
            "import_issue": 2575,
            "capture_file": BATCH_IDENTIFIER,
            "capture_sha256": None,
            "city": normalise_city(record.get("city")),
        },
    }, None


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--commercial", required=True)
    ap.add_argument("--agricultural", required=True)
    ap.add_argument("--out-candidates", required=True)
    ap.add_argument("--out-rejects", required=True)
    ap.add_argument("--out-capture", required=True)
    ap.add_argument("--out-manifest", required=True)
    args = ap.parse_args(argv)

    commercial = read_jsonl(args.commercial)
    agricultural = read_jsonl(args.agricultural)

    candidates, rejects = [], []
    seen = {}
    out_of_karnataka = 0
    for record in commercial:
        candidate, rej = build_candidate(record)
        if rej is not None:
            rejects.append(rej)
            continue
        key = candidate["source_listing_id"]
        if key in seen:
            rejects.append(reject(record, "duplicate_source_listing_id", key))
            continue
        seen[key] = True
        if not in_bounds(candidate["latitude"], candidate["longitude"], KARNATAKA_BOUNDS):
            out_of_karnataka += 1
        candidates.append(candidate)

    # The capture the loader indexes. This is a container change only — JSONL to a JSON
    # array — with seller identity removed. No field value is altered, nothing is added.
    capture = [sanitise(r) for r in commercial]

    by = lambda field: _tally(candidates, field)
    manifest = {
        "batch_identifier": BATCH_IDENTIFIER,
        "source_platform": SOURCE_PLATFORM,
        "acquired_by_this_lane": False,
        "provenance_note": (
            "Export supplied by the owner. lane-2575-inventory did not acquire these "
            "records; its own acquisition state is 0 fetched / 0 staged."
        ),
        "input": {
            "commercial_records": len(commercial),
            "agricultural_records": len(agricultural),
            "total": len(commercial) + len(agricultural),
        },
        # These three are separate on purpose and must sum to input.total.
        "reconciliation": {
            "staged": len(candidates),
            "deferred": len(agricultural),
            "rejected": len(rejects),
            "sum": len(candidates) + len(agricultural) + len(rejects),
        },
        "deferred": {
            "count": len(agricultural),
            "reason": "no_staging_table",
            "detail": (
                "AGRICULTURAL_LAND is not representable in commercial_import_candidate: "
                "chk_cic_subtype admits only the canonical five commercial values and "
                "there is no agricultural subtype column. These rows passed every "
                "data-quality gate and are NOT rejects."
            ),
            "resolution": "deferred to a later additive migration (V137)",
        },
        "by_city": by("city"),
        "by_subtype": by("commercial_subtype"),
        "by_property_type": by("property_type"),
        "by_purpose": by("listing_purpose"),
        "rejects_by_reason": _tally(rejects, "reject_reason"),
        "coordinates": {
            "with_coordinates": sum(
                1 for c in candidates if c["latitude"] is not None and c["longitude"] is not None),
            "outside_karnataka_bounds": out_of_karnataka,
            "note": (
                "Outside-Karnataka rows are counted, not rejected. The hard gate is "
                "India-wide; a tighter box would reject border cases on an assumption."
            ),
        },
        "pii": {
            "fields_removed_from_raw_payload": sorted(PII_FIELDS),
            "note": "sellerProfileUrl removed as well as sellerName — the slug carries identity.",
        },
    }

    _write(args.out_candidates, candidates)
    _write(args.out_rejects, rejects)
    _write(args.out_capture, capture)
    _write(args.out_manifest, manifest)

    total = manifest["reconciliation"]["sum"]
    print(f"staged={len(candidates)} deferred={len(agricultural)} rejected={len(rejects)}")
    print(f"reconciliation: {total} == input {manifest['input']['total']}: "
          f"{'OK' if total == manifest['input']['total'] else 'MISMATCH'}")
    return 0 if total == manifest["input"]["total"] else 1


def _tally(rows, field):
    out = {}
    for r in rows:
        out[r.get(field)] = out.get(r.get(field), 0) + 1
    return dict(sorted(out.items(), key=lambda kv: (-kv[1], str(kv[0]))))


def _write(path, payload):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


if __name__ == "__main__":
    sys.exit(main())
