#!/usr/bin/env python3
"""Issue #2575 — source-specific adapter: 99acres Commercial capture -> staging candidates.

NEW FILE by design. PR #2594 owns `normalise_v2.py` and the five-row OFFICE correction, so this
module **imports** that mapping rather than copying it. Two reasons, both load-bearing:

  * copying would fork the taxonomy, which is exactly what the issue's "reuse the canonical
    Commercial subtype vocabulary rather than creating a second taxonomy" clause forbids;
  * importing makes the #2594 dependency REAL — the moment that PR merges, this adapter picks up
    the corrected OFFICE precedence with no edit here. Nothing to remember, nothing to re-derive.

⚠ **HISTORICAL as of 2026-09-15 — #2594 IS MERGED, and this paragraph read in the present tense
until then.** It said the imported `map_commercial_subtype` "still carries the defect it fixes" and
that the run summary "reports it as a BLOCKED assertion". Both are now false: `office_precedence`
evaluates to `PASS` and `main()` returns 0.

What happened, kept because it is the evidence this arrangement works rather than a story about it:
before the merge the coarse `PROPERTY_TYPE_TO_SUBTYPE` fallback was consulted BEFORE the explicit
raw-label map, so both office labels short-circuited to BUILDING. This adapter did **not** work
around it — `validate_office_precedence()` detected it and the run exited non-zero, a BLOCKED
signal rather than a crash. On merge the corrected precedence arrived with **no edit in this file**
and five rows became `commercial`/`OFFICE`. A silent workaround would have papered over the
dependency and made the merge untestable; the loud failure is what kept it visible.

`validate_office_precedence()` and the non-zero exit are **retained, not dead code**: they are the
standing guard that re-detects this class if the imported mapping ever regresses.

WHAT THIS MODULE DOES NOT DO
  * It never writes to `property_listings`. It emits staging candidates only. Promotion is a
    separate, explicitly-invoked step — "scraping alone cannot make a listing LIVE" (#2575).
  * It never invents a subtype, price, area, coordinate or verification claim. An unmappable row
    becomes a REJECTED candidate carrying its reason, not a guess.
  * It never reads or emits contact data. The capture is PII-sanitised upstream by
    `sanitize_pii.py`; `assert_no_pii()` re-checks it here and FAILS CLOSED rather than trusting
    that the upstream sweep ran.

IDENTITY. `(source_platform, source_listing_id)` — the issue's preferred key. `source_url` is
carried as supporting provenance, never as the identity, so a portal URL reshuffle cannot
duplicate a row. Re-running this adapter over the same capture is a pure function of its input:
byte-identical output, which is what makes the staging upsert idempotent.
"""
import argparse
import hashlib
import json
import os
import sys
from collections import Counter

_HERE = os.path.dirname(os.path.abspath(__file__))
_IMPORT_2304 = os.path.abspath(os.path.join(_HERE, "..", "udupi-properties-2304"))
sys.path.insert(0, _IMPORT_2304)

# Owned by PR #2594 — imported, never modified or duplicated from this lane.
from normalise_v2 import (  # noqa: E402
    ENVELOPE,
    NINETYNINE_COMMERCIAL_AMBIGUOUS,
    coordinate_trusted_rows,
    map_commercial_furnishing_status,
    map_commercial_subtype,
    map_commercial_type,
    resolve_area,
)
from pii_filter import find_contacts, walk_strings  # noqa: E402

SOURCE_PLATFORM = "99acres"
IMPORT_ISSUE = 2575

# The five canonical subtypes, from CommercialFieldOptions.VALID_COMMERCIAL_SUBTYPES.
# Asserted against rather than redefined — a sixth value appearing here is a bug, not a feature.
VALID_SUBTYPES = {"SHOP", "OFFICE", "BUILDING", "WAREHOUSE", "LAND"}

# Raw 99acres labels that are office space. Used ONLY by the precedence check below, never to
# perform the mapping — the mapping is #2594's. Naming them here is what lets this adapter
# *detect* the defect without *fixing* it.
OFFICE_LABELS = {"Ready to move office space", "Bare shell office space"}

