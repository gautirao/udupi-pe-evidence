package com.example.realestate.discover.navigation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Pure unit test (no Spring, no DB) for {@link NavigationGraph#build} (#1955 Areas PR A, SLICE
 * 2d): single forward pass, immutability, key correctness, and the children-ordering fix for
 * same-depth siblings under different parents.
 *
 * <p>{@link NavigationNode#getId()} is only ever assigned by JPA/Hibernate on persist — there is
 * no production constructor path to set it directly — so {@link #withId} uses reflection to stamp
 * a surrogate id on an in-memory entity, purely for this isolated unit test.
 */
class NavigationGraphTest {

    @Test
    @DisplayName("build: children ordered by display_order even when two parents interleave at "
            + "the same depth in the input list")
    void build_ordersChildrenByDisplayOrder_evenWhenParentsInterleaveInInput() {
        NavigationNode rootA = node(1L, null, "CLUSTER", "root-a", null, List.of(), 0, List.of(), 2);
        NavigationNode rootB = node(2L, null, "CLUSTER", "root-b", null, List.of(), 0, List.of(), 2);
        // Interleaved in the flat list: rootA's 2nd child before rootB's 1st, but display_order
        // must still win.
        NavigationNode aChild2 = leafAt(3L, 1L, "root-a-2", "area-a-2", List.of("root-a"), 2);
        NavigationNode bChild1 = leafAt(4L, 2L, "root-b-1", "area-b-1", List.of("root-b"), 1);
        NavigationNode aChild1 = leafAt(5L, 1L, "root-a-1", "area-a-1", List.of("root-a"), 1);
        NavigationNode bChild2 = leafAt(6L, 2L, "root-b-2", "area-b-2", List.of("root-b"), 2);

        NavigationGraph graph = NavigationGraph.build("testcity", 1L,
                List.of(rootA, rootB, aChild2, bChild1, aChild1, bChild2));

        assertThat(graph.childrenOf("root-a")).containsExactly("root-a-1", "root-a-2");
        assertThat(graph.childrenOf("root-b")).containsExactly("root-b-1", "root-b-2");
        assertThat(graph.childrenOf(null)).containsExactlyInAnyOrder("root-a", "root-b");
    }

    @Test
    @DisplayName("build: ancestry, descendant area keys, and bounds are correct for a 2-level tree")
    void build_ancestryDescendantsAndBounds() {
        NavigationNode root = node(10L, null, "CLUSTER", "root", null, List.of(), 0, List.of(), 2);
        NavigationNode leaf1 = leafAt(11L, 10L, "root-leaf-1", "area-1", List.of("root"), 1);
        NavigationNode leaf2 = leafAt(12L, 10L, "root-leaf-2", "area-2", List.of("root"), 2);

        NavigationGraph graph = NavigationGraph.build("testcity", 5L, List.of(root, leaf1, leaf2));

        assertThat(graph.citySlug()).isEqualTo("testcity");
        assertThat(graph.revisionId()).isEqualTo(5L);
        assertThat(graph.nodeCount()).isEqualTo(3);

        assertThat(graph.ancestryOf("root")).isEmpty();
        assertThat(graph.ancestryOf("root-leaf-1")).containsExactly("root");
        assertThat(graph.ancestryOfArea("area-1")).containsExactly("root");

        assertThat(graph.descendantAreaKeysOf("root")).containsExactlyInAnyOrder("area-1", "area-2");
        assertThat(graph.descendantAreaKeysOf("root-leaf-1")).containsExactly("area-1");

        NavigationGraph.Bounds bounds = graph.boundsOf("root");
        assertThat(bounds.centreLat()).isEqualByComparingTo("13.05");
    }

    @Test
    @DisplayName("build: the returned graph and every collection it exposes are immutable")
    void build_producesImmutableGraph() {
        NavigationNode root = node(20L, null, "CLUSTER", "root", null, List.of(), 0, List.of(), 1);
        NavigationNode leaf = leafAt(21L, 20L, "root-leaf", "area-1", List.of("root"), 1);
        NavigationGraph graph = NavigationGraph.build("testcity", 1L, List.of(root, leaf));

        assertThatThrownBy(() -> graph.childrenOf("root").add("x"))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> graph.ancestryOf("root-leaf").add("x"))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> graph.descendantAreaKeysOf("root").add("x"))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    @DisplayName("build: checksum is deterministic for the same input and stable across re-builds")
    void build_checksumDeterministic() {
        NavigationNode root = node(30L, null, "CLUSTER", "root", null, List.of(), 0, List.of(), 1);
        NavigationNode leaf = leafAt(31L, 30L, "root-leaf", "area-1", List.of("root"), 1);

        NavigationGraph first = NavigationGraph.build("testcity", 1L, List.of(root, leaf));
        NavigationGraph second = NavigationGraph.build("testcity", 1L, List.of(root, leaf));

        assertThat(first.checksum()).isEqualTo(second.checksum()).isNotBlank();
    }

    @Test
    @DisplayName("build: throws when a node's parent id was not already seen (not depth-ordered)")
    void build_throwsOnOutOfOrderInput() {
        NavigationNode leafBeforeParent = leafAt(41L, 40L, "root-leaf", "area-1", List.of("root"), 1);
        NavigationNode root = node(40L, null, "CLUSTER", "root", null, List.of(), 0, List.of(), 1);

        assertThatThrownBy(() -> NavigationGraph.build("testcity", 1L, List.of(leafBeforeParent, root)))
                .isInstanceOf(IllegalStateException.class);
    }

    // ── #<root-display-order-fix> regression: NavigationGraph.childrenOf(root) ordering ─────

    /** Converts a generator-produced multi-region city tree into persisted-shape {@link
     * NavigationNode}s (assigning surrogate ids as {@link NavigationTreeSandboxWriter}/promotion
     * would) and builds a real {@link NavigationGraph} over it, proving the fix threads through
     * to the same public accessor ({@link NavigationGraph#childrenOf}) callers actually use —
     * not just the generator's own in-memory {@code displayOrder} field. */
    private NavigationGraph buildGraphFromGeneratedNodes(List<GeneratedNode> generated) {
        List<GeneratedNode> depthOrdered = generated.stream()
                .sorted(java.util.Comparator.comparing(GeneratedNode::depth)
                        .thenComparing(GeneratedNode::displayOrder))
                .toList();

        java.util.Map<String, Long> idByNodeKey = new java.util.HashMap<>();
        List<NavigationNode> flat = new ArrayList<>();
        long nextId = 1L;
        for (GeneratedNode g : depthOrdered) {
            long id = nextId++;
            Long parentId = g.parentNodeKey() == null ? null : idByNodeKey.get(g.parentNodeKey());
            NavigationNode n = new NavigationNode(
                    1, g.regionKey(), g.nodeType(), parentId, g.nodeKey(), g.areaKey(),
                    g.representativeAreaKeys(), g.displayLabel(), g.displayOrder(), g.depth(),
                    g.ancestorKeys(), g.descendantAreaCount(),
                    g.centreLat(), g.centreLon(), g.minLat(), g.minLon(), g.maxLat(), g.maxLon(),
                    g.policyFingerprint(), g.generatedAt());
            withId(n, id);
            idByNodeKey.put(g.nodeKey(), id);
            flat.add(n);
        }
        return NavigationGraph.build("testcity", 1L, flat);
    }

    @Test
    @DisplayName("[regression] NavigationGraph.childrenOf(null) for a real multi-region generator "
            + "city is deterministic and gapless — proves the root display_order fix survives the "
            + "generator->persisted-entity->graph pipeline, not just the generator's own output")
    void childrenOf_root_deterministicAcrossShuffledRegionInputForGeneratedCity() {
        NavigationTreeGenerator generator = new NavigationTreeGenerator();
        GeneratorPolicy policy = new GeneratorPolicy(
                4, 2, 5, true, BigDecimal.valueOf(0.35), BigDecimal.valueOf(0.5),
                "GEOMETRIC_BISECTION", "CENTROID_NEAREST", "ATTACH_NEAREST_CLUSTER", "AREA_CENTROID_MEAN");
        Instant generatedAt = Instant.parse("2026-01-01T00:00:00Z");

        List<GeneratorRegionInput> ordered = List.of(
                new GeneratorRegionInput("north", List.of(genArea("city|n1", "N1", 13.0))),
                new GeneratorRegionInput("south", List.of(genArea("city|s1", "S1", 12.0))),
                new GeneratorRegionInput("east", List.of(genArea("city|e1", "E1", 12.5))));
        List<GeneratorRegionInput> shuffled = new ArrayList<>(List.of(ordered.get(2), ordered.get(0), ordered.get(1)));

        NavigationGraph graphOrdered = buildGraphFromGeneratedNodes(
                generator.generateCity(ordered, policy, "fp", generatedAt));
        NavigationGraph graphShuffled = buildGraphFromGeneratedNodes(
                generator.generateCity(shuffled, policy, "fp", generatedAt));

        // region_key sort is fixed (east, north, south) regardless of input order, so both graphs'
        // root children lists must be identical and gapless.
        assertThat(graphOrdered.childrenOf(null)).hasSize(3);
        assertThat(graphOrdered.childrenOf(null)).isEqualTo(graphShuffled.childrenOf(null));
        for (String rootKey : graphOrdered.childrenOf(null)) {
            assertThat(graphOrdered.nodeByKey(rootKey).getParentNodeId()).isNull();
        }
        List<Integer> rootDisplayOrders = graphOrdered.childrenOf(null).stream()
                .map(k -> graphOrdered.nodeByKey(k).getDisplayOrder())
                .sorted()
                .toList();
        assertThat(rootDisplayOrders).containsExactly(1, 2, 3);
    }

    private static GeneratorArea genArea(String areaKey, String name, double lat) {
        BigDecimal latBd = BigDecimal.valueOf(lat);
        BigDecimal lon = BigDecimal.valueOf(77.0);
        return new GeneratorArea(areaKey, name, latBd, lon,
                latBd.subtract(BigDecimal.valueOf(0.01)), lon.subtract(BigDecimal.valueOf(0.01)),
                latBd.add(BigDecimal.valueOf(0.01)), lon.add(BigDecimal.valueOf(0.01)));
    }

    // ── Fixture helpers ──────────────────────────────────────────────────────────────────────────

    private static NavigationNode leafAt(long id, long parentId, String nodeKey, String areaKey,
                                          List<String> ancestorKeys, int displayOrder) {
        NavigationNode n = node(id, parentId, "AREA", nodeKey, areaKey, ancestorKeys, 1, List.of(areaKey), 1);
        return withDisplayOrder(n, displayOrder);
    }

    private static NavigationNode node(long id, Long parentId, String nodeType, String nodeKey, String areaKey,
                                        List<String> ancestorKeys, int depth, List<String> representativeAreaKeys,
                                        int descendantAreaCount) {
        NavigationNode n = new NavigationNode(
                1, "north", nodeType, parentId, nodeKey, areaKey,
                representativeAreaKeys.isEmpty() ? List.of("area-1") : representativeAreaKeys,
                nodeKey, 1, depth, ancestorKeys, descendantAreaCount,
                BigDecimal.valueOf(13.05), BigDecimal.valueOf(77.59),
                BigDecimal.valueOf(13.0), BigDecimal.valueOf(77.5),
                BigDecimal.valueOf(13.1), BigDecimal.valueOf(77.7),
                "fp", Instant.parse("2026-01-01T00:00:00Z"));
        return withId(n, id);
    }

    private static NavigationNode withDisplayOrder(NavigationNode n, int displayOrder) {
        try {
            Field f = NavigationNode.class.getDeclaredField("displayOrder");
            f.setAccessible(true);
            f.set(n, displayOrder);
            return n;
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Reflection-stamped surrogate id — see class javadoc for why this is unavoidable here. */
    private static NavigationNode withId(NavigationNode n, long id) {
        try {
            Field f = NavigationNode.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(n, id);
            return n;
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
