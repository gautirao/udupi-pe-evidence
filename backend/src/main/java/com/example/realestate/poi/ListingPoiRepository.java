package com.example.realestate.poi;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface ListingPoiRepository extends JpaRepository<ListingPoi, UUID> {

    List<ListingPoi> findByListingId(UUID listingId);

    List<ListingPoi> findByListingIdAndApproved(UUID listingId, boolean approved);

    List<ListingPoi> findByListingIdAndCategory(UUID listingId, String category);

    boolean existsByListingIdAndOsmId(UUID listingId, String osmId);

    /** Cache guard: returns true if any Overpass rows exist younger than the cutoff. */
    boolean existsByListingIdAndSourceAndCreatedAtAfter(UUID listingId, String source, OffsetDateTime cutoff);
}
