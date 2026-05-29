#!/usr/bin/env python3
"""
gen_perf_listings.py — Load-test dataset generator for the Discover feature.

Generates up to 1M synthetic property_listings rows tagged with the '[PERF]'
prefix so they can be identified and cleaned up safely.

Usage:
    python scripts/gen_perf_listings.py --count=10000 --seed=42 --db-url=$PERF_DB_URL
    python scripts/gen_perf_listings.py --dry-run --count=1000
    python scripts/gen_perf_listings.py --cleanup --confirm-delete-generated --db-url=$PERF_DB_URL

WARNING: Never use this against the production database.
WARNING: Never use '[PERF]' prefix in real listing titles — cleanup will delete them.
"""

import argparse
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PERF_TAG = "[PERF]"
BATCH_SIZE = 10_000

TITLE_TEMPLATES = [
    "{tag} garden villa in {locality}",
    "{tag} sea view apartment in {locality}",
    "{tag} student rental near {locality}",
    "{tag} 2BHK house in {locality}",
    "{tag} land parcel {locality}",
    "{tag} commercial space {locality}",
    "{tag} 3BHK flat {locality}",
]

LOCALITIES = [
    "Manipal",
    "Udupi",
    "Kundapura",
    "Kota",
    "Brahmavar",
    "Kaup",
    "Padubidri",
    "Hebri",
    "Karkala",
    "Mangaluru",
    "Bengaluru",
]

# Coordinate clusters: (label, lat_center, lat_jitter, lon_center, lon_jitter, weight)
CLUSTERS = [
    ("udupi",     13.35, 0.05, 74.78, 0.04, 0.60),
    ("manipal",   13.35, 0.05, 74.79, 0.05, 0.10),
    ("kundapura", 13.62, 0.05, 74.69, 0.05, 0.10),
    ("mangaluru", 12.87, 0.05, 74.84, 0.05, 0.10),
    ("bengaluru", 12.97, 0.05, 77.59, 0.05, 0.10),
]

# Cumulative breakpoints for cluster selection
_CLUSTER_BREAKS = []
_cumulative = 0.0
for _c in CLUSTERS:
    _cumulative += _c[5]
    _CLUSTER_BREAKS.append(_cumulative)

# property_type distribution (must match CHECK constraint in V61)
PROPERTY_TYPES = ["house", "apartment", "land", "commercial"]
PROPERTY_TYPE_WEIGHTS = [0.35, 0.30, 0.20, 0.15]

# Cumulative breakpoints for property type selection
_TYPE_BREAKS = []
_cumulative = 0.0
for _w in PROPERTY_TYPE_WEIGHTS:
    _cumulative += _w
    _TYPE_BREAKS.append(_cumulative)

# Price ranges by property type (in paise — 1 INR = 100 paise)
# Verified: price_paise BIGINT from V11; "source of truth for price"
PRICE_RANGES = {
    "land":       (500_000 * 100,   5_000_000 * 100),
    "apartment":  (2_000_000 * 100, 15_000_000 * 100),
    "house":      (3_000_000 * 100, 25_000_000 * 100),
    "commercial": (5_000_000 * 100, 50_000_000 * 100),
}

DESCRIPTION_TEMPLATES = {
    "house": (
        "Spacious {bhk} house located in {locality}. Well-maintained property with "
        "modern amenities, parking, and garden area. Ideal for families."
    ),
    "apartment": (
        "{bhk} apartment in {locality} with excellent connectivity. "
        "Modern construction, lift, power backup, and covered parking available."
    ),
    "land": (
        "Prime land parcel in {locality}. Suitable for residential or commercial "
        "construction. Clear title, all approvals in place."
    ),
    "commercial": (
        "Commercial space in {locality} suitable for office or retail use. "
        "Ground floor unit, high footfall location, ample parking."
    ),
}

BHK_OPTIONS = ["1BHK", "2BHK", "3BHK", "4BHK"]

# Fallback area_keys used when areas table is empty; also used for cluster→key mapping.
# Keys must exist in the areas table (seeded by V71).
CLUSTER_FALLBACK_AREA_KEYS = {
    "udupi":     "IN|KA|Udupi|Udupi",
    "manipal":   "IN|KA|Udupi|Manipal",
    "kundapura": "IN|KA|Udupi|Kundapura",
    "mangaluru": "IN|KA|Mangalore|Kadri",
    "bengaluru": "IN|KA|Bengaluru|Koramangala",
}

