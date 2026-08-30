package com.example.realestate.discover.citylaunch;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * JPA entity for the {@code sandbox_agri_destination_classification} table (V125, #2151 PR A).
 *
 * <p>Revision-scoped staging mirror of {@link AgriDestinationClassification} — column-for-column,
 * except scoped by {@code revisionId} (which already implies city via
 * {@code city_launch_revision.city_id}) instead of {@code cityId}, matching the V118 sandbox_*
 * convention. {@code areaKey} is intentionally NOT a foreign key here — unlike the production
 * table, a sandbox row may describe an area not yet promoted into {@code public.areas}.
 *
 * <p>{@code originLat}/{@code originLon} are the city's {@code cities.geo_center_lat}/{@code
 * geo_center_lon} AT PREPARE TIME, snapshotted into EVERY row (#2151 decision.d2) so the revision
 * is fully self-describing and a later edit to the city's configured origin cannot retroactively
 * invalidate an already-prepared revision.
 *
 * <p>Insert+read only; a row must never be mutated after it is persisted (matches the sandbox_*
 * family-wide convention).
 */
@Entity
@Table(name = "sandbox_agri_destination_classification", schema = "public")
public class SandboxAgriDestinationClassification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "revision_id", nullable = false)
    private Long revisionId;

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

    protected SandboxAgriDestinationClassification() {}

    public SandboxAgriDestinationClassification(
            Long revisionId, String areaKey, Double originLat, Double originLon,
            Double distanceKm, Double bearingDeg, String directionKey, String distanceBandKey,
            String generatorVersion, Instant generatedAt) {
        this.revisionId = revisionId;
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
    public Long getRevisionId() { return revisionId; }
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
