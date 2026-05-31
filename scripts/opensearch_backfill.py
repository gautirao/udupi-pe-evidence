#!/usr/bin/env python3
# WARNING: DATABASE_URL must point to local/perf DB only. Never run against production.
"""
OpenSearch backfill script — issue #1309.

Reads LIVE property_listings rows from Postgres and bulk-indexes them into
the 'listings_poc' OpenSearch index.  Intended for local POC use only.

Usage:
    export DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
    export OPENSEARCH_URL=http://localhost:9200   # optional, default shown
    python scripts/opensearch_backfill.py [--batch-size 500] [--count 1000]
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

import psycopg2
import psycopg2.extras
from opensearchpy import OpenSearch
from opensearchpy.helpers import bulk

# ---------------------------------------------------------------------------
# Index configuration
# ---------------------------------------------------------------------------

INDEX_NAME = "listings_poc"

INDEX_MAPPING: dict[str, Any] = {
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 0,
    },
    "mappings": {
        "properties": {
            "id": {"type": "keyword"},
            "title": {
                "type": "text",
                "fields": {"keyword": {"type": "keyword", "ignore_above": 512}},
            },
            "locality": {
                "type": "text",
                "fields": {"keyword": {"type": "keyword", "ignore_above": 256}},
            },
            "description": {"type": "text"},
            "area_key": {"type": "keyword"},
            # city_slug: derived via areas→cities join (area_key → areas.city_id → cities.slug).
            # NOT parsed from area_key — area_key is opaque; city_slug is always fetched via join.
            "city_slug": {"type": "keyword"},
            "property_type": {"type": "keyword"},
            "seller_type": {"type": "keyword"},
            "bedrooms": {"type": "integer"},
            "bathrooms": {"type": "integer"},
            "price_paise": {"type": "long"},
            "latitude": {"type": "float"},
            "longitude": {"type": "float"},
            # geo_point for spatial queries (derived from latitude + longitude)
            "location": {"type": "geo_point"},
            "status": {"type": "keyword"},
            "created_at": {"type": "date"},
            # hero_image_url: lowest-position image url from listing_images
            # (ORDER BY position ASC, id ASC LIMIT 1). NULL when no image exists.
            "hero_image_url": {"type": "keyword"},
        }
    },
}

# Explicit column whitelist — never use SELECT *.
# city_slug: derived via LEFT JOIN areas → cities (area_key → city_id → slug).
#   Never parsed from area_key — area_key is opaque and must not be string-split.
#   NULL-safe: listing with no matching area or city gets city_slug = NULL.
# hero_image_url: correlated subquery — lowest-position image (ORDER BY position ASC, id ASC LIMIT 1).
#   NULL-safe: listing with no listing_images rows gets hero_image_url = NULL.
# Security: no PII columns (user_id, seller_id, phone, email, supabase_user_id, rejectionReason).
SELECT_SQL = """
SELECT
    pl.id,
    pl.title,
    pl.locality,
    pl.description,
    pl.area_key,
    pl.property_type,
    pl.seller_type,
    pl.bedrooms,
    pl.bathrooms,
    pl.price_paise,
    pl.latitude,
    pl.longitude,
    pl.status,
    pl.created_at,
    c.slug AS city_slug,
    (
        SELECT li.url
        FROM listing_images li
        WHERE li.listing_id = pl.id
        ORDER BY li.position ASC, li.id ASC
        LIMIT 1
    ) AS hero_image_url
FROM property_listings pl
LEFT JOIN areas a ON a.area_key = pl.area_key
LEFT JOIN cities c ON c.id = a.city_id
WHERE pl.status = 'LIVE'
ORDER BY pl.id
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _safe_db_url_display(url: str) -> str:
    """Return a credential-stripped version of a Postgres URL for logging."""
    try:
        from urllib.parse import urlparse, urlunparse
        parsed = urlparse(url)
        safe = parsed._replace(netloc=f"****:****@{parsed.hostname}:{parsed.port}")
        return urlunparse(safe)
    except Exception:
        return "<db-url>"


def _build_opensearch_client(url: str) -> OpenSearch:
    """Build an OpenSearch client from a base URL (no credentials logged)."""
    from urllib.parse import urlparse
    parsed = urlparse(url)
    hosts = [{"host": parsed.hostname, "port": parsed.port or 9200}]
    scheme = parsed.scheme or "http"
    return OpenSearch(hosts=hosts, http_compress=True, use_ssl=(scheme == "https"))


