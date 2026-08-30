package com.example.realestate.intelligence;

/**
 * Shared numeric constants for area-level aggregation and k-anonymity suppression.
 *
 * <p><b>K_ANON_MIN</b> is the SINGLE source of truth for k-anonymity suppression across
 * admin, buyer, and broker display paths. Any code that decides whether to reveal
 * per-area statistics (median price, dominant property type, etc.) MUST consume this
 * constant rather than hard-coding the value. Issue #1532 must consume this same constant.
 *
 * <p><b>FRESH_WINDOW_DAYS</b> defines the "fresh listing" window as approved in the D3
 * acceptance criterion. A listing is "fresh" when its {@code created_at} falls within
 * the last {@code FRESH_WINDOW_DAYS} calendar days of the snapshot computation time.
 *
 * <p>This class is non-instantiable; all members are public static final.
 */
public final class AggregationConstants {

    private AggregationConstants() {
        // non-instantiable
    }

    /**
     * Minimum active-listing count required before per-area price and property-type
     * statistics are revealed. Areas with fewer than this many active listings have
     * {@code median_price_paise} and {@code dominant_property_type} suppressed (NULL)
     * in the snapshot to satisfy k-anonymity.
     *
     * <p>Value: {@value}. Must equal {@link AreaConfidence#classify} LIMITED lower-bound (10).
     */
    public static final int K_ANON_MIN = 10;

    /**
     * Number of calendar days that define the "fresh listing" window for
     * {@code fresh_listing_count} in {@code area_intelligence_snapshot}.
     *
     * <p>Value: {@value}.
     */
    public static final int FRESH_WINDOW_DAYS = 30;
}
