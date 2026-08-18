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
import { useDiscoverJourneySwitchController } from '@/features/discover/controllers/useDiscoverJourneySwitchController';
import { useDiscoverMarkerPopoverController } from '@/features/discover/controllers/useDiscoverMarkerPopoverController';
import { useDiscoverMobilePresentationController } from '@/features/discover/controllers/useDiscoverMobilePresentationController';
import { useDiscoverDebugBridge } from '@/features/discover/controllers/useDiscoverDebugBridge';
import { assembleDiscoverSurfaceProps } from '@/features/discover/composition/assembleDiscoverSurfaceProps';
import type { DiscoverMapSurfaceView, DiscoverMapSurfaceCommands } from '@/features/discover/surfaces/buildMapSurfaceModel';
import type { DiscoverPanelSurfaceView, DiscoverPanelSurfaceCommands } from '@/features/discover/surfaces/buildPanelSurfaceModel';
import type { DiscoverOverlaySurfaceView, DiscoverOverlaySurfaceCommands } from '@/features/discover/surfaces/buildOverlaySurfaceModel';
/**
 * THE DISCOVER PAGE'S COMPOSITION HOOK.
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
 *
 * For the history of what moved into which controller and why, see
 * `docs/architecture/frontend-page-architecture.md` §5.1.
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
  const pageContextController = useDiscoverPageContext();
  const {
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

  // The ONE `useAreasNavigationJourney` instance for this view. Called
  // UNCONDITIONALLY (rules of hooks); `enabled` gates its internal fetches so
  // it is a pure no-op (node=null) whenever the user is not in the
  // area-first journey. Canonical is the default for journey==='area-first',
  // with no legacy-routing exception surviving here — `hasLegacyAreaContext`
  // is now a click-time trigger consulted only in
  // `DiscoverRightPanelContainer.tsx`'s `handleSelectJourney`, never a
  // rendering gate. The resolved `node`/`children`/`selectNode` are threaded
  // to DiscoverRightPanelContainer AND to useDiscoverCameraOrchestration
  // below — ONE reference, never two independently-fetched copies. This is
  // one of THREE identical gate sites (this file, DiscoverRightPanelContainer.tsx,
  // DiscoverMapCanvas.tsx) — see DiscoverMapCanvas.tsx's own copy of this
  // comment for why the triplication is deliberate.
  //
  // Called here (same early position as before) because
  // areasNavigationJourney.node feeds nodeAreaPoint/isNodeAreaLeafActive
  // below and useDiscoverMapData's nodeKey param further down, both of
  // which also need to resolve early.
  //
  // Kept as ONE object (not destructured away) so buildMapSurfaceModel/
  // buildPanelSurfaceModel can accept this controller's own result object
  // directly instead of ~6 individually flat-named fields; individual
  // fields are still destructured below for this file's own internal use.
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

  // The REQUIRED CHANGE 7 reset effect that previously lived here
  // (`setFocusedClusterMemberAreaKeys(null)` keyed on
  // `areasNavigationJourney.node?.nodeKey`) is retired: the behaviour it
  // protected — a stale member set chosen for a DIFFERENT parent node must
  // never re-apply once the user returns to any 'areas' node — is now
  // guaranteed at the URL layer instead: `state/url/navigation.ts`'s
  // `applyNodeDelta` deletes `clusterFocus` on EVERY node write, which
  // covers every path that changes `areasNavigationJourney.node.nodeKey`.
  // See `clusterFocus.ts`'s module doc for the full accounting.

  // The four derivations (useAreaGroups + focusedGroup + focusedGroupAreas +
  // groupAreaKeysForMapData + selectedGroupName) all call the SAME
  // resolveActiveDiscoverGroup over the SAME groupId (Issue #2201 — groupId
  // is the sole group-identity signal, areaKey is never used to infer group
  // membership) and are pure useMemos/consts with no consumer between this
  // call and their use sites.
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
    groupAreaKeysForMapData,
  } = areaGroupsController;

  // Documented deviation (approved by team-lead) from the original
  // decomposition sketch: corridorGroups lives here rather than in the
  // Geography controller, since it is only ever consumed by this
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

  // Issue #1597 — group-results state: server-filtered listings + markers
  // across all child areas of the selected area-group; see
  // controllers/useDiscoverResultsController.ts for the query gates and the
  // auth/anon split. Called here (before useDiscoverPageState/`city`
  // resolves) because panelContent and areaGroupsData are already
  // available, and urlDiscoverFilters has no dependency on `city`.
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

  // Called at the position the search state occupied; see
  // useDiscoverBoundedBrowseController.ts's file header for why the
  // node-scoped marker block and the search state belong together.
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

  // Issue #2150 — a marker tap inside a Bounded-Browse node that is NOT a
  // resolved AREA leaf (e.g. a GROUP node reached via `node=`+`nodeListings=1`,
  // NodeListingsSurface's own state) never wrote the shared `listing` URL
  // param and was never popover-eligible, because both consumers below only
  // ever admitted `isNodeAreaLeafActive` (true for a resolved AREA leaf
  // only). NodeListingsSurface renders — and shows real property markers —
  // for ANY node once `nodeListings=1` is set, not just leaves, so a marker
  // click there must be admitted too: mobile's `selectedListingPreview`
  // (LegacyRightPanelBridge/NodeListingsSurface) and the panel's
  // selected-listing highlight both derive from `nav.selectedListing`,
  // which is only ever written by `useMarkerSelection`'s
  // `hasMarkerAreaContext` gate. Widened ONCE here (rather than at each call
  // site) so the #1956 PR-4 lock-step invariant below — capture gate and
  // render gate must never drift — holds for this arm too.
  const isNodeAreaLeafOrListingsActive = isNodeAreaLeafActive || isNodeListingsState;

  const nearSchoolSheetState = useNearSchoolSheetState();

  // Does NOT include resolveMarkerPopover — same late-dependency pattern as
  // useDiscoverJourneyTransitions; see that controller's own file-header
  // comment for why.
  const markerController = useDiscoverMarkerController({
    urlActions: actions,
    urlState: { ...nav, viewport } satisfies DiscoverUrlState,
    mapContainerRef,
    // Issue #1956 PR-4 (risk R1) — the SAME leaf-identity boolean fed to the
    // page-level isMarkerPopoverEligible render gate below, so the capture
    // gate (in the hook) and the render gate can never drift on this arm.
    // Issue #2150 — widened to also admit Bounded-Browse node-listings
    // state; see isNodeAreaLeafOrListingsActive above.
    isNodeAreaLeaf: isNodeAreaLeafOrListingsActive,
  });
  const {
    selectedMarkerListing,
  } = markerController;

  // Issue #1115 — gate the school-first /api/discover/markers fetch behind an
  // explicit user action (bounded-search CTA). Default false so the query
  // does not auto-fire on school select. Reset to false on every path that
  // changes or clears the selected school or radius (see reset calls below)
  // to ensure the CTA re-appears on each new selection.
  //
  // Kept HERE (page-level, not in useDiscoverJourneyTransitions) as a
  // documented deviation: this call must stay positioned before
  // useDiscoverMapData below, which reads boundedSearchTriggered
  // synchronously in its markersEnabled param. Folding it into the journey
  // hook would create a circular dependency, since that hook's own effects
  // need useDiscoverMapData's OUTPUTS (discoverAreas/areasLoading/
  // schoolById/schoolByIdError). See useDiscoverJourneyTransitions.ts's
  // file-header "Deviation 2" comment for the full rationale. Every WRITE
  // SITE for this flag still lives in the journey hook's commands (injected
  // setter) — only this controller call is here.
  const boundedSearchController = useBoundedSearchTrigger();
  const { boundedSearchTriggered, setBoundedSearchTriggered } = boundedSearchController;

  // controllers/useDiscoverPageStateController.ts is the SOLE producer of
  // the legacy/canonical AREA bridge (effectiveSelectedArea) and
  // deliberately does not re-expose the confusable raw `selectedArea` name
  // at all — see its file header for the (four-times-recurring) bug class
  // this closes.
  const pageStateController = useDiscoverPageStateController({
    urlState: { ...nav, viewport } satisfies DiscoverUrlState,
    urlActions: actions,
    nodeAreaPoint,
    panelContent,
    selectedMarkerListing,
  });
  const {
    filters, legacySelectedArea, mapZoom, mapReady,
    selectedSchool, schoolBoardFilter, city, fitTick, resetMapTick,
    pendingAreaKeyRef, initialViewportRef, initialViewportWasBareAreaRef, resolveSignal,
    setFilters, setSelectedArea, setPanToArea,
    setShowLoader, setSchoolBoardFilter, setSelectedSchool,
    handleSchoolSelect, handleFiltersChange,
    handleAreaClick, handleAreaSelect, handleAreaBack,
    page,
    effectiveSelectedArea, isCityValid, resolvedPanelContent,
  } = pageStateController;

  // Called here (right after `city` becomes available) rather than earlier
  // — still safely before useDiscoverMapData/useDiscoverCameraOrchestration,
  // the only two things that read its outputs.
  const viewportTrackerController = useDiscoverViewportTracker({ mobileView, city });
  const { mapBbox } = viewportTrackerController;

  // Called here (after `city` resolves from useDiscoverPageState) — does
  // NOT wrap useAreaGroups (stays page-level; see the controller's own
  // file-header comment for why) or useRegionalAreaGroups/corridorGroups
  // (documented deviation -> useDiscoverAgriController, above).
  const geographyController = useDiscoverGeographyController({
    city,
    isCityValid,
    navCity: nav.city || DEFAULT_CITY,
    scope: nav.scope,
    intentListingPurpose,
    areaGroupsData,
  });
  const {
    summaryRegions,
    scopeNamespaces,
    regionScopedGroupsData,
    isLoadingRegionScopedGroups,
  } = geographyController;

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
    schoolRadiusListings, schoolRadiusListingsLoading,
    trendsAreaKeys,
    cityCenter, schoolById, schoolByIdError,
    agriAreasData,
    // Issue #1762 — splittable LISTING-cluster tap camera producer (distinct
    // from publishClusterCameraIntent, which is area clusters only).
    // Issue #2088 (commit 6) — the Recenter affordance's camera producer.
    publishRecenterCameraIntent,
    // Issue #1956 PR 1 (FE-3, item 2) — threaded straight into
    // useDiscoverMapLayerController and read by NOTHING else.
    visibleMemberSet,
  } = mapDataController;

  // controllers/useDiscoverSchoolController.ts consolidates
  // useSchoolsByArea + useDiscoverJourneyTransitions (Issue #1824 Slice S6)
  // + useSchoolListings + useSchoolFirstCounts. Called HERE — after
  // focusedGroup — because useSchoolFirstCounts needs `focusedGroup`, and
  // must be called BEFORE the badge controller below, which reads
  // schoolListings.length (Issue #1175 v2 / #1152). `schools` and
  // `schoolsQuery` are fully internal to this controller — no other page
  // code reads them.
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
    // Issue #2183 fix cycle 2 (code review) — this single param feeds BOTH
    // useSchoolFirstCounts (journey-gated, legacy-only in practice — see that
    // hook's own comment) AND useSchoolListings' anon schoolListings branch
    // (NOT journey-gated, reachable from the canonical node= area-first +
    // school-combined state — see useDiscoverSchoolController.ts:237-239).
    // Must be effectiveSelectedArea (the node+legacy bridge), not the bare
    // legacy value, or anon area-bbox scoping is a no-op under node=.
    selectedArea: effectiveSelectedArea,
    focusedGroup,
  });
  const {
    handleBoardFilterChange,
    journeyView,
    journeyCommands,
    schoolListings,
    schoolRadiusFallbackMarkers,
  } = schoolController;

  // The ONE deriveDiscoverBadge() call and every string derived from it
  // (#1817 no-fork contract) live in controllers/useDiscoverBadgeController.ts.
  // Called after the School controller because the badge count reads
  // schoolListings.length.
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
  } = badgeController;

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
  } = journeyChromeController;

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

  // FIVE capability controllers, called here in dependency order:
  //   1. Interaction   — hover/emphasis + area-search box + cluster-chip click.
  //                      Must never touch the camera (static guard).
  //   2. Camera        — #1823 camera-fit policy + #2143 canonical-node
  //                      cold-navigate/POP-restore. Sole importer of
  //                      useDiscoverCameraOrchestration (static guard).
  //   3. MapLayer      — journey predicates + map presentation (#1762
  //                      clustering inputs, Schools-canonical segments).
  //   4. RegionGuide   — #1808 guidance state + the deep-link-vs-pick rule.
  //                      Called AFTER MapLayer because it owns
  //                      regionGuideVisible/regionGuideRingActive, which need
  //                      isRegionOverview.
  //   5. OverviewNav   — overview-area click classification (#1910) +
  //                      canonical-node select interception (#2124).
  //
  // Called HERE because useDiscoverMapPresentation needs isLandingState/
  // mapLayerKind, the latter itself a useDiscoverJourneyPredicates output,
  // itself needing cityTotal/isAgriJourney, all only resolved by this point.
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

  // Issue #2142 SOLID follow-up (commit 2) — the JourneySwitcher write path
  // (`handleSelectJourney`), lifted out of DiscoverPanelSurface.tsx. Called
  // HERE because it reads `activeAreasNavigationJourney` — the SAME object the
  // panel renders from, so its #2124 server-owned AREA identity can never come
  // from a second copy.
  const journeySwitchController = useDiscoverJourneySwitchController({
    nav,
    actions,
    areasNavigationJourney: activeAreasNavigationJourney,
    toast,
  });

  // The marker-popover capability: eligibility gate, the node-leaf-aware
  // layer recompute, resolveMarkerPopover and its #2139 ordered set, the
  // #1939 URL<->popover reconciliation effect, and the #1810 stepper.
  const markerPopoverController = useDiscoverMarkerPopoverController({
    nav,
    viewport,
    // Issue #2150 — same widened boolean fed to useDiscoverMarkerController
    // above, so the capture gate and this render gate never drift (the
    // #1956 PR-4 lock-step invariant) for Bounded-Browse node-listings state.
    isNodeAreaLeafActive: isNodeAreaLeafOrListingsActive,
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
  } = markerPopoverController;

  // The mobile Map-mode overlay shell + the #2129 occlusion pair; also owns
  // selectedListingPreview state. Called AFTER the marker-popover
  // controller because it consumes isMarkerPopoverEligible.
  const mobilePresentationController = useDiscoverMobilePresentationController({
    mobileMapOpen,
    setMobileView,
    isMarkerPopoverEligible,
  });
  const {
    mobileMapTriggerRef,
  } = mobilePresentationController;

  // The window.__debug Playwright bridge. Called LAST so both of its
  // effects run after every producer they read; their relative order and
  // spread-merge semantics are the contract (see the controller's own file
  // header).
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

  // The ONE gate this hook owns: an unsupported city has no surfaces to
  // build. Expressed as a discriminated union rather than a rendered
  // component so the composition root does the rendering and this file stays
  // JSX-free.
  if (!isCityValid) return { status: 'unsupported-city', city } as const;

  // Issue #2142 SOLID follow-up (commit 3) — the three surface-prop literals
  // and the six builder calls that used to sit here are pure, hook-free object
  // assembly, so they moved VERBATIM to
  // `composition/assembleDiscoverSurfaceProps.ts`. This hook's remaining job is
  // exactly its stated one: call the controllers in order, apply the
  // unsupported-city gate, and hand the controller registry to the assembler.
  const { mapView, mapCommands, panelView, panelCommands, overlayView, overlayCommands } =
    assembleDiscoverSurfaceProps({
      pageContextController,
      navigationController,
      areaGroupsController,
      agriController,
      resultsController,
      boundedBrowseController,
      nearSchoolSheetState,
      markerController,
      boundedSearchController,
      pageStateController,
      viewportTrackerController,
      geographyController,
      mapDataController,
      schoolController,
      badgeController,
      journeyChromeController,
      filterChromeController,
      interactionController,
      cameraController,
      mapLayerController,
      regionGuideController,
      overviewNavigationController,
      journeySwitchController,
      markerPopoverController,
      mobilePresentationController,
    });

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
