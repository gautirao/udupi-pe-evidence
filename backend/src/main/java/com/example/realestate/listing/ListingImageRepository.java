package com.example.realestate.listing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ListingImageRepository extends JpaRepository<ListingImage, UUID> {

    List<ListingImage> findByListingIdOrderByPositionAsc(UUID listingId);

    long countByListingId(UUID listingId);

    Optional<ListingImage> findByIdAndListingId(UUID id, UUID listingId);
}
