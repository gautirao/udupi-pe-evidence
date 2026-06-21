package com.example.realestate.intelligence;

/**
 * Named constants for demand-signal weighting, classification, and statistical guards.
 *
 * <p><b>IMPORTANT: two separate suppression concepts, never conflated (b1):</b>
 * <ol>
 *   <li><b>K-anon publication threshold</b> = {@link AggregationConstants#K_ANON_MIN} (=10).
 *       REUSED from the single source of truth. Gate: demand_total &lt; 10 → gap_score NULL,
 *       confidence insufficient_data, not published. This is the LEGAL k-anonymity rule.
 *       NO second k-anon threshold is defined here.</li>
 *   <li><b>Peer-population statistical guard</b> = {@link #MIN_PEER_POPULATION} (=3).
 *       Gate: |peer population| &lt; 3 → gap_score NULL (statistical-validity guard, NOT
 *       a privacy/k-anon threshold). Small-N z-scores are statistically noise; this guard
 *       is independent of and additional to the k-anon rule above.</li>
 * </ol>
 *
 * <p>All classification cutoffs ({@link #POSSIBLE_GAP_ABS_GAP_MAX}, {@link #SUPPLY_GAP_MIN_SCORE},
 * {@link #PRICE_SIGNAL_SUPPLY_SHARE_MAX}, {@link #INFO_GAP_MIN_PANEL_OPENS},
 * {@link #CONFIDENCE_ENOUGH_MIN}) are <b>PROVISIONAL</b> (D8: "structure-now, tune-later").
 * A follow-up issue finalises these after observing real data. They are named constants
 * (not magic numbers) specifically to support that future adjustment.
 *
 * <p>Demand weights ({@link #DEMAND_WEIGHT_SEARCH}, {@link #DEMAND_WEIGHT_PANEL_OPEN},
 * {@link #DEMAND_WEIGHT_LEAD_INTENT}) are <b>FIXED by user decision D7</b>.
 *
 * <p>This class is non-instantiable; all members are public static final.
 */
public final class DemandSignalThresholds {

    private DemandSignalThresholds() {
        // non-instantiable
    }

    // ── Demand weights (FIXED by user decision D7) ────────────────────────────

    /**
     * Weight for FILTER_APPLY (search) events in the weighted demand score.
     * weighted_demand = DEMAND_WEIGHT_SEARCH * search_count
     *                 + DEMAND_WEIGHT_PANEL_OPEN * panel_open_count
     *                 + DEMAND_WEIGHT_LEAD_INTENT * lead_intent_count.
     * Value: {@value} (fixed, D7).
     */
    public static final int DEMAND_WEIGHT_SEARCH = 1;

    /**
     * Weight for PANEL_OPEN events in the weighted demand score.
     * Reflects higher intent than a search filter application.
     * Value: {@value} (fixed, D7).
     */
    public static final int DEMAND_WEIGHT_PANEL_OPEN = 2;

    /**
     * Weight for LEAD_INTENT events in the weighted demand score.
     * Reflects highest-intent signal (user initiated contact intent).
     * Value: {@value} (fixed, D7).
     */
    public static final int DEMAND_WEIGHT_LEAD_INTENT = 5;

    // ── Statistical guard (NOT a k-anon threshold) ───────────────────────────

    /**
     * Minimum peer population size required to publish a gap_score.
     * Peer population = buckets sharing (city_slug, property_type, listing_purpose,
     * budget_band, period) in the same rollup window.
     *
     * <p>When |peer population| &lt; MIN_PEER_POPULATION, z-scores are statistically
     * unreliable (small-N noise) → gap_score = NULL.
     *
     * <p><b>This is a STATISTICAL-VALIDITY guard, NOT a k-anonymity threshold.</b>
     * The k-anonymity publication threshold is {@link AggregationConstants#K_ANON_MIN} (10),
     * which is the LEGAL suppression rule (#1520). These two guards are independent;
     * either one triggers gap_score = NULL.
     *
     * Value: {@value} (fixed by user decision D1).
     */
    public static final int MIN_PEER_POPULATION = 3;

    // ── Classification cutoffs (PROVISIONAL, D8 — tunable after real data) ───

    /**
     * Maximum absolute gap_score for a bucket to be classified as {@code possible_gap}
     * on the basis of a weak signal alone.
     * When |gap_score| &lt; this value, the signal is directional-only.
     * Value: {@value} (provisional, D8).
     */
    public static final double POSSIBLE_GAP_ABS_GAP_MAX = 0.5;

    /**
     * Minimum gap_score to classify a bucket as {@code supply_gap}
     * ("add a listing in this area").
     * Value: {@value} (provisional, D8).
     */
    public static final double SUPPLY_GAP_MIN_SCORE = 1.0;

    /**
     * Maximum fraction of the area's total matching LIVE supply that a single
     * budget band may hold before a {@code price_signal} is flagged.
     * A band holding &lt; this fraction of supply (despite non-trivial demand) suggests
     * a pricing mismatch.
     * Value: {@value} (provisional, D8).
     */
    public static final double PRICE_SIGNAL_SUPPLY_SHARE_MAX = 0.20;

    /**
     * Minimum panel_open_count required (with lead_intent == 0 and listing_count > 0)
     * to classify a bucket as {@code information_gap}
     * ("improve your listing content").
     * Value: {@value} (provisional, D8).
     */
    public static final int INFO_GAP_MIN_PANEL_OPENS = 3;

    /**
     * Minimum demand_total (search + panel + lead) to classify a bucket as
     * {@code enough_data} confidence (as opposed to {@code limited_data}).
     * Value: {@value} (provisional, D8).
     *
     * <p>The lower boundary ({@link AggregationConstants#K_ANON_MIN} = 10) is NOT
     * provisional and is not duplicated here.
     */
    public static final int CONFIDENCE_ENOUGH_MIN = 30;
}
