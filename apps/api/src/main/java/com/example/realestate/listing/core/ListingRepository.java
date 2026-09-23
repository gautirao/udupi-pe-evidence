package com.example.realestate.listing.core;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

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

    /**
     * #2519: dedupe existence/count lookups are scoped to ACTIVE rows only — archivedAt IS NULL
     * AND status &lt;&gt; 'REJECTED'. An ARCHIVED (soft-deleted) or REJECTED (broker can edit and
     * resubmit) row is inactive/historical and must never block a legitimate repost of the same
     * hash from reaching LIVE. See {@link ListingStatus} for the full lifecycle.
     */
    @Query("SELECT CASE WHEN COUNT(l) > 0 THEN true ELSE false END FROM Listing l "
            + "WHERE l.dedupeHash = :dedupeHash AND l.archivedAt IS NULL AND l.status <> 'REJECTED'")
    boolean existsActiveByDedupeHash(@Param("dedupeHash") String dedupeHash);

    @Query("SELECT COUNT(l) FROM Listing l "
            + "WHERE l.dedupeHash = :dedupeHash AND l.archivedAt IS NULL AND l.status <> 'REJECTED'")
    long countActiveByDedupeHash(@Param("dedupeHash") String dedupeHash);

    @Query("SELECT COUNT(l) FROM Listing l "
            + "WHERE l.dedupeHash = :dedupeHash AND l.id <> :id "
            + "AND l.archivedAt IS NULL AND l.status <> 'REJECTED'")
    long countActiveByDedupeHashAndIdNot(@Param("dedupeHash") String dedupeHash, @Param("id") UUID id);

    Optional<Listing> findByListingNumber(Integer listingNumber);

    /**
     * Returns non-archived (active) listings for a given owner, ordered by creation date descending.
     * Excludes listings where archived_at IS NOT NULL so soft-deleted listings disappear from My Listings.
     */
    Page<Listing> findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc(UUID createdBy, Pageable pageable);

    /**
     * Returns non-archived listings for a given owner filtered by status.
     * Used by GET /api/listings/mine?status=... to filter without surfacing archived listings.
     * NOTE: not applicable to status=ARCHIVED — archiving always sets archived_at, so this
     * predicate can never match an ARCHIVED listing. Use {@link #findByCreatedByAndStatus} instead.
     */
    Page<Listing> findByCreatedByAndStatusAndArchivedAtIsNull(UUID createdBy, String status, Pageable pageable);

    /**
     * Returns listings for a given owner filtered by status, with no archived_at constraint.
     * Used by GET /api/listings/mine?status=ARCHIVED so the broker's "Archived" tab can surface
     * listings that were archived (status=ARCHIVED implies archived_at IS NOT NULL).
     */
    Page<Listing> findByCreatedByAndStatus(UUID createdBy, String status, Pageable pageable);

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

    // Buyer-facing queries sort by trust_tier ASC (A highest → D lowest), then ranking_score DESC.
    // SCRAPED listings default to tier D / ranking_score 0 and correctly sort below verified LIVE
    // listings. The trust pipeline only writes to broker-created (LIVE) listings, so no guard is needed.

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
            ORDER BY trust_tier ASC, ranking_score DESC, created_at DESC, id DESC
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
            ORDER BY trust_tier ASC, ranking_score DESC,
              CASE WHEN :q IS NOT NULL
                   THEN ts_rank(search_vector, websearch_to_tsquery('english', :q))
                   ELSE 0 END DESC,
              created_at DESC, id DESC
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

    // ===== Polygon search (draw-on-map) =====

    /**
     * Returns LIVE, non-archived, non-duplicate listings whose coordinates fall within
     * the given polygon. Uses PostGIS ST_Contains for precise point-in-polygon testing.
     *
     * @param polygonWkt WKT representation of the polygon, e.g.
     *                   {@code POLYGON((74.79 13.35, 74.80 13.36, 74.80 13.34, 74.79 13.35))}
     *                   Note: WKT uses (longitude latitude) order.
     * @param pageable   pagination parameters
     * @return page of listings within the polygon
     */
    @Query(value = """
            SELECT * FROM public.property_listings
            WHERE status = 'LIVE'
              AND archived_at IS NULL
              AND is_duplicate = false
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND ST_Contains(
                    ST_GeomFromText(:polygonWkt, 4326),
                    ST_SetSRID(ST_Point(longitude, latitude), 4326)
              )
            ORDER BY trust_tier ASC, ranking_score DESC, created_at DESC, id DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM public.property_listings
            WHERE status = 'LIVE'
              AND archived_at IS NULL
              AND is_duplicate = false
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND ST_Contains(
                    ST_GeomFromText(:polygonWkt, 4326),
                    ST_SetSRID(ST_Point(longitude, latitude), 4326)
              )
            """,
            nativeQuery = true)
    Page<Listing> findLiveListingsWithinPolygon(
            @Param("polygonWkt") String polygonWkt,
            Pageable pageable);

    /**
     * #1935: same predicate as {@link #findLiveListingsWithinPolygon} plus an INNER JOIN through
     * {@code areas} -> {@code cities} requiring {@code c.is_active = true} — identical fail-closed
     * pattern to {@link #findByIdWithActiveCity} / {@link #findAllLiveListingsWithActiveCity}. An
     * orphan LIVE listing inside the polygon (area_key not resolvable to a canonical area) is
     * excluded too, so an inactive city's listings are absent from polygon search results exactly
     * as if they never existed.
     */
    @Query(value = """
            SELECT pl.* FROM public.property_listings pl
            INNER JOIN areas a ON a.area_key = pl.area_key
            INNER JOIN cities c ON c.id = a.city_id
            WHERE pl.status = 'LIVE'
              AND pl.archived_at IS NULL
              AND pl.is_duplicate = false
              AND c.is_active = true
              AND pl.latitude IS NOT NULL
              AND pl.longitude IS NOT NULL
              AND ST_Contains(
                    ST_GeomFromText(:polygonWkt, 4326),
                    ST_SetSRID(ST_Point(pl.longitude, pl.latitude), 4326)
              )
            ORDER BY pl.trust_tier ASC, pl.ranking_score DESC, pl.created_at DESC, pl.id DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM public.property_listings pl
            INNER JOIN areas a ON a.area_key = pl.area_key
            INNER JOIN cities c ON c.id = a.city_id
            WHERE pl.status = 'LIVE'
              AND pl.archived_at IS NULL
              AND pl.is_duplicate = false
              AND c.is_active = true
              AND pl.latitude IS NOT NULL
              AND pl.longitude IS NOT NULL
              AND ST_Contains(
                    ST_GeomFromText(:polygonWkt, 4326),
                    ST_SetSRID(ST_Point(pl.longitude, pl.latitude), 4326)
              )
            """,
            nativeQuery = true)
    Page<Listing> findLiveListingsWithinPolygonWithActiveCity(
            @Param("polygonWkt") String polygonWkt,
            Pageable pageable);

    // ===== Discovery feed =====

    /**
     * Returns all LIVE, non-archived, non-duplicate listings ordered by creation date descending.
     * Used by the anonymous discovery endpoint (GET /api/public/listings/discovery).
     */
    @Query(value = """
            SELECT * FROM property_listings
            WHERE status = 'LIVE'
              AND archived_at IS NULL
              AND is_duplicate = false
            ORDER BY trust_tier ASC, ranking_score DESC, created_at DESC, id DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM property_listings
            WHERE status = 'LIVE'
              AND archived_at IS NULL
              AND is_duplicate = false
            """,
            nativeQuery = true)
    Page<Listing> findAllLiveListings(Pageable pageable);

    /**
     * #1935: id-scoped lookup of a LIVE listing whose area belongs to an ACTIVE city.
     *
     * <p>INNER JOIN (not LEFT JOIN) through {@code areas} -> {@code cities} — an orphan LIVE
     * listing whose {@code area_key} does not resolve to a canonical {@code areas} row is
     * intentionally excluded too (fail-closed by construction, not a special case). This makes an
     * inactive city's listing return empty here exactly like an unknown listing id does, so
     * {@code PublicListingController.getById} cannot distinguish "belongs to an inactive city"
     * from "does not exist" — both hit the same 404 branch. Status/archived/duplicate filtering
     * is unchanged: this query narrows by id + active-city only; the caller still applies its
     * existing {@code status == LIVE} check.
     */
    @Query(nativeQuery = true,
           value = "SELECT pl.* FROM property_listings pl "
                   + "INNER JOIN areas a ON a.area_key = pl.area_key "
                   + "INNER JOIN cities c ON c.id = a.city_id "
                   + "WHERE pl.id = :id AND c.is_active = true")
    Optional<Listing> findByIdWithActiveCity(@Param("id") UUID id);

    /**
     * #1935: same predicate as {@link #findAllLiveListings(Pageable)} plus an INNER JOIN through
     * {@code areas} -> {@code cities} requiring {@code c.is_active = true}. An orphan LIVE listing
     * (area_key not resolvable to a canonical area) is excluded here too — same fail-closed
     * rationale as {@link #findByIdWithActiveCity}. Used by the anonymous discovery feed
     * (GET /api/public/listings/discovery) so an inactive city's listings are indistinguishable
     * from listings that simply do not exist.
     */
    @Query(value = """
            SELECT pl.* FROM property_listings pl
            INNER JOIN areas a ON a.area_key = pl.area_key
            INNER JOIN cities c ON c.id = a.city_id
            WHERE pl.status = 'LIVE'
              AND pl.archived_at IS NULL
              AND pl.is_duplicate = false
              AND c.is_active = true
            ORDER BY pl.trust_tier ASC, pl.ranking_score DESC, pl.created_at DESC, pl.id DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM property_listings pl
            INNER JOIN areas a ON a.area_key = pl.area_key
            INNER JOIN cities c ON c.id = a.city_id
            WHERE pl.status = 'LIVE'
              AND pl.archived_at IS NULL
              AND pl.is_duplicate = false
              AND c.is_active = true
            """,
            nativeQuery = true)
    Page<Listing> findAllLiveListingsWithActiveCity(Pageable pageable);

    // ===== Freshness / reconfirmation (#1794 Phase 1) =====

    /**
     * Returns LIVE listings that have not been confirmed within the given threshold.
     *
     * <p>A NULL {@code last_confirmed_at} counts as stale (never confirmed since the column
     * was introduced — honest absence, not "recently confirmed"). The boundary is strictly
     * {@code <} the threshold: a listing confirmed exactly at the threshold is NOT stale.
     *
     * <p>Sorted oldest-confirmed-first (NULLS FIRST) so the most overdue listings surface first
     * for admin review. Phase 1 read-only visibility only — no automation acts on this query.
     *
     * @param threshold cutoff timestamp (typically {@code now() - N days}); listings confirmed
     *                  before this are stale
     * @param pageable  pagination parameters
     * @return page of stale LIVE listings, oldest-confirmed (or never-confirmed) first
     */
    @Query(value = """
            SELECT * FROM property_listings
            WHERE status = 'LIVE'
              AND (last_confirmed_at IS NULL OR last_confirmed_at < :threshold)
            ORDER BY last_confirmed_at ASC NULLS FIRST
            """,
            countQuery = """
            SELECT COUNT(*) FROM property_listings
            WHERE status = 'LIVE'
              AND (last_confirmed_at IS NULL OR last_confirmed_at < :threshold)
            """,
            nativeQuery = true)
    Page<Listing> findLiveListingsNotConfirmedSince(
            @Param("threshold") OffsetDateTime threshold,
            Pageable pageable);

    // ===== Admin pending-review queue (#2242) =====

    /**
     * Returns listings awaiting admin review (status = PENDING_REVIEW), newest submission first.
     *
     * <p>The status filter is hardcoded here rather than accepted as a parameter — this backs
     * {@code GET /api/admin/listings/pending}, which is intentionally a single-status queue, not
     * a general lifecycle-state browser (see {@link com.example.realestate.listing.api.AdminListingController#pending}).
     *
     * @param pageable pagination parameters (sort is fixed to created_at DESC; see the controller
     *                 for why any caller-supplied Sort is stripped before this is called)
     * @return page of PENDING_REVIEW listings, most recently submitted first
     */
    @Query(value = """
            SELECT * FROM property_listings
            WHERE status = 'PENDING_REVIEW'
            ORDER BY created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM property_listings
            WHERE status = 'PENDING_REVIEW'
            """,
            nativeQuery = true)
    Page<Listing> findPendingReviewListings(Pageable pageable);

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

    // ─── Boundary geometry (PostGIS native queries — no Hibernate-Spatial dep) ───

    /**
     * Persists a GeoJSON polygon as a PostGIS geography column.
     * Must be called after JPA save() within the same transaction.
     */
    @Modifying
    @Transactional
    @Query(nativeQuery = true,
           value = "UPDATE property_listings SET boundary = ST_GeomFromGeoJSON(:geoJson)::geography WHERE id = :id")
    void updateBoundary(@Param("id") UUID id, @Param("geoJson") String geoJson);

    /**
     * Reads the boundary as GeoJSON string (ST_AsGeoJSON output).
     * Returns empty Optional when boundary is NULL.
     */
    @Query(nativeQuery = true,
           value = "SELECT ST_AsGeoJSON(boundary)::text FROM property_listings WHERE id = :id")
    Optional<String> findBoundaryGeoJson(@Param("id") UUID id);

    /**
     * Reads the saved boundary area in square metres via ST_Area on the geography column.
     *
     * <p>{@code boundary} is a PostGIS {@code geography} column (see {@link #updateBoundary}),
     * so {@code ST_Area(boundary)} returns m² directly — NO {@code ::geometry} cast (which would
     * return degrees²). Returns empty Optional when boundary is NULL. Used by the read path to
     * derive an approximate acreage, distinct from the broker-declared landArea (#1367).
     */
    @Query(nativeQuery = true,
           value = "SELECT ST_Area(boundary) FROM property_listings WHERE id = :id")
    Optional<Double> findBoundaryAreaSqm(@Param("id") UUID id);

    /**
     * Returns true if the GeoJSON polygon is geometrically valid (ST_IsValid).
     * Requires PostGIS extension. Called by PolygonBoundaryValidator after structural checks pass.
     */
    @Query(nativeQuery = true,
           value = "SELECT ST_IsValid(ST_GeomFromGeoJSON(:geoJson)::geometry)")
    boolean isBoundaryGeometryValid(@Param("geoJson") String geoJson);

    /**
     * Returns the area of the polygon in square metres (ST_Area on geography type).
     * Used to enforce the 100 km² area cap.
     */
    @Query(nativeQuery = true,
           value = "SELECT ST_Area(ST_GeomFromGeoJSON(:geoJson)::geography)")
    double computeBoundaryAreaSqm(@Param("geoJson") String geoJson);

    // ===== Quality score (#1521) =====

    /**
     * Direct UPDATE of only the three quality columns on a single listing row.
     * Called by {@code QualityRecomputeService} inside its own REQUIRES_NEW transaction.
     *
     * <p>Using a targeted @Modifying UPDATE instead of going through a listing-save path
     * prevents reentrancy: the recompute write does NOT trigger another afterCommit hook.
     *
     * @param id                 the listing to update
     * @param qualityScore       overall score in [0,100]; null for insufficient-data
     * @param qualityBreakdown   canonical JSON or insufficient-data diagnostic JSON
     * @param qualityComputedAt  timestamp of this computation (never null)
     */
    @Modifying
    @Transactional
    @Query(nativeQuery = true,
           value = "UPDATE property_listings "
                   + "SET quality_score = CAST(:qualityScore AS smallint), "
                   + "    quality_breakdown = CAST(:qualityBreakdown AS jsonb), "
                   + "    quality_computed_at = CAST(:qualityComputedAt AS timestamptz) "
                   + "WHERE id = :id")
    void updateQualityColumns(
            @Param("id") UUID id,
            @Param("qualityScore") Integer qualityScore,
            @Param("qualityBreakdown") String qualityBreakdown,
            @Param("qualityComputedAt") java.time.Instant qualityComputedAt);

    /**
     * Returns the area-median price per cent in paise for the given area key,
     * from {@code area_stats_latest} (populated by the hourly rollup job).
     *
     * <p>The {@code property_type = 'all'} row holds the cross-type aggregate median,
     * which is the correct comparator for PRICE_SANITY (we compare listing price-per-cent
     * against all listings in the area, not just the same property type).
     *
     * <p>Returns null (Optional.empty) when no stats exist for the area — the caller
     * then supplies null to QualityScoreInputs, which excludes PRICE_SANITY from the
     * denominator (INDETERMINATE path).
     *
     * @param areaKey the listing's area key
     * @return the area median price per cent in paise, or empty if unavailable
     */
    @Query(nativeQuery = true,
           value = "SELECT median_price_per_cent_paise "
                   + "FROM area_stats_latest "
                   + "WHERE area_key = :areaKey AND property_type = 'all' "
                   + "LIMIT 1")
    Optional<Long> findAreaMedianPricePerCentPaise(@Param("areaKey") String areaKey);

    // ===== Broker quality summary (#1523) =====

    /**
     * Single-pass aggregate over non-archived listings for a given broker.
     *
     * <p>Returns one row with the following scalar columns (all null-safe):
     * <ol>
     *   <li>{@code total_count}        — COUNT(*) over all non-archived listings</li>
     *   <li>{@code computed_count}     — COUNT(quality_score) skips NULLs; equals listings with a score</li>
     *   <li>{@code avg_score}          — AVG(quality_score) skips NULLs; NULL when no scores exist</li>
     *   <li>{@code active_count}       — listings in LIVE or PENDING_REVIEW</li>
     *   <li>{@code needs_fixes_count}  — quality_score IS NOT NULL AND quality_score &lt; 60</li>
     *   <li>{@code buyer_ready_count}  — quality_score IS NOT NULL AND quality_score &gt;= 80</li>
     *   <li>{@code missing_loc_count}  — quality_breakdown has a LOCATION component with score &lt; 75</li>
     *   <li>{@code incomplete_count}   — status='DRAFT' OR quality_breakdown has KEY_FIELDS/PHOTOS/DESCRIPTION
     *                                    component with score &lt; 50</li>
     * </ol>
     *
     * <p>The jsonpath predicates for {@code missing_loc_count} and {@code incomplete_count} are guarded
     * with {@code quality_breakdown IS NOT NULL AND jsonb_typeof(quality_breakdown->'components') = 'array'}
     * so they are safe against NULL, non-object, or missing-components rows.
     *
     * <p>Uses {@code jsonb_path_exists(col, path::jsonpath)} instead of the {@code col @? path} operator
     * so that Spring Data JPA's query parser does not misinterpret the bare {@code ?} in {@code @?} as a
     * JDBC positional parameter (which would conflict with the named parameters and throw
     * "Mixing of ? parameters and other forms like ?1 is not supported"). The two forms are semantically
     * identical: {@code @?} is defined in Postgres as {@code jsonb_path_exists}.
     *
     * <p>Ownership is enforced at SQL level: {@code created_by = :userId}.
     *
     * @param userId  the broker's UUID (from JWT — never client-supplied)
     * @return exactly one Object[] row; never null; all elements may be null when there are no listings
     */
    @Query(nativeQuery = true,
           value = """
                SELECT
                    COUNT(*)                                                       AS total_count,
                    COUNT(quality_score)                                           AS computed_count,
                    AVG(quality_score::numeric)                                    AS avg_score,
                    COUNT(*) FILTER (WHERE status IN ('LIVE','PENDING_REVIEW'))    AS active_count,
                    COUNT(*) FILTER (
                        WHERE quality_score IS NOT NULL
                          AND quality_score < :needsFixesThreshold)                AS needs_fixes_count,
                    COUNT(*) FILTER (
                        WHERE quality_score IS NOT NULL
                          AND quality_score >= :buyerReadyThreshold)               AS buyer_ready_count,
                    COUNT(*) FILTER (
                        WHERE quality_breakdown IS NOT NULL
                          AND jsonb_typeof(quality_breakdown->'components') = 'array'
                          AND jsonb_path_exists(quality_breakdown, ('$.components[*] ? (@.type == "LOCATION" && @.score < ' || :missingLocationThreshold || ')')::jsonpath)
                    )                                                              AS missing_loc_count,
                    COUNT(*) FILTER (
                        WHERE status = 'DRAFT'
                           OR (
                               quality_breakdown IS NOT NULL
                               AND jsonb_typeof(quality_breakdown->'components') = 'array'
                               AND jsonb_path_exists(quality_breakdown, ('$.components[*] ? ((@.type == "KEY_FIELDS" || @.type == "PHOTOS" || @.type == "DESCRIPTION") && @.score < ' || :incompleteThreshold || ')')::jsonpath)
                           )
                    )                                                              AS incomplete_count
                FROM property_listings
                WHERE created_by = :userId
                  AND archived_at IS NULL
                """)
    List<Object[]> findQualitySummaryForUser(
            @Param("userId") UUID userId,
            @Param("needsFixesThreshold") int needsFixesThreshold,
            @Param("buyerReadyThreshold") int buyerReadyThreshold,
            @Param("missingLocationThreshold") int missingLocationThreshold,
            @Param("incompleteThreshold") int incompleteThreshold);

    /**
     * Keyset-paginated query returning LIVE listing IDs for the quality backfill.
     *
     * <p>The predicate mirrors {@link #findAllLiveListings}: status='LIVE',
     * archived_at IS NULL, is_duplicate=false. Keyset paging (id > lastId) avoids
     * offset-based slowdowns on large tables.
     *
     * @param lastId   the last UUID processed in the previous batch (use
     *                 {@code "00000000-0000-0000-0000-000000000000"} for the first page)
     * @param batchSize maximum rows to return
     * @return listing IDs in ascending UUID order
     */
    @Query(nativeQuery = true,
           value = "SELECT id FROM property_listings "
                   + "WHERE status = 'LIVE' "
                   + "  AND archived_at IS NULL "
                   + "  AND is_duplicate = false "
                   + "  AND id > CAST(:lastId AS uuid) "
                   + "ORDER BY id ASC "
                   + "LIMIT :batchSize")
    List<UUID> findLiveListingIdsAfter(
            @Param("lastId") String lastId,
            @Param("batchSize") int batchSize);

    // ===== Broker area-insights (#1530) — ADD-ONLY, BROKER-SCOPED, LIVE-ONLY =====
    // IDOR contract: every query MUST filter created_by = :brokerId (JWT-derived, never client-supplied).
    // Scraped exclusion (AC7): status='LIVE' AND raw_post_id IS NULL — no status IN ('SCRAPED','LIVE').

    /**
     * Counts the broker's own LIVE, non-archived, non-duplicate, non-scraped listings in
     * the given area.
     *
     * <p>Predicate per [idor_enforcement.predicates].liveListingsInArea:
     * {@code created_by=:brokerId AND status='LIVE' AND area_key=:areaKey
     * AND raw_post_id IS NULL AND archived_at IS NULL AND is_duplicate=false}
     *
     * @param brokerId JWT-resolved broker UUID — never client-supplied
     * @param areaKey  area to scope the count to
     * @return count of qualifying LIVE listings; 0 when none
     */
    @Query(nativeQuery = true,
           value = "SELECT COUNT(*) FROM property_listings "
                   + "WHERE created_by    = CAST(:brokerId AS uuid) "
                   + "  AND status        = 'LIVE' "
                   + "  AND area_key      = :areaKey "
                   + "  AND raw_post_id   IS NULL "
                   + "  AND archived_at   IS NULL "
                   + "  AND is_duplicate  = false")
    int countBrokerLiveListingsInArea(
            @Param("brokerId") UUID brokerId,
            @Param("areaKey") String areaKey);

    /**
     * Counts the broker's own LIVE area listings where quality_score IS NOT NULL AND below threshold.
     *
     * <p>Predicate per [idor_enforcement.predicates].listingsNeedingAttention:
     * same as liveListingsInArea PLUS {@code quality_score IS NOT NULL AND quality_score < :needsAttentionMax}.
     * NULL quality_score = unscored; excluded (NOT counted as needing attention).
     *
     * @param brokerId          JWT-resolved broker UUID — never client-supplied
     * @param areaKey           area to scope the count to
     * @param needsAttentionMax quality score threshold (exclusive upper bound); pass
     *                          {@link com.example.realestate.intelligence.BrokerAreaInsightsService#QUALITY_NEEDS_ATTENTION_MAX}
     * @return count of qualifying listings; 0 when none
     */
    @Query(nativeQuery = true,
           value = "SELECT COUNT(*) FROM property_listings "
                   + "WHERE created_by    = CAST(:brokerId AS uuid) "
                   + "  AND status        = 'LIVE' "
                   + "  AND area_key      = :areaKey "
                   + "  AND raw_post_id   IS NULL "
                   + "  AND archived_at   IS NULL "
                   + "  AND is_duplicate  = false "
                   + "  AND quality_score IS NOT NULL "
                   + "  AND quality_score < :needsAttentionMax")
    int countBrokerListingsNeedingAttention(
            @Param("brokerId") UUID brokerId,
            @Param("areaKey") String areaKey,
            @Param("needsAttentionMax") int needsAttentionMax);

    /**
     * Counts distinct qualifying area_demand_signal rows for the given area with
     * {@code confidence != 'insufficient_data'}.
     *
     * <p>Used to derive {@code opportunitiesToAct}: qualifying signals MINUS the broker's
     * own capturing LIVE listings (computed in the service). This query is area-scoped only —
     * no broker identity — consistent with the SHARED demand-signal model.
     *
     * @param areaKey area to scope the signal count to
     * @return count of qualifying demand signals; 0 when none
     */
    @Query(nativeQuery = true,
           value = "SELECT COUNT(DISTINCT (area_key, property_type, listing_purpose, budget_band)) "
                   + "FROM area_demand_signal "
                   + "WHERE area_key   = :areaKey "
                   + "  AND confidence != 'insufficient_data'")
    int countQualifyingDemandSignalsForArea(@Param("areaKey") String areaKey);
}
