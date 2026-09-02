#!/usr/bin/env python3
"""
Offline OSM Area/City boundary geometry extractor for issue #2422.

Extracts closed-way and relation/multipolygon administrative boundaries from a
local OSM extract (.osm/.osm.pbf), using pyosmium's built-in area assembly
(`osmium.SimpleHandler.apply_file(..., locations=True)`, which internally
drives `osmium.area.AreaManager`'s two-pass assembly whenever the handler
implements an `area()` callback) so that both simple closed-way boundaries
AND relation/multipolygon boundaries with outer/inner rings (holes) and
multipart geometry are handled through one code path (the "D6" relation/
multipolygon assembly that scripts/geography/extract_osm_candidates.py (#1900)
deliberately deferred — see that script's module docstring).

Offline only: this script never makes a network call. The caller supplies a
local .pbf/.osm file (e.g. a pinned Geofabrik `karnataka-latest.osm.pbf`) plus
its own recorded SHA256 checksum — this script does not compute or verify the
checksum itself, it only threads the caller-supplied value through to the
output records as provenance (checksum verification of the downloaded file is
the caller's/operator's responsibility, done once at download time).

Deterministic, reviewable city/area mapping (no fuzzy-name auto-accept): the
caller supplies a JSON "target manifest" (--targets) that explicitly lists
every (osm_type, osm_id) -> (city_id, entity_type, area_key) mapping to
extract. A target is only ever extracted if its manifest entry's
`mapping_confirmed` field is exactly the string "yes" — anything else
(missing, "no", "pending", ...) is treated as not-yet-reviewed and silently
excluded from extraction (never guessed).

Quarantine, never repair: an assembled area that fails `shapely`'s validity
check (self-intersecting rings, zero-area/degenerate rings, etc.) is emitted
as a QUARANTINED record with a reason and NO geometry — this script never
calls anything equivalent to `ST_MakeValid`/`buffer(0)` to "fix" the shape.

A confirmed target that is never encountered while walking the source file is
emitted as an ABSENT_IN_SOURCE record (never silently dropped from the
output — every confirmed target produces exactly one output record).

Usage:
    python3 extract_osm_boundaries.py \\
        --pbf karnataka-latest.osm.pbf \\
        --targets targets.json \\
        --source-name karnataka-latest.osm.pbf \\
        --source-checksum <sha256 of the .pbf file> \\
        --extract-date 2026-08-01 \\
        --out boundaries.jsonl

Target manifest (--targets) shape — a JSON array of objects:
    [
      {
        "osm_type": "relation",              # "relation" | "way"
        "osm_id": 123456,
        "city_id": 2,
        "entity_type": "AREA",               # "CITY" | "AREA"
        "area_key": "IN|KA|Bengaluru|BTM Layout",   # required for AREA, must be absent/null for CITY
        "mapping_confirmed": "yes"           # only "yes" is ever extracted
      },
      ...
    ]
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from typing import Optional


class TargetManifestError(ValueError):
    """Raised when the target manifest is malformed. Never guessed around."""


@dataclass(frozen=True)
class Target:
    osm_type: str  # "way" | "relation"
    osm_id: int
    city_id: int
    entity_type: str  # "CITY" | "AREA"
    area_key: Optional[str]


def _load_targets(targets_path: str) -> list[Target]:
    """
    Loads and validates the target manifest. Only rows with
    mapping_confirmed == "yes" are returned — everything else is a
    not-yet-reviewed row and is excluded (never guessed, never auto-accepted).
    """
    with open(targets_path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    if not isinstance(raw, list):
        raise TargetManifestError(f"{targets_path}: expected a JSON array at the top level")

    targets: list[Target] = []
    for i, entry in enumerate(raw):
        if not isinstance(entry, dict):
            raise TargetManifestError(f"{targets_path}[{i}]: expected an object")
        if entry.get("mapping_confirmed") != "yes":
            continue  # not confirmed for import — silently excluded, not guessed

        osm_type = entry.get("osm_type")
        if osm_type not in ("way", "relation"):
            raise TargetManifestError(
                f"{targets_path}[{i}]: osm_type must be 'way' or 'relation', got {osm_type!r}"
            )
        osm_id = entry.get("osm_id")
        if not isinstance(osm_id, int):
            raise TargetManifestError(f"{targets_path}[{i}]: osm_id must be an integer")
        city_id = entry.get("city_id")
        if not isinstance(city_id, int):
            raise TargetManifestError(f"{targets_path}[{i}]: city_id must be an integer")
        entity_type = entry.get("entity_type")
        if entity_type not in ("CITY", "AREA"):
            raise TargetManifestError(
                f"{targets_path}[{i}]: entity_type must be 'CITY' or 'AREA', got {entity_type!r}"
            )
        area_key = entry.get("area_key")
        if entity_type == "AREA" and not area_key:
            raise TargetManifestError(f"{targets_path}[{i}]: AREA rows require a non-empty area_key")
        if entity_type == "CITY" and area_key:
            raise TargetManifestError(f"{targets_path}[{i}]: CITY rows must not carry an area_key")

        targets.append(
            Target(
                osm_type=osm_type,
                osm_id=osm_id,
                city_id=city_id,
                entity_type=entity_type,
                area_key=area_key,
            )
        )
    return targets


def _record(
    target: Target,
    status: str,
    *,
    geometry_wkt: Optional[str] = None,
    unavailable_reason: Optional[str] = None,
    osm_element_type: Optional[str] = None,
    osm_element_id: Optional[int] = None,
    osm_version: Optional[int] = None,
    extract_date: Optional[str] = None,
    source_name: Optional[str] = None,
    source_checksum: Optional[str] = None,
) -> dict:
    return {
        "city_id": target.city_id,
        "entity_type": target.entity_type,
        "area_key": target.area_key,
        "status": status,
        "unavailable_reason": unavailable_reason,
        "geometry_wkt": geometry_wkt,
        "geometry_source": "OSM",
        "osm_element_type": osm_element_type,
        "osm_element_id": osm_element_id,
        "osm_version": osm_version,
        "osm_extract_date": extract_date,
        "osm_source_name": source_name,
        "osm_source_checksum_sha256": source_checksum,
    }


def extract(
    pbf_path: str,
    targets_path: str,
    source_name: str,
    source_checksum: str,
    extract_date: str,
    out_path: str,
) -> dict:
    """
    Runs pyosmium's two-pass area assembly over `pbf_path`, matches assembled
    areas against the confirmed rows of `targets_path`, and writes one JSONL
    record per confirmed target to `out_path` (VALID with geometry,
    QUARANTINED with a reason, or ABSENT_IN_SOURCE if never encountered).

    Returns a counts dict: targets_confirmed, valid, quarantined,
    absent_in_source.
    """
    # osmium/shapely are extraction-only dependencies (pinned in
    # requirements.txt) — imported lazily so the rest of this package (and
    # any test that only exercises _load_targets/_record) never requires them.
    import osmium
    import shapely.wkb

    targets = _load_targets(targets_path)
    target_index: dict[tuple[str, int], Target] = {(t.osm_type, t.osm_id): t for t in targets}
    found: dict[tuple[str, int], dict] = {}

    wkbfab = osmium.geom.WKBFactory()

    class _BoundaryAreaHandler(osmium.SimpleHandler):
        def area(self, a):  # noqa: N802 - osmium callback name
            elem_type = "way" if a.from_way() else "relation"
            key = (elem_type, a.orig_id())
            target = target_index.get(key)
            if target is None:
                return  # not one of the confirmed targets — ignore

            try:
                osm_version = a.version
            except (AttributeError, RuntimeError):
                osm_version = None

            try:
                wkb_hex = wkbfab.create_multipolygon(a)
            except RuntimeError as exc:
                found[key] = _record(
                    target,
                    "QUARANTINED",
                    unavailable_reason=f"area_assembly_failed: {exc}",
                    osm_element_type=elem_type,
                    osm_element_id=target.osm_id,
                    osm_version=osm_version,
                    extract_date=extract_date,
                    source_name=source_name,
                    source_checksum=source_checksum,
                )
                return

            shp = shapely.wkb.loads(bytes.fromhex(wkb_hex))
            if not shp.is_valid or shp.is_empty or shp.area <= 0:
                # Self-intersecting, empty, or degenerate (zero-area/collinear)
                # geometry: quarantined, never auto-repaired.
                found[key] = _record(
                    target,
                    "QUARANTINED",
                    unavailable_reason="invalid_or_degenerate_geometry",
                    osm_element_type=elem_type,
                    osm_element_id=target.osm_id,
                    osm_version=osm_version,
                    extract_date=extract_date,
                    source_name=source_name,
                    source_checksum=source_checksum,
                )
                return

            found[key] = _record(
                target,
                "VALID",
                geometry_wkt=shp.wkt,
                osm_element_type=elem_type,
                osm_element_id=target.osm_id,
                osm_version=osm_version,
                extract_date=extract_date,
                source_name=source_name,
                source_checksum=source_checksum,
            )

    # SimpleHandler.apply_file(..., locations=True) detects (via hasattr(self, "area"))
    # that this handler needs assembled areas and transparently drives the required
    # two-pass osmium.area.AreaManager assembly (a first pass collecting relation
    # candidates, then a NodeLocationsForWays-backed second pass) internally. Do not
    # hand-roll osmium.area.MultipolygonManager()/osmium.apply() here — that class
    # does not exist in pyosmium >=4 (see osmium/simple_handler.py's own
    # SimpleHandler._apply_object() for the equivalent internal implementation).
    handler = _BoundaryAreaHandler()
    handler.apply_file(pbf_path, locations=True)

    counts = {
        "targets_confirmed": len(targets),
        "valid": 0,
        "quarantined": 0,
        "absent_in_source": 0,
    }
    with open(out_path, "w", encoding="utf-8") as out:
        for target in targets:
            key = (target.osm_type, target.osm_id)
            rec = found.get(key)
            if rec is None:
                rec = _record(
                    target,
                    "ABSENT_IN_SOURCE",
                    unavailable_reason=(
                        f"{target.osm_type} {target.osm_id} not found (or not assembled as an area) "
                        "in the supplied source extract"
                    ),
                    osm_element_type=target.osm_type,
                    osm_element_id=target.osm_id,
                    extract_date=extract_date,
                    source_name=source_name,
                    source_checksum=source_checksum,
                )
                counts["absent_in_source"] += 1
            elif rec["status"] == "VALID":
                counts["valid"] += 1
            else:
                counts["quarantined"] += 1
            out.write(json.dumps(rec, ensure_ascii=False) + "\n")

    return counts


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pbf", required=True, help="Path to a local .osm or .osm.pbf extract (offline only)")
    parser.add_argument("--targets", required=True, help="Path to the target manifest JSON file")
    parser.add_argument("--source-name", required=True, help="Human-readable source name, e.g. karnataka-latest.osm.pbf")
    parser.add_argument("--source-checksum", required=True, help="SHA256 checksum of the source file, as recorded by the caller")
    parser.add_argument("--extract-date", required=True, help="ISO date (YYYY-MM-DD) the source extract was taken/downloaded")
    parser.add_argument("--out", required=True, help="Output JSONL path")
    args = parser.parse_args(argv)

    counts = extract(
        args.pbf,
        args.targets,
        args.source_name,
        args.source_checksum,
        args.extract_date,
        args.out,
    )
    print(json.dumps(counts, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
