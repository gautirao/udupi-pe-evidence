import { describe, expect, it, vi } from 'vitest';
import {
  buildPanelSurfaceModel,
  buildPanelSurfaceCommands,
  type BuildPanelSurfaceModelParams,
} from '../buildPanelSurfaceModel';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

/**
 * Issue #2142 (correction pass) — this fixture used to be a 67-field FLAT
 * literal, because that was the builder's input type. It is now shaped like
 * the controller results the builder actually consumes, which is the point of
 * the change: the round-trip through a hand-written flat interface is gone.
 *
 * The assertions themselves are unchanged in intent — grouping without loss,
 * the schools group staying distinct, reference identity preserved, and
 * commands landing in their sections as the SAME function references — plus
 * new coverage for the renames/derivations the builder now owns.
 */

function makeJourney(): UseAreasNavigationJourneyResult {
  return {
    node: null,
    children: [],
    selectNode: vi.fn(),
  } as unknown as UseAreasNavigationJourneyResult;
}

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> };

function makeParams(overrides: DeepPartial<BuildPanelSurfaceModelParams> = {}): BuildPanelSurfaceModelParams {
  const base: BuildPanelSurfaceModelParams = {
    pageContext: {
      navigate: vi.fn(),
      isAuthenticated: false,
      // Issue #2142 SOLID follow-up (commit 2) — the ambient values the panel
      // renderers used to read off the context facade themselves.
      nav: {} as BuildPanelSurfaceModelParams['pageContext']['nav'],
      actions: {} as BuildPanelSurfaceModelParams['pageContext']['actions'],
      isMobileShell: false,
      mobileView: 'LIST',
    },
    pageState: {
      city: 'bangalore',
      filters: {},
      handleFiltersChange: vi.fn(),
      handleCityChange: vi.fn(),
      handleAreaSelect: vi.fn(),
      selectedSchool: null,
      page: 0,
      setPage: vi.fn(),
      resolvedPanelContent: 'landing' as BuildPanelSurfaceModelParams['pageState']['resolvedPanelContent'],
      effectiveSelectedArea: null,
    },
    navigation: {
      hoveredNavigationNodeKey: null,
      setHoveredNavigationNodeKey: vi.fn(),
      focusedClusterMemberAreaKeys: null,
      setFocusedClusterMemberAreaKeys: vi.fn(),
      isAreaFirstJourneyActive: false,
      isSchoolsNavNodeLevel: false,
    },
    journeySwitch: { handleSelectJourney: vi.fn() },
    overviewNavigation: { activeAreasNavigationJourney: makeJourney() },
    areaGroups: { areaGroupsData: undefined, isLoadingAreaGroups: false, selectedGroupName: null },
    geography: {
      discoverAreasForPanel: [],
      areaMarkerCounts: { shown: 0, total: 0 },
      scopeNamespaces: {} as BuildPanelSurfaceModelParams['geography']['scopeNamespaces'],
      summaryRegions: [],
      regionScopedGroupsData: undefined,
      isLoadingRegionScopedGroups: false,
      isRegionScopedGroupsError: false,
      refetchRegionScopedGroups: vi.fn(),
    },
    mapData: {
      discoverAreas: [],
      areaListings: [],
      isLoadingAreaListings: false,
      areasLoading: false,
      agriAreasData: undefined,
      isLoadingAgriAreas: false,
      isFetching: false,
      isLoading: false,
      listingDataLoading: false,
      totalPages: 1,
      totalElements: 0,
    },
    agri: {
      corridorGroups: [],
      isLoadingRegionalAreaGroups: false,
      isRegionalAreaGroupsError: false,
      refetchRegionalAreaGroups: vi.fn(),
      selectedRegion: null,
      selectedMaxKm: null,
      filteredAgriListings: null,
      agriMapListingsData: undefined,
      isLoadingAgriGroupListings: false,
      isAgriGroupListingsError: false,
      agriGroupLabel: null,
      refetchAgriGroupListings: vi.fn(),
      selectedGroupListingItem: null,
    },
    results: {
      groupResultsListings: [],
      isLoadingGroupResults: false,
      isGroupResultsError: false,
      groupResultsTotalElements: undefined,
      refetchGroupResults: vi.fn(),
    },
    school: {
      journeyView: {} as BuildPanelSurfaceModelParams['school']['journeyView'],
      journeyCommands: {} as BuildPanelSurfaceModelParams['school']['journeyCommands'],
      handleAreaFirstBack: vi.fn(),
      schools: [],
      schoolsQuery: {} as BuildPanelSurfaceModelParams['school']['schoolsQuery'],
      schoolListings: [],
    },
    badge: { areaResultSummaryText: null, cityTotal: 0 },
    journeyChrome: { trendsHref: '/trends' },
    filterChrome: { activeContextChips: null, filtersContent: null },
    interaction: {
      interactionCommands: {} as BuildPanelSurfaceModelParams['interaction']['interactionCommands'],
      setAreaSearchQuery: vi.fn(),
      highlightedAreaKeys: [],
    },
    regionGuide: {
      armRegionSelect: vi.fn(),
      regionGuideRingActive: false,
      regionSelectNonce: 0,
      prefersReducedMotion: false,
    },
    mapLayer: {
      regionOverviewMarkerKind: 'default' as BuildPanelSurfaceModelParams['mapLayer']['regionOverviewMarkerKind'],
      cityHasNoListings: false,
    },
    boundedBrowse: { searchQuery: '', handleSearchChange: vi.fn() },
    boundedSearch: { handleBoundedSearch: vi.fn() },
    marker: { selectedMarkerListing: null, clearSelectedMarkerListing: vi.fn() },
    mobilePresentation: { setSelectedListingPreview: vi.fn() },
  };

  const merged = { ...base } as Record<string, unknown>;
  for (const [group, patch] of Object.entries(overrides)) {
    merged[group] = { ...((base as unknown as Record<string, Record<string, unknown>>)[group]), ...(patch as object) };
  }
  return merged as unknown as BuildPanelSurfaceModelParams;
}

