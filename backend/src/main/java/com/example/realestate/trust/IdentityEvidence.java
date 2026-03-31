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
 * Evidence record for admin-reviewed identity verification.
 * Maps to {@code public.identity_evidence} (V64 migration).
 *
 * <p>No JPA relations — profileId, listingId, and reviewedBy are kept as plain UUIDs
 * to avoid accidental eager loading of parent entities.
 *
 * <p>{@code created_at} is set by the DB default and is declared
 * {@code updatable = false}. {@code updated_at} is written explicitly
 * by the application layer.
 */
@Entity
@Table(name = "identity_evidence", schema = "public")
public class IdentityEvidence {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "profile_id", nullable = false)
    private UUID profileId;

    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    @Column(name = "legal_name", nullable = false, length = 200)
    private String legalName;

    @Column(name = "phone_number", nullable = false, length = 100)
    private String phoneNumber;

    /**
     * Kind of identity document supplied.
     * Valid values: AADHAAR, PAN, VOTER_ID, PASSPORT, DRIVING_LICENSE.
     */
    @Column(name = "document_type", nullable = false, length = 30)
    private String documentType;

    @Column(name = "document_url", nullable = false, columnDefinition = "TEXT")
    private String documentUrl;

    /**
     * Review lifecycle state.
     * Valid values: PENDING, APPROVED, REJECTED.
     */
    @Column(name = "review_state", nullable = false, length = 20)
    private String reviewState;

    @Column(name = "rejection_reason", columnDefinition = "TEXT")
    private String rejectionReason;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "reviewed_at")
    private OffsetDateTime reviewedAt;

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

    public UUID getProfileId() {
        return profileId;
    }

    public void setProfileId(UUID profileId) {
        this.profileId = profileId;
    }

    public UUID getListingId() {
        return listingId;
    }

    public void setListingId(UUID listingId) {
        this.listingId = listingId;
    }

    public String getLegalName() {
        return legalName;
    }

    public void setLegalName(String legalName) {
        this.legalName = legalName;
    }

    public String getPhoneNumber() {
        return phoneNumber;
    }

    public void setPhoneNumber(String phoneNumber) {
        this.phoneNumber = phoneNumber;
    }

    public String getDocumentType() {
        return documentType;
    }

    public void setDocumentType(String documentType) {
        this.documentType = documentType;
    }

    public String getDocumentUrl() {
        return documentUrl;
    }

    public void setDocumentUrl(String documentUrl) {
        this.documentUrl = documentUrl;
    }

    public String getReviewState() {
        return reviewState;
    }

    public void setReviewState(String reviewState) {
        this.reviewState = reviewState;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
    }

    public UUID getReviewedBy() {
        return reviewedBy;
    }

    public void setReviewedBy(UUID reviewedBy) {
        this.reviewedBy = reviewedBy;
    }

    public OffsetDateTime getReviewedAt() {
        return reviewedAt;
    }

    public void setReviewedAt(OffsetDateTime reviewedAt) {
        this.reviewedAt = reviewedAt;
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
