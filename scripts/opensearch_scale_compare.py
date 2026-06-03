#!/usr/bin/env python3
# WARNING: --db-url and --opensearch-url must point to local/dev environments only.
# The localhost safety gate rejects any non-loopback OpenSearch address.
"""
OpenSearch scale comparison harness — issue #1313.

Bulk-indexes LIVE rows from a local perf Postgres DB into a scale-specific
OpenSearch index (listings_scale_{volume}), then runs 4 Discover query
patterns against BOTH Postgres and OpenSearch and emits a comparison table.

NEVER writes to the 'listings_read' production alias.

Usage:
    export PERF_DB_URL=postgresql://postgres:postgres@localhost:5434/postgres
    export OPENSEARCH_URL=http://localhost:9200

    # 10k run
    python scripts/opensearch_scale_compare.py --volume 10k

    # 100k run with cleanup
    python scripts/opensearch_scale_compare.py --volume 100k --cleanup

    # Dry run (localhost gate still runs; no DB/OS connections)
    python scripts/opensearch_scale_compare.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import re
import socket
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from typing import Any

import psycopg2
import psycopg2.extras
from opensearchpy import OpenSearch
from opensearchpy.helpers import bulk

# Make scripts/ importable regardless of working directory.
_SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)
from opensearch_auth import build_opensearch_client as _build_opensearch_client_impl  # noqa: E402

# ---------------------------------------------------------------------------
# Index configuration
# ---------------------------------------------------------------------------

# Scale-run indexes are NEVER the production alias — always listings_scale_{volume}.
ALIAS_NAME = "listings_read"  # referenced only to assert we never touch it

# 15-field mapping (reused from opensearch_backfill.py / opensearch_rebuild.py).
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
            # city_slug: derived via areas -> cities join; never parsed from area_key.
            "city_slug": {"type": "keyword"},
            "property_type": {"type": "keyword"},
            "seller_type": {"type": "keyword"},
            "bedrooms": {"type": "integer"},
            "bathrooms": {"type": "integer"},
            "price_paise": {"type": "long"},
            "latitude": {"type": "float"},
            "longitude": {"type": "float"},
            # geo_point derived from latitude + longitude
            "location": {"type": "geo_point"},
            "status": {"type": "keyword"},
            "created_at": {"type": "date"},
            # hero_image_url: lowest-position image url (ORDER BY position ASC, id ASC LIMIT 1).
            # NULL when no image exists.
            "hero_image_url": {"type": "keyword"},
        }
    },
}

# Explicit column whitelist — never use SELECT *.
# city_slug: derived via LEFT JOIN areas -> cities (area_key -> city_id -> slug).
# hero_image_url: correlated subquery — lowest-position image.
# Security: no PII columns (user_id, seller_id, phone, email, supabase_user_id).
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
  AND pl.latitude IS NOT NULL
  AND pl.longitude IS NOT NULL
"""


# ---------------------------------------------------------------------------
# Safety gate — CRITICAL (AC4)
# ---------------------------------------------------------------------------

def _assert_localhost(opensearch_url: str) -> None:
    """
    Abort if the OpenSearch host resolves to any non-loopback address.

    Uses socket.getaddrinfo() (NOT a string prefix check) so that hostnames
    that resolve to non-local IPs (e.g. a cloud endpoint behind a custom
    hostname) are always caught — regardless of the URL spelling.

    Loopback addresses accepted: 127.0.0.1, ::1, 0:0:0:0:0:0:0:1
    """
    parsed = urllib.parse.urlparse(opensearch_url)
    hostname = parsed.hostname or "localhost"
    port = parsed.port or 9200
    try:
        results = socket.getaddrinfo(hostname, port)
    except socket.gaierror as e:
        sys.exit(f"SAFETY: cannot resolve host '{hostname}': {e}")
    loopback = {"127.0.0.1", "::1", "0:0:0:0:0:0:0:1"}
    for (_, _, _, _, sockaddr) in results:
        ip = sockaddr[0]
        if ip not in loopback:
            sys.exit(
                f"SAFETY: non-loopback address detected: {ip} "
                f"(resolved from '{hostname}'). "
                "Use a local OpenSearch instance only."
            )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_db_url(url: str) -> str:
    """Return a credential-stripped version of a Postgres URL for logging."""
    try:
        parsed = urllib.parse.urlparse(url)
        safe = parsed._replace(netloc=f"<masked>:<masked>@{parsed.hostname}:{parsed.port}")
        return urllib.parse.urlunparse(safe)
    except Exception:
        return "<db-url>"


