/**
 * Issue #1824 Slice S11a — render tests for DiscoverMapCanvas (the map-half
 * sub-view lifted out of MapDiscovery.tsx). Covers: PropertyMap + key overlay
 * rendering given representative props, the mapContainerRef root, and the S8
 * badge-fork import-guard (this module must never import formatDiscoverBadgeCopy /
 * deriveSchoolRadiusPillNoun / hasActiveAnonPropertyFilter — those stay page-owned).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import type { DiscoverUrlState, DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import type {
  DiscoverJourneyTransitionsView,
  DiscoverJourneyTransitionsCommands,
} from '@/features/discover/state/useDiscoverJourneyTransitions';
import type { SchoolsByAreaResponse } from '@/hooks/useSchoolsByArea';
import type { DiscoverBadgeResult } from '@/pages/MapDiscovery';

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: () => <div data-testid="property-map-mock" />,
}));

import { DiscoverMapCanvas, type DiscoverMapCanvasProps } from './DiscoverMapCanvas';

const BASE_URL_STATE: DiscoverUrlState = {
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

// The URL-actions surface is a large, page-owned interface; every method here is a
// no-op stub since the canvas only ever invokes selectGroup/reportViewport from the
// moved JSX — the rest exist purely to satisfy the DiscoverUrlActions contract.
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
  setSelectedListing: vi.fn(),
  clearSelectedListing: vi.fn(),
  setLocality: vi.fn(),
  clearLocality: vi.fn(),
  clearAgriFilters: vi.fn(),
  setIntent: vi.fn(),
  setSchoolJourney: vi.fn(),
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
    filters: {},
    isLandingState: true,
    handlePolygonDrawn: vi.fn(),
    handlePolygonCleared: vi.fn(),
    selectedSchool: null,
    memoizedInitialCenter: undefined,
    urlState: BASE_URL_STATE,
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
    urlActions: URL_ACTIONS,
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
    isMarkerPopoverEligible: false,
    markerPopoverStepper: null,
    navigate: vi.fn(),
    handleStepMarkerListing: vi.fn(),
    showMarkerInList: vi.fn(),
    ...overrides,
  };
}

describe('DiscoverMapCanvas', () => {
  it('renders PropertyMap and attaches mapContainerRef to the root div', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(<DiscoverMapCanvas {...baseProps({ mapContainerRef: ref })} />);
    expect(screen.getByTestId('property-map-mock')).toBeInTheDocument();
    // The root element DiscoverMapCanvas returns must be the div carrying mapContainerRef —
    // verifies no extra wrapper node was introduced around the moved JSX (AC1/DOM parity).
    expect(container.firstElementChild).toBe(ref.current);
  });

  it('shows the error card instead of PropertyMap when error is set', () => {
    render(<DiscoverMapCanvas {...baseProps({ error: new Error('boom') })} />);
    expect(screen.queryByTestId('property-map-mock')).not.toBeInTheDocument();
    expect(screen.getByText('Failed to load listings')).toBeInTheDocument();
  });

  it('renders CitySelect when the panel content allows it (drill-down state)', () => {
    render(
      <DiscoverMapCanvas
        {...baseProps({
          resolvedPanelContent: 'area-groups-landing',
          isAreaFirstCityLanding: false,
          isSelectedGroupState: false,
        })}
      />,
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('hides CitySelect on the guided-entry public landing', () => {
    render(<DiscoverMapCanvas {...baseProps({ resolvedPanelContent: 'guided-entry' })} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('renders the DiscoverMapCountBadge public-landing summary pill when cityTotal > 0', () => {
    render(
      <DiscoverMapCanvas
        {...baseProps({ resolvedPanelContent: 'guided-entry', cityTotal: 42 })}
      />,
    );
    const badges = screen.getAllByTestId('discover-badge');
    expect(badges.length).toBeGreaterThan(0);
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it('never renders the marker popover when isMarkerPopoverEligible is false, even with a pixel position', () => {
    render(
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
    expect(importLines).not.toMatch(/features\/discover\/presentation\/discoverBadge/);
    expect(importLines).not.toMatch(/features\/discover\/presentation\/schoolFirstCounts/);
    expect(importLines).not.toMatch(/features\/discover\/presentation\/anonPropertyFilters/);
    // Belt-and-suspenders: the helper identifiers themselves must never appear as a
    // named import binding (only inside comments, which this file legitimately has).
    expect(importLines).not.toMatch(/formatDiscoverBadgeCopy|deriveSchoolRadiusPillNoun|hasActiveAnonPropertyFilter/);
  });
});
