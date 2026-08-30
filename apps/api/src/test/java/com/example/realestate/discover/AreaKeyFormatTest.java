package com.example.realestate.discover;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link AreaKeyFormat} (#1887 PR1) — pure logic, no DB dependency.
 */
class AreaKeyFormatTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "IN|KA|Udupi|Manipal",
            "IN|KA|Bengaluru|Whitefield",
            "a|b|c|d"
    })
    void validFourSegmentKeysPass(String areaKey) {
        assertThat(AreaKeyFormat.isValidFourSegment(areaKey)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "IN|KA|Udupi",              // 3 segments
            "IN|KA|Udupi|Manipal|Extra", // 5 segments
            "IN|KA||Manipal",            // blank segment
            "IN|KA|Udupi|",              // trailing empty segment
            "|KA|Udupi|Manipal",         // leading empty segment
            "   ",                       // no pipes at all
            ""
    })
    void malformedKeysFail(String areaKey) {
        assertThat(AreaKeyFormat.isValidFourSegment(areaKey)).isFalse();
    }

    @Test
    void nullKeyFails() {
        assertThat(AreaKeyFormat.isValidFourSegment(null)).isFalse();
    }

    @Test
    void whitespaceOnlySegmentFails() {
        assertThat(AreaKeyFormat.isValidFourSegment("IN|KA|   |Manipal")).isFalse();
    }

    @Test
    void normaliseThrowsOnMalformedKey() {
        assertThatThrownBy(() -> AreaKeyFormat.normalise("IN|KA|Udupi"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void normaliseTrimsSegments() {
        assertThat(AreaKeyFormat.normalise(" IN | KA | Udupi | Manipal "))
                .isEqualTo("IN|KA|Udupi|Manipal");
    }

    // ── District normalisation: the two CASE pairs from V79/V80 ────────────────

    @ParameterizedTest
    @CsvSource({
            "bengaluru urban, bengaluru",
            "Bengaluru Urban, bengaluru",
            "BANGALORE URBAN, bengaluru",
            "bangalore urban, bengaluru",
            "bangalore, bengaluru",
            "Bangalore, bengaluru",
            "dakshina kannada, mangalore",
            "Dakshina Kannada, mangalore",
            "mangaluru, mangalore",
            "Mangaluru, mangalore"
    })
    void districtNormalisationCasePairs(String raw, String expected) {
        assertThat(AreaKeyFormat.normaliseDistrictToken(raw)).isEqualTo(expected);
    }

    @ParameterizedTest
    @CsvSource({
            "Udupi, udupi",
            "  Udupi  , udupi",
            "Kundapur, kundapur",
            "Mangalore, mangalore",
            "Bengaluru, bengaluru"
    })
    void districtsOutsideCaseListPassThroughLowercasedAndTrimmed(String raw, String expected) {
        assertThat(AreaKeyFormat.normaliseDistrictToken(raw)).isEqualTo(expected);
    }

    @Test
    void nullDistrictTokenReturnsNull() {
        assertThat(AreaKeyFormat.normaliseDistrictToken(null)).isNull();
    }

    @Test
    void normaliseAppliesDistrictNormalisationAndTitleCasesDistrictSegment() {
        assertThat(AreaKeyFormat.normalise("IN|KA|Bangalore Urban|Whitefield"))
                .isEqualTo("IN|KA|Bengaluru|Whitefield");
        assertThat(AreaKeyFormat.normalise("IN|KA|Dakshina Kannada|Kadri"))
                .isEqualTo("IN|KA|Mangalore|Kadri");
    }

    @Test
    void normaliseIsIdempotentOnAlreadyCanonicalKey() {
        String canonical = "IN|KA|Udupi|Manipal";
        assertThat(AreaKeyFormat.normalise(canonical)).isEqualTo(canonical);
    }
}
