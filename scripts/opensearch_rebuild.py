#!/usr/bin/env python3
# WARNING: DATABASE_URL and OPENSEARCH_URL must point to local/dev environments only.
# Pass --allow-non-localhost to override the safety gate (NOT for production use).
"""
OpenSearch full-rebuild backfill — issue #1315.
Supersedes scripts/opensearch_backfill.py for production-grade full-rebuild use.

Creates a new versioned index (listings_v{YYYYMMDD_HHMMSS}), bulk-indexes all LIVE
property listings, validates count, then atomically swaps the listings_read alias.

Usage:
    export DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
    export OPENSEARCH_URL=http://localhost:9200
    python scripts/opensearch_rebuild.py [options]

    # First run (no alias yet):
    python scripts/opensearch_rebuild.py

    # Subsequent run with cleanup of old index:
    python scripts/opensearch_rebuild.py --cleanup-old

    # Allow small delta (race window):
    python scripts/opensearch_rebuild.py --max-count-delta 5

    # Dry run (SQL + count only; no indexing or alias swap):
    python scripts/opensearch_rebuild.py --dry-run

    # Clean up abandoned versioned indexes (not pointed to by alias):
    python scripts/opensearch_rebuild.py --cleanup-stale --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from typing import Any

import psycopg2
import psycopg2.extras
from opensearchpy import NotFoundError, OpenSearch
from opensearchpy.helpers import bulk

# ---------------------------------------------------------------------------
# Index configuration
# ---------------------------------------------------------------------------

ALIAS_NAME = "listings_read"
INDEX_NAME_PREFIX = "listings_v"

# Reused verbatim from opensearch_backfill.py (issue #1309).
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
            # city_slug: derived via areas->cities join (area_key -> areas.city_id -> cities.slug).
            # NOT parsed from area_key -- area_key is opaque; city_slug is always fetched via join.
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

# Explicit column whitelist -- never use SELECT *.
# city_slug: derived via LEFT JOIN areas -> cities (area_key -> city_id -> slug).
#   Never parsed from area_key -- area_key is opaque and must not be string-split.
#   NULL-safe: listing with no matching area or city gets city_slug = NULL.
# hero_image_url: correlated subquery -- lowest-position image (ORDER BY position ASC, id ASC LIMIT 1).
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
# Helpers (reused verbatim from opensearch_backfill.py where noted)
# ---------------------------------------------------------------------------


def _safe_db_url_display(url: str) -> str:
    """Return a credential-stripped version of a Postgres URL for logging."""
    try:
        parsed = urllib.parse.urlparse(url)
        safe = parsed._replace(netloc=f"****:****@{parsed.hostname}:{parsed.port}")
        return urllib.parse.urlunparse(safe)
    except Exception:
        return "<db-url>"


def _build_opensearch_client(url: str) -> OpenSearch:
    """Build an OpenSearch client from a base URL (no credentials logged)."""
    parsed = urllib.parse.urlparse(url)
    hosts = [{"host": parsed.hostname, "port": parsed.port or 9200}]
    scheme = parsed.scheme or "http"
    return OpenSearch(hosts=hosts, http_compress=True, use_ssl=(scheme == "https"))


def _paginate_sql(base: str, limit: int, offset: int) -> str:
    """
    Append LIMIT/OFFSET to a base SQL string.

    Strips any trailing whitespace and semicolons from *base* before appending
    so a future edit to SELECT_SQL (trailing newline, added semicolon) cannot
    silently corrupt pagination.  limit/offset are always ints -- no user input.
    """
    clean = base.rstrip().rstrip(";")
    return f"{clean} LIMIT {limit} OFFSET {offset}"


def _row_to_doc(row: dict, index_name: str) -> dict | None:
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
        "_index": index_name,
        "_id": str(row["id"]),
        "_source": {
            "id": str(row["id"]),
            "title": row.get("title"),
            "locality": row.get("locality"),
            "description": row.get("description"),
            "area_key": row.get("area_key"),
            # city_slug: comes from the areas->cities join in SELECT_SQL; may be None
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
# New helpers for full-rebuild logic (issue #1315)
# ---------------------------------------------------------------------------


def _generate_index_name() -> str:
    """Return a timestamped versioned index name: listings_v{YYYYMMDD_HHMMSS}."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"{INDEX_NAME_PREFIX}{ts}"


