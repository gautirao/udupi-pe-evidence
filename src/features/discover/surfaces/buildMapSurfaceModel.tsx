import type { RefObject } from 'react';
import { AREA_LAYER_MAX_ZOOM } from '@/lib/map/zoomPolicy';
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
import type { useDiscoverPageContext } from '@/features/discover/controllers/useDiscoverPageContext';
import type { useDiscoverPageStateController } from '@/features/discover/controllers/useDiscoverPageStateController';
import type { useDiscoverMapDataController } from '@/features/discover/controllers/useDiscoverMapDataController';
import type { useDiscoverAreaGroupsController } from '@/features/discover/controllers/useDiscoverAreaGroupsController';
import type { useDiscoverBadgeController } from '@/features/discover/controllers/useDiscoverBadgeController';
import type { useDiscoverJourneyChromeController } from '@/features/discover/controllers/useDiscoverJourneyChromeController';
import type { useDiscoverMarkerPopoverController } from '@/features/discover/controllers/useDiscoverMarkerPopoverController';
import type { useDiscoverGeographyController } from '@/features/discover/controllers/useDiscoverGeographyController';

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
 * — see buildOverlaySurfaceModel.ts's doc comment for the full rationale.
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
 * buildMapSurfaceModel()/buildMapSurfaceCommands() is untouched — only the
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
  | 'memoizedInitialCenter'
  | 'schoolMarkerFocusTick'
  | 'schoolMarkerPositions'
  | 'areaRestoreArea'
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
  'regionSelectNonce' | 'prefersReducedMotion' | 'regionGuideVisible' | 'regionGuideRingActive'
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
  // Issue #2142 (correction pass) — these four are now DERIVED here rather
  // than by the caller, so the composition root stays free of conditionals
  // and constants. See the derivations at the top of buildMapSurfaceModel().
  | 'mobileListButton'
  | 'isBoundedBrowseState'
  | 'isMarkerPopoverEligible'
  | 'areaLayerMaxZoom'
  | 'selectedArea'
  // Issue #2142 (correction pass) — every field below now arrives as part of
  // its OWNING CONTROLLER's result object (the grouped params after this
  // Omit), so the composition root passes references instead of transcribing
  // ~55 individually-named fields it would otherwise keep in sync by hand.
  // Same change, and same rationale, as buildPanelSurfaceModel.ts.
  | 'isAuthenticated'
  | 'isAgriJourney'
  | 'showLoader'
  | 'filters'
  | 'selectedSchool'
  | 'panToArea'
  | 'mapZoom'
  | 'city'
  | 'resolvedPanelContent'
  | 'error'
  | 'activeFocusBounds'
  | 'cityCenter'
  | 'cityZoom'
  | 'cameraIntent'
  | 'areaMarkerListings'
  | 'schoolRadiusHasMore'
  | 'markersTruncated'
  | 'markersReturnedElements'
  | 'markersTotalFilteredElements'
  | 'isLoading'
  | 'focusedGroupAreas'
  | 'focusedGroup'
  | 'announcedBadgeText'
  | 'discoverBadge'
  | 'areaResultSummaryText'
  | 'groupSelectedBadgeCopy'
  | 'fallbackBadgeCopy'
  | 'schoolRadiusActive'
  | 'schoolRadiusPillNoun'
  | 'cityTotal'
  | 'hasActiveAnonFilter'
  | 'isLandingState'
  | 'showSchoolMarkers'
  | 'showSchoolBreadcrumb'
  | 'schoolRadiusOverlay'
  | 'isSelectedGroupState'
  | 'isAreaFirstSelectedAreaState'
  | 'currentMapMarkerListings'
  | 'markerPopoverStepper'
  | 'memoizedInitialCenter'
  | 'schoolMarkerFocusTick'
  | 'schoolMarkerPositions'
  | 'areaRestoreArea'
  | 'regionGuideVisible'
  | 'regionGuideRingActive'
  | 'navigate'
  | 'handlePolygonDrawn'
  | 'handlePolygonCleared'
  | 'setMapZoom'
  | 'setMapReady'
  | 'handleCityChange'
  | 'publishCameraIntent'
  | 'publishClusterCameraIntent'
  | 'publishMarkerClusterCameraIntent'
  | 'handleAreaMarkersComputed'
  | 'handleStepMarkerListing'
  | 'showMarkerInList'
