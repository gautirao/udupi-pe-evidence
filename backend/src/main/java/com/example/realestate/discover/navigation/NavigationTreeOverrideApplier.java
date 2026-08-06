package com.example.realestate.discover.navigation;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Applies controlled-override inputs to a navigation-tree GENERATION pipeline (#1955 Areas PR A,
 * SLICE 2f+2g, Model A). Pure — no I/O, no Spring transaction, no DB access — so the exact same
 * transform runs identically given identical inputs (the determinism contract this class must
 * preserve end-to-end with {@link NavigationTreeGenerator}).
 *
 * <p>Two phases, matching where in the pipeline each override kind's effect belongs:
 * <ul>
 *   <li>{@link #applyPreBisection} — EXCLUDE_AREA then REASSIGN_AREA_REGION, each sorted by
 *       {@code subjectAreaKey} — mutates the region membership lists fed into {@link
 *       NavigationTreeGenerator}, so an excluded/reassigned area participates in bisection
 *       exactly like a real geography change would.</li>
 *   <li>{@link #applyPostBisection} — MOVE_AREA (sorted {@code targetNodeKey, subjectAreaKey}),
 *       then RELABEL/SET_REPRESENTATIVES (sorted {@code subjectNodeKey}) — mutates the ALREADY
 *       GENERATED tree. A MOVE_AREA is a surgical detach/reattach of one AREA leaf, followed by a
 *       full structural recompute (depth, ancestor_keys, descendant_area_count, bounds, sibling
 *       display_order) — see {@link #rebuildAfterMoves}. RELABEL/SET_REPRESENTATIVES are pure
     *   field edits applied after any moves.</li>
 * </ul>
 *
 * <p>Every override this class cannot structurally apply (an unknown subject/target — e.g. a
 * REASSIGN_AREA_REGION naming a nonexistent region, or a MOVE_AREA naming a non-CLUSTER target)
 * is silently SKIPPED here rather than thrown — {@link NavigationTreeValidationService#validate}
 * (check #12) is the sole authority that turns such an override into a BLOCKING finding; this
 * class never partially "fixes" or invents structure to make an inconsistent override succeed.
 */
@Component
public class NavigationTreeOverrideApplier {

    private static final int BOUNDS_SCALE = 6;

    // ── Pre-bisection: EXCLUDE_AREA, REASSIGN_AREA_REGION ───────────────────────────────────────

    public List<GeneratorRegionInput> applyPreBisection(
            List<GeneratorRegionInput> regions, List<NavigationOverride> overrides) {
        if (overrides == null || overrides.isEmpty()) {
            return regions;
        }

        Map<String, List<GeneratorArea>> membersByRegion = new LinkedHashMap<>();
        Map<String, GeneratorArea> areaByKey = new LinkedHashMap<>();
        // #1956 D4: preserved so the reconstruction below never loses a region's canonical
        // displayOrder/displayLabel — every key membersByRegion ends up with was seeded from this
        // same regions list, so this lookup is always non-null at reconstruction time.
        Map<String, GeneratorRegionInput> originalByRegionKey = new LinkedHashMap<>();
        for (GeneratorRegionInput r : regions) {
            List<GeneratorArea> members = new ArrayList<>(r.members());
            membersByRegion.put(r.regionKey(), members);
            originalByRegionKey.put(r.regionKey(), r);
            for (GeneratorArea a : members) {
                areaByKey.put(a.areaKey(), a);
            }
        }

        overrides.stream()
                .filter(o -> "EXCLUDE_AREA".equals(o.kind()) && o.subjectAreaKey() != null)
                .sorted(Comparator.comparing(NavigationOverride::subjectAreaKey))
                .forEach(o -> membersByRegion.values()
                        .forEach(list -> list.removeIf(a -> a.areaKey().equals(o.subjectAreaKey()))));

        overrides.stream()
                .filter(o -> "REASSIGN_AREA_REGION".equals(o.kind()) && o.subjectAreaKey() != null)
                .sorted(Comparator.comparing(NavigationOverride::subjectAreaKey))
                .forEach(o -> {
                    GeneratorArea area = areaByKey.get(o.subjectAreaKey());
                    List<GeneratorArea> target = membersByRegion.get(o.targetRegionKey());
                    if (area == null || target == null) {
                        return; // inconsistent — flagged by NavigationTreeValidationService check #12
                    }
                    boolean wasPresent = membersByRegion.values().stream()
                            .anyMatch(list -> list.removeIf(a -> a.areaKey().equals(o.subjectAreaKey())));
                    if (wasPresent) {
                        target.add(area);
                    }
                });

        return membersByRegion.entrySet().stream()
                .map(e -> {
                    GeneratorRegionInput original = originalByRegionKey.get(e.getKey());
                    int displayOrder = original != null ? original.displayOrder() : 0;
                    String displayLabel = original != null ? original.displayLabel() : e.getKey();
                    return new GeneratorRegionInput(e.getKey(), e.getValue(), displayOrder, displayLabel);
                })
                .toList();
    }

    // ── Post-bisection: MOVE_AREA, RELABEL, SET_REPRESENTATIVES ────────────────────────────────

    public List<GeneratedNode> applyPostBisection(List<GeneratedNode> generated, List<NavigationOverride> overrides) {
        if (overrides == null || overrides.isEmpty()) {
            return generated;
        }

        Map<String, GeneratedNode> byKey = new LinkedHashMap<>();
        for (GeneratedNode n : generated) {
            byKey.put(n.nodeKey(), n);
        }
        Map<String, String> parentOf = new LinkedHashMap<>();
        for (GeneratedNode n : generated) {
            parentOf.put(n.nodeKey(), n.parentNodeKey());
        }

        boolean[] anyMove = {false};
        overrides.stream()
                .filter(o -> "MOVE_AREA".equals(o.kind()) && o.subjectAreaKey() != null && o.targetNodeKey() != null)
                .sorted(Comparator.comparing(NavigationOverride::targetNodeKey)
                        .thenComparing(NavigationOverride::subjectAreaKey))
                .forEach(o -> {
                    String areaNodeKey = NavigationKeys.areaNodeKey(o.subjectAreaKey());
                    GeneratedNode areaNode = byKey.get(areaNodeKey);
                    GeneratedNode target = byKey.get(o.targetNodeKey());
                    if (areaNode == null || !"AREA".equals(areaNode.nodeType())
                            || target == null || !"CLUSTER".equals(target.nodeType())) {
                        return; // inconsistent — flagged by check #12
                    }
                    parentOf.put(areaNodeKey, o.targetNodeKey());
                    anyMove[0] = true;
                });

        Map<String, GeneratedNode> working = anyMove[0]
                ? rebuildAfterMoves(byKey, parentOf)
                : new LinkedHashMap<>(byKey);

        overrides.stream()
                .filter(o -> "RELABEL".equals(o.kind()) && o.subjectNodeKey() != null && o.newLabel() != null)
                .sorted(Comparator.comparing(NavigationOverride::subjectNodeKey))
                .forEach(o -> {
                    GeneratedNode n = working.get(o.subjectNodeKey());
                    if (n != null) {
                        working.put(n.nodeKey(), withLabel(n, o.newLabel()));
                    }
                });

        overrides.stream()
                .filter(o -> "SET_REPRESENTATIVES".equals(o.kind()) && o.subjectNodeKey() != null
                        && o.newRepresentativeAreaKeys() != null)
                .sorted(Comparator.comparing(NavigationOverride::subjectNodeKey))
                .forEach(o -> {
                    GeneratedNode n = working.get(o.subjectNodeKey());
                    if (n != null && "CLUSTER".equals(n.nodeType())) {
                        working.put(n.nodeKey(), withRepresentatives(n, o.newRepresentativeAreaKeys()));
                    }
                });

        return List.copyOf(working.values());
    }

    // ── Structural recompute after one or more MOVE_AREA reparentings ──────────────────────────

    private Map<String, GeneratedNode> rebuildAfterMoves(Map<String, GeneratedNode> byKey, Map<String, String> parentOf) {
        Map<String, List<String>> childrenByParent = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : parentOf.entrySet()) {
            String parentKey = e.getValue() == null ? "" : e.getValue();
            childrenByParent.computeIfAbsent(parentKey, k -> new ArrayList<>()).add(e.getKey());
        }
        // Deterministic sibling order after a structural change: lexicographic by node_key.
        childrenByParent.values().forEach(kids -> kids.sort(Comparator.naturalOrder()));

        Map<String, Integer> depthOf = new LinkedHashMap<>();
        Map<String, List<String>> ancestorsOf = new LinkedHashMap<>();
        for (String root : childrenByParent.getOrDefault("", List.of())) {
            depthOf.put(root, 0);
            ancestorsOf.put(root, List.of());
        }
        Deque<String> queue = new ArrayDeque<>(childrenByParent.getOrDefault("", List.of()));
        while (!queue.isEmpty()) {
            String cur = queue.poll();
            int depth = depthOf.get(cur);
            List<String> ancestry = ancestorsOf.get(cur);
            for (String child : childrenByParent.getOrDefault(cur, List.of())) {
                depthOf.put(child, depth + 1);
                List<String> childAncestry = new ArrayList<>(ancestry);
                childAncestry.add(cur);
                ancestorsOf.put(child, List.copyOf(childAncestry));
                queue.add(child);
            }
        }

        Map<String, Integer> areaLeafCount = new LinkedHashMap<>();
        Map<String, BigDecimal> sumLat = new LinkedHashMap<>();
        Map<String, BigDecimal> sumLon = new LinkedHashMap<>();
        Map<String, BigDecimal> minLat = new LinkedHashMap<>();
        Map<String, BigDecimal> minLon = new LinkedHashMap<>();
        Map<String, BigDecimal> maxLat = new LinkedHashMap<>();
        Map<String, BigDecimal> maxLon = new LinkedHashMap<>();
        postOrderAccumulate(childrenByParent, "", byKey, areaLeafCount, sumLat, sumLon, minLat, minLon, maxLat, maxLon);

        Map<String, GeneratedNode> out = new LinkedHashMap<>();
        for (String key : parentOf.keySet()) {
            GeneratedNode orig = byKey.get(key);
            String parentKey = parentOf.get(key);
            List<String> siblings = childrenByParent.get(parentKey == null ? "" : parentKey);
            int order = siblings.indexOf(key) + 1;

            BigDecimal centreLat;
            BigDecimal centreLon;
            BigDecimal boundMinLat;
            BigDecimal boundMinLon;
            BigDecimal boundMaxLat;
            BigDecimal boundMaxLon;
            if ("AREA".equals(orig.nodeType())) {
                centreLat = orig.centreLat();
                centreLon = orig.centreLon();
                boundMinLat = orig.minLat();
                boundMinLon = orig.minLon();
                boundMaxLat = orig.maxLat();
                boundMaxLon = orig.maxLon();
            } else {
                int count = areaLeafCount.get(key);
                if (count == 0) {
                    // A MOVE_AREA override can drain every descendant AREA leaf out of a
                    // CLUSTER/REGION, leaving it with zero remaining leaves. There is no
                    // sensible centroid/bounds to recompute in that state, and dividing by
                    // zero here would throw ArithmeticException before
                    // NavigationTreeValidationService.validate() ever runs. Retain the node's
                    // prior centre/bounds unchanged and let validation (empty-branch /
                    // area-conservation / one-child checks) turn this into the intended
                    // BLOCKING finding instead of a 500.
                    centreLat = orig.centreLat();
                    centreLon = orig.centreLon();
                    boundMinLat = orig.minLat();
                    boundMinLon = orig.minLon();
                    boundMaxLat = orig.maxLat();
                    boundMaxLon = orig.maxLon();
                } else {
                    centreLat = round(sumLat.get(key).divide(BigDecimal.valueOf(count), BOUNDS_SCALE + 4, RoundingMode.HALF_UP));
                    centreLon = round(sumLon.get(key).divide(BigDecimal.valueOf(count), BOUNDS_SCALE + 4, RoundingMode.HALF_UP));
                    boundMinLat = minLat.get(key);
                    boundMinLon = minLon.get(key);
                    boundMaxLat = maxLat.get(key);
                    boundMaxLon = maxLon.get(key);
                }
            }

            // #2086 code-review fix (BLOCKING): bearingDegrees is left as a PLACEHOLDER (null) here
            // — it is recomputed for every node in a second pass below (see recomputeBearings),
            // once every node's new centreLat/centreLon (computed just above, in this same loop)
            // is available. It cannot be computed correctly inline here: a MOVE_AREA reparenting
            // shifts BOTH the source and target CLUSTER/DIRECTION's centres, so every remaining
            // sibling of the source AND target — not just the moved node itself — needs a
            // refreshed bearing against its parent's freshly-computed centre, and a node's own
            // parent may not have finished computing its final centre yet at this point in the
            // iteration.
            out.put(key, new GeneratedNode(
                    orig.regionKey(), orig.nodeType(), orig.nodeKey(), parentKey, orig.areaKey(),
                    orig.representativeAreaKeys(), orig.displayLabel(), order, depthOf.get(key),
                    ancestorsOf.get(key), "AREA".equals(orig.nodeType()) ? 1 : areaLeafCount.get(key),
                    centreLat, centreLon, boundMinLat, boundMinLon, boundMaxLat, boundMaxLon,
                    null, orig.policyFingerprint(), orig.generatedAt()));
        }
        return recomputeBearings(out, parentOf);
    }

    // #2086 code-review fix (BLOCKING, data integrity): recomputes bearingDegrees for EVERY node
    // with a non-null parent, from that parent's FRESHLY-COMPUTED centre (the fold above has
    // already finished computing every node's new centreLat/centreLon before this runs). The blast
    // radius of a MOVE_AREA is wider than the moved node alone — when an area moves from cluster A
    // to cluster B, BOTH A's and B's centres shift, so every remaining child of A and every child
    // of B (not just the moved node) needs a refreshed bearing. A node with no parent (a depth-0
    // DIRECTION root) keeps bearingDegrees = null, matching design.R4's generator contract.
    private Map<String, GeneratedNode> recomputeBearings(Map<String, GeneratedNode> nodes, Map<String, String> parentOf) {
        Map<String, GeneratedNode> result = new LinkedHashMap<>();
        for (Map.Entry<String, GeneratedNode> e : nodes.entrySet()) {
            GeneratedNode n = e.getValue();
            String parentKey = parentOf.get(e.getKey());
            BigDecimal bearing = null;
            if (parentKey != null) {
                GeneratedNode parent = nodes.get(parentKey);
                if (parent != null) {
                    bearing = NavigationTreeGenerator.computeBearingDegrees(
                            parent.centreLat(), parent.centreLon(), n.centreLat(), n.centreLon());
                }
            }
            result.put(e.getKey(), withBearing(n, bearing));
        }
        return result;
    }

    private static GeneratedNode withBearing(GeneratedNode n, BigDecimal bearingDegrees) {
        return new GeneratedNode(
                n.regionKey(), n.nodeType(), n.nodeKey(), n.parentNodeKey(), n.areaKey(),
                n.representativeAreaKeys(), n.displayLabel(), n.displayOrder(), n.depth(), n.ancestorKeys(),
                n.descendantAreaCount(), n.centreLat(), n.centreLon(), n.minLat(), n.minLon(), n.maxLat(), n.maxLon(),
                bearingDegrees, n.policyFingerprint(), n.generatedAt());
    }

    private void postOrderAccumulate(
            Map<String, List<String>> childrenByParent, String parentKey, Map<String, GeneratedNode> byKey,
            Map<String, Integer> areaLeafCount, Map<String, BigDecimal> sumLat, Map<String, BigDecimal> sumLon,
            Map<String, BigDecimal> minLat, Map<String, BigDecimal> minLon,
            Map<String, BigDecimal> maxLat, Map<String, BigDecimal> maxLon) {
        for (String key : childrenByParent.getOrDefault(parentKey, List.of())) {
            GeneratedNode node = byKey.get(key);
            if ("AREA".equals(node.nodeType())) {
                areaLeafCount.put(key, 1);
                sumLat.put(key, node.centreLat());
                sumLon.put(key, node.centreLon());
                minLat.put(key, node.minLat());
                minLon.put(key, node.minLon());
                maxLat.put(key, node.maxLat());
                maxLon.put(key, node.maxLon());
                continue;
            }
            postOrderAccumulate(childrenByParent, key, byKey, areaLeafCount, sumLat, sumLon, minLat, minLon, maxLat, maxLon);
            int count = 0;
            BigDecimal sLat = BigDecimal.ZERO;
            BigDecimal sLon = BigDecimal.ZERO;
            BigDecimal mnLat = null;
            BigDecimal mnLon = null;
            BigDecimal mxLat = null;
            BigDecimal mxLon = null;
            for (String child : childrenByParent.getOrDefault(key, List.of())) {
                count += areaLeafCount.get(child);
                sLat = sLat.add(sumLat.get(child));
                sLon = sLon.add(sumLon.get(child));
                mnLat = mnLat == null ? minLat.get(child) : mnLat.min(minLat.get(child));
                mnLon = mnLon == null ? minLon.get(child) : mnLon.min(minLon.get(child));
                mxLat = mxLat == null ? maxLat.get(child) : mxLat.max(maxLat.get(child));
                mxLon = mxLon == null ? maxLon.get(child) : mxLon.max(maxLon.get(child));
            }
            areaLeafCount.put(key, count);
            sumLat.put(key, sLat);
            sumLon.put(key, sLon);
            minLat.put(key, mnLat);
            minLon.put(key, mnLon);
            maxLat.put(key, mxLat);
            maxLon.put(key, mxLon);
        }
    }

    private static BigDecimal round(BigDecimal v) {
        return v == null ? null : v.setScale(BOUNDS_SCALE, RoundingMode.HALF_UP);
    }

    private static GeneratedNode withLabel(GeneratedNode n, String newLabel) {
        return new GeneratedNode(
                n.regionKey(), n.nodeType(), n.nodeKey(), n.parentNodeKey(), n.areaKey(),
                n.representativeAreaKeys(), newLabel, n.displayOrder(), n.depth(), n.ancestorKeys(),
                n.descendantAreaCount(), n.centreLat(), n.centreLon(), n.minLat(), n.minLon(), n.maxLat(), n.maxLon(),
                n.bearingDegrees(), n.policyFingerprint(), n.generatedAt());
    }

    private static GeneratedNode withRepresentatives(GeneratedNode n, List<String> newRepresentativeAreaKeys) {
        return new GeneratedNode(
                n.regionKey(), n.nodeType(), n.nodeKey(), n.parentNodeKey(), n.areaKey(),
                List.copyOf(newRepresentativeAreaKeys), n.displayLabel(), n.displayOrder(), n.depth(), n.ancestorKeys(),
                n.descendantAreaCount(), n.centreLat(), n.centreLon(), n.minLat(), n.minLon(), n.maxLat(), n.maxLon(),
                n.bearingDegrees(), n.policyFingerprint(), n.generatedAt());
    }
}
