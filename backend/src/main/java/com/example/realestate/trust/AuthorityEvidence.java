package com.example.realestate.trust;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Evidence record proving a broker's authority over a listing.
 * Maps to {@code public.authority_evidence} (V48 migration).
 *
 * <p>No JPA relations — listingId and verifiedBy are kept as plain UUIDs
 * to avoid accidental eager loading of parent entities.
 *
 * <p>{@code created_at} is set by the DB default and is declared
 * {@code updatable = false}. {@code updated_at} is written explicitly
 * by the application layer.
 */
@Entity
@Table(name = "authority_evidence", schema = "public")
public class AuthorityEvidence {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Not a JPA relation — kept as a plain UUID to avoid accidental eager loading. */
    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    /**
     * Kind of authority evidence supplied.
     * Valid values: OWNER_OTP, MANDATE_DOCUMENT, RERA_NUMBER.
     */
    @Column(name = "evidence_type", nullable = false, length = 30)
    private String evidenceType;

    /** Raw evidence payload; may be large (document text, OTP hash, RERA string). */
    @Column(name = "evidence_value", columnDefinition = "TEXT")
    private String evidenceValue;

    @Column(name = "verified_at")
    private OffsetDateTime verifiedAt;

    /** ID of the admin or system actor who verified this evidence. */
    @Column(name = "verified_by")
    private UUID verifiedBy;

    /**
     * Review lifecycle state.
     * Valid values: PENDING, APPROVED, REJECTED, EXPIRED.
     */
    @Column(name = "review_state", nullable = false, length = 20)
    private String reviewState;

    /** Set by DB default on INSERT; never updated by the application. */
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    /** Written explicitly by the application layer on every mutation. */
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    // Getters and setters

    public UUID getId() {
        return id;
    }

    public UUID getListingId() {
        return listingId;
    }

    public void setListingId(UUID listingId) {
        this.listingId = listingId;
    }

    public String getEvidenceType() {
        return evidenceType;
    }

    public void setEvidenceType(String evidenceType) {
        this.evidenceType = evidenceType;
    }

    public String getEvidenceValue() {
        return evidenceValue;
    }

    public void setEvidenceValue(String evidenceValue) {
        this.evidenceValue = evidenceValue;
    }

    public OffsetDateTime getVerifiedAt() {
        return verifiedAt;
    }

    public void setVerifiedAt(OffsetDateTime verifiedAt) {
        this.verifiedAt = verifiedAt;
    }

    public UUID getVerifiedBy() {
        return verifiedBy;
    }

    public void setVerifiedBy(UUID verifiedBy) {
        this.verifiedBy = verifiedBy;
    }

    public String getReviewState() {
        return reviewState;
    }

    public void setReviewState(String reviewState) {
        this.reviewState = reviewState;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
