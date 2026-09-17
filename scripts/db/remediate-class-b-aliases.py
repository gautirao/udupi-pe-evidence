#!/usr/bin/env python3
import psycopg2
import json
import os
import sys

DB_HOST = os.environ.get("PGHOST") or os.environ.get("SUPABASE_DB_HOST")
DB_PORT = os.environ.get("PGPORT") or os.environ.get("SUPABASE_DB_PORT")
DB_USER = os.environ.get("PGUSER") or os.environ.get("SUPABASE_DB_USER")
DB_NAME = os.environ.get("PGDATABASE") or os.environ.get("SUPABASE_DB_NAME")
DB_PASS = os.environ.get("PGPASSWORD") or os.environ.get("SUPABASE_DB_PASSWORD")

if not DB_PASS:
    sys.exit("ERROR: Required environment variable PGPASSWORD / SUPABASE_DB_PASSWORD is missing")
if not DB_HOST:
    sys.exit("ERROR: Required environment variable PGHOST / SUPABASE_DB_HOST is missing")
if not DB_USER:
    sys.exit("ERROR: Required environment variable PGUSER / SUPABASE_DB_USER is missing")
if not DB_NAME:
    sys.exit("ERROR: Required environment variable PGDATABASE / SUPABASE_DB_NAME is missing")
if not DB_PORT:
    sys.exit("ERROR: Required environment variable PGPORT / SUPABASE_DB_PORT is missing")

def main():
    conn = psycopg2.connect(
        host=DB_HOST, port=int(DB_PORT), user=DB_USER, dbname=DB_NAME, password=DB_PASS
    )
    cur = conn.cursor()

    print("=== Phase 3 — Class B Verified Aliases Remediation Execution ===")

    # 1. Total unresolved cohort count BEFORE execution
    cur.execute("""
        SELECT count(*)
        FROM property_listings
        WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
          AND listing_family = 'COMMERCIAL'
          AND area_resolution_status = 'UNRESOLVED';
    """)
    initial_unresolved_count = cur.fetchone()[0]
    print(f"Total unresolved Housing commercial listings BEFORE: {initial_unresolved_count}")

    # 2. Candidate localities to be matched
    alias_normalised_list = [
        'anjanapura township',
        'mylasandra',
        'banashankari 6th stage 6th block',
        'banashankari 6th stage 4th block',
        'chikkagubbi',
        'kapu',
        'kacharakanahalli',
        'kodihalli village',
        'thirumanahalli',
        'byatarayanapura cmc and og part',
        'halasahalli thippasandra'
    ]

    cur.execute("""
        SELECT count(*)
        FROM property_listings
        WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
          AND listing_family = 'COMMERCIAL'
          AND area_resolution_status = 'UNRESOLVED'
          AND LOWER(TRIM(locality)) = ANY(%s);
    """, (alias_normalised_list,))
    expected_remediation_count = cur.fetchone()[0]
    print(f"Expected candidate listings to be remediated BEFORE execution: {expected_remediation_count}")

    # 3. Read SQL script
    sql_script_path = os.path.join(os.path.dirname(__file__), "remediate-class-b-aliases.sql")
    with open(sql_script_path, "r") as f:
        sql_content = f.read()

    # Execute SQL script
    print("\nExecuting remediate-class-b-aliases.sql in a single transaction...")
    cur.execute(sql_content)

    # 4. Total unresolved cohort count AFTER execution
    cur.execute("""
        SELECT count(*)
        FROM property_listings
        WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
          AND listing_family = 'COMMERCIAL'
          AND area_resolution_status = 'UNRESOLVED';
    """)
    final_unresolved_count = cur.fetchone()[0]
    print(f"Total unresolved Housing commercial listings AFTER: {final_unresolved_count}")

    remediated_count = initial_unresolved_count - final_unresolved_count
    print(f"Exact count of rows updated: {remediated_count}")

    assert remediated_count == expected_remediation_count, \
        f"Mismatch! Expected {expected_remediation_count} updates but got {remediated_count}"

    # 5. Fetch sample resolved listings for verification
    cur.execute("""
        SELECT id, locality, area_key, area_label, area_resolution_status, area_resolution_method
        FROM property_listings
        WHERE created_by = 'e7b61f70-d087-44d8-a81d-7f8a057d2775'
          AND listing_family = 'COMMERCIAL'
          AND area_resolution_method = 'ALIAS'
          AND LOWER(TRIM(locality)) = ANY(%s)
        ORDER BY updated_at DESC
        LIMIT 10;
    """, (alias_normalised_list,))
    sample_resolved = cur.fetchall()

    print("\n--- SAMPLE RESOLVED LISTINGS (Post-Execution) ---")
    sample_list = []
    for row in sample_resolved:
        item = {
            'id': row[0],
            'locality': row[1],
            'area_key': row[2],
            'area_label': row[3],
            'area_resolution_status': row[4],
            'area_resolution_method': row[5]
        }
        sample_list.append(item)
        print(f"ID: {item['id']} | Locality: '{item['locality']}' -> Key: {item['area_key']} | Label: '{item['area_label']}' | Status: {item['area_resolution_status']} | Method: {item['area_resolution_method']}")

    output_summary = {
        'initial_unresolved_count': initial_unresolved_count,
        'expected_remediation_count': expected_remediation_count,
        'final_unresolved_count': final_unresolved_count,
        'remediated_count': remediated_count,
        'sample_resolved_listings': sample_list
    }

    with open("/tmp/phase3_remediation_results.json", "w") as f:
        json.dump(output_summary, f, indent=2)

    cur.close()
    conn.close()
    print("\nPhase 3 Class B Remediation completed successfully!")

if __name__ == "__main__":
    main()
