package com.example.realestate.broker.demand;

/**
 * Named constants for broker-facing demand-gaps presentation.
 *
 * <p>Centralises the presentation threshold for broker supply coverage so it can be
 * tuned in one place without touching business logic. This is a presentation-only
 * constant; it does not gate suppression or k-anonymity (those use
 * {@link com.example.realestate.intelligence.AggregationConstants#K_ANON_MIN}).
 *
 * <p>For demand-signal thresholds (SUPPLY_GAP_MIN_SCORE etc.) reuse
 * {@link com.example.realestate.intelligence.DemandSignalThresholds} directly —
 * do NOT redefine them here.
 *
 * <p>This class is non-instantiable; all members are public static final.
 */
public final class BrokerDemandGapsConfig {

    private BrokerDemandGapsConfig() {
        // non-instantiable
    }

    /**
     * Minimum number of LIVE listings a broker must have in a bucket to count as
     * "covering" that bucket for the brokerMatchingListings summary metric.
     *
     * <p>Value: {@value}. A broker with exactly this many LIVE listings in a bucket
     * is counted as having coverage. A broker with 0 is not.
     *
     * <p>This is a PRESENTATION constant — it affects what is surfaced in the summary
     * metric, not whether a gap is surfaced or suppressed. Tune after observing real data.
     */
    public static final int BROKER_LIVE_MIN = 1;
}