def _safe_os_url(url: str) -> str:
    """Return a credential-stripped version of an OpenSearch URL for logging."""
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.username:
            safe = parsed._replace(netloc=f"<masked>:<masked>@{parsed.hostname}:{parsed.port or 9200}")
            return urllib.parse.urlunparse(safe)
        return url
    except Exception:
        return "<opensearch-url>"


def _build_opensearch_client(url: str) -> OpenSearch:
    return _build_opensearch_client_impl(url)


def _paginate_sql(base: str, limit: int, offset: int) -> str:
    """Append LIMIT/OFFSET to base SQL, stripping trailing whitespace/semicolons."""
    clean = base.rstrip().rstrip(";")
    return f"{clean} LIMIT {limit} OFFSET {offset}"


def _row_to_doc(row: dict, index_name: str) -> dict | None:
    """
    Convert a Postgres row dict to an OpenSearch bulk document.
    Returns None if latitude or longitude is NULL (skip; caller counts).
    """
    lat = row.get("latitude")
    lon = row.get("longitude")
    if lat is None or lon is None:
        return None

    def _to_iso(val: Any) -> str | None:
        if val is None:
            return None
        if isinstance(val, datetime):
            return val.isoformat()
        return val

    doc: dict[str, Any] = {
        "_index": index_name,
        "_id": str(row["id"]),
        "_source": {
            "id": str(row["id"]),
            "title": row.get("title"),
            "locality": row.get("locality"),
            "description": row.get("description"),
            "area_key": row.get("area_key"),
            "city_slug": row.get("city_slug"),
            "property_type": row.get("property_type"),
            "seller_type": row.get("seller_type"),
            "bedrooms": row.get("bedrooms"),
            "bathrooms": row.get("bathrooms"),
            "price_paise": row.get("price_paise"),
            "latitude": float(lat),
            "longitude": float(lon),
            "location": {"lat": float(lat), "lon": float(lon)},
            "status": row.get("status"),
            "created_at": _to_iso(row.get("created_at")),
            "hero_image_url": row.get("hero_image_url"),
        },
    }
    # Omit None-valued optional fields to keep the index lean.
    _OPTIONAL_FIELDS = ("city_slug", "hero_image_url")
    for field in _OPTIONAL_FIELDS:
        if doc["_source"].get(field) is None:
            doc["_source"].pop(field, None)
    return doc


# ---------------------------------------------------------------------------
# Backfill
# ---------------------------------------------------------------------------

def _create_index(client: OpenSearch, index_name: str) -> None:
    """Create the scale index. Abort if it's the production alias."""
    if index_name == ALIAS_NAME:
        sys.exit(
            f"SAFETY: refusing to create index named '{ALIAS_NAME}'. "
            "Scale indexes must use the 'listings_scale_{{volume}}' naming."
        )
    if client.indices.exists(index=index_name):
        print(f"Index '{index_name}' already exists — reusing.")
        return
    client.indices.create(index=index_name, body=INDEX_MAPPING)
    print(f"Created index '{index_name}'.")


