"""Tests for build_batch_json.py — reviewed CSV + raw candidate JSONL ->
byte-deterministic, checksummed, offline-validated #1887 CandidateBatchFile
JSON (#1900 AC2/AC3/AC5).

Includes the drift-guard (last test class) asserting this emitter's field
name lists match the ACTUAL #1887 CandidateBatchFile/CandidateInput record
component names (AreaOnboardingRunner.java:153-161,
AreaOnboardingService.java:73-84) — a future Java record change must make
this test fail loudly.
"""
import csv
import json
import os

import pytest

from build_batch_json import (
    ALIAS_LANG_TOKENS,
    BATCH_TOP_LEVEL_FIELDS,
    CANDIDATE_FIELDS,
    CHECKED_EVIDENCE_FIELDS,
    EVIDENCE_COLUMNS_EXCLUDED_FROM_CROSS_CHECK,
    MANIFEST_TOP_LEVEL_FIELDS,
    ValidationError,
    build_batch,
    build_batch_with_reviewed_rows,
    build_review_manifest,
    compute_file_sha256,
    compute_review_artifact_checksum,
    load_canonical_area_inventory,
    load_raw_records,
    load_source_manifest,
    main,
    read_reviewed_csv,
)
from build_review_csv import ALL_COLUMNS, EVIDENCE_COLUMNS

FIXTURES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fixtures")
REVIEWED_SAMPLE_CSV = os.path.join(FIXTURES_DIR, "reviewed_udupi_sample.csv")
RAW_JSONL_SAMPLE = os.path.join(FIXTURES_DIR, "raw_candidates_sample.jsonl")
GOLDEN_JSON = os.path.join(FIXTURES_DIR, "golden_udupi_batch.json")
SOURCE_MANIFEST_SAMPLE = os.path.join(FIXTURES_DIR, "source_manifest_sample.json")
CANONICAL_AREA_INVENTORY_SAMPLE = os.path.join(FIXTURES_DIR, "canonical_area_inventory_sample.json")
COMPAT_IT_REVIEWED_CSV = os.path.join(FIXTURES_DIR, "reviewed_udupi_compat_it_sample.csv")
COMPAT_IT_RAW_JSONL = os.path.join(FIXTURES_DIR, "compat_it_raw_candidates.jsonl")
ALIAS_MERGE_REVIEWED_CSV = os.path.join(FIXTURES_DIR, "reviewed_udupi_alias_merge_sample.csv")
ALIAS_MERGE_RAW_JSONL = os.path.join(FIXTURES_DIR, "raw_candidates_alias_merge_sample.jsonl")
GOLDEN_ALIAS_MERGE_BATCH_JSON = os.path.join(FIXTURES_DIR, "golden_udupi_alias_merge_batch.json")
GOLDEN_ALIAS_MERGE_MANIFEST_JSON = os.path.join(FIXTURES_DIR, "golden_udupi_alias_merge_manifest.json")
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
COMPAT_SAMPLE_BATCH_JSON = os.path.join(
    _REPO_ROOT, "backend", "src", "test", "resources", "area-onboarding",
    "sample-1900-udupi-batch.json")
COMPAT_SAMPLE_MANIFEST_JSON = os.path.join(
    _REPO_ROOT, "backend", "src", "test", "resources", "area-onboarding",
    "sample-1900-udupi-review-manifest.json")

BASE_ROW = {
    "osm_type": "node",
    "osm_id": "1",
    "name": "Sample",
    "name_kn": "",
    "name_en": "",
    "alt_name": "",
    "old_name": "",
    "place": "village",
    "boundary": "",
    "admin_level": "",
    "geo_center_lat": "13.30",
    "geo_center_lon": "74.75",
    "min_lat": "",
    "min_lon": "",
    "max_lat": "",
    "max_lon": "",
    "geometry_source": "OSM",
    "postal_code": "",
    "wikidata": "",
    "geometry_trust": "PROVISIONAL",
    "raw_tags_digest": "deadbeef",
    "decision": "INCLUDE",
    "merge_target_key": "",
    "canonical_name_override": "",
    "proposed_area_key": "IN|KA|Udupi|Sample",
    "reviewer": "tester",
    "reviewed_at": "2026-07-15T00:00:00+00:00",
    # Nonblank by default so tests that flip `decision` to EXCLUDE/MERGE/
    # RENAME/ALIAS (which now require review_reason — BLOCKING 1) don't
    # need to remember to set it too; INCLUDE tolerates it being nonblank
    # (review_reason is only REQUIRED, never forbidden, for INCLUDE).
    "review_reason": "reviewed",
    "aliases": "",
    "alias_langs": "",
}


def make_row(**overrides):
    row = dict(BASE_ROW)
    row.update(overrides)
    return row


def write_csv(path, rows):
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=ALL_COLUMNS, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


DEFAULT_BATCH_KWARGS = dict(
    dataset_id="ds1", dataset_version="v1", provider="OSM",
    input_schema_version="1", source_extracted_at="2026-07-15T00:00:00Z",
)


def _f(value):
    return float(value) if value not in (None, "") else None


def raw_record_for(row: dict) -> dict:
    """Builds a raw-JSONL-shaped record that matches `row`'s CURRENT
    evidence columns exactly — the tests' stand-in for "the untampered
    original" a real raw_candidates JSONL would contain. Tests proving
    AC5 tamper-rejection derive the raw record from the row BEFORE
    mutating the row's evidence, so the two diverge on purpose."""
    names = {}
    if row.get("name"):
        names["name"] = row["name"]
    if row.get("name_kn"):
        names["name:kn"] = row["name_kn"]
    if row.get("name_en"):
        names["name:en"] = row["name_en"]
    if row.get("alt_name"):
        names["alt_name"] = row["alt_name"]
    if row.get("old_name"):
        names["old_name"] = row["old_name"]
    osm_id_raw = row.get("osm_id")
    osm_id = int(osm_id_raw) if str(osm_id_raw or "").strip().isdigit() else osm_id_raw
    return {
        "osm_type": row.get("osm_type"),
        "osm_id": osm_id,
        "place": row.get("place") or None,
        "boundary": row.get("boundary") or None,
        "admin_level": row.get("admin_level") or None,
        "names": names,
        "postal_code": row.get("postal_code") or None,
        "wikidata": row.get("wikidata") or None,
        "centroid": [_f(row.get("geo_center_lon")), _f(row.get("geo_center_lat"))],
        "bbox": [
            _f(row.get("min_lon")), _f(row.get("min_lat")),
            _f(row.get("max_lon")), _f(row.get("max_lat")),
        ],
        # Mirrors the row's OWN geometry_source so untampered-row tests
        # stay self-consistent (build_batch_json's expected-geometry-source
        # derivation falls back to the documented "OSM" default when this
        # is absent/blank — see TestEvidenceImmutability's geometry_source
        # tamper tests for the divergence case).
        "source": row.get("geometry_source") or None,
    }


def raw_records_for(rows: list[dict]) -> dict:
    records = {}
    for row in rows:
        key = ((row.get("osm_type") or "").strip(), (row.get("osm_id") or "").strip())
        records[key] = raw_record_for(row)
    return records


def build_batch_auto(rows, **kwargs):
    """build_batch() with raw_records auto-derived from `rows` (matching,
    untampered) unless the caller already supplied raw_records — the
    happy-path default for tests that aren't specifically exercising the
    AC5 evidence cross-check."""
    kwargs.setdefault("raw_records", raw_records_for(rows))
    return build_batch(rows, **kwargs)


