package com.example.realestate.discover.citylaunch;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * JPA entity for the {@code sandbox_city_region_memberships} table (V118, #1911 PR1).
 *
 * <p>Revision-scoped staging mirror of {@code public.city_region_memberships} (V113). Insert+read
 * only.
 */
@Entity
@Table(name = "sandbox_city_region_memberships", schema = "public")
public class SandboxCityRegionMembership {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "revision_id", nullable = false)
    private Long revisionId;

    @Column(name = "sandbox_area_id", nullable = false)
    private Long sandboxAreaId;

    @Column(name = "region_key", nullable = false)
    private String regionKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "assignment_source", nullable = false)
    private AssignmentSource assignmentSource;

    // ── Constructors ─────────────────────────────────────────────────────────────────────────

    protected SandboxCityRegionMembership() {}

    public SandboxCityRegionMembership(Long revisionId, Long sandboxAreaId, String regionKey,
                                        AssignmentSource assignmentSource) {
        this.revisionId = revisionId;
        this.sandboxAreaId = sandboxAreaId;
        this.regionKey = regionKey;
        this.assignmentSource = assignmentSource;
    }

    // ── Getters ──────────────────────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public Long getRevisionId() { return revisionId; }
    public Long getSandboxAreaId() { return sandboxAreaId; }
    public String getRegionKey() { return regionKey; }
    public AssignmentSource getAssignmentSource() { return assignmentSource; }
}
