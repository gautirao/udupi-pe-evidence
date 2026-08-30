package com.example.realestate.listing.pricing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PriceChangeLogRepository extends JpaRepository<PriceChangeLog, UUID> {

    /**
     * Returns all price change records for a listing sorted oldest-first.
     * Used to build the public price history response.
     */
    List<PriceChangeLog> findByListingIdOrderByChangedAtAsc(UUID listingId);
}
