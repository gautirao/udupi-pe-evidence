package com.example.realestate.discover.navigation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 * D4: DETERMINISTIC GEOMETRIC LONGEST-AXIS-MEDIAN BISECTION, PARTITION-THEN-EMIT (#2033 fix of
 * #1955 Areas PR A).
 *
 * <p><b>Algorithm choice / rationale.</b> Considered alternatives — k-means-style clustering,
 * quad-tree/grid partitioning, greedy nearest-neighbour agglomeration — all either depend on
 * iteration order, randomized seeding, or convergence tolerances (violating the determinism
 * contract below), or on a tunable target-cluster-count that doesn't compose cleanly with a
 * "collapse to leaves when the split isn't meaningful" rule. A binary longest-axis-median
 * bisection is deterministic given one fixed sort, terminates in O(log n) internal bisection
 * levels, and its accept/reject-a-split decision ({@code one_child_prevention}, {@code
 * min_areas_per_cluster}) is simple to reason about and exhaustively test.
 *
 * <p><b>Determinism contract.</b> This class is a PURE function of its geometry+policy inputs —
 * it NEVER reads {@code property_listings} or any other listing-volume signal. Two calls with
 * identical geography + identical {@link GeneratorPolicy} + identical {@code policyFingerprint}
 * always produce an identical output list (node_keys, labels, ordering, bounds, descendant
 * counts), regardless of listing counts, DB row order, or map iteration order — every collection
 * this class touches is explicitly sorted before use.
 *
 * <p><b>Public shape is fixed at <= 2 levels beneath the city root, by construction.</b> The
 * hierarchy the validator (see {@code NavigationTreeValidationService} check #14,
 * {@code MAX_PUBLIC_DEPTH = 2}) permits is exactly {@code City -> Direction -> AREA} (depths 0, 1)
 * or {@code City -> Direction -> CLUSTER -> AREA} (depths 0, 1, 2); CLUSTER may occupy ONLY depth
 * 1. To guarantee this for every policy input, node emission is split into two phases:
 * <ol>
 *   <li>{@link #partition(List, int, GeneratorPolicy)} — a PURE, internally-recursive function
 *       that only computes a flat list of member "buckets" (no node emission, no node_keys, no
 *       depth). It bisects by LONGEST AXIS at the coordinate MEDIAN of member centroids, rejecting
 *       a split (and returning the members as a single bucket) whenever it would create a
 *       one-child bucket (when {@code one_child_prevention}), any half falls below {@code
 *       max(2, min_areas_per_cluster)}, the member count already fits {@code
 *       max_direct_children}, or the internal recursion has reached {@code max_safety_depth}
 *       bisection levels.</li>
 *   <li>A NON-RECURSIVE, exactly-two-level emit beneath each Direction: if partitioning collapsed
 *       to a single bucket, its members are emitted directly as AREA leaves at depth 1 (no
 *       CLUSTER). Otherwise each bucket becomes exactly one CLUSTER at depth 1, with its members
 *       emitted as AREA leaves at depth 2 beneath it. There is no recursive call back into the
 *       emit step, so a CLUSTER can never nest under another CLUSTER regardless of how many
 *       internal bisection levels {@code partition} performed to build the bucket list.</li>
 * </ol>
 *
 * <p><b>{@code max_safety_depth} changed meaning in #2033.</b> It previously bounded the public
 * CLUSTER nesting depth directly (the root cause of the #2033 defect: nested CLUSTER levels
 * exceeded {@code MAX_PUBLIC_DEPTH}). It now bounds only the number of INTERNAL bisection levels
 * {@link #partition} may recurse through while building the flat bucket list — i.e. it caps the
 * bucket count at at most {@code 2^max_safety_depth}, independent of public depth, which is fixed
 * at <= 2 by the two-phase construction above regardless of every policy knob. The V121 migration
 * column COMMENT for {@code max_safety_depth} describes the pre-#2033 (public-depth-ceiling)
 * meaning and is now stale; correcting it requires a new migration, which is out of scope for this
 * change — this javadoc is the current source of truth for the column's semantics.
 */
@Component
public class NavigationTreeGenerator {

    private static final Logger log = LoggerFactory.getLogger(NavigationTreeGenerator.class);

    /** Above this many depth-1 CLUSTERs under one Direction, emit a WARN signal (no behaviour change). */
    private static final int CLUSTER_COUNT_WARN_THRESHOLD = 12;

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

        emitBeneathDirection(regionKey, sortedMembers, directionKey, policy, policyFingerprint,
                generatedAt, usedClusterKeys, out);
        return out;
    }

    /**
     * Partitions {@code members} into a flat list of "buckets" (PURE, no node emission, no
     * node_keys, no depth tracking). Terminates a branch — returning its members as a single
     * bucket — whenever the member count already fits {@code max_direct_children}, or {@code
     * level} (the number of INTERNAL bisection levels performed so far, starting at 0 — NOT a
     * node/public depth) has reached {@code max_safety_depth}, or the resulting split would leave
     * either half below the effective minimum cluster floor. Otherwise it bisects once (reusing
     * the existing {@link #bisect(List)}, unchanged) and recurses into each half at {@code level +
     * 1}. Because this method never emits a node, no caller-visible depth is at stake here at all —
     * {@link #emitBeneathDirection} is solely responsible for turning the returned bucket list into
     * exactly one or two levels of nodes.
     */
    private List<List<GeneratorArea>> partition(List<GeneratorArea> members, int level, GeneratorPolicy policy) {
        if (members.size() <= policy.maxDirectChildren()) {
            return List.of(members);
        }
        if (level >= policy.maxSafetyDepth()) {
            return List.of(members);
        }

        Partition split = bisect(members);

        // Hard floor: a bucket must have at least 2 members (a size-1 "cluster" is never useful
        // regardless of one_child_prevention) and at least min_areas_per_cluster. This floor
        // structurally subsumes one_child_prevention (rejecting any split with a first==1 or
        // second==1 half is exactly what floor >= 2 already guarantees) — one_child_prevention is
        // still read below so it remains part of the policy_fingerprint, but it can only ever be
        // AS STRICT as the floor, never looser: this is a tightening, never a weakening.
        int floor = Math.max(2, policy.minAreasPerCluster());
        boolean rejectSplit = split.first().size() < floor || split.second().size() < floor
                || (policy.oneChildPrevention()
                        && (split.first().size() == 1 || split.second().size() == 1));
        if (rejectSplit) {
            return List.of(members);
        }

        List<List<GeneratorArea>> buckets = new ArrayList<>();
        buckets.addAll(partition(split.first(), level + 1, policy));
        buckets.addAll(partition(split.second(), level + 1, policy));
        return buckets;
    }

    /**
     * Emits, NON-RECURSIVELY, exactly one or two levels of nodes beneath {@code directionKey} for
     * {@code sortedMembers}: computes the flat bucket list via {@link #partition}, then either
     * emits AREA leaves directly at depth 1 (single bucket — no CLUSTER, so a plain, unclustered
     * Direction is possible) or emits one depth-1 CLUSTER per bucket with that bucket's members as
     * depth-2 AREA leaves beneath it. This method never calls itself or {@link #partition}
     * recursively, so it is structurally incapable of emitting a CLUSTER below depth 1 or any node
     * below depth 2, independent of any policy value.
     */
    private void emitBeneathDirection(
            String regionKey, List<GeneratorArea> sortedMembers, String directionKey,
            GeneratorPolicy policy, String policyFingerprint, Instant generatedAt,
            Set<String> usedClusterKeys, List<GeneratedNode> out) {

        List<String> directionAncestors = List.of(directionKey);
        List<List<GeneratorArea>> buckets = partition(sortedMembers, 0, policy);

        if (buckets.size() <= 1) {
            emitAreaLeaves(regionKey, sortedMembers, directionKey, directionAncestors, 1,
                    policyFingerprint, generatedAt, out);
            return;
        }

        if (buckets.size() > CLUSTER_COUNT_WARN_THRESHOLD) {
            log.warn("Direction {} in region {} produced {} depth-1 clusters (warn threshold {})",
                    directionKey, regionKey, buckets.size(), CLUSTER_COUNT_WARN_THRESHOLD);
        }

        // R2: this order counter is scoped to ONE Direction call and reset to 1 here — it must
        // NEVER be the city-wide rootOrderCounter (that one numbers DIRECTION roots only), or
        // sibling CLUSTER display_order would collide across regions/directions (validator #8).
        int clusterOrder = 1;
        for (List<GeneratorArea> bucket : buckets) {
            int order = clusterOrder++;
            List<String> reps = selectRepresentatives(bucket, policy);
            String clusterKey = deriveClusterNodeKey(regionKey, bucket, reps, usedClusterKeys);
            usedClusterKeys.add(clusterKey);
            String label = deriveLabel(bucket, reps);
            Bounds bounds = computeBounds(bucket);

            out.add(new GeneratedNode(
                    regionKey, "CLUSTER", clusterKey, directionKey, null, reps, label, order,
                    1, directionAncestors, bucket.size(),
                    bounds.centreLat(), bounds.centreLon(), bounds.minLat(), bounds.minLon(),
                    bounds.maxLat(), bounds.maxLon(), policyFingerprint, generatedAt));

            List<String> clusterAncestors = List.of(directionKey, clusterKey);
            emitAreaLeaves(regionKey, bucket, clusterKey, clusterAncestors, 2,
                    policyFingerprint, generatedAt, out);
        }
    }

    /** Emits {@code members} (already in a caller-chosen bucket order) as AREA leaves, in
     * area_key order, beneath {@code parentNodeKey} at {@code depth}. */
    private void emitAreaLeaves(
            String regionKey, List<GeneratorArea> members, String parentNodeKey,
            List<String> ancestorKeys, int depth, String policyFingerprint, Instant generatedAt,
            List<GeneratedNode> out) {

        List<GeneratorArea> byAreaKey = reorderByAreaKey(members);
        int localOrder = 1;
        for (GeneratorArea area : byAreaKey) {
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
