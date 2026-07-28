package com.example.realestate.discover.navigation;

import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * A city's counted school-to-area coverage, as the DISTINCT {@code (area_key, school_id)} pairs it
 * actually contains — the ONE structure both the per-area school counts and every node roll-up are
 * derived from (#1956 PR1, school-count contract fix).
 *
 * <p><b>Why the pairs and not just per-area counts.</b> A school can legitimately hold a qualifying
 * coverage relationship to MORE THAN ONE area. Two different questions are then being asked, and
 * they need different arithmetic over the same facts:
 *
 * <ul>
 *   <li><b>"How many schools are in THIS area?"</b> — count that area's own distinct schools. A
 *       school in two areas is counted in BOTH, because it genuinely is in both. An area's count
 *       must describe that area.</li>
 *   <li><b>"How many schools are under this parent?"</b> — the size of the UNION of its descendant
 *       areas' school sets. A school in two descendant areas counts ONCE, because it is one school.
 *       This is NOT the sum of the per-area counts, and summing them would over-count.</li>
 * </ul>
 *
 * <p><b>Sum-of-children == parent is therefore NOT an invariant for school counts and must never be
 * asserted.</b> It holds only when no school spans two areas under the same parent. The previous
 * implementation bought that invariant by globally partitioning each school to exactly ONE area via
 * {@code DISTINCT ON (school_id)} — which made the roll-up arithmetic convenient at the cost of
 * reporting {@code 0} for an area that genuinely contains the school. Correct per-area numbers are
 * worth more than a convenient fold; the union below restores the roll-up without lying about any
 * individual area.
 *
 * <p>Both derivations live on this one type deliberately, so the per-area number the shopper sees on
 * an area and the roll-up they see on its parent can never be computed from two drifting sources.
 *
 * @param schoolIdsByAreaKey {@code area_key -> the distinct school ids covered by that area}. An
 *                           area with no counted schools is ABSENT, never present-with-empty-set,
 *                           mirroring {@link AreaCountProvider#countsByAreaKey}'s contract.
 */
public record AreaSchoolCoverage(Map<String, Set<UUID>> schoolIdsByAreaKey) {

    /**
     * Defensively deep-copies into unmodifiable collections. This instance is CACHED and shared
     * across concurrent requests for the whole TTL (see {@link
     * AreaCountRollupService#schoolCoverageForCity}), so a caller mutating the map — or the builder
     * retaining a reference to the sets it passed in — would corrupt every subsequent reader of that
     * cache entry rather than just its own result. Copying once per cache MISS is negligible next to
     * the query it accompanies.
     *
     * <p><b>{@link java.util.Collections#unmodifiableMap}, deliberately NOT {@code Map.copyOf}.</b>
     * {@code Map.copyOf}'s iteration order is explicitly unspecified and salt-randomised per JVM
     * run, which would silently destroy the key order this type promises (see {@link
     * #countsByAreaKey()}) — and the {@link LinkedHashMap} below would then be preserving an order
     * that had already been thrown away. Wrapping the {@code LinkedHashMap} keeps insertion order,
     * keeps callers unable to mutate it, and matches the sibling {@code areaCounts} map's ordering.
     * {@code defensive} is a local that never escapes, so the wrapper has no mutable back door.
     * Values stay {@code Set.copyOf} — a set's iteration order is never surfaced (only {@code size()}
     * and union membership are used), so its immutability matters and its order does not.
     */
    public AreaSchoolCoverage {
        Map<String, Set<UUID>> defensive = new LinkedHashMap<>();
        schoolIdsByAreaKey.forEach((areaKey, schoolIds) -> defensive.put(areaKey, Set.copyOf(schoolIds)));
        schoolIdsByAreaKey = Collections.unmodifiableMap(defensive);
    }

    /** Empty coverage — a city with no counted school rows at all. */
    public static AreaSchoolCoverage empty() {
        return new AreaSchoolCoverage(Map.of());
    }

    /**
     * Per-area school counts: each area's OWN distinct school count. A school covering two areas
     * contributes {@code 1} to each — no cross-area suppression, no global partition, no precedence
     * ladder deciding which area "wins".
     *
     * <p>Insertion-ordered so the response's per-area map is stable across calls for one snapshot.
     */
    public Map<String, Long> countsByAreaKey() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (Map.Entry<String, Set<UUID>> entry : schoolIdsByAreaKey.entrySet()) {
            counts.put(entry.getKey(), (long) entry.getValue().size());
        }
        return counts;
    }

    /**
     * UNION-DISTINCT school count over {@code areaKeys} — the roll-up for a node whose descendant
     * AREA leaves are exactly those keys. A school present in several of them is counted ONCE.
     *
     * <p>This is what makes a parent's total honest without requiring any area beneath it to
     * under-report: the de-duplication happens at ROLL-UP time, over school identity, rather than at
     * WRITE time by suppressing an area's membership.
     */
    public long distinctSchoolCountOver(Collection<String> areaKeys) {
        Set<UUID> union = new HashSet<>();
        for (String areaKey : areaKeys) {
            Set<UUID> schools = schoolIdsByAreaKey.get(areaKey);
            if (schools != null) {
                union.addAll(schools);
            }
        }
        return union.size();
    }

    /** This area's own distinct school count — {@code 0} when the area has no counted schools. */
    public long countForArea(String areaKey) {
        Set<UUID> schools = schoolIdsByAreaKey.get(areaKey);
        return schools == null ? 0L : schools.size();
    }

    /**
     * The CITY-WIDE distinct school total — the union across every area in this snapshot. Used for
     * the {@code nodeKey="root"} landing view, whose total spans the whole city rather than one
     * node's descendants.
     *
     * <p>Lives here rather than at the call site so that EVERY piece of school-count arithmetic sits
     * on the one type that owns the per-area/roll-up distinction. The city root was previously the
     * last fragment computed elsewhere, which made it the one place a future "simplification" to
     * {@code areaSchoolCounts.values().sum()} could over-count every school covering two areas
     * without any other test noticing — and the root IS the landing view.
     */
    public long totalDistinctSchoolCount() {
        return distinctSchoolCountOver(schoolIdsByAreaKey.keySet());
    }
}
