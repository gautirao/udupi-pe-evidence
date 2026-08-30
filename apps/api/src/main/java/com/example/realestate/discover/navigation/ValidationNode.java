package com.example.realestate.discover.navigation;

import java.math.BigDecimal;
import java.util.List;

/**
 * Entity-agnostic view over one navigation node, consumed by {@link
 * NavigationTreeValidationService}. Parent linkage is by {@code parentNodeKey} (not a surrogate
 * id) so the exact same validation logic runs identically over:
 * <ul>
 *   <li>an in-memory, pre-persistence {@link GeneratedNode} tree (via {@link
 *       #fromGeneratedNode}) — the primary use, so a bad tree is caught BEFORE any DB write;</li>
 *   <li>a persisted {@code sandbox_navigation_nodes} revision or {@code navigation_nodes} city,
 *       once a future slice adds an id-to-node_key adapter for those.</li>
 * </ul>
 * {@code scopeId} generalizes {@code city_id}/{@code revision_id} for the cross-scope-parentage
 * check.
 *
 * <p>{@code regionKey} (#1956 D6, additive) is the node's own {@code region_key} column — carried
 * so {@link NavigationTreeValidationService}'s new hierarchy-shape invariant can confirm it agrees
 * with the region_key of the node's DIRECTION ancestor.
 */
public record ValidationNode(
        Long scopeId, String nodeKey, String parentNodeKey, String nodeType, String areaKey,
        List<String> representativeAreaKeys, int depth, List<String> ancestorKeys,
        int descendantAreaCount, int displayOrder,
        BigDecimal centreLat, BigDecimal centreLon,
        BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon,
        String regionKey) {

    public static ValidationNode fromGeneratedNode(Long scopeId, GeneratedNode node) {
        return new ValidationNode(
                scopeId, node.nodeKey(), node.parentNodeKey(), node.nodeType(), node.areaKey(),
                node.representativeAreaKeys(), node.depth(), node.ancestorKeys(),
                node.descendantAreaCount(), node.displayOrder(),
                node.centreLat(), node.centreLon(), node.minLat(), node.minLon(), node.maxLat(), node.maxLon(),
                node.regionKey());
    }

    /**
     * Adapter for a persisted {@code navigation_nodes} row (#1955 Areas PR A, SLICE 2d) — used by
     * {@link NavigationGraphLoader} to re-run {@link NavigationTreeValidationService} against the
     * PRODUCTION tree before it is cached. {@code parentNodeKey} must be resolved by the caller
     * (an id-to-node_key map built while walking the depth-ordered row set), since a persisted
     * {@link NavigationNode} only stores its parent's surrogate id, not its node_key.
     */
    public static ValidationNode fromNavigationNode(Long scopeId, NavigationNode node, String parentNodeKey) {
        return new ValidationNode(
                scopeId, node.getNodeKey(), parentNodeKey, node.getNodeType(), node.getAreaKey(),
                node.getRepresentativeAreaKeys(), node.getDepth(), node.getAncestorKeys(),
                node.getDescendantAreaCount(), node.getDisplayOrder(),
                node.getCentreLat(), node.getCentreLon(), node.getMinLat(), node.getMinLon(),
                node.getMaxLat(), node.getMaxLon(), node.getRegionKey());
    }

    /**
     * Adapter for a persisted {@code sandbox_navigation_nodes} row (#1955 Areas PR A, SLICE
     * 2f+2g) — used by the admin preview-tree endpoint to re-run {@link
     * NavigationTreeValidationService} against a revision's SANDBOX tree for display purposes.
     * {@code parentNodeKey} must be resolved by the caller, same contract as {@link
     * #fromNavigationNode}.
     */
    public static ValidationNode fromSandboxNavigationNode(Long scopeId, SandboxNavigationNode node, String parentNodeKey) {
        return new ValidationNode(
                scopeId, node.getNodeKey(), parentNodeKey, node.getNodeType(), node.getAreaKey(),
                node.getRepresentativeAreaKeys(), node.getDepth(), node.getAncestorKeys(),
                node.getDescendantAreaCount(), node.getDisplayOrder(),
                node.getCentreLat(), node.getCentreLon(), node.getMinLat(), node.getMinLon(),
                node.getMaxLat(), node.getMaxLon(), node.getRegionKey());
    }
}
