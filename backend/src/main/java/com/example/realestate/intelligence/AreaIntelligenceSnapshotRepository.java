package com.example.realestate.intelligence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * Repository for {@link AreaIntelligenceSnapshot}.
 *
 * <p>Provides:
 * <ol>
 *   <li>A single native aggregate query ({@link #findRawAggregates}) that computes
 *       per-area statistics in ONE GROUP BY pass — no N+1.
 *   <li>Read helpers for city-scoped and full snapshot retrieval.
 * </ol>
 *
 * <p>Upsert semantics: {@code saveAll} uses JPA merge on the composite key, which
 * maps to an INSERT ... ON CONFLICT UPDATE at the JDBC level when Hibernate detects
 * an existing row. {@code computedAt} is set explicitly by the service before each
 * save so every upsert refreshes the timestamp.
 */
public interface AreaIntelligenceSnapshotRepository
        extends JpaRepository<AreaIntelligenceSnapshot, AreaIntelligenceSnapshotId> {

    /**
     * Aggregate LIVE-90d listings grouped by (city_slug, area_key), joining through
     * the {@code areas} and {@code cities} tables to obtain {@code city_slug}.
     *
     * <p><b>90-day window placement (intentional):</b> the 90-day window is in the
     * WHERE clause (same as {@link AreaIntelligenceRepository#findLive90dAggregates}).
     * This means every row in the result set is a LIVE-90d listing, so
     * {@code COUNT(*)} directly equals {@code active_listing_count} and matches the
     * admin validator's {@code live90dCount} for the same area — satisfying the
     * qa-fast HIGH-priority cross-check. A FILTER-only approach would need
     * {@code COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days')} and
     * risks a slight mismatch if the outer WHERE differs.
     *
     * <p><b>fresh_listing_count</b>: uses FILTER within the already-90d-filtered set
     * so it is always a subset of active_listing_count.
     *
     * <p><b>INNER JOINs</b>: listings with an unmapped area_key (no matching row in
     * {@code areas}) are silently excluded — they produce no bucket rather than an error.
     *
     * <p><b>PERCENTILE_CONT / MODE() WITHIN GROUP</b>: PG13+ ordered-set aggregates,
     * supported by the postgis:15 test image. MODE returns the lexicographically lowest
     * value on ties (deterministic).
     *
     * <p><b>avgQuality</b>: SQL AVG ignores NULLs natively; returns NULL (not 0) when
     * no scored rows exist in the bucket — which is the required backfill-incomplete state.
     *
     * @param freshWindowDays number of days for the fresh-listing sub-window;
     *                        pass {@link AggregationConstants#FRESH_WINDOW_DAYS}
     * @return one row per (city_slug, area_key) bucket; empty list when no LIVE-90d listings
     */
    @Query(value = """
            SELECT
                c.slug                                                   AS "citySlug",
                pl.area_key                                              AS "areaKey",
                MAX(pl.area_label)                                       AS "areaLabel",
                COUNT(*)                                                 AS "activeListingCount",
                COUNT(*) FILTER (
                    WHERE pl.created_at >= NOW() - (:freshWindowDays * INTERVAL '1 day')
                )                                                        AS "freshListingCount",
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pl.price_paise)
                                                                         AS "medianPricePaise",
                MODE() WITHIN GROUP (ORDER BY pl.property_type)          AS "dominantPropertyType",
                COUNT(pl.quality_score)                                  AS "scoredCount",
                AVG(pl.quality_score)                                    AS "avgQuality"
            FROM property_listings pl
            INNER JOIN areas a  ON a.area_key = pl.area_key
            INNER JOIN cities c ON c.id       = a.city_id
            WHERE pl.status        = 'LIVE'
              AND pl.archived_at   IS NULL
              AND pl.is_duplicate  = false
              AND pl.created_at   >= NOW() - INTERVAL '90 days'
              AND pl.area_key      IS NOT NULL
            GROUP BY c.slug, pl.area_key
            ORDER BY COUNT(*) DESC
            """,
            nativeQuery = true)
    List<AreaIntelligenceSnapshotRow> findRawAggregates(@Param("freshWindowDays") int freshWindowDays);

    /**
     * Return all snapshot rows for a given city slug.
     *
     * @param citySlug e.g. {@code "udupi"}
     * @return list of snapshots for that city, ordered by active listing count descending
     */
    List<AreaIntelligenceSnapshot> findByCitySlugOrderByActiveListingCountDesc(String citySlug);
}
