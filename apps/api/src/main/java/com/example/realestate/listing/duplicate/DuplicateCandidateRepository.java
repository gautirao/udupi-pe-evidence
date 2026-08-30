package com.example.realestate.listing.duplicate;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface DuplicateCandidateRepository extends JpaRepository<DuplicateCandidate, UUID> {

    /**
     * Returns paginated duplicate candidate pairs filtered by status,
     * ordered by similarity score descending (highest confidence first).
     */
    Page<DuplicateCandidate> findByStatusOrderBySimilarityScoreDesc(
            DuplicateCandidateStatus status, Pageable pageable);

    /**
     * Returns all paginated duplicate candidate pairs across all statuses,
     * ordered by status ascending (CONFIRMED, DISMISSED, PENDING) then similarity score
     * descending. Used by the admin review queue to keep reviewed rows visible.
     */
    Page<DuplicateCandidate> findAllByOrderByStatusAscSimilarityScoreDesc(Pageable pageable);

    /**
     * Idempotency check used by the detection service before inserting a new pair.
     *
     * <p><b>Canonical ordering contract:</b> the detection service MUST pass the lower
     * UUID as {@code listingIdA} and the higher as {@code listingIdB}. The {@code @PrePersist}
     * hook on {@link DuplicateCandidate} enforces this on insert; this query relies on it for
     * the pre-insert existence check.
     *
     * <p>The DB {@code UNIQUE(listing_id_a, listing_id_b)} constraint is the authoritative
     * guard; this check avoids a round-trip constraint-violation exception on duplicate inserts.
     */
    boolean existsByListingIdAAndListingIdB(UUID listingIdA, UUID listingIdB);

    /**
     * Returns all candidate pairs that involve the given listing on either side.
     *
     * <p>Use this when confirming or dismissing all pairs for a specific listing, or when
     * building the admin review detail view for a listing.
     *
     * @param id the listing UUID to look up — matched against both {@code listing_id_a}
     *           and {@code listing_id_b}
     */
    @Query("SELECT d FROM DuplicateCandidate d WHERE d.listingIdA = :id OR d.listingIdB = :id")
    List<DuplicateCandidate> findAllByListingId(@Param("id") UUID id);

    /**
     * Counts candidate pairs in the given status that involve the specified listing
     * on either side. Used by the detection service to enforce a per-listing cap on
     * pending pairs before inserting new candidates.
     *
     * <p>Example: {@code repo.countByListingIdAndStatus(id, DuplicateCandidateStatus.PENDING)}
     *
     * @param id     the listing UUID to check
     * @param status the status to filter by (typically {@link DuplicateCandidateStatus#PENDING})
     * @return count of pairs in the given status referencing this listing
     */
    @Query("SELECT COUNT(d) FROM DuplicateCandidate d " +
           "WHERE (d.listingIdA = :id OR d.listingIdB = :id) AND d.status = :status")
    long countByListingIdAndStatus(@Param("id") UUID id,
                                   @Param("status") DuplicateCandidateStatus status);
}
