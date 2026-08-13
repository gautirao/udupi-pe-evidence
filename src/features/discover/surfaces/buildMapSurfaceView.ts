import type { RefObject } from 'react';
import type { DiscoverMapCanvasProps } from '@/features/discover/views/DiscoverMapCanvas';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import type { useDiscoverNavigationController } from '@/features/discover/controllers/useDiscoverNavigationController';
import type { useDiscoverAgriController } from '@/features/discover/controllers/useDiscoverAgriController';
import type { useDiscoverSchoolController } from '@/features/discover/controllers/useDiscoverSchoolController';
import type { useDiscoverInteractionController } from '@/features/discover/controllers/useDiscoverInteractionController';
import type { useDiscoverCameraController } from '@/features/discover/controllers/useDiscoverCameraController';
import type { useDiscoverMapLayerController } from '@/features/discover/controllers/useDiscoverMapLayerController';
import type { useDiscoverRegionGuideController } from '@/features/discover/controllers/useDiscoverRegionGuideController';
import type { useDiscoverOverviewNavigationController } from '@/features/discover/controllers/useDiscoverOverviewNavigationController';
import type { useDiscoverMobilePresentationController } from '@/features/discover/controllers/useDiscoverMobilePresentationController';
import type { useDiscoverViewportTracker } from '@/features/discover/controllers/useDiscoverViewportTracker';
import type { useDiscoverMarkerController } from '@/features/discover/controllers/useDiscoverMarkerController';

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
 *
 * Issue #2142 Commit 5 (team-lead ruling, 2026-08-12) — BuildMapSurfaceViewParams
 * accepts the CONTROLLERS' OWN result objects (or small Picked subsets of them)
 * as nested params, instead of ~65 individually-named flat fields duplicating
 * what MapDiscovery.tsx's own controller-destructure already named. Only the
 * genuinely page-local fields (state this page owns directly, or derived
 * consts with no controller source — filters, city, badge copy, etc.) stay
 * flat. This is an input-shape tightening of the already-approved Commit 4
 * builder boundary, not a new abstraction: the `view`/`commands` OUTPUT shape
 * below is completely unchanged, and every downstream line in
 * buildMapSurfaceView()/buildMapSurfaceCommands() is untouched — only the
 * destructuring prelude at the top of each function changed source.
 */

type MapCameraView = Pick<
  DiscoverMapCanvasProps,
  | 'activeFocusBounds'
  | 'memoizedInitialCenter'
  | 'cityCenter'
  | 'cityZoom'
  | 'cameraIntent'
  | 'panToArea'
  | 'mapZoom'
> &
  Pick<DiscoverMapCanvasProps, 'agriGroupFocusBounds' | 'isColdNavigate' | 'prefersReducedMotion'> &
  Pick<DiscoverMapCanvasProps, 'bottomOcclusionPx' | 'previewOcclusionPx'>;
type MapCameraCommands = Pick<
  DiscoverMapCanvasProps,
  'publishCameraIntent' | 'setMapZoom' | 'handleBoundsChange'
>;

type MapLayersView = Pick<
  DiscoverMapCanvasProps,
  | 'currentMapMarkerListings'
  | 'filters'
  | 'isLandingState'
  | 'focusedGroupAreas'
  | 'areaLayerMaxZoom'
  | 'selectedArea'
  | 'isAgriJourney'
  | 'areaMarkerListings'
  | 'schoolRadiusOverlay'
  | 'isBoundedBrowseState'
  | 'areaRestoreArea'
> &
  Pick<DiscoverMapCanvasProps, 'selectedRegion' | 'selectedMaxKm' | 'filteredAgriListings'> &
  Pick<DiscoverMapCanvasProps, 'overviewAreas' | 'areaSearchMatchKeys' | 'hoveredAreaKeyForMap'> &
  Pick<DiscoverMapCanvasProps, 'schoolZoneLabels'> &
  Pick<DiscoverMapCanvasProps, 'isRegionOverview' | 'regionOverviewShortLabel'>;
type MapDrawingCommands = Pick<DiscoverMapCanvasProps, 'handlePolygonDrawn' | 'handlePolygonCleared'>;

type MapNavigationView = Pick<DiscoverMapCanvasProps, 'showSchoolBreadcrumb' | 'focusedGroup' | 'city'> &
  Pick<
    DiscoverMapCanvasProps,
    'areasNavigationJourney' | 'hoveredNavigationNodeKey' | 'focusedClusterMemberAreaKeys'
  > &
  Pick<
    DiscoverMapCanvasProps,
    | 'isAreaFirstCityLanding'
    | 'areaJourneySegments'
    | 'schoolJourneySegments'
    | 'resolvedPanelContent'
    | 'isSelectedGroupState'
    | 'isAreaFirstSelectedAreaState'
  > &
  Pick<DiscoverMapCanvasProps, 'journeyView'>;
