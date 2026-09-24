package com.example.realestate.intelligence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * JPA entity for {@code area_intelligence_snapshot}.
 *
 * <p>Pre-computed per-area aggregate cache. Written by {@link AreaIntelligenceSnapshotService}
 * and read by buyer/broker display paths.
 *
 * <p>Composite primary key {@code (city_slug, area_key)} is declared via
 * {@code @IdClass(AreaIntelligenceSnapshotId.class)}.
 *
 * <p>Nullable fields use boxed types ({@link Long}, {@link BigDecimal}, {@link String})
 * so that {@code null} unambiguously signals "absent / suppressed", never 0.
 *
 * <p>demand_score is populated separately by {@code AreaDemandSignalRepository.updateDemandScore}
 * (issue #1532), via a targeted UPDATE driven by the hourly {@code AreaDemandSignalRollupJob}.
 * It is {@code null} only when no demand-signal run has scored this area yet, or all its
 * buckets were suppressed. {@link AreaIntelligenceSnapshotService} does not compute this column
 * itself and must preserve it across its own full-row upsert. NEVER fabricate a value.
 */
@Entity
@Table(name = "area_intelligence_snapshot", schema = "public")
@IdClass(AreaIntelligenceSnapshotId.class)
public class AreaIntelligenceSnapshot {

    @Id
    @Column(name = "city_slug", nullable = false)
    private String citySlug;

    @Id
    @Column(name = "area_key", nullable = false)
    private String areaKey;

    @Column(name = "area_label")
    private String areaLabel;

    /**
     * Timestamp when this snapshot row was last computed/upserted.
     * Set explicitly by the service so every upsert reflects the actual recompute time.
     */
    @Column(name = "computed_at", nullable = false)
    private Instant computedAt;

    /**
     * Count of LIVE-90d listings for this area (mirrors AreaIntelligenceRepository.live90dCount).
     * Drives confidence classification. Never null; defaults to 0.
     */
    @Column(name = "active_listing_count", nullable = false)
    private int activeListingCount;

    /**
     * Median price in paise across all priced listings in this area.
     * NULL when {@code activeListingCount < AggregationConstants.K_ANON_MIN} (k-anonymity).
     * Never 0 as a surrogate for a suppressed value.
     */
    @Column(name = "median_price_paise")
    private Long medianPricePaise;

    /**
     * Most common property_type in this area (MODE aggregate).
     * NULL when {@code activeListingCount < AggregationConstants.K_ANON_MIN} (k-anonymity).
     * Never a real value when suppressed.
     */
    @Column(name = "dominant_property_type")
    private String dominantPropertyType;

    /**
     * Count of listings created within the last {@link AggregationConstants#FRESH_WINDOW_DAYS} days.
     * A subset of active_listing_count. Never null; defaults to 0.
     */
    @Column(name = "fresh_listing_count", nullable = false)
    private int freshListingCount;

    /**
     * Average quality_score over listings with a non-null quality_score.
     * NULL (not 0) when no scored rows exist — signals backfill-incomplete state.
     */
    @Column(name = "avg_listing_quality", precision = 5, scale = 2)
    private BigDecimal avgListingQuality;

    /**
     * Cohort size used for price comparison. Equals activeListingCount when
     * price comparison is supported, else equals activeListingCount (the raw count,
     * but priceComparisonSupported = false signals suppression to callers).
     */
    @Column(name = "price_comparison_sample_count", nullable = false)
    private int priceComparisonSampleCount;

    /**
     * True when activeListingCount >= K_ANON_MIN and price statistics are available.
     * False means median_price_paise and dominant_property_type are suppressed.
     */
    @Column(name = "price_comparison_supported", nullable = false)
    private boolean priceComparisonSupported;

    /**
     * Internal confidence label, lowercase: 'full' | 'limited' | 'insufficient'.
     * Matches AreaConfidence.classify(activeListingCount).name().toLowerCase().
     * Enforced by DB CHECK constraint.
     */
    @Column(name = "confidence", nullable = false)
    private String confidence;

    /**
     * Volume-weighted demand/supply gap score, written separately by
     * {@code AreaDemandSignalRepository.updateDemandScore} (issue #1532) via the hourly
     * {@code AreaDemandSignalRollupJob}. Null when no demand-signal run has scored this area
     * yet, or all its buckets were suppressed — never fabricate a value.
     * {@link AreaIntelligenceSnapshotService} does not compute this column itself and must
     * preserve it across its own full-row upsert (see that class's javadoc).
     */
    @Column(name = "demand_score", precision = 5, scale = 2)
    private BigDecimal demandScore;

    /** JPA no-arg constructor. */
    public AreaIntelligenceSnapshot() {
    }

    // ── Getters and setters ───────────────────────────────────────────────────

    public String getCitySlug() {
        return citySlug;
    }

    public void setCitySlug(String citySlug) {
        this.citySlug = citySlug;
    }

    public String getAreaKey() {
        return areaKey;
    }

    public void setAreaKey(String areaKey) {
        this.areaKey = areaKey;
    }

    public String getAreaLabel() {
        return areaLabel;
    }

    public void setAreaLabel(String areaLabel) {
        this.areaLabel = areaLabel;
    }

    public Instant getComputedAt() {
        return computedAt;
    }

    public void setComputedAt(Instant computedAt) {
        this.computedAt = computedAt;
    }

    public int getActiveListingCount() {
        return activeListingCount;
    }

    public void setActiveListingCount(int activeListingCount) {
        this.activeListingCount = activeListingCount;
    }

    public Long getMedianPricePaise() {
        return medianPricePaise;
    }

    public void setMedianPricePaise(Long medianPricePaise) {
        this.medianPricePaise = medianPricePaise;
    }

    public String getDominantPropertyType() {
        return dominantPropertyType;
    }

    public void setDominantPropertyType(String dominantPropertyType) {
        this.dominantPropertyType = dominantPropertyType;
    }

    public int getFreshListingCount() {
        return freshListingCount;
    }

    public void setFreshListingCount(int freshListingCount) {
        this.freshListingCount = freshListingCount;
    }

    public BigDecimal getAvgListingQuality() {
        return avgListingQuality;
    }

    public void setAvgListingQuality(BigDecimal avgListingQuality) {
        this.avgListingQuality = avgListingQuality;
    }

    public int getPriceComparisonSampleCount() {
        return priceComparisonSampleCount;
    }

    public void setPriceComparisonSampleCount(int priceComparisonSampleCount) {
        this.priceComparisonSampleCount = priceComparisonSampleCount;
    }

    public boolean isPriceComparisonSupported() {
        return priceComparisonSupported;
    }

    public void setPriceComparisonSupported(boolean priceComparisonSupported) {
        this.priceComparisonSupported = priceComparisonSupported;
    }

    public String getConfidence() {
        return confidence;
    }

    public void setConfidence(String confidence) {
        this.confidence = confidence;
    }

    public BigDecimal getDemandScore() {
        return demandScore;
    }

    public void setDemandScore(BigDecimal demandScore) {
        this.demandScore = demandScore;
    }
}
