#!/usr/bin/env python3
# WARNING: DATABASE_URL must point to local/perf DB only. Never run against production.
"""
OpenSearch FTS strategy comparison — issue #1311.

Runs configurable query strings under multiple OpenSearch multi_match operator
strategies and compares counts to the Postgres websearch_to_tsquery baseline.

Strategies tested:
  (a) default multi_match OR          — #1309 baseline behaviour
  (b) multi_match operator:and best_fields
  (c) multi_match type:cross_fields operator:and
  (d) minimum_should_match:'100%'     — effectively AND
  (e) minimum_should_match:'75%'

Usage:
    export DATABASE_URL=postgresql://user:pass@localhost:5434/mydb
    export OPENSEARCH_URL=http://localhost:9200
    python scripts/opensearch_fts_compare.py [--queries "sea view" "apartment"]
                                              [--url http://localhost:9200]
                                              [--index listings_poc]
                                              [--top-n 5]

Exits 0 in all cases (DATA_GAP reported, not crash, on empty/no-match datasets).
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any

import psycopg2
import psycopg2.extras
from opensearchpy import OpenSearch

# Make scripts/ importable regardless of the working directory from which this
# script is invoked (e.g. project root vs scripts/).
_SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)
from opensearch_auth import build_opensearch_client as _build_opensearch_client_impl  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_QUERIES = [
    "sea view apartment",
    "2bhk udupi",
    "garden villa",
]

# Field boosts are identical across all strategies so the comparison isolates
# operator behaviour, not relevance tuning.  Matches the #1309 QP-1d boosts.
FTS_FIELDS = ["title^3", "locality^2", "description"]

# Strategies: each entry is (label, description, extra_multi_match_kwargs)
STRATEGIES: list[tuple[str, str, dict[str, Any]]] = [
    (
        "OR-default",
        "multi_match OR (recall, #1309 baseline)",
        {"operator": "or"},
    ),
    (
        "AND-best_fields",
        "multi_match AND best_fields (precision)",
        {"operator": "and", "type": "best_fields"},
    ),
    (
        "AND-cross_fields",
        "multi_match AND cross_fields (precision, field-boundary spanning)",
        {"operator": "and", "type": "cross_fields"},
    ),
    (
        "MSM-100%",
        "minimum_should_match=100% (effectively AND)",
        {"operator": "or", "minimum_should_match": "100%"},
    ),
    (
        "MSM-75%",
        "minimum_should_match=75% (partial precision)",
        {"operator": "or", "minimum_should_match": "75%"},
    ),
]


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
    """Build an authenticated OpenSearch client. Auth from opensearch_auth module."""
    return _build_opensearch_client_impl(url)


def _multi_match_query(query_str: str, extra: dict[str, Any], top_n: int) -> dict[str, Any]:
    """Build a multi_match OpenSearch query body."""
    mm: dict[str, Any] = {
        "query": query_str,
        "fields": FTS_FIELDS,
    }
    mm.update(extra)
    return {
        "query": {"multi_match": mm},
        "size": top_n,
        "_source": ["id", "title", "locality"],
    }


def _os_count_and_ids(
    client: OpenSearch, index: str, body: dict[str, Any], top_n: int
) -> tuple[int, list[str]]:
    """Execute an OS search, return (total_hits, list_of_ids[:top_n])."""
    resp = client.search(index=index, body=body)
    hits_total = resp.get("hits", {}).get("total", {})
    # Guard against None or unexpected scalar shapes — default to 0 so DATA_GAP
    # detection still works and no TypeError is raised.
    total = hits_total.get("value", 0) if isinstance(hits_total, dict) else 0
    ids = [h["_source"].get("id", h["_id"]) for h in resp["hits"].get("hits", [])]
    return total, ids[:top_n]


def _pg_count(conn: "psycopg2.connection", query_str: str) -> int | None:
    """
    Run a Postgres websearch_to_tsquery COUNT(*) for the given query string.

    Uses parameterised query (%s) — never interpolates user input into SQL.
    Returns None if the search_vector column does not exist or query fails.
    """
    sql = (
        "SELECT COUNT(*) "
        "FROM property_listings "
        "WHERE status = 'LIVE' "
        "  AND search_vector @@ websearch_to_tsquery('english', %s)"
    )
    try:
        with conn.cursor() as cur:
            cur.execute(sql, (query_str,))
            row = cur.fetchone()
            return int(row[0]) if row else 0
    except psycopg2.Error as exc:
        # Don't expose the raw exception (may contain PII from query string)
        print(
            f"  [pg-baseline] ERROR running Postgres FTS COUNT "
            f"(search_vector column may be absent): {exc.pgcode}",
            file=sys.stderr,
        )
        return None


# ---------------------------------------------------------------------------
# Main comparison logic
# ---------------------------------------------------------------------------


def run_compare(args: argparse.Namespace) -> None:
    db_url: str = args.db_url
    opensearch_url: str = args.url
    index: str = args.index
    top_n: int = args.top_n
    query_strings: list[str] = args.queries

    if not db_url:
        print("ERROR: DATABASE_URL is not set. Export it before running.", file=sys.stderr)
        sys.exit(1)
    if not opensearch_url:
        print("ERROR: OPENSEARCH_URL is not set. Export it or pass --url.", file=sys.stderr)
        sys.exit(1)

    print(f"Postgres:    {_safe_db_url_display(db_url)}")
    print(f"OpenSearch:  {opensearch_url}  index={index}")
    print(f"Query strings: {query_strings}")
    print(f"Top-N IDs displayed per strategy: {top_n}\n")

    # ------------------------------------------------------------------ OS --
    client = _build_opensearch_client(opensearch_url)
    try:
        info = client.cat.indices(index=index, h="index,docs.count", format="json")
        doc_count_raw = info[0].get("docs.count", "?") if info else "?"
        doc_count = int(doc_count_raw) if str(doc_count_raw).isdigit() else 0
        print(f"OpenSearch index '{index}': {doc_count} documents.\n")
    except Exception as exc:
        print(f"ERROR: Cannot reach OpenSearch index '{index}': {exc}", file=sys.stderr)
        sys.exit(1)

    if doc_count == 0:
        print(
            "DATA_GAP: OpenSearch index is empty. "
            "Run opensearch_backfill.py first, then re-run this script."
        )
        return  # exit 0

    # ------------------------------------------------------------------ PG --
    try:
        conn = psycopg2.connect(db_url)
        conn.set_session(readonly=True, autocommit=True)
    except Exception:
        # Credential-safe error — do not print db_url or exception detail
        print(
            f"ERROR: Cannot connect to Postgres at {_safe_db_url_display(db_url)}.",
            file=sys.stderr,
        )
        sys.exit(1)

    # ----------------------------------------------------------------- run --
    print("=" * 90)
    print("FTS STRATEGY COMPARISON")
    print("Boosts: title^3, locality^2, description  (identical across all strategies)")
    print("Recall (OR) vs precision (AND): higher count = broader recall; lower = tighter precision")
    print("Analyzer note: OS 'standard' analyser vs PG 'english' (stemming+stop-words) —")
    print("  exact parity is NOT expected even with operator:and.")
    print("=" * 90)

    any_os_match = False  # track whether at least one strategy returned > 0 for any query

    for q in query_strings:
        print(f"\n{'─'*90}")
        print(f"Query string: \"{q}\"")
        print(f"{'─'*90}")

        # Postgres baseline
        pg_count = _pg_count(conn, q)
        pg_label = f"{pg_count}" if pg_count is not None else "N/A"

        # Header
        header = f"  {'Strategy':<22} {'Count':>7}  {'Top-N IDs'}"
        print(header)
        print(f"  {'─'*20} {'─'*7}  {'─'*40}")

        # Print Postgres baseline first
        print(f"  {'[PG websearch AND]':<22} {pg_label:>7}  (websearch_to_tsquery 'english')")

        for label, _desc, extra in STRATEGIES:
            body = _multi_match_query(q, extra, top_n)
            try:
                count, ids = _os_count_and_ids(client, index, body, top_n)
            except Exception as exc:
                print(f"  {label:<22} {'ERROR':>7}  {exc}", file=sys.stderr)
                continue

            if count > 0:
                any_os_match = True

            ids_str = ", ".join(ids[:top_n]) if ids else "(none)"
            print(f"  {label:<22} {count:>7}  {ids_str}")

        # Inline analysis hint
        if pg_count is not None:
            print(f"\n  Postgres AND baseline = {pg_count}.")
            print(
                "  Strategy closest to Postgres count = strategy whose count is "
                "numerically nearest (from above or below)."
            )

    conn.close()

    print(f"\n{'='*90}")
    if not any_os_match:
        print(
            "DATA_GAP: All OpenSearch strategies returned 0 hits for all query strings. "
            "The seed dataset may lack FTS-matchable rows for these terms."
        )
    else:
        print("Comparison complete. See docs/architecture/discover-read-model-fields-and-fts-alignment.md")
        print("for the recommended Discover default FTS strategy and rationale.")
    print("=" * 90)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Compare OpenSearch FTS strategies against the Postgres websearch_to_tsquery baseline."
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
        "--index",
        default="listings_poc",
        help="OpenSearch index name (default: listings_poc)",
    )
    parser.add_argument(
        "--queries",
        nargs="+",
        default=DEFAULT_QUERIES,
        metavar="QUERY",
        help=(
            "One or more query strings to test "
            f"(default: {DEFAULT_QUERIES})"
        ),
    )
    parser.add_argument(
        "--top-n",
        type=int,
        default=5,
        metavar="N",
        help="Number of result IDs to display per strategy (default: 5)",
    )
    return parser


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()
    run_compare(args)


if __name__ == "__main__":
    main()
