package com.example.realestate.discover.navigation;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * Response body for {@code GET /api/discover/cities/{city}/navigation/{nodeKey}} (#1955 Areas PR
 * A, SLICE 2e, AC8). STRUCTURAL ONLY — deliberately carries no listing-count field; counts are a
 * separate endpoint ({@code /navigation/{nodeKey}/counts}, AC8b) so a structural read never pays
 * for (or accidentally staleness-couples to) a count query.
 *
 * <p>Public identity ONLY — {@code nodeKey}/{@code areaKey} everywhere, never a {@link
 * NavigationNode} surrogate {@code id} or {@code parentNodeId}.
 *
 * @param nodeKey        this node's public identity, or the literal {@code "root"} synthetic key
 * @param nodeType        {@code "ROOT"} (synthetic top-of-city), {@code "CLUSTER"}, or {@code "AREA"}
 * @param displayLabel    human label
 * @param depth           0 for a real root CLUSTER/AREA node; {@code -1} for the synthetic {@code "root"}
 * @param regionKey       owning macro-region key (structural metadata)
 * @param ancestry        root -> immediate-parent NODE_KEYS (never surrogate ids)
 * @param nextLevelType   what following a child link leads to: {@code CLUSTER}, {@code AREA}, or
 *                        {@code LISTINGS} (this node is itself an AREA leaf — the next level down
 *                        is a listings page, not more navigation)
 * @param children        direct children, in display order
 * @param revisionId      the production revision this snapshot was built from
 * @param bounds          structural bounds; {@code null} for the synthetic {@code "root"} node
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record NavigationNodeResponse(
        String nodeKey,
        String nodeType,
        String displayLabel,
        int depth,
        String regionKey,
        List<String> ancestry,
        String nextLevelType,
        List<NavigationChildSummary> children,
        long revisionId,
        NavigationBoundsResponse bounds
) {

    public record NavigationChildSummary(String nodeKey, String nodeType, String displayLabel, int displayOrder) {}

    static NavigationChildSummary childSummary(NavigationGraph graph, String childKey) {
        NavigationNode child = graph.nodeByKey(childKey);
        return new NavigationChildSummary(
                child.getNodeKey(), child.getNodeType(), child.getDisplayLabel(), child.getDisplayOrder());
    }

    /** {@code "root"} synthetic city-top-level node — no real {@link NavigationNode} row backs it. */
    static NavigationNodeResponse forRoot(String citySlug, NavigationGraph graph) {
        List<String> rootKeys = graph.childrenOf(null);
        List<NavigationChildSummary> children = rootKeys.stream()
                .map(k -> childSummary(graph, k))
                .toList();
        String nextLevelType = children.isEmpty() ? null : children.get(0).nodeType();
        return new NavigationNodeResponse(
                "root", "ROOT", citySlug, -1, null, List.of(), nextLevelType, children, graph.revisionId(), null);
    }

    static NavigationNodeResponse forNode(NavigationGraph graph, NavigationNode node) {
        List<String> childKeys = graph.childrenOf(node.getNodeKey());
        List<NavigationChildSummary> children = childKeys.stream()
                .map(k -> childSummary(graph, k))
                .toList();
        String nextLevelType;
        if ("AREA".equals(node.getNodeType())) {
            nextLevelType = "LISTINGS";
        } else {
            // Generator invariant: a CLUSTER's direct children are homogeneous in nodeType.
            nextLevelType = children.isEmpty() ? null : children.get(0).nodeType();
        }
        return new NavigationNodeResponse(
                node.getNodeKey(), node.getNodeType(), node.getDisplayLabel(), node.getDepth(),
                node.getRegionKey(), graph.ancestryOf(node.getNodeKey()), nextLevelType, children,
                graph.revisionId(), NavigationBoundsResponse.from(graph.boundsOf(node.getNodeKey())));
    }
}