def _paginate_sql(base: str, limit: int, offset: int) -> str:
    """
    Append LIMIT/OFFSET to a base SQL string.

    Strips any trailing whitespace and semicolons from *base* before appending
    so a future edit to SELECT_SQL (trailing newline, added semicolon) cannot
    silently corrupt pagination.  limit/offset are always ints — no user input.
    """
    clean = base.rstrip().rstrip(";")
    return f"{clean} LIMIT {limit} OFFSET {offset}"


def _ensure_index(client: OpenSearch) -> None:
    """Create the index with explicit mapping if it does not already exist."""
    if client.indices.exists(index=INDEX_NAME):
        print(f"Index '{INDEX_NAME}' already exists — skipping creation.")
        return
    client.indices.create(index=INDEX_NAME, body=INDEX_MAPPING)
    print(f"Created index '{INDEX_NAME}'.")


def _row_to_doc(row: dict) -> dict | None:
    """
    Convert a Postgres row dict to an OpenSearch document dict.
    Returns None if latitude or longitude is NULL (skip + caller counts).
    """
    lat = row.get("latitude")
    lon = row.get("longitude")
    if lat is None or lon is None:
        return None

    created_at = row.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()

    doc: dict[str, Any] = {
        "_index": INDEX_NAME,
        "_id": str(row["id"]),
        "_source": {
            "id": str(row["id"]),
            "title": row.get("title"),
            "locality": row.get("locality"),
            "description": row.get("description"),
            "area_key": row.get("area_key"),
            # city_slug: comes from the areas→cities join in SELECT_SQL; may be None
            "city_slug": row.get("city_slug"),
            "property_type": row.get("property_type"),
            "seller_type": row.get("seller_type"),
            "bedrooms": row.get("bedrooms"),
            "bathrooms": row.get("bathrooms"),
            "price_paise": row.get("price_paise"),
            "latitude": float(lat),
            "longitude": float(lon),
            # geo_point derived from latitude + longitude
            "location": {"lat": float(lat), "lon": float(lon)},
            "status": row.get("status"),
            "created_at": created_at,
            # hero_image_url: lowest-position image; may be None when no images exist
            "hero_image_url": row.get("hero_image_url"),
        },
    }
    # Omit null-valued optional fields so the index stays lean;
    # presence/absence is treated as None by callers either way.
    if doc["_source"]["city_slug"] is None:
        del doc["_source"]["city_slug"]
    if doc["_source"]["hero_image_url"] is None:
        del doc["_source"]["hero_image_url"]
    return doc


# ---------------------------------------------------------------------------
# Main backfill logic
# ---------------------------------------------------------------------------


