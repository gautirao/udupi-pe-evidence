import type { ReactNode, RefObject, MutableRefObject, Dispatch, SetStateAction } from 'react';
import { AREA_LAYER_MAX_ZOOM } from '@/lib/map/zoomPolicy';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import type { RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';
import type { PropertyFilters, PropertyListing, PropertyImage } from '@/hooks/usePropertyListings';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import type { AreaPoint, AreaMarkerClusterInfo } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { ZoneLabelPoint } from '@/components/map/SchoolZoneLabelLayer';
import type {
  DiscoverJourneyTransitionsView,
  DiscoverJourneyTransitionsCommands,
} from '@/features/discover/state/useDiscoverJourneyTransitions';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type { DiscoverMapCrumb } from '@/components/discover/DiscoverMapBreadcrumb';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';
import type { MarkerPopoverStepper } from '@/features/discover/map/resolveMarkerPopover';
import type { DiscoverBadgeResult } from '@/features/discover/presentation/discoverBadge';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { DiscoverIntent, DiscoverUrlFilters } from '@/hooks/useDiscoverUrlState';
import type {
  PolygonDraftBlock,
  PolygonDraftPhase,
} from '@/features/discover/state/polygonDraftPhase';
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
import type { useDiscoverViewportSearch } from '@/features/discover/controllers/useDiscoverViewportSearch';
import type { useDiscoverMarkerController } from '@/features/discover/controllers/useDiscoverMarkerController';
import type { useDiscoverPageContext } from '@/features/discover/controllers/useDiscoverPageContext';
import type { useDiscoverPageStateController } from '@/features/discover/controllers/useDiscoverPageStateController';
import type { useDiscoverMapDataController } from '@/features/discover/controllers/useDiscoverMapDataController';
import type { useDiscoverAreaGroupsController } from '@/features/discover/controllers/useDiscoverAreaGroupsController';
import type { useDiscoverBadgeController } from '@/features/discover/controllers/useDiscoverBadgeController';
import type { useDiscoverJourneyChromeController } from '@/features/discover/controllers/useDiscoverJourneyChromeController';
import type { useDiscoverMarkerPopoverController } from '@/features/discover/controllers/useDiscoverMarkerPopoverController';
import type { useDiscoverGeographyController } from '@/features/discover/controllers/useDiscoverGeographyController';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';

/**
 * Issue #2659 (D1 — approved decision record) — the capability interfaces
 * below are now the SOURCE OF TRUTH for the map surface's view/commands
 * contract. Previously each was a `Pick<DiscoverMapCanvasProps, ...>`
 * (DiscoverMapCanvas.tsx's own 139-field flat interface); that flat
 * interface is now DELETED and DiscoverMapCanvasProps instead narrows to
 * `{ mapContainerRef, view: Omit<DiscoverMapSurfaceView,'overlays'>,
 * commands: Omit<DiscoverMapSurfaceCommands,'overlays'> }` — see that
 * component's own doc comment. The derivation direction is therefore
 * inverted from Issue #2142's original design: this file no longer imports
 * anything from `views/DiscoverMapCanvas` at all, and DiscoverMapCanvas.tsx
 * imports `DiscoverMapSurfaceView`/`DiscoverMapSurfaceCommands` FROM here.
 *
 * D2 (regroup) — two previously-oversized groups are split:
 *   - the old 21-field `layers` group is replaced by `areas` (area-marker/
 *     region-overview fields), `agri` (agri-journey fields), and `scope`
 *     (filters + landing/bounded-browse flags); `schoolZoneLabels`/
 *     `schoolRadiusOverlay` moved into `schools`, and the marker-listing
 *     fields (`areaMarkerListings`/`currentMapMarkerListings`) moved into
 *     `markers`.
 *   - the old 19-field `commands.drawing`-only group is replaced by
 *     `drawing` (view+commands), `replaceScope` (view+commands, the #2016
 *     J3.3 dialog) and `viewportSearch` (view+commands, the #2015 CTA —
 *     `viewportSearchIsDirty`/`viewportSearchIsEligible` pulled out of
 *     `status`, where they previously lived, because they are read and
 *     written together with `onActivateViewportSearch` by exactly one
 *     consumer, `SearchThisAreaCta`). Issue #2419's original rationale for
 *     co-locating draw-phase state with its handlers no longer applies once
 *     both groups are required together by the same builder — this is a
 *     deliberate, disclosed change, not an oversight.
 *
 * `overlays` is unchanged (still an ADDITION beyond the canvas contract):
 * MobileClusterSheet, MobileListingPreviewSheet, and the recenter-button
 * portal are rendered as DiscoverMapCanvas's siblings, never passed to it
 * (see DiscoverMapSurface.tsx, which must never spread `view.overlays`/
 * `commands.overlays` into the canvas props).
 *
 * `mapContainerRef` stays OUTSIDE the view/commands split for the same
 * reason as before: it's a DOM ref the page creates and the surface both
 * forwards to DiscoverMapCanvas and reads directly.
 */

type MapCameraView = {
  agriGroupFocusBounds: [[number, number], [number, number]] | null;
  activeFocusBounds: [[number, number], [number, number]] | null;
  memoizedInitialCenter: [number, number] | undefined;
  isColdNavigate?: boolean;
  cityCenter: [number, number] | undefined;
  cityZoom: number | undefined;
  cameraIntent: CameraIntent | null;
  pendingRemountCameraIntentSeqRef: MutableRefObject<number | null>;
  panToArea: AreaPoint | null;
  bottomOcclusionPx?: number;
  previewOcclusionPx?: number;
  prefersReducedMotion: boolean;
  mapZoom: number;
};
type MapCameraCommands = {
  publishCameraIntent: (area: AreaPoint) => void;
  setMapZoom: Dispatch<SetStateAction<number>>;
  handleBoundsChange: (bbox: [number, number, number, number]) => void;
  handleUserCameraGesture: () => void;
};

/** D2 — split out of the old (21-field) `layers` group. */
type MapAreasView = {
  focusedGroupAreas: string[] | undefined;
  areaLayerMaxZoom: number;
  selectedArea: AreaPoint | null;
  overviewAreas: AreaPoint[];
  areaSearchMatchKeys: string[] | undefined;
  hoveredAreaKeyForMap: string | null;
  isRegionOverview: boolean;
  regionOverviewShortLabel: string | null;
  areaRestoreArea: DiscoverArea | null;
};

/** D2 — split out of the old (21-field) `layers` group. */
type MapAgriView = {
  selectedRegion: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | null;
  selectedMaxKm: 10 | 25 | 50 | 100 | null;
  filteredAgriListings: AgriMapListingItem[] | null;
  agriDestinationMarkers: AgriMapListingItem[];
  isAgriJourney: boolean;
};

/** D2 — split out of the old (21-field) `layers` group. */
type MapScopeView = {
  filters: PropertyFilters;
  isLandingState: boolean;
  isBoundedBrowseState: boolean;
};

/** D2 — split out of the old (19-field) `commands.drawing`-only group. */
type MapDrawingView = {
  polygonDraftPhase?: PolygonDraftPhase;
  polygonDraftBlock?: PolygonDraftBlock | null;
  drawVertexCount?: number;
  startDrawNonce?: number;
  cancelDrawNonce?: number;
  undoVertexNonce?: number;
};
type MapDrawingCommands = {
  handlePolygonDrawn: (polygon: [number, number][]) => void;
  handlePolygonCleared: () => void;
  handleCancelDrawPolygon?: () => void;
  handleUndoDrawVertex?: () => void;
  handleRedrawPolygon?: () => void;
  handleRetryPolygonValidation?: () => void;
  handleDismissPolygonRejection?: () => void;
  handleDrawVertexCountChange?: (count: number) => void;
  handleDrawModeExit?: () => void;
};

/** D2 — Issue #2016 J3.3 replace-confirmation dialog, split out of `drawing`. */
type MapReplaceScopeView = {
  isReplaceScopeConfirmOpen?: boolean;
};
type MapReplaceScopeCommands = {
  handleConfirmReplaceScope?: () => void;
  handleCancelReplaceScope?: () => void;
};

/**
 * D2 — Issue #2015 "Search this area" CTA, split out of `drawing`
 * (commands) and `status` (view: `viewportSearchIsDirty`/
 * `viewportSearchIsEligible` previously lived on `status` even though they
 * are consumed only by `SearchThisAreaCta` alongside `onActivateViewportSearch`).
 */
type MapViewportSearchView = {
  viewportSearchIsDirty?: boolean;
  viewportSearchIsEligible?: boolean;
};
type MapViewportSearchCommands = {
  onActivateViewportSearch?: () => void;
};

type MapNavigationView = {
  showSchoolBreadcrumb: boolean;
  focusedGroup: AreaGroup | null;
  city: string;
  areasNavigationJourney?: UseAreasNavigationJourneyResult;
  hoveredNavigationNodeKey?: string | null;
  focusedClusterMemberAreaKeys?: readonly string[] | null;
  isAreaFirstCityLanding: boolean;
  areaJourneySegments: DiscoverMapCrumb[];
  schoolJourneySegments: DiscoverMapCrumb[];
  resolvedPanelContent: DiscoverPanelContent;
  isSelectedGroupState: boolean;
  isAreaFirstSelectedAreaState: boolean;
  journeyView: DiscoverJourneyTransitionsView;
};
type MapNavigationCommands = {
  publishClusterCameraIntent: (bounds: CameraIntent['bounds'], center: [number, number]) => void;
  onAreaVisualClusterCameraIntent?: (bounds: CameraIntent['bounds'], center: [number, number]) => void;
  autoAdvanceSelectNode?: (nodeKey: string) => void;
  handleAreaMarkersComputed: (shownCount: number, totalCount: number) => void;
  handleCityChange: (newCity: string) => void;
  onNavigationNodeHoverChange?: (nodeKey: string | null) => void;
  onClusterFocusChange?: (memberAreaKeys: readonly string[] | null) => void;
  handleOverviewAreaClick: (area: AreaPoint) => void;
  handleAreaClusterClick: (cluster: AreaMarkerClusterInfo) => void;
  buildNavigationNodeHref?: (nodeKey: string) => string | null;
  journeyCommands: DiscoverJourneyTransitionsCommands;
};

/**
 * D2 — gains `schoolZoneLabels`/`schoolRadiusOverlay` (moved out of the old `layers` group).
 *
 * `schoolsQuery` is narrowed to the 3 sub-fields DiscoverMapCanvas.tsx actually reads
 * (`.isLoading`/`.isError`/`.error`, forwarded to PropertyMap's `schoolsIsLoading`/
 * `schoolsIsError`/`schoolsError`) rather than passed through as the whole react-query result —
 * see this PR's evidence table for why every other whole-object passthrough in this file stays
 * whole. Derived from `useDiscoverSchoolController`'s own return type
 * (`Pick<ReturnType<...>['schoolsQuery'], ...>`) rather than importing react-query's
 * `UseInfiniteQueryResult` directly — surfaceLayering.guard.test.ts forbids `surfaces/**` from
 * naming `@tanstack/react-query` in ANY form, including type-only.
 */
type MapSchoolsView = {
  selectedSchool: SchoolResult | null;
  showSchoolMarkers: boolean;
  schoolMarkerFocusTick: number;
  schoolMarkerPositions: Array<{ lat: number; lon: number }>;
  schoolRadiusActive: boolean;
  schoolRadiusPillNoun: 'homes' | 'rentals';
  schoolRadiusHasMore: boolean;
  schools: SchoolResult[];
  schoolsQuery: Pick<ReturnType<typeof useDiscoverSchoolController>['schoolsQuery'], 'isLoading' | 'isError' | 'error'>;
  schoolFocusTick: number;
  selectedSchoolLat: number | undefined;
  selectedSchoolLon: number | undefined;
  schoolFirstAreaSchoolCount: number | null;
  schoolFirstZoneSchoolCount: number | null;
  schoolFirstLandingSchoolCount: number | null;
  schoolListings: DiscoverCityListingItem[];
  schoolZoneLabels: ZoneLabelPoint[];
  schoolRadiusOverlay: boolean;
};

/** D2 — gains `areaMarkerListings`/`currentMapMarkerListings` (moved out of the old `layers` group). */
type MapMarkersView = {
  isMarkerPopoverEligible: boolean;
  markerPopoverStepper: MarkerPopoverStepper | null;
  markersTruncated: boolean;
  markersReturnedElements: number | undefined;
  markersTotalFilteredElements: number | undefined;
  markerPixelPos: { x: number; y: number } | null;
  selectedMarkerListing: PropertyListingWithImages | null;
  hoveredListingId: string | null;
  areaMarkerListings: (PropertyListing & { images?: PropertyImage[] })[];
  currentMapMarkerListings: PropertyListingWithImages[];
};
type MapMarkersCommands = {
  publishMarkerClusterCameraIntent?: (bounds: CameraIntent['bounds'], center: [number, number]) => void;
  navigate: (path: string) => void;
  setMapReady: Dispatch<SetStateAction<boolean>>;
  handlePopoverDismiss: () => void;
  handleSelectMarkerListing: (listing: PropertyListingWithImages | null) => void;
  handleMarkerClickWithPosition: (pos: { x: number; y: number }) => void;
  handleStepMarkerListing: (direction: -1 | 1) => void;
  showMarkerInList: (id: string) => void;
};

/** `viewportSearchIsDirty`/`viewportSearchIsEligible` moved OUT (see `MapViewportSearchView` above). */
type MapStatusView = {
  showLoader: boolean;
  error: Error | null;
  isLoading: boolean;
  discoverBadge: DiscoverBadgeResult;
  areaResultSummaryText: string | null;
  groupSelectedBadgeCopy: string;
  fallbackBadgeCopy: string;
  cityTotal: number;
  isAreaRecenterButtonVisible: boolean;
  isAuthenticated: boolean;
  hasActiveAnonFilter: boolean;
  announcedBadgeText: string;
  /** Issue #2628 — the applied Buy/Rent intent (Map results heading/summary + MapFilterSheet). */
  intent?: DiscoverIntent;
};

type MapMobileView = { mobileListButton?: ReactNode };

/**
 * Issue #2628 — the mobile Map "Filters" staged sheet's one canonical write command.
 * Issue #2711 — plus `onIntentChange`, the matching canonical Buy/Rent intent command
 * (city.ts's `setIntent`) so the sheet's Apply can commit an intent switch atomically,
 * the same way `onFiltersChange` lets it commit the transitioned filters.
 */
type MapFiltersCommands = {
  onFiltersChange?: (next: PropertyFilters) => void;
  onIntentChange?: (intent: DiscoverIntent, filtersOverride?: DiscoverUrlFilters) => void;
};

type MapRegionGuideView = {
  regionGuideVisible: boolean;
  regionGuideRingActive: boolean;
  resolvedRegionLabel: string | null;
  regionSelectNonce: number;
  regionOverviewMarkerKind: RegionOverviewMarkerKind;
};
type MapRegionGuideCommands = { dismissRegionGuide: () => void };

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
  areas: MapAreasView;
  agri: MapAgriView;
  scope: MapScopeView;
  navigation: MapNavigationView;
  schools: MapSchoolsView;
  markers: MapMarkersView;
  status: MapStatusView;
  mobile: MapMobileView;
  regionGuide: MapRegionGuideView;
  drawing: MapDrawingView;
  replaceScope: MapReplaceScopeView;
  viewportSearch: MapViewportSearchView;
  overlays: DiscoverMapOverlaysView;
}

