package com.example.realestate.listing;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ListingRepository extends JpaRepository<Listing, UUID> {

    /**
     * Acquires a row-level exclusive lock (SELECT ... FOR UPDATE) on the listing row.
     * Used by registerImage to serialize concurrent upload count-check-then-insert
     * within a single transaction, preventing TOCTOU races past the 10-image limit.
     * Must be called inside an active @Transactional context.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT l FROM Listing l WHERE l.id = :id")
    Optional<Listing> findByIdWithLock(@Param("id") UUID id);

    boolean existsByRawPostId(UUID rawPostId);

    boolean existsByDedupeHash(String dedupeHash);

    long countByDedupeHash(String dedupeHash);

    long countByDedupeHashAndIdNot(String dedupeHash, UUID id);

    Optional<Listing> findByListingNumber(Integer listingNumber);

    /**
     * Returns non-archived (active) listings for a given owner, ordered by creation date descending.
     * Excludes listings where archived_at IS NOT NULL so soft-deleted listings disappear from My Listings.
     */
    Page<Listing> findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc(UUID createdBy, Pageable pageable);

    /**
     * Returns non-archived listings for a given owner filtered by status.
     * Used by GET /api/listings/mine?status=... to filter without surfacing archived listings.
     */
    Page<Listing> findByCreatedByAndStatusAndArchivedAtIsNull(UUID createdBy, String status, Pageable pageable);

    /**
     * Counts non-archived LIVE listings for the per-owner listing limit check.
     * Archived listings must NOT count against the owner's limit of 3 active listings.
     */
    long countByCreatedByAndSellerTypeAndStatusAndArchivedAtIsNull(UUID createdBy, String sellerType, String status);

    /**
     * Count non-archived listings grouped by status for a given user.
     * Returns rows of [status (String), count (Long)].
     * Excludes archived listings so they do not appear in the My Listings status counts.
     */
    @Query("SELECT l.status, COUNT(l) FROM Listing l WHERE l.createdBy = :userId AND l.archivedAt IS NULL GROUP BY l.status")
    List<Object[]> countByStatusForUser(@Param("userId") UUID userId);

    @Query(value = "SELECT COUNT(*) FROM public.listing_images WHERE listing_id = :listingId",
            nativeQuery = true)
    long countImagesByListingId(@Param("listingId") UUID listingId);

    @Modifying
    @Query(value = "INSERT INTO public.notifications (user_id, type, title, message, metadata) " +
            "VALUES (:userId, :type, :title, :message, CAST(:metadata AS jsonb))",
            nativeQuery = true)
    void insertNotification(@Param("userId") UUID userId,
                            @Param("type") String type,
                            @Param("title") String title,
                            @Param("message") String message,
                            @Param("metadata") String metadata);

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
              AND status IN ('SCRAPED', 'LIVE')
              AND (CAST(:minPpc AS bigint) IS NULL OR price_per_cent_paise >= :minPpc)
              AND (CAST(:maxPpc AS bigint) IS NULL OR price_per_cent_paise <= :maxPpc)
              AND (CAST(:createdAfter AS timestamptz) IS NULL OR created_at >= :createdAfter)
            ORDER BY created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM public.property_listings
            WHERE latitude BETWEEN :minLat AND :maxLat
              AND longitude BETWEEN :minLng AND :maxLng
              AND is_duplicate = false
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND area_key IS NOT NULL
              AND status IN ('SCRAPED', 'LIVE')
              AND (CAST(:minPpc AS bigint) IS NULL OR price_per_cent_paise >= :minPpc)
              AND (CAST(:maxPpc AS bigint) IS NULL OR price_per_cent_paise <= :maxPpc)
              AND (CAST(:createdAfter AS timestamptz) IS NULL OR created_at >= :createdAfter)
            """,
            nativeQuery = true)
    Page<Listing> findInBoundingBox(
            @Param("minLat") double minLat,
            @Param("minLng") double minLng,
            @Param("maxLat") double maxLat,
            @Param("maxLng") double maxLng,
            @Param("minPpc") Long minPpc,
            @Param("maxPpc") Long maxPpc,
            @Param("createdAfter") OffsetDateTime createdAfter,
            Pageable pageable);

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

    /**
     * Batch version of findOpportunities that accepts multiple area keys.
     * Eliminates N+1 query pattern when fetching opportunities for multiple saved areas.
     * Uses PostgreSQL ANY() operator to filter by multiple areas in a single query.
     *
     * @param areaKeys List of area keys to filter by. If null or empty, returns opportunities across all areas.
     * @param threshold Price threshold (e.g., 0.8 means listings priced below 80% of area median)
     * @param freshDays Only include listings created within this many days (0 = no filter)
     * @param limit Maximum number of results to return
     * @return List of opportunities sorted by undervaluation score DESC, then created_at DESC
     * @deprecated Use {@link #findOpportunitiesByAreaKeys(List, double, int, Pageable)} instead.
     *             This overload will be removed in Wave 3.
     */
    @Deprecated
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
          AND (CAST(:areaKeys AS text[]) IS NULL OR l.area_key = ANY(CAST(:areaKeys AS text[])))
          AND (:freshDays <= 0 OR l.created_at >= NOW() - (CAST(:freshDays AS integer) * INTERVAL '1 day'))
        ORDER BY "undervaluationScore" DESC, l.created_at DESC
        LIMIT :limit
        """, nativeQuery = true)
    List<OpportunityProjection> findOpportunitiesByAreaKeys(
            @Param("areaKeys") List<String> areaKeys,
            @Param("threshold") double threshold,
            @Param("freshDays") int freshDays,
            @Param("limit") int limit);

    /**
     * Paginated version of {@link #findOpportunitiesByAreaKeys(List, double, int, int)}.
     * Offset/limit are driven by the supplied {@link Pageable}; no hardcoded LIMIT.
     * Count query is required by Spring Data for native pagination.
     *
     * @param areaKeys  List of area keys to filter by (null = no area filter, all areas).
     * @param threshold Price threshold (e.g., 0.8 means listings priced below 80% of area median).
     * @param freshDays Only include listings created within this many days (0 = no filter).
     * @param pageable  Page size and offset; sort is fixed to undervaluationScore DESC, createdAt DESC.
     * @return Page of opportunities sorted by undervaluation score DESC, then created_at DESC.
     */
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
          AND (CAST(:areaKeys AS text[]) IS NULL OR l.area_key = ANY(CAST(:areaKeys AS text[])))
          AND (:freshDays <= 0 OR l.created_at >= NOW() - (CAST(:freshDays AS integer) * INTERVAL '1 day'))
        ORDER BY "undervaluationScore" DESC, l.created_at DESC
        """,
        countQuery = """
        SELECT COUNT(*) FROM property_listings l
        JOIN area_stats_latest a ON l.area_key = a.area_key
        WHERE l.is_duplicate = false
          AND l.area_key IS NOT NULL
          AND l.price_per_cent_paise IS NOT NULL
          AND a.median_price_per_cent_paise IS NOT NULL
          AND l.price_per_cent_paise < a.median_price_per_cent_paise * :threshold
          AND (CAST(:areaKeys AS text[]) IS NULL OR l.area_key = ANY(CAST(:areaKeys AS text[])))
          AND (:freshDays <= 0 OR l.created_at >= NOW() - (CAST(:freshDays AS integer) * INTERVAL '1 day'))
        """,
        nativeQuery = true)
    Page<OpportunityProjection> findOpportunitiesByAreaKeys(
            @Param("areaKeys") List<String> areaKeys,
            @Param("threshold") double threshold,
            @Param("freshDays") int freshDays,
            Pageable pageable);

    // ===== Full-text search =====

    @Query(value = """
            SELECT * FROM public.property_listings
            WHERE status IN ('SCRAPED', 'LIVE')
              AND is_duplicate = false
              AND (:q IS NULL OR search_vector @@ websearch_to_tsquery('english', :q))
              AND (:locality IS NULL OR locality = :locality)
              AND (:propertyType IS NULL OR property_type::text = :propertyType)
              AND (:bedrooms IS NULL OR bedrooms = CAST(:bedrooms AS integer))
            ORDER BY
              CASE WHEN :q IS NOT NULL
                   THEN ts_rank(search_vector, websearch_to_tsquery('english', :q))
                   ELSE 0 END DESC,
              created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM public.property_listings
            WHERE status IN ('SCRAPED', 'LIVE')
              AND is_duplicate = false
              AND (:q IS NULL OR search_vector @@ websearch_to_tsquery('english', :q))
              AND (:locality IS NULL OR locality = :locality)
              AND (:propertyType IS NULL OR property_type::text = :propertyType)
              AND (:bedrooms IS NULL OR bedrooms = CAST(:bedrooms AS integer))
            """,
            nativeQuery = true)
    Page<Listing> findBySearch(
            @Param("q") String q,
            @Param("locality") String locality,
            @Param("propertyType") String propertyType,
            @Param("bedrooms") Integer bedrooms,
            Pageable pageable);

    /**
     * Returns LIVE, non-archived, non-duplicate listings whose lat/lon falls within the
     * given bounding box, excluding the given listing ID and filtered by property type.
     * Java-side Haversine refinement is applied after to filter to the true radius.
     */
    @Query(value = """
        SELECT * FROM property_listings
        WHERE status = 'LIVE'
          AND archived_at IS NULL
          AND is_duplicate = false
          AND is_suspected_duplicate = false
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND latitude  BETWEEN :minLat AND :maxLat
          AND longitude BETWEEN :minLon AND :maxLon
          AND property_type = :propertyType
          AND id != :excludeId
        """, nativeQuery = true)
    List<Listing> findLiveListingsInBoundingBox(
            @Param("minLat") double minLat,
            @Param("maxLat") double maxLat,
            @Param("minLon") double minLon,
            @Param("maxLon") double maxLon,
            @Param("propertyType") String propertyType,
            @Param("excludeId") UUID excludeId);

    /**
     * Returns a page of LIVE, non-archived, non-duplicate, geo-coded listings.
     * Used by ProximityDuplicateBatchJob for nightly backfill scan.
     * Paginated to avoid materialising an unbounded result set in heap.
     */
    @Query(value = """
            SELECT * FROM property_listings
            WHERE status = 'LIVE'
              AND archived_at IS NULL
              AND is_duplicate = false
              AND is_suspected_duplicate = false
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
            ORDER BY created_at ASC
            """,
            countQuery = """
            SELECT COUNT(*) FROM property_listings
            WHERE status = 'LIVE'
              AND archived_at IS NULL
              AND is_duplicate = false
              AND is_suspected_duplicate = false
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
            """,
            nativeQuery = true)
    Page<Listing> findAllLiveWithCoordinates(Pageable pageable);

    // ===== Locality normalizer queries =====

    @Query(value = """
        SELECT locality, COUNT(*) AS listing_count
        FROM public.property_listings
        WHERE locality IS NOT NULL AND locality <> ''
        GROUP BY locality
        ORDER BY COUNT(*) DESC
        """, nativeQuery = true)
    List<Object[]> findLocalitiesWithCounts();

    @Query(value = "SELECT COUNT(*) FROM public.property_listings WHERE locality = :locality",
            nativeQuery = true)
    long countListingsByLocality(@Param("locality") String locality);

    @Modifying
    @Query(value = "UPDATE public.property_listings SET locality = :toLocality WHERE locality = :fromLocality",
            nativeQuery = true)
    int bulkUpdateLocality(@Param("fromLocality") String fromLocality,
                           @Param("toLocality") String toLocality);
}
