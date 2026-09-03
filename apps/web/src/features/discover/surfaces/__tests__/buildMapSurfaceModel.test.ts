import { describe, expect, it, vi } from 'vitest';
import {
  buildMapSurfaceModel,
  buildMapSurfaceCommands,
  type BuildMapSurfaceViewParams,
  type BuildMapSurfaceCommandsParams,
} from '../buildMapSurfaceModel';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';

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

function makeNavigationController(): Record<string, unknown> {
  return {
    hoveredNavigationNodeKey: null,
    setHoveredNavigationNodeKey: vi.fn(),
    focusedClusterMemberAreaKeys: null,
    setFocusedClusterMemberAreaKeys: vi.fn(),
  };
}

function makeAgriController(): Record<string, unknown> {
  return { selectedRegion: null, selectedMaxKm: null, filteredAgriListings: null };
}

function makeSchoolController(): Record<string, unknown> {
  return {
    schoolZoneLabels: [],
    schools: [],
    schoolsQuery: {} as never,
    schoolFirstAreaSchoolCount: null,
    schoolFirstZoneSchoolCount: null,
    schoolFirstLandingSchoolCount: null,
    schoolListings: [],
    journeyView: {} as never,
    journeyCommands: {} as never,
  };
}

// Issue #2142 (correction pass) — the former single makeMapPresentationController()
// factory is split into one factory per owning controller, mirroring the
// five-way split of useDiscoverMapPresentationController.
function makeInteractionController(): Record<string, unknown> {
  return {
    hoveredListingId: null,
    hoveredAreaKeyForMap: null,
    handleAreaClusterClick: vi.fn(),
  };
}