export interface DiscoverMapSurfaceCommands {
  camera: MapCameraCommands;
  drawing: MapDrawingCommands;
  replaceScope: MapReplaceScopeCommands;
  viewportSearch: MapViewportSearchCommands;
  navigation: MapNavigationCommands;
  markers: MapMarkersCommands;
  regionGuide: MapRegionGuideCommands;
  overlays: DiscoverMapOverlaysCommands;
  /** Issue #2628 — the mobile Map "Filters" staged sheet's one canonical write command. */
  filters: MapFiltersCommands;
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

/**
 * Issue #2659 (D1) — the leftover flat fields this builder still takes
 * directly (everything else now arrives nested inside an owning
 * controller's Pick below). Previously computed as `Omit<DiscoverMapCanvasProps,
 * ~120 names>`; rewritten as an explicit inline type now that
 * DiscoverMapCanvasProps no longer carries these fields at all (deriving off
 * it here would silently start including `view`/`commands` themselves).
 * `intent` is the only field the function body actually reads off this base
 * — every other name the old Omit computation happened to leave in (e.g.
 * `handleUserCameraGesture`) was unused dead type surface: the composition
 * root (`assembleDiscoverSurfaceProps.ts`) never supplied it as a flat
 * field (it arrives via `viewportTrackerController` instead), and this was a
 * pre-existing `BuildMapSurfaceViewParams` mismatch predating this PR (see
 * this PR's typecheck delta note) — this rewrite drops the unused surplus
 * rather than re-deriving it.
 */
type MapSurfaceLeftoverParams = {
  intent?: DiscoverIntent;
};

export type BuildMapSurfaceViewParams = MapSurfaceLeftoverParams & {
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
    'selectedRegion' | 'selectedMaxKm' | 'filteredAgriListings' | 'agriDestinationMarkers'
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
    // Issue #2659 (D2) — draw-mode/replace-scope VIEW data. Previously this
    // builder never read these (they reached DiscoverMapCanvas only via
    // `buildMapSurfaceCommands`'s own, separate `pageStateController` Pick,
    // bundled with their handlers in the single old `commands.drawing`
    // group). The regrouped `view.drawing`/`view.replaceScope` need them
    // here too — same controller object the composition root already
    // passes to both builders, just a wider Pick, so no composition-root
    // change is required.
    | 'isReplaceScopeConfirmOpen'
    | 'polygonDraftPhase'
    | 'polygonDraftBlock'
    | 'drawVertexCount'
    | 'startDrawNonce'
    | 'cancelDrawNonce'
    | 'undoVertexNonce'
  >;
  mapDataController: Pick<
    ReturnType<typeof useDiscoverMapDataController>,
    | 'error'
    | 'activeFocusBounds'
    | 'cityCenter'
    | 'cityZoom'
    | 'cameraIntent'
    | 'pendingRemountCameraIntentSeqRef'
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
  /**
   * Issue #2015 — "Search this area" CTA dirty-state (AC1) and eligibility
   * gating (MUST-HAVE #2, PR review 5085561270): `isEligible` reflects
   * whether the current navigation level has a committed AREA_SET/POLYGON
   * ResultScope active — the CTA must never render without it.
   */
  viewportSearchController: Pick<ReturnType<typeof useDiscoverViewportSearch>, 'isDirty' | 'isEligible'>;
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
    // Issue #2015 — "Search this area" CTA dirty-state (AC1) and eligibility
    // gating (MUST-HAVE #2).
    viewportSearchController: { isDirty: isViewportSearchDirty, isEligible: isViewportSearchEligible },
  } = params;

