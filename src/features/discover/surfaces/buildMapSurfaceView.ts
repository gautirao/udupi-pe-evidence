import type { RefObject } from 'react';
import type { DiscoverMapCanvasProps } from '@/features/discover/views/DiscoverMapCanvas';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';

/**
 * Issue #2142 Commit 4 — typed view/commands contract for DiscoverMapSurface
 * (the renamed DiscoverMapMount). Every group below is a `Pick` straight off
 * the real (unmodified) DiscoverMapCanvasProps, keyed by identical field
 * names, so DiscoverMapSurface.tsx can reconstruct the exact flat props object
 * DiscoverMapCanvas still expects by spreading every group back together — no
 * field is renamed or reshaped, only regrouped.
 *
 * `overlays` is an ADDITION beyond DiscoverMapCanvasProps: MobileClusterSheet,
 * MobileListingPreviewSheet, and the recenter-button portal are not part of
 * DiscoverMapCanvas's own props (they're rendered as its siblings inside the
 * same z-[60] mobile-map wrapper), but per team-lead ruling (2026-08-12) they
 * belong on this surface rather than DiscoverOverlaySurface, since their DOM
 * position depends on the SAME map-canvas stacking context this surface owns
 * — see buildOverlaySurfaceView.ts's doc comment for the full rationale.
 *
 * `mapContainerRef` is deliberately kept OUTSIDE the view/commands split: it's
 * a DOM ref the page creates and this surface both forwards to DiscoverMapCanvas
 * and reads (`.current`) to compute the recenter portal target and to gate the
 * mobile full-screen wrapper — not view data or a command.
 */

type MapCameraView = Pick<
  DiscoverMapCanvasProps,
  | 'agriGroupFocusBounds'
  | 'activeFocusBounds'
  | 'memoizedInitialCenter'
  | 'isColdNavigate'
  | 'cityCenter'
  | 'cityZoom'
  | 'cameraIntent'
  | 'panToArea'
  | 'bottomOcclusionPx'
  | 'previewOcclusionPx'
  | 'prefersReducedMotion'
  | 'mapZoom'
>;
type MapCameraCommands = Pick<
  DiscoverMapCanvasProps,
  'publishCameraIntent' | 'setMapZoom' | 'handleBoundsChange'
>;

type MapLayersView = Pick<
  DiscoverMapCanvasProps,
  | 'currentMapMarkerListings'
  | 'selectedRegion'
  | 'selectedMaxKm'
  | 'filteredAgriListings'
  | 'filters'
  | 'isLandingState'
  | 'overviewAreas'
  | 'focusedGroupAreas'
  | 'areaLayerMaxZoom'
  | 'selectedArea'
  | 'areaSearchMatchKeys'
  | 'hoveredAreaKeyForMap'
  | 'isAgriJourney'
  | 'areaMarkerListings'
  | 'schoolZoneLabels'
  | 'schoolRadiusOverlay'
  | 'isRegionOverview'
  | 'regionOverviewShortLabel'
  | 'isBoundedBrowseState'
  | 'areaRestoreArea'
>;
type MapDrawingCommands = Pick<DiscoverMapCanvasProps, 'handlePolygonDrawn' | 'handlePolygonCleared'>;

type MapNavigationView = Pick<
  DiscoverMapCanvasProps,
  | 'areasNavigationJourney'
  | 'hoveredNavigationNodeKey'
  | 'focusedClusterMemberAreaKeys'
  | 'isAreaFirstCityLanding'
  | 'showSchoolBreadcrumb'
  | 'areaJourneySegments'
  | 'schoolJourneySegments'
  | 'focusedGroup'
  | 'city'
  | 'resolvedPanelContent'
  | 'isSelectedGroupState'
  | 'isAreaFirstSelectedAreaState'
  | 'journeyView'
>;
type MapNavigationCommands = Pick<
  DiscoverMapCanvasProps,
  | 'handleOverviewAreaClick'
  | 'publishClusterCameraIntent'
  | 'onAreaVisualClusterCameraIntent'
  | 'handleAreaClusterClick'
  | 'handleAreaMarkersComputed'
  | 'onNavigationNodeHoverChange'
  | 'onClusterFocusChange'
  | 'buildNavigationNodeHref'
  | 'handleCityChange'
  | 'journeyCommands'
>;

