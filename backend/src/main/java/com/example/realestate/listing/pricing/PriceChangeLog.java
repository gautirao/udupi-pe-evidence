package com.example.realestate.listing.pricing;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Immutable record of a price change for a non-draft listing.
 * Inserted transactionally with the listing update; never updated or hard-deleted.
 * The FK to property_listings is ON DELETE RESTRICT — listing soft-delete (archived_at)
 * does not trigger FK; only a hard delete would, which is not permitted.
 */
@Entity
@Table(name = "price_change_log", schema = "public")
public class PriceChangeLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Not a JPA relation — kept as a plain UUID to avoid accidental eager loading. */
    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    /** Price before the change, stored in paise (1 rupee = 100 paise). */
    @Column(name = "old_price_paise")
    private Long oldPricePaise;

    /** Price after the change, stored in paise (1 rupee = 100 paise). */
    @Column(name = "new_price_paise")
    private Long newPricePaise;

    @Column(name = "changed_at", nullable = false)
    private OffsetDateTime changedAt;

    @PrePersist
    void prePersist() {
        if (changedAt == null) {
            changedAt = OffsetDateTime.now();
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

    public Long getOldPricePaise() {
        return oldPricePaise;
    }

    public void setOldPricePaise(Long oldPricePaise) {
        this.oldPricePaise = oldPricePaise;
    }

    public Long getNewPricePaise() {
        return newPricePaise;
    }

    public void setNewPricePaise(Long newPricePaise) {
        this.newPricePaise = newPricePaise;
    }

    public OffsetDateTime getChangedAt() {
        return changedAt;
    }

    public void setChangedAt(OffsetDateTime changedAt) {
        this.changedAt = changedAt;
    }
}
