package com.example.realestate.discover.citylaunch;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * JPA entity for the {@code sandbox_areas} table (V118, #1911 PR1).
 *
 * <p>Revision-scoped staging mirror of {@code public.areas} (V71) — column-for-column, including
 * matching {@code DOUBLE PRECISION} geometry types, so a future promotion step (PR8+) can copy
 * rows into {@code public.areas} with zero transformation.
 *
 * <p>Insert+read only. {@link SandboxAreaRepository} exposes no update path; a row must never be
 * mutated after it is persisted. See the {@code city_launch_revision} ON DELETE CASCADE for the
 * only lifecycle event that removes rows (revision deletion).
 */
@Entity
@Table(name = "sandbox_areas", schema = "public")
public class SandboxArea {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "revision_id", nullable = false)
    private Long revisionId;

    @Column(name = "area_key")
    private String areaKey;

    @Column(name = "name")
    private String name;

    @Column(name = "district")
    private String district;

    @Column(name = "geo_center_lat")
    private Double geoCenterLat;

    @Column(name = "geo_center_lon")
    private Double geoCenterLon;

    @Column(name = "min_lat")
    private Double minLat;

    @Column(name = "min_lon")
    private Double minLon;

    @Column(name = "max_lat")
    private Double maxLat;

    @Column(name = "max_lon")
    private Double maxLon;

    @Column(name = "geometry_source")
    private String geometrySource;

    @Column(name = "osm_element_type")
    private String osmElementType;

    @Column(name = "osm_element_id")
    private Long osmElementId;

    @Column(name = "lifecycle_status", nullable = false)
    private String lifecycleStatus = "ACTIVE";

    // ── Constructors ─────────────────────────────────────────────────────────────────────────

    protected SandboxArea() {}

    public SandboxArea(Long revisionId, String areaKey, String name, String district,
                        Double geoCenterLat, Double geoCenterLon,
                        Double minLat, Double minLon, Double maxLat, Double maxLon,
                        String geometrySource, String osmElementType, Long osmElementId) {
        this.revisionId = revisionId;
        this.areaKey = areaKey;
        this.name = name;
        this.district = district;
        this.geoCenterLat = geoCenterLat;
        this.geoCenterLon = geoCenterLon;
        this.minLat = minLat;
        this.minLon = minLon;
        this.maxLat = maxLat;
        this.maxLon = maxLon;
        this.geometrySource = geometrySource;
        this.osmElementType = osmElementType;
        this.osmElementId = osmElementId;
    }

    // ── Getters ──────────────────────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public Long getRevisionId() { return revisionId; }
    public String getAreaKey() { return areaKey; }
    public String getName() { return name; }
    public String getDistrict() { return district; }
    public Double getGeoCenterLat() { return geoCenterLat; }
    public Double getGeoCenterLon() { return geoCenterLon; }
    public Double getMinLat() { return minLat; }
    public Double getMinLon() { return minLon; }
    public Double getMaxLat() { return maxLat; }
    public Double getMaxLon() { return maxLon; }
    public String getGeometrySource() { return geometrySource; }
    public String getOsmElementType() { return osmElementType; }
    public Long getOsmElementId() { return osmElementId; }
    public String getLifecycleStatus() { return lifecycleStatus; }
}
