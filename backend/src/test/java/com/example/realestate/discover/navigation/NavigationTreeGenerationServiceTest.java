package com.example.realestate.discover.navigation;

import com.example.realestate.discover.citylaunch.CanonicalGeographyReader;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * #2086 S1b GAP 1 regression: {@link NavigationTreeGenerationService#generateAndStoreForRevision}
 * must wire {@code displayLabelByNodeKey} into {@link NavigationTreeValidationService}'s check #16
 * (label provenance) — before this fix, that call site used the 6-arg {@code validate(...)}
 * overload, which defaults to an empty label map and makes check #16 a permanent no-op against
 * every REAL generated tree, even though the check itself was fully implemented and unit-tested in
 * isolation (S2). A direct {@code validationService.validate(...)} call with an explicit label map
 * would NOT catch this class of gap — it would only prove the check works, not that production
 * wires it in — so this test drives the exact same {@link
 * NavigationTreeGenerationService#generateAndStoreForRevision} entry point the sandbox-generation
 * HTTP path uses, with real {@link NavigationTreeGenerator}, real {@link
 * NavigationTreeValidationService}, and real {@link NavigationTreeOverrideApplier} collaborators —
 * only the DB-facing readers/writer are test doubles.
 */
class NavigationTreeGenerationServiceTest {

    private static final Instant GENERATED_AT = Instant.parse("2026-08-05T00:00:00Z");
    private static final int CITY_ID = 1;
    private static final Long REVISION_ID = 100L;

    /** Six areas at max_direct_children=3 -> two depth-1 CLUSTERs of 3 areas each (mirrors
     * NavigationTreeGeneratorTest's collidingClusterNodeKeyIsDisambiguated fixture), so each
     * CLUSTER has one "extra" descendant area beyond its 2 representatives to swap reps onto. */
    private static CanonicalGeographyReader.CanonicalArea area(String areaKey, String name, double lat) {
        return new CanonicalGeographyReader.CanonicalArea(
                areaKey, name, "district", lat, 77.0, lat - 0.01, 76.99, lat + 0.01, 77.01,
                "OSM", "way", 1L, "ACTIVE");
    }

    private NavigationTreeGenerationService buildService(
            CanonicalGeographyReader geographyReader, NavigationPolicyReader policyReader,
            NavigationTreeSandboxWriter sandboxWriter, SandboxNavigationOverrideRepository overrideRepository) {
        return new NavigationTreeGenerationService(
                geographyReader, policyReader, new NavigationTreeGenerator(),
                new NavigationTreeValidationService(), sandboxWriter, new NavigationTreeOverrideApplier(),
                overrideRepository);
    }

    private CanonicalGeographyReader.CanonicalGeography sixAreaOneRegionGeography() {
        List<CanonicalGeographyReader.CanonicalArea> areas = List.of(
                area("north|c1", "C1", 10.0), area("north|c2", "C2", 10.1), area("north|c3", "C3", 10.2),
                area("north|c4", "C4", 20.0), area("north|c5", "C5", 20.1), area("north|c6", "C6", 20.2));
        List<CanonicalGeographyReader.CanonicalCityRegion> regions = List.of(
                new CanonicalGeographyReader.CanonicalCityRegion(
                        "north", "north", 1, null, null, null, null, null, null, null));
        List<CanonicalGeographyReader.CanonicalCityRegionMembership> memberships = areas.stream()
                .map(a -> new CanonicalGeographyReader.CanonicalCityRegionMembership(
                        a.areaKey(), "north", "MANUAL"))
                .toList();
        return new CanonicalGeographyReader.CanonicalGeography(
                areas, List.of(), regions, memberships, List.of(), List.of());
    }

    private NavigationPolicyReader.CityRegionPolicyRow threeChildPolicy() {
        GeneratorPolicy knobs = new GeneratorPolicy(
                3, 1, 6, false, BigDecimal.ZERO, BigDecimal.ZERO, "GEOMETRIC_BISECTION",
                "CENTROID_NEAREST", "ATTACH_NEAREST_CLUSTER", "AREA_CENTROID_MEAN");
        return new NavigationPolicyReader.CityRegionPolicyRow("HYBRID", 5.0, knobs);
    }

    @Test
    @DisplayName("[#2086 S1b GAP 1] a generated tree carrying a SET_REPRESENTATIVES override that "
            + "leaves a CLUSTER's display_label un-derivable from its NEW representative_area_keys "
            + "fails generateAndStoreForRevision end-to-end with NavigationTreeValidationException, "
            + "citing LABEL_NOT_DERIVABLE — proving check #16 actually runs against the real "
            + "generation pipeline, not merely via a direct validate(...) unit call")
    void generateAndStoreForRevision_labelNotDerivableAfterSetRepresentatives_failsEndToEnd() {
        CanonicalGeographyReader geographyReader = mock(CanonicalGeographyReader.class);
        when(geographyReader.findCity(CITY_ID)).thenReturn(
                Optional.of(new CanonicalGeographyReader.CanonicalCity(CITY_ID, "testcity", "Test City")));
        when(geographyReader.loadGeography(CITY_ID)).thenReturn(sixAreaOneRegionGeography());

        NavigationPolicyReader policyReader = mock(NavigationPolicyReader.class);
        when(policyReader.findPolicy(CITY_ID)).thenReturn(Optional.of(threeChildPolicy()));
        when(policyReader.findSortedDirectionLabelPairs("testcity")).thenReturn(List.of());

        NavigationTreeSandboxWriter sandboxWriter = mock(NavigationTreeSandboxWriter.class);

        // The first depth-1 CLUSTER's representative_area_keys, per the generator's deterministic
        // centroid-nearest tie-break (identical to NavigationTreeGeneratorTest's
        // collidingClusterNodeKeyIsDisambiguated fixture): reps = [north|c1, north|c2], leaving
        // north|c3 as the one non-representative descendant of that cluster.
        String clusterNodeKey = NavigationKeys.clusterNodeKeyBase("north", List.of("north|c1", "north|c2"));

        SandboxNavigationOverride setRepsOverride = new SandboxNavigationOverride(
                REVISION_ID, OverrideKind.SET_REPRESENTATIVES, null, clusterNodeKey, null, null, null,
                List.of("north|c3"), 1, "test: break label provenance", UUID.randomUUID());
        SandboxNavigationOverrideRepository overrideRepository = mock(SandboxNavigationOverrideRepository.class);
        when(overrideRepository.findByRevisionIdOrderByApplyOrderAsc(REVISION_ID))
                .thenReturn(List.of(setRepsOverride));

        NavigationTreeGenerationService service =
                buildService(geographyReader, policyReader, sandboxWriter, overrideRepository);

        assertThatThrownBy(() -> service.generateAndStoreForRevision(REVISION_ID, CITY_ID, GENERATED_AT))
                .isInstanceOf(NavigationTreeValidationException.class)
                .satisfies(ex -> {
                    ValidationReport report = ((NavigationTreeValidationException) ex).report();
                    assertThat(report.errors())
                            .as("check #16 (label provenance) must fire against the REAL generated+"
                                    + "override-applied tree, not merely a direct validate(...) call")
                            .anyMatch(e -> "LABEL_NOT_DERIVABLE".equals(e.code())
                                    && clusterNodeKey.equals(e.nodeKey()));
                });

        // A failed validation must never reach persistence (existing NavigationTreeGenerationService
        // contract — unaffected by this fix, reasserted here as a safety net for the new test).
        verify(sandboxWriter, never()).persist(anyLong(), org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    @DisplayName("[#2086 S1b GAP 1, control] the SAME fixture with NO override at all generates and "
            + "stores cleanly — every CLUSTER's naturally-derived display_label passes check #16 by "
            + "construction, proving the earlier failure is caused specifically by the "
            + "SET_REPRESENTATIVES override breaking provenance, not by check #16 rejecting a "
            + "correctly-generated tree")
    void generateAndStoreForRevision_noOverride_generatesAndStoresCleanly() {
        CanonicalGeographyReader geographyReader = mock(CanonicalGeographyReader.class);
        when(geographyReader.findCity(CITY_ID)).thenReturn(
                Optional.of(new CanonicalGeographyReader.CanonicalCity(CITY_ID, "testcity", "Test City")));
        when(geographyReader.loadGeography(CITY_ID)).thenReturn(sixAreaOneRegionGeography());

        NavigationPolicyReader policyReader = mock(NavigationPolicyReader.class);
        when(policyReader.findPolicy(CITY_ID)).thenReturn(Optional.of(threeChildPolicy()));
        when(policyReader.findSortedDirectionLabelPairs("testcity")).thenReturn(List.of());

        NavigationTreeSandboxWriter sandboxWriter = mock(NavigationTreeSandboxWriter.class);
        when(sandboxWriter.persist(org.mockito.ArgumentMatchers.eq(REVISION_ID), org.mockito.ArgumentMatchers.anyList()))
                .thenReturn(List.of(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L));

        SandboxNavigationOverrideRepository overrideRepository = mock(SandboxNavigationOverrideRepository.class);
        when(overrideRepository.findByRevisionIdOrderByApplyOrderAsc(REVISION_ID)).thenReturn(List.of());

        NavigationTreeGenerationService service =
                buildService(geographyReader, policyReader, sandboxWriter, overrideRepository);

        List<Long> ids = service.generateAndStoreForRevision(REVISION_ID, CITY_ID, GENERATED_AT);

        assertThat(ids).isNotEmpty();
        verify(sandboxWriter).persist(org.mockito.ArgumentMatchers.eq(REVISION_ID), org.mockito.ArgumentMatchers.anyList());
    }
}
