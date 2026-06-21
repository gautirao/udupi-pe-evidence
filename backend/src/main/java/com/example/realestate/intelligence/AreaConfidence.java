package com.example.realestate.intelligence;

/**
 * Data-confidence label for an area's LIVE-90d aggregate.
 *
 * <p>Single source of truth for confidence classification. Boundaries are EXACT:
 * <ul>
 *   <li>live90dCount >= 30  → FULL</li>
 *   <li>10 <= live90dCount <= 29 → LIMITED</li>
 *   <li>live90dCount < 10   → INSUFFICIENT</li>
 * </ul>
 *
 * <p>k-anonymity note: INSUFFICIENT areas (< 10 live listings) are admin-internal only
 * and MUST NOT be published externally without aggregation review.
 */
public enum AreaConfidence {

    FULL,
    LIMITED,
    INSUFFICIENT;

    /**
     * Classify a live-90d listing count into a confidence level.
     *
     * <p>Boundary cases (exhaustive):
     * classify(9)  = INSUFFICIENT
     * classify(10) = LIMITED
     * classify(29) = LIMITED
     * classify(30) = FULL
     *
     * @param live90dCount count of LIVE listings in the trailing 90 days for this area
     * @return confidence level
     */
    public static AreaConfidence classify(int live90dCount) {
        if (live90dCount >= 30) {
            return FULL;
        } else if (live90dCount >= 10) {
            return LIMITED;
        } else {
            return INSUFFICIENT;
        }
    }
}
