import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useDiscoverActions, useDiscoverNav, useDiscoverShell, useDiscoverViewport } from '@/features/discover/context/useDiscoverContext';
import { PropertyMap } from '@/components/map/PropertyMap';
import { Card } from '@/components/ui/card';
import { DiscoverMapStatusHints } from '@/components/discover/DiscoverMapStatusHints';
import { DiscoverMapContextOverlay } from '@/components/discover/DiscoverMapContextOverlay';
import { DiscoverMapLegend } from '@/components/discover/DiscoverMapLegend';
import { RegionGuidanceCard } from '@/components/map/RegionGuidanceCard';
import { ExploreMapPanel } from '@/components/map/ExploreMapPanel';
import { DiscoverMapCountBadge } from '@/components/discover/DiscoverMapCountBadge';
import {
  isDrillDownCountBadgeVisible,
  isLandingCountBadgeVisible,
} from '@/components/discover/discoverMapCountBadgeVisibility';
import { MarkersTruncationNotice } from '@/components/discover/MapStatsBar';
import { MapEmptyGuidance } from '@/components/discover/MapEmptyGuidance';
import { DiscoverMapMarkerPopover } from '@/components/discover/DiscoverMapMarkerPopover';
import { clampSchoolRadiusKm } from '@/hooks/usePropertyListings';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { DEFAULT_CITY } from '@/lib/localityUtils';
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
import { useAreaSetDraftContext } from '@/features/discover/state/AreaSetDraftContext';
import type {
  AreaSetCandidateCallout,
  AreaSetDraftMemberMarker,
} from '@/components/map/AreaSetCandidateCalloutLayer';
import { useSearchThisAreaCtaOffset } from '@/features/discover/state/useSearchThisAreaCtaOffset';
import type {
  DiscoverMapSurfaceView,
  DiscoverMapSurfaceCommands,
} from '@/features/discover/surfaces/buildMapSurfaceModel';

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
/**
 * Issue #2659 (D1 — approved decision record) — the former 139-field flat
 * interface is DELETED outright, not kept as a renamed catalogue type. The
 * capability interfaces this component now consumes (`MapCameraView`,
 * `MapAreasView`, etc.) are defined and exported as `DiscoverMapSurfaceView`/
 * `DiscoverMapSurfaceCommands` in buildMapSurfaceModel.tsx — that file is the
 * source of truth, and this component imports its TYPES from there (the
 * derivation direction used to run the other way). `overlays` is excluded
 * from both: MobileClusterSheet/MobileListingPreviewSheet/the recenter
 * portal are rendered as this component's SIBLINGS by DiscoverMapSurface.tsx,
 * never passed down to it.
 */
export interface DiscoverMapCanvasProps {
  mapContainerRef: RefObject<HTMLDivElement | null>;
  view: Omit<DiscoverMapSurfaceView, 'overlays'>;
  commands: Omit<DiscoverMapSurfaceCommands, 'overlays'>;
}