> & {
  mapContainerRef: RefObject<HTMLDivElement | null>;
  mobileMapOpen: boolean;
  setMobileView: (view: 'LIST' | 'MAP') => void;
  /** Raw (un-narrowed) popover eligibility; the `!mobileMapOpen` narrowing is applied below. */
  isMarkerPopoverEligible: boolean;
  isGroupResultsState: boolean;
  isNodeListingsState: boolean;
  activeAreasNavigationJourney: UseAreasNavigationJourneyResult;
  navJourney: string;

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
  pageContextController: Pick<
    ReturnType<typeof useDiscoverPageContext>,
    | 'isAuthenticated'
    | 'isAgriJourney'
  >;
  pageStateController: Pick<
    ReturnType<typeof useDiscoverPageStateController>,
    | 'showLoader'
    | 'filters'
    | 'selectedSchool'
    | 'panToArea'
    | 'mapZoom'
    | 'mapReady'
    | 'city'
    | 'resolvedPanelContent'
    | 'effectiveSelectedArea'
  >;
  mapDataController: Pick<
    ReturnType<typeof useDiscoverMapDataController>,
    | 'error'
    | 'activeFocusBounds'
    | 'cityCenter'
    | 'cityZoom'
    | 'cameraIntent'
    | 'areaMarkerListings'
    | 'schoolRadiusHasMore'
    | 'markersTruncated'
    | 'markersReturnedElements'
    | 'markersTotalFilteredElements'
    | 'isLoading'
  >;
  areaGroupsController: Pick<
    ReturnType<typeof useDiscoverAreaGroupsController>,
    | 'focusedGroupAreas'
    | 'focusedGroup'
  >;
  badgeController: Pick<
    ReturnType<typeof useDiscoverBadgeController>,
    | 'announcedBadgeText'
    | 'discoverBadge'
    | 'areaResultSummaryText'
    | 'groupSelectedBadgeCopy'
    | 'fallbackBadgeCopy'
    | 'schoolRadiusActive'
    | 'schoolRadiusPillNoun'
    | 'cityTotal'
    | 'hasActiveAnonFilter'
  >;
  journeyChromeController: Pick<
    ReturnType<typeof useDiscoverJourneyChromeController>,
    | 'isLandingState'
    | 'showSchoolMarkers'
    | 'showSchoolBreadcrumb'
    | 'schoolRadiusOverlay'
    | 'isSelectedGroupState'
    | 'isAreaFirstSelectedAreaState'
  >;
  markerPopoverController: Pick<
    ReturnType<typeof useDiscoverMarkerPopoverController>,
    | 'currentMapMarkerListings'
    | 'markerPopoverStepper'
  >;
  interactionController: MapInteractionSlice;
  cameraController: MapCameraSlice;
  mapLayerController: MapLayerSlice;
  regionGuideController: MapRegionGuideSlice;
  mobilePresentationController: Pick<
    ReturnType<typeof useDiscoverMobilePresentationController>,
    'bottomOcclusionPx' | 'previewOcclusionPx' | 'isPreviewSheetOpen' | 'selectedListingPreview'
  >;
  viewportTrackerController: Pick<ReturnType<typeof useDiscoverViewportTracker>, 'handleBoundsChange'>;
  markerController: Pick<
    ReturnType<typeof useDiscoverMarkerController>,
    'markerPixelPos' | 'selectedMarkerListing' | 'handlePopoverDismiss' | 'handleSelectMarkerListing' | 'handleMarkerClickWithPosition'
  >;
};

