package com.example.realestate.discover.navigation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
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
}
