import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import { useDiscoverPageContext } from '@/features/discover/controllers/useDiscoverPageContext';
import { useDiscoverNavigationController } from '@/features/discover/controllers/useDiscoverNavigationController';
import { useDiscoverAreaGroupsController } from '@/features/discover/controllers/useDiscoverAreaGroupsController';
import { useDiscoverAgriController } from '@/features/discover/controllers/useDiscoverAgriController';
import { useDiscoverResultsController } from '@/features/discover/controllers/useDiscoverResultsController';
import { useDiscoverBoundedBrowseController } from '@/features/discover/controllers/useDiscoverBoundedBrowseController';
import { useNearSchoolSheetState } from '@/features/discover/controllers/useNearSchoolSheetState';
import { useDiscoverMarkerController } from '@/features/discover/controllers/useDiscoverMarkerController';
import { useBoundedSearchTrigger } from '@/features/discover/controllers/useBoundedSearchTrigger';
import { useDiscoverPageStateController } from '@/features/discover/controllers/useDiscoverPageStateController';
import { useDiscoverViewportTracker } from '@/features/discover/controllers/useDiscoverViewportTracker';
import { useDiscoverGeographyController } from '@/features/discover/controllers/useDiscoverGeographyController';
import { useDiscoverMapDataController } from '@/features/discover/controllers/useDiscoverMapDataController';
import { useDiscoverSchoolController } from '@/features/discover/controllers/useDiscoverSchoolController';
import { useDiscoverBadgeController } from '@/features/discover/controllers/useDiscoverBadgeController';
import { useDiscoverJourneyChromeController } from '@/features/discover/controllers/useDiscoverJourneyChromeController';
import { useDiscoverFilterChromeController } from '@/features/discover/controllers/useDiscoverFilterChromeController';
import { useDiscoverInteractionController } from '@/features/discover/controllers/useDiscoverInteractionController';
import { useDiscoverCameraController } from '@/features/discover/controllers/useDiscoverCameraController';
import { useDiscoverMapLayerController } from '@/features/discover/controllers/useDiscoverMapLayerController';
import { useDiscoverRegionGuideController } from '@/features/discover/controllers/useDiscoverRegionGuideController';
import { useDiscoverOverviewNavigationController } from '@/features/discover/controllers/useDiscoverOverviewNavigationController';
import { useDiscoverMarkerPopoverController } from '@/features/discover/controllers/useDiscoverMarkerPopoverController';
import { useDiscoverMobilePresentationController } from '@/features/discover/controllers/useDiscoverMobilePresentationController';
import { useDiscoverDebugBridge } from '@/features/discover/controllers/useDiscoverDebugBridge';
import { buildMapSurfaceModel, buildMapSurfaceCommands } from '@/features/discover/surfaces/buildMapSurfaceModel';
import { buildPanelSurfaceModel, buildPanelSurfaceCommands } from '@/features/discover/surfaces/buildPanelSurfaceModel';
import { buildOverlaySurfaceModel, buildOverlaySurfaceCommands } from '@/features/discover/surfaces/buildOverlaySurfaceModel';
import type { DiscoverMapSurfaceView, DiscoverMapSurfaceCommands } from '@/features/discover/surfaces/buildMapSurfaceModel';
import type { DiscoverPanelSurfaceView, DiscoverPanelSurfaceCommands } from '@/features/discover/surfaces/buildPanelSurfaceModel';
import type { DiscoverOverlaySurfaceView, DiscoverOverlaySurfaceCommands } from '@/features/discover/surfaces/buildOverlaySurfaceModel';
/**
 * Issue #2142 (correction pass) — THE DISCOVER PAGE'S COMPOSITION HOOK.
 *
 * Takes zero arguments and returns everything MapDiscovery.tsx needs to
 * render. Its ONLY responsibilities are:
 *
 *   1. calling the capability controllers in dependency order,
 *   2. the unsupported-city gate,
 *   3. joining controller outputs into the three surface contracts.
 *
 * IT MUST NOT ABSORB DOMAIN LOGIC. No query semantics, no camera rules, no
 * marker rules, no URL rules, no journey business logic — and, mechanically:
 * no React hook primitives of its own (useState / useEffect / useMemo /
 * useCallback / useRef) and no direct `@/hooks/*` data-hook imports. If a
 * conditional or a derivation wants to live here, it belongs in a controller
 * (if it is a decision) or in a surface builder (if it is presentation
 * shaping). `__tests__/compositionHookScope.guard.test.ts` enforces that
 * mechanically so it cannot rot into a second god-component.
 *
 * The controller ORDER below is load-bearing and is itself under test — see
 * controllers/__tests__/controllerOrdering.contract.test.ts.
 */
export type DiscoverPageComposition =
  | { status: 'unsupported-city'; city: string }
  | {
      status: 'ready';
      shell: {
        isMobileShell: boolean;
        mobileMapOpen: boolean;
        onOpenMobileMap: () => void;
        mobileMapTriggerRef: React.RefObject<HTMLButtonElement>;
        mapContainerRef: React.RefObject<HTMLDivElement | null>;
      };
      map: { view: DiscoverMapSurfaceView; commands: DiscoverMapSurfaceCommands };
      panel: { view: DiscoverPanelSurfaceView; commands: DiscoverPanelSurfaceCommands };
      overlays: { view: DiscoverOverlaySurfaceView; commands: DiscoverOverlaySurfaceCommands };
    };