# INSERT columns — search_vector excluded (GENERATED ALWAYS STORED per V18)
#                — listing_number excluded (NOT NULL DEFAULT nextval() per V29)
INSERT_COLUMNS = [
    "id",
    "title",
    "locality",
    "description",
    "property_type",
    "status",
    "listing_purpose",
    "price_paise",
    "latitude",
    "longitude",
    "area_key",
    "created_by",
    "created_at",
    "updated_at",
    "is_valid",
    "is_duplicate",
    "confidence_score",
    "address_confirmed",
    "trust_tier",
    "ranking_score",
    "seller_type",
]

INSERT_SQL = (
    "INSERT INTO public.property_listings ("
    + ", ".join(INSERT_COLUMNS)
    + ") VALUES %s"
)


# ---------------------------------------------------------------------------
# Core data-generation (pure — no DB dependency)
# ---------------------------------------------------------------------------

def _select_cluster(rng: random.Random) -> tuple:
    """Select a coordinate cluster based on cumulative weighted probability."""
    r = rng.random()
    for i, break_val in enumerate(_CLUSTER_BREAKS):
        if r <= break_val:
            return CLUSTERS[i]
    return CLUSTERS[-1]


def _select_property_type(rng: random.Random) -> str:
    """Select property type using cumulative weighted distribution."""
    r = rng.random()
    for ptype, break_val in zip(PROPERTY_TYPES, _TYPE_BREAKS):
        if r <= break_val:
            return ptype
    return PROPERTY_TYPES[-1]


def _generate_price(rng: random.Random, property_type: str) -> int:
    """Generate price in paise for the given property type."""
    lo, hi = PRICE_RANGES[property_type]
    return rng.randint(lo, hi)


def _generate_created_at(rng: random.Random, now: datetime) -> datetime:
    """Generate a random created_at timestamp within the last 2 years."""
    two_years_ago = now - timedelta(days=730)
    delta_seconds = int((now - two_years_ago).total_seconds())
    offset = rng.randint(0, delta_seconds)
    return two_years_ago + timedelta(seconds=offset)


def generate_rows(
    count: int,
    seed: int,
    cluster_area_keys: Optional[dict] = None,
    created_by: Optional[str] = None,
    now: Optional[datetime] = None,
) -> list:
    """
    Generate `count` synthetic listing row dicts.

    Parameters
    ----------
    count : int
        Number of rows to generate.
    seed : int
        PRNG seed — same seed always produces identical output (determinism guarantee).
    cluster_area_keys : dict, optional
        Map of cluster_name -> area_key loaded from the DB areas table.
        Falls back to CLUSTER_FALLBACK_AREA_KEYS if None.
    created_by : str, optional
        UUID string for the created_by column.
    now : datetime, optional
        Reference "now" for created_at generation (defaults to UTC now).
        Injected for test determinism.

    Returns
    -------
    list[dict]
        List of row dicts suitable for psycopg2 execute_values().
        Does NOT include search_vector (GENERATED ALWAYS STORED per V18).
        Does NOT include listing_number (auto-generated by sequence per V29).
    """
    # R9: Seed PRNG at function entry before any random calls.
    rng = random.Random(seed)

    if now is None:
        now = datetime.now(tz=timezone.utc)

    area_map = cluster_area_keys if cluster_area_keys is not None else CLUSTER_FALLBACK_AREA_KEYS
    locality_count = len(LOCALITIES)
    rows = []

    for i in range(count):
        # Cluster and coordinates
        cluster = _select_cluster(rng)
        cluster_name, lat_c, lat_j, lon_c, lon_j, _ = cluster
        lat = lat_c + rng.uniform(-lat_j, lat_j)
        lon = lon_c + rng.uniform(-lon_j, lon_j)

        # Round-robin locality (index-based, deterministic per call)
        locality = LOCALITIES[i % locality_count]

        # Property type
        property_type = _select_property_type(rng)

        # Title — guaranteed to start with '[PERF]'
        template = TITLE_TEMPLATES[rng.randint(0, len(TITLE_TEMPLATES) - 1)]
        title = template.format(tag=PERF_TAG, locality=locality)

        # Description with FTS-friendly text
        bhk = BHK_OPTIONS[rng.randint(0, len(BHK_OPTIONS) - 1)]
        description = DESCRIPTION_TEMPLATES[property_type].format(
            bhk=bhk, locality=locality
        )

        # Price in paise
        price_paise = _generate_price(rng, property_type)

        # Area key from cluster mapping
        area_key = area_map.get(cluster_name)

        # Timestamps
        created_at = _generate_created_at(rng, now)

        row = {
            "id":               str(uuid.UUID(int=rng.getrandbits(128), version=4)),
            "title":            title,
            "locality":         locality,
            "description":      description,
            "property_type":    property_type,
            "status":           "LIVE",
            "listing_purpose":  "sale",
            "price_paise":      price_paise,
            "latitude":         lat,
            "longitude":        lon,
            "area_key":         area_key,
            "created_by":       created_by,
            "created_at":       created_at,
            "updated_at":       created_at,
            "is_valid":         True,
            "is_duplicate":     False,
            "confidence_score": 80,
            "address_confirmed": False,
            "trust_tier":       "D",
            "ranking_score":    0,
            "seller_type":      "broker",
        }
        # Defensive: R3 — search_vector must NEVER appear in any row dict
        assert "search_vector" not in row
        rows.append(row)

    return rows


