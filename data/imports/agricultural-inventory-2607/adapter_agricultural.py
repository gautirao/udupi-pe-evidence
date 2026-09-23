"""#2607 Agricultural staging adapter.

Maps one owner-supplied source record onto the V141 `agricultural_import_candidate`
contract (apps/api/src/main/resources/db/migration/V141__agricultural_import_staging.sql).

Mirrors data/imports/commercial-inventory-2575/adapter_housing_commercial.py's shape
(reject(), sanitise(), build_candidate()) deliberately, so the two staging pipelines
stay structurally comparable even though they write to separate tables with separate
subtype vocabularies.

WHY THIS FILE EXISTS WITHOUT A RAW CAPTURE TO RUN AGAINST (#2607). The owner-supplied
export manifest (data/imports/commercial-inventory-2575/housing-import-manifest.json)
declares `agricultural_records: 34`, but the raw payloads for those 34 rows are not
present anywhere in this tree — verified by inspecting the only two files the manifest
could plausibly point at (housing-capture.json, housing-commercial-3102.jsonl): both
contain exactly 3113 rows, all `propertySignalCategory=COMMERCIAL`. No agricultural row
exists in either file, and #2607 carries no attached fixture (unlike #2606, which
attached its own 11-row fixture as a follow-up comment). This adapter is therefore
implemented and unit-tested against synthetic fixture rows only (see
test_adapter_agricultural.py) — it validates the CONTRACT, not any real capture, and it
is ready to run the moment real rows are supplied.

THE DISCRIMINATION GUARANTEE, ADAPTER HALF. `build_candidate` rejects any record whose
`propertySignalCategory` is not `AGRICULTURAL` or whose `propertySignalSubtype` is not
`AGRICULTURAL_LAND` — this is the ingestion-layer half of the guarantee; the
database-layer half is V141's `chk_aic_subtype` / `chk_aic_property_family` plus V136's
own (unmodified) `chk_cic_subtype`. A Commercial-shaped record fed through this adapter
is rejected here, before it ever reaches a staging table.

BEDROOM/BHK REJECTION (#2607). Agricultural Land carries no bedroom/BHK semantics.
Any record carrying bedroom/BHK signal is REJECTED with a structured reason — never
silently stripped — mirroring V136's "rejects are inspectable rows, not absences"
convention. The full raw payload (minus PII) is retained on the reject so the signal
that caused the reject remains inspectable.

PLOT AREA, NEVER BUILT-UP AREA (#2607). Only `areaType == "Plot Area"` is accepted;
anything else (e.g. "Built Up Area", "Super Built Up Area") is rejected rather than
silently written into a land-area field under a different label.
"""

from __future__ import annotations

SOURCE_PLATFORM = "housing.com"
IMPORT_ISSUE = 2607

# PII fields stripped from raw_payload before persistence — same field list and same
# rationale as adapter_housing_commercial.py's PII_FIELDS.
PII_FIELDS = frozenset({
    "sellerName", "sellerId", "sellerFirm", "sellerType", "sellerProfileUrl",
    "sellerPhoneMasked", "sellerIsPrime", "sellerIsCertified",
})

# (south_lat, north_lat, west_lon, east_lon) — identical bounds to the #2575 adapter;
# the hard gate is India-wide, not city-specific (see V136's own comment on this).
INDIA_BOUNDS = (6.0, 37.5, 68.0, 97.5)

# The ONLY area-type label this table's plot_area column may represent.
PLOT_AREA_TYPES = frozenset({"Plot Area"})

# The ONLY category/subtype this pipeline may stage. Anything else — including every
# Commercial subtype (SHOP/OFFICE/BUILDING/WAREHOUSE/LAND) — is rejected here, never
# routed through to a table.
AGRICULTURAL_CATEGORY = "AGRICULTURAL"
AGRICULTURAL_SUBTYPE = "AGRICULTURAL_LAND"

# Field names (source vocabulary) whose presence signals bedroom/BHK data. Agricultural
# Land must never carry these — a row that does is rejected, not silently trimmed.
BEDROOM_SIGNAL_FIELDS = frozenset({
    "bedrooms", "bedroomCount", "numberOfBedrooms", "bhk", "bhkType",
})


def in_bounds(lat, lon, bounds):
    if lat is None or lon is None:
        return False
    lo_lat, hi_lat, lo_lon, hi_lon = bounds
    return lo_lat <= lat <= hi_lat and lo_lon <= lon <= hi_lon


def sanitise(record):
    """raw_payload snapshot with seller identity removed. Bedroom/BHK signal is
    deliberately KEPT (not stripped) here — a REJECTED row must retain the evidence
    that caused the reject; the rejection itself is what prevents the signal from
    being staged, not the absence of the field from raw_payload."""
    return {k: v for k, v in record.items() if k not in PII_FIELDS}


