package com.example.realestate.intelligence;

/**
 * Spring Data projection interface for the per-area top-gap query in
 * {@link AreaDemandSignalRepository#findTop3GapsByLatestWindow30()}.
 *
 * <p>Returns at most 3 rows per {@code (city_slug, area_key)}: the top-3 non-suppressed
 * ({@code gap_score IS NOT NULL}) buckets ordered by {@code gap_score DESC} with a stable
 * tie-break on {@code (property_type, listing_purpose, budget_band)}.
 *
 * <p>Only buckets with a non-null {@code gap_score} are ever returned; suppressed buckets
 * are excluded by the WHERE clause in the repository query.
 */
public interface AreaTopGapRow {

    /** City slug. Never null. */
    String getCitySlug();

    /** Area key. Never null. */
    String getAreaKey();

    /** Property type token. Never null. */
    String getPropertyType();

    /** Listing purpose ({@code "sale"} or {@code "rent"}). Never null. */
    String getListingPurpose();

    /** Canonical budget band label. Never null. */
    String getBudgetBand();

    /**
     * Signal classification. Never null.
     * One of: {@code supply_gap | information_gap | price_signal | possible_gap}.
     */
    String getSignalType();

    /**
     * Gap score in [-3, 3]. Never null — suppressed rows are excluded by the query.
     * Returned as Double (JDBC maps REAL → Float but Spring Data interface projection
     * maps to Double safely via widening).
     */
    Double getGapScore();

    /**
     * Demand volume confidence tier. Never null.
     * One of: {@code enough_data | limited_data}
     * ({@code insufficient_data} rows have null gap_score and are excluded).
     */
    String getConfidence();
}