type MapSchoolsView = Pick<
  DiscoverMapCanvasProps,
  | 'selectedSchool'
  | 'schools'
  | 'showSchoolMarkers'
  | 'schoolsQuery'
  | 'schoolFocusTick'
  | 'selectedSchoolLat'
  | 'selectedSchoolLon'
  | 'schoolMarkerFocusTick'
  | 'schoolMarkerPositions'
  | 'schoolRadiusActive'
  | 'schoolRadiusPillNoun'
  | 'schoolFirstAreaSchoolCount'
  | 'schoolFirstZoneSchoolCount'
  | 'schoolFirstLandingSchoolCount'
  | 'schoolRadiusHasMore'
  | 'schoolListings'
>;

type MapMarkersView = Pick<
  DiscoverMapCanvasProps,
  | 'markerPixelPos'
  | 'selectedMarkerListing'
  | 'hoveredListingId'
  | 'isMarkerPopoverEligible'
  | 'markerPopoverStepper'
  | 'markersTruncated'
  | 'markersReturnedElements'
  | 'markersTotalFilteredElements'
>;
type MapMarkersCommands = Pick<
  DiscoverMapCanvasProps,
  | 'handlePopoverDismiss'
  | 'handleSelectMarkerListing'
  | 'handleMarkerClickWithPosition'
  | 'publishMarkerClusterCameraIntent'
  | 'navigate'
  | 'handleStepMarkerListing'
  | 'showMarkerInList'
  | 'setMapReady'
>;

type MapStatusView = Pick<
  DiscoverMapCanvasProps,
  | 'showLoader'
  | 'error'
  | 'isLoading'
  | 'discoverBadge'
  | 'areaResultSummaryText'
  | 'groupSelectedBadgeCopy'
  | 'fallbackBadgeCopy'
  | 'cityTotal'
  | 'isAuthenticated'
  | 'hasActiveAnonFilter'
  | 'announcedBadgeText'
>;

type MapMobileView = Pick<DiscoverMapCanvasProps, 'mobileListButton'>;

type MapRegionGuideView = Pick<
  DiscoverMapCanvasProps,
  | 'regionGuideVisible'
  | 'resolvedRegionLabel'
  | 'regionSelectNonce'
  | 'regionOverviewMarkerKind'
  | 'regionGuideRingActive'
>;
type MapRegionGuideCommands = Pick<DiscoverMapCanvasProps, 'dismissRegionGuide'>;

export interface DiscoverMapOverlaysView {
  mobileCluster: {
    visible: boolean;
    journey: Pick<UseAreasNavigationJourneyResult, 'node' | 'children' | 'selectNode'>;
    focusedClusterMemberAreaKeys: readonly string[] | null;
    eligibilityJourney: 'areas' | 'schools';
  };
  listingPreview: {
    visible: boolean;
    preview: SelectedListingPreview | null;
  };
  recenter: {
    visible: boolean;
    label: string | undefined;
    portalTarget: HTMLDivElement | null;
  };
}
export interface DiscoverMapOverlaysCommands {
  onClusterFocusChange: (memberAreaKeys: readonly string[] | null) => void;
  onDismissPreview: () => void;
  onViewDetails: (id: string) => void;
  onPreviewHeightChange: (listingId: string, heightPx: number) => void;
  onRecenter: () => void;
}

export interface DiscoverMapSurfaceView {
  camera: MapCameraView;
  layers: MapLayersView;
  navigation: MapNavigationView;
  schools: MapSchoolsView;
  markers: MapMarkersView;
  status: MapStatusView;
  mobile: MapMobileView;
  regionGuide: MapRegionGuideView;
  overlays: DiscoverMapOverlaysView;
}

export interface DiscoverMapSurfaceCommands {
  camera: MapCameraCommands;
  drawing: MapDrawingCommands;
  navigation: MapNavigationCommands;
  markers: MapMarkersCommands;
  regionGuide: MapRegionGuideCommands;
  overlays: DiscoverMapOverlaysCommands;
}

export type BuildMapSurfaceViewParams = Omit<DiscoverMapCanvasProps, 'mapContainerRef'> & {
  mapContainerRef: RefObject<HTMLDivElement | null>;
  mobileMapOpen: boolean;
  activeAreasNavigationJourney: UseAreasNavigationJourneyResult;
  navJourney: string;
  isPreviewSheetOpen: boolean;
  selectedListingPreview: SelectedListingPreview | null;
  mapReady: boolean;
  isSelectedNodeOutOfView: boolean;
};

