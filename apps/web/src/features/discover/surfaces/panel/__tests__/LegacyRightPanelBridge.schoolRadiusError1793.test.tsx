/**
 * Issue #1793 SR-024 (AC A1) — production-path proof that the school-radius error signal reaches
 * the school result panels: `buildPanelSurfaceModel`/`buildPanelSurfaceCommands` ->
 * `LegacyRightPanelBridge` -> the REAL `DiscoverRightPanel` -> `SchoolJourneyPanel` ->
 * `SchoolSelectedPanel` / `AreaSchoolCombinedPanel` -> `SchoolRadiusListings`.
 *
 * Like LegacyRightPanelBridge.anonViewportRetry.test.tsx, this deliberately does NOT mock
 * `DiscoverRightPanel`, so removing the surface/contract wiring (the view field, the command, or
 * either builder's forwarding) turns it red. Retry must be the REAL `refetchSchoolRadiusListings`
 * handed to the builder, not a no-op.
 */
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
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
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

import { LegacyRightPanelBridge } from '../LegacyRightPanelBridge';
import { buildPanelSurfaceModel, buildPanelSurfaceCommands } from '../../buildPanelSurfaceModel';
import type { BuildPanelSurfaceModelParams } from '../../buildPanelSurfaceModel';

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

const SCHOOL: SchoolResult = {
  id: 'sch-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  latitude: 13.3531,
  longitude: 74.7935,
  address: 'Manipal, Udupi District',
  distanceKm: 0.5,
};

const AREA: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.3531,
  geo_center_lon: 74.7935,
  bbox: [[13.34, 74.78], [13.37, 74.81]],
};

const URL_STATE: DiscoverUrlState = {
  city: 'udupi',
  areaKey: null,
  viewport: null,
  filters: {},
  schoolId: 'sch-1',
  radiusKm: 3,
  q: '',
  journey: 'school-first',
  groupId: null,
  selectedGroup: null,
  intent: 'buy',
  scope: null,
};

// Only the members this render path touches are meaningful; the rest are inert stubs, exactly as in
// LegacyRightPanelBridge.anonViewportRetry.test.tsx.
const URL_ACTIONS: DiscoverUrlActions = {
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
  enterAgriJourneyAtArea: vi.fn(),
  commitAreaSet: vi.fn(),
};

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
    wasTruncated: false,
    resolutionNotice: null,
    nodeCount: null,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
  } as unknown as UseAreasNavigationJourneyResult;
}

type PanelContent = 'school-selected' | 'area-school-combined';
type SchoolRadiusState = { isError: boolean; loading: boolean };

/** SchoolRadiusListings' skeleton testid per variant (`selected` / `combined`). */
const SKELETON_TESTID: Record<PanelContent, string> = {
  'school-selected': 'listing-skeleton',
  'area-school-combined': 'combined-listing-skeleton',
};

/**
 * `isErrorSchoolRadiusListings` / `refetchSchoolRadiusListings` are the new #1793 mapData fields;
 * they are written through a spread so this FIXTURE (not the production types) is what is
 * exercised at red time, and the production Pick must accept them afterwards.
 */
function buildParams(
  panelContent: PanelContent,
  schoolRadius: { isError: boolean; refetch: () => void; loading?: boolean; listingDataLoading?: boolean },
): BuildPanelSurfaceModelParams {
  const nav: DiscoverUrlState = { ...URL_STATE };
  return {
    pageContext: {
      navigate: vi.fn(),
      isAuthenticated: false,
      nav,
      actions: URL_ACTIONS,
      isMobileShell: false,
      hostsHeaderControls: false,
      headerHostsJourneyTabs: false,
      mobileView: 'LIST',
      isAreaSetDraftOpen: false,
    },
    pageState: {
      city: nav.city,
      filters: {},
      handleFiltersChange: vi.fn(),
      handleCityChange: vi.fn(),
      handleAreaSelect: vi.fn(),
      handleRedrawPolygon: vi.fn(),
      selectedSchool: SCHOOL,
      page: 0,
      setPage: vi.fn(),
      resolvedPanelContent: panelContent,
      effectiveSelectedArea: panelContent === 'area-school-combined' ? AREA : null,
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
      isErrorAreaListings: false,
      refetchAreaListings: vi.fn(),
      isFetchingAreaListings: false,
      areasLoading: false,
      agriAreasData: undefined,
      isLoadingAgriAreas: false,
      isFetching: false,
      isLoading: false,
      // Anon: the school-radius feed is the card source and listingDataLoading is auth-only (false);
      // `schoolRadiusPanelLoading` is the anon school-radius query's own in-flight signal.
      listingDataLoading: schoolRadius.listingDataLoading ?? false,
      schoolRadiusPanelLoading: schoolRadius.loading ?? false,
      totalPages: 1,
      totalElements: 0,
      isAnonViewport: false,
      anonViewportListings: [],
      anonViewportListingsLoading: false,
      isErrorAnonViewport: false,
      refetchAnonViewport: vi.fn(),
      isErrorSchoolRadiusListings: schoolRadius.isError,
      refetchSchoolRadiusListings: schoolRadius.refetch,
    } as unknown as BuildPanelSurfaceModelParams['mapData'],
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
    journeyChrome: { trendsHref: '/trends/udupi' },
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
      <LegacyRightPanelBridge
        view={buildPanelSurfaceModel(params)}
        commands={buildPanelSurfaceCommands(params)}
      />
    </DiscoverProvider>,
    { router: 'browser' },
  );
}