def reject(record, reason, detail=None):
    return {
        "source_platform": SOURCE_PLATFORM,
        "source_listing_id": record.get("sourceListingId"),
        "source_url": record.get("sourceUrl"),
        "raw_property_type": record.get("propertyType"),
        "raw_payload": sanitise(record),
        "reject_reason": reason,
        "detail": detail,
    }


def _bedroom_signal_present(record):
    for field in BEDROOM_SIGNAL_FIELDS:
        value = record.get(field)
        if value is not None and value != "" and value != 0:
            return field, value
    subtype = str(record.get("propertySignalSubtype") or "")
    if "BHK" in subtype.upper():
        return "propertySignalSubtype", subtype
    return None, None


def build_candidate(record):
    """Map one source record onto the V141 candidate contract.

    Returns (candidate, None) or (None, reject).
    """
    listing_id = record.get("sourceListingId")
    if not listing_id:
        return None, reject(record, "missing_source_listing_id")

    # Discrimination gate 1: category. A record that is not AGRICULTURAL never
    # reaches a subtype check at all — it is rejected outright, the same way a
    # Commercial-shaped record fed through this adapter by mistake would be.
    category = record.get("propertySignalCategory")
    if category != AGRICULTURAL_CATEGORY:
        return None, reject(record, "category_mismatch", f"propertySignalCategory={category!r}")

    # Bedroom/BHK gate (#2607), deliberately BEFORE the subtype exact-match gate.
    # A record whose propertySignalSubtype text itself carries a BHK label (e.g.
    # a malformed "2 BHK Farm House" value) is far more informatively rejected as
    # bedroom/BHK-unsupported than as a generic subtype mismatch — and running
    # this check first is what makes _bedroom_signal_present's own subtype-text
    # branch reachable at all; placed after the subtype gate, that branch could
    # never fire, since only the literal value AGRICULTURAL_SUBTYPE would still be
    # in play by then. Explicit reject, never a silent strip, either way.
    field, value = _bedroom_signal_present(record)
    if field is not None:
        return None, reject(
            record,
            "BEDROOM_DATA_UNSUPPORTED_FOR_AGRICULTURAL",
            f"{field}={value!r} present on an Agricultural Land record",
        )

    # Discrimination gate 2: subtype. Only AGRICULTURAL_LAND is representable —
    # this is the adapter-layer twin of V141's chk_aic_subtype.
    subtype = record.get("propertySignalSubtype")
    if subtype != AGRICULTURAL_SUBTYPE:
        return None, reject(record, "unsupported_agricultural_type", str(subtype))

    raw_purpose = record.get("purpose")
    purpose = {"SALE": "sale", "RENT": "rent"}.get(raw_purpose)
    if purpose is None:
        return None, reject(record, "malformed_source_record", f"purpose={raw_purpose!r}")

    lat, lon = record.get("latitude"), record.get("longitude")
    if lat is None or lon is None:
        return None, reject(record, "malformed_source_record", "missing coordinates")
    if not in_bounds(lat, lon, INDIA_BOUNDS):
        return None, reject(record, "wrong_geography", f"({lat}, {lon}) outside India")

    # Area gate (#2607): Plot Area only. A Built Up Area (or any other) label is
    # rejected rather than silently written into plot_area under a different name.
    area_value, area_unit, area_type = (
        record.get("areaValue"), record.get("areaUnit"), record.get("areaType"))
    if area_type not in PLOT_AREA_TYPES:
        return None, reject(record, "area_type_not_plot", f"areaType={area_type!r}")

    price = record.get("price")
    try:
        price_val = None if price is None else int(price)
    except (ValueError, TypeError):
        return None, reject(record, "invalid_price_value", f"invalid price value {price!r}")

    if purpose == "rent":
        money = {"price": None, "price_paise": None, "monthly_rent": price_val}
    else:
        money = {
            "price": price_val,
            "price_paise": None if price_val is None else price_val * 100,
            "monthly_rent": None,
        }

    return {
        "source_platform": SOURCE_PLATFORM,
        "source_listing_id": str(listing_id),
        "source_url": record.get("sourceUrl"),
        "source_property_type": record.get("propertyType"),
        "source_transaction_type": raw_purpose,
        "scraped_at": record.get("scrapedAt"),
        "source_updated_at": record.get("updatedAt"),
        "city": record.get("city"),
        "locality": record.get("locality"),
        "latitude": lat,
        "longitude": lon,
        "property_family": AGRICULTURAL_CATEGORY,
        "agricultural_subtype": AGRICULTURAL_SUBTYPE,
        "listing_purpose": purpose,
        **money,
        "area_type": area_type,
        "plot_area": area_value,
        "plot_area_unit": area_unit,
        "title": record.get("title"),
        "raw_payload": sanitise(record),
    }, None
