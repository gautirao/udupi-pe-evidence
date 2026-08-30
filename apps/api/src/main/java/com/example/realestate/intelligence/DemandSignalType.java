package com.example.realestate.intelligence;

/**
 * Deterministic signal classification for a demand bucket.
 *
 * <p>Persisted as its lowercase {@link #dbValue()} string, which matches the
 * {@code signal_type} CHECK constraint in V96 ({@code 'supply_gap' | 'information_gap' |
 * 'price_signal' | 'possible_gap'}).
 *
 * <p>Classification is applied in {@link AreaDemandSignalService} using the
 * named provisional cutoffs in {@link DemandSignalThresholds}. A follow-up issue
 * finalises these cutoffs after real data is observed.
 *
 * <p>Ordering of enum values is IRRELEVANT to classification; the service applies
 * deterministic if-chain logic per the approved spec.
 */
public enum DemandSignalType {

    /**
     * Strong unmet demand: gap_score >= {@link DemandSignalThresholds#SUPPLY_GAP_MIN_SCORE}.
     * Action for brokers: "add a listing in this area".
     */
    SUPPLY_GAP("supply_gap"),

    /**
     * Listings exist but demand signals are absent: listing_count > 0 AND lead_intent == 0
     * AND panel_open_count >= {@link DemandSignalThresholds#INFO_GAP_MIN_PANEL_OPENS}.
     * Action for brokers: "improve your listing content".
     */
    INFORMATION_GAP("information_gap"),

    /**
     * Demand present but this band holds very little matching supply:
     * demand_total >= k-anon AND this band's listing_count <
     * {@link DemandSignalThresholds#PRICE_SIGNAL_SUPPLY_SHARE_MAX} of the area's
     * total matching LIVE supply for the same property_type+listing_purpose.
     * Action for brokers: "review pricing in this band".
     */
    PRICE_SIGNAL("price_signal"),

    /**
     * Directional only / low confidence: confidence == limited_data OR
     * |gap_score| &lt; {@link DemandSignalThresholds#POSSIBLE_GAP_ABS_GAP_MAX}.
     * Also the default fallback when no other type matches.
     * Action: "watch this area".
     */
    POSSIBLE_GAP("possible_gap");

    private final String dbValue;

    DemandSignalType(String dbValue) {
        this.dbValue = dbValue;
    }

    /**
     * Lowercase string stored in the database and validated by the CHECK constraint.
     *
     * @return the lowercase DB value for this signal type
     */
    public String dbValue() {
        return dbValue;
    }
}
