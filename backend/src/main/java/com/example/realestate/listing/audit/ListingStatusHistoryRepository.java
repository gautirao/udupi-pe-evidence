package com.example.realestate.listing.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface ListingStatusHistoryRepository extends JpaRepository<ListingStatusHistory, UUID> {

    /**
     * Returns all status transition records for a listing, most recent first.
     * Leverages the {@code idx_lsh_listing_occurred} index (V43 migration).
     */
    List<ListingStatusHistory> findByListingIdOrderByOccurredAtDesc(UUID listingId);

    /**
     * Checks whether an admin has already acted on the current submission by approving
     * (PENDING_REVIEW -> LIVE) or rejecting (PENDING_REVIEW -> REJECTED) after the
     * listing's {@code reviewSubmittedAt} timestamp.
     * <p>
     * Used by the withdraw-from-review guard to prevent a race where the dealer
     * withdraws after the admin has already taken terminal action.
     */
    @Query("""
            SELECT CASE WHEN COUNT(h) > 0 THEN true ELSE false END
            FROM ListingStatusHistory h
            WHERE h.listingId = :listingId
              AND h.fromStatus = 'PENDING_REVIEW'
              AND h.toStatus IN ('LIVE', 'REJECTED')
              AND h.occurredAt > :after
            """)
    boolean existsAdminActionAfter(@Param("listingId") UUID listingId,
                                   @Param("after") Instant after);
}
