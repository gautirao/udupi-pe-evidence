#!/usr/bin/env python3
"""
EXPLAIN ANALYZE harness for Discover query performance baseline.

Runs EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) for each key Discover query path
in a READ ONLY transaction and writes results to docs/audit/evidence/explain/live/<volume>/.

Source: DiscoverListingPredicateBuilder.java + DiscoverController.java
Issue: #1246 — Discover query performance baseline
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import textwrap
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OUTPUT_BASE = Path(__file__).parent.parent / "docs" / "audit" / "evidence" / "explain" / "live"

# Hardcoded Udupi centre coordinates for school-radius query.
# Schools table is not populated by gen_perf_listings.py; use a fixed
# representative point near the Udupi city centre.
SCHOOL_LAT = 13.3409
SCHOOL_LON = 74.7421
SCHOOL_RADIUS_M = 2000.0

# Bounding box for bbox query (Udupi core area)
BBOX_SOUTH = 13.32
BBOX_WEST = 74.72
BBOX_NORTH = 13.36
BBOX_EAST = 74.77

# Window size for QP-5 ROW_NUMBER partition
AREA_LISTING_WINDOW = 5

# ---------------------------------------------------------------------------
# Base WHERE clause (reused across multiple query paths)
# Source: DiscoverListingPredicateBuilder.java — buildBasePredicates()
# ---------------------------------------------------------------------------

BASE_WHERE = """pl.status = 'LIVE'
  AND pl.archived_at IS NULL
  AND pl.is_duplicate = false
  AND pl.area_key IN (
    SELECT a.area_key FROM areas a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = %s
  )"""

# ---------------------------------------------------------------------------
# Query definitions
# ---------------------------------------------------------------------------

class QueryDef(NamedTuple):
    id: str
    description: str
    sql: str
    params_template: str  # human-readable params for dry-run


# Source: DiscoverController.GET /api/discover/cities/{city}/listings → COUNT(*)
QP_1A = QueryDef(
    id="QP-1a",
    description="Listings COUNT (city only)",
    sql=f"""SELECT COUNT(*)
FROM property_listings pl
WHERE {BASE_WHERE}""",
    params_template="city_slug={city_slug}",
)

# Source: DiscoverController.GET /api/discover/cities/{city}/listings → page query
# Lateral hero-image subquery mirrors ListingRepository.findByCityWithHeroImage()
QP_1B = QueryDef(
    id="QP-1b",
    description="Listings SELECT page (city only, with lateral hero-image)",
    sql=f"""SELECT pl.id, pl.title, pl.locality, pl.price_paise, pl.latitude, pl.longitude,
       pl.property_type, pl.bedrooms, pl.status, pl.created_at,
       (SELECT li.url FROM listing_images li
        WHERE li.listing_id = pl.id
        ORDER BY li.position, li.id LIMIT 1) AS hero_image_url
FROM property_listings pl
WHERE {BASE_WHERE}
ORDER BY pl.created_at DESC LIMIT 20 OFFSET 0""",
    params_template="city_slug={city_slug}",
)

# Source: DiscoverListingPredicateBuilder.java — buildSchoolRadiusPredicate()
# Uses ST_DWithin on the geography column (pl.geog) with GiST index expected
QP_1C = QueryDef(
    id="QP-1c",
    description="Listings SELECT with school-radius (ST_DWithin)",
    sql=f"""SELECT pl.id, pl.title, pl.locality, pl.price_paise, pl.latitude, pl.longitude,
       pl.property_type, pl.bedrooms, pl.status, pl.created_at,
       (SELECT li.url FROM listing_images li
        WHERE li.listing_id = pl.id
        ORDER BY li.position, li.id LIMIT 1) AS hero_image_url
FROM property_listings pl
WHERE {BASE_WHERE}
  AND ST_DWithin(pl.geog, ST_MakePoint(%s, %s)::geography, %s)
ORDER BY pl.created_at DESC LIMIT 20 OFFSET 0""",
    params_template=f"city_slug={{city_slug}}, lon={SCHOOL_LON}, lat={SCHOOL_LAT}, radius_m={SCHOOL_RADIUS_M}",
)

# Source: DiscoverListingPredicateBuilder.java — buildFtsPredicate()
# Uses websearch_to_tsquery on the V18 search_vector GIN-indexed column
QP_1D = QueryDef(
    id="QP-1d",
    description="Listings SELECT with FTS keyword",
    sql=f"""SELECT pl.id, pl.title, pl.locality, pl.price_paise, pl.latitude, pl.longitude,
       pl.property_type, pl.bedrooms, pl.status, pl.created_at,
       (SELECT li.url FROM listing_images li
        WHERE li.listing_id = pl.id
        ORDER BY li.position, li.id LIMIT 1) AS hero_image_url
