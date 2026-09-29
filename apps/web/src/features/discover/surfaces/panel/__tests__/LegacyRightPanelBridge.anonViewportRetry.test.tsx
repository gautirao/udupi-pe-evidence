/**
 * Issue #2015 (PR #2425 review 5088946671) — production-path proof that the
 * anon-viewport retry wiring (`isErrorAnonViewport` / `refetchAnonViewport`)
 * actually flows end-to-end: `buildPanelSurfaceModel`/`buildPanelSurfaceCommands`
 * -> `LegacyRightPanelBridge` -> the REAL `DiscoverRightPanel` leaf.
 *
 * Every other suite that renders `LegacyRightPanelBridge` (see
 * `LegacyRightPanelBridge.schoolFirstMarkerPreview.test.tsx` /
 * `.selectAreaKeyFallback.test.tsx`) mocks `DiscoverRightPanel` as a thin
 * stub, so those suites would still pass even if the surface/bridge wiring
 * that forwards `isErrorAnonViewport`/`refetchAnonViewport` were removed
 * again. This file deliberately does NOT mock `DiscoverRightPanel` — it
 * renders the real leaf (mirroring the `renderWithProviders` pattern
 * `DiscoverRightPanel.routing.test.tsx` already established for that) so a
 * regression in the surface->bridge seam actually breaks this test.
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
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

import { LegacyRightPanelBridge } from '../LegacyRightPanelBridge';
import { buildPanelSurfaceModel, buildPanelSurfaceCommands } from '../../buildPanelSurfaceModel';
import type { BuildPanelSurfaceModelParams } from '../../buildPanelSurfaceModel';

// Prevent "supabaseUrl is required" crash from transitive usePropertyListings/PropertyCard
// import — same guard `DiscoverRightPanel.routing.test.tsx` uses to render the real leaf.
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
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

// DiscoverRightPanel calls useAgriDestinations unconditionally at the top level;
// mocked (rather than hit for real) to keep this hermetic, matching the routing suite.
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
  };
}

const makeAnonViewportListing = (
  overrides: Partial<PropertyListingWithImages> = {},
): PropertyListingWithImages =>
  ({
    id: 'anon-viewport-listing-1',
    title: 'Retained Viewport Listing',
    property_type: 'apartment',
    price: 5_000_000,
    price_unit: null,
    bedrooms: 2,
    locality: null,
    images: [{ url: 'https://example.test/anon-viewport-img.jpg' }],
    trustBadge: 'verified',
    priceBand: '₹40–60L',
    ...overrides,
  } as unknown as PropertyListingWithImages);

/**
 * Builds a full `BuildPanelSurfaceModelParams` fixture set to reach the
 * "retained-results retry banner" branch of `DiscoverRightPanel`'s
 * `renderAnonViewportListings()`: `panelContent: 'guided-entry'` +
 * `isAnonViewport: true` + `isErrorAnonViewport: true` + a non-empty
 * `anonViewportListings` (as opposed to the empty-listings
 * `anon-viewport-error` full-replace branch another suite already covers).
 */
function buildParams(refetchAnonViewport: () => void): BuildPanelSurfaceModelParams {
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
      // Issue #2018 slice 3 — 'Adjust boundary' seam, now part of PageStateSlice.
      handleRedrawPolygon: vi.fn(),
      selectedSchool: null,
      page: 0,
      setPage: vi.fn(),
      resolvedPanelContent: 'guided-entry',
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
      listingDataLoading: false,
      totalPages: 1,
      totalElements: 0,
      // Issue #2015 — anon "Search this area" (VIEWPORT scope) fields. Set to
      // reach the retained-results retry banner (non-empty listings + error).
      isAnonViewport: true,
      anonViewportListings: [makeAnonViewportListing()],
      anonViewportListingsLoading: false,
      isErrorAnonViewport: true,
      refetchAnonViewport,
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
  return renderWithProviders(
    <DiscoverProvider>
      <LegacyRightPanelBridge
        view={buildPanelSurfaceModel(params)}
        commands={buildPanelSurfaceCommands(params)}
      />
    </DiscoverProvider>,
  );
}

describe('LegacyRightPanelBridge — anon-viewport retry (production path)', () => {
  it('forwards isErrorAnonViewport/refetchAnonViewport through the real surface->bridge seam: shows the retained-results retry banner and calls the real DiscoverRightPanel retry handler exactly once', async () => {
    const user = userEvent.setup();
    const refetchAnonViewport = vi.fn();

    renderBridge(buildParams(refetchAnonViewport));

    const banner = await screen.findByTestId('anon-viewport-retry-banner');
    expect(banner).toBeVisible();

    await user.click(screen.getByTestId('anon-viewport-retry-btn'));

    expect(refetchAnonViewport).toHaveBeenCalledTimes(1);
  });
});
