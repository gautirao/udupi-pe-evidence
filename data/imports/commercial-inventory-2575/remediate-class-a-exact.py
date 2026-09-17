#!/usr/bin/env python3
"""Issue #2575 Phase 2 — Class A Exact Canonical Matches Remediation Runner.

Measures pre-remediation counts, executes remediate-class-a-exact.sql inside a single
transaction, verifies post-remediation row updates, and reconciles database counts.
"""
import os
import subprocess
import sys

PG_HOST = os.environ.get("PGHOST") or os.environ.get("SUPABASE_DB_HOST")
PG_PORT = os.environ.get("PGPORT") or os.environ.get("SUPABASE_DB_PORT")
PG_USER = os.environ.get("PGUSER") or os.environ.get("SUPABASE_DB_USER")
PG_NAME = os.environ.get("PGDATABASE") or os.environ.get("SUPABASE_DB_NAME")
PG_PASS = os.environ.get("PGPASSWORD") or os.environ.get("SUPABASE_DB_PASSWORD")

if not PG_PASS:
    sys.exit("ERROR: Required environment variable PGPASSWORD / SUPABASE_DB_PASSWORD is missing")
if not PG_HOST:
    sys.exit("ERROR: Required environment variable PGHOST / SUPABASE_DB_HOST is missing")
if not PG_USER:
    sys.exit("ERROR: Required environment variable PGUSER / SUPABASE_DB_USER is missing")
if not PG_NAME:
    sys.exit("ERROR: Required environment variable PGDATABASE / SUPABASE_DB_NAME is missing")
if not PG_PORT:
    sys.exit("ERROR: Required environment variable PGPORT / SUPABASE_DB_PORT is missing")

_HERE = os.path.dirname(os.path.abspath(__file__))
SQL_FILE = os.path.join(_HERE, "remediate-class-a-exact.sql")


def run_sql_cmd(sql):
    env = os.environ.copy()
    env["PGPASSWORD"] = PG_PASS
    cmd = ["psql", "-h", PG_HOST, "-p", PG_PORT, "-U", PG_USER, "-d", PG_NAME, "-t", "-A", "-c", sql]
    res = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if res.returncode != 0:
        print(f"SQL Error: {res.stderr}", file=sys.stderr)
        sys.exit(res.returncode)
    return res.stdout.strip()


def main():
    print("=== Issue #2575 Phase 2 Remediation Execution ===")

    # 1. Pre-execution measurement
    count_query = """
    WITH matched_canonical AS (
        SELECT DISTINCT ON (pl.id) pl.id
        FROM public.property_listings pl
        JOIN public.areas a ON lower(trim(pl.locality)) = lower(trim(a.name))
        WHERE pl.created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
          AND pl.listing_family = 'COMMERCIAL'
          AND pl.parsed_data->>'source' = 'housing.com'
          AND a.lifecycle_status = 'ACTIVE'
    )
    SELECT count(*) FROM matched_canonical;
    """
    expected_count = int(run_sql_cmd(count_query))
    print(f"Pre-Execution Candidate Measure: {expected_count} rows expected to be updated.")

    pre_status_query = """
    SELECT area_resolution_status, count(*)
    FROM public.property_listings
    WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
      AND listing_family = 'COMMERCIAL'
      AND parsed_data->>'source' = 'housing.com'
    GROUP BY area_resolution_status;
    """
    print(f"Pre-Execution Cohort Status:\n{run_sql_cmd(pre_status_query)}")

    # 2. Execute SQL file inside single transaction
    print(f"\nExecuting {SQL_FILE}...")
    env = os.environ.copy()
    env["PGPASSWORD"] = PG_PASS
    cmd = ["psql", "-h", PG_HOST, "-p", PG_PORT, "-U", PG_USER, "-d", PG_NAME, "-v", "ON_ERROR_STOP=1", "-f", SQL_FILE]
    res = subprocess.run(cmd, capture_output=True, text=True, env=env)
    print(res.stdout)
    if res.returncode != 0:
        print(f"Execution failed: {res.stderr}", file=sys.stderr)
        sys.exit(1)

    # 3. Post-execution reconciliation
    post_status_query = """
    SELECT area_resolution_status, count(*), count(area_key) AS non_null_keys, count(*) - count(area_key) AS null_keys
    FROM public.property_listings
    WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
      AND listing_family = 'COMMERCIAL'
      AND parsed_data->>'source' = 'housing.com'
    GROUP BY area_resolution_status;
    """
    print(f"\nPost-Execution Cohort Status:\n{run_sql_cmd(post_status_query)}")

    resolved_count = int(run_sql_cmd("""
    SELECT count(*)
    FROM public.property_listings
    WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
      AND listing_family = 'COMMERCIAL'
      AND parsed_data->>'source' = 'housing.com'
      AND area_resolution_status = 'RESOLVED';
    """))

    print(f"\nReconciliation result: {resolved_count} RESOLVED rows vs {expected_count} expected.")
    if resolved_count == expected_count:
        print("SUCCESS: Exact match between candidate measurement and updated row count!")
    else:
        print("WARNING: Count discrepancy detected!", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
