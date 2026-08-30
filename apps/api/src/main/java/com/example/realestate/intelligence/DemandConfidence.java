package com.example.realestate.intelligence;

/**
 * Confidence tier for a demand-signal bucket, based on supporting demand volume.
 *
 * <p>Persisted as its lowercase {@link #dbValue()} string, matching the
 * {@code confidence} CHECK constraint in V96
 * ({@code 'enough_data' | 'limited_data' | 'insufficient_data'}).
 *
 * <p>Intentionally different vocabulary from {@code area_intelligence_snapshot.confidence}
 * (which uses {@code full | limited | insufficient}) — these are separate columns on
 * separate tables with independent semantics (D5).
 *
 * <p>Classification boundaries (per {@link DemandSignalThresholds}):
 * <ul>
 *   <li>{@code demand_total < K_ANON_MIN (10)} → {@code INSUFFICIENT_DATA}
 *       (k-anon suppressed; gap_score NULL; not published)</li>
 *   <li>{@code 10 <= demand_total < CONFIDENCE_ENOUGH_MIN (30)} → {@code LIMITED_DATA}</li>
 *   <li>{@code demand_total >= 30} → {@code ENOUGH_DATA}</li>
 * </ul>
 *
 * <p>The lower bound (10) is FIXED and reuses {@link AggregationConstants#K_ANON_MIN}
 * — no second k-anon threshold is introduced.
 * {@link DemandSignalThresholds#CONFIDENCE_ENOUGH_MIN} (30) is provisional and tunable.
 */
public enum DemandConfidence {

    /**
     * High-volume demand: demand_total >= {@link DemandSignalThresholds#CONFIDENCE_ENOUGH_MIN}.
     * Statistical estimates are reliable.
     */
    ENOUGH_DATA("enough_data"),

    /**
     * Low-to-moderate demand: {@link AggregationConstants#K_ANON_MIN} <=
     * demand_total &lt; {@link DemandSignalThresholds#CONFIDENCE_ENOUGH_MIN}.
     * Estimates are directional; treat with caution.
     */
    LIMITED_DATA("limited_data"),

    /**
     * Demand total below k-anonymity threshold ({@link AggregationConstants#K_ANON_MIN} = 10).
     * Bucket is suppressed: gap_score = NULL, not published externally.
     */
    INSUFFICIENT_DATA("insufficient_data");

    private final String dbValue;

    DemandConfidence(String dbValue) {
        this.dbValue = dbValue;
    }

    /**
     * Lowercase string stored in the database and validated by the CHECK constraint.
     *
     * @return the lowercase DB value for this confidence tier
     */
    public String dbValue() {
        return dbValue;
    }

    /**
     * Classify demand_total into a confidence tier.
     *
     * <p>Uses {@link AggregationConstants#K_ANON_MIN} for the lower boundary (FIXED)
     * and {@link DemandSignalThresholds#CONFIDENCE_ENOUGH_MIN} for the upper (provisional).
     *
     * @param demandTotal search_count + panel_open_count + lead_intent_count
     * @return confidence tier
     */
    public static DemandConfidence classify(int demandTotal) {
        if (demandTotal < AggregationConstants.K_ANON_MIN) {
            return INSUFFICIENT_DATA;
        } else if (demandTotal < DemandSignalThresholds.CONFIDENCE_ENOUGH_MIN) {
            return LIMITED_DATA;
        } else {
            return ENOUGH_DATA;
        }
    }
}
