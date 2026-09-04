/**
 * Issue #2149 — on mobile, tapping a property marker in the school-first
 * journey (a school + radius selected) did nothing: no popup, no bottom
 * sheet. Root cause: `useDiscoverMobilePresentationController`'s
 * `selectedListingPreview` (the mobile sheet's data source) was never
 * populated for school-first — only area-first's `AreaLeafListingsSurface`/
 * `NodeListingsSurface` reported it up, via `nav.selectedListing` (the URL
 * `listing=` param). School-first marker clicks deliberately do NOT write
 * that URL param (#1547-deferred design, #1973 rev-2), so that path never
 * fires for school-first; the local `selectedMarkerListing` click state is
 * the only signal available.
 *
 * Fix: `LegacyRightPanelBridge.tsx` (the panel branch that renders once a
 * school + radius is selected — `isAreaFirstJourneyActive`/
 * `isSchoolsNavNodeLevel` both route AWAY from it, see
 * `useDiscoverNavigationController.ts`) now derives a `SelectedListingPreview`
 * from `view.interaction.selectedMarkerListing` via the new
 * `toSelectedListingPreviewFromMarkerListing` adapter and reports it through
 * the SAME `commands.navigation.onSelectedListingPreviewChange` callback
 * contract `AreaLeafListingsSurface`/`NodeListingsSurface` already use —
 * scoped to `journey === 'school-first' && schoolId != null` so it can never
 * double-report for area-first (which always routes to a different panel
 * component entirely) or agri-first/legacy-area states.
 *
 * This suite renders the REAL `LegacyRightPanelBridge` (only its heaviest
 * leaf, `DiscoverRightPanel`, is mocked — mirroring
 * `DiscoverPanelSurface.test.tsx`'s established pattern) with a
 * `view`/`commands` fixture built through the real production
 * `buildPanelSurfaceModel`/`buildPanelSurfaceCommands` functions, so the
 * assertions exercise the actual wiring, not a re-implemented stand-in.
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
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';

vi.mock('@/components/discover/DiscoverRightPanel', () => ({
  DiscoverRightPanel: (props: DiscoverRightPanelProps) => (
    <div data-testid="discover-right-panel-mock" data-panel-content={props.panelContent} />
  ),
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

// Large page-owned interface; every method is a no-op stub — this bridge
// only ever invokes a handful of these from its own inline closures.
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
  // Issue #2203 — journey-preserving node selection.
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

const makeMarkerListing = (
  overrides: Partial<PropertyListingWithImages> = {},
): PropertyListingWithImages =>
  ({
    id: 'listing-1',
    title: 'Cozy 2BHK',
    property_type: 'apartment',
    price: 5_000_000,
    price_unit: null,
    bedrooms: 2,
    locality: null,
    images: [{ url: 'https://example.test/marker-img.jpg' }],
    trustBadge: 'verified',
    priceBand: '₹40–60L',
    ...overrides,
  } as unknown as PropertyListingWithImages);

/**
 * Builds a full `BuildPanelSurfaceModelParams` (the input the real
 * `buildPanelSurfaceModel`/`buildPanelSurfaceCommands` production functions
 * consume) so this suite pipes the fixture through the SAME code path
 * `useDiscoverPageComposition.ts` does, then renders `LegacyRightPanelBridge`
 * directly with the resulting `view`/`commands` — never a hand-rolled
 * `view`/`commands` object that could silently drift from the real contract.
 */