def _is_safe_url(url: str) -> bool:
    """
    Return True if the URL's hostname resolves to localhost or loopback.

    hostname=None is treated as safe intentionally: it covers Unix socket paths
    (e.g. "unix:///var/run/postgresql"), empty strings, and docker-compose style
    URLs with no host component — all of which are local-process communication
    and cannot reach a remote server.
    """
    try:
        parsed = urllib.parse.urlparse(url)
        hostname = parsed.hostname  # None if no host component (Unix socket, empty URL, etc.)
        return hostname in {"localhost", "127.0.0.1", "::1", None}
    except Exception:
        return False


def _check_safety_gates(args: argparse.Namespace) -> None:
    """
    Abort with exit code 1 if either URL points outside localhost and
    --allow-non-localhost was not passed.
    """
    if args.allow_non_localhost:
        return

    if not _is_safe_url(args.url):
        print(
            f"ERROR: OPENSEARCH_URL '{args.url}' does not appear to be a local/dev instance. "
            "Pass --allow-non-localhost to override (NOT for production use).",
            file=sys.stderr,
        )
        sys.exit(1)

    if not _is_safe_url(args.db_url):
        print(
            f"ERROR: DATABASE_URL '{_safe_db_url_display(args.db_url)}' does not appear to be a "
            "local/dev instance. Pass --allow-non-localhost to override (NOT for production use).",
            file=sys.stderr,
        )
        sys.exit(1)


def _create_fresh_index(client: OpenSearch, index_name: str) -> None:
    """Create a new index with the standard mapping. Raises if it already exists."""
    client.indices.create(index=index_name, body=INDEX_MAPPING)
    print(f"Created index '{index_name}'.")


def _get_alias_current_target(client: OpenSearch, alias: str) -> str | None:
    """
    Return the single index name the alias currently points to, or None if the
    alias does not exist yet (first run).

    Raises RuntimeError if the alias unexpectedly points to multiple indices.
    """
    try:
        result = client.indices.get_alias(name=alias)
    except NotFoundError:
        return None

    indices = list(result.keys())
    if len(indices) == 0:
        return None
    if len(indices) > 1:
        raise RuntimeError(
            f"Alias '{alias}' points to multiple indices: {indices}. "
            "Manual intervention required before rebuild."
        )
    return indices[0]


def _atomic_alias_swap(
    client: OpenSearch, alias: str, old_index: str | None, new_index: str
) -> None:
    """
    Atomically swap the alias from old_index to new_index in a single API call.

    OpenSearch processes the actions list atomically -- there is no read gap
    between the remove and the add.
    """
    actions = []
    if old_index is not None:
        actions.append({"remove": {"index": old_index, "alias": alias}})
    actions.append({"add": {"index": new_index, "alias": alias}})
    client.indices.update_aliases(body={"actions": actions})


def _validate_count(
    pg_live_count: int,
    null_coord_count: int,
    indexed_count: int,
    max_delta: int,
) -> bool:
    """
    Validate that the indexed document count matches expectations.

    The Postgres LIVE count is taken before bulk-indexing begins (step 4 of run_rebuild).
    A small race window exists: listings going LIVE between the count query and the end
    of indexing will appear as a negative delta (more indexed than expected). This is
    benign and covered by --max-count-delta.

    null_coord_count is the actual number of rows skipped during THIS run (not a
    separate DB query) -- callers accumulate it from _row_to_doc returning None.
    """
    expected = pg_live_count - null_coord_count
    delta = expected - indexed_count
    print(
        f"COUNT VALIDATION: pg_live={pg_live_count} null_coord_skipped={null_coord_count} "
        f"expected_indexed={expected} actual_indexed={indexed_count} delta={delta}"
    )
    return abs(delta) <= max_delta


def _list_stale_indexes(client: OpenSearch, alias: str) -> list[str]:
    """
    Return all versioned indices matching listings_v* that are NOT the current
    alias target (i.e. abandoned/stale indexes safe to delete).
    """
    current_target = _get_alias_current_target(client, alias)
    try:
        result = client.indices.get(index=f"{INDEX_NAME_PREFIX}*")
        all_versioned = list(result.keys())
    except NotFoundError:
        return []
    return [idx for idx in all_versioned if idx != current_target]


# ---------------------------------------------------------------------------
# Main rebuild logic
# ---------------------------------------------------------------------------


