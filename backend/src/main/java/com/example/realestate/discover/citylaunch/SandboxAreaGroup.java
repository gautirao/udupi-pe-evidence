package com.example.realestate.discover.citylaunch;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * JPA entity for the {@code sandbox_area_groups} table (V118, #1911 PR1).
 *
 * <p>Revision-scoped staging mirror of {@code public.area_groups} (V77) — column-for-column,
 * including matching {@code DOUBLE PRECISION} geometry types. Insert+read only.
 */
@Entity
@Table(name = "sandbox_area_groups", schema = "public")
public class SandboxAreaGroup {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "revision_id", nullable = false)
    private Long revisionId;

    @Column(name = "slug")
    private String slug;

    @Column(name = "name")
    private String name;

    @Column(name = "subtitle")
    private String subtitle;

    @Column(name = "region_label")
    private String regionLabel;

    @Column(name = "display_order")
    private Integer displayOrder;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(name = "focus_lat")
    private Double focusLat;

    @Column(name = "focus_lon")
    private Double focusLon;

    @Column(name = "min_lat")
    private Double minLat;

    @Column(name = "min_lon")
    private Double minLon;

    @Column(name = "max_lat")
    private Double maxLat;

    @Column(name = "max_lon")
    private Double maxLon;

    // ── Constructors ─────────────────────────────────────────────────────────────────────────

    protected SandboxAreaGroup() {}

    public SandboxAreaGroup(Long revisionId, String slug, String name, String subtitle, String regionLabel,
                             Integer displayOrder, boolean active,
                             Double focusLat, Double focusLon,
                             Double minLat, Double minLon, Double maxLat, Double maxLon) {
        this.revisionId = revisionId;
        this.slug = slug;
        this.name = name;
        this.subtitle = subtitle;
        this.regionLabel = regionLabel;
        this.displayOrder = displayOrder;
        this.active = active;
        this.focusLat = focusLat;
        this.focusLon = focusLon;
        this.minLat = minLat;
        this.minLon = minLon;
        this.maxLat = maxLat;
        this.maxLon = maxLon;
    }

    // ── Getters ──────────────────────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public Long getRevisionId() { return revisionId; }
    public String getSlug() { return slug; }
    public String getName() { return name; }
    public String getSubtitle() { return subtitle; }
    public String getRegionLabel() { return regionLabel; }
    public Integer getDisplayOrder() { return displayOrder; }
    public boolean isActive() { return active; }
    public Double getFocusLat() { return focusLat; }
    public Double getFocusLon() { return focusLon; }
    public Double getMinLat() { return minLat; }
    public Double getMinLon() { return minLon; }
    public Double getMaxLat() { return maxLat; }
    public Double getMaxLon() { return maxLon; }
}
