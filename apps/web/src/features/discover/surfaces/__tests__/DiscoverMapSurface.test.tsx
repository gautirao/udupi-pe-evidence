/**
 * Issue #1953 (build step 4) — unit tests for DiscoverMapSurface (renamed
 * from DiscoverMapMount), the true-unmount gate powering the mobile List/Map
 * shell.
 *
 * The reviewer-enforced contract under test: on mobile LIST, this component
 * must return `null` — no hidden/display:none/visibility:hidden/opacity:0/
 * off-screen wrapper standing in for the real map. `container.firstChild`
 * must be genuinely absent, not merely invisible.
 *
 * Issue #2142 Commit 4 — repointed to the renamed component + module path.
 * `baseProps()` still returns the same flat `DiscoverMapCanvasProps`-shaped
 * fixture (plus the surface-only additions DiscoverMapSurfaceProps needs);
 * `renderSurface()` pipes it through the REAL production
 * `buildMapSurfaceModel`/`buildMapSurfaceCommands` builders (not a parallel
 * test-only mapping) before rendering, so this suite also exercises those
 * builders, not just the component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import type {
  DiscoverJourneyTransitionsView,
  DiscoverJourneyTransitionsCommands,
} from '@/features/discover/state/useDiscoverJourneyTransitions';
import type { SchoolsByAreaResponse } from '@/hooks/useSchoolsByArea';
import type { DiscoverBadgeResult } from '@/features/discover/presentation/discoverBadge';
import type { DiscoverShellContextValue, DiscoverNavContextValue } from '@/features/discover/context/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

// Vitest 3 takes a SINGLE function-type argument. The Vitest-1 two-argument form
// (`vi.fn<[], DiscoverShellContextValue>()`) is rejected with TS2558, and the
// rejection degrades the mock's parameter list to `never` (the knock-on TS2345).
// Worse than the two errors: with the generic rejected the mock was no longer typed
// as RETURNING DiscoverShellContextValue, so every mockReturnValue below was checked
// against a degraded type and a mock missing required context fields would not have
// been flagged. Correct typing restores that check.
const useDiscoverShellMock = vi.fn<() => DiscoverShellContextValue>();

// Issue #2017 (test scaffolding fix) — DiscoverMapSurface now wraps the
// (mocked-out) DiscoverMapCanvas in <AreaSetDraftProvider> internally (see
// DiscoverMapSurface.tsx), and AreaSetDraftProvider calls useDiscoverNav()
// directly, so this mock of the facade module must also export it. Minimal
// valid shape — only `city`, `filters`, and `resultScope` are read by
// AreaSetDraftProvider/useAreaSetDraft — built via vi.hoisted() to avoid the
// TDZ inside the (hoisted) vi.mock() factory below, mirroring
// DiscoverMapCanvas.test.tsx's BASE_NAV pattern.
const BASE_NAV = vi.hoisted(
  () =>
    ({
      city: 'bangalore',
      areaKey: null,
      filters: {},
      schoolId: null,
      radiusKm: null,
      q: '',
      journey: null,
      groupId: null,
      selectedGroup: null,
      intent: 'buy',
      scope: null,
      resultScope: null,
    }) as unknown as DiscoverNavContextValue,
);

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverShell: () => useDiscoverShellMock(),
  useDiscoverNav: () => BASE_NAV,
}));

vi.mock('../../views/DiscoverMapCanvas', () => ({
  DiscoverMapCanvas: () => <div data-testid="discover-map-canvas-mock" />,
}));

import { DiscoverMapSurface } from '../DiscoverMapSurface';
import { buildMapSurfaceModel, buildMapSurfaceCommands } from '../buildMapSurfaceModel';
import type { BuildMapSurfaceViewParams, BuildMapSurfaceCommandsParams } from '../buildMapSurfaceModel';

/**
 * Issue #2142 (correction pass) — the map builder's input is now the
 * controllers' own result objects. These fixtures keep a FLAT shape on purpose
 * (many call sites read better with flat overrides) and regroup mechanically
 * here, so the assertions still run through the REAL production builders.
 */
