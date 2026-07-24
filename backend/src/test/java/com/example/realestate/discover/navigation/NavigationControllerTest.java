package com.example.realestate.discover.navigation;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Web-layer unit test for {@link NavigationController} (#1955 Areas PR A, SLICE 2e, AC8/AC8b) —
 * a plain Mockito test (no {@code @WebMvcTest}/MockMvc) against a real, small, in-memory {@link
 * NavigationGraph}, so the endpoint-shape/structural-vs-counts-separation assertions don't depend
 * on Spring Security context wiring.
 *
 * <p>Fixture: root CLUSTER("c:north:leaf1-leaf2-leaf3") -> {@code mid} CLUSTER("c:north:leaf1-leaf2")
 * -> {leaf1, leaf2} AREA; a sibling leaf3 AREA directly under root.
 */
class NavigationControllerTest {

    private static final BigDecimal Z = BigDecimal.ZERO;

    private final NavigationGraphCache graphCache = mock(NavigationGraphCache.class);
    private final AreaCountRollupService rollupService = mock(AreaCountRollupService.class);
    private final NavigationController controller = new NavigationController(graphCache, rollupService, 300, 30);

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
        try {
            var f = NavigationNode.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(n, id);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
        return n;
    }

    private WebRequest lenientWebRequest() {
        WebRequest wr = mock(WebRequest.class);
        when(wr.checkNotModified(anyString())).thenReturn(false);
        return wr;
    }

    @Test
    void getNode_root_returnsTopLevelChildren_noCounts() {
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        ResponseEntity<NavigationNodeResponse> response = controller.getNode("testcity", "root", lenientWebRequest());

        NavigationNodeResponse body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.nodeKey()).isEqualTo("root");
        assertThat(body.nodeType()).isEqualTo("ROOT");
        assertThat(body.children()).extracting(NavigationNodeResponse.NavigationChildSummary::nodeKey)
                .containsExactly("c:north:leaf1-leaf2-leaf3");
        assertThat(body.nextLevelType()).isEqualTo("CLUSTER");
        assertThat(body.revisionId()).isEqualTo(42L);
    }

    @Test
    void getNode_clusterNode_ancestryAndNextLevelTypeCluster_noSurrogateIdLeak() {
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        NavigationNodeResponse body = controller.getNode(
                "testcity", "c:north:leaf1-leaf2-leaf3", lenientWebRequest()).getBody();

        assertThat(body.ancestry()).isEmpty();
        assertThat(body.depth()).isEqualTo(0);
        assertThat(body.children()).extracting(NavigationNodeResponse.NavigationChildSummary::nodeKey)
                .containsExactly("c:north:leaf1-leaf2", "a:leaf3");
        // Homogeneous direct children -> nextLevelType reflects the child type, not counts.
        assertThat(body.nextLevelType()).isEqualTo("CLUSTER");
        // Structural response never leaks a surrogate id — every identity field is a String key.
        assertThat(body.nodeKey()).isEqualTo("c:north:leaf1-leaf2-leaf3");
    }

    @Test
    void getNode_areaLeaf_nextLevelTypeIsListings() {
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        NavigationNodeResponse body = controller.getNode("testcity", "a:leaf1", lenientWebRequest()).getBody();

        assertThat(body.nodeType()).isEqualTo("AREA");
        assertThat(body.nextLevelType()).isEqualTo("LISTINGS");
        assertThat(body.children()).isEmpty();
        assertThat(body.ancestry()).containsExactly("c:north:leaf1-leaf2-leaf3", "c:north:leaf1-leaf2");
    }

    @Test
    void getNode_unknownNodeKey_404() {
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        assertThatThrownBy(() -> controller.getNode("testcity", "a:does-not-exist", lenientWebRequest()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }

    @Test
    void getNode_cityWithNoActiveGraph_404() {
        when(graphCache.getActiveGraph("ghost-city")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.getNode("ghost-city", "root", lenientWebRequest()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }

    @Test
    void getAreaPath_resolvesFromSameCachedGraph_ancestryMatchesGetNode() {
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        NavigationPathResponse body = controller.getAreaPath("testcity", "leaf1").getBody();

        assertThat(body.areaKey()).isEqualTo("leaf1");
        assertThat(body.nodeKey()).isEqualTo("a:leaf1");
        assertThat(body.ancestry()).extracting(NavigationNodeResponse.NavigationChildSummary::nodeKey)
                .containsExactly("c:north:leaf1-leaf2-leaf3", "c:north:leaf1-leaf2");
    }

    @Test
    void getAreaPath_unknownArea_404() {
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        assertThatThrownBy(() -> controller.getAreaPath("testcity", "no-such-area"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }

    @Test
    void getCounts_node_returnsRolledUpTotalsOnly_structurallySeparateFromGetNode() {
        NavigationGraph graph = buildGraph();
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(graph));
        Map<String, Long> areaCounts = Map.of("leaf1", 5L, "leaf2", 3L, "leaf3", 2L);
        when(rollupService.areaCountsForCity(eq("testcity"), eq(42L), any())).thenReturn(areaCounts);
        when(rollupService.countForNode(any(), any(), eq(areaCounts))).thenReturn(8L);
        when(rollupService.childCounts(any(), eq("c:north:leaf1-leaf2"), eq(areaCounts)))
                .thenReturn(List.of(new AreaCountRollupService.NodeCount("a:leaf1", 5L),
                        new AreaCountRollupService.NodeCount("a:leaf2", 3L)));

        NavigationCountsResponse body = controller.getCounts(
                "testcity", "c:north:leaf1-leaf2", null, null).getBody();

        assertThat(body.nodeKey()).isEqualTo("c:north:leaf1-leaf2");
        assertThat(body.count()).isEqualTo(8L);
        assertThat(body.children()).extracting(AreaCountRollupService.NodeCount::nodeKey)
                .containsExactly("a:leaf1", "a:leaf2");
        assertThat(body.revisionId()).isEqualTo(42L);
    }
}