export function buildMapSurfaceView(params: BuildMapSurfaceViewParams): DiscoverMapSurfaceView {
  const {
    agriGroupFocusBounds,
    activeFocusBounds,
    memoizedInitialCenter,
    isColdNavigate,
    cityCenter,
    cityZoom,
    cameraIntent,
    panToArea,
    bottomOcclusionPx,
    previewOcclusionPx,
    prefersReducedMotion,
    mapZoom,
    currentMapMarkerListings,
    selectedRegion,
    selectedMaxKm,
    filteredAgriListings,
    filters,
    isLandingState,
    overviewAreas,
    focusedGroupAreas,
    areaLayerMaxZoom,
    selectedArea,
    areaSearchMatchKeys,
    hoveredAreaKeyForMap,
    isAgriJourney,
    areaMarkerListings,
    schoolZoneLabels,
    schoolRadiusOverlay,
    isRegionOverview,
    regionOverviewShortLabel,
    isBoundedBrowseState,
    areaRestoreArea,
    areasNavigationJourney,
    hoveredNavigationNodeKey,
    focusedClusterMemberAreaKeys,
    isAreaFirstCityLanding,
    showSchoolBreadcrumb,
    areaJourneySegments,
    schoolJourneySegments,
    focusedGroup,
    city,
    resolvedPanelContent,
    isSelectedGroupState,
    isAreaFirstSelectedAreaState,
    journeyView,
    selectedSchool,
    schools,
    showSchoolMarkers,
    schoolsQuery,
    schoolFocusTick,
    selectedSchoolLat,
    selectedSchoolLon,
    schoolMarkerFocusTick,
    schoolMarkerPositions,
    schoolRadiusActive,
    schoolRadiusPillNoun,
    schoolFirstAreaSchoolCount,
    schoolFirstZoneSchoolCount,
    schoolFirstLandingSchoolCount,
    schoolRadiusHasMore,
    schoolListings,
    markerPixelPos,
    selectedMarkerListing,
    hoveredListingId,
    isMarkerPopoverEligible,
    markerPopoverStepper,
    markersTruncated,
    markersReturnedElements,
    markersTotalFilteredElements,
    showLoader,
    error,
    isLoading,
    discoverBadge,
    areaResultSummaryText,
    groupSelectedBadgeCopy,
    fallbackBadgeCopy,
    cityTotal,
    isAuthenticated,
    hasActiveAnonFilter,
    announcedBadgeText,
    mobileListButton,
    regionGuideVisible,
    resolvedRegionLabel,
    regionSelectNonce,
    regionOverviewMarkerKind,
    regionGuideRingActive,
    mobileMapOpen,
    activeAreasNavigationJourney,
    navJourney,
    isPreviewSheetOpen,
    selectedListingPreview,
    mapReady,
    mapContainerRef,
    isSelectedNodeOutOfView,
  } = params;

  return {
    camera: {
      agriGroupFocusBounds,
      activeFocusBounds,
      memoizedInitialCenter,
      isColdNavigate,
      cityCenter,
      cityZoom,
      cameraIntent,
      panToArea,
      bottomOcclusionPx,
      previewOcclusionPx,
      prefersReducedMotion,
      mapZoom,
    },
    layers: {
      currentMapMarkerListings,
      selectedRegion,
      selectedMaxKm,
      filteredAgriListings,
      filters,
      isLandingState,
      overviewAreas,
      focusedGroupAreas,
      areaLayerMaxZoom,
      selectedArea,
      areaSearchMatchKeys,
      hoveredAreaKeyForMap,
      isAgriJourney,
      areaMarkerListings,
      schoolZoneLabels,
      schoolRadiusOverlay,
      isRegionOverview,
      regionOverviewShortLabel,
      isBoundedBrowseState,
      areaRestoreArea,
    },
    navigation: {
      areasNavigationJourney,
      hoveredNavigationNodeKey,
      focusedClusterMemberAreaKeys,
      isAreaFirstCityLanding,
      showSchoolBreadcrumb,
      areaJourneySegments,
      schoolJourneySegments,
      focusedGroup,
      city,
      resolvedPanelContent,
      isSelectedGroupState,
      isAreaFirstSelectedAreaState,
      journeyView,
    },
    schools: {
      selectedSchool,
      schools,
      showSchoolMarkers,
      schoolsQuery,
      schoolFocusTick,
      selectedSchoolLat,
      selectedSchoolLon,
      schoolMarkerFocusTick,
      schoolMarkerPositions,
      schoolRadiusActive,
      schoolRadiusPillNoun,
      schoolFirstAreaSchoolCount,
      schoolFirstZoneSchoolCount,
      schoolFirstLandingSchoolCount,
      schoolRadiusHasMore,
      schoolListings,
    },
    markers: {
      markerPixelPos,
      selectedMarkerListing,
      hoveredListingId,
      isMarkerPopoverEligible,
      markerPopoverStepper,
      markersTruncated,
      markersReturnedElements,
      markersTotalFilteredElements,
    },
    status: {
      showLoader,
      error,
      isLoading,
      discoverBadge,
      areaResultSummaryText,
      groupSelectedBadgeCopy,
      fallbackBadgeCopy,
      cityTotal,
      isAuthenticated,
      hasActiveAnonFilter,
      announcedBadgeText,
    },
    mobile: { mobileListButton },
    regionGuide: {
      regionGuideVisible,
      resolvedRegionLabel,
      regionSelectNonce,
      regionOverviewMarkerKind,
      regionGuideRingActive,
    },
    overlays: {
      mobileCluster: {
        visible: mobileMapOpen,
        journey: activeAreasNavigationJourney,
        focusedClusterMemberAreaKeys,
        eligibilityJourney: navJourney === 'school-first' ? 'schools' : 'areas',
      },
      listingPreview: {
        visible: isPreviewSheetOpen && !!selectedListingPreview,
        preview: selectedListingPreview,
      },
      recenter: {
        visible: !!(
          mapReady &&
          mapContainerRef.current &&
          isSelectedNodeOutOfView &&
          activeAreasNavigationJourney.node
        ),
        label: activeAreasNavigationJourney.node?.displayLabel,
        portalTarget: mapContainerRef.current,
      },
    },
  };
}

