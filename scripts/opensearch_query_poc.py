#!/usr/bin/env python3
# WARNING: DATABASE_URL must point to local/perf DB only. Never run against production.
"""
OpenSearch query POC — issue #1309.

Runs 4 query prototypes against the 'listings_poc' index and prints latency
compared to Postgres baselines from docs/audit/postgis-baseline-1k-10k-100k.md.

Usage:
    export OPENSEARCH_URL=http://localhost:9200   # optional, default shown
    python scripts/opensearch_query_poc.py [--url http://localhost:9200] [--index listings_poc]

Prerequisites:
    - OpenSearch running (docker compose -f docker-compose.opensearch.yml up -d)
    - Index populated (python scripts/opensearch_backfill.py)
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from typing import Any

from opensearchpy import OpenSearch

# ---------------------------------------------------------------------------
# Coordinate constants — Udupi city centre (mirrors run_explain_harness.py)
# ---------------------------------------------------------------------------

SCHOOL_LAT = 13.3409
SCHOOL_LON = 74.7421

BBOX_SOUTH = 13.32
BBOX_WEST = 74.72
BBOX_NORTH = 13.36
BBOX_EAST = 74.77

# ---------------------------------------------------------------------------
# Query definitions
# ---------------------------------------------------------------------------


def _qp1c_geo_distance() -> dict[str, Any]:
    """QP-1c analog: school-radius geo_distance (2 km from Udupi centre)."""
    return {
        "query": {
            "bool": {
                "filter": [
                    {
                        "geo_distance": {
                            "distance": "2km",
                            "location": {"lat": SCHOOL_LAT, "lon": SCHOOL_LON},
                        }
                    }
                ]
            }
        },
        "size": 1000,
        "_source": ["id", "title", "locality"],
    }


def _qp3b_geo_bounding_box() -> dict[str, Any]:
    """QP-3b analog: bounding-box query (Udupi core area)."""
    return {
        "query": {
            "bool": {
                "filter": [
                    {
                        "geo_bounding_box": {
                            "location": {
                                "top_left": {"lat": BBOX_NORTH, "lon": BBOX_WEST},
                                "bottom_right": {"lat": BBOX_SOUTH, "lon": BBOX_EAST},
                            }
                        }
                    }
                ]
            }
        },
        "size": 1001,
        "_source": ["id", "title", "locality"],
    }


def _qp1d_fts() -> dict[str, Any]:
    """QP-1d analog: multi_match FTS across title, locality, description."""
    return {
        "query": {
            "multi_match": {
                "query": "sea view apartment",
                "fields": ["title^3", "locality^2", "description"],
            }
        },
        "size": 50,
        "_source": ["id", "title", "locality"],
    }


def _qp_combo_fts_geo() -> dict[str, Any]:
    """QP-combo: FTS + geo_distance compound query."""
    return {
        "query": {
            "bool": {
                "must": [
                    {
                        "multi_match": {
                            "query": "sea view",
                            "fields": ["title^3", "locality^2", "description"],
                        }
                    }
                ],
                "filter": [
                    {
                        "geo_distance": {
                            "distance": "5km",
                            "location": {"lat": SCHOOL_LAT, "lon": SCHOOL_LON},
                        }
                    }
                ],
            }
        },
        "size": 50,
        "_source": ["id", "title", "locality"],
    }


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

QUERIES = [
    (
        "QP-1c",
        "geo_distance     ",
        _qp1c_geo_distance,
        "~40ms (100k rows, docs/audit/postgis-baseline-1k-10k-100k.md)",
    ),
    (
        "QP-3b",
        "geo_bounding_box ",
        _qp3b_geo_bounding_box,
        "~40ms (100k rows, LIMIT 1001, docs/audit/postgis-baseline-1k-10k-100k.md)",
    ),
    (
        "QP-1d",
        "multi_match FTS  ",
        _qp1d_fts,
        "GIN index, see docs/audit/postgis-baseline-1k-10k-100k.md",
    ),
    (
        "QP-combo",
        "FTS+geo          ",
        _qp_combo_fts_geo,
        "compound predicate, see docs/audit/postgis-baseline-1k-10k-100k.md",
    ),
]


def _build_client(url: str) -> OpenSearch:
    from urllib.parse import urlparse
    parsed = urlparse(url)
    hosts = [{"host": parsed.hostname, "port": parsed.port or 9200}]
    scheme = parsed.scheme or "http"
    return OpenSearch(hosts=hosts, http_compress=True, use_ssl=(scheme == "https"))


def run_queries(args: argparse.Namespace) -> None:
    opensearch_url = args.url
    if not opensearch_url:
        print("ERROR: OPENSEARCH_URL is not set. Export it or pass --url.", file=sys.stderr)
        sys.exit(1)

    index = args.index
    client = _build_client(opensearch_url)

    # Sanity-check: confirm index exists and has docs
    try:
        info = client.cat.indices(index=index, h="index,docs.count", format="json")
        doc_count = info[0].get("docs.count", "?") if info else "?"
        print(f"Index '{index}' found — {doc_count} documents.\n")
    except Exception as exc:
        print(f"ERROR: Cannot reach index '{index}': {exc}", file=sys.stderr)
        sys.exit(1)

    header = (
        f"{'Query':<10} {'Pattern':<20} {'Hits':>6}   {'OpenSearch':>14}   {'Postgres baseline'}"
    )
    separator = "-" * len(header)
    print(header)
    print(separator)

    for label, pattern, query_fn, pg_baseline in QUERIES:
        body = query_fn()
        t0 = time.perf_counter()
        try:
            resp = client.search(index=index, body=body)
        except Exception as exc:
            print(f"{label:<10} {pattern:<20} {'ERROR':>6}   {'N/A':>14}   {pg_baseline}")
            print(f"  Exception: {exc}", file=sys.stderr)
            continue
        elapsed_ms = (time.perf_counter() - t0) * 1000

        hits_total = resp.get("hits", {}).get("total", {})
        if isinstance(hits_total, dict):
            hit_count = hits_total.get("value", 0)
        else:
            hit_count = int(hits_total)

        # OpenSearch reports its own took_ms (server-side)
        os_took_ms = resp.get("took", 0)

        print(
            f"{label:<10} {pattern:<20} {hit_count:>6}   "
            f"client={elapsed_ms:>6.1f}ms os_took={os_took_ms:>4}ms   "
            f"Postgres baseline: {pg_baseline}"
        )

    print(separator)
    print(
        "\nNote: 'client' latency includes network round-trip to OpenSearch container."
        "\n      'os_took' is OpenSearch server-side execution time only."
        "\n      Compare os_took to Postgres EXPLAIN ANALYZE execution time for fairness."
    )


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run OpenSearch POC queries against the listings_poc index."
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("OPENSEARCH_URL", "http://localhost:9200"),
        help="OpenSearch base URL (default: $OPENSEARCH_URL or http://localhost:9200)",
    )
    parser.add_argument(
        "--index",
        default="listings_poc",
        help="Index name to query (default: listings_poc)",
    )
    return parser


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()
    run_queries(args)


if __name__ == "__main__":
    main()
