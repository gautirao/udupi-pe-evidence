package com.example.realestate.intelligence;

/**
 * Spring Data projection interface for the native aggregate query in
 * {@link AreaIntelligenceSnapshotRepository}.
 *
 * <p>One row per {@code (city_slug, area_key)} GROUP BY bucket. Raw values (median price,
 * dominant property type) are returned as-is from SQL; k-anonymity suppression is applied
 * in {@link AreaIntelligenceSnapshotService} using {@link AggregationConstants#K_ANON_MIN}
 * so that the suppression rule is unit-testable independently of the database.
 *
 * <p>All numeric getters use {@link Long} / {@link Double} to accommodate JDBC mapping
 * of SQL aggregate functions. Nullable getters may return {@code null} when the
 * underlying aggregate produces NULL (e.g. no priced rows → median is NULL).
 */
public interface AreaIntelligenceSnapshotRow {

    /** City slug (e.g. {@code "udupi"}). Never null — part of GROUP BY. */
    String getCitySlug();

    /** Area key (e.g. {@code "IN|KA|Udupi|Manipal"}). Never null — part of GROUP BY. */
    String getAreaKey();

    /**
     * Human-readable area label from {@code MAX(pl.area_label)}.
     * May be null if no label has been set on any listing in this area.
     */
    String getAreaLabel();

    /**
     * Count of LIVE-90d non-archived non-duplicate listings for this area.
     * This is the active_listing_count that drives confidence classification.
     * Never null (COUNT always returns a value).
     */
    Long getActiveListingCount();

    /**
     * Count of listings created within the last {@link AggregationConstants#FRESH_WINDOW_DAYS} days.
     * Subset of activeListingCount. Never null.
     */
    Long getFreshListingCount();

    /**
     * Raw median price in paise ({@code PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_paise)}).
     * NULL when no listings in this area have a non-null {@code price_paise}.
     * Subject to k-anonymity suppression in the service layer.
     *
     * <p><b>Type rationale:</b> PostgreSQL's {@code PERCENTILE_CONT} over a {@code BIGINT} column
     * returns {@code DOUBLE PRECISION} (float8), not {@code BIGINT}. Spring Data interface
     * projections do NOT auto-coerce {@code Double} → {@code Long}, so this getter must be
     * {@code Double} to match the JDBC type that the driver delivers. The service layer converts
     * to {@code Long} via {@code Math.round()} before writing to the entity's {@code BIGINT} column.
     */
    Double getMedianPricePaise();

    /**
     * Raw dominant property type ({@code MODE() WITHIN GROUP (ORDER BY pl.property_type)}).
     * NULL when no listings exist. Subject to k-anonymity suppression in the service layer.
     */
    String getDominantPropertyType();

    /**
     * Count of listings with a non-null {@code quality_score}.
     * Used to determine whether {@code avgQuality} is meaningful.
     */
    Long getScoredCount();

    /**
     * Average quality score ({@code AVG(pl.quality_score)}) over non-null scored rows.
     * NULL when {@code scoredCount} = 0 — signals backfill-incomplete state.
     * MUST NOT be coerced to 0.
     */
    Double getAvgQuality();
}