# A capture named "commercial" legitimately contains other families. Agricultural rows are real
# inventory, but they are NOT Commercial and must never be promoted as such — this is the
# "no accidental ingestion of Residential [or other-family] inventory into Commercial" gate.
NON_COMMERCIAL_FAMILIES = {"AGRICULTURAL", "RESIDENTIAL"}


class CityProfile:
    """Area/envelope resolution is city-specific and must not be guessed for a new city.

    Both profiles resolve against bounds that already exist as evidence, never invented ones.
    Udupi reuses the #2304 resolver (OSM Nominatim bboxes, documented in area-bbox-evidence.json).
    Bengaluru resolves against the bounds seeded into public.areas by the Flyway migrations
    themselves. A city with neither raises rather than falling back to something plausible.
    """

    def __init__(self, city, resolve, envelope):
        self.city = city
        self.resolve = resolve
        self.envelope = envelope


UDUPI = CityProfile("Udupi", resolve_area, ENVELOPE)


# --- Bengaluru -------------------------------------------------------------------------------
# Bounds are PARSED AT RUNTIME from the migrations that seed public.areas, never copied here.
# Copying ~300 tuples into this file would fork the geography: the migrations would stay the
# database's source of truth while this adapter resolved against a frozen snapshot, and nothing
# would detect the divergence. Parsing means the profile cannot silently drift.
#
# V71 seeds the canonical areas plus the city envelope; V106 adds the macro-region set. Both use
# the identical VALUES tuple shape:
#   (area_key, city_slug, name, district, geo_center_lat, geo_center_lon,
#    min_lat, min_lon, max_lat, max_lon)

_MIGRATION_SUFFIX = os.path.join(
    "apps", "api", "src", "main", "resources", "db", "migration")

_BENGALURU_AREA_SOURCES = (
    "V71__cities_and_areas.sql",
    "V106__seed_bangalore_macro_region_mapping.sql",
)

# From V71's own cities seed row for 'bangalore'. Taken from the migration rather than chosen,
# for the same reason as the area bounds.
BENGALURU_ENVELOPE = {"min_lat": 12.8340, "max_lat": 13.1411,
                      "min_lon": 77.3770, "max_lon": 77.7800}


def _find_migration_dir():
    """Locate the migration directory by searching UPWARD from this file.

    Deliberately not a fixed number of '..' hops. A hardcoded depth is silently wrong the moment
    this file moves, and the failure mode is nasty rather than loud: the loader would raise, every
    row would reject as area_unresolved, and that is indistinguishable from a genuinely unmappable
    capture. Searching removes the assumption instead of getting it right once.
    """
    d = _HERE
    for _ in range(8):
        candidate = os.path.join(d, _MIGRATION_SUFFIX)
        if os.path.isdir(candidate):
            return candidate
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    raise FileNotFoundError(
        f"Could not locate {_MIGRATION_SUFFIX} above {_HERE}. The Bengaluru profile resolves "
        f"against the migrations' own bounds; without them it must fail loudly rather than guess."
    )


def _load_seeded_areas(token="IN|KA|Bengaluru"):
    """area_key -> (min_lat, min_lon, max_lat, max_lon), read from the migrations themselves.

    DEGENERATE BOXES ARE KEPT, not filtered. A large share of the seeded Bengaluru areas have
    min == max on at least one axis — a zero-area box that can only match an exact coordinate, so
    in practice it resolves nothing. Dropping them here would make this loader disagree with what
    the database actually contains. The honest place to record that they contribute no coverage is
    the measurement (bengaluru-acquisition-report.md), not a silent filter inside the reader.
    """
    migrations = _find_migration_dir()
    areas = {}
    for fname in _BENGALURU_AREA_SOURCES:
        path = os.path.join(migrations, fname)
        if not os.path.exists(path):
            raise FileNotFoundError(f"Area seed migration missing: {path}")
        with open(path) as f:
            for line in f:
                if token not in line:
                    continue
                s = line.strip().rstrip(",").strip()
                if not s.startswith("("):
                    continue
                parts = [p.strip().strip("'") for p in s.strip("()").split(",")]
                if len(parts) < 10:
                    continue
                try:
                    nums = [float(x) for x in parts[4:10]]
                except ValueError:
                    continue
                areas[parts[0]] = (nums[2], nums[3], nums[4], nums[5])
    if not areas:
        raise ValueError(
            "Parsed zero Bengaluru areas from the migrations. Refusing to resolve against an empty "
            "area set — every row would then reject as area_unresolved, which is indistinguishable "
            "from a genuinely unmappable capture."
        )
    return areas