def run_backfill(args: argparse.Namespace) -> None:
    db_url = args.db_url
    if not db_url:
        print("ERROR: DATABASE_URL is not set. Export it before running.", file=sys.stderr)
        sys.exit(1)

    opensearch_url = args.url
    if not opensearch_url:
        print("ERROR: OPENSEARCH_URL is not set. Export it or pass --url.", file=sys.stderr)
        sys.exit(1)

    print(f"Connecting to Postgres: {_safe_db_url_display(db_url)}")
    print(f"OpenSearch URL: {opensearch_url}")

    client = _build_opensearch_client(opensearch_url)
    _ensure_index(client)

    conn = psycopg2.connect(db_url)
    conn.set_session(readonly=True, autocommit=True)

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Determine total count for progress reporting
            count_sql = "SELECT COUNT(*) FROM property_listings WHERE status = 'LIVE'"
            cur.execute(count_sql)
            total_live: int = cur.fetchone()["count"]  # type: ignore[index]

            if args.count:
                total_live = min(total_live, args.count)

            batch_size = args.batch_size
            total_batches = (total_live + batch_size - 1) // batch_size if total_live else 1

            print(f"Total LIVE rows to index: {total_live} | batch_size={batch_size} | batches={total_batches}")

            offset = 0
            batch_num = 0
            total_indexed = 0
            total_skipped = 0
            total_city_slug_null = 0
            total_hero_null = 0
            overall_start = time.perf_counter()

            while offset < total_live:
                limit = min(batch_size, total_live - offset)
                paged_sql = _paginate_sql(SELECT_SQL, limit, offset)

                batch_start = time.perf_counter()
                cur.execute(paged_sql)
                rows = cur.fetchall()

                docs = []
                skipped = 0
                for row in rows:
                    row_dict = dict(row)
                    doc = _row_to_doc(row_dict)
                    if doc is None:
                        skipped += 1
                    else:
                        docs.append(doc)
                        # Track null coverage for post-run summary
                        if row_dict.get("city_slug") is None:
                            total_city_slug_null += 1
                        if row_dict.get("hero_image_url") is None:
                            total_hero_null += 1

                total_skipped += skipped

                if docs:
                    response = bulk(client, docs, raise_on_error=False)
                    success_count, errors = response[0], response[1]
                    if errors:
                        failed_count = len(errors)
                        print(
                            f"  WARNING: Batch {batch_num + 1}/{total_batches}: "
                            f"{failed_count} docs failed to index."
                        )
                        for err in errors[:5]:  # log first 5 errors only
                            print(f"    Error: {err}")
                    indexed_this_batch = success_count
                else:
                    indexed_this_batch = 0

                batch_ms = (time.perf_counter() - batch_start) * 1000
                docs_per_sec = (indexed_this_batch / (batch_ms / 1000)) if batch_ms > 0 else 0
                batch_num += 1

                print(
                    f"Batch {batch_num}/{total_batches}: indexed {indexed_this_batch} docs "
                    f"in {batch_ms:.1f}ms, {docs_per_sec:.0f} docs/sec"
                    + (f" (skipped {skipped} null-coord rows)" if skipped else "")
                )

                total_indexed += indexed_this_batch
                offset += limit

            # Refresh index so queries see all indexed docs immediately
            client.indices.refresh(index=INDEX_NAME)

            overall_elapsed = time.perf_counter() - overall_start
            overall_docs_per_sec = (total_indexed / overall_elapsed) if overall_elapsed > 0 else 0

            print(
                f"\nBackfill complete: {total_indexed} docs indexed in "
                f"{overall_elapsed:.1f}s ({overall_docs_per_sec:.0f} docs/sec total)"
            )
            if total_skipped:
                print(f"Skipped {total_skipped} rows with null coordinates")

            # Null-coverage summary for new fields
            city_slug_non_null = total_indexed - total_city_slug_null
            hero_non_null = total_indexed - total_hero_null
            print(
                f"city_slug:      {city_slug_non_null} non-null / {total_city_slug_null} null"
            )
            print(
                f"hero_image_url: {hero_non_null} non-null / {total_hero_null} null"
            )
            if total_city_slug_null == total_indexed and total_indexed > 0:
                print(
                    "WARNING: city_slug is 100% null among indexed rows — seeded area_keys "
                    "may not be present in the 'areas' table, or areas lack a cities join. "
                    "Acceptable for POC seed; verify with production data."
                )
            if total_hero_null == total_indexed and total_indexed > 0:
                print(
                    "WARNING: hero_image_url is 100% null among indexed rows — "
                    "gen_perf_listings.py did not seed listing_images rows for this dataset. "
                    "Acceptable for POC seed; verify with production data."
                )
            print(
                "\nNOTE: If you modified the index mapping (added city_slug/hero_image_url), "
                "an existing index will have the OLD mapping. To apply the new mapping:\n"
                "  docker compose -f docker-compose.opensearch.yml down -v\n"
                "  Then re-run this backfill script."
            )

    finally:
        conn.close()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Backfill LIVE property_listings into OpenSearch 'listings_poc' index."
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("OPENSEARCH_URL", "http://localhost:9200"),
        help="OpenSearch base URL (default: $OPENSEARCH_URL or http://localhost:9200)",
    )
    parser.add_argument(
        "--db-url",
        default=os.environ.get("DATABASE_URL", ""),
        help="Postgres connection URL (default: $DATABASE_URL)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        metavar="N",
        help="Number of rows per bulk batch (default: 500)",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=None,
        metavar="N",
        help="Limit total rows indexed (useful for testing; default: all LIVE rows)",
    )
    return parser


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()
    run_backfill(args)


if __name__ == "__main__":
    main()
