package com.example.realestate.analytics;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Objects;

@Entity
@Table(name = "area_price_weekly", schema = "public")
@IdClass(AreaPriceWeekly.AreaPriceWeeklyId.class)
public class AreaPriceWeekly {

    @Id
    @Column(name = "area_key", nullable = false)
    private String areaKey;

    @Id
    @Column(name = "week_start_date", nullable = false)
    private LocalDate weekStartDate;

    @Column(name = "listing_count", nullable = false)
    private int listingCount = 0;

    @Column(name = "median_price_per_cent_paise")
    private Long medianPricePerCentPaise;

    @Column(name = "p25_price_per_cent_paise")
    private Long p25PricePerCentPaise;

    @Column(name = "p75_price_per_cent_paise")
    private Long p75PricePerCentPaise;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public AreaPriceWeekly() {
    }

    public AreaPriceWeekly(String areaKey, LocalDate weekStartDate, int listingCount) {
        this.areaKey = areaKey;
        this.weekStartDate = weekStartDate;
        this.listingCount = listingCount;
    }

    // Composite primary key class
    public static class AreaPriceWeeklyId implements Serializable {
        private String areaKey;
        private LocalDate weekStartDate;

        public AreaPriceWeeklyId() {
        }

        public AreaPriceWeeklyId(String areaKey, LocalDate weekStartDate) {
            this.areaKey = areaKey;
            this.weekStartDate = weekStartDate;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (o == null || getClass() != o.getClass()) return false;
            AreaPriceWeeklyId that = (AreaPriceWeeklyId) o;
            return Objects.equals(areaKey, that.areaKey)
                    && Objects.equals(weekStartDate, that.weekStartDate);
        }

        @Override
        public int hashCode() {
            return Objects.hash(areaKey, weekStartDate);
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
    }

    // Getters and setters

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
