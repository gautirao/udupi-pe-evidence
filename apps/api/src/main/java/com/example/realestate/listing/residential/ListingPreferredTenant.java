package com.example.realestate.listing.residential;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One row per (listing, preferred-tenant code) pair. Table created additively
 * by V103 ({@code listing_preferred_tenants}) — mirrors the V102
 * {@code listing_amenities} / {@code listing_location_features} shape (#1626).
 */
@Entity
@Table(name = "listing_preferred_tenants", schema = "public")
public class ListingPreferredTenant {

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