type MapNavigationCommands = Pick<
  DiscoverMapCanvasProps,
  'publishClusterCameraIntent' | 'onAreaVisualClusterCameraIntent' | 'handleAreaMarkersComputed' | 'handleCityChange'
> &
  Pick<DiscoverMapCanvasProps, 'onNavigationNodeHoverChange' | 'onClusterFocusChange'> &
  Pick<DiscoverMapCanvasProps, 'handleOverviewAreaClick' | 'handleAreaClusterClick' | 'buildNavigationNodeHref'> &
  Pick<DiscoverMapCanvasProps, 'journeyCommands'>;

type MapSchoolsView = Pick<DiscoverMapCanvasProps, 'selectedSchool' | 'showSchoolMarkers' | 'schoolMarkerFocusTick' | 'schoolMarkerPositions' | 'schoolRadiusActive' | 'schoolRadiusPillNoun' | 'schoolRadiusHasMore'> &
  Pick<
    DiscoverMapCanvasProps,
    | 'schools'
    | 'schoolsQuery'
    | 'schoolFocusTick'
    | 'selectedSchoolLat'
    | 'selectedSchoolLon'
    | 'schoolFirstAreaSchoolCount'
    | 'schoolFirstZoneSchoolCount'
    | 'schoolFirstLandingSchoolCount'
    | 'schoolListings'
  >;

type MapMarkersView = Pick<DiscoverMapCanvasProps, 'isMarkerPopoverEligible' | 'markerPopoverStepper' | 'markersTruncated' | 'markersReturnedElements' | 'markersTotalFilteredElements'> &
  Pick<DiscoverMapCanvasProps, 'markerPixelPos' | 'selectedMarkerListing'> &
  Pick<DiscoverMapCanvasProps, 'hoveredListingId'>;
type MapMarkersCommands = Pick<DiscoverMapCanvasProps, 'publishMarkerClusterCameraIntent' | 'navigate' | 'setMapReady'> &
  Pick<DiscoverMapCanvasProps, 'handlePopoverDismiss' | 'handleSelectMarkerListing' | 'handleMarkerClickWithPosition'> &
  Pick<DiscoverMapCanvasProps, 'handleStepMarkerListing' | 'showMarkerInList'>;

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

type MapRegionGuideView = Pick<DiscoverMapCanvasProps, 'regionGuideVisible' | 'regionGuideRingActive'> &
  Pick<DiscoverMapCanvasProps, 'resolvedRegionLabel' | 'regionSelectNonce' | 'regionOverviewMarkerKind'>;
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

/**
 * Issue #2142 (correction pass) — the former single 39-field
 * `MapPresentationControllerSlice` is replaced by one narrow slice per owning
 * controller, so a controller/surface drift is a compile error attributable to
 * a specific capability rather than to one anonymous mega-object.
 */
type MapInteractionSlice = Pick<
  ReturnType<typeof useDiscoverInteractionController>,
  'hoveredListingId' | 'hoveredAreaKeyForMap'
>;
type MapCameraSlice = Pick<
  ReturnType<typeof useDiscoverCameraController>,
  | 'agriGroupFocusBounds'
  | 'isColdNavigate'
  | 'isSelectedNodeOutOfView'
  | 'schoolFocusTick'
  | 'selectedSchoolLat'
  | 'selectedSchoolLon'
>;
type MapLayerSlice = Pick<
  ReturnType<typeof useDiscoverMapLayerController>,
  | 'overviewAreas'
  | 'areaSearchMatchKeys'
  | 'resolvedRegionLabel'
  | 'regionOverviewMarkerKind'
  | 'isRegionOverview'
  | 'regionOverviewShortLabel'
  | 'areaJourneySegments'
  | 'schoolJourneySegments'
  | 'isAreaFirstCityLanding'
>;
type MapRegionGuideSlice = Pick<
  ReturnType<typeof useDiscoverRegionGuideController>,
  'regionSelectNonce' | 'prefersReducedMotion'
>;

