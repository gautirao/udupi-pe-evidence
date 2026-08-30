#!/usr/bin/env python3
"""Python port of GeometryTrust.classify (#1887 PR1, issue #1900 AC4/D4/R5).

Mirrors apps/api/src/main/java/com/example/realestate/discover/GeometryTrust.java
(lines 23-39) EXACTLY: computed only from geometry_source + centre/bbox
presence, never from listing coordinates or listing density, never from
candidate popularity.

Returns the same string labels as the Java enum names: "VERIFIED",
"PROVISIONAL", "MISSING". Never returns a Python None/enum object so CSV/
JSON serialization is trivial and matches the Java toString() convention
used elsewhere in the merged #1887 contract.

CRITICAL (D4/R5): callers MUST NOT synthesise a degenerate point bbox
(min == max == centre) to force VERIFIED. A point-only candidate with no
real bbox MUST classify PROVISIONAL — this module only reports what it is
given; it is extract_osm_candidates.py's responsibility to leave bbox
fields as None for point (node) candidates rather than filling them with
the point itself.
"""
from __future__ import annotations

VERIFIED = "VERIFIED"
PROVISIONAL = "PROVISIONAL"
MISSING = "MISSING"

_TRUSTED_SOURCES = {"OSM", "MANUAL"}


def classify(
    geometry_source: str | None,
    geo_center_lat: float | None,
    geo_center_lon: float | None,
    min_lat: float | None,
    min_lon: float | None,
    max_lat: float | None,
    max_lon: float | None,
) -> str:
    """Mirrors GeometryTrust.classify (Java lines 23-39):

    - geo_center_lat/lon missing -> MISSING (reserved strictly for an
      absent geo_center).
    - geometry_source is None is the legacy-seed case and MUST classify
      PROVISIONAL, never MISSING, when a centre IS present.
    - geometry_source in {OSM, MANUAL} AND all four bbox bounds present
      -> VERIFIED.
    - Everything else with a centre present -> PROVISIONAL.
    """
    if geo_center_lat is None or geo_center_lon is None:
        return MISSING

    bbox_complete = (
        min_lat is not None and min_lon is not None
        and max_lat is not None and max_lon is not None
    )
    trusted_source = geometry_source in _TRUSTED_SOURCES

    if trusted_source and bbox_complete:
        return VERIFIED
    return PROVISIONAL
