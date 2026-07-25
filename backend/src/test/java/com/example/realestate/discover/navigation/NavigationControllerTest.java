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
import static org.mockito.Mockito.verify;
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
        return buildGraph(42L);
    }

    /**
     * Same fixture as {@link #buildGraph()}, but at an arbitrary {@code revisionId} — used by
     * {@link #resolve_etagDiffersAcrossRevisionId_whenChecksumIsIdentical} to prove the resolve
     * ETag basis includes {@code revisionId} even when the node content (and therefore {@link
     * NavigationGraph#checksum()}) is unchanged.
     */
    private static NavigationGraph buildGraph(long revisionId) {
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
        return NavigationGraph.build("testcity", revisionId, List.of(root, mid, leaf1, leaf2, leaf3));
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
        // #1956 AC16: the root crumb's displayLabel is a canonical, title-cased city label — never
        // the raw city_slug verbatim.
        assertThat(body.displayLabel()).isEqualTo("Testcity");
    }

    @Test
    void getNode_clusterNode_ancestryAndNextLevelTypeCluster_noSurrogateIdLeak() {
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        NavigationNodeResponse body = controller.getNode(
                "testcity", "c:north:leaf1-leaf2-leaf3", lenientWebRequest()).getBody();

        assertThat(body.ancestry()).isEmpty();
        assertThat(body.depth()).isEqualTo(0);
        assertThat(body.descendantAreaKeys()).containsExactlyInAnyOrder("leaf1", "leaf2", "leaf3");
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
        assertThat(body.ancestry()).extracting(NavigationNodeResponse.NavigationChildSummary::nodeKey)
                .containsExactly("c:north:leaf1-leaf2-leaf3", "c:north:leaf1-leaf2");
        // #1956 AC19: an AREA leaf has no descendants below it — mapping-layer empty list.
        assertThat(body.descendantAreaKeys()).isEmpty();
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
    void getNode_midCluster_ancestryLabelled_withNodeKeyAndDisplayLabel() {
        // #1956 AC16: ancestry entries carry displayLabel too, not just bare nodeKey.
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        NavigationNodeResponse body = controller.getNode(
                "testcity", "c:north:leaf1-leaf2", lenientWebRequest()).getBody();

        assertThat(body.ancestry())
                .extracting(NavigationNodeResponse.NavigationChildSummary::nodeKey,
                        NavigationNodeResponse.NavigationChildSummary::displayLabel)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("c:north:leaf1-leaf2-leaf3", "North"));
    }

    @Test
    void getNode_vs_getAreaPath_ancestry_identicalOrderedPairs_forSameArea() {
        // #1956: the whole point of the shared childSummary mapper over ONE cached graph is that
        // guided navigation (getNode) and direct search (getAreaPath) ancestry are byte-identical
        // by construction, not just schema-identical.
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        NavigationNodeResponse nodeBody = controller.getNode("testcity", "a:leaf1", lenientWebRequest()).getBody();
        NavigationPathResponse pathBody = controller.getAreaPath("testcity", "leaf1").getBody();

        assertThat(nodeBody.ancestry()).containsExactlyElementsOf(pathBody.ancestry());
    }

    // ── #1956 AC17/AC18: /navigation/resolve ladder ─────────────────────────────────────────────

    @Test
    void resolve_exactRoot_returnsExactAndCanonicalRootLabel() {
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        NavigationResolveResponse body = controller.resolve("testcity", "root", lenientWebRequest()).getBody();

        assertThat(body.resolution()).isEqualTo(NavigationResolution.EXACT);
        assertThat(body.requested()).isEqualTo("root");
        assertThat(body.node().nodeKey()).isEqualTo("root");
        assertThat(body.node().displayLabel()).isEqualTo("Testcity");
        assertThat(body.revisionId()).isEqualTo(42L);
    }

    @Test
    void resolve_exactExistingClusterKey_returnsExact() {
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        NavigationResolveResponse body = controller.resolve(
                "testcity", "c:north:leaf1-leaf2-leaf3", lenientWebRequest()).getBody();

        assertThat(body.resolution()).isEqualTo(NavigationResolution.EXACT);
        assertThat(body.node().nodeKey()).isEqualTo("c:north:leaf1-leaf2-leaf3");
    }

    @Test
    void resolve_staleClusterKey_representativeAreaStillPresent_resolvesToDeepestContainingAncestor() {
        // Fix-cycle-1 B1 / fix-cycle-3 S-2: "c:north:<gone-suffix>" is not an exact node key, but
        // its representative-area segment still contains "leaf1" — a real, still-current AREA
        // leaf's slug. Both the root (depth 0) and "mid" (depth 1) CLUSTERs genuinely contain
        // "leaf1" in their subtree — S-2 now prefers the DEEPEST such node ("mid"), analogous to
        // the "a:" rung's deepest-surviving-ancestor policy, rather than fix-cycle-1's
        // shallowest-any policy (which returned the coarser root here). The "leaf1" AREA node
        // itself also technically "contains" leaf1, but deepestContainingAll is restricted to
        // CLUSTER-typed candidates — a "c:" key must resolve to a CLUSTER here, never to the AREA
        // leaf, even though (fix-cycle-4) AREA nodes are no longer excluded from the shallowest-any
        // fallback in general.
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        NavigationResolveResponse body = controller.resolve(
                "testcity", "c:north:leaf1-no-longer-a-real-cluster-suffix", lenientWebRequest()).getBody();

        assertThat(body.resolution()).isEqualTo(NavigationResolution.ANCESTOR);
        assertThat(body.node().nodeKey()).isEqualTo("c:north:leaf1-leaf2");
    }

    @Test
    void resolve_staleClusterKey_twoSurvivingRepresentatives_prefersDeepestClusterOverShallowerRoot() {
        // #1956 fix-cycle-6 hardening: the ONLY other ANCESTOR-asserting "c:" test with >=1 surviving
        // representative in this suite uses a SINGLE surviving rep ("leaf1" alone, see
        // resolve_staleClusterKey_representativeAreaStillPresent_resolvesToDeepestContainingAncestor
        // above). With a single rep, "deepest containing all" and "deepest containing any" always
        // agree, so containsAll's actual job — requiring the WHOLE set, not just one member — is
        // never exercised. Here BOTH "leaf1" and "leaf2" survive, and both root (depth 0) and mid
        // (depth 1) genuinely contain both — this guards the DEPTH-preference half of the policy
        // (deepest, not shallowest, of the nodes that qualify): a regression back to fix-cycle-1's
        // shallowest-containing-any policy would return root here instead of mid.
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        NavigationResolveResponse body = controller.resolve(
                "testcity", "c:north:leaf1-leaf2-gone", lenientWebRequest()).getBody();

        assertThat(body.resolution()).isEqualTo(NavigationResolution.ANCESTOR);
        assertThat(body.node().nodeKey()).isEqualTo("c:north:leaf1-leaf2");
    }

    @Test
    void resolve_staleClusterKey_representativesSpanMidAndItsSibling_escalatesToSharedAncestor_notPartialMid() {
        // #1956 fix-cycle-6 hardening — THE test that closes the actual coverage hole: every other
        // ANCESTOR-asserting "c:" test in this suite resolves to exactly ONE surviving representative,
        // so "containsAll" vs "containsAny" is asserted only in the direction that returns
        // null/CITY_ROOT (see the disjoint-sibling and split-representative tests below). Nothing in
        // the suite failed when the fix-cycle-6 defect regressed containsAll back to containsAny on
        // THIS shape, because that regression still returns a plausible-looking non-root cluster key
        // here — just the WRONG one.
        //
        // "leaf3" and "leaf1" survive. "mid" ("c:north:leaf1-leaf2") contains leaf1 but NOT leaf3 —
        // under a hypothetical containsANY implementation, mid still matches (it contains leaf1) and,
        // being deeper than root, would incorrectly win. Only "root"
        // ("c:north:leaf1-leaf2-leaf3") genuinely contains BOTH leaf1 and leaf3, so the fixed
        // containsALL implementation must escalate past mid to root.
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        NavigationResolveResponse body = controller.resolve(
                "testcity", "c:north:leaf3-leaf1", lenientWebRequest()).getBody();

        assertThat(body.resolution()).isEqualTo(NavigationResolution.ANCESTOR);
        assertThat(body.node().nodeKey())
                .isEqualTo("c:north:leaf1-leaf2-leaf3")
                .isNotEqualTo("c:north:leaf1-leaf2");
    }

    @Test
    void resolve_staleClusterKey_prefixNestedAreaSlugs_neverFalselyMatchesShorterPrefixSibling() {
        // Fix-cycle-3 S-1: the reviewer's exact reproduction shape. "hebbal" is a "-"-delimited
        // PREFIX of "hebbal-kempapura" (the real V106 pair: IN|KA|Bengaluru|Hebbal vs. IN|KA|
        // Bengaluru|Hebbal Kempapura). The two areas live under UNRELATED depth-0 sibling clusters.
        // The pre-fix substring `segment.contains(slug(areaKey))` check treats "hebbal" as
        // contained in ANY segment that actually names "hebbal-kempapura" too (a real substring —
        // wrapping both sides in "-" does not help, since the prefix boundary is itself a genuine
        // "-" in the segment), so BOTH clusters would falsely match and the sibling with the
        // alphabetically-smaller nodeKey ("c:north:hebbal" sorts before "c:north:hebbal-kempapura")
        // would win the pre-fix tie-break — the WRONG, disjoint cluster.
        Instant now = Instant.now();
        NavigationNode clusterHebbal = node(70L, null, "north", "CLUSTER", "c:north:hebbal", null,
                List.of("hebbal"), "Hebbal Cluster", 0, 0, List.of(), 1, now);
        NavigationNode hebbal = node(71L, 70L, "north", "AREA", "a:hebbal", "hebbal",
                List.of("hebbal"), "Hebbal", 0, 1, List.of("c:north:hebbal"), 0, now);
        NavigationNode clusterHebbalKempapura = node(80L, null, "north", "CLUSTER", "c:north:hebbal-kempapura", null,
                List.of("hebbal-kempapura"), "Hebbal Kempapura Cluster", 1, 0, List.of(), 1, now);
        NavigationNode hebbalKempapura = node(81L, 80L, "north", "AREA", "a:hebbal-kempapura", "hebbal-kempapura",
                List.of("hebbal-kempapura"), "Hebbal Kempapura", 0, 1, List.of("c:north:hebbal-kempapura"), 0, now);
        NavigationGraph graph = NavigationGraph.build("prefixcity", 11L,
                List.of(clusterHebbal, hebbal, clusterHebbalKempapura, hebbalKempapura));
        when(graphCache.getActiveGraph("prefixcity")).thenReturn(Optional.of(graph));

        // Stale key genuinely derived from the LONGER area ("hebbal-kempapura") — the trailing
        // "-some-gone-suffix" text guarantees this exact key is stale (never a real generator
        // output), while its leading slug is the real, still-current "hebbal-kempapura" area.
        String staleKey = "c:north:" + NavigationKeys.slug("hebbal-kempapura") + "-some-gone-suffix";
        NavigationResolveResponse body = controller.resolve("prefixcity", staleKey, lenientWebRequest()).getBody();

        assertThat(body.resolution()).isEqualTo(NavigationResolution.ANCESTOR);
        assertThat(body.node().nodeKey())
                .isEqualTo("c:north:hebbal-kempapura")
                .isNotEqualTo("c:north:hebbal");
        assertThat(body.node().descendantAreaKeys()).contains("hebbal-kempapura");
    }

    @Test
    void resolve_staleClusterKey_representativesSplitAcrossSubtrees_fallsBackToCityRootNeverAPartialSiblingMatch() {
        // Fix-cycle-5 (this cycle): the surviving representatives have since scattered so that NO
        // single node's subtree — of ANY type — contains BOTH "areaA1" and "areaB1"; clusterA and
        // clusterB are unrelated depth-0 siblings (parentNodeId=null), each containing only HALF of
        // the requested geography. Structurally: clusterA.descendantAreaKeys = {areaA1, areaA2},
        // clusterB.descendantAreaKeys = {areaB1, areaB2} — disjoint from each other, and the
        // synthetic "root" is not itself in NavigationGraph#allNodes() (see the class javadoc), so
        // there is NO node anywhere in this fixture whose subtree contains both representatives.
        //
        // Fix-cycle-3/4 previously fell back to the SHALLOWEST node containing ANY surviving
        // representative and labelled it ANCESTOR — here that returned clusterA, which does NOT
        // contain "areaB1" at all, silently discarding half of the requested geography behind a
        // false ANCESTOR label. The honest answer, matching the existing no-surviving-representative
        // -> CITY_ROOT precedent, is CITY_ROOT: nothing in this graph genuinely reattaches to both
        // halves of the stale key.
        //
        // This FAILS against pre-fix code: pre-fix resolveClusterKeyByContainment's shallowest-any
        // fallback returns clusterA (both candidates tie at depth 0; "c:north:areaA1-areaA2" sorts
        // before "c:north:areaB1-areaB2") and the caller labels it ANCESTOR — the exact defect this
        // cycle fixes. Post-fix, deepestContainingAllCluster and deepestContainingAllAnyType are both
        // null (no candidate's subtree contains BOTH slugs), so resolveClusterKeyByContainment
        // returns null and the caller falls through to CITY_ROOT.
        Instant now = Instant.now();
        NavigationNode clusterA = node(90L, null, "north", "CLUSTER", "c:north:areaA1-areaA2", null,
                List.of("areaA1", "areaA2"), "Cluster A", 0, 0, List.of(), 2, now);
        NavigationNode areaA1 = node(91L, 90L, "north", "AREA", "a:areaA1", "areaA1",
                List.of("areaA1"), "Area A1", 0, 1, List.of("c:north:areaA1-areaA2"), 0, now);
        NavigationNode areaA2 = node(92L, 90L, "north", "AREA", "a:areaA2", "areaA2",
                List.of("areaA2"), "Area A2", 1, 1, List.of("c:north:areaA1-areaA2"), 0, now);
        NavigationNode clusterB = node(100L, null, "north", "CLUSTER", "c:north:areaB1-areaB2", null,
                List.of("areaB1", "areaB2"), "Cluster B", 1, 0, List.of(), 2, now);
        NavigationNode areaB1 = node(101L, 100L, "north", "AREA", "a:areaB1", "areaB1",
                List.of("areaB1"), "Area B1", 0, 1, List.of("c:north:areaB1-areaB2"), 0, now);
        NavigationNode areaB2 = node(102L, 100L, "north", "AREA", "a:areaB2", "areaB2",
                List.of("areaB2"), "Area B2", 1, 1, List.of("c:north:areaB1-areaB2"), 0, now);
        NavigationGraph graph = NavigationGraph.build(
                "splitcity", 13L, List.of(clusterA, clusterB, areaA1, areaA2, areaB1, areaB2));
        when(graphCache.getActiveGraph("splitcity")).thenReturn(Optional.of(graph));

        String staleKey = "c:north:" + NavigationKeys.slug("areaA1") + "-" + NavigationKeys.slug("areaB1");
        NavigationResolveResponse body = controller.resolve("splitcity", staleKey, lenientWebRequest()).getBody();

        assertThat(body.resolution()).isEqualTo(NavigationResolution.CITY_ROOT);
        assertThat(body.node().nodeKey()).isEqualTo("root");
    }

    @Test
    void resolve_staleClusterKey_representativesSpanTwoSiblingAreaNodes_noClusterAnywhere_fallsBackToCityRoot() {
        // #1956 fix-cycle-5 item 5(a): a collapsed region with MULTIPLE sibling AREA nodes (no
        // CLUSTER anywhere), where the stale key's representatives span TWO of those siblings. Per
        // the fix, "contains ALL" is required even for the any-type search — an AREA node's own
        // subtree contains only itself (NavigationGraph#descendantAreaKeysOf), so neither sibling
        // AREA can ever contain the OTHER sibling's area too. No node here contains both
        // representatives, so this must be CITY_ROOT, never one sibling mislabelled ANCESTOR.
        //
        // This FAILS against pre-fix code: the shallowest-any fallback (unrestricted by type since
        // fix-cycle-4) would happily match EITHER sibling AREA on containsAny and return the
        // depth-0-tie-broken winner as a false ANCESTOR, exactly like the disjoint-CLUSTER case
        // above.
        Instant now = Instant.now();
        NavigationNode southArea1 = node(210L, null, "south", "AREA", "a:southarea1", "southarea1",
                List.of("southarea1"), "South Area One", 0, 0, List.of(), 0, now);
        NavigationNode southArea2 = node(211L, null, "south", "AREA", "a:southarea2", "southarea2",
                List.of("southarea2"), "South Area Two", 1, 0, List.of(), 0, now);
        NavigationGraph graph = NavigationGraph.build(
                "collapsedsplitcity", 22L, List.of(southArea1, southArea2));
        when(graphCache.getActiveGraph("collapsedsplitcity")).thenReturn(Optional.of(graph));

        String staleKey = "c:south:" + NavigationKeys.slug("southarea1") + "-" + NavigationKeys.slug("southarea2");
        NavigationResolveResponse body = controller.resolve("collapsedsplitcity", staleKey, lenientWebRequest()).getBody();

        assertThat(body.resolution()).isEqualTo(NavigationResolution.CITY_ROOT);
        assertThat(body.node().nodeKey()).isEqualTo("root");
    }

    @Test
    void resolve_staleClusterKey_singleSurvivorAmongSeveralSiblingAreas_noClusterAnywhere_resolvesToContainingArea() {
        // #1956 fix-cycle-5 item 5(b): same collapsed, no-CLUSTER-anywhere region with MULTIPLE
        // sibling AREA nodes, but this time only ONE representative survives (the other segment
        // fragment fails to parse against any known slug). This must still resolve to the single
        // surviving AREA as ANCESTOR — preserving fix-cycle-4's collapsed-region fix — and must NOT
        // regress to CITY_ROOT just because there are now multiple sibling AREA nodes in the graph.
        //
        // This FAILS against pre-fix code in a different way than the other two new tests: pre-fix,
        // shallowestContainingAny (unrestricted by type) also resolves this correctly today, so this
        // specific assertion would already pass pre-fix — it exists to GUARD the fix-cycle-4 behaviour
        // under the fix-cycle-5 change, proving the rewrite doesn't accidentally narrow
        // deepestContainingAllAnyType back down to "must be the only node in the graph" or similar.
        Instant now = Instant.now();
        NavigationNode southArea1 = node(220L, null, "south", "AREA", "a:southarea1", "southarea1",
                List.of("southarea1"), "South Area One", 0, 0, List.of(), 0, now);
        NavigationNode southArea2 = node(221L, null, "south", "AREA", "a:southarea2", "southarea2",
                List.of("southarea2"), "South Area Two", 1, 0, List.of(), 0, now);
        NavigationGraph graph = NavigationGraph.build(
                "collapsedsiblingcity", 23L, List.of(southArea1, southArea2));
        when(graphCache.getActiveGraph("collapsedsiblingcity")).thenReturn(Optional.of(graph));

        String staleKey = "c:south:" + NavigationKeys.slug("southarea1") + "-no-longer-a-real-cluster-suffix";
        NavigationResolveResponse body = controller.resolve("collapsedsiblingcity", staleKey, lenientWebRequest()).getBody();

        assertThat(body.resolution()).isEqualTo(NavigationResolution.ANCESTOR);
        assertThat(body.node().nodeKey()).isEqualTo("a:southarea1");
    }

    @Test
    void resolve_staleClusterKey_noSurvivingRepresentativeArea_fallsBackToCityRoot() {
        // Fix-cycle-1 B1: a "c:" key whose representative-area segment matches NO current area's
        // slug must fall through to CITY_ROOT rather than the old region-only heuristic's ANCESTOR
        // — an honest "nothing to reattach to" beats a false ANCESTOR built on region alone.
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        NavigationResolveResponse body = controller.resolve(
                "testcity", "c:north:no-longer-a-real-cluster-suffix", lenientWebRequest()).getBody();

        assertThat(body.resolution()).isEqualTo(NavigationResolution.CITY_ROOT);
        assertThat(body.node().nodeKey()).isEqualTo("root");
    }

    @Test
    void resolve_staleClusterKey_depthZeroSiblings_neverMislabelsTheUnrelatedSiblingAsAncestor() {
        // Fix-cycle-1 B1/S5: NavigationTreeGenerator#expand calls expand per region with depth=0,
        // parentNodeKey=null — when a region splits at depth 0 BOTH partition halves are emitted as
        // depth-0 CLUSTERs with parentNodeKey=null. Neither is an ancestor of the other. The PRIOR
        // region-only heuristic broke ties by nodeKey.compareTo — an arbitrary pick between two
        // unrelated siblings — so a stale key genuinely derived from clusterB's geography could
        // resolve to clusterA (alphabetically first) and be mislabelled ANCESTOR despite clusterA's
        // descendantAreaKeys being entirely disjoint from the requested geography.
        //
        // clusterA ("c:north:areaA1-areaA2") and clusterB ("c:north:areaB1-areaB2") are BOTH depth 0,
        // parentNodeId=null, region "north" — exactly the sibling shape #1956's Bangalore-scale
        // production case hits on every region that splits at depth 0.
        Instant now = Instant.now();
        NavigationNode clusterA = node(10L, null, "north", "CLUSTER", "c:north:areaA1-areaA2", null,
                List.of("areaA1", "areaA2"), "Cluster A", 0, 0, List.of(), 2, now);
        NavigationNode areaA1 = node(11L, 10L, "north", "AREA", "a:areaA1", "areaA1",
                List.of("areaA1"), "Area A1", 0, 1, List.of("c:north:areaA1-areaA2"), 0, now);
        NavigationNode areaA2 = node(12L, 10L, "north", "AREA", "a:areaA2", "areaA2",
                List.of("areaA2"), "Area A2", 1, 1, List.of("c:north:areaA1-areaA2"), 0, now);
        NavigationNode clusterB = node(20L, null, "north", "CLUSTER", "c:north:areaB1-areaB2", null,
                List.of("areaB1", "areaB2"), "Cluster B", 1, 0, List.of(), 2, now);
        NavigationNode areaB1 = node(21L, 20L, "north", "AREA", "a:areaB1", "areaB1",
                List.of("areaB1"), "Area B1", 0, 1, List.of("c:north:areaB1-areaB2"), 0, now);
        NavigationNode areaB2 = node(22L, 20L, "north", "AREA", "a:areaB2", "areaB2",
                List.of("areaB2"), "Area B2", 1, 1, List.of("c:north:areaB1-areaB2"), 0, now);
        NavigationGraph siblingGraph = NavigationGraph.build(
                "siblingcity", 7L, List.of(clusterA, clusterB, areaA1, areaA2, areaB1, areaB2));
        when(graphCache.getActiveGraph("siblingcity")).thenReturn(Optional.of(siblingGraph));

        // Stale key genuinely derived from clusterB's own representative area ("areaB1"), NOT A —
        // the OLD region-only heuristic would have returned clusterA here (nodeKey.compareTo:
        // "c:north:areaA1-areaA2" < "c:north:areaB1-areaB2"). Segment must be pre-sluggified
        // (lowercased) exactly like a real generator-minted key would be, since the containment
        // check compares against NavigationKeys.slug(areaKey), not the raw area_key.
        String staleKey = "c:north:" + NavigationKeys.slug("areaB1") + "-no-longer-a-real-cluster-suffix";
        NavigationResolveResponse body = controller.resolve("siblingcity", staleKey, lenientWebRequest()).getBody();

        assertThat(body.resolution()).isEqualTo(NavigationResolution.ANCESTOR);
        assertThat(body.node().nodeKey()).isEqualTo("c:north:areaB1-areaB2");
        assertThat(body.node().nodeKey()).isNotEqualTo("c:north:areaA1-areaA2");
    }

    @Test
    void resolve_staleClusterKey_collapsedRegionNoClusterAnywhere_resolvesToDepthZeroAreaAncestor() {
        // Fix-cycle-4: NavigationTreeGenerator#expand emits AREA leaves at depth=0 with
        // parentNodeKey=null whenever a region's member count is <= maxDirectChildren, or a split
        // is rejected (oneChildPrevention/minAreasPerCluster) — so a region (or a whole small city)
        // can collapse to depth-0 AREA leaves with ZERO CLUSTER nodes anywhere in it. A client
        // holding a stale "c:south:<reps>" key minted against an earlier revision that DID have
        // clusters in "south" must not be dropped to CITY_ROOT once "south" collapses — the
        // representative area is still a live, containment-linked AREA node and the honest answer
        // is to reattach to it.
        //
        // This FAILS against pre-fix code: the CLUSTER-only restriction gated BOTH candidates, so
        // with zero CLUSTER nodes anywhere in the graph, deepestContainingAll AND
        // shallowestContainingAny both stay null, resolveClusterKeyByContainment returns null, and
        // the caller falls through to CITY_ROOT instead of the containing AREA.
        Instant now = Instant.now();
        NavigationNode southArea = node(200L, null, "south", "AREA", "a:southarea1", "southarea1",
                List.of("southarea1"), "South Area One", 0, 0, List.of(), 0, now);
        NavigationGraph graph = NavigationGraph.build("collapsedcity", 21L, List.of(southArea));
        when(graphCache.getActiveGraph("collapsedcity")).thenReturn(Optional.of(graph));

        String staleKey = "c:south:" + NavigationKeys.slug("southarea1") + "-no-longer-a-real-cluster-suffix";
        NavigationResolveResponse body = controller.resolve("collapsedcity", staleKey, lenientWebRequest()).getBody();

        assertThat(body.resolution()).isEqualTo(NavigationResolution.ANCESTOR);
        assertThat(body.node().nodeKey()).isEqualTo("a:southarea1");
    }

    @Test
    void resolve_staleAreaKey_ancestryOfAreaStillKnown_resolvesToDeepestSurvivingAncestor() {
        // Rung 3 (AC18). NavigationKeys.areaNodeKey ties an AREA's own node_key deterministically
        // to its area_key ("a:" + areaKey), so in real generator output an EXACT-miss for "a:"+X
        // coexisting with a non-empty ancestryOfArea(X) cannot occur — X's own node would already
        // be the exact match. This test constructs a synthetic graph (via the flexible node()
        // fixture helper, which allows nodeKey and areaKey to be set independently) purely to prove
        // the LADDER MECHANICS resolveNode implements are correct for the case the AC describes,
        // not to claim this exact precondition is reachable through today's key-generation scheme.
        Instant now = Instant.now();
        NavigationNode cluster = node(1L, null, "north", "CLUSTER", "c:north:areax", null,
                List.of("areax"), "North", 0, 0, List.of(), 1, now);
        NavigationNode area = node(2L, 1L, "north", "AREA", "a:areax-current-key", "areax",
                List.of("areax"), "Area X", 0, 1, List.of("c:north:areax"), 0, now);
        NavigationGraph graph = NavigationGraph.build("synthcity", 9L, List.of(cluster, area));
        when(graphCache.getActiveGraph("synthcity")).thenReturn(Optional.of(graph));

        NavigationResolveResponse body = controller.resolve("synthcity", "a:areax", lenientWebRequest()).getBody();

        assertThat(body.resolution()).isEqualTo(NavigationResolution.ANCESTOR);
        assertThat(body.node().nodeKey()).isEqualTo("c:north:areax");
    }

    @Test
    void resolve_unknownKey_fallsBackToCityRoot() {
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        NavigationResolveResponse body = controller.resolve(
                "testcity", "totally-unrecognized-key", lenientWebRequest()).getBody();

        assertThat(body.resolution()).isEqualTo(NavigationResolution.CITY_ROOT);
        assertThat(body.node().nodeKey()).isEqualTo("root");
    }

    @Test
    void resolve_cityWithNoActiveGraph_404() {
        when(graphCache.getActiveGraph("ghost-city")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.resolve("ghost-city", "root", lenientWebRequest()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }

    @Test
    void resolve_blankNodeParam_400() {
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        assertThatThrownBy(() -> controller.resolve("testcity", "  ", lenientWebRequest()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void resolve_oversizedNodeParam_400() {
        // #1956 R10: a 257-byte node value must be rejected before any lookup work.
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));
        String oversized = "a".repeat(257);

        assertThatThrownBy(() -> controller.resolve("testcity", oversized, lenientWebRequest()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void resolve_neverReturnsAlias_acrossExactAncestorAndFallbackInputs() {
        // #1956 AC17: ALIAS is a reserved rung this build never returns — exercised across every
        // other rung's trigger input to demonstrate none of them accidentally fall into it.
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        List<String> inputs = List.of(
                "root", "c:north:leaf1-leaf2-leaf3", "a:leaf1",
                "c:north:no-longer-a-real-cluster-suffix", "totally-unrecognized-key");
        for (String input : inputs) {
            NavigationResolveResponse body = controller.resolve("testcity", input, lenientWebRequest()).getBody();
            assertThat(body.resolution())
                    .as("input=%s", input)
                    .isNotEqualTo(NavigationResolution.ALIAS);
        }
    }

    @Test
    void resolve_inlinesFullNodeBody_oneRoundTrip_notJustAReference() {
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        NavigationResolveResponse body = controller.resolve(
                "testcity", "c:north:leaf1-leaf2-leaf3", lenientWebRequest()).getBody();

        // A full structural body — children, nextLevelType, descendantAreaKeys — not merely an
        // identity/reference the client would need a follow-up getNode call to expand.
        assertThat(body.node().children()).isNotEmpty();
        assertThat(body.node().nextLevelType()).isEqualTo("CLUSTER");
        assertThat(body.node().descendantAreaKeys()).containsExactlyInAnyOrder("leaf1", "leaf2", "leaf3");
    }

    @Test
    void resolve_etagDiffersForTwoDifferentResolvedNodes_atTheSameRevision() {
        // #1956 R1: revisionId+checksum alone is shared across every node at a revision; the
        // resolved node's own key must be part of the ETag basis so two different resolutions at
        // the SAME revision never collide onto the same If-None-Match validator.
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        ResponseEntity<NavigationResolveResponse> leaf1Response =
                controller.resolve("testcity", "a:leaf1", lenientWebRequest());
        ResponseEntity<NavigationResolveResponse> leaf2Response =
                controller.resolve("testcity", "a:leaf2", lenientWebRequest());

        String etag1 = leaf1Response.getHeaders().getETag();
        String etag2 = leaf2Response.getHeaders().getETag();

        assertThat(etag1).isNotNull().isNotEqualTo(etag2);
        // Fix-cycle-2 S-A: the ETag basis is now a SHA-256 digest (see NavigationController's
        // resolve javadoc, "ETag is OPAQUE") rather than a literal ":"-joined string, so this no
        // longer asserts substring containment of the raw revisionId/nodeKey — only that resolving
        // to two different nodes at the same revision produces two different opaque validators,
        // which is this test's actual guard (the resolved-node-key axis, orthogonal to fix-cycle-2's
        // requested-value-hash axis below).
        // Fix-cycle-6 (item 3): pin the actual shape — a quoted 64-hex-char SHA-256 digest — not
        // just "starts/ends with a quote", which cannot fail for any quoted string. This also
        // asserts the header-injection property: no `requested` or `nodeKey` text can reach the
        // header verbatim, since only hex characters can appear between the quotes.
        assertThat(etag1).matches("\"[0-9a-f]{64}\"");
        assertThat(etag2).matches("\"[0-9a-f]{64}\"");

        // A stale If-None-Match for leaf1's ETag must NOT satisfy a request that resolves to leaf2
        // — i.e. checkNotModified must be asked with leaf2's own ETag, not leaf1's.
        WebRequest webRequestForLeaf2 = mock(WebRequest.class);
        when(webRequestForLeaf2.checkNotModified(eq(etag1))).thenReturn(false);
        ResponseEntity<NavigationResolveResponse> leaf2AgainstLeaf1Etag =
                controller.resolve("testcity", "a:leaf2", webRequestForLeaf2);
        assertThat(leaf2AgainstLeaf1Etag.getBody()).isNotNull();
        // Fix-cycle-1 S9: the previous version of this assertion could never fail — it only stubbed
        // checkNotModified(etag1), so checkNotModified(etag2) (unstubbed) returned Mockito's default
        // false for ANY implementation, including one that ignores ETags entirely. Verify the
        // controller actually asks with leaf2's OWN etag, not just that it returns a body.
        verify(webRequestForLeaf2).checkNotModified(etag2);
    }

    @Test
    void resolve_etagDiffersAcrossRevisionId_whenChecksumIsIdentical() {
        // Fix-cycle-6 (item 1): NavigationGraph#computeChecksum hashes only node content (node_key,
        // parent-derived key, depth, display_order, area_key) — never revisionId (see its javadoc).
        // A promotion that bumps revisionId while leaving the tree structurally identical therefore
        // produces the SAME checksum. If revisionId were ever dropped from the resolve ETag basis,
        // the ETag would be unchanged across such a promotion even though the response body echoes
        // the new revisionId (NavigationResolveResponse#revisionId) — a conditional request would
        // then be answered 304 carrying the OLD revision. This is the only test in the suite that
        // holds node content fixed and varies revisionId alone.
        NavigationGraph graphAtRevision42 = buildGraph(42L);
        NavigationGraph graphAtRevision43 = buildGraph(43L);

        // Confirm the premise that makes this test meaningful: identical node content across the
        // two graphs really does produce an identical checksum, so revisionId is the ONLY basis
        // component that can differ between the two resolutions below. If the checksum also
        // changed here, a passing test downstream would prove nothing about the revisionId axis.
        assertThat(graphAtRevision42.checksum()).isEqualTo(graphAtRevision43.checksum());

        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(graphAtRevision42));
        String etagAtRevision42 = controller.resolve("testcity", "a:leaf1", lenientWebRequest())
                .getHeaders().getETag();

        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(graphAtRevision43));
        String etagAtRevision43 = controller.resolve("testcity", "a:leaf1", lenientWebRequest())
                .getHeaders().getETag();

        assertThat(etagAtRevision42).isNotNull();
        assertThat(etagAtRevision43).isNotNull();
        assertThat(etagAtRevision42).isNotEqualTo(etagAtRevision43);
    }

    @Test
    void resolve_etagDiffersForCollidingHashCodeRequestedValues_bothResolvingToCityRoot() {
        // Fix-cycle-2 S-A regression test: "Aa" and "BB" are a genuine java.lang.String#hashCode()
        // collision (both hash to 2112 — 65*31+97 == 66*31+66 == 2112). Neither is a recognized
        // node key in this fixture, and neither starts with the "a:"/"c:" prefixes, so BOTH fall
        // through resolveNode's entire ladder to CITY_ROOT — meaning revisionId, checksum, resolved
        // nodeKey ("root"), and resolution (CITY_ROOT) are ALL identical for this pair. The ONLY
        // basis component that can possibly differ is `requested` itself, so this isolates the hash
        // axis fix-cycle-1's String#hashCode()-based ETag failed to cover: with that implementation,
        // Integer.toHexString("Aa".hashCode()) == Integer.toHexString("BB".hashCode()) == "840", so
        // the FULL etag string was byte-identical for these two genuinely different `requested`
        // values, even though the response body differs (it echoes `requested`). This test fails
        // against that implementation and passes against the SHA-256-of-the-full-basis fix — see
        // the class's PR history for the revert-and-run confirmation.
        when(graphCache.getActiveGraph("testcity")).thenReturn(Optional.of(buildGraph()));

        ResponseEntity<NavigationResolveResponse> aaResponse =
                controller.resolve("testcity", "Aa", lenientWebRequest());
        ResponseEntity<NavigationResolveResponse> bbResponse =
                controller.resolve("testcity", "BB", lenientWebRequest());

        // Confirm the premise: both genuinely fall through to CITY_ROOT, so every OTHER basis
        // component besides `requested` is held constant between these two requests.
        assertThat(aaResponse.getBody().resolution()).isEqualTo(NavigationResolution.CITY_ROOT);
        assertThat(bbResponse.getBody().resolution()).isEqualTo(NavigationResolution.CITY_ROOT);
        assertThat(aaResponse.getBody().node().nodeKey()).isEqualTo("root");
        assertThat(bbResponse.getBody().node().nodeKey()).isEqualTo("root");

        String etagForAa = aaResponse.getHeaders().getETag();
        String etagForBb = bbResponse.getHeaders().getETag();

        assertThat(etagForAa).isNotNull();
        assertThat(etagForBb).isNotNull();
        assertThat(etagForAa).isNotEqualTo(etagForBb);

        // A conditional request replaying "Aa"'s own ETag as If-None-Match must NOT be answered
        // 304 for "BB" — i.e. the controller must ask checkNotModified with "BB"'s own etag, not
        // "Aa"'s stale-but-formerly-colliding one.
        WebRequest webRequestForBb = mock(WebRequest.class);
        when(webRequestForBb.checkNotModified(eq(etagForAa))).thenReturn(false);
        ResponseEntity<NavigationResolveResponse> bbAgainstAaEtag =
                controller.resolve("testcity", "BB", webRequestForBb);
        assertThat(bbAgainstAaEtag.getBody()).isNotNull();
        assertThat(bbAgainstAaEtag.getStatusCode().value()).isEqualTo(200);
        verify(webRequestForBb).checkNotModified(etagForBb);
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
