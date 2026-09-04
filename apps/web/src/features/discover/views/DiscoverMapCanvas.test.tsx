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
    onAreaSetCandidateSelect?: (areaKey: string) => void;
    areaSetAtMax?: boolean;
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
      data-has-area-set-candidate-select={String(typeof props.onAreaSetCandidateSelect === 'function')}
      data-area-set-at-max={String(props.areaSetAtMax ?? false)}
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
  };
}

beforeEach(() => {
  mockUseDiscoverShell.mockReturnValue(defaultShellMock());
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

  it('editor OPEN (isAreaSetDraftOpen: true): PropertyMap DOES get the committed AREA_SET keys as candidates, plus a real select handler', () => {
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
    expect(map).toHaveAttribute('data-has-area-set-candidate-select', 'true');
  });

  it('close/cancel (isAreaSetDraftOpen flips true -> false on rerender): candidate mode is fully restored to the normal marker path, not left active', () => {
    mockUseDiscoverShell.mockReturnValue({ ...defaultShellMock(), isAreaSetDraftOpen: true });
    BASE_NAV.resultScope = COMMITTED_AREA_SET_NAV_OVERRIDE;

    const { rerender } = renderCanvas(<DiscoverMapCanvas {...baseProps()} />);
    expect(screen.getByTestId('property-map-mock')).toHaveAttribute('data-has-area-set-candidate-select', 'true');

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
  });
});
