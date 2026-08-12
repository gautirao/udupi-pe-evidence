import { describe, expect, it, vi } from 'vitest';
import {
  buildMapSurfaceView,
  buildMapSurfaceCommands,
  type BuildMapSurfaceViewParams,
  type BuildMapSurfaceCommandsParams,
} from '../buildMapSurfaceView';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';

function makeJourney(
  overrides: Partial<UseAreasNavigationJourneyResult> = {},
): UseAreasNavigationJourneyResult {
  return {
    node: null,
    children: [],
    selectNode: vi.fn(),
    ...overrides,
  } as unknown as UseAreasNavigationJourneyResult;
}

function makeViewParams(
  overrides: Partial<BuildMapSurfaceViewParams> = {},
): BuildMapSurfaceViewParams {
  const mapContainerRef = { current: document.createElement('div') };
  return {
    // camera
    agriGroupFocusBounds: null,
    activeFocusBounds: null,
    memoizedInitialCenter: undefined,
    isColdNavigate: false,
    cityCenter: undefined,
    cityZoom: undefined,
    cameraIntent: null,
    panToArea: null,
    bottomOcclusionPx: 0,
    previewOcclusionPx: 0,
    prefersReducedMotion: false,
    mapZoom: 12,
    // layers
    currentMapMarkerListings: [],
    selectedRegion: null,
    selectedMaxKm: null,
    filteredAgriListings: null,
    filters: {} as BuildMapSurfaceViewParams['filters'],
    isLandingState: false,
    overviewAreas: [],
    focusedGroupAreas: undefined,
    areaLayerMaxZoom: 15,
    selectedArea: null,
    areaSearchMatchKeys: undefined,
    hoveredAreaKeyForMap: null,
    isAgriJourney: false,
    areaMarkerListings: [],
    schoolZoneLabels: [],
    schoolRadiusOverlay: false,
    isRegionOverview: false,
    regionOverviewShortLabel: null,
    isBoundedBrowseState: false,
    areaRestoreArea: null,
    // navigation
    areasNavigationJourney: makeJourney(),
    hoveredNavigationNodeKey: null,
    focusedClusterMemberAreaKeys: null,
    isAreaFirstCityLanding: false,
    showSchoolBreadcrumb: false,
    areaJourneySegments: [],
    schoolJourneySegments: [],
    focusedGroup: null,
    city: 'bangalore',
    resolvedPanelContent: 'landing' as BuildMapSurfaceViewParams['resolvedPanelContent'],
    isSelectedGroupState: false,
    isAreaFirstSelectedAreaState: false,
    journeyView: {} as BuildMapSurfaceViewParams['journeyView'],
    // schools
    selectedSchool: null,
    schools: [],
    showSchoolMarkers: false,
    schoolsQuery: {} as BuildMapSurfaceViewParams['schoolsQuery'],
    schoolFocusTick: 0,
    selectedSchoolLat: undefined,
    selectedSchoolLon: undefined,
    schoolMarkerFocusTick: 0,
    schoolMarkerPositions: [],
    schoolRadiusActive: false,
    schoolRadiusPillNoun: 'homes',
    schoolFirstAreaSchoolCount: null,
    schoolFirstZoneSchoolCount: null,
    schoolFirstLandingSchoolCount: null,
    schoolRadiusHasMore: false,
    schoolListings: [],
    // markers
    markerPixelPos: null,
    selectedMarkerListing: null,
    hoveredListingId: null,
    isMarkerPopoverEligible: false,
    markerPopoverStepper: null,
    markersTruncated: false,
    markersReturnedElements: undefined,
    markersTotalFilteredElements: undefined,
    // status
    showLoader: false,
    error: null,
    isLoading: false,
    discoverBadge: {} as BuildMapSurfaceViewParams['discoverBadge'],
    areaResultSummaryText: null,
    groupSelectedBadgeCopy: '',
    fallbackBadgeCopy: '',
    cityTotal: 0,
    isAuthenticated: false,
    hasActiveAnonFilter: false,
    announcedBadgeText: '',
    // mobile
    mobileListButton: null,
    // regionGuide
    regionGuideVisible: false,
    resolvedRegionLabel: null,
    regionSelectNonce: 0,
    regionOverviewMarkerKind: 'default' as BuildMapSurfaceViewParams['regionOverviewMarkerKind'],
    regionGuideRingActive: false,
    // commands (unused by view builder but required by the shared param type)
    handlePopoverDismiss: vi.fn(),
    handlePolygonDrawn: vi.fn(),
    handlePolygonCleared: vi.fn(),
    handleOverviewAreaClick: vi.fn(),
    publishCameraIntent: vi.fn(),
    publishClusterCameraIntent: vi.fn(),
    publishMarkerClusterCameraIntent: vi.fn(),
    handleAreaClusterClick: vi.fn(),
    handleAreaMarkersComputed: vi.fn(),
    onNavigationNodeHoverChange: vi.fn(),
    onClusterFocusChange: vi.fn(),
    onAreaVisualClusterCameraIntent: vi.fn(),
    buildNavigationNodeHref: vi.fn(),
    setMapZoom: vi.fn(),
    handleBoundsChange: vi.fn(),
    setMapReady: vi.fn(),
    journeyCommands: {} as BuildMapSurfaceViewParams['journeyCommands'],
    handleSelectMarkerListing: vi.fn(),
    handleMarkerClickWithPosition: vi.fn(),
    handleCityChange: vi.fn(),
    dismissRegionGuide: vi.fn(),
    navigate: vi.fn(),
    handleStepMarkerListing: vi.fn(),
    showMarkerInList: vi.fn(),
    // surface-only additions
    mapContainerRef,
    mobileMapOpen: false,
    activeAreasNavigationJourney: makeJourney(),
    navJourney: 'area-first',
    isPreviewSheetOpen: false,
    selectedListingPreview: null,
    mapReady: false,
    isSelectedNodeOutOfView: false,
    ...overrides,
  };
}