describe('buildPanelSurfaceModel', () => {
  it('groups every field into its section without loss', () => {
    const view = buildPanelSurfaceModel(
      makeParams({ pageState: { city: 'bangalore' }, badge: { cityTotal: 99 } }),
    );
    expect(view.routing.city).toBe('bangalore');
    expect(view.routing.cityTotal).toBe(99);
    expect(view.navigation.resolvedPanelContent).toBe('landing');
  });

  it('preserves the schools group as a distinct, non-overlapping set of fields', () => {
    const view = buildPanelSurfaceModel(makeParams());
    expect(view.schools).toEqual({
      selectedSchool: null,
      schools: [],
      schoolsQuery: {},
      schoolListings: [],
    });
  });

  it('preserves object identity for reference-typed fields (no deep-copy)', () => {
    const journey = makeJourney();
    const view = buildPanelSurfaceModel(
      makeParams({ overviewNavigation: { activeAreasNavigationJourney: journey } }),
    );
    expect(view.navigation.areasNavigationJourney).toBe(journey);
  });

  // ── the renames/derivations the builder now owns ──
  it('maps pageState.effectiveSelectedArea onto the panel-facing `selectedArea` (the #2083 bridge, never the raw legacy value)', () => {
    const area = { areaKey: 'a:1' } as never;
    const view = buildPanelSurfaceModel(makeParams({ pageState: { effectiveSelectedArea: area } }));
    expect(view.geography.selectedArea).toBe(area);
  });

  it('projects geography.regionScopedGroupsData?.groups onto `regionScopedGroups`, tolerating an unresolved fetch', () => {
    const groups = [{ id: 'g1' }] as never;
    expect(
      buildPanelSurfaceModel(makeParams({ geography: { regionScopedGroupsData: { groups } as never } })).geography
        .regionScopedGroups,
    ).toBe(groups);
    expect(
      buildPanelSurfaceModel(makeParams({ geography: { regionScopedGroupsData: undefined } })).geography
        .regionScopedGroups,
    ).toBeUndefined();
  });

  // ── Issue #2142 SOLID follow-up (commit 3) — the agri/regionGuide regrouping ──
  // The five corridor fields + their refetch command are produced by
  // useDiscoverAgriController and consumed only by the agri corridor panels;
  // they used to be exposed under `geography` for no reason but adjacency in the
  // deleted flat interface. Values are unchanged — only the group path is.
  it('exposes the agri CORRIDOR fields under `agri`, not `geography`', () => {
    const corridorGroups = [{ directionCode: 'N' }] as never;
    const view = buildPanelSurfaceModel(
      makeParams({
        agri: {
          corridorGroups,
          isLoadingRegionalAreaGroups: true,
          isRegionalAreaGroupsError: true,
          selectedRegion: 'N',
          selectedMaxKm: 25,
        },
      }),
    );

    expect(view.agri.corridorGroups).toBe(corridorGroups);
    expect(view.agri.isLoadingRegionalAreaGroups).toBe(true);
    expect(view.agri.isRegionalAreaGroupsError).toBe(true);
    expect(view.agri.selectedRegion).toBe('N');
    expect(view.agri.selectedMaxKm).toBe(25);

    for (const field of [
      'corridorGroups',
      'isLoadingRegionalAreaGroups',
      'isRegionalAreaGroupsError',
      'selectedRegion',
      'selectedMaxKm',
    ]) {
      expect(view.geography).not.toHaveProperty(field);
    }
  });

  it('exposes the #1808 region-guidance signals under their own `regionGuide` group, not `geography`', () => {
    const view = buildPanelSurfaceModel(
      makeParams({
        regionGuide: { regionGuideRingActive: true, regionSelectNonce: 7 },
        mapLayer: { regionOverviewMarkerKind: 'zones' as never },
      }),
    );

    expect(view.regionGuide.regionGuideRingActive).toBe(true);
    expect(view.regionGuide.regionSelectNonce).toBe(7);
    expect(view.regionGuide.regionOverviewMarkerKind).toBe('zones');

    for (const field of ['regionGuideRingActive', 'regionSelectNonce', 'regionOverviewMarkerKind']) {
      expect(view.geography).not.toHaveProperty(field);
    }
  });

  it('carries the #2124 selectNode interception through by using the ACTIVE journey, not a raw one', () => {
    const active = makeJourney();
    const view = buildPanelSurfaceModel(
      makeParams({ overviewNavigation: { activeAreasNavigationJourney: active } }),
    );
    expect(view.navigation.areasNavigationJourney.selectNode).toBe(active.selectNode);
  });
});

