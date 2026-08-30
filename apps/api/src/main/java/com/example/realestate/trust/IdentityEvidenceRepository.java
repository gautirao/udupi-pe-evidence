package com.example.realestate.trust;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Spring Data repository for {@link IdentityEvidence}.
 *
 * <p>Note: V64 has no UNIQUE constraint on (listing_id, profile_id) — multiple
 * submissions per listing are schema-legal (e.g. re-submission after rejection).
 */
@Repository
public interface IdentityEvidenceRepository extends JpaRepository<IdentityEvidence, UUID> {

    List<IdentityEvidence> findByListingIdAndReviewState(UUID listingId, String reviewState);

    Page<IdentityEvidence> findByReviewState(String reviewState, Pageable pageable);

    List<IdentityEvidence> findAllByListingIdOrderByCreatedAtDesc(UUID listingId);

    @Transactional
    void deleteByListingId(UUID listingId);
}
