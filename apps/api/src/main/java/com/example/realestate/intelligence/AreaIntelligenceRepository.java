package com.example.realestate.intelligence;

import com.example.realestate.listing.core.Listing;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * Read-only aggregate repository for the admin intelligence validator.
 *
 * <p>Spring Data permits a second repository over the same {@link Listing} entity/table.
 * {@link com.example.realestate.listing.ListingRepository} is INTENTIONALLY not imported
 * or extended here — this repo owns its own aggregate query independently.
 *
 * <p>LIVE predicate (re-expressed from ListingRepository reference):
 * status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
 * Plus 90-day window: created_at >= NOW() - INTERVAL '90 days'
 * Plus area_key IS NOT NULL guard to exclude unmapped rows from GROUP BY.
 *
 * <p>avgQuality is AVG(quality_score) computed only over rows WHERE quality_score IS NOT NULL.
 * SQL AVG ignores NULLs natively, so this yields NULL (not 0) when no scored rows exist —
 * which is the required backfill-incomplete state.
 */
public interface AreaIntelligenceRepository extends JpaRepository<Listing, UUID> {

    /**
     * Aggregate LIVE-90d listings grouped by area_key.
     *
     * <p>Excludes rows where area_key IS NULL to avoid a NULL group key.
     * Returns one {@link AreaIntelligenceRow} per distinct area_key.
     * Ordered by live90dCount DESC for a stable default ordering.
     *
     * <p><b>LIVE-predicate choice (intentional):</b> the 3 conditions
     * {@code status='LIVE' AND archived_at IS NULL AND is_duplicate=false} (plus the 90-day
     * window and {@code area_key IS NOT NULL}) intentionally mirror the <b>AREA-AGGREGATE</b>
     * family — see {@code AreaSummaryService} and {@code DiscoverListingPredicateBuilder} — so the
     * validator's supply counts stay CONSISTENT with the public area-discovery pages it validates.
     * The <b>GEO-MARKER</b> family ({@code ListingRepository}, map plotting) additionally filters
     * {@code is_suspected_duplicate=false AND latitude IS NOT NULL}; that is a marker-only concern
     * and is deliberately NOT applied here.
     */
    @Query(value = """
            SELECT
                pl.area_key                          AS "areaKey",
                MAX(pl.area_label)                   AS "areaLabel",
                COUNT(*)                             AS "live90dCount",
                COUNT(pl.quality_score)              AS "scoredCount",
                AVG(pl.quality_score)                AS "avgQuality"
            FROM property_listings pl
            WHERE pl.status = 'LIVE'
              AND pl.archived_at IS NULL
              AND pl.is_duplicate = false
              AND pl.created_at >= NOW() - INTERVAL '90 days'
              AND pl.area_key IS NOT NULL
            GROUP BY pl.area_key
            ORDER BY COUNT(*) DESC
            """,
            nativeQuery = true)
    List<AreaIntelligenceRow> findLive90dAggregates();

    /**
     * Same as {@link #findLive90dAggregates()} but filtered by district segment of area_key.
     *
     * <p>area_key format: {@code IN|KA|{district}|{locality}}. The district is the 3rd
     * pipe-delimited segment (index 2), matched via {@code SPLIT_PART(area_key, '|', 3)}.
     *
     * <p>Uses the same intentional AREA-AGGREGATE LIVE predicate as
     * {@link #findLive90dAggregates()} (is_suspected_duplicate deliberately omitted — see that
     * method's javadoc).
     *
     * @param district the district string extracted from the city filter param (e.g. "Udupi")
     */
    @Query(value = """
            SELECT
                pl.area_key                          AS "areaKey",
                MAX(pl.area_label)                   AS "areaLabel",
                COUNT(*)                             AS "live90dCount",
                COUNT(pl.quality_score)              AS "scoredCount",
                AVG(pl.quality_score)                AS "avgQuality"
            FROM property_listings pl
            WHERE pl.status = 'LIVE'
              AND pl.archived_at IS NULL
              AND pl.is_duplicate = false
              AND pl.created_at >= NOW() - INTERVAL '90 days'
              AND pl.area_key IS NOT NULL
              AND SPLIT_PART(pl.area_key, '|', 3) = :district
            GROUP BY pl.area_key
            ORDER BY COUNT(*) DESC
            """,
            nativeQuery = true)
    List<AreaIntelligenceRow> findLive90dAggregatesByDistrict(@Param("district") String district);
}