def write_raw_jsonl(path, rows):
    """Writes a raw-candidate-JSONL file matching `rows`' CURRENT evidence
    columns exactly, for CLI-level tests that need a real --raw-jsonl file
    on disk rather than an in-memory raw_records dict."""
    with open(path, "w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(raw_record_for(row)) + "\n")


class TestHappyPath:
    def test_two_include_rows_emit_two_sorted_candidates(self, tmp_path):
        rows = [
            make_row(osm_id="1", name="Zeta", proposed_area_key="IN|KA|Udupi|Zeta",
                     name_kn="", raw_tags_digest="a"),
            make_row(osm_id="2", name="Alpha", proposed_area_key="IN|KA|Udupi|Alpha",
                     raw_tags_digest="b"),
        ]
        batch = build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert list(batch.keys()) == list(BATCH_TOP_LEVEL_FIELDS)
        assert [c["areaKey"] for c in batch["candidates"]] == ["IN|KA|Udupi|Alpha", "IN|KA|Udupi|Zeta"]
        for candidate in batch["candidates"]:
            assert list(candidate.keys()) == list(CANDIDATE_FIELDS)

    def test_exclude_row_is_dropped(self, tmp_path):
        rows = [
            make_row(osm_id="1", decision="EXCLUDE", proposed_area_key="IN|KA|Udupi|Dropped"),
            make_row(osm_id="2", decision="INCLUDE", proposed_area_key="IN|KA|Udupi|Kept"),
        ]
        batch = build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert len(batch["candidates"]) == 1
        assert batch["candidates"][0]["areaKey"] == "IN|KA|Udupi|Kept"

    def test_merge_row_resolving_to_another_rows_key_is_dropped_not_emitted(self, tmp_path):
        rows = [
            make_row(osm_id="1", decision="INCLUDE", proposed_area_key="IN|KA|Udupi|Target"),
            make_row(osm_id="2", decision="MERGE", merge_target_key="IN|KA|Udupi|Target",
                     proposed_area_key="IN|KA|Udupi|WillBeMerged"),
        ]
        batch = build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert len(batch["candidates"]) == 1
        assert batch["candidates"][0]["areaKey"] == "IN|KA|Udupi|Target"

    def test_merge_target_can_be_an_existing_valid_shaped_key_outside_this_batch(self, tmp_path):
        rows = [
            make_row(osm_id="1", decision="MERGE", merge_target_key="IN|KA|Udupi|ExistingCanonicalArea",
                     proposed_area_key="IN|KA|Udupi|WillBeMerged"),
        ]
        batch = build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert batch["candidates"] == []

    def test_rename_row_emits_the_override_name(self, tmp_path):
        rows = [make_row(osm_id="1", decision="RENAME", canonical_name_override="Better Name",
                          proposed_area_key="IN|KA|Udupi|Sample")]
        batch = build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert batch["candidates"][0]["name"] == "Better Name"

    def test_null_bbox_serializes_as_json_null_not_string(self, tmp_path):
        # geometry_source is NOT blanked here: since raw extraction is
        # OSM-only (AC8), a genuinely-unedited row's geometry_source is
        # always "OSM" — a blank cell is a tampered/cleared evidence
        # column and is refused (see
        # TestEvidenceImmutability::test_tampered_geometry_source_to_blank_is_rejected),
        # not a legitimate "null geometrySource" happy path.
        rows = [make_row(osm_id="1", min_lat="", min_lon="", max_lat="", max_lon="")]
        batch = build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        candidate = batch["candidates"][0]
        assert candidate["minLat"] is None

    def test_source_extracted_at_absent_serializes_as_null(self, tmp_path):
        rows = [make_row(osm_id="1")]
        kwargs = dict(DEFAULT_BATCH_KWARGS)
        kwargs["source_extracted_at"] = None
        batch = build_batch_auto(rows, **kwargs)
        assert batch["sourceExtractedAt"] is None


class TestGoldenAndDeterminism:
    def test_golden_json_byte_identical_to_committed_fixture(self, tmp_path):
        rows = read_reviewed_csv(REVIEWED_SAMPLE_CSV)
        out_path = tmp_path / "out.json"
        rc = main([
            REVIEWED_SAMPLE_CSV, str(out_path),
            "--raw-jsonl", RAW_JSONL_SAMPLE,
            "--dataset-id", "osm-udupi-1900-sample", "--dataset-version", "v1",
            "--provider", "OSM", "--source-extracted-at", "2026-07-15T00:00:00Z",
            "--provisional",
        ])
        assert rc == 0
        with open(out_path, "r", encoding="utf-8") as fh:
            produced = fh.read()
        with open(GOLDEN_JSON, "r", encoding="utf-8") as fh:
            golden = fh.read()
        assert produced == golden

    def test_regeneration_from_same_csv_is_byte_identical_and_checksum_stable(self, tmp_path):
        out_path_1 = tmp_path / "run1.json"
        out_path_2 = tmp_path / "run2.json"
        for out_path in (out_path_1, out_path_2):
            rc = main([
                REVIEWED_SAMPLE_CSV, str(out_path),
                "--raw-jsonl", RAW_JSONL_SAMPLE,
                "--dataset-id", "osm-udupi-1900-sample", "--dataset-version", "v1",
                "--provider", "OSM", "--source-extracted-at", "2026-07-15T00:00:00Z",
                "--provisional",
            ])
            assert rc == 0
        with open(out_path_1, "rb") as fh:
            bytes_1 = fh.read()
        with open(out_path_2, "rb") as fh:
            bytes_2 = fh.read()
        assert bytes_1 == bytes_2
        checksum_1 = json.loads(bytes_1)["artifactChecksum"]
        checksum_2 = json.loads(bytes_2)["artifactChecksum"]
        assert checksum_1 == checksum_2

    def test_expected_checksum_matching_the_recomputed_value_succeeds(self, tmp_path):
        out_path = tmp_path / "out.json"
        rc = main([
            REVIEWED_SAMPLE_CSV, str(out_path),
            "--raw-jsonl", RAW_JSONL_SAMPLE,
            "--dataset-id", "osm-udupi-1900-sample", "--dataset-version", "v1",
            "--provider", "OSM", "--source-extracted-at", "2026-07-15T00:00:00Z",
            "--expected-checksum", "0217ed8f8e400fd5deebf10668d3e064143461e04769539cfedb5d4b10d6670a",
            "--provisional",
        ])
        assert rc == 0


class TestRejectionClasses:
    def test_bad_area_key_shape_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", proposed_area_key="IN|KA|Udupi")]
        with pytest.raises(ValidationError):
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)

    def test_area_key_not_idempotent_under_normalise_is_rejected(self, tmp_path):
        # "bangalore" district-normalises to "Bengaluru" — a key minted
        # with the raw, un-normalised district fails the idempotency check.
        rows = [make_row(osm_id="1", proposed_area_key="IN|KA|bangalore|Whitefield")]
        with pytest.raises(ValidationError):
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)

    def test_duplicate_area_keys_is_rejected(self, tmp_path):
        rows = [
            make_row(osm_id="1", proposed_area_key="IN|KA|Udupi|SameKey"),
            make_row(osm_id="2", proposed_area_key="IN|KA|Udupi|SameKey"),
        ]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "duplicate area key" in str(exc_info.value)

    def test_duplicate_external_source_id_is_rejected(self, tmp_path):
        rows = [
            make_row(osm_id="dup", proposed_area_key="IN|KA|Udupi|One"),
            make_row(osm_id="dup", proposed_area_key="IN|KA|Udupi|Two"),
        ]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "duplicate externalSourceId" in str(exc_info.value)

    def test_lat_out_of_range_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", geo_center_lat="90.0")]
        with pytest.raises(ValidationError):
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)

    def test_lon_out_of_range_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", geo_center_lon="200.0")]
        with pytest.raises(ValidationError):
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)

    def test_bbox_min_greater_than_max_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", min_lat="14.0", max_lat="13.0", min_lon="74.0", max_lon="75.0")]
        with pytest.raises(ValidationError):
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)

    def test_missing_decision_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", decision="")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "missing decision" in str(exc_info.value)

    def test_unrecognised_decision_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", decision="MAYBE")]
        with pytest.raises(ValidationError):
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)

    def test_merge_with_absent_target_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", decision="MERGE", merge_target_key="")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "absent merge_target_key" in str(exc_info.value)

    def test_merge_with_unresolved_target_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", decision="MERGE", merge_target_key="not-a-valid-key-and-not-in-batch")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "unresolved" in str(exc_info.value)

    def test_rename_without_canonical_name_override_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", decision="RENAME", canonical_name_override="")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "RENAME" in str(exc_info.value)

    def test_checksum_mismatch_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, expected_checksum="0" * 64, **DEFAULT_BATCH_KWARGS)
        assert "does not recompute" in str(exc_info.value)

    def test_cli_exits_nonzero_on_validation_failure(self, tmp_path):
        rows = [make_row(osm_id="1", decision="")]
        csv_path = tmp_path / "bad.csv"
        write_csv(str(csv_path), rows)
        raw_jsonl_path = tmp_path / "raw.jsonl"
        write_raw_jsonl(str(raw_jsonl_path), rows)
        out_path = tmp_path / "out.json"
        rc = main([
            str(csv_path), str(out_path),
            "--raw-jsonl", str(raw_jsonl_path),
            "--dataset-id", "d", "--dataset-version", "v",
            "--provisional",
        ])
        assert rc == 1
        assert not out_path.exists()

    def test_evidence_column_edits_do_not_affect_emitted_candidate(self, tmp_path):
        # AC5: build_batch_json cross-checks every evidence column against
        # the raw candidate JSONL (matched by OSM element id) before
        # emitting. When the CSV's evidence is CONSISTENT with the raw
        # source (i.e. genuinely unedited by a reviewer), it flows through
        # to the emitted candidate unchanged/verbatim — this test documents
        # the happy-path round-trip. A genuinely tampered evidence column is
        # instead REFUSED — see TestEvidenceImmutability below.
        rows = [make_row(osm_id="1", geo_center_lat="13.123456")]
        raw_records = raw_records_for(rows)
        batch = build_batch(rows, raw_records, **DEFAULT_BATCH_KWARGS)
        assert batch["candidates"][0]["geoCenterLat"] == 13.123456