def _row_to_tuple(row: dict) -> tuple:
    """Convert a row dict to a tuple in INSERT_COLUMNS order."""
    return tuple(row[col] for col in INSERT_COLUMNS)


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _connect(db_url: str):
    """Return a psycopg2 connection."""
    import psycopg2
    return psycopg2.connect(db_url)


def _resolve_created_by(conn, broker_id_arg: Optional[str]) -> str:
    """
    Resolve the created_by UUID to use for all inserted rows.

    If --broker-id is supplied, use it directly (no DB query).
    Otherwise, query profiles for the user with the earliest created_at.
    Exits with code 1 if no user is found and no --broker-id provided.
    """
    if broker_id_arg:
        return broker_id_arg

    with conn.cursor() as cur:
        cur.execute(
            "SELECT user_id FROM public.profiles ORDER BY created_at ASC LIMIT 1"
        )
        row = cur.fetchone()

    if row is None:
        print(
            "ERROR: No broker found. "
            "Provide --broker-id=<uuid> with a valid user ID.",
            file=sys.stderr,
        )
        sys.exit(1)

    return str(row[0])


def _load_area_keys(conn) -> dict:
    """
    Query the areas table and map cluster names to area_key values.

    Returns a dict of {cluster_name: area_key}.
    If the areas table is empty, area_key will be None for all clusters,
    which is allowed since area_key is nullable (V6 schema).
    """
    with conn.cursor() as cur:
        cur.execute("SELECT area_key FROM public.areas LIMIT 20")
        rows = cur.fetchall()

    if not rows:
        print(
            "WARNING: areas table is empty. area_key will be NULL for all rows.",
            file=sys.stderr,
        )
        return {name: None for name in CLUSTER_FALLBACK_AREA_KEYS}

    available_keys = {r[0] for r in rows}

    def _pick(preferred: str) -> Optional[str]:
        if preferred in available_keys:
            return preferred
        # Fall back to first available key if the preferred one isn't seeded
        return next(iter(available_keys), None)

    return {
        "udupi":     _pick("IN|KA|Udupi|Udupi"),
        "manipal":   _pick("IN|KA|Udupi|Manipal"),
        "kundapura": _pick("IN|KA|Udupi|Kundapura"),
        "mangaluru": _pick("IN|KA|Mangalore|Kadri"),
        "bengaluru": _pick("IN|KA|Bengaluru|Koramangala"),
    }


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def _run_cleanup(conn) -> None:
    """Delete all rows WHERE title LIKE '[PERF]%' and verify 0 remain."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM public.property_listings WHERE title LIKE %s",
            ("[PERF]%",),
        )
        count_before = cur.fetchone()[0]

    print(f"Cleanup will delete {count_before} rows with title LIKE '[PERF]%'")

    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM public.property_listings WHERE title LIKE %s",
            ("[PERF]%",),
        )
    conn.commit()

    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM public.property_listings WHERE title LIKE %s",
            ("[PERF]%",),
        )
        count_after = cur.fetchone()[0]

    if count_after != 0:
        print(
            f"ERROR: cleanup incomplete — {count_after} rows still remain.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Cleanup complete. {count_after} rows remaining (should be 0).")


# ---------------------------------------------------------------------------
# Batch insert with streaming generation (R5: never hold all N rows in memory)
# ---------------------------------------------------------------------------

def _insert_batches(
    conn,
    count: int,
    seed: int,
    cluster_area_keys: dict,
    created_by: str,
) -> None:
    """
    Stream-generate rows in BATCH_SIZE chunks and INSERT each batch.

    Commits after every batch (including the final partial batch — R8).
    Advances the seed per batch so each batch has distinct content.
    """
    from psycopg2.extras import execute_values

    now = datetime.now(tz=timezone.utc)
    inserted = 0
    remaining = count
    batch_seed = seed

    # Accumulated stats (scalars only — no row objects held across batches)
    type_counts: dict = {}
    keyword_counts: dict = {}
    min_lat = float("inf")
    max_lat = float("-inf")
    min_lon = float("inf")
    max_lon = float("-inf")

    while remaining > 0:
        batch_count = min(BATCH_SIZE, remaining)  # R8: handles final partial batch
        rows = generate_rows(
            count=batch_count,
            seed=batch_seed,
            cluster_area_keys=cluster_area_keys,
            created_by=created_by,
            now=now,
        )

        tuples = [_row_to_tuple(r) for r in rows]

        with conn.cursor() as cur:
            execute_values(cur, INSERT_SQL, tuples)
        conn.commit()  # commit after every batch, including the final partial one

        # Accumulate stats without retaining row objects
        for r in rows:
            pt = r["property_type"]
            type_counts[pt] = type_counts.get(pt, 0) + 1
            lat, lon = r["latitude"], r["longitude"]
            if lat < min_lat:
                min_lat = lat
            if lat > max_lat:
                max_lat = lat
            if lon < min_lon:
                min_lon = lon
            if lon > max_lon:
                max_lon = lon
            title = r["title"]
            for tmpl in TITLE_TEMPLATES:
                keyword = (
                    tmpl.split("{tag} ")[1]
                    .split(" {locality}")[0]
                    .split("{locality}")[0]
                    .strip()
                )
                if keyword and keyword in title:
                    keyword_counts[keyword] = keyword_counts.get(keyword, 0) + 1
                    break

        inserted += batch_count
        remaining -= batch_count
        batch_seed += 1  # advance seed so batches are distinct
        print(f"  Inserted {inserted}/{count} rows...", end="\r", flush=True)

    print()  # newline after progress display

    # Validation output
    print(f"\nGenerated {inserted} rows.")
    if inserted > 0:
        print(
            f"Coordinate range: lat [{min_lat:.4f}, {max_lat:.4f}], "
            f"lon [{min_lon:.4f}, {max_lon:.4f}]"
        )
    print(f"Property types: {type_counts}")
    print(f"Keywords: {keyword_counts}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Generate synthetic [PERF]-tagged property listings for load testing. "
            "WARNING: Use only on local/staging databases, never production."
        )
    )
    parser.add_argument(
        "--count",
        type=int,
        default=1000,
        help="Number of rows to generate (default: 1000)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=0,
        help="Deterministic PRNG seed (same seed → same rows; default: 0)",
    )
    parser.add_argument(
        "--db-url",
        type=str,
        default=None,
        help="PostgreSQL connection URL (or set PERF_DB_URL env var)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print row count plan and sample SQL without writing to DB",
    )
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="Delete all rows WHERE title LIKE '[PERF]%%' (requires --confirm-delete-generated)",
    )
    parser.add_argument(
        "--confirm-delete-generated",
        action="store_true",
        dest="confirm_delete_generated",
        help="Required companion to --cleanup to prevent accidental deletion",
    )
    parser.add_argument(
        "--broker-id",
        type=str,
        default=None,
        dest="broker_id",
        help="UUID of an existing user (profiles.user_id) to use as created_by for all rows",
    )
    return parser


def main(argv=None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    # --- Dry run (no DB needed) ---
    if args.dry_run:
        print(f"Dry run: would generate {args.count} rows with seed={args.seed}")
        print(f"Batch size: {BATCH_SIZE} rows per commit")
        batches = (args.count + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"Number of batches: {batches}")
        print(f"\nInsert columns ({len(INSERT_COLUMNS)}):\n  {', '.join(INSERT_COLUMNS)}")
        print(f"\nInsert SQL template:\n  {INSERT_SQL[:120]}...")

        sample = generate_rows(count=1, seed=args.seed)
        print(f"\nSample row (first of {args.count}):")
        for k, v in sample[0].items():
            print(f"  {k}: {v!r}")
        print("\nNo rows written to database (dry-run mode).")
        return 0

    # --- Resolve DB URL ---
    db_url = args.db_url or os.environ.get("PERF_DB_URL")
    if not db_url:
        print(
            "ERROR: No database URL provided. Use --db-url=<url> or set PERF_DB_URL.",
            file=sys.stderr,
        )
        return 1

    # --- Cleanup mode ---
    if args.cleanup:
        if not args.confirm_delete_generated:
            print(
                "ERROR: --confirm-delete-generated required for cleanup. "
                "Re-run with both flags.",
                file=sys.stderr,
            )
            sys.exit(1)

        conn = _connect(db_url)
        try:
            _run_cleanup(conn)
        finally:
            conn.close()
        return 0

    # --- Insert mode ---
    conn = _connect(db_url)
    try:
        created_by = _resolve_created_by(conn, args.broker_id)
        cluster_area_keys = _load_area_keys(conn)
        _insert_batches(
            conn=conn,
            count=args.count,
            seed=args.seed,
            cluster_area_keys=cluster_area_keys,
            created_by=created_by,
        )
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
