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

function makeNavigationController(): BuildMapSurfaceViewParams['navigationController'] &
  BuildMapSurfaceCommandsParams['navigationController'] {
  return {
    hoveredNavigationNodeKey: null,
    setHoveredNavigationNodeKey: vi.fn(),
    focusedClusterMemberAreaKeys: null,
    setFocusedClusterMemberAreaKeys: vi.fn(),
  };
}

function makeAgriController(): BuildMapSurfaceViewParams['agriController'] {
  return { selectedRegion: null, selectedMaxKm: null, filteredAgriListings: null };
}

function makeSchoolController(): BuildMapSurfaceViewParams['schoolController'] &
  BuildMapSurfaceCommandsParams['schoolController'] {
  return {
    schoolZoneLabels: [],
    schools: [],
    schoolsQuery: {} as BuildMapSurfaceViewParams['schoolController']['schoolsQuery'],
    schoolFirstAreaSchoolCount: null,
    schoolFirstZoneSchoolCount: null,
    schoolFirstLandingSchoolCount: null,
    schoolListings: [],
    journeyView: {} as BuildMapSurfaceViewParams['schoolController']['journeyView'],
    journeyCommands: {} as BuildMapSurfaceViewParams['schoolController']['journeyCommands'],
  };
}

// Issue #2142 (correction pass) — the former single makeMapPresentationController()
// factory is split into one factory per owning controller, mirroring the
// five-way split of useDiscoverMapPresentationController.
function makeInteractionController(): BuildMapSurfaceViewParams['interactionController'] &
  BuildMapSurfaceCommandsParams['interactionController'] {
  return {
    hoveredListingId: null,
    hoveredAreaKeyForMap: null,
    handleAreaClusterClick: vi.fn(),
  };
}

function makeCameraController(): BuildMapSurfaceViewParams['cameraController'] &
  BuildMapSurfaceCommandsParams['cameraController'] {
  return {
    agriGroupFocusBounds: null,
    isColdNavigate: false,
    isSelectedNodeOutOfView: false,
    schoolFocusTick: 0,
    selectedSchoolLat: undefined,
    selectedSchoolLon: undefined,
    handleRecenterOnSelectedNode: vi.fn(),
  };
}

function makeMapLayerController(): BuildMapSurfaceViewParams['mapLayerController'] {
  return {
    overviewAreas: [],
    areaSearchMatchKeys: undefined,
    resolvedRegionLabel: null,
    regionOverviewMarkerKind: 'default' as BuildMapSurfaceViewParams['mapLayerController']['regionOverviewMarkerKind'],
    isRegionOverview: false,
    regionOverviewShortLabel: null,
    areaJourneySegments: [],
    schoolJourneySegments: [],
    isAreaFirstCityLanding: false,
  };
}

function makeRegionGuideController(): BuildMapSurfaceViewParams['regionGuideController'] &
  BuildMapSurfaceCommandsParams['regionGuideController'] {
  return {
    regionSelectNonce: 0,
    prefersReducedMotion: false,
    dismissRegionGuide: vi.fn(),
  };
}

function makeOverviewNavigationController(): BuildMapSurfaceCommandsParams['overviewNavigationController'] {
  return { handleOverviewAreaClick: vi.fn() };
}

function makeMobilePresentationController(): BuildMapSurfaceViewParams['mobilePresentationController'] &
  BuildMapSurfaceCommandsParams['mobilePresentationController'] {
  return { bottomOcclusionPx: 0, previewOcclusionPx: 0, handlePreviewSheetHeightChange: vi.fn() };
}

function makeViewportTrackerController(): BuildMapSurfaceViewParams['viewportTrackerController'] {
  return { handleBoundsChange: vi.fn() };
}

function makeMarkerController(): BuildMapSurfaceViewParams['markerController'] &
  BuildMapSurfaceCommandsParams['markerController'] {
  return {
    markerPixelPos: null,
    selectedMarkerListing: null,
    handlePopoverDismiss: vi.fn(),
    handleSelectMarkerListing: vi.fn(),
    handleMarkerClickWithPosition: vi.fn(),
  };
}

