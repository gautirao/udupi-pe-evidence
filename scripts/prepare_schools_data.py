#!/usr/bin/env python3
"""
prepare_schools_data.py
=======================
Transforms a raw Kaggle schools CSV into a Flyway-safe SQL seed file for the
``schools`` table (public.schools, created in V58, extended in V66).

Expected Kaggle dataset
-----------------------
"School Location Data of India" (or any UDISE-sourced CSV with the columns listed
below).  A widely-used source on Kaggle is:
  https://www.kaggle.com/datasets/sudhanshu2198/school-location-data

Column mapping rules
--------------------
The script detects columns case-insensitively and maps them as follows:

  udise_code  — first match among: udise_code, udisecode, school_code, schoolcode,
                udise_sch_code, school_id
  name        — first match among: school_name, name, school
  latitude    — first match among: latitude, lat
  longitude   — first match among: longitude, lon, lng, long
  district    — first match among: district, dist_name, distname
  state       — first match among: state, state_name, statename

Board mapping rules
-------------------
Input column (first match): affiliation_code, board_code, board_type, board,
                              affiliation, management_code, management_type

Numeric affiliation codes (UDISE+ standard):
  1   or 'CBSE'                  → CBSE
  2   or 'ICSE'                  → ICSE
  3   or 'State'/'STATE'/'State' → STATE
  'IB' (exact, case-insensitive) → IB
  anything else / null           → STATE

Coordinate bounding box (Karnataka mainland)
--------------------------------------------
  lat : 11.5 – 18.5
  lon : 74.0 – 78.5
Rows with null, zero, or out-of-range coordinates are dropped.

How to regenerate
-----------------
    python scripts/prepare_schools_data.py <path-to-kaggle-csv>

The script writes output to: scripts/karnataka_schools_seed.sql
"""

import sys
import os
import csv
import re
import datetime
from typing import Optional

# ---------------------------------------------------------------------------
# Column alias resolution
# ---------------------------------------------------------------------------

UDISE_ALIASES   = ['udise_code', 'udisecode', 'school_code', 'schoolcode',
                    'udise_sch_code', 'school_id', 'udise']
NAME_ALIASES     = ['school_name', 'name', 'school', 'institution_name']
LAT_ALIASES      = ['latitude', 'lat']
LON_ALIASES      = ['longitude', 'lon', 'lng', 'long']
DISTRICT_ALIASES = ['district', 'dist_name', 'distname', 'district_name']
STATE_ALIASES    = ['state', 'state_name', 'statename']
BOARD_ALIASES    = ['affiliation_code', 'board_code', 'board_type', 'board',
                    'affiliation', 'management_code', 'management_type',
                    'aff_code', 'management']

# Karnataka bounding box
LAT_MIN, LAT_MAX = 11.5, 18.5
LON_MIN, LON_MAX = 74.0, 78.5


def _find_col(headers_lower: list[str], aliases: list[str]) -> Optional[str]:
    """Return the first alias that matches (case-insensitively) a header column."""
    for alias in aliases:
        if alias in headers_lower:
            return alias
    return None


def _map_board(raw) -> str:
    """Map a raw board/affiliation value to a canonical board string."""
    if raw is None or str(raw).strip() == '':
        return 'STATE'
    val = str(raw).strip()
    # Numeric codes
    try:
        code = int(float(val))
        if code == 1:
            return 'CBSE'
        if code == 2:
            return 'ICSE'
        if code == 3:
            return 'STATE'
    except (ValueError, OverflowError):
        pass
    # String codes
    upper = val.upper()
    if upper == 'CBSE':
        return 'CBSE'
    if upper == 'ICSE':
        return 'ICSE'
    if upper in ('STATE', 'STATE BOARD', 'SSC', 'SSLC'):
        return 'STATE'
    if upper == 'IB':
        return 'IB'
    if upper == 'AICTE':
        # AICTE is an accreditation body for university/technical institutes,
        # not a school board. Pass through as-is rather than mapping to STATE.
        return 'AICTE'
    return 'STATE'


def _safe_float(val) -> Optional[float]:
    """Parse a float, returning None on failure."""
    if val is None:
        return None
    try:
        f = float(str(val).strip())
        return f
    except (ValueError, TypeError):
        return None


def _escape_sql_string(s: str) -> str:
    """Escape a string for use inside single-quoted SQL literals."""
    return s.replace("'", "''")


