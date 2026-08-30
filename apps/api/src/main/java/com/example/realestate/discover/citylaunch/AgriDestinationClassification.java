package com.example.realestate.discover.citylaunch;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * JPA entity for the {@code agri_destination_classification} table (V125, #2151 PR A) — the
 * production Agricultural destination direction/distance classification.
 *
 * <p>Written ONLY by {@link CityLaunchPromotionService#promoteAgriDestinationClassification}, via
 * REPLACE discipline (delete-by-city-id then insert), mirroring
 * {@code CityLaunchPromotionService#promoteNavigationNodes}. NOT READ by any production path in PR
 * A — this table is written and unread by design until PR B cuts {@code
 * RegionalAreaGroupsService} over to it (#2151 decision.d4).
 */
@Entity
@Table(name = "agri_destination_classification", schema = "public")
public class AgriDestinationClassification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "city_id", nullable = false)
    private Integer cityId;

    @Column(name = "area_key", nullable = false)
    private String areaKey;

    @Column(name = "origin_lat", nullable = false)
    private Double originLat;

    @Column(name = "origin_lon", nullable = false)
    private Double originLon;

    @Column(name = "distance_km", nullable = false)
    private Double distanceKm;

    @Column(name = "bearing_deg", nullable = false)
    private Double bearingDeg;

    @Column(name = "direction_key", nullable = false)
    private String directionKey;

    @Column(name = "distance_band_key", nullable = false)
    private String distanceBandKey;

    @Column(name = "generator_version", nullable = false)
    private String generatorVersion;

    @Column(name = "generated_at")
    private Instant generatedAt;

    // ── Constructors ─────────────────────────────────────────────────────────────────────────

    protected AgriDestinationClassification() {}

    public AgriDestinationClassification(
            Integer cityId, String areaKey, Double originLat, Double originLon,
            Double distanceKm, Double bearingDeg, String directionKey, String distanceBandKey,
            String generatorVersion, Instant generatedAt) {
        this.cityId = cityId;
        this.areaKey = areaKey;
        this.originLat = originLat;
        this.originLon = originLon;
        this.distanceKm = distanceKm;
        this.bearingDeg = bearingDeg;
        this.directionKey = directionKey;
        this.distanceBandKey = distanceBandKey;
        this.generatorVersion = generatorVersion;
        this.generatedAt = generatedAt;
    }

    // ── Getters ──────────────────────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public Integer getCityId() { return cityId; }
    public String getAreaKey() { return areaKey; }
    public Double getOriginLat() { return originLat; }
    public Double getOriginLon() { return originLon; }
    public Double getDistanceKm() { return distanceKm; }
    public Double getBearingDeg() { return bearingDeg; }
    public String getDirectionKey() { return directionKey; }
    public String getDistanceBandKey() { return distanceBandKey; }
    public String getGeneratorVersion() { return generatorVersion; }
    public Instant getGeneratedAt() { return generatedAt; }
}
