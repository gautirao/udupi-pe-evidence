package com.example.realestate.discover.navigation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link NavigationTreeValidationService} — the 13 blocking invariants (#1955 AC7).
 * Each test crafts one specific bad tree via {@link ValidationNode} fixtures (no Spring/DB) and
 * asserts the corresponding error code fires; a final test proves a valid tree yields zero errors.
 */
class NavigationTreeValidationServiceTest {

    private static final Long SCOPE = 1L;
    private static final BigDecimal LAT = BigDecimal.valueOf(12.0);
    private static final BigDecimal LON = BigDecimal.valueOf(77.0);

    private final NavigationTreeValidationService service = new NavigationTreeValidationService();

    private static ValidationNode node(
            String nodeKey, String parentNodeKey, String nodeType, String areaKey,
            List<String> reps, int depth, List<String> ancestorKeys, int descendantAreaCount, int displayOrder) {
        return new ValidationNode(
                SCOPE, nodeKey, parentNodeKey, nodeType, areaKey, reps, depth, ancestorKeys,
                descendantAreaCount, displayOrder, LAT, LON, LAT, LON, LAT, LON);
    }

    /** A minimal, valid 1-cluster-with-2-area-leaves tree, used as the base for most fixtures. */
    private static List<ValidationNode> validTree() {
        return List.of(
                node("c:north:a-b", null, "CLUSTER", null, List.of("city|a", "city|b"), 0, List.of(), 2, 1),
                node("a:city|a", "c:north:a-b", "AREA", "city|a", List.of("city|a"), 1, List.of("c:north:a-b"), 1, 1),
                node("a:city|b", "c:north:a-b", "AREA", "city|b", List.of("city|b"), 1, List.of("c:north:a-b"), 1, 2));
    }

    @Test
    @DisplayName("a valid tree produces zero validation errors")
    void validTreeHasNoErrors() {
        ValidationReport report = service.validate(validTree());
        assertThat(report.errors()).isEmpty();
        assertThat(report.isValid()).isTrue();
    }

    @Test
    @DisplayName("1: cycle detected in the parent chain")
    void cycleDetected() {
        List<ValidationNode> nodes = List.of(
                node("x", "y", "CLUSTER", null, List.of(), 1, List.of(), 0, 1),
                node("y", "x", "CLUSTER", null, List.of(), 1, List.of(), 0, 1));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("CYCLE_DETECTED");
    }

    @Test
    @DisplayName("2: orphan node — parent_node_key not present in the tree")
    void orphanNode() {
        List<ValidationNode> nodes = List.of(
                node("a:city|a", "missing-parent", "AREA", "city|a", List.of("city|a"), 1,
                        List.of("missing-parent"), 1, 1));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("ORPHAN_NODE");
    }

    @Test
    @DisplayName("3a: invalid depth — child depth is not parent depth + 1")
    void invalidDepth() {
        List<ValidationNode> nodes = List.of(
                node("c:north:a-b", null, "CLUSTER", null, List.of("city|a", "city|b"), 0, List.of(), 2, 1),
                node("a:city|a", "c:north:a-b", "AREA", "city|a", List.of("city|a"), 5, List.of("c:north:a-b"), 1, 1),
                node("a:city|b", "c:north:a-b", "AREA", "city|b", List.of("city|b"), 1, List.of("c:north:a-b"), 1, 2));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("INVALID_DEPTH");
    }

    @Test
    @DisplayName("3b: cross-scope (revision/city) parentage")
    void crossScopeParentage() {
        ValidationNode parent = new ValidationNode(
                1L, "c:north:a-b", null, "CLUSTER", null, List.of("city|a", "city|b"), 0, List.of(), 2, 1,
                LAT, LON, LAT, LON, LAT, LON);
        ValidationNode child = new ValidationNode(
                2L, "a:city|a", "c:north:a-b", "AREA", "city|a", List.of("city|a"), 1, List.of("c:north:a-b"), 1, 1,
                LAT, LON, LAT, LON, LAT, LON);
        ValidationReport report = service.validate(List.of(parent, child));
        assertThat(report.errors()).extracting(ValidationError::code).contains("CROSS_SCOPE_PARENTAGE");
    }

    @Test
    @DisplayName("4: one-child cluster")
    void oneChildCluster() {
        List<ValidationNode> nodes = List.of(
                node("c:north:a", null, "CLUSTER", null, List.of("city|a"), 0, List.of(), 1, 1),
                node("a:city|a", "c:north:a", "AREA", "city|a", List.of("city|a"), 1, List.of("c:north:a"), 1, 1));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("ONE_CHILD_CLUSTER");
    }

    @Test
    @DisplayName("5a: duplicate AREA leaf — the same area_key appears twice")
    void duplicateAreaLeaf() {
        List<ValidationNode> nodes = List.of(
                node("a:city|a", null, "AREA", "city|a", List.of("city|a"), 0, List.of(), 1, 1),
                node("a:city|a-dup", null, "AREA", "city|a", List.of("city|a"), 0, List.of(), 1, 2));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("DUPLICATE_AREA_LEAF");
    }

    @Test
    @DisplayName("5b: missing AREA leaf for an expected canonical area")
    void missingAreaLeaf() {
        ValidationReport report = service.validate(
                validTree(), Set.of("city|a", "city|b", "city|c-not-in-tree"), null, List.of());
        assertThat(report.errors()).extracting(ValidationError::code).contains("MISSING_AREA_LEAF");
    }

    @Test
    @DisplayName("6: an area used as representative of two unrelated clusters")
    void areaInMultipleLeafPaths() {
        List<ValidationNode> nodes = List.of(
                node("c:north:shared", null, "CLUSTER", null, List.of("city|shared"), 0, List.of(), 1, 1),
                node("c:south:shared", null, "CLUSTER", null, List.of("city|shared"), 0, List.of(), 1, 1),
                node("a:city|shared", "c:north:shared", "AREA", "city|shared", List.of("city|shared"), 1,
                        List.of("c:north:shared"), 1, 1));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("AREA_IN_MULTIPLE_LEAF_PATHS");
    }

    @Test
    @DisplayName("7: representative area not a descendant member of its own cluster")
    void representativeNotMember() {
        List<ValidationNode> nodes = List.of(
                node("c:north:a-b", null, "CLUSTER", null, List.of("city|not-a-member"), 0, List.of(), 2, 1),
                node("a:city|a", "c:north:a-b", "AREA", "city|a", List.of("city|a"), 1, List.of("c:north:a-b"), 1, 1),
                node("a:city|b", "c:north:a-b", "AREA", "city|b", List.of("city|b"), 1, List.of("c:north:a-b"), 1, 2));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("REPRESENTATIVE_NOT_MEMBER");
    }

    @Test
    @DisplayName("8a: duplicate sibling node_key")
    void duplicateSiblingIdentity() {
        List<ValidationNode> nodes = List.of(
                node("c:north:a-b", null, "CLUSTER", null, List.of("city|a", "city|b"), 0, List.of(), 2, 1),
                node("a:city|a", "c:north:a-b", "AREA", "city|a", List.of("city|a"), 1, List.of("c:north:a-b"), 1, 1),
                node("a:city|a", "c:north:a-b", "AREA", "city|a", List.of("city|a"), 1, List.of("c:north:a-b"), 1, 2));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("DUPLICATE_SIBLING_IDENTITY");
    }

    @Test
    @DisplayName("8b: invalid sibling ordering — not a gapless 1..n sequence")
    void invalidSiblingOrdering() {
        List<ValidationNode> nodes = List.of(
                node("c:north:a-b", null, "CLUSTER", null, List.of("city|a", "city|b"), 0, List.of(), 2, 1),
                node("a:city|a", "c:north:a-b", "AREA", "city|a", List.of("city|a"), 1, List.of("c:north:a-b"), 1, 1),
                node("a:city|b", "c:north:a-b", "AREA", "city|b", List.of("city|b"), 1, List.of("c:north:a-b"), 1, 5));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("INVALID_SIBLING_ORDERING");
    }

    @Test
    @DisplayName("9: incorrect structural descendant_area_count")
    void descendantCountMismatch() {
        List<ValidationNode> nodes = List.of(
                node("c:north:a-b", null, "CLUSTER", null, List.of("city|a", "city|b"), 0, List.of(), 99, 1),
                node("a:city|a", "c:north:a-b", "AREA", "city|a", List.of("city|a"), 1, List.of("c:north:a-b"), 1, 1),
                node("a:city|b", "c:north:a-b", "AREA", "city|b", List.of("city|b"), 1, List.of("c:north:a-b"), 1, 2));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("DESCENDANT_COUNT_MISMATCH");
    }

    @Test
    @DisplayName("10: missing required bounds")
    void missingBounds() {
        ValidationNode bad = new ValidationNode(
                SCOPE, "a:city|a", null, "AREA", "city|a", List.of("city|a"), 0, List.of(), 1, 1,
                null, LON, LAT, LON, LAT, LON);
        ValidationReport report = service.validate(List.of(bad));
        assertThat(report.errors()).extracting(ValidationError::code).contains("MISSING_BOUNDS");
    }

    @Test
    @DisplayName("11: max-depth violation")
    void maxDepthViolation() {
        ValidationReport report = service.validate(validTree(), Set.of(), 0, List.of());
        assertThat(report.errors()).extracting(ValidationError::code).contains("MAX_DEPTH_VIOLATION");
    }

    @Test
    @DisplayName("12: orphaned override — RELABEL targets a node_key absent from the tree")
    void orphanedOverride() {
        ValidationReport report = service.validate(
                validTree(), Set.of(), null,
                List.of(new NavigationOverride("RELABEL", null, "does-not-exist", null, null, "New Label", null, 1)));
        assertThat(report.errors()).extracting(ValidationError::code).contains("ORPHANED_OVERRIDE");
    }

    @Test
    @DisplayName("12: a well-formed RELABEL override targeting a real node produces no error")
    void wellFormedOverrideIsAccepted() {
        ValidationReport report = service.validate(
                validTree(), Set.of(), null,
                List.of(new NavigationOverride("RELABEL", null, "c:north:a-b", null, null, "New Label", null, 1)));
        assertThat(report.errors()).isEmpty();
    }

    // ── #1955 Areas PR A, SLICE 2f+2g: full override-kind semantics ────────────────────────────

    @Test
    @DisplayName("12: EXCLUDE_AREA override on an unknown/inactive area is ORPHANED_OVERRIDE")
    void excludeAreaOrphaned() {
        ValidationReport report = service.validate(
                validTree(), Set.of("city|a", "city|b"), null,
                List.of(new NavigationOverride("EXCLUDE_AREA", "city|not-active", null, null, null, null, null, 1)),
                Set.of());
        assertThat(report.errors()).extracting(ValidationError::code).contains("ORPHANED_OVERRIDE");
    }

    @Test
    @DisplayName("12: EXCLUDE_AREA override on a known active area produces no error")
    void excludeAreaValid() {
        ValidationReport report = service.validate(
                validTree(), Set.of("city|a", "city|b"), null,
                List.of(new NavigationOverride("EXCLUDE_AREA", "city|a", null, null, null, null, null, 1)),
                Set.of());
        assertThat(report.errors()).isEmpty();
    }

    @Test
    @DisplayName("12: EXCLUDE_AREA subject is checked against the PRE-exclude canonical universe, not "
            + "the POST-exclude expectedAreaKeys — regression for a false ORPHANED_OVERRIDE on a valid exclude")
    void excludeAreaValidatedAgainstCanonicalNotPostExcludeUniverse() {
        // A tree that ALREADY reflects city|a excluded (only city|b remains as an AREA leaf), the way
        // NavigationTreeGenerationService's real pipeline builds it — expectedAreaKeys is POST-exclude
        // (does not contain city|a), but canonicalAreaKeys is PRE-exclude (does).
        List<ValidationNode> postExcludeTree = List.of(
                node("a:city|b", null, "AREA", "city|b", List.of("city|b"), 0, List.of(), 1, 1));

        ValidationReport report = service.validate(
                postExcludeTree,
                Set.of("city|b"), // expectedAreaKeys: POST-exclude — city|a correctly absent
                null,
                List.of(new NavigationOverride("EXCLUDE_AREA", "city|a", null, null, null, null, null, 1)),
                Set.of(),
                Set.of("city|a", "city|b")); // canonicalAreaKeys: PRE-exclude — city|a WAS a real area

        assertThat(report.errors()).isEmpty();
    }

    @Test
    @DisplayName("12: REASSIGN_AREA_REGION to an unknown region is ORPHANED_OVERRIDE")
    void reassignUnknownRegion() {
        ValidationReport report = service.validate(
                validTree(), Set.of("city|a", "city|b"), null,
                List.of(new NavigationOverride(
                        "REASSIGN_AREA_REGION", "city|a", null, "south-not-a-region", null, null, null, 1)),
                Set.of("north"));
        assertThat(report.errors()).extracting(ValidationError::code).contains("ORPHANED_OVERRIDE");
    }

    @Test
    @DisplayName("12: REASSIGN_AREA_REGION to a known region produces no error")
    void reassignValidRegion() {
        ValidationReport report = service.validate(
                validTree(), Set.of("city|a", "city|b"), null,
                List.of(new NavigationOverride("REASSIGN_AREA_REGION", "city|a", null, "south", null, null, null, 1)),
                Set.of("north", "south"));
        assertThat(report.errors()).isEmpty();
    }

    @Test
    @DisplayName("12: MOVE_AREA whose target is not a CLUSTER node is ORPHANED_OVERRIDE")
    void moveAreaTargetNotCluster() {
        ValidationReport report = service.validate(
                validTree(), Set.of(), null,
                List.of(new NavigationOverride("MOVE_AREA", "city|a", null, null, "a:city|b", null, null, 1)));
        assertThat(report.errors()).extracting(ValidationError::code).contains("ORPHANED_OVERRIDE");
    }

    @Test
    @DisplayName("12: MOVE_AREA whose subject has no AREA leaf is ORPHANED_OVERRIDE")
    void moveAreaSubjectMissing() {
        ValidationReport report = service.validate(
                validTree(), Set.of(), null,
                List.of(new NavigationOverride("MOVE_AREA", "city|not-in-tree", null, null, "c:north:a-b", null, null, 1)));
        assertThat(report.errors()).extracting(ValidationError::code).contains("ORPHANED_OVERRIDE");
    }

    @Test
    @DisplayName("12: MOVE_AREA with a valid AREA subject and CLUSTER target produces no error")
    void moveAreaValid() {
        ValidationReport report = service.validate(
                validTree(), Set.of(), null,
                List.of(new NavigationOverride("MOVE_AREA", "city|a", null, null, "c:north:a-b", null, null, 1)));
        assertThat(report.errors()).isEmpty();
    }

    @Test
    @DisplayName("12: a SET_REPRESENTATIVES rep that isn't a descendant area is ORPHANED_OVERRIDE")
    void setRepresentativesNotDescendant() {
        ValidationReport report = service.validate(
                validTree(), Set.of(), null,
                List.of(new NavigationOverride(
                        "SET_REPRESENTATIVES", null, "c:north:a-b", null, null, null, List.of("city|not-a-member"), 1)));
        assertThat(report.errors()).extracting(ValidationError::code).contains("ORPHANED_OVERRIDE");
    }

    @Test
    @DisplayName("12: a SET_REPRESENTATIVES rep that IS a descendant area produces no error")
    void setRepresentativesValid() {
        ValidationReport report = service.validate(
                validTree(), Set.of(), null,
                List.of(new NavigationOverride(
                        "SET_REPRESENTATIVES", null, "c:north:a-b", null, null, null, List.of("city|a"), 1)));
        assertThat(report.errors()).isEmpty();
    }

    @Test
    @DisplayName("12: EXCLUDE_AREA + MOVE_AREA on the same area is CONFLICTING_OVERRIDE")
    void excludeAndMoveConflict() {
        ValidationReport report = service.validate(
                validTree(), Set.of("city|a", "city|b"), null,
                List.of(
                        new NavigationOverride("EXCLUDE_AREA", "city|a", null, null, null, null, null, 1),
                        new NavigationOverride("MOVE_AREA", "city|a", null, null, "c:north:a-b", null, null, 2)));
        assertThat(report.errors()).extracting(ValidationError::code).contains("CONFLICTING_OVERRIDE");
    }

    @Test
    @DisplayName("13: direct-search vs guided-navigation ancestry mismatch")
    void ancestryMismatch() {
        List<ValidationNode> nodes = List.of(
                node("c:north:a-b", null, "CLUSTER", null, List.of("city|a", "city|b"), 0, List.of(), 2, 1),
                node("a:city|a", "c:north:a-b", "AREA", "city|a", List.of("city|a"), 1,
                        List.of("some-other-node"), 1, 1),
                node("a:city|b", "c:north:a-b", "AREA", "city|b", List.of("city|b"), 1, List.of("c:north:a-b"), 1, 2));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("ANCESTRY_MISMATCH");
    }
}
