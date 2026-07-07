package com.example.realestate.savedlistings;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A user's saved (bookmarked) property listing.
 *
 * <p>{@code userId} is a soft reference to Supabase auth.users (no FK — see V100
 * migration comment; matches {@code SavedArea}). {@code listingId} is backed by a
 * hard FK to {@code property_listings(id) ON DELETE CASCADE} at the DB level.
 */
@Entity
@Table(name = "saved_listings", schema = "public")
public class SavedListing {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    // ===== Getters / Setters =====

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }

    public UUID getListingId() { return listingId; }
    public void setListingId(UUID listingId) { this.listingId = listingId; }

    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}
