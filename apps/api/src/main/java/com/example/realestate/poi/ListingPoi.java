package com.example.realestate.poi;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * JPA entity for the {@code listing_pois} table.
 * <p>
 * Stores nearby points of interest (POIs) for a property listing,
 * sourced from Overpass API (OpenStreetMap) or entered manually.
 * <p>
 * Category is stored as a plain {@code varchar(64)} string holding
 * the {@link PoiCategory} enum name — no JPA enum mapping needed.
 */
@Entity
@Table(name = "listing_pois", schema = "public")
public class ListingPoi {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    @Column(name = "name", nullable = false)
    private String name;

    /** Stores {@link PoiCategory} name as a plain string (e.g. "HOSPITAL"). */
    @Column(name = "category", nullable = false, length = 64)
    private String category;

    @Column(name = "latitude")
    private Double latitude;

    @Column(name = "longitude")
    private Double longitude;

    @Column(name = "distance_meters")
    private Integer distanceMeters;

    @Column(name = "source", nullable = false, length = 16)
    private String source;

    @Column(name = "osm_id", length = 32)
    private String osmId;

    @Column(name = "approved", nullable = false)
    private Boolean approved = false;

    @Column(name = "pinned", nullable = false)
    private Boolean pinned = false;

    @Column(name = "approved_by")
    private UUID approvedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    // ===== Lifecycle =====

    @PrePersist
    void prePersist() {
        OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    // ===== Getters and setters =====

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getListingId() { return listingId; }
    public void setListingId(UUID listingId) { this.listingId = listingId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }

    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }

    public Integer getDistanceMeters() { return distanceMeters; }
    public void setDistanceMeters(Integer distanceMeters) { this.distanceMeters = distanceMeters; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public String getOsmId() { return osmId; }
    public void setOsmId(String osmId) { this.osmId = osmId; }

    public Boolean getApproved() { return approved; }
    public void setApproved(Boolean approved) { this.approved = approved; }

    public Boolean getPinned() { return pinned; }
    public void setPinned(Boolean pinned) { this.pinned = pinned; }

    public UUID getApprovedBy() { return approvedBy; }
    public void setApprovedBy(UUID approvedBy) { this.approvedBy = approvedBy; }

    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }

    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
