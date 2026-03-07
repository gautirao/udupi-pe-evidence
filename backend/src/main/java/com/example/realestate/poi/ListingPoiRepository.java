package com.example.realestate.poi;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Repository for {@link ListingPoi} entities.
 */
public interface ListingPoiRepository extends JpaRepository<ListingPoi, UUID> {

    /**
     * Cache guard: returns {@code true} if a fresh Overpass fetch already exists
     * for the given listing within the last 14 days.
     *
     * @param listingId the listing to check
     * @param source    source discriminator (use {@code "overpass"})
     * @param after     cutoff timestamp — rows with createdAt after this count as fresh
     * @return true if at least one fresh row exists
     */
    boolean existsByListingIdAndSourceAndCreatedAtAfter(UUID listingId, String source, OffsetDateTime after);
}
