"""Tests for area_key.py — the Python port of AreaKeyFormat (#1900 AC4).

Cross-checked by AreaOnboarding1900ArtifactCompatIT, which confirms
AreaKeyFormat.normalise() (the Java side) accepts minted keys unchanged.
"""
import pytest

from area_key import (
    AreaKeyMintError,
    is_valid_four_segment,
    mint,
    normalise,
    normalise_district_token,
)


class TestIsValidFourSegment:
    def test_valid_key_passes(self):
        assert is_valid_four_segment("IN|KA|Bengaluru|Whitefield") is True

    def test_none_fails(self):
        assert is_valid_four_segment(None) is False

    def test_too_few_segments_fails(self):
        assert is_valid_four_segment("IN|KA|Bengaluru") is False

    def test_too_many_segments_fails(self):
        assert is_valid_four_segment("IN|KA|Bengaluru|Whitefield|Extra") is False

    def test_blank_segment_fails(self):
        assert is_valid_four_segment("IN|KA| |Whitefield") is False

    def test_trailing_pipe_fails(self):
        # Mirrors Java's split("\\|", -1) keeping the trailing empty segment.
        assert is_valid_four_segment("IN|KA|Bengaluru|") is False


class TestDistrictCaseRules:
    @pytest.mark.parametrize("raw,expected", [
        ("bengaluru urban", "bengaluru"),
        ("Bengaluru Urban", "bengaluru"),
        ("BANGALORE URBAN", "bengaluru"),
        ("bangalore", "bengaluru"),
        ("Bangalore", "bengaluru"),
        ("  bangalore  ", "bengaluru"),
        ("dakshina kannada", "mangalore"),
        ("Dakshina Kannada", "mangalore"),
        ("mangaluru", "mangalore"),
        ("Mangaluru", "mangalore"),
        ("udupi", "udupi"),
        ("Udupi", "udupi"),
    ])
    def test_case_variants(self, raw, expected):
        assert normalise_district_token(raw) == expected

    def test_none_passthrough(self):
        assert normalise_district_token(None) is None


class TestNormalise:
    def test_trims_and_title_cases_district(self):
        assert normalise("IN|KA| bangalore urban |Whitefield") == "IN|KA|Bengaluru|Whitefield"

    def test_idempotent(self):
        key = normalise("IN|KA|bangalore|Koramangala")
        assert normalise(key) == key

    def test_non_special_district_title_cased(self):
        assert normalise("IN|KA|udupi|Manipal") == "IN|KA|Udupi|Manipal"

    def test_raises_on_invalid_shape(self):
        with pytest.raises(ValueError):
            normalise("IN|KA|Bengaluru")


class TestMint:
    def test_mints_valid_bengaluru_alias_key(self):
        key = mint("IN", "KA", "bangalore", "Whitefield")
        assert key == "IN|KA|Bengaluru|Whitefield"
        assert is_valid_four_segment(key)
        assert normalise(key) == key

    def test_mints_valid_mangalore_alias_key(self):
        key = mint("IN", "KA", "mangaluru", "Someplace")
        assert key == "IN|KA|Mangalore|Someplace"
        assert normalise(key) == key

    def test_mints_valid_passthrough_district_key(self):
        key = mint("IN", "KA", "udupi", "Manipal")
        assert key == "IN|KA|Udupi|Manipal"
        assert normalise(key) == key

    def test_trims_whitespace_in_all_segments(self):
        key = mint(" IN ", " KA ", " udupi ", " Manipal ")
        assert key == "IN|KA|Udupi|Manipal"

    def test_two_candidates_minting_same_key_is_a_collision_the_caller_must_detect(self):
        # mint() itself has no batch context to detect a collision — it is
        # the CALLER's (build_batch_json.py) responsibility to surface a
        # collision as an unresolved reviewer decision, never auto-suffix.
        # This test documents that mint() is deterministic given identical
        # inputs (a prerequisite for collision detection to even be
        # possible upstream).
        key_a = mint("IN", "KA", "udupi", "Manipal")
        key_b = mint("IN", "KA", "udupi", "Manipal")
        assert key_a == key_b

    def test_raises_on_blank_area(self):
        with pytest.raises(AreaKeyMintError):
            mint("IN", "KA", "udupi", "   ")

    def test_raises_on_none_segment(self):
        with pytest.raises(AreaKeyMintError):
            mint("IN", "KA", None, "Manipal")
