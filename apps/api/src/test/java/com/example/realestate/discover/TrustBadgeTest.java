package com.example.realestate.discover;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link TrustBadge#publicBadge(String)} — the sole allow-list mapping from the
 * internal trust tier letter grade to a public-safe badge word (#1567).
 */
class TrustBadgeTest {

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({
            "A, verified",
            "B, trusted",
            "C, listed",
    })
    void publicBadge_knownTiers_mapToExpectedBadge(String rawTier, String expectedBadge) {
        assertThat(TrustBadge.publicBadge(rawTier)).isEqualTo(expectedBadge);
    }

    @Test
    void publicBadge_dTier_returnsNull() {
        // D is the lowest tier — deliberately no badge (OQ2 decision), not "unverified" or similar.
        assertThat(TrustBadge.publicBadge("D")).isNull();
    }

    @ParameterizedTest
    @NullSource
    void publicBadge_null_returnsNull(String rawTier) {
        assertThat(TrustBadge.publicBadge(rawTier)).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"a", "b", "c", "d", "Verified", "verified", "E", "AA", ""})
    void publicBadge_lowercaseOrUnknown_returnsNull_neverInventsATier(String rawTier) {
        assertThat(TrustBadge.publicBadge(rawTier)).isNull();
    }
}
