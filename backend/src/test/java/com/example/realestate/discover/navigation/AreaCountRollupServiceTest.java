package com.example.realestate.discover.navigation;

import com.github.benmanes.caffeine.cache.Ticker;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link AreaCountRollupService} (#1955 Areas PR A, SLICE 2e, AC12) — proves the
 * roll-up sums UNIQUE descendant AREA leaves exactly once per node (no double counting across
 * overlapping ancestor subtrees) and that the whole-city area-count map is fetched at most once
 * per (city, revision, filter context) within the cache TTL.
 */
class AreaCountRollupServiceTest {

    private static final BigDecimal Z = BigDecimal.ZERO;

    /** root(CLUSTER, region=north) -> mid(CLUSTER) -> {leaf1(AREA), leaf2(AREA)}; a second
     *  top-level leaf3(AREA) sibling of `mid`. Mirrors a real recursive-cluster shape. */
    private static NavigationGraph buildGraph() {
        Instant now = Instant.now();
        NavigationNode root = node(1L, null, "north", "CLUSTER", "c:north:leaf1-leaf2-leaf3", null,
                List.of("leaf1", "leaf2"), "North", 0, 0, List.of(), 3, now);
        NavigationNode mid = node(2L, 1L, "north", "CLUSTER", "c:north:leaf1-leaf2", null,
                List.of("leaf1", "leaf2"), "Mid", 0, 1, List.of("c:north:leaf1-leaf2-leaf3"), 2, now);
        NavigationNode leaf1 = node(3L, 2L, "north", "AREA", "a:leaf1", "leaf1",
                List.of("leaf1"), "Leaf One", 0, 2, List.of("c:north:leaf1-leaf2-leaf3", "c:north:leaf1-leaf2"), 0, now);
        NavigationNode leaf2 = node(4L, 2L, "north", "AREA", "a:leaf2", "leaf2",
                List.of("leaf2"), "Leaf Two", 1, 2, List.of("c:north:leaf1-leaf2-leaf3", "c:north:leaf1-leaf2"), 0, now);
        NavigationNode leaf3 = node(5L, 1L, "north", "AREA", "a:leaf3", "leaf3",
                List.of("leaf3"), "Leaf Three", 1, 1, List.of("c:north:leaf1-leaf2-leaf3"), 0, now);

        return NavigationGraph.build("testcity", 42L, List.of(root, mid, leaf1, leaf2, leaf3));
    }

    private static NavigationNode node(long id, Long parentId, String regionKey, String nodeType, String nodeKey,
                                        String areaKey, List<String> representativeAreaKeys, String label,
                                        int displayOrder, int depth, List<String> ancestorKeys,
                                        int descendantAreaCount, Instant now) {
        NavigationNode n = new NavigationNode(1, regionKey, nodeType, parentId, nodeKey, areaKey,
                representativeAreaKeys, label, displayOrder, depth, ancestorKeys, descendantAreaCount,
                Z, Z, Z, Z, Z, Z, "fp", now);
        setId(n, id);
        return n;
    }

    /** {@link NavigationNode#getId()} has no public setter (JPA-generated) — set via reflection for
     *  this in-memory-only test fixture, mirroring {@link NavigationGraphTest}'s own approach. */
    private static void setId(NavigationNode n, long id) {
        try {
            var f = NavigationNode.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(n, id);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void countForNode_clusterSumsUniqueDescendantAreasOnly_noDoubleCounting() {
        NavigationGraph graph = buildGraph();
        Map<String, Long> areaCounts = Map.of("leaf1", 5L, "leaf2", 3L, "leaf3", 2L);
        // These tests exercise countForNode/childCounts directly on an already-fetched areaCounts
        // map — the provider is never invoked, so a real (unused) PostgresAreaCountProvider stands
        // in here rather than a mock.
        AreaCountRollupService service = new AreaCountRollupService(
                new PostgresAreaCountProvider(null), null, false, 30, 500, Ticker.systemTicker());

        NavigationNode root = graph.nodeByKey("c:north:leaf1-leaf2-leaf3");
        NavigationNode mid = graph.nodeByKey("c:north:leaf1-leaf2");
        NavigationNode leaf1 = graph.nodeByKey("a:leaf1");

        // root's subtree contains leaf1, leaf2, leaf3 exactly once each — 5+3+2=10, not double
        // counted even though leaf1/leaf2 also appear under `mid`'s own subtree.
        assertThat(service.countForNode(graph, root, areaCounts)).isEqualTo(10L);
        assertThat(service.countForNode(graph, mid, areaCounts)).isEqualTo(8L);
        assertThat(service.countForNode(graph, leaf1, areaCounts)).isEqualTo(5L);
    }

    @Test
    void countForNode_missingAreaKeyInCountsMap_defaultsToZero() {
        NavigationGraph graph = buildGraph();
        Map<String, Long> areaCounts = Map.of("leaf1", 5L); // leaf2/leaf3 absent, not zero-valued
        // These tests exercise countForNode/childCounts directly on an already-fetched areaCounts
        // map — the provider is never invoked, so a real (unused) PostgresAreaCountProvider stands
        // in here rather than a mock.
        AreaCountRollupService service = new AreaCountRollupService(
                new PostgresAreaCountProvider(null), null, false, 30, 500, Ticker.systemTicker());

        NavigationNode root = graph.nodeByKey("c:north:leaf1-leaf2-leaf3");
        assertThat(service.countForNode(graph, root, areaCounts)).isEqualTo(5L);
    }

    @Test
    void childCounts_topLevel_ordersByDisplayOrder() {
        NavigationGraph graph = buildGraph();
        Map<String, Long> areaCounts = Map.of("leaf1", 5L, "leaf2", 3L, "leaf3", 2L);
        // These tests exercise countForNode/childCounts directly on an already-fetched areaCounts
        // map — the provider is never invoked, so a real (unused) PostgresAreaCountProvider stands
        // in here rather than a mock.
        AreaCountRollupService service = new AreaCountRollupService(
                new PostgresAreaCountProvider(null), null, false, 30, 500, Ticker.systemTicker());

        var children = service.childCounts(graph, "c:north:leaf1-leaf2-leaf3", areaCounts);
        assertThat(children).extracting(AreaCountRollupService.NodeCount::nodeKey)
                .containsExactly("c:north:leaf1-leaf2", "a:leaf3");
        assertThat(children).extracting(AreaCountRollupService.NodeCount::count)
                .containsExactly(8L, 2L);
    }

    @Test
    void areaCountsForCity_cachedWithinTtl_providerCalledOnlyOnce() {
        AtomicInteger calls = new AtomicInteger();
        AreaCountProvider provider = q -> {
            calls.incrementAndGet();
            return Map.of("leaf1", 1L);
        };
        // Routed through the OpenSearch seam (enabled=true, non-null OS provider) purely so the
        // invocation count can be observed without standing up a live DB for PostgresAreaCountProvider.
        AreaCountRollupService service = new AreaCountRollupService(
                new PostgresAreaCountProvider(null), provider, true, 30, 500, Ticker.systemTicker());

        AreaCountQuery query = new AreaCountQuery("testcity", null, null, "public");
        service.areaCountsForCity("testcity", 42L, query);
        service.areaCountsForCity("testcity", 42L, query);
        service.areaCountsForCity("testcity", 42L, query);

        assertThat(calls.get()).isEqualTo(1);
    }
}
