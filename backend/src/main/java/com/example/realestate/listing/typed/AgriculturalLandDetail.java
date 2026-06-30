package com.example.realestate.listing.typed;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

/**
 * Read-only JPA projection for the {@code listing_agricultural_land_details} table.
 *
 * <p>PK = {@code listing_id} (the same UUID as the parent {@code property_listings} row).
 * No {@code @OneToOne}, no cascade, no {@code @Version}. All non-PK columns are nullable
 * boxed types. This entity is never written by application code; rows are populated by the
 * listing creation/update path and are read here only for the OpenSearch index document.
 */
@Entity
@Table(name = "listing_agricultural_land_details", schema = "public")
public class AgriculturalLandDetail {

    @Id
    @Column(name = "listing_id")
    private UUID listingId;

    @Column(name = "water_source")
    private String waterSource;

    @Column(name = "soil_type")
    private String soilType;

    @Column(name = "road_access")
    private String roadAccess;

    @Column(name = "cultivation_status")
    private String cultivationStatus;

    @Column(name = "land_category")
    private String landCategory;

    @Column(name = "farmhouse_available")
    private Boolean farmhouseAvailable;

    @Column(name = "fencing_done")
    private Boolean fencingDone;

    // --- Getters and setters ---

    public UUID getListingId() { return listingId; }
    public void setListingId(UUID listingId) { this.listingId = listingId; }

    public String getWaterSource() { return waterSource; }
    public void setWaterSource(String waterSource) { this.waterSource = waterSource; }

    public String getSoilType() { return soilType; }
    public void setSoilType(String soilType) { this.soilType = soilType; }

    public String getRoadAccess() { return roadAccess; }
    public void setRoadAccess(String roadAccess) { this.roadAccess = roadAccess; }

    public String getCultivationStatus() { return cultivationStatus; }
    public void setCultivationStatus(String cultivationStatus) { this.cultivationStatus = cultivationStatus; }

    public String getLandCategory() { return landCategory; }
    public void setLandCategory(String landCategory) { this.landCategory = landCategory; }

    public Boolean getFarmhouseAvailable() { return farmhouseAvailable; }
    public void setFarmhouseAvailable(Boolean farmhouseAvailable) { this.farmhouseAvailable = farmhouseAvailable; }

    public Boolean getFencingDone() { return fencingDone; }
    public void setFencingDone(Boolean fencingDone) { this.fencingDone = fencingDone; }
}