describe('buildMapSurfaceView', () => {
  it('groups every field into its section without loss', () => {
    const view = buildMapSurfaceView(makeViewParams({ cityTotal: 42 }));
    expect(view.camera.mapZoom).toBe(12);
    expect(view.navigation.city).toBe('bangalore');
    expect(view.status.cityTotal).toBe(42);
  });

  it('mobileCluster.visible mirrors mobileMapOpen and derives eligibilityJourney from navJourney', () => {
    const view = buildMapSurfaceView(
      makeViewParams({ mobileMapOpen: true, navJourney: 'school-first' }),
    );
    expect(view.overlays.mobileCluster.visible).toBe(true);
    expect(view.overlays.mobileCluster.eligibilityJourney).toBe('schools');
  });

  it('eligibilityJourney defaults to areas for any non-school-first journey', () => {
    const view = buildMapSurfaceView(makeViewParams({ navJourney: 'agri-first' }));
    expect(view.overlays.mobileCluster.eligibilityJourney).toBe('areas');
  });

  it('listingPreview.visible requires both isPreviewSheetOpen and a non-null preview', () => {
    const preview = { id: 'listing-1' } as unknown as SelectedListingPreview;
    expect(
      buildMapSurfaceView(makeViewParams({ isPreviewSheetOpen: true, selectedListingPreview: null }))
        .overlays.listingPreview.visible,
    ).toBe(false);
    expect(
      buildMapSurfaceView(makeViewParams({ isPreviewSheetOpen: false, selectedListingPreview: preview }))
        .overlays.listingPreview.visible,
    ).toBe(false);
    expect(
      buildMapSurfaceView(makeViewParams({ isPreviewSheetOpen: true, selectedListingPreview: preview }))
        .overlays.listingPreview.visible,
    ).toBe(true);
  });

  it('recenter.visible requires mapReady, a populated container ref, out-of-view state, and a selected node', () => {
    const journeyWithNode = makeJourney({
      node: { nodeKey: 'n1', displayLabel: 'Indiranagar' } as UseAreasNavigationJourneyResult['node'],
    });
    const baseTrue = {
      mapReady: true,
      isSelectedNodeOutOfView: true,
      activeAreasNavigationJourney: journeyWithNode,
    };
    expect(buildMapSurfaceView(makeViewParams(baseTrue)).overlays.recenter.visible).toBe(true);
    expect(
      buildMapSurfaceView(makeViewParams({ ...baseTrue, mapReady: false })).overlays.recenter.visible,
    ).toBe(false);
    expect(
      buildMapSurfaceView(makeViewParams({ ...baseTrue, isSelectedNodeOutOfView: false })).overlays
        .recenter.visible,
    ).toBe(false);
    expect(
      buildMapSurfaceView(makeViewParams({ ...baseTrue, activeAreasNavigationJourney: makeJourney() }))
        .overlays.recenter.visible,
    ).toBe(false);
  });

  it('recenter.label reads the active journey node displayLabel', () => {
    const journeyWithNode = makeJourney({
      node: { nodeKey: 'n1', displayLabel: 'Indiranagar' } as UseAreasNavigationJourneyResult['node'],
    });
    const view = buildMapSurfaceView(
      makeViewParams({ activeAreasNavigationJourney: journeyWithNode }),
    );
    expect(view.overlays.recenter.label).toBe('Indiranagar');
  });
});

