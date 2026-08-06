package com.example.realestate.discover.navigation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link NavigationTreeValidationService} — the 13 blocking invariants (#1955 AC7)
 * plus the additive #14 hierarchy-shape invariant (#1956 D6). Each test crafts one specific bad
 * tree via {@link ValidationNode} fixtures (no Spring/DB) and asserts the corresponding error code
 * fires; a final test proves a valid tree yields zero errors. Every fixture that predates #1956
 * (a bare CLUSTER/AREA root, no DIRECTION ancestor) still asserts with {@code .contains(...)}, so
 * the additional MISSING_DIRECTION_ANCESTOR finding check #14 now also raises against it doesn't
 * break the test — only {@code validTree()}/{@code postExcludeTree}, reused by every "well-formed
 * override produces zero errors" ({@code .isEmpty()}) test, were updated to a genuine DIRECTION-
 * rooted shape so those keep asserting a truly empty error list.
 */
class NavigationTreeValidationServiceTest {

    private static final Long SCOPE = 1L;
    private static final BigDecimal LAT = BigDecimal.valueOf(12.0);
    private static final BigDecimal LON = BigDecimal.valueOf(77.0);

    private final NavigationTreeValidationService service = new NavigationTreeValidationService();

    /** {@code regionKey} defaults to "north" for every node here — none of checks #1-13 or this
     * file's own tests care about its value; check #14's region-ancestry-agreement piece is
     * exercised by {@code validTree()} using the SAME "north" value on every node, matching its
     * DIRECTION ancestor. */
    private static ValidationNode node(
            String nodeKey, String parentNodeKey, String nodeType, String areaKey,
            List<String> reps, int depth, List<String> ancestorKeys, int descendantAreaCount, int displayOrder) {
        return new ValidationNode(
                SCOPE, nodeKey, parentNodeKey, nodeType, areaKey, reps, depth, ancestorKeys,
                descendantAreaCount, displayOrder, LAT, LON, LAT, LON, LAT, LON, "north");
    }

    /**
     * #1956 D6: a genuine {@code City -> Direction -> CLUSTER -> AREA} shape (was a bare
     * CLUSTER-rooted tree pre-#1956) so this fixture — reused by most "well-formed override
     * produces zero errors" tests below, which assert {@code .isEmpty()} — still validates cleanly
     * against check #14 (hierarchy shape). ONE cluster beneath the DIRECTION: check #4
     * (ONE_CHILD_CLUSTER) is now CLUSTER-specific (see {@link
     * NavigationTreeValidationService#checkOneChildClusters}), so a single-child DIRECTION is
     * legitimate and no longer needs a second, otherwise-pointless sibling cluster to dodge it. The
     * CLUSTER itself still needs >=2 children (city|a, city|b) — that guard is unrelated to the
     * DIRECTION fix and still fires for a genuinely single-child CLUSTER.
     */
    private static List<ValidationNode> validTree() {
        return List.of(
                node("d:north", null, "DIRECTION", null, List.of("city|a", "city|b"), 0, List.of(), 2, 1),
                node("c:north:a-b", "d:north", "CLUSTER", null, List.of("city|a", "city|b"), 1,
                        List.of("d:north"), 2, 1),
                node("a:city|a", "c:north:a-b", "AREA", "city|a", List.of("city|a"), 2,
                        List.of("d:north", "c:north:a-b"), 1, 1),
                node("a:city|b", "c:north:a-b", "AREA", "city|b", List.of("city|b"), 2,
                        List.of("d:north", "c:north:a-b"), 1, 2));
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
                LAT, LON, LAT, LON, LAT, LON, "north");
        ValidationNode child = new ValidationNode(
                2L, "a:city|a", "c:north:a-b", "AREA", "city|a", List.of("city|a"), 1, List.of("c:north:a-b"), 1, 1,
                LAT, LON, LAT, LON, LAT, LON, "north");
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
    @DisplayName("4b: a DIRECTION with exactly one child AREA is valid — a region may genuinely "
            + "contain a single canonical area (confirmed live: udupi's W region has exactly one "
            + "area) — regression guard for the type-aware #4 fix")
    void oneChildDirectionIsValid() {
        List<ValidationNode> nodes = List.of(
                node("d:west", null, "DIRECTION", null, List.of("city|only"), 0, List.of(), 1, 1),
                node("a:city|only", "d:west", "AREA", "city|only", List.of("city|only"), 1,
                        List.of("d:west"), 1, 1));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).doesNotContain("ONE_CHILD_CLUSTER");
        assertThat(report.errors()).isEmpty();
    }

    @Test
    @DisplayName("4c: a DIRECTION with multiple direct AREA children still validates cleanly — "
            + "no regression from the type-aware #4 fix")
    void multiChildDirectionIsValid() {
        List<ValidationNode> nodes = List.of(
                node("d:north", null, "DIRECTION", null, List.of("city|a", "city|b"), 0, List.of(), 2, 1),
                node("a:city|a", "d:north", "AREA", "city|a", List.of("city|a"), 1, List.of("d:north"), 1, 1),
                node("a:city|b", "d:north", "AREA", "city|b", List.of("city|b"), 1, List.of("d:north"), 1, 2));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).isEmpty();
    }

    @Test
    @DisplayName("4d: a CLUSTER with exactly one child is still rejected under a real DIRECTION "
            + "root — the type-check must resolve the parent's actual kind, not silently exempt "
            + "CLUSTER nodes too")
    void oneChildClusterStillRejectedUnderDirectionRoot() {
        List<ValidationNode> nodes = List.of(
                node("d:north", null, "DIRECTION", null, List.of("city|a"), 0, List.of(), 1, 1),
                node("c:north:a", "d:north", "CLUSTER", null, List.of("city|a"), 1, List.of("d:north"), 1, 1),
                node("a:city|a", "c:north:a", "AREA", "city|a", List.of("city|a"), 2,
                        List.of("d:north", "c:north:a"), 1, 1));
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
                null, LON, LAT, LON, LAT, LON, "north");
        ValidationReport report = service.validate(List.of(bad));
        assertThat(report.errors()).extracting(ValidationError::code).contains("MISSING_BOUNDS");
    }

    @Test
    @DisplayName("11a: a depth-2 tree PASSES check #11 even when the policy's max_safety_depth is "
            + "0 — the regression test for the blocker S1 discovered: Bangalore's hosted "
            + "max_safety_depth=0 must NOT reject the exact City -> Direction -> Local Destination -> "
            + "AREA shape #2086 exists to deliver")
    void depthTwoPassesEvenWithMaxSafetyDepthZero() {
        ValidationReport report = service.validate(validTree(), Set.of(), 0, List.of());
        assertThat(report.errors()).extracting(ValidationError::code).doesNotContain("MAX_DEPTH_VIOLATION");
    }

    @Test
    @DisplayName("11b: a depth-2 tree PASSES check #11 even when the policy's max_safety_depth is 1")
    void depthTwoPassesEvenWithMaxSafetyDepthOne() {
        ValidationReport report = service.validate(validTree(), Set.of(), 1, List.of());
        assertThat(report.errors()).extracting(ValidationError::code).doesNotContain("MAX_DEPTH_VIOLATION");
    }

    @Test
    @DisplayName("11c: a depth-3 tree FAILS check #11 — the fixed product-contract ceiling still "
            + "applies regardless of max_safety_depth's value")
    void depthThreeFailsRegardlessOfMaxSafetyDepth() {
        List<ValidationNode> nodes = new ArrayList<>(validTree());
        nodes.add(node("c:north:a-b:sub", "a:city|a", "CLUSTER", null, List.of("city|a"), 3,
                List.of("d:north", "c:north:a-b", "a:city|a"), 1, 1));
        ValidationReport report = service.validate(nodes, Set.of(), 0, List.of());
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
        //
        // #1956 D6: wrapped in a DIRECTION root (was a bare AREA root pre-#1956) so this stays a
        // genuine City -> Direction -> AREA shape under check #14. The DIRECTION's only remaining
        // child is the single surviving city|b leaf — that's honest and no longer needs an
        // unrelated sibling AREA to dodge check #4: #4 (ONE_CHILD_CLUSTER) is now CLUSTER-specific
        // (see NavigationTreeValidationService#checkOneChildClusters), so a single-child DIRECTION
        // — exactly this shape, a region left with one area after an exclude — is legitimate.
        List<ValidationNode> postExcludeTree = List.of(
                node("d:north", null, "DIRECTION", null, List.of("city|b"), 0, List.of(), 1, 1),
                node("a:city|b", "d:north", "AREA", "city|b", List.of("city|b"), 1, List.of("d:north"), 1, 1));

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

    // ── 14: hierarchy shape (#1956 D6) ──────────────────────────────────────────────────────────
    // Each test below reproduces one specific way the incident's flat `City -> AREA` tree (or a
    // structurally-similar violation) could reappear, and asserts the exact error code check #14
    // raises for it — never merely "some error fired".

    @Test
    @DisplayName("14a: a flat City -> AREA tree (non-DIRECTION root) is MISSING_DIRECTION_ANCESTOR — "
            + "the exact incident shape (323 AREA roots, zero DIRECTION nodes) that passed all 13 "
            + "pre-#1956 checks and reached production")
    void flatCityToAreaRootIsRejected() {
        List<ValidationNode> nodes = List.of(
                node("a:city|a", null, "AREA", "city|a", List.of("city|a"), 0, List.of(), 1, 1));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("MISSING_DIRECTION_ANCESTOR");
    }

    @Test
    @DisplayName("14b: an AREA with empty ancestry (even with a real parent) is MISSING_DIRECTION_ANCESTOR")
    void areaWithEmptyAncestryIsRejected() {
        List<ValidationNode> nodes = List.of(
                node("d:north", null, "DIRECTION", null, List.of("city|a", "city|b"), 0, List.of(), 2, 1),
                node("a:city|a", "d:north", "AREA", "city|a", List.of("city|a"), 1, List.of(), 1, 1),
                node("a:city|b", "d:north", "AREA", "city|b", List.of("city|b"), 1, List.of("d:north"), 1, 2));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("MISSING_DIRECTION_ANCESTOR");
    }

    @Test
    @DisplayName("14c: an AREA whose first (root) ancestor is a CLUSTER, not a DIRECTION, is "
            + "MISSING_DIRECTION_ANCESTOR even though the tree's actual root IS a DIRECTION")
    void areaFirstAncestorNotDirectionIsRejected() {
        List<ValidationNode> nodes = List.of(
                node("d:north", null, "DIRECTION", null, List.of("city|a", "city|b"), 0, List.of(), 2, 1),
                node("c:north:a-b", "d:north", "CLUSTER", null, List.of("city|a", "city|b"), 1,
                        List.of("d:north"), 2, 1),
                // WRONG: this leaf's stored ancestor_keys omits the DIRECTION, starting at the CLUSTER instead.
                node("a:city|a", "c:north:a-b", "AREA", "city|a", List.of("city|a"), 2,
                        List.of("c:north:a-b"), 1, 1),
                node("a:city|b", "c:north:a-b", "AREA", "city|b", List.of("city|b"), 2,
                        List.of("d:north", "c:north:a-b"), 1, 2));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("MISSING_DIRECTION_ANCESTOR");
    }

    @Test
    @DisplayName("14d: a node's region_key disagreeing with its DIRECTION ancestor's region_key is "
            + "INVALID_HIERARCHY_SHAPE")
    void regionKeyDisagreesWithDirectionAncestorIsRejected() {
        ValidationNode direction = new ValidationNode(
                SCOPE, "d:north", null, "DIRECTION", null, List.of("city|a", "city|b"), 0, List.of(), 2, 1,
                LAT, LON, LAT, LON, LAT, LON, "north");
        // WRONG: this leaf claims region_key="south" while descending from the "north" DIRECTION.
        ValidationNode mismatched = new ValidationNode(
                SCOPE, "a:city|a", "d:north", "AREA", "city|a", List.of("city|a"), 1, List.of("d:north"), 1, 1,
                LAT, LON, LAT, LON, LAT, LON, "south");
        ValidationNode consistent = new ValidationNode(
                SCOPE, "a:city|b", "d:north", "AREA", "city|b", List.of("city|b"), 1, List.of("d:north"), 1, 2,
                LAT, LON, LAT, LON, LAT, LON, "north");
        ValidationReport report = service.validate(List.of(direction, mismatched, consistent));
        assertThat(report.errors()).extracting(ValidationError::code).contains("INVALID_HIERARCHY_SHAPE");
    }

    @Test
    @DisplayName("14e: a CLUSTER at depth 2 (a forbidden third public level beneath its own CLUSTER "
            + "parent) is INVALID_HIERARCHY_SHAPE, independent of check #11's max_safety_depth")
    void clusterAtDepthTwoIsRejected() {
        List<ValidationNode> nodes = List.of(
                node("d:north", null, "DIRECTION", null, List.of("city|a", "city|b"), 0, List.of(), 2, 1),
                node("c:north:top", "d:north", "CLUSTER", null, List.of("city|a", "city|b"), 1,
                        List.of("d:north"), 2, 1),
                // WRONG: a second CLUSTER level directly beneath the first — a forbidden third public level.
                node("c:north:sub", "c:north:top", "CLUSTER", null, List.of("city|a", "city|b"), 2,
                        List.of("d:north", "c:north:top"), 2, 1),
                node("a:city|a", "c:north:sub", "AREA", "city|a", List.of("city|a"), 3,
                        List.of("d:north", "c:north:top", "c:north:sub"), 1, 1),
                node("a:city|b", "c:north:sub", "AREA", "city|b", List.of("city|b"), 3,
                        List.of("d:north", "c:north:top", "c:north:sub"), 1, 2));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("INVALID_HIERARCHY_SHAPE");
    }

    // ── 15: breadth / Local Destination mandate (#2086 AC3/AC5/AC17) ───────────────────────────
    // Every fixture here reads the PERSISTED descendantAreaCount field ValidationNode carries —
    // there is no listing-derived/matchingAreaCount field anywhere on ValidationNode, so these
    // checks are structurally incapable of consulting anything other than the canonical count.

    /** Builds {@code count} AREA leaves under {@code parentNodeKey}, area_keys {@code prefix0}..
     * {@code prefix<count-1>}, depth/ancestry consistent with a real generator-produced subtree. */
    private static List<ValidationNode> areaLeaves(
            String parentNodeKey, List<String> ancestorKeys, int depth, String prefix, int count) {
        List<ValidationNode> out = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            String areaKey = prefix + i;
            out.add(node("a:" + areaKey, parentNodeKey, "AREA", areaKey, List.of(areaKey), depth,
                    ancestorKeys, 1, i + 1));
        }
        return out;
    }

    @Test
    @DisplayName("15a: a node with more than 15 children is BREADTH_EXCEEDED")
    void breadthExceeded() {
        List<ValidationNode> nodes = new ArrayList<>();
        nodes.add(node("d:north", null, "DIRECTION", null, List.of("g0", "g1"), 0, List.of(), 16, 1));
        nodes.addAll(areaLeaves("d:north", List.of("d:north"), 1, "g", 16));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("BREADTH_EXCEEDED");
    }

    @Test
    @DisplayName("15b: a node with descendant_area_count > 15 that emits a direct non-CLUSTER child "
            + "is MISSING_LOCAL_DESTINATION_LEVEL")
    void missingLocalDestinationLevel() {
        List<ValidationNode> nodes = new ArrayList<>();
        nodes.add(node("d:north", null, "DIRECTION", null, List.of("g0", "g1"), 0, List.of(), 16, 1));
        nodes.addAll(areaLeaves("d:north", List.of("d:north"), 1, "g", 16));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code)
                .contains("MISSING_LOCAL_DESTINATION_LEVEL");
    }

    @Test
    @DisplayName("15c: a CLUSTER whose own descendant_area_count exceeds 15 is LOCAL_DESTINATION_OVERSIZED")
    void localDestinationOversized() {
        List<ValidationNode> nodes = new ArrayList<>();
        nodes.add(node("d:north", null, "DIRECTION", null, List.of("g0", "g1"), 0, List.of(), 16, 1));
        nodes.add(node("c:north:big", "d:north", "CLUSTER", null, List.of("g0", "g1"), 1,
                List.of("d:north"), 16, 1));
        nodes.addAll(areaLeaves("c:north:big", List.of("d:north", "c:north:big"), 2, "g", 16));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("LOCAL_DESTINATION_OVERSIZED");
    }

    @Test
    @DisplayName("15d: a compliant tree (16 canonical areas split into two 8-area Local Destinations) "
            + "produces zero check-#15 errors")
    void breadthMandateCompliantTreePasses() {
        List<ValidationNode> nodes = new ArrayList<>();
        nodes.add(node("d:north", null, "DIRECTION", null, List.of("g0-0", "g0-1"), 0, List.of(), 16, 1));
        nodes.add(node("c:north:g0", "d:north", "CLUSTER", null, List.of("g0-0", "g0-1"), 1,
                List.of("d:north"), 8, 1));
        nodes.addAll(areaLeaves("c:north:g0", List.of("d:north", "c:north:g0"), 2, "g0-", 8));
        nodes.add(node("c:north:g1", "d:north", "CLUSTER", null, List.of("g1-0", "g1-1"), 1,
                List.of("d:north"), 8, 2));
        nodes.addAll(areaLeaves("c:north:g1", List.of("d:north", "c:north:g1"), 2, "g1-", 8));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).isEmpty();
    }

    @Test
    @DisplayName("15e: check #15 is driven purely by the PERSISTED descendant_area_count field — "
            + "ValidationNode carries no listing-derived count at all, so an otherwise-identical "
            + "20-leaf CLUSTER (real structural leaf count = persisted count = 20) trips "
            + "LOCAL_DESTINATION_OVERSIZED, proving the check cannot be reading any filter-sensitive "
            + "count (no such field exists on ValidationNode to read)")
    void breadthMandateReadsDescendantAreaCountNotAnyListingDerivedCount() {
        List<ValidationNode> nodes = new ArrayList<>();
        nodes.add(node("d:north", null, "DIRECTION", null, List.of("g0", "g1"), 0, List.of(), 20, 1));
        nodes.add(node("c:north:big", "d:north", "CLUSTER", null, List.of("g0", "g1"), 1,
                List.of("d:north"), 20, 1));
        nodes.addAll(areaLeaves("c:north:big", List.of("d:north", "c:north:big"), 2, "g", 20));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors()).extracting(ValidationError::code).contains("LOCAL_DESTINATION_OVERSIZED");
    }

    @Test
    @DisplayName("15f: a first-level group exceeding 225 canonical areas produces a diagnostic "
            + "naming the region, its area count and the 225 ceiling")
    void groupExceeding225AreasNamesRegionCountAndCeiling() {
        List<ValidationNode> nodes = new ArrayList<>();
        nodes.add(node("d:north", null, "DIRECTION", null, List.of("g0", "g1"), 0, List.of(), 226, 1));
        nodes.addAll(areaLeaves("d:north", List.of("d:north"), 1, "g", 16));
        ValidationReport report = service.validate(nodes);
        assertThat(report.errors())
                .filteredOn(e -> "BREADTH_EXCEEDED".equals(e.code()) || "MISSING_LOCAL_DESTINATION_LEVEL".equals(e.code()))
                .extracting(ValidationError::message)
                .anySatisfy(msg -> assertThat(msg)
                        .contains("region=north")
                        .contains("226")
                        .contains("225"));
    }

    // ── 16: label provenance (#2086 AC6) ────────────────────────────────────────────────────────
    // These tests exercise the 7-arg overload directly, since ValidationNode itself carries no
    // display_label field — a nodeKey -> label map must be supplied for check #16 to run at all
    // (an empty/null map makes it a no-op, exercised implicitly by every other test in this file,
    // none of which supply a label map and none of which ever see a LABEL_NOT_DERIVABLE error).

    private static final Map<String, String> VALID_TREE_LABELS = Map.of(
            "d:north", "Area A & Area B",
            "c:north:a-b", "Area A & Area B",
            "a:city|a", "Area A",
            "a:city|b", "Area B");

    @Test
    @DisplayName("16a: a derivable two-representative \"A & B\" label passes")
    void twoRepresentativeLabelDerivableIsAccepted() {
        ValidationReport report = service.validate(
                validTree(), Set.of(), null, List.of(), Set.of(), Set.of(), VALID_TREE_LABELS);
        assertThat(report.errors()).isEmpty();
    }

    @Test
    @DisplayName("16b: a derivable single-representative label passes")
    void singleRepresentativeLabelDerivableIsAccepted() {
        List<ValidationNode> nodes = List.of(
                node("d:west", null, "DIRECTION", null, List.of("city|only"), 0, List.of(), 1, 1),
                node("a:city|only", "d:west", "AREA", "city|only", List.of("city|only"), 1,
                        List.of("d:west"), 1, 1));
        Map<String, String> labels = Map.of("d:west", "Area Only", "a:city|only", "Area Only");
        ValidationReport report = service.validate(nodes, Set.of(), null, List.of(), Set.of(), Set.of(), labels);
        assertThat(report.errors()).isEmpty();
    }

    @Test
    @DisplayName("16c: a non-derivable label with NO override FAILS with LABEL_NOT_DERIVABLE — the "
            + "no-override path, proving the check actually rejects real violations and not just "
            + "waves through anything carrying an override")
    void nonDerivableLabelWithNoOverrideFails() {
        Map<String, String> labels = new java.util.HashMap<>(VALID_TREE_LABELS);
        labels.put("c:north:a-b", "North"); // not derivable from reps [city|a, city|b]
        ValidationReport report = service.validate(
                validTree(), Set.of(), null, List.of(), Set.of(), Set.of(), labels);
        assertThat(report.errors()).extracting(ValidationError::code).contains("LABEL_NOT_DERIVABLE");
    }

    @Test
    @DisplayName("16d: the SAME non-derivable label WITH a matching RELABEL override PASSES — the "
            + "mandatory exemption, since RELABEL is applied BEFORE validation runs (V122)")
    void nonDerivableLabelWithRelabelOverridePasses() {
        Map<String, String> labels = new java.util.HashMap<>(VALID_TREE_LABELS);
        labels.put("c:north:a-b", "North"); // same non-derivable label as 16c
        List<NavigationOverride> overrides = List.of(
                new NavigationOverride("RELABEL", null, "c:north:a-b", null, null, "North", null, 1));
        ValidationReport report = service.validate(
                validTree(), Set.of(), null, overrides, Set.of(), Set.of(), labels);
        assertThat(report.errors()).extracting(ValidationError::code).doesNotContain("LABEL_NOT_DERIVABLE");
    }

    @Test
    @DisplayName("16e: a label equal to the node's own region_key is LABEL_NOT_DERIVABLE")
    void labelEqualToRegionKeyFails() {
        Map<String, String> labels = new java.util.HashMap<>(VALID_TREE_LABELS);
        labels.put("d:north", "north"); // == regionKey "north" used by the node() test helper
        ValidationReport report = service.validate(
                validTree(), Set.of(), null, List.of(), Set.of(), Set.of(), labels);
        assertThat(report.errors()).extracting(ValidationError::code).contains("LABEL_NOT_DERIVABLE");
    }

    @Test
    @DisplayName("16f: a label equal to the node's own node_key is LABEL_NOT_DERIVABLE")
    void labelEqualToNodeKeyFails() {
        Map<String, String> labels = new java.util.HashMap<>(VALID_TREE_LABELS);
        labels.put("c:north:a-b", "c:north:a-b");
        ValidationReport report = service.validate(
                validTree(), Set.of(), null, List.of(), Set.of(), Set.of(), labels);
        assertThat(report.errors()).extracting(ValidationError::code).contains("LABEL_NOT_DERIVABLE");
    }

    @Test
    @DisplayName("16g: duplicate sibling DIRECTION labels across unrelated regions produce NO "
            + "validation error (WARN only, per design.R1 residual_risk / R8) — node_key stays "
            + "unique so this is a UX wart, not a blocking defect")
    void duplicateDirectionLabelsAreWarnNotFailure() {
        List<ValidationNode> nodes = List.of(
                node("d:north", null, "DIRECTION", null, List.of("city|a"), 0, List.of(), 1, 1),
                node("a:city|a", "d:north", "AREA", "city|a", List.of("city|a"), 1, List.of("d:north"), 1, 1),
                node("d:south", null, "DIRECTION", null, List.of("city|b"), 0, List.of(), 1, 2),
                node("a:city|b", "d:south", "AREA", "city|b", List.of("city|b"), 1, List.of("d:south"), 1, 1));
        // Both DIRECTIONs derive to the SAME label from their own (distinct) representative areas.
        Map<String, String> labels = Map.of(
                "d:north", "Same Name", "a:city|a", "Same Name",
                "d:south", "Same Name", "a:city|b", "Same Name");
        // Give each DIRECTION its own regionKey via a fresh node set (node() defaults to "north" for
        // every node — override d:south/a:city|b's regionKey directly so check #14 doesn't fire).
        List<ValidationNode> retagged = nodes.stream()
                .map(n -> n.nodeKey().equals("d:south") || n.nodeKey().equals("a:city|b")
                        ? new ValidationNode(
                                n.scopeId(), n.nodeKey(), n.parentNodeKey(), n.nodeType(), n.areaKey(),
                                n.representativeAreaKeys(), n.depth(), n.ancestorKeys(), n.descendantAreaCount(),
                                n.displayOrder(), n.centreLat(), n.centreLon(), n.minLat(), n.minLon(),
                                n.maxLat(), n.maxLon(), "south")
                        : n)
                .toList();
        ValidationReport report = service.validate(
                retagged, Set.of(), null, List.of(), Set.of(), Set.of(), labels);
        assertThat(report.errors()).isEmpty();
    }

    @Test
    @DisplayName("[#2086 code-review fix, N2] a RELABEL targeting an AREA leaf exempts its PARENT's "
            + "derivability judgment too — the parent's reps resolve through the AREA's curated "
            + "(post-override) label, which the parent's OWN label was never derived from, so a "
            + "legitimate curated path must not fail check #16 wholesale")
    void relabelOnAreaLeafExemptsParentClusterDerivabilityJudgment() {
        Map<String, String> labels = new java.util.HashMap<>(VALID_TREE_LABELS);
        labels.put("a:city|a", "Custom A"); // AREA leaf's curated post-override label
        // c:north:a-b's own label is UNCHANGED ("Area A & Area B") — it is not itself RELABELed —
        // but its reps=[city|a, city|b] now resolve rep0Name via the curated "Custom A"; without
        // the N2 fix "Area A & Area B" would no longer be among the derivable candidates.
        List<NavigationOverride> overrides = List.of(
                new NavigationOverride("RELABEL", null, "a:city|a", null, null, "Custom A", null, 1));
        ValidationReport report = service.validate(
                validTree(), Set.of(), null, overrides, Set.of(), Set.of(), labels);
        assertThat(report.errors()).extracting(ValidationError::code).doesNotContain("LABEL_NOT_DERIVABLE");
    }

    @Test
    @DisplayName("[#2086 code-review fix, N7] the key-leak guard (label == node_key/region_key) still "
            + "fires even for a node carrying a RELABEL override — the RELABEL exemption is scoped to "
            + "the reps-derivability judgment only, never to this cheap secondary guard")
    void keyLeakGuardFiresEvenForRelabeledNode() {
        Map<String, String> labels = new java.util.HashMap<>(VALID_TREE_LABELS);
        labels.put("c:north:a-b", "c:north:a-b"); // label leaks the node's own node_key
        List<NavigationOverride> overrides = List.of(
                new NavigationOverride("RELABEL", null, "c:north:a-b", null, null, "c:north:a-b", null, 1));
        ValidationReport report = service.validate(
                validTree(), Set.of(), null, overrides, Set.of(), Set.of(), labels);
        assertThat(report.errors()).extracting(ValidationError::code).contains("LABEL_NOT_DERIVABLE");
    }

    @Test
    @DisplayName("[#2086 code-review fix, N8] a RELABEL override for a DIFFERENT node_key does NOT "
            + "exempt this node — proves the exemption is subject-scoped, not \"any override present\"")
    void relabelForDifferentNodeKeyDoesNotExemptThisNode() {
        Map<String, String> labels = new java.util.HashMap<>(VALID_TREE_LABELS);
        labels.put("c:north:a-b", "North"); // non-derivable, same fixture as 16c
        // RELABEL targets a DIFFERENT node (d:north), not c:north:a-b — the exemption must not apply.
        List<NavigationOverride> overrides = List.of(
                new NavigationOverride("RELABEL", null, "d:north", null, null, "Area A & Area B", null, 1));
        ValidationReport report = service.validate(
                validTree(), Set.of(), null, overrides, Set.of(), Set.of(), labels);
        assertThat(report.errors()).extracting(ValidationError::code).contains("LABEL_NOT_DERIVABLE");
    }

    // ── ValidationMode (#2086 rework fix, PR #2111 cycle 1) ─────────────────────────────────────
    // NavigationGraphLoader — the runtime loader — is the ONLY caller of validateForRuntimeLoad(),
    // proven end-to-end (real DB, real loader entry point) by
    // NavigationRuntimeLoadLenientRegressionIT. These unit tests isolate the mode-split LOGIC
    // itself: LENIENT_RUNTIME_LOAD downgrades ONLY #15/#16 findings to warnings, every other check
    // (#1-#14) stays fail-closed regardless of mode, and STRICT (every other overload's default)
    // is completely unaffected.

    @Test
    @DisplayName("[mode] LENIENT_RUNTIME_LOAD downgrades a #15 BREADTH_EXCEEDED finding to a "
            + "lenientWarning instead of a blocking error — the same non-compliant tree that 15a "
            + "proves STRICT rejects")
    void lenientRuntimeLoad_downgradesBreadthMandateToWarning() {
        List<ValidationNode> nodes = new ArrayList<>();
        nodes.add(node("d:north", null, "DIRECTION", null, List.of("g0", "g1"), 0, List.of(), 16, 1));
        nodes.addAll(areaLeaves("d:north", List.of("d:north"), 1, "g", 16));

        ValidationReport lenient = service.validateForRuntimeLoad(nodes);
        assertThat(lenient.isValid()).isTrue();
        assertThat(lenient.errors()).isEmpty();
        assertThat(lenient.lenientWarnings()).anySatisfy(w -> assertThat(w).contains("BREADTH_EXCEEDED"));

        // The SAME tree, same node data, under the explicit STRICT mode — still rejected. Proves
        // the generation/candidate path (which always resolves to STRICT) is provably unaffected.
        ValidationReport strict = service.validate(
                nodes, Set.of(), null, List.of(), Set.of(), Set.of(), Map.of(), ValidationMode.STRICT);
        assertThat(strict.isValid()).isFalse();
        assertThat(strict.errors()).extracting(ValidationError::code).contains("BREADTH_EXCEEDED");
        assertThat(strict.lenientWarnings()).isEmpty();
    }

    @Test
    @DisplayName("[mode] LENIENT_RUNTIME_LOAD downgrades a #16 LABEL_NOT_DERIVABLE finding to a "
            + "lenientWarning — mirrors the #15 downgrade for the other #2086-ADDITIVE check")
    void lenientRuntimeLoad_downgradesLabelProvenanceToWarning() {
        Map<String, String> labels = new java.util.HashMap<>(VALID_TREE_LABELS);
        labels.put("c:north:a-b", "North"); // same non-derivable label as 16c

        ValidationReport lenient = service.validate(
                validTree(), Set.of(), null, List.of(), Set.of(), Set.of(), labels,
                ValidationMode.LENIENT_RUNTIME_LOAD);
        assertThat(lenient.isValid()).isTrue();
        assertThat(lenient.lenientWarnings()).anySatisfy(w -> assertThat(w).contains("LABEL_NOT_DERIVABLE"));
    }

    @Test
    @DisplayName("[mode] LENIENT_RUNTIME_LOAD still fails closed on a genuinely corrupt legacy tree "
            + "— checks #1-#14 are completely unaffected by mode, so a cycle in a tree that ALSO "
            + "violates #15 still throws/reports invalid, with the #15 finding merely downgraded")
    void lenientRuntimeLoad_stillFailsClosedForStructuralCorruption() {
        List<ValidationNode> nodes = new ArrayList<>();
        // A DIRECTION with 16 direct AREA children (violates #15) — AND a cycle between two of them
        // (violates #1) by making a child claim its own child as parent, i.e. genuine structural
        // corruption unrelated to the #2086-ADDITIVE checks.
        nodes.add(node("d:north", null, "DIRECTION", null, List.of("g0", "g1"), 0, List.of(), 16, 1));
        nodes.addAll(areaLeaves("d:north", List.of("d:north"), 1, "g", 16));
        ValidationNode corrupted = nodes.stream().filter(n -> n.nodeKey().equals("a:g0")).findFirst().orElseThrow();
        nodes.set(nodes.indexOf(corrupted), new ValidationNode(
                corrupted.scopeId(), corrupted.nodeKey(), "a:g1" /* WRONG: parent is its own sibling,
                forming a 2-node cycle once a:g1 is also repointed */, corrupted.nodeType(),
                corrupted.areaKey(), corrupted.representativeAreaKeys(), corrupted.depth(),
                corrupted.ancestorKeys(), corrupted.descendantAreaCount(), corrupted.displayOrder(),
                corrupted.centreLat(), corrupted.centreLon(), corrupted.minLat(), corrupted.minLon(),
                corrupted.maxLat(), corrupted.maxLon(), corrupted.regionKey()));
        ValidationNode g1 = nodes.stream().filter(n -> n.nodeKey().equals("a:g1")).findFirst().orElseThrow();
        nodes.set(nodes.indexOf(g1), new ValidationNode(
                g1.scopeId(), g1.nodeKey(), "a:g0", g1.nodeType(), g1.areaKey(),
                g1.representativeAreaKeys(), g1.depth(), g1.ancestorKeys(), g1.descendantAreaCount(),
                g1.displayOrder(), g1.centreLat(), g1.centreLon(), g1.minLat(), g1.minLon(),
                g1.maxLat(), g1.maxLon(), g1.regionKey()));

        ValidationReport report = service.validateForRuntimeLoad(nodes);

        assertThat(report.isValid()).isFalse(); // genuinely corrupt — LENIENT never masks #1-#14
        assertThat(report.errors()).extracting(ValidationError::code).contains("CYCLE_DETECTED");
        // d:north's stored descendant_area_count=16 still exceeds 15 even though re-parenting two
        // leaves into the a:g0<->a:g1 cycle leaves it with only 14 DIRECT children — check #9
        // (DESCENDANT_COUNT_MISMATCH) fires separately for that now-stale count, and check #15 still
        // produces its own MISSING_LOCAL_DESTINATION_LEVEL finding on the same node, merely
        // downgraded to a lenientWarning rather than silently lost.
        assertThat(report.lenientWarnings())
                .anySatisfy(w -> assertThat(w).contains("MISSING_LOCAL_DESTINATION_LEVEL"));
    }

    @Test
    @DisplayName("[mode] LENIENT_RUNTIME_LOAD on an already-#2086-compliant tree behaves identically "
            + "to STRICT — zero errors AND zero lenientWarnings, since #15/#16 never fire for a "
            + "compliant tree regardless of mode")
    void lenientRuntimeLoad_compliantTree_noErrorsNoWarnings() {
        ValidationReport report = service.validateForRuntimeLoad(validTree());
        assertThat(report.isValid()).isTrue();
        assertThat(report.lenientWarnings()).isEmpty();
    }
}
