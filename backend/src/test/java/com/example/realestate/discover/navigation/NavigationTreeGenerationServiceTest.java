package com.example.realestate.discover.navigation;

import com.example.realestate.discover.citylaunch.AssignmentSource;
import com.example.realestate.discover.citylaunch.SandboxArea;
import com.example.realestate.discover.citylaunch.SandboxCityRegion;
import com.example.realestate.discover.citylaunch.SandboxCityRegionMembership;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
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
 *
 * <p>#2157: {@code NavigationTreeGenerationService} no longer reads canonical geography itself —
 * every fixture below builds the {@link SandboxArea}/{@link SandboxCityRegion}/{@link
 * SandboxCityRegionMembership} lists the service now consumes directly, including a real
 * {@code sandbox_area_id -> area_key} membership join (mirroring production, where {@link
 * SandboxCityRegionMembership} stores the FK, not the area_key).
 */
class NavigationTreeGenerationServiceTest {

    private static final Instant GENERATED_AT = Instant.parse("2026-08-05T00:00:00Z");
    private static final int CITY_ID = 1;
    private static final String CITY_SLUG = "testcity";
    private static final Long REVISION_ID = 100L;

    /** Six areas at max_direct_children=3 -> two depth-1 CLUSTERs of 3 areas each (mirrors
     * NavigationTreeGeneratorTest's collidingClusterNodeKeyIsDisambiguated fixture), so each
     * CLUSTER has one "extra" descendant area beyond its 2 representatives to swap reps onto. */
    private static SandboxArea area(long id, String areaKey, String name, double lat) {
        return area(id, areaKey, name, lat, "ACTIVE");
    }

    /** #2313: lifecycle-status-parameterized variant, used to build an INACTIVE (soft-excluded)
     * fixture alongside ACTIVE siblings. */
    private static SandboxArea area(long id, String areaKey, String name, double lat, String lifecycleStatus) {
        SandboxArea a = new SandboxArea(
                REVISION_ID, areaKey, name, "district", lat, 77.0, lat - 0.01, 76.99, lat + 0.01, 77.01,
                "OSM", "way", 1L, lifecycleStatus);
        setId(a, id);
        return a;
    }