function toMapParams<T extends Record<string, unknown>>(f: T) {
  const g = f as Record<string, never>;
  return {
    ...f,
    areaGroupsController: { focusedGroupAreas: g.focusedGroupAreas, focusedGroup: g.focusedGroup },
    badgeController: { announcedBadgeText: g.announcedBadgeText, discoverBadge: g.discoverBadge, areaResultSummaryText: g.areaResultSummaryText, groupSelectedBadgeCopy: g.groupSelectedBadgeCopy, fallbackBadgeCopy: g.fallbackBadgeCopy, schoolRadiusActive: g.schoolRadiusActive, schoolRadiusPillNoun: g.schoolRadiusPillNoun, cityTotal: g.cityTotal, hasActiveAnonFilter: g.hasActiveAnonFilter },
    journeyChromeController: { isLandingState: g.isLandingState, showSchoolMarkers: g.showSchoolMarkers, showSchoolBreadcrumb: g.showSchoolBreadcrumb, schoolRadiusOverlay: g.schoolRadiusOverlay, isSelectedGroupState: g.isSelectedGroupState, isAreaFirstSelectedAreaState: g.isAreaFirstSelectedAreaState },
    geographyController: { handleAreaMarkersComputed: g.handleAreaMarkersComputed },
    pageContextController: {
      isAuthenticated: g.isAuthenticated,
      isAgriJourney: g.isAgriJourney,
      navigate: g.navigate,
      setMobileView: g.setMobileView,
    },
    pageStateController: {
      showLoader: g.showLoader,
      filters: g.filters,
      selectedSchool: g.selectedSchool,
      panToArea: g.panToArea,
      mapZoom: g.mapZoom,
      mapReady: g.mapReady,
      city: g.city,
      resolvedPanelContent: g.resolvedPanelContent,
      effectiveSelectedArea: g.selectedArea,
      handlePolygonDrawn: g.handlePolygonDrawn,
      handlePolygonCleared: g.handlePolygonCleared,
      setMapZoom: g.setMapZoom,
      setMapReady: g.setMapReady,
      handleCityChange: g.handleCityChange,
    },
    mapDataController: {
      error: g.error,
      activeFocusBounds: g.activeFocusBounds,
      cityCenter: g.cityCenter,
      cityZoom: g.cityZoom,
      cameraIntent: g.cameraIntent,
      areaMarkerListings: g.areaMarkerListings,
      schoolRadiusHasMore: g.schoolRadiusHasMore,
      markersTruncated: g.markersTruncated,
      markersReturnedElements: g.markersReturnedElements,
      markersTotalFilteredElements: g.markersTotalFilteredElements,
      isLoading: g.isLoading,
      publishCameraIntent: g.publishCameraIntent,
      publishClusterCameraIntent: g.publishClusterCameraIntent,
      publishMarkerClusterCameraIntent: g.publishMarkerClusterCameraIntent,
    },
    markerPopoverController: {
      currentMapMarkerListings: g.currentMapMarkerListings,
      markerPopoverStepper: g.markerPopoverStepper,
      handleStepMarkerListing: g.handleStepMarkerListing,
    },
    cameraController: { ...(f.cameraController as object), memoizedInitialCenter: g.memoizedInitialCenter, schoolMarkerFocusTick: g.schoolMarkerFocusTick, schoolMarkerPositions: g.schoolMarkerPositions, areaRestoreArea: g.areaRestoreArea },
    regionGuideController: { ...(f.regionGuideController as object), regionGuideVisible: g.regionGuideVisible, regionGuideRingActive: g.regionGuideRingActive },
    mobilePresentationController: { ...(f.mobilePresentationController as object), isPreviewSheetOpen: g.isPreviewSheetOpen, selectedListingPreview: g.selectedListingPreview },
    markerController: { ...(f.markerController as object), showMarkerInList: g.showMarkerInList },
    // MUST-HAVE #2 (PR review 5085561270) — viewportSearchController now feeds
    // both isDirty/isEligible (view builder) and activate (commands builder).
    viewportSearchController: {
      ...(f.viewportSearchController as object),
      isDirty: g.isDirty,
      isEligible: g.isEligible,
      activate: g.activate,
    },
  } as never;
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

// See DiscoverMapCanvas.test.tsx's identical fixture note: the canvas only
// reads .isLoading/.isError/.error, threaded to PropertyMap's schools*
// props — a full literal would need dozens of unused react-query internals.
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

const JOURNEY: UseAreasNavigationJourneyResult = {
  isLoading: false,
  isError: false,
  error: null,
  node: null,
  levelKind: 'areas',
  children: [],
  resolutionNotice: null,
  nodeCount: null,
  schoolsNotSimulatedForRevision: false,
  selectNode: vi.fn(),
  refetch: vi.fn(),
  historyAdjacencyLog: [],
};

function baseProps(
  overrides: Record<string, unknown> = {},
) {
  return toMapParams({
    mapContainerRef: createRef<HTMLDivElement>(),
    showLoader: false,
    error: null,
    currentMapMarkerListings: [],
    activeFocusBounds: null,
    filters: {},
    isLandingState: true,
    handlePolygonDrawn: vi.fn(),
    handlePolygonCleared: vi.fn(),
    selectedSchool: null,
    memoizedInitialCenter: undefined,
    cityCenter: undefined,
    cityZoom: undefined,
    publishCameraIntent: vi.fn(),
    cameraIntent: null,
    focusedGroupAreas: undefined,
    selectedArea: null,
    publishClusterCameraIntent: vi.fn(),
    handleAreaMarkersComputed: vi.fn(),
    setMapZoom: vi.fn(),
    panToArea: null,
    setMapReady: vi.fn(),
    schoolMarkerFocusTick: 0,
    schoolMarkerPositions: [],
    areaRestoreArea: null,
    isAgriJourney: false,
    showSchoolMarkers: false,
    showSchoolBreadcrumb: false,
    focusedGroup: null,
    city: 'bangalore',
    schoolRadiusOverlay: false,
    resolvedPanelContent: 'guided-entry',
    isSelectedGroupState: false,
    handleCityChange: vi.fn(),
    regionGuideVisible: false,
    regionGuideRingActive: false,
    areaMarkerListings: [],
    announcedBadgeText: '',
    discoverBadge: DISCOVER_BADGE,
    areaResultSummaryText: null,
    groupSelectedBadgeCopy: '',
    fallbackBadgeCopy: '',
    isAreaFirstSelectedAreaState: false,
    schoolRadiusActive: false,
    schoolRadiusPillNoun: 'homes',
    cityTotal: 0,
    isAuthenticated: false,
    schoolRadiusHasMore: false,
    hasActiveAnonFilter: false,
    markersTruncated: false,
    markersReturnedElements: undefined,
    markersTotalFilteredElements: undefined,
    isLoading: false,
    mapZoom: 10,
    isMarkerPopoverEligible: false,
    markerPopoverStepper: null,
    navigate: vi.fn(),
    handleStepMarkerListing: vi.fn(),
    showMarkerInList: vi.fn(),
    onAreaVisualClusterCameraIntent: vi.fn(),
    onNavigationNodeHoverChange: vi.fn(),
    onClusterFocusChange: vi.fn(),
    buildNavigationNodeHref: vi.fn(),
    publishMarkerClusterCameraIntent: vi.fn(),
    // surface-only additions (not part of DiscoverMapCanvasProps)
    mobileMapOpen: false,
    setMobileView: vi.fn(),
    isGroupResultsState: false,
    isNodeListingsState: false,
    activeAreasNavigationJourney: JOURNEY,
    navJourney: 'area-first',
    isPreviewSheetOpen: false,
    selectedListingPreview: null,
    mapReady: false,
    // command-only additions
    clearSelectedListing: vi.fn(),
    // MUST-HAVE #2 (PR review 5085561270) — feeds viewportSearchController above.
    isDirty: false,
    isEligible: false,
    activate: vi.fn(),
    // controller result objects
    navigationController: {
      hoveredNavigationNodeKey: null,
      setHoveredNavigationNodeKey: vi.fn(),
      focusedClusterMemberAreaKeys: null,
      setFocusedClusterMemberAreaKeys: vi.fn(),
    },
    agriController: { selectedRegion: null, selectedMaxKm: null, filteredAgriListings: null },
    schoolController: {
      schoolZoneLabels: [],
      schools: [],
      schoolsQuery: SCHOOLS_QUERY,
      schoolFirstAreaSchoolCount: null,
      schoolFirstZoneSchoolCount: null,
      schoolFirstLandingSchoolCount: null,
      schoolListings: [],
      journeyView: JOURNEY_VIEW,
      journeyCommands: JOURNEY_COMMANDS,
    },
    interactionController: {
      hoveredListingId: null,
      hoveredAreaKeyForMap: null,
      handleAreaClusterClick: vi.fn(),
    },
    cameraController: {
      agriGroupFocusBounds: null,
      isColdNavigate: false,
      isSelectedNodeOutOfView: false,
      schoolFocusTick: 0,
      selectedSchoolLat: undefined,
      selectedSchoolLon: undefined,
      handleRecenterOnSelectedNode: vi.fn(),
    },
    mapLayerController: {
      overviewAreas: [],
      // Issue #2015 MUST-HAVE #3 — nav-state-independent area lookup added
      // alongside overviewAreas; kept in this fixture for shape parity with
      // the real controller's return object (see MapLayerSlice).
      discoverAreas: [],
      areaSearchMatchKeys: undefined,
      resolvedRegionLabel: null,
      regionOverviewMarkerKind: null,
      isRegionOverview: false,
      regionOverviewShortLabel: null,
      areaJourneySegments: [],
      schoolJourneySegments: [],
      isAreaFirstCityLanding: false,
    },
    regionGuideController: {
      regionSelectNonce: 0,
      prefersReducedMotion: false,
      dismissRegionGuide: vi.fn(),
    },
    overviewNavigationController: { handleOverviewAreaClick: vi.fn() },
    mobilePresentationController: {
      bottomOcclusionPx: 0,
      previewOcclusionPx: 0,
      handlePreviewSheetHeightChange: vi.fn(),
    },
    viewportTrackerController: { handleBoundsChange: vi.fn() },
    markerController: {
      markerPixelPos: null,
      selectedMarkerListing: null,
      handlePopoverDismiss: vi.fn(),
      handleSelectMarkerListing: vi.fn(),
      handleMarkerClickWithPosition: vi.fn(),
    },
    ...overrides,
  });
}

// Issue #2017 (test scaffolding fix) — DiscoverMapSurface wraps its mounted
// canvas in <AreaSetDraftProvider> internally, whose useNearbyAreaCandidates
// call needs a QueryClient ancestor. Same
// `new QueryClient({ defaultOptions: { queries: { retry: false } } })` +
// QueryClientProvider convention used elsewhere in this codebase's test
// suites (e.g. DiscoverMapCanvas.test.tsx, ListingEditorDrawer.test.tsx).
function renderSurface(
  overrides: Record<string, unknown> = {},
) {
  const props = baseProps(overrides);
  const view = buildMapSurfaceModel(props);
  const commands = buildMapSurfaceCommands(props);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiscoverMapSurface view={view} commands={commands} mapContainerRef={(props as { mapContainerRef: React.RefObject<HTMLDivElement> }).mapContainerRef} />
    </QueryClientProvider>,
  );
}

