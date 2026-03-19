package com.example.realestate.listing.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ListingStatusHistoryRepository extends JpaRepository<ListingStatusHistory, UUID> {

    /**
     * Returns all status transition records for a listing, most recent first.
     * Leverages the {@code idx_lsh_listing_occurred} index (V43 migration).
     */
    List<ListingStatusHistory> findByListingIdOrderByOccurredAtDesc(UUID listingId);
}
