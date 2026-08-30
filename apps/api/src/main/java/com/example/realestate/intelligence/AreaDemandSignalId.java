package com.example.realestate.intelligence;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * Composite primary key for {@link AreaDemandSignal}.
 *
 * <p>Maps to the {@code (city_slug, area_key, property_type, listing_purpose,
 * budget_band, period_start, window_days)} primary key on
 * {@code area_demand_signal}. Used with {@code @IdClass}.
 *
 * <p>Must implement {@link Serializable} and override {@link #equals} and
 * {@link #hashCode} as required by the JPA spec for composite keys.
 */
public class AreaDemandSignalId implements Serializable {

    private String citySlug;
    private String areaKey;
    private String propertyType;
    private String listingPurpose;
    private String budgetBand;
    private Instant periodStart;
    private int windowDays;

    /** JPA no-arg constructor. */
    public AreaDemandSignalId() {
    }

    public AreaDemandSignalId(String citySlug, String areaKey, String propertyType,
                               String listingPurpose, String budgetBand,
                               Instant periodStart, int windowDays) {
        this.citySlug = citySlug;
        this.areaKey = areaKey;
        this.propertyType = propertyType;
        this.listingPurpose = listingPurpose;
        this.budgetBand = budgetBand;
        this.periodStart = periodStart;
        this.windowDays = windowDays;
    }

    public String getCitySlug() { return citySlug; }
    public void setCitySlug(String citySlug) { this.citySlug = citySlug; }

    public String getAreaKey() { return areaKey; }
    public void setAreaKey(String areaKey) { this.areaKey = areaKey; }

    public String getPropertyType() { return propertyType; }
    public void setPropertyType(String propertyType) { this.propertyType = propertyType; }

    public String getListingPurpose() { return listingPurpose; }
    public void setListingPurpose(String listingPurpose) { this.listingPurpose = listingPurpose; }

    public String getBudgetBand() { return budgetBand; }
    public void setBudgetBand(String budgetBand) { this.budgetBand = budgetBand; }

    public Instant getPeriodStart() { return periodStart; }
    public void setPeriodStart(Instant periodStart) { this.periodStart = periodStart; }

    public int getWindowDays() { return windowDays; }
    public void setWindowDays(int windowDays) { this.windowDays = windowDays; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof AreaDemandSignalId)) return false;
        AreaDemandSignalId that = (AreaDemandSignalId) o;
        return windowDays == that.windowDays
                && Objects.equals(citySlug, that.citySlug)
                && Objects.equals(areaKey, that.areaKey)
                && Objects.equals(propertyType, that.propertyType)
                && Objects.equals(listingPurpose, that.listingPurpose)
                && Objects.equals(budgetBand, that.budgetBand)
                && Objects.equals(periodStart, that.periodStart);
    }

    @Override
    public int hashCode() {
        return Objects.hash(citySlug, areaKey, propertyType, listingPurpose, budgetBand, periodStart, windowDays);
    }
}
