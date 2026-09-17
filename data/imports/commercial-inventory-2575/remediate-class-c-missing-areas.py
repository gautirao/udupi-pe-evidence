#!/usr/bin/env python3
"""Issue #2575 Phase 4 — Class C Missing Area Onboarding & Final 3,102 Reconciliation Runner.

Measures pre-remediation counts, executes remediate-class-c-missing-areas.sql inside a single
transaction, verifies post-remediation row updates, and reconciles all 3,102 Housing commercial listings.
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
SQL_FILE = os.path.join(_HERE, "remediate-class-c-missing-areas.sql")


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
    print("=== Issue #2575 Phase 4 Missing Area Onboarding & Final 3,102 Reconciliation ===")

    # 1. Pre-execution measurement
    pre_unresolved = int(run_sql_cmd("""
        SELECT count(*)
        FROM public.property_listings
        WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
          AND listing_family = 'COMMERCIAL'
          AND parsed_data->>'source' = 'housing.com'
          AND area_resolution_status = 'UNRESOLVED';
    """))

    print(f"Pre-Execution Unresolved Housing Commercial Listings: {pre_unresolved}")

    pre_status_query = """
    SELECT area_resolution_status, COALESCE(area_resolution_method, 'NONE') AS method, count(*)
    FROM public.property_listings
    WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
      AND listing_family = 'COMMERCIAL'
      AND parsed_data->>'source' = 'housing.com'
    GROUP BY area_resolution_status, area_resolution_method
    ORDER BY area_resolution_status, method;
    """
    print(f"Pre-Execution Status Breakdown:\n{run_sql_cmd(pre_status_query)}")

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
    print("\n=== Post-Execution Cohort Status Breakdown ===")
    post_status_query = """
    SELECT area_resolution_status, COALESCE(area_resolution_method, 'NONE') AS method, count(*)
    FROM public.property_listings
    WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
      AND listing_family = 'COMMERCIAL'
      AND parsed_data->>'source' = 'housing.com'
    GROUP BY area_resolution_status, area_resolution_method
    ORDER BY area_resolution_status, method;
    """
    print(run_sql_cmd(post_status_query))

    # Fetch counts for 5 canonical accounting categories
    exact_canonical = int(run_sql_cmd("""
        SELECT count(*) FROM public.property_listings
        WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
          AND listing_family = 'COMMERCIAL'
          AND parsed_data->>'source' = 'housing.com'
          AND area_resolution_status = 'RESOLVED'
          AND area_resolution_method = 'CANONICAL_KEY';
    """))

    alias_resolved = int(run_sql_cmd("""
        SELECT count(*) FROM public.property_listings
        WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
          AND listing_family = 'COMMERCIAL'
          AND parsed_data->>'source' = 'housing.com'
          AND area_resolution_status = 'RESOLVED'
          AND area_resolution_method = 'ALIAS';
    """))

    new_canonical_area = int(run_sql_cmd("""
        SELECT count(*) FROM public.property_listings
        WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
          AND listing_family = 'COMMERCIAL'
          AND parsed_data->>'source' = 'housing.com'
          AND area_resolution_status = 'RESOLVED'
          AND area_resolution_method = 'NEW_CANONICAL_AREA';
    """))

    invalid_out_of_scope = int(run_sql_cmd("""
        SELECT count(*) FROM public.property_listings
        WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
          AND listing_family = 'COMMERCIAL'
          AND parsed_data->>'source' = 'housing.com'
          AND area_resolution_method = 'INVALID_OR_OUT_OF_SCOPE';
    """))

    other_proven_reason = int(run_sql_cmd("""
        SELECT count(*) FROM public.property_listings
        WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
          AND listing_family = 'COMMERCIAL'
          AND parsed_data->>'source' = 'housing.com'
          AND area_resolution_method = 'OTHER_PROVEN_REASON';
    """))

    total_accounted = exact_canonical + alias_resolved + new_canonical_area + invalid_out_of_scope + other_proven_reason
    total_housing = int(run_sql_cmd("""
        SELECT count(*) FROM public.property_listings
        WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
          AND listing_family = 'COMMERCIAL'
          AND parsed_data->>'source' = 'housing.com';
    """))

    remainder = total_housing - total_accounted

    print("\n=================================================================")
    print("      FINAL 3,102 HOUSING COMMERCIAL LISTING ACCOUNTING          ")
    print("=================================================================")
    print(f"1. EXACT_CANONICAL (Phase 2 exact matches)      : {exact_canonical:>5}")
    print(f"2. ALIAS_RESOLVED (Phase 3 alias matches)      : {alias_resolved:>5}")
    print(f"3. NEW_CANONICAL_AREA (Phase 4 onboarded areas) : {new_canonical_area:>5}")
    print(f"4. INVALID_OR_OUT_OF_SCOPE (Out-of-market/bad) : {invalid_out_of_scope:>5}")
    print(f"5. OTHER_PROVEN_REASON (Proven exclusions)     : {other_proven_reason:>5}")
    print("-----------------------------------------------------------------")
    print(f"TOTAL ACCOUNTED                                : {total_accounted:>5}")
    print(f"EXPECTED TOTAL                                 : {total_housing:>5}")
    print(f"UNEXPLAINED REMAINDER                          : {remainder:>5}")
    print("=================================================================")

    if remainder == 0 and total_accounted == 3102:
        print("SUCCESS: 3,102 Housing commercial listings reconciled with EXACTLY 0 unexplained remainder!")
    else:
        print(f"ERROR: Accounting discrepancy detected! Remainder={remainder}, Total={total_accounted}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