_BENGALURU_AREAS = None


def resolve_area_bengaluru(locality, lat, lon):
    """Per-listing coordinate containment against the seeded Bengaluru bounds.

    Containment on the listing's OWN coordinate, never on the locality name: 99acres locality
    strings do not correspond one-to-one with the seeded area names, and matching on text would
    silently attach a listing to a similarly-named area elsewhere in the city. Returns the same
    (area_key, area_label, reason) triple as the Udupi resolver.
    """
    global _BENGALURU_AREAS
    if _BENGALURU_AREAS is None:
        _BENGALURU_AREAS = _load_seeded_areas()
    for key, (min_lat, min_lon, max_lat, max_lon) in _BENGALURU_AREAS.items():
        if min_lat <= lat <= max_lat and min_lon <= lon <= max_lon:
            return key, key.rsplit("|", 1)[-1], "per_listing_containment_in_seeded_area"
    return None, None, (
        "unresolved: inside the city envelope but covered by no seeded area bbox — a coverage "
        "hole, distinct from a coordinate falling outside the city entirely "
        "(see bengaluru-acquisition-report.md section 4.2)"
    )


BENGALURU = CityProfile("Bangalore", resolve_area_bengaluru, BENGALURU_ENVELOPE)


# --- Mangalore ---------------------------------------------------------------------------------
# Same construction as Bengaluru: bounds PARSED from the migrations, never copied or chosen.
#
# The envelope is V71's own `mangalore` cities row — (12.7900, 74.7500, 13.0200, 74.9600) — taken
# from the migration rather than picked, for the same reason as the area bounds. Nothing here is
# fabricated; if V71's row changes, this profile changes with it.
#
# V71 seeds 8 areas keyed `IN|KA|Mangalore|*` (Kadri, Attavar, Balmatta, Hampankatta, Pumpwell,
# Kankanady, Surathkal, Falnir). Measured: 8 seeded, ZERO degenerate — contrast Bengaluru, where
# 68 of 308 have min == max on an axis and can therefore contain no coordinate at all.
#
# COVERAGE IS THIN, and that is a property of the city's seed rather than of this adapter: 8 boxes
# of roughly 0.02 x 0.03 degrees. Rows landing outside all 8 reject as `area_unresolved` carrying
# the coverage-hole reason. Widening the boxes to catch them would fabricate geography.
MANGALORE_ENVELOPE = {"min_lat": 12.7900, "max_lat": 13.0200,
                      "min_lon": 74.7500, "max_lon": 74.9600}

_MANGALORE_AREAS = None


def resolve_area_mangalore(locality, lat, lon):
    """Per-listing coordinate containment against the seeded Mangalore bounds.

    Containment on the listing's OWN coordinate, never the locality string — same reasoning as the
    Bengaluru resolver.

    A deliberate near-copy of `resolve_area_bengaluru` rather than a shared factory: the two differ
    only in token and cache, and collapsing them would mean editing the working Bengaluru path —
    32 staged rows asserted in CommercialStagingLoad2575IT — merely to add a city. A THIRD seeded
    city is where the factory starts earning more than it risks.
    """
    global _MANGALORE_AREAS
    if _MANGALORE_AREAS is None:
        _MANGALORE_AREAS = _load_seeded_areas("IN|KA|Mangalore")
    for key, (min_lat, min_lon, max_lat, max_lon) in _MANGALORE_AREAS.items():
        if min_lat <= lat <= max_lat and min_lon <= lon <= max_lon:
            return key, key.rsplit("|", 1)[-1], "per_listing_containment_in_seeded_area"
    return None, None, (
        "unresolved: inside the city envelope but covered by no seeded area bbox — Mangalore has "
        "only 8 seeded areas, so this is a COVERAGE HOLE, distinct from a coordinate falling "
        "outside the city entirely"
    )


