package com.example.realestate.listing.typed;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

/**
 * Read-only JPA projection for the {@code listing_residential_unit_details} table.
 *
 * <p>PK = {@code listing_id} (the same UUID as the parent {@code property_listings} row).
 * No {@code @OneToOne}, no cascade, no {@code @Version}. All non-PK columns are nullable
 * boxed types. This entity is never written by application code; rows are populated by the
 * listing creation/update path and are read here only for the OpenSearch index document.
 */
@Entity
@Table(name = "listing_residential_unit_details", schema = "public")
public class ResidentialUnitDetail {

    @Id
    @Column(name = "listing_id")
    private UUID listingId;

    @Column(name = "floor_number")
    private Integer floorNumber;

    @Column(name = "total_floors")
    private Integer totalFloors;

    @Column(name = "furnishing_status")
    private String furnishingStatus;

    // --- Getters and setters ---

    public UUID getListingId() { return listingId; }
    public void setListingId(UUID listingId) { this.listingId = listingId; }

    public Integer getFloorNumber() { return floorNumber; }
    public void setFloorNumber(Integer floorNumber) { this.floorNumber = floorNumber; }

    public Integer getTotalFloors() { return totalFloors; }
    public void setTotalFloors(Integer totalFloors) { this.totalFloors = totalFloors; }

    public String getFurnishingStatus() { return furnishingStatus; }
    public void setFurnishingStatus(String furnishingStatus) { this.furnishingStatus = furnishingStatus; }
}
