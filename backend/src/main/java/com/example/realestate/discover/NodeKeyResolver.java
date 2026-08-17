package com.example.realestate.discover;

import com.example.realestate.discover.navigation.NavigationGraph;
import com.example.realestate.discover.navigation.NavigationGraphCache;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Shared {@code nodeKey} -&gt; descendant-Area-keys resolution used by discover endpoints that
 * accept a {@code nodeKey} param as an alternative to (or override of) explicit {@code areaKeys}.
 *
 * <p>Resolution steps, identical across callers:
 * <ol>
 *   <li>Look up the active {@link NavigationGraph} for the city (404 {@code city_graph_not_found} if absent).</li>
 *   <li>Validate the node key exists in the graph (400 {@code invalid_node_key} if not).</li>
 *   <li>Reject the root node (400 {@code node_listings_not_eligible: root node is excluded}) — city-wide
 *       browse via {@code nodeKey} is never eligible.</li>
 *   <li>Resolve descendant Area keys and, when {@code maxDescendants} is non-negative, reject if the
 *       descendant count exceeds it (400 {@code node_listings_not_eligible: descendant area count exceeds N}).</li>
 * </ol>
 *
 * <p>Callers differ only in the {@code maxDescendants} bound they pass: pass a negative value to
 * skip the cap entirely (e.g. the markers endpoint, whose real payload bound is the service-level
 * fetch limit, not this eligibility cap).
 */
final class NodeKeyResolver {

    private NodeKeyResolver() {
    }

    static List<String> resolveDescendantAreaKeys(
            NavigationGraphCache navigationGraphCache,
            String city,
            String nodeKey,
            int maxDescendants
    ) {
        NavigationGraph graph = navigationGraphCache.getActiveGraph(city)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "city_graph_not_found"));
        if (!graph.containsNodeKey(nodeKey)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_node_key");
        }
        if ("root".equals(nodeKey)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "node_listings_not_eligible: root node is excluded");
        }
        List<String> descendantAreas = graph.descendantAreaKeysOf(nodeKey);
        if (maxDescendants >= 0 && descendantAreas.size() > maxDescendants) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "node_listings_not_eligible: descendant area count exceeds " + maxDescendants);
        }
        return descendantAreas;
    }
}
