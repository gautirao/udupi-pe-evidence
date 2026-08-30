package com.example.realestate.discover.navigation;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Immutable, in-memory view of one city's PRODUCTION navigation tree at one revision — the shape
 * cached by {@link NavigationGraphCache} (#1955 Areas PR A, SLICE 2d).
 *
 * <p><b>Never half-built.</b> The only way to obtain an instance is {@link #build}, which either
 * returns a fully-populated, fully-immutable graph or throws — there is no mutable builder state
 * ever visible outside this method, and no setter anywhere on this class.
 *
 * <p><b>Single forward pass, no recursion, no N+1.</b> {@link #build} consumes a flat {@code
 * List<NavigationNode>} already sorted in depth-ascending order (see {@link
 * NavigationNodeRepository#findByCityIdOrderByDepthAscDisplayOrderAsc} and the multi-city preload
 * variant) and walks it exactly once. A node's parent always has a strictly smaller depth and is
 * therefore always already visited — the same invariant {@code CityLaunchPromotionService
 * #promoteNavigationNodes} relies on — so the id-to-key map used to resolve {@code
 * parent_node_id -> parent node_key} is always populated in time, with zero additional DB round
 * trips of any kind (this class never touches the database).
 *
 * <p>Sibling order within {@link #childrenOf} is NOT simply "encounter order" during the single
 * pass: two different parents at the same depth can interleave in a depth-then-display_order
 * global sort, so each parent's accumulated child list is re-sorted by {@code display_order} once
 * after the pass completes — a cheap, bounded (≤ {@code max_direct_children}) in-memory sort, not
 * a second database query.
 */
public final class NavigationGraph {

    /** Synthetic parent key for a city's root nodes (which have {@code parent_node_id = NULL}). */
    public static final String ROOT_PARENT_KEY = "__ROOT__";

    private final String citySlug;
    private final long revisionId;
    private final Map<String, NavigationNode> nodesByKey;
    private final Map<String, List<String>> childrenByParentKey;
    private final Map<String, List<String>> ancestryByNodeKey;
    private final Map<String, List<String>> ancestryByAreaKey;
    private final Map<String, List<String>> descendantAreaKeysByNodeKey;
    private final Map<String, Bounds> boundsByNodeKey;
    private final String checksum;

    private NavigationGraph(
            String citySlug, long revisionId,
            Map<String, NavigationNode> nodesByKey,
            Map<String, List<String>> childrenByParentKey,
            Map<String, List<String>> ancestryByNodeKey,
            Map<String, List<String>> ancestryByAreaKey,
            Map<String, List<String>> descendantAreaKeysByNodeKey,
            Map<String, Bounds> boundsByNodeKey,
            String checksum) {
        this.citySlug = citySlug;
        this.revisionId = revisionId;
        this.nodesByKey = nodesByKey;
        this.childrenByParentKey = childrenByParentKey;
        this.ancestryByNodeKey = ancestryByNodeKey;
        this.ancestryByAreaKey = ancestryByAreaKey;
        this.descendantAreaKeysByNodeKey = descendantAreaKeysByNodeKey;
        this.boundsByNodeKey = boundsByNodeKey;
        this.checksum = checksum;
    }

    /**
     * Builds one immutable {@link NavigationGraph} from {@code flatNodes} — a SINGLE city's rows,
     * already sorted depth-ascending (ties broken by display_order). Throws {@link
     * IllegalStateException} if a node's parent id was not already seen (i.e. the input was not
     * depth-ordered) — a defensive integrity check, unreachable given a correctly-ordered query.
     */
    public static NavigationGraph build(String citySlug, long revisionId, List<NavigationNode> flatNodes) {
        Map<String, NavigationNode> nodesByKey = new LinkedHashMap<>();
        Map<Long, String> idToKey = new HashMap<>();
        Map<String, List<String>> childrenByParentKey = new LinkedHashMap<>();
        Map<String, List<String>> ancestryByNodeKey = new LinkedHashMap<>();
        Map<String, List<String>> ancestryByAreaKey = new LinkedHashMap<>();
        Map<String, List<String>> descendantAreaKeysByNodeKey = new LinkedHashMap<>();
        Map<String, Bounds> boundsByNodeKey = new LinkedHashMap<>();

        for (NavigationNode n : flatNodes) {
            String nodeKey = n.getNodeKey();
            nodesByKey.put(nodeKey, n);
            idToKey.put(n.getId(), nodeKey);

            String parentKey;
            if (n.getParentNodeId() == null) {
                parentKey = ROOT_PARENT_KEY;
            } else {
                parentKey = idToKey.get(n.getParentNodeId());
                if (parentKey == null) {
                    throw new IllegalStateException(
                            "NavigationGraph.build: node " + nodeKey + " (city=" + citySlug + ") references "
                                    + "parent id=" + n.getParentNodeId() + " not yet seen — input must be "
                                    + "depth-ascending");
                }
            }
            childrenByParentKey.computeIfAbsent(parentKey, k -> new ArrayList<>()).add(nodeKey);

            ancestryByNodeKey.put(nodeKey, List.copyOf(n.getAncestorKeys()));
            boundsByNodeKey.put(nodeKey, new Bounds(
                    n.getCentreLat(), n.getCentreLon(), n.getMinLat(), n.getMinLon(), n.getMaxLat(), n.getMaxLon()));
            descendantAreaKeysByNodeKey.computeIfAbsent(nodeKey, k -> new ArrayList<>());

            if ("AREA".equals(n.getNodeType()) && n.getAreaKey() != null) {
                ancestryByAreaKey.put(n.getAreaKey(), List.copyOf(n.getAncestorKeys()));
                descendantAreaKeysByNodeKey.get(nodeKey).add(n.getAreaKey());
                for (String ancestorKey : n.getAncestorKeys()) {
                    descendantAreaKeysByNodeKey.computeIfAbsent(ancestorKey, k -> new ArrayList<>()).add(n.getAreaKey());
                }
            }
        }

        // Re-sort each parent's children by display_order — see class javadoc for why the single
        // encounter-order pass above is not sufficient on its own.
        Map<String, List<String>> sortedChildren = new LinkedHashMap<>();
        for (Map.Entry<String, List<String>> e : childrenByParentKey.entrySet()) {
            List<String> sorted = new ArrayList<>(e.getValue());
            sorted.sort(Comparator.comparing(key -> nodesByKey.get(key).getDisplayOrder()));
            sortedChildren.put(e.getKey(), List.copyOf(sorted));
        }

        Map<String, List<String>> frozenDescendants = new LinkedHashMap<>();
        for (Map.Entry<String, List<String>> e : descendantAreaKeysByNodeKey.entrySet()) {
            frozenDescendants.put(e.getKey(), List.copyOf(e.getValue()));
        }

        String checksum = computeChecksum(nodesByKey);

        return new NavigationGraph(
                citySlug, revisionId,
                Map.copyOf(nodesByKey),
                Map.copyOf(sortedChildren),
                Map.copyOf(ancestryByNodeKey),
                Map.copyOf(ancestryByAreaKey),
                Map.copyOf(frozenDescendants),
                Map.copyOf(boundsByNodeKey),
                checksum);
    }

    // ── Accessors ────────────────────────────────────────────────────────────────────────────

    public String citySlug() {
        return citySlug;
    }

    public long revisionId() {
        return revisionId;
    }

    public String checksum() {
        return checksum;
    }

    public int nodeCount() {
        return nodesByKey.size();
    }

    public NavigationNode nodeByKey(String nodeKey) {
        return nodesByKey.get(nodeKey);
    }

    public boolean containsNodeKey(String nodeKey) {
        return nodesByKey.containsKey(nodeKey);
    }

    /** Direct children of {@code nodeKey}, ordered by display_order — or the city's roots when
     * {@code nodeKey} is {@code null}/{@link #ROOT_PARENT_KEY}. */
    public List<String> childrenOf(String nodeKey) {
        String key = nodeKey == null ? ROOT_PARENT_KEY : nodeKey;
        return childrenByParentKey.getOrDefault(key, List.of());
    }

    /** Root->immediate-parent ancestor node_keys for {@code nodeKey}, or empty if absent/a root. */
    public List<String> ancestryOf(String nodeKey) {
        return ancestryByNodeKey.getOrDefault(nodeKey, List.of());
    }

    /** Root->immediate-parent ancestor node_keys for the AREA node with this area_key. */
    public List<String> ancestryOfArea(String areaKey) {
        return ancestryByAreaKey.getOrDefault(areaKey, List.of());
    }

    /** Every AREA leaf's area_key in {@code nodeKey}'s subtree. For a CLUSTER, every AREA leaf
     * beneath it; for an AREA node, a single-element list containing the node's OWN area_key —
     * it has no descendants below it, but this method includes the node itself rather than
     * returning empty (fix-cycle-1 S8: this javadoc previously claimed "empty for an AREA node's
     * own key", which {@code NavigationGraphTest#build_ancestryDescendantsAndBounds} disproves;
     * see {@link NavigationNodeResponse#forNode} and {@link AreaCountRollupService#countForNode},
     * which both deliberately special-case AREA before calling this method rather than relying on
     * it to return empty). */
    public List<String> descendantAreaKeysOf(String nodeKey) {
        return descendantAreaKeysByNodeKey.getOrDefault(nodeKey, List.of());
    }

    public Bounds boundsOf(String nodeKey) {
        return boundsByNodeKey.get(nodeKey);
    }

    /** All nodes in this graph, in no guaranteed order — used by resolution-ladder scans that must
     * examine every node (#1956 AC18: the {@code /navigation/resolve} stale {@code "c:"}
     * cluster-key rung, which parses the stale key's representative-area segment into known area
     * slugs longest-first and then prefers the DEEPEST CLUSTER whose subtree contains ALL surviving
     * representatives, falling back to the deepest node of ANY type that ALSO contains ALL of them,
     * else nothing — the caller falls through to CITY_ROOT rather than label a partial-containment
     * node ANCESTOR). Not a hot path: only called on a resolve-ladder EXACT-key miss, never on the {@link
     * NavigationController#getNode} structural read path. */
    public Collection<NavigationNode> allNodes() {
        return nodesByKey.values();
    }

    /** Structural bounds snapshot for one node — deliberately NOT a listing-count concept, see
     * {@link NavigationNode} class javadoc. */
    public record Bounds(
            BigDecimal centreLat, BigDecimal centreLon,
            BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon) {
    }

    /**
     * Deterministic content checksum over (node_key, parent_node_id-derived key, depth,
     * display_order, area_key) for every node, sorted by node_key so map iteration order never
     * affects the result. Diagnostic/equality-assertion use only — deliberately NOT the same
     * routine as {@code RevisionChecksum} (a different, promotion-gate concept over sandbox rows).
     */
    private static String computeChecksum(Map<String, NavigationNode> nodesByKey) {
        Map<String, NavigationNode> sorted = new TreeMap<>(nodesByKey);
        StringBuilder raw = new StringBuilder();
        for (Map.Entry<String, NavigationNode> e : sorted.entrySet()) {
            NavigationNode n = e.getValue();
            raw.append(e.getKey()).append('|')
                    .append(n.getParentNodeId()).append('|')
                    .append(n.getDepth()).append('|')
                    .append(n.getDisplayOrder()).append('|')
                    .append(n.getAreaKey()).append('\n');
        }
        return sha256Hex(raw.toString());
    }

    /** sha256 hex digest, duplicated (not shared) from {@code RevisionChecksum#sha256Hex} — see
     * that class's javadoc for why this house convention keeps checksum helpers un-shared. */
    private static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed available on every JVM; unreachable in practice.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
