import { useRef } from 'react';
import type { ReactNode, RefObject, Dispatch, SetStateAction } from 'react';
import { useDiscoverActions, useDiscoverNav, useDiscoverViewport } from '@/features/discover/context/useDiscoverContext';
import { PropertyMap, type PropertyListingWithImages } from '@/components/map/PropertyMap';
import { Card } from '@/components/ui/card';
import { DiscoverMapStatusHints } from '@/components/discover/DiscoverMapStatusHints';
import { DiscoverMapContextOverlay } from '@/components/discover/DiscoverMapContextOverlay';
import { DiscoverMapLegend } from '@/components/discover/DiscoverMapLegend';
import { RegionGuidanceCard, type RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';
import { ExploreMapPanel } from '@/components/map/ExploreMapPanel';
import { DiscoverMapCountBadge } from '@/components/discover/DiscoverMapCountBadge';
import { MapStatsBar, MarkersTruncationNotice } from '@/components/discover/MapStatsBar';
import { MapEmptyGuidance } from '@/components/discover/MapEmptyGuidance';
import { DiscoverMapMarkerPopover } from '@/components/discover/DiscoverMapMarkerPopover';
import { clampSchoolRadiusKm, type PropertyFilters, type PropertyListing, type PropertyImage } from '@/hooks/usePropertyListings';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
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
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import type { SchoolsByAreaResponse } from '@/hooks/useSchoolsByArea';
import type { DiscoverBadgeResult } from '@/features/discover/presentation/discoverBadge';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

/**
 * Issue #1824 Slice S11a — the map-half return-tree region (mapContainerRef
 * div wrapping PropertyMap + its ~12 overlay children), lifted VERBATIM out
 * of MapDiscovery.tsx (@ 838f620e L1850-2169). Every value the JSX reads is
 * received as a PROP — no derived-const/handler/hook/badge-helper moves (see
 * docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s11-design.md).
 *
 * S8 BADGE-FORK GUARD (preserved) — this component receives discoverBadge +
 * every copy string (areaResultSummaryText/groupSelectedBadgeCopy/
 * fallbackBadgeCopy/schoolRadiusPillNoun) as PROPS ONLY. It never imports
 * formatDiscoverBadgeCopy / deriveSchoolRadiusPillNoun / hasActiveAnonPropertyFilter.
 *
 * The inline-computed prop expressions below (schoolCircle, agriGroupListings,
 * focusBounds, focusedGroupAreas, enableAreaMarkerDegradation, selectedAreaKey,
 * schoolFocusRadiusKm, areaRestoreBbox, sectorOverlay, the schoolRadiusChrome/
 * variants/schoolRadiusHint objects) recompute from the raw props on every
 * render — IDENTICAL to their pre-extraction behaviour inline in MapDiscovery
 * — this component is NOT React.memo'd (render-neutral per the plan's
 * [performance_risk_assessment] default hypothesis).
 */
export interface DiscoverMapCanvasProps {
  // ── Root div (L1850-1854) ──
  mapContainerRef: RefObject<HTMLDivElement | null>;
  markerPixelPos: { x: number; y: number } | null;
  handlePopoverDismiss: () => void;

  // ── DiscoverMapStatusHints#1 (L1861) ──
  showLoader: boolean;

  // ── error branch (L1862) ──
  error: Error | null;

  // ── PropertyMap (L1870-1995) ──
  currentMapMarkerListings: PropertyListingWithImages[];
  agriGroupFocusBounds: [[number, number], [number, number]] | null;
  activeFocusBounds: [[number, number], [number, number]] | null;
  selectedRegion: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | null;
  selectedMaxKm: 10 | 25 | 50 | 100 | null;
  filteredAgriListings: AgriMapListingItem[] | null;
  filters: PropertyFilters;
  isLandingState: boolean;
  handlePolygonDrawn: (polygon: [number, number][]) => void;
  handlePolygonCleared: () => void;
  selectedSchool: SchoolResult | null;
  memoizedInitialCenter: [number, number] | undefined;
  cityCenter: [number, number] | undefined;
  cityZoom: number | undefined;
  overviewAreas: AreaPoint[];
  handleOverviewAreaClick: (area: AreaPoint) => void;
  publishCameraIntent: (area: AreaPoint) => void;
  cameraIntent: CameraIntent | null;
  focusedGroupAreas: string[] | undefined;
  /** AREA_LAYER_MAX_ZOOM — stays a page module-const; passed through as a prop. */
  areaLayerMaxZoom: number;
  selectedArea: AreaPoint | null;
  areaSearchMatchKeys: string[] | undefined;
  hoveredAreaKeyForMap: string | null;
  publishClusterCameraIntent: (bounds: CameraIntent['bounds'], center: [number, number]) => void;
  /**
   * Issue #1762 — sibling producer to `publishClusterCameraIntent` for a
   * splittable LISTING-marker cluster tap (the leaflet.markercluster
   * residential layer, NOT an area cluster). Threaded straight to
   * `PropertyMap`'s `onMarkerClusterCameraIntent` prop, which forwards it to
   * `MarkerClusterLayer`'s clusterclick/clusterkeypress handler. Optional
   * (unlike `publishClusterCameraIntent`) purely so existing test fixtures
   * that predate this prop (outside this PR's scope_lock) keep compiling
   * unchanged; the real MapDiscovery.tsx call site always supplies it.
   */
  publishMarkerClusterCameraIntent?: (bounds: CameraIntent['bounds'], center: [number, number]) => void;
  handleAreaClusterClick: (cluster: AreaMarkerClusterInfo) => void;
  handleAreaMarkersComputed: (shownCount: number, totalCount: number) => void;
  /**
   * Issue #1956 PR 2 (Slice 3, map half) — the ONE `useAreasNavigationJourney`
   * result MapDiscovery resolved, threaded through unchanged (AC3.4/AC3.9/T3
   * — same reference as the right panel receives). The mount gate itself is
   * computed HERE from `nav`, mirroring `DiscoverRightPanelContainer`'s own
   * `showAreasNavigationJourney` derivation exactly, so the map and panel can
   * never disagree about whether the canonical Areas journey is active.
   * Optional (unlike the panel container's version of this prop) purely so
   * existing test fixtures that predate this prop keep compiling unchanged;
   * MapDiscovery's real call site always supplies it.
   */
  areasNavigationJourney?: UseAreasNavigationJourneyResult;
  /**
   * Issue #1956 PR 2 (Slice 3, pass 4, AC3.9) — the ephemeral hover/focus
   * node_key MapDiscovery owns alongside `areasNavigationJourney` (same
   * lifting rationale: ONE piece of state, threaded to both the map's
   * `AreaDestinationMarkerLayer` and the right panel's `NavigationChildCard`
   * list so they highlight the SAME child by stable node_key). Never written
   * to the URL — no history entry, no camera fit, purely a view-state sync.
   */
  hoveredNavigationNodeKey?: string | null;
  onNavigationNodeHoverChange?: (nodeKey: string | null) => void;
  /**
   * Issue #1956 PR 3 (bounded state-lift, AC4.12/AC4.5) — the ONE focused
   * visual-AREA-cluster identity MapDiscovery owns alongside
   * `hoveredNavigationNodeKey` (same lifting rationale: ONE piece of state,
   * threaded to both the map's `AreaDestinationMarkerLayer` and the right
   * panel's `DiscoverAreasJourneyPanel` so a cluster click on either surface
   * can never disagree on the focused member set). Never written to the
   * URL — no history entry, no camera fit, no node= write.
   */
  focusedClusterMemberAreaKeys?: readonly string[] | null;
  onClusterFocusChange?: (memberAreaKeys: readonly string[] | null) => void;
  /**
   * REQUIRED CHANGE 6 (review fix, AC4.4/AC4.5) — fired ONLY for a visual
   * AREA cluster click under the canonical Areas journey. Threaded straight
   * to `PropertyMap`'s prop of the same name (which threads it to
   * `AreaDestinationMarkerLayer`), reusing the SAME
   * `publishClusterCameraIntent` producer MapDiscovery already passes as
   * `publishClusterCameraIntent` below — see that prop's doc for why sharing
   * one producer across the legacy/canonical paths is safe.
   */
  onAreaVisualClusterCameraIntent?: (bounds: CameraIntent['bounds'], center: [number, number]) => void;
  /**
   * Issue #1956 PR 2 (Slice 5) — pure href builder for the canonical Areas
   * map breadcrumb's ancestor crumbs (`urlActions.buildNodeHref`, unchanged).
   * Forwarded to `DiscoverMapContextOverlay`'s `AreasBreadcrumbTrail` branch;
   * unused whenever `areasNavigationJourney.node` is null.
   */
  buildNavigationNodeHref?: (nodeKey: string) => string | null;
  schoolZoneLabels: ZoneLabelPoint[];
  setMapZoom: Dispatch<SetStateAction<number>>;
  handleBoundsChange: (bbox: [number, number, number, number]) => void;
  panToArea: AreaPoint | null;
  /**
   * PR #2128 review cycle 4/final (Finding 2, issue #1823) — bottom-ONLY
   * occlusion (px) added to AreaPanner's `paddingBottomRight` fitBounds
   * option (Leaflet's real asymmetric-padding API — a single
   * `padding: [x, y]` tuple is NOT directional and would apply to both top
   * and bottom). MapDiscovery.tsx reserves this PROACTIVELY for any
   * mobile-Map state where `isMarkerPopoverEligible` allows a marker tap to
   * open the compact listing-preview sheet (a superset of the sheet's
   * actual render gate — safe because it never under-reserves), not
   * reactively on whether that sheet happens to be open right now, so the
   * authoritative fit already keeps its framed geography clear of where the
   * sheet would render, before any marker tap could open it. Threaded
   * straight to `PropertyMap`'s prop of the same name. Optional/defaults to
   * 0 in PropertyMap so every existing test fixture keeps compiling
   * unchanged.
   */
  bottomOcclusionPx?: number;
  /**
   * Issue #2129 (code-reviewer cycle 1, Finding 1) — the REACTIVE
   * counterpart to `bottomOcclusionPx` above. 0 unless the compact preview
   * sheet is ACTUALLY selected/rendered right now (MapDiscovery.tsx:
   * `mobileMapOpen && selectedListingPreview`, the same condition gating
   * the sheet's own render) — see PropertyMap.tsx's prop of the same name
   * for why a persistent viewport clip must use this, not
   * bottomOcclusionPx. Threaded straight through to PropertyMap. Optional/
   * defaults to 0 so every existing test fixture keeps compiling unchanged.
   */
  previewOcclusionPx?: number;
  journeyView: DiscoverJourneyTransitionsView;
  setMapReady: Dispatch<SetStateAction<boolean>>;
  schools: SchoolResult[];
  showSchoolMarkers: boolean;
  journeyCommands: DiscoverJourneyTransitionsCommands;
  schoolsQuery: UseInfiniteQueryResult<InfiniteData<SchoolsByAreaResponse>, Error>;
  schoolFocusTick: number;
  selectedSchoolLat: number | undefined;
  selectedSchoolLon: number | undefined;
  schoolMarkerFocusTick: number;
  schoolMarkerPositions: Array<{ lat: number; lon: number }>;
  areaRestoreArea: DiscoverArea | null;
  isAgriJourney: boolean;
  selectedMarkerListing: PropertyListingWithImages | null;
  handleSelectMarkerListing: (listing: PropertyListingWithImages | null) => void;
  hoveredListingId: string | null;
  handleMarkerClickWithPosition: (pos: { x: number; y: number }) => void;

  // ── DiscoverMapContextOverlay (L2003-2011) ──
  isAreaFirstCityLanding: boolean;
  showSchoolBreadcrumb: boolean;
  areaJourneySegments: DiscoverMapCrumb[];
  schoolJourneySegments: DiscoverMapCrumb[];
  focusedGroup: AreaGroup | null;
  city: string;
  /**
   * PR #2141 fix cycle 2 — the real mobile "List" toggle button, owned by
   * MapDiscovery.tsx, threaded straight through to
   * `DiscoverMapContextOverlay` unchanged (this component adds no logic of
   * its own around it). `undefined`/`null` on desktop and whenever the
   * mobile Map overlay isn't open.
   */
  mobileListButton?: ReactNode;

  // ── DiscoverMapLegend#1 schoolRadiusChrome (L2016) ──
  schoolRadiusOverlay: boolean;

  // ── CitySelect gate (L2027-2029) ──
  resolvedPanelContent: DiscoverPanelContent;
  isSelectedGroupState: boolean;
  handleCityChange: (newCity: string) => void;

  // ── RegionGuidanceCard (L2041-2049) ──
  regionGuideVisible: boolean;
  resolvedRegionLabel: string | null;
  regionSelectNonce: number;
  regionOverviewMarkerKind: RegionOverviewMarkerKind;
  regionGuideRingActive: boolean;
  prefersReducedMotion: boolean;
  dismissRegionGuide: () => void;

  // ── DiscoverMapLegend#2 variants (L2055-2071) ──
  isRegionOverview: boolean;
  regionOverviewShortLabel: string | null;
  areaMarkerListings: (PropertyListing & { images?: PropertyImage[] })[];

  // ── sr-only announce (L2082-2084) ──
  announcedBadgeText: string;

  // ── DiscoverMapCountBadge (L2090-2109) ──
  discoverBadge: DiscoverBadgeResult;
  areaResultSummaryText: string | null;
  /** Page-computed formatDiscoverBadgeCopy() — S8 badge-fork guard. */
  groupSelectedBadgeCopy: string;
  /** Page-computed formatDiscoverBadgeCopy() — S8 badge-fork guard. */
  fallbackBadgeCopy: string;
  isAreaFirstSelectedAreaState: boolean;
  schoolRadiusActive: boolean;
  /** Page-computed deriveSchoolRadiusPillNoun(urlState.intent) — S8 badge-fork guard. */
  schoolRadiusPillNoun: 'homes' | 'rentals';
  schoolFirstAreaSchoolCount: number | null;
  schoolFirstZoneSchoolCount: number | null;
  schoolFirstLandingSchoolCount: number | null;
  cityTotal: number;

  // ── DiscoverMapStatusHints#2 schoolRadiusHint (L2120-2127) ──
  isAuthenticated: boolean;
  schoolRadiusHasMore: boolean;
  schoolListings: DiscoverCityListingItem[];
  /** FLAG-A — page-computed hasActiveAnonPropertyFilter(filters) boolean. */
  hasActiveAnonFilter: boolean;

  // ── MarkersTruncationNotice (L2137-2140) ──
  markersTruncated: boolean;
  markersReturnedElements: number | undefined;
  markersTotalFilteredElements: number | undefined;

  // ── MapEmptyGuidance (L2143-2150) ──
  isLoading: boolean;
  mapZoom: number;
  /** Issue #2089 — group-results (#1597) or bounded-Browse node-listings state.
   *  Neither state has a single `selectedArea` (both can span multiple member
   *  areas), so `hasAreaSelected` alone under-counts them and the anon
   *  "Select an area…or sign in" prompt incorrectly renders over an already
   *  correctly-scoped set of markers. */
  isBoundedBrowseState: boolean;

  // ── DiscoverMapMarkerPopover (L2157-2168) ──
  isMarkerPopoverEligible: boolean;
  markerPopoverStepper: MarkerPopoverStepper | null;
  navigate: (path: string) => void;
  handleStepMarkerListing: (direction: -1 | 1) => void;
  showMarkerInList: (id: string) => void;
}

export function DiscoverMapCanvas({
  mapContainerRef,
  markerPixelPos,
  handlePopoverDismiss,
  showLoader,
  error,
  currentMapMarkerListings,
  agriGroupFocusBounds,
  activeFocusBounds,
  selectedRegion,
  selectedMaxKm,
  filteredAgriListings,
  filters,
  isLandingState,
  handlePolygonDrawn,
  handlePolygonCleared,
  selectedSchool,
  memoizedInitialCenter,
  cityCenter,
  cityZoom,
  overviewAreas,
  handleOverviewAreaClick,
  publishCameraIntent,
  cameraIntent,
  focusedGroupAreas,
  areaLayerMaxZoom,
  selectedArea,
  areaSearchMatchKeys,
  hoveredAreaKeyForMap,
  publishClusterCameraIntent,
  publishMarkerClusterCameraIntent,
  handleAreaClusterClick,
  handleAreaMarkersComputed,
  areasNavigationJourney,
  hoveredNavigationNodeKey,
  onNavigationNodeHoverChange,
  focusedClusterMemberAreaKeys,
  onClusterFocusChange,
  onAreaVisualClusterCameraIntent,
  buildNavigationNodeHref,
  schoolZoneLabels,
  setMapZoom,
  handleBoundsChange,
  panToArea,
  bottomOcclusionPx,
  previewOcclusionPx,
  journeyView,
  setMapReady,
  schools,
  showSchoolMarkers,
  journeyCommands,
  schoolsQuery,
  schoolFocusTick,
  selectedSchoolLat,
  selectedSchoolLon,
  schoolMarkerFocusTick,
  schoolMarkerPositions,
  areaRestoreArea,
  isAgriJourney,
  selectedMarkerListing,
  handleSelectMarkerListing,
  hoveredListingId,
  handleMarkerClickWithPosition,
  isAreaFirstCityLanding,
  showSchoolBreadcrumb,
  areaJourneySegments,
  schoolJourneySegments,
  focusedGroup,
  city,
  mobileListButton,
  schoolRadiusOverlay,
  resolvedPanelContent,
  isSelectedGroupState,
  handleCityChange,
  regionGuideVisible,
  resolvedRegionLabel,
  regionSelectNonce,
  regionOverviewMarkerKind,
  regionGuideRingActive,
  prefersReducedMotion,
  dismissRegionGuide,
  isRegionOverview,
  regionOverviewShortLabel,
  areaMarkerListings,
  announcedBadgeText,
  discoverBadge,
  areaResultSummaryText,
  groupSelectedBadgeCopy,
  fallbackBadgeCopy,
  isAreaFirstSelectedAreaState,
  schoolRadiusActive,
  schoolRadiusPillNoun,
  schoolFirstAreaSchoolCount,
  schoolFirstZoneSchoolCount,
  schoolFirstLandingSchoolCount,
  cityTotal,
  isAuthenticated,
  schoolRadiusHasMore,
  schoolListings,
  hasActiveAnonFilter,
  markersTruncated,
  markersReturnedElements,
  markersTotalFilteredElements,
  isLoading,
  mapZoom,
  isBoundedBrowseState,
  isMarkerPopoverEligible,
  markerPopoverStepper,
  navigate,
  handleStepMarkerListing,
  showMarkerInList,
}: DiscoverMapCanvasProps) {
  // Issue #1953 (build step 2) — consumes the DiscoverProvider facade
  // directly rather than receiving urlState/urlActions as props (D2 prop
  // migration rule: these are the two facade-owned props dropped from the
  // MapDiscovery call site).
  const nav = useDiscoverNav();
  const viewport = useDiscoverViewport();
  const urlActions = useDiscoverActions();
  // Issue #1956 PR 6 (final cutover, RULED A1 MINIMAL, restored by the
  // [rulings.oq_a_v2] rework after the superseded Option A guard) — the SAME
  // journey==='area-first' condition DiscoverRightPanelContainer evaluates
  // to decide whether DiscoverAreasJourneyPanel (rather than the legacy
  // panel) is mounted. Recomputed here (not threaded as a prop) so the two
  // call sites can never drift apart from independently-passed booleans. The
  // preview-capability + areasPreview dual gate is removed at cutover, and no
  // legacy-routing exception survives here — see
  // `legacyAreaContextGuard.ts`'s doc for why `hasLegacyAreaContext` moved to
  // being a click-time trigger (`DiscoverRightPanelContainer.tsx`'s
  // `handleSelectJourney`) rather than a rendering gate. This is one of THREE
  // identical gate sites (this file, DiscoverRightPanelContainer.tsx,
  // MapDiscovery.tsx) — the triplication below (this comment) is deliberate:
  // the map and panel must never disagree about whether the canonical Areas
  // journey is active, so each site recomputes the SAME condition rather
  // than trusting a threaded boolean.
  const isSchoolsNavNodeLevel = nav.journey === 'school-first' && !nav.areaKey && !nav.schoolId;
  const showAreasNavigationDestinations = (nav.journey === 'area-first' || isSchoolsNavNodeLevel) && !nav.nodeListings;

  // Issue #2089 — Leaflet's own click-after-drag suppression only covers
  // Leaflet's INTERNAL 'click' event system; it does not stop the browser's
  // real native `click` DOM event (which still fires on mouseup after a
  // pan/zoom drag) from bubbling up past the Leaflet container to THIS
  // wrapping div's onClick. Without a guard, that spurious click was
  // wrongly read as "user clicked the map background to dismiss the
  // popover" — clearing selectedMarkerListing/markerPixelPos AND (via
  // handlePopoverDismiss's clearSelectedListing() call) the shared `listing`
  // URL param, closing the mobile listing-preview sheet on every pan.
  //
  // A prior attempt gated the dismiss on "was there a moveend/zoomend
  // (onViewportChange) in the last 400ms". Real-browser instrumentation
  // (mousedown/dragstart/dragend/moveend/native-click timestamps captured
  // during an actual drag gesture) proved that guard structurally cannot
  // work: Leaflet's default inertial panning fires `dragend` and the
  // trailing native `click` back-to-back on mouseup, but defers `moveend`
  // until the inertia animation finishes — 200-350ms LATER, after the click
  // (and this dismiss handler) has already run. `lastViewportChangeAtRef`
  // was therefore still stamped from an earlier, unrelated viewport change
  // and outside the window, so the guard never engaged for a real drag.
  //
  // Fix: detect "was this click the tail of a drag" directly from the
  // gesture's own pixel movement — record the pointer's down position on
  // this div and compare it to the click's own coordinates (a real native
  // `click` event's clientX/clientY reflect the mouseup/touchend position).
  // This is independent of Leaflet's internal event timing/inertia entirely,
  // so there is no race: a genuine stationary tap has ~0px of movement and
  // still dismisses; a drag of any length is rejected.
  const backgroundPointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const BACKGROUND_TAP_DRAG_THRESHOLD_PX = 10;

  const handleBackgroundPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const point = 'touches' in e ? e.touches[0] : e;
    if (point) {
      backgroundPointerDownPosRef.current = { x: point.clientX, y: point.clientY };
    }
  };

  // Issue #2089 code-review fix — mousedown/touchstart is only ever cleared
  // inside handleBackgroundClick below, so a gesture that never produces a
  // matching `click` (pointer released off this element, an interrupted touch
  // gesture, etc.) leaves a stale down-position that can wrongly misclassify
  // the NEXT genuine tap as a drag-tail. Clear it here too, deferred one tick
  // so a same-gesture `click` (dispatched synchronously right after
  // mouseup/touchend, before this macrotask runs) still reads the position
  // first — this only clears state for gestures where no click ever lands.
  const clearBackgroundPointerDownPos = () => {
    setTimeout(() => {
      backgroundPointerDownPosRef.current = null;
    }, 0);
  };

  const handleBackgroundClick = (e: React.MouseEvent) => {
    const downPos = backgroundPointerDownPosRef.current;
    backgroundPointerDownPosRef.current = null;
    if (downPos) {
      const dx = e.clientX - downPos.x;
      const dy = e.clientY - downPos.y;
      if (Math.hypot(dx, dy) > BACKGROUND_TAP_DRAG_THRESHOLD_PX) {
        // This click is the tail end of a pan/zoom drag, not a genuine
        // stationary tap on the map background — leave the popover open.
        return;
      }
    }
    handlePopoverDismiss();
  };

  return (
    <div
      ref={mapContainerRef}
      className="lg:w-1/2 h-64 lg:h-full relative order-1 lg:order-1"
      style={{ background: 'hsl(var(--map-bg))' }}
      onMouseDown={handleBackgroundPointerDown}
      onTouchStart={handleBackgroundPointerDown}
      onMouseUp={clearBackgroundPointerDownPos}
      onTouchEnd={clearBackgroundPointerDownPos}
      onClick={
      // a3 — background click dismisses the marker popover. stopPropagation is applied
      // inside the card itself so clicks inside the card do not trigger this.
      // Issue #2089 — see handleBackgroundClick above: a drag-tail click is
      // rejected via pixel-delta, a genuine stationary tap still dismisses.
      markerPixelPos != null ? handleBackgroundClick : undefined
    }>
      {/* Issue #1824 Slice S8 — loader overlay extracted to DiscoverMapStatusHints.
          The error-card branch below is DELIBERATELY left inline: it is the
          false-branch alternative of PropertyMap in this same ternary, and
          PropertyMap is a forbidden/already-wired child that must stay
          page-owned verbatim (see the component's docstring for the full
          rationale). */}
      <DiscoverMapStatusHints showLoader={showLoader} />
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Card className="p-6 text-center max-w-sm">
            <p className="text-destructive font-medium">Failed to load listings</p>
            <p className="text-sm text-muted-foreground mt-1">Please try again later</p>
          </Card>
        </div>
      ) : (
        <PropertyMap
          listings={currentMapMarkerListings}
          focusBounds={agriGroupFocusBounds ?? activeFocusBounds}
          agriGroupListings={(selectedRegion && selectedMaxKm != null) ? filteredAgriListings : null}
          polygon={filters.polygon}
          // Issue #1588 — hide the polygon draw tool on the public landing
          // (guided-entry). PropertyMap only mounts DrawControl when BOTH handlers
          // are present, so passing undefined here removes the control on the landing
          // while preserving area-draw search in every drill-down state.
          onPolygonDrawn={isLandingState ? undefined : handlePolygonDrawn}
          onPolygonCleared={isLandingState ? undefined : handlePolygonCleared}
          schoolCircle={selectedSchool ? {
            lat: selectedSchool.latitude, lon: selectedSchool.longitude,
            // Issue #1210: clamp so the drawn circle reflects the effective (>=1 km) radius.
            radiusKm: clampSchoolRadiusKm(filters.schoolRadiusKm ?? DEFAULT_SCHOOL_RADIUS_KM), name: selectedSchool.name,
          } : undefined}
          initialCenter={memoizedInitialCenter}
          initialZoom={viewport?.zoom}
          // Issue #2125 — POP-restoration guard (URLViewportController). nav is
          // DiscoverNavContextValue = Omit<DiscoverUrlState, 'viewport'>, which
          // retains historyAction ('POP' | 'PUSH' | 'REPLACE' | undefined) from
          // useNavigationType(); same field useDiscoverCameraOrchestration.ts
          // already reads via urlState.historyAction for the identical guard.
          historyAction={nav.historyAction}
          cityCenter={cityCenter}
          cityZoom={cityZoom}
          areas={overviewAreas}
          onAreaClick={handleOverviewAreaClick}
          // Issue #1801 — camera-navigation intent path. AreaMarkerLayer's
          // full-pin click handlers fire this synchronously (never the
          // dots/cluster handlers); publishCameraIntent derives the
          // CameraIntent and MapController is the sole consumer/camera
          // owner. Independent of handleOverviewAreaClick's scope-change
          // branching below — every area-pin click used to move the
          // camera before this issue, regardless of which branch fires.
          onAreaCameraIntent={publishCameraIntent}
          cameraIntent={cameraIntent}
          focusedGroupAreas={mapZoom <= areaLayerMaxZoom ? focusedGroupAreas : undefined}
          // Issue #1798 PR-B — area-marker density degradation. Gated on the SAME
          // condition as focusedGroupAreas above (a dense group of member areas is
          // focused, at/below the area-marker zoom cutoff) — this is the shared
          // area-first/school-first "dense group selected" seam per Stage-A evidence
          // (focusedGroupAreas is derived from urlState.groupId alone, journey-agnostic).
          enableAreaMarkerDegradation={mapZoom <= areaLayerMaxZoom && !!focusedGroupAreas}
          selectedAreaKey={selectedArea?.areaKey ?? nav.areaKey ?? null}
          // Issue #1798 PR-B (Unit D) — panel↔map plumbing. areaSearchMatchKeys forces
          // matching areas to full labelled pins as the user types (no camera move —
          // this only affects AreaMarkerLayer's bucketing, never a panner tick).
          // hoveredAreaKey mirrors hoveredListingId's ephemeral-state pattern above.
          // onAreaMarkersComputed feeds the panel's "Showing X of N areas" note.
          areaSearchMatchKeys={areaSearchMatchKeys}
          hoveredAreaKey={hoveredAreaKeyForMap}
          // Issue #1806 (FIX-4/FIX-5) — area-cluster click wiring. Previously
          // onAreaClusterClick was threaded PropertyMap → AreaMarkerLayer but
          // never wired here, so a cluster click's payload was silently
          // dropped and the layer's own direct map.fitBounds(maxZoom:16) was
          // the ONLY thing that happened — landing the user above
          // AREA_LAYER_MAX_ZOOM and producing the reported empty map.
          // onAreaClusterCameraIntent routes a splittable click's camera
          // move through the SAME cameraIntent stream as onAreaCameraIntent
          // (shared seq ref, always framing='overview', maxZoom 12 via
          // MapController's unmodified 'overview' branch — never the
          // removed maxZoom:16 fit). onAreaClusterClick highlights + scrolls
          // the member rows in the panel for BOTH splittable and
          // non-splittable clicks (the panel note is harmless when the
          // camera also moved); the camera itself never moves for a
          // non-splittable click.
          onAreaClusterCameraIntent={publishClusterCameraIntent}
          onAreaClusterClick={handleAreaClusterClick}
          onAreaMarkersComputed={handleAreaMarkersComputed}
          areasNavigationJourney={areasNavigationJourney}
          hoveredNavigationNodeKey={hoveredNavigationNodeKey}
          onNavigationNodeHoverChange={onNavigationNodeHoverChange}
          focusedClusterMemberAreaKeys={focusedClusterMemberAreaKeys}
          onClusterFocusChange={onClusterFocusChange}
          onAreaVisualClusterCameraIntent={onAreaVisualClusterCameraIntent}
          showAreasNavigationDestinations={showAreasNavigationDestinations}
          schoolZoneLabels={isSchoolsNavNodeLevel ? [] : schoolZoneLabels}
          onSelectZone={(groupId) => urlActions.selectGroup(groupId)}
          onZoomChange={setMapZoom}
          onViewportChange={urlActions.reportViewport}
          onBoundsChange={handleBoundsChange}
          panToArea={panToArea}
          bottomOcclusionPx={bottomOcclusionPx}
          previewOcclusionPx={previewOcclusionPx}
          resetMapTick={journeyView.composedResetMapTick}
          onReady={() => setMapReady(true)}
          journey={nav.journey}
          selectedSchool={selectedSchool}
          schools={schools}
          showSchoolMarkers={showSchoolMarkers}
          onSelectSchool={journeyCommands.selectSchoolById}
          schoolsIsLoading={schoolsQuery.isLoading}
          schoolsIsError={schoolsQuery.isError}
          schoolsError={schoolsQuery.error}
          schoolFocusTick={schoolFocusTick}
          schoolFocusLat={selectedSchoolLat}
          schoolFocusLon={selectedSchoolLon}
          schoolFocusRadiusKm={(() => {
            // Issue #1210: clamp so the auto-zoom fits the effective (>=1 km) circle.
            const r = nav.radiusKm ?? filters.schoolRadiusKm;
            return r != null ? clampSchoolRadiusKm(r) : r;
          })()}
          schoolMarkerFocusTick={schoolMarkerFocusTick}
          schoolMarkerPositions={schoolMarkerPositions}
          areaRestoreTick={journeyView.areaRestoreTick}
          areaRestoreLat={areaRestoreArea?.geoCenterLat}
          areaRestoreLon={areaRestoreArea?.geoCenterLon}
          areaRestoreBbox={
            areaRestoreArea?.minLat != null &&
            areaRestoreArea?.minLon != null &&
            areaRestoreArea?.maxLat != null &&
            areaRestoreArea?.maxLon != null
              ? [[areaRestoreArea.minLat, areaRestoreArea.minLon], [areaRestoreArea.maxLat, areaRestoreArea.maxLon]]
              : undefined
          }
          cityRestoreTick={journeyView.cityRestoreTick}
          cityRestoreCenter={cityCenter}
          cityRestoreZoom={cityZoom}
          isAgriMode={isAgriJourney}
          selectedPolygonListing={selectedMarkerListing}
          onSelectListing={handleSelectMarkerListing}
          mapZoom={mapZoom}
          // Issue #1429 — sector overlay: only shown when both region + maxKm are set
          // and journey is agri-first. PropertyMap gates on sectorOverlay presence.
          sectorOverlay={
            isAgriJourney && selectedRegion && selectedMaxKm != null
              ? {
                  directionCode: selectedRegion,
                  maxKm: selectedMaxKm,
                }
              : null
          }
          // Issue #1547 — copper selected-marker (URL-driven) + ephemeral hover highlight.
          // selectedListingId = URL param (persistent selection from marker click).
          // hoveredListingId = ephemeral React state (resets on mouseleave/blur, never URL).
          // Both flow only to MarkerClusterLayer visual — never to MapController (no flyTo).
          selectedListingId={nav.selectedListing}
          hoveredListingId={hoveredListingId}
          onMarkerClickWithPosition={handleMarkerClickWithPosition}
          // Issue #1762 — listing-cluster tap fit-to-members. See this
          // component's `publishMarkerClusterCameraIntent` prop doc above.
          onMarkerClusterCameraIntent={publishMarkerClusterCameraIntent}
        />
      )}

      {/* Top-left context overlay. For school-first drill-down states (zone / area /
          school selected), show the progressively-resolved journey breadcrumb
          (City › Zone › Area › School); otherwise the generic area indicator.
          Rendering one OR the other avoids a duplicate breadcrumb.
          Issue #1824 Slice S8 — extracted to DiscoverMapContextOverlay. */}
      <DiscoverMapContextOverlay
        isAreaFirstCityLanding={isAreaFirstCityLanding}
        showSchoolBreadcrumb={showSchoolBreadcrumb}
        areaJourneySegments={areaJourneySegments}
        schoolJourneySegments={schoolJourneySegments}
        selectedArea={selectedArea}
        focusedGroup={focusedGroup}
        city={city}
        // Issue #1956 PR 2 (Slice 5) — the SAME resolved node the map markers
        // and right panel already consume (AC3.4/AC3.9/T3 identity), never a
        // re-derived projection.
        canonicalNavigationNode={areasNavigationJourney?.node ?? null}
        buildNavigationNodeHref={buildNavigationNodeHref}
        mobileListButton={mobileListButton}
      />

      {/* Discover map marker redesign — "EXPLORE THE MAP" guidance card, shown
          only at the bare city landing (5 macro-region bubbles: no scope and
          no journey picked yet). Sits beneath the top-left city chip rendered
          by DiscoverMapContextOverlay just above. Never shown once a region
          is picked (RegionGuidanceCard takes over) or a journey is chosen. */}
      {isLandingState && !nav.scope && !nav.journey && <ExploreMapPanel />}

      {/* Radius legend — bottom-left, raised above the Leaflet zoom control (bottomleft).
          Only the selected-school radius state; swatches match the real map markers/ring.
          Issue #1824 Slice S8 — extracted to DiscoverMapLegend (chrome call). */}
      <DiscoverMapLegend schoolRadiusChrome={schoolRadiusOverlay ? { schoolRadiusKm: filters.schoolRadiusKm } : null} />

      {/* City select — REMOVED in #1953 build step 6 (ownership invariant).
          Previously shown top-right for every drill-down state except
          guided-entry/selected-group/area-first-city-landing/area-selected
          (Issues #1588/#1595/#1607/#1606). It co-rendered with the persistent
          DiscoverControlBar in every one of those states — a real visible
          duplicate city-selection control, not just a test artifact. The
          persistent control bar is now the SOLE city-selection control on
          /discover. `handleCityChange` is no longer read by this component's
          JSX — city changes route through DiscoverControlBar's facade-driven
          `changeCity`, which reaches the identical end state via the existing
          urlState-reactive effects in useDiscoverPageState.ts (city-sync +
          areaKey-clear effects) — confirmed by reading, not assumed; nothing
          needed to move. */}

      {/* Issue #1808 — region-overview map guidance card. Region-overview
          is a sub-state of 'guided-entry' (scope set, journey null). Never
          covers the map centre. Presentational
          only — no camera/URL writes. Card + legend render for every
          source (map/panel/deeplink, AC5); only the ring/nudge are gated
          to a real map/panel pick via regionGuideRingActive. */}
      {regionGuideVisible && resolvedRegionLabel && (
        <RegionGuidanceCard
          key={regionSelectNonce}
          regionName={resolvedRegionLabel}
          markerKind={regionOverviewMarkerKind}
          pulseEligible={regionGuideRingActive}
          prefersReducedMotion={prefersReducedMotion}
          onDismiss={dismissRegionGuide}
        />
      )}

      {/* Issue #1824 Slice S8 — the 7-variant legend switch (area-count,
          region-aware, marker-meaning, selected-group, city-landing, agri,
          school) extracted to DiscoverMapLegend (variants call). */}
      <DiscoverMapLegend
        variants={{
          schoolRadiusOverlay,
          resolvedPanelContent,
          overviewAreas,
          isRegionOverview,
          regionGuideVisible,
          regionOverviewShortLabel,
          regionOverviewMarkerKind,
          isAreaFirstSelectedAreaState,
          areaMarkerListings,
          isSelectedGroupState,
          isAreaFirstCityLanding,
          journey: nav.journey,
          selectedLocality: nav.selectedLocality,
          selectedRegion,
        }}
      />

      {/* "Near a school" quick-filter button removed (Figma polish) — the school
          journey is reachable via the "Search by school area" card in the right panel.
          NearSchoolSheet stays mounted below but is no longer triggered from here. */}

      {/* Issue #1817 (AC11) — visually-hidden, debounced, polite mirror of the result
          count. Separate from the visible pill(s) below so the visible number can
          update immediately (never flash-hidden) while the announcement itself is
          debounced ~500ms and only fires once the fetch settles. */}
      <div className="sr-only" aria-live="polite" data-testid="discover-badge-announce">
        {announcedBadgeText}
      </div>

      {/* City / area listing count — bottom-right (Issue #1152). Issue #1588 — on the
          public landing this is replaced by the centered city-wide summary pill below;
          kept bottom-right for contextual (area/school/group) drill-down counts.
          Issue #1824 Slice S8 — both pills extracted to DiscoverMapCountBadge. */}
      <DiscoverMapCountBadge
        resolvedPanelContent={resolvedPanelContent}
        isAreaFirstCityLanding={isAreaFirstCityLanding}
        discoverBadge={discoverBadge}
        isSelectedGroupState={isSelectedGroupState}
        isAreaFirstSelectedAreaState={isAreaFirstSelectedAreaState}
        selectedArea={selectedArea}
        focusedGroup={focusedGroup}
        areaResultSummaryText={areaResultSummaryText}
        groupSelectedBadgeCopy={groupSelectedBadgeCopy}
        fallbackBadgeCopy={fallbackBadgeCopy}
        journey={nav.journey}
        schoolRadiusActive={schoolRadiusActive}
        schoolRadiusPillNoun={schoolRadiusPillNoun}
        schoolFirstAreaSchoolCount={schoolFirstAreaSchoolCount}
        schoolFirstZoneSchoolCount={schoolFirstZoneSchoolCount}
        schoolFirstLandingSchoolCount={schoolFirstLandingSchoolCount}
        cityTotal={cityTotal}
        city={city}
      />

      {/* Issue #1261 — non-blocking "showing first N" hint for the anonymous
          school-radius result. The public endpoint returns a single page (size=50)
          with no total count; hasMore signals more listings exist beyond it.
          DECISION-2: no load-more UI in this slice — only this advisory hint.
          FINDING 1: hasMore reflects the UNFILTERED server probe but the shown
          count is post-filter; when any client-side PropertyFilter is active the
          extra server rows may not match, so suppress the hint to avoid promising
          more *matching* homes than exist (AC8 truthfulness).
          Issue #1824 Slice S8 — extracted to DiscoverMapStatusHints. */}
      <DiscoverMapStatusHints
        schoolRadiusHint={{
          isAuthenticated,
          schoolRadiusActive,
          schoolRadiusHasMore,
          schoolListingsCount: schoolListings.length,
          hasActiveAnonFilter,
        }}
      />

      {isAuthenticated && filters.polygon && (
        <MapStatsBar
          filters={filters}
          onPolygonClear={handlePolygonCleared}
        />
      )}

      <MarkersTruncationNotice
        truncated={markersTruncated}
        returnedElements={markersReturnedElements}
        totalFilteredElements={markersTotalFilteredElements}
      />

      <MapEmptyGuidance
        cityTotal={cityTotal}
        filters={filters} city={city} isLoading={isLoading}
        isAuthenticated={isAuthenticated}
        mapZoom={mapZoom}
        hasAreaSelected={!!selectedArea || isBoundedBrowseState}
        areaLayerMaxZoom={areaLayerMaxZoom}
      />

      {/* a3 — Marker popover mini card. Gated to listing-marker clicks via
          isMarkerPopoverEligible (Issue #1798 PR-C) — see the derivation's
          header comment above for the full eligibility-gate history.
          Issue #1824 Slice S8 — extracted to DiscoverMapMarkerPopover; the
          eligibility gate + markerPopoverStepper derivation stay page-owned. */}
      <DiscoverMapMarkerPopover
        isMarkerPopoverEligible={isMarkerPopoverEligible}
        selectedMarkerListing={selectedMarkerListing}
        markerPixelPos={markerPixelPos}
        mapContainerRef={mapContainerRef}
        isAuthenticated={isAuthenticated}
        handlePopoverDismiss={handlePopoverDismiss}
        navigate={navigate}
        markerPopoverStepper={markerPopoverStepper}
        handleStepMarkerListing={handleStepMarkerListing}
        showMarkerInList={showMarkerInList}
      />
    </div>
  );
}
