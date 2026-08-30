package com.example.realestate.listing.agricultural;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One row per (listing, crop code) pair. Table created empty by V102
 * ({@code listing_agri_crops}); this is the first JPA write path onto it (#2044).
 *
 * <p>Mirrors {@link com.example.realestate.listing.residential.ListingLocationFeature}
 * (same shape, same write/read pattern) — see that class for the precedent this was
 * copied from.
 */
@Entity
@Table(name = "listing_agri_crops", schema = "public")
public class ListingAgriCrop {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    @Column(name = "code", nullable = false)
    private String code;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getListingId() { return listingId; }
    public void setListingId(UUID listingId) { this.listingId = listingId; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}