def process(input_path: str, output_path: str) -> None:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_full = os.path.join(script_dir, os.path.basename(output_path)) \
        if not os.path.isabs(output_path) else output_path

    raw_karnataka = 0
    dropped_coords  = 0
    dropped_no_name = 0
    dropped_dupes   = 0
    seen_udise: set[str] = set()
    rows: list[dict] = []

    with open(input_path, newline='', encoding='utf-8-sig') as fh:
        reader = csv.DictReader(fh)
        headers_lower = [h.lower().strip() for h in (reader.fieldnames or [])]

        # Resolve column names
        col_udise    = _find_col(headers_lower, UDISE_ALIASES)
        col_name     = _find_col(headers_lower, NAME_ALIASES)
        col_lat      = _find_col(headers_lower, LAT_ALIASES)
        col_lon      = _find_col(headers_lower, LON_ALIASES)
        col_district = _find_col(headers_lower, DISTRICT_ALIASES)
        col_state    = _find_col(headers_lower, STATE_ALIASES)
        col_board    = _find_col(headers_lower, BOARD_ALIASES)

        if not col_name:
            sys.exit('ERROR: Cannot find school name column in CSV.')
        if not col_lat or not col_lon:
            sys.exit('ERROR: Cannot find latitude/longitude columns in CSV.')

        # Build a mapping from lower-case alias → actual header name
        original_headers = {h.lower().strip(): h for h in (reader.fieldnames or [])}

        def get_val(row: dict, col_lower: Optional[str]) -> Optional[str]:
            if col_lower is None:
                return None
            original_key = original_headers.get(col_lower)
            return row.get(original_key) if original_key else None

        for row in reader:
            state_val = get_val(row, col_state) or ''
            if state_val.strip().lower() != 'karnataka':
                continue
            raw_karnataka += 1

            lat = _safe_float(get_val(row, col_lat))
            lon = _safe_float(get_val(row, col_lon))

            # Drop invalid coordinates
            if (lat is None or lon is None
                    or lat == 0.0 or lon == 0.0
                    or not (LAT_MIN <= lat <= LAT_MAX)
                    or not (LON_MIN <= lon <= LON_MAX)):
                dropped_coords += 1
                continue

            udise_raw = (get_val(row, col_udise) or '').strip() or None
            if udise_raw and udise_raw in seen_udise:
                dropped_dupes += 1
                continue
            if udise_raw:
                seen_udise.add(udise_raw)

            name_val     = (get_val(row, col_name) or '').strip()
            district_val = (get_val(row, col_district) or '').strip() or 'Unknown'
            board_val    = _map_board(get_val(row, col_board))

            if not name_val:
                dropped_no_name += 1
                continue

            rows.append({
                'udise_code': udise_raw,
                'name':       name_val,
                'board':      board_val,
                'latitude':   lat,
                'longitude':  lon,
                'district':   district_val,
                'state':      'Karnataka',
            })

    final_count = len(rows)
    print(f'Raw Karnataka rows   : {raw_karnataka}')
    print(f'Dropped (bad coords) : {dropped_coords}')
    print(f'Dropped (no name)    : {dropped_no_name}')
    print(f'Dropped (dup udise)  : {dropped_dupes}')
    print(f'Final row count      : {final_count}')

    now_iso = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    source_note = os.path.basename(input_path)

    with open(out_full, 'w', encoding='utf-8') as out:
        out.write(f'-- Karnataka schools seed — generated by scripts/prepare_schools_data.py\n')
        out.write(f'-- Source: {source_note}\n')
        out.write(f'-- Raw Karnataka rows: {raw_karnataka}\n')
        out.write(f'-- Dropped (invalid coords): {dropped_coords}\n')
        out.write(f'-- Dropped (missing name): {dropped_no_name}\n')
        out.write(f'-- Dropped (duplicate udise_code): {dropped_dupes}\n')
        out.write(f'-- Final row count: {final_count}\n')
        out.write(f'-- Generated: {now_iso}\n')
        out.write('\n')

        if not rows:
            out.write('-- No rows to insert.\n')
            print('WARNING: No rows produced. Output file contains no INSERT.')
            return

        out.write('INSERT INTO public.schools (udise_code, name, board, latitude, longitude, district, state)\nVALUES\n')
        for i, r in enumerate(rows):
            udise_sql = f"'{_escape_sql_string(r['udise_code'])}'" \
                if r['udise_code'] else 'NULL'
            name_sql     = f"'{_escape_sql_string(r['name'])}'"
            board_sql    = f"'{r['board']}'"
            district_sql = f"'{_escape_sql_string(r['district'])}'"
            separator    = ',' if i < len(rows) - 1 else ''
            out.write(
                f"    ({udise_sql}, {name_sql}, {board_sql}, "
                f"{r['latitude']:.6f}, {r['longitude']:.6f}, "
                f"{district_sql}, 'Karnataka'){separator}\n"
            )
        out.write('ON CONFLICT (udise_code) DO NOTHING;\n')

    print(f'Output written to    : {out_full}')


def main() -> None:
    if len(sys.argv) != 2:
        print('Usage: python scripts/prepare_schools_data.py <path-to-kaggle-csv>')
        sys.exit(1)

    input_path  = sys.argv[1]
    script_dir  = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, 'karnataka_schools_seed.sql')

    if not os.path.isfile(input_path):
        sys.exit(f'ERROR: File not found: {input_path}')

    process(input_path, output_path)


if __name__ == '__main__':
    main()
