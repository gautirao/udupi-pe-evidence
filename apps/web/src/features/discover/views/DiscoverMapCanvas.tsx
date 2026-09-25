import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject, MutableRefObject, Dispatch, SetStateAction } from 'react';
import { useDiscoverActions, useDiscoverNav, useDiscoverShell, useDiscoverViewport } from '@/features/discover/context/useDiscoverContext';
import { PropertyMap, type PropertyListingWithImages } from '@/components/map/PropertyMap';
import { Card } from '@/components/ui/card';
import { DiscoverMapStatusHints } from '@/components/discover/DiscoverMapStatusHints';
import { DiscoverMapContextOverlay } from '@/components/discover/DiscoverMapContextOverlay';
import { DiscoverMapLegend } from '@/components/discover/DiscoverMapLegend';
import { RegionGuidanceCard, type RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';
import { ExploreMapPanel } from '@/components/map/ExploreMapPanel';
import { DiscoverMapCountBadge } from '@/components/discover/DiscoverMapCountBadge';
import { MarkersTruncationNotice } from '@/components/discover/MapStatsBar';
import { MapEmptyGuidance } from '@/components/discover/MapEmptyGuidance';
import { DiscoverMapMarkerPopover } from '@/components/discover/DiscoverMapMarkerPopover';
import { clampSchoolRadiusKm, type PropertyFilters, type PropertyListing, type PropertyImage } from '@/hooks/usePropertyListings';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import type { AreaPoint, AreaMarkerClusterInfo } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import { useDiscoverAreas, type DiscoverArea } from '@/hooks/useDiscoverAreas';
import { DEFAULT_CITY } from '@/lib/localityUtils';
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
import { ReplaceResultScopeDialog } from '@/features/discover/components/ReplaceResultScopeDialog';
import { SearchThisAreaCta } from '@/features/discover/components/map/SearchThisAreaCta';
import {
  MapFiltersPill,
  computeMapFilterRefinementCount,
  deriveMapFiltersFamily,
  computeMapResultsUnitPhrase,
  computeMapResultsHeadingText,
  computeMapFilteredSummaryParts,
} from '@/features/discover/components/map/MapFiltersPill';
import { MapFilterSheet } from '@/features/discover/components/map/MapFilterSheet';
import { DrawModeOverlay } from '@/features/discover/components/map/DrawModeOverlay';
import { Button } from '@/components/ui/button';
// Issue #2628 (step 5/8) — reuses the EXTRACTED "Clear all" reset rule (Decision #4: "the
// existing `resetFilters` rule … Buy/Rent and family kept") for the Map zero-state's immediate
// "Clear filters" action, rather than re-deriving a second reset implementation. This is a
// SEPARATE `usePropertyFilterGroups` call from MapFilterSheet's/AreaSelectedPanel's own — safe
// here because this call's `activeFamily`/`familyOverride` state is never read for rendering
// (only `handleClearPropertyFilters` is used, inside a click handler), so it cannot split-brain
// any displayed value (see PropertyFilterGroups.tsx's file header on why a second call that DID
// feed rendered UI would be unsafe).
import { usePropertyFilterGroups } from '@/components/discover/panels/PropertyFilterGroups';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type {
  PolygonDraftBlock,
  PolygonDraftPhase,
} from '@/features/discover/state/polygonDraftPhase';
import { useAreaSetDraftContext } from '@/features/discover/state/AreaSetDraftContext';
import type {
  AreaSetCandidateCallout,
  AreaSetDraftMemberMarker,
} from '@/components/map/AreaSetCandidateCalloutLayer';
import { useSearchThisAreaCtaOffset } from '@/features/discover/state/useSearchThisAreaCtaOffset';

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
  /**
   * Issue #2186 — synthetic per-destination-bucket markers for the Level-2 agri panel
   * (region + maxKm selected, no locality drilled in yet). Positions are derived
   * client-side (see useAgriDestinationMarkers) since the backend's agri-destinations
   * buckets deliberately omit exact coordinates. Always [] (never null) when there is
   * no data — `agriDestinations` fetch failure/loading is not this prop's concern.
   */
  agriDestinationMarkers: AgriMapListingItem[];
  filters: PropertyFilters;
  isLandingState: boolean;
  handlePolygonDrawn: (polygon: [number, number][]) => void;
  handlePolygonCleared: () => void;
  /**
   * Issue #2419 (PR-2) — the product-native draw-mode seam and its overlay.
   * All optional, for the same reason the #2016 props below are: every
   * existing fixture and caller that predates PR-2 keeps compiling and
   * behaving identically, and with these omitted the plugin's own toolbar
   * stays the only entry while the overlay never renders. The real page
   * composition supplies them from the same `useDiscoverPageState` instance
   * that already owns the polygon phase.
   */
  polygonDraftPhase?: PolygonDraftPhase;
  polygonDraftBlock?: PolygonDraftBlock | null;
  drawVertexCount?: number;
  startDrawNonce?: number;
  cancelDrawNonce?: number;
  undoVertexNonce?: number;
  handleCancelDrawPolygon?: () => void;
  handleUndoDrawVertex?: () => void;
  handleRedrawPolygon?: () => void;
  handleRetryPolygonValidation?: () => void;
  handleDismissPolygonRejection?: () => void;
  handleDrawVertexCountChange?: (count: number) => void;
  handleDrawModeExit?: () => void;
  /**
   * Issue #2016 — J3.3 replace-confirmation dialog state, owned by
   * useDiscoverPageState.ts. Optional (like isColdNavigate above) so
   * existing test fixtures/callers that predate this prop keep compiling —
   * the dialog simply never opens when omitted. The real page composition
   * call site supplies it from the same pageStateController instance that
   * already supplies handlePolygonDrawn/handlePolygonCleared.
   */
  isReplaceScopeConfirmOpen?: boolean;
  handleConfirmReplaceScope?: () => void;
  handleCancelReplaceScope?: () => void;
  /**
   * Issue #2015 — "Search this area" CTA dirty-state (AC1) and activation
   * (AC2), owned by useDiscoverViewportSearch.ts. Optional (same rationale
   * as isReplaceScopeConfirmOpen above) so existing test fixtures/callers
   * that predate this prop keep compiling — the CTA simply never renders
   * when omitted.
   */
  viewportSearchIsDirty?: boolean;
  /**
   * Issue #2015 MUST-HAVE #2 (PR review 5085561270) — true only when the
   * current navigation level has a committed AREA_SET/POLYGON ResultScope
   * active, owned by useDiscoverViewportSearch.ts. Optional for the same
   * reason as viewportSearchIsDirty above; defaults to false so the CTA
   * never renders when omitted.
   */
  viewportSearchIsEligible?: boolean;
  onActivateViewportSearch?: () => void;
  selectedSchool: SchoolResult | null;
  memoizedInitialCenter: [number, number] | undefined;
  /**
   * Issue #2143 (PR follow-up) — the SAME isColdNavigate signal
   * useDiscoverCameraOrchestration's guardedSetPanToArea uses internally,
   * threaded through to PropertyMap's URLViewportController so it can skip
   * its own unconditional-on-mount viewport apply for a cold canonical-node
   * transition (AreaPanner owns the fit in that case) instead of racing it.
   * Optional purely so existing test fixtures that predate this prop keep
   * compiling unchanged; the real MapDiscovery.tsx call site always
   * supplies it.
   */
  isColdNavigate?: boolean;
  cityCenter: [number, number] | undefined;
  cityZoom: number | undefined;
  overviewAreas: AreaPoint[];
  handleOverviewAreaClick: (area: AreaPoint) => void;
  publishCameraIntent: (area: AreaPoint) => void;
  cameraIntent: CameraIntent | null;
  /**
   * Issue #2480 (mobile) — forwarded verbatim to PropertyMap → MapController,
   * which owns the contract. Lets a restore intent published from the panel
   * while this map was unmounted (mobile List view) be delivered on the next
   * mount instead of being absorbed by adopt-on-mount.
   */
  pendingRemountCameraIntentSeqRef: MutableRefObject<number | null>;
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
   * Issue #1943 (singleton auto-advance, PR #2368 owner ruling 2026-08-28) —
   * REPLACE-mode counterpart to `areasNavigationJourney.selectNode`.
   * Threaded straight to `PropertyMap`'s prop of the same name.
   */
  autoAdvanceSelectNode?: (nodeKey: string) => void;
  /**
   * Issue #1956 PR 2 (Slice 5) — pure href builder for the canonical Areas
   * map breadcrumb's ancestor crumbs (`urlActions.buildNodeHref`, unchanged).
   * Forwarded to `DiscoverMapContextOverlay`'s `AreasBreadcrumbTrail` branch;
   * unused whenever `areasNavigationJourney.node` is null.
   */
  buildNavigationNodeHref?: (nodeKey: string) => string | null;
  /**
   * Issue #2017 — multi-area AREA_SET draft/nearby-candidate callout pins.
   * Threaded straight to `PropertyMap`'s prop of the same name (which
   * forwards to `AreaMarkerLayer`'s `makeAreaSetCandidateCard()` pin
   * renderer). Optional/defaults to unused (no candidate pins, current
   * legacy area-pin rendering unchanged) so every existing test fixture and
   * caller that predates this prop keeps compiling/behaving identically.
   * The real page composition call site is expected to supply the union of
   * the AREA_SET draft's current member areaKeys and the nearby-suggestion
   * candidate areaKeys while the draft picker (`AreaSetChips.tsx`) is
   * active.
   */
  areaSetCandidateKeys?: string[];
  schoolZoneLabels: ZoneLabelPoint[];
  setMapZoom: Dispatch<SetStateAction<number>>;
  handleBoundsChange: (bbox: [number, number, number, number]) => void;
  /** Issue #2426 fix cycle 4 — bumps the tracker's userCameraGestureSeq on every genuine camera gesture. Passed through to PropertyMap's onUserCameraGesture. */
  handleUserCameraGesture: () => void;
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

  /**
   * Issue #2628 — writes the ONE canonical filter state (the existing handleFiltersChange/
   * setFilters path). Undefined/omitted disables the mobile Map "Filters" entry entirely (the
   * pill renders only once both `mobileListButton` (mobile Map open) and this are present).
   */
  onFiltersChange?: (next: PropertyFilters) => void;

  /**
   * Issue #2628 (steps 4-5/8) — the applied Buy/Rent intent, needed only for the Map results
   * heading's "homes for sale" / "homes to rent" noun (Decision #5/#6) and the zero-state's
   * "Clear filters" reset. Deliberately optional with the app's own default ('buy'), following the
   * SAME "inert until wired by the composition root" pattern as `onFiltersChange` above —
   * `useDiscoverPageComposition.ts` is outside this issue's scope_lock.allowed_files (see that
   * prop's own comment). PropertyFilters carries no `purpose`/intent field of its own (confirmed by
   * reading `usePropertyListings.ts`'s `PropertyFilters` interface) — Buy/Rent is the page's
   * separate `DiscoverIntent` URL state, same as `MapFilterSheet.tsx`'s own `intent` prop.
   */
  intent?: DiscoverIntent;

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
  agriDestinationMarkers,
  filters,
  isLandingState,
  handlePolygonDrawn,
  handlePolygonCleared,
  polygonDraftPhase,
  polygonDraftBlock = null,
  drawVertexCount = 0,
  startDrawNonce,
  cancelDrawNonce,
  undoVertexNonce,
  handleCancelDrawPolygon,
  handleUndoDrawVertex,
  handleRedrawPolygon,
  handleRetryPolygonValidation,
  handleDismissPolygonRejection,
  handleDrawVertexCountChange,
  handleDrawModeExit,
  isReplaceScopeConfirmOpen = false,
  handleConfirmReplaceScope,
  handleCancelReplaceScope,
  viewportSearchIsDirty = false,
  viewportSearchIsEligible = false,
  onActivateViewportSearch,
  selectedSchool,
  memoizedInitialCenter,
  isColdNavigate,
  cityCenter,
  cityZoom,
  overviewAreas,
  handleOverviewAreaClick,
  publishCameraIntent,
  cameraIntent,
  pendingRemountCameraIntentSeqRef,
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
  autoAdvanceSelectNode,
  buildNavigationNodeHref,
  areaSetCandidateKeys,
  schoolZoneLabels,
  setMapZoom,
  handleBoundsChange,
  handleUserCameraGesture,
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
  onFiltersChange,
  intent = 'buy',
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
  const shell = useDiscoverShell();

  // Issue #2674 — cancel any pending `reportViewport` debounce commit when
  // THIS component real-unmounts. DiscoverMapSurface.tsx's `shouldMount`
  // gate is what makes this the genuine unmount boundary for mobile's
  // List<->Map toggle (Discover is panel-first — the whole Leaflet map,
  // this component included, is torn down and rebuilt on every toggle).
  // Neither of the two existing viewport-debounce guards (the per-writer
  // synchronous cancels in area.ts/city.ts/filters.ts/navigation.ts, or the
  // `location.key`-keyed universal guard in useDiscoverUrlState.ts — both
  // issue #2083) cover this: the toggle is local UI state, not a URL
  // navigation, and the facade that owns the debounce timer lives ABOVE
  // this component and never unmounts with it. A pan just before closing to
  // List leaves its 300ms-debounced URL write armed with nothing left to
  // cancel it; ~300ms later it fires — possibly well after the close, even
  // after a Return has restored a different committed scope — and silently
  // overwrites the URL's lat/lon/zoom with the stale pre-close pan position
  // (confirmed live during this issue's investigation).
  //
  // Ref pattern (empty dep array, not `[urlActions]`): the facade returns a
  // fresh `cancelViewportCommit` closure every render, so this effect must
  // NOT re-run its cleanup on every re-render — that would cancel a
  // legitimate in-flight debounce on every keystroke-adjacent render and
  // defeat it entirely. Only a genuine unmount should call it.
  const cancelViewportCommitRef = useRef(urlActions.cancelViewportCommit);
  cancelViewportCommitRef.current = urlActions.cancelViewportCommit;
  useEffect(() => {
    return () => {
      // Optional call: defensive against a test/mock `useDiscoverActions()`
      // stub that predates this action (see the many `urlActions = {...}`
      // literals across this repo's DiscoverMapCanvas/MapDiscovery test
      // suites) — never a production gap, since the real facade
      // (useDiscoverUrlState.ts) always provides it.
      cancelViewportCommitRef.current?.();
    };
  }, []);

  const [isMapTipDismissed, setIsMapTipDismissed] = useState(false);

  // Issue #2698 — the full-screen mobile Map (`mobileListButton` is supplied only while that
  // overlay is open, never on desktop) has no room for the desktop bottom chrome: at 375–412px
  // the tip pill, the count badge, the legend, both "Recenter on …" buttons and the Leaflet zoom
  // control all landed in one bottom strip and covered each other (zoom "−" was unreachable).
  const isMobileMapOverlay = !!mobileListButton;
  // In the listing-result states the #2628 results heading at the top of the mobile Map already
  // states the same count ("4 homes for sale · Residential"), so the bottom count pill there is a
  // duplicate that only costs map space. Its no-figure 'stale' ("Filtered results") state stays
  // hidden too: the heading's "Filtered: …" summary already says so. ('loading' is never visible.)
  const hideDuplicateCountBadge =
    isMobileMapOverlay && !!onFiltersChange && (isAreaFirstSelectedAreaState || schoolRadiusActive);

  // Issue #2628 — the mobile Map "Filters" staged bottom sheet. Local, transient open state:
  // the canonical filter state stays untouched until Apply (see MapFilterSheet.tsx's header).
  const [isMapFilterSheetOpen, setIsMapFilterSheetOpen] = useState(false);
  const mapFiltersRefinementCount = computeMapFilterRefinementCount(filters);

  // Issue #2628 (steps 4-6/8) — the pure derivations live in MapFiltersPill.tsx (exported
  // alongside `computeMapFilterRefinementCount`, same file, same testable-pure-function
  // pattern) so they are unit-testable without mounting this component.
  const mapFiltersFamily = deriveMapFiltersFamily(filters);
  const mapResultsUnitPhrase = computeMapResultsUnitPhrase(mapFiltersFamily, intent);
  const mapResultsCount = markersReturnedElements ?? currentMapMarkerListings?.length ?? 0;
  // Design doc Accessibility — "Intent is always spoken" in the pill's accessible name.
  const mapFiltersIntentFamilySummary = `${mapResultsUnitPhrase}, ${mapFiltersFamily === 'commercial' ? 'Commercial' : 'Residential'}`;
  const mapFilteredSummaryParts = computeMapFilteredSummaryParts(filters, intent);
  const mapResultsHeadingText = computeMapResultsHeadingText(mapResultsCount, mapFiltersFamily, intent);
  const mapFilteredSummaryText =
    mapFilteredSummaryParts.length > 0 ? `Filtered: ${mapFilteredSummaryParts.join(' · ')}` : null;

  // Issue #2628 (step 6/8) — Schools "Homes near ⟨school⟩" (design doc mf-14..16, Handoff
  // "Schools" paragraph). The SAME Filters pill/sheet mounted below already reaches the Schools
  // journey (it is fed the SAME canonical `filters`/`onFiltersChange`, not a journey-specific
  // one — see the design doc's State-mapping row "Schools homes results — existing school
  // selection + radiusKm + the same filters"), so no separate entry point is built here. Only the
  // Schools-specific COPY differs: the plum "Property filters only" note (mf-15) and the
  // zero-state's school/radius-naming wording (Handoff "Schools" paragraph). `selectedSchool` and
  // `filters.schoolRadiusKm` are READ here only to build these strings — never written, and never
  // passed into `MapFilterSheet`, which stays structurally incapable of touching them (see that
  // component's own props: it takes `filters`/`onApply`/`intent` only).
  const mapSchoolsRadiusKm = filters.schoolRadiusKm ?? DEFAULT_SCHOOL_RADIUS_KM;
  const mapSchoolsScopeNote = selectedSchool
    ? 'Property filters only · school and radius stay on the map'
    : undefined;
  // Loading states already suppress markers (`currentMapMarkerListings`), so gating zero-state on
  // `!showLoader && !isLoading` avoids a false "0 matching" flash while a fetch is in flight.
  const isMapZeroResults =
    !!onFiltersChange && !!mobileListButton && mapResultsCount === 0 && !showLoader && !isLoading;

  // Issue #2628 (step 5/8) — the Map zero-state's immediate "Clear filters" action (Decision #4:
  // "applies immediately … Buy/Rent and family kept … no draft to stage into"). A THIRD
  // `usePropertyFilterGroups` call, but safe: only `handleClearPropertyFilters` is read from it —
  // this call's own `activeFamily`/`familyOverride` never feeds any rendered value in this
  // component, so it cannot disagree with AreaSelectedPanel's or MapFilterSheet's own instance.
  const mapZeroStateFilterGroups = usePropertyFilterGroups({
    filters,
    onFiltersChange: onFiltersChange ?? (() => {}),
    intent,
    isReadyToMoveSupported: true,
    isCommercialSubtypeSupported: true,
  });
  const handleClearMapFilters = mapZeroStateFilterGroups.handleClearPropertyFilters;

  // Issue #2017 — read the SAME shared AREA_SET draft/nearby-candidate state
  // AreaSetChips (rendered below) drives, via the context extracted for
  // exactly this purpose (see AreaSetDraftContext.tsx's header doc). Derives
  // the deduped union of current draft member areaKeys + nearby-suggestion
  // candidate areaKeys for the map's candidate-callout pins, and a select
  // handler that adds the clicked candidate to the draft — mirroring
  // AreaSetChips.tsx's own "add candidate" onClick (commands.add(areaKey);
  // backend already excludes already-selected areas from candidates, so no
  // extra atLimit/duplicate guard is needed here beyond what commands.add()
  // already no-ops on internally).
  // Issue #2456 (owner ruling) — `commands` is deliberately NOT read here:
  // the map has no path that mutates the draft. Adding a candidate happens
  // only through the panel (AreaSetDraftPanel / AreaSetChips).
  const { view: areaSetDraftView, data: nearbyAreaCandidatesData, draftMemberStatsByAreaKey } = useAreaSetDraftContext();

  // Issue #2426 — real-measured clearance so SearchThisAreaCta (rendered
  // below) never overlaps DiscoverMapContextOverlay's breadcrumb or the
  // AreaSetChips strip beneath it. See useSearchThisAreaCtaOffset's own doc.
  const {
    ctaTopOffsetPx,
    drawOverlayTopOffsetPx,
    onBreadcrumbHeightChange,
  } = useSearchThisAreaCtaOffset(mapContainerRef);

  // Issue #2419 (PR-2) — touch vs pointer wording for the draw instructions.
  // #2419 specifies different copy for the two ("Click points" / "Tap
  // points"), and the honest discriminator is the input device, not the
  // viewport width: a narrow desktop window is still a mouse, and a large
  // tablet is still a finger.
  const isTouchPointer =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
  // Code-review fix (PR #2424) — gated on `shell.isAreaSetDraftOpen`. Without
  // this gate, `useAreaSetDraftContext()` always seeds `draftAreaKeys` from
  // the committed AREA_SET and always runs the nearby-candidate query in
  // live mode, so the three props below were previously always non-empty
  // even with the draft editor CLOSED — AreaMarkerLayer treats any matching
  // key as an AREA_SET candidate callout and hijacks the ordinary marker
  // click path into `onAreaSetCandidateSelect`, which can silently mutate
  // the in-memory draft while the editor is closed (never committed, but a
  // surprising side effect a shopper never asked for). This candidate-callout
  // mode is only ever meant to be active "while the multi-area draft panel
  // is open" (see AreaSetChips.tsx/AreaSetDraftPanel.tsx) — enforcing that
  // here, at the single place these three props reach PropertyMap, is the
  // actual gate; `[]`/`undefined`/`false` fall AreaMarkerLayer straight back
  // onto its normal marker-click path with zero further changes needed there.
  //
  // Issue #2456 — narrowed to the draft MEMBERS only. Nearby suggestions used
  // to be unioned in here too, but AreaMarkerLayer can only turn a key into a
  // callout for an area that is ALSO in its iterated `areas` prop and that
  // survives bucketing as a representative — nearby candidates are outside
  // the committed scope, so the card never rendered (issue body, PR #2453
  // evidence). They now reach the map through `areaSetNearbyCandidates`
  // below (a dedicated non-interactive layer); keeping them out of this set
  // means a candidate can never be drawn twice.
  const computedAreaSetCandidateKeys = shell.isAreaSetDraftOpen
    ? Array.from(new Set(areaSetDraftView.draftAreaKeys))
    : [];
  // Issue #2018 slice 3 — the FILTER-AWARE count for each candidate, taken
  // from the very same `nearbyAreaCandidatesData` the recovery panel's nearby
  // rows render. Previously only the KEYS crossed to the map, so the callout
  // fell back to `area.listingCount` (the raw per-area total from
  // useDiscoverAreas, filter-blind) while the panel showed
  // `eligibleListingCount`. Under any active filter the same candidate
  // therefore showed two different numbers on the two surfaces, which #2018
  // forbids: "Map and panel show the same preview counts and candidate
  // identities."
  //
  // Derived from one source rather than recomputed, so the two cannot drift.
  // Draft MEMBERS are intentionally absent from this map: they are committed
  // selections rather than suggestions, the nearby endpoint excludes them by
  // construction, and their card keeps its existing area-total semantics.
  const areaSetCandidateCounts = shell.isAreaSetDraftOpen
    ? Object.fromEntries(
        (nearbyAreaCandidatesData?.candidates ?? []).map((candidate) => [
          candidate.areaKey,
          candidate.eligibleListingCount,
        ]),
      )
    : undefined;

  // Issue #2456 — the nearby suggestions as non-interactive map callouts,
  // mapped 1:1 from the SAME `nearbyAreaCandidatesData.candidates` array
  // AreaSetDraftPanel renders its suggestion rows from (both read one
  // AreaSetDraftContext), positioned from the contract's own geo centres.
  // Same-length, same-order, same `eligibleListingCount`: map callout count
  // equals panel row count by construction. Gated on the draft being open,
  // like every other candidate-mode signal above; `undefined` unmounts the
  // layer, so closing/cancelling the draft removes every callout.
  const areaSetNearbyCandidates: AreaSetCandidateCallout[] | undefined = shell.isAreaSetDraftOpen
    ? (nearbyAreaCandidatesData?.candidates ?? []).map((candidate) => ({
        areaKey: candidate.areaKey,
        label: candidate.name,
        lat: candidate.geoCenterLat,
        lon: candidate.geoCenterLon,
        count: candidate.eligibleListingCount,
      }))
    : undefined;

  // Issue #2456 (owner ruling C2) — the draft's current MEMBERS as the
  // canonical white selected "View homes" card, so the panel's Add turns a
  // dashed callout into the selected treatment (frozen mock `areaPinHTML`
  // `selected` branch). Members are resolved through the same
  // `useDiscoverAreas(city)` record AreaSetDraftPanel/AreaSetChips label
  // their chips from (cached query; no new fetch), which also supplies the
  // geo centre. Supplies listingCount and schoolCount when available. A member whose
  // area record is not (yet) loaded is simply not drawn — never placed at a
  // fabricated position. Gated on the draft being open like the callouts;
  // `undefined` closes the layer. Read-only: no command is derived here, so
  // Add stays draft-only and Show/Search remains the commit.
  const { data: discoverAreasData } = useDiscoverAreas(nav.city || DEFAULT_CITY);
  const areaSetDraftMembers: AreaSetDraftMemberMarker[] | undefined = shell.isAreaSetDraftOpen
    ? areaSetDraftView.draftAreaKeys.flatMap((areaKey) => {
        const area = discoverAreasData?.areas.find((a) => a.areaKey === areaKey);
        const snapshot = draftMemberStatsByAreaKey[areaKey];
        return area
          ? [
              {
                areaKey,
                label: area.name,
                lat: area.geoCenterLat,
                lon: area.geoCenterLon,
                count: snapshot?.eligibleListingCount ?? area.listingCount,
                schoolCount: snapshot?.schoolCount ?? area.schoolCount,
              },
            ]
          : [];
      })
    : undefined;

  // Issue #2016 — human-readable label for J3.3's confirmation body (the
  // scope about to be REPLACED, i.e. still the committed one while the
  // dialog is open). `selectedArea.areaLabel` gives the real area name for
  // AREA_SET when it matches the current single-area selection; falls back
  // to the raw areaKey(s) if it doesn't (defensive — should not happen while
  // only size-1 AREA_SET is committable in this PR).
  const outgoingScope = nav.resultScope?.active ?? null;
  const outgoingScopeLabel =
    outgoingScope?.kind === 'AREA_SET'
      ? selectedArea?.areaLabel ?? outgoingScope.areaKeys.join(', ')
      : outgoingScope?.kind === 'POLYGON'
        ? 'Your drawn boundary'
        : 'Your current selection';
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
  // Issue #2296 fix — deliberately NOT extending this map-rendering gate to
  // agri-first. Issue #2203 briefly widened it that way (see the removed
  // `isAgriNavNodeLevel` local, still present as `showAreasNavigationJourney`'s
  // agri term in useDiscoverNavigationController.ts), but issue #2186 later
  // shipped the purpose-built agri Level-2 pathway
  // (AgriMarkerClusterLayer, fed by the `agriDestinationMarkers` prop below)
  // — the #2203 wiring here was never removed, so agri-first Level 2
  // mounted BOTH `AreaDestinationMarkerLayer` (residential/school "card"
  // styling — see AreaMarkerLayer.tsx's `eligibilityJourney: 'areas'`
  // fallback) and the correct agri layer at once. This file's copy of the
  // gate now excludes agri on purpose: `showAreasNavigationJourney` in the
  // controller intentionally KEEPS agri-first (it still drives the canonical
  // hierarchy fetch and the Recenter camera affordance — see
  // useDiscoverCameraController.test.ts) — only the MAP's destination-marker
  // mount point is narrowed here.
  const showAreasNavigationDestinations =
    (nav.journey === 'area-first' || isSchoolsNavNodeLevel) && !nav.nodeListings;

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
    // Issue #2149 (fix-cycle) — a real touch tap on a listing marker
    // (`hasTouch`/`isMobile` Playwright contexts; live-verified against a
    // real mobile browser via three independent tap mechanisms) synthesizes
    // a native `click` DOM event that bubbles all the way up to THIS div,
    // just like the drag-tail click #2089 already guards against — but
    // Leaflet's own 'click' listener on the marker (bound in
    // MarkerClusterLayer, `PropertyMap.tsx`) already ran first and called
    // `onSelectListing`/`onMarkerClickWithPosition` for the NEW marker. This
    // handler previously had no way to tell "a tap that just selected a
    // marker" apart from "a genuine tap on open map background", so on every
    // click AFTER the first marker selection (once `markerPixelPos != null`
    // wires this handler up at all) it immediately called
    // `handlePopoverDismiss()` and wiped the selection the marker's own click
    // handler had just set in the very same event — reproducing as "any
    // second marker tap (even the same marker) closes the sheet/popover"
    // (mouse-driven clicks in desktop/#2089's fixture do not exhibit this;
    // only real touch taps do). Fixed by checking whether the click actually
    // originated on a marker element (every listing marker carries
    // `data-listing-id`, set by MarkerClusterLayer's `marker.on('add', ...)`)
    // before treating it as a background tap — if so, the marker's own click
    // handler already owns this gesture and the background-dismiss must be a
    // no-op.
    const target = e.target as Element | null;
    if (target?.closest('[data-listing-id]')) {
      return;
    }

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
      {/* Issue #2015 — top-anchored "Search this area" CTA (AC1/AC2) and
          active-scope chip (AC6), placed with the other status overlays so
          they avoid the bottom-anchored List/zoom/attribution controls. */}
      <SearchThisAreaCta
        isEligible={viewportSearchIsEligible}
        isDirty={viewportSearchIsDirty}
        onActivate={onActivateViewportSearch ?? (() => {})}
        topOffsetPx={ctaTopOffsetPx}
      />
      {/* Issue #2419 (PR-2) — draw-mode instructions with Cancel/Undo, and
          the blocked-draft surface for a #2420 rejection or an unobtainable
          verdict. Bottom rung of the measured stack: redrawing a COMMITTED
          polygon shows this overlay while the chip still reads COMMITTED (the
          chip renders from the URL scope, which does not change until the new
          shape is accepted), so chip, CTA and overlay can all be up at once. */}
      {polygonDraftPhase && (
        <DrawModeOverlay
          phase={polygonDraftPhase}
          block={polygonDraftBlock}
          vertexCount={drawVertexCount}
          isTouch={isTouchPointer}
          onCancelDraw={handleCancelDrawPolygon ?? (() => {})}
          onUndoVertex={handleUndoDrawVertex ?? (() => {})}
          onRedraw={handleRedrawPolygon ?? (() => {})}
          onRetryValidation={handleRetryPolygonValidation ?? (() => {})}
          onDismissBlock={handleDismissPolygonRejection ?? (() => {})}
          topOffsetPx={drawOverlayTopOffsetPx}
        />
      )}
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
          // Issue #2186 / #2296 (PR #2381 second review) — Level-3 (locality drilled
          // into) uses the real fetched parcel listings via AgriMarkerClusterLayer,
          // unchanged. Level-2 (region + maxKm chosen, no locality yet) no longer
          // flows through this prop at all — it now goes through the dedicated
          // `agriDestinationMarkers` prop below (AgriDestinationMarkerLayer, which
          // never clusters), so a Level-2 destination can never collapse into
          // AgriMarkerClusterLayer's generic "N properties" cluster bubble.
          agriGroupListings={nav.selectedLocality ? filteredAgriListings : null}
          // Issue #2296 (PR #2381 second review) — Level-2 destination-bucket markers,
          // ONLY when no locality is drilled into yet (mutually exclusive with the
          // Level-3 branch above — never show both at once).
          agriDestinationMarkers={
            !nav.selectedLocality && selectedRegion && selectedMaxKm != null
              ? agriDestinationMarkers
              : null
          }
          // Issue #2296 (PR #2381 third review) — a Level-2 destination marker
          // click must drill down into that destination (same action
          // AgriGroupSelectedPanel's locality-row click already uses —
          // urlActions.setLocality, PUSH semantics), not the generic
          // marker-popover flow.
          onSelectAgriDestination={(areaKey) => urlActions.setLocality(areaKey)}
          polygon={filters.polygon}
          // Issue #1588 — hide the polygon draw tool on the public landing
          // (guided-entry). PropertyMap only mounts DrawControl when BOTH handlers
          // are present, so passing undefined here removes the control on the landing
          // while preserving area-draw search in every drill-down state.
          onPolygonDrawn={isLandingState ? undefined : handlePolygonDrawn}
          onPolygonCleared={isLandingState ? undefined : handlePolygonCleared}
          // Issue #2419 (PR-2) — the product-native draw seam.
          startDrawNonce={startDrawNonce}
          cancelDrawNonce={cancelDrawNonce}
          undoVertexNonce={undoVertexNonce}
          onDrawVertexCountChange={handleDrawVertexCountChange}
          onDrawModeExit={handleDrawModeExit}
          // The plugin toolbar is hidden ONLY once the product entry is
          // actually wired (the page supplies the phase). Without that, hiding
          // it would leave no way to draw at all.
          hideDrawPluginToolbar={polygonDraftPhase != null}
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
          // Issue #2143 (PR follow-up) — same two signals guardedSetPanToArea
          // consults, so URLViewportController can skip its own unconditional
          // viewport apply for exactly the cold canonical-node case AreaPanner
          // now owns (see that component's gate). Deliberately `nav.rawNodeParam`
          // (synchronous, parsed straight from the URL on first render) and NOT
          // `areasNavigationJourney?.node?.nodeKey` (async — resolves a render
          // later via useQuery, so on a genuine cold load it's still null on
          // URLViewportController's first invocation and the isFirstRender-gated
          // skip could never engage for the case it targets). No node in play
          // at all leaves current behaviour untouched — the gate below requires
          // BOTH signals to be present.
          navigationNodeKey={nav.rawNodeParam ?? null}
          isColdNavigate={isColdNavigate}
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
          pendingRemountCameraIntentSeqRef={pendingRemountCameraIntentSeqRef}
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
          // Issue #2017 — multi-area AREA_SET draft/nearby-candidate callout
          // pins. See this component's props of the same name for the
          // union-of-draft-member-and-candidate-keys contract. Sourced from
          // the shared AreaSetDraftContext (see the computed locals above)
          // rather than the incoming props — DiscoverMapCanvas now reads the
          // draft/candidate state directly instead of relying on a caller to
          // compute and pass it. The `areaSetCandidateKeys` prop remains on
          // DiscoverMapCanvasProps for callers/tests that still supply it,
          // but is no longer used as the map's source of truth.
          // Issue #2456 (owner ruling) — no `onAreaSetCandidateSelect` is
          // threaded: the map never mutates the draft; the panel is the only
          // Add path. Nearby suggestions render via `areaSetNearbyCandidates`.
          areaSetCandidateKeys={computedAreaSetCandidateKeys}
          areaSetCandidateCounts={areaSetCandidateCounts}
          // Issue #2017 (max-3 visual parity, PR #2424) — same
          // `atLimit` source of truth AreaSetChips.tsx uses for its own
          // candidate-button disabled styling, read from the shared
          // AreaSetDraftContext above. Drives the muted/disabled visual +
          // no-op click/keyboard on not-yet-selected candidate map pins.
          // Gated on `shell.isAreaSetDraftOpen` — see `computedAreaSetCandidateKeys`'s
          // doc above; `false` here is part of the same "editor closed ->
          // no AREA_SET candidate-mode signal reaches the map at all" fix.
          areaSetAtMax={shell.isAreaSetDraftOpen && areaSetDraftView.atLimit}
          // Issue #2456 — nearby-candidate callouts (see the derivation above).
          areaSetNearbyCandidates={areaSetNearbyCandidates}
          // Issue #2456 (owner ruling C2) — draft members as the selected card.
          areaSetDraftMembers={areaSetDraftMembers}
          areasNavigationJourney={areasNavigationJourney}
          hoveredNavigationNodeKey={hoveredNavigationNodeKey}
          onNavigationNodeHoverChange={onNavigationNodeHoverChange}
          focusedClusterMemberAreaKeys={focusedClusterMemberAreaKeys}
          onClusterFocusChange={onClusterFocusChange}
          onAreaVisualClusterCameraIntent={onAreaVisualClusterCameraIntent}
          autoAdvanceSelectNode={autoAdvanceSelectNode}
          showAreasNavigationDestinations={showAreasNavigationDestinations}
          schoolZoneLabels={isSchoolsNavNodeLevel ? [] : schoolZoneLabels}
          onSelectZone={(groupId) => urlActions.selectGroup(groupId)}
          onZoomChange={setMapZoom}
          onViewportChange={urlActions.reportViewport}
          onBoundsChange={handleBoundsChange}
          onUserCameraGesture={handleUserCameraGesture}
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
        mobileListButton={
          // Issue #2628 — the "Filters" pill renders in this SAME top-left row, immediately
          // BEFORE the existing mobile List/Map toggle, only while the mobile Map overlay is
          // open (mirrors `mobileListButton`'s own null-on-desktop / null-when-closed gating)
          // and only when the caller has wired a canonical filter-write command.
          mobileListButton && onFiltersChange ? (
            <>
              <MapFiltersPill
                count={mapFiltersRefinementCount}
                intentFamilySummary={mapFiltersIntentFamilySummary}
                onClick={() => setIsMapFilterSheetOpen(true)}
              />
              {mobileListButton}
            </>
          ) : (
            mobileListButton
          )
        }
        onHeightChange={onBreadcrumbHeightChange}
      />
      {onFiltersChange && (
        <MapFilterSheet
          open={isMapFilterSheetOpen}
          onOpenChange={setIsMapFilterSheetOpen}
          filters={filters}
          onApply={onFiltersChange}
          intent={intent}
          isCommercialSubtypeSupported
          appliedResultCount={mapResultsCount}
          // mf-09 — "Show 2 commercial properties"; the sheet's own generic 'homes' default
          // (step 2-3/8) did not yet distinguish family. `isAgriJourney` still wins (agri is
          // never in-scope for this sheet per the design doc's Handoff section, but the prop
          // itself has no such gate yet — see this component's own onFiltersChange/mobileListButton
          // gating comment above).
          resultUnitNoun={isAgriJourney ? 'listings' : mapFiltersFamily === 'commercial' ? 'commercial properties' : 'homes'}
          // Issue #2628 (step 6/8) — mf-15 "Property filters only" plum banner, shown only
          // during the Schools "Homes near ⟨school⟩" journey (`selectedSchool` truthy).
          scopeNote={mapSchoolsScopeNote}
        />
      )}

      {/* Issue #2628 (steps 4-5/8) — Map results heading + "Filtered: … Edit" summary
          (Decision #5) and the Map zero-results block (design doc "Zero results" section).
          Gated identically to the pill/sheet above (mobile Map open + a canonical filter-write
          command supplied). Placed directly beneath the top-left overlay row: the actual
          listing-card results sheet is composed OUTSIDE this component (DiscoverRightPanel /
          the page shell's mobile sheet positioning), which sit outside this issue's
          scope_lock.allowed_files — see this file's header/handback notes. This block is
          therefore an additive Map-surface summary, not an edit to that shared sheet. */}
      {mobileListButton && onFiltersChange && (
        <div
          className="pointer-events-none absolute left-3 right-3 top-[92px] z-20 flex flex-col items-start gap-1"
          data-testid="map-results-heading"
        >
          {isMapZeroResults ? (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-auto w-full rounded-xl border border-border bg-background/95 p-3 shadow-md backdrop-blur"
              data-testid="map-zero-results"
            >
              <p className="text-sm font-semibold text-foreground">
                0 matching {mapFiltersFamily === 'commercial' ? 'commercial properties' : 'homes'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selectedSchool ? (
                  <>
                    No homes within {mapSchoolsRadiusKm} km of {selectedSchool.name} match your{' '}
                    {mapFiltersRefinementCount} {mapFiltersRefinementCount === 1 ? 'filter' : 'filters'}. The
                    school and radius were not changed.
                  </>
                ) : (
                  <>
                    Nothing in {city || 'this area'} matches your {mapFiltersRefinementCount}{' '}
                    {mapFiltersRefinementCount === 1 ? 'filter' : 'filters'}. Filters were not widened for you.
                  </>
                )}
              </p>
              {mapFilteredSummaryParts.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground" data-testid="map-zero-results-filters">
                  {mapFilteredSummaryParts.join(' · ')}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="min-h-[44px]"
                  onClick={() => setIsMapFilterSheetOpen(true)}
                  data-testid="map-zero-results-edit-filters"
                >
                  Edit filters
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-[44px]"
                  onClick={handleClearMapFilters}
                  data-testid="map-zero-results-clear-filters"
                >
                  Clear filters
                </Button>
                {/* Design doc "Zero results" — "Return to previous scope" appears only when an
                    existing prevScope return target applies (Polygon/Viewport). That existing
                    mechanism (`previousResultScope`/`handleReturnToPreviousScope`) lives in
                    AreaSelectedPanel.tsx, function-local, not exposed as a prop this component
                    can reach without threading new state through DiscoverRightPanel.tsx (outside
                    scope_lock.allowed_files) — omitted here rather than re-derived as a second
                    implementation; see this file's handback notes. */}
              </div>
            </div>
          ) : (
            <div
              className="pointer-events-auto rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur"
              data-testid="map-results-heading-text"
            >
              {mapResultsHeadingText}
              {mapFilteredSummaryText && (
                <span className="ml-2 font-normal text-muted-foreground" data-testid="map-filtered-summary">
                  {mapFilteredSummaryText}
                  {' — '}
                  <button
                    type="button"
                    className="pointer-events-auto font-semibold text-foreground underline underline-offset-2"
                    onClick={() => setIsMapFilterSheetOpen(true)}
                    data-testid="map-filtered-summary-edit"
                  >
                    Edit
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Issue #2017 — multi-area AREA_SET draft chip strip ("Selected areas" +
          "Add area" + "Search these areas" CTA). Mounted the same way
          <ExploreMapPanel /> is just below: a zero-prop, self-contained-via-
          context component (reads useDiscoverNav()/useDiscoverActions()/
          useDiscoverAreas() directly — see AreaSetChips.tsx's own doc), so it
          does not extend DiscoverMapCanvasProps or thread through the page.
          Positioned directly beneath the top-left context overlay above (same
          left inset, next stacking row down) and renders null internally
          only when the draft has zero areas (no-scope / non-AREA_SET
          committed state). A single committed AREA_SET area still seeds one
          chip via useAreaSetDraft, so the strip is visible from the very
          first committed area onward — this is the "add more areas" entry
          point, not a multi-area-only affordance. */}
      {/* Issue #2017 mobile fix cycle — `top-14` (56px) was tuned assuming
          the DiscoverMapContextOverlay breadcrumb above renders as a SINGLE
          line. Below the `lg` split-view breakpoint (DiscoverMapContextOverlay
          itself switches to its mobile-overlay row layout at this same
          `1023px` cut — see that component's own docstring), the breadcrumb
          can legitimately wrap onto its second row (DiscoverMapBreadcrumb.tsx
          explicitly caps trails at up to two rows — see `maxTwoRowsClass`
          there), growing its real rendered height past the ~52px a
          single-line breadcrumb occupies. The worst case across every
          breadcrumb branch this overlay can render (map-group-breadcrumb,
          non-compact, default `py-2` padding) is `top-4`(16) + border(2) +
          `py-2`(16) + `max-h-[44px]` = 78px, so `top-24`(96px) reserves
          enough room with margin. At `lg`+ the breadcrumb never wraps in
          practice (see AreasBreadcrumbTrail's own width-budget derivation),
          so the original `top-14` is kept there, unchanged. */}


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
        hideDrillDownBadge={hideDuplicateCountBadge}
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
        isMobileMapOverlay={isMobileMapOverlay}
      />

      {/* Issue #2419 (PR-2) — MapStatsBar deleted here and in its own file.
          It was a second owner of the committed-POLYGON state, labelled
          "Area search" against the chip's "Drawn area", and this mount gated
          it on `isAuthenticated` by accident of ownership rather than policy,
          so anonymous shoppers saw no indicator while signed-in ones saw two.
          Its replacement, the panel-side scope summary (AreaSelectedPanel),
          is now the single surface — see Issue #2478. */}

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
        isAgriJourney={isAgriJourney}
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

      {/* Issue #2016 (J3.3) — replace-confirmation for finishing a drawn
          polygon while an AREA_SET/POLYGON scope is already committed.
          AlertDialog renders via a portal, so its position in this tree
          does not affect layout.
          Issue #2471 — the portal target is THIS canvas root, not body: on
          mobile this tree lives inside DiscoverPageShell's `fixed inset-0
          z-[60]` wrapper and a body-level z-50 portal renders underneath it.
          Reading `.current` at render is safe here: the dialog can only open
          after the canvas has mounted, and `open` flipping re-renders us. */}
      <ReplaceResultScopeDialog
        open={isReplaceScopeConfirmOpen}
        outgoingScopeLabel={outgoingScopeLabel}
        onConfirm={handleConfirmReplaceScope ?? (() => {})}
        onCancel={handleCancelReplaceScope ?? (() => {})}
        container={mapContainerRef.current}
      />

      {/* Step 4: Bottom-left map tip banner pill. Issue #2698 — desktop only: its "Click …"
          pointer copy does not apply to touch, and on the mobile Map it ran under the legend,
          the count badge and the Recenter button. */}
      {!isMapTipDismissed && !isMobileMapOverlay && (
        <div
          data-testid="discover-map-tip-pill"
          className="absolute bottom-4 left-4 z-[500] flex items-center gap-2 px-3 py-1.5 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-full shadow-md text-xs font-medium text-slate-700"
        >
          <span>Click an area marker to explore · The map will zoom for you</span>
          <button
            type="button"
            onClick={() => setIsMapTipDismissed(true)}
            aria-label="Close tip"
            className="ml-1 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center w-4 h-4 rounded-full"
          >
            [x]
          </button>
        </div>
      )}

      {/* Step 4: Bottom-right stacked Recenter button. Issue #2698 — on the mobile Map it sat
          on top of the Leaflet zoom control (bottom-right corner, above the attribution), so it
          is lifted above that control there, keeping the zoom's own 10px right inset. */}
      <div
        className={
          isMobileMapOverlay
            ? 'absolute bottom-[100px] right-[10px] z-[500] flex flex-col items-end gap-2'
            : 'absolute bottom-4 right-4 z-[500] flex flex-col items-end gap-2'
        }
      >
        <button
          type="button"
          data-testid="map-recenter-city-button"
          onClick={() => {
            if (cityCenter) {
              publishCameraIntent({
                areaKey: nav.city || DEFAULT_CITY,
                areaLabel: nav.city || DEFAULT_CITY,
                geo_center_lat: cityCenter[0],
                geo_center_lon: cityCenter[1],
                bbox: null,
              });
            }
          }}
          className="px-3 py-1.5 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg shadow-md text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
        >
          Recenter on {nav.city || DEFAULT_CITY}
        </button>
      </div>
    </div>
  );
}
