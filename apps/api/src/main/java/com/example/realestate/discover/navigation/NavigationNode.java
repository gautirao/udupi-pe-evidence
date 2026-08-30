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
 * JPA entity for the {@code navigation_nodes} table (V121, #1955 Areas PR A).
 *
 * <p>Production recursive-cluster navigation tree: one row per CLUSTER or AREA node in a city's
 * navigation hierarchy. {@code id} is a surrogate, FK-only primary key — never exposed publicly;
 * {@code nodeKey} is the stable public identity a future endpoint slice will expose instead. AREA
 * nodes are always leaves (never a parent), enforced by both the migration's CHECK constraint and
 * a BEFORE INSERT/UPDATE trigger, not just application code.
 *
 * <p>{@code descendantAreaCount} is a STRUCTURAL count of AREA leaves — there is deliberately no
 * listing-count concept anywhere on this entity; live listing volume belongs to a later
 * cache/counts slice, never baked into the generated hierarchy snapshot.
 *
 * <p>Schema + entity + repository ONLY in this slice. No generator/promotion/cache/counts service
 * reads or writes rows of this type yet.
 */
@Entity
@Table(name = "navigation_nodes", schema = "public")
public class NavigationNode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "city_id", nullable = false)
    private Integer cityId;

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

    /** #2086 V124: great-circle bearing (degrees, [0,360)) from the PARENT node's centre to this
     * node's centre. NULL for depth-0 DIRECTION nodes (no parent node exists). Additive/nullable —
     * see V124 migration. */
    @Column(name = "bearing_degrees")
    private BigDecimal bearingDegrees;

    @Column(name = "policy_fingerprint", nullable = false)
    private String policyFingerprint;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

    // ── Constructors ─────────────────────────────────────────────────────────────────────────

    protected NavigationNode() {}

    /** Pre-#2086 20-arg shape, preserved for callers outside this issue's allowed_file_globs
     * (e.g. {@code citylaunch} package tests) — delegates with {@code bearingDegrees = null}.
     *
     * @deprecated #2086/#2088: prefer the 21-arg constructor below, which takes an explicit {@code
     *     bearingDegrees}. This overload silently persists {@code bearing_degrees = NULL}, which is
     *     indistinguishable on the wire from the legitimate depth-0 DIRECTION null — a writer that
     *     picks this overload by mistake among 20 positional {@code BigDecimal}/{@code String} args
     *     ships a silently-missing bearing all the way to the anon API and #2088. Not removed: the
     *     remaining caller ({@code RevisionChecksumTest} in the {@code citylaunch} test package) is
     *     outside this issue's allowed_file_globs. */
    @Deprecated
    public NavigationNode(Integer cityId, String regionKey, String nodeType, Long parentNodeId,
                           String nodeKey, String areaKey, List<String> representativeAreaKeys,
                           String displayLabel, Integer displayOrder, Integer depth,
                           List<String> ancestorKeys, Integer descendantAreaCount,
                           BigDecimal centreLat, BigDecimal centreLon,
                           BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon,
                           String policyFingerprint, Instant generatedAt) {
        this(cityId, regionKey, nodeType, parentNodeId, nodeKey, areaKey, representativeAreaKeys,
                displayLabel, displayOrder, depth, ancestorKeys, descendantAreaCount, centreLat, centreLon,
                minLat, minLon, maxLat, maxLon, null, policyFingerprint, generatedAt);
    }

    public NavigationNode(Integer cityId, String regionKey, String nodeType, Long parentNodeId,
                           String nodeKey, String areaKey, List<String> representativeAreaKeys,
                           String displayLabel, Integer displayOrder, Integer depth,
                           List<String> ancestorKeys, Integer descendantAreaCount,
                           BigDecimal centreLat, BigDecimal centreLon,
                           BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon,
                           BigDecimal bearingDegrees, String policyFingerprint, Instant generatedAt) {
        this.cityId = cityId;
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
        this.bearingDegrees = bearingDegrees;
        this.policyFingerprint = policyFingerprint;
        this.generatedAt = generatedAt;
    }

    // ── Getters ──────────────────────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public Integer getCityId() { return cityId; }
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
    public BigDecimal getBearingDegrees() { return bearingDegrees; }
    public String getPolicyFingerprint() { return policyFingerprint; }
    public Instant getGeneratedAt() { return generatedAt; }
}
