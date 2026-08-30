package com.example.realestate.trust;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Spring Data repository for {@link AuthorityEvidence}.
 *
 * <p>Note: V48 has no UNIQUE constraint on (listing_id, evidence_type) — multiple
 * submissions of the same type per listing are schema-legal (e.g. re-submission after
 * rejection). {@code findAllByListingIdAndEvidenceType} therefore returns a List, not
 * an Optional, to avoid {@code IncorrectResultSizeDataAccessException} at runtime.
 */
@Repository
public interface AuthorityEvidenceRepository extends JpaRepository<AuthorityEvidence, UUID> {

    List<AuthorityEvidence> findAllByListingId(UUID listingId);

    List<AuthorityEvidence> findAllByListingIdOrderByCreatedAtDesc(UUID listingId);

    List<AuthorityEvidence> findAllByListingIdAndEvidenceType(UUID listingId, String evidenceType);

    List<AuthorityEvidence> findAllByListingIdAndReviewState(UUID listingId, String reviewState);

    @Transactional
    void deleteByListingId(UUID listingId);
}
