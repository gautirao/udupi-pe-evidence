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
 * A complaint lodged against a listing by a registered user.
 * Maps to {@code public.listing_complaint} (V49 migration).
 *
 * <p>No JPA relations — listingId, complainantId, and resolvedBy are
 * kept as plain UUIDs to avoid accidental eager loading of parent entities.
 *
 * <p>{@code created_at} is set by the DB default and is declared
 * {@code updatable = false}. {@code updated_at} is written explicitly
 * by the application layer.
 */
@Entity
@Table(name = "listing_complaint", schema = "public")
public class ListingComplaint {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Not a JPA relation — kept as a plain UUID to avoid accidental eager loading. */
    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    /** User who filed the complaint. Not a JPA relation. */
    @Column(name = "complainant_id", nullable = false)
    private UUID complainantId;

    /**
     * Category of the complaint.
     * Valid values: FAKE_LISTING, WRONG_PRICE, UNAVAILABLE, OTHER.
     */
    @Column(name = "complaint_type", nullable = false, length = 30)
    private String complaintType;

    /** Free-text detail provided by the complainant. */
    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /**
     * Review lifecycle state.
     * Valid values: OPEN, UNDER_REVIEW, RESOLVED, DISMISSED.
     */
    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;

    /** ID of the admin who resolved or dismissed the complaint. Not a JPA relation. */
    @Column(name = "resolved_by")
    private UUID resolvedBy;

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

    public UUID getComplainantId() {
        return complainantId;
    }

    public void setComplainantId(UUID complainantId) {
        this.complainantId = complainantId;
    }

    public String getComplaintType() {
        return complaintType;
    }

    public void setComplaintType(String complaintType) {
        this.complaintType = complaintType;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public OffsetDateTime getResolvedAt() {
        return resolvedAt;
    }

    public void setResolvedAt(OffsetDateTime resolvedAt) {
        this.resolvedAt = resolvedAt;
    }

    public UUID getResolvedBy() {
        return resolvedBy;
    }

    public void setResolvedBy(UUID resolvedBy) {
        this.resolvedBy = resolvedBy;
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
