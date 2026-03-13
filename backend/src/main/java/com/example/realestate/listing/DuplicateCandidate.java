package com.example.realestate.listing;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Represents a candidate pair of property listings that the proximity-based
 * duplicate-detection service has identified as potentially identical.
 *
 * <p>Status lifecycle: {@link DuplicateCandidateStatus#PENDING} →
 * {@link DuplicateCandidateStatus#CONFIRMED} | {@link DuplicateCandidateStatus#DISMISSED}.
 * Pairs are inserted by the detection service and reviewed by admins via the
 * admin duplicate-review API.
 *
 * <p><b>Canonical ordering:</b> {@code listingIdA} is always the UUID that compares
 * lower than {@code listingIdB} (i.e., {@code listingIdA.compareTo(listingIdB) <= 0}).
 * This invariant is enforced in {@link #prePersist()} to guarantee that the
 * {@code UNIQUE(listing_id_a, listing_id_b)} DB constraint correctly deduplicates pairs
 * regardless of the order in which the detection service passes them.
 */
@Entity
@Table(name = "duplicate_candidates")
public class DuplicateCandidate {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** ID of the first listing in the pair (lower UUID — enforced by {@link #prePersist()}). */
    @Column(name = "listing_id_a", nullable = false)
    private UUID listingIdA;

    /** ID of the second listing in the pair (higher UUID — enforced by {@link #prePersist()}). */
    @Column(name = "listing_id_b", nullable = false)
    private UUID listingIdB;

    /**
     * Composite similarity score in [0.00, 1.00].
     * Computed by the detection service from price, area, and proximity signals.
     */
    @Column(name = "similarity_score", nullable = false, precision = 3, scale = 2)
    private BigDecimal similarityScore;

    /** Haversine distance between the two listings' coordinates, in metres. */
    @Column(name = "distance_meters", nullable = false, precision = 8, scale = 2)
    private BigDecimal distanceMeters;

    /**
     * Review status. Defaults to {@link DuplicateCandidateStatus#PENDING} on persist.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, columnDefinition = "VARCHAR(20)")
    private DuplicateCandidateStatus status;

    /** UUID of the admin user who reviewed this pair. Null until reviewed. */
    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    /** Timestamp of admin review action. Null until reviewed. */
    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    /** Timestamp of record creation. Set on persist; immutable thereafter. */
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /**
     * JPA lifecycle callback. Enforces two invariants before first persist:
     * <ol>
     *   <li>Sets {@code createdAt} if not already set by the caller.</li>
     *   <li>Defaults {@code status} to {@link DuplicateCandidateStatus#PENDING}.</li>
     *   <li>Ensures canonical ordering: swaps {@code listingIdA}/{@code listingIdB} if
     *       {@code listingIdA.compareTo(listingIdB) > 0}, so the lower UUID is always in
     *       the {@code listing_id_a} column. This guarantees the DB UNIQUE constraint
     *       deduplicates pairs regardless of insertion order.</li>
     * </ol>
     */
    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (status == null) {
            status = DuplicateCandidateStatus.PENDING;
        }
        // Canonical ordering: listingIdA must always be the lower UUID.
        if (listingIdA != null && listingIdB != null
                && listingIdA.compareTo(listingIdB) > 0) {
            UUID tmp = listingIdA;
            listingIdA = listingIdB;
            listingIdB = tmp;
        }
    }

    // --- Getters and setters ---

    public UUID getId() {
        return id;
    }

    public UUID getListingIdA() {
        return listingIdA;
    }

    public void setListingIdA(UUID listingIdA) {
        this.listingIdA = listingIdA;
    }

    public UUID getListingIdB() {
        return listingIdB;
    }

    public void setListingIdB(UUID listingIdB) {
        this.listingIdB = listingIdB;
    }

    public BigDecimal getSimilarityScore() {
        return similarityScore;
    }

    public void setSimilarityScore(BigDecimal similarityScore) {
        this.similarityScore = similarityScore;
    }

    public BigDecimal getDistanceMeters() {
        return distanceMeters;
    }

    public void setDistanceMeters(BigDecimal distanceMeters) {
        this.distanceMeters = distanceMeters;
    }

    public DuplicateCandidateStatus getStatus() {
        return status;
    }

    public void setStatus(DuplicateCandidateStatus status) {
        this.status = status;
    }

    public UUID getReviewedBy() {
        return reviewedBy;
    }

    public void setReviewedBy(UUID reviewedBy) {
        this.reviewedBy = reviewedBy;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }

    public void setReviewedAt(Instant reviewedAt) {
        this.reviewedAt = reviewedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    /** Package-private: {@code createdAt} is set once by {@link #prePersist()}. External callers should not mutate it. */
    void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
