"""Ensures scripts/geography/ is importable as top-level modules
(area_key, geometry_trust, city_config, extract_osm_candidates,
build_review_csv, build_batch_json) regardless of the pytest invocation
cwd (e.g. `python -m pytest scripts/geography/tests/` from repo root)."""
import os
import sys

_GEOGRAPHY_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _GEOGRAPHY_DIR not in sys.path:
    sys.path.insert(0, _GEOGRAPHY_DIR)