export type BuildMapSurfaceCommandsParams = Pick<
  DiscoverMapCanvasProps,
  | 'publishCameraIntent'
  | 'setMapZoom'
  | 'handleBoundsChange'
  | 'handlePolygonDrawn'
  | 'handlePolygonCleared'
  | 'handleOverviewAreaClick'
  | 'publishClusterCameraIntent'
  | 'onAreaVisualClusterCameraIntent'
  | 'handleAreaClusterClick'
  | 'handleAreaMarkersComputed'
  | 'onNavigationNodeHoverChange'
  | 'onClusterFocusChange'
  | 'buildNavigationNodeHref'
  | 'handleCityChange'
  | 'journeyCommands'
  | 'handlePopoverDismiss'
  | 'handleSelectMarkerListing'
  | 'handleMarkerClickWithPosition'
  | 'publishMarkerClusterCameraIntent'
  | 'navigate'
  | 'handleStepMarkerListing'
  | 'showMarkerInList'
  | 'setMapReady'
  | 'dismissRegionGuide'
> & {
  clearSelectedListing: () => void;
  handlePreviewSheetHeightChange: (listingId: string, heightPx: number) => void;
  handleRecenterOnSelectedNode: () => void;
};

export function buildMapSurfaceCommands(
  params: BuildMapSurfaceCommandsParams,
): DiscoverMapSurfaceCommands {
  const {
    publishCameraIntent,
    setMapZoom,
    handleBoundsChange,
    handlePolygonDrawn,
    handlePolygonCleared,
    handleOverviewAreaClick,
    publishClusterCameraIntent,
    onAreaVisualClusterCameraIntent,
    handleAreaClusterClick,
    handleAreaMarkersComputed,
    onNavigationNodeHoverChange,
    onClusterFocusChange,
    buildNavigationNodeHref,
    handleCityChange,
    journeyCommands,
    handlePopoverDismiss,
    handleSelectMarkerListing,
    handleMarkerClickWithPosition,
    publishMarkerClusterCameraIntent,
    navigate,
    handleStepMarkerListing,
    showMarkerInList,
    setMapReady,
    dismissRegionGuide,
    clearSelectedListing,
    handlePreviewSheetHeightChange,
    handleRecenterOnSelectedNode,
  } = params;

  return {
    camera: { publishCameraIntent, setMapZoom, handleBoundsChange },
    drawing: { handlePolygonDrawn, handlePolygonCleared },
    navigation: {
      handleOverviewAreaClick,
      publishClusterCameraIntent,
      onAreaVisualClusterCameraIntent,
      handleAreaClusterClick,
      handleAreaMarkersComputed,
      onNavigationNodeHoverChange,
      onClusterFocusChange,
      buildNavigationNodeHref,
      handleCityChange,
      journeyCommands,
    },
    markers: {
      handlePopoverDismiss,
      handleSelectMarkerListing,
      handleMarkerClickWithPosition,
      publishMarkerClusterCameraIntent,
      navigate,
      handleStepMarkerListing,
      showMarkerInList,
      setMapReady,
    },
    regionGuide: { dismissRegionGuide },
    overlays: {
      onClusterFocusChange,
      onDismissPreview: clearSelectedListing,
      onViewDetails: (id: string) => navigate(`/listing/${id}`),
      onPreviewHeightChange: handlePreviewSheetHeightChange,
      onRecenter: handleRecenterOnSelectedNode,
    },
  };
}
