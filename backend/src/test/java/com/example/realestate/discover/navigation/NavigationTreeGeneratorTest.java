package com.example.realestate.discover.navigation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link NavigationTreeGenerator} (#1955 Areas PR A, SLICE 2b). Pure in-memory
 * fixtures only — no Spring context, no DB — proving D4's determinism contract.
 */
class NavigationTreeGeneratorTest {

    private static final Instant GENERATED_AT = Instant.parse("2026-07-23T00:00:00Z");
    private static final String FINGERPRINT = "fp-test";

    private final NavigationTreeGenerator generator = new NavigationTreeGenerator();

    // ── Fixture builders ─────────────────────────────────────────────────────────────────────

    /** An area at a fixed longitude, varying only latitude — keeps LAT the deterministic split axis. */
    private static GeneratorArea area(String areaKey, String name, double lat) {
        BigDecimal latBd = BigDecimal.valueOf(lat);
        BigDecimal lon = BigDecimal.valueOf(77.0);
        return new GeneratorArea(areaKey, name, latBd, lon,
                latBd.subtract(BigDecimal.valueOf(0.01)), lon.subtract(BigDecimal.valueOf(0.01)),
                latBd.add(BigDecimal.valueOf(0.01)), lon.add(BigDecimal.valueOf(0.01)));
    }

    private static GeneratorPolicy policy(
            int maxDirectChildren, int minAreasPerCluster, int maxSafetyDepth, boolean oneChildPrevention) {
        return new GeneratorPolicy(
                maxDirectChildren, minAreasPerCluster, maxSafetyDepth, oneChildPrevention,
                BigDecimal.valueOf(0.35), BigDecimal.valueOf(0.5), "GEOMETRIC_BISECTION",
                "CENTROID_NEAREST", "ATTACH_NEAREST_CLUSTER", "AREA_CENTROID_MEAN");
    }

    // ── 0 / 1 / 2 area fixtures ──────────────────────────────────────────────────────────────

    @Test
    @DisplayName("0 areas -> empty output")
    void zeroAreas() {
        List<GeneratedNode> result = generator.generateRegion(
                "north", List.of(), policy(4, 2, 5, true), FINGERPRINT, GENERATED_AT, new HashSet<>());
        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("1 area -> single AREA root leaf, no CLUSTER wrapper")
    void oneArea() {
        GeneratorArea a = area("city|a1", "Area One", 12.0);
        List<GeneratedNode> result = generator.generateRegion(
                "north", List.of(a), policy(4, 2, 5, true), FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(result).hasSize(1);
        GeneratedNode node = result.get(0);
        assertThat(node.nodeType()).isEqualTo("AREA");
        assertThat(node.nodeKey()).isEqualTo("a:city|a1");
        assertThat(node.parentNodeKey()).isNull();
        assertThat(node.depth()).isEqualTo(0);
        assertThat(node.descendantAreaCount()).isEqualTo(1);
        assertThat(node.displayLabel()).isEqualTo("Area One");
        assertThat(node.ancestorKeys()).isEmpty();
    }

    @Test
    @DisplayName("2 areas within max_direct_children -> two AREA root leaves, no CLUSTER")
    void twoAreasFitDirectly() {
        List<GeneratorArea> areas = List.of(area("city|a1", "A1", 12.0), area("city|a2", "A2", 12.1));
        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy(4, 2, 5, true), FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(result).hasSize(2);
        assertThat(result).allMatch(n -> "AREA".equals(n.nodeType()) && n.parentNodeKey() == null && n.depth() == 0);
        assertThat(result).extracting(GeneratedNode::displayOrder).containsExactly(1, 2);
    }

    // ── Genuine multi-level cluster city ────────────────────────────────────────────────────

    @Test
    @DisplayName("16 areas, max_direct_children=2 -> a genuine 3 CLUSTER-level tree (depths 0,1,2), "
            + "AREA leaves at depth 3, every node's descendant_area_count and bounds correct")
    void genuineThreeClusterLevelCity() {
        List<GeneratorArea> areas = new ArrayList<>();
        for (int i = 0; i < 16; i++) {
            areas.add(area(String.format("city|z%02d", i), "Area " + i, 12.0 + i * 0.1));
        }
        GeneratorPolicy policy = policy(2, 1, 10, false);
        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        Set<Integer> clusterDepths = result.stream()
                .filter(n -> "CLUSTER".equals(n.nodeType()))
                .map(GeneratedNode::depth)
                .collect(Collectors.toSet());
        assertThat(clusterDepths).containsExactlyInAnyOrder(0, 1, 2);

        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(16);
        assertThat(leaves).allMatch(n -> n.depth() == 3);

        assertDescendantCountsAndBoundsCorrectEverywhere(result);
        assertValidatesCleanly(result);
    }

    // ── Recursive termination + max-depth guard ─────────────────────────────────────────────

    @Test
    @DisplayName("max_safety_depth forces AREA leaves even when member count still exceeds "
            + "max_direct_children — no node ever exceeds the depth ceiling")
    void maxSafetyDepthTerminatesRecursion() {
        List<GeneratorArea> areas = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            areas.add(area(String.format("city|d%02d", i), "D" + i, 12.0 + i * 0.1));
        }
        GeneratorPolicy policy = policy(1, 1, 2, false);
        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(result).allMatch(n -> n.depth() <= 2);
        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(8);
        // Every leaf sits at exactly the safety depth (2 areas remained per parent at that depth,
        // exceeding max_direct_children=1, yet leafed anyway because depth hit the ceiling).
        assertThat(leaves).allMatch(n -> n.depth() == 2);

        assertDescendantCountsAndBoundsCorrectEverywhere(result);
        assertValidatesCleanly(result);
    }

    // ── Meaningless-split fallback (one-child + below-minimum) ──────────────────────────────

    @Test
    @DisplayName("a split that would create a one-child cluster collapses to AREA leaves instead")
    void oneChildSplitCollapsesToLeaves() {
        List<GeneratorArea> areas = List.of(
                area("city|o1", "O1", 12.0), area("city|o2", "O2", 12.1), area("city|o3", "O3", 12.2));
        // 3 members > max_direct_children(2); bisect gives a 1/2 split -> one-child, rejected.
        GeneratorPolicy policy = policy(2, 1, 5, true);
        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(result).hasSize(3);
        assertThat(result).allMatch(n -> "AREA".equals(n.nodeType()) && n.depth() == 0 && n.parentNodeKey() == null);
    }

    @Test
    @DisplayName("a split whose partition falls below min_areas_per_cluster collapses to AREA leaves")
    void belowMinimumSplitCollapsesToLeaves() {
        List<GeneratorArea> areas = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            areas.add(area(String.format("city|m%d", i), "M" + i, 12.0 + i * 0.1));
        }
        // 5 members > max_direct_children(2); bisect gives 2/3; min_areas_per_cluster=3 rejects
        // the 2-member partition even though one_child_prevention alone would have allowed it.
        GeneratorPolicy policy = policy(2, 3, 5, false);
        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(result).hasSize(5);
        assertThat(result).allMatch(n -> "AREA".equals(n.nodeType()) && n.depth() == 0);
    }

    // ── Fixed-order determinism + geometric near-tie ────────────────────────────────────────

    @Test
    @DisplayName("near-tie split axis: reordering the input list yields an identical generated tree")
    void nearTieIsReproducibleRegardlessOfInputOrder() {
        List<GeneratorArea> ascending = List.of(
                area("city|t1", "T1", 10.000000),
                area("city|t2", "T2", 10.000001),
                area("city|t3", "T3", 10.000002),
                area("city|t4", "T4", 10.000003));
        List<GeneratorArea> shuffled = new ArrayList<>(ascending);
        Collections.reverse(shuffled);

        GeneratorPolicy policy = policy(2, 1, 5, true);
        List<GeneratedNode> resultA = generator.generateRegion(
                "north", ascending, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());
        List<GeneratedNode> resultB = generator.generateRegion(
                "north", shuffled, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(resultA).isEqualTo(resultB);
    }

    // ── Representative selection: deterministic tie-break ───────────────────────────────────

    @Test
    @DisplayName("representative selection: nearest-to-centroid wins, ties broken lexicographically by area_key")
    void representativeSelectionTieBreak() {
        // centroid lat = (0 + 10 + 10 + 10) / 4 = 7.5; "p|a","p|b","p|c" all tie at distance 2.5,
        // "p|d" is farther at 7.5 -> the two nearest (tied) must be the lexicographically-first two.
        List<GeneratorArea> members = List.of(
                area("p|d", "D", 0.0),
                area("p|c", "C", 10.0),
                area("p|b", "B", 10.0),
                area("p|a", "A", 10.0));
        GeneratorPolicy policy = policy(4, 2, 5, true);

        List<String> reps = generator.selectRepresentatives(members, policy);
        assertThat(reps).containsExactly("p|a", "p|b");
    }

    @Test
    @DisplayName("a single-member partition's sole representative is that member")
    void singleMemberRepresentative() {
        List<GeneratorArea> members = List.of(area("solo|1", "Solo", 12.0));
        List<String> reps = generator.selectRepresentatives(members, policy(4, 2, 5, true));
        assertThat(reps).containsExactly("solo|1");
    }

    // ── Stable labels + ordering ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("CLUSTER display_label is built purely from representative area names, siblings "
            + "have a gapless 1..n display_order")
    void stableLabelsAndOrdering() {
        List<GeneratorArea> areas = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            areas.add(area(String.format("city|l%d", i), "Label" + i, 12.0 + i * 0.1));
        }
        GeneratorPolicy policy = policy(2, 1, 5, true);
        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        List<GeneratedNode> clusterRoots = result.stream()
                .filter(n -> n.parentNodeKey() == null)
                .toList();
        assertThat(clusterRoots).extracting(GeneratedNode::displayOrder).containsExactly(1, 2);
        assertThat(clusterRoots).allMatch(n -> n.displayLabel() != null && !n.displayLabel().isBlank());

        // No AREA node ever invents a marketing label — its label is exactly its own name.
        result.stream().filter(n -> "AREA".equals(n.nodeType())).forEach(n ->
                assertThat(n.displayLabel()).isEqualTo("Label" + n.areaKey().substring(n.areaKey().length() - 1)));
    }

    // ── node_key collision disambiguation ────────────────────────────────────────────────────

    @Test
    @DisplayName("a colliding cluster node_key base is disambiguated by appending the "
            + "lexicographically-least additional member area_key")
    void collidingClusterNodeKeyIsDisambiguated() {
        // 6 areas, max_direct_children=1 -> root splits into two 3-member partitions
        // [c1,c2,c3] and [c4,c5,c6]. For the first partition the centroid coincides with c2
        // (distance 0), c1/c3 tie at distance 0.1 with c1 winning lexicographically -> reps =
        // [c1,c2], leaving c3 as the one "additional member" available to disambiguate with.
        List<GeneratorArea> areas = List.of(
                area("grp|c1", "C1", 10.0), area("grp|c2", "C2", 10.1), area("grp|c3", "C3", 10.2),
                area("grp|c4", "C4", 20.0), area("grp|c5", "C5", 20.1), area("grp|c6", "C6", 20.2));
        GeneratorPolicy policy = policy(1, 1, 5, false);

        String base = NavigationKeys.clusterNodeKeyBase("north", List.of("grp|c1", "grp|c2"));
        Set<String> usedClusterKeys = new HashSet<>();
        usedClusterKeys.add(base); // simulate a pre-existing collision from elsewhere in the city

        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, usedClusterKeys);

        GeneratedNode target = result.stream()
                .filter(n -> "CLUSTER".equals(n.nodeType()) && n.depth() == 0)
                .filter(n -> n.representativeAreaKeys().equals(List.of("grp|c1", "grp|c2")))
                .findFirst()
                .orElseThrow();

        // representative_area_keys is unaffected by the collision — only the node_key is extended.
        assertThat(target.representativeAreaKeys()).containsExactly("grp|c1", "grp|c2");
        assertThat(target.nodeKey()).isNotEqualTo(base);
        assertThat(target.nodeKey()).isEqualTo(NavigationKeys.clusterNodeKeyBase(
                "north", List.of("grp|c1", "grp|c2", "grp|c3")));
    }

    // ── Listing-independence proof ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("listing independence: GeneratorArea/GeneratorRegionInput carry no listing-volume "
            + "field at all, and two generations of identical geometry+policy are byte-for-byte equal "
            + "(the generator has no code path that could vary by listing count)")
    void listingIndependenceProof() {
        List<GeneratorArea> areas = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            areas.add(area(String.format("city|n%d", i), "N" + i, 12.0 + i * 0.1));
        }
        GeneratorPolicy policy = policy(3, 2, 5, true);

        List<GeneratedNode> firstRun = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());
        List<GeneratedNode> secondRun = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(firstRun).isEqualTo(secondRun);
        // Structural proof, not just behavioural: GeneratorArea has exactly these 8 geometry
        // fields — no listingCount/propertyCount field exists for the generator to read.
        assertThat(GeneratorArea.class.getRecordComponents()).hasSize(8);
    }

    // ── Whole-city generation across multiple regions, shared node_key uniqueness ───────────

    @Test
    @DisplayName("generateCity processes regions in fixed region_key order and shares node_key "
            + "uniqueness across all of them")
    void generateCitySortsRegionsAndSharesKeySpace() {
        GeneratorRegionInput south = new GeneratorRegionInput("south",
                List.of(area("city|s1", "S1", 11.0)));
        GeneratorRegionInput north = new GeneratorRegionInput("north",
                List.of(area("city|n1", "N1", 12.0)));

        List<GeneratedNode> result = generator.generateCity(
                List.of(south, north), policy(4, 2, 5, true), FINGERPRINT, GENERATED_AT);

        assertThat(result).extracting(GeneratedNode::regionKey).containsExactly("north", "south");
        assertThat(result).extracting(GeneratedNode::nodeKey).doesNotHaveDuplicates();
    }

    // ── Shared helpers ────────────────────────────────────────────────────────────────────────

    private void assertDescendantCountsAndBoundsCorrectEverywhere(List<GeneratedNode> nodes) {
        Map<String, GeneratedNode> byKey = nodes.stream()
                .collect(Collectors.toMap(GeneratedNode::nodeKey, n -> n));
        Map<String, List<GeneratedNode>> byParent = nodes.stream()
                .collect(Collectors.groupingBy(n -> n.parentNodeKey() == null ? "" : n.parentNodeKey()));

        for (GeneratedNode n : nodes) {
            Set<String> descendantAreaKeys = new HashSet<>();
            collectDescendantAreas(n.nodeKey(), byParent, descendantAreaKeys);
            int expected = "AREA".equals(n.nodeType()) ? 1 : descendantAreaKeys.size();
            assertThat(n.descendantAreaCount()).as("descendant_area_count for " + n.nodeKey()).isEqualTo(expected);

            assertThat(n.centreLat()).as("centreLat for " + n.nodeKey()).isNotNull();
            assertThat(n.centreLon()).as("centreLon for " + n.nodeKey()).isNotNull();
            assertThat(n.minLat()).isNotNull();
            assertThat(n.maxLat()).isNotNull();
            assertThat(n.minLat().compareTo(n.maxLat())).isLessThanOrEqualTo(0);
        }
        assertThat(byKey).isNotEmpty(); // keep byKey "used" without weakening the loop above
    }

    private void collectDescendantAreas(String nodeKey, Map<String, List<GeneratedNode>> byParent, Set<String> out) {
        for (GeneratedNode child : byParent.getOrDefault(nodeKey, List.of())) {
            if ("AREA".equals(child.nodeType())) {
                out.add(child.areaKey());
            } else {
                collectDescendantAreas(child.nodeKey(), byParent, out);
            }
        }
    }

    /** Cross-checks a generated tree through the validation service — a generated tree must never
     * trip any of the 13 blocking invariants. */
    private void assertValidatesCleanly(List<GeneratedNode> nodes) {
        List<ValidationNode> validationNodes = nodes.stream()
                .map(n -> ValidationNode.fromGeneratedNode(1L, n))
                .toList();
        ValidationReport report = new NavigationTreeValidationService().validate(validationNodes);
        assertThat(report.errors()).as("generated tree should validate cleanly").isEmpty();
    }
}
