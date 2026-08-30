package com.example.realestate.discover;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Exhaustive boundary matrix for {@link MonthlyRentBand#of(Long)} (issue #2051, AC15).
 *
 * <p>Every boundary value (10000, 20000, 35000, 50000) is asserted together with its
 * just-below neighbour (9999, 19999, 34999, 49999) — a single-sided boundary test would not
 * catch an off-by-one in the comparison operator, the classic defect for inclusive/exclusive
 * bucket edges (R16).
 */
class MonthlyRentBandTest {

    static Stream<Arguments> boundaryMatrix() {
        return Stream.of(
                // Below the ₹0-10K/₹10-20K boundary
                Arguments.of(1L, "₹0–10K"),
                Arguments.of(9999L, "₹0–10K"),
                // ₹10-20K boundary (inclusive lower bound)
                Arguments.of(10000L, "₹10–20K"),
                Arguments.of(19999L, "₹10–20K"),
                // ₹20-35K boundary
                Arguments.of(20000L, "₹20–35K"),
                Arguments.of(34999L, "₹20–35K"),
                // ₹35-50K boundary
                Arguments.of(35000L, "₹35–50K"),
                Arguments.of(49999L, "₹35–50K"),
                // ₹50K+ boundary
                Arguments.of(50000L, "₹50K+"),
                Arguments.of(999999L, "₹50K+")
        );
    }

    @ParameterizedTest(name = "{0} rupees -> {1}")
    @MethodSource("boundaryMatrix")
    void of_boundaryMatrix_returnsExpectedLabel(long rupees, String expectedLabel) {
        assertThat(MonthlyRentBand.of(rupees)).isEqualTo(expectedLabel);
    }

    @org.junit.jupiter.api.Test
    void of_null_returnsNull() {
        assertThat(MonthlyRentBand.of(null)).isNull();
    }

    @org.junit.jupiter.api.Test
    void of_zero_returnsNull_notZeroToTenKBucket() {
        // R16: the ₹0-10K bucket's lower bound is INCLUSIVE of 0, so the <=0 guard MUST run
        // before bucket selection, or an invalid rent of 0 would be presented as "₹0–10K".
        assertThat(MonthlyRentBand.of(0L)).isNull();
    }

    @org.junit.jupiter.api.Test
    void of_negative_returnsNull() {
        assertThat(MonthlyRentBand.of(-1L)).isNull();
    }
}