class TestEvidenceImmutability:
    """AC5: build_batch_json.py code-enforces evidence-column immutability
    by cross-checking every reviewed-CSV row's evidence columns against the
    corresponding record in the ORIGINAL raw candidate JSONL, matched by
    OSM element id. ANY divergence refuses the batch (non-zero exit /
    ValidationError) naming the diverging field and the OSM id."""

    def test_tampered_geo_center_lat_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", geo_center_lat="13.123456")]
        raw_records = raw_records_for(rows)
        # Tamper the CSV AFTER deriving the "raw" record from the
        # untampered value, so the two diverge on purpose.
        rows[0]["geo_center_lat"] = "99.0"
        with pytest.raises(ValidationError) as exc_info:
            build_batch(rows, raw_records, **DEFAULT_BATCH_KWARGS)
        message = str(exc_info.value)
        assert "geo_center_lat" in message
        assert "node/1" in message

    def test_tampered_raw_name_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", name="Original")]
        raw_records = raw_records_for(rows)
        rows[0]["name"] = "Tampered"
        with pytest.raises(ValidationError) as exc_info:
            build_batch(rows, raw_records, **DEFAULT_BATCH_KWARGS)
        message = str(exc_info.value)
        assert "'name'" in message
        assert "node/1" in message

    def test_tampered_geometry_trust_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", geometry_trust="PROVISIONAL")]
        raw_records = raw_records_for(rows)
        rows[0]["geometry_trust"] = "VERIFIED"
        with pytest.raises(ValidationError) as exc_info:
            build_batch(rows, raw_records, **DEFAULT_BATCH_KWARGS)
        message = str(exc_info.value)
        assert "geometry_trust" in message
        assert "node/1" in message

    def test_tampered_geometry_source_to_manual_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", geometry_source="OSM")]
        raw_records = raw_records_for(rows)
        # Tamper the CSV AFTER deriving the "raw" record from the
        # untampered value, so the two diverge on purpose.
        rows[0]["geometry_source"] = "MANUAL"
        with pytest.raises(ValidationError) as exc_info:
            build_batch(rows, raw_records, **DEFAULT_BATCH_KWARGS)
        message = str(exc_info.value)
        assert "geometry_source" in message
        assert "node/1" in message

    def test_tampered_geometry_source_to_blank_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", geometry_source="OSM")]
        raw_records = raw_records_for(rows)
        rows[0]["geometry_source"] = ""
        with pytest.raises(ValidationError) as exc_info:
            build_batch(rows, raw_records, **DEFAULT_BATCH_KWARGS)
        message = str(exc_info.value)
        assert "geometry_source" in message
        assert "node/1" in message

    def test_row_with_no_matching_raw_record_is_rejected(self, tmp_path):
        # A row whose (osm_type, osm_id) doesn't exist in the raw JSONL at
        # all can't be verified — refused rather than silently trusted.
        rows = [make_row(osm_id="999")]
        raw_records = raw_records_for([make_row(osm_id="1")])  # different id
        with pytest.raises(ValidationError) as exc_info:
            build_batch(rows, raw_records, **DEFAULT_BATCH_KWARGS)
        assert "node/999" in str(exc_info.value)

    def test_load_raw_records_keys_by_osm_type_and_id(self):
        raw_records = load_raw_records(RAW_JSONL_SAMPLE)
        assert set(raw_records.keys()) == {
            ("node", "245618785"), ("node", "245620117"), ("node", "459838242"),
        }
        assert raw_records[("node", "245620117")]["names"]["name"] == "Udupi"

    def test_untampered_round_trip_still_succeeds(self, tmp_path):
        # Guards against a false-positive rejection: an evidence-unedited
        # row must still build successfully (the happy path from
        # build_review_csv.py -> build_batch_json.py).
        rows = [
            make_row(osm_id="1", name="Zeta", proposed_area_key="IN|KA|Udupi|Zeta"),
            make_row(osm_id="2", name="Alpha", proposed_area_key="IN|KA|Udupi|Alpha"),
        ]
        raw_records = raw_records_for(rows)
        batch = build_batch(rows, raw_records, **DEFAULT_BATCH_KWARGS)
        assert len(batch["candidates"]) == 2

    def test_cli_refuses_and_names_field_and_osm_id_on_tampered_evidence(self, tmp_path):
        rows = [make_row(osm_id="1", geo_center_lat="13.123456")]
        raw_jsonl_path = tmp_path / "raw.jsonl"
        write_raw_jsonl(str(raw_jsonl_path), rows)
        rows[0]["geo_center_lat"] = "99.0"
        csv_path = tmp_path / "tampered.csv"
        write_csv(str(csv_path), rows)
        out_path = tmp_path / "out.json"
        rc = main([
            str(csv_path), str(out_path),
            "--raw-jsonl", str(raw_jsonl_path),
            "--dataset-id", "d", "--dataset-version", "v",
            "--provisional",
        ])
        assert rc == 1
        assert not out_path.exists()


class TestNonNumericEvidenceRefusal:
    """FIX S1: a non-numeric evidence/decision float cell must be refused
    cleanly (a named ValidationError / non-zero CLI exit), never let a raw
    ValueError traceback escape past main()'s `except ValidationError`."""

    def test_non_numeric_evidence_cell_is_cleanly_refused_not_a_traceback(self, tmp_path):
        rows = [make_row(osm_id="1")]
        raw_records = raw_records_for(rows)
        rows[0]["geo_center_lat"] = "not-a-number"
        with pytest.raises(ValidationError) as exc_info:
            build_batch(rows, raw_records, **DEFAULT_BATCH_KWARGS)
        message = str(exc_info.value)
        assert "geo_center_lat" in message
        assert "node/1" in message

    def test_cli_exits_nonzero_not_traceback_on_non_numeric_evidence_cell(self, tmp_path):
        rows = [make_row(osm_id="1")]
        raw_jsonl_path = tmp_path / "raw.jsonl"
        write_raw_jsonl(str(raw_jsonl_path), rows)
        rows[0]["geo_center_lat"] = "not-a-number"
        csv_path = tmp_path / "tampered.csv"
        write_csv(str(csv_path), rows)
        out_path = tmp_path / "out.json"
        rc = main([
            str(csv_path), str(out_path),
            "--raw-jsonl", str(raw_jsonl_path),
            "--dataset-id", "d", "--dataset-version", "v",
            "--provisional",
        ])
        assert rc == 1
        assert not out_path.exists()