  // Issue #2408 AC — restyled as the mock's segmented "List | Map" pill
  // (both labels visible, active one highlighted) instead of a standalone
  // "List" button. Same onClick/testid as before (`mobile-map-close-list-
  // button`, `setMobileView('LIST')`) — this is a visual restyle only, so
  // the existing List<->Map e2e/unit coverage keeps working unchanged. The
  // mirrored "List"-active pill lives in DiscoverControlBar.tsx, which
  // renders while this overlay is closed.
  const mobileListButton = _mobileMapOpen ? (
    <div
      role="group"
      aria-label="List or Map view"
      className="pointer-events-auto flex shrink-0 items-center gap-0.5 self-start rounded-full border border-border bg-background/95 p-0.5 shadow-md"
    >
      <button
        type="button"
        onClick={() => setMobileView('LIST')}
        data-testid="mobile-map-close-list-button"
        className="rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground"
      >
        List
      </button>
      <span
        aria-hidden="true"
        className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
      >
        Map
      </span>
    </div>
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
    pageStateController: {
      showLoader,
      filters,
      selectedSchool,
      panToArea,
      mapZoom,
      mapReady,
      city,
      resolvedPanelContent,
      effectiveSelectedArea: selectedArea,
      isReplaceScopeConfirmOpen,
      polygonDraftPhase,
      polygonDraftBlock,
      drawVertexCount,
      startDrawNonce,
      cancelDrawNonce,
      undoVertexNonce,
    },
    mapDataController: { error, activeFocusBounds, cityCenter, cityZoom, cameraIntent, pendingRemountCameraIntentSeqRef, areaMarkerListings, schoolRadiusHasMore, markersTruncated, markersReturnedElements, markersTotalFilteredElements, isLoading },
    areaGroupsController: { focusedGroupAreas, focusedGroup },
    badgeController: { announcedBadgeText, discoverBadge, areaResultSummaryText, groupSelectedBadgeCopy, fallbackBadgeCopy, schoolRadiusActive, schoolRadiusPillNoun, cityTotal, hasActiveAnonFilter },
    journeyChromeController: { isLandingState, showSchoolMarkers, showSchoolBreadcrumb, schoolRadiusOverlay, isSelectedGroupState, isAreaFirstSelectedAreaState },
    markerPopoverController: { currentMapMarkerListings, markerPopoverStepper },
    navigationController: { hoveredNavigationNodeKey, focusedClusterMemberAreaKeys },
    agriController: { selectedRegion, selectedMaxKm, filteredAgriListings, agriDestinationMarkers },
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
    intent,
  } = params;

