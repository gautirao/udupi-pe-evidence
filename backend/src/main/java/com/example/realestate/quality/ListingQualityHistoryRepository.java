package com.example.realestate.quality;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data repository for {@link ListingQualityHistory}.
 *
 * <p>The table is append-only — this repository only provides insert (via {@code save})
 * and lookup operations. No update or delete methods are exposed.
 */
@Repository
public interface ListingQualityHistoryRepository extends JpaRepository<ListingQualityHistory, UUID> {

    /**
     * Returns the most-recently computed history row for the given listing, ordered by
     * {@code computed_at DESC}. Used by {@link QualityHistoryPolicy} to determine
     * whether a new computation is materially different from the prior one.
     *
     * @param listingId the listing whose latest history row to fetch
     * @return the most recent row, or empty if no history exists yet
     */
    @Query("SELECT h FROM ListingQualityHistory h "
            + "WHERE h.listingId = :listingId "
            + "ORDER BY h.computedAt DESC "
            + "LIMIT 1")
    Optional<ListingQualityHistory> findTopByListingIdOrderByComputedAtDesc(
            @Param("listingId") UUID listingId);

    /**
     * Returns the total number of history rows for the given listing.
     * Used in integration tests to assert materiality suppression.
     */
    long countByListingId(UUID listingId);

    /**
     * Returns {@code true} when the most-recent history row's breakdown, after removing
     * the {@code computedAt} key, is JSONB-equal to {@code comparableJson}.
     *
     * <p>Comparison is performed at the JSONB level (not string level) so that
     * PostgreSQL's JSONB normalisation (whitespace, key order) does not cause false
     * mismatches. {@code comparableJson} must be a valid JSON string serialisable to
     * JSONB (i.e. the output of {@link QualityScoreService#toComparableJson} or
     * {@link QualityRecomputeService#buildInsufficientBreakdown}).
     *
     * @param listingId      the listing whose latest history row to compare against
     * @param comparableJson the new computation's materiality key (no {@code computedAt})
     * @return {@code true} if the prior row equals the new computation (NOT material),
     *         {@code false} if different or no prior row exists (IS material)
     */
    @Query(nativeQuery = true, value =
            "SELECT EXISTS ( "
            + "  SELECT 1 FROM listing_quality_history "
            + "  WHERE listing_id = :listingId "
            + "  ORDER BY computed_at DESC "
            + "  LIMIT 1 "
            + ") AND ( "
            + "  SELECT (breakdown - 'computedAt') = CAST(:comparableJson AS jsonb) "
            + "  FROM listing_quality_history "
            + "  WHERE listing_id = :listingId "
            + "  ORDER BY computed_at DESC "
            + "  LIMIT 1 "
            + ")")
    boolean isLatestBreakdownEquivalent(
            @Param("listingId") UUID listingId,
            @Param("comparableJson") String comparableJson);
}
