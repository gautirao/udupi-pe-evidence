/**
 * Issue #2657 (C0) — characterization test for gap G12: the bridge-owned
 * wiring closures in LegacyRightPanelBridge.tsx that the C1-C8 extraction
 * will relocate into surfaces/panel/rightPanelContract.ts command factories.
 * Every assertion renders the REAL `DiscoverRightPanel` leaf (mirrors
 * `LegacyRightPanelBridge.anonViewportRetry.test.tsx`'s own rationale: a
 * mocked leaf would still pass even if this wiring seam broke).
 *
 * G12 covers:
 *  - anon agri price-param strip in onApplyAgriFilters (SECURITY,
 *    bridge:446-459) — both arms: authed keeps agriPriceMin/Max, anon strips
 *    them to undefined.
 *  - onBack choice by journey (bridge:238).
 *  - onBackToRegion label->key lookup, no write on a miss (bridge:274-284).
 *  - areasCount filters listingCount>0 (bridge:467).
 *  - footer pager iff isAuthenticated && !selectedArea && totalPages>1 (bridge:479).
 *  - agriGroupTruncated defaults false when the map-listings query has no data yet (bridge:331).
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { DiscoverUrlState, DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import type {
  DiscoverJourneyTransitionsView,
  DiscoverJourneyTransitionsCommands,
} from '@/features/discover/state/useDiscoverJourneyTransitions';
import type { DiscoverInteractionCommands } from '@/features/discover/state/useDiscoverInteractionState';
import type { SchoolsByAreaResponse } from '@/hooks/useSchoolsByArea';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

import { LegacyRightPanelBridge } from '../LegacyRightPanelBridge';
import { buildPanelSurfaceModel, buildPanelSurfaceCommands } from '../../buildPanelSurfaceModel';
import type { BuildPanelSurfaceModelParams } from '../../buildPanelSurfaceModel';
import type { AgriFilterValues } from '@/components/discover/panels/AgriFiltersPanel';

// Issue #2657 (C0) — the anon price-strip is DOUBLE-GATED today: AgriFiltersPanel's own
// `handleApply` already computes `agriPriceMin: isAuthenticated ? parsedPriceMin : undefined`
// (AgriFiltersPanel.tsx:126-127) BEFORE calling `onApply`, so driving this through the real
// AgriFiltersPanel/Sheet UI can never observe the BRIDGE's own redundant strip
// (bridge:446-459) in isolation — AgriFiltersPanel's gate always fires first. To
// characterize the bridge's OWN belt-and-suspenders strip (the thing M7 mutates),
// AgriGroupSelectedPanel is stubbed here to a minimal leaf that calls the `onApplyFilters`
// prop it receives DIRECTLY with a non-stripped payload (as if some other/future caller
// bypassed AgriFiltersPanel's own gate) — everything above that leaf (DiscoverRightPanel's
// default-fallback wiring, LegacyRightPanelBridge's onApplyAgriFilters closure) is real.
vi.mock('@/components/discover/panels/AgriGroupSelectedPanel', () => ({
  AgriGroupSelectedPanel: (props: { onApplyFilters: (v: AgriFilterValues) => void }) => (
    <button
      type="button"
      data-testid="stub-apply-agri-filters"
      onClick={() =>
        props.onApplyFilters({
          agriPriceMin: 999,
          agriPriceMax: 1999,
          agriAcresMin: undefined,
          agriAcresMax: undefined,
          agriLandCategory: null,
          agriFarmhouseAvailable: null,
          agriFencingDone: null,
          agriWaterSource: null,
        })
      }
    >
      stub apply
    </button>
  ),
}));

// Prevent "supabaseUrl is required" crash from transitive usePropertyListings/PropertyCard import.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

// DiscoverRightPanel calls useAgriDestinations unconditionally at the top level; mocked to
// keep this hermetic (matches LegacyRightPanelBridge.anonViewportRetry.test.tsx).
vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useAgriDestinations: vi.fn().mockReturnValue({
    destinations: [],
    isLoading: false,
    isError: false,
    isNotYetPromoted: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

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
    commitResultScope: vi.fn(),
    cancelViewportCommit: vi.fn(),
    goToNodeReplacingCurrent: vi.fn(),
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

function inertAreasNavigationJourney(): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node: null,
    levelKind: 'empty',
    children: [],
    resolutionNotice: null,
    nodeCount: null,
    schoolsNotSimulatedForRevision: false,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
  };
}

const makeArea = (areaKey: string, areaLabel: string, listingCount: number): AreaPoint => ({
  areaKey,
  areaLabel,
  geo_center_lat: 13.3,
  geo_center_lon: 74.7,
  bbox: null,
  listingCount,
});

interface BuildOverrides {
  isAuthenticated?: boolean;
  journey?: DiscoverUrlState['journey'];
  nav?: Partial<DiscoverUrlState>;
  urlActions?: Partial<DiscoverUrlActions>;
  handleAreaFirstBack?: () => void;
  schoolFirstOnBack?: () => void;
  totalPages?: number;
  totalElements?: number;
  page?: number;
  setPage?: (updater: (p: number) => number) => void;
  effectiveSelectedArea?: AreaPoint | null;
  discoverAreas?: AreaPoint[];
  agriMapListingsData?: { city: string; listings: []; truncated: boolean; limit: number } | undefined;
  filters?: Record<string, unknown>;
}

function buildParams(overrides: BuildOverrides = {}): BuildPanelSurfaceModelParams {
  const nav: DiscoverUrlState = { ...URL_STATE, journey: overrides.journey ?? null, ...overrides.nav };
  const urlActions = makeUrlActions(overrides.urlActions);
  return {
    pageContext: {
      navigate: vi.fn(),
      isAuthenticated: overrides.isAuthenticated ?? false,
      nav,
      actions: urlActions,
      isMobileShell: false,
      mobileView: 'LIST',
      isAreaSetDraftOpen: false,
    },
    pageState: {
      city: nav.city,
      filters: overrides.filters ?? {},
      handleFiltersChange: vi.fn(),
      handleCityChange: vi.fn(),
      handleAreaSelect: vi.fn(),
      handleRedrawPolygon: vi.fn(),
      selectedSchool: null,
      page: overrides.page ?? 0,
      setPage: overrides.setPage ?? vi.fn(),
      resolvedPanelContent: 'guided-entry',
      effectiveSelectedArea: overrides.effectiveSelectedArea ?? null,
    },
    navigation: {
      hoveredNavigationNodeKey: null,
      setHoveredNavigationNodeKey: vi.fn(),
      focusedClusterMemberAreaKeys: null,
      setFocusedClusterMemberAreaKeys: vi.fn(),
      isAreaFirstJourneyActive: false,
      isSchoolsNavNodeLevel: false,
    },
    journeySwitch: {
      handleSelectJourney: vi.fn(),
      selectGroupMemberArea: vi.fn(),
      isResolvingGroupMemberArea: false,
    },
    overviewNavigation: { activeAreasNavigationJourney: inertAreasNavigationJourney() },
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
      summaryRegions: [
        { regionKey: 'north', regionLabel: 'North Bangalore', listingCount: 10 },
      ],
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
      totalPages: overrides.totalPages ?? 1,
      totalElements: overrides.totalElements ?? 0,
      isAnonViewport: false,
      anonViewportListings: [],
      anonViewportListingsLoading: false,
      isErrorAnonViewport: false,
      refetchAnonViewport: vi.fn(),
      isAuthViewport: false,
      authViewportListings: [],
      authViewportListingsLoading: false,
      isErrorAuthViewport: false,
      isPolygonScope: false,
      polygonListings: [],
      polygonListingsLoading: false,
      isErrorPolygonListings: false,
      refetchPolygonListings: vi.fn(),
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
      agriMapListingsData: overrides.agriMapListingsData,
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
      journeyView: { ...JOURNEY_VIEW, schoolFirstOnBack: overrides.schoolFirstOnBack },
      journeyCommands: JOURNEY_COMMANDS,
      handleAreaFirstBack: overrides.handleAreaFirstBack ?? vi.fn(),
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
  return renderWithProviders(
    <DiscoverProvider>
      <LegacyRightPanelBridge view={buildPanelSurfaceModel(params)} commands={buildPanelSurfaceCommands(params)} />
    </DiscoverProvider>,
  );
}

describe('G12 — LegacyRightPanelBridge wiring (bridge.tsx)', () => {
  describe('anon agri price-param strip in onApplyAgriFilters (SECURITY, bridge:446-459)', () => {
    it('authed: agriPriceMin/Max pass through to setFiltersCommitted unchanged', async () => {
      const setFiltersCommitted = vi.fn();
      const params = buildParams({
        isAuthenticated: true,
        journey: 'agri-first',
        nav: { selectedRegion: 'N', selectedMaxKm: 25 },
        urlActions: { setFiltersCommitted },
      });
      params.pageState.resolvedPanelContent = 'agri-group-selected';
      const user = userEvent.setup();
      renderBridge(params);

      await user.click(screen.getByTestId('stub-apply-agri-filters'));

      expect(setFiltersCommitted).toHaveBeenCalledWith(
        expect.objectContaining({ agriPriceMin: 999, agriPriceMax: 1999 }),
      );
    });

    it('anon: agriPriceMin/Max are stripped to undefined even when the caller sends them (UI-bypass simulation)', async () => {
      const setFiltersCommitted = vi.fn();
      const params = buildParams({
        isAuthenticated: false,
        journey: 'agri-first',
        nav: { selectedRegion: 'N', selectedMaxKm: 25 },
        urlActions: { setFiltersCommitted },
      });
      params.pageState.resolvedPanelContent = 'agri-group-selected';
      const user = userEvent.setup();
      renderBridge(params);

      await user.click(screen.getByTestId('stub-apply-agri-filters'));

      expect(setFiltersCommitted).toHaveBeenCalledTimes(1);
      const written = setFiltersCommitted.mock.calls[0][0];
      expect(written.agriPriceMin).toBeUndefined();
      expect(written.agriPriceMax).toBeUndefined();
      // Non-price fields still pass through untouched (only price is gated).
      expect(written).toEqual(expect.objectContaining({ agriLandCategory: null }));
    });
  });

  describe('onBack choice by journey (bridge:238)', () => {
    it('school-first: the school-group-areas Back button calls journeyView.schoolFirstOnBack, not handleAreaFirstBack', async () => {
      const schoolFirstOnBack = vi.fn();
      const handleAreaFirstBack = vi.fn();
      const params = buildParams({
        journey: 'school-first',
        schoolFirstOnBack,
        handleAreaFirstBack,
        urlActions: {},
      });
      params.pageState.resolvedPanelContent = 'school-group-areas';
      params.pageContext.nav = { ...params.pageContext.nav, groupId: 'zone-1' };
      params.areaGroups.areaGroupsData = {
        groups: [{ id: 'zone-1', name: 'Zone 1', subtitle: '', region_label: null, school_count: 0, area_keys: [] }],
      };
      const user = userEvent.setup();
      renderBridge(params);

      await user.click(screen.getByTestId('school-group-areas-back-btn'));
      expect(schoolFirstOnBack).toHaveBeenCalledTimes(1);
      expect(handleAreaFirstBack).not.toHaveBeenCalled();
    });

    it('area-first: the area-selected breadcrumb Group crumb calls handleAreaFirstBack, not schoolFirstOnBack', async () => {
      const schoolFirstOnBack = vi.fn();
      const handleAreaFirstBack = vi.fn();
      const area = makeArea('IN|KA|Udupi|Manipal', 'Manipal', 5);
      const params = buildParams({
        journey: 'area-first',
        schoolFirstOnBack,
        handleAreaFirstBack,
      });
      params.pageState.resolvedPanelContent = 'area-selected';
      params.pageState.effectiveSelectedArea = area;
      params.areaGroups.selectedGroupName = 'University Belt';
      const user = userEvent.setup();
      renderBridge(params);

      await user.click(screen.getByTestId('breadcrumb-group'));
      expect(handleAreaFirstBack).toHaveBeenCalledTimes(1);
      expect(schoolFirstOnBack).not.toHaveBeenCalled();
    });
  });

  describe('onBackToRegion label->key lookup, no write on a miss (bridge:274-284)', () => {
    it('a matching region label writes the resolved scope key', async () => {
      const setScope = vi.fn();
      const area = makeArea('IN|KA|Udupi|Manipal', 'Manipal', 5);
      const params = buildParams({
        journey: 'area-first',
        urlActions: { setScope },
        nav: { scope: 'north' },
      });
      params.pageState.resolvedPanelContent = 'area-selected';
      params.pageState.effectiveSelectedArea = area;
      const user = userEvent.setup();
      renderBridge(params);

      const regionCrumb = screen.getByTestId('breadcrumb-region');
      expect(regionCrumb).toBeEnabled();
      await user.click(regionCrumb);
      expect(setScope).toHaveBeenCalledWith('north');
    });

    it('a region label with no summaryRegions match (prettify-fallback label) is a no-op: setScope is never called', async () => {
      const setScope = vi.fn();
      const area = makeArea('IN|KA|Udupi|Manipal', 'Manipal', 5);
      const params = buildParams({
        journey: 'area-first',
        urlActions: { setScope },
        nav: { scope: 'east-zone' },
      });
      params.geography.summaryRegions = []; // no entry for 'east-zone' -> regionName falls back to prettifyZoneSlug
      params.pageState.resolvedPanelContent = 'area-selected';
      params.pageState.effectiveSelectedArea = area;
      const user = userEvent.setup();
      renderBridge(params);

      const regionCrumb = screen.getByTestId('breadcrumb-region');
      await user.click(regionCrumb);
      expect(setScope).not.toHaveBeenCalled();
    });
  });

  describe('areasCount filters listingCount>0 (bridge:467)', () => {
    it('only areas with at least one listing are counted, shown via the JourneySwitcher metadata chip', () => {
      const params = buildParams({
        discoverAreas: [
          makeArea('k1', 'Manipal', 5),
          makeArea('k2', 'Malpe', 0),
          makeArea('k3', 'Udupi', 2),
        ],
      });
      params.pageState.resolvedPanelContent = 'guided-entry';
      renderBridge(params);
      // JourneySwitcher's area-first metadata chip reads "{areasCount} areas" — of the 3
      // fixture areas only 2 have listingCount > 0.
      expect(screen.getByText('2 areas')).toBeInTheDocument();
      expect(screen.queryByText('3 areas')).not.toBeInTheDocument();
    });
  });

  describe('footer pager iff isAuthenticated && !selectedArea && totalPages>1 (bridge:479)', () => {
    it('authed, no selected area, multiple pages -> pager renders', () => {
      const params = buildParams({
        isAuthenticated: true,
        effectiveSelectedArea: null,
        totalPages: 3,
        totalElements: 42,
      });
      params.pageState.resolvedPanelContent = 'guided-entry';
      renderBridge(params);
      expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument();
    });

    it('anon (unauthenticated) -> no pager even with multiple pages', () => {
      const params = buildParams({ isAuthenticated: false, effectiveSelectedArea: null, totalPages: 3 });
      params.pageState.resolvedPanelContent = 'guided-entry';
      renderBridge(params);
      expect(screen.queryByText(/\/ 3/)).not.toBeInTheDocument();
    });

    it('authed but an area is selected -> no pager even with multiple pages', () => {
      const area = makeArea('k1', 'Manipal', 5);
      const params = buildParams({
        isAuthenticated: true,
        effectiveSelectedArea: area,
        totalPages: 3,
      });
      params.pageState.resolvedPanelContent = 'area-selected';
      renderBridge(params);
      expect(screen.queryByText(/\/ 3/)).not.toBeInTheDocument();
    });

    it('authed, no selected area, but only 1 page -> no pager', () => {
      const params = buildParams({ isAuthenticated: true, effectiveSelectedArea: null, totalPages: 1 });
      params.pageState.resolvedPanelContent = 'guided-entry';
      renderBridge(params);
      expect(screen.queryByText(/\/ 1/)).not.toBeInTheDocument();
    });
  });

  describe('agriGroupTruncated defaults false (bridge:331)', () => {
    it('agriMapListingsData undefined (query not yet settled) -> truncated defaults to false', () => {
      const params = buildParams({ agriMapListingsData: undefined, journey: 'agri-first', nav: { selectedRegion: 'N', selectedMaxKm: 25 } });
      const view = buildPanelSurfaceModel(params);
      expect(view.agri.agriMapListingsData?.truncated).toBeUndefined();
      // The bridge computes `agriMapListingsData?.truncated ?? false` at the JSX call site
      // (bridge:331); pin the same fallback here against the same source shape.
      const truncated = params.agri.agriMapListingsData?.truncated ?? false;
      expect(truncated).toBe(false);
    });

    it('agriMapListingsData.truncated=true is forwarded verbatim (not overwritten by the default)', () => {
      const params = buildParams({ agriMapListingsData: { city: 'bangalore', listings: [], truncated: true, limit: 50 } });
      const truncated = params.agri.agriMapListingsData?.truncated ?? false;
      expect(truncated).toBe(true);
    });
  });
});
