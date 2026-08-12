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
 * `buildMapSurfaceView`/`buildMapSurfaceCommands` builders (not a parallel
 * test-only mapping) before rendering, so this suite also exercises those
 * builders, not just the component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import type {
  DiscoverJourneyTransitionsView,
  DiscoverJourneyTransitionsCommands,
} from '@/features/discover/state/useDiscoverJourneyTransitions';
import type { SchoolsByAreaResponse } from '@/hooks/useSchoolsByArea';
import type { DiscoverBadgeResult } from '@/features/discover/presentation/discoverBadge';
import type { DiscoverShellContextValue } from '@/features/discover/context/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

// Vitest 3 takes a SINGLE function-type argument. The Vitest-1 two-argument form
// (`vi.fn<[], DiscoverShellContextValue>()`) is rejected with TS2558, and the
// rejection degrades the mock's parameter list to `never` (the knock-on TS2345).
// Worse than the two errors: with the generic rejected the mock was no longer typed
// as RETURNING DiscoverShellContextValue, so every mockReturnValue below was checked
// against a degraded type and a mock missing required context fields would not have
// been flagged. Correct typing restores that check.
const useDiscoverShellMock = vi.fn<() => DiscoverShellContextValue>();

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverShell: () => useDiscoverShellMock(),
}));

vi.mock('../../views/DiscoverMapCanvas', () => ({
  DiscoverMapCanvas: () => <div data-testid="discover-map-canvas-mock" />,
}));

import { DiscoverMapSurface } from '../DiscoverMapSurface';
import { buildMapSurfaceView, buildMapSurfaceCommands } from '../buildMapSurfaceView';
import type { BuildMapSurfaceViewParams, BuildMapSurfaceCommandsParams } from '../buildMapSurfaceView';

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
  selectNode: vi.fn(),
  refetch: vi.fn(),
  historyAdjacencyLog: [],
};

function baseProps(
  overrides: Partial<BuildMapSurfaceViewParams & BuildMapSurfaceCommandsParams> = {},
): BuildMapSurfaceViewParams & BuildMapSurfaceCommandsParams {
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
    filters: {},
    isLandingState: true,
    handlePolygonDrawn: vi.fn(),
    handlePolygonCleared: vi.fn(),
    selectedSchool: null,
    memoizedInitialCenter: undefined,
    cityCenter: undefined,
    cityZoom: undefined,
    overviewAreas: [],
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
    mobileListButton: null,
    // surface-only additions (not part of DiscoverMapCanvasProps)
    mobileMapOpen: false,
    activeAreasNavigationJourney: JOURNEY,
    navJourney: 'area-first',
    isPreviewSheetOpen: false,
    selectedListingPreview: null,
    mapReady: false,
    isSelectedNodeOutOfView: false,
    // command-only additions
    clearSelectedListing: vi.fn(),
    handlePreviewSheetHeightChange: vi.fn(),
    handleRecenterOnSelectedNode: vi.fn(),
    ...overrides,
  };
}

function renderSurface(
  overrides: Partial<BuildMapSurfaceViewParams & BuildMapSurfaceCommandsParams> = {},
) {
  const props = baseProps(overrides);
  const view = buildMapSurfaceView(props);
  const commands = buildMapSurfaceCommands(props);
  return render(
    <DiscoverMapSurface view={view} commands={commands} mapContainerRef={props.mapContainerRef} />,
  );
}

function mockShell(overrides: Partial<DiscoverShellContextValue> = {}): void {
  useDiscoverShellMock.mockReturnValue({
    mobileView: 'LIST',
    setMobileView: vi.fn(),
    isMobileShell: false,
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
