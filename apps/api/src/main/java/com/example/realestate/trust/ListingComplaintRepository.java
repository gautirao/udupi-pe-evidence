package com.example.realestate.trust;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data repository for {@link ListingComplaint}.
 */
@Repository
public interface ListingComplaintRepository extends JpaRepository<ListingComplaint, UUID> {

    List<ListingComplaint> findAllByListingIdOrderByCreatedAtDesc(UUID listingId);

    List<ListingComplaint> findAllByComplainantIdOrderByCreatedAtDesc(UUID complainantId);

    boolean existsByListingIdAndComplainantId(UUID listingId, UUID complainantId);

    Optional<ListingComplaint> findByListingIdAndComplainantId(UUID listingId, UUID complainantId);
}
