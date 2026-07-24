package com.example.realestate.discover.navigation;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Persists an already-{@link NavigationTreeValidationService validated} {@link GeneratedNode}
 * tree into {@code sandbox_navigation_nodes} for a revision. Insert+read only, matching the
 * sandbox_* family convention — a row is never mutated after being written here.
 *
 * <p>Nodes are inserted in a topological (root-first) order derived from {@code depth} + {@code
 * parentNodeKey} + {@code displayOrder}, so each child's surrogate {@code parent_node_id} is
 * already known by the time it is inserted — parent linkage on the wire is by {@code node_key}
 * only (D5); the DB surrogate id is resolved here, exactly once, at persistence time.
 */
@Component
public class NavigationTreeSandboxWriter {

    private final SandboxNavigationNodeRepository repository;

    public NavigationTreeSandboxWriter(SandboxNavigationNodeRepository repository) {
        this.repository = repository;
    }

    /**
     * REPLACE-discipline (#1955 Areas PR A, SLICE 2f+2g): clears any prior sandbox row set for this
     * revision before inserting the freshly (re)generated tree, so calling this a second time for
     * the SAME revision — the override-endpoint regeneration path — is a clean wholesale swap
     * rather than a {@code uq_sandbox_navigation_nodes_revision_node_key} collision. A no-op DELETE
     * on a revision's first-ever generation (nothing to clear yet).
     */
    @Transactional
    public List<Long> persist(Long revisionId, List<GeneratedNode> nodes) {
        repository.deleteByRevisionId(revisionId);

        List<GeneratedNode> insertOrder = nodes.stream()
                .sorted(Comparator.comparingInt(GeneratedNode::depth)
                        .thenComparing(n -> n.parentNodeKey() == null ? "" : n.parentNodeKey())
                        .thenComparingInt(GeneratedNode::displayOrder))
                .toList();

        Map<String, Long> idByNodeKey = new HashMap<>();
        List<Long> insertedIds = new ArrayList<>(insertOrder.size());

        for (GeneratedNode node : insertOrder) {
            Long parentId = node.parentNodeKey() == null ? null : idByNodeKey.get(node.parentNodeKey());
            if (node.parentNodeKey() != null && parentId == null) {
                throw new IllegalStateException(
                        "Cannot persist node " + node.nodeKey() + ": parent " + node.parentNodeKey()
                                + " was not inserted before it (insert-order bug, or an invalid tree that "
                                + "NavigationTreeValidationService should have caught first)");
            }

            SandboxNavigationNode saved = repository.save(new SandboxNavigationNode(
                    revisionId, node.regionKey(), node.nodeType(), parentId, node.nodeKey(), node.areaKey(),
                    node.representativeAreaKeys(), node.displayLabel(), node.displayOrder(), node.depth(),
                    node.ancestorKeys(), node.descendantAreaCount(), node.centreLat(), node.centreLon(),
                    node.minLat(), node.minLon(), node.maxLat(), node.maxLon(),
                    node.policyFingerprint(), node.generatedAt()));

            idByNodeKey.put(node.nodeKey(), saved.getId());
            insertedIds.add(saved.getId());
        }
        return insertedIds;
    }
}