MANGALORE = CityProfile("Mangalore", resolve_area_mangalore, MANGALORE_ENVELOPE)

# Keyed on the value passed to --city. The actor's own input spells it "Bangalore"; the seeded
# area keys spell it "Bengaluru". Both are accepted so a caller cannot miss the profile by
# spelling and receive the NotImplementedError meant for genuinely unprofiled cities.
#
# "Mangaluru" is accepted for the same reason. Note which spelling was actually VERIFIED at the
# source: the 99acres city value that resolved is "Mangalore", honoured on 100/100 returned rows.
# The alias guards this adapter's call site, not the actor's input — a run must still assert the
# city on every row, because an unrecognised value there SUCCEEDS and returns nothing.
PROFILES = {"Udupi": UDUPI, "Bangalore": BENGALURU, "Bengaluru": BENGALURU,
            "Mangalore": MANGALORE, "Mangaluru": MANGALORE}


def profile_for(city):
    if city not in PROFILES:
        raise NotImplementedError(
            f"No area-resolution profile for {city!r}. A profile requires evidenced area "
            f"bounds for that city; inventing them would fabricate coordinates. "
            f"Add a seed migration for that city's areas first."
        )
    return PROFILES[city]


def assert_no_pii(rows, label):
    """Fail closed if any string leaf in the capture carries a contact shape.

    The capture is sanitised upstream, so this should find nothing. That is precisely why it is
    here: a gate that only runs where a leak is expected proves nothing about the run where one
    is not. Returns the findings' JSON PATHS and shape classes only — never the matched value,
    which would put the contact data straight into the transcript this gate exists to keep clean.
    """
    findings = []
    for i, row in enumerate(rows):
        for path, s in walk_strings(row, path=f"[{i}]"):
            hits = find_contacts(s)
            if hits:
                findings.append((path, len(hits)))
    if findings:
        paths = ", ".join(f"{p} ({n} hit{'s' if n > 1 else ''})" for p, n in findings[:10])
        raise SystemExit(
            f"PII_GATE: FAIL — {len(findings)} string leaf/leaves in {label} carry a contact "
            f"shape. Paths only (values deliberately withheld): {paths}"
        )
    return len(rows)


