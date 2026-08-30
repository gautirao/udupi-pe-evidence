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
import java.util.Random;
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
    @DisplayName("[#1956 D3] 1 area -> DIRECTION root + single AREA leaf beneath it, no CLUSTER wrapper")
    void oneArea() {
        GeneratorArea a = area("city|a1", "Area One", 12.0);
        List<GeneratedNode> result = generator.generateRegion(
                "north", List.of(a), policy(4, 2, 5, true), FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(result).hasSize(2);
        GeneratedNode direction = result.stream().filter(n -> "DIRECTION".equals(n.nodeType())).findFirst().orElseThrow();
        assertThat(direction.nodeKey()).isEqualTo("d:north");
        assertThat(direction.parentNodeKey()).isNull();
        assertThat(direction.depth()).isEqualTo(0);
        assertThat(direction.ancestorKeys()).isEmpty();
        assertThat(direction.descendantAreaCount()).isEqualTo(1);

        GeneratedNode node = result.stream().filter(n -> "AREA".equals(n.nodeType())).findFirst().orElseThrow();
        assertThat(node.nodeKey()).isEqualTo("a:city|a1");
        assertThat(node.parentNodeKey()).isEqualTo("d:north");
        assertThat(node.depth()).isEqualTo(1);
        assertThat(node.descendantAreaCount()).isEqualTo(1);
        assertThat(node.displayLabel()).isEqualTo("Area One");
        assertThat(node.ancestorKeys()).containsExactly("d:north");
    }

    @Test
    @DisplayName("[#1956 D3] 2 areas within max_direct_children -> DIRECTION root + two AREA leaves, no CLUSTER")
    void twoAreasFitDirectly() {
        List<GeneratorArea> areas = List.of(area("city|a1", "A1", 12.0), area("city|a2", "A2", 12.1));
        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy(4, 2, 5, true), FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(result).hasSize(3);
        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(2);
        assertThat(leaves).allMatch(n -> "d:north".equals(n.parentNodeKey()) && n.depth() == 1);
        assertThat(leaves).extracting(GeneratedNode::displayOrder).containsExactly(1, 2);
    }

    // ── Genuine multi-level cluster city ────────────────────────────────────────────────────

    @Test
    @DisplayName("[#2033 P2 fix] 16 areas, max_direct_children=2, max_safety_depth=10 (deep enough "
            + "to have produced 3 internal bisection levels pre-fix) -> partition-then-emit still "
            + "performs the SAME internal bisections (8 depth-1 CLUSTERs of 2 areas each), but "
            + "emission is now non-recursive: every CLUSTER lands at depth 1, every AREA leaf at "
            + "depth 2 — no third public CLUSTER level, no node beyond depth 2 — and the tree "
            + "validates with ZERO errors, where the pre-fix generator produced depths 1,2,3 and "
            + "leaves at depth 4, tripping INVALID_HIERARCHY_SHAPE")
    void deepBisection_flattensToSingleClusterLevel_validatesCleanly() {
        List<GeneratorArea> areas = new ArrayList<>();
        for (int i = 0; i < 16; i++) {
            areas.add(area(String.format("city|z%02d", i), "Area " + i, 12.0 + i * 0.1));
        }
        GeneratorPolicy policy = policy(2, 1, 10, false);
        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        // #2033 P2: emission is non-recursive by construction — every CLUSTER is at depth 1 (never
        // 2 or 3, even though the internal bisection recursed 3 levels deep to build the bucket
        // list), and every AREA leaf is at depth 2 (never 4).
        List<GeneratedNode> clusters = result.stream().filter(n -> "CLUSTER".equals(n.nodeType())).toList();
        assertThat(clusters).allMatch(n -> n.depth() == 1);
        // 16 areas bisected down to buckets of size <= max_direct_children=2 takes exactly 3
        // internal bisection levels (16->8->4->2), yielding 2^3 = 8 flat depth-1 CLUSTERs.
        assertThat(clusters).hasSize(8);
        assertThat(clusters).allMatch(n -> n.descendantAreaCount() == 2);

        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(16);
        assertThat(leaves).allMatch(n -> n.depth() == 2);

        assertDescendantCountsAndBoundsCorrectEverywhere(result);

        // #1956/#2014 D6(d): the flattened tree is a legal public shape (City -> Direction -> ONE
        // Local Destination CLUSTER level -> AREA) — it now validates with ZERO errors, unlike the
        // pre-fix generator's genuinely-nested tree, which check #14 rejected.
        assertValidatesCleanly(result);
    }

    // ── Recursive termination + max-depth guard ─────────────────────────────────────────────

    @Test
    @DisplayName("[#2033 P2 fix] max_safety_depth=2 terminates the INTERNAL bisection recursion "
            + "(members still exceed max_direct_children=1 when the safety-depth ceiling is hit) — "
            + "partition() still returns buckets of size 2 (unchanged termination behaviour), but "
            + "emission is non-recursive: every CLUSTER still lands at depth 1 and every AREA leaf "
            + "at depth 2 (never depth 3, where the pre-fix generator would have placed them and "
            + "tripped INVALID_HIERARCHY_SHAPE) — the tree validates with ZERO errors")
    void maxSafetyDepthTerminatesInternalBisection_flattensToSingleClusterLevel_validatesCleanly() {
        List<GeneratorArea> areas = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            areas.add(area(String.format("city|d%02d", i), "D" + i, 12.0 + i * 0.1));
        }
        GeneratorPolicy policy = policy(1, 1, 2, false);
        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        // #2033 P2: no node may ever exceed depth 2 regardless of max_safety_depth's internal
        // bisection-level budget.
        assertThat(result).allMatch(n -> n.depth() <= 2);

        List<GeneratedNode> clusters = result.stream().filter(n -> "CLUSTER".equals(n.nodeType())).toList();
        assertThat(clusters).allMatch(n -> n.depth() == 1);
        // 8 areas, max_direct_children=1 but max_safety_depth=2 caps internal bisection at 2
        // levels -> 2^2 = 4 flat depth-1 CLUSTERs of 2 areas each (the safety-depth ceiling is hit
        // before the members would otherwise fit under max_direct_children=1).
        assertThat(clusters).hasSize(4);
        assertThat(clusters).allMatch(n -> n.descendantAreaCount() == 2);

        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(8);
        assertThat(leaves).allMatch(n -> n.depth() == 2);

        assertDescendantCountsAndBoundsCorrectEverywhere(result);

        // #1956/#2014 D6(d): max_safety_depth=2 remains a legal operator value under check #11
        // (maxAllowedDepth = maxSafetyDepth + 1 = 3 >= actual depth 2), and the flattened tree is
        // now ALSO a legal public shape under check #14 — zero errors, not the pre-fix violation.
        assertValidatesCleanly(result);
    }

    // ── #2086: splitting is MANDATORY — one_child_prevention/min_areas_per_cluster no longer veto ──

    @Test
    @DisplayName("[#2086] 3 members exceeding effective breadth 2 do NOT split — not because of the "
            + "removed one_child_prevention/min_areas_per_cluster policy knobs (both are irrelevant "
            + "here: 3 cannot be divided into groups that are simultaneously <= 2 and >= 2), but "
            + "because of the hard, policy-independent >= 2-members-per-bucket floor this class "
            + "always enforces (NavigationTreeValidationService's unconditional ONE_CHILD_CLUSTER "
            + "check) — the 3 areas are emitted as unclustered AREA leaves directly under DIRECTION")
    void threeMembersExceedingBreadthTwo_cannotSplitWithoutOneChildBucket_staysUnclustered() {
        List<GeneratorArea> areas = List.of(
                area("city|o1", "O1", 12.0), area("city|o2", "O2", 12.1), area("city|o3", "O3", 12.2));
        GeneratorPolicy policy = policy(2, 1, 5, true);
        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(result.stream().filter(n -> "CLUSTER".equals(n.nodeType())).toList()).isEmpty();
        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(3);
        assertThat(leaves).allMatch(n -> n.depth() == 1 && "d:north".equals(n.parentNodeKey()));
        assertValidatesCleanly(result);
    }

    @Test
    @DisplayName("[#2086] min_areas_per_cluster no longer vetoes a mandated split: 5 members with "
            + "effective breadth 2 DO split (into a 2-member and a 3-member bucket — the 3-member "
            + "bucket cannot split further without an unavoidable one-child bucket, per the same hard "
            + "floor as above), unlike pre-#2086 where min_areas_per_cluster=3 would have rejected "
            + "the split entirely and collapsed all 5 to unclustered leaves")
    void belowMinimumNoLongerCollapsesToLeaves_splitIsNowMandatoryWhereverPossible() {
        List<GeneratorArea> areas = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            areas.add(area(String.format("city|m%d", i), "M" + i, 12.0 + i * 0.1));
        }
        // 5 members > effectiveBreadth(2)=2; min_areas_per_cluster=3 is READ (fingerprint) but no
        // longer consulted by partition() — a split is mandatory wherever the hard >= 2 floor allows it.
        GeneratorPolicy policy = policy(2, 3, 5, false);
        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        List<GeneratedNode> clusters = result.stream().filter(n -> "CLUSTER".equals(n.nodeType())).toList();
        assertThat(clusters).as("#2086: 5 members DO split despite min_areas_per_cluster=3").hasSize(2);
        assertThat(clusters).allMatch(n -> n.depth() == 1);
        assertThat(clusters).allMatch(n -> n.descendantAreaCount() >= 2);
        assertThat(clusters.stream().mapToInt(GeneratedNode::descendantAreaCount).sum()).isEqualTo(5);
        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(5);
        assertValidatesCleanly(result);
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
    @DisplayName("[#1956 D3] CLUSTER display_label is built purely from representative area names, "
            + "the two CLUSTERs beneath the DIRECTION root have a gapless 1..n display_order")
    void stableLabelsAndOrdering() {
        List<GeneratorArea> areas = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            areas.add(area(String.format("city|l%d", i), "Label" + i, 12.0 + i * 0.1));
        }
        GeneratorPolicy policy = policy(2, 1, 5, true);
        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        GeneratedNode direction = result.stream().filter(n -> "DIRECTION".equals(n.nodeType())).findFirst().orElseThrow();
        List<GeneratedNode> topClusters = result.stream()
                .filter(n -> direction.nodeKey().equals(n.parentNodeKey()))
                .toList();
        // #2086: effectiveBreadth=2 for max_direct_children=2 -> k=ceilDiv(6,2)=3 mandated buckets
        // (previously max_direct_children=2 alone produced a 3/3 midpoint bisect -> 2 clusters; the
        // new k-aware proportional split recurses further to 3 buckets of 2 areas each).
        assertThat(topClusters).extracting(GeneratedNode::displayOrder).containsExactly(1, 2, 3);
        assertThat(topClusters).allMatch(n -> n.displayLabel() != null && !n.displayLabel().isBlank());

        // No AREA node ever invents a marketing label — its label is exactly its own name.
        result.stream().filter(n -> "AREA".equals(n.nodeType())).forEach(n ->
                assertThat(n.displayLabel()).isEqualTo("Label" + n.areaKey().substring(n.areaKey().length() - 1)));
    }

    // ── node_key collision disambiguation ────────────────────────────────────────────────────

    @Test
    @DisplayName("a colliding cluster node_key base is disambiguated by appending the "
            + "lexicographically-least additional member area_key")
    void collidingClusterNodeKeyIsDisambiguated() {
        // 6 areas, max_direct_children=3 (#2086: must be >= 3 so a leaf bucket can hold 3 members —
        // effectiveBreadth clamps anything below 2 up to 2, which would leave no "extra" member
        // beyond the 2 representatives to disambiguate with) -> effectiveBreadth=3, k=ceilDiv(6,3)=2,
        // splitIndex=6*1/2=3 -> two 3-member buckets [c1,c2,c3] and [c4,c5,c6], each already <= the
        // effective breadth so neither recurses further. For the first bucket the centroid coincides
        // with c2 (distance 0), c1/c3 tie at distance 0.1 with c1 winning lexicographically -> reps =
        // [c1,c2], leaving c3 as the one "additional member" available to disambiguate with.
        List<GeneratorArea> areas = List.of(
                area("grp|c1", "C1", 10.0), area("grp|c2", "C2", 10.1), area("grp|c3", "C3", 10.2),
                area("grp|c4", "C4", 20.0), area("grp|c5", "C5", 20.1), area("grp|c6", "C6", 20.2));
        GeneratorPolicy policy = policy(3, 1, 5, false);

        String base = NavigationKeys.clusterNodeKeyBase("north", List.of("grp|c1", "grp|c2"));
        Set<String> usedClusterKeys = new HashSet<>();
        usedClusterKeys.add(base); // simulate a pre-existing collision from elsewhere in the city

        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, usedClusterKeys);

        // [#1956 D3] the top-level clusters now sit at depth 1 (beneath the DIRECTION root at
        // depth 0), not depth 0 — filtered by representativeAreaKeys instead of depth to find the
        // one under test.
        GeneratedNode target = result.stream()
                .filter(n -> "CLUSTER".equals(n.nodeType()))
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
    @DisplayName("[#1956 D4] generateCity processes regions in canonical displayOrder (tie-broken by "
            + "region_key when, as here via the 2-arg GeneratorRegionInput constructor, every region "
            + "defaults to the same displayOrder) and shares node_key uniqueness across all of them")
    void generateCitySortsRegionsAndSharesKeySpace() {
        GeneratorRegionInput south = new GeneratorRegionInput("south",
                List.of(area("city|s1", "S1", 11.0)));
        GeneratorRegionInput north = new GeneratorRegionInput("north",
                List.of(area("city|n1", "N1", 12.0)));

        List<GeneratedNode> result = generator.generateCity(
                List.of(south, north), policy(4, 2, 5, true), FINGERPRINT, GENERATED_AT);

        // [#1956 D3] each single-area region now contributes 2 nodes (DIRECTION + AREA), not 1.
        assertThat(result).extracting(GeneratedNode::regionKey)
                .containsExactly("north", "north", "south", "south");
        assertThat(result).extracting(GeneratedNode::nodeKey).doesNotHaveDuplicates();
    }

    // ── #<root-display-order-fix> regression: generateCity root display_order sequencing ────

    /** Three regions, each with 2 areas that fit directly (max_direct_children=4) -> each region
     * contributes exactly one DIRECTION root (parentNodeKey == null, #1956 D3) plus 2 AREA leaves
     * beneath it, reproducing exactly the pre-fix collision condition: >=2 regions, each
     * contributing its own depth-0 root node. */
    private List<GeneratedNode> multiRegionRootOnlyCity(List<GeneratorRegionInput> regionsInOrder) {
        return generator.generateCity(regionsInOrder, policy(4, 2, 5, true), FINGERPRINT, GENERATED_AT);
    }

    private static List<GeneratorRegionInput> threeRegionFixture() {
        GeneratorRegionInput north = new GeneratorRegionInput("north", List.of(
                area("city|n1", "N1", 13.0), area("city|n2", "N2", 13.1)));
        GeneratorRegionInput south = new GeneratorRegionInput("south", List.of(
                area("city|s1", "S1", 12.0), area("city|s2", "S2", 12.1)));
        GeneratorRegionInput east = new GeneratorRegionInput("east", List.of(
                area("city|e1", "E1", 12.5), area("city|e2", "E2", 12.6)));
        return new ArrayList<>(List.of(north, south, east));
    }

    @Test
    @DisplayName("[regression] generateCity output for a multi-region city (>=2 regions, each "
            + "contributing a DIRECTION root node — #1956 D3) validates cleanly against "
            + "NavigationTreeValidationService invariant #8 (no duplicate display_order among "
            + "parentNodeKey=null siblings)")
    void generateCity_multiRegion_validatesCleanly() {
        List<GeneratedNode> result = multiRegionRootOnlyCity(threeRegionFixture());

        // [#1956 D3] 3 regions x (1 DIRECTION + 2 AREA leaves each) = 9 nodes, not 6.
        assertThat(result).hasSize(9);
        assertValidatesCleanly(result);
    }

    @Test
    @DisplayName("[regression] all root display_order values across a multi-region city are unique "
            + "and form a gapless 1..N sequence")
    void generateCity_multiRegion_rootDisplayOrdersAreGaplessAndUnique() {
        List<GeneratedNode> result = multiRegionRootOnlyCity(threeRegionFixture());

        List<Integer> rootOrders = result.stream()
                .filter(n -> n.parentNodeKey() == null)
                .map(GeneratedNode::displayOrder)
                .sorted()
                .toList();

        assertThat(rootOrders).doesNotHaveDuplicates();
        // [#1956 D3] roots are now exactly the 3 DIRECTION nodes (one per region), not every node
        // in the tree — the gapless range bound is rootOrders.size(), not result.size().
        assertThat(rootOrders).containsExactlyElementsOf(
                java.util.stream.IntStream.rangeClosed(1, rootOrders.size()).boxed().toList());
    }

    @Test
    @DisplayName("[regression] shuffling the input region order produces an identical generated "
            + "tree — generateCity's region_key sort makes root numbering order-independent")
    void generateCity_multiRegion_shufflingInputRegionOrderIsDeterministic() {
        List<GeneratorRegionInput> ordered = threeRegionFixture();
        List<GeneratorRegionInput> shuffled = new ArrayList<>(ordered);
        Collections.reverse(shuffled);
        // Also rotate to prove it's not merely reversal-safe.
        Collections.swap(shuffled, 0, 1);

        List<GeneratedNode> resultOrdered = generator.generateCity(
                ordered, policy(4, 2, 5, true), FINGERPRINT, GENERATED_AT);
        List<GeneratedNode> resultShuffled = generator.generateCity(
                shuffled, policy(4, 2, 5, true), FINGERPRINT, GENERATED_AT);

        assertThat(resultShuffled).isEqualTo(resultOrdered);
    }

    @Test
    @DisplayName("[regression] single-region behaviour is unchanged by the fix: the public 6-arg "
            + "generateRegion API produces the exact same tree as generateCity given one region")
    void generateRegion_singleRegionOutputUnchangedByCityWideCounterFix() {
        GeneratorArea a1 = area("city|q1", "Q1", 12.0);
        GeneratorArea a2 = area("city|q2", "Q2", 12.1);
        GeneratorArea a3 = area("city|q3", "Q3", 12.2);
        GeneratorPolicy policy = policy(4, 2, 5, true);

        List<GeneratedNode> viaPublicRegionApi = generator.generateRegion(
                "solo", List.of(a1, a2, a3), policy, FINGERPRINT, GENERATED_AT, new HashSet<>());
        List<GeneratedNode> viaCityApiSingleRegion = generator.generateCity(
                List.of(new GeneratorRegionInput("solo", List.of(a1, a2, a3))),
                policy, FINGERPRINT, GENERATED_AT);

        assertThat(viaPublicRegionApi).isEqualTo(viaCityApiSingleRegion);
        // [#1956 D3] DIRECTION root gets display_order=1 (the shared root counter); its 3 AREA
        // children get their OWN gapless 1..3 local order beneath it — displayOrder is no longer a
        // single city-wide sequence across every node, only across roots (here, one root: the
        // Direction) and, separately, within each parent's own children.
        assertThat(viaPublicRegionApi).extracting(GeneratedNode::displayOrder).containsExactly(1, 1, 2, 3);
        assertValidatesCleanly(viaPublicRegionApi);
    }

    @Test
    @DisplayName("[regression] beneath separate cluster parents (from different regions of the same "
            + "city), each parent's children remain independently gapless 1..N — only the root level "
            + "draws from the shared city-wide counter, deeper levels are unaffected")
    void generateCity_multiRegion_childOrderingUnderSeparateClusterParentsStaysIndependentlyGapless() {
        List<GeneratorArea> northAreas = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            northAreas.add(area(String.format("city|n%d", i), "N" + i, 12.0 + i * 0.1));
        }
        List<GeneratorArea> southAreas = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            southAreas.add(area(String.format("city|s%d", i), "S" + i, 20.0 + i * 0.1));
        }
        GeneratorPolicy policy = policy(2, 1, 5, true);
        List<GeneratedNode> result = generator.generateCity(
                List.of(
                        new GeneratorRegionInput("north", northAreas),
                        new GeneratorRegionInput("south", southAreas)),
                policy, FINGERPRINT, GENERATED_AT);

        // Two regions each produce >1 CLUSTER root -> real, distinct non-null parent keys exist
        // at depth 1 in more than one region, letting us check independence across parents.
        Map<String, List<GeneratedNode>> byParent = result.stream()
                .filter(n -> n.parentNodeKey() != null)
                .collect(Collectors.groupingBy(GeneratedNode::parentNodeKey));
        assertThat(byParent).isNotEmpty();

        for (Map.Entry<String, List<GeneratedNode>> e : byParent.entrySet()) {
            List<Integer> orders = e.getValue().stream()
                    .map(GeneratedNode::displayOrder)
                    .sorted()
                    .toList();
            assertThat(orders)
                    .as("children of " + e.getKey() + " must be gapless 1..N regardless of the "
                            + "shared root-level counter")
                    .containsExactlyElementsOf(
                            java.util.stream.IntStream.rangeClosed(1, orders.size()).boxed().toList());
        }

        assertValidatesCleanly(result);
    }

    // ── #1956 regression coverage: DIRECTION hierarchy shape ────────────────────────────────────

    @Test
    @DisplayName("[#2086 THE Bangalore fix] max_safety_depth=0 no longer suppresses the CLUSTER "
            + "level: 6 areas exceeding effective breadth still split into CLUSTERs even though "
            + "max_safety_depth=0 — pre-#2086 this policy value flattened every region straight to "
            + "unclustered AREA children (the exact live Bangalore condition), which is the root "
            + "cause this issue fixes")
    void maxSafetyDepthZero_noLongerSuppressesClusterLevel() {
        List<GeneratorArea> areas = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            areas.add(area(String.format("city|z%d", i), "Z" + i, 12.0 + i * 0.1));
        }
        GeneratorPolicy policy = policy(4, 2, 0, true);
        List<GeneratedNode> result = generator.generateRegion(
                "north", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        // #2086: effectiveBreadth=4 for max_direct_children=4; 6 members > 4 -> k=ceilDiv(6,4)=2
        // mandates a split REGARDLESS of max_safety_depth=0 — CLUSTER nodes ARE produced.
        assertThat(result.stream().map(GeneratedNode::nodeType).collect(Collectors.toSet()))
                .containsExactlyInAnyOrder("DIRECTION", "CLUSTER", "AREA");
        List<GeneratedNode> clusters = result.stream().filter(n -> "CLUSTER".equals(n.nodeType())).toList();
        assertThat(clusters).isNotEmpty();
        assertThat(clusters).allMatch(n -> n.depth() == 1);
        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(6);
        assertThat(result).allMatch(n -> n.depth() <= 2);
        // assertValidatesCleanly uses the maxSafetyDepth=null convenience overload (check #11 is
        // skipped entirely when no depth ceiling is supplied), so it is unaffected by the
        // NavigationTreeValidationService#checkMaxDepth cross-step note documented on
        // realisticScaleCity_depthInvariantAcrossMaxSafetyDepthValues above.
        assertValidatesCleanly(result);
    }

    @Test
    @DisplayName("[#1956 regression] every AREA in a multi-region city descends from its OWN region's "
            + "DIRECTION: parentNodeKey and ancestorKeys[0] both point at it, ancestorKeys is never "
            + "empty, and the AREA's region_key always matches its DIRECTION ancestor's region_key")
    void everyArea_descendsFromOwnRegionDirection_andRegionKeysAgree() {
        List<GeneratedNode> result = multiRegionRootOnlyCity(threeRegionFixture());

        Map<String, GeneratedNode> directionsByRegion = result.stream()
                .filter(n -> "DIRECTION".equals(n.nodeType()))
                .collect(Collectors.toMap(GeneratedNode::regionKey, n -> n));
        assertThat(directionsByRegion).hasSize(3);

        List<GeneratedNode> areas = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(areas).hasSize(6);
        for (GeneratedNode areaNode : areas) {
            assertThat(areaNode.ancestorKeys()).as("ancestorKeys for " + areaNode.nodeKey()).isNotEmpty();
            GeneratedNode ownDirection = directionsByRegion.get(areaNode.regionKey());
            assertThat(ownDirection).as("a DIRECTION must exist for region " + areaNode.regionKey()).isNotNull();
            assertThat(areaNode.parentNodeKey()).isEqualTo(ownDirection.nodeKey());
            assertThat(areaNode.ancestorKeys().get(0)).isEqualTo(ownDirection.nodeKey());
            assertThat(areaNode.regionKey()).isEqualTo(ownDirection.regionKey());
        }
    }

    @Test
    @DisplayName("[#1956 D4 regression] DIRECTION display_order is gapless 1..N across the city and "
            + "follows CANONICAL region order (CENTRAL,N,E,S,W), not the alphabetical region_key sort "
            + "generateCity uses for processing determinism — fixture deliberately makes the two "
            + "orders disagree so a regression to alphabetical numbering would be caught")
    void directionDisplayOrder_followsCanonicalRegionOrder_notAlphabetical() {
        // Canonical order is CENTRAL, N, E, S, W. Alphabetically by region_key it would instead be
        // central, east, north, south, west (east and north swapped relative to canonical) — proof
        // that display_order truly tracks the canonical sequence, not a re-derived alphabetical one.
        GeneratorRegionInput central = new GeneratorRegionInput(
                "central", List.of(area("city|c1", "C1", 10.0)), 1, "Central");
        GeneratorRegionInput north = new GeneratorRegionInput(
                "north", List.of(area("city|n1", "N1", 20.0)), 2, "North");
        GeneratorRegionInput east = new GeneratorRegionInput(
                "east", List.of(area("city|e1", "E1", 15.0)), 3, "East");
        GeneratorRegionInput south = new GeneratorRegionInput(
                "south", List.of(area("city|s1", "S1", 5.0)), 4, "South");
        GeneratorRegionInput west = new GeneratorRegionInput(
                "west", List.of(area("city|w1", "W1", 25.0)), 5, "West");

        List<GeneratedNode> result = generator.generateCity(
                List.of(east, west, central, south, north), // shuffled input, alphabetical-ish disorder
                policy(4, 2, 5, true), FINGERPRINT, GENERATED_AT);

        Map<String, Integer> directionOrderByRegion = result.stream()
                .filter(n -> "DIRECTION".equals(n.nodeType()))
                .collect(Collectors.toMap(GeneratedNode::regionKey, GeneratedNode::displayOrder));

        assertThat(directionOrderByRegion).containsOnly(
                Map.entry("central", 1), Map.entry("north", 2), Map.entry("east", 3),
                Map.entry("south", 4), Map.entry("west", 5));

        List<Integer> gapless = directionOrderByRegion.values().stream().sorted().toList();
        assertThat(gapless).containsExactly(1, 2, 3, 4, 5);

        // The alphabetical region_key order would have placed "east" (order=3 here) BEFORE "north"
        // (order=2 here) — asserting the opposite confirms canonical, not alphabetical, ordering won.
        assertThat(directionOrderByRegion.get("north")).isLessThan(directionOrderByRegion.get("east"));
    }

    // ── #2033 P3: realistic-scale regression + edge-case suite ─────────────────────────────────

    /** The REAL seeded {@code city_region_policy} defaults (see {@code V1xx} migration /
     * {@link NavigationPolicyReader}), not a test-only convenience value. */
    private static final GeneratorPolicy REAL_SEEDED_POLICY = policy(8, 3, 6, true);

    /** Deterministic SYNTHETIC areas for one region — fixed longitude, latitude spread by index so
     * LAT stays the split axis, offset per region so distinct regions never share centroids. No
     * real city names or coordinates appear anywhere in this fixture. */
    private static List<GeneratorArea> syntheticRegionAreas(String regionKey, int count, double latOffset) {
        List<GeneratorArea> areas = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            areas.add(area(regionKey + "|a" + String.format("%04d", i), regionKey + "-area-" + i,
                    latOffset + i * 0.01));
        }
        return areas;
    }

    /** The 9-region, 313-area realistic-scale fixture (68/60/45/38/30/22/15/1/34 = 313),
     * deliberately unevenly sized to mirror a real city's uneven region membership. Synthetic
     * keys/coordinates only — no real city names or coordinates. */
    private static List<GeneratorRegionInput> realisticScaleCityFixture() {
        int[] sizes = {68, 60, 45, 38, 30, 22, 15, 1, 34};
        List<GeneratorRegionInput> regions = new ArrayList<>();
        for (int r = 0; r < sizes.length; r++) {
            String regionKey = "reg" + r;
            regions.add(new GeneratorRegionInput(regionKey, syntheticRegionAreas(regionKey, sizes[r], r * 1000.0)));
        }
        return regions;
    }

    /** Runs the SAME 6-arg {@code validate(...)} overload and argument shape
     * {@link NavigationTreeGenerationService#generateAndStoreForRevision} uses in production
     * (no overrides), given a generated tree and its originating region inputs. */
    private ValidationReport validateLikeGenerationService(
            List<GeneratedNode> generated, List<GeneratorRegionInput> regionInputs, GeneratorPolicy policy) {
        List<ValidationNode> validationNodes = generated.stream()
                .map(n -> ValidationNode.fromGeneratedNode(1L, n))
                .toList();
        Set<String> areaKeys = regionInputs.stream()
                .flatMap(r -> r.members().stream())
                .map(GeneratorArea::areaKey)
                .collect(Collectors.toSet());
        Set<String> regionKeys = regionInputs.stream()
                .map(GeneratorRegionInput::regionKey).collect(Collectors.toSet());
        return new NavigationTreeValidationService().validate(
                validationNodes, areaKeys, policy.maxSafetyDepth(), List.of(), regionKeys, areaKeys);
    }

    @Test
    @DisplayName("[#2033 P3 AC1/AC10 headline regression] 313 synthetic areas across 9 unevenly-"
            + "sized regions (68/60/45/38/30/22/15/1/34), REAL seeded policy defaults "
            + "(max_direct_children=8, min_areas_per_cluster=3, max_safety_depth=6, "
            + "one_child_prevention=true) -> generateCity(...) + the SAME 6-arg validate(...) "
            + "overload NavigationTreeGenerationService#generateAndStoreForRevision uses produces "
            + "ZERO validation errors, max node depth == 2, and every CLUSTER at depth exactly 1")
    void realisticScaleCity_generatesWithZeroValidationErrorsAndMaxDepthTwo() {
        List<GeneratorRegionInput> regions = realisticScaleCityFixture();
        int expectedAreaCount = regions.stream().mapToInt(r -> r.members().size()).sum();
        assertThat(expectedAreaCount).isEqualTo(313);

        List<GeneratedNode> generated = generator.generateCity(regions, REAL_SEEDED_POLICY, FINGERPRINT, GENERATED_AT);

        List<GeneratedNode> leaves = generated.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(313);

        ValidationReport report = validateLikeGenerationService(generated, regions, REAL_SEEDED_POLICY);
        assertThat(report.errors()).as("realistic-scale city must validate with zero errors").isEmpty();

        int maxDepth = generated.stream().mapToInt(GeneratedNode::depth).max().orElseThrow();
        assertThat(maxDepth).isEqualTo(2);
        List<GeneratedNode> clusters = generated.stream().filter(n -> "CLUSTER".equals(n.nodeType())).toList();
        assertThat(clusters).as("the 68/60/45-area regions must actually cluster").isNotEmpty();
        assertThat(clusters).allMatch(n -> n.depth() == 1);
    }

    @Test
    @DisplayName("[#2033 P3 AC2, #2086] depth invariance under policy: the realistic-scale fixture, "
            + "run with max_safety_depth in {0,1,2,6,10}, always produces max node depth <= 2 and "
            + "every CLUSTER at depth exactly 1 — max_safety_depth no longer governs bucket count OR "
            + "public depth at all (#2086 removed it from partition()'s decision path); this is the "
            + "exact Bangalore condition (an operator-set max_safety_depth=0 previously suppressed "
            + "the CLUSTER level entirely) and is the heart of the #2086 fix")
    void realisticScaleCity_depthInvariantAcrossMaxSafetyDepthValues() {
        List<GeneratorRegionInput> regions = realisticScaleCityFixture();
        for (int maxSafetyDepth : new int[] {0, 1, 2, 6, 10}) {
            GeneratorPolicy policy = policy(8, 3, maxSafetyDepth, true);
            List<GeneratedNode> generated = generator.generateCity(regions, policy, FINGERPRINT, GENERATED_AT);

            int maxDepth = generated.stream().mapToInt(GeneratedNode::depth).max().orElseThrow();
            assertThat(maxDepth).as("max_safety_depth=" + maxSafetyDepth).isLessThanOrEqualTo(2);
            List<GeneratedNode> clusters = generated.stream().filter(n -> "CLUSTER".equals(n.nodeType())).toList();
            assertThat(clusters).as("max_safety_depth=" + maxSafetyDepth).isNotEmpty();
            assertThat(clusters).as("max_safety_depth=" + maxSafetyDepth).allMatch(n -> n.depth() == 1);

            // #2086 code-review fix (Required Change 4, BLOCKING): check #11
            // (NavigationTreeValidationService#checkMaxDepth) no longer consults max_safety_depth at
            // all — S2 fixed it to simply re-assert depth <= MAX_PUBLIC_DEPTH (2), regardless of the
            // policy value. The guard that used to gate this assertion to maxSafetyDepth >= 2 (based
            // on the now-stale premise that check #11 still computed maxAllowedDepth = maxSafetyDepth
            // + 1) excluded maxSafetyDepth = 0 — the exact live hosted Bangalore value, and the
            // entire reason this issue exists — from the only assertion in this suite that runs the
            // production-shaped validateLikeGenerationService(...) pass. maxSafetyDepth = 0 must now
            // validate cleanly just like every other value — that IS the fix this issue delivers —
            // so this runs unconditionally for all five.
            ValidationReport report = validateLikeGenerationService(generated, regions, policy);
            assertThat(report.errors())
                    .as("max_safety_depth=" + maxSafetyDepth + " must still validate cleanly")
                    .isEmpty();
        }
    }

    @Test
    @DisplayName("[#2033 P3 AC5] determinism: shuffling BOTH the region list order and each "
            + "region's member order (fixed seed) produces a byte-identical generateCity output")
    void realisticScaleCity_deterministicUnderShuffledRegionAndMemberOrder() {
        List<GeneratorRegionInput> ordered = realisticScaleCityFixture();
        List<GeneratedNode> resultOrdered = generator.generateCity(
                ordered, REAL_SEEDED_POLICY, FINGERPRINT, GENERATED_AT);

        Random random = new Random(42);
        List<GeneratorRegionInput> shuffledRegions = new ArrayList<>();
        for (GeneratorRegionInput region : ordered) {
            List<GeneratorArea> shuffledMembers = new ArrayList<>(region.members());
            Collections.shuffle(shuffledMembers, random);
            shuffledRegions.add(new GeneratorRegionInput(
                    region.regionKey(), shuffledMembers, region.displayOrder(), region.displayLabel()));
        }
        Collections.shuffle(shuffledRegions, random);

        List<GeneratedNode> resultShuffled = generator.generateCity(
                shuffledRegions, REAL_SEEDED_POLICY, FINGERPRINT, GENERATED_AT);

        assertThat(resultShuffled).isEqualTo(resultOrdered);
    }

    @Test
    @DisplayName("[#2033 P3 AC4] partition exhaustiveness/disjointness: for a region large enough "
            + "to bisect repeatedly, the emitted AREA leaves exactly reproduce the member set (no "
            + "area_key missing, none duplicated) and no area_key is ever double-counted across "
            + "sibling CLUSTER buckets")
    void largeRegion_partitionIsExhaustiveAndDisjoint() {
        List<GeneratorArea> members = syntheticRegionAreas("partreg", 68, 0.0);
        List<GeneratedNode> result = generator.generateRegion(
                "partreg", members, REAL_SEEDED_POLICY, FINGERPRINT, GENERATED_AT, new HashSet<>());

        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(68);

        List<String> leafAreaKeys = leaves.stream().map(GeneratedNode::areaKey).toList();
        assertThat(new HashSet<>(leafAreaKeys)).as("every leaf area_key must be unique").hasSize(68);
        Set<String> expectedKeys = members.stream().map(GeneratorArea::areaKey).collect(Collectors.toSet());
        assertThat(new HashSet<>(leafAreaKeys)).isEqualTo(expectedKeys);

        // Disjointness: group leaves by their immediate parent (a CLUSTER bucket, or the
        // DIRECTION itself if unclustered) — no area_key may appear under more than one parent.
        Map<String, List<String>> areaKeysByParent = leaves.stream()
                .collect(Collectors.groupingBy(GeneratedNode::parentNodeKey,
                        Collectors.mapping(GeneratedNode::areaKey, Collectors.toList())));
        Set<String> seenAcrossParents = new HashSet<>();
        for (List<String> keysUnderOneParent : areaKeysByParent.values()) {
            for (String key : keysUnderOneParent) {
                assertThat(seenAcrossParents.add(key))
                        .as("area_key " + key + " must belong to exactly one bucket/parent").isTrue();
            }
        }
    }

    // ── #2033 P3 AC3/AC7 edge cases (each asserts shape AND zero validation errors) ────────────

    @Test
    @DisplayName("[#2033 P3 edge (a)] region with exactly 1 area -> DIRECTION + AREA at depth 1, "
            + "no CLUSTER, validates cleanly")
    void edgeCase_singleAreaRegion_validatesCleanly() {
        List<GeneratorArea> members = List.of(area("edgea|a1", "A1", 12.0));
        List<GeneratedNode> result = generator.generateRegion(
                "edgea", members, REAL_SEEDED_POLICY, FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(result).hasSize(2);
        assertThat(result.stream().map(GeneratedNode::nodeType).collect(Collectors.toSet()))
                .containsExactlyInAnyOrder("DIRECTION", "AREA");
        GeneratedNode leaf = result.stream().filter(n -> "AREA".equals(n.nodeType())).findFirst().orElseThrow();
        assertThat(leaf.depth()).isEqualTo(1);
        assertValidatesCleanly(result);
    }

    @Test
    @DisplayName("[#2033 P3 edge (b)] region with exactly max_direct_children areas -> AREAs at "
            + "depth 1, no CLUSTER, validates cleanly")
    void edgeCase_exactlyMaxDirectChildren_validatesCleanly() {
        List<GeneratorArea> members = syntheticRegionAreas("edgeb", 8, 0.0); // == max_direct_children
        List<GeneratedNode> result = generator.generateRegion(
                "edgeb", members, REAL_SEEDED_POLICY, FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(result.stream().filter(n -> "CLUSTER".equals(n.nodeType())).toList()).isEmpty();
        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(8);
        assertThat(leaves).allMatch(n -> n.depth() == 1);
        assertValidatesCleanly(result);
    }

    @Test
    @DisplayName("[#2033 P3 edge (c)] region with max_direct_children + 1 areas -> splits into "
            + "depth-1 CLUSTERs, validates cleanly")
    void edgeCase_maxDirectChildrenPlusOne_validatesCleanly() {
        List<GeneratorArea> members = syntheticRegionAreas("edgec", 9, 0.0); // == max_direct_children + 1
        List<GeneratedNode> result = generator.generateRegion(
                "edgec", members, REAL_SEEDED_POLICY, FINGERPRINT, GENERATED_AT, new HashSet<>());

        List<GeneratedNode> clusters = result.stream().filter(n -> "CLUSTER".equals(n.nodeType())).toList();
        assertThat(clusters).isNotEmpty();
        assertThat(clusters).allMatch(n -> n.depth() == 1);
        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(9);
        assertValidatesCleanly(result);
    }

    @Test
    @DisplayName("[#2086 edge (d)] 3 members exceeding effective breadth 2 stay unsplit — not "
            + "because of the removed one_child_prevention policy knob, but because of the hard, "
            + "policy-independent >= 2-per-bucket floor (3 cannot divide into groups that are "
            + "simultaneously <= 2 and >= 2) — validates cleanly")
    void edgeCase_threeMembersExceedingBreadthTwo_staysUnsplit_validatesCleanly() {
        List<GeneratorArea> members = List.of(
                area("edged|o1", "O1", 12.0), area("edged|o2", "O2", 12.1), area("edged|o3", "O3", 12.2));
        // 3 members > effectiveBreadth(2)=2, but 3 cannot be split into groups that are
        // simultaneously <= 2 and >= 2 — the hard, policy-independent >= 2-per-bucket floor (not
        // the removed one_child_prevention/min_areas_per_cluster knobs) keeps this UNSPLIT, emitted
        // as unclustered AREA leaves directly under DIRECTION.
        GeneratorPolicy formerlyRejectingPolicy = policy(2, 1, 5, true);
        List<GeneratedNode> result = generator.generateRegion(
                "edged", members, formerlyRejectingPolicy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(result.stream().filter(n -> "CLUSTER".equals(n.nodeType())).toList()).isEmpty();
        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(3);
        assertThat(leaves).allMatch(n -> n.depth() == 1 && "d:edged".equals(n.parentNodeKey()));
        assertValidatesCleanly(result);
    }

    @Test
    @DisplayName("[#2086 edge (e)] a split that pre-#2086 would have been rejected mid-recursion "
            + "(below min_areas_per_cluster) is now MANDATORY: every leaf bucket stays within "
            + "effective breadth — no bucket may ever exceed max_direct_children, unlike the pre-#2086 "
            + "reject-and-collapse escape hatch this issue removes — validates cleanly")
    void edgeCase_formerlyRejectedMidRecursionSplit_nowMandatory_noOversizedBucket_validatesCleanly() {
        // 10 members, max_direct_children=4, min_areas_per_cluster=4: pre-#2086 the top split (5/5)
        // was accepted but each half's own further split (2/3) fell below floor=4 and was rejected,
        // collapsing each half into ONE CLUSTER of 5 — exceeding max_direct_children=4, exactly the
        // escape hatch that let a real DIRECTION/CLUSTER balloon past its policy breadth. #2086
        // removes that escape hatch: min_areas_per_cluster no longer vetoes a mandated split.
        List<GeneratorArea> members = syntheticRegionAreas("edgee", 10, 0.0);
        GeneratorPolicy formerlyMidRejectingPolicy = policy(4, 4, 5, true);
        List<GeneratedNode> result = generator.generateRegion(
                "edgee", members, formerlyMidRejectingPolicy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        List<GeneratedNode> clusters = result.stream().filter(n -> "CLUSTER".equals(n.nodeType())).toList();
        assertThat(clusters).isNotEmpty();
        assertThat(clusters).allMatch(n -> n.depth() == 1);
        assertThat(clusters)
                .as("#2086: no bucket may ever exceed effectiveBreadth (here, max_direct_children=4)")
                .allMatch(n -> n.descendantAreaCount() <= 4);
        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(10);
        assertValidatesCleanly(result);
    }

    @Test
    @DisplayName("[#2033 P3 edge (f)] all areas sharing an identical centroid (zero range on both "
            + "axes) -> partition still terminates (tie-broken lexicographically by area_key), "
            + "output validates cleanly")
    void edgeCase_identicalCentroids_partitionTerminatesAndValidatesCleanly() {
        List<GeneratorArea> members = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            members.add(area(String.format("edgef|a%02d", i), "F" + i, 12.0)); // identical lat AND lon
        }
        List<GeneratedNode> result = generator.generateRegion(
                "edgef", members, REAL_SEEDED_POLICY, FINGERPRINT, GENERATED_AT, new HashSet<>());

        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(20);
        assertThat(result).allMatch(n -> n.depth() <= 2);
        assertValidatesCleanly(result);
    }

    @Test
    @DisplayName("[#2033 P3 edge (h), #2086 S1b fan-out cap] a very dense single region (130 areas) "
            + "at REAL_SEEDED_POLICY's max_direct_children=8 -> many depth-1 CLUSTERs, but the "
            + "leaf CLUSTER count is capped at <= MANDATORY_MAX_CHILDREN(15) even though 8-area "
            + "buckets alone would need ceilDiv(130,8)=17 (BREADTH_EXCEEDED pre-#2086-S1b) — bucket "
            + "size relaxes toward 9 so fan-out stays <= 15, still zero validation errors, still "
            + "depth <= 2")
    void edgeCase_denseSingleRegion_manyClustersButStillValid() {
        List<GeneratorArea> members = syntheticRegionAreas("edgeh", 130, 0.0);
        List<GeneratedNode> result = generator.generateRegion(
                "edgeh", members, REAL_SEEDED_POLICY, FINGERPRINT, GENERATED_AT, new HashSet<>());

        List<GeneratedNode> clusters = result.stream().filter(n -> "CLUSTER".equals(n.nodeType())).toList();
        assertThat(clusters.size()).as("a 130-area region must produce many depth-1 clusters").isGreaterThan(10);
        assertThat(clusters.size())
                .as("#2086 S1b: fan-out is capped at MANDATORY_MAX_CHILDREN(15) — never ceilDiv(130,8)=17")
                .isLessThanOrEqualTo(15);
        assertThat(clusters).allMatch(n -> n.depth() == 1);
        assertThat(clusters).as("each bucket relaxes toward 9 areas to keep fan-out <= 15, never exceeding 15")
                .allMatch(n -> n.descendantAreaCount() <= 15);
        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(130);
        assertThat(result).allMatch(n -> n.depth() <= 2);
        assertValidatesCleanly(result);
    }

    // Note: edge (g) — max_safety_depth=0 -> no CLUSTER at all, AREAs at depth 1 — is already
    // covered at full strength by maxSafetyDepthZero_producesDirectionToAreaShapeOnly above
    // (includes assertValidatesCleanly); not duplicated here.

    @Test
    @DisplayName("[#2033 P3 AC7 / validator #4] every emitted CLUSTER has >= max(2, "
            + "min_areas_per_cluster) AREA children, across both the realistic-scale city and a "
            + "dense single-region fixture")
    void everyCluster_hasAtLeastFloorAreaChildren() {
        int floor = Math.max(2, REAL_SEEDED_POLICY.minAreasPerCluster());

        List<GeneratedNode> cityResult = generator.generateCity(
                realisticScaleCityFixture(), REAL_SEEDED_POLICY, FINGERPRINT, GENERATED_AT);
        assertClustersMeetFloor(cityResult, floor);

        List<GeneratedNode> denseResult = generator.generateRegion(
                "floorcheck", syntheticRegionAreas("floorcheck", 130, 0.0), REAL_SEEDED_POLICY,
                FINGERPRINT, GENERATED_AT, new HashSet<>());
        assertClustersMeetFloor(denseResult, floor);
    }

    private void assertClustersMeetFloor(List<GeneratedNode> nodes, int floor) {
        List<GeneratedNode> clusters = nodes.stream().filter(n -> "CLUSTER".equals(n.nodeType())).toList();
        assertThat(clusters).isNotEmpty();
        assertThat(clusters).allMatch(n -> n.descendantAreaCount() >= floor);
    }

    @Test
    @DisplayName("[#2033 P3 AC6, R2 guard] display_order is gapless 1..N at all three sibling "
            + "scopes across a multi-region city: DIRECTIONs city-wide, CLUSTERs under EACH "
            + "Direction (restarting at 1 per Direction, never running city-wide), and AREAs under "
            + "each parent")
    void displayOrder_gaplessAtAllThreeSiblingScopes_multiRegion() {
        List<GeneratorRegionInput> regions = List.of(
                new GeneratorRegionInput("north", syntheticRegionAreas("north", 20, 0.0)),
                new GeneratorRegionInput("south", syntheticRegionAreas("south", 20, 100.0)));
        GeneratorPolicy policy = policy(2, 1, 5, true);
        List<GeneratedNode> result = generator.generateCity(regions, policy, FINGERPRINT, GENERATED_AT);

        // 1) DIRECTIONs city-wide: gapless 1..N (N = region count).
        List<Integer> directionOrders = result.stream()
                .filter(n -> "DIRECTION".equals(n.nodeType()))
                .map(GeneratedNode::displayOrder).sorted().toList();
        assertThat(directionOrders).containsExactly(1, 2);

        // 2) CLUSTERs under EACH Direction: independently gapless 1..M, restarting at 1 per
        // Direction — the R2 trap this test specifically guards against.
        Map<String, GeneratedNode> directionsByRegion = result.stream()
                .filter(n -> "DIRECTION".equals(n.nodeType()))
                .collect(Collectors.toMap(GeneratedNode::regionKey, n -> n));
        for (GeneratedNode direction : directionsByRegion.values()) {
            List<Integer> clusterOrders = result.stream()
                    .filter(n -> "CLUSTER".equals(n.nodeType()) && direction.nodeKey().equals(n.parentNodeKey()))
                    .map(GeneratedNode::displayOrder).sorted().toList();
            assertThat(clusterOrders)
                    .as("CLUSTER display_order under " + direction.nodeKey() + " must restart at 1")
                    .isNotEmpty()
                    .containsExactlyElementsOf(
                            java.util.stream.IntStream.rangeClosed(1, clusterOrders.size()).boxed().toList());
        }

        // 3) AREAs under each parent (DIRECTION or CLUSTER): independently gapless 1..K.
        Map<String, List<GeneratedNode>> areasByParent = result.stream()
                .filter(n -> "AREA".equals(n.nodeType()))
                .collect(Collectors.groupingBy(GeneratedNode::parentNodeKey));
        assertThat(areasByParent).isNotEmpty();
        for (Map.Entry<String, List<GeneratedNode>> e : areasByParent.entrySet()) {
            List<Integer> areaOrders = e.getValue().stream().map(GeneratedNode::displayOrder).sorted().toList();
            assertThat(areaOrders)
                    .as("AREA display_order under " + e.getKey() + " must be gapless")
                    .containsExactlyElementsOf(
                            java.util.stream.IntStream.rangeClosed(1, areaOrders.size()).boxed().toList());
        }

        assertValidatesCleanly(result);
    }

    @Test
    @DisplayName("[#2033 P3 validator #13] ancestorKeys is exact for a depth-1 AREA "
            + "([directionKey]), a depth-1 CLUSTER ([directionKey]), and a depth-2 AREA "
            + "([directionKey, clusterKey])")
    void ancestorKeys_exactAtEveryDepth() {
        // Region A: 1 area -> depth-1 AREA directly under DIRECTION (no CLUSTER).
        List<GeneratedNode> shallow = generator.generateRegion(
                "ancA", List.of(area("ancA|a1", "A1", 12.0)), REAL_SEEDED_POLICY, FINGERPRINT, GENERATED_AT,
                new HashSet<>());
        GeneratedNode shallowDirection = shallow.stream()
                .filter(n -> "DIRECTION".equals(n.nodeType())).findFirst().orElseThrow();
        GeneratedNode shallowArea = shallow.stream()
                .filter(n -> "AREA".equals(n.nodeType())).findFirst().orElseThrow();
        assertThat(shallowArea.depth()).isEqualTo(1);
        assertThat(shallowArea.ancestorKeys()).containsExactly(shallowDirection.nodeKey());

        // Region B: enough areas to force a CLUSTER layer -> depth-1 CLUSTER, depth-2 AREA.
        List<GeneratedNode> deep = generator.generateRegion(
                "ancB", syntheticRegionAreas("ancB", 20, 0.0), policy(2, 1, 5, true), FINGERPRINT,
                GENERATED_AT, new HashSet<>());
        GeneratedNode deepDirection = deep.stream()
                .filter(n -> "DIRECTION".equals(n.nodeType())).findFirst().orElseThrow();
        GeneratedNode deepCluster = deep.stream()
                .filter(n -> "CLUSTER".equals(n.nodeType())).findFirst().orElseThrow();
        assertThat(deepCluster.depth()).isEqualTo(1);
        assertThat(deepCluster.ancestorKeys()).containsExactly(deepDirection.nodeKey());

        GeneratedNode deepAreaLeaf = deep.stream()
                .filter(n -> "AREA".equals(n.nodeType()) && deepCluster.nodeKey().equals(n.parentNodeKey()))
                .findFirst().orElseThrow();
        assertThat(deepAreaLeaf.depth()).isEqualTo(2);
        assertThat(deepAreaLeaf.ancestorKeys()).containsExactly(deepDirection.nodeKey(), deepCluster.nodeKey());

        assertValidatesCleanly(shallow);
        assertValidatesCleanly(deep);
    }

    // ── #2086 S1: MANDATORY_MAX_CHILDREN=15 bucket-sizing table ─────────────────────────────────

    @Test
    @DisplayName("[#2086] n=15 with effective breadth 15 -> k=ceilDiv(15,15)=1 -> the MANDATORY "
            + "no-split guard fires BEFORE any split is attempted (qa-fast R-B1): all 15 areas are "
            + "unclustered AREA leaves directly under DIRECTION, no CLUSTER, no empty second bucket")
    void bucketSizing_n15_noSplitGuardFiresBeforeAnySplitAttempt() {
        List<GeneratorArea> members = syntheticRegionAreas("b15", 15, 0.0);
        GeneratorPolicy policy = policy(15, 1, 6, false);
        List<GeneratedNode> result = generator.generateRegion(
                "b15", members, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(result.stream().filter(n -> "CLUSTER".equals(n.nodeType())).toList()).isEmpty();
        List<GeneratedNode> leaves = result.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        assertThat(leaves).hasSize(15);
        assertThat(leaves).allMatch(n -> n.depth() == 1 && "d:b15".equals(n.parentNodeKey()));
        assertValidatesCleanly(result);
    }

    @Test
    @DisplayName("[#2086] bucket-sizing table at n in {16,17,30,31,225} with effective breadth 15: "
            + "exactly ceil(n/15) leaf CLUSTERs, each of size floor(n/k) or ceil(n/k) — every bucket "
            + "8-15 areas, no one-child bucket, member set exhaustive and disjoint (matches the "
            + "expected mathematical property from the approved plan)")
    void bucketSizing_tableAtVariousN_matchesExpectedFloorCeilSizes() {
        GeneratorPolicy policy = policy(15, 1, 6, false);
        for (int n : new int[] {16, 17, 30, 31, 225}) {
            int k = (n + 15 - 1) / 15; // ceilDiv(n, 15) — mirrors the generator's own formula
            int floorSize = n / k;
            int ceilSize = (n + k - 1) / k;

            List<GeneratorArea> members = syntheticRegionAreas("bsz" + n, n, n * 10.0);
            List<GeneratedNode> result = generator.generateRegion(
                    "bsz" + n, members, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

            List<GeneratedNode> clusters = result.stream().filter(c -> "CLUSTER".equals(c.nodeType())).toList();
            assertThat(clusters).as("n=" + n + " leaf CLUSTER count").hasSize(k);
            assertThat(clusters).as("n=" + n + " every bucket 8-15 areas (MANDATORY_MAX_CHILDREN)")
                    .allMatch(c -> c.descendantAreaCount() >= 8 && c.descendantAreaCount() <= 15);
            assertThat(clusters).as("n=" + n + " every bucket size is floor(n/k) or ceil(n/k)")
                    .allMatch(c -> c.descendantAreaCount() == floorSize || c.descendantAreaCount() == ceilSize);
            assertThat(clusters.stream().mapToInt(GeneratedNode::descendantAreaCount).sum())
                    .as("n=" + n + " bucket sizes sum to n").isEqualTo(n);

            // Exhaustive + disjoint: every member area_key appears exactly once across all leaves.
            List<GeneratedNode> leaves = result.stream().filter(a -> "AREA".equals(a.nodeType())).toList();
            assertThat(leaves).hasSize(n);
            Set<String> expectedKeys = members.stream().map(GeneratorArea::areaKey).collect(Collectors.toSet());
            Set<String> actualKeys = leaves.stream().map(GeneratedNode::areaKey).collect(Collectors.toSet());
            assertThat(actualKeys).as("n=" + n + " leaf area_keys are exhaustive+disjoint").isEqualTo(expectedKeys);

            assertValidatesCleanly(result);
        }
    }

    // ── #2086 S1b: fan-out (bucket COUNT) cap, not merely bucket-SIZE cap ───────────────────────

    @Test
    @DisplayName("[#2086 S1b] fan-out (leaf CLUSTER count) never exceeds MANDATORY_MAX_CHILDREN(15), "
            + "and no bucket ever exceeds 15 areas either, for n up to 225 at BOTH "
            + "max_direct_children=8 and =15")
    void fanOutAndBucketSizeCaps_neverExceed15_upTo225_bothBreadths() {
        for (int maxDirectChildren : new int[] {8, 15}) {
            GeneratorPolicy policy = policy(maxDirectChildren, 1, 6, false);
            for (int n : new int[] {2, 8, 9, 15, 16, 60, 119, 120, 121, 130, 200, 224, 225}) {
                String regionKey = "fo" + maxDirectChildren + "_" + n;
                List<GeneratorArea> members = syntheticRegionAreas(regionKey, n, n * 10.0);
                List<GeneratedNode> result = generator.generateRegion(
                        regionKey, members, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

                List<GeneratedNode> clusters =
                        result.stream().filter(c -> "CLUSTER".equals(c.nodeType())).toList();
                assertThat(clusters.size())
                        .as("maxDirectChildren=" + maxDirectChildren + " n=" + n + " leaf CLUSTER count")
                        .isLessThanOrEqualTo(15);
                assertThat(clusters)
                        .as("maxDirectChildren=" + maxDirectChildren + " n=" + n + " no bucket exceeds 15 areas")
                        .allMatch(c -> c.descendantAreaCount() <= 15);
                assertValidatesCleanly(result);
            }
        }
    }

    @Test
    @DisplayName("[#2086 S1b] at max_direct_children=8: n=120 still yields 8-area buckets (policy "
            + "preference honoured — minSizeForFanout=ceilDiv(120,15)=8 does not force a relax), "
            + "n=130 relaxes bucket size toward 9 so fan-out stays <= 15 (the fan-out cap engages) "
            + "— both validate cleanly")
    void bucketSizing_n120PolicyHonoured_n130FanoutCapEngages() {
        GeneratorPolicy policy = policy(8, 1, 6, false);

        List<GeneratorArea> members120 = syntheticRegionAreas("bs120", 120, 0.0);
        List<GeneratedNode> result120 = generator.generateRegion(
                "bs120", members120, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());
        List<GeneratedNode> clusters120 =
                result120.stream().filter(c -> "CLUSTER".equals(c.nodeType())).toList();
        assertThat(clusters120).hasSize(15);
        assertThat(clusters120)
                .as("n=120: buckets stay exactly 8 areas each (policy preference honoured)")
                .allMatch(c -> c.descendantAreaCount() == 8);
        assertValidatesCleanly(result120);

        List<GeneratorArea> members130 = syntheticRegionAreas("bs130", 130, 0.0);
        List<GeneratedNode> result130 = generator.generateRegion(
                "bs130", members130, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());
        List<GeneratedNode> clusters130 =
                result130.stream().filter(c -> "CLUSTER".equals(c.nodeType())).toList();
        assertThat(clusters130.size()).as("n=130: fan-out cap engaged").isLessThanOrEqualTo(15);
        assertThat(clusters130)
                .as("n=130: bucket size relaxes to 8 or 9 (never higher) to keep fan-out <= 15")
                .allMatch(c -> c.descendantAreaCount() == 8 || c.descendantAreaCount() == 9);
        assertValidatesCleanly(result130);
    }

    @Test
    @DisplayName("[#2086 S1b AC17] n=225 at max_direct_children=8 -> exactly 15 leaf CLUSTERs of "
            + "exactly 15 areas each (15x15=225, exactly at both limits simultaneously) -> validates "
            + "cleanly")
    void bucketSizing_n225_exactlyAtBothLimits_validatesCleanly() {
        GeneratorPolicy policy = policy(8, 1, 6, false);
        List<GeneratorArea> members = syntheticRegionAreas("bs225", 225, 0.0);
        List<GeneratedNode> result = generator.generateRegion(
                "bs225", members, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        List<GeneratedNode> clusters = result.stream().filter(c -> "CLUSTER".equals(c.nodeType())).toList();
        assertThat(clusters).hasSize(15);
        assertThat(clusters).allMatch(c -> c.descendantAreaCount() == 15);
        List<GeneratedNode> leaves = result.stream().filter(a -> "AREA".equals(a.nodeType())).toList();
        assertThat(leaves).hasSize(225);
        assertValidatesCleanly(result);
    }

    @Test
    @DisplayName("[#2086 S1b AC17] n=226 at max_direct_children=8 exceeds the universal 225 (15x15) "
            + "ceiling that no bucketSize can satisfy simultaneously (bucket size AND bucket count "
            + "both <= 15) — the generator still emits every area (never silently drops one), but "
            + "NavigationTreeValidationService fails the tree closed, naming the region, its "
            + "canonical area count, and the 225 ceiling")
    void bucketSizing_n226_exceedsUniversalCeiling_failsValidationWith225Diagnostic() {
        GeneratorPolicy policy = policy(8, 1, 6, false);
        List<GeneratorArea> members = syntheticRegionAreas("bs226", 226, 0.0);
        List<GeneratedNode> result = generator.generateRegion(
                "bs226", members, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        List<GeneratedNode> leaves = result.stream().filter(a -> "AREA".equals(a.nodeType())).toList();
        assertThat(leaves).as("the generator never silently drops an area").hasSize(226);

        List<ValidationNode> validationNodes = result.stream()
                .map(n -> ValidationNode.fromGeneratedNode(1L, n))
                .toList();
        ValidationReport report = new NavigationTreeValidationService().validate(validationNodes);

        assertThat(report.errors()).as("226 canonical areas must fail validation fail-closed").isNotEmpty();
        assertThat(report.errors())
                .as("diagnostic must name the 226 canonical-area count and the 225 ceiling")
                .anyMatch(e -> e.message() != null && e.message().contains("226") && e.message().contains("225"));
    }

    // ── #2086 R1: DIRECTION display_label is GENERATED, never a raw compass region label ────────

    @Test
    @DisplayName("[#2086 design.R1] a region whose city_regions.display_label seeds \"north\" emits a "
            + "DIRECTION display_label derived from its member area names, NOT the raw \"north\" "
            + "label — regionKey itself is UNCHANGED and still \"north\" on every node")
    void directionLabel_isAreaDerivedNotRawRegionDisplayLabel() {
        GeneratorRegionInput region = new GeneratorRegionInput(
                "north", List.of(area("city|dn1", "Whitefield", 12.0), area("city|dn2", "Marathahalli", 12.1)),
                1, "north");

        List<GeneratedNode> result = generator.generateCity(
                List.of(region), policy(4, 2, 5, true), FINGERPRINT, GENERATED_AT);

        GeneratedNode direction = result.stream()
                .filter(n -> "DIRECTION".equals(n.nodeType())).findFirst().orElseThrow();
        assertThat(direction.displayLabel()).isNotEqualTo("north");
        // deriveLabel joins the (up to 2) representative area names with " & ".
        assertThat(direction.displayLabel()).containsAnyOf("Whitefield", "Marathahalli");
        // regionKey is completely unaffected — still internal/structural metadata.
        assertThat(direction.regionKey()).isEqualTo("north");
    }

    // ── #2086 R4: bearingDegrees ─────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("[#2086 design.R4] bearingDegrees is NULL for every depth-0 DIRECTION node, and "
            + "non-null, within [0,360), for every CLUSTER/AREA node below it")
    void bearingDegrees_nullAtDirectionDepth_nonNullAndInRangeBelow() {
        List<GeneratedNode> result = generator.generateRegion(
                "brg", syntheticRegionAreas("brg", 20, 0.0), policy(2, 1, 5, true), FINGERPRINT,
                GENERATED_AT, new HashSet<>());

        result.stream().filter(n -> "DIRECTION".equals(n.nodeType())).forEach(n ->
                assertThat(n.bearingDegrees()).as(n.nodeKey() + " bearingDegrees").isNull());

        result.stream().filter(n -> !"DIRECTION".equals(n.nodeType())).forEach(n -> {
            assertThat(n.bearingDegrees()).as(n.nodeKey() + " bearingDegrees").isNotNull();
            assertThat(n.bearingDegrees().doubleValue())
                    .as(n.nodeKey() + " bearingDegrees range").isGreaterThanOrEqualTo(0.0).isLessThan(360.0);
        });
    }

    @Test
    @DisplayName("[#2086 design.R4, qa-fast R-D2] re-run determinism extends to bearingDegrees: two "
            + "generations of identical geometry+policy are byte-for-byte equal, INCLUDING every "
            + "node's bearingDegrees column (GeneratedNode is a record, so equals() already compares "
            + "it — this test names the property explicitly rather than relying on incidental coverage)")
    void bearingDegrees_isPartOfTheDeterminismContract() {
        List<GeneratorArea> areas = syntheticRegionAreas("brgdet", 40, 5.0);
        GeneratorPolicy policy = policy(8, 3, 6, true);

        List<GeneratedNode> firstRun = generator.generateRegion(
                "brgdet", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());
        List<GeneratedNode> secondRun = generator.generateRegion(
                "brgdet", areas, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(firstRun).isEqualTo(secondRun);
        // Collectors.toMap rejects a null value (DIRECTION's bearingDegrees is legitimately null —
        // #2086 design.R4), so build the comparison map with a plain LinkedHashMap instead.
        Map<String, BigDecimal> firstBearingByKey = new java.util.LinkedHashMap<>();
        firstRun.forEach(n -> firstBearingByKey.put(n.nodeKey(), n.bearingDegrees()));
        Map<String, BigDecimal> secondBearingByKey = new java.util.LinkedHashMap<>();
        secondRun.forEach(n -> secondBearingByKey.put(n.nodeKey(), n.bearingDegrees()));
        assertThat(secondBearingByKey).as("bearingDegrees byte-for-byte identical across re-runs")
                .isEqualTo(firstBearingByKey);
    }

    @Test
    @DisplayName("[qa-fast R-D1b] shuffled-input determinism with a FIXED, explicitly non-sorted seed: "
            + "a shuffle of already-sorted input must not accidentally happen to re-sort itself back "
            + "to ascending order (which would false-pass a shuffle test) — this fixture's shuffled "
            + "order is asserted non-ascending before generation, then both orders must still produce "
            + "a byte-identical tree")
    void shuffledInputDeterminism_fixedSeedGenuinelyReordersInput() {
        List<GeneratorArea> ascending = new ArrayList<>();
        for (int i = 0; i < 25; i++) {
            ascending.add(area(String.format("shuf|a%02d", i), "Shuf" + i, 12.0 + i * 0.05));
        }
        List<GeneratorArea> shuffled = new ArrayList<>(ascending);
        Collections.shuffle(shuffled, new Random(7));

        // Guard against the false-pass qa-fast flagged: the shuffle must have genuinely reordered
        // the input, not coincidentally reproduced ascending order.
        assertThat(shuffled.stream().map(GeneratorArea::areaKey).toList())
                .as("fixed-seed shuffle must genuinely reorder the input")
                .isNotEqualTo(ascending.stream().map(GeneratorArea::areaKey).toList());

        GeneratorPolicy policy = policy(8, 3, 6, true);
        List<GeneratedNode> resultAscending = generator.generateRegion(
                "shuf", ascending, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());
        List<GeneratedNode> resultShuffled = generator.generateRegion(
                "shuf", shuffled, policy, FINGERPRINT, GENERATED_AT, new HashSet<>());

        assertThat(resultShuffled).isEqualTo(resultAscending);
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
