#!/usr/bin/env python3
"""City -> state-code + default bbox configuration (#1900 Q6/OQ3).

Adding a new city (e.g. a third pilot city) is a CONFIG-ONLY change — no
code change to any extractor/builder script (AC7). The "district" segment
of a minted area_key is the city label itself (e.g. "udupi" -> "Udupi",
"bangalore" -> "Bengaluru" via area_key.normalise_district_token's CASE
rules), matching the existing seeded convention
(e.g. "IN|KA|Bengaluru|Whitefield", "IN|KA|Udupi|Manipal").

bbox is (min_lon, min_lat, max_lon, max_lat), matching the extractor CLI
arg order and the raw candidate JSONL bbox convention.
"""
from __future__ import annotations

CITY_CONFIG = {
    "udupi": {
        "state_code": "KA",
        "bbox": (74.60, 13.15, 74.90, 13.50),
    },
    "bangalore": {
        "state_code": "KA",
        "bbox": (77.35, 12.75, 77.85, 13.20),
    },
}


def get_city_config(city: str) -> dict:
    """Looks up a city's config by case-insensitive, trimmed label.

    Raises KeyError with an actionable message (add a CITY_CONFIG entry —
    no code change needed) rather than guessing/defaulting a bbox or state.
    """
    if city is None:
        raise KeyError("city must not be None")
    key = city.strip().lower()
    if key not in CITY_CONFIG:
        raise KeyError(
            f"No city_config entry for city={city!r}. Onboarding a new city is "
            f"config-only: add an entry to CITY_CONFIG in "
            f"scripts/geography/city_config.py (state_code + bbox) — no script "
            f"code change required.")
    return CITY_CONFIG[key]