function mockShell(overrides: Partial<DiscoverShellContextValue> = {}): void {
  useDiscoverShellMock.mockReturnValue({
    mobileView: 'LIST',
    setMobileView: vi.fn(),
    isMobileShell: false,
    isAreaSetDraftOpen: false,
    openAreaSetDraft: vi.fn(),
    closeAreaSetDraft: vi.fn(),
    fitAreaSet: vi.fn(),
    focusAreaSetMember: vi.fn(),
    // Issue #2419 (PR-2) — new required shell member (see context/types.ts).
    startDrawSearchArea: vi.fn(),
    registerAreaSetCameraActions: vi.fn(),
    getAreaSetCameraRestoreRequest: vi.fn(() => null),
    setAreaSetCameraRestoreRequest: vi.fn(),
    ...overrides,
  });
}

describe('DiscoverMapSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('desktop (isMobileShell=false) always mounts the canvas, regardless of mobileView', async () => {
    mockShell({ isMobileShell: false, mobileView: 'LIST' });
    renderSurface();
    await waitFor(() => {
      expect(screen.getByTestId('discover-map-canvas-mock')).toBeInTheDocument();
    });
  });

  it('mobile LIST does not mount the canvas: shouldMount is false', () => {
    mockShell({ isMobileShell: true, mobileView: 'LIST' });
    renderSurface();
    expect(screen.queryByTestId('discover-map-canvas-mock')).not.toBeInTheDocument();
  });

  it('mobile MAP mounts the canvas', async () => {
    mockShell({ isMobileShell: true, mobileView: 'MAP' });
    renderSurface();
    await waitFor(() => {
      expect(screen.getByTestId('discover-map-canvas-mock')).toBeInTheDocument();
    });
  });

  it('the null return renders NOTHING (mobile LIST, no overlays active) — no container element exists at all, not merely a hidden one', () => {
    mockShell({ isMobileShell: true, mobileView: 'LIST' });
    const { container } = renderSurface();
    // A component faking unmount with display:none/visibility:hidden/opacity:0
    // would still leave a DOM node behind. A true `return null` leaves the
    // container completely empty.
    expect(container.firstChild).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('the mounted render contains no hidden/off-screen wrapper standing in for the map', async () => {
    mockShell({ isMobileShell: true, mobileView: 'MAP' });
    const { container } = renderSurface();
    await waitFor(() => {
      expect(screen.getByTestId('discover-map-canvas-mock')).toBeInTheDocument();
    });
    // No ancestor of the mock canvas carries a hidden/display:none/opacity:0/
    // visibility:hidden style or the `hidden` attribute.
    let node: HTMLElement | null = screen.getByTestId('discover-map-canvas-mock');
    while (node && node !== container) {
      expect(node.hasAttribute('hidden')).toBe(false);
      expect(node.style.display).not.toBe('none');
      expect(node.style.visibility).not.toBe('hidden');
      expect(node.style.opacity).not.toBe('0');
      node = node.parentElement;
    }
  });

  it('renders exactly ONE canvas instance when mounted', async () => {
    mockShell({ isMobileShell: false, mobileView: 'LIST' });
    renderSurface();
    await waitFor(() => {
      expect(screen.getAllByTestId('discover-map-canvas-mock')).toHaveLength(1);
    });
  });
});
