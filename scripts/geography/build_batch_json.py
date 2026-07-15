#!/usr/bin/env python3
"""Reviewed CSV + raw candidate JSONL -> offline-validated, byte-deterministic,
checksummed #1887 CandidateBatchFile JSON, PLUS a separate #1900-owned
city-area-review-manifest.json sidecar (issue #1900 AC2/AC3/AC5, plus the
user-correction rework of PR #1904's HOLD findings — see
.claude/handoffs/issue-1900/architect-design-review-manifest.md, the settled
design this file implements verbatim).

Output shape matches
backend/src/main/java/com/example/realestate/discover/AreaOnboardingRunner.java's
CandidateBatchFile record (lines 153-161) and
AreaOnboardingService.CandidateInput (lines 73-84) BYTE-FOR-BYTE:

Top-level keys, in this EXACT order:
    datasetId, datasetVersion, artifactChecksum, provider, inputSchemaVersion,
    sourceExtractedAt, candidates

Each candidate, in this EXACT order (candidates sorted by areaKey):
    areaKey, name, geoCenterLat, geoCenterLon, minLat, minLon, maxLat, maxLon,
    geometrySource, externalSourceId

Only rows with decision INCLUDE or RENAME are emitted as candidates.
EXCLUDE rows are dropped. MERGE and ALIAS rows are NEVER emitted as
candidates, but (rework BLOCKING 2/MAJOR 6) ARE preserved — along with
EXCLUDE — in the review manifest sidecar, so the reviewed-but-not-emitted
decision is never silently discarded from the durable record. A MERGE/ALIAS
row's merge_target_key must resolve (against an in-batch INCLUDE/RENAME
proposed_area_key, or a supplied --canonical-area-inventory), or the batch
is REFUSED — shape-only resolution is accepted ONLY under --provisional
(see _validate_and_project). RENAME rows are emitted (like INCLUDE) but MUST
carry a non-blank canonical_name_override, which becomes the emitted `name`
(never the area_key — proposed_area_key is always THE area key column,
directly editable by the reviewer per AC5's editable-column list).

Refuses to emit (non-zero exit) on ANY of (AC3, plus the rework findings):
a bad/non-idempotent areaKey; duplicate emitted area keys; duplicate
externalSourceId; lat/lon out of range; a bbox with min>max; a
missing/unrecognised decision; a MERGE/ALIAS with an unresolved/absent
target; blank reviewer/reviewed_at/review_reason review metadata (BLOCKING
1); a duplicate raw candidate identity in the raw JSONL, byte-identical or
conflicting (MAJOR 5); an unvalidated/missing source manifest in default
(final) mode (MAJOR 4); an intentionally-looking-valid empty candidate list
without --allow-empty; a blank/unsupported datasetId/datasetVersion/
provider/inputSchemaVersion/sourceExtractedAt; or (when --expected-checksum
/--expected-review-checksum is supplied) a checksum that does not
recompute. Within-city area key collisions are NEVER auto-suffixed (AC4) —
they are a hard validation error naming both conflicting rows.

Refuses to emit (AC5) if ANY reviewed-CSV row's EVIDENCE columns (osm_type,
osm_id, raw name variants, place, boundary, admin_level, geo_center_lat/lon,
bbox, geometry_source, postal_code, wikidata, geometry_trust) diverge from
the corresponding record in the ORIGINAL raw candidate JSONL (matched by
OSM element id). Evidence columns are read-only by contract (see
build_review_csv.py); this is the code-enforced guard for that contract —
a reviewer edit to any evidence cell (or a row with no matching raw record
at all) is refused, naming the exact diverging field and OSM id. Only the
DECISION columns (decision, merge_target_key, canonical_name_override,
proposed_area_key, reviewer, reviewed_at, review_reason, aliases,
alias_langs) are meant to change between the raw extraction and the
reviewed CSV — build_batch_json.py cross-checks evidence against the raw
JSONL on every load; it never merely trusts the CSV for evidence.

The cross-checked field set is derived from (a subset of)
build_review_csv.EVIDENCE_COLUMNS — see CHECKED_EVIDENCE_FIELDS and
EVIDENCE_COLUMNS_EXCLUDED_FROM_CROSS_CHECK below, drift-guarded by
tests/test_build_batch_json.py::TestDriftGuard so a future evidence column
can't be added to the CSV without being wired into this check (or
explicitly excluded with a reason).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from datetime import datetime

from area_key import is_valid_four_segment, normalise
from build_review_csv import EVIDENCE_COLUMNS
from geometry_trust import classify as classify_geometry_trust

# India-wide generous bounding range used for a plausibility check, per the
# qa-fast risk report's R-cited bounds. NOT a city-specific bbox check
# (that already happens upstream in #1887's dryRun OUTSIDE_CITY_BOUNDS
# conflict) — this is only a sanity floor to catch obviously corrupt data
# (e.g. swapped lat/lon, a stray 0, a typo) before it ever reaches #1887.
INDIA_LAT_RANGE = (8.0, 37.5)
INDIA_LON_RANGE = (68.0, 97.5)

VALID_DECISIONS = {"INCLUDE", "EXCLUDE", "MERGE", "RENAME", "ALIAS"}
EMITTED_DECISIONS = {"INCLUDE", "RENAME"}
NON_EMITTED_WITH_TARGET_DECISIONS = {"MERGE", "ALIAS"}
REVIEW_REASON_REQUIRED_DECISIONS = {"EXCLUDE", "MERGE", "RENAME", "ALIAS"}

SUPPORTED_PROVIDERS = {"OSM"}
SUPPORTED_INPUT_SCHEMA_VERSION = "1"
KNOWN_LICENCE_IDS = {"ODbL-1.0"}

SHA256_HEX_RE = re.compile(r"^[0-9a-f]{64}$")

# alias_langs token -> (evidence CSV column it promotes, alias lang tag).
# Promotes that row's already-verified raw-evidence value to an alias
# (source="osm"); a token whose referenced evidence cell is blank is
# refused rather than silently skipped (rework ADDITIONAL findings).
ALIAS_LANG_TOKENS = {
    "name:kn": ("name_kn", "kn"),
    "name:en": ("name_en", "en"),
    "alt_name": ("alt_name", None),
    "old_name": ("old_name", None),
}

# The exact #1887 CandidateBatchFile / CandidateInput field name lists this
# emitter targets (drift-guarded by tests/test_build_batch_json.py against
# AreaOnboardingRunner.java:153-161 / AreaOnboardingService.java:73-84).
BATCH_TOP_LEVEL_FIELDS = (
    "datasetId", "datasetVersion", "artifactChecksum", "provider",
    "inputSchemaVersion", "sourceExtractedAt", "candidates",
)
CANDIDATE_FIELDS = (
    "areaKey", "name", "geoCenterLat", "geoCenterLon", "minLat", "minLon",
    "maxLat", "maxLon", "geometrySource", "externalSourceId",
)

# city-area-review-manifest.json top-level key order (design §1).
MANIFEST_TOP_LEVEL_FIELDS = (
    "manifestSchemaVersion", "datasetId", "datasetVersion", "provider",
    "licence", "source", "cityConfig", "reviewSummary", "reviewedRows",
    "emittedBatch", "reviewArtifactChecksum",
)
MANIFEST_SCHEMA_VERSION = "1"

# AC5 evidence-immutability cross-check field groups. Each group both
# DRIVES the actual checks in _verify_evidence_matches_raw (not merely
# documents them) and feeds CHECKED_EVIDENCE_FIELDS below, so the
# drift-guard test can assert the checked set + documented exclusions
# together cover every build_review_csv.EVIDENCE_COLUMNS entry.
_STRAIGHT_STRING_EVIDENCE_FIELDS = (
    "osm_type", "osm_id", "name", "name_kn", "name_en", "alt_name",
    "old_name", "place", "boundary", "admin_level", "postal_code",
    "wikidata",
)
_FLOAT_EVIDENCE_FIELDS = (
    "geo_center_lat", "geo_center_lon", "min_lat", "min_lon", "max_lat", "max_lon",
)
# geometry_source's expected value is DERIVED from the raw record's own
# provenance (falling back to the documented OSM-only extractor default),
# not read verbatim off a like-named raw field. geometry_trust's expected
# value is DERIVED via GeometryTrust.classify() over the raw
# centroid/bbox AND the row's now-VERIFIED geometry_source (never a
# hardcoded "OSM") — see _verify_evidence_matches_raw.
_DERIVED_EVIDENCE_FIELDS = ("geometry_source", "geometry_trust")

# build_review_csv.EVIDENCE_COLUMNS entries intentionally NOT cross-checked
# here, with a one-line reason each. Any EVIDENCE_COLUMNS entry not in this
# set AND not in one of the three field groups above is a drift bug — see
# tests/test_build_batch_json.py::TestDriftGuard.
EVIDENCE_COLUMNS_EXCLUDED_FROM_CROSS_CHECK = {
    "raw_tags_digest": (
        "a hash DERIVED from the raw all_tags dict at CSV-build time (see "
        "build_review_csv.raw_tags_digest); the individual tag-derived "
        "evidence columns it summarises (name variants, place, "
        "admin_level, postal_code, wikidata) are already cross-checked "
        "directly above, so a tampered digest cell has no independent "
        "effect on the emitted batch"),
}

CHECKED_EVIDENCE_FIELDS = (
    _STRAIGHT_STRING_EVIDENCE_FIELDS + _FLOAT_EVIDENCE_FIELDS + _DERIVED_EVIDENCE_FIELDS
)


class ValidationError(Exception):
    """Raised with a list of human-readable error strings; the batch is NEVER
    emitted when this is raised (AC3 refuse-to-emit contract)."""

    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def _blank(value) -> bool:
    return value is None or str(value).strip() == ""


def _to_float(value):
    if _blank(value):
        return None
    return float(value)


def _try_to_float(row_label: str, field: str, value, errors: list[str], context: str) -> float | None:
    """Like _to_float, but a non-numeric cell (e.g. a stray letter typo'd
    into a lat/lon column) is appended to `errors` as a clean, named
    ValidationError-style message instead of letting a raw ValueError
    escape past main()'s `except ValidationError` as an uncaught
    traceback. Returns None on failure so callers can keep accumulating
    further errors in the same pass; the batch is refused regardless
    because `errors` is non-empty."""
    try:
        return _to_float(value)
    except (TypeError, ValueError):
        errors.append(
            f"{row_label}: {context} column {field!r} is not a valid number "
            f"(got {value!r})")
        return None


def _row_label(row: dict) -> str:
    return f"{row.get('osm_type')}/{row.get('osm_id')}"


def _candidate_area_key(row: dict) -> str:
    return (row.get("proposed_area_key") or "").strip()


def _validate_lat_lon(row_label: str, lat, lon, errors: list[str], what: str) -> None:
    if lat is not None and not (INDIA_LAT_RANGE[0] <= lat <= INDIA_LAT_RANGE[1]):
        errors.append(f"{row_label}: {what} lat {lat} out of range {INDIA_LAT_RANGE}")
    if lon is not None and not (INDIA_LON_RANGE[0] <= lon <= INDIA_LON_RANGE[1]):
        errors.append(f"{row_label}: {what} lon {lon} out of range {INDIA_LON_RANGE}")


def _parse_iso_offset_datetime(value: str) -> datetime:
    """Parses an ISO-8601 date-time that MUST carry a UTC offset (a naive/
    local date-time is rejected). A trailing 'Z' is normalised to '+00:00'
    first (Python's datetime.fromisoformat did not accept bare 'Z' before
    3.11 and this keeps the accepted-input set explicit either way).
    Raises ValueError (never lets a bad string silently pass) on a naive
    or unparsable value."""
    v = value.strip()
    if v.endswith("Z") or v.endswith("z"):
        v = v[:-1] + "+00:00"
    dt = datetime.fromisoformat(v)
    if dt.tzinfo is None:
        raise ValueError("date-time has no UTC offset (naive date-times are refused)")
    return dt


def read_reviewed_csv(csv_path: str) -> list[dict]:
    with open(csv_path, "r", encoding="utf-8", newline="") as csv_fh:
        return list(csv.DictReader(csv_fh))


def load_raw_records(jsonl_path: str) -> dict[tuple[str, str], dict]:
    """Loads the raw candidate JSONL (produced by extract_osm_candidates.py)
    into a lookup keyed by the stable OSM element identity (osm_type,
    str(osm_id)) — the SAME identity build_review_csv.py uses for a row's
    evidence columns. This is the AC5 evidence-immutability guard's source
    of truth: build_batch_json.py never trusts the reviewed CSV's evidence
    columns verbatim, it cross-checks them against this lookup.

    MAJOR 5 (rework): a duplicate raw identity is REFUSED (ValidationError),
    never silently overwritten. A byte-identical duplicate (the exact same
    JSON object appearing twice) and a CONFLICTING duplicate (same identity,
    different field values) are reported distinctly — the conflicting case
    additionally names every field that differs — so an operator can tell
    at a glance whether the raw extraction merely duplicated a line or
    genuinely contains two different records under one OSM element id."""
    records: dict[tuple[str, str], dict] = {}
    errors: list[str] = []
    with open(jsonl_path, "r", encoding="utf-8") as jsonl_fh:
        for line_no, line in enumerate(jsonl_fh, start=1):
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            key = (
                str(record.get("osm_type") or "").strip(),
                str(record.get("osm_id") or "").strip(),
            )
            if key in records:
                existing = records[key]
                if existing == record:
                    errors.append(
                        f"duplicate raw candidate identity {key!r} at line {line_no} of "
                        f"{jsonl_path} — a BYTE-IDENTICAL duplicate record (refusing to load; "
                        f"the raw extraction must not contain the same OSM element twice)")
                else:
                    diverging_fields = sorted(
                        f for f in set(existing) | set(record) if existing.get(f) != record.get(f))
                    errors.append(
                        f"duplicate raw candidate identity {key!r} at line {line_no} of "
                        f"{jsonl_path} — a CONFLICTING duplicate record (differs in "
                        f"{diverging_fields}; refusing to load — an OSM element id must not "
                        f"appear twice with different data)")
                continue
            records[key] = record
    if errors:
        raise ValidationError(errors)
    return records


def compute_file_sha256(path: str) -> str:
    """Computes SHA-256 directly over the ACTUAL BYTES of the file at
    `path`, streamed in fixed-size chunks (safe for an arbitrarily large
    raw JSONL extract). This is the user-correction-2 rework's BLOCKING
    fix: unlike `sourceArtifactSha256` in load_source_manifest() below
    (necessarily OPERATOR-ENTERED, because this script never reads the
    multi-hundred-MB source PBF itself), the two callers of this function
    — `--raw-jsonl` and `--reviewed-csv` — ARE files this script already
    opens and reads on every run, so their hashes are ALWAYS PROGRAM-
    COMPUTED from the exact bytes passed to this invocation, never an
    operator's claim about them. Wired into build_review_manifest()'s
    `source.rawCandidateJsonlSha256`/`source.reviewedCsvSha256`, which in
    turn are covered by reviewArtifactChecksum (the whole manifest minus
    itself) — so altering either file after a review, even for a decision
    (EXCLUDE/MERGE/ALIAS) whose reviewedRows entry retains only a reduced
    evidence subset, changes reviewArtifactChecksum."""
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_source_manifest(path: str) -> dict:
    """Loads and validates an operator-supplied source manifest (MAJOR 4).
    Scripts NEVER read the underlying (potentially ~530MB) PBF/OSM extract
    themselves — sourceArtifactSha256 is operator-supplied, e.g. via a local
    `shasum -a 256` run, not recomputed here."""
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError([f"source manifest {path!r} could not be read/parsed: {exc}"])

    errors: list[str] = []
    if not isinstance(data, dict):
        raise ValidationError([f"source manifest {path!r} must be a JSON object"])

    if _blank(data.get("provider")):
        errors.append("source manifest: provider is blank")

    if _blank(data.get("sourceArtifact")):
        errors.append("source manifest: sourceArtifact is blank")

    sha = str(data.get("sourceArtifactSha256") or "").strip().lower()
    if not SHA256_HEX_RE.match(sha):
        errors.append(
            f"source manifest: sourceArtifactSha256 {data.get('sourceArtifactSha256')!r} is not "
            f"a 64-character lowercase hex sha256 (compute it yourself, e.g. via `shasum -a 256`"
            f" — this script never reads the source PBF)")

    if _blank(data.get("sourceDownloadUrl")):
        errors.append("source manifest: sourceDownloadUrl is blank")

    source_downloaded_at = data.get("sourceDownloadedAt")
    if not _blank(source_downloaded_at):
        try:
            _parse_iso_offset_datetime(source_downloaded_at)
        except ValueError as exc:
            errors.append(f"source manifest: sourceDownloadedAt {source_downloaded_at!r} is not "
                           f"a valid ISO-8601 offset date-time ({exc})")

    source_extracted_at = data.get("sourceExtractedAt")
    if _blank(source_extracted_at):
        errors.append("source manifest: sourceExtractedAt is required")
    else:
        try:
            _parse_iso_offset_datetime(source_extracted_at)
        except ValueError as exc:
            errors.append(f"source manifest: sourceExtractedAt {source_extracted_at!r} is not a "
                           f"valid ISO-8601 offset date-time ({exc})")

    licence = data.get("licence")
    if not isinstance(licence, dict):
        errors.append("source manifest: licence must be an object with id/name/url/attribution")
    else:
        for field in ("id", "name", "url", "attribution"):
            if _blank(licence.get(field)):
                errors.append(f"source manifest: licence.{field} is blank")
        if licence.get("id") not in KNOWN_LICENCE_IDS:
            errors.append(
                f"source manifest: licence.id {licence.get('id')!r} is not a known licence id "
                f"({sorted(KNOWN_LICENCE_IDS)}) — OSM-derived data must use 'ODbL-1.0'")

    city_config = data.get("cityConfig")
    if not isinstance(city_config, dict):
        errors.append("source manifest: cityConfig must be an object with slug/stateCode/bbox")
    else:
        if _blank(city_config.get("slug")):
            errors.append("source manifest: cityConfig.slug is blank")
        if _blank(city_config.get("stateCode")):
            errors.append("source manifest: cityConfig.stateCode is blank")
        bbox = city_config.get("bbox")
        if not isinstance(bbox, list) or len(bbox) != 4:
            errors.append(
                "source manifest: cityConfig.bbox must be a 4-element "
                "[minLon, minLat, maxLon, maxLat] array")
        elif any(v is None for v in bbox):
            errors.append("source manifest: cityConfig.bbox values must not be null")
        else:
            min_lon, min_lat, max_lon, max_lat = bbox
            if min_lon > max_lon:
                errors.append(
                    f"source manifest: cityConfig.bbox minLon {min_lon} > maxLon {max_lon}")
            if min_lat > max_lat:
                errors.append(
                    f"source manifest: cityConfig.bbox minLat {min_lat} > maxLat {max_lat}")

    if _blank(data.get("extractionToolVersion")):
        errors.append("source manifest: extractionToolVersion is blank")

    if errors:
        raise ValidationError(errors)
    return data


def load_canonical_area_inventory(path: str) -> set[str]:
    """Loads an operator-supplied canonical-area inventory (MAJOR 6) — either
    a JSON array of area_key strings, or a CSV with an area_key column. This
    is a passive input file the operator exports manually from the
    production database (no new backend code/HTTP/migration is introduced
    by this pipeline to produce it). Returns a set of normalise()d area
    keys for MERGE/ALIAS target resolution; a key that fails normalise() is
    kept in its raw form so it simply never matches (never raises)."""
    is_json = path.lower().endswith(".json")
    raw_keys: list[str]
    if is_json:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            raise ValidationError([f"canonical-area-inventory {path!r} could not be read/parsed: {exc}"])
        if not isinstance(data, list):
            raise ValidationError([f"canonical-area-inventory {path!r} must be a JSON array of strings"])
        raw_keys = [str(v) for v in data]
    else:
        try:
            with open(path, "r", encoding="utf-8", newline="") as fh:
                reader = csv.DictReader(fh)
                if not reader.fieldnames or "area_key" not in reader.fieldnames:
                    raise ValidationError(
                        [f"canonical-area-inventory CSV {path!r} must have an 'area_key' column"])
                raw_keys = [row.get("area_key") or "" for row in reader]
        except OSError as exc:
            raise ValidationError([f"canonical-area-inventory {path!r} could not be read: {exc}"])

    normalised: set[str] = set()
    for raw_key in raw_keys:
        key = (raw_key or "").strip()
        if not key:
            continue
        try:
            normalised.add(normalise(key))
        except ValueError:
            normalised.add(key)
    return normalised


def _validate_batch_identity(
    dataset_id: str, dataset_version: str, provider: str, input_schema_version: str,
    source_extracted_at: str | None, errors: list[str],
) -> None:
    """Rework ADDITIONAL finding: dataset-id/dataset-version/provider/
    inputSchemaVersion must be non-blank AND (provider/inputSchemaVersion)
    values this pipeline actually supports; sourceExtractedAt, if present,
    must parse as a real ISO-8601 offset timestamp (a blank value is only
    reachable in --provisional mode with no --source-manifest — see main())."""
    if _blank(dataset_id):
        errors.append("datasetId is blank")
    if _blank(dataset_version):
        errors.append("datasetVersion is blank")
    if _blank(provider):
        errors.append("provider is blank")
    elif provider not in SUPPORTED_PROVIDERS:
        errors.append(f"provider {provider!r} is not supported ({sorted(SUPPORTED_PROVIDERS)})")
    if _blank(input_schema_version):
        errors.append("inputSchemaVersion is blank")
    elif input_schema_version != SUPPORTED_INPUT_SCHEMA_VERSION:
        errors.append(
            f"inputSchemaVersion {input_schema_version!r} is not supported "
            f"(must be {SUPPORTED_INPUT_SCHEMA_VERSION!r})")
    if not _blank(source_extracted_at):
        try:
            _parse_iso_offset_datetime(source_extracted_at)
        except ValueError as exc:
            errors.append(
                f"sourceExtractedAt {source_extracted_at!r} is not a valid ISO-8601 offset "
                f"date-time ({exc})")


def _validate_review_metadata(row: dict, errors: list[str]) -> None:
    """BLOCKING 1 (rework): reviewer and reviewed_at are mandatory for EVERY
    row regardless of decision; review_reason is mandatory for
    EXCLUDE/MERGE/RENAME/ALIAS (optional for INCLUDE). Runs unconditionally
    — this is not gated by --provisional; an emitted artifact must never
    carry a row without completed review metadata."""
    row_label = _row_label(row)
    decision = (row.get("decision") or "").strip().upper()
    reviewer = (row.get("reviewer") or "").strip()
    reviewed_at_raw = row.get("reviewed_at") or ""
    review_reason = (row.get("review_reason") or "").strip()

    if not reviewer:
        errors.append(f"{row_label}: reviewer is blank — every row requires a nonblank reviewer")

    if _blank(reviewed_at_raw):
        errors.append(
            f"{row_label}: reviewed_at is blank — every row requires a valid ISO-8601 offset "
            f"date-time")
    else:
        try:
            _parse_iso_offset_datetime(reviewed_at_raw)
        except ValueError as exc:
            errors.append(
                f"{row_label}: reviewed_at {reviewed_at_raw!r} is not a valid ISO-8601 offset "
                f"date-time ({exc})")

    if decision in REVIEW_REASON_REQUIRED_DECISIONS and not review_reason:
        errors.append(f"{row_label}: review_reason is required for decision {decision}")


def _parse_aliases(row: dict, errors: list[str]) -> list[dict]:
    """BLOCKING 2 (rework): parses the `aliases` (manual, semicolon-
    delimited free text) and `alias_langs` (semicolon-delimited tokens from
    ALIAS_LANG_TOKENS, promoting an already-verified evidence value) columns
    into a list of {value, lang, source} dicts. aliases/alias_langs MUST be
    blank on EXCLUDE/MERGE (refused if populated); permitted on
    INCLUDE/RENAME/ALIAS. Returns [] (never None) so JSON serializes an
    empty array, not null, when a row carries no aliases."""
    row_label = _row_label(row)
    decision = (row.get("decision") or "").strip().upper()
    aliases_raw = (row.get("aliases") or "").strip()
    alias_langs_raw = (row.get("alias_langs") or "").strip()

    if decision in ("EXCLUDE", "MERGE") and (aliases_raw or alias_langs_raw):
        errors.append(
            f"{row_label}: aliases/alias_langs must be blank when decision={decision or '(blank)'}"
            f" — aliases are only meaningful for a row that is INCLUDE/RENAME/ALIAS")
        return []

    aliases: list[dict] = []

    if aliases_raw:
        for token in aliases_raw.split(";"):
            value = token.strip()
            if not value:
                errors.append(f"{row_label}: aliases contains a blank entry")
                continue
            aliases.append({"value": value, "lang": None, "source": "manual"})

    if alias_langs_raw:
        for token in alias_langs_raw.split(";"):
            key = token.strip()
            if not key:
                errors.append(f"{row_label}: alias_langs contains a blank entry")
                continue
            if key not in ALIAS_LANG_TOKENS:
                errors.append(
                    f"{row_label}: alias_langs token {key!r} is not one of "
                    f"{sorted(ALIAS_LANG_TOKENS)}")
                continue
            column, lang = ALIAS_LANG_TOKENS[key]
            evidence_value = (row.get(column) or "").strip()
            if not evidence_value:
                errors.append(
                    f"{row_label}: alias_langs token {key!r} references evidence column "
                    f"{column!r} which is blank on this row")
                continue
            aliases.append({"value": evidence_value, "lang": lang, "source": "osm"})

    return aliases


def _verify_evidence_matches_raw(
    row: dict, raw_records: dict[tuple[str, str], dict], errors: list[str]
) -> None:
    """AC5: refuses (appends an error, never raises directly — callers
    accumulate) if any evidence column on `row` diverges from the matching
    raw JSONL record. Every error names both the diverging field and the
    OSM id so a curator can find exactly what changed."""
    row_label = _row_label(row)
    record = raw_records.get(((row.get("osm_type") or "").strip(), (row.get("osm_id") or "").strip()))
    if record is None:
        errors.append(
            f"{row_label}: no matching record found in the raw candidate JSONL for this "
            f"OSM element id — evidence cannot be verified, refusing to trust this row")
        return

    names = record.get("names") or {}
    centroid = record.get("centroid") or [None, None]
    bbox = record.get("bbox") or [None, None, None, None]
    raw_min_lon, raw_min_lat, raw_max_lon, raw_max_lat = bbox
    raw_geo_center_lon, raw_geo_center_lat = centroid

    def check_str(field: str, expected) -> None:
        actual = (row.get(field) or "").strip()
        expected_norm = "" if expected is None else str(expected).strip()
        if actual != expected_norm:
            errors.append(
                f"{row_label}: evidence column {field!r} does not match the raw candidate "
                f"JSONL — CSV has {actual!r}, raw source has {expected_norm!r} (evidence "
                f"columns are read-only; this row's edit is refused)")

    def check_float(field: str, expected: float | None) -> None:
        # Float comparison note: build_review_csv.py writes the raw Python
        # float via csv.DictWriter's default str(), and Python 3's str()/
        # float() round-trip is exact (shortest-repr guarantee) — so an
        # UNEDITED value compares bit-identical here. The epsilon below is
        # only a safety margin against incidental formatting drift, not a
        # tolerance for genuine reviewer edits. A non-numeric CSV cell is
        # refused cleanly (FIX S1) rather than raising ValueError.
        actual = _try_to_float(row_label, field, row.get(field), errors, "evidence")
        if actual is None or expected is None:
            if actual != expected:
                errors.append(
                    f"{row_label}: evidence column {field!r} does not match the raw "
                    f"candidate JSONL — CSV has {row.get(field)!r}, raw source has "
                    f"{expected!r} (evidence columns are read-only; this row's edit is "
                    f"refused)")
            return
        if abs(actual - expected) >= 1e-9:
            errors.append(
                f"{row_label}: evidence column {field!r} does not match the raw candidate "
                f"JSONL — CSV has {actual!r}, raw source has {expected!r} (evidence columns "
                f"are read-only; this row's edit is refused)")

    expected_by_field = {
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
        "postal_code": record.get("postal_code"),
        "wikidata": record.get("wikidata"),
    }
    for field in _STRAIGHT_STRING_EVIDENCE_FIELDS:
        check_str(field, expected_by_field[field])

    expected_float_by_field = {
        "geo_center_lat": raw_geo_center_lat,
        "geo_center_lon": raw_geo_center_lon,
        "min_lat": raw_min_lat,
        "min_lon": raw_min_lon,
        "max_lat": raw_max_lat,
        "max_lon": raw_max_lon,
    }
    for field in _FLOAT_EVIDENCE_FIELDS:
        check_float(field, expected_float_by_field[field])

    # geometry_source is itself an EMITTED field (batch candidate's
    # geometrySource, verbatim) as well as an input to geometry_trust — a
    # tampered value (e.g. OSM -> MANUAL, or OSM -> blank) must be
    # rejected exactly like any other evidence column. The raw extraction
    # is OSM-only in this PR (AC8 forbidden-source rule; see
    # build_review_csv.py's `geometry_source = "OSM"` comment), so every
    # genuine raw record's geometry provenance is "OSM". Prefer an
    # explicit `source` field on the raw record if one is ever present
    # (future-proofing for a non-OSM provider); otherwise fall back to
    # this documented OSM-only extractor default.
    raw_source = record.get("source")
    expected_geometry_source = "OSM" if _blank(raw_source) else str(raw_source).strip()
    check_str("geometry_source", expected_geometry_source)

    # geometry_trust is a DERIVED evidence column (GeometryTrust.classify /
    # geometry_trust.classify over the raw centroid+bbox and the row's
    # ACTUAL, now-VERIFIED geometry_source above — never a hardcoded
    # "OSM" — so a tampered geometry_source can't slip a mismatched trust
    # value through the geometry_trust check either).
    expected_geometry_trust = classify_geometry_trust(
        expected_geometry_source, raw_geo_center_lat, raw_geo_center_lon,
        raw_min_lat, raw_min_lon, raw_max_lat, raw_max_lon)
    check_str("geometry_trust", expected_geometry_trust)


def _validate_and_project(
    rows: list[dict],
    raw_records: dict[tuple[str, str], dict],
    canonical_area_inventory: set[str],
    provisional: bool,
) -> tuple[list[dict], list[dict], list[str]]:
    """Validates every row and returns (emitted_candidates, reviewed_rows_info,
    errors) — reviewed_rows_info carries the per-row data the review
    manifest (BLOCKING 2/3, MAJOR 6) is built from: EVERY row, including
    EXCLUDE/MERGE/ALIAS ones never emitted as a batch candidate.

    Returns ALL accumulated errors (does not short-circuit on the first)
    so a curator sees every problem in one pass, matching AC3's "refuses
    to emit ... with a validation report" wording.
    """
    errors: list[str] = []
    emitted: list[dict] = []
    reviewed_rows_info: list[dict] = []

    seen_area_keys: dict[str, str] = {}          # areaKey -> row_label of first occurrence
    seen_external_ids: dict[str, str] = {}        # externalSourceId -> row_label

    # First pass: collect every proposed_area_key (INCLUDE/RENAME) so MERGE/
    # ALIAS targets can resolve against them. Compared on normalise()d forms
    # (MAJOR 6) — falls back to the raw string if normalise() itself fails,
    # so a malformed in-batch key simply never matches (its OWN row is
    # rejected separately below).
    resolvable_targets_normalised: set[str] = set()
    for row in rows:
        decision = (row.get("decision") or "").strip().upper()
        if decision in EMITTED_DECISIONS:
            key = _candidate_area_key(row)
            if key:
                try:
                    resolvable_targets_normalised.add(normalise(key))
                except ValueError:
                    resolvable_targets_normalised.add(key)

    def _target_resolves(target: str) -> bool:
        try:
            norm = normalise(target)
        except ValueError:
            norm = target
        return norm in resolvable_targets_normalised or norm in canonical_area_inventory

    for row in rows:
        row_label = _row_label(row)

        # AC5: verify EVERY row's evidence against the raw JSONL first,
        # regardless of decision — a tampered EXCLUDE/MERGE row is refused
        # too, not just an emitted INCLUDE/RENAME row.
        _verify_evidence_matches_raw(row, raw_records, errors)
        # BLOCKING 1: review metadata is mandatory for every row, always
        # (not gated by --provisional).
        _validate_review_metadata(row, errors)
        # BLOCKING 2: parse+validate aliases/alias_langs for every row.
        aliases = _parse_aliases(row, errors)

        osm_type = row.get("osm_type")
        osm_id = row.get("osm_id")
        external_source_id = f"{osm_type}/{osm_id}" if osm_type and osm_id else row_label

        decision_raw = row.get("decision")
        decision = (decision_raw or "").strip().upper()

        if _blank(decision_raw):
            errors.append(f"{row_label}: missing decision")
            continue
        if decision not in VALID_DECISIONS:
            errors.append(f"{row_label}: unrecognised decision {decision_raw!r} "
                           f"(must be one of {sorted(VALID_DECISIONS)})")
            continue

        canonical_area_key = None
        canonical_name = None
        merge_target_key = None
        emitted_to_batch = False

        if decision == "EXCLUDE":
            pass

        elif decision in NON_EMITTED_WITH_TARGET_DECISIONS:  # MERGE, ALIAS
            target = (row.get("merge_target_key") or "").strip()
            if not target:
                errors.append(f"{row_label}: {decision} decision has an absent merge_target_key")
            else:
                merge_target_key = target
                target_valid_shape = is_valid_four_segment(target)
                target_resolves = _target_resolves(target)
                ok = (target_valid_shape or target_resolves) if provisional else target_resolves
                if not ok:
                    suffix = (
                        " (shape-only resolution is only accepted under --provisional)"
                        if not provisional else "")
                    errors.append(
                        f"{row_label}: {decision} merge_target_key {target!r} is unresolved — it "
                        f"must resolve against an INCLUDE/RENAME row's proposed_area_key in this "
                        f"batch or the supplied --canonical-area-inventory{suffix}")

        else:  # INCLUDE, RENAME
            if decision == "RENAME":
                override = (row.get("canonical_name_override") or "").strip()
                if not override:
                    errors.append(f"{row_label}: RENAME decision requires a non-blank "
                                   f"canonical_name_override")
                    continue
                name = override
            else:
                name = (row.get("canonical_name_override") or "").strip() or row.get("name") or ""
                if not name:
                    errors.append(f"{row_label}: INCLUDE decision has no usable name "
                                   f"(name and canonical_name_override both blank)")
                    continue

            area_key = _candidate_area_key(row)
            if not area_key:
                errors.append(f"{row_label}: {decision} decision has a blank proposed_area_key")
                continue
            if not is_valid_four_segment(area_key):
                errors.append(f"{row_label}: proposed_area_key {area_key!r} fails 4-segment validation")
                continue
            try:
                normalised = normalise(area_key)
            except ValueError as exc:
                errors.append(f"{row_label}: proposed_area_key {area_key!r} failed to normalise: {exc}")
                continue
            if normalised != area_key:
                errors.append(
                    f"{row_label}: proposed_area_key {area_key!r} is not idempotent under "
                    f"normalise() (normalise() -> {normalised!r}) — supply the normalised form")
                continue

            if area_key in seen_area_keys:
                errors.append(
                    f"{row_label}: duplicate area key {area_key!r} (also used by "
                    f"{seen_area_keys[area_key]}) — within-city collisions are NEVER "
                    f"auto-suffixed; resolve by hand (rename or merge one candidate)")
            else:
                seen_area_keys[area_key] = row_label

            if osm_type and osm_id:
                if external_source_id in seen_external_ids:
                    errors.append(
                        f"{row_label}: duplicate externalSourceId {external_source_id!r} "
                        f"(also used by {seen_external_ids[external_source_id]})")
                else:
                    seen_external_ids[external_source_id] = row_label

            geo_center_lat = _try_to_float(row_label, "geo_center_lat", row.get("geo_center_lat"), errors, "decision")
            geo_center_lon = _try_to_float(row_label, "geo_center_lon", row.get("geo_center_lon"), errors, "decision")
            min_lat = _try_to_float(row_label, "min_lat", row.get("min_lat"), errors, "decision")
            min_lon = _try_to_float(row_label, "min_lon", row.get("min_lon"), errors, "decision")
            max_lat = _try_to_float(row_label, "max_lat", row.get("max_lat"), errors, "decision")
            max_lon = _try_to_float(row_label, "max_lon", row.get("max_lon"), errors, "decision")

            _validate_lat_lon(row_label, geo_center_lat, geo_center_lon, errors, "geo_center")
            _validate_lat_lon(row_label, min_lat, min_lon, errors, "bbox min")
            _validate_lat_lon(row_label, max_lat, max_lon, errors, "bbox max")

            if min_lat is not None and max_lat is not None and min_lat > max_lat:
                errors.append(f"{row_label}: bbox min_lat {min_lat} > max_lat {max_lat}")
            if min_lon is not None and max_lon is not None and min_lon > max_lon:
                errors.append(f"{row_label}: bbox min_lon {min_lon} > max_lon {max_lon}")

            geometry_source = (row.get("geometry_source") or "").strip() or None
            if geometry_source is not None and geometry_source not in ("OSM", "MANUAL"):
                errors.append(f"{row_label}: geometry_source {geometry_source!r} must be "
                               f"'OSM', 'MANUAL', or blank")

            candidate_external_source_id = external_source_id if (osm_type and osm_id) else None
            emitted.append({
                "areaKey": area_key,
                "name": name,
                "geoCenterLat": geo_center_lat,
                "geoCenterLon": geo_center_lon,
                "minLat": min_lat,
                "minLon": min_lon,
                "maxLat": max_lat,
                "maxLon": max_lon,
                "geometrySource": geometry_source,
                "externalSourceId": candidate_external_source_id,
            })
            canonical_area_key = area_key
            canonical_name = name
            emitted_to_batch = True

        reviewed_rows_info.append({
            "osmType": osm_type,
            "osmId": osm_id,
            "externalSourceId": external_source_id,
            "rawName": row.get("name"),
            "decision": decision,
            "canonicalAreaKey": canonical_area_key,
            "canonicalName": canonical_name,
            "mergeTargetKey": merge_target_key,
            "aliases": sorted(aliases, key=lambda a: (a["source"], a["value"])),
            "reviewer": (row.get("reviewer") or "").strip() or None,
            "reviewedAt": (row.get("reviewed_at") or "").strip() or None,
            "reviewReason": (row.get("review_reason") or "").strip() or None,
            "emittedToBatch": emitted_to_batch,
        })

    return emitted, reviewed_rows_info, errors


def canonical_candidate_serialization(candidates: list[dict]) -> str:
    """Canonical, checksum-stable serialization of the SORTED candidate list:
    fixed key order (CANDIDATE_FIELDS), sorted by areaKey, compact
    separators, ensure_ascii=False, UTF-8. This is deliberately a DIFFERENT
    (compact) string than the pretty-printed final file — the checksum is
    defined over this canonical form only (AC2), not over the final file's
    literal bytes (which would be self-referential: the file embeds its own
    checksum)."""
    ordered = sorted(candidates, key=lambda c: c["areaKey"])
    ordered = [{field_name: c[field_name] for field_name in CANDIDATE_FIELDS} for c in ordered]
    return json.dumps(ordered, sort_keys=False, ensure_ascii=False, separators=(",", ":"))


def compute_checksum(candidates: list[dict]) -> str:
    """candidatePayloadChecksum: identical algo/bytes to the historical
    (pre-rework) artifactChecksum — nothing about the emitted batch payload
    or its checksum changes (D2/BLOCKING 3 split: this checksum covers ONLY
    the emitted candidate list; reviewArtifactChecksum below covers the
    full reviewed dataset)."""
    canonical = canonical_candidate_serialization(candidates)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compute_review_artifact_checksum(manifest: dict) -> str:
    """BLOCKING 3: sha256 over the manifest WITHOUT its own
    reviewArtifactChecksum key (non-self-referential), canonicalised via
    json.dumps(sort_keys=True, ensure_ascii=False, separators=(",",":")).
    reviewedRows is already sorted by externalSourceId and each row's
    aliases already sorted by (source, value) by the caller — sort_keys=True
    here additionally makes DICT KEY order irrelevant, so this is
    deterministic regardless of manifest dict construction order. The
    manifest deliberately carries no float fields (all lat/lon stay in the
    batch JSON), eliminating float-formatting risk entirely."""
    payload = {k: v for k, v in manifest.items() if k != "reviewArtifactChecksum"}
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _finalize_batch(
    rows: list[dict],
    raw_records: dict[tuple[str, str], dict],
    dataset_id: str,
    dataset_version: str,
    provider: str,
    input_schema_version: str,
    source_extracted_at: str | None,
    expected_checksum: str | None,
    canonical_area_inventory: set[str] | None,
    allow_empty: bool,
    provisional: bool,
) -> tuple[dict, list[dict]]:
    errors: list[str] = []
    _validate_batch_identity(
        dataset_id, dataset_version, provider, input_schema_version, source_extracted_at, errors)

    candidates, reviewed_rows_info, row_errors = _validate_and_project(
        rows, raw_records, canonical_area_inventory or set(), provisional)
    errors.extend(row_errors)

    checksum = compute_checksum(candidates)
    if expected_checksum is not None and expected_checksum.strip() and expected_checksum.strip() != checksum:
        errors.append(
            f"artifactChecksum does not recompute: expected {expected_checksum.strip()!r}, "
            f"recomputed {checksum!r}")

    if not candidates and not allow_empty:
        errors.append(
            "0 candidates would be emitted by this reviewed CSV (every row is EXCLUDE/MERGE/"
            "ALIAS) — pass --allow-empty to intentionally emit an empty batch")

    if errors:
        raise ValidationError(errors)

    candidates_sorted = sorted(candidates, key=lambda c: c["areaKey"])
    candidates_ordered = [
        {field_name: c[field_name] for field_name in CANDIDATE_FIELDS} for c in candidates_sorted
    ]

    batch = {
        "datasetId": dataset_id,
        "datasetVersion": dataset_version,
        "artifactChecksum": checksum,
        "provider": provider,
        "inputSchemaVersion": input_schema_version,
        "sourceExtractedAt": source_extracted_at if source_extracted_at else None,
        "candidates": candidates_ordered,
    }
    batch = {field_name: batch[field_name] for field_name in BATCH_TOP_LEVEL_FIELDS}
    return batch, reviewed_rows_info


def build_batch(
    rows: list[dict],
    raw_records: dict[tuple[str, str], dict],
    dataset_id: str,
    dataset_version: str,
    provider: str,
    input_schema_version: str,
    source_extracted_at: str | None,
    expected_checksum: str | None = None,
    canonical_area_inventory: set[str] | None = None,
    allow_empty: bool = True,
    provisional: bool = True,
) -> dict:
    """Validates rows against `raw_records` (see load_raw_records — AC5
    evidence-immutability cross-check) and returns the final #1887 batch
    dict with EXACT top-level key order. Raises ValidationError (batch is
    NEVER returned) on any AC3/rework rejection class OR any AC5 evidence
    divergence.

    NOTE on defaults: this is the low-level Python API (used directly by
    the test suite); it defaults allow_empty=True/provisional=True to
    preserve this function's pre-rework lenient behaviour for callers that
    don't care about the empty-output safeguard or strict MERGE/ALIAS
    target resolution. The CLI (main(), below) is the user-facing contract
    and explicitly defaults to the OPPOSITE — strict/final mode
    (--provisional off) — per the settled design; reviewer/reviewed_at/
    review_reason enforcement (BLOCKING 1) and evidence immutability (AC5)
    are NEVER relaxed by either default, in this function or the CLI."""
    batch, _reviewed_rows_info = _finalize_batch(
        rows, raw_records, dataset_id, dataset_version, provider, input_schema_version,
        source_extracted_at, expected_checksum, canonical_area_inventory, allow_empty, provisional)
    return batch


def build_batch_with_reviewed_rows(
    rows: list[dict],
    raw_records: dict[tuple[str, str], dict],
    dataset_id: str,
    dataset_version: str,
    provider: str,
    input_schema_version: str,
    source_extracted_at: str | None,
    expected_checksum: str | None = None,
    canonical_area_inventory: set[str] | None = None,
    allow_empty: bool = False,
    provisional: bool = False,
) -> tuple[dict, list[dict]]:
    """Like build_batch(), but also returns the reviewedRows data the
    review manifest is built from, and defaults to the STRICT (final-mode)
    validation behaviour: allow_empty=False, provisional=False. This is
    what the CLI (main()) uses."""
    return _finalize_batch(
        rows, raw_records, dataset_id, dataset_version, provider, input_schema_version,
        source_extracted_at, expected_checksum, canonical_area_inventory, allow_empty, provisional)


def build_review_manifest(
    source_manifest: dict,
    batch: dict,
    reviewed_rows_info: list[dict],
    dataset_id: str,
    dataset_version: str,
    raw_candidate_jsonl_sha256: str,
    reviewed_csv_sha256: str,
) -> dict:
    """Builds the #1900-owned city-area-review-manifest.json (BLOCKING 2/3,
    MAJOR 4/6, plus the user-correction-2 rework's raw-JSONL/CSV checksum
    binding) — a SEPARATE artifact from the unchanged #1887 batch JSON.
    reviewArtifactChecksum is computed last (non-self-referential) and
    covers the ENTIRE manifest (identity, provider, licence, full source
    manifest — including the two program-computed hashes below —
    cityConfig, reviewSummary, every reviewed row including
    excluded/merged/aliased, and the emitted batch's candidatePayloadChecksum)
    — so two reviews that differ only in which rows were excluded/merged, or
    in reviewer/alias/provenance metadata, are NEVER checksum-identical even
    if they happen to emit the same candidates.

    `raw_candidate_jsonl_sha256`/`reviewed_csv_sha256` MUST be produced by
    compute_file_sha256() over the ACTUAL `--raw-jsonl`/`--reviewed-csv`
    files this run consumed (see main()) — callers must never pass an
    operator-supplied or otherwise stale value here."""
    reviewed_rows_sorted = sorted(reviewed_rows_info, key=lambda r: r["externalSourceId"])

    counts = {"totalRows": len(reviewed_rows_sorted)}
    for decision in ("INCLUDE", "EXCLUDE", "MERGE", "RENAME", "ALIAS"):
        counts[f"{decision.lower()}Count"] = sum(
            1 for r in reviewed_rows_sorted if r["decision"] == decision)
    counts["emittedCount"] = sum(1 for r in reviewed_rows_sorted if r["emittedToBatch"])

    manifest = {
        "manifestSchemaVersion": MANIFEST_SCHEMA_VERSION,
        "datasetId": dataset_id,
        "datasetVersion": dataset_version,
        "provider": source_manifest["provider"],
        "licence": dict(source_manifest["licence"]),
        "source": {
            "sourceArtifact": source_manifest["sourceArtifact"],
            "sourceArtifactSha256": str(source_manifest["sourceArtifactSha256"]).strip().lower(),
            # Program-computed (see compute_file_sha256) — NOT operator-
            # entered, unlike sourceArtifactSha256 above (this script never
            # reads the source PBF itself, but it DOES read --raw-jsonl and
            # --reviewed-csv directly on every run). These close the
            # integrity chain: PBF identity (operator-attested) -> exact raw
            # candidate extraction (program-verified) -> exact reviewed CSV
            # (program-verified) -> the emitted #1887 batch
            # (emittedBatch.candidatePayloadChecksum below). Both hashes sit
            # inside this `source` object and are therefore automatically
            # covered by reviewArtifactChecksum, so tampering either file
            # after a review is detectable even for a decision (EXCLUDE/
            # MERGE/ALIAS) whose reviewedRows entry retains only a reduced
            # evidence subset.
            "rawCandidateJsonlSha256": raw_candidate_jsonl_sha256,
            "reviewedCsvSha256": reviewed_csv_sha256,
            "sourceDownloadUrl": source_manifest["sourceDownloadUrl"],
            "sourceDownloadedAt": source_manifest.get("sourceDownloadedAt"),
            "sourceExtractedAt": source_manifest["sourceExtractedAt"],
            "extractionToolVersion": source_manifest["extractionToolVersion"],
        },
        "cityConfig": dict(source_manifest["cityConfig"]),
        "reviewSummary": counts,
        "reviewedRows": reviewed_rows_sorted,
        "emittedBatch": {
            "candidateCount": len(batch["candidates"]),
            "candidatePayloadChecksum": batch["artifactChecksum"],
        },
    }
    manifest = {field_name: manifest[field_name] for field_name in MANIFEST_TOP_LEVEL_FIELDS[:-1]}
    manifest["reviewArtifactChecksum"] = compute_review_artifact_checksum(manifest)
    return manifest


def write_batch_json(batch: dict, out_path: str) -> None:
    """Byte-deterministic write: LF line endings, UTF-8, ensure_ascii=False
    (real non-ASCII names stay as literal UTF-8, not \\uXXXX escapes —
    deterministic either way, but this is more operator-legible), indent=2
    for readability. Regenerating from the same reviewed CSV + metadata
    yields byte-identical output (AC2) because dict key order is fixed,
    candidates are sorted by areaKey, and json.dumps' float formatting is
    deterministic (locale-independent) for a given float value."""
    text = json.dumps(batch, indent=2, ensure_ascii=False, sort_keys=False)
    with open(out_path, "w", encoding="utf-8", newline="\n") as out_fh:
        out_fh.write(text)
        out_fh.write("\n")


def write_review_manifest(manifest: dict, out_path: str) -> None:
    """Byte-deterministic write, same conventions as write_batch_json:
    fixed top-level key order (already applied by build_review_manifest),
    reviewedRows sorted by externalSourceId, each row's aliases sorted by
    (source, value), no float fields anywhere in the manifest — LF, UTF-8,
    ensure_ascii=False, indent=2."""
    text = json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=False)
    with open(out_path, "w", encoding="utf-8", newline="\n") as out_fh:
        out_fh.write(text)
        out_fh.write("\n")


def _print_errors(errors: list[str]) -> None:
    print("build_batch_json: REFUSED TO EMIT — validation errors:", file=sys.stderr)
    for error in errors:
        print(f"  - {error}", file=sys.stderr)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv", help="reviewed CSV produced by build_review_csv.py + human review")
    parser.add_argument("out", help="output #1887 CandidateBatchFile JSON path")
    parser.add_argument("--raw-jsonl", required=True,
                         help="the ORIGINAL raw candidate JSONL produced by "
                              "extract_osm_candidates.py — every reviewed CSV row's evidence "
                              "columns are cross-checked against this before the batch is "
                              "emitted (AC5); a diverging evidence cell refuses the batch")
    parser.add_argument("--dataset-id", required=True)
    parser.add_argument("--dataset-version", required=True)
    parser.add_argument("--provider", default="OSM",
                         help="PROVISIONAL-ONLY override: ignored in default (final) mode, where "
                              "provider is always taken from --source-manifest")
    parser.add_argument("--input-schema-version", default="1")
    parser.add_argument("--source-extracted-at", default=None,
                         help="PROVISIONAL-ONLY override: ignored in default (final) mode, where "
                              "sourceExtractedAt is always taken from --source-manifest. ISO-8601 "
                              "offset date-time, e.g. 2026-07-15T00:00:00Z, or omit for null")
    parser.add_argument("--expected-checksum", default=None,
                         help="if supplied, the recomputed artifactChecksum must match exactly "
                              "(idempotency/reproducibility verification) or the batch is refused")
    parser.add_argument("--source-manifest", default=None,
                         help="operator-supplied source manifest JSON (provider, sourceArtifact, "
                              "sourceArtifactSha256, licence, cityConfig, ...) — REQUIRED in "
                              "default (final) mode; optional under --provisional")
    parser.add_argument("--review-manifest-out", default=None,
                         help="output path for the #1900-owned city-area-review-manifest.json "
                              "sidecar — REQUIRED in default (final) mode (requires "
                              "--source-manifest); optional under --provisional")
    parser.add_argument("--canonical-area-inventory", default=None,
                         help="optional operator-exported inventory (JSON array of area_key "
                              "strings, or a CSV with an area_key column) MERGE/ALIAS targets may "
                              "resolve against, in addition to this batch's own INCLUDE/RENAME rows")
    parser.add_argument("--allow-empty", action="store_true",
                         help="allow writing a batch with 0 emitted candidates (every row "
                              "EXCLUDE/MERGE/ALIAS); refused by default")
    parser.add_argument("--expected-review-checksum", default=None,
                         help="if supplied, the recomputed reviewArtifactChecksum must match "
                              "exactly or the run is refused")
    parser.add_argument("--provisional", action="store_true",
                         help="relax to shape-only MERGE/ALIAS target resolution and make "
                              "--source-manifest/--review-manifest-out optional. DEFAULT (no "
                              "flag) is strict/final mode: --source-manifest and "
                              "--review-manifest-out are required and MERGE/ALIAS targets must "
                              "actually resolve")
    args = parser.parse_args(argv)

    preflight_errors: list[str] = []
    if not args.provisional:
        if not args.source_manifest:
            preflight_errors.append(
                "--source-manifest is required in default (final) mode; pass --provisional to relax")
        if not args.review_manifest_out:
            preflight_errors.append(
                "--review-manifest-out is required in default (final) mode; pass --provisional "
                "to relax")
    if args.review_manifest_out and not args.source_manifest:
        preflight_errors.append(
            "--review-manifest-out requires --source-manifest (the review manifest cannot be "
            "built without source provenance)")
    if preflight_errors:
        _print_errors(preflight_errors)
        return 1

    rows = read_reviewed_csv(args.csv)

    try:
        raw_records = load_raw_records(args.raw_jsonl)
    except ValidationError as exc:
        _print_errors(exc.errors)
        return 1

    source_manifest = None
    if args.source_manifest:
        try:
            source_manifest = load_source_manifest(args.source_manifest)
        except ValidationError as exc:
            _print_errors(exc.errors)
            return 1

    canonical_area_inventory: set[str] = set()
    if args.canonical_area_inventory:
        try:
            canonical_area_inventory = load_canonical_area_inventory(args.canonical_area_inventory)
        except ValidationError as exc:
            _print_errors(exc.errors)
            return 1

    if source_manifest is not None:
        provider = source_manifest["provider"]
        source_extracted_at = source_manifest["sourceExtractedAt"]
    else:
        provider = args.provider
        source_extracted_at = args.source_extracted_at

    try:
        batch, reviewed_rows_info = build_batch_with_reviewed_rows(
            rows,
            raw_records,
            dataset_id=args.dataset_id,
            dataset_version=args.dataset_version,
            provider=provider,
            input_schema_version=args.input_schema_version,
            source_extracted_at=source_extracted_at,
            expected_checksum=args.expected_checksum,
            canonical_area_inventory=canonical_area_inventory,
            allow_empty=args.allow_empty,
            provisional=args.provisional,
        )
    except ValidationError as exc:
        _print_errors(exc.errors)
        return 1

    manifest = None
    if args.review_manifest_out:
        # Program-computed directly from the ACTUAL files this run
        # consumed (never operator-supplied) — see compute_file_sha256.
        raw_candidate_jsonl_sha256 = compute_file_sha256(args.raw_jsonl)
        reviewed_csv_sha256 = compute_file_sha256(args.csv)
        manifest = build_review_manifest(
            source_manifest, batch, reviewed_rows_info, args.dataset_id, args.dataset_version,
            raw_candidate_jsonl_sha256, reviewed_csv_sha256)
        expected_review_checksum = args.expected_review_checksum
        if expected_review_checksum is not None and expected_review_checksum.strip() and \
                expected_review_checksum.strip() != manifest["reviewArtifactChecksum"]:
            _print_errors([
                f"reviewArtifactChecksum does not recompute: expected "
                f"{expected_review_checksum.strip()!r}, recomputed "
                f"{manifest['reviewArtifactChecksum']!r}"])
            return 1

    write_batch_json(batch, args.out)
    result = {
        "candidates_emitted": len(batch["candidates"]),
        "artifactChecksum": batch["artifactChecksum"],
        "out": args.out,
    }

    if manifest is not None:
        write_review_manifest(manifest, args.review_manifest_out)
        result["reviewArtifactChecksum"] = manifest["reviewArtifactChecksum"]
        result["reviewManifestOut"] = args.review_manifest_out

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
