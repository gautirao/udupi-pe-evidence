package com.example.realestate.intelligence;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link BuyerAreaIntelligenceService#resolveArea(String, String)}.
 *
 * <p>Tests are isolated (Mockito only; no Spring context, no DB). The repository is mocked
 * to return controlled snapshot lists.
 *
 * <p>Key invariants:
 * <ul>
 *   <li>RA-S01 – Unknown slug → matched=false, areaKey null, echoed params.</li>
 *   <li>RA-S02 – Known slug → matched=true with exact stored areaKey.</li>
 *   <li>RA-S03 – Slug derived from area_label (canonical slugify).</li>
 *   <li>RA-S04 – Slug derived from area_key last segment when area_label is null.</li>
 *   <li>RA-S05 – Collision: two rows with same slug and equal activeListingCount →
 *       deterministic winner by area_key ASC (stable across repeated calls).</li>
 *   <li>RA-S06 – Sort order: higher activeListingCount wins over lower, regardless of area_key.</li>
 *   <li>RA-S07 – k-anon-suppressed area (low activeListingCount) still resolves matched=true.</li>
 *   <li>RA-S08 – Empty city (no snapshot rows) → matched=false.</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class ResolveAreaServiceTest {

    @Mock
    private AreaIntelligenceSnapshotRepository repository;

    private BuyerAreaIntelligenceService service;

    @BeforeEach
    void setUp() {
        service = new BuyerAreaIntelligenceService(repository);
    }

    // ── RA-S01: unknown slug ───────────────────────────────────────────────────

    @Test
    @DisplayName("RA-S01: unknown slug in non-empty city → matched=false, areaKey null, params echoed")
    void resolveArea_unknownSlug_matchedFalse() {
        AreaIntelligenceSnapshot s = snapshot("udupi", "IN|KA|Udupi|Malpe", "Malpe", 20);
        when(repository.findByCitySlugOrderByActiveListingCountDesc("udupi"))
                .thenReturn(List.of(s));

        ResolveAreaResponse resp = service.resolveArea("udupi", "no-such-area");

        assertThat(resp.matched()).isFalse();
        assertThat(resp.areaKey()).isNull();
        assertThat(resp.areaLabel()).isNull();
        assertThat(resp.citySlug()).isEqualTo("udupi");
        assertThat(resp.areaSlug()).isEqualTo("no-such-area");
    }

    // ── RA-S02: known slug → matched=true with correct areaKey ───────────────

    @Test
    @DisplayName("RA-S02: known slug → matched=true, exact stored areaKey returned")
    void resolveArea_knownSlug_matchedTrueWithAreaKey() {
        AreaIntelligenceSnapshot s = snapshot("udupi", "IN|KA|Udupi|Malpe", "Malpe", 20);
        when(repository.findByCitySlugOrderByActiveListingCountDesc("udupi"))
                .thenReturn(List.of(s));

        ResolveAreaResponse resp = service.resolveArea("udupi", "malpe");

        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo("IN|KA|Udupi|Malpe");
        assertThat(resp.areaLabel()).isEqualTo("Malpe");
        assertThat(resp.citySlug()).isEqualTo("udupi");
        assertThat(resp.areaSlug()).isEqualTo("malpe");
    }

    // ── RA-S03: slug derived from area_label (canonical slugify) ─────────────

    @Test
    @DisplayName("RA-S03: multi-word area_label -> slug matches slugified label 'udupi-town'")
    void resolveArea_multiWordLabel_slugDerivedCorrectly() {
        AreaIntelligenceSnapshot s = snapshot("udupi", "IN|KA|Udupi|UdupiTown", "Udupi Town", 15);
        when(repository.findByCitySlugOrderByActiveListingCountDesc("udupi"))
                .thenReturn(List.of(s));

        ResolveAreaResponse resp = service.resolveArea("udupi", "udupi-town");

        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo("IN|KA|Udupi|UdupiTown");
    }

    // ── RA-S04: null area_label → fallback to area_key last segment ──────────

    @Test
    @DisplayName("RA-S04: null area_label -> slug derived from last pipe segment of area_key")
    void resolveArea_nullLabel_fallbackToAreaKeyLastSegment() {
        // area_label is null; area_key last segment "Malpe" slugifies to "malpe"
        AreaIntelligenceSnapshot s = snapshot("udupi", "IN|KA|Udupi|Malpe", null, 10);
        when(repository.findByCitySlugOrderByActiveListingCountDesc("udupi"))
                .thenReturn(List.of(s));

        ResolveAreaResponse resp = service.resolveArea("udupi", "malpe");

        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo("IN|KA|Udupi|Malpe");
        // areaLabel echoes null from the snapshot when matched
        assertThat(resp.areaLabel()).isNull();
    }

    // ── RA-S05: collision — equal activeListingCount, deterministic winner ────

    /**
     * Two rows with the same slugified label and the SAME activeListingCount.
     * The winner must be the one with the lexicographically smaller area_key.
     * This must be stable (same answer on every call).
     */
    @RepeatedTest(5)
    @DisplayName("RA-S05 (repeated): collision with equal count -> area_key ASC wins deterministically")
    void resolveArea_collision_equalCount_areaKeyAscWins() {
        // Both labels slugify to "malpe-beach"
        AreaIntelligenceSnapshot sB = snapshot("udupi", "IN|KA|Udupi|MalpeBeach-B", "Malpe Beach", 10);
        AreaIntelligenceSnapshot sA = snapshot("udupi", "IN|KA|Udupi|MalpeBeach-A", "Malpe Beach", 10);
        // Repository returns in any order (we pass B before A intentionally)
        when(repository.findByCitySlugOrderByActiveListingCountDesc("udupi"))
                .thenReturn(List.of(sB, sA));

        ResolveAreaResponse resp = service.resolveArea("udupi", "malpe-beach");

        // Winner: area_key ASC → "IN|KA|Udupi|MalpeBeach-A" (lexicographically smaller)
        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo("IN|KA|Udupi|MalpeBeach-A");
    }

    // ── RA-S06: sort order — higher count wins ────────────────────────────────

    @Test
    @DisplayName("RA-S06: two rows same slug, different counts -> higher activeListingCount wins")
    void resolveArea_sortOrder_higherCountWins() {
        // Same slugified label, different counts; repo may return in any order
        AreaIntelligenceSnapshot sLow  = snapshot("udupi", "IN|KA|Udupi|MalpeA", "Malpe", 5);
        AreaIntelligenceSnapshot sHigh = snapshot("udupi", "IN|KA|Udupi|MalpeB", "Malpe", 50);
        // Pass low first to test that sort overrides repo order
        when(repository.findByCitySlugOrderByActiveListingCountDesc("udupi"))
                .thenReturn(List.of(sLow, sHigh));

        ResolveAreaResponse resp = service.resolveArea("udupi", "malpe");

        assertThat(resp.matched()).isTrue();
        // sHigh (count=50) beats sLow (count=5)
        assertThat(resp.areaKey()).isEqualTo("IN|KA|Udupi|MalpeB");
    }

    // ── RA-S07: k-anon-suppressed area still resolves ─────────────────────────

    @Test
    @DisplayName("RA-S07: area with activeListingCount=1 (below k-anon threshold) still resolves matched=true")
    void resolveArea_suppressedArea_stillMatchedTrue() {
        // activeListingCount=1 is below K_ANON_MIN=10 — metrics are suppressed, but the
        // snapshot row EXISTS, so slug resolution must still return matched=true
        AreaIntelligenceSnapshot s = snapshot("udupi", "IN|KA|Udupi|TinyVillage", "Tiny Village", 1);
        when(repository.findByCitySlugOrderByActiveListingCountDesc("udupi"))
                .thenReturn(List.of(s));

        ResolveAreaResponse resp = service.resolveArea("udupi", "tiny-village");

        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo("IN|KA|Udupi|TinyVillage");
    }

    // ── RA-S08: empty city snapshot list ─────────────────────────────────────

    @Test
    @DisplayName("RA-S08: no snapshot rows for city → matched=false")
    void resolveArea_noRows_matchedFalse() {
        when(repository.findByCitySlugOrderByActiveListingCountDesc("newcity"))
                .thenReturn(Collections.emptyList());

        ResolveAreaResponse resp = service.resolveArea("newcity", "some-area");

        assertThat(resp.matched()).isFalse();
        assertThat(resp.areaKey()).isNull();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Build a minimal {@link AreaIntelligenceSnapshot} with the fields needed for slug resolution.
     * Other fields are left at defaults (zero / null) as they are not inspected by resolveArea.
     */
    private static AreaIntelligenceSnapshot snapshot(
            String citySlug, String areaKey, String areaLabel, int activeListingCount) {
        AreaIntelligenceSnapshot s = new AreaIntelligenceSnapshot();
        s.setCitySlug(citySlug);
        s.setAreaKey(areaKey);
        s.setAreaLabel(areaLabel);
        s.setActiveListingCount(activeListingCount);
        s.setConfidence("insufficient"); // not inspected by resolveArea
        s.setComputedAt(java.time.Instant.now());
        return s;
    }
}