function buildParams(overrides: {
  urlState?: Partial<DiscoverUrlState>;
  selectedMarkerListing?: PropertyListingWithImages | null;
  isAuthenticated?: boolean;
  onSelectedListingPreviewChange?: (preview: SelectedListingPreview | null) => void;
}): BuildPanelSurfaceModelParams {
  const nav: DiscoverUrlState = { ...URL_STATE, ...overrides.urlState };
  const onSelectedListingPreviewChange = overrides.onSelectedListingPreviewChange ?? vi.fn();
  return {
    pageContext: {
      navigate: vi.fn(),
      isAuthenticated: overrides.isAuthenticated ?? false,
      nav,
      actions: URL_ACTIONS,
      isMobileShell: false,
      mobileView: 'LIST',
    },
    pageState: {
      city: nav.city,
      filters: {},
      handleFiltersChange: vi.fn(),
      handleCityChange: vi.fn(),
      handleAreaSelect: vi.fn(),
      selectedSchool: null,
      page: 0,
      setPage: vi.fn(),
      resolvedPanelContent: 'school-selected',
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
    marker: {
      selectedMarkerListing: overrides.selectedMarkerListing ?? null,
      clearSelectedMarkerListing: vi.fn(),
    },
    mobilePresentation: { setSelectedListingPreview: onSelectedListingPreviewChange },
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

describe('LegacyRightPanelBridge — issue #2149 school-first marker -> mobile preview sheet wiring', () => {
  it('school-first, a school selected, marker clicked -> reports a mapped preview through onSelectedListingPreviewChange', () => {
    const onSelectedListingPreviewChange = vi.fn();
    const listing = makeMarkerListing({ price: 5_000_000 });

    renderBridge(
      buildParams({
        urlState: { journey: 'school-first', schoolId: 'school-1', radiusKm: 3 },
        selectedMarkerListing: listing,
        isAuthenticated: true,
        onSelectedListingPreviewChange,
      }),
    );

    expect(onSelectedListingPreviewChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'authed',
        id: 'listing-1',
        title: 'Cozy 2BHK',
        propertyType: 'apartment',
        bedrooms: 2,
        // RUPEES `price` (5,000,000) converted to PAISE (x100) — the exact
        // conversion this fix must apply (a skipped conversion would leave
        // this at 5_000_000, 100x too small).
        pricePaise: 500_000_000,
      }),
    );
  });

  it('anon caller -> mapped preview carries priceBand, not pricePaise', () => {
    const onSelectedListingPreviewChange = vi.fn();
    const listing = makeMarkerListing({ priceBand: '₹40–60L' });

    renderBridge(
      buildParams({
        urlState: { journey: 'school-first', schoolId: 'school-1' },
        selectedMarkerListing: listing,
        isAuthenticated: false,
        onSelectedListingPreviewChange,
      }),
    );

    expect(onSelectedListingPreviewChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'anon', priceBand: '₹40–60L' }),
    );
  });

  it('areaLabel falls back to the city label when the marker listing has no locality (school-first is cross-area)', () => {
    const onSelectedListingPreviewChange = vi.fn();
    const listing = makeMarkerListing({ locality: null });

    renderBridge(
      buildParams({
        urlState: { city: 'bangalore', journey: 'school-first', schoolId: 'school-1' },
        selectedMarkerListing: listing,
        onSelectedListingPreviewChange,
      }),
    );

    expect(onSelectedListingPreviewChange).toHaveBeenCalledWith(
      expect.objectContaining({ areaLabel: 'Bangalore' }),
    );
  });

  it('no marker selected yet -> reports null (no stale preview left over)', () => {
    const onSelectedListingPreviewChange = vi.fn();

    renderBridge(
      buildParams({
        urlState: { journey: 'school-first', schoolId: 'school-1' },
        selectedMarkerListing: null,
        onSelectedListingPreviewChange,
      }),
    );

    expect(onSelectedListingPreviewChange).toHaveBeenCalledWith(null);
  });

  it('a marker IS selected but no school is selected yet (schoolId null) -> reports null, never a preview', () => {
    const onSelectedListingPreviewChange = vi.fn();
    const listing = makeMarkerListing();

    renderBridge(
      buildParams({
        urlState: { journey: 'school-first', schoolId: null },
        selectedMarkerListing: listing,
        onSelectedListingPreviewChange,
      }),
    );

    expect(onSelectedListingPreviewChange).toHaveBeenCalledWith(null);
  });

  it('non-school-first journeys (e.g. agri-first) never report through this path, even with a selectedMarkerListing set — avoids double-reporting with area-first/agri-first\'s own surfaces', () => {
    const onSelectedListingPreviewChange = vi.fn();
    const listing = makeMarkerListing();

    renderBridge(
      buildParams({
        urlState: { journey: 'agri-first' },
        selectedMarkerListing: listing,
        onSelectedListingPreviewChange,
      }),
    );

    expect(onSelectedListingPreviewChange).toHaveBeenCalledWith(null);
  });

  it('tapping a SECOND marker replaces the preview without requiring the sheet to be dismissed first (reactive on selectedMarkerListing, no dismiss-gate)', () => {
    const onSelectedListingPreviewChange = vi.fn();
    const firstListing = makeMarkerListing({ id: 'listing-1', price: 5_000_000 });
    const secondListing = makeMarkerListing({ id: 'listing-2', price: 7_500_000 });

    const { rerender } = renderBridge(
      buildParams({
        urlState: { journey: 'school-first', schoolId: 'school-1' },
        selectedMarkerListing: firstListing,
        isAuthenticated: true,
        onSelectedListingPreviewChange,
      }),
    );
    expect(onSelectedListingPreviewChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'listing-1', pricePaise: 500_000_000 }),
    );

    const params = buildParams({
      urlState: { journey: 'school-first', schoolId: 'school-1' },
      selectedMarkerListing: secondListing,
      isAuthenticated: true,
      onSelectedListingPreviewChange,
    });
    rerender(
      <LegacyRightPanelBridge
        view={buildPanelSurfaceModel(params)}
        commands={buildPanelSurfaceCommands(params)}
      />,
    );

    expect(onSelectedListingPreviewChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'listing-2', pricePaise: 750_000_000 }),
    );
  });
});