    /** {@link SandboxArea#getId()} is DB-assigned in production (via {@code @GeneratedValue}); test
     * fixtures assign it via reflection so the {@code sandbox_area_id -> area_key} membership join
     * under test has real, distinct FK values to resolve, exactly as production rows would. */
    private static void setId(SandboxArea area, long id) {
        try {
            Field idField = SandboxArea.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(area, id);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private NavigationTreeGenerationService buildService(
            NavigationPolicyReader policyReader,
            NavigationTreeSandboxWriter sandboxWriter, SandboxNavigationOverrideRepository overrideRepository) {
        return new NavigationTreeGenerationService(
                policyReader, new NavigationTreeGenerator(),
                new NavigationTreeValidationService(), sandboxWriter, new NavigationTreeOverrideApplier(),
                overrideRepository);
    }

    private List<SandboxArea> sixAreas() {
        List<SandboxArea> areas = new ArrayList<>();
        areas.add(area(1L, "north|c1", "C1", 10.0));
        areas.add(area(2L, "north|c2", "C2", 10.1));
        areas.add(area(3L, "north|c3", "C3", 10.2));
        areas.add(area(4L, "north|c4", "C4", 20.0));
        areas.add(area(5L, "north|c5", "C5", 20.1));
        areas.add(area(6L, "north|c6", "C6", 20.2));
        return areas;
    }

    private List<SandboxCityRegion> oneRegion() {
        return List.of(new SandboxCityRegion(
                REVISION_ID, "north", "north", 1, null, null, null, null, null, null, null));
    }

    private List<SandboxCityRegionMembership> membershipsFor(List<SandboxArea> areas) {
        return areas.stream()
                .map(a -> new SandboxCityRegionMembership(
                        REVISION_ID, a.getId(), "north", AssignmentSource.AUTO))
                .toList();
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
        List<SandboxArea> areas = sixAreas();
        List<SandboxCityRegion> regions = oneRegion();
        List<SandboxCityRegionMembership> memberships = membershipsFor(areas);

        NavigationPolicyReader policyReader = mock(NavigationPolicyReader.class);
        when(policyReader.findPolicy(CITY_ID)).thenReturn(Optional.of(threeChildPolicy()));
        when(policyReader.findSortedDirectionLabelPairs(CITY_SLUG)).thenReturn(List.of());

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
                buildService(policyReader, sandboxWriter, overrideRepository);

        assertThatThrownBy(() -> service.generateAndStoreForRevision(
                REVISION_ID, CITY_ID, CITY_SLUG, areas, regions, memberships, GENERATED_AT))
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
        List<SandboxArea> areas = sixAreas();
        List<SandboxCityRegion> regions = oneRegion();
        List<SandboxCityRegionMembership> memberships = membershipsFor(areas);

        NavigationPolicyReader policyReader = mock(NavigationPolicyReader.class);
        when(policyReader.findPolicy(CITY_ID)).thenReturn(Optional.of(threeChildPolicy()));
        when(policyReader.findSortedDirectionLabelPairs(CITY_SLUG)).thenReturn(List.of());

        NavigationTreeSandboxWriter sandboxWriter = mock(NavigationTreeSandboxWriter.class);
        when(sandboxWriter.persist(org.mockito.ArgumentMatchers.eq(REVISION_ID), org.mockito.ArgumentMatchers.anyList()))
                .thenReturn(List.of(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L));

        SandboxNavigationOverrideRepository overrideRepository = mock(SandboxNavigationOverrideRepository.class);
        when(overrideRepository.findByRevisionIdOrderByApplyOrderAsc(REVISION_ID)).thenReturn(List.of());

        NavigationTreeGenerationService service =
                buildService(policyReader, sandboxWriter, overrideRepository);

        List<Long> ids = service.generateAndStoreForRevision(
                REVISION_ID, CITY_ID, CITY_SLUG, areas, regions, memberships, GENERATED_AT);

        assertThat(ids).isNotEmpty();
        verify(sandboxWriter).persist(org.mockito.ArgumentMatchers.eq(REVISION_ID), org.mockito.ArgumentMatchers.anyList());
    }

    // ── #2157 AC2: membership-count -> tree-leaf-coverage, and orphan-membership skip ──────────

    @Test
    @DisplayName("[#2157 AC2] every valid membership produces exactly one AREA leaf in the generated "
            + "tree, and the leaf area_key set is EXACTLY the membership-resolved area_key set — a "
            + "wholly-missing membership group (which the existing expectedAreaKeys/canonicalAreaKeys/"
            + "validRegionKeys checks would NOT catch, since those check area-presence constraints, "
            + "not \"every input membership produced output\") would fail this assertion")
    void generateAndStoreForRevision_membershipCountMatchesTreeLeafCoverage() {
        List<SandboxArea> areas = sixAreas();
        List<SandboxCityRegion> regions = oneRegion();
        List<SandboxCityRegionMembership> memberships = membershipsFor(areas);

        NavigationPolicyReader policyReader = mock(NavigationPolicyReader.class);
        when(policyReader.findPolicy(CITY_ID)).thenReturn(Optional.of(threeChildPolicy()));
        when(policyReader.findSortedDirectionLabelPairs(CITY_SLUG)).thenReturn(List.of());

        NavigationTreeSandboxWriter sandboxWriter = mock(NavigationTreeSandboxWriter.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<GeneratedNode>> captor = ArgumentCaptor.forClass(List.class);
        when(sandboxWriter.persist(eq(REVISION_ID), captor.capture()))
                .thenReturn(List.of(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L));

        SandboxNavigationOverrideRepository overrideRepository = mock(SandboxNavigationOverrideRepository.class);
        when(overrideRepository.findByRevisionIdOrderByApplyOrderAsc(REVISION_ID)).thenReturn(List.of());

        NavigationTreeGenerationService service = buildService(policyReader, sandboxWriter, overrideRepository);
        service.generateAndStoreForRevision(REVISION_ID, CITY_ID, CITY_SLUG, areas, regions, memberships, GENERATED_AT);

        List<GeneratedNode> generated = captor.getValue();
        List<GeneratedNode> areaLeaves = generated.stream().filter(n -> "AREA".equals(n.nodeType())).toList();

        assertThat(areaLeaves).hasSize(memberships.size());

        java.util.Map<Long, String> areaKeyById = areas.stream()
                .collect(Collectors.toMap(SandboxArea::getId, SandboxArea::getAreaKey));
        Set<String> expectedLeafAreaKeys = memberships.stream()
                .map(m -> areaKeyById.get(m.getSandboxAreaId()))
                .collect(Collectors.toSet());
        Set<String> actualLeafAreaKeys = areaLeaves.stream().map(GeneratedNode::areaKey).collect(Collectors.toSet());
        assertThat(actualLeafAreaKeys).isEqualTo(expectedLeafAreaKeys);
    }

    @Test
    @DisplayName("[#2157 AC2] a membership whose sandbox_area_id matches no passed SandboxArea (a "
            + "data-quality orphan) is SKIPPED — generation completes without throwing, the orphan "
            + "contributes NO node, and every remaining valid membership still gets its AREA leaf")
    void generateAndStoreForRevision_orphanMembershipIsSkippedNotFatal() {
        List<SandboxArea> areas = sixAreas();
        List<SandboxCityRegion> regions = oneRegion();
        List<SandboxCityRegionMembership> memberships = new ArrayList<>(membershipsFor(areas));
        // sandbox_area_id=999L matches no SandboxArea in `areas` — a data-quality orphan.
        memberships.add(new SandboxCityRegionMembership(REVISION_ID, 999L, "north", AssignmentSource.AUTO));

        NavigationPolicyReader policyReader = mock(NavigationPolicyReader.class);
        when(policyReader.findPolicy(CITY_ID)).thenReturn(Optional.of(threeChildPolicy()));
        when(policyReader.findSortedDirectionLabelPairs(CITY_SLUG)).thenReturn(List.of());

        NavigationTreeSandboxWriter sandboxWriter = mock(NavigationTreeSandboxWriter.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<GeneratedNode>> captor = ArgumentCaptor.forClass(List.class);
        when(sandboxWriter.persist(eq(REVISION_ID), captor.capture()))
                .thenReturn(List.of(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L));

        SandboxNavigationOverrideRepository overrideRepository = mock(SandboxNavigationOverrideRepository.class);
        when(overrideRepository.findByRevisionIdOrderByApplyOrderAsc(REVISION_ID)).thenReturn(List.of());

        NavigationTreeGenerationService service = buildService(policyReader, sandboxWriter, overrideRepository);

        // Must not throw despite the orphan membership.
        service.generateAndStoreForRevision(REVISION_ID, CITY_ID, CITY_SLUG, areas, regions, memberships, GENERATED_AT);

        List<GeneratedNode> generated = captor.getValue();
        List<GeneratedNode> areaLeaves = generated.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        // Exactly the 6 real areas — the orphan contributes zero leaves, and does not silently
        // corrupt the tree (no phantom area_key, no crash).
        assertThat(areaLeaves).hasSize(6);
        Set<String> leafAreaKeys = areaLeaves.stream().map(GeneratedNode::areaKey).collect(Collectors.toSet());
        Set<String> expectedAreaKeys = areas.stream().map(SandboxArea::getAreaKey).collect(Collectors.toSet());
        assertThat(leafAreaKeys).isEqualTo(expectedAreaKeys);
    }

    // ── #2313: soft-excluded (lifecycle_status != ACTIVE) areas must not enter the tree ───────────

    @Test
    @DisplayName("[#2313] a membership resolving to an INACTIVE SandboxArea (soft-excluded outlier, "
            + "e.g. Mukkidipeta) is SKIPPED exactly like a data-quality orphan — generation completes "
            + "without throwing, the INACTIVE area contributes NO node, and every ACTIVE sibling in "
            + "the same region still gets its AREA leaf")
    void generateAndStoreForRevision_inactiveAreaIsExcludedNotFatal() {
        List<SandboxArea> areas = new ArrayList<>(sixAreas());
        // A 7th area in the same region, soft-excluded via lifecycle_status — mirrors Mukkidipeta's
        // V129 migration (areas.lifecycle_status = 'INACTIVE'), not a hard delete.
        SandboxArea inactiveArea = area(7L, "north|outlier", "Outlier", 90.0, "INACTIVE");
        areas.add(inactiveArea);
        List<SandboxCityRegion> regions = oneRegion();
        List<SandboxCityRegionMembership> memberships = membershipsFor(areas);

        NavigationPolicyReader policyReader = mock(NavigationPolicyReader.class);
        when(policyReader.findPolicy(CITY_ID)).thenReturn(Optional.of(threeChildPolicy()));
        when(policyReader.findSortedDirectionLabelPairs(CITY_SLUG)).thenReturn(List.of());

        NavigationTreeSandboxWriter sandboxWriter = mock(NavigationTreeSandboxWriter.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<GeneratedNode>> captor = ArgumentCaptor.forClass(List.class);
        when(sandboxWriter.persist(eq(REVISION_ID), captor.capture()))
                .thenReturn(List.of(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L));

        SandboxNavigationOverrideRepository overrideRepository = mock(SandboxNavigationOverrideRepository.class);
        when(overrideRepository.findByRevisionIdOrderByApplyOrderAsc(REVISION_ID)).thenReturn(List.of());

        NavigationTreeGenerationService service = buildService(policyReader, sandboxWriter, overrideRepository);

        // Must not throw despite the INACTIVE area's membership resolving to no active SandboxArea.
        service.generateAndStoreForRevision(REVISION_ID, CITY_ID, CITY_SLUG, areas, regions, memberships, GENERATED_AT);

        List<GeneratedNode> generated = captor.getValue();
        List<GeneratedNode> areaLeaves = generated.stream().filter(n -> "AREA".equals(n.nodeType())).toList();
        // Exactly the 6 ACTIVE areas — the INACTIVE outlier contributes zero leaves.
        assertThat(areaLeaves).hasSize(6);
        Set<String> leafAreaKeys = areaLeaves.stream().map(GeneratedNode::areaKey).collect(Collectors.toSet());
        assertThat(leafAreaKeys).doesNotContain(inactiveArea.getAreaKey());
        Set<String> expectedAreaKeys = sixAreas().stream().map(SandboxArea::getAreaKey).collect(Collectors.toSet());
        assertThat(leafAreaKeys).isEqualTo(expectedAreaKeys);
    }

    // ── #2157 AC6: checksum/output determinism — empirically prove input order does not leak ────

    @Test
    @DisplayName("[#2157 AC6] identical sandbox geography fed to generateAndStoreForRevision in "
            + "RANDOMISED order (areas/regions/memberships independently shuffled) across 3 runs "
            + "produces STRUCTURALLY IDENTICAL generated node sets — empirically proving "
            + "NavigationTreeGenerator's own re-sorts (generateRegion's area_key sort, generateCity's "
            + "displayOrder+region_key sort) make this service's own map-iteration order irrelevant, "
            + "rather than merely asserting that claim")
    void generateAndStoreForRevision_randomisedInputOrder_producesIdenticalOutput() {
        List<SandboxArea> baseAreas = sixAreas();
        List<SandboxCityRegion> baseRegions = oneRegion();
        List<SandboxCityRegionMembership> baseMemberships = membershipsFor(baseAreas);

        NavigationPolicyReader policyReader = mock(NavigationPolicyReader.class);
        when(policyReader.findPolicy(CITY_ID)).thenReturn(Optional.of(threeChildPolicy()));
        when(policyReader.findSortedDirectionLabelPairs(CITY_SLUG)).thenReturn(List.of());

        SandboxNavigationOverrideRepository overrideRepository = mock(SandboxNavigationOverrideRepository.class);
        when(overrideRepository.findByRevisionIdOrderByApplyOrderAsc(REVISION_ID)).thenReturn(List.of());

        Random random = new Random(2157L);
        List<List<GeneratedNode>> runs = new ArrayList<>();
        for (int run = 0; run < 3; run++) {
            List<SandboxArea> shuffledAreas = new ArrayList<>(baseAreas);
            Collections.shuffle(shuffledAreas, random);
            List<SandboxCityRegion> shuffledRegions = new ArrayList<>(baseRegions);
            Collections.shuffle(shuffledRegions, random);
            List<SandboxCityRegionMembership> shuffledMemberships = new ArrayList<>(baseMemberships);
            Collections.shuffle(shuffledMemberships, random);

            NavigationTreeSandboxWriter sandboxWriter = mock(NavigationTreeSandboxWriter.class);
            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<GeneratedNode>> captor = ArgumentCaptor.forClass(List.class);
            when(sandboxWriter.persist(eq(REVISION_ID), captor.capture()))
                    .thenReturn(List.of(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L));

            NavigationTreeGenerationService service = buildService(policyReader, sandboxWriter, overrideRepository);
            service.generateAndStoreForRevision(
                    REVISION_ID, CITY_ID, CITY_SLUG, shuffledAreas, shuffledRegions, shuffledMemberships, GENERATED_AT);

            runs.add(sortedByNodeKey(captor.getValue()));
        }

        List<GeneratedNode> run0 = runs.get(0);
        assertThat(run0).isNotEmpty();
        for (int i = 1; i < runs.size(); i++) {
            assertThat(runs.get(i))
                    .as("run %d (randomised input order) must produce an IDENTICAL node set to run 0 — "
                            + "any divergence here means input order LEAKS into output, a production "
                            + "bug that must be reported (#2157 AC6), not silently patched", i)
                    .isEqualTo(run0);
        }
    }

    private static List<GeneratedNode> sortedByNodeKey(List<GeneratedNode> nodes) {
        return nodes.stream().sorted(Comparator.comparing(GeneratedNode::nodeKey)).collect(Collectors.toList());
    }
}