def run_backfill(
    conn: psycopg2.extensions.connection,
    client: OpenSearch,
    index_name: str,
    batch_size: int,
) -> dict:
    """
    Fetch LIVE rows from Postgres in OFFSET/LIMIT batches and bulk-index them.

    Returns a dict with:
        pg_count, os_count, failure_count, docs_per_sec, elapsed_sec
    """
    _create_index(client, index_name)

    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Count total rows first (fast — uses index on status).
    cur.execute(
        "SELECT COUNT(*) FROM property_listings pl "
        "WHERE pl.status = 'LIVE' AND pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL"
    )
    pg_count = cur.fetchone()["count"]
    print(f"Postgres LIVE rows (with lat/lon): {pg_count} | batch_size={batch_size}")

    total_indexed = 0
    total_failed = 0
    total_skipped = 0
    offset = 0
    t_start = time.perf_counter()

    while True:
        sql = _paginate_sql(SELECT_SQL, batch_size, offset)
        cur.execute(sql)
        rows = cur.fetchall()
        if not rows:
            break

        docs = []
        for row in rows:
            doc = _row_to_doc(dict(row), index_name)
            if doc is None:
                total_skipped += 1
            else:
                docs.append(doc)

        if docs:
            success, errors = bulk(client, docs, raise_on_error=False, raise_on_exception=False)
            batch_failures = len(errors) if errors else 0
            total_indexed += success
            total_failed += batch_failures
            if batch_failures:
                print(f"  WARNING: {batch_failures} failures in batch at offset {offset}")

        offset += batch_size
        if total_indexed > 0 and total_indexed % 5000 == 0:
            elapsed = time.perf_counter() - t_start
            print(
                f"  Progress: {total_indexed} indexed, "
                f"{total_failed} failed, "
                f"{elapsed:.1f}s elapsed"
            )

    elapsed_sec = time.perf_counter() - t_start
    docs_per_sec = total_indexed / elapsed_sec if elapsed_sec > 0 else 0.0

    # Refresh so count is accurate.
    client.indices.refresh(index=index_name)
    count_resp = client.count(index=index_name)
    os_count = count_resp["count"]

    print(
        f"Backfill complete: {total_indexed} indexed, {total_failed} failed, "
        f"{total_skipped} skipped (null lat/lon) in {elapsed_sec:.2f}s "
        f"({docs_per_sec:.0f} docs/sec). OS doc count: {os_count}"
    )

    return {
        "pg_count": pg_count,
        "os_count": os_count,
        "failure_count": total_failed,
        "docs_per_sec": round(docs_per_sec, 1),
        "elapsed_sec": round(elapsed_sec, 2),
    }


# ---------------------------------------------------------------------------
# Query patterns
# ---------------------------------------------------------------------------

def _pg_explain_analyze(conn: psycopg2.extensions.connection, sql: str, params: tuple = ()) -> tuple[int, float]:
    """
    Run EXPLAIN (ANALYZE, BUFFERS) on *sql*, return (row_count, execution_time_ms).
    execution_time_ms is parsed from the "Execution Time: X ms" line.
    """
    cur = conn.cursor()
    explain_sql = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) {sql}"
    cur.execute(explain_sql, params)
    rows = cur.fetchall()
    plan_text = "\n".join(r[0] for r in rows)

    # Parse "Execution Time: X.XXX ms"
    match = re.search(r"Execution Time:\s*([\d.]+)\s*ms", plan_text)
    exec_ms = float(match.group(1)) if match else 0.0

    # Parse actual row count from first "rows=N" in "actual time=…rows=N"
    rows_match = re.search(r"actual time=[\d.]+\.\.[\d.]+ rows=(\d+)", plan_text)
    actual_rows = int(rows_match.group(1)) if rows_match else 0

    return actual_rows, exec_ms


def _pg_count_query(conn: psycopg2.extensions.connection, sql: str, params: tuple = ()) -> tuple[int, float]:
    """
    Wrap *sql* in a COUNT(*) and run EXPLAIN ANALYZE to get count + latency.
    Falls back to running the query directly and counting results when wrapping
    is ambiguous (e.g. queries with LIMIT).
    """
    # For queries with LIMIT we run directly and count returned rows.
    if "LIMIT" in sql.upper():
        cur = conn.cursor()
        cur.execute(sql, params)
        results = cur.fetchall()
        count = len(results)
        # Also get latency via EXPLAIN ANALYZE.
        _, exec_ms = _pg_explain_analyze(conn, sql, params)
        return count, exec_ms

    count_sql = f"SELECT COUNT(*) FROM ({sql}) _sub"
    cur = conn.cursor()
    cur.execute(count_sql, params)
    count = cur.fetchone()[0]
    _, exec_ms = _pg_explain_analyze(conn, sql, params)
    return count, exec_ms


