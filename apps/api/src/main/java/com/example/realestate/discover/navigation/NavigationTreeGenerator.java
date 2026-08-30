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
 * #1955 Areas PR A; PROPORTIONAL k-AWARE split + MANDATORY_MAX_CHILDREN ceiling added #2086).
 *
 * <p><b>Algorithm choice / rationale.</b> Considered alternatives — k-means-style clustering,
 * quad-tree/grid partitioning, greedy nearest-neighbour agglomeration — all either depend on
 * iteration order, randomized seeding, or convergence tolerances (violating the determinism
 * contract below), or on a tunable target-cluster-count that doesn't compose cleanly with a
 * "collapse to leaves when the split isn't meaningful" rule. A binary longest-axis-median
 * bisection is deterministic given one fixed sort, terminates in O(log n) internal bisection
 * levels, and its accept/reject-a-split decision is simple to reason about and exhaustively test.
 *
 * <p><b>#2086: splitting is now MANDATORY, not policy-rejectable.</b> Before #2086, a split whose
 * halves fell below a floor (min_areas_per_cluster / one_child_prevention) was REJECTED and the
 * members collapsed back into a single, unsplit bucket — which is exactly how a real city
 * (Bangalore) ended up with a DIRECTION or CLUSTER carrying 20+ direct AREA children: the reject
 * path had no ceiling on how large the resulting unsplit bucket could be. #2086 replaces that with
 * a hard, policy-independent product invariant: {@link #MANDATORY_MAX_CHILDREN} = 15 is the
 * absolute maximum any one bucket may hold, and {@link #partition} now MUST keep splitting
 * (proportionally, k-aware) until every leaf bucket fits under the {@link #effectiveBreadth}
 * ceiling — there is no longer any code path that returns a bucket larger than that ceiling except
 * the {@code n <= b} base case itself. {@code min_areas_per_cluster} and {@code
 * one_child_prevention} are still READ (and folded into the policy_fingerprint via {@link
 * NavigationPolicyFingerprint}, which reads the whole {@link GeneratorPolicy} regardless of what
 * {@link #partition} consults) but no longer participate in any stop/split decision here: the
 * proportional recursive-halving split this class performs already guarantees every leaf bucket's
 * size is {@code floor(n/k)} or {@code ceil(n/k)} for the top-level {@code k = ceil(n/b)}, which for
 * {@code b = effectiveBreadth(policy)} is always {@code >= b/2} — i.e. never below {@code max(2,
 * min_areas_per_cluster)} for any {@code min_areas_per_cluster <= b/2}, so a floor derived from that
 * knob could never veto a split this algorithm produces even if it were still consulted.
 *
 * <p><b>Public shape is fixed at <= 2 levels beneath the city root, by construction.</b> The
 * hierarchy the validator (see {@code NavigationTreeValidationService} check #14,
 * {@code MAX_PUBLIC_DEPTH = 2}) permits is exactly {@code City -> Direction -> AREA} (depths 0, 1)
 * or {@code City -> Direction -> CLUSTER -> AREA} (depths 0, 1, 2); CLUSTER may occupy ONLY depth
 * 1. To guarantee this for every policy input, node emission is split into two phases:
 * <ol>
 *   <li>{@link #partition(List, int, GeneratorPolicy)} — a PURE, internally-recursive function
 *       that only computes a flat list of member "buckets" (no node emission, no node_keys, no
 *       depth). It bisects by LONGEST AXIS at a PROPORTIONAL split index (not necessarily the
 *       midpoint) of member centroids, recursing until every bucket's size fits {@link
 *       #effectiveBreadth}.</li>
 *   <li>A NON-RECURSIVE, exactly-two-level emit beneath each Direction: if partitioning collapsed
 *       to a single bucket, its members are emitted directly as AREA leaves at depth 1 (no
 *       CLUSTER). Otherwise each bucket becomes exactly one CLUSTER at depth 1, with its members
 *       emitted as AREA leaves at depth 2 beneath it. There is no recursive call back into the
 *       emit step, so a CLUSTER can never nest under another CLUSTER regardless of how many
 *       internal bisection levels {@code partition} performed to build the bucket list.</li>
 * </ol>
 *
 * <p><b>{@code max_safety_depth} left the decision path entirely in #2086.</b> #2033 had already
 * repurposed it from a public-depth ceiling to an internal-bisection-level budget; #2086 removes it
 * from {@link #partition}'s logic altogether in favour of {@link #ABSOLUTE_RECURSION_GUARD} (a
 * fixed, generous pathological-geometry safety valve, not a policy knob) — {@code
 * max_safety_depth} is still read by {@link NavigationPolicyFingerprint} for checksum/compat
 * continuity, but a hosted row can no longer use it to suppress the CLUSTER level for a
 * large region (the root cause of the Bangalore defect this issue fixes, where an operator-set
 * {@code max_safety_depth = 0} silently flattened every region straight to unclustered AREA
 * children). See the V124 migration for the corrected column COMMENT.
 */
@Component
public class NavigationTreeGenerator {

    private static final Logger log = LoggerFactory.getLogger(NavigationTreeGenerator.class);

    /**
     * #2086: hard, policy-INDEPENDENT product invariant — the absolute maximum number of members
     * any one bucket (CLUSTER, or a DIRECTION's direct AREA children when unclustered) may hold.
     * Not a {@code city_region_policy} knob: no hosted policy row can ever loosen past this value
     * (see {@link #effectiveBreadth}). This is the fix for the Bangalore defect where a policy-level
     * {@code max_safety_depth = 0} suppressed clustering entirely and produced 20+ direct children.
     */
    static final int MANDATORY_MAX_CHILDREN = 15;

    /** Fixed, generous internal-bisection-level safety valve (#2086) — replaces {@code
     * max_safety_depth} in the decision path. Not reachable by any real policy/geometry combination
     * this class is exercised against (2^20 buckets); exists solely so a pathological input cannot
     * recurse unbounded. */
    private static final int ABSOLUTE_RECURSION_GUARD = 20;

    /** Above this many depth-1 CLUSTERs under one Direction, emit a WARN signal (no behaviour
     * change) — #2086 raises this from 12 to {@link #MANDATORY_MAX_CHILDREN} so the diagnostic
     * threshold tracks the same product invariant as the bucket-size ceiling. */
    private static final int CLUSTER_COUNT_WARN_THRESHOLD = MANDATORY_MAX_CHILDREN;

    /** Deterministic rounding scale for all persisted geometry (~0.11m precision at the equator). */
    private static final int BOUNDS_SCALE = 6;

    /** Deterministic rounding scale for {@code bearing_degrees} — matches the V124 {@code
     * NUMERIC(6,3)} column. */
    private static final int BEARING_SCALE = 3;

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
                    policyFingerprint, generatedAt, usedClusterKeys, rootOrderCounter));
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
                usedClusterKeys, new int[] {1});
    }

    /**
     * Same as {@link #generateRegion(String, List, GeneratorPolicy, String, Instant, Set)} but
     * threading a shared, mutable DIRECTION-root display_order counter so that {@link
     * #generateCity} can number every region's Direction city-wide instead of restarting at 1 per
     * region.
     *
     * <p>#2086 design.R1: the DIRECTION node's {@code display_label} was previously a passthrough
     * of the region's raw {@code city_regions.display_label} (a compass-facing label like
     * "north"). It is now GENERATED from the region's member geography via the exact same {@link
     * #deriveLabel} CLUSTER labels already use — an area-derived name, never a raw compass label.
     * {@code regionKey} itself is completely UNCHANGED by this: it remains on every node and in
     * every response as internal/structural metadata; only the customer-facing label changed. The
     * dead {@code regionDisplayLabel} threading parameter this method used to take has been removed
     * — see the R1 falsifier check in {@code NavigationTreeGenerationService}: no backend consumer
     * (response DTO, breadcrumb, saved-search, analytics dimension, or test) depends on a
     * DIRECTION's {@code display_label} being the region's raw human name; {@link
     * NavigationNodeResponse} maps {@code displayLabel} generically for every {@code nodeType}.
     */
    private List<GeneratedNode> generateRegion(
            String regionKey, List<GeneratorArea> members, GeneratorPolicy policy,
            String policyFingerprint, Instant generatedAt, Set<String> usedClusterKeys,
            int[] rootOrderCounter) {

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
        String label = deriveLabel(sortedMembers, reps);
        int order = rootOrderCounter[0]++;

        // #2086 design.R4: bearingDegrees is NULL for depth-0 DIRECTION nodes — no parent NODE
        // exists for a Direction (the city centre is not itself a node). #2088 must handle a null
        // bearing on every DIRECTION-type child/ancestry entry.
        out.add(new GeneratedNode(
                regionKey, "DIRECTION", directionKey, null, null, reps, label, order, 0,
                List.of(), sortedMembers.size(),
                bounds.centreLat(), bounds.centreLon(), bounds.minLat(), bounds.minLon(),
                bounds.maxLat(), bounds.maxLon(), null, policyFingerprint, generatedAt));

        emitBeneathDirection(regionKey, sortedMembers, directionKey, bounds, policy, policyFingerprint,
                generatedAt, usedClusterKeys, out);
        return out;
    }

    /**
     * #2086: the maximum breadth any single bucket may be built up to — the STRICTER of the
     * hosted policy's {@code max_direct_children} and the {@link #MANDATORY_MAX_CHILDREN} product
     * invariant, floored at 2 (a "cluster" of 0 or 1 is never meaningful). A city seeded at 8 stays
     * at 8 (stricter, still compliant); no hosted policy row can ever loosen past {@link
     * #MANDATORY_MAX_CHILDREN}.
     */
    private static int effectiveBreadth(GeneratorPolicy policy) {
        return Math.min(Math.max(2, policy.maxDirectChildren()), MANDATORY_MAX_CHILDREN);
    }

    private static int ceilDiv(int numerator, int denominator) {
        return (numerator + denominator - 1) / denominator;
    }

    /**
     * Partitions {@code members} into a flat list of "buckets" (PURE, no node emission, no
     * node_keys, no depth tracking). #2086: splitting a subtree whose member count exceeds {@link
     * #effectiveBreadth} is now MANDATORY, not policy-rejectable — {@code min_areas_per_cluster}
     * and {@code one_child_prevention} no longer participate in this decision (see the class
     * javadoc for why a floor derived from either could never veto this algorithm's output anyway).
     *
     * <p><b>#2086 S1b: caps fan-out (bucket COUNT), not merely bucket SIZE.</b> A single target
     * {@code bucketSize} is computed ONCE, from the FULL {@code members} count this method is
     * entered with (this is the "top" of one Direction's partitioning — the only caller is {@link
     * #emitBeneathDirection}, always at {@code level == 0}), via {@link #effectiveBucketSize}, and
     * held CONSTANT through every recursive call below — never recomputed from a shrinking local
     * slice size. Doing so keeps both product invariants simultaneously satisfiable: bucket size
     * never exceeds {@link #MANDATORY_MAX_CHILDREN} (15) AND the leaf bucket COUNT never exceeds 15
     * either, for any region up to 225 canonical areas (15 x 15) — see {@link
     * #effectiveBucketSize}'s javadoc for the proof. Above 225 areas no {@code bucketSize} can
     * satisfy both bounds at once; this method still produces a tree (bucket count > 15), and {@code
     * NavigationTreeValidationService} check #15 fails it closed with the 225-ceiling diagnostic —
     * by design, this generator never silently caps membership by dropping areas.
     *
     * <p>{@code k = ceil(members.size() / bucketSize)} is the target bucket count for this
     * subtree — computed FRESH at every recursion level from the LOCAL member count and the ONE
     * fixed {@code bucketSize} above — but then CAPPED at {@code members.size() / 2} (integer
     * floor): a bucket may never drop below 2 members REGARDLESS of policy — {@code
     * NavigationTreeValidationService}'s {@code ONE_CHILD_CLUSTER} check (#4) rejects a one-child
     * CLUSTER unconditionally, independent of any policy knob, so this generator must never emit
     * one. This cap only ever binds for a degenerate small-{@code n}/small-{@code bucketSize}
     * combination (e.g. 3 members with a bucket size of 2, where 3 cannot be split into groups
     * that are simultaneously {@code <= 2} and {@code >= 2}) — it never binds for a realistic
     * hosted policy (bucketSize >= 8, hundreds of areas). {@code k <= 1} is the sole termination
     * condition after that cap (qa-fast R-B1: this guard MUST run and return the unsplit list
     * BEFORE any split is attempted — at, e.g., n=15 with a bucket size of 15, k=1, and attempting
     * a split anyway would emit a structurally empty second bucket).
     * Otherwise this bisects once (reusing {@link #bisect}, whose axis selection, comparator and
     * {@link #reorderByAreaKey} tie-break are UNCHANGED — only the split INDEX is new) at a
     * PROPORTIONAL index (not necessarily the midpoint) so that the "left" half receives {@code
     * ceil(k/2)} of the {@code k} target buckets' worth of members, then recurses into each half at
     * {@code level + 1}. Recursive proportional halving like this guarantees every final leaf
     * bucket's size is {@code floor(n/k)} or {@code ceil(n/k)} for the TOP-level {@code k} (see the
     * worked examples in {@code NavigationTreeGeneratorTest}), which for {@code bucketSize = 15}
     * means every bucket holds 8-15 areas and a one-child bucket is structurally impossible.
     *
     * <p>Because this method never emits a node, no caller-visible depth is at stake here at all —
     * {@link #emitBeneathDirection} is solely responsible for turning the returned bucket list into
     * exactly one or two levels of nodes.
     */
    private List<List<GeneratorArea>> partition(List<GeneratorArea> members, int level, GeneratorPolicy policy) {
        int bucketSize = effectiveBucketSize(members.size(), policy);
        return partition(members, level, bucketSize);
    }

    /**
     * Recursive worker for {@link #partition(List, int, GeneratorPolicy)}, carrying the ONE
     * {@code bucketSize} computed at the top-level call constant through every recursion level —
     * see that method's javadoc for why this must never be recomputed from a shrinking local slice.
     */
    private List<List<GeneratorArea>> partition(List<GeneratorArea> members, int level, int bucketSize) {
        int k = ceilDiv(members.size(), bucketSize);
        // Hard, policy-independent floor: never target more buckets than members.size()/2, so no
        // bucket this recursion produces can ever fall below 2 members (see javadoc above).
        k = Math.min(k, members.size() / 2);
        if (k <= 1) {
            return List.of(members);
        }
        if (level >= ABSOLUTE_RECURSION_GUARD) {
            return List.of(members);
        }

        int leftBuckets = (k + 1) / 2;
        // Deterministic rounding rule: plain int division truncates toward zero, which for the
        // non-negative operands here is exactly floor() — no floating point, no Math.round, no
        // platform/JIT variance (qa-fast R-D2: the determinism contract extends to this index).
        int splitIndex = (members.size() * leftBuckets) / k;
        // Defensive clamp only — the arithmetic above is proven never to produce an out-of-range
        // index for any k >= 2, but this keeps bisect()'s subList calls safe against a future
        // refactor rather than relying solely on that proof.
        splitIndex = Math.max(1, Math.min(splitIndex, members.size() - 1));

        Partition split = bisect(members, splitIndex);

        List<List<GeneratorArea>> buckets = new ArrayList<>();
        buckets.addAll(partition(split.first(), level + 1, bucketSize));
        buckets.addAll(partition(split.second(), level + 1, bucketSize));
        return buckets;
    }

    /**
     * #2086 S1b: the single bucket-size target used for every leaf bucket a call to {@link
     * #partition(List, int, GeneratorPolicy)} produces for one Direction's {@code n} members —
     * the STRICTER of the policy's own {@link #effectiveBreadth} preference and whatever size is
     * needed to keep the resulting bucket COUNT at or below {@link #MANDATORY_MAX_CHILDREN} (15).
     *
     * <p>{@code minSizeForFanout = ceil(n / 15)} is the smallest bucket size that keeps {@code
     * ceil(n / bucketSize) <= 15}: if {@code m = ceil(n / 15)} then {@code 15 * m >= n}, so {@code
     * ceil(n / m) <= 15}. Clamping the policy's preferred breadth {@code b} UP toward that minimum
     * — but never above {@code MANDATORY_MAX_CHILDREN} — means a city seeded at {@code b = 8} keeps
     * 8-area buckets for {@code n <= 120} (unaffected — {@code minSizeForFanout <= 8} whenever
     * {@code n <= 120}) and only relaxes toward 15 above that, restoring a universal {@code 15 x 15
     * = 225} ceiling independent of the policy value: for any {@code n <= 225}, {@code
     * minSizeForFanout <= 15}, so {@code bucketSize >= minSizeForFanout} and the fan-out bound above
     * holds regardless of {@code b}. Above 225, {@code minSizeForFanout > 15} cannot be honoured (a
     * bucket may never exceed 15 members either), so {@code bucketSize} clamps at 15 and the
     * resulting bucket count is >15 — left for {@code NavigationTreeValidationService} check #15 to
     * reject fail-closed (see the class javadoc note on {@link #partition(List, int,
     * GeneratorPolicy)}).
     */
    private static int effectiveBucketSize(int n, GeneratorPolicy policy) {
        int b = effectiveBreadth(policy);
        int minSizeForFanout = ceilDiv(n, MANDATORY_MAX_CHILDREN);
        return Math.max(b, Math.min(minSizeForFanout, MANDATORY_MAX_CHILDREN));
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
            String regionKey, List<GeneratorArea> sortedMembers, String directionKey, Bounds directionBounds,
            GeneratorPolicy policy, String policyFingerprint, Instant generatedAt,
            Set<String> usedClusterKeys, List<GeneratedNode> out) {

        List<String> directionAncestors = List.of(directionKey);
        List<List<GeneratorArea>> buckets = partition(sortedMembers, 0, policy);

        if (buckets.size() <= 1) {
            emitAreaLeaves(regionKey, sortedMembers, directionKey, directionAncestors, 1, directionBounds,
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
            BigDecimal bearing = computeBearingDegrees(
                    directionBounds.centreLat(), directionBounds.centreLon(), bounds.centreLat(), bounds.centreLon());

            out.add(new GeneratedNode(
                    regionKey, "CLUSTER", clusterKey, directionKey, null, reps, label, order,
                    1, directionAncestors, bucket.size(),
                    bounds.centreLat(), bounds.centreLon(), bounds.minLat(), bounds.minLon(),
                    bounds.maxLat(), bounds.maxLon(), bearing, policyFingerprint, generatedAt));

            List<String> clusterAncestors = List.of(directionKey, clusterKey);
            emitAreaLeaves(regionKey, bucket, clusterKey, clusterAncestors, 2, bounds,
                    policyFingerprint, generatedAt, out);
        }
    }

    /** Emits {@code members} (already in a caller-chosen bucket order) as AREA leaves, in
     * area_key order, beneath {@code parentNodeKey} at {@code depth}, each with {@code
     * bearingDegrees} computed from {@code parentBounds}' centre to its own centre (#2086
     * design.R4). */
    private void emitAreaLeaves(
            String regionKey, List<GeneratorArea> members, String parentNodeKey,
            List<String> ancestorKeys, int depth, Bounds parentBounds, String policyFingerprint,
            Instant generatedAt, List<GeneratedNode> out) {

        List<GeneratorArea> byAreaKey = reorderByAreaKey(members);
        int localOrder = 1;
        for (GeneratorArea area : byAreaKey) {
            int order = localOrder++;
            Bounds bounds = new Bounds(
                    round(area.centreLat()), round(area.centreLon()),
                    round(area.minLat()), round(area.minLon()),
                    round(area.maxLat()), round(area.maxLon()));
            BigDecimal bearing = computeBearingDegrees(
                    parentBounds.centreLat(), parentBounds.centreLon(), bounds.centreLat(), bounds.centreLon());
            out.add(new GeneratedNode(
                    regionKey, "AREA", NavigationKeys.areaNodeKey(area.areaKey()), parentNodeKey,
                    area.areaKey(), List.of(area.areaKey()), area.name(), order, depth, ancestorKeys, 1,
                    bounds.centreLat(), bounds.centreLon(), bounds.minLat(), bounds.minLon(),
                    bounds.maxLat(), bounds.maxLon(), bearing, policyFingerprint, generatedAt));
        }
    }

    // ── Bisection ────────────────────────────────────────────────────────────────────────────

    /** Bisects {@code members} by LONGEST AXIS (LAT wins a tie) at the caller-supplied {@code
     * splitIndex} (#2086 — previously always {@code members.size() / 2}; axis selection, comparator
     * and the {@link #reorderByAreaKey} tie-break are otherwise UNCHANGED from before #2086). */
    private Partition bisect(List<GeneratorArea> members, int splitIndex) {
        BigDecimal latRange = range(members, GeneratorArea::centreLat);
        BigDecimal lonRange = range(members, GeneratorArea::centreLon);
        // Fixed tie-break: LAT wins a tie, so equal ranges always split the same way.
        boolean useLat = latRange.compareTo(lonRange) >= 0;

        Comparator<GeneratorArea> axisOrder = (useLat
                ? Comparator.comparing(GeneratorArea::centreLat)
                : Comparator.comparing(GeneratorArea::centreLon))
                .thenComparing(GeneratorArea::areaKey);

        List<GeneratorArea> sortedByAxis = members.stream().sorted(axisOrder).toList();

        List<GeneratorArea> first = reorderByAreaKey(sortedByAxis.subList(0, splitIndex));
        List<GeneratorArea> second = reorderByAreaKey(sortedByAxis.subList(splitIndex, sortedByAxis.size()));
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

    /** Label built purely from representative area names — no invented marketing copy. Used for
     * both CLUSTER labels and, as of #2086 design.R1, DIRECTION labels. */
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

    /**
     * #2086 design.R4: initial great-circle (forward azimuth) bearing in degrees, normalised to
     * {@code [0, 360)}, from {@code (fromLat, fromLon)} to {@code (toLat, toLon)} — standard
     * spherical-earth bearing formula. Always PARENT-node-centre -> THIS-node-centre; never
     * relative to a user's camera/viewport (#2088 must consume it exactly that way). Uses
     * double-precision trig (deterministic given identical double inputs on a given JVM/platform,
     * exactly like every other geo computation in this codebase) then rounds HALF_UP to {@link
     * #BEARING_SCALE} = 3 decimal places, mirroring the {@link #BOUNDS_SCALE} HALF_UP discipline
     * used for centre_lat/centre_lon above.
     *
     * <p>Package-private (not {@code private}) and static so {@link NavigationTreeOverrideApplier}
     * (#2086 code-review fix, blocking) can recompute a node's bearing against its NEW parent's
     * freshly-computed centre after a {@code MOVE_AREA} override reparents it — see {@code
     * NavigationTreeOverrideApplier#rebuildAfterMoves}. Takes raw lat/lon rather than the private
     * {@link Bounds} record so a caller outside this class never needs that type.
     *
     * <p>#2086 code-review fix (N1): plain HALF_UP rounding at {@link #BEARING_SCALE} = 3 decimal
     * places can round a value in {@code (359.9995, 360.0)} up to exactly {@code 360.000},
     * violating the documented {@code [0, 360)} contract (and the candidate IT's own {@code < 360}
     * assertion). Wrap that one edge case back to {@code 0.000} rather than emit an out-of-range
     * bearing.
     */
    static BigDecimal computeBearingDegrees(BigDecimal fromLat, BigDecimal fromLon, BigDecimal toLat, BigDecimal toLon) {
        double phi1 = Math.toRadians(fromLat.doubleValue());
        double phi2 = Math.toRadians(toLat.doubleValue());
        double deltaLambda = Math.toRadians(toLon.subtract(fromLon).doubleValue());

        double y = Math.sin(deltaLambda) * Math.cos(phi2);
        double x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
        double bearingDeg = Math.toDegrees(Math.atan2(y, x));
        double normalised = ((bearingDeg % 360.0) + 360.0) % 360.0;

        BigDecimal rounded = BigDecimal.valueOf(normalised).setScale(BEARING_SCALE, RoundingMode.HALF_UP);
        if (rounded.compareTo(BigDecimal.valueOf(360)) >= 0) {
            return BigDecimal.ZERO.setScale(BEARING_SCALE);
        }
        return rounded;
    }

    private record Bounds(
            BigDecimal centreLat, BigDecimal centreLon,
            BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon) {
    }
}