export function useDiscoverPageComposition(): DiscoverPageComposition {
  // Issue #2142 (correction pass) — every ambient provider read (router /
  // auth / toast / query client / the four DiscoverProvider facades), the map
  // container ref, and the four page-global pure-URL derivations
  // (panelContent, intentListingPurpose, isAgriJourney, urlDiscoverFilters)
  // moved verbatim into controllers/useDiscoverPageContext.ts.
  const pageContextController = useDiscoverPageContext();
  const {
    navigate,
    authLoading,
    isAuthenticated,
    toast,
    queryClient,
    nav,
    viewport,
    actions,
    mobileView,
    isMobileShell,
    setMobileView,
    mobileMapOpen,
    openMobileMap,
    mapContainerRef,
    panelContent,
    intentListingPurpose,
    isAgriJourney,
    urlDiscoverFilters,
  } = pageContextController;

  // Issue #1956 PR 6 (final cutover, RULED A1 MINIMAL, restored by the
  // [rulings.oq_a_v2] rework after the superseded Option A guard) — the ONE
  // `useAreasNavigationJourney` instance for this view. Called
  // UNCONDITIONALLY (rules of hooks); `enabled` gates its internal fetches so
  // it is a pure no-op (node=null) whenever the user is not in the
  // area-first journey. The preview-capability + areasPreview dual gate is
  // removed at cutover — canonical is now the default for
  // journey==='area-first', unconditionally, with no legacy-routing
  // exception surviving here (see `legacyAreaContextGuard.ts`'s doc —
  // `hasLegacyAreaContext` is now a click-time trigger consulted only in
  // `DiscoverRightPanelContainer.tsx`'s `handleSelectJourney`, never a
  // rendering gate). The resolved `node`/`children`/`selectNode` are threaded
  // to DiscoverRightPanelContainer AND to useDiscoverCameraOrchestration
  // below — ONE reference, never two independently-fetched copies
  // (T3/AC3.4/AC3.9). This is one of THREE identical gate sites (this file,
  // DiscoverRightPanelContainer.tsx, DiscoverMapCanvas.tsx) — see
  // DiscoverMapCanvas.tsx's own copy of this comment for why the
  // triplication is deliberate.
  // Issue #2142 Commit 3 (C2) — showAreasNavigationJourney/
  // isSchoolsNavNodeLevel, hoveredNavigationNodeKey, focusedClusterMemberAreaKeys,
  // navigationCountsFilters, and areasNavigationJourney moved verbatim into
  // controllers/useDiscoverNavigationController.ts. Called here (same early
  // position as before) because areasNavigationJourney.node feeds
  // nodeAreaPoint/isNodeAreaLeafActive below and useDiscoverMapData's nodeKey
  // param further down, both of which also need to resolve early.
  // Issue #2142 Commit 5 (team-lead ruling) — kept as ONE object (not
  // destructured away) so buildMapSurfaceModel/buildPanelSurfaceModel can
  // accept this controller's own result object directly instead of ~6
  // individually flat-named fields; individual fields are still destructured
  // below for this file's own internal use (unchanged from before).
  const navigationController = useDiscoverNavigationController({
    nav,
    goToNode: actions.goToNode,
    intentListingPurpose,
  });
  const {
    showAreasNavigationJourney,
    areasNavigationJourney,
    nodeAreaPoint,
    isNodeAreaLeafActive,
  } = navigationController;

  // Issue #2088 (commit 5) — REQUIRED CHANGE 7's reset effect (previously
  // here: `setFocusedClusterMemberAreaKeys(null)` keyed on
  // `areasNavigationJourney.node?.nodeKey`) is RETIRED. The behaviour it
  // protected — a stale member set chosen for a DIFFERENT parent node must
  // never re-apply once the user returns to any 'areas' node — is now
  // guaranteed at the URL layer instead: `state/url/navigation.ts`'s
  // `applyNodeDelta` deletes `clusterFocus` on EVERY node write (BR5), which
  // covers every path that changes `areasNavigationJourney.node.nodeKey`
  // (clicking a focused member, a breadcrumb crumb, a map destination card,
  // browser Back to a DIFFERENT node) — a strictly wider guarantee than this
  // one component-local effect gave, since it also covers `buildNodeHref`'s
  // pure href (a copied/shared link can never carry a stale focus either).
  // See `clusterFocus.ts`'s module doc for the full BR1-BR8 accounting.

  // Issue #2142 (correction pass) — selectedListingPreview moved into
  // controllers/useDiscoverMobilePresentationController.ts, the #2129
  // preview-occlusion owner and its only downstream consumer.

  // Issue #2142 (correction pass) — nodeAreaPoint and isNodeAreaLeafActive
  // (issue #1956 PR-4) moved into controllers/useDiscoverNavigationController.ts,
  // which already owns the resolved node they derive from.

  // Issue #2142 (correction pass) — useAreaGroups + focusedGroup +
  // focusedGroupAreas + groupAreaKeysForMapData + selectedGroupName (the four
  // derivations that were scattered across ~1,600 lines of this file but all
  // call the SAME resolveDiscoverGroupForAreaKey over the SAME inputs) moved
  // verbatim into controllers/useDiscoverAreaGroupsController.ts. Called at
  // useAreaGroups' own pre-refactor position; the four derivations are pure
  // useMemos/consts moved EARLIER, with no consumer in between (verified).
  const areaGroupsController = useDiscoverAreaGroupsController({
    navCity: nav.city || DEFAULT_CITY,
    groupId: nav.groupId,
    areaKey: nav.areaKey,
    journey: nav.journey,
    schoolId: nav.schoolId,
  });
  const {
    areaGroupsData,
    isLoadingAreaGroups,
    focusedGroup,
    focusedGroupAreas,
    groupAreaKeysForMapData,
  } = areaGroupsController;

  // Issue #2142 Commit 3 (C6) — corridorGroups + selectedCorridorData/
  // selectedTierData/selectedGroupAreaKeys + useAgriMapListings + agriGroupLabel
  // moved verbatim into controllers/useDiscoverAgriController.ts. Documented
  // deviation from the architect's original sketch (approved by team-lead):
  // that plan placed useRegionalAreaGroups in the Geography controller;
  // moved here instead since corridorGroups is only ever consumed by this
  // agri-specific derivation chain. selectedGroupListingItem/
  // filteredAgriListings (further below) also fold into this controller.
  const agriController = useDiscoverAgriController({
    nav,
    intentListingPurpose,
    isAuthenticated,
  });
  const {
    corridorGroups,
    isLoadingRegionalAreaGroups,
    selectedRegion,
    selectedMaxKm,
    agriMapListingsData,
  } = agriController;

  // Issue #1597 — group-results state: server-filtered listings + markers across all
  // child areas of the selected area-group. Queries gate on:
  //   1. panelContent === 'area-group-results' (avoid fetching in drill-down or other states)
  //   2. Resolved area_keys from the already-loaded areaGroupsData (prevents cold-load leak)
  //   3. area_keys.length > 0 (empty-areaKeys guard → hook's enabled guard handles 400 prevention)
  //
  // Auth split: /api/discover/listings + /api/discover/markers are auth-gated. Anonymous buyers
  // fall back to /api/discover/cities/{city}/listings (public, multi-areaKeys), with active
  // property filters applied CLIENT-SIDE via applyAnonPropertyFilters — mirroring the same
  // anon pattern used for school-first and area-first. Anon markers are derived from the
  // city-listings response (same recipe as areaMarkerListings).
  //
  // Issue #2142 Commit 3 (C3) — isGroupResultsState/resolvedGroupForResults/
  // resolvedGroupAreaKeys, the auth/anon group-results query triad, and
  // useDiscoverGroupResults moved verbatim into
  // controllers/useDiscoverResultsController.ts. Called here (same early
  // position as before, before useDiscoverPageState/`city` resolves) since
  // panelContent (used by isGroupResultsState) and areaGroupsData are both
  // already available, and urlDiscoverFilters has no dependency on `city`.
  const resultsController = useDiscoverResultsController({
    panelContent,
    city: nav.city,
    groupId: nav.groupId,
    areaGroupsData,
    intentListingPurpose,
    urlDiscoverFilters,
    isAuthenticated,
  });
  const {
    isGroupResultsState,
    groupResultsMarkers,
  } = resultsController;

  // Issue #2142 (correction pass) — the issue #2089 bounded-Browse
  // (node + nodeListings=1) node-scoped marker block, together with the
  // keyword-search state that scopes it, moved verbatim into
  // controllers/useDiscoverBoundedBrowseController.ts. Called at the same
  // position the search state already occupied; see that controller's file
  // header for why the two belong together rather than in separate files.
  const boundedBrowseController = useDiscoverBoundedBrowseController({
    city: nav.city,
    nodeListings: nav.nodeListings,
    urlQ: nav.q,
    setUrlSearch: actions.setSearchQuery,
    areasNavigationJourney,
    urlDiscoverFilters,
    intentListingPurpose,
    isAuthenticated,
  });
  const {
    debouncedSearch,
    isNodeListingsState,
    nodeListingsMarkers,
  } = boundedBrowseController;

  // Issue #2142 Commit 3 — selectedGroupListingItem/filteredAgriListings moved
  // into controllers/useDiscoverAgriController.ts (called above).

  // Issue #2142 (correction pass) — the NearSchoolSheet's open state moved into
  // controllers/useNearSchoolSheetState.ts.
  const nearSchoolSheetState = useNearSchoolSheetState();
  const { nearSchoolOpen, setNearSchoolOpen } = nearSchoolSheetState;

  // Issue #2142 Commit 3 (C7) — the EARLY marker-selection cluster
  // (selectedMarkerListing, markerPixelPos, handleSelectMarkerListing/
  // handleMarkerClickWithPosition/handlePopoverDismiss, etc. — issue #1824
  // Slice S5) moved into controllers/useDiscoverMarkerController.ts, a thin
  // wrapper over useMarkerSelection (unchanged). Does NOT include
  // resolveMarkerPopover (see that controller's own file-header comment for
  // why — same late-dependency pattern as useDiscoverJourneyTransitions).
  const markerController = useDiscoverMarkerController({
    urlActions: actions,
    urlState: { ...nav, viewport } satisfies DiscoverUrlState,
    mapContainerRef,
    // Issue #1956 PR-4 (risk R1) — the SAME leaf-identity boolean fed to the
    // page-level isMarkerPopoverEligible render gate below, so the capture
    // gate (in the hook) and the render gate can never drift on this arm.
    isNodeAreaLeaf: isNodeAreaLeafActive,
  });
  const {
    selectedMarkerListing,
    showMarkerInList,
  } = markerController;

  // Issue #2142 (correction pass) — resolvedPanelContent (issue #1374's
  // agri-detail override) moved into
  // controllers/useDiscoverPageStateController.ts, which is the only thing
  // that consumes panelContent besides this override.

  // Issue #1115 — gate the school-first /api/discover/markers fetch behind an explicit
  // user action (bounded-search CTA). Default false so the query does not auto-fire on
  // school select. Reset to false on every path that changes or clears the selected school
  // or radius (see reset calls below) to ensure the CTA re-appears on each new selection.
  //
  // Issue #1824 Slice S6 — kept HERE (page-level, not moved into
  // useDiscoverJourneyTransitions) as a documented deviation from the S6 plan: this
  // controller call must stay positioned before useDiscoverMapData below, which reads
  // boundedSearchTriggered synchronously in its markersEnabled param. Folding it into
  // the journey hook would create a circular dependency, since that hook's own moved
  // effects need useDiscoverMapData's OUTPUTS (discoverAreas/areasLoading/schoolById/
  // schoolByIdError). See useDiscoverJourneyTransitions.ts's file-header "Deviation 2"
  // comment for the full rationale. Every WRITE SITE for this flag still lives in the
  // journey hook's commands (injected setter) — only this controller call is here.
  //
  // Issue #2142 Commit 3 — moved into controllers/useBoundedSearchTrigger.ts verbatim.
  const boundedSearchController = useBoundedSearchTrigger();
  const { boundedSearchTriggered, setBoundedSearchTriggered } = boundedSearchController;

  // Issue #2142 Commit 3 (C4) — useDiscoverInteractionState/useAreaSearchState/
  // useRegionGuideState/useReducedMotion (all self-contained, no-arg) +
  // handleAreaClusterClick moved into controllers/useDiscoverMapPresentationController.ts,
  // consolidated with the recenter affordance + camera/journey-predicates/
  // map-presentation cluster into ONE call further below — see that call
  // site's own comment for why consolidation picks the latest position.

  // Issue #2142 (correction pass) — areaMarkerCounts/handleAreaMarkersComputed
  // moved into controllers/useDiscoverGeographyController.ts (how many AREA
  // markers the map actually rendered is that controller's own subject).

  // Issue #1824 Slice S7 — schoolFocusTick + schoolMarkerFocusTick now live in
  // useDiscoverCameraOrchestration; see cameraView below (called after
  // useDiscoverMapData + schoolListings + focusedGroup, which the hook needs
  // as injected deps).

  // Issue #1160 GAP 2 — Back restoration ticks (areaRestoreTick, cityRestoreTick) now
  // live in useDiscoverJourneyTransitions (Issue #1824 Slice S6) — see journeyView below.

  // Issue #2142 Commit 3 — mapBbox/bboxTimerRef/handleBoundsChange/their cleanup
  // effects/the city-change bbox-reset effect moved verbatim into
  // controllers/useDiscoverViewportTracker.ts. Called BELOW, right after `city`
  // becomes available from useDiscoverPageState — still safely before
  // useDiscoverMapData (which reads mapBbox) and useDiscoverCameraOrchestration
  // (see that hook's file-header "DEVIATION" comment, cited at this controller's
  // own call site below, for why it cannot move any later).

  // Issue #2142 (correction pass) — useDiscoverPageState, the
  // legacy/canonical AREA bridge (effectiveSelectedArea), the city-validity
  // gate, and resolvedPanelContent moved into
  // controllers/useDiscoverPageStateController.ts. That controller is the
  // SOLE producer of the bridge and deliberately does not re-expose the
  // confusable raw `selectedArea` name at all — see its file header for the
  // (four-times-recurring) bug class this closes.
  const pageStateController = useDiscoverPageStateController({
    urlState: { ...nav, viewport } satisfies DiscoverUrlState,
    urlActions: actions,
    nodeAreaPoint,
    panelContent,
    selectedMarkerListing,
  });
  const {
    filters, legacySelectedArea, panToArea, mapZoom, mapReady, showLoader,
    selectedSchool, schoolBoardFilter, city, fitTick, resetMapTick,
    pendingAreaKeyRef, initialViewportRef, initialViewportWasBareAreaRef, resolveSignal,
    setFilters, setSelectedArea, setPanToArea, setMapReady, setMapZoom,
    setShowLoader, setSchoolBoardFilter, setSelectedSchool,
    handleCityChange, handleSchoolSelect, handleFiltersChange,
    handlePolygonDrawn, handlePolygonCleared,
    handleAreaClick, handleAreaSelect, handleAreaBack,
    page,
    effectiveSelectedArea, isCityValid, resolvedPanelContent,
  } = pageStateController;

  // Issue #2142 Commit 3 — controllers/useDiscoverViewportTracker.ts, called here
  // (right after `city` becomes available) rather than at its pre-refactor position
  // (before useDiscoverPageState) — see the removed-block comment above for why this
  // repositioning is behavior-preserving (still before useDiscoverMapData/
  // useDiscoverCameraOrchestration, the only two things that read its outputs).
  const viewportTrackerController = useDiscoverViewportTracker({ mobileView, city });
  const { mapBbox } = viewportTrackerController;

  // Issue #2142 Commit 3 (C1) — region summary/summaryRegions,
  // scopeNamespaces/resolvedUrlScope (via the `listingScope` selector),
  // useRegionScopedAreaGroups, and useDiscoverAreas (discoverAreasForPanel)
  // moved verbatim into controllers/useDiscoverGeographyController.ts.
  // Called here (same position as before, after `city` resolves from
  // useDiscoverPageState) — does NOT wrap useAreaGroups (stays page-level;
  // see the controller's own file-header comment for why) or
  // useRegionalAreaGroups/corridorGroups (documented deviation ->
  // useDiscoverAgriController, second batch).
  const geographyController = useDiscoverGeographyController({
    city,
    isCityValid,
    navCity: nav.city || DEFAULT_CITY,
    scope: nav.scope,
    intentListingPurpose,
    areaGroupsData,
  });
  const {
    handleAreaMarkersComputed,
    summaryRegions,
    scopeNamespaces,
    regionScopedGroupsData,
    isLoadingRegionScopedGroups,
  } = geographyController;

  // Issue #1824 Slice S6 — composedResetMapTick + handleStartOver now live in
  // useDiscoverJourneyTransitions; see journeyView/journeyCommands below (declared
  // after useDiscoverMapData + schools, which the hook needs as injected deps).
  // The Start-Over a11y focus effect (#1817 AC8) is also declared there — it reads
  // journeyView.startOverTick and must run after the hook call is in scope.

  // Issue #2142 Commit 3 — the city-change bbox-reset effect moved into
  // controllers/useDiscoverViewportTracker.ts (called above with `city` as an input).

  // Issue #1824 Slice S7 — schoolFocusTick's writer effect now lives in
  // useDiscoverCameraOrchestration (reads selectedSchool injected below).

  // Issue #2142 (correction pass) — effectiveFilters (the AC4 area+school
  // bbox-polygon injection), the issue #1655 isTopGroupedLevel guard, the
  // useDiscoverMapData call itself, the isLoading aggregate, and the 200 ms
  // delayed-spinner effect moved verbatim into
  // controllers/useDiscoverMapDataController.ts — one capability: what map
  // data this page fetches, and whether it is still fetching it.
  const mapDataController = useDiscoverMapDataController({
    nav,
    city,
    effectiveSelectedArea,
    legacySelectedArea,
    filters,
    selectedSchool,
    debouncedSearch,
    isAuthenticated,
    fitTick,
    groupAreaKeysForMapData,
    areasNavigationJourney,
    boundedSearchTriggered,
    mapZoom,
    mapReady,
    page,
    mapBbox,
    intentListingPurpose,
    authLoading,
    setShowLoader,
  });
  const {
    areasLoading, listingDataLoading, markersLoading, isLoadingAreaListings,
    isFetching,
    discoverAreas, discoverAreasData, filteredListings,
    markerListings, areaListings, isErrorAreaListings, areaMarkerListings,
    schoolRadiusListings, schoolRadiusListingsLoading, schoolRadiusHasMore,
    activeFocusBounds, trendsAreaKeys,
    cityCenter, cityZoom, schoolById, schoolByIdError, error,
    markersTruncated, markersReturnedElements, markersTotalFilteredElements,
    agriAreasData,
    cameraIntent, publishCameraIntent, publishClusterCameraIntent,
    // Issue #1762 — splittable LISTING-cluster tap camera producer (distinct
    // from publishClusterCameraIntent, which is area clusters only).
    publishMarkerClusterCameraIntent,
    // Issue #2088 (commit 6) — the Recenter affordance's camera producer.
    publishRecenterCameraIntent,
    // Issue #1956 PR 1 (FE-3, item 2) — threaded straight into
    // useDiscoverMapLayerController and read by NOTHING else.
    visibleMemberSet,
    isLoading,
  } = mapDataController;

  // Issue #2142 Commit 3 (C4) — the "Recenter on <label>" affordance (issue
  // #2088 commit 6 — isSelectedNodeOutOfView/handleRecenterOnSelectedNode)
  // moved into controllers/useDiscoverMapPresentationController.ts,
  // consolidated with the camera/journey-predicates/map-presentation
  // cluster further below. selectedNodeBounds (previously computed here)
  // was already dead code (never read anywhere) — dropped, not moved.

  // Issue #1824 Slice S6 — the window.__debug.mapState effect (Playwright E2E contract)
  // moved a few lines down (after useDiscoverJourneyTransitions), because it now reads
  // journeyView.areaRestoreTick/cityRestoreTick. The object SHAPE is byte-identical.

  // Issue #2142 (correction pass) — urlBoardFilters (#1131),
  // hasResolvedCanonicalArea/canonicalSchoolsAreaKey/schoolsAreaKey (#2124,
  // #1798) and categoryFilters all moved INTO
  // controllers/useDiscoverSchoolController.ts. They were five page-level
  // consts whose only consumers were that controller's schools query and its
  // journey-flip guard.

  // Issue #2142 Commit 3 — useSchoolsByArea/allSchools/schools/
  // useDiscoverJourneyTransitions/useSchoolListings/useSchoolFirstCounts
  // consolidated into ONE controllers/useDiscoverSchoolController.ts call,
  // positioned below (after focusedGroup/groupListingsCount) — see that
  // call site's own comment for why this consolidation moves the call
  // later than several of these hooks' individual pre-refactor positions.

  // Issue #2142 (correction pass) — handleBoardFilterChange moved into
  // controllers/useDiscoverSchoolController.ts.

  // Issue #1824 Slice S7 — the window.__debug.mapState effect (Playwright E2E
  // contract) moved a few lines down (after useDiscoverCameraOrchestration),
  // because it now reads cameraView-derived schoolMarkerFocusTick (S7 owns
  // it; declared via the destructure above). The object SHAPE is
  // byte-identical (AC4).

  // Issue #2142 (correction pass) — handleCanonicalNodeSelect (issue #2124
  // AREA-leaf seam) and activeAreasNavigationJourney moved verbatim into
  // controllers/useDiscoverOverviewNavigationController.ts, called below
  // alongside handleOverviewAreaClick (its sibling "picked a destination off
  // the map" concern). Repositioning is behaviour-preserving: both are pure
  // useCallback/useMemo, and the only consumers of either value are the
  // map/panel prop objects at the very bottom of this file (verified — no
  // consumer exists between this position and the new one).

  // Issue #2142 (correction pass) — isLoading and the 200 ms delayed-spinner
  // effect moved into controllers/useDiscoverMapDataController.ts, next to the
  // query that produces every one of their inputs.

  // Issue #2142 (correction pass) — cityTotal and groupListingsCount moved into
  // controllers/useDiscoverBadgeController.ts, alongside every other value
  // derived from the ONE deriveDiscoverBadge() call (#1817 no-fork contract).

  // Issue #2142 Commit 3 (C5) — useSchoolsByArea + useDiscoverJourneyTransitions
  // (issue #1824 Slice S6) + useSchoolListings (Slice S11b C3) +
  // useSchoolFirstCounts (Slice S11b C5) consolidated verbatim into
  // controllers/useDiscoverSchoolController.ts. useDiscoverJourneyTransitions
  // was confirmed by team-lead (against the architect's original plan) to
  // belong here, not to the Navigation controller (see
  // useDiscoverNavigationController.ts's own file-header comment). Called
  // HERE — after focusedGroup/groupListingsCount — because
  // useSchoolFirstCounts needs `focusedGroup`, and the school block's
  // individual pre-refactor call sites were themselves already scattered
  // across this exact span; consolidating them into one call necessarily
  // picks the latest of their original positions. `schools`
  // (useSchoolsByArea + the board-filter client-side filter) and
  // `schoolsQuery` are now fully internal to this controller — no other
  // page code reads them. Still called BEFORE the page-local discoverBadge
  // useMemo below, which reads schoolListings.length (Issue #1175 v2 / #1152).
  const schoolController = useDiscoverSchoolController({
    urlState: { ...nav, viewport } satisfies DiscoverUrlState,
    urlActions: actions,
    selectedSchool,
    filters,
    setSelectedArea,
    setSelectedSchool,
    setFilters,
    setSchoolBoardFilter,
    setPanToArea,
    resetMapTick,
    pendingAreaKeyRef,
    initialViewportRef,
    initialViewportWasBareAreaRef,
    resolveSignal,
    handleSchoolSelect,
    queryClient,
    schoolById,
    schoolByIdError,
    discoverAreas,
    areasLoading,
    nav,
    areasNavigationJourney,
    handleAreaBack,
    schoolBoardFilter,
    panelContent,
    city,
    toast,
    boundedSearchTriggered,
    setBoundedSearchTriggered,
    isAuthenticated,
    areaListings,
    schoolRadiusListings,
    filteredListings,
    // Issue #2083 cycle 4 — genuinely legacy-only: every consumer in
    // schoolFirstCounts.ts early-returns unless journey === 'school-first',
    // a journey the canonical node hierarchy never sets areaKey/nodeAreaPoint
    // through, so the legacy value is correct here (verified by code review).
    selectedArea: legacySelectedArea,
    focusedGroup,
  });
  const {
    handleBoardFilterChange,
    journeyView,
    journeyCommands,
    schoolListings,
    schoolRadiusFallbackMarkers,
  } = schoolController;

  // Issue #2142 (correction pass) — the ONE deriveDiscoverBadge() call and
  // every string derived from it (#1817 no-fork contract), moved verbatim off
  // this page into controllers/useDiscoverBadgeController.ts. Called after the
  // School controller because the badge count reads schoolListings.length.
  const badgeController = useDiscoverBadgeController({
    effectiveSelectedArea,
    focusedGroup,
    groupId: nav.groupId,
    discoverAreas,
    city,
    filters,
    areaListings,
    isLoadingAreaListings,
    listingDataLoading,
    isAuthenticated,
    schoolListings,
    schoolRadiusListings,
    schoolRadiusListingsLoading,
    debouncedSearch,
    navQ: nav.q,
    intent: nav.intent,
  });
  const {
    cityTotal,
    discoverBadge,
    areaResultSummaryText,
    announcedBadgeText,
    groupSelectedBadgeCopy,
    fallbackBadgeCopy,
    schoolRadiusActive,
    schoolRadiusPillNoun,
    hasActiveAnonFilter,
  } = badgeController;

  // Issue #2142 (correction pass) — the seven pure journey-chrome predicates,
  // moved into controllers/useDiscoverJourneyChromeController.ts.
  const journeyChromeController = useDiscoverJourneyChromeController({
    nav,
    resolvedPanelContent,
    effectiveSelectedArea,
    legacySelectedArea,
    focusedGroup,
    selectedSchool,
    city,
  });
  const {
    isLandingState,
    showSchoolMarkers,
    showSchoolBreadcrumb,
    schoolRadiusOverlay,
    isSelectedGroupState,
    isAreaFirstSelectedAreaState,
  } = journeyChromeController;

  // Issue #2142 (correction pass) — the two rendered filter surfaces plus
  // issue #1854's atomic Clear-all, moved into
  // controllers/useDiscoverFilterChromeController.tsx.
  const filterChromeController = useDiscoverFilterChromeController({
    nav,
    actions,
    filters,
    setFilters,
    handleFiltersChange,
    selectedSchool,
    onSchoolSelect: journeyCommands.wrappedSchoolSelect,
    schoolBoardFilter,
    onSchoolBoardFilterChange: handleBoardFilterChange,
    city,
    effectiveSelectedArea,
    trendsAreaKeys,
    isFetching,
  });

  // Issue #2142 (correction pass) — the Start-Over a11y focus effect (#1817 AC8)
  // moved into controllers/useDiscoverSchoolController.ts, immediately after the
  // hook that owns the startOverTick it reads.

  // Issue #2142 Commit 3 (C4) — useDiscoverCameraOrchestration (issue #1823/
  // #2143 invariant owner) moved into
  // controllers/useDiscoverMapPresentationController.ts, consolidated with
  // journey-predicates/map-presentation/handleOverviewAreaClick further
  // below. The window.__debug.mapState effect (Playwright E2E contract,
  // reads this hook's schoolMarkerFocusTick/canonicalNodeFitCount outputs)
  // moves WITH it — re-declared right after the consolidated controller
  // call below, object SHAPE byte-identical (AC4).

  // Issue #1824 Slice S6 — handleRadiusChange, the school-first Back ladder
  // (handleSchoolFirstBackLevel2/1/0 + schoolFirstOnBack derivation), and
  // onClearSchool/onClearArea moved into useDiscoverJourneyTransitions above
  // (journeyCommands.changeRadius/backLevel2/backLevel1/backLevel0/clearSchool/
  // clearArea; journeyView.schoolFirstOnBack).

  // Issue #2142 (correction pass) — isAgriJourney (a pure nav derivation read
  // by three separate controllers plus both surfaces) moved into
  // controllers/useDiscoverPageContext.ts.

  // Issue #2142 (correction pass) — handleAreaFirstBack (#1157) moved into
  // controllers/useDiscoverSchoolController.ts, which already owns every piece
  // of local school state it clears.

  // Issue #1824 Slice S6 — the schoolById restore/error effects, the cityRef/urlCityRef
  // refs (FLAG-1), and the deferred areaKey hydration effect all moved into
  // useDiscoverJourneyTransitions above (called earlier in this render, right after
  // useDiscoverMapData + schools).

  // ── Group-focused map behaviour (A3 #993) ────────────────────────────────────
  //
  // When a group is selected (groupId set), two things must happen:
  //   1. Fade non-member area markers (focusedGroupAreas → AreaMarkerLayer via PropertyMap)
  //   2. fitBounds to cover all member areas — but ONLY when groupId changes and no
  //      areaKey is set. When areaKey is set, the existing per-area fitBounds applies.
  //
  // fitBounds is triggered by calling setPanToArea with a synthetic AreaPoint whose
  // bbox is the union of all member areas' bboxes. This reuses PropertyMap's existing
  // AreaPanner effect (the F7 debounce) with zero new fitBounds machinery.
  //
  // Issue #2142 (correction pass) — focusedGroupAreas moved into
  // controllers/useDiscoverAreaGroupsController.ts next to focusedGroup, the
  // value it is a one-line projection of.

  // Issue #1824 Slice S7 — the group-fit effect (prevGroupIdRef/prevAreaKeyRef),
  // the scope-fit effect (prevScopeRef), and the agri-fit effect
  // (agriGroupFocusBounds) all moved into useDiscoverCameraOrchestration
  // (called above, right after schoolListings/focusedGroup/summaryRegions
  // become available).

  // Issue #1824 Slice S6 — the handleSchoolSelect wrapper moved into
  // useDiscoverJourneyTransitions (journeyCommands.wrappedSchoolSelect).

  // Issue #1115 — stable callback for the bounded-search CTA. Issue #2142 Commit 3 —
  // moved into controllers/useBoundedSearchTrigger.ts; handleBoundedSearch is destructured
  // from that controller's call above. The undefined branch for anon users is applied at
  // the JSX call-site, not here.

  // Issue #2142 (correction pass) — handleClearAllFiltersAndSearch (#1854's
  // atomic clear), activeContextChips and filtersContent moved into
  // controllers/useDiscoverFilterChromeController.tsx.

  // Issue #2142 (correction pass) — memoizedInitialCenter/areaRestoreArea/
  // schoolMarkerPositions moved verbatim into
  // controllers/useDiscoverCameraController.ts. They are referential-identity
  // stabilisers for the three imperative panner effects (URLViewportController /
  // AreaRestorePanner / SchoolMarkerFocusPanner), so they belong with the
  // camera owner rather than in a surface builder — see that file's own
  // "IDENTITY STABILISERS" note.

  // Issue #2142 (correction pass) — trendsHref, schoolRadiusOverlay,
  // showSchoolBreadcrumb and isLandingState moved into
  // controllers/useDiscoverJourneyChromeController.ts (together with
  // showSchoolMarkers, isSelectedGroupState and isAreaFirstSelectedAreaState).

  // Issue #2142 (correction pass) — the former single
  // `useDiscoverMapPresentationController` (340 LOC / 57-field params /
  // 39-field return) is split into FIVE capability controllers, called here in
  // dependency order:
  //   1. Interaction   — hover/emphasis + area-search box + cluster-chip click.
  //                      Must never touch the camera (static guard).
  //   2. Camera        — #1823 camera-fit policy + #2143 canonical-node
  //                      cold-navigate/POP-restore. Sole importer of
  //                      useDiscoverCameraOrchestration (static guard).
  //   3. MapLayer      — journey predicates + map presentation (#1762
  //                      clustering inputs, Schools-canonical segments).
  //   4. RegionGuide   — #1808 guidance state + the deep-link-vs-pick rule.
  //                      Now called AFTER MapLayer because it owns
  //                      regionGuideVisible/regionGuideRingActive, which need
  //                      isRegionOverview; nothing consumed its outputs at its
  //                      former earlier position (verified).
  //   5. OverviewNav   — overview-area click classification (#1910) +
  //                      canonical-node select interception (#2124).
  //
  // Called HERE — this was already the latest of the late hooks' pre-refactor
  // positions (useDiscoverMapPresentation needs isLandingState/mapLayerKind,
  // the latter itself a useDiscoverJourneyPredicates output, itself needing
  // cityTotal/isAgriJourney, all only resolved by this point).
  const interactionController = useDiscoverInteractionController();
  const {
    debouncedAreaSearchQuery,
  } = interactionController;

  const cameraController = useDiscoverCameraController({
    showAreasNavigationJourney,
    areasNavigationJourney,
    mapBbox,
    publishRecenterCameraIntent,
    cameraOrchestrationUrlState: { ...nav, viewport },
    selectedSchool,
    setPanToArea,
    isLoadingAreaListings,
    discoverAreas,
    areasLoading,
    areaGroupsData,
    isLoadingAreaGroups,
    agriMapListingsData,
    cityCenter,
    focusedGroup,
    summaryRegions,
    selectedRegion,
    selectedMaxKm,
    schoolListings,
    scopeNamespaces,
    regionScopedGroupsData,
    isLoadingRegionScopedGroups,
    viewport,
    areaKey: nav.areaKey,
    discoverAreasData,
  });
  const {
    schoolMarkerFocusTick,
    canonicalNodeFitCount,
    memoizedInitialCenter,
    areaRestoreArea,
    schoolMarkerPositions,
  } = cameraController;

  const mapLayerController = useDiscoverMapLayerController({
    resolvedPanelContent,
    focusedGroup,
    effectiveSelectedArea,
    selectedSchool,
    discoverAreas,
    areasLoading,
    cityTotal,
    urlState: { ...nav, viewport } satisfies DiscoverUrlState,
    isAgriJourney,
    mapZoom,
    isLoadingAreaGroups,
    isLoadingRegionalAreaGroups,
    isLandingState,
    areaGroupsData,
    corridorGroups,
    agriAreasData,
    summaryRegions,
    cityCenter,
    debouncedAreaSearchQuery,
    city,
    selectedMarkerListing,
    scopeNamespaces,
    regionScopedGroupsData,
    visibleMemberSet,
  });
  const {
    mapLayerKind,
    mapLayerCategory,
    isTopGroupedAgri,
    isRegionOverview,
  } = mapLayerController;

  const regionGuideController = useDiscoverRegionGuideController({ isRegionOverview });
  const {
    armRegionSelect,
    regionGuideVisible,
    regionGuideRingActive,
  } = regionGuideController;

  const overviewNavigationController = useDiscoverOverviewNavigationController({
    isTopGroupedAgri,
    corridorGroups,
    scopeNamespaces,
    mapLayerKind,
    armRegionSelect,
    handleAreaClick,
    journey: nav.journey,
    areasNavigationJourney,
    discoverAreas,
    handleAreaSelect,
    actions,
  });
  const { activeAreasNavigationJourney } = overviewNavigationController;

  // Issue #2142 (correction pass) — the two window.__debug write effects moved
  // into controllers/useDiscoverDebugBridge.ts (called at the very end of the
  // controller chain, preserving their relative order and spread-merge
  // semantics — that ordering IS the Playwright contract).
  //
  // isSelectedGroupState/isAreaFirstSelectedAreaState moved into
  // controllers/useDiscoverJourneyChromeController.ts; effectiveMapLayerCategory
  // and isMarkerPopoverEligible into
  // controllers/useDiscoverMarkerPopoverController.ts.

  // Issue #2142 (correction pass) — the marker-popover capability
  // (eligibility gate, the node-leaf-aware layer recompute, resolveMarkerPopover
  // and its #2139 ordered set, the #1939 URL<->popover reconciliation effect,
  // and the #1810 stepper) moved verbatim into
  // controllers/useDiscoverMarkerPopoverController.ts.
  const markerPopoverController = useDiscoverMarkerPopoverController({
    nav,
    viewport,
    isNodeAreaLeafActive,
    mapLayerCategory,
    effectiveSelectedArea,
    isGroupResultsState,
    isNodeListingsState,
    mapZoom,
    mapReady,
    isAuthenticated,
    groupResultsMarkers,
    nodeListingsMarkers,
    markerListings,
    areaMarkerListings,
    schoolRadiusFallbackMarkers,
    isLoadingAreaListings,
    isErrorAreaListings,
    markersLoading,
    markerSelection: markerController,
  });
  const {
    isMarkerPopoverEligible,
    currentMapMarkerListings,
    markerPopoverStepper,
    handleStepMarkerListing,
  } = markerPopoverController;

  // Issue #2142 Commit 3 (C8) — the mobile Map-mode overlay shell + the #2129
  // occlusion pair. Issue #2142 (correction pass) — now ALSO owns the
  // selectedListingPreview state, and is called AFTER the marker-popover
  // controller (it consumes isMarkerPopoverEligible). Nothing between the
  // popover controller and here reads this controller's outputs (verified),
  // so the reposition is behaviour-preserving.
  const mobilePresentationController = useDiscoverMobilePresentationController({
    mobileMapOpen,
    setMobileView,
    isMarkerPopoverEligible,
  });
  const {
    selectedListingPreview,
    mobileMapTriggerRef,
    isPreviewSheetOpen,
  } = mobilePresentationController;

  // Issue #2142 (correction pass) — the window.__debug Playwright bridge.
  // Called LAST so both of its effects run after every producer they read;
  // their relative order and spread-merge semantics are the contract (see the
  // controller's own file header).
  useDiscoverDebugBridge({
    areaListings,
    areaMarkerListings,
    markerListings,
    effectiveSelectedArea,
    legacySelectedArea,
    mapZoom,
    city,
    selectedSchool,
    schoolMarkerFocusTick,
    areaRestoreTick: journeyView.areaRestoreTick,
    cityRestoreTick: journeyView.cityRestoreTick,
    canonicalNodeFitCount,
    bottomOcclusionPx: mobilePresentationController.bottomOcclusionPx,
    previewOcclusionPx: mobilePresentationController.previewOcclusionPx,
  });

  // Issue #2142 (correction pass) — selectedGroupName moved into
  // controllers/useDiscoverAreaGroupsController.ts next to focusedGroup.

  // Issue #2142 (correction pass) — regionGuideVisible/regionGuideRingActive
  // (issue #1808 deep-link-vs-pick rule) moved into
  // controllers/useDiscoverRegionGuideController.ts, next to the state they
  // read, so #1808 has exactly one owner.

  // The ONE gate this hook owns: an unsupported city has no surfaces to
  // build. Expressed as a discriminated union rather than a rendered
  // component so the composition root does the rendering and this file stays
  // JSX-free.
  if (!isCityValid) return { status: 'unsupported-city', city } as const;

  // Issue #2142 Commit 4 — one flat object matching DiscoverMapCanvasProps
  // (every field DiscoverMapMount's JSX passed straight through) plus the
  // surface-only additions (mobileMapOpen, activeAreasNavigationJourney,
  // navJourney, isPreviewSheetOpen, selectedListingPreview, mapReady,
  // isSelectedNodeOutOfView) and the 3 command-only handlers the overlays
  // group needs. Passed to BOTH buildMapSurfaceModel and
  // buildMapSurfaceCommands — each Picks only the fields it needs.
  // Issue #2142 Commit 5 (team-lead ruling) — nests the controllers' OWN
  // result objects (or small Picked subsets) instead of re-listing every
  // one of their fields individually; only genuinely page-local fields
  // (state this page owns directly, or derived consts with no controller
  // source) stay flat. buildMapSurfaceModel/buildMapSurfaceCommands
  // destructure the needed fields back out — same OUTPUT view/commands
  // shape as before, only the INPUT shape changed.
  const mapProps = {
    mapContainerRef,
    showLoader,
    error,
    currentMapMarkerListings,
    activeFocusBounds,
    filters,
    isLandingState,
    handlePolygonDrawn,
    handlePolygonCleared,
    selectedSchool,
    memoizedInitialCenter,
    cityCenter,
    cityZoom,
    publishCameraIntent,
    cameraIntent,
    focusedGroupAreas,
    selectedArea: effectiveSelectedArea,
    isGroupResultsState,
    isNodeListingsState,
    publishClusterCameraIntent,
    publishMarkerClusterCameraIntent,
    handleAreaMarkersComputed,
    onAreaVisualClusterCameraIntent: publishClusterCameraIntent,
    buildNavigationNodeHref: actions.buildNodeHref,
    setMapZoom,
    panToArea,
    setMapReady,
    showSchoolMarkers,
    schoolMarkerFocusTick,
    schoolMarkerPositions,
    areaRestoreArea,
    isAgriJourney,
    showSchoolBreadcrumb,
    focusedGroup,
    city,
    schoolRadiusOverlay,
    resolvedPanelContent,
    isSelectedGroupState,
    handleCityChange,
    regionGuideVisible,
    regionGuideRingActive,
    areaMarkerListings,
    announcedBadgeText,
    discoverBadge,
    areaResultSummaryText,
    groupSelectedBadgeCopy,
    fallbackBadgeCopy,
    isAreaFirstSelectedAreaState,
    schoolRadiusActive,
    schoolRadiusPillNoun,
    cityTotal,
    isAuthenticated,
    schoolRadiusHasMore,
    hasActiveAnonFilter,
    markersTruncated,
    markersReturnedElements,
    markersTotalFilteredElements,
    isLoading,
    mapZoom,
    isMarkerPopoverEligible,
    markerPopoverStepper,
    navigate,
    handleStepMarkerListing,
    showMarkerInList,
    // surface-only additions (not part of DiscoverMapCanvasProps)
    mobileMapOpen,
    setMobileView,
    activeAreasNavigationJourney,
    navJourney: nav.journey,
    isPreviewSheetOpen,
    selectedListingPreview,
    mapReady,
    // command-only additions the overlays group needs
    clearSelectedListing: () => actions.clearSelectedListing(),
    // controller result objects (grouped, not individually flattened)
    navigationController,
    agriController,
    schoolController,
    interactionController,
    cameraController,
    mapLayerController,
    regionGuideController,
    overviewNavigationController,
    mobilePresentationController,
    viewportTrackerController,
    markerController,
  };
  const mapView = buildMapSurfaceModel(mapProps);
  const mapCommands = buildMapSurfaceCommands(mapProps);

  // Issue #2142 (correction pass) — the panel surface's input is now the
  // CONTROLLERS' OWN result objects, not a 67-field flat literal transcribed
  // here and immediately re-grouped by the builders. Renames and derivations
  // (effectiveSelectedArea -> selectedArea, regionScopedGroupsData?.groups ->
  // regionScopedGroups, the three lifted-state setters -> their on* callback
  // names) are the BUILDER's job, so this stays reference-passing only.
  const panelProps = {
    pageContext: pageContextController,
    pageState: pageStateController,
    navigation: navigationController,
    overviewNavigation: overviewNavigationController,
    areaGroups: areaGroupsController,
    geography: geographyController,
    mapData: mapDataController,
    agri: agriController,
    results: resultsController,
    school: schoolController,
    badge: badgeController,
    journeyChrome: journeyChromeController,
    filterChrome: filterChromeController,
    interaction: interactionController,
    regionGuide: regionGuideController,
    mapLayer: mapLayerController,
    boundedBrowse: boundedBrowseController,
    boundedSearch: boundedSearchController,
    marker: markerController,
    mobilePresentation: mobilePresentationController,
  };
  const panelView = buildPanelSurfaceModel(panelProps);
  const panelCommands = buildPanelSurfaceCommands(panelProps);

  const overlayProps = {
    isAgriJourney,
    nearSchoolOpen,
    setNearSchoolOpen,
    selectedSchool,
    journeyCommands,
    filters,
    handleFiltersChange,
    schoolBoardFilter,
    handleBoardFilterChange,
    isCityValid,
    city,
  };
  const overlayView = buildOverlaySurfaceModel(overlayProps);
  const overlayCommands = buildOverlaySurfaceCommands(overlayProps);

  return {
    status: 'ready',
    shell: {
      isMobileShell,
      mobileMapOpen,
      onOpenMobileMap: openMobileMap,
      mobileMapTriggerRef,
      mapContainerRef,
    },
    map: { view: mapView, commands: mapCommands },
    panel: { view: panelView, commands: panelCommands },
    overlays: { view: overlayView, commands: overlayCommands },
  } as const;
}
