package com.example.realestate.intelligence;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Exhaustive boundary unit test for {@link AreaConfidence#classify(int)}.
 *
 * <p>The confidence rule has EXACT boundaries:
 * classify(9)  = INSUFFICIENT  (just below LIMITED threshold)
 * classify(10) = LIMITED        (exactly at lower threshold)
 * classify(29) = LIMITED        (exactly at upper threshold of LIMITED)
 * classify(30) = FULL           (exactly at FULL threshold)
 *
 * These four cases are the acceptance-criteria boundary cases from the approved plan.
 */
class AreaConfidenceTest {

    // ==================== Boundary cases from acceptance criteria ====================

    @Test
    void classify_9_returnsInsufficient() {
        assertThat(AreaConfidence.classify(9)).isEqualTo(AreaConfidence.INSUFFICIENT);
    }

    @Test
    void classify_10_returnsLimited() {
        assertThat(AreaConfidence.classify(10)).isEqualTo(AreaConfidence.LIMITED);
    }

    @Test
    void classify_29_returnsLimited() {
        assertThat(AreaConfidence.classify(29)).isEqualTo(AreaConfidence.LIMITED);
    }

    @Test
    void classify_30_returnsFull() {
        assertThat(AreaConfidence.classify(30)).isEqualTo(AreaConfidence.FULL);
    }

    // ==================== Additional guard cases ====================

    @Test
    void classify_0_returnsInsufficient() {
        assertThat(AreaConfidence.classify(0)).isEqualTo(AreaConfidence.INSUFFICIENT);
    }

    @Test
    void classify_1_returnsInsufficient() {
        assertThat(AreaConfidence.classify(1)).isEqualTo(AreaConfidence.INSUFFICIENT);
    }

    @Test
    void classify_15_returnsLimited() {
        assertThat(AreaConfidence.classify(15)).isEqualTo(AreaConfidence.LIMITED);
    }

    @Test
    void classify_50_returnsFull() {
        assertThat(AreaConfidence.classify(50)).isEqualTo(AreaConfidence.FULL);
    }

    @Test
    void classify_100_returnsFull() {
        assertThat(AreaConfidence.classify(100)).isEqualTo(AreaConfidence.FULL);
    }
}