def run_queries(
    conn: psycopg2.extensions.connection,
    client: OpenSearch,
    index_name: str,
) -> list[dict]:
    """
    Run all 4 query patterns against Postgres and OpenSearch.
    Returns a list of result dicts.
    """
    results = []

    # ------------------------------------------------------------------
    # QP-1c — geo-radius 2km from Udupi school point
    # ------------------------------------------------------------------
    pg_sql_qp1c = """
        SELECT pl.id
        FROM property_listings pl
        WHERE pl.status = 'LIVE'
          AND ST_DWithin(
              pl.geog,
              ST_MakePoint(74.7421, 13.3409)::geography,
              2000
          )
    """
    pg_count_qp1c, pg_ms_qp1c = _pg_count_query(conn, pg_sql_qp1c)

    qp1c_body = {
        "query": {
            "geo_distance": {
                "distance": "2km",
                "location": {"lat": 13.3409, "lon": 74.7421},
            }
        },
        "size": 0,
        "track_total_hits": True,
    }
    t0 = time.perf_counter()
    qp1c_resp = client.search(index=index_name, body=qp1c_body)
    os_client_ms_qp1c = (time.perf_counter() - t0) * 1000
    os_count_qp1c = qp1c_resp["hits"]["total"]["value"]
    os_took_qp1c = qp1c_resp["took"]

    results.append(_build_result(
        "QP-1c", "geo_distance 2km",
        pg_count_qp1c, pg_ms_qp1c,
        os_count_qp1c, os_took_qp1c, os_client_ms_qp1c,
    ))

    # ------------------------------------------------------------------
    # QP-3b — bbox Udupi core (LIMIT 1001)
    # ------------------------------------------------------------------
    pg_sql_qp3b = """
        SELECT pl.id
        FROM property_listings pl
        WHERE pl.status = 'LIVE'
          AND pl.geog && ST_MakeEnvelope(74.72, 13.32, 74.77, 13.36, 4326)::geography
        LIMIT 1001
    """
    pg_count_qp3b, pg_ms_qp3b = _pg_count_query(conn, pg_sql_qp3b)

    qp3b_body = {
        "query": {
            "geo_bounding_box": {
                "location": {
                    "top_left": {"lat": 13.36, "lon": 74.72},
                    "bottom_right": {"lat": 13.32, "lon": 74.77},
                }
            }
        },
        "size": 1001,
        "track_total_hits": True,
    }
    t0 = time.perf_counter()
    qp3b_resp = client.search(index=index_name, body=qp3b_body)
    os_client_ms_qp3b = (time.perf_counter() - t0) * 1000
    os_count_qp3b = qp3b_resp["hits"]["total"]["value"]
    os_took_qp3b = qp3b_resp["took"]

    results.append(_build_result(
        "QP-3b", "geo_bounding_box LIMIT 1001",
        pg_count_qp3b, pg_ms_qp3b,
        os_count_qp3b, os_took_qp3b, os_client_ms_qp3b,
    ))

    # ------------------------------------------------------------------
    # QP-1d — FTS "sea view apartment"
    # CRITICAL: must use type:best_fields operator:and (per #1311 recommendation)
    # ------------------------------------------------------------------
    pg_sql_qp1d = """
        SELECT pl.id
        FROM property_listings pl
        WHERE pl.status = 'LIVE'
          AND pl.search_vector @@ websearch_to_tsquery('english', 'sea view apartment')
    """
    pg_count_qp1d, pg_ms_qp1d = _pg_count_query(conn, pg_sql_qp1d)

    qp1d_body: dict[str, Any] = {
        "query": {
            "multi_match": {
                "query": "sea view apartment",
                "fields": ["title", "locality", "description"],
                "type": "best_fields",
                "operator": "and",
            }
        },
        "size": 0,
        "track_total_hits": True,
    }
    # AC4 assertion: FTS operator must be "and" — catch misconfiguration early.
    assert qp1d_body["query"]["multi_match"].get("operator") == "and", (
        "FTS operator not set to 'and' — QP-1d body misconfigured"
    )

    t0 = time.perf_counter()
    qp1d_resp = client.search(index=index_name, body=qp1d_body)
    os_client_ms_qp1d = (time.perf_counter() - t0) * 1000
    os_count_qp1d = qp1d_resp["hits"]["total"]["value"]
    os_took_qp1d = qp1d_resp["took"]

    results.append(_build_result(
        "QP-1d", 'FTS "sea view apartment" (best_fields AND)',
        pg_count_qp1d, pg_ms_qp1d,
        os_count_qp1d, os_took_qp1d, os_client_ms_qp1d,
        notes="operator:and per #1311",
    ))

    # ------------------------------------------------------------------
    # QP-combo — FTS "sea view" + geo-distance 5km
    # ------------------------------------------------------------------
    pg_sql_qp_combo = """
        SELECT pl.id
        FROM property_listings pl
        WHERE pl.status = 'LIVE'
          AND pl.search_vector @@ websearch_to_tsquery('english', 'sea view')
          AND ST_DWithin(
              pl.geog,
              ST_MakePoint(74.7421, 13.3409)::geography,
              5000
          )
    """
    pg_count_qp_combo, pg_ms_qp_combo = _pg_count_query(conn, pg_sql_qp_combo)

    qp_combo_body: dict[str, Any] = {
        "query": {
            "bool": {
                "must": [
                    {
                        "multi_match": {
                            "query": "sea view",
                            "fields": ["title", "locality", "description"],
                            "type": "best_fields",
                            "operator": "and",
                        }
                    },
                    {
                        "geo_distance": {
                            "distance": "5km",
                            "location": {"lat": 13.3409, "lon": 74.7421},
                        }
                    },
                ]
            }
        },
        "size": 0,
        "track_total_hits": True,
    }
    t0 = time.perf_counter()
    qp_combo_resp = client.search(index=index_name, body=qp_combo_body)
    os_client_ms_qp_combo = (time.perf_counter() - t0) * 1000
    os_count_qp_combo = qp_combo_resp["hits"]["total"]["value"]
    os_took_qp_combo = qp_combo_resp["took"]

    results.append(_build_result(
        "QP-combo", 'FTS "sea view" + geo_distance 5km (bool must)',
        pg_count_qp_combo, pg_ms_qp_combo,
        os_count_qp_combo, os_took_qp_combo, os_client_ms_qp_combo,
    ))

    return results


