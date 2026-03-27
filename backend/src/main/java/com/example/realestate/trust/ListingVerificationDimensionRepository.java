package com.example.realestate.trust;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data repository for {@link ListingVerificationDimension}.
 *
 * <p>{@code deleteByListingId} is annotated {@code @Transactional} because
 * Spring Data derived-delete methods issue a SELECT then DELETE and require
 * a transaction to be present; callers in the service layer will inherit it,
 * but the annotation here ensures correctness even if called in isolation.
 */
@Repository
public interface ListingVerificationDimensionRepository
        extends JpaRepository<ListingVerificationDimension, UUID> {

    List<ListingVerificationDimension> findAllByListingId(UUID listingId);

    Optional<ListingVerificationDimension> findByListingIdAndDimensionType(
            UUID listingId, String dimensionType);

    boolean existsByListingIdAndDimensionType(UUID listingId, String dimensionType);

    List<ListingVerificationDimension> findAllByListingIdInAndBadgeState(List<UUID> listingIds, String badgeState);

    long countByListingIdAndBadgeState(UUID listingId, String badgeState);

    List<ListingVerificationDimension> findAllByBadgeStateOrderByUpdatedAtAsc(String badgeState);

    @Transactional
    void deleteByListingId(UUID listingId);

    /**
     * Bulk-expires EARNED badges for the given dimension type whose {@code granted_at}
     * is strictly before {@code cutoff}. Sets {@code badge_state = 'EXPIRED'},
     * {@code expires_at = now}, and {@code updated_at = now}.
     *
     * <p>Idempotent: rows already in EXPIRED state are unaffected by the {@code badge_state = 'EARNED'}
     * predicate.
     *
     * @param dimensionType the dimension category to expire (e.g. "LOCATION", "PHOTOS", "AUTHORITY")
     * @param cutoff        rows with {@code granted_at} strictly before this timestamp are expired
     * @param now           timestamp written to {@code expires_at} and {@code updated_at}
     * @return number of rows updated
     */
    @Modifying
    @Transactional
    @Query("""
            UPDATE ListingVerificationDimension d
            SET d.badgeState = 'EXPIRED',
                d.expiresAt  = :now,
                d.updatedAt  = :now
            WHERE d.dimensionType = :dimensionType
              AND d.badgeState    = 'EARNED'
              AND d.grantedAt     < :cutoff
            """)
    int expireEarnedBadgesOlderThan(
            @Param("dimensionType") String dimensionType,
            @Param("cutoff") OffsetDateTime cutoff,
            @Param("now") OffsetDateTime now);
}
