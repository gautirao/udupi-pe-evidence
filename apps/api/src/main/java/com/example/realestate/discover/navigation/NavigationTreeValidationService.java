package com.example.realestate.discover.navigation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The 13 blocking structural invariants (#1955 AC7) a generated/staged navigation tree must
 * satisfy BEFORE any DB-constraint enforcement or promotion. This service is a strict SUPERSET of
 * the V121 DB constraints (partial-unique AREA leaf, AREA-is-leaf trigger) — every DB constraint
 * has an equivalent or stronger check here, so a bad tree is always caught here first, with a
 * structured {@link ValidationReport} the future preview/promotion slices consume instead of a
 * raw SQL exception.
 *
 * <p>Operates over the entity-agnostic {@link ValidationNode} view, keyed by {@code node_key}
 * (not a surrogate id), so the exact same logic runs on an in-memory pre-persistence {@link
 * GeneratedNode} tree or a persisted revision/city once a future slice adds an id-adapter.
 *
 * <h2>The 13 checks (AC7)</h2>
 * <ol>
 *   <li>cycles</li>
 *   <li>orphan nodes</li>
 *   <li>invalid depth / cross-revision / cross-city parentage</li>
 *   <li>one-child clusters</li>
 *   <li>duplicate or missing active area paths</li>
 *   <li>an area in multiple active leaf paths</li>
 *   <li>representative areas not members of their cluster</li>
 *   <li>duplicate sibling identity / invalid ordering</li>
 *   <li>incorrect structural descendant_area_count</li>
 *   <li>missing required bounds</li>
 *   <li>max-depth violations</li>
 *   <li>orphaned/inconsistent overrides</li>
 *   <li>direct-search vs guided-navigation ancestry mismatch</li>
 * </ol>
 *
 * <h2>#14: hierarchy shape (#1956 D6, ADDITIVE)</h2>
 * A 14th check, added without touching the logic of the 13 above: the locked #1956/#2014 product
 * contract permits EXACTLY two public shapes — {@code City -> Direction -> AREA} (depths 0,1) and
 * {@code City -> Direction -> Local Destination (CLUSTER) -> AREA} (depths 0,1,2), NEVER a third
 * public CLUSTER level — and a DIRECTION node must be a GENUINE ancestor in the tree, not merely
 * {@code region_key} row metadata. This is the rule whose absence let a flat {@code City -> AREA}
 * tree (323 AREA roots, zero DIRECTION nodes anywhere) pass all 13 checks above, get promoted, and
 * then have to be rolled back — see {@link #checkHierarchyShape}. The depth ceiling this check
 * enforces is a FIXED product rule, independent of check #11's operator-configurable {@code
 * max_safety_depth} — a tree can satisfy #11 (the policy allows deeper recursion) and still fail
 * #14 (the product contract doesn't expose that depth publicly).
 *
 * <h2>#15/#16: breadth mandate + label provenance (#2086 design.R3, ADDITIVE)</h2>
 * Two more checks, added to close the Bangalore defect issue #2086 exists to fix: {@link
 * #checkBreadthMandate} enforces that no node ever has more than {@link #MANDATORY_MAX_CHILDREN}
 * (15) children, that any node with more than 15 canonical areas beneath it (the PERSISTED {@code
 * descendant_area_count} — never a listing-derived count) exposes a Local Destination (CLUSTER)
 * level rather than direct AREA children, and that no CLUSTER itself exceeds 15 canonical areas.
 * {@link #checkLabelProvenance} enforces that every node's {@code display_label} is structurally
 * DERIVABLE from its own {@code representative_area_keys} (resolved against the tree's own AREA
 * leaves, which — by check #5 — form a complete canonical area-name table), exempting nodes
 * carrying a RELABEL override for the revision (RELABEL is applied BEFORE validation — see V122).
 * Also fixed here: check #11 ({@link #checkMaxDepth}) no longer derives its ceiling from the
 * operator-configurable {@code max_safety_depth} policy knob — see that method's javadoc.
 *
 * <h2>{@link ValidationMode} (#2086 rework fix, PR #2111 cycle 1, ADDITIVE)</h2>
 * Every overload above defaults to {@link ValidationMode#STRICT} (checks #1-#16 all fail-closed) —
 * generation, admin candidate/preview validation, and promotion are UNCHANGED by this fix. {@link
 * #validateForRuntimeLoad} is a new, separate entry point, used ONLY by {@link
 * NavigationGraphLoader}, that runs under {@link ValidationMode#LENIENT_RUNTIME_LOAD}: checks #1-14
 * still fail-closed, but #15/#16 findings are downgraded to {@link
 * ValidationReport#lenientWarnings()} instead of blocking {@link ValidationError}s, so an
 * already-PROMOTED pre-#2086 revision (e.g. a DIRECTION with 36-86 direct AREA children) can still
 * be loaded and served rather than making a fresh/restarted instance unable to load it at all. See
 * {@link ValidationMode}'s javadoc for the full rationale, including why this is a call-site
 * discriminator rather than a revision/version marker.
 */
@Service
public class NavigationTreeValidationService {

    private static final Logger log = LoggerFactory.getLogger(NavigationTreeValidationService.class);

    /** Convenience overload: no expected-area universe, no depth ceiling, no overrides. */
    public ValidationReport validate(List<ValidationNode> nodes) {
        return validate(nodes, Set.of(), null, List.of());
    }

    /** Overload preserved for existing call sites that never pass overrides against a region universe. */
    public ValidationReport validate(
            List<ValidationNode> nodes, Set<String> expectedAreaKeys, Integer maxSafetyDepth,
            List<NavigationOverride> overrides) {
        return validate(nodes, expectedAreaKeys, maxSafetyDepth, overrides, Set.of());
    }

    /**
     * Overload preserved for callers with no separate canonical (pre-override) area universe —
     * {@code expectedAreaKeys} doubles as both check #5's post-exclude "must have a leaf" universe
     * AND check #12's EXCLUDE_AREA/REASSIGN_AREA_REGION subject-existence universe. Callers whose
     * {@code expectedAreaKeys} is already POST-exclude (i.e. it does not contain an area an
     * EXCLUDE_AREA override targets) must use the 6-arg overload instead, or every EXCLUDE_AREA
     * override will incorrectly report ORPHANED_OVERRIDE against its own subject.
     */
    public ValidationReport validate(
            List<ValidationNode> nodes, Set<String> expectedAreaKeys, Integer maxSafetyDepth,
            List<NavigationOverride> overrides, Set<String> validRegionKeys) {
        return validate(nodes, expectedAreaKeys, maxSafetyDepth, overrides, validRegionKeys, expectedAreaKeys);
    }

    /**
     * #1955 Areas PR A, SLICE 2f+2g: full-semantics overload. {@code validRegionKeys} is the
     * revision's known city-region universe, consulted only by check #12's REASSIGN_AREA_REGION
     * target validation. {@code canonicalAreaKeys} is the revision's ACTIVE-area universe BEFORE
     * any override is applied — distinct from {@code expectedAreaKeys} (which is POST-exclude, so
     * check #5 doesn't demand a leaf for an area an EXCLUDE_AREA override legitimately removed) —
     * used ONLY by check #12 to confirm an EXCLUDE_AREA/REASSIGN_AREA_REGION override's subject was
     * a real, active area in the first place. Delegates to the 7-arg overload with an empty label
     * map, so check #16 is a no-op for every pre-#2086 call site (see that overload's javadoc).
     */
    public ValidationReport validate(
            List<ValidationNode> nodes, Set<String> expectedAreaKeys, Integer maxSafetyDepth,
            List<NavigationOverride> overrides, Set<String> validRegionKeys, Set<String> canonicalAreaKeys) {
        return validate(
                nodes, expectedAreaKeys, maxSafetyDepth, overrides, validRegionKeys, canonicalAreaKeys, Map.of());
    }

    /**
     * #2086: full-semantics overload, adding {@code displayLabelByNodeKey} for check #16 (label
     * provenance). {@link ValidationNode} carries no label field of its own (only {@code nodeKey},
     * {@code areaKey}, {@code representativeAreaKeys}, etc.), so a caller that wants #16 enforced
     * must supply a {@code node_key -> display_label} map built from its own node source (e.g.
     * {@code GeneratedNode::displayLabel}, {@code NavigationNode::getDisplayLabel}, {@code
     * SandboxNavigationNode::getDisplayLabel}). An empty/null map makes check #16 a complete no-op,
     * mirroring check #11's null-{@code maxSafetyDepth} skip pattern — every pre-#2086 call site
     * stays source- and behaviour-compatible without any change to {@link ValidationNode}.
     *
     * <p><b>Wired into real generation (#2086 S1b):</b> {@code
     * NavigationTreeGenerationService#generateAndStoreForRevision} (see
     * NavigationTreeGenerationService.java:171-176) builds a {@code node_key -> display_label} map
     * from the real generated tree — {@code
     * generated.stream().collect(Collectors.toMap(GeneratedNode::nodeKey, GeneratedNode::displayLabel,
     * (a, b) -> a))} — and passes it as this method's 7th argument, so check #16 IS enforced on
     * every generated tree via the production call path, not merely reachable from a test. The
     * empty-map no-op behaviour documented above exists only for the pre-#2086 6-arg (and shorter)
     * overloads above, whose call sites predate check #16 and have never been updated to supply a
     * label map.
     */
    public ValidationReport validate(
            List<ValidationNode> nodes, Set<String> expectedAreaKeys, Integer maxSafetyDepth,
            List<NavigationOverride> overrides, Set<String> validRegionKeys, Set<String> canonicalAreaKeys,
            Map<String, String> displayLabelByNodeKey) {
        return validate(
                nodes, expectedAreaKeys, maxSafetyDepth, overrides, validRegionKeys, canonicalAreaKeys,
                displayLabelByNodeKey, ValidationMode.STRICT);
    }

    /**
     * #2086 rework fix (PR #2111 cycle 1): RUNTIME LOAD convenience overload — the ONLY entry point
     * that ever passes {@link ValidationMode#LENIENT_RUNTIME_LOAD}, used exclusively by {@link
     * NavigationGraphLoader} to load an already-PROMOTED revision. See {@link ValidationMode}'s
     * javadoc for why leniency is scoped by call site rather than a revision/version marker.
     * Supplies no expected-area universe, depth ceiling, overrides, or label map — mirroring the
     * 1-arg {@link #validate(List)} convenience overload every pre-#2086 loader call already used.
     */
    public ValidationReport validateForRuntimeLoad(List<ValidationNode> nodes) {
        return validate(nodes, Set.of(), null, List.of(), Set.of(), Set.of(), Map.of(), ValidationMode.LENIENT_RUNTIME_LOAD);
    }

    /**
     * #2086 rework fix (PR #2111 cycle 1): full-semantics overload with an explicit {@link
     * ValidationMode}. {@link ValidationMode#STRICT} (the default every overload above resolves
     * to) runs every check (#1-#16) fail-closed, exactly as before this fix. {@link
     * ValidationMode#LENIENT_RUNTIME_LOAD} still RUNS checks #15/#16 (never skips their execution —
     * a genuinely corrupt legacy tree that also fails #15/#16 still needs #1-#14 to catch the
     * corruption, which they do unconditionally either way) but routes any finding they produce
     * into {@link ValidationReport#lenientWarnings()} instead of {@link ValidationReport#errors()},
     * so it never fails {@link ValidationReport#isValid()}. Checks #1-#14 are completely unaffected
     * by {@code mode} — they always add to {@code errors} regardless.
     */
    public ValidationReport validate(
            List<ValidationNode> nodes, Set<String> expectedAreaKeys, Integer maxSafetyDepth,
            List<NavigationOverride> overrides, Set<String> validRegionKeys, Set<String> canonicalAreaKeys,
            Map<String, String> displayLabelByNodeKey, ValidationMode mode) {

        List<ValidationError> errors = new ArrayList<>();
        List<String> lenientWarnings = new ArrayList<>();

        Map<String, ValidationNode> byKey = new LinkedHashMap<>();
        for (ValidationNode n : nodes) {
            byKey.put(n.nodeKey(), n);
        }
        Map<String, List<ValidationNode>> byParent = nodes.stream()
                .collect(Collectors.groupingBy(
                        n -> n.parentNodeKey() == null ? "" : n.parentNodeKey(),
                        LinkedHashMap::new, Collectors.toList()));

        checkOrphans(nodes, byKey, errors);                                  // 2
        checkCycles(nodes, byKey, errors);                                   // 1
        checkDepthAndParentage(nodes, byKey, errors);                        // 3
        checkOneChildClusters(byParent, byKey, errors);                      // 4
        checkDuplicateAndMissingAreaLeaves(nodes, expectedAreaKeys, errors); // 5
        checkAreaInMultipleLeafPaths(nodes, byKey, errors);                  // 6
        checkRepresentativesAreMembers(nodes, byParent, errors);            // 7
        checkSiblingIdentityAndOrdering(byParent, errors);                  // 8
        checkDescendantAreaCount(nodes, byParent, errors);                  // 9
        checkMissingBounds(nodes, errors);                                  // 10
        checkMaxDepth(nodes, maxSafetyDepth, errors);                       // 11
        checkOverrides(byKey, byParent, overrides, canonicalAreaKeys, validRegionKeys, errors); // 12
        checkAncestryMismatch(nodes, byKey, errors);                       // 13
        checkHierarchyShape(nodes, byKey, errors);                        // 14
        checkBreadthMandate(nodes, byParent, mode, errors, lenientWarnings);                     // 15
        checkLabelProvenance(nodes, displayLabelByNodeKey, overrides, mode, errors, lenientWarnings); // 16

        return new ValidationReport(List.copyOf(errors), List.copyOf(lenientWarnings));
    }

    // 1: cycles — walking parent_node_key from any node must reach a null parent within the
    // tree's size, never revisiting a node it has already seen.
    private void checkCycles(List<ValidationNode> nodes, Map<String, ValidationNode> byKey, List<ValidationError> errors) {
        for (ValidationNode start : nodes) {
            Set<String> visited = new HashSet<>();
            ValidationNode cur = start;
            int hops = 0;
            while (cur != null && cur.parentNodeKey() != null) {
                if (!visited.add(cur.nodeKey())) {
                    errors.add(new ValidationError("CYCLE_DETECTED",
                            "cycle detected in the parent chain reachable from node " + start.nodeKey(),
                            start.nodeKey()));
                    return;
                }
                if (++hops > nodes.size()) {
                    errors.add(new ValidationError("CYCLE_DETECTED",
                            "parent chain from " + start.nodeKey() + " exceeds tree size — cycle suspected",
                            start.nodeKey()));
                    return;
                }
                ValidationNode parent = byKey.get(cur.parentNodeKey());
                if (parent == null) {
                    break; // reported separately by checkOrphans
                }
                cur = parent;
            }
        }
    }

    // 2: orphan nodes — parent_node_key set but not present in this same node set.
    private void checkOrphans(List<ValidationNode> nodes, Map<String, ValidationNode> byKey, List<ValidationError> errors) {
        for (ValidationNode n : nodes) {
            if (n.parentNodeKey() != null && !byKey.containsKey(n.parentNodeKey())) {
                errors.add(new ValidationError("ORPHAN_NODE",
                        "node " + n.nodeKey() + " references missing parent " + n.parentNodeKey(), n.nodeKey()));
            }
        }
    }

    // 3: invalid depth / cross-scope (revision or city) parentage.
    private void checkDepthAndParentage(List<ValidationNode> nodes, Map<String, ValidationNode> byKey, List<ValidationError> errors) {
        for (ValidationNode n : nodes) {
            if (n.parentNodeKey() == null) {
                if (n.depth() != 0) {
                    errors.add(new ValidationError("INVALID_DEPTH",
                            "root node " + n.nodeKey() + " has depth=" + n.depth() + ", expected 0", n.nodeKey()));
                }
                continue;
            }
            ValidationNode parent = byKey.get(n.parentNodeKey());
            if (parent == null) {
                continue; // already reported as ORPHAN_NODE
            }
            if (!Objects.equals(parent.scopeId(), n.scopeId())) {
                errors.add(new ValidationError("CROSS_SCOPE_PARENTAGE",
                        "node " + n.nodeKey() + " (scope=" + n.scopeId() + ") has parent " + parent.nodeKey()
                                + " in a different scope=" + parent.scopeId(), n.nodeKey()));
            }
            if (n.depth() != parent.depth() + 1) {
                errors.add(new ValidationError("INVALID_DEPTH",
                        "node " + n.nodeKey() + " has depth=" + n.depth() + ", expected parent depth+1="
                                + (parent.depth() + 1), n.nodeKey()));
            }
        }
    }

    // 4: one-child clusters — a CLUSTER node with exactly one child.
    //
    // This check is CLUSTER-specific BY DESIGN, not a gap: a CLUSTER exists only to group multiple
    // AREAs under a "Local Destination" label, so a CLUSTER with a single child is always
    // degenerate (nothing left to disambiguate — collapse it, don't render it). A DIRECTION node
    // is different: it represents a genuine city region, and a region may legitimately contain
    // exactly one canonical AREA (confirmed live: udupi's W region has exactly one area). Rejecting
    // a one-child DIRECTION would make every single-area region unrepresentable, which contradicts
    // the locked City -> Direction -> AREA contract itself. Applying this rule to every non-root
    // parent regardless of node kind — as the original implementation did, keyed only by
    // byParent's map key with no type lookup — was the bug.
    private void checkOneChildClusters(
            Map<String, List<ValidationNode>> byParent, Map<String, ValidationNode> byKey,
            List<ValidationError> errors) {
        for (Map.Entry<String, List<ValidationNode>> e : byParent.entrySet()) {
            if (e.getKey().isEmpty()) {
                continue; // roots have no CLUSTER parent to check
            }
            ValidationNode parent = byKey.get(e.getKey());
            if (parent == null) {
                continue; // unresolvable parent key is already reported as ORPHAN_NODE (check #2)
            }
            if (!"CLUSTER".equals(parent.nodeType())) {
                continue; // e.g. a DIRECTION with one child AREA is a legitimate single-area region
            }
            if (e.getValue().size() == 1) {
                errors.add(new ValidationError("ONE_CHILD_CLUSTER",
                        "cluster " + e.getKey() + " has exactly one child: " + e.getValue().get(0).nodeKey(),
                        e.getKey()));
            }
        }
    }

    // 5: duplicate or missing active area leaves.
    private void checkDuplicateAndMissingAreaLeaves(
            List<ValidationNode> nodes, Set<String> expectedAreaKeys, List<ValidationError> errors) {
        Map<String, List<ValidationNode>> byArea = nodes.stream()
                .filter(n -> "AREA".equals(n.nodeType()) && n.areaKey() != null)
                .collect(Collectors.groupingBy(ValidationNode::areaKey));

        for (Map.Entry<String, List<ValidationNode>> e : byArea.entrySet()) {
            if (e.getValue().size() > 1) {
                errors.add(new ValidationError("DUPLICATE_AREA_LEAF",
                        "area_key " + e.getKey() + " has " + e.getValue().size() + " AREA leaves", null));
            }
        }
        if (expectedAreaKeys != null) {
            for (String expected : expectedAreaKeys) {
                if (!byArea.containsKey(expected)) {
                    errors.add(new ValidationError("MISSING_AREA_LEAF",
                            "expected canonical area " + expected + " has no AREA leaf in the tree", null));
                }
            }
        }
    }

    // 6: an area in multiple active leaf paths — the same area_key is a representative of two
    // CLUSTER nodes that are not on the same ancestor/descendant line.
    private void checkAreaInMultipleLeafPaths(
            List<ValidationNode> nodes, Map<String, ValidationNode> byKey, List<ValidationError> errors) {
        Map<String, List<String>> clustersByRepArea = new LinkedHashMap<>();
        for (ValidationNode n : nodes) {
            if (!"CLUSTER".equals(n.nodeType()) || n.representativeAreaKeys() == null) {
                continue;
            }
            for (String rep : n.representativeAreaKeys()) {
                clustersByRepArea.computeIfAbsent(rep, k -> new ArrayList<>()).add(n.nodeKey());
            }
        }
        for (Map.Entry<String, List<String>> e : clustersByRepArea.entrySet()) {
            List<String> clusterKeys = e.getValue();
            for (int i = 0; i < clusterKeys.size(); i++) {
                for (int j = i + 1; j < clusterKeys.size(); j++) {
                    if (!isAncestorOrDescendant(clusterKeys.get(i), clusterKeys.get(j), byKey)) {
                        errors.add(new ValidationError("AREA_IN_MULTIPLE_LEAF_PATHS",
                                "area " + e.getKey() + " is a representative of unrelated clusters "
                                        + clusterKeys.get(i) + " and " + clusterKeys.get(j), e.getKey()));
                    }
                }
            }
        }
    }

    private boolean isAncestorOrDescendant(String keyA, String keyB, Map<String, ValidationNode> byKey) {
        return isAncestorOf(keyA, keyB, byKey) || isAncestorOf(keyB, keyA, byKey);
    }

    private boolean isAncestorOf(String ancestorKey, String nodeKey, Map<String, ValidationNode> byKey) {
        ValidationNode cur = byKey.get(nodeKey);
        Set<String> visited = new HashSet<>();
        while (cur != null && cur.parentNodeKey() != null && visited.add(cur.nodeKey())) {
            if (cur.parentNodeKey().equals(ancestorKey)) {
                return true;
            }
            cur = byKey.get(cur.parentNodeKey());
        }
        return false;
    }

    // 7: representative areas not members of their own cluster's descendant AREA leaves.
    private void checkRepresentativesAreMembers(
            List<ValidationNode> nodes, Map<String, List<ValidationNode>> byParent, List<ValidationError> errors) {
        for (ValidationNode n : nodes) {
            if (!"CLUSTER".equals(n.nodeType()) || n.representativeAreaKeys() == null) {
                continue;
            }
            Set<String> descendantAreaKeys = collectDescendantAreaKeys(n.nodeKey(), byParent);
            for (String rep : n.representativeAreaKeys()) {
                if (!descendantAreaKeys.contains(rep)) {
                    errors.add(new ValidationError("REPRESENTATIVE_NOT_MEMBER",
                            "cluster " + n.nodeKey() + " lists representative " + rep
                                    + " which is not among its descendant areas", n.nodeKey()));
                }
            }
        }
    }

    private Set<String> collectDescendantAreaKeys(String nodeKey, Map<String, List<ValidationNode>> byParent) {
        Set<String> result = new LinkedHashSet<>();
        Deque<String> stack = new ArrayDeque<>();
        stack.push(nodeKey);
        Set<String> visited = new HashSet<>();
        while (!stack.isEmpty()) {
            String cur = stack.pop();
            if (!visited.add(cur)) {
                continue;
            }
            for (ValidationNode child : byParent.getOrDefault(cur, List.of())) {
                if ("AREA".equals(child.nodeType()) && child.areaKey() != null) {
                    result.add(child.areaKey());
                } else {
                    stack.push(child.nodeKey());
                }
            }
        }
        return result;
    }

    // 8: duplicate sibling identity / invalid ordering.
    private void checkSiblingIdentityAndOrdering(Map<String, List<ValidationNode>> byParent, List<ValidationError> errors) {
        for (Map.Entry<String, List<ValidationNode>> e : byParent.entrySet()) {
            String parentLabel = e.getKey().isEmpty() ? "<root>" : e.getKey();
            List<ValidationNode> siblings = e.getValue();

            Set<String> seenKeys = new HashSet<>();
            for (ValidationNode s : siblings) {
                if (!seenKeys.add(s.nodeKey())) {
                    errors.add(new ValidationError("DUPLICATE_SIBLING_IDENTITY",
                            "duplicate node_key " + s.nodeKey() + " among siblings of parent=" + parentLabel,
                            s.nodeKey()));
                }
            }

            List<Integer> orders = siblings.stream().map(ValidationNode::displayOrder).sorted().toList();
            Set<Integer> distinctOrders = new HashSet<>(orders);
            String scopeKey = e.getKey().isEmpty() ? null : e.getKey();
            if (distinctOrders.size() != orders.size()) {
                errors.add(new ValidationError("INVALID_SIBLING_ORDERING",
                        "duplicate display_order values among siblings of parent=" + parentLabel, scopeKey));
            } else {
                for (int i = 0; i < orders.size(); i++) {
                    if (orders.get(i) != i + 1) {
                        errors.add(new ValidationError("INVALID_SIBLING_ORDERING",
                                "display_order values among siblings of parent=" + parentLabel
                                        + " are not a gapless 1.." + orders.size() + " sequence", scopeKey));
                        break;
                    }
                }
            }
        }
    }

    // 9: incorrect structural descendant_area_count.
    private void checkDescendantAreaCount(
            List<ValidationNode> nodes, Map<String, List<ValidationNode>> byParent, List<ValidationError> errors) {
        for (ValidationNode n : nodes) {
            int actual = "AREA".equals(n.nodeType()) ? 1 : collectDescendantAreaKeys(n.nodeKey(), byParent).size();
            if (actual != n.descendantAreaCount()) {
                errors.add(new ValidationError("DESCENDANT_COUNT_MISMATCH",
                        "node " + n.nodeKey() + " stores descendant_area_count=" + n.descendantAreaCount()
                                + " but structurally has " + actual, n.nodeKey()));
            }
        }
    }

    // 10: missing required bounds.
    private void checkMissingBounds(List<ValidationNode> nodes, List<ValidationError> errors) {
        for (ValidationNode n : nodes) {
            if (n.centreLat() == null || n.centreLon() == null || n.minLat() == null || n.minLon() == null
                    || n.maxLat() == null || n.maxLon() == null) {
                errors.add(new ValidationError("MISSING_BOUNDS",
                        "node " + n.nodeKey() + " is missing one or more required bounds fields", n.nodeKey()));
            }
        }
    }

    // 11: max-depth violations.
    /**
     * #2086 design.R2c: {@code max_safety_depth} no longer bounds this check (or anything else in
     * generation's decision path — {@link NavigationTreeGenerator#partition} now uses a fixed
     * {@code ABSOLUTE_RECURSION_GUARD} instead). Public depth is a FIXED product contract, capped at
     * {@link #MAX_PUBLIC_DEPTH} (2) regardless of any policy value — the same ceiling {@link
     * #checkHierarchyShape} (#14) already enforces structurally. This check now simply re-asserts
     * {@code depth <= MAX_PUBLIC_DEPTH}; it is kept separate from #14 (rather than folded into it)
     * to preserve its historical {@code MAX_DEPTH_VIOLATION} error code for existing callers, while
     * #14 continues to own the fuller hierarchy-shape story (kind validity, DIRECTION-root ancestry,
     * CLUSTER-only-at-depth-1). {@code maxSafetyDepth} remains a parameter — still read and folded
     * into the policy fingerprint elsewhere for checksum/compat continuity — but is DELIBERATELY
     * UNUSED here: the operator-configurable knob can no longer suppress or loosen the
     * product-fixed public-depth ceiling.
     *
     * <p>This is the fix for the blocker S1 discovered (#2086 PRIORITY 0): the OLD {@code
     * maxSafetyDepth + 1} allowance rejected every depth-2 AREA leaf beneath a CLUSTER whenever
     * {@code maxSafetyDepth} was 0 or 1 — exactly Bangalore's hosted value (0) — which would have
     * failed validation for the very depth-2 {@code City -> Direction -> Local Destination -> AREA}
     * shape #2086 exists to deliver. A depth-2 tree now validates cleanly regardless of {@code
     * maxSafetyDepth}'s value; only depth > {@link #MAX_PUBLIC_DEPTH} (3+) ever fails.
     */
    private void checkMaxDepth(List<ValidationNode> nodes, Integer maxSafetyDepth, List<ValidationError> errors) {
        for (ValidationNode n : nodes) {
            if (n.depth() > MAX_PUBLIC_DEPTH) {
                errors.add(new ValidationError("MAX_DEPTH_VIOLATION",
                        "node " + n.nodeKey() + " has depth=" + n.depth() + " exceeding the max public depth of "
                                + MAX_PUBLIC_DEPTH + " (City -> Direction -> [Local Destination ->] AREA)",
                        n.nodeKey()));
            }
        }
    }

    // 12: orphaned/inconsistent overrides (#1955 Areas PR A, SLICE 2f+2g full semantics) — a
    // STRICT SUPERSET of the V122 DB CHECK/UNIQUE constraints (which only enforce per-kind field
    // shape and per-area/per-node kind uniqueness, never cross-row semantics like "does the target
    // actually exist as the right node type", "is the subject area still active", or "do two
    // overrides on the same area conflict").
    private void checkOverrides(
            Map<String, ValidationNode> byKey, Map<String, List<ValidationNode>> byParent,
            List<NavigationOverride> overrides, Set<String> canonicalAreaKeys, Set<String> validRegionKeys,
            List<ValidationError> errors) {
        if (overrides == null || overrides.isEmpty()) {
            return;
        }

        Set<String> excludedAreas = new HashSet<>();
        for (NavigationOverride o : overrides) {
            if ("EXCLUDE_AREA".equals(o.kind()) && o.subjectAreaKey() != null) {
                excludedAreas.add(o.subjectAreaKey());
            }
        }

        for (NavigationOverride o : overrides) {
            String kind = o.kind();
            if (kind == null) {
                errors.add(new ValidationError("ORPHANED_OVERRIDE", "override has a null kind", null));
                continue;
            }
            switch (kind) {
                case "EXCLUDE_AREA" -> {
                    if (o.subjectAreaKey() == null
                            || (canonicalAreaKeys != null && !canonicalAreaKeys.isEmpty()
                                    && !canonicalAreaKeys.contains(o.subjectAreaKey()))) {
                        errors.add(new ValidationError("ORPHANED_OVERRIDE",
                                "EXCLUDE_AREA override references unknown/inactive area "
                                        + o.subjectAreaKey(), o.subjectAreaKey()));
                    }
                }
                case "REASSIGN_AREA_REGION" -> {
                    if (o.subjectAreaKey() == null
                            || (canonicalAreaKeys != null && !canonicalAreaKeys.isEmpty()
                                    && !canonicalAreaKeys.contains(o.subjectAreaKey()))) {
                        errors.add(new ValidationError("ORPHANED_OVERRIDE",
                                "REASSIGN_AREA_REGION override references unknown/inactive area "
                                        + o.subjectAreaKey(), o.subjectAreaKey()));
                    }
                    if (o.targetRegionKey() == null
                            || (validRegionKeys != null && !validRegionKeys.isEmpty()
                                    && !validRegionKeys.contains(o.targetRegionKey()))) {
                        errors.add(new ValidationError("ORPHANED_OVERRIDE",
                                "REASSIGN_AREA_REGION override targets unknown region "
                                        + o.targetRegionKey(), o.subjectAreaKey()));
                    }
                    if (o.subjectAreaKey() != null && excludedAreas.contains(o.subjectAreaKey())) {
                        errors.add(new ValidationError("CONFLICTING_OVERRIDE",
                                "area " + o.subjectAreaKey()
                                        + " has both an EXCLUDE_AREA and a REASSIGN_AREA_REGION override",
                                o.subjectAreaKey()));
                    }
                }
                case "MOVE_AREA" -> {
                    String areaNodeKey = o.subjectAreaKey() == null ? null : NavigationKeys.areaNodeKey(o.subjectAreaKey());
                    ValidationNode subject = areaNodeKey == null ? null : byKey.get(areaNodeKey);
                    if (subject == null || !"AREA".equals(subject.nodeType())) {
                        errors.add(new ValidationError("ORPHANED_OVERRIDE",
                                "MOVE_AREA override's subject area " + o.subjectAreaKey()
                                        + " has no AREA leaf in the generated tree", o.subjectAreaKey()));
                    }
                    ValidationNode target = o.targetNodeKey() == null ? null : byKey.get(o.targetNodeKey());
                    if (target == null || !"CLUSTER".equals(target.nodeType())) {
                        errors.add(new ValidationError("ORPHANED_OVERRIDE",
                                "MOVE_AREA override's target " + o.targetNodeKey()
                                        + " is not an existing CLUSTER node", o.targetNodeKey()));
                    }
                    if (o.subjectAreaKey() != null && excludedAreas.contains(o.subjectAreaKey())) {
                        errors.add(new ValidationError("CONFLICTING_OVERRIDE",
                                "area " + o.subjectAreaKey() + " has both an EXCLUDE_AREA and a MOVE_AREA override",
                                o.subjectAreaKey()));
                    }
                }
                case "RELABEL" -> {
                    if (o.subjectNodeKey() == null || !byKey.containsKey(o.subjectNodeKey())) {
                        errors.add(new ValidationError("ORPHANED_OVERRIDE",
                                "RELABEL override targets node_key=" + o.subjectNodeKey()
                                        + " which does not exist in the tree", o.subjectNodeKey()));
                    }
                    if (o.newLabel() == null || o.newLabel().isBlank()) {
                        errors.add(new ValidationError("ORPHANED_OVERRIDE",
                                "RELABEL override for node_key=" + o.subjectNodeKey() + " has a blank new_label",
                                o.subjectNodeKey()));
                    }
                }
                case "SET_REPRESENTATIVES" -> {
                    ValidationNode subject = o.subjectNodeKey() == null ? null : byKey.get(o.subjectNodeKey());
                    if (subject == null || !"CLUSTER".equals(subject.nodeType())) {
                        errors.add(new ValidationError("ORPHANED_OVERRIDE",
                                "SET_REPRESENTATIVES override targets node_key=" + o.subjectNodeKey()
                                        + " which is not an existing CLUSTER node", o.subjectNodeKey()));
                    } else {
                        Set<String> descendantAreaKeys = collectDescendantAreaKeys(o.subjectNodeKey(), byParent);
                        List<String> reps = o.newRepresentativeAreaKeys() == null ? List.of() : o.newRepresentativeAreaKeys();
                        for (String rep : reps) {
                            if (!descendantAreaKeys.contains(rep)) {
                                errors.add(new ValidationError("ORPHANED_OVERRIDE",
                                        "SET_REPRESENTATIVES override for " + o.subjectNodeKey()
                                                + " names " + rep + " which is not a descendant area of that cluster",
                                        o.subjectNodeKey()));
                            }
                        }
                    }
                }
                default -> errors.add(new ValidationError("ORPHANED_OVERRIDE",
                        "override has an unrecognized kind=" + kind, o.subjectNodeKey() != null
                                ? o.subjectNodeKey() : o.subjectAreaKey()));
            }
        }
    }

    // 13: direct-search vs guided-navigation ancestry mismatch — a node's stored ancestor_keys
    // must exactly equal the root->parent chain derived by walking parent_node_key (the guided
    // breadcrumb trail must always agree with the structural parent chain a direct-search hit
    // would resolve to).
    private void checkAncestryMismatch(List<ValidationNode> nodes, Map<String, ValidationNode> byKey, List<ValidationError> errors) {
        for (ValidationNode n : nodes) {
            List<String> actual = new ArrayList<>();
            ValidationNode cur = n;
            Set<String> visited = new HashSet<>();
            while (cur.parentNodeKey() != null && visited.add(cur.nodeKey())) {
                ValidationNode parent = byKey.get(cur.parentNodeKey());
                if (parent == null) {
                    break; // already reported as ORPHAN_NODE
                }
                actual.add(0, parent.nodeKey());
                cur = parent;
            }
            if (!actual.equals(n.ancestorKeys())) {
                errors.add(new ValidationError("ANCESTRY_MISMATCH",
                        "node " + n.nodeKey() + " stores ancestor_keys=" + n.ancestorKeys()
                                + " but the actual root->parent chain is " + actual, n.nodeKey()));
            }
        }
    }

    // 14: hierarchy shape (#1956 D6, ADDITIVE — never touches checks #1-13 above). Rejects:
    //  (a) any root node (parent_node_key == null) that is not a DIRECTION — the incident's flat
    //      City -> AREA shape had every AREA sitting at the root;
    //  (b) any AREA/CLUSTER whose ancestry does not begin with a DIRECTION node;
    //  (c) ancestry that disagrees with the node's own region_key — the node's region_key must
    //      match the region_key of its DIRECTION ancestor;
    //  (d) node kinds outside {DIRECTION, CLUSTER, AREA}, and a DIRECTION node ever appearing
    //      anywhere but depth 0;
    //  (e) contract-shape depth ceiling (#1956/#2014 ruling, decided — not a re-litigable design
    //      choice): the locked product contract permits EXACTLY two public shapes — {@code City ->
    //      Direction -> AREA} (depths 0,1) and {@code City -> Direction -> Local Destination ->
    //      AREA} (depths 0,1,2) — and NEVER a third public CLUSTER level, regardless of what the
    //      generator's policy-driven recursion is mechanically capable of producing. This is a
    //      FIXED product rule, INDEPENDENT of check #11 (which enforces the operator-configurable
    //      {@code max_safety_depth} knob) — a tree can pass #11 (policy allows deep recursion) and
    //      still fail #14(e) (the product contract doesn't expose that depth publicly). Enforced
    //      two ways: (i) no node of ANY kind may sit deeper than depth 2; (ii) a CLUSTER may only
    //      ever occupy depth 1 (the single "Local Destination" level) — a CLUSTER at depth >= 2
    //      would itself be a forbidden third public level even before depth 2's AREA-only floor is
    //      reached.
    private static final Set<String> VALID_NODE_KINDS = Set.of("DIRECTION", "CLUSTER", "AREA");
    private static final int MAX_PUBLIC_DEPTH = 2;

    private void checkHierarchyShape(
            List<ValidationNode> nodes, Map<String, ValidationNode> byKey, List<ValidationError> errors) {
        for (ValidationNode n : nodes) {
            if (!VALID_NODE_KINDS.contains(n.nodeType())) {
                errors.add(new ValidationError("INVALID_HIERARCHY_SHAPE",
                        "node " + n.nodeKey() + " has an unrecognized node_type=" + n.nodeType()
                                + " — only DIRECTION, CLUSTER, AREA are valid", n.nodeKey()));
                continue; // an unknown kind can't be reasoned about further below
            }

            // (e) contract-shape depth ceiling — see the class/method javadoc above for why this is
            // independent of check #11's policy-driven max_safety_depth ceiling.
            if (n.depth() > MAX_PUBLIC_DEPTH) {
                errors.add(new ValidationError("INVALID_HIERARCHY_SHAPE",
                        "node " + n.nodeKey() + " has depth=" + n.depth() + " exceeding the max public "
                                + "depth of " + MAX_PUBLIC_DEPTH + " (City -> Direction -> [Local "
                                + "Destination ->] AREA) — no third public CLUSTER level is permitted",
                        n.nodeKey()));
            }
            if ("CLUSTER".equals(n.nodeType()) && n.depth() >= MAX_PUBLIC_DEPTH) {
                errors.add(new ValidationError("INVALID_HIERARCHY_SHAPE",
                        "CLUSTER node " + n.nodeKey() + " is at depth=" + n.depth() + " — a CLUSTER may "
                                + "only occupy depth 1 (the single Local Destination level); a CLUSTER "
                                + "at depth >= " + MAX_PUBLIC_DEPTH + " would be a forbidden third public "
                                + "level", n.nodeKey()));
            }

            boolean isRoot = n.parentNodeKey() == null;
            if (isRoot && !"DIRECTION".equals(n.nodeType())) {
                errors.add(new ValidationError("MISSING_DIRECTION_ANCESTOR",
                        "root node " + n.nodeKey() + " is a " + n.nodeType() + ", but every root of the "
                                + "public navigation tree must be a DIRECTION node (City -> Direction -> ...)",
                        n.nodeKey()));
            }

            if ("DIRECTION".equals(n.nodeType())) {
                if (n.depth() != 0) {
                    errors.add(new ValidationError("INVALID_HIERARCHY_SHAPE",
                            "DIRECTION node " + n.nodeKey() + " has depth=" + n.depth() + ", expected 0",
                            n.nodeKey()));
                }
                continue; // a DIRECTION node has no ancestry/region-consistency of its own to check
            }

            // (b) a non-DIRECTION node's ancestry must begin with a DIRECTION node.
            if (n.ancestorKeys().isEmpty()) {
                errors.add(new ValidationError("MISSING_DIRECTION_ANCESTOR",
                        "node " + n.nodeKey() + " (" + n.nodeType() + ") has no ancestors — every AREA/CLUSTER "
                                + "must descend from a DIRECTION node", n.nodeKey()));
                continue;
            }
            String rootAncestorKey = n.ancestorKeys().get(0);
            ValidationNode rootAncestor = byKey.get(rootAncestorKey);
            if (rootAncestor == null || !"DIRECTION".equals(rootAncestor.nodeType())) {
                errors.add(new ValidationError("MISSING_DIRECTION_ANCESTOR",
                        "node " + n.nodeKey() + "'s root ancestor " + rootAncestorKey
                                + " is not a DIRECTION node", n.nodeKey()));
                continue;
            }

            // (c) ancestry must agree with the node's own region_key.
            if (!Objects.equals(rootAncestor.regionKey(), n.regionKey())) {
                errors.add(new ValidationError("INVALID_HIERARCHY_SHAPE",
                        "node " + n.nodeKey() + " has region_key=" + n.regionKey() + " but its DIRECTION "
                                + "ancestor " + rootAncestorKey + " has region_key=" + rootAncestor.regionKey(),
                        n.nodeKey()));
            }
        }
    }

    // 15: breadth / Local Destination mandate (#2086 AC3/AC5/AC17, ADDITIVE, fail-closed).
    //
    // CRITICAL (qa-fast R-M1): every assertion below reads the PERSISTED {@code
    // n.descendantAreaCount()} — canonical membership INCLUDING zero-listing areas, the exact same
    // source-of-truth check #9 (checkDescendantAreaCount) already verifies structurally. {@link
    // ValidationNode} carries no listing-derived/filter-sensitive count field at all (no
    // matchingAreaCount, no counts-endpoint field), so this check is structurally INCAPABLE of
    // reading anything other than the canonical persisted count — it cannot regress into a
    // filter-sensitive check even by accident (see the dedicated regression test in
    // NavigationTreeValidationServiceTest proving behaviour tracks descendantAreaCount alone).
    private static final int MANDATORY_MAX_CHILDREN = 15;

    // #2086 design.R2f: above this many canonical areas in one first-level group, "<=15 children"
    // and "every Local Destination holds <=15 areas" cannot both hold at the fixed depth-2 shape
    // (City -> Direction -> Local Destination -> AREA). 15 x 15 = 225.
    private static final int GROUP_AREA_CEILING = MANDATORY_MAX_CHILDREN * MANDATORY_MAX_CHILDREN;

    private void checkBreadthMandate(
            List<ValidationNode> nodes, Map<String, List<ValidationNode>> byParent, ValidationMode mode,
            List<ValidationError> errors, List<String> lenientWarnings) {
        for (ValidationNode n : nodes) {
            List<ValidationNode> children = byParent.getOrDefault(n.nodeKey(), List.of());

            // (1) No node — DIRECTION, CLUSTER, or (vacuously) AREA — may have more than 15 children.
            if (children.size() > MANDATORY_MAX_CHILDREN) {
                record(mode, "BREADTH_EXCEEDED",
                        "node " + n.nodeKey() + " (" + n.nodeType() + ") has " + children.size()
                                + " children, exceeding the " + MANDATORY_MAX_CHILDREN + "-child ceiling"
                                + groupCeilingNote(n), n.nodeKey(), errors, lenientWarnings);
            }

            // (2) A node with more canonical areas than the ceiling must expose a Local Destination
            // (CLUSTER) level beneath it — it may never emit a non-CLUSTER (AREA) child directly.
            if (n.descendantAreaCount() > MANDATORY_MAX_CHILDREN
                    && children.stream().anyMatch(c -> !"CLUSTER".equals(c.nodeType()))) {
                record(mode, "MISSING_LOCAL_DESTINATION_LEVEL",
                        "node " + n.nodeKey() + " has descendant_area_count=" + n.descendantAreaCount()
                                + " (> " + MANDATORY_MAX_CHILDREN + ") but has a direct non-CLUSTER child — "
                                + "a Local Destination level is mandatory above this size" + groupCeilingNote(n),
                        n.nodeKey(), errors, lenientWarnings);
            }

            // (3) Every CLUSTER (Local Destination) must itself hold at most 15 canonical areas.
            if ("CLUSTER".equals(n.nodeType()) && n.descendantAreaCount() > MANDATORY_MAX_CHILDREN) {
                record(mode, "LOCAL_DESTINATION_OVERSIZED",
                        "cluster " + n.nodeKey() + " has descendant_area_count=" + n.descendantAreaCount()
                                + ", exceeding the " + MANDATORY_MAX_CHILDREN + "-area Local Destination "
                                + "ceiling", n.nodeKey(), errors, lenientWarnings);
            }
        }
    }

    /**
     * #2086 rework fix (PR #2111 cycle 1): the single choke point every #15/#16 finding routes
     * through. {@link ValidationMode#STRICT} (or any future default) adds a blocking {@link
     * ValidationError} exactly as before this fix. {@link ValidationMode#LENIENT_RUNTIME_LOAD}
     * downgrades the SAME finding to a {@code code: message} entry in {@code lenientWarnings} —
     * the check still runs and still produces the finding, only its severity changes. {@link
     * NavigationGraphLoader} is responsible for logging {@code lenientWarnings} as a WARN naming
     * the city/revision being served — this service has no citySlug/revisionId of its own to log
     * (only the scope-agnostic {@link ValidationNode#scopeId()}).
     */
    private static void record(
            ValidationMode mode, String code, String message, String nodeKey,
            List<ValidationError> errors, List<String> lenientWarnings) {
        if (mode == ValidationMode.LENIENT_RUNTIME_LOAD) {
            lenientWarnings.add(code + ": " + message);
        } else {
            errors.add(new ValidationError(code, message, nodeKey));
        }
    }

    /** #2086 design.R2f: names the region, its canonical area count, and the 225 ceiling whenever a
     * node's own persisted descendant_area_count exceeds it — the exact diagnostic AC17 requires
     * for a first-level group too large to satisfy both the breadth and Local-Destination-size
     * mandates simultaneously at the fixed depth-2 shape. */
    private static String groupCeilingNote(ValidationNode n) {
        if (n.descendantAreaCount() > GROUP_AREA_CEILING) {
            return " — region=" + n.regionKey() + " has " + n.descendantAreaCount() + " canonical areas, "
                    + "exceeding the " + GROUP_AREA_CEILING + "-area (" + MANDATORY_MAX_CHILDREN + "x"
                    + MANDATORY_MAX_CHILDREN + ") ceiling a single first-level group can satisfy at the "
                    + "fixed City -> Direction -> Local Destination -> AREA depth";
        }
        return "";
    }

    // 16: label provenance (#2086 AC6, ADDITIVE, fail-closed, NO wordlist). A node's display_label
    // must be structurally DERIVABLE from its own persisted representative_area_keys: label ∈
    // { name(rep0), name(rep0) + " & " + name(rep1) }. "name(areaKey)" is resolved against the
    // tree's own AREA leaves via displayLabelByNodeKey.get(NavigationKeys.areaNodeKey(areaKey)) —
    // by check #5 every canonical area appears as EXACTLY ONE AREA leaf whose own display_label IS
    // that area's name, so the tree itself (once labels are supplied) already IS the canonical
    // area-name table; no separate lookup table is needed. AREA nodes carry
    // representativeAreaKeys = [their own areaKey] (see NavigationTreeGenerator#emitAreaLeaves), so
    // their own label always resolves to their own name and they pass by construction.
    //
    // MANDATORY EXEMPTION: a node carrying a RELABEL override for this revision is exempt from the
    // reps-derivability judgment below, because NavigationTreeOverrideApplier#applyPostBisection
    // applies RELABEL BEFORE this validation runs (V122:4-9) — without the exemption every curated
    // label would be rejected. SET_REPRESENTATIVES is NOT exempted: it only swaps
    // representativeAreaKeys and leaves display_label untouched, so provenance is expected to hold
    // naturally against the NEW reps for a well-formed override, but is not structurally guaranteed
    // — an override that changes reps without a companion RELABEL can legitimately fail this check,
    // which is correct fail-closed behaviour, not a false positive.
    //
    // #2086 code-review fix (N7): the RELABEL exemption above is scoped to the reps-derivability
    // judgment ONLY — the cheap secondary key-leak guard (label literally equal to node_key/
    // region_key) still applies even to a RELABELed node. A RELABEL override never legitimately
    // sets a node's curated label to its own internal key, so exempting that combination too would
    // let a genuine key-leak slip through disguised as a "curated" label.
    //
    // #2086 code-review fix (N2): applyPostBisection:139-147 places no nodeType filter on RELABEL,
    // unlike SET_REPRESENTATIVES (CLUSTER-gated at :155) — so a RELABEL legally targets an AREA
    // leaf. When it does, that AREA's PARENT resolves its representative name from the AREA's
    // POST-override (curated) label, which the parent's own label was never derived from — a
    // legitimate curated path would otherwise fail check #16 wholesale. Fix: when a node's
    // representative_area_keys resolve to an AREA that itself carries a RELABEL override, the
    // reps-derivability judgment is skipped for that node too — derivability cannot be judged
    // against a name that was itself just curated.
    //
    // displayLabelByNodeKey empty/null => this whole check is a no-op (see the validate() overload
    // javadoc for why: ValidationNode itself carries no label field).
    private void checkLabelProvenance(
            List<ValidationNode> nodes, Map<String, String> displayLabelByNodeKey,
            List<NavigationOverride> overrides, ValidationMode mode,
            List<ValidationError> errors, List<String> lenientWarnings) {
        if (displayLabelByNodeKey == null || displayLabelByNodeKey.isEmpty()) {
            return;
        }

        Set<String> relabeledNodeKeys = new HashSet<>();
        if (overrides != null) {
            for (NavigationOverride o : overrides) {
                if ("RELABEL".equals(o.kind()) && o.subjectNodeKey() != null) {
                    relabeledNodeKeys.add(o.subjectNodeKey());
                }
            }
        }

        // #2086 design.R1 residual_risk / R8 (LOW, non-blocking): two DIRECTIONs in different
        // regions can legitimately derive an identical label — node_key stays unique, so this is a
        // UX wart, not a correctness defect. Collected here, WARNED (never a ValidationError) below.
        Map<String, List<String>> directionNodeKeysByLabel = new LinkedHashMap<>();

        for (ValidationNode n : nodes) {
            String label = displayLabelByNodeKey.get(n.nodeKey());
            if (label == null) {
                continue; // no label data supplied for this node — nothing to judge it against
            }

            if ("DIRECTION".equals(n.nodeType())) {
                directionNodeKeysByLabel.computeIfAbsent(label, k -> new ArrayList<>()).add(n.nodeKey());
            }

            // Cheap secondary guard (design.R3 check_16_label_provenance): a label must never
            // literally equal an internal key — that is always a generator-ID leak, never a real
            // human, area-derived name. #2086 code-review fix (N7): this guard runs BEFORE the
            // RELABEL exemption below and applies even to a RELABELed node — see the javadoc note
            // above.
            if (label.equals(n.nodeKey()) || label.equals(n.regionKey())) {
                record(mode, "LABEL_NOT_DERIVABLE",
                        "node " + n.nodeKey() + " has display_label=\"" + label + "\" equal to its own "
                                + (label.equals(n.nodeKey()) ? "node_key" : "region_key")
                                + " — labels must be human, area-derived names, never internal keys",
                        n.nodeKey(), errors, lenientWarnings);
                continue;
            }

            if (relabeledNodeKeys.contains(n.nodeKey())) {
                continue; // MANDATORY EXEMPTION (reps-derivability only) — see method javadoc above.
            }

            List<String> reps = n.representativeAreaKeys() == null ? List.of() : n.representativeAreaKeys();
            if (reps.isEmpty()) {
                continue; // nothing to derive from — cannot judge; check #7's membership rule and
                          // the generator's own contract are the authorities on reps being present
            }

            // #2086 code-review fix (N2): a representative AREA that itself carries a RELABEL
            // override has a curated (non-generator-derived) label — this node's own label can no
            // longer be judged derivable against that curated name.
            boolean repIsRelabeled = reps.stream()
                    .anyMatch(rep -> relabeledNodeKeys.contains(NavigationKeys.areaNodeKey(rep)));
            if (repIsRelabeled) {
                continue;
            }

            Set<String> candidates = new LinkedHashSet<>();
            String rep0Name = displayLabelByNodeKey.get(NavigationKeys.areaNodeKey(reps.get(0)));
            if (rep0Name != null) {
                candidates.add(rep0Name);
            }
            if (reps.size() >= 2) {
                String rep1Name = displayLabelByNodeKey.get(NavigationKeys.areaNodeKey(reps.get(1)));
                if (rep0Name != null && rep1Name != null) {
                    candidates.add(rep0Name + " & " + rep1Name);
                }
            }
            if (candidates.isEmpty()) {
                continue; // representative area names not resolvable from the supplied map —
                          // cannot judge derivability either way
            }
            if (!candidates.contains(label)) {
                record(mode, "LABEL_NOT_DERIVABLE",
                        "node " + n.nodeKey() + " has display_label=\"" + label + "\" which is not "
                                + "derivable from its own representative_area_keys=" + reps
                                + " (expected one of " + candidates + ")", n.nodeKey(), errors, lenientWarnings);
            }
        }

        for (Map.Entry<String, List<String>> e : directionNodeKeysByLabel.entrySet()) {
            if (e.getValue().size() > 1) {
                log.warn("NavigationTreeValidationService check #16: duplicate DIRECTION display_label "
                                + "\"{}\" shared by {} nodes: {} (non-blocking — node_key stays unique)",
                        e.getKey(), e.getValue().size(), e.getValue());
            }
        }
    }
}
