#!/usr/bin/env python3
"""Raw OSM candidate JSONL -> reviewer CSV (issue #1900 AC1/AC5).

Every row carries READ-ONLY evidence columns (raw OSM element id/type,
name variants, place/admin_level, centroid/bbox, postal_code, wikidata,
a computed geometry_trust value, and a digest of the raw tag dict) plus
EMPTY editable decision columns for a human reviewer to fill in
(decision, merge_target_key, canonical_name_override, proposed_area_key,
reviewer, reviewed_at, review_reason, aliases, alias_langs). proposed_area_key
is PRE-FILLED with a provisional minted key so the reviewer edits rather than
invents one from scratch, but it remains an editable/decision column, not
evidence (build_batch_json.py re-imports whatever value is present at review
time).

reviewer and reviewed_at are mandatory for EVERY row; review_reason is
mandatory for EXCLUDE/MERGE/RENAME/ALIAS (optional for INCLUDE) —
build_batch_json.py refuses to emit if any of this review metadata is
missing. aliases (manual free-text) and alias_langs (semicolon-delimited
tokens from {name:kn, name:en, alt_name, old_name} promoting that row's
already-verified evidence value to an alias) are captured here and emitted
to a separate #1900-owned city-area-review-manifest.json sidecar — they are
never silently dropped, and never added to the #1887 CandidateInput
contract itself. decision=ALIAS marks a whole element as an alternate name
of another area (never emitted as its own candidate, like MERGE); its
target reuses the merge_target_key column.

geometry_trust is computed by the SAME rule as GeometryTrust.classify (see
geometry_trust.py) so the value a curator sees here is exactly what #1887's
dryRun will compute later — no drift.

Row identity for re-import (AC5) is the stable OSM element id: (osm_type,
osm_id). build_batch_json.py's evidence-column-immutability guard is keyed
by this pair.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json

from area_key import mint
from geometry_trust import classify as classify_geometry_trust

# Read-only evidence columns — build_batch_json.py code-enforces this by
# cross-checking every reviewed CSV row's evidence columns against the
# ORIGINAL raw candidate JSONL, matched by the row's stable (osm_type,
# osm_id) identity (see build_batch_json._verify_evidence_matches_raw). A
# hand-edited evidence cell is refused, never silently trusted.
EVIDENCE_COLUMNS = [
    "osm_type", "osm_id", "name", "name_kn", "name_en", "alt_name", "old_name",
    "place", "boundary", "admin_level",
    "geo_center_lat", "geo_center_lon", "min_lat", "min_lon", "max_lat", "max_lon",
    "geometry_source", "postal_code", "wikidata", "geometry_trust", "raw_tags_digest",
]

# Editable decision columns (issue #1900 Q5 + user-correction rework
# BLOCKING 1/2). aliases and alias_langs ARE emitted — as a separate
# #1900-owned city-area-review-manifest.json sidecar alongside the
# unchanged #1887 batch JSON (see build_batch_json.build_review_manifest);
# they are never added to the #1887 CandidateInput contract itself. reviewer
# and reviewed_at are mandatory for every row (build_batch_json.py refuses
# to emit if either is blank); review_reason is mandatory for
# EXCLUDE/MERGE/RENAME/ALIAS (optional for INCLUDE).
DECISION_COLUMNS = [
    "decision", "merge_target_key", "canonical_name_override", "proposed_area_key",
    "reviewer", "reviewed_at", "review_reason", "aliases", "alias_langs",
]

ALL_COLUMNS = EVIDENCE_COLUMNS + DECISION_COLUMNS

VALID_DECISIONS = {"INCLUDE", "EXCLUDE", "MERGE", "RENAME", "ALIAS"}


def raw_tags_digest(all_tags: dict | None) -> str:
    canonical = json.dumps(all_tags or {}, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def candidate_name(record: dict) -> str:
    names = record.get("names") or {}
    return names.get("name") or record.get("place") or f"{record['osm_type']}-{record['osm_id']}"


def build_row(record: dict, state_code: str, city: str) -> dict:
    names = record.get("names") or {}
    centroid = record.get("centroid") or [None, None]
    bbox = record.get("bbox") or [None, None, None, None]
    geo_center_lon, geo_center_lat = centroid[0], centroid[1]
    min_lon, min_lat, max_lon, max_lat = bbox[0], bbox[1], bbox[2], bbox[3]

    name = candidate_name(record)
    # Extraction is OSM-only in this PR (AC8 forbidden-source rule) — every
    # candidate's raw geometry_source evidence is therefore "OSM".
    geometry_source = "OSM"
    geometry_trust = classify_geometry_trust(
        geometry_source, geo_center_lat, geo_center_lon, min_lat, min_lon, max_lat, max_lon)

    try:
        proposed_area_key = mint("IN", state_code, city, name)
    except ValueError:
        # Leave blank rather than guess — the reviewer must supply a valid
        # key by hand; build_batch_json.py will reject a blank/invalid key.
        proposed_area_key = ""

    return {
        "osm_type": record.get("osm_type"),
        "osm_id": record.get("osm_id"),
        "name": names.get("name"),
        "name_kn": names.get("name:kn"),
        "name_en": names.get("name:en"),
        "alt_name": names.get("alt_name"),
        "old_name": names.get("old_name"),
        "place": record.get("place"),
        "boundary": record.get("boundary"),
        "admin_level": record.get("admin_level"),
        "geo_center_lat": geo_center_lat,
        "geo_center_lon": geo_center_lon,
        "min_lat": min_lat,
        "min_lon": min_lon,
        "max_lat": max_lat,
        "max_lon": max_lon,
        "geometry_source": geometry_source,
        "postal_code": record.get("postal_code"),
        "wikidata": record.get("wikidata"),
        "geometry_trust": geometry_trust,
        "raw_tags_digest": raw_tags_digest(record.get("all_tags")),
        "decision": "",
        "merge_target_key": "",
        "canonical_name_override": "",
        "proposed_area_key": proposed_area_key,
        "reviewer": "",
        "reviewed_at": "",
        "review_reason": "",
        "aliases": "",
        "alias_langs": "",
    }


def build_csv(jsonl_path: str, state_code: str, city: str, out_path: str) -> list[dict]:
    rows = []
    with open(jsonl_path, "r", encoding="utf-8") as jsonl_fh:
        for line in jsonl_fh:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            rows.append(build_row(record, state_code, city))

    with open(out_path, "w", encoding="utf-8", newline="") as out_fh:
        writer = csv.DictWriter(out_fh, fieldnames=ALL_COLUMNS, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    return rows


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("jsonl", help="raw candidate JSONL produced by extract_osm_candidates.py")
    parser.add_argument("state_code", help="e.g. KA")
    parser.add_argument("city", help="city label, e.g. 'udupi' or 'bangalore'")
    parser.add_argument("out", help="output reviewer CSV path")
    args = parser.parse_args(argv)

    rows = build_csv(args.jsonl, args.state_code, args.city, args.out)
    print(json.dumps({"rows_written": len(rows)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
