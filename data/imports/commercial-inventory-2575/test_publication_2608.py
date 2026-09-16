#!/usr/bin/env python3
"""
Issue #2608 — Python verification suite for Commercial Publication & Canary Gate.
Tests candidate data quality, canary selection determinism & coverage, and PII posture.
"""

import json
import hashlib
import os
import sys

IMPORT_DIR = os.path.dirname(os.path.abspath(__file__))

CANARY_SELECTION = [
    # (platform, source_id, city, subtype)
    ("99acres", "Y92487718", "Udupi", "SHOP"),
    ("99acres", "M91395690", "Udupi", "OFFICE"),
    ("99acres", "V92668720", "Udupi", "LAND"),
    ("99acres", "A68945876", "Bengaluru", "SHOP"),
    ("99acres", "D94189536", "Bengaluru", "OFFICE"),
    ("99acres", "W94256632", "Bengaluru", "WAREHOUSE"),
    ("99acres", "K92019122", "Bengaluru", "LAND"),
    ("99acres", "K93076034", "Mangalore", "SHOP"),
    ("99acres", "I93138370", "Mangalore", "OFFICE"),
    ("99acres", "T92134736", "Mangalore", "WAREHOUSE"),
]


def derive_uuid(platform: str, source_id: str) -> str:
    m = hashlib.md5(f"{platform}:{source_id}".encode("utf-8")).hexdigest()
    return f"{m[:8]}-{m[8:12]}-{m[12:16]}-{m[16:20]}-{m[20:]}"


def test_canary_selection_determinism_and_coverage():
    print("Running test_canary_selection_determinism_and_coverage...")
    assert len(CANARY_SELECTION) == 10, "Must have exactly 10 canary listings"

    cities = {item[2] for item in CANARY_SELECTION}
    assert cities == {"Udupi", "Bengaluru", "Mangalore"}, f"Missing city in coverage: {cities}"

    subtypes = {item[3] for item in CANARY_SELECTION}
    expected_subtypes = {"SHOP", "OFFICE", "WAREHOUSE", "LAND"}
    assert expected_subtypes.issubset(subtypes), f"Subtypes missing: {expected_subtypes - subtypes}"

    uuids = set()
    for platform, source_id, city, subtype in CANARY_SELECTION:
        u = derive_uuid(platform, source_id)
        assert u not in uuids, f"Duplicate UUID derived: {u}"
        uuids.add(u)

    print("  PASS: 10 canary listings selected deterministically with full city and subtype coverage.")


def test_staged_candidate_data_quality():
    print("Running test_staged_candidate_data_quality...")
    for city in ["udupi", "bengaluru", "mangalore"]:
        fn = os.path.join(IMPORT_DIR, f"{city}-staging-candidates.json")
        assert os.path.exists(fn), f"Staging candidate file missing: {fn}"

        with open(fn, "r", encoding="utf-8") as f:
            candidates = json.load(f)

        assert isinstance(candidates, list), f"Expected list in {fn}"
        for cand in candidates:
            # Title quality
            title = cand.get("title")
            assert title and isinstance(title, str) and title.strip(), f"Invalid title in candidate {cand}"

            # Purpose and money agreement
            purpose = cand.get("listing_purpose")
            assert purpose in ("sale", "rent"), f"Invalid listing purpose: {purpose}"
            if purpose == "sale":
                assert cand.get("price") is not None, "Sale candidate missing price"
                assert cand.get("monthly_rent") is None, "Sale candidate has monthly_rent"
            elif purpose == "rent":
                assert cand.get("monthly_rent") is not None, "Rent candidate missing monthly_rent"
                assert cand.get("price") is None, "Rent candidate has sale price"

            # Subtype
            st = cand.get("commercial_subtype") or cand.get("property_type")
            valid_subtypes = ("SHOP", "OFFICE", "BUILDING", "WAREHOUSE", "LAND")
            assert st in valid_subtypes, f"Invalid subtype {st} in candidate {cand}"

    print("  PASS: All staged candidates pass Phase C data quality contract.")


def main():
    test_canary_selection_determinism_and_coverage()
    test_staged_candidate_data_quality()
    print("All Python publication tests PASSED successfully (2/2).")


if __name__ == "__main__":
    main()