export type BuildMapSurfaceViewParams = Omit<
  DiscoverMapCanvasProps,
  | 'mapContainerRef'
  | 'hoveredNavigationNodeKey'
  | 'focusedClusterMemberAreaKeys'
  | 'selectedRegion'
  | 'selectedMaxKm'
  | 'filteredAgriListings'
  | 'schoolZoneLabels'
  | 'schools'
  | 'schoolsQuery'
  | 'schoolFocusTick'
  | 'selectedSchoolLat'
  | 'selectedSchoolLon'
  | 'schoolFirstAreaSchoolCount'
  | 'schoolFirstZoneSchoolCount'
  | 'schoolFirstLandingSchoolCount'
  | 'schoolListings'
  | 'journeyView'
  | 'journeyCommands'
  | 'agriGroupFocusBounds'
  | 'isColdNavigate'
  | 'overviewAreas'
  | 'handleOverviewAreaClick'
  | 'areaSearchMatchKeys'
  | 'hoveredAreaKeyForMap'
  | 'handleAreaClusterClick'
  | 'resolvedRegionLabel'
  | 'regionSelectNonce'
  | 'regionOverviewMarkerKind'
  | 'prefersReducedMotion'
  | 'dismissRegionGuide'
  | 'isRegionOverview'
  | 'regionOverviewShortLabel'
  | 'areaJourneySegments'
  | 'schoolJourneySegments'
  | 'hoveredListingId'
  | 'isAreaFirstCityLanding'
  | 'bottomOcclusionPx'
  | 'previewOcclusionPx'
  | 'handleBoundsChange'
  | 'markerPixelPos'
  | 'selectedMarkerListing'
  | 'handlePopoverDismiss'
  | 'handleSelectMarkerListing'
  | 'handleMarkerClickWithPosition'
> & {
  mapContainerRef: RefObject<HTMLDivElement | null>;
  mobileMapOpen: boolean;
  activeAreasNavigationJourney: UseAreasNavigationJourneyResult;
  navJourney: string;
  isPreviewSheetOpen: boolean;
  selectedListingPreview: SelectedListingPreview | null;
  mapReady: boolean;

  navigationController: Pick<
    ReturnType<typeof useDiscoverNavigationController>,
    'hoveredNavigationNodeKey' | 'focusedClusterMemberAreaKeys'
  >;
  agriController: Pick<
    ReturnType<typeof useDiscoverAgriController>,
    'selectedRegion' | 'selectedMaxKm' | 'filteredAgriListings'
  >;
  schoolController: Pick<
    ReturnType<typeof useDiscoverSchoolController>,
    | 'schoolZoneLabels'
    | 'schools'
    | 'schoolsQuery'
    | 'schoolFirstAreaSchoolCount'
    | 'schoolFirstZoneSchoolCount'
    | 'schoolFirstLandingSchoolCount'
    | 'schoolListings'
    | 'journeyView'
    | 'journeyCommands'
  >;
  interactionController: MapInteractionSlice;
  cameraController: MapCameraSlice;
  mapLayerController: MapLayerSlice;
  regionGuideController: MapRegionGuideSlice;
  mobilePresentationController: Pick<
    ReturnType<typeof useDiscoverMobilePresentationController>,
    'bottomOcclusionPx' | 'previewOcclusionPx'
  >;
  viewportTrackerController: Pick<ReturnType<typeof useDiscoverViewportTracker>, 'handleBoundsChange'>;
  markerController: Pick<
    ReturnType<typeof useDiscoverMarkerController>,
    'markerPixelPos' | 'selectedMarkerListing' | 'handlePopoverDismiss' | 'handleSelectMarkerListing' | 'handleMarkerClickWithPosition'
  >;
};