def run_rebuild(args: argparse.Namespace) -> None:
    db_url = args.db_url
    if not db_url:
        print("ERROR: DATABASE_URL is not set. Export it before running.", file=sys.stderr)
        sys.exit(1)

    opensearch_url = args.url
    if not opensearch_url:
        print("ERROR: OPENSEARCH_URL is not set. Export it or pass --url.", file=sys.stderr)
        sys.exit(1)

    # Step 1: safety gates (non-localhost check)
    _check_safety_gates(args)

    # Step 2: startup banner
    new_index_name = _generate_index_name()
    print("OpenSearch rebuild -- issue #1315")
    print(f"  New index name : {new_index_name}")
    print(f"  Alias          : {args.alias}")
    print(f"  DB URL         : {_safe_db_url_display(db_url)}")
    print(f"  OpenSearch URL : {opensearch_url}")
    if args.dry_run:
        print("  Mode           : DRY RUN (no indexing or alias swap)")

    # Step 3: connect to Postgres (read-only)
    conn = psycopg2.connect(db_url)
    conn.set_session(readonly=True, autocommit=True)

    overall_start = time.perf_counter()

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Step 4: get total LIVE count from Postgres.
            # NOTE: count is taken BEFORE bulk-indexing. A small race window exists
            # between this count and the end of indexing; use --max-count-delta to
            # tolerate it (see _validate_count docstring).
            count_sql = "SELECT COUNT(*) FROM property_listings WHERE status = 'LIVE'"
            cur.execute(count_sql)
            pg_live_count: int = cur.fetchone()["count"]  # type: ignore[index]

            is_partial_run = False
            if args.count:
                pg_live_count = min(pg_live_count, args.count)
                is_partial_run = True
                print(
                    f"WARNING: --count {args.count} is set -- this is a PARTIAL RUN. "
                    "Alias swap is suppressed. Index will NOT be aliased.",
                    file=sys.stderr,
                )

            print(f"Total LIVE rows in Postgres: {pg_live_count}")

            # Step 5: dry run -- print count and exit without touching OpenSearch
            if args.dry_run:
                print("DRY RUN: no indexing or alias swap")
                return

            # Step 6: connect to OpenSearch
            client = _build_opensearch_client(opensearch_url)

            # Capture old alias target before creating the new index
            old_target = _get_alias_current_target(client, args.alias)
            if old_target:
                print(f"  Current alias target: {old_target}")
            else:
                print(f"  No existing alias '{args.alias}' -- first run.")

            # Step 7: generate versioned index name (done above for banner)
            # Step 8: create fresh index
            _create_fresh_index(client, new_index_name)

            # Step 9: bulk-index all LIVE rows
            batch_size = args.batch_size
            total_batches = (pg_live_count + batch_size - 1) // batch_size if pg_live_count else 1
            print(
                f"Indexing into '{new_index_name}': "
                f"batch_size={batch_size}, batches={total_batches}"
            )

            offset = 0
            batch_num = 0
            total_indexed = 0
            total_skipped = 0  # null-coord rows skipped
            total_failures = 0
            total_city_slug_null = 0
            total_hero_null = 0

            while offset < pg_live_count:
                limit = min(batch_size, pg_live_count - offset)
                paged_sql = _paginate_sql(SELECT_SQL, limit, offset)

                batch_start = time.perf_counter()
                cur.execute(paged_sql)
                rows = cur.fetchall()

                docs = []
                skipped = 0
                for row in rows:
                    row_dict = dict(row)
                    doc = _row_to_doc(row_dict, new_index_name)
                    if doc is None:
                        skipped += 1
                    else:
                        docs.append(doc)
                        if row_dict.get("city_slug") is None:
                            total_city_slug_null += 1
                        if row_dict.get("hero_image_url") is None:
                            total_hero_null += 1

                total_skipped += skipped

                batch_failures = 0
                if docs:
                    response = bulk(client, docs, raise_on_error=False)
                    success_count, errors = response[0], response[1]
                    if errors:
                        batch_failures = len(errors)
                        total_failures += batch_failures
                        print(
                            f"  WARNING: Batch {batch_num + 1}/{total_batches}: "
                            f"{batch_failures} docs failed to index."
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
                    + (f" ({batch_failures} failures)" if batch_failures else "")
                )

                total_indexed += indexed_this_batch
                offset += limit

            # Abort if too many bulk failures -- new index left for inspection
            if total_failures > args.max_failures:
                print(
                    f"ERROR: {total_failures} bulk failures exceeded --max-failures={args.max_failures}. "
                    f"Alias NOT swapped. New index '{new_index_name}' preserved for inspection.",
                    file=sys.stderr,
                )
                sys.exit(1)

            # Step 10: refresh new index so queries see all indexed docs immediately
            client.indices.refresh(index=new_index_name)

            # Step 11: get actual indexed doc count from OpenSearch
            indexed_doc_count: int = client.count(index=new_index_name)["count"]

            # Step 12: count validation -- uses null_coord_count from this run (not a separate query)
            valid = _validate_count(
                pg_live_count, total_skipped, indexed_doc_count, args.max_count_delta
            )
            if not valid:
                print(
                    f"ERROR: COUNT VALIDATION FAILED -- alias NOT swapped. "
                    f"New index '{new_index_name}' preserved for inspection.",
                    file=sys.stderr,
                )
                sys.exit(1)

            # Step 13: atomic alias swap — suppressed for partial runs (--count set)
            if is_partial_run:
                print(
                    f"PARTIAL RUN: alias swap suppressed. New index '{new_index_name}' created but NOT aliased. "
                    "Remove --count to perform a full rebuild with alias swap.",
                    file=sys.stderr,
                )
                sys.exit(1)

            try:
                _atomic_alias_swap(client, args.alias, old_target, new_index_name)
            except Exception as exc:
                print(
                    f"ERROR: ALIAS SWAP FAILED -- alias unchanged. "
                    f"New index '{new_index_name}' preserved for inspection. "
                    f"Cause: {exc}",
                    file=sys.stderr,
                )
                sys.exit(1)

            # Step 14: confirm swap
            print(f"ALIAS SWAP OK: {args.alias} now -> {new_index_name}")

            # Step 15: optionally delete the old index
            if args.cleanup_old and old_target is not None:
                client.indices.delete(index=old_target)
                print(f"Deleted old index: {old_target}")

            # Step 16: optionally clean up all stale versioned indexes
            if args.cleanup_stale:
                stale = _list_stale_indexes(client, args.alias)
                # Exclude old_target if already deleted in step 15
                if args.cleanup_old and old_target is not None:
                    stale = [s for s in stale if s != old_target]
                for stale_idx in stale:
                    client.indices.delete(index=stale_idx)
                    print(f"Deleted stale index: {stale_idx}")
                if not stale:
                    print("No stale indexes to clean up.")

    finally:
        conn.close()

    # Step 17: final summary
    overall_elapsed = time.perf_counter() - overall_start
    overall_docs_per_sec = (total_indexed / overall_elapsed) if overall_elapsed > 0 else 0

    print(
        f"\nRebuild complete: {total_indexed} docs indexed in "
        f"{overall_elapsed:.1f}s ({overall_docs_per_sec:.0f} docs/sec)"
    )
    if total_skipped:
        print(f"Skipped {total_skipped} rows with null coordinates")
    if total_indexed > 0:
        city_slug_non_null = total_indexed - total_city_slug_null
        hero_non_null = total_indexed - total_hero_null
        print(f"city_slug:      {city_slug_non_null} non-null / {total_city_slug_null} null")
        print(f"hero_image_url: {hero_non_null} non-null / {total_hero_null} null")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Full rebuild of the OpenSearch listings_read alias. "
            "Creates a versioned index, bulk-indexes all LIVE rows, validates count, "
            "then atomically swaps the alias. (issue #1315)"
        )
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
    parser.add_argument(
        "--max-count-delta",
        type=int,
        default=0,
        metavar="N",
        help=(
            "Maximum allowed |expected - actual| indexed count before aborting alias swap "
            "(default: 0). Use --max-count-delta 5 to tolerate a small race window."
        ),
    )
    parser.add_argument(
        "--max-failures",
        type=int,
        default=0,
        metavar="N",
        help="Maximum allowed bulk indexing failures before aborting (default: 0)",
    )
    parser.add_argument(
        "--cleanup-old",
        action="store_true",
        help="Delete the previously-aliased index after a successful alias swap",
    )
    parser.add_argument(
        "--cleanup-stale",
        action="store_true",
        help=(
            "Delete all listings_v* indexes not pointed to by the alias "
            "(abandoned/stale from interrupted runs)"
        ),
    )
    parser.add_argument(
        "--allow-non-localhost",
        action="store_true",
        help=(
            "Bypass the localhost safety gate. "
            "DANGER: do NOT use against production OpenSearch or Postgres."
        ),
    )
    parser.add_argument(
        "--alias",
        default=ALIAS_NAME,
        help=f"OpenSearch alias name to manage (default: {ALIAS_NAME})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print Postgres LIVE count only; do not index or swap alias",
    )
    return parser


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()
    run_rebuild(args)
    sys.exit(0)


if __name__ == "__main__":
    main()
