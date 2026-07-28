package com.example.realestate.discover.navigation;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * D4: DETERMINISTIC RECURSIVE GEOMETRIC LONGEST-AXIS-MEDIAN BISECTION (#1955 Areas PR A).
 *
 * <p><b>Algorithm choice / rationale.</b> Considered alternatives — k-means-style clustering,
 * quad-tree/grid partitioning, greedy nearest-neighbour agglomeration — all either depend on
 * iteration order, randomized seeding, or convergence tolerances (violating the determinism
 * contract below), or on a tunable target-cluster-count that doesn't compose cleanly with a
 * "collapse to leaves when the split isn't meaningful" rule. A binary longest-axis-median
 * bisection is deterministic given one fixed sort, terminates in O(log n) recursion levels, and
 * its accept/reject-a-split decision ({@code one_child_prevention}, {@code min_areas_per_cluster})
 * is simple to reason about and exhaustively test.
 *
 * <p><b>Determinism contract.</b> This class is a PURE function of its geometry+policy inputs —
 * it NEVER reads {@code property_listings} or any other listing-volume signal. Two calls with
 * identical geography + identical {@link GeneratorPolicy} + identical {@code policyFingerprint}
 * always produce an identical output list (node_keys, labels, ordering, bounds, descendant
 * counts), regardless of listing counts, DB row order, or map iteration order — every collection
 * this class touches is explicitly sorted before use.
 *
 * <p><b>Per-node algorithm</b> (see approved-plan.toml D4):
 * <ol>
 *   <li>Pre-sort member areas by their fixed total order (area_key lexicographic).</li>
 *   <li>If the member count fits within {@code max_direct_children}, OR the recursion has hit
 *       {@code max_safety_depth}, emit each member as an AREA leaf and stop.</li>
 *   <li>Otherwise bisect by LONGEST AXIS at the coordinate MEDIAN of member centroids.</li>
 *   <li>If the split would create a one-child cluster (when {@code one_child_prevention}) or any
 *       partition falls below {@code min_areas_per_cluster}, the split is rejected and this node
 *       instead collapses to AREA leaves (step 2's outcome), even though the member count exceeds
 *       {@code max_direct_children}.</li>
 *   <li>Otherwise emit two CLUSTER children and recurse into each at {@code depth + 1}, up to
 *       {@code max_safety_depth}.</li>
 * </ol>
 */
@Component
public class NavigationTreeGenerator {

    /** Deterministic rounding scale for all persisted geometry (~0.11m precision at the equator). */
    private static final int BOUNDS_SCALE = 6;

    /**
     * Generates every region's tree for a city, sharing one node_key-collision-disambiguation set
     * across all regions (node_key uniqueness is scoped to the whole city/revision, not to one
     * region). Regions are processed in CANONICAL display order (#1956 D4 — {@code
     * GeneratorRegionInput#displayOrder}, e.g. CENTRAL/N/E/S/W), ties broken by {@code region_key}
     * for determinism when that canonical order is unavailable/equal (e.g. every region defaulting
     * to 0 via the 2-arg {@link GeneratorRegionInput} constructor). Each region contributes exactly
     * one DIRECTION root node (#1956 D3) — Directions are now the ONLY root nodes, so this is also
     * the sequence its {@code display_order} is numbered in: one shared, gapless 1..N counter
     * across all regions, never restarting per-region.
     */
    public List<GeneratedNode> generateCity(
            List<GeneratorRegionInput> regions, GeneratorPolicy policy,
            String policyFingerprint, Instant generatedAt) {

        List<GeneratorRegionInput> sortedRegions = regions.stream()
                .sorted(Comparator.comparingInt(GeneratorRegionInput::displayOrder)
                        .thenComparing(GeneratorRegionInput::regionKey))
                .toList();

        List<GeneratedNode> out = new ArrayList<>();
        Set<String> usedClusterKeys = new HashSet<>();
        int[] rootOrderCounter = new int[] {1};
        for (GeneratorRegionInput region : sortedRegions) {
            out.addAll(generateRegion(region.regionKey(), region.members(), policy,
                    policyFingerprint, generatedAt, usedClusterKeys, rootOrderCounter, region.displayLabel()));
        }
        return out;
    }

    /**
     * Generates one region's tree. {@code usedClusterKeys} may be shared across regions
     * (city-wide).
     *
     * <p>#1956 D3: emits exactly ONE DIRECTION node at depth 0 ({@code parentNodeKey = null},
     * {@code ancestorKeys = []}) — the region's public entry point — then expands the region's
     * members BENEATH it starting at depth 1 ({@code parentNodeKey} = the DIRECTION's node_key,
     * {@code ancestorKeys = [directionKey]}). An empty member list emits NOTHING (no dead-end
     * Direction with zero children — #1956 D7: an area absent from {@code
     * city_region_memberships} never reaches the generator in the first place, and a region with
     * no members at all has no public reason to exist as a root).
     */
    public List<GeneratedNode> generateRegion(
            String regionKey, List<GeneratorArea> members, GeneratorPolicy policy,
            String policyFingerprint, Instant generatedAt, Set<String> usedClusterKeys) {
        return generateRegion(regionKey, members, policy, policyFingerprint, generatedAt,
                usedClusterKeys, new int[] {1}, regionKey);
    }

    /**
     * Same as {@link #generateRegion(String, List, GeneratorPolicy, String, Instant, Set)} but
     * threading a shared, mutable DIRECTION-root display_order counter so that {@link
     * #generateCity} can number every region's Direction city-wide instead of restarting at 1 per
     * region, and an explicit {@code regionDisplayLabel} (the DIRECTION node's own label — #1956
     * D3) rather than defaulting to the region_key.
     */
    private List<GeneratedNode> generateRegion(
            String regionKey, List<GeneratorArea> members, GeneratorPolicy policy,
            String policyFingerprint, Instant generatedAt, Set<String> usedClusterKeys,
            int[] rootOrderCounter, String regionDisplayLabel) {

        List<GeneratorArea> sortedMembers = members.stream()
                .sorted(Comparator.comparing(GeneratorArea::areaKey))
                .toList();

        List<GeneratedNode> out = new ArrayList<>();
        if (sortedMembers.isEmpty()) {
            return out;
        }

        String directionKey = NavigationKeys.directionNodeKey(regionKey);
        List<String> reps = selectRepresentatives(sortedMembers, policy);
        Bounds bounds = computeBounds(sortedMembers);
        int order = rootOrderCounter[0]++;

        out.add(new GeneratedNode(
                regionKey, "DIRECTION", directionKey, null, null, reps, regionDisplayLabel, order, 0,
                List.of(), sortedMembers.size(),
                bounds.centreLat(), bounds.centreLon(), bounds.minLat(), bounds.minLon(),
                bounds.maxLat(), bounds.maxLon(), policyFingerprint, generatedAt));

        expand(regionKey, sortedMembers, 1, List.of(directionKey), directionKey, policy,
                policyFingerprint, generatedAt, usedClusterKeys, out);
        return out;
    }

    /**
     * Recursively expands {@code members} beneath {@code parentNodeKey} (always non-null here —
     * the DIRECTION root is emitted once by {@link #generateRegion}, never by this method).
     * {@code depth} counts from the DIRECTION's depth 0, so the CLUSTER-level safety ceiling
     * ({@code max_safety_depth}, #1956 D5 — "how many CLUSTER levels may nest beneath a
     * Direction") is compared against {@code depth - 1} ("cluster depth"), not {@code depth}
     * itself, keeping the knob's real-world meaning identical to before this DIRECTION wrapper was
     * introduced: {@code max_safety_depth} CLUSTER levels are still allowed regardless of the
     * extra Direction level now sitting above them.
     */
    private void expand(
            String regionKey, List<GeneratorArea> members, int depth, List<String> ancestorKeys,
            String parentNodeKey, GeneratorPolicy policy, String policyFingerprint, Instant generatedAt,
            Set<String> usedClusterKeys, List<GeneratedNode> out) {

        if (members.isEmpty()) {
            return;
        }

        int clusterDepth = depth - 1;
        boolean mustLeaf = members.size() <= policy.maxDirectChildren() || clusterDepth >= policy.maxSafetyDepth();
        if (!mustLeaf) {
            Partition partition = bisect(members);
            boolean rejectSplit = (policy.oneChildPrevention()
                    && (partition.first().size() == 1 || partition.second().size() == 1))
                    || partition.first().size() < policy.minAreasPerCluster()
                    || partition.second().size() < policy.minAreasPerCluster();

            if (!rejectSplit) {
                int localOrder = 1;
                for (List<GeneratorArea> part : List.of(partition.first(), partition.second())) {
                    int order = localOrder++;
                    List<String> reps = selectRepresentatives(part, policy);
                    String clusterKey = deriveClusterNodeKey(regionKey, part, reps, usedClusterKeys);
                    usedClusterKeys.add(clusterKey);
                    String label = deriveLabel(part, reps);
                    Bounds bounds = computeBounds(part);

                    out.add(new GeneratedNode(
                            regionKey, "CLUSTER", clusterKey, parentNodeKey, null, reps, label, order,
                            depth, ancestorKeys, part.size(),
                            bounds.centreLat(), bounds.centreLon(), bounds.minLat(), bounds.minLon(),
                            bounds.maxLat(), bounds.maxLon(), policyFingerprint, generatedAt));

                    List<String> childAncestors = new ArrayList<>(ancestorKeys);
                    childAncestors.add(clusterKey);
                    expand(regionKey, part, depth + 1, List.copyOf(childAncestors), clusterKey,
                            policy, policyFingerprint, generatedAt, usedClusterKeys, out);
                }
                return;
            }
            // fall through: split rejected, collapse to AREA leaves below.
        }

        int localOrder = 1;
        for (GeneratorArea area : members) {
            int order = localOrder++;
            Bounds bounds = new Bounds(
                    round(area.centreLat()), round(area.centreLon()),
                    round(area.minLat()), round(area.minLon()),
                    round(area.maxLat()), round(area.maxLon()));
            out.add(new GeneratedNode(
                    regionKey, "AREA", NavigationKeys.areaNodeKey(area.areaKey()), parentNodeKey,
                    area.areaKey(), List.of(area.areaKey()), area.name(), order, depth, ancestorKeys, 1,
                    bounds.centreLat(), bounds.centreLon(), bounds.minLat(), bounds.minLon(),
                    bounds.maxLat(), bounds.maxLon(), policyFingerprint, generatedAt));
        }
    }

    // ── Bisection ────────────────────────────────────────────────────────────────────────────

    private Partition bisect(List<GeneratorArea> members) {
        BigDecimal latRange = range(members, GeneratorArea::centreLat);
        BigDecimal lonRange = range(members, GeneratorArea::centreLon);
        // Fixed tie-break: LAT wins a tie, so equal ranges always split the same way.
        boolean useLat = latRange.compareTo(lonRange) >= 0;

        Comparator<GeneratorArea> axisOrder = (useLat
                ? Comparator.comparing(GeneratorArea::centreLat)
                : Comparator.comparing(GeneratorArea::centreLon))
                .thenComparing(GeneratorArea::areaKey);

        List<GeneratorArea> sortedByAxis = members.stream().sorted(axisOrder).toList();
        int mid = sortedByAxis.size() / 2;

        List<GeneratorArea> first = reorderByAreaKey(sortedByAxis.subList(0, mid));
        List<GeneratorArea> second = reorderByAreaKey(sortedByAxis.subList(mid, sortedByAxis.size()));
        return new Partition(first, second);
    }

    private static List<GeneratorArea> reorderByAreaKey(List<GeneratorArea> members) {
        return members.stream().sorted(Comparator.comparing(GeneratorArea::areaKey)).toList();
    }

    private static BigDecimal range(List<GeneratorArea> members, Function<GeneratorArea, BigDecimal> axis) {
        BigDecimal min = members.stream().map(axis).min(Comparator.naturalOrder()).orElse(BigDecimal.ZERO);
        BigDecimal max = members.stream().map(axis).max(Comparator.naturalOrder()).orElse(BigDecimal.ZERO);
        return max.subtract(min);
    }

    private record Partition(List<GeneratorArea> first, List<GeneratorArea> second) {
    }

    // ── Representatives / labels ────────────────────────────────────────────────────────────

    /**
     * Only {@code CENTROID_NEAREST} is implemented: the 1-2 members nearest the partition's
     * centroid, deterministic lexicographic (area_key) tie-break. {@link
     * GeneratorPolicy#representativeSelection()} is read and folded into the policy_fingerprint
     * regardless of value, but any value currently resolves to this one strategy — a documented
     * placeholder-knob limitation (see V121 migration comment: "PLACEHOLDER DEFAULT").
     */
    // Package-private (not public API) solely so NavigationTreeGeneratorTest can exercise the
    // representative-selection tie-break directly without contorting a full recursive tree.
    List<String> selectRepresentatives(List<GeneratorArea> members, GeneratorPolicy policy) {
        if (members.size() == 1) {
            return List.of(members.get(0).areaKey());
        }
        Bounds bounds = computeBounds(members);
        List<GeneratorArea> byDistance = members.stream()
                .sorted(Comparator
                        .comparing((GeneratorArea a) -> distanceSquared(a, bounds.centreLat(), bounds.centreLon()))
                        .thenComparing(GeneratorArea::areaKey))
                .toList();

        int repCount = Math.min(2, byDistance.size());
        return byDistance.subList(0, repCount).stream()
                .map(GeneratorArea::areaKey)
                .sorted()
                .toList();
    }

    private static BigDecimal distanceSquared(GeneratorArea a, BigDecimal centreLat, BigDecimal centreLon) {
        BigDecimal dLat = a.centreLat().subtract(centreLat);
        BigDecimal dLon = a.centreLon().subtract(centreLon);
        return dLat.multiply(dLat).add(dLon.multiply(dLon));
    }

    /** Label built purely from representative area names — no invented marketing copy. */
    private String deriveLabel(List<GeneratorArea> members, List<String> repAreaKeys) {
        var nameByKey = members.stream()
                .collect(Collectors.toMap(GeneratorArea::areaKey, GeneratorArea::name, (a, b) -> a));
        List<String> names = repAreaKeys.stream().map(nameByKey::get).filter(Objects::nonNull).toList();
        if (names.isEmpty()) {
            return "Area";
        }
        if (names.size() == 1) {
            return names.get(0);
        }
        return names.get(0) + " & " + names.get(1);
    }

    /**
     * D5 node_key with collision disambiguation: the base key is {@code
     * NavigationKeys#clusterNodeKeyBase}; if already used (within this city/revision), it is
     * deterministically extended by appending, one at a time, the lexicographically-least
     * additional member area_key not already part of the representative set, until unique.
     */
    private String deriveClusterNodeKey(
            String regionKey, List<GeneratorArea> members, List<String> reps, Set<String> usedClusterKeys) {

        String base = NavigationKeys.clusterNodeKeyBase(regionKey, reps);
        if (!usedClusterKeys.contains(base)) {
            return base;
        }

        List<String> remaining = members.stream()
                .map(GeneratorArea::areaKey)
                .filter(k -> !reps.contains(k))
                .sorted()
                .toList();

        List<String> extended = new ArrayList<>(reps);
        for (String extra : remaining) {
            extended.add(extra);
            List<String> sortedExtended = extended.stream().sorted().toList();
            String candidate = NavigationKeys.clusterNodeKeyBase(regionKey, sortedExtended);
            if (!usedClusterKeys.contains(candidate)) {
                return candidate;
            }
        }

        // Exhausted every member and still colliding is structurally impossible (two distinct
        // clusters cannot share an identical full member set) — fail loudly rather than emit a dup.
        throw new IllegalStateException("Unable to derive a unique node_key for a cluster in region="
                + regionKey + " after exhausting all " + members.size() + " member area_keys");
    }

    // ── Geometry ─────────────────────────────────────────────────────────────────────────────

    private Bounds computeBounds(List<GeneratorArea> members) {
        BigDecimal sumLat = BigDecimal.ZERO;
        BigDecimal sumLon = BigDecimal.ZERO;
        BigDecimal minLat = null;
        BigDecimal minLon = null;
        BigDecimal maxLat = null;
        BigDecimal maxLon = null;
        for (GeneratorArea a : members) {
            sumLat = sumLat.add(a.centreLat());
            sumLon = sumLon.add(a.centreLon());
            minLat = minLat == null ? a.minLat() : minLat.min(a.minLat());
            minLon = minLon == null ? a.minLon() : minLon.min(a.minLon());
            maxLat = maxLat == null ? a.maxLat() : maxLat.max(a.maxLat());
            maxLon = maxLon == null ? a.maxLon() : maxLon.max(a.maxLon());
        }
        BigDecimal count = BigDecimal.valueOf(members.size());
        BigDecimal centreLat = sumLat.divide(count, BOUNDS_SCALE + 4, RoundingMode.HALF_UP);
        BigDecimal centreLon = sumLon.divide(count, BOUNDS_SCALE + 4, RoundingMode.HALF_UP);
        return new Bounds(round(centreLat), round(centreLon), round(minLat), round(minLon), round(maxLat), round(maxLon));
    }

    private static BigDecimal round(BigDecimal v) {
        return v == null ? null : v.setScale(BOUNDS_SCALE, RoundingMode.HALF_UP);
    }

    private record Bounds(
            BigDecimal centreLat, BigDecimal centreLon,
            BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon) {
    }
}