function makeCameraController(): Record<string, unknown> {
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

function makeMapLayerController(): Record<string, unknown> {
  return {
    overviewAreas: [],
    // Issue #2015 MUST-HAVE #3 — nav-state-independent area lookup added
    // alongside overviewAreas; kept in this fixture for shape parity with
    // the real controller's return object (see MapLayerSlice).
    discoverAreas: [],
    areaSearchMatchKeys: undefined,
    resolvedRegionLabel: null,
    regionOverviewMarkerKind: 'default' as never,
    isRegionOverview: false,
    regionOverviewShortLabel: null,
    areaJourneySegments: [],
    schoolJourneySegments: [],
    isAreaFirstCityLanding: false,
  };
}

function makeRegionGuideController(): Record<string, unknown> {
  return {
    regionSelectNonce: 0,
    prefersReducedMotion: false,
    dismissRegionGuide: vi.fn(),
  };
}

function makeOverviewNavigationController(): Record<string, unknown> {
  return { handleOverviewAreaClick: vi.fn() };
}

function makeMobilePresentationController(): Record<string, unknown> {
  return { bottomOcclusionPx: 0, previewOcclusionPx: 0, handlePreviewSheetHeightChange: vi.fn() };
}

function makeViewportTrackerController(): Record<string, unknown> {
  return { handleBoundsChange: vi.fn() };
}

function makeMarkerController(): Record<string, unknown> {
  return {
    markerPixelPos: null,
    selectedMarkerListing: null,
    handlePopoverDismiss: vi.fn(),
    handleSelectMarkerListing: vi.fn(),
    handleMarkerClickWithPosition: vi.fn(),
  };
}

function makeViewParams(
  overrides: Record<string, unknown> = {},
) {
  const mapContainerRef = { current: document.createElement('div') };
  return toMapParams({
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
    filters: {} as never,
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
    resolvedPanelContent: 'landing' as never,
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
    discoverBadge: {} as never,
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
    // MUST-HAVE #2 (PR review 5085561270) — defaults to ineligible/not-dirty;
    // individual tests override via viewportSearchController.
    isDirty: false,
    isEligible: false,
    ...overrides,
  });
}

describe('buildMapSurfaceModel', () => {
  it('groups every field into its section without loss', () => {
    const view = buildMapSurfaceModel(makeViewParams({ cityTotal: 42 }));
    expect(view.camera.mapZoom).toBe(12);
    expect(view.navigation.city).toBe('bangalore');
    expect(view.status.cityTotal).toBe(42);
  });

  it('mobileCluster.visible mirrors mobileMapOpen and derives eligibilityJourney from navJourney', () => {
    const view = buildMapSurfaceModel(
      makeViewParams({ mobileMapOpen: true, navJourney: 'school-first' }),
    );
    expect(view.overlays.mobileCluster.visible).toBe(true);
    expect(view.overlays.mobileCluster.eligibilityJourney).toBe('schools');
  });

  it('eligibilityJourney defaults to areas for any non-school-first journey', () => {
    const view = buildMapSurfaceModel(makeViewParams({ navJourney: 'agri-first' }));
    expect(view.overlays.mobileCluster.eligibilityJourney).toBe('areas');
  });

  it('listingPreview.visible requires both isPreviewSheetOpen and a non-null preview', () => {
    const preview = { id: 'listing-1' } as unknown as SelectedListingPreview;
    expect(
      buildMapSurfaceModel(makeViewParams({ isPreviewSheetOpen: true, selectedListingPreview: null }))
        .overlays.listingPreview.visible,
    ).toBe(false);
    expect(
      buildMapSurfaceModel(makeViewParams({ isPreviewSheetOpen: false, selectedListingPreview: preview }))
        .overlays.listingPreview.visible,
    ).toBe(false);
    expect(
      buildMapSurfaceModel(makeViewParams({ isPreviewSheetOpen: true, selectedListingPreview: preview }))
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
    expect(buildMapSurfaceModel(makeViewParams(baseTrue)).overlays.recenter.visible).toBe(true);
    expect(
      buildMapSurfaceModel(makeViewParams({ ...baseTrue, mapReady: false })).overlays.recenter.visible,
    ).toBe(false);
    expect(
      buildMapSurfaceModel(
        makeViewParams({
          ...baseTrue,
          cameraController: { ...makeCameraController(), isSelectedNodeOutOfView: false },
        }),
      ).overlays.recenter.visible,
    ).toBe(false);
    expect(
      buildMapSurfaceModel(makeViewParams({ ...baseTrue, activeAreasNavigationJourney: makeJourney() }))
        .overlays.recenter.visible,
    ).toBe(false);
  });

  it('recenter.label reads the active journey node displayLabel', () => {
    const journeyWithNode = makeJourney({
      node: { nodeKey: 'n1', displayLabel: 'Indiranagar' } as UseAreasNavigationJourneyResult['node'],
    });
    const view = buildMapSurfaceModel(
      makeViewParams({ activeAreasNavigationJourney: journeyWithNode }),
    );
    expect(view.overlays.recenter.label).toBe('Indiranagar');
  });
});

describe('buildMapSurfaceCommands', () => {
  function makeCommandsParams(
    overrides: Record<string, unknown> = {},
  ) {
    return toMapParams({
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
      // MUST-HAVE #2 (PR review 5085561270) — commands builder only reads activate().
      activate: vi.fn(),
      ...overrides,
    });
  }

  it('groups commands into their sections verbatim (same function references)', () => {
    const params = makeCommandsParams() as never as Record<string, Record<string, unknown>>;
    const commands = buildMapSurfaceCommands(params as never as Parameters<typeof buildMapSurfaceCommands>[0]);
    expect(commands.camera.publishCameraIntent).toBe(params.mapDataController.publishCameraIntent);
    expect(commands.drawing.handlePolygonDrawn).toBe(params.pageStateController.handlePolygonDrawn);
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
    const params = makeCommandsParams() as never as Record<string, Record<string, unknown>>;
    const commands = buildMapSurfaceCommands(params as never as Parameters<typeof buildMapSurfaceCommands>[0]);
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
