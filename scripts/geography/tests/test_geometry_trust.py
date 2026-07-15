"""Tests for geometry_trust.py — the Python port of GeometryTrust.classify
(#1900 AC4/D4/R5)."""
from geometry_trust import MISSING, PROVISIONAL, VERIFIED, classify


class TestClassify:
    def test_missing_when_no_center(self):
        assert classify("OSM", None, None, None, None, None, None) == MISSING

    def test_missing_when_only_lat_present(self):
        assert classify("OSM", 13.34, None, 13.0, 74.0, 13.5, 74.5) == MISSING

    def test_verified_when_osm_source_and_full_bbox(self):
        assert classify("OSM", 13.34, 74.75, 13.30, 74.70, 13.40, 74.80) == VERIFIED

    def test_verified_when_manual_source_and_full_bbox(self):
        assert classify("MANUAL", 13.34, 74.75, 13.30, 74.70, 13.40, 74.80) == VERIFIED

    def test_provisional_when_null_source_legacy_seed(self):
        # geometry_source IS NULL is the legacy bbox-seed case — MUST be
        # PROVISIONAL, never MISSING, per GeometryTrust.java's javadoc.
        assert classify(None, 13.34, 74.75, 13.30, 74.70, 13.40, 74.80) == PROVISIONAL

    def test_provisional_when_point_only_no_bbox(self):
        # D4/R5: point-only (centre present, bbox entirely absent) MUST be
        # PROVISIONAL — never faked to VERIFIED by synthesising a bbox.
        assert classify("OSM", 13.34, 74.75, None, None, None, None) == PROVISIONAL

    def test_provisional_when_bbox_partially_incomplete(self):
        assert classify("OSM", 13.34, 74.75, 13.30, 74.70, None, 74.80) == PROVISIONAL

    def test_provisional_when_untrusted_source_with_full_bbox(self):
        assert classify("SOME_OTHER_SOURCE", 13.34, 74.75, 13.30, 74.70, 13.40, 74.80) == PROVISIONAL

    def test_never_returns_verified_for_a_degenerate_point_bbox(self):
        # Regression guard for the exact defect D4/R5 warns against: a
        # degenerate bbox where min==max==centre must NOT be treated
        # specially by classify() itself (it only checks null-ness) — the
        # NON-synthesis obligation lives in extract_osm_candidates.py, but
        # this test proves classify() would (correctly, by its own
        # contract) call a degenerate-but-complete bbox VERIFIED, which is
        # exactly why the extractor must never manufacture one for a point.
        assert classify("OSM", 13.34, 74.75, 13.34, 74.75, 13.34, 74.75) == VERIFIED
