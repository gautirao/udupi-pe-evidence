package com.example.realestate.intelligence;

/**
 * Spring Data projection interface for the per-area demand total aggregate query in
 * {@link AreaDemandSignalRepository#findDemandTotalsByLatestWindow30()}.
 *
 * <p>Returns one row per {@code (city_slug, area_key)} from the latest 30-day
 * {@code period_start} run. {@code demandEventTotal} is
 * {@code SUM(search_count + panel_open_count + lead_intent_count)} across all buckets
 * for that area — suppressed (gap_score IS NULL) and non-suppressed buckets are both
 * included in the total so the k-anonymity check in
 * {@link AdminIntelligenceService} can be applied at the area level.
 *
 * <p>No PII: all fields are aggregate counts or coarse categorical labels.
 */
public interface AreaDemandSummaryRow {

    /** City slug (e.g. {@code "udupi"}). Never null. */
    String getCitySlug();

    /** Area key (e.g. {@code "IN|KA|Udupi|Manipal"}). Never null. */
    String getAreaKey();

    /**
     * Sum of {@code search_count + panel_open_count + lead_intent_count} across all
     * buckets for this area in the latest 30-day window.
     * Never null (SUM of NOT NULL columns across at least one row).
     */
    Long getDemandEventTotal();
}
