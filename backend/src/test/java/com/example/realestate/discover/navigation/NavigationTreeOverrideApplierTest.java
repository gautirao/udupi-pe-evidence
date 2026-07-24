package com.example.realestate.discover.navigation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link NavigationTreeOverrideApplier} (#1955 Areas PR A, SLICE 2f+2g). Pure
 * in-memory fixtures only — no Spring context, no DB.
 */
class NavigationTreeOverrideApplierTest {

    private static final Instant GENERATED_AT = Instant.parse("2026-07-23T00:00:00Z");
    private static final String FINGERPRINT = "fp-test";

    private final NavigationTreeOverrideApplier applier = new NavigationTreeOverrideApplier();

    private static GeneratorArea area(String areaKey, String name, double lat) {
        BigDecimal latBd = BigDecimal.valueOf(lat);
        BigDecimal lon = BigDecimal.valueOf(77.0);
        return new GeneratorArea(areaKey, name, latBd, lon,
                latBd.subtract(BigDecimal.valueOf(0.01)), lon.subtract(BigDecimal.valueOf(0.01)),
                latBd.add(BigDecimal.valueOf(0.01)), lon.add(BigDecimal.valueOf(0.01)));
    }

    private static NavigationOverride excludeArea(String areaKey) {
        return new NavigationOverride("EXCLUDE_AREA", areaKey, null, null, null, null, null, 1);
    }

    private static NavigationOverride reassign(String areaKey, String targetRegion) {
        return new NavigationOverride("REASSIGN_AREA_REGION", areaKey, null, targetRegion, null, null, null, 1);
    }

    private static NavigationOverride move(String areaKey, String targetNodeKey) {
        return new NavigationOverride("MOVE_AREA", areaKey, null, null, targetNodeKey, null, null, 1);
    }

    private static NavigationOverride relabel(String nodeKey, String newLabel) {
        return new NavigationOverride("RELABEL", null, nodeKey, null, null, newLabel, null, 1);
    }

    private static NavigationOverride setReps(String nodeKey, List<String> reps) {
        return new NavigationOverride("SET_REPRESENTATIVES", null, nodeKey, null, null, null, reps, 1);
    }

    // ── applyPreBisection ────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("EXCLUDE_AREA removes the area from its region's member list")
    void excludeAreaRemovesFromRegion() {
        List<GeneratorRegionInput> regions = List.of(
                new GeneratorRegionInput("north", List.of(area("city|a", "A", 12.0), area("city|b", "B", 12.1))));
        List<GeneratorRegionInput> result = applier.applyPreBisection(regions, List.of(excludeArea("city|a")));

        assertThat(result).hasSize(1);
        assertThat(result.get(0).members()).extracting(GeneratorArea::areaKey).containsExactly("city|b");
    }

    @Test
    @DisplayName("no overrides -> regions returned unchanged (same reference, zero-cost no-op)")
    void noOverridesIsNoOp() {
        List<GeneratorRegionInput> regions = List.of(
                new GeneratorRegionInput("north", List.of(area("city|a", "A", 12.0))));
        assertThat(applier.applyPreBisection(regions, List.of())).isSameAs(regions);
        assertThat(applier.applyPreBisection(regions, null)).isSameAs(regions);
    }

    @Test
    @DisplayName("REASSIGN_AREA_REGION moves the area from its source region to the target region")
    void reassignMovesAreaAcrossRegions() {
        List<GeneratorRegionInput> regions = List.of(
                new GeneratorRegionInput("north", List.of(area("city|a", "A", 12.0), area("city|b", "B", 12.1))),
                new GeneratorRegionInput("south", List.of(area("city|c", "C", 11.0))));
        List<GeneratorRegionInput> result = applier.applyPreBisection(regions, List.of(reassign("city|a", "south")));

        Map<String, List<String>> byRegion = result.stream()
                .collect(Collectors.toMap(GeneratorRegionInput::regionKey,
                        r -> r.members().stream().map(GeneratorArea::areaKey).toList()));
        assertThat(byRegion.get("north")).containsExactly("city|b");
        assertThat(byRegion.get("south")).containsExactlyInAnyOrder("city|c", "city|a");
    }

    @Test
    @DisplayName("REASSIGN_AREA_REGION to an unknown region is a silent no-op (flagged by validation, not the applier)")
    void reassignToUnknownRegionIsNoOp() {
        List<GeneratorRegionInput> regions = List.of(
                new GeneratorRegionInput("north", List.of(area("city|a", "A", 12.0))));
        List<GeneratorRegionInput> result = applier.applyPreBisection(regions, List.of(reassign("city|a", "nowhere")));
        assertThat(result.get(0).members()).extracting(GeneratorArea::areaKey).containsExactly("city|a");
    }

    // ── applyPostBisection: MOVE_AREA ───────────────────────────────────────────────────────────

    private List<GeneratedNode> twoClusterTree() {
        // c:north:a-b { a:city|a, a:city|b }, c:north:c-d { a:city|c, a:city|d }
        GeneratedNode clusterAB = new GeneratedNode(
                "north", "CLUSTER", "c:north:a-b", null, null, List.of("city|a", "city|b"), "A & B", 1, 0,
                List.of(), 2, bd(12.0), bd(77.0), bd(11.99), bd(76.99), bd(12.01), bd(77.01), FINGERPRINT, GENERATED_AT);
        GeneratedNode areaA = new GeneratedNode(
                "north", "AREA", "a:city|a", "c:north:a-b", "city|a", List.of("city|a"), "A", 1, 1,
                List.of("c:north:a-b"), 1, bd(12.0), bd(77.0), bd(11.99), bd(76.99), bd(12.01), bd(77.01),
                FINGERPRINT, GENERATED_AT);
        GeneratedNode areaB = new GeneratedNode(
                "north", "AREA", "a:city|b", "c:north:a-b", "city|b", List.of("city|b"), "B", 2, 1,
                List.of("c:north:a-b"), 1, bd(12.1), bd(77.0), bd(12.09), bd(76.99), bd(12.11), bd(77.01),
                FINGERPRINT, GENERATED_AT);
        GeneratedNode clusterCD = new GeneratedNode(
                "north", "CLUSTER", "c:north:c-d", null, null, List.of("city|c", "city|d"), "C & D", 2, 0,
                List.of(), 2, bd(13.0), bd(77.0), bd(12.99), bd(76.99), bd(13.01), bd(77.01), FINGERPRINT, GENERATED_AT);
        GeneratedNode areaC = new GeneratedNode(
                "north", "AREA", "a:city|c", "c:north:c-d", "city|c", List.of("city|c"), "C", 1, 1,
                List.of("c:north:c-d"), 1, bd(13.0), bd(77.0), bd(12.99), bd(76.99), bd(13.01), bd(77.01),
                FINGERPRINT, GENERATED_AT);
        GeneratedNode areaD = new GeneratedNode(
                "north", "AREA", "a:city|d", "c:north:c-d", "city|d", List.of("city|d"), "D", 2, 1,
                List.of("c:north:c-d"), 1, bd(13.1), bd(77.0), bd(13.09), bd(76.99), bd(13.11), bd(77.01),
                FINGERPRINT, GENERATED_AT);
        return List.of(clusterAB, areaA, areaB, clusterCD, areaC, areaD);
    }

    private static BigDecimal bd(double v) {
        return BigDecimal.valueOf(v).setScale(6, java.math.RoundingMode.HALF_UP);
    }

    @Test
    @DisplayName("MOVE_AREA reparents the AREA leaf under the target CLUSTER")
    void moveAreaReparents() {
        List<GeneratedNode> result = applier.applyPostBisection(
                twoClusterTree(), List.of(move("city|a", "c:north:c-d")));

        Map<String, GeneratedNode> byKey = result.stream()
                .collect(Collectors.toMap(GeneratedNode::nodeKey, n -> n));
        assertThat(byKey.get("a:city|a").parentNodeKey()).isEqualTo("c:north:c-d");
        assertThat(byKey.get("a:city|a").ancestorKeys()).containsExactly("c:north:c-d");
        assertThat(byKey.get("a:city|a").depth()).isEqualTo(1);
    }

    @Test
    @DisplayName("MOVE_AREA recomputes descendant_area_count for both the source and target clusters")
    void moveAreaRecomputesDescendantCounts() {
        List<GeneratedNode> result = applier.applyPostBisection(
                twoClusterTree(), List.of(move("city|a", "c:north:c-d")));

        Map<String, GeneratedNode> byKey = result.stream()
                .collect(Collectors.toMap(GeneratedNode::nodeKey, n -> n));
        assertThat(byKey.get("c:north:a-b").descendantAreaCount()).isEqualTo(1); // only city|b left
        assertThat(byKey.get("c:north:c-d").descendantAreaCount()).isEqualTo(3); // c, d, + moved a
    }

    @Test
    @DisplayName("MOVE_AREA assigns a gapless 1..n display_order among the target's new sibling set")
    void moveAreaRenumbersSiblings() {
        List<GeneratedNode> result = applier.applyPostBisection(
                twoClusterTree(), List.of(move("city|a", "c:north:c-d")));

        List<Integer> orders = result.stream()
                .filter(n -> "c:north:c-d".equals(n.parentNodeKey()))
                .map(GeneratedNode::displayOrder)
                .sorted()
                .toList();
        assertThat(orders).isEqualTo(List.of(1, 2, 3));
    }

    @Test
    @DisplayName("MOVE_AREA to a non-CLUSTER target is a silent no-op (flagged by validation)")
    void moveAreaToNonClusterTargetIsNoOp() {
        List<GeneratedNode> tree = twoClusterTree();
        List<GeneratedNode> result = applier.applyPostBisection(tree, List.of(move("city|a", "a:city|c")));
        assertThat(result).isEqualTo(tree);
    }

    @Test
    @DisplayName("no MOVE_AREA overrides -> tree returned unchanged (same reference)")
    void noMoveIsNoOp() {
        List<GeneratedNode> tree = twoClusterTree();
        List<GeneratedNode> result = applier.applyPostBisection(tree, List.of(relabel("c:north:a-b", "New Label")));
        // RELABEL alone doesn't trigger the structural rebuild path; the label itself still changes.
        Map<String, GeneratedNode> byKey = result.stream().collect(Collectors.toMap(GeneratedNode::nodeKey, n -> n));
        assertThat(byKey.get("c:north:a-b").displayLabel()).isEqualTo("New Label");
    }

    // ── applyPostBisection: RELABEL / SET_REPRESENTATIVES ───────────────────────────────────────

    @Test
    @DisplayName("RELABEL changes only the target node's displayLabel")
    void relabelChangesLabel() {
        List<GeneratedNode> result = applier.applyPostBisection(
                twoClusterTree(), List.of(relabel("c:north:a-b", "Custom Label")));
        Map<String, GeneratedNode> byKey = result.stream().collect(Collectors.toMap(GeneratedNode::nodeKey, n -> n));
        assertThat(byKey.get("c:north:a-b").displayLabel()).isEqualTo("Custom Label");
        assertThat(byKey.get("a:city|a").displayLabel()).isEqualTo("A"); // untouched
    }

    @Test
    @DisplayName("SET_REPRESENTATIVES changes only the target cluster's representativeAreaKeys")
    void setRepresentativesChangesReps() {
        List<GeneratedNode> result = applier.applyPostBisection(
                twoClusterTree(), List.of(setReps("c:north:a-b", List.of("city|b"))));
        Map<String, GeneratedNode> byKey = result.stream().collect(Collectors.toMap(GeneratedNode::nodeKey, n -> n));
        assertThat(byKey.get("c:north:a-b").representativeAreaKeys()).containsExactly("city|b");
    }

    @Test
    @DisplayName("MOVE_AREA + RELABEL compose: the moved area's new parent can also be relabeled in the same call")
    void moveAndRelabelCompose() {
        List<GeneratedNode> result = applier.applyPostBisection(
                twoClusterTree(), List.of(move("city|a", "c:north:c-d"), relabel("c:north:c-d", "Merged")));
        Map<String, GeneratedNode> byKey = result.stream().collect(Collectors.toMap(GeneratedNode::nodeKey, n -> n));
        assertThat(byKey.get("a:city|a").parentNodeKey()).isEqualTo("c:north:c-d");
        assertThat(byKey.get("c:north:c-d").displayLabel()).isEqualTo("Merged");
    }
}