describe('buildMapSurfaceCommands', () => {
  function makeCommandsParams(
    overrides: Partial<BuildMapSurfaceCommandsParams> = {},
  ): BuildMapSurfaceCommandsParams {
    return {
      publishCameraIntent: vi.fn(),
      setMapZoom: vi.fn(),
      handleBoundsChange: vi.fn(),
      handlePolygonDrawn: vi.fn(),
      handlePolygonCleared: vi.fn(),
      handleOverviewAreaClick: vi.fn(),
      publishClusterCameraIntent: vi.fn(),
      onAreaVisualClusterCameraIntent: vi.fn(),
      handleAreaClusterClick: vi.fn(),
      handleAreaMarkersComputed: vi.fn(),
      onNavigationNodeHoverChange: vi.fn(),
      onClusterFocusChange: vi.fn(),
      buildNavigationNodeHref: vi.fn(),
      handleCityChange: vi.fn(),
      journeyCommands: {} as BuildMapSurfaceCommandsParams['journeyCommands'],
      handlePopoverDismiss: vi.fn(),
      handleSelectMarkerListing: vi.fn(),
      handleMarkerClickWithPosition: vi.fn(),
      publishMarkerClusterCameraIntent: vi.fn(),
      navigate: vi.fn(),
      handleStepMarkerListing: vi.fn(),
      showMarkerInList: vi.fn(),
      setMapReady: vi.fn(),
      dismissRegionGuide: vi.fn(),
      clearSelectedListing: vi.fn(),
      handlePreviewSheetHeightChange: vi.fn(),
      handleRecenterOnSelectedNode: vi.fn(),
      ...overrides,
    };
  }

  it('groups commands into their sections verbatim (same function references)', () => {
    const params = makeCommandsParams();
    const commands = buildMapSurfaceCommands(params);
    expect(commands.camera.publishCameraIntent).toBe(params.publishCameraIntent);
    expect(commands.drawing.handlePolygonDrawn).toBe(params.handlePolygonDrawn);
    expect(commands.navigation.handleOverviewAreaClick).toBe(params.handleOverviewAreaClick);
    expect(commands.markers.handleSelectMarkerListing).toBe(params.handleSelectMarkerListing);
    expect(commands.regionGuide.dismissRegionGuide).toBe(params.dismissRegionGuide);
  });

  it('overlays.onClusterFocusChange reuses the SAME command as navigation.onClusterFocusChange', () => {
    const params = makeCommandsParams();
    const commands = buildMapSurfaceCommands(params);
    expect(commands.overlays.onClusterFocusChange).toBe(commands.navigation.onClusterFocusChange);
  });

  it('overlays.onDismissPreview/onRecenter/onPreviewHeightChange wire to the passed-in handlers', () => {
    const clearSelectedListing = vi.fn();
    const handleRecenterOnSelectedNode = vi.fn();
    const handlePreviewSheetHeightChange = vi.fn();
    const commands = buildMapSurfaceCommands(
      makeCommandsParams({ clearSelectedListing, handleRecenterOnSelectedNode, handlePreviewSheetHeightChange }),
    );
    expect(commands.overlays.onDismissPreview).toBe(clearSelectedListing);
    expect(commands.overlays.onRecenter).toBe(handleRecenterOnSelectedNode);
    expect(commands.overlays.onPreviewHeightChange).toBe(handlePreviewSheetHeightChange);
  });

  it('overlays.onViewDetails navigates to /listing/:id', () => {
    const navigate = vi.fn();
    const commands = buildMapSurfaceCommands(makeCommandsParams({ navigate }));
    commands.overlays.onViewDetails('listing-42');
    expect(navigate).toHaveBeenCalledWith('/listing/listing-42');
  });
});