FROM property_listings pl
WHERE {BASE_WHERE}
  AND pl.search_vector @@ websearch_to_tsquery('english', %s)
ORDER BY pl.created_at DESC LIMIT 20 OFFSET 0""",
    params_template="city_slug={city_slug}, q='apartment udupi'",
)

# Source: DiscoverController.GET /api/discover/cities/{city}/aggregates
QP_2 = QueryDef(
    id="QP-2",
    description="Aggregates GROUP BY locality",
    sql=f"""SELECT pl.locality, COUNT(*) AS count
FROM property_listings pl
WHERE {BASE_WHERE}
GROUP BY pl.locality
ORDER BY count DESC LIMIT 6""",
    params_template="city_slug={city_slug}",
)

# Source: DiscoverController.GET /api/discover/markers (city-only path)
# LIMIT 1001 is the sentinel: >1000 triggers the "too many markers" client hint
QP_3A = QueryDef(
    id="QP-3a",
    description="Markers city-only (LIMIT 1001)",
    sql=f"""SELECT pl.id, pl.latitude, pl.longitude, pl.price_paise, pl.locality
FROM property_listings pl
WHERE {BASE_WHERE}
ORDER BY pl.id LIMIT 1001""",
    params_template="city_slug={city_slug}",
)

# Source: DiscoverListingPredicateBuilder.java — buildBboxPredicate()
# && operator on geography column; GiST index expected
QP_3B = QueryDef(
    id="QP-3b",
    description="Markers with bbox (&& operator)",
    sql=f"""SELECT pl.id, pl.latitude, pl.longitude, pl.price_paise, pl.locality
FROM property_listings pl
WHERE {BASE_WHERE}
  AND pl.geog && ST_MakeEnvelope(%s, %s, %s, %s, 4326)::geography