export function buildMapSurfaceModel(params: BuildMapSurfaceViewParams): DiscoverMapSurfaceView {
  // Issue #2142 (correction pass) — the four surface-shaping derivations that
  // used to sit inline in MapDiscovery.tsx's `mapProps` literal. They live
  // here because they are purely about what THIS surface renders; none is a
  // domain decision, and keeping them out of the composition root is what lets
  // that root stay conditional-free.
  const {
    mobileMapOpen: _mobileMapOpen,
    setMobileView,
    isGroupResultsState,
    isNodeListingsState,
    isMarkerPopoverEligible: rawIsMarkerPopoverEligible,
  } = params;

  // The mobile "List" toggle button. Same JSX/onClick/testid/className it has
  // had since it was an inline conditional on DiscoverMapMount's
  // `mobileListButton` prop.
  const mobileListButton = _mobileMapOpen ? (
    <button
      type="button"
      onClick={() => setMobileView('LIST')}
      data-testid="mobile-map-close-list-button"
      className="pointer-events-auto shrink-0 self-start rounded-full border border-border bg-background/95 px-4 py-2 text-sm font-medium shadow-md"
    >
      List
    </button>
  ) : null;

  // Issue #2089 — bounded Browse covers BOTH the group-results and the
  // node-listings scopes; the map layer treats them identically.
  const isBoundedBrowseState = isGroupResultsState || isNodeListingsState;

  // Issue #1956 PR-5 defect fix (Phase 7A) — the desktop marker popover is
  // suppressed while the mobile full-screen Map overlay is open (the mobile
  // preview sheet takes over that role there).
  const isMarkerPopoverEligible = rawIsMarkerPopoverEligible && !_mobileMapOpen;

  // The zoom policy constant the map layer switches on. A constant, not a
  // caller decision — sourced here so the composition root never carries it.
  const areaLayerMaxZoom = AREA_LAYER_MAX_ZOOM;

  const {
    pageContextController: { isAuthenticated, isAgriJourney },
    pageStateController: { showLoader, filters, selectedSchool, panToArea, mapZoom, mapReady, city, resolvedPanelContent, effectiveSelectedArea: selectedArea },
    mapDataController: { error, activeFocusBounds, cityCenter, cityZoom, cameraIntent, areaMarkerListings, schoolRadiusHasMore, markersTruncated, markersReturnedElements, markersTotalFilteredElements, isLoading },
    areaGroupsController: { focusedGroupAreas, focusedGroup },
    badgeController: { announcedBadgeText, discoverBadge, areaResultSummaryText, groupSelectedBadgeCopy, fallbackBadgeCopy, schoolRadiusActive, schoolRadiusPillNoun, cityTotal, hasActiveAnonFilter },
    journeyChromeController: { isLandingState, showSchoolMarkers, showSchoolBreadcrumb, schoolRadiusOverlay, isSelectedGroupState, isAreaFirstSelectedAreaState },
    markerPopoverController: { currentMapMarkerListings, markerPopoverStepper },
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
      memoizedInitialCenter,
      schoolMarkerFocusTick,
      schoolMarkerPositions,
      areaRestoreArea,
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
    regionGuideController: { regionSelectNonce, prefersReducedMotion, regionGuideVisible, regionGuideRingActive },
    mobilePresentationController: { bottomOcclusionPx, previewOcclusionPx, isPreviewSheetOpen, selectedListingPreview },
    markerController: { markerPixelPos, selectedMarkerListing },
    mobileMapOpen,
    activeAreasNavigationJourney,
    navJourney,
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
  'onAreaVisualClusterCameraIntent'
> & {
  pageContextController: Pick<ReturnType<typeof useDiscoverPageContext>, 'navigate'>;
  pageStateController: Pick<
    ReturnType<typeof useDiscoverPageStateController>,
    | 'handlePolygonDrawn'
    | 'handlePolygonCleared'
    | 'setMapZoom'
    | 'setMapReady'
    | 'handleCityChange'
  >;
  mapDataController: Pick<
    ReturnType<typeof useDiscoverMapDataController>,
    | 'publishCameraIntent'
    | 'publishClusterCameraIntent'
    | 'publishMarkerClusterCameraIntent'
  >;
  geographyController: Pick<
    ReturnType<typeof useDiscoverGeographyController>,
    | 'handleAreaMarkersComputed'
  >;
  markerPopoverController: Pick<
    ReturnType<typeof useDiscoverMarkerPopoverController>,
    | 'handleStepMarkerListing'
  >;
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
    | 'handlePopoverDismiss'
    | 'handleSelectMarkerListing'
    | 'handleMarkerClickWithPosition'
    | 'showMarkerInList'
  >;
  buildNavigationNodeHref: DiscoverMapCanvasProps['buildNavigationNodeHref'];
  clearSelectedListing: () => void;
};

export function buildMapSurfaceCommands(
  params: BuildMapSurfaceCommandsParams,
): DiscoverMapSurfaceCommands {
  const {
    pageContextController: { navigate },
    pageStateController: { handlePolygonDrawn, handlePolygonCleared, setMapZoom, setMapReady, handleCityChange },
    mapDataController: { publishCameraIntent, publishClusterCameraIntent, publishMarkerClusterCameraIntent },
    geographyController: { handleAreaMarkersComputed },
    markerPopoverController: { handleStepMarkerListing },
    onAreaVisualClusterCameraIntent,
    navigationController: { setHoveredNavigationNodeKey, setFocusedClusterMemberAreaKeys },
    schoolController: { journeyCommands },
    interactionController: { handleAreaClusterClick },
    cameraController: { handleRecenterOnSelectedNode },
    regionGuideController: { dismissRegionGuide },
    overviewNavigationController: { handleOverviewAreaClick },
    mobilePresentationController: { handlePreviewSheetHeightChange },
    viewportTrackerController: { handleBoundsChange },
    markerController: {
      handlePopoverDismiss,
      handleSelectMarkerListing,
      handleMarkerClickWithPosition,
      showMarkerInList,
    },
    buildNavigationNodeHref,
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
