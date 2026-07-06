package com.example.realestate.geo;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link GeoCoarsener} (#1726).
 *
 * <p>The algorithm was extracted verbatim from the previously-duplicated {@code coarsen()}
 * helpers in {@code ListingResponseMapper} and {@code DiscoverAgriMapListingsService} (#1454) —
 * these tests pin the exact same behavior: null-safe, deterministic, sign-preserving truncation
 * to 2 decimal places (~1.1 km granularity).
 */
class GeoCoarsenerTest {

    @Test
    void coarsen_null_staysNull() {
        assertThat(GeoCoarsener.coarsen(null)).isNull();
    }

    @Test
    void coarsen_positiveValue_truncatesTowardZero() {
        // 13.34091 -> 13.34, not rounded to 13.35
        assertThat(GeoCoarsener.coarsen(13.34091)).isEqualTo(13.34);
    }

    @Test
    void coarsen_negativeValue_truncatesTowardZeroSignPreserved() {
        // -74.74215 -> -74.74 (NOT -74.75) — magnitude truncated, sign preserved
        assertThat(GeoCoarsener.coarsen(-74.74215)).isEqualTo(-74.74);
    }

    @Test
    void coarsen_alreadyAtTargetPrecision_isUnchanged() {
        assertThat(GeoCoarsener.coarsen(13.34)).isEqualTo(13.34);
    }

    @Test
    void coarsen_zero_staysZero() {
        assertThat(GeoCoarsener.coarsen(0.0)).isEqualTo(0.0);
    }

    @Test
    void coarsen_isDeterministic_sameInputSameOutput() {
        Double first = GeoCoarsener.coarsen(13.34091);
        Double second = GeoCoarsener.coarsen(13.34091);
        assertThat(first).isEqualTo(second);
    }

    @Test
    void coarsen_neverEqualToExactValue_whenPrecisionExceedsTarget() {
        Double coarsened = GeoCoarsener.coarsen(13.34091);
        assertThat(coarsened).isNotEqualTo(13.34091);
    }
}
