/**
 * Issue #2216 — LegacyRightPanelBridge's `onSelectAreaKey` else/fallback
 * branch (the "area not yet loaded in discoverAreas" path, called by the
 * school-browse/school-group-areas panel content via `DiscoverRightPanel`)
 * previously wrote the legacy `urlActions.selectArea(areaKey)` param. It now
 * reverse-derives the AREA child's `nodeKey` off `areasNavigationJourney`
 * (newly threaded into this bridge's `view.navigation` destructuring — it
 * was already on the `DiscoverPanelSurfaceView` contract, just not read here)
 * and writes the canonical journey-preserving
 * `urlActions.goToNodeAndClearSchoolSelection(nodeKey)` — unconditionally,
 * with no journey-branch, because CorridorLandingPanel (the agri-first
 * landing panel rendered by the SAME `DiscoverRightPanel` leaf) never
 * destructures/reads its own `onSelectAreaKey` prop and so never invokes this
 * callback in practice (dead prop there — see the module doc + PR evidence).
 *
 * This suite renders the REAL `LegacyRightPanelBridge` (only its heaviest
 * leaf, `DiscoverRightPanel`, is mocked — mirroring
 * `LegacyRightPanelBridge.schoolFirstMarkerPreview.test.tsx`'s established
 * pattern) built through the real production `buildPanelSurfaceModel`/
 * `buildPanelSurfaceCommands` functions.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import type { DiscoverRightPanelProps } from '@/components/discover/DiscoverRightPanel';
import type { DiscoverUrlState, DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import type {
  DiscoverJourneyTransitionsView,
  DiscoverJourneyTransitionsCommands,
} from '@/features/discover/state/useDiscoverJourneyTransitions';
import type { DiscoverInteractionCommands } from '@/features/discover/state/useDiscoverInteractionState';
import type { SchoolsByAreaResponse } from '@/hooks/useSchoolsByArea';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

let capturedOnSelectAreaKey: ((areaKey: string) => void) | undefined;

vi.mock('@/components/discover/DiscoverRightPanel', () => ({
  DiscoverRightPanel: (props: DiscoverRightPanelProps) => {
    capturedOnSelectAreaKey = props.onSelectAreaKey;
    return <div data-testid="discover-right-panel-mock" data-panel-content={props.panelContent} />;
  },
}));

import { LegacyRightPanelBridge } from '../LegacyRightPanelBridge';
import { buildPanelSurfaceModel, buildPanelSurfaceCommands } from '../../buildPanelSurfaceModel';
import type { BuildPanelSurfaceModelParams } from '../../buildPanelSurfaceModel';

const URL_STATE: DiscoverUrlState = {
  city: 'bangalore',
  areaKey: null,
  viewport: null,
  filters: {},
  schoolId: null,
  radiusKm: null,
  q: '',
  journey: null,
  groupId: null,
  selectedGroup: null,
  intent: 'buy',
  scope: null,
};

function makeUrlActions(overrides: Partial<DiscoverUrlActions> = {}): DiscoverUrlActions {
  return {
    changeCity: vi.fn(),
    setCity: vi.fn(),
    selectArea: vi.fn(),
    deselectArea: vi.fn(),
    reportViewport: vi.fn(),
    setFiltersLive: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setSchoolParams: vi.fn(),
    clearSchoolSelection: vi.fn(),
    clearAreaSelection: vi.fn(),
    setSearchQuery: vi.fn(),
    clearAllFiltersAndSearch: vi.fn(),
    setJourney: vi.fn(),
    selectGroup: vi.fn(),
    setBoardFilters: vi.fn(),
    setCategoryFilters: vi.fn(),
    clearAreaContext: vi.fn(),
    clearSchoolContext: vi.fn(),
    startOver: vi.fn(),
    enterSchoolPicking: vi.fn(),
    clearSchoolPicking: vi.fn(),
    backToSchoolPicking: vi.fn(),
    enterGroupResults: vi.fn(),
    clearGroupResults: vi.fn(),
    selectRegionalGroup: vi.fn(),
    setRegion: vi.fn(),
    setScope: vi.fn(),
    setRegionWithMaxKm: vi.fn(),
    setMaxKm: vi.fn(),
    clearRegionAndMaxKm: vi.fn(),
    goToNode: vi.fn(),
    goToAncestorNode: vi.fn(),
    clearNode: vi.fn(),
    enterAreasJourney: vi.fn(),
    enterSchoolsJourney: vi.fn(),
    enterSchoolsJourneyAtArea: vi.fn(),
    buildNodeHref: vi.fn(),
    enterNodeListings: vi.fn(),
    clearNodeListings: vi.fn(),
    goToNodeAndClearSchoolSelection: vi.fn(),
    goToNodeAndClearAgriculturalLocality: vi.fn(),
    setSelectedListing: vi.fn(),
    clearSelectedListing: vi.fn(),
    setLocality: vi.fn(),
    clearLocality: vi.fn(),
    clearAgriFilters: vi.fn(),
    setIntent: vi.fn(),
    setSchoolJourney: vi.fn(),
    // Issue #2016 — result-scope commit.
    commitResultScope: vi.fn(),
    // Issue #1943 — singleton auto-advance REPLACE variant of goToNode.
    goToNodeReplacingCurrent: vi.fn(),
    // Issue #2017 — multi-area AREA_SET commit.
    commitAreaSet: vi.fn(),
    ...overrides,
  };
}

const JOURNEY_VIEW: DiscoverJourneyTransitionsView = {
  startOverTick: 0,
  composedResetMapTick: 0,
  areaRestoreTick: 0,
  cityRestoreTick: 0,
  boundedSearchTriggered: false,
  schoolFirstOnBack: undefined,
};

const JOURNEY_COMMANDS: DiscoverJourneyTransitionsCommands = {
  startOver: vi.fn(),
  selectSchoolById: vi.fn(),
  clearSchool: vi.fn(),
  clearArea: vi.fn(),
  changeRadius: vi.fn(),
  backLevel2: vi.fn(),
  backLevel1: vi.fn(),
  backLevel0: vi.fn(),
  resetBoundedSearch: vi.fn(),
  wrappedSchoolSelect: vi.fn(),
};

const INTERACTION_COMMANDS: DiscoverInteractionCommands = {
  hoverListing: vi.fn(),
  hoverArea: vi.fn(),
  setHighlightedAreas: vi.fn(),
  clearHighlightedAreas: vi.fn(),
};

const SCHOOLS_QUERY = {
  isLoading: false,
  isError: false,
  error: null,
  isFetching: false,
  refetch: vi.fn(),
} as unknown as UseInfiniteQueryResult<InfiniteData<SchoolsByAreaResponse>, Error>;

function makeAreasNavigationJourney(
  children: Array<{ nodeKey: string; areaKey: string | null }>,
): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node: { nodeKey: 'n:root', children: children.map((c) => ({ ...c, nodeType: 'AREA' })) } as never,
    levelKind: 'areas',
    children: [],
    wasTruncated: false,
    resolutionNotice: null,
    nodeCount: null,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
  } as unknown as UseAreasNavigationJourneyResult;
}

function buildParams(overrides: {
  urlState?: Partial<DiscoverUrlState>;
  actions?: DiscoverUrlActions;
  discoverAreas?: AreaPoint[];
  areasNavigationJourney?: UseAreasNavigationJourneyResult;
  handleAreaSelect?: ReturnType<typeof vi.fn>;
}): BuildPanelSurfaceModelParams {
  const nav: DiscoverUrlState = { ...URL_STATE, ...overrides.urlState };
  const actions = overrides.actions ?? makeUrlActions();
  return {
    pageContext: {
      navigate: vi.fn(),
      isAuthenticated: false,
      nav,
      actions,
      isMobileShell: false,
      mobileView: 'LIST',
    },
    pageState: {
      city: nav.city,
      filters: {},
      handleFiltersChange: vi.fn(),
      handleCityChange: vi.fn(),
      handleAreaSelect: overrides.handleAreaSelect ?? vi.fn(),
      // Issue #2018 slice 3 — 'Adjust boundary' seam, now part of PageStateSlice.
      handleRedrawPolygon: vi.fn(),
      selectedSchool: null,
      page: 0,
      setPage: vi.fn(),
      resolvedPanelContent: 'school-browse',
      effectiveSelectedArea: null,
    },
    navigation: {
      hoveredNavigationNodeKey: null,
      setHoveredNavigationNodeKey: vi.fn(),
      focusedClusterMemberAreaKeys: null,
      setFocusedClusterMemberAreaKeys: vi.fn(),
      isAreaFirstJourneyActive: nav.journey === 'area-first',
      isSchoolsNavNodeLevel: nav.journey === 'school-first' && !nav.areaKey && !nav.schoolId,
    },
    journeySwitch: {
      handleSelectJourney: vi.fn(),
      selectGroupMemberArea: vi.fn(),
      isResolvingGroupMemberArea: false,
    },
    overviewNavigation: {
      activeAreasNavigationJourney: overrides.areasNavigationJourney ?? makeAreasNavigationJourney([]),
    },
    areaGroups: {
      areaGroupsData: undefined,
      isLoadingAreaGroups: false,
      selectedGroupName: null,
      focusedGroup: null,
    },
    geography: {
      discoverAreasForPanel: [],
      areaMarkerCounts: { shown: 0, total: 0 },
      scopeNamespaces: { regionKeys: new Set(), groupSlugs: new Set() },
      summaryRegions: [],
      regionScopedGroupsData: undefined,
      isLoadingRegionScopedGroups: false,
      isRegionScopedGroupsError: false,
      refetchRegionScopedGroups: vi.fn(),
    },
    mapData: {
      discoverAreas: overrides.discoverAreas ?? [],
      areaListings: [],
      isLoadingAreaListings: false,
      isErrorAreaListings: false,
      refetchAreaListings: vi.fn(),
      isFetchingAreaListings: false,
      areasLoading: false,
      agriAreasData: undefined,
      isLoadingAgriAreas: false,
      isFetching: false,
      isLoading: false,
      listingDataLoading: false,
      totalPages: 1,
      totalElements: 0,
      // Issue #2015 (caller-wiring follow-up) — anon "Search this area"
      // (VIEWPORT scope) reconciled-cards fields, threaded through the panel
      // surface model.
      isAnonViewport: false,
      anonViewportListings: [],
      anonViewportListingsLoading: false,
      isErrorAnonViewport: false,
      refetchAnonViewport: vi.fn(),
    },
    agri: {
      corridorGroups: [],
      isLoadingRegionalAreaGroups: false,
      isRegionalAreaGroupsError: false,
      isRegionalAreaGroupsNotGeneratedForRevision: false,
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
      journeyView: JOURNEY_VIEW,
      journeyCommands: JOURNEY_COMMANDS,
      handleAreaFirstBack: vi.fn(),
      schools: [],
      schoolsQuery: SCHOOLS_QUERY,
      schoolListings: [],
    },
    badge: { areaResultSummaryText: null, cityTotal: 0 },
    journeyChrome: { trendsHref: '/trends/bangalore' },
    filterChrome: { activeContextChips: null, filtersContent: null },
    interaction: {
      interactionCommands: INTERACTION_COMMANDS,
      setAreaSearchQuery: vi.fn(),
      highlightedAreaKeys: [],
    },
    regionGuide: {
      armRegionSelect: vi.fn(),
      regionGuideRingActive: false,
      regionSelectNonce: 0,
      prefersReducedMotion: false,
    },
    mapLayer: { regionOverviewMarkerKind: null, cityHasNoListings: false },
    boundedBrowse: { searchQuery: '', handleSearchChange: vi.fn() },
    boundedSearch: { handleBoundedSearch: vi.fn() },
    marker: { selectedMarkerListing: null, clearSelectedMarkerListing: vi.fn() },
    mobilePresentation: { setSelectedListingPreview: vi.fn() },
  };
}

function renderBridge(params: BuildPanelSurfaceModelParams) {
  return render(
    <LegacyRightPanelBridge
      view={buildPanelSurfaceModel(params)}
      commands={buildPanelSurfaceCommands(params)}
    />,
  );
}

describe('LegacyRightPanelBridge onSelectAreaKey fallback (issue #2216)', () => {
  it('matched area routes through handleAreaSelect, never a URL-writer action', () => {
    capturedOnSelectAreaKey = undefined;
    const match = { areaKey: 'a:loaded' } as AreaPoint;
    const handleAreaSelect = vi.fn();
    const actions = makeUrlActions();

    renderBridge(
      buildParams({
        urlState: { journey: 'school-first' },
        discoverAreas: [match],
        handleAreaSelect,
        actions,
      }),
    );

    capturedOnSelectAreaKey?.('a:loaded');
    expect(handleAreaSelect).toHaveBeenCalledWith(match);
    expect(actions.selectArea).not.toHaveBeenCalled();
    expect(actions.goToNodeAndClearSchoolSelection).not.toHaveBeenCalled();
  });

  it('unmatched area (not yet in discoverAreas) falls back to goToNodeAndClearSchoolSelection with the reverse-derived nodeKey', () => {
    capturedOnSelectAreaKey = undefined;
    const actions = makeUrlActions();
    const journey = makeAreasNavigationJourney([{ nodeKey: 'n:not-loaded', areaKey: 'a:not-loaded' }]);

    renderBridge(
      buildParams({
        urlState: { journey: 'school-first' },
        discoverAreas: [],
        areasNavigationJourney: journey,
        actions,
      }),
    );

    capturedOnSelectAreaKey?.('a:not-loaded');
    expect(actions.goToNodeAndClearSchoolSelection).toHaveBeenCalledWith('n:not-loaded');
    expect(actions.selectArea).not.toHaveBeenCalled();
  });

  it('fail-closed no-op: areaKey with no corresponding node.children entry never writes any URL action, legacy or canonical', () => {
    capturedOnSelectAreaKey = undefined;
    const actions = makeUrlActions();
    const journey = makeAreasNavigationJourney([{ nodeKey: 'n:other', areaKey: 'a:other' }]);

    renderBridge(
      buildParams({
        urlState: { journey: 'school-first' },
        discoverAreas: [],
        areasNavigationJourney: journey,
        actions,
      }),
    );

    capturedOnSelectAreaKey?.('a:unresolvable');
    expect(actions.selectArea).not.toHaveBeenCalled();
    expect(actions.goToNodeAndClearSchoolSelection).not.toHaveBeenCalled();
  });

  // Regression — proves the new `areasNavigationJourney` destructuring this PR
  // adds to `view.navigation` doesn't break rendering for the agri-first
  // landing state (CorridorLandingPanel), and that onSelectAreaKey is still
  // forwarded unconditionally exactly as before (CorridorLandingPanel itself
  // never reads/invokes it — dead prop, see module-level doc comment above).
  it('agri-first corridor-landing panel content renders without error with the newly-threaded areasNavigationJourney in scope', () => {
    capturedOnSelectAreaKey = undefined;
    const actions = makeUrlActions();

    const { getByTestId } = render(
      <LegacyRightPanelBridge
        view={buildPanelSurfaceModel(
          buildParams({
            urlState: { journey: 'agri-first' },
            actions,
          }),
        )}
        commands={buildPanelSurfaceCommands(
          buildParams({
            urlState: { journey: 'agri-first' },
            actions,
          }),
        )}
      />,
    );

    expect(getByTestId('discover-right-panel-mock')).toBeInTheDocument();
    // onSelectAreaKey is still forwarded to the leaf (unchanged surface area);
    // CorridorLandingPanel simply never calls it (out of scope here).
    expect(capturedOnSelectAreaKey).toBeInstanceOf(Function);
  });
});