describe.each<PanelContent>(['school-selected', 'area-school-combined'])(
  'LegacyRightPanelBridge (%s) — #1793 A1 school-radius request failure (production path)',
  (panelContent) => {
    it('a failed school-radius query renders the error block (not "no homes within N km") and Retry calls the REAL refetch exactly once', async () => {
      const user = userEvent.setup();
      const refetch = vi.fn();
      renderBridge(buildParams(panelContent, { isError: true, refetch }));

      expect(await screen.findByTestId('school-radius-listings-error')).toBeVisible();
      expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('school-radius-listings-error-retry'));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('control: a genuinely empty (non-error) school-radius result still renders the empty state', async () => {
      renderBridge(buildParams(panelContent, { isError: false, refetch: vi.fn() }));
      expect(await screen.findByTestId('school-radius-empty-state')).toBeVisible();
      expect(screen.queryByTestId('school-radius-listings-error')).not.toBeInTheDocument();
    });

    // PR-A review A1 — the loading window. listingDataLoading is auth-only (false for anon), so the
    // panel needs the school-radius query's OWN loading signal or it paints "No homes within N km"
    // while the request is pending / retrying.
    it('loading window: a pending (or retrying) anon school-radius query renders the skeleton, NOT the empty state or the error block', async () => {
      renderBridge(buildParams(panelContent, { isError: false, refetch: vi.fn(), loading: true }));
      expect((await screen.findAllByTestId(SKELETON_TESTID[panelContent])).length).toBeGreaterThan(0);
      expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();
      expect(screen.queryByTestId('school-radius-listings-error')).not.toBeInTheDocument();
    });

    it('pending -> failure -> Retry: skeleton, then the error block, then the skeleton again (the data-less refetch is pending) and never the empty state', async () => {
      const user = userEvent.setup();
      let settle: (s: SchoolRadiusState) => void = () => undefined;
      function Harness() {
        const [state, setState] = useState<SchoolRadiusState>({ isError: false, loading: true });
        settle = setState;
        const params = buildParams(panelContent, {
          ...state,
          // A REAL query returns to pending (loading, no error) when a data-less error is retried.
          refetch: () => setState({ isError: false, loading: true }),
        });
        return (
          <DiscoverProvider>
            <LegacyRightPanelBridge
              view={buildPanelSurfaceModel(params)}
              commands={buildPanelSurfaceCommands(params)}
            />
          </DiscoverProvider>
        );
      }
      renderWithProviders(<Harness />, { router: 'browser' });

      expect((await screen.findAllByTestId(SKELETON_TESTID[panelContent])).length).toBeGreaterThan(0);
      expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();

      act(() => settle({ isError: true, loading: false }));
      expect(await screen.findByTestId('school-radius-listings-error')).toBeVisible();
      expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('school-radius-listings-error-retry'));
      expect((await screen.findAllByTestId(SKELETON_TESTID[panelContent])).length).toBeGreaterThan(0);
      expect(screen.queryByTestId('school-radius-listings-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();
    });

    it('signed-in control (no behaviour change): the auth listingDataLoading still drives the skeleton when the panel signal is off, and neither signal on settles to the empty state', async () => {
      const { unmount } = renderBridge(
        buildParams(panelContent, { isError: false, refetch: vi.fn(), listingDataLoading: true, loading: false }),
      );
      expect((await screen.findAllByTestId(SKELETON_TESTID[panelContent])).length).toBeGreaterThan(0);
      expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();
      unmount();

      renderBridge(buildParams(panelContent, { isError: false, refetch: vi.fn(), listingDataLoading: false, loading: false }));
      expect(await screen.findByTestId('school-radius-empty-state')).toBeVisible();
    });
  },
);