  // Issue #2724 (pass 3, area-selected desktop pairing) — computed once here and reused for
  // BOTH `overlays.recenter.visible` (gates the portalled `areas-recenter-button` itself,
  // DiscoverMapSurface.tsx) and `status.isAreaRecenterButtonVisible` (tells DiscoverMapCanvas's
  // count pill whether to flank left to pair with it), so the two can never disagree. See the
  // `recenter` field below for the ROOT-node suppression rationale (Issue #2724 code-review
  // follow-up).
  const isAreaRecenterButtonVisible = !!(
    mapReady &&
    mapContainerRef.current &&
    isSelectedNodeOutOfView &&
    activeAreasNavigationJourney.node &&
    activeAreasNavigationJourney.node.nodeType !== 'ROOT'
  );

  return {
    camera: {
      agriGroupFocusBounds,
      activeFocusBounds,
      memoizedInitialCenter,
      isColdNavigate,
      cityCenter,
      cityZoom,
      cameraIntent,
      pendingRemountCameraIntentSeqRef,
      panToArea,
      bottomOcclusionPx,
      previewOcclusionPx,
      prefersReducedMotion,
      mapZoom,
    },
    areas: {
      focusedGroupAreas,
      areaLayerMaxZoom,
      selectedArea,
      overviewAreas,
      areaSearchMatchKeys,
      hoveredAreaKeyForMap,
      isRegionOverview,
      regionOverviewShortLabel,
      areaRestoreArea,
    },
    agri: {
      selectedRegion,
      selectedMaxKm,
      filteredAgriListings,
      agriDestinationMarkers,
      isAgriJourney,
    },
    scope: {
      filters,
      isLandingState,
      isBoundedBrowseState,
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
      schoolZoneLabels,
      schoolRadiusOverlay,
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
      areaMarkerListings,
      currentMapMarkerListings,
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
      isAreaRecenterButtonVisible,
      isAuthenticated,
      hasActiveAnonFilter,
      announcedBadgeText,
      /** Issue #2628 — the applied Buy/Rent intent (Map results heading/summary + MapFilterSheet). */
      intent,
    },
    mobile: { mobileListButton },
    regionGuide: {
      regionGuideVisible,
      resolvedRegionLabel,
      regionSelectNonce,
      regionOverviewMarkerKind,
      regionGuideRingActive,
    },
    drawing: {
      polygonDraftPhase,
      polygonDraftBlock,
      drawVertexCount,
      startDrawNonce,
      cancelDrawNonce,
      undoVertexNonce,
    },
    replaceScope: {
      isReplaceScopeConfirmOpen,
    },
    viewportSearch: {
      /** Issue #2015 — "Search this area" CTA dirty-state (AC1). */
      viewportSearchIsDirty: isViewportSearchDirty,
      /** Issue #2015 MUST-HAVE #2 — CTA eligibility gating (PR review 5085561270). */
      viewportSearchIsEligible: isViewportSearchEligible,
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
      // Issue #2724 (code-review follow-up) — root cause of the duplicate "Recenter on
      // Bangalore" / "Recenter on bangalore" buttons: `useAreasNavigationJourney`'s `node`
      // resolves to the synthetic city ROOT node (displayLabel from the backend, e.g.
      // "Bangalore") whenever no area/direction/cluster is actually selected — it is NEVER
      // null at the city-landing level. `getHierarchyExtent` (MapDiscovery.recenter.ts) gives
      // that ROOT node a real extent too (the union of all its children's bounds), so
      // `isSelectedNodeOutOfView` can be true for it exactly like a real selected area, and
      // this "area recenter" portal then renders a SECOND, redundant city-level recenter
      // button — on top of DiscoverMapCanvas's own unconditional "Recenter on {city}" button
      // (which reads the raw lowercase URL `city` slug, e.g. "bangalore" — the source of the
      // capitalization mismatch between the two). This recenter is meant for a genuinely
      // selected area/direction/cluster, never the whole-city fallback, so it must stay
      // suppressed for ROOT.
      recenter: {
        visible: isAreaRecenterButtonVisible,
        label: activeAreasNavigationJourney.node?.displayLabel,
        portalTarget: mapContainerRef.current,
      },
    },
  };
}

