package com.example.realestate.discover.citylaunch;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * JPA entity for the {@code sandbox_area_group_members} table (V118, #1911 PR1).
 *
 * <p>Revision-scoped staging mirror of {@code public.area_group_members} (V77). Insert+read only.
 * Cascades on both {@code sandbox_area_group_id} and {@code sandbox_area_id}, so deleting the
 * parent revision (which cascades to {@code sandbox_areas} and {@code sandbox_area_groups})
 * removes every membership row via either path.
 */
@Entity
@Table(name = "sandbox_area_group_members", schema = "public")
public class SandboxAreaGroupMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "revision_id", nullable = false)
    private Long revisionId;

    @Column(name = "sandbox_area_group_id", nullable = false)
    private Long sandboxAreaGroupId;

    @Column(name = "sandbox_area_id", nullable = false)
    private Long sandboxAreaId;

    @Column(name = "display_order")
    private Integer displayOrder;

    // ── Constructors ─────────────────────────────────────────────────────────────────────────

    protected SandboxAreaGroupMember() {}

    public SandboxAreaGroupMember(Long revisionId, Long sandboxAreaGroupId, Long sandboxAreaId, Integer displayOrder) {
        this.revisionId = revisionId;
        this.sandboxAreaGroupId = sandboxAreaGroupId;
        this.sandboxAreaId = sandboxAreaId;
        this.displayOrder = displayOrder;
    }

    // ── Getters ──────────────────────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public Long getRevisionId() { return revisionId; }
    public Long getSandboxAreaGroupId() { return sandboxAreaGroupId; }
    public Long getSandboxAreaId() { return sandboxAreaId; }
    public Integer getDisplayOrder() { return displayOrder; }
}
