package com.example.realestate.dashboard;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Entity representing pre-aggregated weekly price statistics for an area.
 * Prices are stored in paise (1/100 rupee) and converted to rupees at the API layer.
 */
@Entity
@Table(name = "area_price_weekly", schema = "public")
public class AreaPriceWeekly {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "area_key", nullable = false)
    private String areaKey;

    @Column(name = "week_start_date", nullable = false)
    private LocalDate weekStartDate;

    @Column(name = "listing_count", nullable = false)
    private int listingCount;

    @Column(name = "median_price_per_cent_paise")
    private Long medianPricePerCentPaise;

    @Column(name = "p25_price_per_cent_paise")
    private Long p25PricePerCentPaise;

    @Column(name = "p75_price_per_cent_paise")
    private Long p75PricePerCentPaise;

    @Column(name = "bedrooms", nullable = false)
    private int bedrooms = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    // Getters and setters

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getAreaKey() {
        return areaKey;
    }

    public void setAreaKey(String areaKey) {
        this.areaKey = areaKey;
    }

    public LocalDate getWeekStartDate() {
        return weekStartDate;
    }

    public void setWeekStartDate(LocalDate weekStartDate) {
        this.weekStartDate = weekStartDate;
    }

    public int getListingCount() {
        return listingCount;
    }

    public void setListingCount(int listingCount) {
        this.listingCount = listingCount;
    }

    public Long getMedianPricePerCentPaise() {
        return medianPricePerCentPaise;
    }

    public void setMedianPricePerCentPaise(Long medianPricePerCentPaise) {
        this.medianPricePerCentPaise = medianPricePerCentPaise;
    }

    public Long getP25PricePerCentPaise() {
        return p25PricePerCentPaise;
    }

    public void setP25PricePerCentPaise(Long p25PricePerCentPaise) {
        this.p25PricePerCentPaise = p25PricePerCentPaise;
    }

    public Long getP75PricePerCentPaise() {
        return p75PricePerCentPaise;
    }

    public void setP75PricePerCentPaise(Long p75PricePerCentPaise) {
        this.p75PricePerCentPaise = p75PricePerCentPaise;
    }

    public int getBedrooms() {
        return bedrooms;
    }

    public void setBedrooms(int bedrooms) {
        this.bedrooms = bedrooms;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
