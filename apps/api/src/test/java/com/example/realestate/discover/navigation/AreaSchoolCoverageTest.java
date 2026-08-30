package com.example.realestate.discover.navigation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The two derivations that replaced {@code DISTINCT ON (school_id)} (#1956 PR1 school-count fix),
 * pinned in isolation from SQL and from the navigation graph.
 *
 * <p>The arithmetic is the whole point of the fix: per-area counts describe THEIR OWN area (a school
 * in two areas counts for both), while a roll-up unions on school IDENTITY (that school counts once
 * for a parent containing both). Getting one right and the other wrong is exactly the failure the
 * previous implementation shipped, so both are asserted against the same fixture.
 */
class AreaSchoolCoverageTest {

    private static final UUID SHARED = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID ONLY_A = UUID.fromString("00000000-0000-0000-0000-00000000000a");
    private static final UUID ONLY_B = UUID.fromString("00000000-0000-0000-0000-00000000000b");

    /** SHARED covers BOTH areas; each area also has one school of its own. */
    private static AreaSchoolCoverage fixture() {
        return new AreaSchoolCoverage(Map.of(
                "areaA", Set.of(SHARED, ONLY_A),
                "areaB", Set.of(SHARED, ONLY_B)));
    }

    @Test
    @DisplayName("per-area counts include a shared school in EVERY area that covers it")
    void countsByAreaKey_countSharedSchoolInBothAreas() {
        assertThat(fixture().countsByAreaKey())
                .containsEntry("areaA", 2L)
                .containsEntry("areaB", 2L);
    }

    @Test
    @DisplayName("a roll-up unions on school identity: 3 distinct schools, not the 4 a sum would give")
    void distinctSchoolCountOver_unionsRatherThanSums() {
        AreaSchoolCoverage coverage = fixture();

        assertThat(coverage.distinctSchoolCountOver(List.of("areaA", "areaB")))
                .as("SHARED must be counted ONCE for a parent containing both areas")
                .isEqualTo(3L);

        long sumOfPerAreaCounts = coverage.countsByAreaKey().values().stream()
                .mapToLong(Long::longValue).sum();
        assertThat(sumOfPerAreaCounts)
                .as("the sum is 4 and is WRONG for a parent -- this is precisely why "
                        + "sum(children) == parent is not an invariant for school counts")
                .isEqualTo(4L)
                .isNotEqualTo(coverage.distinctSchoolCountOver(List.of("areaA", "areaB")));
    }

    /**
     * The city-root landing view's total. It must union like every other roll-up — a regression to
     * {@code areaSchoolCounts.values().sum()} would over-count every school covering two areas, on
     * the most-visited view, and the expected value here (3, not 4) is what makes that regression
     * visible instead of silent.
     */
    @Test
    @DisplayName("totalDistinctSchoolCount unions across ALL areas — 3 distinct schools, not the "
            + "summed 4")
    void totalDistinctSchoolCount_unionsAcrossAllAreas() {
        AreaSchoolCoverage coverage = fixture();

        assertThat(coverage.totalDistinctSchoolCount()).isEqualTo(3L);
        assertThat(coverage.countsByAreaKey().values().stream().mapToLong(Long::longValue).sum())
                .as("the sum a naive city-root implementation would produce -- explicitly NOT the total")
                .isEqualTo(4L);
    }

    @Test
    @DisplayName("totalDistinctSchoolCount of empty coverage is 0")
    void totalDistinctSchoolCount_empty_isZero() {
        assertThat(AreaSchoolCoverage.empty().totalDistinctSchoolCount()).isZero();
    }

    @Test
    @DisplayName("a single-area roll-up equals that area's own count")
    void distinctSchoolCountOver_singleArea_matchesPerAreaCount() {
        AreaSchoolCoverage coverage = fixture();
        assertThat(coverage.distinctSchoolCountOver(List.of("areaA")))
                .isEqualTo(coverage.countForArea("areaA"))
                .isEqualTo(2L);
    }

    @Test
    @DisplayName("areas with no counted schools are ABSENT, and read as 0 rather than throwing")
    void unknownArea_readsAsZero_andIsAbsentFromTheMap() {
        AreaSchoolCoverage coverage = fixture();

        assertThat(coverage.countForArea("areaZ")).isZero();
        assertThat(coverage.countsByAreaKey()).doesNotContainKey("areaZ");
        assertThat(coverage.distinctSchoolCountOver(List.of("areaZ"))).isZero();
        assertThat(coverage.distinctSchoolCountOver(List.of()))
                .as("a node with no descendant areas rolls up to 0, not an error")
                .isZero();
    }

    @Test
    @DisplayName("empty coverage is a valid snapshot — a city with no counted school rows")
    void empty_isUsableEverywhere() {
        assertThat(AreaSchoolCoverage.empty().countsByAreaKey()).isEmpty();
        assertThat(AreaSchoolCoverage.empty().countForArea("areaA")).isZero();
        assertThat(AreaSchoolCoverage.empty().distinctSchoolCountOver(List.of("areaA"))).isZero();
    }

    @Test
    @DisplayName("a repeated area key in the descendant list cannot inflate the union")
    void distinctSchoolCountOver_repeatedAreaKey_countsOnce() {
        assertThat(fixture().distinctSchoolCountOver(List.of("areaA", "areaA", "areaB")))
                .isEqualTo(3L);
    }

    /**
     * This value is CACHED and shared across concurrent requests for the whole TTL, so it must not be
     * mutable through the reference the builder passed in — otherwise one request could corrupt
     * every later reader of that cache entry.
     */
    @Test
    @DisplayName("the snapshot is immutable and decoupled from the caller's collections")
    void construction_deepCopies_soACachedSnapshotCannotBeMutatedLater() {
        Set<UUID> mutableSchools = new java.util.HashSet<>(Set.of(SHARED));
        Map<String, Set<UUID>> mutableSource = new java.util.HashMap<>(Map.of("areaA", mutableSchools));

        AreaSchoolCoverage coverage = new AreaSchoolCoverage(mutableSource);

        mutableSchools.add(ONLY_A);
        mutableSource.put("areaB", Set.of(ONLY_B));

        assertThat(coverage.countForArea("areaA"))
                .as("mutating the source set after construction must not change the snapshot")
                .isEqualTo(1L);
        assertThat(coverage.countsByAreaKey())
                .as("nor must adding a whole new area to the source map")
                .doesNotContainKey("areaB");

        assertThat(org.assertj.core.api.Assertions.catchThrowable(
                () -> coverage.schoolIdsByAreaKey().put("areaC", Set.of(ONLY_A))))
                .as("and the exposed map itself must reject writes")
                .isInstanceOf(UnsupportedOperationException.class);
    }
}
