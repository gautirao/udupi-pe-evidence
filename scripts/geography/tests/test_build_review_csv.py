"""Tests for build_review_csv.py — raw JSONL -> reviewer CSV (#1900 AC1/AC5)."""
import csv
import os

from build_review_csv import ALL_COLUMNS, DECISION_COLUMNS, EVIDENCE_COLUMNS, build_csv

FIXTURES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fixtures")
RAW_SAMPLE = os.path.join(FIXTURES_DIR, "raw_candidates_sample.jsonl")


class TestBuildCsv:
    def test_row_count_matches_jsonl_line_count(self, tmp_path):
        out_path = tmp_path / "review.csv"
        rows = build_csv(RAW_SAMPLE, "KA", "udupi", str(out_path))
        assert len(rows) == 3

        with open(out_path, "r", encoding="utf-8", newline="") as fh:
            csv_rows = list(csv.DictReader(fh))
        assert len(csv_rows) == 3

    def test_header_matches_declared_columns_exactly(self, tmp_path):
        out_path = tmp_path / "review.csv"
        build_csv(RAW_SAMPLE, "KA", "udupi", str(out_path))
        with open(out_path, "r", encoding="utf-8", newline="") as fh:
            header = next(csv.reader(fh))
        assert header == ALL_COLUMNS

    def test_decision_columns_are_emitted_empty(self, tmp_path):
        out_path = tmp_path / "review.csv"
        build_csv(RAW_SAMPLE, "KA", "udupi", str(out_path))
        with open(out_path, "r", encoding="utf-8", newline="") as fh:
            rows = list(csv.DictReader(fh))
        for row in rows:
            assert row["decision"] == ""
            assert row["reviewer"] == ""
            assert row["merge_target_key"] == ""
            assert row["canonical_name_override"] == ""

    def test_proposed_area_key_is_prefilled_and_valid(self, tmp_path):
        out_path = tmp_path / "review.csv"
        build_csv(RAW_SAMPLE, "KA", "udupi", str(out_path))
        with open(out_path, "r", encoding="utf-8", newline="") as fh:
            rows = list(csv.DictReader(fh))
        udupi_row = next(r for r in rows if r["name"] == "Udupi")
        assert udupi_row["proposed_area_key"] == "IN|KA|Udupi|Udupi"

    def test_geometry_trust_is_provisional_for_point_only_osm_nodes(self, tmp_path):
        # All fixture records are point-only OSM nodes with no bbox — every
        # row must classify PROVISIONAL (D4/R5), never VERIFIED.
        out_path = tmp_path / "review.csv"
        build_csv(RAW_SAMPLE, "KA", "udupi", str(out_path))
        with open(out_path, "r", encoding="utf-8", newline="") as fh:
            rows = list(csv.DictReader(fh))
        for row in rows:
            assert row["geometry_trust"] == "PROVISIONAL"

    def test_raw_tags_digest_is_stable_for_identical_input(self, tmp_path):
        out_path_1 = tmp_path / "review1.csv"
        out_path_2 = tmp_path / "review2.csv"
        build_csv(RAW_SAMPLE, "KA", "udupi", str(out_path_1))
        build_csv(RAW_SAMPLE, "KA", "udupi", str(out_path_2))
        with open(out_path_1, "r", encoding="utf-8", newline="") as fh:
            digests_1 = [row["raw_tags_digest"] for row in csv.DictReader(fh)]
        with open(out_path_2, "r", encoding="utf-8", newline="") as fh:
            digests_2 = [row["raw_tags_digest"] for row in csv.DictReader(fh)]
        assert digests_1 == digests_2

    def test_evidence_columns_carry_read_only_raw_values(self, tmp_path):
        out_path = tmp_path / "review.csv"
        build_csv(RAW_SAMPLE, "KA", "udupi", str(out_path))
        with open(out_path, "r", encoding="utf-8", newline="") as fh:
            rows = list(csv.DictReader(fh))
        belman_row = next(r for r in rows if r["name"] == "Belman")
        assert belman_row["osm_id"] == "245618785"
        assert belman_row["place"] == "village"
        assert belman_row["name_kn"] == "ಬೆಳ್ಮಣ್"
        # Sanity: no editable/decision column name leaks into the evidence set.
        assert not set(EVIDENCE_COLUMNS) & set(DECISION_COLUMNS)
