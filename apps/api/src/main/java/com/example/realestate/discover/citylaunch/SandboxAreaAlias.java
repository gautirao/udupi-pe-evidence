package com.example.realestate.discover.citylaunch;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * JPA entity for the {@code sandbox_area_aliases} table (V118, #1911 PR1).
 *
 * <p>Revision-scoped staging mirror of {@code public.area_alias} (V115). Insert+read only.
 */
@Entity
@Table(name = "sandbox_area_aliases", schema = "public")
public class SandboxAreaAlias {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "revision_id", nullable = false)
    private Long revisionId;

    @Column(name = "sandbox_area_id", nullable = false)
    private Long sandboxAreaId;

    @Column(name = "alias")
    private String alias;

    @Column(name = "alias_normalised")
    private String aliasNormalised;

    // ── Constructors ─────────────────────────────────────────────────────────────────────────

    protected SandboxAreaAlias() {}

    public SandboxAreaAlias(Long revisionId, Long sandboxAreaId, String alias, String aliasNormalised) {
        this.revisionId = revisionId;
        this.sandboxAreaId = sandboxAreaId;
        this.alias = alias;
        this.aliasNormalised = aliasNormalised;
    }

    // ── Getters ──────────────────────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public Long getRevisionId() { return revisionId; }
    public Long getSandboxAreaId() { return sandboxAreaId; }
    public String getAlias() { return alias; }
    public String getAliasNormalised() { return aliasNormalised; }
}
