package com.example.realestate.intelligence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * JPA entity for {@code area_demand_signal}.
 *
 * <p>Stores the per-bucket demand-vs-supply rollup output. One row per
 * {@code (city_slug, area_key, property_type, listing_purpose, budget_band,
 * period_start, window_days)} bucket.
 *
 * <p>Composite primary key is declared via {@code @IdClass(AreaDemandSignalId.class)}.
 *
 * <p>gap_score is nullable: {@code null} unambiguously signals "suppressed"
 * (either k-anon: demand_total &lt; {@link AggregationConstants#K_ANON_MIN}, or
 * peer-population statistical guard: N &lt; {@link DemandSignalThresholds#MIN_PEER_POPULATION}).
 * NEVER store 0 as a surrogate for a suppressed value.
 *
 * <p>No PII is stored: all columns are aggregate counts, coarse band labels,
 * or derived statistics. session_id and filters_jsonb are explicitly excluded.
 * See V96 design notes and {@link DemandSignalThresholds} for the no-PII proof.
 */
@Entity
@Table(name = "area_demand_signal", schema = "public")
@IdClass(AreaDemandSignalId.class)
public class AreaDemandSignal {

    @Id
    @Column(name = "city_slug", nullable = false)
    private String citySlug;

    @Id
    @Column(name = "area_key", nullable = false)
    private String areaKey;

    @Id
    @Column(name = "property_type", nullable = false)
    private String propertyType;

    @Id
    @Column(name = "listing_purpose", nullable = false)
    private String listingPurpose;

    @Id
    @Column(name = "budget_band", nullable = false)
    private String budgetBand;

    @Id
    @Column(name = "period_start", nullable = false)
    private Instant periodStart;

    @Id
    @Column(name = "window_days", nullable = false)
    private int windowDays;

    @Column(name = "period_end", nullable = false)
    private Instant periodEnd;

    /**
     * Count of FILTER_APPLY events in this bucket within the rolling window.
     * Aggregated from discover_event.event_type = 'FILTER_APPLY'.
     * Never null; defaults to 0 (from FULL OUTER JOIN with COALESCE).
     */
    @Column(name = "search_count", nullable = false)
    private int searchCount;

    /**
     * Count of PANEL_OPEN events in this bucket within the rolling window.
     * Aggregated from discover_event.event_type = 'PANEL_OPEN'.
     * Never null; defaults to 0.
     */
    @Column(name = "panel_open_count", nullable = false)
    private int panelOpenCount;

    /**
     * Count of LEAD_INTENT events in this bucket within the rolling window.
     * Aggregated from discover_event.event_type = 'LEAD_INTENT'.
     * Never null; defaults to 0.
     */
    @Column(name = "lead_intent_count", nullable = false)
    private int leadIntentCount;

    /**
     * Count of LIVE visible matching supply listings for this bucket.
     * Uses the exact area-aggregate LIVE predicate (status='LIVE', archived_at IS NULL,
     * is_duplicate=false, created_at >= NOW()-90d, area_key IS NOT NULL).
     * Never null; defaults to 0.
     */
    @Column(name = "listing_count", nullable = false)
    private int listingCount;

    /**
     * Gap score: z(weighted_demand) - z(supply_intensity), clamped to [-3, 3].
     * NULL when suppressed (k-anon thin or degenerate peer population).
     * NEVER NaN, NEVER Infinity, NEVER 0 as a surrogate for unknown.
     */
    @Column(name = "gap_score")
    private Float gapScore;

    /**
     * Deterministic signal classification.
     * Stored as lowercase string matching the CHECK constraint values:
     * 'supply_gap' | 'information_gap' | 'price_signal' | 'possible_gap'.
     */
    @Column(name = "signal_type", nullable = false)
    private String signalType;

    /**
     * Demand volume confidence tier.
     * Stored as lowercase string: 'enough_data' | 'limited_data' | 'insufficient_data'.
     * 'insufficient_data' means the bucket is k-anon suppressed (gap_score is NULL).
     */
    @Column(name = "confidence", nullable = false)
    private String confidence;

    /**
     * Timestamp when this rollup row was computed.
     * Refreshed on every run to record when the row was last recomputed.
     */
    @Column(name = "computed_at", nullable = false)
    private Instant computedAt;

    /** JPA no-arg constructor. */
    public AreaDemandSignal() {
    }

    // ── Getters and setters ───────────────────────────────────────────────────

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

    public Instant getPeriodEnd() { return periodEnd; }
    public void setPeriodEnd(Instant periodEnd) { this.periodEnd = periodEnd; }

    public int getSearchCount() { return searchCount; }
    public void setSearchCount(int searchCount) { this.searchCount = searchCount; }

    public int getPanelOpenCount() { return panelOpenCount; }
    public void setPanelOpenCount(int panelOpenCount) { this.panelOpenCount = panelOpenCount; }

    public int getLeadIntentCount() { return leadIntentCount; }
    public void setLeadIntentCount(int leadIntentCount) { this.leadIntentCount = leadIntentCount; }

    public int getListingCount() { return listingCount; }
    public void setListingCount(int listingCount) { this.listingCount = listingCount; }

    public Float getGapScore() { return gapScore; }
    public void setGapScore(Float gapScore) { this.gapScore = gapScore; }

    public String getSignalType() { return signalType; }
    public void setSignalType(String signalType) { this.signalType = signalType; }

    public String getConfidence() { return confidence; }
    public void setConfidence(String confidence) { this.confidence = confidence; }

    public Instant getComputedAt() { return computedAt; }
    public void setComputedAt(Instant computedAt) { this.computedAt = computedAt; }
}
