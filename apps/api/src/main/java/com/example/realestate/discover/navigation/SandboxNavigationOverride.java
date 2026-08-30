package com.example.realestate.discover.navigation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * JPA entity for the {@code sandbox_navigation_override} table (V122, #1955 Areas PR A, SLICE
 * 2f+2g). One row per controlled-override input a revision's navigation-tree (re)generation must
 * replay — see the V122 migration comment for the Model A "replayed deterministic input, never a
 * post-hoc mutation" contract.
 *
 * <p>Insert+delete only from the admin override endpoints (a row is never UPDATEd in place — a
 * change is a DELETE then a fresh POST) — matching the sandbox_* family's general insert-heavy
 * discipline, with delete as the one intentional exception this table needs (an admin correcting
 * a mistake before re-validating).
 */
@Entity
@Table(name = "sandbox_navigation_override", schema = "public")
public class SandboxNavigationOverride {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "revision_id", nullable = false)
    private Long revisionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "override_kind", nullable = false)
    private OverrideKind overrideKind;

    @Column(name = "subject_area_key")
    private String subjectAreaKey;

    @Column(name = "subject_node_key")
    private String subjectNodeKey;

    @Column(name = "target_region_key")
    private String targetRegionKey;

    @Column(name = "target_node_key")
    private String targetNodeKey;

    @Column(name = "new_label")
    private String newLabel;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "new_representative_area_keys", columnDefinition = "text[]")
    private List<String> newRepresentativeAreaKeys;

    @Column(name = "apply_order", nullable = false)
    private Integer applyOrder;

    @Column(name = "reason")
    private String reason;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    protected SandboxNavigationOverride() {}

    public SandboxNavigationOverride(
            Long revisionId, OverrideKind overrideKind, String subjectAreaKey, String subjectNodeKey,
            String targetRegionKey, String targetNodeKey, String newLabel,
            List<String> newRepresentativeAreaKeys, Integer applyOrder, String reason, UUID createdBy) {
        this.revisionId = revisionId;
        this.overrideKind = overrideKind;
        this.subjectAreaKey = subjectAreaKey;
        this.subjectNodeKey = subjectNodeKey;
        this.targetRegionKey = targetRegionKey;
        this.targetNodeKey = targetNodeKey;
        this.newLabel = newLabel;
        this.newRepresentativeAreaKeys = newRepresentativeAreaKeys;
        this.applyOrder = applyOrder;
        this.reason = reason;
        this.createdBy = createdBy;
    }

    public Long getId() { return id; }
    public Long getRevisionId() { return revisionId; }
    public OverrideKind getOverrideKind() { return overrideKind; }
    public String getSubjectAreaKey() { return subjectAreaKey; }
    public String getSubjectNodeKey() { return subjectNodeKey; }
    public String getTargetRegionKey() { return targetRegionKey; }
    public String getTargetNodeKey() { return targetNodeKey; }
    public String getNewLabel() { return newLabel; }
    public List<String> getNewRepresentativeAreaKeys() { return newRepresentativeAreaKeys; }
    public Integer getApplyOrder() { return applyOrder; }
    public String getReason() { return reason; }
    public UUID getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }

    /** Adapter to the pure {@link NavigationOverride} domain view consumed by validation/applier. */
    public NavigationOverride toNavigationOverride() {
        return new NavigationOverride(
                overrideKind.name(), subjectAreaKey, subjectNodeKey, targetRegionKey, targetNodeKey,
                newLabel, newRepresentativeAreaKeys, applyOrder);
    }
}