def _build_result(
    query_id: str,
    pattern: str,
    pg_count: int,
    pg_latency_ms: float,
    os_count: int,
    os_took_ms: int,
    os_client_ms: float,
    notes: str = "",
) -> dict:
    count_delta = os_count - pg_count
    delta_pct = (count_delta / pg_count * 100) if pg_count > 0 else 0.0
    return {
        "id": query_id,
        "pattern": pattern,
        "pg_count": pg_count,
        "os_count": os_count,
        "count_delta": count_delta,
        "delta_pct": round(delta_pct, 1),
        "pg_latency_ms": round(pg_latency_ms, 2),
        "os_took_ms": os_took_ms,
        "os_client_ms": round(os_client_ms, 1),
        "notes": notes,
    }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def _print_table(results: list[dict]) -> None:
    header = (
        f"{'Query':<10} {'Pattern':<42} {'PG ct':>6} {'OS ct':>6} "
        f"{'Delta':>7} {'PG ms':>8} {'OS took':>8} {'OS cli ms':>10} {'Notes'}"
    )
    sep = "-" * len(header)
    print(sep)
    print(header)
    print(sep)
    for r in results:
        delta_str = f"{r['count_delta']:+d} ({r['delta_pct']:+.1f}%)"
        print(
            f"{r['id']:<10} {r['pattern']:<42} {r['pg_count']:>6} {r['os_count']:>6} "
            f"{delta_str:>7} {r['pg_latency_ms']:>8.1f} {r['os_took_ms']:>8} "
            f"{r['os_client_ms']:>10.1f} {r['notes']}"
        )
    print(sep)