export function DiscoverMapCanvas({ mapContainerRef, view, commands }: DiscoverMapCanvasProps) {
  // Issue #2659 (D1) — mechanical destructure of the nested view/commands
  // contract into the SAME flat local names the body below has always used.
  // Deliberate choice: every derived const, handler and the ~1200-line JSX
  // return that follows is untouched by this refactor (byte-identical
  // behaviour) — only how these values ARRIVE at the top of the function
  // changed. See DiscoverMapCanvasProps' own doc comment for the contract.
  const {
    camera: __view_camera,
    areas: __view_areas,
    agri: __view_agri,
    scope: __view_scope,
    navigation: __view_navigation,
    schools: __view_schools,
    markers: __view_markers,
    status: __view_status,
    mobile: __view_mobile,
    regionGuide: __view_regionGuide,
    drawing: __view_drawing,
    replaceScope: __view_replaceScope,
    viewportSearch: __view_viewportSearch,
  } = view;
  const {
    camera: __commands_camera,
    drawing: __commands_drawing,
    replaceScope: __commands_replaceScope,
    viewportSearch: __commands_viewportSearch,
    navigation: __commands_navigation,
    markers: __commands_markers,
    regionGuide: __commands_regionGuide,
    filters: __commands_filters,
  } = commands;

  const {
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
  } = __view_camera;
  const { publishCameraIntent, setMapZoom, handleBoundsChange, handleUserCameraGesture } = __commands_camera;

  const {
    focusedGroupAreas,
    areaLayerMaxZoom,
    selectedArea,
    overviewAreas,
    areaSearchMatchKeys,
    hoveredAreaKeyForMap,
    isRegionOverview,
    regionOverviewShortLabel,
    areaRestoreArea,
  } = __view_areas;

  const { selectedRegion, selectedMaxKm, filteredAgriListings, agriDestinationMarkers, isAgriJourney } = __view_agri;

  const { filters, isLandingState, isBoundedBrowseState } = __view_scope;

  const {
    polygonDraftPhase,
    polygonDraftBlock = null,
    drawVertexCount = 0,
    startDrawNonce,
    cancelDrawNonce,
    undoVertexNonce,
  } = __view_drawing;
  const {
    handlePolygonDrawn,
    handlePolygonCleared,
    handleCancelDrawPolygon,
    handleUndoDrawVertex,
    handleRedrawPolygon,
    handleRetryPolygonValidation,
    handleDismissPolygonRejection,
    handleDrawVertexCountChange,
    handleDrawModeExit,
  } = __commands_drawing;

  const { isReplaceScopeConfirmOpen = false } = __view_replaceScope;
  const { handleConfirmReplaceScope, handleCancelReplaceScope } = __commands_replaceScope;

  const { viewportSearchIsDirty = false, viewportSearchIsEligible = false } = __view_viewportSearch;
  const { onActivateViewportSearch } = __commands_viewportSearch;

  const {
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
  } = __view_schools;

  const {
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
  } = __view_markers;
  const {
    publishMarkerClusterCameraIntent,
    navigate,
    setMapReady,
    handlePopoverDismiss,
    handleSelectMarkerListing,
    handleMarkerClickWithPosition,
    handleStepMarkerListing,
    showMarkerInList,
  } = __commands_markers;

  const {
    showSchoolBreadcrumb,
    focusedGroup,
    city,
    areasNavigationJourney,
    hoveredNavigationNodeKey,
    focusedClusterMemberAreaKeys,
    isAreaFirstCityLanding,
    areaJourneySegments,
    schoolJourneySegments,
    resolvedPanelContent,
    isSelectedGroupState,
    isAreaFirstSelectedAreaState,
    journeyView,
  } = __view_navigation;
  const {
    publishClusterCameraIntent,
    onAreaVisualClusterCameraIntent,
    autoAdvanceSelectNode,
    handleAreaMarkersComputed,
    handleCityChange,
    onNavigationNodeHoverChange,
    onClusterFocusChange,
    handleOverviewAreaClick,
    handleAreaClusterClick,
    buildNavigationNodeHref,
    journeyCommands,
  } = __commands_navigation;

  const {
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
    intent = 'buy',
  } = __view_status;

  const { mobileListButton } = __view_mobile;
  const { onFiltersChange, onIntentChange } = __commands_filters;

  const {
    regionGuideVisible,
    resolvedRegionLabel,
    regionSelectNonce,
    regionOverviewMarkerKind,
    regionGuideRingActive,
  } = __view_regionGuide;
  const { dismissRegionGuide } = __commands_regionGuide;
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

  // Issue #2724 (owner follow-up 3, desktop/mobile parity; Finding 1, pass 3 code review) —
  // desktop-only: true in exactly the states where DiscoverMapCountBadge.tsx renders one of its
  // two horizontally-CENTRED variants alongside this file's "Recenter on <city>" button (see that
  // button's own doc comment below). `isAreaFirstSelectedAreaState` is excluded here — that state
  // keeps its own separate pairing with the mutually-exclusive `areas-recenter-button`
  // (DiscoverMapSurface.tsx) instead, via `isAreaRecenterButtonVisible` below.
  //
  // Code review (Finding 1) flagged the previous version of this flag for re-deriving its own
  // copy of DiscoverMapCountBadge's visibility gates instead of calling them, letting the two
  // silently drift apart (e.g. an orphaned "Recenter on <city>" paired with an absent pill on
  // fresh load or during group-loading). Fixed by calling the SAME exported predicates the pill's
  // own render gate uses, so this flag and the pill's actual visibility can never disagree.
  const isDesktopBadgePaired =
    !isAreaFirstSelectedAreaState &&
    ((isSelectedGroupState &&
      isDrillDownCountBadgeVisible({
        discoverBadge,
        resolvedPanelContent,
        isAreaFirstCityLanding,
        journey: nav.journey,
        hideDrillDownBadge: hideDuplicateCountBadge,
      })) ||
      isLandingCountBadgeVisible({
        resolvedPanelContent,
        isAreaFirstCityLanding,
        journey: nav.journey,
        cityTotal,
      }));

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
  // Issue #2724 — this panel (with its "Edit filters"/"Clear filters" actions) must only render
  // when a genuinely active property filter (`mapFiltersRefinementCount > 0`, the same Buy/Rent-
  // excluding count the pill/sheet/summary above already use) is the reason nothing matches. With
  // zero filters active, 0 results means the area/city itself has no inventory — there is nothing
  // to "clear" or "edit", so this panel must stay hidden (MapEmptyGuidance below owns that
  // no-inventory case instead).
  // Issue #2724 (follow-up) — `!isAgriJourney` mirrors MapEmptyGuidance's own Issue #2169 guard
  // (`if (!isAgriJourney && cityTotal === 0 ...)`, below in this same file). `mobileListButton`
  // (mobile Map open) is NOT gated on journey — the agri journey can open the mobile Map overlay
  // just like any other — and `useDiscoverMapData.ts`'s `filteredMarkersData` (the source of
  // `mapResultsCount`) is the SAME generic markers query forced to `agricultural_land` in
  // agri-first (`agriFilters`), so `mapResultsCount === 0` is genuinely reachable there. Without
  // this guard the panel would show residential-flavoured copy ("0 matching homes", the
  // Buy/Rent-family `deriveMapFiltersFamily` never has an agri branch) atop agri land — the right
  // panel already owns the Agri empty/sparse state prominently (same rationale as #2169), so this
  // Map-surface panel stays suppressed rather than growing a second, divergent agri copy.
  const isMapZeroResults =
    !!onFiltersChange &&
    !!mobileListButton &&
    mapResultsCount === 0 &&
    mapFiltersRefinementCount > 0 &&
    !isAgriJourney &&
    !showLoader &&
    !isLoading;

  // Issue #2724 (code-review follow-up) — the `!isAgriJourney` guard above only stops the PANEL
  // from rendering; the render below is a binary `isMapZeroResults ? panel : headingPill`, so an
  // agri+zero-results state that used to hit the panel now falls into the heading-pill else-
  // branch instead. That branch (`mapResultsHeadingText`, built from `computeMapResultsHeadingText`/
  // `computeMapResultsUnitPhrase` in `MapFiltersPill.tsx`) has no agri branch either — it would
  // render "0 homes for sale · Residential" over agricultural-land results, the exact class of
  // bug this guard exists to prevent, just relocated. This flag catches that specific combination
  // (same conditions as `isMapZeroResults` minus the `!isAgriJourney`/`mapFiltersRefinementCount`
  // checks it deliberately drops — a zero-result agri state is a "nothing here" state regardless
  // of whether a filter narrowed it) so the render below can suppress BOTH branches for it,
  // consistent with the same "right panel owns the Agri empty state" rationale used above. The
  // non-zero-result agri heading ("N homes for sale · Residential" with N > 0) is a separate,
  // pre-existing gap in `computeMapResultsHeadingText` that predates this fix and is out of this
  // guard's scope.
  const isAgriZeroResultsSuppressed =
    !!onFiltersChange &&
    !!mobileListButton &&
    mapResultsCount === 0 &&
    isAgriJourney &&
    !showLoader &&
    !isLoading;

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
          // Issue #2711 — the missing wire: without this, MapFilterSheet's own
          // `onIntentChange?.(draftIntent)` silently no-op'd and Apply never committed a Rent/Buy
          // switch (only the transitioned filters landed). See this prop's own doc above.
          onIntentChange={onIntentChange}
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
          {/* Issue #2724 (code-review follow-up) — agri+zero-results is suppressed entirely
              rather than falling into the heading-pill branch below, which has no agri copy
              either (`computeMapResultsHeadingText` never branches on journey) and would show
              "0 homes for sale · Residential" over agricultural-land results. See
              `isAgriZeroResultsSuppressed`'s doc comment above. */}
          {/* Issue #2724 (owner-reviewed follow-up) — the heading pill's raw count
              ("0 homes for sale · Residential") duplicated, and could directly contradict, the
              bottom `DiscoverMapCountBadge` ("Showing 19 verified properties across Bangalore")
              on the no-filter/startup state, where `hideDuplicateCountBadge` (below) is false
              and that badge is ALSO on screen — a real visible "0 vs 19" contradiction, not just
              clutter. Gated on the same `mapFiltersRefinementCount > 0` check Finding 1's panel
              already uses: once a real filter has narrowed results, the heading is the honest
              place to state the (possibly zero) filtered count. `|| hideDuplicateCountBadge` is
              the one case this must NOT suppress: when the area-selected/school-radius states
              already hide that badge (see `hideDuplicateCountBadge`'s own doc above) because
              THIS heading is the sole place showing the count — suppressing it too there would
              leave no count visible anywhere, not just remove a duplicate. */}
          {isAgriZeroResultsSuppressed ? null : isMapZeroResults ? (
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
          ) : mapFiltersRefinementCount > 0 || hideDuplicateCountBadge ? (
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
          ) : null}
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
        isMobileMapOverlay={isMobileMapOverlay}
        isAreaRecenterButtonVisible={isAreaRecenterButtonVisible}
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
        isMobileMapOverlay={isMobileMapOverlay}
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

      {/* Step 4: Bottom-centre map tip banner pill, stacked above the count badge. Issue #2698
          fixed the mobile Map by dropping this pill entirely (its "Click …" pointer copy does
          not apply to touch). Issue #2714 — on desktop it stayed at bottom-4 left-4, sharing the
          legend's left column (overlapping it: 142x6px measured) and reaching into the centred
          count badge's column (166x14px measured, since its "Click an area marker to explore ·
          The map will zoom for you" copy is wide, up to 360px rendered).
          Live-measured (Playwright, 1440x900 and 1024x768) across every state in #2714's affected-
          states list: because this pill is centred (not left-anchored) its ~360px width reaches
          into the bottom-right column at narrower map widths (1024x768 measured a real 19-30px
          overlap against the recenter/badge/hint stack even before those moved), so horizontal
          separation alone can't be relied on — it must clear the TALLEST item in either bottom
          column vertically. The bottom-right column's tallest live-measured top edge is the
          area-recenter button at bottom-72 (+38px height = 326px from the container bottom, only
          reachable in the rare state where a school-radius "more" hint, the count badge, city
          recenter AND an out-of-view area recenter all render together); the bottom-left legend's
          tallest live-measured top edge (school-radius variant) is 178px. bottom-84 (336px) clears
          both with an 8-10px margin, confirmed 0 intersecting pairs across all measured states. */}
      {!isMapTipDismissed && !isMobileMapOverlay && (
        <div
          data-testid="discover-map-tip-pill"
          className="absolute bottom-[336px] left-1/2 z-[500] flex -translate-x-1/2 items-center gap-2 px-3 py-1.5 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-full shadow-md text-xs font-medium text-slate-700"
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
          is lifted above that control there, keeping the zoom's own 10px right inset.
          Issue #2724 (owner follow-up) — on the mobile Map's "guided-entry"/city-landing state
          `bottom-[100px]` crowded/overlapped `DiscoverMapCountBadge`'s "Showing N verified
          properties across <city>" pill directly below it (that pill's own `bottom-8` + its
          measured ~76.5px height — it wraps to 2 lines at this width — reaches up to ~108.5px
          from the bottom, above the old `bottom-[100px]` city-recenter's own floor; measured
          intersection, not assumed).
          THIS BUTTON IS UNCONDITIONAL (always mounted whenever the mobile Map is open), so it can
          coexist with EITHER the badge above (no area selected) OR `areas-recenter-button`
          (DiscoverMapSurface.tsx, `bottom-[144px]`, once an area/direction/cluster IS selected and
          panned away) — never both (the badge and that button are mutually exclusive by their own
          preconditions), but each demands a DIFFERENT safe offset: clearing the badge (~76.5px
          tall) needs >= ~118px; staying clear of the area-recenter's own 144-182px band needs
          <= ~114px. No single static value clears both (measured, not assumed — a flat
          `bottom-[130px]` was tried first and directly overlapped the area-recenter in the
          selected-area state). So the offset is keyed on `isAreaFirstSelectedAreaState` — the
          SAME flag `hideDuplicateCountBadge` above already uses for this exact badge/area-selected
          split: selected (area-recenter may be present, badge is not) keeps the original
          `bottom-[100px]`; not selected (badge may be present, area-recenter is not) raises to
          `bottom-[130px]`. Both branches measured directly with zero overlap against the badge,
          the area-recenter, the zoom control, the tip pill and the anon prompt, at 390x844,
          375x667 and 1440x900.
          Issue #2724 (owner follow-up 2) — the city-landing (not-selected) branch was still
          RIGHT-anchored (`right-[10px]`), so even with the vertical crowding fixed above, it sat
          off-centre from the badge below it rather than sharing its centreline. Re-anchored to
          centre (`left-1/2 -translate-x-1/2`, `items-center`) to match `DiscoverMapCountBadge`'s
          own `left-1/2 -translate-x-1/2` exactly. Scoped to ONLY this branch: the selected-area
          branch has no count-badge counterpart to align with (the badge and this state are
          mutually exclusive, per the doc above) and keeps its original right-anchored position —
          verified unchanged and still non-overlapping with `areas-recenter-button` (also
          right-anchored in that state) at all 3 measured widths.
          Issue #2714 — on desktop it stayed at bottom-4 right-4, which sat inside the Leaflet
          bottomright zoom control's own footprint (measured 28x19px overlap at 1440x900, over
          the "−" button). Per #2714's placement boundaries the bottom-right column stacks, bottom
          to top: attribution, zoom, this "Recenter on <city>" button, the school-radius-more-hint
          (DiscoverMapStatusHints, unchanged at bottom-28/112px), then (DiscoverMapCountBadge's
          right-anchored variant, bottom-60) the count badge, then (DiscoverMapSurface's "Recenter
          on <area>" button, bottom-72) — since the hint, this button and the badge can all render
          together in the anon school-radius "showing first N" state (live-measured), this button
          sits ABOVE the hint (live-measured height 66px at bottom-28, top edge 178px) rather than
          between it and zoom (only a 21px gap there, too tight for a 30px button + margins).
          bottom-48 (192px) clears both the zoom control (top edge 91px) and the hint (top edge
          178px) with a 14px+ margin, confirmed via Playwright across every #2714 affected state.
          Reconciled on merge with #2714: desktop now uses #2714's `bottom-48 right-4` (was
          `bottom-4 right-4`); the mobile isAreaFirstSelectedAreaState split and centring from
          #2724 are unaffected, since #2714 never touched the mobile branch.
          Issue #2724 (owner follow-up 3, desktop/mobile parity) — desktop's not-selected branch
          was still right-anchored while mobile's equivalent branch (above) is centred, and where
          mobile STACKS the centred badge above this centred button, desktop had them at different
          columns entirely (badge centred at bottom-60, this button right-anchored at bottom-48) —
          neither "same alignment as mobile" nor "side by side" as the owner asked. Fixed with an
          `isDesktopBadgePaired` split (declared just above this JSX, next to the other derived
          booleans): when a centred `DiscoverMapCountBadge` variant renders alongside this button
          on desktop, the two sit side by side on ONE shared row (`bottom-60`, badge flanking right
          `right-1/2 mr-2`, this button flanking left `left-1/2 ml-2` — DiscoverMapCountBadge.tsx
          carries the matching half of this pairing). Every other desktop state (no centred badge
          to pair with, or the selected-area state) falls back to the SAME centred/right-anchored
          shape mobile already uses for that state, so alignment matches mobile even where nothing
          needs to sit side by side.
          Issue #2724 (Finding 1, pass 3 code review) — `isDesktopBadgePaired` previously
          re-derived its own copy of DiscoverMapCountBadge's centred-variant gates instead of
          calling them, so it could silently drift from the pill's real visibility (e.g. pairing
          this button with an absent pill on fresh load or during group-loading). Fixed: it now
          calls `isDrillDownCountBadgeVisible`/`isLandingCountBadgeVisible` (exported from
          DiscoverMapCountBadge.tsx) directly, so this button and the pill's own render gate can
          never disagree.
          Issue #2724 (pass 3, area-selected desktop pairing) — this button (city-recenter) is
          NOT part of that pairing: the owner's remaining gap was between the count pill and
          "Recenter on <area>" (`areas-recenter-button`, DiscoverMapSurface.tsx), not this button.
          The selected-area branch below is intentionally UNCHANGED (`bottom-48 right-4`) — already
          measured non-overlapping against every other selected-area element, so it stays put
          rather than being repositioned for a pairing it isn't part of. */}
      <div
        className={
          isMobileMapOverlay
            ? isAreaFirstSelectedAreaState
              ? 'absolute bottom-[100px] right-[10px] z-[500] flex flex-col items-end gap-2'
              : 'absolute bottom-[130px] left-1/2 -translate-x-1/2 z-[500] flex flex-col items-center gap-2'
            : isAreaFirstSelectedAreaState
              ? 'absolute bottom-48 right-4 z-[500] flex flex-col items-end gap-2'
              : isDesktopBadgePaired
                ? 'absolute bottom-60 left-1/2 z-[500] ml-2 flex flex-col items-start gap-2'
                : 'absolute bottom-48 left-1/2 z-[500] flex -translate-x-1/2 flex-col items-center gap-2'
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