function makeViewParams(
  overrides: Partial<BuildMapSurfaceViewParams> = {},
): BuildMapSurfaceViewParams {
  const mapContainerRef = { current: document.createElement('div') };
  return {
    // camera
    activeFocusBounds: null,
    memoizedInitialCenter: undefined,
    cityCenter: undefined,
    cityZoom: undefined,
    cameraIntent: null,
    panToArea: null,
    mapZoom: 12,
    // layers
    currentMapMarkerListings: [],
    filters: {} as BuildMapSurfaceViewParams['filters'],
    isLandingState: false,
    focusedGroupAreas: undefined,
    selectedArea: null,
    isAgriJourney: false,
    areaMarkerListings: [],
    schoolRadiusOverlay: false,
    areaRestoreArea: null,
    // navigation
    showSchoolBreadcrumb: false,
    focusedGroup: null,
    city: 'bangalore',
    resolvedPanelContent: 'landing' as BuildMapSurfaceViewParams['resolvedPanelContent'],
    isSelectedGroupState: false,
    isAreaFirstSelectedAreaState: false,
    // schools
    selectedSchool: null,
    showSchoolMarkers: false,
    schoolMarkerFocusTick: 0,
    schoolMarkerPositions: [],
    schoolRadiusActive: false,
    schoolRadiusPillNoun: 'homes',
    schoolRadiusHasMore: false,
    // markers
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
    // regionGuide
    regionGuideVisible: false,
    regionGuideRingActive: false,
    // commands (unused by view builder but required by the shared param type)
    handlePolygonDrawn: vi.fn(),
    handlePolygonCleared: vi.fn(),
    publishCameraIntent: vi.fn(),
    publishClusterCameraIntent: vi.fn(),
    publishMarkerClusterCameraIntent: vi.fn(),
    handleAreaMarkersComputed: vi.fn(),
    onNavigationNodeHoverChange: vi.fn(),
    onClusterFocusChange: vi.fn(),
    onAreaVisualClusterCameraIntent: vi.fn(),
    buildNavigationNodeHref: vi.fn(),
    setMapZoom: vi.fn(),
    setMapReady: vi.fn(),
    handleCityChange: vi.fn(),
    navigate: vi.fn(),
    handleStepMarkerListing: vi.fn(),
    showMarkerInList: vi.fn(),
    // surface-only additions
    mapContainerRef,
    mobileMapOpen: false,
    setMobileView: vi.fn(),
    isGroupResultsState: false,
    isNodeListingsState: false,
    activeAreasNavigationJourney: makeJourney(),
    navJourney: 'area-first',
    isPreviewSheetOpen: false,
    selectedListingPreview: null,
    mapReady: false,
    // controller result objects
    navigationController: makeNavigationController(),
    agriController: makeAgriController(),
    schoolController: makeSchoolController(),
    interactionController: makeInteractionController(),
    cameraController: makeCameraController(),
    mapLayerController: makeMapLayerController(),
    regionGuideController: makeRegionGuideController(),
    mobilePresentationController: makeMobilePresentationController(),
    viewportTrackerController: makeViewportTrackerController(),
    markerController: makeMarkerController(),
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
      cameraController: { ...makeCameraController(), isSelectedNodeOutOfView: true },
      activeAreasNavigationJourney: journeyWithNode,
    };
    expect(buildMapSurfaceView(makeViewParams(baseTrue)).overlays.recenter.visible).toBe(true);
    expect(
      buildMapSurfaceView(makeViewParams({ ...baseTrue, mapReady: false })).overlays.recenter.visible,
    ).toBe(false);
    expect(
      buildMapSurfaceView(
        makeViewParams({
          ...baseTrue,
          cameraController: { ...makeCameraController(), isSelectedNodeOutOfView: false },
        }),
      ).overlays.recenter.visible,
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
      handlePolygonDrawn: vi.fn(),
      handlePolygonCleared: vi.fn(),
      publishClusterCameraIntent: vi.fn(),
      onAreaVisualClusterCameraIntent: vi.fn(),
      handleAreaMarkersComputed: vi.fn(),
      handleCityChange: vi.fn(),
      publishMarkerClusterCameraIntent: vi.fn(),
      navigate: vi.fn(),
      buildNavigationNodeHref: vi.fn(),
      setMapReady: vi.fn(),
      showMarkerInList: vi.fn(),
      handleStepMarkerListing: vi.fn(),
      clearSelectedListing: vi.fn(),
      navigationController: makeNavigationController(),
      schoolController: makeSchoolController(),
      interactionController: makeInteractionController(),
      cameraController: makeCameraController(),
      regionGuideController: makeRegionGuideController(),
      overviewNavigationController: makeOverviewNavigationController(),
      mobilePresentationController: makeMobilePresentationController(),
      viewportTrackerController: makeViewportTrackerController(),
      markerController: makeMarkerController(),
      ...overrides,
    };
  }

  it('groups commands into their sections verbatim (same function references)', () => {
    const params = makeCommandsParams();
    const commands = buildMapSurfaceCommands(params);
    expect(commands.camera.publishCameraIntent).toBe(params.publishCameraIntent);
    expect(commands.drawing.handlePolygonDrawn).toBe(params.handlePolygonDrawn);
    expect(commands.navigation.handleOverviewAreaClick).toBe(
      params.overviewNavigationController.handleOverviewAreaClick,
    );
    expect(commands.navigation.handleAreaClusterClick).toBe(
      params.interactionController.handleAreaClusterClick,
    );
    expect(commands.markers.handleSelectMarkerListing).toBe(
      params.markerController.handleSelectMarkerListing,
    );
    expect(commands.regionGuide.dismissRegionGuide).toBe(
      params.regionGuideController.dismissRegionGuide,
    );
  });

  it('overlays.onClusterFocusChange reuses the SAME command as navigation.onClusterFocusChange', () => {
    const params = makeCommandsParams();
    const commands = buildMapSurfaceCommands(params);
    expect(commands.overlays.onClusterFocusChange).toBe(commands.navigation.onClusterFocusChange);
    expect(commands.overlays.onClusterFocusChange).toBe(
      params.navigationController.setFocusedClusterMemberAreaKeys,
    );
  });

  it('overlays.onDismissPreview/onRecenter/onPreviewHeightChange wire to the passed-in handlers', () => {
    const clearSelectedListing = vi.fn();
    const handleRecenterOnSelectedNode = vi.fn();
    const handlePreviewSheetHeightChange = vi.fn();
    const commands = buildMapSurfaceCommands(
      makeCommandsParams({
        clearSelectedListing,
        cameraController: {
          ...makeCameraController(),
          handleRecenterOnSelectedNode,
        },
        mobilePresentationController: {
          ...makeMobilePresentationController(),
          handlePreviewSheetHeightChange,
        },
      }),
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