def _get_index_size(client: OpenSearch, index_name: str) -> int:
    """Return primary store size in bytes via _stats/store."""
    try:
        resp = client.indices.stats(index=index_name, metric="store")
        return resp["_all"]["primaries"]["store"]["size_in_bytes"]
    except Exception as e:
        print(f"WARNING: could not retrieve index size: {e}")
        return 0


def _write_json_output(
    output_path: str,
    volume: str,
    index_name: str,
    backfill: dict,
    index_size_bytes: int,
    results: list[dict],
) -> None:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    payload = {
        "volume": volume,
        "seed": 42,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "fts_strategy": "type:best_fields operator:and",
        "index_name": index_name,
        "backfill": backfill,
        "index_size_bytes": index_size_bytes,
        "queries": results,
    }
    with open(output_path, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"Results written to: {output_path}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="OpenSearch scale comparison harness — indexes LIVE rows at scale and compares query patterns."
    )
    parser.add_argument(
        "--db-url",
        default=os.environ.get("PERF_DB_URL") or os.environ.get("DATABASE_URL"),
        help="Postgres URL (default: $PERF_DB_URL or $DATABASE_URL)",
    )
    parser.add_argument(
        "--opensearch-url",
        default=os.environ.get("OPENSEARCH_URL", "http://localhost:9200"),
        help="OpenSearch URL (default: $OPENSEARCH_URL or http://localhost:9200)",
    )
    parser.add_argument(
        "--volume",
        default="10k",
        help='Label for this run, e.g. "10k" or "100k" (default: 10k)',
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Bulk batch size (default: 500)",
    )
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="Delete the scale-specific index after the run",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print config and exit without connecting to Postgres or OpenSearch. "
             "Localhost gate still runs.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    index_name = f"listings_scale_{args.volume}"
    output_dir = os.path.join(
        os.path.dirname(_SCRIPTS_DIR),
        "docs", "audit", "evidence", "explain", "live",
        f"opensearch-{args.volume}",
    )
    output_path = os.path.join(output_dir, "opensearch-compare.json")

    # Always run the localhost gate (even on --dry-run) so it can be tested
    # offline without needing a running OpenSearch instance.
    _assert_localhost(args.opensearch_url)

    if args.dry_run:
        print("=== DRY RUN — config only (no DB or OpenSearch connections) ===")
        print(f"  db_url:         {_safe_db_url(args.db_url or '<not set>')}")
        print(f"  opensearch_url: {_safe_os_url(args.opensearch_url)}")
        print(f"  volume:         {args.volume}")
        print(f"  index_name:     {index_name}")
        print(f"  batch_size:     {args.batch_size}")
        print(f"  cleanup:        {args.cleanup}")
        print(f"  output_path:    {output_path}")
        print("Localhost gate: PASSED")
        sys.exit(0)

    if not args.db_url:
        sys.exit("ERROR: --db-url is required (or set $PERF_DB_URL / $DATABASE_URL)")

    print(f"DB:            {_safe_db_url(args.db_url)}")
    print(f"OpenSearch:    {_safe_os_url(args.opensearch_url)}")
    print(f"Volume label:  {args.volume}")
    print(f"Index:         {index_name}")
    print(f"Batch size:    {args.batch_size}")
    print()

    # Connect
    conn = psycopg2.connect(args.db_url)
    conn.autocommit = True
    client = _build_opensearch_client(args.opensearch_url)

    try:
        # 1. Backfill
        print("=== Backfill ===")
        backfill = run_backfill(conn, client, index_name, args.batch_size)
        print()

        # 2. Index size
        index_size_bytes = _get_index_size(client, index_name)
        size_mb = index_size_bytes / (1024 * 1024)
        print(f"Index store size: {index_size_bytes:,} bytes ({size_mb:.1f} MB)")
        print()

        # 3. Queries
        print("=== Query comparison ===")
        results = run_queries(conn, client, index_name)
        _print_table(results)
        print()

        # 4. Write JSON
        _write_json_output(output_path, args.volume, index_name, backfill, index_size_bytes, results)

    finally:
        conn.close()
        if args.cleanup:
            print(f"Cleaning up index '{index_name}'...")
            client.indices.delete(index=index_name, ignore_unavailable=True)
            print("Done.")


if __name__ == "__main__":
    main()