export function buildMapSurfaceView(params: BuildMapSurfaceViewParams): DiscoverMapSurfaceView {
  const {
    navigationController: { hoveredNavigationNodeKey, focusedClusterMemberAreaKeys },
    agriController: { selectedRegion, selectedMaxKm, filteredAgriListings },
    schoolController: {
      schoolZoneLabels,
      schools,
      schoolsQuery,
      schoolFirstAreaSchoolCount,
      schoolFirstZoneSchoolCount,
      schoolFirstLandingSchoolCount,
      schoolListings,
      journeyView,
    },
    interactionController: { hoveredListingId, hoveredAreaKeyForMap },
    cameraController: {
      agriGroupFocusBounds,
      isColdNavigate,
      isSelectedNodeOutOfView,
      schoolFocusTick,
      selectedSchoolLat,
      selectedSchoolLon,
    },
    mapLayerController: {
      overviewAreas,
      areaSearchMatchKeys,
      resolvedRegionLabel,
      regionOverviewMarkerKind,
      isRegionOverview,
      regionOverviewShortLabel,
      areaJourneySegments,
      schoolJourneySegments,
      isAreaFirstCityLanding,
    },
    regionGuideController: { regionSelectNonce, prefersReducedMotion },
    mobilePresentationController: { bottomOcclusionPx, previewOcclusionPx },
    markerController: { markerPixelPos, selectedMarkerListing },
    activeFocusBounds,
    memoizedInitialCenter,
    cityCenter,
    cityZoom,
    cameraIntent,
    panToArea,
    mapZoom,
    currentMapMarkerListings,
    filters,
    isLandingState,
    focusedGroupAreas,
    areaLayerMaxZoom,
    selectedArea,
    isAgriJourney,
    areaMarkerListings,
    schoolRadiusOverlay,
    isBoundedBrowseState,
    areaRestoreArea,
    showSchoolBreadcrumb,
    focusedGroup,
    city,
    resolvedPanelContent,
    isSelectedGroupState,
    isAreaFirstSelectedAreaState,
    selectedSchool,
    showSchoolMarkers,
    schoolMarkerFocusTick,
    schoolMarkerPositions,
    schoolRadiusActive,
    schoolRadiusPillNoun,
    schoolRadiusHasMore,
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
    regionGuideRingActive,
    mobileMapOpen,
    activeAreasNavigationJourney,
    navJourney,
    isPreviewSheetOpen,
    selectedListingPreview,
    mapReady,
    mapContainerRef,
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
      areasNavigationJourney: activeAreasNavigationJourney,
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
  | 'handlePolygonDrawn'
  | 'handlePolygonCleared'
  | 'publishClusterCameraIntent'
  | 'onAreaVisualClusterCameraIntent'
  | 'handleAreaMarkersComputed'
  | 'handleCityChange'
  | 'publishMarkerClusterCameraIntent'
  | 'navigate'
> & {
  navigationController: Pick<
    ReturnType<typeof useDiscoverNavigationController>,
    'setHoveredNavigationNodeKey' | 'setFocusedClusterMemberAreaKeys'
  >;
  schoolController: Pick<ReturnType<typeof useDiscoverSchoolController>, 'journeyCommands'>;
  interactionController: Pick<
    ReturnType<typeof useDiscoverInteractionController>,
    'handleAreaClusterClick'
  >;
  cameraController: Pick<
    ReturnType<typeof useDiscoverCameraController>,
    'handleRecenterOnSelectedNode'
  >;
  regionGuideController: Pick<
    ReturnType<typeof useDiscoverRegionGuideController>,
    'dismissRegionGuide'
  >;
  overviewNavigationController: Pick<
    ReturnType<typeof useDiscoverOverviewNavigationController>,
    'handleOverviewAreaClick'
  >;
  mobilePresentationController: Pick<
    ReturnType<typeof useDiscoverMobilePresentationController>,
    'handlePreviewSheetHeightChange'
  >;
  viewportTrackerController: Pick<ReturnType<typeof useDiscoverViewportTracker>, 'handleBoundsChange'>;
  markerController: Pick<
    ReturnType<typeof useDiscoverMarkerController>,
    'handlePopoverDismiss' | 'handleSelectMarkerListing' | 'handleMarkerClickWithPosition'
  >;
  buildNavigationNodeHref: DiscoverMapCanvasProps['buildNavigationNodeHref'];
  setMapReady: DiscoverMapCanvasProps['setMapReady'];
  showMarkerInList: DiscoverMapCanvasProps['showMarkerInList'];
  handleStepMarkerListing: DiscoverMapCanvasProps['handleStepMarkerListing'];
  clearSelectedListing: () => void;
};

export function buildMapSurfaceCommands(
  params: BuildMapSurfaceCommandsParams,
): DiscoverMapSurfaceCommands {
  const {
    publishCameraIntent,
    setMapZoom,
    handlePolygonDrawn,
    handlePolygonCleared,
    publishClusterCameraIntent,
    onAreaVisualClusterCameraIntent,
    handleAreaMarkersComputed,
    handleCityChange,
    publishMarkerClusterCameraIntent,
    navigate,
    navigationController: { setHoveredNavigationNodeKey, setFocusedClusterMemberAreaKeys },
    schoolController: { journeyCommands },
    interactionController: { handleAreaClusterClick },
    cameraController: { handleRecenterOnSelectedNode },
    regionGuideController: { dismissRegionGuide },
    overviewNavigationController: { handleOverviewAreaClick },
    mobilePresentationController: { handlePreviewSheetHeightChange },
    viewportTrackerController: { handleBoundsChange },
    markerController: { handlePopoverDismiss, handleSelectMarkerListing, handleMarkerClickWithPosition },
    buildNavigationNodeHref,
    setMapReady,
    showMarkerInList,
    handleStepMarkerListing,
    clearSelectedListing,
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
      onNavigationNodeHoverChange: setHoveredNavigationNodeKey,
      onClusterFocusChange: setFocusedClusterMemberAreaKeys,
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
      onClusterFocusChange: setFocusedClusterMemberAreaKeys,
      onDismissPreview: clearSelectedListing,
      onViewDetails: (id: string) => navigate(`/listing/${id}`),
      onPreviewHeightChange: handlePreviewSheetHeightChange,
      onRecenter: handleRecenterOnSelectedNode,
    },
  };
}
