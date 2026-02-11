package com.example.realestate.listing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ListingRepository extends JpaRepository<Listing, UUID> {

    boolean existsByRawPostId(UUID rawPostId);

    boolean existsByDedupeHash(String dedupeHash);

    long countByDedupeHash(String dedupeHash);

    List<Listing> findByCreatedByOrderByCreatedAtDesc(UUID createdBy);

    @Query(value = "SELECT role::text FROM public.user_roles WHERE user_id = :userId LIMIT 1",
            nativeQuery = true)
    Optional<String> findUserRole(@Param("userId") UUID userId);

    @Query(value = """
            SELECT * FROM public.property_listings
            WHERE latitude BETWEEN :minLat AND :maxLat
              AND longitude BETWEEN :minLng AND :maxLng
              AND is_duplicate = false
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND area_key IS NOT NULL
              AND (CAST(:minPpc AS bigint) IS NULL OR price_per_cent_paise >= :minPpc)
              AND (CAST(:maxPpc AS bigint) IS NULL OR price_per_cent_paise <= :maxPpc)
              AND (CAST(:createdAfter AS timestamptz) IS NULL OR created_at >= :createdAfter)
            ORDER BY created_at DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<Listing> findInBoundingBox(
            @Param("minLat") double minLat,
            @Param("minLng") double minLng,
            @Param("maxLat") double maxLat,
            @Param("maxLng") double maxLng,
            @Param("minPpc") Long minPpc,
            @Param("maxPpc") Long maxPpc,
            @Param("createdAfter") OffsetDateTime createdAfter,
            @Param("limit") int limit);

    /**
     * Projection interface for opportunity finder query results.
     */
    interface OpportunityProjection {
        UUID getId();
        String getPropertyType();
        String getLocality();
        String getAreaLabel();
        Long getPricePaise();
        Long getPricePerCentPaise();
        BigDecimal getAreaCent();
        String getAreaKey();
        Double getLatitude();
        Double getLongitude();
        OffsetDateTime getCreatedAt();
        Long getMedianPricePerCentPaise();
        Double getUndervaluationScore();
    }

    @Query(value = """
        SELECT
            l.id,
            l.property_type AS "propertyType",
            l.locality,
            l.area_label AS "areaLabel",
            l.price_paise AS "pricePaise",
            l.price_per_cent_paise AS "pricePerCentPaise",
            l.area_cent AS "areaCent",
            l.area_key AS "areaKey",
            l.latitude,
            l.longitude,
            l.created_at AS "createdAt",
            a.median_price_per_cent_paise AS "medianPricePerCentPaise",
            CAST((a.median_price_per_cent_paise - l.price_per_cent_paise) AS DOUBLE PRECISION)
                / a.median_price_per_cent_paise AS "undervaluationScore"
        FROM property_listings l
        JOIN area_stats_latest a ON l.area_key = a.area_key
        WHERE l.is_duplicate = false
          AND l.area_key IS NOT NULL
          AND l.price_per_cent_paise IS NOT NULL
          AND a.median_price_per_cent_paise IS NOT NULL
          AND l.price_per_cent_paise < a.median_price_per_cent_paise * :threshold
          AND (:areaKey IS NULL OR l.area_key = :areaKey)
          AND (:freshDays <= 0 OR l.created_at >= NOW() - (:freshDays * INTERVAL '1 day'))
        ORDER BY "undervaluationScore" DESC, l.created_at DESC
        LIMIT :limit
        """, nativeQuery = true)
    List<OpportunityProjection> findOpportunities(
            @Param("areaKey") String areaKey,
            @Param("threshold") double threshold,
            @Param("freshDays") int freshDays,
            @Param("limit") int limit);
}