ORDER BY pl.id LIMIT 1001""",
    params_template=f"city_slug={{city_slug}}, west={BBOX_WEST}, south={BBOX_SOUTH}, east={BBOX_EAST}, north={BBOX_NORTH}",
)

# Source: DiscoverController.GET /api/discover/cities/{city}/area-listings
# ROW_NUMBER() OVER (PARTITION BY area_key) mirrors DiscoverService.getCityAreaListings()
QP_5 = QueryDef(
    id="QP-5",
    description="City-area listings (ROW_NUMBER OVER PARTITION BY area_key)",
    sql=f"""SELECT * FROM (
  SELECT pl.id, pl.title, pl.locality, pl.price_paise, pl.latitude, pl.longitude,
         pl.property_type, pl.bedrooms, pl.area_key, pl.created_at,
         ROW_NUMBER() OVER (PARTITION BY pl.area_key ORDER BY pl.created_at DESC) AS rn
  FROM property_listings pl
  JOIN areas a ON pl.area_key = a.area_key
  JOIN cities c ON c.id = a.city_id
  WHERE pl.status = 'LIVE'
    AND pl.archived_at IS NULL
    AND pl.is_duplicate = false
    AND c.slug = %s
) sub WHERE sub.rn <= %s""",
    params_template=f"city_slug={{city_slug}}, window={AREA_LISTING_WINDOW}",
)

ALL_QUERIES: list[QueryDef] = [QP_1A, QP_1B, QP_1C, QP_1D, QP_2, QP_3A, QP_3B, QP_5]

QUERY_MAP: dict[str, QueryDef] = {q.id: q for q in ALL_QUERIES}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_db_url_display(db_url: str) -> str:
    """Return only host/port/dbname from a connection URL. Never logs password."""
    try:
        parsed = urlparse(db_url)
        host = parsed.hostname or "unknown"
        port = parsed.port or 5432
        dbname = (parsed.path or "/unknown").lstrip("/")
        return f"{host}:{port}/{dbname}"
    except Exception:
        return "<unparseable url>"


def _build_params(query: QueryDef, city_slug: str) -> tuple:
    """Return the parameter tuple for a given query and city slug."""
    if query.id == "QP-1a":
        return (city_slug,)
    elif query.id == "QP-1b":
        return (city_slug,)
    elif query.id == "QP-1c":
        return (city_slug, SCHOOL_LON, SCHOOL_LAT, SCHOOL_RADIUS_M)
    elif query.id == "QP-1d":
        return (city_slug, "apartment udupi")
    elif query.id == "QP-2":
        return (city_slug,)
    elif query.id == "QP-3a":
        return (city_slug,)
    elif query.id == "QP-3b":
        return (city_slug, BBOX_WEST, BBOX_SOUTH, BBOX_EAST, BBOX_NORTH)
    elif query.id == "QP-5":
        return (city_slug, AREA_LISTING_WINDOW)
    else:
        raise ValueError(f"Unknown query id: {query.id}")


def _parse_explain_output(explain_text: str) -> tuple[float | None, str | None, bool]:
    """
    Parse EXPLAIN ANALYZE text output.

    Returns:
        (execution_time_ms, first_node_type, index_used)
    """
    execution_time: float | None = None
    first_node_type: str | None = None
    index_used = False

    for line in explain_text.splitlines():
        # "Execution Time: 12.345 ms"
        m = re.search(r"Execution Time:\s*([\d.]+)\s*ms", line)
        if m:
            execution_time = float(m.group(1))

        # First node type is on the first "-> " or the top-level plan line
        if first_node_type is None:
            m = re.match(r"\s*(?:->\s*)?([\w ]+)\s+\(", line)
            if m:
                first_node_type = m.group(1).strip()

        if "Index" in line and ("Scan" in line or "Only" in line):
            index_used = True

    return execution_time, first_node_type, index_used


# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

def run_preflight(cur, count_check: int) -> None:
    """
    Run pre-flight checks against the target database.

    Raises SystemExit on failure with a clear message.
    """
    print("\n--- Pre-flight checks ---")

    # Check property_listings row count
    cur.execute("SELECT COUNT(*) FROM property_listings")
    pl_count = cur.fetchone()[0]
    print(f"  property_listings: {pl_count:,} rows")
    if pl_count < count_check:
        print(
            f"\nERROR: property_listings has {pl_count:,} rows, "
            f"expected at least {count_check:,} (--count-check={count_check}).\n"
            f"Run: python scripts/gen_perf_listings.py --count={count_check} --db-url=<url>",
            file=sys.stderr,
        )
        sys.exit(1)

    # Check areas table
    cur.execute("SELECT COUNT(*) FROM areas")
    areas_count = cur.fetchone()[0]
    print(f"  areas:             {areas_count:,} rows")
    if areas_count < 1:
        print(
            "\nERROR: areas table is empty. The harness queries require at least one area.\n"
            "Ensure the database has been migrated and seeded.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Check cities table
    cur.execute("SELECT COUNT(*) FROM cities")
    cities_count = cur.fetchone()[0]
    print(f"  cities:            {cities_count:,} rows")
    if cities_count < 1:
        print(
            "\nERROR: cities table is empty. The harness queries require at least one city.\n"
            "Ensure the database has been migrated and seeded.",
            file=sys.stderr,
        )
        sys.exit(1)

    print("--- Pre-flight OK ---\n")


# ---------------------------------------------------------------------------
# Dry-run output
# ---------------------------------------------------------------------------

def dry_run(queries: list[QueryDef], city_slug: str, volume: str) -> None:
    """Print SQL + params to stdout without connecting to DB."""
    output_base = OUTPUT_BASE / volume
    print(f"\n[DRY RUN] Would write results to: {output_base}/\n")

    for query in queries:
        params_display = query.params_template.format(city_slug=city_slug)
        output_file = output_base / f"{query.id}.txt"
        print("=" * 70)
        print(f"Query: {query.id} — {query.description}")
        print(f"Output: {output_file}")
        print(f"Params: {params_display}")
        print(f"\nSQL:\n{textwrap.indent(query.sql, '  ')}")
        print()


# ---------------------------------------------------------------------------
# Main execution
# ---------------------------------------------------------------------------

def run_harness(
    db_url: str,
    volume: str,
    queries: list[QueryDef],
    city_slug: str,
    count_check: int,
) -> None:
    try:
        import psycopg2
    except ImportError:
        print(
            "ERROR: psycopg2 not installed.\n"
            "Run: pip install -r scripts/requirements-perf.txt",
            file=sys.stderr,
        )
        sys.exit(1)

    display_url = _safe_db_url_display(db_url)
    print(f"Connecting to: {display_url}")

    try:
        conn = psycopg2.connect(db_url)
    except Exception as exc:
        print(f"\nERROR: Cannot connect to database ({display_url}): {exc}", file=sys.stderr)
        sys.exit(1)

    # Set session to READ ONLY — never commits writes
    conn.set_session(readonly=True, autocommit=False)

    output_dir = OUTPUT_BASE / volume
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {output_dir}")

    summary_rows: list[dict] = []

    try:
        cur = conn.cursor()

        # Pre-flight checks
        run_preflight(cur, count_check)

        # Run EXPLAIN ANALYZE for each query
        for query in queries:
            params = _build_params(query, city_slug)
            explain_sql = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) {query.sql}"
            output_file = output_dir / f"{query.id}.txt"

            print(f"Running {query.id}: {query.description} ...", end=" ", flush=True)
            start_ts = datetime.now(tz=timezone.utc)

            try:
                cur.execute(explain_sql, params)
                rows = cur.fetchall()
                explain_text = "\n".join(row[0] for row in rows)

                exec_ms, plan_type, index_used = _parse_explain_output(explain_text)
                elapsed_label = f"{exec_ms:.3f} ms" if exec_ms is not None else "N/A"
                print(f"done ({elapsed_label})")

                # Write output file
                header = (
                    f"Query:     {query.id} — {query.description}\n"
                    f"Timestamp: {start_ts.isoformat()}\n"
                    f"Volume:    {volume}\n"
                    f"City:      {city_slug}\n"
                    f"Exec time: {elapsed_label}\n"
                    f"{'=' * 70}\n\n"
                )
                output_file.write_text(header + explain_text + "\n", encoding="utf-8")

                summary_rows.append(
                    {
                        "id": query.id,
                        "exec_ms": exec_ms,
                        "plan_type": plan_type or "unknown",
                        "index_used": index_used,
                    }
                )

            except Exception as exc:
                print(f"ERROR")
                print(f"  {query.id} failed: {exc}", file=sys.stderr)
                summary_rows.append(
                    {
                        "id": query.id,
                        "exec_ms": None,
                        "plan_type": "ERROR",
                        "index_used": False,
                        "error": str(exc),
                    }
                )
                # Reset the connection state after error so remaining queries can run
                conn.rollback()
                conn.set_session(readonly=True, autocommit=False)
                continue

    finally:
        # Always rollback — READ ONLY session, this is defensive belt-and-suspenders
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()

    # Print summary table
    print()
    print("=" * 70)
    print(f"{'Query':<10} {'Runtime (ms)':>14} {'Plan type':<35} {'Index used?':>12}")
    print("-" * 70)
    for row in summary_rows:
        rt = f"{row['exec_ms']:.3f}" if row["exec_ms"] is not None else "ERROR"
        idx = "YES" if row["index_used"] else "no"
        print(f"{row['id']:<10} {rt:>14} {row['plan_type']:<35} {idx:>12}")
    print("=" * 70)
    print(f"\nResults written to: {output_dir}/")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="EXPLAIN ANALYZE harness for Discover query performance baseline.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              # Run all queries at 10k volume
              python scripts/run_explain_harness.py --volume=10k

              # Run a single query path
              python scripts/run_explain_harness.py --volume=10k --query=QP-1c

              # Dry run: print SQL without connecting to DB
              python scripts/run_explain_harness.py --dry-run

            Query paths:
              QP-1a  Listings COUNT (city only)
              QP-1b  Listings SELECT page (city only, lateral hero-image)
              QP-1c  Listings SELECT with school-radius (ST_DWithin)
              QP-1d  Listings SELECT with FTS keyword
              QP-2   Aggregates GROUP BY locality
              QP-3a  Markers city-only (LIMIT 1001)
              QP-3b  Markers with bbox (&& operator)
              QP-5   City-area listings (ROW_NUMBER OVER PARTITION BY area_key)
        """),
    )
    parser.add_argument(
        "--volume",
        default="baseline",
        metavar="LABEL",
        help="Tag for output subdir (e.g. 10k, 100k, 500k). Default: baseline",
    )
    parser.add_argument(
        "--query",
        default=None,
        metavar="ID",
        choices=list(QUERY_MAP.keys()),
        help="Run a single query path (QP-1a … QP-5). Default: all",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print SQL + params to stdout. Do NOT connect to DB or write files.",
    )
    parser.add_argument(
        "--db-url",
        default=None,
        metavar="URL",
        help="Database connection URL. Falls back to PERF_DB_URL env var.",
    )
    parser.add_argument(
        "--city-slug",
        default="udupi",
        metavar="SLUG",
        help="City slug to query against. Default: udupi",
    )
    parser.add_argument(
        "--count-check",
        type=int,
        default=1000,
        metavar="N",
        help="Minimum expected row count in property_listings. Default: 1000",
    )

    args = parser.parse_args()

    # Resolve query list
    queries = [QUERY_MAP[args.query]] if args.query else ALL_QUERIES

    # Dry-run path: no DB connection needed
    if args.dry_run:
        dry_run(queries, args.city_slug, args.volume)
        return

    # Resolve DB URL
    db_url = args.db_url or os.environ.get("PERF_DB_URL")
    if not db_url:
        print(
            "ERROR: No database URL provided.\n"
            "Set PERF_DB_URL environment variable or pass --db-url=<url>.",
            file=sys.stderr,
        )
        sys.exit(1)

    run_harness(
        db_url=db_url,
        volume=args.volume,
        queries=queries,
        city_slug=args.city_slug,
        count_check=args.count_check,
    )


if __name__ == "__main__":
    main()