class TestDriftGuard:
    """Guards against #1887 CandidateBatchFile/CandidateInput record field
    drift. If AreaOnboardingRunner.java's CandidateBatchFile record (lines
    153-161) or AreaOnboardingService.java's CandidateInput record (lines
    73-84) ever changes field names/order, THIS test must be updated in
    lockstep — it is a deliberate manual sync point, not automatic
    cross-language reflection (Python cannot introspect a compiled Java
    record)."""

    def test_batch_top_level_fields_match_candidate_batch_file_record(self):
        assert BATCH_TOP_LEVEL_FIELDS == (
            "datasetId", "datasetVersion", "artifactChecksum", "provider",
            "inputSchemaVersion", "sourceExtractedAt", "candidates",
        )

    def test_candidate_fields_match_candidate_input_record(self):
        assert CANDIDATE_FIELDS == (
            "areaKey", "name", "geoCenterLat", "geoCenterLon", "minLat", "minLon",
            "maxLat", "maxLon", "geometrySource", "externalSourceId",
        )

    def test_checked_evidence_fields_plus_documented_exclusions_cover_all_evidence_columns(self):
        # FIX A1: guards against a future build_review_csv.EVIDENCE_COLUMNS
        # addition silently NOT being wired into
        # build_batch_json._verify_evidence_matches_raw's AC5 cross-check
        # (this is exactly how geometry_source was missed originally). A
        # new evidence column must be added to CHECKED_EVIDENCE_FIELDS (and
        # actually cross-checked) or to
        # EVIDENCE_COLUMNS_EXCLUDED_FROM_CROSS_CHECK with a reason.
        checked = set(CHECKED_EVIDENCE_FIELDS)
        excluded = set(EVIDENCE_COLUMNS_EXCLUDED_FROM_CROSS_CHECK)
        assert checked.isdisjoint(excluded), (
            "a field must not be both checked and documented-excluded")
        assert checked | excluded == set(EVIDENCE_COLUMNS), (
            f"drift detected: EVIDENCE_COLUMNS has "
            f"{set(EVIDENCE_COLUMNS) - (checked | excluded)} not accounted for, "
            f"or CHECKED_EVIDENCE_FIELDS/exclusions have "
            f"{(checked | excluded) - set(EVIDENCE_COLUMNS)} not in EVIDENCE_COLUMNS")
        for field, reason in EVIDENCE_COLUMNS_EXCLUDED_FROM_CROSS_CHECK.items():
            assert reason.strip(), f"{field}: exclusion reason must not be blank"

    def test_manifest_top_level_fields_match_design_spec_order(self):
        assert MANIFEST_TOP_LEVEL_FIELDS == (
            "manifestSchemaVersion", "datasetId", "datasetVersion", "provider",
            "licence", "source", "cityConfig", "reviewSummary", "reviewedRows",
            "emittedBatch", "reviewArtifactChecksum",
        )


# ---------------------------------------------------------------------------
# User-correction rework (PR #1904 HOLD remediation) — one test class per
# finding, per .claude/handoffs/issue-1900/architect-design-review-manifest.md
# §8's finding->design traceability table and §10's test list.
# ---------------------------------------------------------------------------


def load_source_manifest_fixture(**overrides) -> dict:
    with open(SOURCE_MANIFEST_SAMPLE, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    data.update(overrides)
    return data


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh)


