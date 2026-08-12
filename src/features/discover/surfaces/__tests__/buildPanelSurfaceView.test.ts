import { describe, expect, it, vi } from 'vitest';
import {
  buildPanelSurfaceView,
  buildPanelSurfaceCommands,
  type BuildPanelSurfaceViewParams,
  type BuildPanelSurfaceCommandsParams,
} from '../buildPanelSurfaceView';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

function makeJourney(): UseAreasNavigationJourneyResult {
  return {
    node: null,
    children: [],
    selectNode: vi.fn(),
  } as unknown as UseAreasNavigationJourneyResult;
}

function makeViewParams(
  overrides: Partial<BuildPanelSurfaceViewParams> = {},
): BuildPanelSurfaceViewParams {
  return {
    resolvedPanelContent: 'landing' as BuildPanelSurfaceViewParams['resolvedPanelContent'],
    selectedMarkerListing: null,
    clearSelectedMarkerListing: vi.fn(),
    city: 'bangalore',
    activeContextChips: null,
    discoverAreas: [],
    selectedArea: null,
    areaListings: [],
    isLoadingAreaListings: false,
    isAuthenticated: false,
    handleAreaSelect: vi.fn(),
    areaResultSummaryText: null,
    journeyView: {} as BuildPanelSurfaceViewParams['journeyView'],
    handleAreaFirstBack: vi.fn(),
    journeyCommands: {} as BuildPanelSurfaceViewParams['journeyCommands'],
    areasLoading: false,
    agriAreasData: undefined,
    isLoadingAgriAreas: false,
    areaGroupsData: undefined,
    isLoadingAreaGroups: false,
    regionScopedGroups: undefined,
    isLoadingRegionScopedGroups: false,
    isRegionScopedGroupsError: false,
    refetchRegionScopedGroups: vi.fn(),
    scopeNamespaces: {} as BuildPanelSurfaceViewParams['scopeNamespaces'],
    armRegionSelect: vi.fn(),
    regionGuideRingActive: false,
    regionOverviewMarkerKind: 'default' as BuildPanelSurfaceViewParams['regionOverviewMarkerKind'],
    regionSelectNonce: 0,
    prefersReducedMotion: false,
    summaryRegions: [],
    selectedGroupName: null,
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
    discoverAreasForPanel: [],
    filtersContent: null,
    trendsHref: '/trends',
    isFetching: false,
    isLoading: false,
    searchQuery: '',
    handleSearchChange: vi.fn(),
    filters: {} as BuildPanelSurfaceViewParams['filters'],
    handleFiltersChange: vi.fn(),
    selectedSchool: null,
    schools: [],
    schoolsQuery: {} as BuildPanelSurfaceViewParams['schoolsQuery'],
    schoolListings: [],
    listingDataLoading: false,
    handleBoundedSearch: vi.fn(),
    interactionCommands: {} as BuildPanelSurfaceViewParams['interactionCommands'],
    setAreaSearchQuery: vi.fn(),
    areaMarkerCounts: { shown: 0, total: 0 },
    highlightedAreaKeys: [],
    selectedGroupListingItem: null,
    navigate: vi.fn(),
    cityTotal: 0,
    cityHasNoListings: false,
    handleCityChange: vi.fn(),
    groupResultsListings: [],
    isLoadingGroupResults: false,
    isGroupResultsError: false,
    groupResultsTotalElements: undefined,
    refetchGroupResults: vi.fn(),
    page: 0,
    totalPages: 1,
    totalElements: 0,
    setPage: vi.fn(),
    areasNavigationJourney: makeJourney(),
    hoveredNavigationNodeKey: null,
    onNavigationNodeHoverChange: vi.fn(),
    focusedClusterMemberAreaKeys: null,
    onClusterFocusChange: vi.fn(),
    onSelectedListingPreviewChange: vi.fn(),
    ...overrides,
  };
}

describe('buildPanelSurfaceView', () => {
  it('groups every field into its section without loss', () => {
    const view = buildPanelSurfaceView(makeViewParams({ city: 'bangalore', cityTotal: 99 }));
    expect(view.routing.city).toBe('bangalore');
    expect(view.routing.cityTotal).toBe(99);
    expect(view.navigation.resolvedPanelContent).toBe('landing');
  });

  it('preserves the schools group as a distinct, non-overlapping set of fields', () => {
    const view = buildPanelSurfaceView(makeViewParams({}));
    expect(view.schools).toEqual({
      selectedSchool: null,
      schools: [],
      schoolsQuery: {},
      schoolListings: [],
    });
  });

  it('preserves object identity for reference-typed fields (no deep-copy)', () => {
    const journey = makeJourney();
    const view = buildPanelSurfaceView(makeViewParams({ areasNavigationJourney: journey }));
    expect(view.navigation.areasNavigationJourney).toBe(journey);
  });
});

describe('buildPanelSurfaceCommands', () => {
  function makeCommandsParams(
    overrides: Partial<BuildPanelSurfaceCommandsParams> = {},
  ): BuildPanelSurfaceCommandsParams {
    return {
      handleCityChange: vi.fn(),
      navigate: vi.fn(),
      handleAreaSelect: vi.fn(),
      handleAreaFirstBack: vi.fn(),
      setAreaSearchQuery: vi.fn(),
      refetchRegionScopedGroups: vi.fn(),
      armRegionSelect: vi.fn(),
      refetchRegionalAreaGroups: vi.fn(),
      refetchGroupResults: vi.fn(),
      setPage: vi.fn(),
      handleBoundedSearch: vi.fn(),
      refetchAgriGroupListings: vi.fn(),
      handleFiltersChange: vi.fn(),
      handleSearchChange: vi.fn(),
      onNavigationNodeHoverChange: vi.fn(),
      onClusterFocusChange: vi.fn(),
      journeyCommands: {} as BuildPanelSurfaceCommandsParams['journeyCommands'],
      onSelectedListingPreviewChange: vi.fn(),
      clearSelectedMarkerListing: vi.fn(),
      interactionCommands: {} as BuildPanelSurfaceCommandsParams['interactionCommands'],
      ...overrides,
    };
  }

  it('groups commands into their sections with the same function references', () => {
    const params = makeCommandsParams();
    const commands = buildPanelSurfaceCommands(params);
    expect(commands.routing.handleCityChange).toBe(params.handleCityChange);
    expect(commands.geography.handleAreaSelect).toBe(params.handleAreaSelect);
    expect(commands.results.setPage).toBe(params.setPage);
    expect(commands.agri.refetchAgriGroupListings).toBe(params.refetchAgriGroupListings);
    expect(commands.filters.handleFiltersChange).toBe(params.handleFiltersChange);
    expect(commands.navigation.onClusterFocusChange).toBe(params.onClusterFocusChange);
    expect(commands.interaction.clearSelectedMarkerListing).toBe(params.clearSelectedMarkerListing);
  });
});
