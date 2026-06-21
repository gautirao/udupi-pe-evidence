package com.example.realestate.listing.api;

/**
 * Response DTO for GET /api/listings/mine/quality-summary.
 *
 * <p>All fields are null-safe:
 * <ul>
 *   <li>{@code quality.averageQualityScore} is null when no scores have been computed yet.
 *   <li>{@code quality.percentageComputed} is null when the broker has no listings at all.
 *   <li>{@code engagement} and {@code demandGap} are hard-coded stubs pending M31 / #1531.
 * </ul>
 *
 * <p>No raw {@code quality_breakdown} text is included — only aggregate counts are exposed
 * to prevent leaking per-listing finding text.
 */
public record BrokerQualitySummaryResponse(
        Portfolio portfolio,
        Quality quality,
        ActionSignals actionSignals,
        Engagement engagement,
        DemandGap demandGap
) {

    /**
     * Portfolio-level listing counts (non-archived).
     *
     * @param activeListings  count of listings in LIVE or PENDING_REVIEW status
     * @param totalListings   total non-archived listing count (all statuses)
     */
    public record Portfolio(int activeListings, int totalListings) {}

    /**
     * Aggregate quality state for the broker's portfolio.
     *
     * @param state               PENDING | PARTIAL | COMPLETE
     * @param averageQualityScore mean quality score rounded to nearest int; null when countComputed == 0
     * @param countComputed       listings with a non-null quality_score
     * @param countTotal          total non-archived listings
     * @param percentageComputed  floor(countComputed * 100 / countTotal); null only when countTotal == 0
     *                            (i.e. no listings at all); 0 when listings exist but none are scored
     */
    public record Quality(
            String state,
            Integer averageQualityScore,
            int countComputed,
            int countTotal,
            Integer percentageComputed
    ) {}

    /**
     * Per-signal action bucket.
     *
     * @param count  number of listings in this bucket
     * @param state  mirrors the portfolio quality state (PENDING | PARTIAL | COMPLETE)
     */
    public record ActionSignalBucket(int count, String state) {}

    /**
     * Broker-facing action signals derived from quality_score and quality_breakdown.
     *
     * <p>Thresholds (tunable in {@code BrokerDashboardService}):
     * <ul>
     *   <li>needsFixes: quality_score &lt; 60 (strict — score 60 is NOT needsFixes)
     *   <li>buyerReady: quality_score &gt;= 80 (inclusive — score 80 IS buyerReady)
     *   <li>missingLocation: LOCATION component score &lt; 75
     *   <li>incomplete: KEY_FIELDS | PHOTOS | DESCRIPTION component score &lt; 50, OR status = 'DRAFT'
     * </ul>
     */
    public record ActionSignals(
            ActionSignalBucket needsFixes,
            ActionSignalBucket missingLocation,
            ActionSignalBucket incomplete,
            ActionSignalBucket buyerReady
    ) {}

    /**
     * Engagement stub — no event data exists until #1531.
     *
     * @param state       always "UNAVAILABLE"
     * @param views       always null
     * @param enquiries   always null
     * @param reason      human-readable explanation
     */
    public record Engagement(String state, Integer views, Integer enquiries, String reason) {}

    /**
     * Demand-gap stub — limited data until M30.
     *
     * @param state   always "LIMITED_DATA"
     * @param signal  always null
     * @param reason  human-readable explanation
     */
    public record DemandGap(String state, String signal, String reason) {}
}