def payload_checksum(obj):
    """sha256 over a deterministic serialisation — the V115 staging convention."""
    return hashlib.sha256(
        json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def purpose_of(raw):
    """`sale` | `rent`, from the source's own transactionType.

    Never derived from price shape or wording. `lease` is NOT produced: `chk_listing_purpose`
    permits only ('sale','rent'), and introducing a LEASE persistence value is explicitly out of
    scope for this issue.
    """
    t = (raw.get("transactionType") or "").strip().lower()
    if t == "sale":
        return "sale"
    if t in ("rent", "rent/lease", "lease"):
        # 'lease' collapses to the persisted 'rent' semantics rather than inventing a third
        # value. Recorded on the candidate as source_transaction_type so the distinction is
        # auditable even though it is not persisted.
        return "rent"
    return None


def adapt(raw_rows, city, run_meta):
    """Raw capture -> (candidates, rejects, stats). Pure function of its inputs."""
    prof = profile_for(city)
    stats = Counter()
    stats["fetched"] = len(raw_rows)

    candidates, rejects = [], []

    def reject(raw, reason, detail=None):
        rejects.append({
            "source_platform": SOURCE_PLATFORM,
            "source_listing_id": raw.get("listingId"),
            "source_url": raw.get("url"),
            "raw_property_type": raw.get("propertyType"),
            "reject_reason": reason,
            "detail": detail,
        })
        stats[f"rejected_{reason}"] += 1

    # Coordinate trust is applied FIRST and its exclusions are reported, not dropped. 99acres
    # frequently returns a locality centroid rather than a per-listing pin (#2304's Hi Point
    # Royal finding), and a centroid is indistinguishable from a real pin on its face.
    trusted, untrusted = coordinate_trusted_rows(raw_rows)
    for raw, why in untrusted:
        reject(raw, "coordinate_untrusted", why)
    stats["coordinate_trusted"] = len(trusted)

    for raw in trusted:
        ptype = raw.get("propertyType")
        if ptype is None or ptype in NINETYNINE_COMMERCIAL_AMBIGUOUS:
            reject(raw, "ambiguous_or_missing_type", ptype or "none")
            continue

        mapped = map_commercial_type(ptype)
        if mapped is None:
            reject(raw, "unmapped_type", ptype)
            continue
        property_type, listing_family = mapped

        # A capture named "commercial" carrying Agricultural rows is the other-family leakage
        # hazard this issue names. They are rejected from the COMMERCIAL pipeline explicitly and
        # counted, rather than silently filtered — a silent drop and a genuine absence look
        # identical in a summary.
        if listing_family in NON_COMMERCIAL_FAMILIES:
            reject(raw, "not_commercial_family", f"{ptype} -> {listing_family}")
            continue

        purpose = purpose_of(raw)
        if purpose is None:
            reject(raw, "unknown_listing_purpose", raw.get("transactionType"))
            continue

        price = raw.get("price")
        if not price:
            reject(raw, "missing_price", None)
            continue

        lat, lon = raw.get("latitude"), raw.get("longitude")
        env = prof.envelope
        if not (env["min_lat"] <= lat <= env["max_lat"] and env["min_lon"] <= lon <= env["max_lon"]):
            reject(raw, "out_of_geography", f"({lat},{lon})")
            continue

        area_key, area_label, reason = prof.resolve(raw.get("locality"), lat, lon)
        if area_key is None:
            reject(raw, "area_unresolved", reason)
            continue

        subtype = map_commercial_subtype(property_type, ptype)
        if subtype is not None and subtype not in VALID_SUBTYPES:
            reject(raw, "subtype_outside_taxonomy", subtype)
            continue

        # Sale vs Rent price semantics are kept strictly apart. A sale row carries `price`; a rent
        # row carries `monthly_rent` and NO sale price. Coalescing them is what produces a "null
        # sale-only price band on a Rent row", which the verification contract forbids.
        sale_price = int(price) if purpose == "sale" else None
        monthly_rent = int(price) if purpose == "rent" else None

        is_land = property_type in ("commercial_land", "agricultural_land")
        unit_ok = (raw.get("areaUnit") or "").lower() in ("sqft", "sq.ft", "sq ft")

        # An area magnitude whose unit we cannot express is REJECTED, never stored unitless.
        # Previously a non-sqft unit kept the number and set the unit column to NULL, leaving a
        # bare magnitude a downstream reader could reasonably take for sqft — silent unit loss.
        # NO LONGER UNREACHABLE — corrected against measurement. This comment previously read
        # "currently unreachable (all 100 rows in the committed capture are areaUnit 'sqft'), so
        # this changes no count today". That was true of the Udupi and Bengaluru captures and is
        # FALSE of the Mangalore one: the guard rejects 3 real rows there. A guard documented as
        # dead is exactly the kind of claim that quietly stops being true when new data arrives,
        # so the count is stated rather than the assumption.
        if raw.get("area") is not None and not unit_ok:
            reject(raw, "unsupported_area_unit", raw.get("areaUnit"))
            continue

        candidates.append({
            "source_platform": SOURCE_PLATFORM,
            "source_listing_id": raw.get("listingId"),
            "source_url": raw.get("url"),
            "source_property_type": ptype,            # preserved for auditability
            "source_transaction_type": raw.get("transactionType"),
            "scraped_at": raw.get("scrapedAt"),
            "source_updated_at": raw.get("updatedDate"),
            "city": city,
            "locality": raw.get("locality"),
            "area_key": area_key,
            "area_label": area_label,
            "area_resolution_reason": reason,
            "latitude": lat,
            "longitude": lon,
            "property_family": "COMMERCIAL",
            "property_type": property_type,
            "commercial_subtype": subtype,
            "listing_purpose": purpose,
            "price": sale_price,
            "price_paise": sale_price * 100 if sale_price is not None else None,
            "monthly_rent": monthly_rent,
            "built_area": None if is_land else raw.get("area"),
            "built_area_unit": None if is_land else ("sqft" if unit_ok else None),
            "land_area": raw.get("area") if is_land else None,
            "land_area_unit": ("sqft" if unit_ok else None) if is_land else None,
            "floor_number": raw.get("floor"),
            "total_floors": raw.get("totalFloors"),
            "washrooms": raw.get("bathrooms"),
            "commercial_furnishing_status": map_commercial_furnishing_status(raw.get("furnishing")),
            "title": raw.get("title"),
            "run": run_meta,
        })
        stats["normalized"] += 1
        stats[f"subtype_{subtype or 'NULL'}"] += 1
        stats[f"purpose_{purpose}"] += 1

    stats["rejected_total"] = len(rejects)
    return candidates, rejects, stats


def validate_office_precedence(raw_rows, candidates):
    """Detect the #2594 defect rather than working around it.

    Every row whose raw label is an office label MUST carry commercial_subtype='OFFICE'. Before
    #2594 merges, the imported mapper resolves both office labels to 'BUILDING', so this returns
    findings. That is the correct, visible behaviour for a declared dependency: the run summary
    reports it BLOCKED, and it turns green by itself the moment #2594 lands — with no edit here,
    which is what proves the dependency was real and not narrated.
    """
    by_id = {c["source_listing_id"]: c for c in candidates}
    wrong = []
    for raw in raw_rows:
        if raw.get("propertyType") in OFFICE_LABELS:
            c = by_id.get(raw.get("listingId"))
            if c is not None and c["commercial_subtype"] != "OFFICE":
                wrong.append((raw.get("listingId"), raw.get("propertyType"),
                              c["commercial_subtype"]))
    return wrong


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--capture", required=True, help="immutable raw capture JSON")
    ap.add_argument("--city", required=True)
    ap.add_argument("--out", default=None, help="staging candidates JSON (default: stdout summary only)")
    ap.add_argument("--rejects", default=None, help="reject report JSON")
    args = ap.parse_args()

    with open(args.capture) as f:
        raw_rows = json.load(f)

    assert_no_pii(raw_rows, os.path.basename(args.capture))

    run_meta = {
        "source_platform": SOURCE_PLATFORM,
        "import_issue": IMPORT_ISSUE,
        "capture_file": os.path.basename(args.capture),
        "capture_sha256": payload_checksum(raw_rows),
        "city": args.city,
    }

    candidates, rejects, stats = adapt(raw_rows, args.city, run_meta)

    if args.out:
        with open(args.out, "w") as f:
            json.dump(candidates, f, indent=2, ensure_ascii=False)
            f.write("\n")
    if args.rejects:
        with open(args.rejects, "w") as f:
            json.dump(rejects, f, indent=2, ensure_ascii=False)
            f.write("\n")

    office_wrong = validate_office_precedence(raw_rows, candidates)

    summary = {
        "run": run_meta,
        "counts": dict(sorted(stats.items())),
        "office_precedence": (
            "PASS"
            if not office_wrong
            else f"BLOCKED on #2594 — {len(office_wrong)} office row(s) carry a non-OFFICE subtype"
        ),
    }
    print(json.dumps(summary, indent=2))

    # Exit non-zero while the declared dependency is unmet, so no caller can mistake this run
    # for a complete one. This is a BLOCKED signal, not a crash: the summary above says which.
    return 1 if office_wrong else 0


if __name__ == "__main__":
    sys.exit(main())
