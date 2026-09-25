/**
 * Issue #1824 Slice S11a — render tests for DiscoverMapCanvas (the map-half
 * sub-view lifted out of MapDiscovery.tsx). Covers: PropertyMap + key overlay
 * rendering given representative props, the mapContainerRef root, and the S8
 * badge-fork import-guard (this module must never import formatDiscoverBadgeCopy /
 * deriveSchoolRadiusPillNoun / hasActiveAnonPropertyFilter — those stay page-owned).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRef, type ReactElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import type { DiscoverUrlState, DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import type {
  DiscoverJourneyTransitionsView,
  DiscoverJourneyTransitionsCommands,
} from '@/features/discover/state/useDiscoverJourneyTransitions';
import type { SchoolsByAreaResponse } from '@/hooks/useSchoolsByArea';
import type { DiscoverBadgeResult } from '@/features/discover/presentation/discoverBadge';

// Issue #2018 slice 3 — the nearby contract is mocked here so the map/panel
// count-parity test has KNOWN filter-aware counts to assert against. The
// provider under test (AreaSetDraftProvider) calls this hook for real
// otherwise, which in this suite resolves to an empty candidate list and
// could not distinguish "counts threaded correctly" from "no counts at all".
export const NEARBY_CANDIDATES = [
  {
    areaKey: 'IN|KA|Bengaluru|Hennur',
    name: 'Hennur',
    geoCenterLat: 13.04,
    geoCenterLon: 77.63,
    // Deliberately DIFFERENT from any area's raw listingCount fixture, so a
    // regression that falls back to `area.listingCount` fails loudly here.
    eligibleListingCount: 3,
    schoolCount: 2,
  },
  {
    areaKey: 'IN|KA|Bengaluru|Kempapura',
    name: 'Kempapura',
    geoCenterLat: 13.06,
    geoCenterLon: 77.61,
    eligibleListingCount: 8,
    schoolCount: 1,
  },
];

vi.mock('@/hooks/useNearbyAreaCandidates', () => ({
  useNearbyAreaCandidates: () => ({
    data: {
      city: 'bangalore',
      selectedAreaKeys: [],
      candidates: NEARBY_CANDIDATES,
    },
    isLoading: false,
  }),
}));

// Issue #2456 (owner ruling C2) — the area records DiscoverMapCanvas resolves
// draft MEMBERS through (geo centre, label, totals) for the selected card.
// Hebbal/Jakkur are the committed AREA_SET keys the #2017 tests below use.
export const DISCOVER_AREAS = [
  { areaKey: 'IN|KA|Bengaluru|Hebbal', name: 'Hebbal', geoCenterLat: 13.05, geoCenterLon: 77.59, listingCount: 42, schoolCount: 12 },
  { areaKey: 'IN|KA|Bengaluru|Jakkur', name: 'Jakkur', geoCenterLat: 13.08, geoCenterLon: 77.6, listingCount: 22, schoolCount: 7 },
];

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: () => ({ data: { city: 'bangalore', areas: DISCOVER_AREAS }, isLoading: false }),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  // Issue #1956 PR 2 (Slice 3, pass 4, AC3.9) — captures the two hover-sync
  // props as data attributes so a test can prove DiscoverMapCanvas actually
  // forwards them to PropertyMap unchanged, rather than silently dropping them.
  // REQUIRED CHANGE 6 (review fix, AC4.4/AC4.5) — also captures whether
  // `onAreaVisualClusterCameraIntent` was forwarded as a real function, so a
  // test can prove DiscoverMapCanvas doesn't silently drop it (the review
  // finding: PropertyMap never received it in the real page, so a canonical
  // visual-cluster tap never fit the camera).
  PropertyMap: (props: {
    hoveredNavigationNodeKey?: string | null;
    onAreaVisualClusterCameraIntent?: (bounds: unknown, center: unknown) => void;
    // Issue #2186 / #2296 (PR #2381 second review) — captured so a test can prove
    // which source (filteredAgriListings vs agriDestinationMarkers vs null)
    // DiscoverMapCanvas actually resolved into each prop, without needing
    // PropertyMap's real Leaflet internals. As of the second review, Level-3
    // (filteredAgriListings) and Level-2 (agriDestinationMarkers) are separate
    // PropertyMap props — agriGroupListings now carries ONLY Level-3.
    agriGroupListings?: Array<{ id: string }> | null;
    agriDestinationMarkers?: Array<{ id: string }> | null;
    // Issue #2296 (PR #2381 third review) — captured so a test can simulate a
    // destination-marker click and prove DiscoverMapCanvas wires it to
    // urlActions.setLocality (drill-down), not a generic listing callback.
    onSelectAgriDestination?: (areaKey: string) => void;
    // Code-review fix (PR #2424) — captured so a test can prove these three
    // AREA_SET candidate-callout props are neutralised whenever the draft
    // editor is closed (isAreaSetDraftOpen: false), not just left as-is.
    areaSetCandidateKeys?: string[];
    // Issue #2018 slice 3 — captured so a test can prove the map card is
    // given the SAME filter-aware count the recovery panel's nearby row
    // shows, rather than the area's filter-blind lifetime total.
    areaSetCandidateCounts?: Record<string, number>;
    // Issue #2456 (owner ruling) — PropertyMap no longer declares this prop.
    // It is still captured here (typed loosely) so a test can prove NO select
    // handler reaches the map in ANY draft state — the structural
    // no-mutation proof at the canvas → map boundary.
    onAreaSetCandidateSelect?: (areaKey: string) => void;
    areaSetAtMax?: boolean;
    // Issue #2456 — the nearby-suggestion callouts, 1:1 from the nearby
    // contract. Captured verbatim so a test can assert exact identity +
    // filter-aware count equality with the panel's suggestion rows.
    areaSetNearbyCandidates?: Array<{
      areaKey: string;
      label: string;
      lat: number;
      lon: number;
      count: number;
    }>;
    // Issue #2456 (owner ruling C2) — draft members for the selected card.
    areaSetDraftMembers?: Array<{
      areaKey: string;
      label: string;
      lat: number;
      lon: number;
    }>;
  }) => (
    <div
      data-testid="property-map-mock"
      data-hovered-navigation-node-key={props.hoveredNavigationNodeKey ?? ''}
      data-has-area-visual-cluster-camera-intent={String(
        typeof props.onAreaVisualClusterCameraIntent === 'function',
      )}
      data-agri-group-listings-ids={
        props.agriGroupListings == null
          ? 'null'
          : props.agriGroupListings.map((l) => l.id).join(',')
      }
      data-agri-destination-markers-ids={
        props.agriDestinationMarkers == null
          ? 'null'
          : props.agriDestinationMarkers.map((l) => l.id).join(',')
      }
      data-area-set-candidate-keys={(props.areaSetCandidateKeys ?? []).join(',')}
      data-area-set-candidate-counts={JSON.stringify(props.areaSetCandidateCounts ?? null)}
      data-has-area-set-candidate-select={String(typeof props.onAreaSetCandidateSelect === 'function')}
      data-area-set-at-max={String(props.areaSetAtMax ?? false)}
      data-area-set-nearby-candidates={JSON.stringify(props.areaSetNearbyCandidates ?? null)}
      data-area-set-draft-members={JSON.stringify(props.areaSetDraftMembers ?? null)}
      onClick={() => props.onSelectAgriDestination?.('IN|KA|Udupi|Brahmavar')}
    >
      <button
        type="button"
        data-testid="property-map-mock-candidate-select"
        onClick={() => props.onAreaSetCandidateSelect?.('IN|KA|Bengaluru|Nagawara')}
      >
        simulate candidate click
      </button>
    </div>
  ),
}));

// Issue #1953 (build step 2) — DiscoverMapCanvas now consumes the
// DiscoverProvider facade (useDiscoverNav/useDiscoverViewport/
// useDiscoverActions) directly instead of receiving urlState/urlActions as
// props, so this suite mocks the facade module instead of passing those two
// props. Built inside vi.hoisted() so the vi.mock() factory below (hoisted
// above all imports/consts by Vitest) can close over real values instead of
// hitting the TDZ.
const { BASE_URL_STATE, BASE_NAV, URL_ACTIONS } = vi.hoisted(() => {
  const urlState: DiscoverUrlState = {
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
  // nav mirrors DiscoverNavContextValue (everything except `viewport`, its own context).
  const { viewport: _viewport, ...nav } = urlState;

  // The URL-actions surface is a large, page-owned interface; every method here is
  // a no-op stub since the canvas only ever invokes selectGroup/reportViewport from
  // the moved JSX — the rest exist purely to satisfy the DiscoverUrlActions contract.
  const urlActions: DiscoverUrlActions = {
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
    // Issue #1956 PR 2 — canonical Areas hierarchy write actions.
    goToNode: vi.fn(),
    goToAncestorNode: vi.fn(),
    clearNode: vi.fn(),
    enterAreasJourney: vi.fn(),
    buildNodeHref: vi.fn(),
    setSelectedListing: vi.fn(),
    clearSelectedListing: vi.fn(),
    setLocality: vi.fn(),
    clearLocality: vi.fn(),
    clearAgriFilters: vi.fn(),
    setIntent: vi.fn(),
    setSchoolJourney: vi.fn(),
  };

  return { BASE_URL_STATE: urlState, BASE_NAV: nav, URL_ACTIONS: urlActions };
});

// Code-review fix (PR #2424) — DiscoverMapCanvas now also calls
// useDiscoverShell() to gate the AREA_SET candidate-callout props on
// isAreaSetDraftOpen. Hoisted `vi.fn()` (not a static factory literal) so
// individual tests can flip `isAreaSetDraftOpen` via `mockReturnValue`
// without redefining the whole vi.mock() factory.
const mockUseDiscoverShell = vi.hoisted(() => vi.fn());

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => BASE_NAV,
  useDiscoverViewport: () => BASE_URL_STATE.viewport,
  useDiscoverActions: () => URL_ACTIONS,
  useDiscoverShell: mockUseDiscoverShell,
}));

import { DiscoverMapCanvas, type DiscoverMapCanvasProps } from './DiscoverMapCanvas';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';

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

// UseInfiniteQueryResult is a large vendor (react-query) type — the canvas only
// reads .isLoading/.isError/.error from it (threaded to PropertyMap's
// schoolsIsLoading/schoolsIsError/schoolsError). A full literal would need dozens
// of unused react-query internals, so this cast is the pragmatic, documented
// exception to the "avoid `as`" rule for this one test fixture.
const SCHOOLS_QUERY = {
  isLoading: false,
  isError: false,
  error: null,
  isFetching: false,
  refetch: vi.fn(),
} as unknown as UseInfiniteQueryResult<InfiniteData<SchoolsByAreaResponse>, Error>;

const DISCOVER_BADGE: DiscoverBadgeResult = {
  visible: false,
  count: null,
  loading: false,
  n: null,
  m: null,
  hasActiveFilters: false,
  hasPropertyFilters: false,
  state: 'zero-empty',
};

function baseProps(overrides: Partial<DiscoverMapCanvasProps> = {}): DiscoverMapCanvasProps {
  return {
    mapContainerRef: createRef<HTMLDivElement>(),
    markerPixelPos: null,
    handlePopoverDismiss: vi.fn(),
    showLoader: false,
    error: null,
    currentMapMarkerListings: [],
    agriGroupFocusBounds: null,
    activeFocusBounds: null,
    selectedRegion: null,
    selectedMaxKm: null,
    filteredAgriListings: null,
    agriDestinationMarkers: [],
    filters: {},
    isLandingState: true,
    handlePolygonDrawn: vi.fn(),
    handlePolygonCleared: vi.fn(),
    selectedSchool: null,
    memoizedInitialCenter: undefined,
    cityCenter: undefined,
    cityZoom: undefined,
    overviewAreas: [],
    discoverAreas: [],
    handleOverviewAreaClick: vi.fn(),
    publishCameraIntent: vi.fn(),
    cameraIntent: null,
    focusedGroupAreas: undefined,
    areaLayerMaxZoom: 12,
    selectedArea: null,
    areaSearchMatchKeys: undefined,
    hoveredAreaKeyForMap: null,
    publishClusterCameraIntent: vi.fn(),
    handleAreaClusterClick: vi.fn(),
    handleAreaMarkersComputed: vi.fn(),
    schoolZoneLabels: [],
    setMapZoom: vi.fn(),
    handleBoundsChange: vi.fn(),
    panToArea: null,
    journeyView: JOURNEY_VIEW,
    setMapReady: vi.fn(),
    schools: [],
    showSchoolMarkers: false,
    journeyCommands: JOURNEY_COMMANDS,
    schoolsQuery: SCHOOLS_QUERY,
    schoolFocusTick: 0,
    selectedSchoolLat: undefined,
    selectedSchoolLon: undefined,
    schoolMarkerFocusTick: 0,
    schoolMarkerPositions: [],
    areaRestoreArea: null,
    isAgriJourney: false,
    selectedMarkerListing: null,
    handleSelectMarkerListing: vi.fn(),
    hoveredListingId: null,
    handleMarkerClickWithPosition: vi.fn(),
    isAreaFirstCityLanding: false,
    showSchoolBreadcrumb: false,
    areaJourneySegments: [],
    schoolJourneySegments: [],
    focusedGroup: null,
    city: 'bangalore',
    schoolRadiusOverlay: false,
    resolvedPanelContent: 'guided-entry',
    isSelectedGroupState: false,
    handleCityChange: vi.fn(),
    regionGuideVisible: false,
    resolvedRegionLabel: null,
    regionSelectNonce: 0,
    regionOverviewMarkerKind: null,
    regionGuideRingActive: false,
    prefersReducedMotion: false,
    dismissRegionGuide: vi.fn(),
    isRegionOverview: false,
    regionOverviewShortLabel: null,
    areaMarkerListings: [],
    announcedBadgeText: '',
    discoverBadge: DISCOVER_BADGE,
    areaResultSummaryText: null,
    groupSelectedBadgeCopy: '',
    fallbackBadgeCopy: '',
    isAreaFirstSelectedAreaState: false,
    schoolRadiusActive: false,
    schoolRadiusPillNoun: 'homes',
    schoolFirstAreaSchoolCount: null,
    schoolFirstZoneSchoolCount: null,
    schoolFirstLandingSchoolCount: null,
    cityTotal: 0,
    isAuthenticated: false,
    schoolRadiusHasMore: false,
    schoolListings: [],
    hasActiveAnonFilter: false,
    markersTruncated: false,
    markersReturnedElements: undefined,
    markersTotalFilteredElements: undefined,
    isLoading: false,
    mapZoom: 10,
    isBoundedBrowseState: false,
    isMarkerPopoverEligible: false,
    markerPopoverStepper: null,
    navigate: vi.fn(),
    handleStepMarkerListing: vi.fn(),
    showMarkerInList: vi.fn(),
    ...overrides,
  };
}

// Issue #2017 — AreaSetChips (mounted inside DiscoverMapCanvas's JSX, see its
// own header doc) is a deliberately self-contained component that calls
// useDiscoverAreas() directly rather than receiving areas as a prop, so this
// suite's render tree needs an ancestor QueryClientProvider — the SAME
// `new QueryClient({ defaultOptions: { queries: { retry: false } } })` +
// QueryClientProvider pattern already used across this codebase's test
// suites (e.g. ListingEditorDrawer.test.tsx, AreaGuide.test.tsx) for any
// component tree with a react-query hook in it. This is test-infrastructure
// only — DiscoverMapCanvas itself still receives everything else as props.
//
// Issue #2017 (test scaffolding fix) — DiscoverMapCanvas now also calls
// useAreaSetDraftContext() directly (see its header doc / AreaSetDraftContext.tsx),
// so every render needs an ancestor <AreaSetDraftProvider> too, nested inside the
// QueryClientProvider above (AreaSetDraftProvider's own useNearbyAreaCandidates
// call needs the QueryClient ancestor). AreaSetDraftProvider reads useDiscoverNav()
// internally, which this file already mocks via BASE_NAV above.
function renderCanvas(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AreaSetDraftProvider>{ui}</AreaSetDraftProvider>
    </QueryClientProvider>,
  );
}

// Default shell mock — `isAreaSetDraftOpen: false` matches every existing
// test in this file (none of them open the AREA_SET draft editor), and is
// also the state the code-review fix below specifically depends on: the
// candidate-callout props reaching PropertyMap must be neutralised whenever
// this is false. Individual tests override via `mockUseDiscoverShell.mockReturnValue(...)`.
function defaultShellMock() {
  return {
    mobileView: 'LIST' as const,
    setMobileView: vi.fn(),
    isMobileShell: false,
    isAreaSetDraftOpen: false,
    openAreaSetDraft: vi.fn(),
    closeAreaSetDraft: vi.fn(),
    fitAreaSet: vi.fn(),
    focusAreaSetMember: vi.fn(),
    registerAreaSetCameraActions: vi.fn(),
    getAreaSetCameraRestoreRequest: vi.fn(() => null),
    setAreaSetCameraRestoreRequest: vi.fn(),
  };
}

beforeEach(() => {
  mockUseDiscoverShell.mockReturnValue(defaultShellMock());
});

// ── Issue #2596 — the map chip row is removed across all viewports ───────────
//
// Owner: "remove the chips from the map once the right panel has them." Since AreaSetDraftPanel
// now renders in-panel across all viewports (including < lg), the right panel carries the draft
// workflow everywhere, so the map chip row is removed completely.
describe('#2596 — AREA_SET map chip row is removed across all viewports', () => {
  const OVERLAY = '.pointer-events-none.absolute.top-14';

  it('is ABSENT at >= lg', () => {
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isMobileShell: false });
    const { container } = renderCanvas(<DiscoverMapCanvas {...baseProps()} />);
    expect(screen.getByTestId('property-map-mock')).toBeInTheDocument();
    expect(container.querySelector(OVERLAY)).toBeNull();
    expect(screen.queryByTestId('area-set-map-chips-row')).not.toBeInTheDocument();
  });

  it('is ABSENT below lg, as right panel now carries the draft workflow', () => {
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isMobileShell: true });
    const { container } = renderCanvas(<DiscoverMapCanvas {...baseProps()} />);
    expect(screen.getByTestId('property-map-mock')).toBeInTheDocument();
    expect(container.querySelector(OVERLAY)).toBeNull();
    expect(screen.queryByTestId('area-set-map-chips-row')).not.toBeInTheDocument();
  });
});

describe('DiscoverMapCanvas', () => {
  it('renders PropertyMap and attaches mapContainerRef to the root div', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = renderCanvas(<DiscoverMapCanvas {...baseProps({ mapContainerRef: ref })} />);
    expect(screen.getByTestId('property-map-mock')).toBeInTheDocument();
    // The root element DiscoverMapCanvas returns must be the div carrying mapContainerRef —
    // verifies no extra wrapper node was introduced around the moved JSX (AC1/DOM parity).
    expect(container.firstElementChild).toBe(ref.current);
  });

  it('count_display_defect/AC3.9 (pass 4) — forwards hoveredNavigationNodeKey to PropertyMap unchanged, never re-derived', () => {
    renderCanvas(<DiscoverMapCanvas {...baseProps({ hoveredNavigationNodeKey: 'd:n' })} />);
    expect(screen.getByTestId('property-map-mock')).toHaveAttribute(
      'data-hovered-navigation-node-key',
      'd:n',
    );
  });

  it('REQUIRED CHANGE 6 (review fix, AC4.4/AC4.5) — forwards onAreaVisualClusterCameraIntent to PropertyMap as a real function, not silently dropped', () => {
    const onAreaVisualClusterCameraIntent = vi.fn();
    renderCanvas(<DiscoverMapCanvas {...baseProps({ onAreaVisualClusterCameraIntent })} />);
    expect(screen.getByTestId('property-map-mock')).toHaveAttribute(
      'data-has-area-visual-cluster-camera-intent',
      'true',
    );
  });

  describe('Issue #2186 / #2296 (PR #2381 second review) — agriGroupListings / agriDestinationMarkers prop resolution', () => {
    afterEach(() => {
      // Restore BASE_NAV.selectedLocality after any test that mutates it below —
      // BASE_NAV is a shared hoisted fixture read by every test in this file.
      BASE_NAV.selectedLocality = undefined;
    });

    it('AC4: Level-2 (region + maxKm set, no selectedLocality) resolves to the dedicated agriDestinationMarkers prop, not agriGroupListings', () => {
      const agriDestinationMarkers = [
        { id: 'IN|KA|Udupi|Brahmavar', areaKey: 'IN|KA|Udupi|Brahmavar', latitude: 13.4, longitude: 74.8, propertyType: 'agricultural_land' },
      ];
      renderCanvas(
        <DiscoverMapCanvas
          {...baseProps({
            selectedRegion: 'N',
            selectedMaxKm: 25,
            filteredAgriListings: null,
            agriDestinationMarkers,
          })}
        />,
      );
      const mock = screen.getByTestId('property-map-mock');
      // Issue #2296 second review — Level-2 goes through the DEDICATED
      // agriDestinationMarkers prop (AgriDestinationMarkerLayer, never clusters),
      // never through agriGroupListings (AgriMarkerClusterLayer, which clusters).
      expect(mock).toHaveAttribute('data-agri-destination-markers-ids', 'IN|KA|Udupi|Brahmavar');
      expect(mock).toHaveAttribute('data-agri-group-listings-ids', 'null');
    });

    it('Level-3 (selectedLocality also set) resolves to filteredAgriListings via agriGroupListings; agriDestinationMarkers is null (mutually exclusive)', () => {
      BASE_NAV.selectedLocality = 'IN|KA|Udupi|Brahmavar';
      const filteredAgriListings = [
        { id: 'parcel-1', areaKey: 'IN|KA|Udupi|Brahmavar', latitude: 13.41, longitude: 74.81, propertyType: 'agricultural_land' },
      ];
      const agriDestinationMarkers = [
        { id: 'IN|KA|Udupi|Brahmavar', areaKey: 'IN|KA|Udupi|Brahmavar', latitude: 13.4, longitude: 74.8, propertyType: 'agricultural_land' },
      ];
      renderCanvas(
        <DiscoverMapCanvas
          {...baseProps({
            selectedRegion: 'N',
            selectedMaxKm: 25,
            filteredAgriListings,
            agriDestinationMarkers,
          })}
        />,
      );
      const mock = screen.getByTestId('property-map-mock');
      expect(mock).toHaveAttribute('data-agri-group-listings-ids', 'parcel-1');
      // Level-2 destination markers must not also render underneath Level-3 real parcels.
      expect(mock).toHaveAttribute('data-agri-destination-markers-ids', 'null');
    });

    it('no region/maxKm selected (Level-1 landing) resolves both props to null — no markers, no regression', () => {
      renderCanvas(
        <DiscoverMapCanvas
          {...baseProps({
            selectedRegion: null,
            selectedMaxKm: null,
            filteredAgriListings: null,
            agriDestinationMarkers: [],
          })}
        />,
      );
      const mock = screen.getByTestId('property-map-mock');
      expect(mock).toHaveAttribute('data-agri-group-listings-ids', 'null');
      expect(mock).toHaveAttribute('data-agri-destination-markers-ids', 'null');
    });

    // Issue #2296 (PR #2381 third review) — a Level-2 destination-marker
    // click must drill down (urlActions.setLocality), not fire a generic
    // listing-selection callback.
    it('wires onSelectAgriDestination to urlActions.setLocality, keyed on the clicked destination areaKey', () => {
      URL_ACTIONS.setLocality.mockClear();

      const agriDestinationMarkers = [
        { id: 'IN|KA|Udupi|Brahmavar', areaKey: 'IN|KA|Udupi|Brahmavar', latitude: 13.4, longitude: 74.8, propertyType: 'agricultural_land' },
      ];
      renderCanvas(
        <DiscoverMapCanvas
          {...baseProps({
            selectedRegion: 'N',
            selectedMaxKm: 25,
            filteredAgriListings: null,
            agriDestinationMarkers,
          })}
        />,
      );

      fireEvent.click(screen.getByTestId('property-map-mock'));

      expect(URL_ACTIONS.setLocality).toHaveBeenCalledWith('IN|KA|Udupi|Brahmavar');
    });
  });

  it('shows the error card instead of PropertyMap when error is set', () => {
    renderCanvas(<DiscoverMapCanvas {...baseProps({ error: new Error('boom') })} />);
    expect(screen.queryByTestId('property-map-mock')).not.toBeInTheDocument();
    expect(screen.getByText('Failed to load listings')).toBeInTheDocument();
  });

  // Issue #1953 build step 6 (ownership invariant) — the map-overlay
  // CitySelect was REMOVED from DiscoverMapCanvas: it co-rendered with the
  // persistent DiscoverControlBar in every drill-down state, a real visible
  // duplicate city-selection control (browser-verified). The persistent
  // control bar is now the SOLE city-selection control on /discover — these
  // two tests now assert that reality (never present, in ANY panel state),
  // rather than being deleted.
  it('never renders a CitySelect/combobox, in a drill-down state (ownership moved to DiscoverControlBar)', () => {
    renderCanvas(
      <DiscoverMapCanvas
        {...baseProps({
          resolvedPanelContent: 'area-groups-landing',
          isAreaFirstCityLanding: false,
          isSelectedGroupState: false,
        })}
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('never renders a CitySelect/combobox on the guided-entry public landing either', () => {
    renderCanvas(<DiscoverMapCanvas {...baseProps({ resolvedPanelContent: 'guided-entry' })} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('renders the DiscoverMapCountBadge public-landing summary pill when cityTotal > 0', () => {
    renderCanvas(
      <DiscoverMapCanvas
        {...baseProps({ resolvedPanelContent: 'guided-entry', cityTotal: 42 })}
      />,
    );
    const badges = screen.getAllByTestId('discover-badge');
    expect(badges.length).toBeGreaterThan(0);
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  // Issue #2089 code-review fix (Finding 4) — isBoundedBrowseState must reach
  // MapEmptyGuidance's hasAreaSelected prop as true (`!!selectedArea ||
  // isBoundedBrowseState`, see the JSX call site) even when selectedArea is
  // null, so the anon "select an area…or sign in" prompt (which only shows
  // when hasAreaSelected === false) stays suppressed for an anon user who is
  // zoomed past AREA_LAYER_MAX_ZOOM in a bounded-Browse node scope — that
  // scope already has real, correctly-filtered markers, and the prompt would
  // be a lie in that state.
  it('suppresses the anon "select an area / sign in" guidance when isBoundedBrowseState is true, even with selectedArea: null', () => {
    renderCanvas(
      <MemoryRouter>
        <DiscoverMapCanvas
          {...baseProps({
            isBoundedBrowseState: true,
            selectedArea: null,
            isAuthenticated: false,
            mapZoom: 20,
            areaLayerMaxZoom: 12,
            cityTotal: 10,
          })}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Select an area to see properties/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('never renders the marker popover when isMarkerPopoverEligible is false, even with a pixel position', () => {
    renderCanvas(
      <DiscoverMapCanvas
        {...baseProps({
          isMarkerPopoverEligible: false,
          markerPixelPos: { x: 10, y: 20 },
        })}
      />,
    );
    // selectedMarkerListing stays null in this fixture, and isMarkerPopoverEligible is
    // false — the AND-gated popover must not mount regardless of markerPixelPos.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not import the S8 badge-copy helper modules (fork guard)', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const sourcePath = path.join(path.dirname(thisFile), 'DiscoverMapCanvas.tsx');
    const source = readFileSync(sourcePath, 'utf-8');
    // Static-import check scoped to actual import statements (not doc-comment prose,
    // which legitimately names these helpers when explaining the guard). The three
    // functions live in these modules — importing any of them is the real regression.
    const importLines = source
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line))
      .join('\n');
    // Issue #2000 Slice 2 PR1 — DiscoverBadgeResult's canonical home is now
    // '@/features/discover/presentation/discoverBadge' (previously re-exported via
    // '@/pages/MapDiscovery'). A TYPE-ONLY import of that interface is not the fork
    // this guard exists to prevent (the guard is about the VALUE-level copy-generating
    // functions, called out explicitly below); exclude `import type` lines from the
    // discoverBadge path check while keeping schoolFirstCounts/anonPropertyFilters
    // (which this file has no legitimate reason to import, type or value) strict.
    const valueImportLines = source
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line) && !/^\s*import\s+type\b/.test(line))
      .join('\n');
    expect(valueImportLines).not.toMatch(/features\/discover\/presentation\/discoverBadge/);
    expect(importLines).not.toMatch(/features\/discover\/presentation\/schoolFirstCounts/);
    expect(importLines).not.toMatch(/features\/discover\/presentation\/anonPropertyFilters/);
    // Belt-and-suspenders: the helper identifiers themselves must never appear as a
    // named import binding (only inside comments, which this file legitimately has).
    expect(importLines).not.toMatch(/formatDiscoverBadgeCopy|deriveSchoolRadiusPillNoun|hasActiveAnonPropertyFilter/);
  });
});

// Code-review fix (PR #2424) — AREA_SET candidate-marker mode used to stay
// ACTIVE ON THE MAP even with the draft editor CLOSED: `computedAreaSetCandidateKeys`
// always seeded from the committed AREA_SET (useAreaSetDraft always re-seeds
// draftAreaKeys from the committed scope) and always ran the nearby-candidate
// query live, with no gate on `shell.isAreaSetDraftOpen` — so
// `areaSetCandidateKeys`/`onAreaSetCandidateSelect`/`areaSetAtMax` reached
// PropertyMap (and therefore AreaMarkerLayer, which hijacks any matching
// marker's click into `onAreaSetCandidateSelect` — see AreaMarkerLayer.tsx's
// `isAreaSetCandidate = areaSetCandidateKeys?.includes(area.areaKey)`) at ALL
// times, not just while the editor was open. This proves the fix: editor
// closed -> normal marker path (no candidate keys/handler/max-state reach the
// map, regardless of what's committed); editor open -> real candidate keys +
// a real select handler reach the map; closing again restores the normal
// path and the select handler is gone, so a stray click can no longer mutate
// the draft.
describe('DiscoverMapCanvas — Issue #2017 code-review fix: AREA_SET candidate-callout mode gated on isAreaSetDraftOpen', () => {
  const COMMITTED_AREA_SET_NAV_OVERRIDE = {
    active: {
      kind: 'AREA_SET' as const,
      areaKeys: ['IN|KA|Bengaluru|Hebbal', 'IN|KA|Bengaluru|Jakkur'],
    },
    previous: null,
  };

  afterEach(() => {
    // BASE_NAV is a shared hoisted fixture read by every test in this file —
    // restore it after any test here that mutates resultScope (same
    // established pattern as the agri describe block's own afterEach above).
    BASE_NAV.resultScope = undefined;
  });

  it('editor CLOSED (isAreaSetDraftOpen: false): PropertyMap gets NO candidate keys, NO select handler, and atMax=false — even with a committed multi-area AREA_SET', () => {
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen: false });
    BASE_NAV.resultScope = COMMITTED_AREA_SET_NAV_OVERRIDE;

    renderCanvas(<DiscoverMapCanvas {...baseProps()} />);

    const map = screen.getByTestId('property-map-mock');
    expect(map).toHaveAttribute('data-area-set-candidate-keys', '');
    expect(map).toHaveAttribute('data-has-area-set-candidate-select', 'false');
    expect(map).toHaveAttribute('data-area-set-at-max', 'false');

    // Belt-and-braces: a click through where the candidate-select handler
    // would have fired is a genuine no-op — no crash, no hidden mutation.
    // (onAreaSetCandidateSelect is undefined; the mock's onClick optional-chains.)
    fireEvent.click(screen.getByTestId('property-map-mock-candidate-select'));
  });

  it('editor OPEN (isAreaSetDraftOpen: true): PropertyMap gets the committed AREA_SET keys as draft-member candidates, and STILL no select handler (#2456 owner ruling)', () => {
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen: true });
    BASE_NAV.resultScope = COMMITTED_AREA_SET_NAV_OVERRIDE;

    renderCanvas(<DiscoverMapCanvas {...baseProps()} />);

    const map = screen.getByTestId('property-map-mock');
    // The draft seeds from the committed AREA_SET (useAreaSetDraft's seeding
    // effect) — both committed areaKeys are present as candidate keys.
    const candidateKeys = map.getAttribute('data-area-set-candidate-keys')?.split(',') ?? [];
    expect(candidateKeys).toEqual(
      expect.arrayContaining(['IN|KA|Bengaluru|Hebbal', 'IN|KA|Bengaluru|Jakkur']),
    );
    // Issue #2456 (owner ruling, reversing #2424/#2453): the map NEVER gets
    // a scope-mutating handler, even with the editor open. A stray click on
    // any candidate-shaped marker therefore cannot add to the draft.
    expect(map).toHaveAttribute('data-has-area-set-candidate-select', 'false');
    fireEvent.click(screen.getByTestId('property-map-mock-candidate-select'));
    expect(map).toHaveAttribute('data-has-area-set-candidate-select', 'false');
  });

  // ── Issue #2018 slice 3 — map/panel count parity ──────────────────────────
  // The issue's rule is "Map and panel show the same preview counts and
  // candidate identities". Only the KEYS used to cross to the map, so the
  // candidate callout fell back to `area.listingCount` — the area's raw
  // lifetime total from useDiscoverAreas, which ignores the shopper's active
  // filters — while the recovery panel's nearby row rendered the filter-aware
  // `eligibleListingCount`. Under any active filter the same candidate showed
  // two different numbers on the two surfaces.
  it('editor OPEN: PropertyMap gets the FILTER-AWARE candidate counts, not the areas raw totals', () => {
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen: true });
    BASE_NAV.resultScope = COMMITTED_AREA_SET_NAV_OVERRIDE;

    renderCanvas(<DiscoverMapCanvas {...baseProps()} />);

    const map = screen.getByTestId('property-map-mock');
    const raw = map.getAttribute('data-area-set-candidate-counts');
    expect(raw).not.toBe('null');

    const counts = JSON.parse(raw as string) as Record<string, number>;
    // Every entry must come from the nearby contract's eligibleListingCount,
    // which is the exact value the panel's nearby row renders. Both surfaces
    // read one AreaSetDraftContext, so this is a single-source assertion
    // rather than two numbers that happen to agree today.
    for (const candidate of NEARBY_CANDIDATES) {
      expect(counts[candidate.areaKey]).toBe(candidate.eligibleListingCount);
    }
  });

  it('editor CLOSED: no candidate counts are published at all', () => {
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen: false });
    BASE_NAV.resultScope = COMMITTED_AREA_SET_NAV_OVERRIDE;

    renderCanvas(<DiscoverMapCanvas {...baseProps()} />);

    // Same gate as the keys: candidate mode only exists while the draft is
    // open, so nothing candidate-shaped leaks into the ordinary marker path.
    expect(screen.getByTestId('property-map-mock')).toHaveAttribute(
      'data-area-set-candidate-counts',
      'null',
    );
  });

  it('close/cancel (isAreaSetDraftOpen flips true -> false on rerender): candidate mode is fully restored to the normal marker path, not left active', () => {
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen: true });
    BASE_NAV.resultScope = COMMITTED_AREA_SET_NAV_OVERRIDE;

    const { rerender } = renderCanvas(<DiscoverMapCanvas {...baseProps()} />);
    // Open-state proof that candidate mode was genuinely active before the
    // flip: the nearby callouts are published (#2456) and the draft members
    // are candidate keys. (No select handler exists in any state — #2456.)
    expect(screen.getByTestId('property-map-mock').getAttribute('data-area-set-nearby-candidates')).not.toBe('null');
    expect(screen.getByTestId('property-map-mock').getAttribute('data-area-set-candidate-keys')).not.toBe('');

    // Simulate Cancel/close: isAreaSetDraftOpen flips back to false.
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen: false });
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AreaSetDraftProvider>
          <DiscoverMapCanvas {...baseProps()} />
        </AreaSetDraftProvider>
      </QueryClientProvider>,
    );

    const map = screen.getByTestId('property-map-mock');
    expect(map).toHaveAttribute('data-area-set-candidate-keys', '');
    expect(map).toHaveAttribute('data-has-area-set-candidate-select', 'false');
    expect(map).toHaveAttribute('data-area-set-at-max', 'false');
    // Issue #2456 — closing the draft removes every nearby callout: the
    // layer's input goes to `undefined`, which unmounts it.
    expect(map).toHaveAttribute('data-area-set-nearby-candidates', 'null');
  });
});

// Issue #2456 — nearby-suggestion candidates as NON-INTERACTIVE map callouts.
//
// Before this fix, nearby candidates reached the map only as KEYS unioned into
// `areaSetCandidateKeys`, which AreaMarkerLayer can only turn into a card for
// an area that is ALSO in its iterated `areas` prop AND survives bucketing as
// a representative — nearby candidates are outside the committed scope, so
// the card never rendered (issue body; PR #2453 evidence). They now cross as
// `areaSetNearbyCandidates`, a 1:1 mapping of the SAME
// `AreaSetDraftContext.data.candidates` array AreaSetDraftPanel renders its
// suggestion rows from.
//
// OLD-SOURCE-FAILING: against the pre-#2456 source PropertyMap has no
// `areaSetNearbyCandidates` prop, so the mock's attribute is 'null' and the
// first assertion below fails. (See the PR for the recorded failing run.)
describe('DiscoverMapCanvas — Issue #2456: nearby candidates cross to the map 1:1 with the panel, non-interactive', () => {
  const COMMITTED_AREA_SET_NAV_OVERRIDE = {
    active: {
      kind: 'AREA_SET' as const,
      areaKeys: ['IN|KA|Bengaluru|Hebbal', 'IN|KA|Bengaluru|Jakkur'],
    },
    previous: null,
  };

  afterEach(() => {
    BASE_NAV.resultScope = undefined;
  });

  function readNearby(map: HTMLElement) {
    const raw = map.getAttribute('data-area-set-nearby-candidates');
    return raw === null || raw === 'null'
      ? null
      : (JSON.parse(raw) as Array<{ areaKey: string; label: string; lat: number; lon: number; count: number }>);
  }

  it('editor OPEN: PropertyMap gets EXACTLY the panel\'s nearby candidates — same identities, same order, same filter-aware counts, own geo centres', () => {
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen: true });
    BASE_NAV.resultScope = COMMITTED_AREA_SET_NAV_OVERRIDE;

    renderCanvas(<DiscoverMapCanvas {...baseProps()} />);

    const nearby = readNearby(screen.getByTestId('property-map-mock'));
    expect(nearby).not.toBeNull();
    // Exact equality with the mocked nearby contract — the SAME array the
    // panel's `suggestions = nearbyData?.candidates ?? []` renders from
    // (AreaSetDraftPanel.tsx), so map callout count == panel row count and
    // every count is the panel's `eligibleListingCount`, not `listingCount`.
    expect(nearby).toEqual(
      NEARBY_CANDIDATES.map((c) => ({
        areaKey: c.areaKey,
        label: c.name,
        lat: c.geoCenterLat,
        lon: c.geoCenterLon,
        count: c.eligibleListingCount,
      })),
    );
    expect(nearby).toHaveLength(NEARBY_CANDIDATES.length);
  });

  it('editor OPEN: nearby candidates are NOT also unioned into areaSetCandidateKeys (no double render; members only)', () => {
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen: true });
    BASE_NAV.resultScope = COMMITTED_AREA_SET_NAV_OVERRIDE;

    renderCanvas(<DiscoverMapCanvas {...baseProps()} />);

    const map = screen.getByTestId('property-map-mock');
    const candidateKeys = map.getAttribute('data-area-set-candidate-keys')?.split(',') ?? [];
    for (const c of NEARBY_CANDIDATES) {
      expect(candidateKeys).not.toContain(c.areaKey);
    }
    expect(candidateKeys).toEqual(
      expect.arrayContaining(['IN|KA|Bengaluru|Hebbal', 'IN|KA|Bengaluru|Jakkur']),
    );
  });

  it('editor CLOSED: no nearby callouts are published (layer input is undefined)', () => {
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen: false });
    BASE_NAV.resultScope = COMMITTED_AREA_SET_NAV_OVERRIDE;

    renderCanvas(<DiscoverMapCanvas {...baseProps()} />);

    expect(readNearby(screen.getByTestId('property-map-mock'))).toBeNull();
  });

  it('no scope-mutating select handler reaches the map in EITHER draft state (owner ruling: panel is the only Add path)', () => {
    BASE_NAV.resultScope = COMMITTED_AREA_SET_NAV_OVERRIDE;

    for (const isAreaSetDraftOpen of [true, false]) {
      mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen });
      const { unmount } = renderCanvas(<DiscoverMapCanvas {...baseProps()} />);
      expect(screen.getByTestId('property-map-mock')).toHaveAttribute(
        'data-has-area-set-candidate-select',
        'false',
      );
      unmount();
    }
  });
});

// Issue #2456 (owner ruling C2) — after the panel's Add, a draft MEMBER renders
// on the map as the app's canonical WHITE selected "View homes" card (the
// frozen mock's `areaPinHTML` selected branch), non-interactive, resolved
// through `useDiscoverAreas` for geo centre/label/totals. Add stays
// draft-only: nothing here derives a command or touches nav.
describe('DiscoverMapCanvas — Issue #2456 (owner ruling C2): draft members cross to the map as the selected card', () => {
  const COMMITTED_AREA_SET_NAV_OVERRIDE = {
    active: {
      kind: 'AREA_SET' as const,
      areaKeys: ['IN|KA|Bengaluru|Hebbal', 'IN|KA|Bengaluru|Jakkur'],
    },
    previous: null,
  };

  afterEach(() => {
    BASE_NAV.resultScope = undefined;
  });

  function readMembers(map: HTMLElement) {
    const raw = map.getAttribute('data-area-set-draft-members');
    return raw === null || raw === 'null'
      ? null
      : (JSON.parse(raw) as Array<{ areaKey: string; label: string; lat: number; lon: number }>);
  }

  it('editor OPEN: every draft member reaches PropertyMap with its OWN area record (geo centre + label, NO count), never a fabricated position', () => {
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen: true });
    BASE_NAV.resultScope = COMMITTED_AREA_SET_NAV_OVERRIDE;

    renderCanvas(<DiscoverMapCanvas {...baseProps()} />);

    const members = readMembers(screen.getByTestId('property-map-mock'));
    expect(members).not.toBeNull();
    expect(members).toEqual(
      expect.arrayContaining(
        DISCOVER_AREAS.map((a) => ({
          areaKey: a.areaKey,
          label: a.name,
          lat: a.geoCenterLat,
          lon: a.geoCenterLon,
        })),
      ),
    );
    expect(members).toHaveLength(DISCOVER_AREAS.length);
    // Members and nearby candidates are disjoint sets — a key is never both.
    const nearbyRaw = screen.getByTestId('property-map-mock').getAttribute('data-area-set-nearby-candidates');
    const nearbyKeys = (JSON.parse(nearbyRaw ?? '[]') as Array<{ areaKey: string }>).map((c) => c.areaKey);
    for (const m of members ?? []) expect(nearbyKeys).not.toContain(m.areaKey);
  });

  it('editor CLOSED: no draft members are published', () => {
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen: false });
    BASE_NAV.resultScope = COMMITTED_AREA_SET_NAV_OVERRIDE;

    renderCanvas(<DiscoverMapCanvas {...baseProps()} />);

    expect(readMembers(screen.getByTestId('property-map-mock'))).toBeNull();
  });

  it('close (open -> closed rerender) removes the members with the callouts', () => {
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen: true });
    BASE_NAV.resultScope = COMMITTED_AREA_SET_NAV_OVERRIDE;
    const { rerender } = renderCanvas(<DiscoverMapCanvas {...baseProps()} />);
    expect(readMembers(screen.getByTestId('property-map-mock'))).not.toBeNull();

    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen: false });
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AreaSetDraftProvider>
          <DiscoverMapCanvas {...baseProps()} />
        </AreaSetDraftProvider>
      </QueryClientProvider>,
    );
    expect(readMembers(screen.getByTestId('property-map-mock'))).toBeNull();
  });
});

// Issue #2478 — the floating scope-summary overlay (`ActiveScopeChip`) has
// been removed entirely (its summary now lives inside AreaSelectedPanel
// instead); this asserts it is genuinely UNMOUNTED, not merely hidden —
// `queryByTestId(...)` + `not.toBeInTheDocument()` fails a `display:none` /
// `hidden` / `opacity:0` regression just as loudly as a real re-mount would,
// which a `not.toBeVisible()` assertion would NOT.
describe('DiscoverMapCanvas — Issue #2478: floating ActiveScopeChip overlay removed (unmounted, not hidden)', () => {
  const COMMITTED_VIEWPORT_NAV_OVERRIDE = {
    active: {
      kind: 'VIEWPORT' as const,
      bounds: { s: 12.9, w: 77.5, n: 13.1, e: 77.7 },
    },
    previous: null,
  };
  const COMMITTED_POLYGON_NAV_OVERRIDE = {
    active: {
      kind: 'POLYGON' as const,
      coordinates: [
        [77.5, 12.9],
        [77.7, 12.9],
        [77.7, 13.1],
        [77.5, 13.1],
        [77.5, 12.9],
      ] as [number, number][],
    },
    previous: null,
  };

  afterEach(() => {
    // BASE_NAV is a shared hoisted fixture read by every test in this file —
    // restore it after any test here that mutates resultScope (same
    // established pattern as the AREA_SET describe block's own afterEach
    // above).
    BASE_NAV.resultScope = undefined;
  });

  it('renders NO active-scope-chip overlay when a VIEWPORT scope is committed', () => {
    BASE_NAV.resultScope = COMMITTED_VIEWPORT_NAV_OVERRIDE;

    renderCanvas(<DiscoverMapCanvas {...baseProps()} />);

    // Not-in-document, not merely not-visible — the whole point of this
    // test is to catch a CSS-hide regression, which a toBeVisible() check
    // would silently pass.
    expect(screen.queryByTestId('active-scope-chip-viewport')).not.toBeInTheDocument();
    expect(screen.queryByTestId('active-scope-chip-polygon')).not.toBeInTheDocument();
  });

  it('renders NO active-scope-chip overlay when a POLYGON scope is committed', () => {
    BASE_NAV.resultScope = COMMITTED_POLYGON_NAV_OVERRIDE;

    renderCanvas(<DiscoverMapCanvas {...baseProps()} />);

    expect(screen.queryByTestId('active-scope-chip-viewport')).not.toBeInTheDocument();
    expect(screen.queryByTestId('active-scope-chip-polygon')).not.toBeInTheDocument();
  });
});

// ── Issue #2698 — mobile Map bottom chrome no longer stacks on one strip ─────
//
// At 375–412px the desktop bottom chrome (tip pill, count badge, legend, both
// Recenter buttons, Leaflet zoom) overlapped on the full-screen mobile Map.
// `mobileListButton` is supplied ONLY while that overlay is open, so it is the
// mobile/desktop discriminator here; desktop must stay exactly as it was.
describe('Issue #2698 — mobile Map bottom chrome', () => {
  const AREA_SELECTED_WITH_COUNT: Partial<DiscoverMapCanvasProps> = {
    isLandingState: false,
    resolvedPanelContent: 'area-selected',
    isAreaFirstSelectedAreaState: true,
    selectedArea: {
      areaKey: 'IN|KA|Udupi|Manipal',
      areaLabel: 'Manipal',
      geo_center_lat: 13.35,
      geo_center_lon: 74.79,
      bbox: null,
    },
    areaResultSummaryText: '4 verified properties in Manipal',
    discoverBadge: { ...DISCOVER_BADGE, visible: true, count: 4, state: 'ok' },
  };
  const MOBILE_MAP: Partial<DiscoverMapCanvasProps> = {
    mobileListButton: <button type="button">List</button>,
    onFiltersChange: vi.fn(),
  };

  it('desktop (no mobile overlay): keeps the tip pill, the count badge and the bottom-4 Recenter placement', () => {
    renderCanvas(<DiscoverMapCanvas {...baseProps(AREA_SELECTED_WITH_COUNT)} />);

    expect(screen.getByTestId('discover-map-tip-pill')).toBeInTheDocument();
    expect(screen.getByTestId('discover-badge')).toHaveTextContent('4 verified properties in Manipal');
    const recenterColumn = screen.getByTestId('map-recenter-city-button').parentElement;
    expect(recenterColumn).toHaveClass('bottom-4', 'right-4');
    expect(recenterColumn).not.toHaveClass('bottom-[100px]');
  });

  it('mobile Map: drops the desktop "Click an area marker" tip pill', () => {
    renderCanvas(<DiscoverMapCanvas {...baseProps({ ...AREA_SELECTED_WITH_COUNT, ...MOBILE_MAP })} />);

    expect(screen.queryByTestId('discover-map-tip-pill')).not.toBeInTheDocument();
  });

  // The heading counts the map's own result set (`markersReturnedElements`), not
  // `discoverBadge.count`. With no markers supplied it renders the "0 matching" zero-state
  // block instead of a count, so each badge-hidden case feeds the SAME 4 to both sources and
  // asserts the heading actually states it.
  const FOUR_MAP_RESULTS: Partial<DiscoverMapCanvasProps> = { markersReturnedElements: 4 };

  it('mobile Map: drops the bottom count badge the results heading already states', () => {
    renderCanvas(
      <DiscoverMapCanvas {...baseProps({ ...AREA_SELECTED_WITH_COUNT, ...FOUR_MAP_RESULTS, ...MOBILE_MAP })} />,
    );

    // The count is still on screen — once, in the #2628 results heading.
    expect(screen.getByTestId('map-results-heading-text')).toHaveTextContent(/^4 homes for sale · Residential/);
    expect(screen.queryByTestId('discover-badge')).not.toBeInTheDocument();
  });

  it('mobile Map, school radius: drops the count badge while the results heading states the same count', () => {
    renderCanvas(
      <DiscoverMapCanvas
        {...baseProps({
          ...MOBILE_MAP,
          ...FOUR_MAP_RESULTS,
          isLandingState: false,
          resolvedPanelContent: 'school-selected',
          schoolRadiusActive: true,
          discoverBadge: { ...DISCOVER_BADGE, visible: true, count: 4, state: 'ok' },
        })}
      />,
    );

    expect(screen.getByTestId('map-results-heading-text')).toHaveTextContent(/^4 homes for sale · Residential/);
    expect(screen.queryByTestId('discover-badge')).not.toBeInTheDocument();
  });

  // The 'stale' badge state ("Filtered results", no figure) arises in school radius with filters
  // when no honest unfiltered N exists. On the mobile Map it stays hidden: the heading already says
  // the results are filtered ("Filtered: …") beside the map's own count, and re-showing the pill
  // would put it back across the zoom control. ('loading' needs no case: deriveDiscoverBadge
  // returns visible:false there, so the badge renders on neither desktop nor mobile.)
  const SCHOOL_RADIUS_STALE: Partial<DiscoverMapCanvasProps> = {
    ...FOUR_MAP_RESULTS,
    isLandingState: false,
    resolvedPanelContent: 'school-selected',
    schoolRadiusActive: true,
    filters: { ...baseProps().filters, bedrooms: [2] },
    discoverBadge: { ...DISCOVER_BADGE, visible: true, count: null, state: 'stale' },
  };

  it('desktop, school radius + filters (stale badge): the "Filtered results" pill renders', () => {
    renderCanvas(<DiscoverMapCanvas {...baseProps(SCHOOL_RADIUS_STALE)} />);

    expect(screen.getByTestId('discover-badge-stale')).toHaveTextContent('Filtered results');
  });

  it('mobile Map, school radius + filters (stale badge): the heading covers it — count plus "Filtered:" summary', () => {
    renderCanvas(<DiscoverMapCanvas {...baseProps({ ...SCHOOL_RADIUS_STALE, ...MOBILE_MAP })} />);

    expect(screen.queryByTestId('discover-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('map-results-heading-text')).toHaveTextContent(/^4 homes for sale · Residential/);
    expect(screen.getByTestId('map-filtered-summary')).toHaveTextContent(/Filtered:/);
  });

  it('mobile Map: lifts "Recenter on <city>" above the bottom-right Leaflet zoom control', () => {
    renderCanvas(<DiscoverMapCanvas {...baseProps({ ...AREA_SELECTED_WITH_COUNT, ...MOBILE_MAP })} />);

    const recenterColumn = screen.getByTestId('map-recenter-city-button').parentElement;
    expect(recenterColumn).toHaveClass('bottom-[100px]', 'right-[10px]');
    expect(recenterColumn).not.toHaveClass('bottom-4');
  });

  it('mobile Map: keeps the count badge where the results heading does NOT state that count (selected group)', () => {
    renderCanvas(
      <DiscoverMapCanvas
        {...baseProps({
          ...MOBILE_MAP,
          isLandingState: false,
          resolvedPanelContent: 'area-groups-landing',
          isSelectedGroupState: true,
          discoverBadge: { ...DISCOVER_BADGE, visible: true, count: 8, state: 'ok' },
          fallbackBadgeCopy: '8 properties',
        })}
      />,
    );

    expect(screen.getByTestId('discover-badge')).toBeInTheDocument();
  });

  // The anonymous school-radius "showing first N" hint is `z-[1000]`; the Recenter buttons are
  // `z-[500]`. Wherever the hint's box shares the right-hand column with them it swallows their
  // taps, so on the mobile Map it must sit ABOVE the whole column (zoom ≈ 0–90px, city recenter
  // 100–130px, area recenter 144–182px from the bottom), not at the desktop `bottom-28` (112px).
  const SCHOOL_RADIUS_MORE_HINT: Partial<DiscoverMapCanvasProps> = {
    isLandingState: false,
    resolvedPanelContent: 'school-selected',
    isAuthenticated: false,
    schoolRadiusActive: true,
    schoolRadiusHasMore: true,
    hasActiveAnonFilter: false,
  };

  it('mobile Map: lifts the school-radius "more" hint above the right-hand Recenter column', () => {
    renderCanvas(<DiscoverMapCanvas {...baseProps({ ...SCHOOL_RADIUS_MORE_HINT, ...MOBILE_MAP })} />);

    const hint = screen.getByTestId('school-radius-more-hint');
    expect(hint).toHaveClass('bottom-[192px]', 'right-[10px]');
    expect(hint).not.toHaveClass('bottom-28');
    // Still on screen alongside the city recenter it used to cover.
    expect(screen.getByTestId('map-recenter-city-button')).toBeInTheDocument();
  });

  it('desktop (no mobile overlay): keeps the school-radius "more" hint at bottom-28 right-4', () => {
    renderCanvas(<DiscoverMapCanvas {...baseProps(SCHOOL_RADIUS_MORE_HINT)} />);

    const hint = screen.getByTestId('school-radius-more-hint');
    expect(hint).toHaveClass('bottom-28', 'right-4');
    expect(hint).not.toHaveClass('bottom-[192px]');
  });
});