export type BuildMapSurfaceCommandsParams = {
  onAreaVisualClusterCameraIntent?: (bounds: CameraIntent['bounds'], center: [number, number]) => void;
  pageContextController: Pick<ReturnType<typeof useDiscoverPageContext>, 'navigate'>;
  pageStateController: Pick<
    ReturnType<typeof useDiscoverPageStateController>,
    | 'handlePolygonDrawn'
    | 'handlePolygonCleared'
    // Issue #2016 — J3.3 replace-confirmation dialog state.
    | 'isReplaceScopeConfirmOpen'
    | 'handleConfirmReplaceScope'
    | 'handleCancelReplaceScope'
    // Issue #2419 (PR-2) — draw-mode seam (see MapDrawingCommands).
    | 'polygonDraftPhase'
    | 'polygonDraftBlock'
    | 'drawVertexCount'
    | 'startDrawNonce'
    | 'cancelDrawNonce'
    | 'undoVertexNonce'
    | 'handleCancelDrawPolygon'
    | 'handleUndoDrawVertex'
    | 'handleRedrawPolygon'
    | 'handleRetryPolygonValidation'
    | 'handleDismissPolygonRejection'
    | 'handleDrawVertexCountChange'
    | 'handleDrawModeExit'
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
    'setHoveredNavigationNodeKey' | 'setFocusedClusterMemberAreaKeys' | 'autoAdvanceSelectNode'
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
  viewportTrackerController: Pick<
    ReturnType<typeof useDiscoverViewportTracker>,
    'handleBoundsChange' | 'handleUserCameraGesture'
  >;
  /** Issue #2015 — commits the live viewport as a VIEWPORT result scope (AC2/AC7). */
  viewportSearchController: Pick<ReturnType<typeof useDiscoverViewportSearch>, 'activate'>;
  markerController: Pick<
    ReturnType<typeof useDiscoverMarkerController>,
    | 'handlePopoverDismiss'
    | 'handleSelectMarkerListing'
    | 'handleMarkerClickWithPosition'
    | 'showMarkerInList'
  >;
  buildNavigationNodeHref?: (nodeKey: string) => string | null;
  clearSelectedListing: () => void;
  /**
   * Issue #2628 — the mobile Map "Filters" sheet's one canonical write command (the existing
   * handleFiltersChange/setFilters path List already uses, e.g. `buildPanelSurfaceModel.ts`'s own
   * `filters: { handleFiltersChange, ... }` command group). Deliberately OPTIONAL and a flat
   * top-level param, not folded into `pageStateController` — `useDiscoverPageStateController`
   * itself does not produce this value; it is composed one level up
   * (`useDiscoverPageComposition.ts`). Until the composition root passes it through, the Map
   * "Filters" pill/sheet stay mounted but inert (`DiscoverMapCanvas`'s own `onFiltersChange` prop
   * is equally optional and gates the pill's very presence — see that component).
   */
  handleFiltersChange?: (next: PropertyFilters) => void;
  /**
   * Issue #2711 — the matching canonical Buy/Rent intent command (city.ts's `setIntent`, the
   * SAME function `DiscoverControlBar.tsx` already passes as `IntentSelector`'s own
   * `onIntentChange`), reached through this same optional/inert-until-wired seam as
   * `handleFiltersChange` above so the Map "Filters" sheet's Apply can commit an intent switch
   * atomically instead of silently dropping it (the bug this issue fixes).
   */
  handleIntentChange?: (intent: DiscoverIntent, filtersOverride?: DiscoverUrlFilters) => void;
};

