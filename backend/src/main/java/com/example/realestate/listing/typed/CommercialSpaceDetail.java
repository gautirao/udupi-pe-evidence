package com.example.realestate.listing.typed;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Read-only JPA projection for the {@code listing_commercial_space_details} table.
 *
 * <p>PK = {@code listing_id} (the same UUID as the parent {@code property_listings} row).
 * No {@code @OneToOne}, no cascade, no {@code @Version}. All non-PK columns are nullable
 * boxed types. This entity is never written by application code; rows are populated by the
 * listing creation/update path and are read here only for the OpenSearch index document.
 */
@Entity
@Table(name = "listing_commercial_space_details", schema = "public")
public class CommercialSpaceDetail {

    @Id
    @Column(name = "listing_id")
    private UUID listingId;

    @Column(name = "commercial_subtype")
    private String commercialSubtype;

    @Column(name = "floor_number")
    private Integer floorNumber;

    @Column(name = "total_floors")
    private Integer totalFloors;

    @Column(name = "furnishing_status")
    private String furnishingStatus;

    @Column(name = "washrooms")
    private Integer washrooms;

    @Column(name = "parking_count")
    private Integer parkingCount;

    /** Stored as {@code numeric} in Postgres; serializes as a JSON number in OpenSearch. */
    @Column(name = "road_frontage_ft")
    private BigDecimal roadFrontageFt;

    @Column(name = "commercial_usage")
    private String commercialUsage;

    // --- Getters and setters ---

    public UUID getListingId() { return listingId; }
    public void setListingId(UUID listingId) { this.listingId = listingId; }

    public String getCommercialSubtype() { return commercialSubtype; }
    public void setCommercialSubtype(String commercialSubtype) { this.commercialSubtype = commercialSubtype; }

    public Integer getFloorNumber() { return floorNumber; }
    public void setFloorNumber(Integer floorNumber) { this.floorNumber = floorNumber; }

    public Integer getTotalFloors() { return totalFloors; }
    public void setTotalFloors(Integer totalFloors) { this.totalFloors = totalFloors; }

    public String getFurnishingStatus() { return furnishingStatus; }
    public void setFurnishingStatus(String furnishingStatus) { this.furnishingStatus = furnishingStatus; }

    public Integer getWashrooms() { return washrooms; }
    public void setWashrooms(Integer washrooms) { this.washrooms = washrooms; }

    public Integer getParkingCount() { return parkingCount; }
    public void setParkingCount(Integer parkingCount) { this.parkingCount = parkingCount; }

    public BigDecimal getRoadFrontageFt() { return roadFrontageFt; }
    public void setRoadFrontageFt(BigDecimal roadFrontageFt) { this.roadFrontageFt = roadFrontageFt; }

    public String getCommercialUsage() { return commercialUsage; }
    public void setCommercialUsage(String commercialUsage) { this.commercialUsage = commercialUsage; }
}