class TestReviewMetadataEnforcement:
    """BLOCKING 1: reviewer/reviewed_at mandatory for every row; review_reason
    mandatory for EXCLUDE/MERGE/RENAME/ALIAS. Unconditional — never gated by
    --provisional."""

    def test_blank_reviewer_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", reviewer="")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "reviewer is blank" in str(exc_info.value)

    def test_blank_reviewed_at_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", reviewed_at="")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "reviewed_at is blank" in str(exc_info.value)

    def test_naive_reviewed_at_without_offset_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", reviewed_at="2026-07-15T00:00:00")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "reviewed_at" in str(exc_info.value)

    def test_garbage_reviewed_at_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", reviewed_at="not-a-date")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "reviewed_at" in str(exc_info.value)

    def test_trailing_z_reviewed_at_is_accepted(self, tmp_path):
        rows = [make_row(osm_id="1", reviewed_at="2026-07-15T00:00:00Z")]
        batch = build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert len(batch["candidates"]) == 1

    def test_review_reason_required_for_exclude(self, tmp_path):
        rows = [make_row(osm_id="1", decision="EXCLUDE", review_reason="")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "review_reason is required for decision EXCLUDE" in str(exc_info.value)

    def test_review_reason_required_for_merge(self, tmp_path):
        rows = [make_row(osm_id="1", decision="MERGE",
                          merge_target_key="IN|KA|Udupi|Target", review_reason="")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "review_reason is required for decision MERGE" in str(exc_info.value)

    def test_review_reason_required_for_rename(self, tmp_path):
        rows = [make_row(osm_id="1", decision="RENAME",
                          canonical_name_override="Renamed", review_reason="")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "review_reason is required for decision RENAME" in str(exc_info.value)

    def test_review_reason_required_for_alias(self, tmp_path):
        rows = [make_row(osm_id="1", decision="ALIAS",
                          merge_target_key="IN|KA|Udupi|Target", review_reason="")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "review_reason is required for decision ALIAS" in str(exc_info.value)

    def test_review_reason_optional_for_include(self, tmp_path):
        rows = [make_row(osm_id="1", decision="INCLUDE", review_reason="")]
        batch = build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert len(batch["candidates"]) == 1

    def test_an_emitted_artifact_never_contains_a_row_without_review_metadata(self, tmp_path):
        # The user's own framing (rework BLOCKING 1): a row with
        # decision=INCLUDE, reviewer='' must never be emitted. Belt-and-
        # braces end-to-end proof at the CLI level, final (strict) mode.
        rows = [make_row(osm_id="1", decision="INCLUDE", reviewer="")]
        csv_path = tmp_path / "bad.csv"
        write_csv(str(csv_path), rows)
        raw_jsonl_path = tmp_path / "raw.jsonl"
        write_raw_jsonl(str(raw_jsonl_path), rows)
        out_path = tmp_path / "out.json"
        rc = main([
            str(csv_path), str(out_path),
            "--raw-jsonl", str(raw_jsonl_path),
            "--dataset-id", "d", "--dataset-version", "v",
            "--provisional",
        ])
        assert rc == 1
        assert not out_path.exists()


class TestAliasesAndAliasLangs:
    """BLOCKING 2: aliases (manual) and alias_langs (evidence-promoted) are
    parsed, validated, and (via build_review_manifest) actually emitted —
    never silently collected-then-discarded."""

    def test_manual_aliases_are_parsed_as_manual_source(self, tmp_path):
        rows = [make_row(osm_id="1", aliases="Foo;Bar")]
        _batch, reviewed_rows = build_batch_with_reviewed_rows(
            rows, raw_records_for(rows), provisional=True, allow_empty=True, **DEFAULT_BATCH_KWARGS)
        aliases = reviewed_rows[0]["aliases"]
        assert {"value": "Foo", "lang": None, "source": "manual"} in aliases
        assert {"value": "Bar", "lang": None, "source": "manual"} in aliases

    def test_alias_langs_promotes_evidence_value_with_lang_tag(self, tmp_path):
        rows = [make_row(osm_id="1", name_kn="ಪರೀಕ್ಷೆ", alias_langs="name:kn")]
        _batch, reviewed_rows = build_batch_with_reviewed_rows(
            rows, raw_records_for(rows), provisional=True, allow_empty=True, **DEFAULT_BATCH_KWARGS)
        assert reviewed_rows[0]["aliases"] == [{"value": "ಪರೀಕ್ಷೆ", "lang": "kn", "source": "osm"}]

    def test_alias_langs_token_referencing_blank_evidence_cell_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", name_kn="", alias_langs="name:kn")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "alias_langs token 'name:kn'" in str(exc_info.value)
        assert "blank" in str(exc_info.value)

    def test_unknown_alias_langs_token_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", alias_langs="name:xx")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "alias_langs token" in str(exc_info.value)

    def test_aliases_populated_on_exclude_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", decision="EXCLUDE", aliases="Foo")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "aliases/alias_langs must be blank" in str(exc_info.value)

    def test_alias_langs_populated_on_merge_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", decision="MERGE", merge_target_key="IN|KA|Udupi|Target",
                          alias_langs="name:kn", name_kn="x")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "aliases/alias_langs must be blank" in str(exc_info.value)

    def test_no_aliases_serializes_as_empty_list_not_null(self, tmp_path):
        rows = [make_row(osm_id="1", aliases="", alias_langs="")]
        _batch, reviewed_rows = build_batch_with_reviewed_rows(
            rows, raw_records_for(rows), provisional=True, allow_empty=True, **DEFAULT_BATCH_KWARGS)
        assert reviewed_rows[0]["aliases"] == []

    def test_blank_alias_token_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", aliases="Foo;;Bar")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "aliases contains a blank entry" in str(exc_info.value)


class TestDuplicateRawIdentity:
    """MAJOR 5: load_raw_records refuses (never silently overwrites) a
    duplicate (osm_type, osm_id) raw identity, distinguishing byte-identical
    from conflicting duplicates."""

    def test_byte_identical_duplicate_is_rejected(self, tmp_path):
        rec = {"osm_type": "node", "osm_id": 1, "names": {"name": "A"}, "place": "village"}
        jsonl_path = tmp_path / "raw.jsonl"
        with open(jsonl_path, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(rec) + "\n")
            fh.write(json.dumps(rec) + "\n")
        with pytest.raises(ValidationError) as exc_info:
            load_raw_records(str(jsonl_path))
        message = str(exc_info.value)
        assert "BYTE-IDENTICAL duplicate" in message

    def test_conflicting_duplicate_is_rejected_and_names_differing_fields(self, tmp_path):
        rec1 = {"osm_type": "node", "osm_id": 1, "names": {"name": "A"}, "place": "village"}
        rec2 = {"osm_type": "node", "osm_id": 1, "names": {"name": "B"}, "place": "village"}
        jsonl_path = tmp_path / "raw.jsonl"
        with open(jsonl_path, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(rec1) + "\n")
            fh.write(json.dumps(rec2) + "\n")
        with pytest.raises(ValidationError) as exc_info:
            load_raw_records(str(jsonl_path))
        message = str(exc_info.value)
        assert "CONFLICTING duplicate" in message
        assert "'names'" in message

    def test_no_duplicates_loads_cleanly(self, tmp_path):
        raw_records = load_raw_records(RAW_JSONL_SAMPLE)
        assert len(raw_records) == 3


class TestSourceManifest:
    """MAJOR 4: source manifest field validation."""

    def test_valid_source_manifest_loads(self):
        data = load_source_manifest(SOURCE_MANIFEST_SAMPLE)
        assert data["provider"] == "OSM"
        assert data["licence"]["id"] == "ODbL-1.0"

    def test_bad_sha256_is_rejected(self, tmp_path):
        data = load_source_manifest_fixture(sourceArtifactSha256="not-a-sha")
        path = tmp_path / "sm.json"
        write_json(path, data)
        with pytest.raises(ValidationError) as exc_info:
            load_source_manifest(str(path))
        assert "sourceArtifactSha256" in str(exc_info.value)

    def test_missing_source_extracted_at_is_rejected(self, tmp_path):
        data = load_source_manifest_fixture(sourceExtractedAt="")
        path = tmp_path / "sm.json"
        write_json(path, data)
        with pytest.raises(ValidationError) as exc_info:
            load_source_manifest(str(path))
        assert "sourceExtractedAt is required" in str(exc_info.value)

    def test_unknown_licence_id_is_rejected(self, tmp_path):
        data = load_source_manifest_fixture()
        data["licence"] = dict(data["licence"])
        data["licence"]["id"] = "CC-BY-4.0"
        path = tmp_path / "sm.json"
        write_json(path, data)
        with pytest.raises(ValidationError) as exc_info:
            load_source_manifest(str(path))
        assert "not a known licence id" in str(exc_info.value)

    def test_bbox_min_greater_than_max_is_rejected(self, tmp_path):
        data = load_source_manifest_fixture()
        data["cityConfig"] = dict(data["cityConfig"])
        data["cityConfig"]["bbox"] = [75.0, 13.15, 74.60, 13.50]
        path = tmp_path / "sm.json"
        write_json(path, data)
        with pytest.raises(ValidationError) as exc_info:
            load_source_manifest(str(path))
        assert "minLon" in str(exc_info.value)

    def test_missing_extraction_tool_version_is_rejected(self, tmp_path):
        data = load_source_manifest_fixture(extractionToolVersion="")
        path = tmp_path / "sm.json"
        write_json(path, data)
        with pytest.raises(ValidationError) as exc_info:
            load_source_manifest(str(path))
        assert "extractionToolVersion" in str(exc_info.value)


class TestMergeResolution:
    """MAJOR 6: MERGE/ALIAS target resolution against in-batch INCLUDE/
    RENAME rows or a supplied --canonical-area-inventory; shape-only
    resolution accepted ONLY under --provisional."""

    def test_unresolved_target_is_rejected_in_final_mode(self, tmp_path):
        rows = [make_row(osm_id="1", decision="MERGE",
                          merge_target_key="IN|KA|Udupi|NotInBatchOrInventory")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_with_reviewed_rows(rows, raw_records_for(rows), **DEFAULT_BATCH_KWARGS)
        assert "unresolved" in str(exc_info.value)

    def test_shape_only_target_rejected_in_final_mode_even_though_valid_shape(self, tmp_path):
        rows = [make_row(osm_id="1", decision="MERGE",
                          merge_target_key="IN|KA|Udupi|ExistingCanonicalArea")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_with_reviewed_rows(rows, raw_records_for(rows), **DEFAULT_BATCH_KWARGS)
        assert "unresolved" in str(exc_info.value)

    def test_shape_only_target_accepted_under_provisional(self, tmp_path):
        rows = [make_row(osm_id="1", decision="MERGE",
                          merge_target_key="IN|KA|Udupi|ExistingCanonicalArea")]
        batch, reviewed_rows = build_batch_with_reviewed_rows(
            rows, raw_records_for(rows), provisional=True, allow_empty=True, **DEFAULT_BATCH_KWARGS)
        assert batch["candidates"] == []
        assert reviewed_rows[0]["mergeTargetKey"] == "IN|KA|Udupi|ExistingCanonicalArea"

    def test_target_resolves_against_canonical_area_inventory_in_final_mode(self, tmp_path):
        rows = [make_row(osm_id="1", decision="MERGE",
                          merge_target_key="IN|KA|Udupi|ExistingCanonicalArea")]
        inventory = load_canonical_area_inventory(CANONICAL_AREA_INVENTORY_SAMPLE)
        batch, reviewed_rows = build_batch_with_reviewed_rows(
            rows, raw_records_for(rows), canonical_area_inventory=inventory,
            allow_empty=True, **DEFAULT_BATCH_KWARGS)
        assert batch["candidates"] == []
        assert reviewed_rows[0]["decision"] == "MERGE"
        assert reviewed_rows[0]["emittedToBatch"] is False

    def test_target_resolves_against_in_batch_include_row_in_final_mode(self, tmp_path):
        rows = [
            make_row(osm_id="1", decision="INCLUDE", proposed_area_key="IN|KA|Udupi|Target"),
            make_row(osm_id="2", decision="MERGE", merge_target_key="IN|KA|Udupi|Target"),
        ]
        batch, reviewed_rows = build_batch_with_reviewed_rows(
            rows, raw_records_for(rows), **DEFAULT_BATCH_KWARGS)
        assert len(batch["candidates"]) == 1
        merge_row = next(r for r in reviewed_rows if r["decision"] == "MERGE")
        assert merge_row["mergeTargetKey"] == "IN|KA|Udupi|Target"
        assert merge_row["emittedToBatch"] is False

    def test_canonical_area_inventory_loads_from_json_array(self):
        inventory = load_canonical_area_inventory(CANONICAL_AREA_INVENTORY_SAMPLE)
        assert "IN|KA|Udupi|ExistingCanonicalArea" in inventory

    def test_canonical_area_inventory_loads_from_csv(self, tmp_path):
        csv_path = tmp_path / "inventory.csv"
        with open(csv_path, "w", encoding="utf-8", newline="") as fh:
            fh.write("area_key\nIN|KA|Udupi|FromCsvInventory\n")
        inventory = load_canonical_area_inventory(str(csv_path))
        assert "IN|KA|Udupi|FromCsvInventory" in inventory


class TestAliasDecision:
    """BLOCKING 2/MAJOR 6: ALIAS rows are never emitted as candidates but
    ARE preserved in the review manifest with their merge target."""

    def test_alias_row_is_never_emitted_as_a_candidate(self, tmp_path):
        rows = [
            make_row(osm_id="1", decision="INCLUDE", proposed_area_key="IN|KA|Udupi|Target"),
            make_row(osm_id="2", decision="ALIAS", merge_target_key="IN|KA|Udupi|Target"),
        ]
        batch, reviewed_rows = build_batch_with_reviewed_rows(
            rows, raw_records_for(rows), **DEFAULT_BATCH_KWARGS)
        assert len(batch["candidates"]) == 1
        alias_row = next(r for r in reviewed_rows if r["decision"] == "ALIAS")
        assert alias_row["emittedToBatch"] is False
        assert alias_row["mergeTargetKey"] == "IN|KA|Udupi|Target"

    def test_alias_row_with_absent_target_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1", decision="ALIAS", merge_target_key="")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **DEFAULT_BATCH_KWARGS)
        assert "ALIAS decision has an absent merge_target_key" in str(exc_info.value)

    def test_alias_row_with_unresolved_target_is_rejected_in_final_mode(self, tmp_path):
        rows = [make_row(osm_id="1", decision="ALIAS",
                          merge_target_key="IN|KA|Udupi|NotResolvable")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_with_reviewed_rows(rows, raw_records_for(rows), **DEFAULT_BATCH_KWARGS)
        assert "unresolved" in str(exc_info.value)


class TestEmptyOutputSafeguard:
    """ADDITIONAL: an intentionally-looking-valid empty candidate list must
    be explicit (--allow-empty), never silent."""

    def test_empty_output_is_rejected_by_default(self, tmp_path):
        rows = [make_row(osm_id="1", decision="EXCLUDE")]
        with pytest.raises(ValidationError) as exc_info:
            build_batch_with_reviewed_rows(rows, raw_records_for(rows), **DEFAULT_BATCH_KWARGS)
        assert "0 candidates would be emitted" in str(exc_info.value)

    def test_empty_output_succeeds_with_allow_empty(self, tmp_path):
        rows = [make_row(osm_id="1", decision="EXCLUDE")]
        batch, _reviewed_rows = build_batch_with_reviewed_rows(
            rows, raw_records_for(rows), allow_empty=True, **DEFAULT_BATCH_KWARGS)
        assert batch["candidates"] == []


class TestBatchIdentityValidation:
    """ADDITIONAL: dataset-id/dataset-version/provider/inputSchemaVersion/
    sourceExtractedAt are validated as real, supported, non-blank values —
    not merely "argparse required" (which still lets an empty string
    through)."""

    def test_blank_dataset_id_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1")]
        kwargs = dict(DEFAULT_BATCH_KWARGS)
        kwargs["dataset_id"] = "  "
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **kwargs)
        assert "datasetId is blank" in str(exc_info.value)

    def test_blank_dataset_version_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1")]
        kwargs = dict(DEFAULT_BATCH_KWARGS)
        kwargs["dataset_version"] = ""
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **kwargs)
        assert "datasetVersion is blank" in str(exc_info.value)

    def test_unsupported_provider_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1")]
        kwargs = dict(DEFAULT_BATCH_KWARGS)
        kwargs["provider"] = "OpenCity"
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **kwargs)
        assert "provider" in str(exc_info.value) and "not supported" in str(exc_info.value)

    def test_unsupported_input_schema_version_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1")]
        kwargs = dict(DEFAULT_BATCH_KWARGS)
        kwargs["input_schema_version"] = "2"
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **kwargs)
        assert "inputSchemaVersion" in str(exc_info.value)

    def test_unparsable_source_extracted_at_is_rejected(self, tmp_path):
        rows = [make_row(osm_id="1")]
        kwargs = dict(DEFAULT_BATCH_KWARGS)
        kwargs["source_extracted_at"] = "not-a-timestamp"
        with pytest.raises(ValidationError) as exc_info:
            build_batch_auto(rows, **kwargs)
        assert "sourceExtractedAt" in str(exc_info.value)


class TestChecksumSplitAndManifestDeterminism:
    """BLOCKING 3: candidatePayloadChecksum vs reviewArtifactChecksum split;
    manifest byte-determinism + reviewArtifactChecksum re-generation
    equality; two reviews differing only in excluded/merged rows or review
    metadata are never checksum-identical."""

    def _build_manifest(self, csv_path, raw_jsonl_path, dataset_id="ds", dataset_version="v1"):
        rows = read_reviewed_csv(csv_path)
        raw_records = load_raw_records(raw_jsonl_path)
        source_manifest = load_source_manifest(SOURCE_MANIFEST_SAMPLE)
        batch, reviewed_rows_info = build_batch_with_reviewed_rows(
            rows, raw_records, dataset_id=dataset_id, dataset_version=dataset_version,
            provider=source_manifest["provider"], input_schema_version="1",
            source_extracted_at=source_manifest["sourceExtractedAt"])
        manifest = build_review_manifest(
            source_manifest, batch, reviewed_rows_info, dataset_id, dataset_version,
            compute_file_sha256(raw_jsonl_path), compute_file_sha256(csv_path))
        return batch, manifest

    def test_candidate_payload_checksum_equals_batch_artifact_checksum(self):
        batch, manifest = self._build_manifest(REVIEWED_SAMPLE_CSV, RAW_JSONL_SAMPLE)
        assert manifest["emittedBatch"]["candidatePayloadChecksum"] == batch["artifactChecksum"]

    def test_manifest_regeneration_is_byte_identical_and_checksum_stable(self):
        _batch_1, manifest_1 = self._build_manifest(REVIEWED_SAMPLE_CSV, RAW_JSONL_SAMPLE)
        _batch_2, manifest_2 = self._build_manifest(REVIEWED_SAMPLE_CSV, RAW_JSONL_SAMPLE)
        assert json.dumps(manifest_1, sort_keys=True) == json.dumps(manifest_2, sort_keys=True)
        assert manifest_1["reviewArtifactChecksum"] == manifest_2["reviewArtifactChecksum"]

    def test_review_artifact_checksum_is_recomputable_via_compute_review_artifact_checksum(self):
        _batch, manifest = self._build_manifest(REVIEWED_SAMPLE_CSV, RAW_JSONL_SAMPLE)
        assert compute_review_artifact_checksum(manifest) == manifest["reviewArtifactChecksum"]

    def test_two_reviews_emitting_same_candidates_but_differing_exclusions_have_different_review_checksum(self, tmp_path):
        # Belman+Udupi INCLUDE, Ambagilu EXCLUDE (the committed fixture) vs a
        # variant where Ambagilu is EXCLUDEd for a DIFFERENT reason — same
        # emitted candidates/candidatePayloadChecksum, but the review is
        # materially different, so reviewArtifactChecksum MUST differ
        # (BLOCKING 3's whole point).
        _batch_1, manifest_1 = self._build_manifest(REVIEWED_SAMPLE_CSV, RAW_JSONL_SAMPLE)

        rows = read_reviewed_csv(REVIEWED_SAMPLE_CSV)
        for row in rows:
            if row["decision"] == "EXCLUDE":
                row["review_reason"] = "a completely different exclusion rationale"
        variant_csv = tmp_path / "variant.csv"
        write_csv(str(variant_csv), rows)

        _batch_2, manifest_2 = self._build_manifest(str(variant_csv), RAW_JSONL_SAMPLE)

        assert manifest_1["emittedBatch"]["candidatePayloadChecksum"] == \
            manifest_2["emittedBatch"]["candidatePayloadChecksum"]
        assert manifest_1["reviewArtifactChecksum"] != manifest_2["reviewArtifactChecksum"]

    def test_expected_review_checksum_matching_succeeds(self, tmp_path):
        out_path = tmp_path / "out.json"
        manifest_out = tmp_path / "manifest.json"
        rc = main([
            REVIEWED_SAMPLE_CSV, str(out_path),
            "--raw-jsonl", RAW_JSONL_SAMPLE,
            "--dataset-id", "osm-udupi-1900-sample", "--dataset-version", "v1",
            "--source-manifest", SOURCE_MANIFEST_SAMPLE,
            "--review-manifest-out", str(manifest_out),
        ])
        assert rc == 0
        with open(manifest_out, "r", encoding="utf-8") as fh:
            manifest = json.load(fh)
        rc2 = main([
            REVIEWED_SAMPLE_CSV, str(out_path),
            "--raw-jsonl", RAW_JSONL_SAMPLE,
            "--dataset-id", "osm-udupi-1900-sample", "--dataset-version", "v1",
            "--source-manifest", SOURCE_MANIFEST_SAMPLE,
            "--review-manifest-out", str(manifest_out),
            "--expected-review-checksum", manifest["reviewArtifactChecksum"],
        ])
        assert rc2 == 0

    def test_expected_review_checksum_mismatch_refuses(self, tmp_path):
        out_path = tmp_path / "out.json"
        manifest_out = tmp_path / "manifest.json"
        rc = main([
            REVIEWED_SAMPLE_CSV, str(out_path),
            "--raw-jsonl", RAW_JSONL_SAMPLE,
            "--dataset-id", "osm-udupi-1900-sample", "--dataset-version", "v1",
            "--source-manifest", SOURCE_MANIFEST_SAMPLE,
            "--review-manifest-out", str(manifest_out),
            "--expected-review-checksum", "0" * 64,
        ])
        assert rc == 1
        assert not out_path.exists()
        assert not manifest_out.exists()

    def test_non_ascii_kannada_alias_round_trips_through_manifest(self):
        _batch, manifest = self._build_manifest(
            ALIAS_MERGE_REVIEWED_CSV, ALIAS_MERGE_RAW_JSONL, dataset_id="osm-udupi-alias-merge-sample")
        include_row = next(r for r in manifest["reviewedRows"] if r["decision"] == "INCLUDE")
        kannada_alias = next(a for a in include_row["aliases"] if a["lang"] == "kn")
        assert kannada_alias["value"] == "ಕಲ್ಯಾಣಪುರ"

    def test_alias_merge_golden_manifest_and_batch_are_byte_identical_to_committed_fixtures(self, tmp_path):
        out_path = tmp_path / "out.json"
        manifest_out = tmp_path / "manifest.json"
        rc = main([
            ALIAS_MERGE_REVIEWED_CSV, str(out_path),
            "--raw-jsonl", ALIAS_MERGE_RAW_JSONL,
            "--dataset-id", "osm-udupi-alias-merge-sample", "--dataset-version", "v1",
            "--source-manifest", SOURCE_MANIFEST_SAMPLE,
            "--review-manifest-out", str(manifest_out),
        ])
        assert rc == 0
        with open(out_path, "r", encoding="utf-8") as fh:
            produced_batch = fh.read()
        with open(GOLDEN_ALIAS_MERGE_BATCH_JSON, "r", encoding="utf-8") as fh:
            golden_batch = fh.read()
        assert produced_batch == golden_batch
        with open(manifest_out, "r", encoding="utf-8") as fh:
            produced_manifest = fh.read()
        with open(GOLDEN_ALIAS_MERGE_MANIFEST_JSON, "r", encoding="utf-8") as fh:
            golden_manifest = fh.read()
        assert produced_manifest == golden_manifest


class TestCLIFinalModeRequiresManifestArgs:
    """DEFAULT (no --provisional) is strict/final mode: --source-manifest
    and --review-manifest-out are required."""

    def test_default_mode_without_source_manifest_refuses(self, tmp_path):
        out_path = tmp_path / "out.json"
        rc = main([
            REVIEWED_SAMPLE_CSV, str(out_path),
            "--raw-jsonl", RAW_JSONL_SAMPLE,
            "--dataset-id", "d", "--dataset-version", "v",
        ])
        assert rc == 1
        assert not out_path.exists()

    def test_review_manifest_out_without_source_manifest_refuses_even_under_provisional(self, tmp_path):
        out_path = tmp_path / "out.json"
        manifest_out = tmp_path / "manifest.json"
        rc = main([
            REVIEWED_SAMPLE_CSV, str(out_path),
            "--raw-jsonl", RAW_JSONL_SAMPLE,
            "--dataset-id", "d", "--dataset-version", "v",
            "--review-manifest-out", str(manifest_out),
            "--provisional",
        ])
        assert rc == 1
        assert not out_path.exists()
        assert not manifest_out.exists()

    def test_provisional_mode_without_source_manifest_or_manifest_out_succeeds(self, tmp_path):
        out_path = tmp_path / "out.json"
        rc = main([
            REVIEWED_SAMPLE_CSV, str(out_path),
            "--raw-jsonl", RAW_JSONL_SAMPLE,
            "--dataset-id", "osm-udupi-1900-sample", "--dataset-version", "v1",
            "--source-extracted-at", "2026-07-15T00:00:00Z",
            "--provisional",
        ])
        assert rc == 0
        assert out_path.exists()

    def test_final_mode_with_both_manifest_args_succeeds(self, tmp_path):
        out_path = tmp_path / "out.json"
        manifest_out = tmp_path / "manifest.json"
        rc = main([
            REVIEWED_SAMPLE_CSV, str(out_path),
            "--raw-jsonl", RAW_JSONL_SAMPLE,
            "--dataset-id", "osm-udupi-1900-sample", "--dataset-version", "v1",
            "--source-manifest", SOURCE_MANIFEST_SAMPLE,
            "--review-manifest-out", str(manifest_out),
        ])
        assert rc == 0
        assert out_path.exists()
        assert manifest_out.exists()


class TestD2RegressionGuard:
    """Hard invariant D2: the #1887 batch JSON
    (sample-1900-udupi-batch.json) consumed by
    AreaOnboarding1900ArtifactCompatIT must stay BYTE-FOR-BYTE unchanged.
    Regenerating it from the (rework-updated) reviewed CSV + raw JSONL must
    reproduce the exact committed bytes and checksum — proving the rework's
    new columns/validation/manifest sidecar never touch the #1887 batch
    payload."""

    def test_regenerating_the_compat_sample_reproduces_committed_bytes(self, tmp_path):
        out_path = tmp_path / "regen.json"
        rc = main([
            COMPAT_IT_REVIEWED_CSV, str(out_path),
            "--raw-jsonl", COMPAT_IT_RAW_JSONL,
            "--dataset-id", "issue-1900-udupi-compat-sample", "--dataset-version", "v1",
            "--provider", "OSM", "--source-extracted-at", "2026-07-15T00:00:00Z",
            "--provisional",
        ])
        assert rc == 0
        with open(out_path, "r", encoding="utf-8") as fh:
            regenerated = fh.read()
        with open(COMPAT_SAMPLE_BATCH_JSON, "r", encoding="utf-8") as fh:
            committed = fh.read()
        assert regenerated == committed

    def test_regenerating_with_a_manifest_still_leaves_the_batch_bytes_unchanged(self, tmp_path):
        out_path = tmp_path / "regen.json"
        manifest_out = tmp_path / "manifest.json"
        rc = main([
            COMPAT_IT_REVIEWED_CSV, str(out_path),
            "--raw-jsonl", COMPAT_IT_RAW_JSONL,
            "--dataset-id", "issue-1900-udupi-compat-sample", "--dataset-version", "v1",
            "--source-manifest", SOURCE_MANIFEST_SAMPLE,
            "--review-manifest-out", str(manifest_out),
        ])
        assert rc == 0
        with open(out_path, "r", encoding="utf-8") as fh:
            regenerated = fh.read()
        with open(COMPAT_SAMPLE_BATCH_JSON, "r", encoding="utf-8") as fh:
            committed = fh.read()
        assert regenerated == committed
        with open(manifest_out, "r", encoding="utf-8") as fh:
            manifest = json.load(fh)
        assert manifest["emittedBatch"]["candidatePayloadChecksum"] == \
            json.loads(committed)["artifactChecksum"]

    def test_committed_review_manifest_fixture_matches_regeneration(self, tmp_path):
        manifest_out = tmp_path / "manifest.json"
        out_path = tmp_path / "regen.json"
        rc = main([
            COMPAT_IT_REVIEWED_CSV, str(out_path),
            "--raw-jsonl", COMPAT_IT_RAW_JSONL,
            "--dataset-id", "issue-1900-udupi-compat-sample", "--dataset-version", "v1",
            "--source-manifest", SOURCE_MANIFEST_SAMPLE,
            "--review-manifest-out", str(manifest_out),
        ])
        assert rc == 0
        with open(manifest_out, "r", encoding="utf-8") as fh:
            regenerated_manifest = fh.read()
        with open(COMPAT_SAMPLE_MANIFEST_JSON, "r", encoding="utf-8") as fh:
            committed_manifest = fh.read()
        assert regenerated_manifest == committed_manifest


# ---------------------------------------------------------------------------
# User-correction-2 rework (PR #1904 second HOLD remediation): the review
# manifest was not cryptographically tied to the actual raw candidate
# JSONL — only an operator-entered PBF checksum, source metadata, a REDUCED
# reviewed-row representation (EXCLUDE/MERGE/ALIAS rows keep only OSM
# identity/decision/reviewer metadata, not full original evidence), and the
# emitted candidate checksum were recorded. source.rawCandidateJsonlSha256/
# reviewedCsvSha256 (program-computed via compute_file_sha256, never
# operator-supplied) close that gap: both sit inside `source`, which is
# fully covered by reviewArtifactChecksum.
# ---------------------------------------------------------------------------


class TestRawJsonlAndReviewedCsvChecksumBinding:
    def _build(self, raw_jsonl_path, csv_path, source_manifest):
        raw_records = load_raw_records(str(raw_jsonl_path))
        reviewed_rows = read_reviewed_csv(str(csv_path))
        batch, reviewed_rows_info = build_batch_with_reviewed_rows(
            reviewed_rows, raw_records, dataset_id="ds", dataset_version="v1",
            provider=source_manifest["provider"], input_schema_version="1",
            source_extracted_at=source_manifest["sourceExtractedAt"])
        manifest = build_review_manifest(
            source_manifest, batch, reviewed_rows_info, "ds", "v1",
            compute_file_sha256(str(raw_jsonl_path)), compute_file_sha256(str(csv_path)))
        return batch, manifest

    def test_one_byte_change_in_raw_jsonl_changes_hash_and_review_checksum(self, tmp_path):
        # (a) A single-byte change to an UNCHECKED field of the raw JSONL
        # (not any evidence column) still changes the file's bytes, and
        # therefore source.rawCandidateJsonlSha256 and, transitively,
        # reviewArtifactChecksum — even though it has zero effect on the
        # emitted candidate payload.
        row = make_row(osm_id="1", proposed_area_key="IN|KA|Udupi|One")
        record = raw_record_for(row)
        raw_jsonl_path = tmp_path / "raw.jsonl"
        csv_path = tmp_path / "reviewed.csv"
        write_csv(str(csv_path), [row])
        source_manifest = load_source_manifest(SOURCE_MANIFEST_SAMPLE)

        def write_raw(extra_note):
            with open(raw_jsonl_path, "w", encoding="utf-8") as fh:
                fh.write(json.dumps({**record, "extra_note": extra_note}) + "\n")

        write_raw("v1")
        batch_before, manifest_before = self._build(raw_jsonl_path, csv_path, source_manifest)
        write_raw("v2")
        batch_after, manifest_after = self._build(raw_jsonl_path, csv_path, source_manifest)

        assert manifest_before["source"]["rawCandidateJsonlSha256"] != \
            manifest_after["source"]["rawCandidateJsonlSha256"]
        assert manifest_before["reviewArtifactChecksum"] != \
            manifest_after["reviewArtifactChecksum"]
        # The one-byte raw-file tamper (an unused field no evidence check
        # reads) has no effect on what's actually emitted.
        assert batch_before == batch_after

    def test_coordinated_tamper_of_excluded_row_evidence_changes_review_checksum(self, tmp_path):
        # (b) THE CORE GAP: an EXCLUDED row's reviewedRows entry retains
        # only OSM identity/decision/reviewer metadata — never its original
        # geo_center_lat/lon/bbox evidence. Before this fix, mutating that
        # evidence in the raw JSONL and regenerating a CONSISTENT reviewed
        # CSV (so the AC5 cross-check — which only catches CSV/raw
        # DIVERGENCE, not a raw extraction altered before both files were
        # produced — does not refuse it) left candidatePayloadChecksum,
        # every reviewedRows field, AND reviewArtifactChecksum all
        # unchanged: the tamper was completely undetectable. With
        # rawCandidateJsonlSha256 wired into `source`, the coordinated
        # tamper is now provably detected via reviewArtifactChecksum.
        included = make_row(osm_id="1", decision="INCLUDE", proposed_area_key="IN|KA|Udupi|Kept")
        excluded = make_row(osm_id="2", decision="EXCLUDE", proposed_area_key="",
                             geo_center_lat="13.30", geo_center_lon="74.75")
        raw_jsonl_path = tmp_path / "raw.jsonl"
        csv_path = tmp_path / "reviewed.csv"
        source_manifest = load_source_manifest(SOURCE_MANIFEST_SAMPLE)

        write_raw_jsonl(str(raw_jsonl_path), [included, excluded])
        write_csv(str(csv_path), [included, excluded])
        batch_before, manifest_before = self._build(raw_jsonl_path, csv_path, source_manifest)

        # Coordinated tamper: mutate the EXCLUDED row's geometry evidence in
        # BOTH the raw JSONL and the reviewed CSV together, so they stay
        # mutually consistent (no AC5 divergence refusal).
        tampered_excluded = dict(excluded, geo_center_lat="14.99", geo_center_lon="75.99")
        write_raw_jsonl(str(raw_jsonl_path), [included, tampered_excluded])
        write_csv(str(csv_path), [included, tampered_excluded])
        batch_after, manifest_after = self._build(raw_jsonl_path, csv_path, source_manifest)

        # The emitted batch (only the INCLUDE row) is untouched — the
        # EXCLUDE row was never emitted and carries no geometry in
        # candidatePayloadChecksum.
        assert batch_before == batch_after
        assert manifest_before["emittedBatch"]["candidatePayloadChecksum"] == \
            manifest_after["emittedBatch"]["candidatePayloadChecksum"]
        # The EXCLUDED row's reviewedRows entry is unchanged too — it never
        # carried geo_center_lat/lon (the "reduced representation" gap
        # named in the rework finding).
        excluded_before = next(r for r in manifest_before["reviewedRows"] if r["decision"] == "EXCLUDE")
        excluded_after = next(r for r in manifest_after["reviewedRows"] if r["decision"] == "EXCLUDE")
        assert excluded_before == excluded_after
        # But the raw JSONL identity hash — and therefore the manifest's
        # overall reviewArtifactChecksum — now DOES change, closing the gap.
        assert manifest_before["source"]["rawCandidateJsonlSha256"] != \
            manifest_after["source"]["rawCandidateJsonlSha256"]
        assert manifest_before["reviewArtifactChecksum"] != \
            manifest_after["reviewArtifactChecksum"]

    def test_batch_json_byte_identical_with_and_without_manifest_after_checksum_binding(self, tmp_path):
        # (c) D2 hard invariant: adding source.rawCandidateJsonlSha256/
        # reviewedCsvSha256 to the manifest sidecar must never touch a
        # single byte of the separate #1887 batch JSON, regenerated with or
        # without a manifest requested.
        out_no_manifest = tmp_path / "no_manifest.json"
        rc = main([
            COMPAT_IT_REVIEWED_CSV, str(out_no_manifest),
            "--raw-jsonl", COMPAT_IT_RAW_JSONL,
            "--dataset-id", "issue-1900-udupi-compat-sample", "--dataset-version", "v1",
            "--provider", "OSM", "--source-extracted-at", "2026-07-15T00:00:00Z",
            "--provisional",
        ])
        assert rc == 0

        out_with_manifest = tmp_path / "with_manifest.json"
        manifest_out = tmp_path / "manifest.json"
        rc2 = main([
            COMPAT_IT_REVIEWED_CSV, str(out_with_manifest),
            "--raw-jsonl", COMPAT_IT_RAW_JSONL,
            "--dataset-id", "issue-1900-udupi-compat-sample", "--dataset-version", "v1",
            "--source-manifest", SOURCE_MANIFEST_SAMPLE,
            "--review-manifest-out", str(manifest_out),
        ])
        assert rc2 == 0

        with open(COMPAT_SAMPLE_BATCH_JSON, "r", encoding="utf-8") as fh:
            committed = fh.read()
        with open(out_no_manifest, "r", encoding="utf-8") as fh:
            assert fh.read() == committed
        with open(out_with_manifest, "r", encoding="utf-8") as fh:
            assert fh.read() == committed

        with open(manifest_out, "r", encoding="utf-8") as fh:
            manifest = json.load(fh)
        assert len(manifest["source"]["rawCandidateJsonlSha256"]) == 64
        assert len(manifest["source"]["reviewedCsvSha256"]) == 64
        int(manifest["source"]["rawCandidateJsonlSha256"], 16)  # valid hex
        int(manifest["source"]["reviewedCsvSha256"], 16)  # valid hex
