package com.example.realestate.listing.image;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ListingImageRepository extends JpaRepository<ListingImage, UUID> {

    List<ListingImage> findByListingIdOrderByPositionAsc(UUID listingId);

    List<ListingImage> findByListingIdInOrderByListingIdAscPositionAsc(Collection<UUID> listingIds);

    /**
     * Returns images for a listing ordered by (position ASC, id ASC) with a URL filter.
     *
     * <p>The {@code listing_images} table has no unique constraint on (listing_id, position),
     * so ordering by position alone is non-deterministic when two rows share a position.
     * The id tiebreaker guarantees a stable order for the detail-page gallery (#758).
     * Rows with a NULL url are filtered out defensively even though the column is NOT NULL
     * at the JPA + DB level.
     */
    @Query("SELECT i FROM ListingImage i "
            + "WHERE i.listingId = :listingId AND i.url IS NOT NULL "
            + "ORDER BY i.position ASC, i.id ASC")
    List<ListingImage> findGalleryByListingId(@Param("listingId") UUID listingId);

    long countByListingId(UUID listingId);

    Optional<ListingImage> findByIdAndListingId(UUID id, UUID listingId);
}
