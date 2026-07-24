package com.example.realestate.discover.navigation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * JPA entity for the {@code sandbox_navigation_nodes} table (V121, #1955 Areas PR A).
 *
 * <p>Revision-scoped staging mirror of {@link NavigationNode} — column-for-column, except scoped
 * by {@code revisionId} (which already implies city via {@code city_launch_revision.city_id})
 * instead of {@code cityId}, matching the V118 sandbox_* convention. {@code areaKey} is
 * intentionally NOT a foreign key here — unlike the production table, a sandbox row may describe
 * an area not yet promoted into {@code public.areas}.
 *
 * <p>Insert+read only; a row must never be mutated after it is persisted (see the sandbox_areas
 * family-wide convention).
 */
@Entity
@Table(name = "sandbox_navigation_nodes", schema = "public")
public class SandboxNavigationNode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "revision_id", nullable = false)
    private Long revisionId;

    @Column(name = "region_key", nullable = false)
    private String regionKey;

    @Column(name = "node_type", nullable = false)
    private String nodeType;

    @Column(name = "parent_node_id")
    private Long parentNodeId;

    @Column(name = "node_key", nullable = false)
    private String nodeKey;

    @Column(name = "area_key")
    private String areaKey;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "representative_area_keys", nullable = false, columnDefinition = "text[]")
    private List<String> representativeAreaKeys;

    @Column(name = "display_label", nullable = false)
    private String displayLabel;

    @Column(name = "display_order", nullable = false)
    private Integer displayOrder;

    @Column(name = "depth", nullable = false)
    private Integer depth;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "ancestor_keys", nullable = false, columnDefinition = "text[]")
    private List<String> ancestorKeys;

    @Column(name = "descendant_area_count", nullable = false)
    private Integer descendantAreaCount;

    @Column(name = "centre_lat", nullable = false)
    private BigDecimal centreLat;

    @Column(name = "centre_lon", nullable = false)
    private BigDecimal centreLon;

    @Column(name = "min_lat", nullable = false)
    private BigDecimal minLat;

    @Column(name = "min_lon", nullable = false)
    private BigDecimal minLon;

    @Column(name = "max_lat", nullable = false)
    private BigDecimal maxLat;

    @Column(name = "max_lon", nullable = false)
    private BigDecimal maxLon;

    @Column(name = "policy_fingerprint", nullable = false)
    private String policyFingerprint;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    // ── Constructors ─────────────────────────────────────────────────────────────────────────

    protected SandboxNavigationNode() {}

    public SandboxNavigationNode(Long revisionId, String regionKey, String nodeType, Long parentNodeId,
                                  String nodeKey, String areaKey, List<String> representativeAreaKeys,
                                  String displayLabel, Integer displayOrder, Integer depth,
                                  List<String> ancestorKeys, Integer descendantAreaCount,
                                  BigDecimal centreLat, BigDecimal centreLon,
                                  BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon,
                                  String policyFingerprint, Instant generatedAt) {
        this.revisionId = revisionId;
        this.regionKey = regionKey;
        this.nodeType = nodeType;
        this.parentNodeId = parentNodeId;
        this.nodeKey = nodeKey;
        this.areaKey = areaKey;
        this.representativeAreaKeys = representativeAreaKeys;
        this.displayLabel = displayLabel;
        this.displayOrder = displayOrder;
        this.depth = depth;
        this.ancestorKeys = ancestorKeys;
        this.descendantAreaCount = descendantAreaCount;
        this.centreLat = centreLat;
        this.centreLon = centreLon;
        this.minLat = minLat;
        this.minLon = minLon;
        this.maxLat = maxLat;
        this.maxLon = maxLon;
        this.policyFingerprint = policyFingerprint;
        this.generatedAt = generatedAt;
    }

    // ── Getters ──────────────────────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public Long getRevisionId() { return revisionId; }
    public String getRegionKey() { return regionKey; }
    public String getNodeType() { return nodeType; }
    public Long getParentNodeId() { return parentNodeId; }
    public String getNodeKey() { return nodeKey; }
    public String getAreaKey() { return areaKey; }
    public List<String> getRepresentativeAreaKeys() { return representativeAreaKeys; }
    public String getDisplayLabel() { return displayLabel; }
    public Integer getDisplayOrder() { return displayOrder; }
    public Integer getDepth() { return depth; }
    public List<String> getAncestorKeys() { return ancestorKeys; }
    public Integer getDescendantAreaCount() { return descendantAreaCount; }
    public BigDecimal getCentreLat() { return centreLat; }
    public BigDecimal getCentreLon() { return centreLon; }
    public BigDecimal getMinLat() { return minLat; }
    public BigDecimal getMinLon() { return minLon; }
    public BigDecimal getMaxLat() { return maxLat; }
    public BigDecimal getMaxLon() { return maxLon; }
    public String getPolicyFingerprint() { return policyFingerprint; }
    public Instant getGeneratedAt() { return generatedAt; }
}