describe('buildPanelSurfaceCommands', () => {
  it('groups commands into their sections with the same function references', () => {
    const params = makeParams();
    const commands = buildPanelSurfaceCommands(params);
    expect(commands.routing.handleCityChange).toBe(params.pageState.handleCityChange);
    expect(commands.geography.handleAreaSelect).toBe(params.pageState.handleAreaSelect);
    expect(commands.results.setPage).toBe(params.pageState.setPage);
    expect(commands.agri.refetchAgriGroupListings).toBe(params.agri.refetchAgriGroupListings);
    // Issue #2142 SOLID follow-up (commit 3) — the corridor refetch follows its
    // five view fields out of `geography` and into `agri`. `armRegionSelect`
    // does NOT: it is a region-PICK writer and stays in `commands.geography`.
    expect(commands.agri.refetchRegionalAreaGroups).toBe(params.agri.refetchRegionalAreaGroups);
    expect(commands.geography).not.toHaveProperty('refetchRegionalAreaGroups');
    expect(commands.geography.armRegionSelect).toBe(params.regionGuide.armRegionSelect);
    expect(commands.filters.handleFiltersChange).toBe(params.pageState.handleFiltersChange);
    expect(commands.interaction.clearSelectedMarkerListing).toBe(params.marker.clearSelectedMarkerListing);
  });

  it('renames the three lifted-state setters onto their panel-facing on* callbacks, by reference', () => {
    const params = makeParams();
    const commands = buildPanelSurfaceCommands(params);
    expect(commands.navigation.onNavigationNodeHoverChange).toBe(
      params.navigation.setHoveredNavigationNodeKey,
    );
    expect(commands.navigation.onClusterFocusChange).toBe(
      params.navigation.setFocusedClusterMemberAreaKeys,
    );
    expect(commands.navigation.onSelectedListingPreviewChange).toBe(
      params.mobilePresentation.setSelectedListingPreview,
    );
  });

  // Issue #2142 SOLID follow-up (commit 2) — the JourneySwitcher writer is now
  // a controller output threaded through this builder, not a closure the
  // surface builds itself.
  it('renames journeySwitch.handleSelectJourney onto the panel-facing `selectJourney`, by reference', () => {
    const params = makeParams();
    const commands = buildPanelSurfaceCommands(params);
    expect(commands.navigation.selectJourney).toBe(params.journeySwitch.handleSelectJourney);
  });

  // Issue #2142 SOLID follow-up (commit 2, PLAN REVIEW correction 3) — the
  // ambient page context is now carried by the contract, so the panel
  // renderers can stop reaching into the Discover context facade.
  it('carries the SAME nav/actions references through view.pageContext / commands.pageContext (no copy, no re-derivation)', () => {
    const params = makeParams();
    expect(buildPanelSurfaceModel(params).pageContext.nav).toBe(params.pageContext.nav);
    expect(buildPanelSurfaceCommands(params).pageContext.actions).toBe(params.pageContext.actions);
  });

  it('carries the mobile shell slice through view.pageContext', () => {
    const view = buildPanelSurfaceModel(
      makeParams({ pageContext: { isMobileShell: true, mobileView: 'MAP' } }),
    );
    expect(view.pageContext.isMobileShell).toBe(true);
    expect(view.pageContext.mobileView).toBe('MAP');
  });
});

// Issue #2142 SOLID follow-up (commit 2) — the two journey predicates the panel
// surface used to recompute from `useDiscoverNav()`; they now reach it through
// the navigation controller, unchanged in value.
describe('buildPanelSurfaceModel — journey predicates', () => {
  it('carries the navigation controller\'s isAreaFirstJourneyActive/isSchoolsNavNodeLevel into view.navigation', () => {
    const view = buildPanelSurfaceModel(
      makeParams({ navigation: { isAreaFirstJourneyActive: true, isSchoolsNavNodeLevel: false } }),
    );
    expect(view.navigation.isAreaFirstJourneyActive).toBe(true);
    expect(view.navigation.isSchoolsNavNodeLevel).toBe(false);

    const schoolsView = buildPanelSurfaceModel(
      makeParams({ navigation: { isAreaFirstJourneyActive: false, isSchoolsNavNodeLevel: true } }),
    );
    expect(schoolsView.navigation.isAreaFirstJourneyActive).toBe(false);
    expect(schoolsView.navigation.isSchoolsNavNodeLevel).toBe(true);
  });
});
