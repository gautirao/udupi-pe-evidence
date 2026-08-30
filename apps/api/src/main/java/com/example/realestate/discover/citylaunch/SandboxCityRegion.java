package com.example.realestate.discover.citylaunch;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/**
 * JPA entity for the {@code sandbox_city_regions} table (V118, #1911 PR1).
 *
 * <p>Revision-scoped staging mirror of {@code public.city_regions} (V113) — column-for-column,
 * including matching {@code NUMERIC} geometry types (deliberately NOT {@code DOUBLE PRECISION};
 * V113's promotion target uses NUMERIC, unlike {@code public.areas}/{@code public.area_groups}).
 * Insert+read only.
 */
@Entity
@Table(name = "sandbox_city_regions", schema = "public")
public class SandboxCityRegion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "revision_id", nullable = false)
    private Long revisionId;

    @Column(name = "region_key")
    private String regionKey;

    @Column(name = "display_label")
    private String displayLabel;

    @Column(name = "display_order")
    private Integer displayOrder;

    @Column(name = "centre_lat")
    private BigDecimal centreLat;

    @Column(name = "centre_lon")
    private BigDecimal centreLon;

    @Column(name = "min_lat")
    private BigDecimal minLat;

    @Column(name = "min_lon")
    private BigDecimal minLon;

    @Column(name = "max_lat")
    private BigDecimal maxLat;

    @Column(name = "max_lon")
    private BigDecimal maxLon;

    @Column(name = "policy_fingerprint")
    private String policyFingerprint;

    // ── Constructors ─────────────────────────────────────────────────────────────────────────

    protected SandboxCityRegion() {}

    public SandboxCityRegion(Long revisionId, String regionKey, String displayLabel, Integer displayOrder,
                              BigDecimal centreLat, BigDecimal centreLon,
                              BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon,
                              String policyFingerprint) {
        this.revisionId = revisionId;
        this.regionKey = regionKey;
        this.displayLabel = displayLabel;
        this.displayOrder = displayOrder;
        this.centreLat = centreLat;
        this.centreLon = centreLon;
        this.minLat = minLat;
        this.minLon = minLon;
        this.maxLat = maxLat;
        this.maxLon = maxLon;
        this.policyFingerprint = policyFingerprint;
    }

    // ── Getters ──────────────────────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public Long getRevisionId() { return revisionId; }
    public String getRegionKey() { return regionKey; }
    public String getDisplayLabel() { return displayLabel; }
    public Integer getDisplayOrder() { return displayOrder; }
    public BigDecimal getCentreLat() { return centreLat; }
    public BigDecimal getCentreLon() { return centreLon; }
    public BigDecimal getMinLat() { return minLat; }
    public BigDecimal getMinLon() { return minLon; }
    public BigDecimal getMaxLat() { return maxLat; }
    public BigDecimal getMaxLon() { return maxLon; }
    public String getPolicyFingerprint() { return policyFingerprint; }
}
