package com.example.realestate.listing.audit;

import com.example.realestate.listing.workflow.ActorType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnTransformer;

import java.time.Instant;
import java.util.UUID;

/**
 * Immutable audit record of a listing status transition.
 * Maps to {@code public.listing_status_history} (V43 migration).
 *
 * <p>Each row captures who changed a listing's status, what the old and new
 * statuses were, and any reason/note associated with the transition.
 *
 * <p>The FK to property_listings is ON DELETE RESTRICT — a listing cannot be
 * hard-deleted while history rows exist.
 */
@Entity
@Table(name = "listing_status_history", schema = "public")
public class ListingStatusHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Not a JPA relation — kept as a plain UUID to avoid accidental eager loading. */
    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    /** NULL on first insert (initial state has no prior status). */
    @Column(name = "from_status", columnDefinition = "public.listing_status")
    @ColumnTransformer(write = "?::public.listing_status")
    private String fromStatus;

    @Column(name = "to_status", nullable = false, columnDefinition = "public.listing_status")
    @ColumnTransformer(write = "?::public.listing_status")
    private String toStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "actor_type", nullable = false, length = 20)
    private ActorType actorType;

    /** NULL when actor_type = SYSTEM. */
    @Column(name = "actor_id")
    private UUID actorId;

    @Column(name = "reason_code", length = 100)
    private String reasonCode;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    /** Nullable — tracks submission count at time of action. */
    @Column(name = "actioned_submission_count")
    private Integer actionedSubmissionCount;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @PrePersist
    void prePersist() {
        if (occurredAt == null) {
            occurredAt = Instant.now();
        }
    }

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

    public String getFromStatus() {
        return fromStatus;
    }

    public void setFromStatus(String fromStatus) {
        this.fromStatus = fromStatus;
    }

    public String getToStatus() {
        return toStatus;
    }

    public void setToStatus(String toStatus) {
        this.toStatus = toStatus;
    }

    public ActorType getActorType() {
        return actorType;
    }

    public void setActorType(ActorType actorType) {
        this.actorType = actorType;
    }

    public UUID getActorId() {
        return actorId;
    }

    public void setActorId(UUID actorId) {
        this.actorId = actorId;
    }

    public String getReasonCode() {
        return reasonCode;
    }

    public void setReasonCode(String reasonCode) {
        this.reasonCode = reasonCode;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Integer getActionedSubmissionCount() {
        return actionedSubmissionCount;
    }

    public void setActionedSubmissionCount(Integer actionedSubmissionCount) {
        this.actionedSubmissionCount = actionedSubmissionCount;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public void setOccurredAt(Instant occurredAt) {
        this.occurredAt = occurredAt;
    }
}
