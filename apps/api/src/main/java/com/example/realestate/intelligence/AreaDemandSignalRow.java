package com.example.realestate.intelligence;

/**
 * Spring Data projection interface for the native aggregate rollup query in
 * {@link AreaDemandSignalRepository}.
 *
 * <p>One row per {@code (city_slug, area_key, property_type, listing_purpose, budget_band)}
 * GROUP BY bucket. Raw aggregate counts (search, panel, lead, listing) are returned
 * as-is from SQL; k-anonymity suppression, z-score computation, classification,
 * and gap_score clamping are all applied in {@link AreaDemandSignalService} so that
 * the logic is unit-testable independently of the database.
 *
 * <p>No PII is present: all fields are aggregate counts or coarse categorical labels.
 * session_id and filters_jsonb are explicitly NOT selected by the rollup query.
 */
public interface AreaDemandSignalRow {

    /** City slug (e.g. {@code "udupi"}). Resolved via INNER JOIN areas->cities; never null. */
    String getCitySlug();

    /** Area key (e.g. {@code "IN|KA|Udupi|Manipal"}). Never null — part of GROUP BY. */
    String getAreaKey();

    /** Property type token (e.g. {@code "residential_apartment"}). Never null. */
    String getPropertyType();

    /** Listing purpose: {@code "sale"} or {@code "rent"}. Never null. */
    String getListingPurpose();

    /**
     * Budget band label from the 7 canonical values.
     * For demand: {@code COALESCE(de.price_band, 'UNSPECIFIED')}.
     * For supply: mapped from {@code pl.price_paise} via the locked CASE expression.
     * Never null — part of GROUP BY.
     */
    String getBudgetBand();

    /**
     * Count of FILTER_APPLY events in this bucket within the rolling window.
     * Never null (COALESCE to 0 in the FULL OUTER JOIN).
     */
    Long getSearchCount();

    /**
     * Count of PANEL_OPEN events in this bucket within the rolling window.
     * Never null (COALESCE to 0).
     */
    Long getPanelOpenCount();

    /**
     * Count of LEAD_INTENT events in this bucket within the rolling window.
     * Never null (COALESCE to 0).
     */
    Long getLeadIntentCount();

    /**
     * Count of LIVE visible matching supply listings for this bucket.
     * Uses the exact area-aggregate LIVE predicate.
     * Never null (COALESCE to 0).
     */
    Long getListingCount();
}
