/**
 * Issue #1793 SR-024 PR-A R1 (WORKDONE_REVIEW) — legacy-bridge proof that the surrounding school
 * UI never claims a ZERO count while the anon school-radius request is failed or loading.
 *
 * Production path: `buildPanelSurfaceModel`/`buildPanelSurfaceCommands` -> `LegacyRightPanelBridge`
 * -> the REAL `DiscoverRightPanel` -> `SchoolSelectedPanel` / `AreaSchoolCombinedPanel` ->
 * `SchoolSummaryBand` + `SchoolRadiusListings` -> `RadiusChips`.
 * A genuine zero (200, no listings) and signed-in viewers keep their counts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
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


/**
 * `isErrorSchoolRadiusListings` / `refetchSchoolRadiusListings` are the new #1793 mapData fields;
 * they are written through a spread so this FIXTURE (not the production types) is what is
 * exercised at red time, and the production Pick must accept them afterwards.
 */
function buildParams(
  panelContent: PanelContent,
  schoolRadius: {
    isError: boolean;
    refetch: () => void;
    loading?: boolean;
    listingDataLoading?: boolean;
    isAuthenticated?: boolean;
    /** #1793 PR-C — the card source's own settled signal + the anon page-cap flag. */
    settled?: boolean;
    hasMore?: boolean;
  },
): BuildPanelSurfaceModelParams {
  const nav: DiscoverUrlState = { ...URL_STATE };
  return {
    pageContext: {
      navigate: vi.fn(),
      isAuthenticated: schoolRadius.isAuthenticated ?? false,
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
      schoolRadiusPanelSettled: schoolRadius.settled,
      schoolRadiusHasMore: schoolRadius.hasMore,
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

function noZeroCountAnywhere(panelContent: PanelContent) {
  // Header band: the count stat is omitted (not rendered as "0").
  expect(screen.queryByTestId('school-summary-count')).not.toBeInTheDocument();
  expect(screen.queryByText(/homes? for sale/i)).not.toBeInTheDocument();
  // Radius chips: no chip carries a "0 homes" count line.
  for (const km of [1, 3, 5]) {
    const chip = screen.queryByTestId(`${CHIP_PREFIX[panelContent]}-${km}`);
    if (chip) expect(within(chip).queryByText(/\b0 homes?\b/)).not.toBeInTheDocument();
  }
  expect(screen.queryByText(/\b0 homes?\b/)).not.toBeInTheDocument();
}

const CHIP_PREFIX: Record<PanelContent, string> = {
  'school-selected': 'radius-btn',
  'area-school-combined': 'combined-radius-btn',
};

describe.each<PanelContent>(['school-selected', 'area-school-combined'])(
  'LegacyRightPanelBridge (%s) — #1793 R1 no zero count while the school-radius result is failed or loading',
  (panelContent) => {
    it('error (anon): the header band and radius chips do not claim "0 homes" next to the error block', async () => {
      renderBridge(buildParams(panelContent, { isError: true, refetch: vi.fn() }));
      expect(await screen.findByTestId('school-radius-listings-error')).toBeVisible();
      noZeroCountAnywhere(panelContent);
    });

    it('loading (anon, pending or retrying): no zero count in the header band or radius chips', async () => {
      renderBridge(buildParams(panelContent, { isError: false, refetch: vi.fn(), loading: true }));
      expect((await screen.findAllByTestId('school-summary-band')).length).toBeGreaterThan(0);
      noZeroCountAnywhere(panelContent);
    });

    it('control: a genuine zero (200, no listings, not loading) still shows the zero counts', async () => {
      renderBridge(buildParams(panelContent, { isError: false, refetch: vi.fn() }));
      expect(await screen.findByTestId('school-radius-empty-state')).toBeVisible();
      expect(screen.getByTestId('school-summary-count')).toHaveTextContent('0');
      expect(screen.getByTestId(`${CHIP_PREFIX[panelContent]}-3`)).toHaveTextContent('0 homes');
    });

    it('signed-in control (unchanged): authenticated + auth listingDataLoading still renders the 0 count (the new suppression is anon-only)', async () => {
      renderBridge(
        buildParams(panelContent, { isError: false, refetch: vi.fn(), isAuthenticated: true, listingDataLoading: true }),
      );
      expect(await screen.findByTestId('school-summary-count')).toHaveTextContent('0');
      expect(screen.getByTestId(`${CHIP_PREFIX[panelContent]}-3`)).toHaveTextContent('0 homes');
    });
  },
);

// Issue #1793 PR-C (fix cycle 1, CR F1/F2) — the legacy bridge threads the school-radius card source's
// OWN settled signal and page-cap flag (surface view -> buildRightPanelView -> shared.refresh ->
// SchoolJourneyPanel -> the panels -> SchoolRadiusListings) and gates the request card on them.
describe.each<PanelContent>(['school-selected', 'area-school-combined'])(
  'LegacyRightPanelBridge (%s) — #1793 PR-C request card follows the school-radius query\'s own settled signal',
  (panelContent) => {
    beforeEach(() => {
      vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', 'true');
      // The school panels read the city from the real URL (DiscoverProvider); the card needs one.
      window.history.pushState({}, '', '/discover?city=udupi');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });
    const CARD = { name: 'Request a property' };
    const base = { isError: false, refetch: vi.fn() };

    it('settled, uncapped zero: the card renders in the empty state', async () => {
      renderBridge(buildParams(panelContent, { ...base, settled: true }));
      expect(await screen.findByTestId('school-radius-empty-state')).toBeVisible();
      expect(screen.getByRole('button', CARD)).toBeInTheDocument();
    });

    it('F1a: a keepPreviousData placeholder (settled false, panel loading false) shows the empty state but NO card', async () => {
      renderBridge(buildParams(panelContent, { ...base, settled: false }));
      expect(await screen.findByTestId('school-radius-empty-state')).toBeVisible();
      expect(screen.queryByRole('button', CARD)).not.toBeInTheDocument();
    });

    it('F2: an anonymous capped page (hasMore) filtered to empty: NO card', async () => {
      renderBridge(buildParams(panelContent, { ...base, settled: true, hasMore: true }));
      expect(await screen.findByTestId('school-radius-empty-state')).toBeVisible();
      expect(screen.queryByRole('button', CARD)).not.toBeInTheDocument();
    });

    it('F2 control: signed-in is not affected by hasMore', async () => {
      renderBridge(buildParams(panelContent, { ...base, settled: true, hasMore: true, isAuthenticated: true }));
      expect(await screen.findByTestId('school-radius-empty-state')).toBeVisible();
      expect(screen.getByRole('button', CARD)).toBeInTheDocument();
    });

    it('no settled signal from the surface at all: no card (never shown without proof)', async () => {
      renderBridge(buildParams(panelContent, { ...base }));
      expect(await screen.findByTestId('school-radius-empty-state')).toBeVisible();
      expect(screen.queryByRole('button', CARD)).not.toBeInTheDocument();
    });
  },
);
