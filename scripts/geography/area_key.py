#!/usr/bin/env python3
"""Python port of AreaKeyFormat (#1887 PR1, issue #1900 AC4/D3).

Ports, VERBATIM, the district CASE-normalisation rules from
backend/src/main/java/com/example/realestate/discover/AreaKeyFormat.java
(lines 31-47 isValidFourSegment, 56-70 normalise/normaliseDistrictToken,
89-94 titleCase). This module is a validator/normaliser AND a key MINTER
(mint() has no Java counterpart — AreaKeyFormat never invents a key; #1900
owns minting on the Python side, per design decision D3).

Do NOT alter these rules without also updating AreaKeyFormat.java and vice
versa — drift here silently breaks #1887 compatibility. The Java compat IT
(AreaOnboarding1900ArtifactCompatIT) is the authoritative cross-language
guard: it asserts AreaKeyFormat.normalise() accepts minted keys unchanged.
"""
from __future__ import annotations

REQUIRED_SEGMENTS = 4
DISTRICT_SEGMENT_INDEX = 2

# Mirrors AreaKeyFormat.normaliseDistrictToken's switch statement exactly.
_BENGALURU_ALIASES = {"bengaluru urban", "bangalore urban", "bangalore"}
_MANGALORE_ALIASES = {"dakshina kannada", "mangaluru"}


def normalise_district_token(raw_district: str | None) -> str | None:
    """Mirrors AreaKeyFormat.normaliseDistrictToken (Java lines 77-87) verbatim.

    Returns a lower-cased, comparison-ready token — NOT title-cased (see
    _title_case for the display form used by normalise()).
    """
    if raw_district is None:
        return None
    normalised = raw_district.strip().lower()
    if normalised in _BENGALURU_ALIASES:
        return "bengaluru"
    if normalised in _MANGALORE_ALIASES:
        return "mangalore"
    return normalised


def _title_case(token: str | None) -> str | None:
    """Mirrors AreaKeyFormat.titleCase (Java lines 89-94): uppercases ONLY the
    first character, leaving the rest untouched — NOT a per-word title case.
    """
    if not token:
        return token
    return token[0].upper() + token[1:]


def is_valid_four_segment(area_key: str | None) -> bool:
    """Mirrors AreaKeyFormat.isValidFourSegment (Java lines 31-47).

    True iff area_key splits into exactly 4 pipe-delimited segments, none of
    which is blank after trimming. Python's str.split("|") with no maxsplit
    keeps trailing empty segments (matching Java's split("\\|", -1)).
    """
    if area_key is None:
        return False
    segments = area_key.split("|")
    if len(segments) != REQUIRED_SEGMENTS:
        return False
    for segment in segments:
        if segment is None or segment.strip() == "":
            return False
    return True


def normalise(area_key: str) -> str:
    """Mirrors AreaKeyFormat.normalise (Java lines 56-70).

    Trims every segment and district-normalises + title-cases segment 2
    (index 2, zero-based: country|state|DISTRICT|area). Raises ValueError
    (mirroring the Java IllegalArgumentException) on a malformed key —
    callers MUST check is_valid_four_segment first.
    """
    if not is_valid_four_segment(area_key):
        raise ValueError(f"area_key is not a valid 4-segment key: {area_key!r}")
    segments = area_key.split("|")
    out = []
    for i, segment in enumerate(segments):
        trimmed = segment.strip()
        if i == DISTRICT_SEGMENT_INDEX:
            out.append(_title_case(normalise_district_token(trimmed)))
        else:
            out.append(trimmed)
    return "|".join(out)


class AreaKeyMintError(ValueError):
    """Raised when mint() cannot produce a key that satisfies the AreaKeyFormat
    contract (idempotent under normalise + valid 4-segment shape)."""


def mint(country: str, state: str, district: str, area: str) -> str:
    """Mints 'IN|<state>|<normalised district>|<area>', GUARANTEEING the
    result satisfies is_valid_four_segment(result) and
    normalise(result) == result (#1900 AC4/D3 — #1900 owns minting;
    AreaKeyFormat.java never invents a key, it only validates/normalises one).

    district is district-normalised via the SAME CASE rules as normalise()
    (e.g. a raw city label 'bangalore' mints as 'Bengaluru'); area/country/
    state segments are trimmed but otherwise passed through as-is.
    """
    if country is None or state is None or district is None or area is None:
        raise AreaKeyMintError(
            f"mint() requires non-null country/state/district/area, got "
            f"country={country!r} state={state!r} district={district!r} area={area!r}")

    country_seg = country.strip()
    state_seg = state.strip()
    district_seg = _title_case(normalise_district_token(district))
    area_seg = area.strip()

    if not country_seg or not state_seg or not district_seg or not area_seg:
        raise AreaKeyMintError(
            f"mint() requires non-blank segments after trimming, got "
            f"country={country_seg!r} state={state_seg!r} district={district_seg!r} area={area_seg!r}")

    key = f"{country_seg}|{state_seg}|{district_seg}|{area_seg}"

    if not is_valid_four_segment(key):
        raise AreaKeyMintError(f"mint() produced an invalid 4-segment key: {key!r}")
    if normalise(key) != key:
        raise AreaKeyMintError(
            f"mint() produced a key that is not idempotent under normalise(): "
            f"{key!r} != {normalise(key)!r}")
    return key