export function buildMapSurfaceCommands(
  params: BuildMapSurfaceCommandsParams,
): DiscoverMapSurfaceCommands {
  const {
    pageContextController: { navigate },
    pageStateController: {
      handlePolygonDrawn,
      handlePolygonCleared,
      // Issue #2016 — J3.3 replace-confirmation dialog state.
      handleConfirmReplaceScope,
      handleCancelReplaceScope,
      // Issue #2419 (PR-2) — draw-mode seam.
      handleCancelDrawPolygon,
      handleUndoDrawVertex,
      handleRedrawPolygon,
      handleRetryPolygonValidation,
      handleDismissPolygonRejection,
      handleDrawVertexCountChange,
      handleDrawModeExit,
      setMapZoom,
      setMapReady,
      handleCityChange,
    },
    mapDataController: { publishCameraIntent, publishClusterCameraIntent, publishMarkerClusterCameraIntent },
    geographyController: { handleAreaMarkersComputed },
    markerPopoverController: { handleStepMarkerListing },
    onAreaVisualClusterCameraIntent,
    navigationController: {
      setHoveredNavigationNodeKey,
      setFocusedClusterMemberAreaKeys,
      autoAdvanceSelectNode,
    },
    schoolController: { journeyCommands },
    interactionController: { handleAreaClusterClick },
    cameraController: { handleRecenterOnSelectedNode },
    regionGuideController: { dismissRegionGuide },
    overviewNavigationController: { handleOverviewAreaClick },
    mobilePresentationController: { handlePreviewSheetHeightChange },
    viewportTrackerController: { handleBoundsChange, handleUserCameraGesture },
    // Issue #2015 — commits the live viewport as a VIEWPORT result scope (AC2/AC7).
    viewportSearchController: { activate: activateViewportSearch },
    markerController: {
      handlePopoverDismiss,
      handleSelectMarkerListing,
      handleMarkerClickWithPosition,
      showMarkerInList,
    },
    buildNavigationNodeHref,
    clearSelectedListing,
    // Issue #2628 — see this param's doc comment above.
    handleFiltersChange,
    // Issue #2711 — see this param's doc comment above.
    handleIntentChange,
  } = params;

  return {
    camera: { publishCameraIntent, setMapZoom, handleBoundsChange, handleUserCameraGesture },
    // Issue #2628 — the mobile Map "Filters" sheet's one canonical write command.
    // Issue #2711 — plus `onIntentChange`, its matching canonical intent command.
    filters: { onFiltersChange: handleFiltersChange, onIntentChange: handleIntentChange },
    drawing: {
      handlePolygonDrawn,
      handlePolygonCleared,
      handleCancelDrawPolygon,
      handleUndoDrawVertex,
      handleRedrawPolygon,
      handleRetryPolygonValidation,
      handleDismissPolygonRejection,
      handleDrawVertexCountChange,
      handleDrawModeExit,
    },
    replaceScope: {
      // Issue #2016 — J3.3 replace-confirmation dialog state.
      handleConfirmReplaceScope,
      handleCancelReplaceScope,
    },
    viewportSearch: {
      // Issue #2015 — commits the live viewport as a VIEWPORT result scope (AC2/AC7).
      onActivateViewportSearch: activateViewportSearch,
    },
    navigation: {
      handleOverviewAreaClick,
      publishClusterCameraIntent,
      onAreaVisualClusterCameraIntent,
      autoAdvanceSelectNode,
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
