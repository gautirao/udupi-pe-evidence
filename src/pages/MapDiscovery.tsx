import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { computeZoneLabelPoints } from '@/lib/schoolZoneLabels';
import type { AreaPoint, AreaMarkerClusterInfo } from '@/components/map/AreaMarkerLayer';
import { MapFilters } from '@/components/map/MapFilters';
import {
  isSchoolRadiusOverlayState,
  prettifyZoneSlug,
} from '@/components/discover/SchoolRadiusMapOverlay';
import { ActiveContextChips } from '@/components/discover/ActiveContextChips';
import { AREA_LAYER_MAX_ZOOM, shouldShowMarkers } from '@/lib/map/zoomPolicy';
// Issue #2142 Commit 2 — repointed from the deprecated '@/utils/...' shims
// (both marked `@deprecated`, slated for a future shim-sweep issue) to the
// selectors/ re-export, which points straight at the canonical module.
import type { DiscoverPanelContent } from '@/features/discover/selectors/panelContent';
import {
  computeDiscoverLayer,
  toLayerInput,
  selectDiscoverMapLayer,
  resolveDiscoverGroupForAreaKey,
  type DiscoverMapLayerKind,
} from '@/features/discover/selectors/mapLayerCategory';
import { CityNotSupported } from '@/components/discover/CityNotSupported';
import { useDiscoverSearchState } from '@/features/discover/state/useDiscoverSearchState';
import { resolveMarkerPopover } from '@/features/discover/map/resolveMarkerPopover';
import { useDiscoverBadgeAnnounce } from '@/features/discover/presentation/useDiscoverBadgeAnnounce';
import { useAuth } from '@/contexts/AuthContext';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import {
  useDiscoverActions,
  useDiscoverNav,
  useDiscoverShell,
  useDiscoverViewport,
} from '@/features/discover/context/useDiscoverContext';
import { useDiscoverPageState } from '@/hooks/useDiscoverPageState';
import { useDiscoverMapData } from '@/hooks/useDiscoverMapData';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';
import { useAreaGroups, type AreaGroup } from '@/hooks/useAreaGroups';
// Issue #2142 Commit 2 — repointed to the selectors/ re-export (thin wrap
// over presentation/resolveScope.ts; see selectors/listingScope.ts's own
// doc for why the shared module itself isn't physically moved).
import { resolveScope } from '@/features/discover/selectors/listingScope';
import { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';
import { useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';
import { filteredMarkerToPropertyListing } from '@/lib/discoverMappers';
import { CITY_CONFIG, DEFAULT_CITY } from '@/lib/localityUtils';
import { slugifyFromAreaKey } from '@/lib/areaSlug';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { DiscoverMapSurface } from '@/features/discover/surfaces/DiscoverMapSurface';
import { buildMapSurfaceView, buildMapSurfaceCommands } from '@/features/discover/surfaces/buildMapSurfaceView';
import { DiscoverPanelSurface } from '@/features/discover/surfaces/DiscoverPanelSurface';
import { buildPanelSurfaceView, buildPanelSurfaceCommands } from '@/features/discover/surfaces/buildPanelSurfaceView';
import { DiscoverOverlaySurface } from '@/features/discover/surfaces/DiscoverOverlaySurface';
import { buildOverlaySurfaceView, buildOverlaySurfaceCommands } from '@/features/discover/surfaces/buildOverlaySurfaceView';
import { DiscoverPageShell } from '@/features/discover/surfaces/DiscoverPageShell';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
// Issue #2142 Commit 2 — repointed to the selectors/ re-export (thin wrap
// over presentation/discoverBadge.ts, per team-lead decision: do not move
// the shared module itself, see selectors/badgeCopy.ts's own doc).
import {
  deriveDiscoverBadge,
  formatDiscoverBadgeCopy,
} from '@/features/discover/selectors/badgeCopy';
import { deriveAreaPointFromNode } from '@/features/discover/navigation/nodeAreaPoint';
import { isMarkerPopoverEligible as computeMarkerPopoverEligible } from '@/features/discover/navigation/markerPopoverEligibility';
import {
  deriveShowSchoolMarkers,
  deriveSchoolRadiusPillNoun,
} from '@/features/discover/presentation/schoolFirstCounts';
import {
  hasActiveAnonPropertyFilter,
} from '@/features/discover/presentation/anonPropertyFilters';
// Issue #2142 Commit 2 — moved unchanged into src/features/discover/selectors/.
import { resolveEffectiveSelectedArea } from '@/features/discover/selectors/effectiveArea';
import { resolveIsSelectedGroupState } from '@/features/discover/selectors/displayEligibility';
import { resolveNodeListingsAnonMarkers } from '@/features/discover/adapters/anonMarkerAdapter';
import { buildCityListingsQueryParams } from '@/features/discover/adapters/cityListingsQueryParams';
import { useDiscoverViewportTracker } from '@/features/discover/controllers/useDiscoverViewportTracker';
import { useBoundedSearchTrigger } from '@/features/discover/controllers/useBoundedSearchTrigger';
import { useDiscoverNavigationController } from '@/features/discover/controllers/useDiscoverNavigationController';
import { useDiscoverResultsController } from '@/features/discover/controllers/useDiscoverResultsController';
import { useDiscoverGeographyController } from '@/features/discover/controllers/useDiscoverGeographyController';
import { useDiscoverAgriController } from '@/features/discover/controllers/useDiscoverAgriController';
import { useDiscoverMarkerController } from '@/features/discover/controllers/useDiscoverMarkerController';
import { useDiscoverMobilePresentationController } from '@/features/discover/controllers/useDiscoverMobilePresentationController';
import { useDiscoverSchoolController } from '@/features/discover/controllers/useDiscoverSchoolController';
import { useDiscoverInteractionController } from '@/features/discover/controllers/useDiscoverInteractionController';
import { useDiscoverCameraController } from '@/features/discover/controllers/useDiscoverCameraController';
import { useDiscoverMapLayerController } from '@/features/discover/controllers/useDiscoverMapLayerController';
import { useDiscoverRegionGuideController } from '@/features/discover/controllers/useDiscoverRegionGuideController';
import { useDiscoverOverviewNavigationController } from '@/features/discover/controllers/useDiscoverOverviewNavigationController';

export default function MapDiscovery() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  // Issue #1953 (build step 2) — MapDiscovery is no longer a production caller
  // of useDiscoverUrlState(); it consumes the DiscoverProvider facade instead
  // (team-lead-plan.toml decisions.D1_facade.sole_caller). Issue #2003 PR4
  // (rework) — the former flat accessor call sites below have been migrated
  // to nav / viewport / actions directly. Issue #2004 PR5 — the remaining
  // whole-object consumers (useMarkerSelection, useDiscoverPageState,
  // useDiscoverJourneyTransitions, useDiscoverCameraOrchestration,
  // toLayerInput, etc.) now each build their own `{ ...nav, viewport }
  // satisfies DiscoverUrlState` inline at the call site — there is no
  // module-level shim reconstructing the whole object; nav/viewport/actions
  // remain all sourced from the one provider-owned useDiscoverUrlState() call.
  const nav = useDiscoverNav();
  const viewport = useDiscoverViewport();
  const actions = useDiscoverActions();
  // Issue #1953 (build step 3, RH4 narrowed) — mobileView only, to key the
  // bboxTimerRef clear-on-leave-MAP effect below.
  // Build step 4 — isMobileShell/setMobileView now also read here, to drive
  // the mobile List<->Map full-screen-overlay shell around the DiscoverMapMount
  // call site below.
  const { mobileView, isMobileShell, setMobileView } = useDiscoverShell();
  const mobileMapOpen = isMobileShell && mobileView === 'MAP';
  // Issue #2142 Commit 3 (C8) — useMobileMapOverlayShell's call site moved
  // down into controllers/useDiscoverMobilePresentationController.ts (called
  // later, alongside the occlusion pair, which needs isMarkerPopoverEligible
  // — itself only available late). No early consumer reads mobileMapTriggerRef
  // between here and there (verified), so this repositioning is
  // behavior-preserving. mobileMapOpen itself stays computed HERE because
  // useDiscoverViewportTracker (called further below) already depends on
  // `mobileView` as an input.
  const isAuthenticated = !authLoading && user !== null;
  // Issue #1160 v3 Bug A1 — TanStack Query client used to read cached useSchoolById
  // result synchronously inside handleSelectSchoolById. See that callback for details.
  const queryClient = useQueryClient();

  // Issue #1745 P2 — routed through the layer-registry façade (discoverLayerRegistry.ts)
  // rather than calling derivePanelContent directly. computeDiscoverLayer delegates to
  // derivePanelContent by construction, so this is behaviour-preserving.
  const panelContent = computeDiscoverLayer(toLayerInput({ ...nav, viewport } satisfies DiscoverUrlState));

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
  // Issue #1494 — map URL intent ('buy'|'rent') to backend listingPurpose
  // ('sale'|'rent'). 'buy' is the default; absent/invalid intent → 'sale'.
  // Never send 'buy' to the backend. Page-global (needed by geography/
  // results/school/agri controllers too), so it stays a plain page-local
  // derivation rather than living inside any one controller.
  const intentListingPurpose: string = nav.intent === 'rent' ? 'rent' : 'sale';

  // Issue #2142 Commit 3 (C2) — showAreasNavigationJourney/
  // isSchoolsNavNodeLevel, hoveredNavigationNodeKey, focusedClusterMemberAreaKeys,
  // navigationCountsFilters, and areasNavigationJourney moved verbatim into
  // controllers/useDiscoverNavigationController.ts. Called here (same early
  // position as before) because areasNavigationJourney.node feeds
  // nodeAreaPoint/isNodeAreaLeafActive below and useDiscoverMapData's nodeKey
  // param further down, both of which also need to resolve early.
  // Issue #2142 Commit 5 (team-lead ruling) — kept as ONE object (not
  // destructured away) so buildMapSurfaceView/buildPanelSurfaceView can
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
    hoveredNavigationNodeKey,
    setHoveredNavigationNodeKey,
    focusedClusterMemberAreaKeys,
    setFocusedClusterMemberAreaKeys,
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

  // Issue #1956 PR-5 (Slice 5, AC5.10/AC5.10c) — the mobile Map-mode preview
  // sheet's data. Reported UP by DiscoverAreasJourneyPanel's own
  // AreaLeafListingsSurface (via DiscoverRightPanelContainer's
  // onSelectedListingPreviewChange), which derives it from its own
  // ALREADY-FETCHED DiscoverCityListingItem[] — this page issues NO second
  // query and does not re-derive the preview itself. Plain useState (never
  // the URL): the underlying selection is URL-backed (`nav.selectedListing`,
  // OQ6 ruling — KEEP the existing listing= PUSH peek), so this state is a
  // pure, harmless PROJECTION of that URL value re-synced by the panel's own
  // effect whenever nav.selectedListing/the area's result set changes; it is
  // never itself written to the URL/history. Distinct from the cluster-focus
  // state above — this addition does not touch that state or its clearing
  // effect.
  const [selectedListingPreview, setSelectedListingPreview] =
    useState<SelectedListingPreview | null>(null);

  // Issue #1956 PR-4 (Option C) — pure bridge: the resolved canonical AREA
  // leaf -> an in-memory AreaPoint, feeding the EXISTING selectedArea-driven
  // listing/marker/popover machinery (see nodeAreaPoint.ts's module doc for
  // the full transitional-state contract). Only ever non-null while the
  // canonical Areas journey is active AND resolved to an AREA leaf — every
  // legacy areaKey-driven journey sees `null` here, unchanged.
  const nodeAreaPoint = useMemo(
    () => (showAreasNavigationJourney ? deriveAreaPointFromNode(areasNavigationJourney.node) : null),
    [showAreasNavigationJourney, areasNavigationJourney.node],
  );
  // Issue #1956 PR-4 — the ONE leaf-identity boolean shared by the
  // layer-registry containment field (below), the widened
  // isMarkerPopoverEligible render gate, and useMarkerSelection's capture
  // gate/URL-write gate (risk R1 — these MUST move in lock-step).
  //
  // FIX CYCLE 2 (opus review, blocking Finding 1) — this MUST derive from
  // `nodeAreaPoint != null`, not from `isResolvedAreaLeafNode` alone.
  // `isResolvedAreaLeafNode` only checks `nodeType === 'AREA' && areaKey !=
  // null`; it says nothing about `bounds`, which is independently nullable
  // (`NavigationBounds | null`, navigation/types.ts) and whose
  // centreLat/centreLon are themselves independently nullable. A resolved
  // AREA leaf with `bounds: null` (or a bounds object with a null centre)
  // satisfied the old `isResolvedAreaLeafNode` check while `nodeAreaPoint`
  // (nodeAreaPoint.ts, transitional states (c)/(d)) was already null for it
  // — so this boolean and the bridge disagreed, admitting the marker
  // popover and the 'all-areas' layer category with NO area context to back
  // them.
  //
  // Deliberate choice for the bounds-less leaf: it stays a NON-LEAF for
  // every purpose this boolean gates (popover eligibility, layer category,
  // URL-write gate) rather than rendering a partial/degraded listing
  // surface. Rationale: `nodeAreaPoint.ts` already treats a bounds-less
  // resolved AREA leaf as "no safe AreaPoint" (its own module doc, (c)/(d))
  // because `AreaPoint.geo_center_lat/lon` are non-nullable — there is no
  // safe centre to fit the map to or scope a listings query with. Treating
  // it as a leaf here would admit `effectiveMapLayerCategory ===
  // 'all-areas'` and a `listing=` URL write while every downstream
  // consumer that actually NEEDS geo data (fitBounds, area-scoped
  // listings) still has nothing to work with — worse than the current
  // "falls back to area-group-bubbles" state, which is at least a coherent,
  // navigable UI. `nodeAreaPoint != null` already implies
  // `isResolvedAreaLeafNode` (it calls that predicate internally), so this
  // is strictly narrower and requires no new import.
  const isNodeAreaLeafActive =
    showAreasNavigationJourney && nav.journey === 'area-first' && nodeAreaPoint != null;

  // Issue #1597 — early derivation of PropertyFilters from URL state, available before
  // useDiscoverPageState is called. Used by the group-results listings query so it respects
  // active discover filters (propertyTypes, price, bedrooms, etc.).
  // Mirrors the nav.filters → PropertyFilters mapping in useDiscoverPageState's useState
  // initializer. dateFrom/dateTo are ISO strings in URL state; PropertyFilters expects Date.
  // schoolLat/schoolLon/polygon are NOT included: group-results is not a school or polygon state.
  const urlDiscoverFilters: PropertyFilters = useMemo(() => {
    const f = nav.filters;
    return {
      propertyTypes: f.propertyTypes as PropertyFilters['propertyTypes'],
      bedrooms: f.bedrooms,
      priceMin: f.priceMin,
      priceMax: f.priceMax,
      sellerTypes: f.sellerTypes,
      boardFilters: f.boardFilters,
      categoryFilters: f.categoryFilters,
      backOnMarket: f.backOnMarket,
      newToMarket: f.newToMarket,
      reraRegistered: f.reraRegistered,
      readyToMove: f.readyToMove,
      dateFrom: f.dateFrom ? new Date(f.dateFrom) : undefined,
      dateTo: f.dateTo ? new Date(f.dateTo) : undefined,
    };
  // nav.filters object identity changes on every URL change — use the individual
  // scalar fields as deps so React can skip re-derivation when nothing changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nav.filters.propertyTypes,
    nav.filters.bedrooms,
    nav.filters.priceMin,
    nav.filters.priceMax,
    nav.filters.sellerTypes,
    nav.filters.boardFilters,
    nav.filters.categoryFilters,
    nav.filters.backOnMarket,
    nav.filters.newToMarket,
    nav.filters.reraRegistered,
    nav.filters.readyToMove,
    nav.filters.dateFrom,
    nav.filters.dateTo,
  ]);

  // Fetch area groups for the current city.
  // The hook's enabled guard (city.length > 0) prevents fetching on empty city.
  // Issue #1745 Batch B map-hierarchy fix — pass the DEFAULTED city (matching
  // useDiscoverPageState's `nav.city || DEFAULT_CITY`), not the raw
  // nav.city. At plain /discover (no ?city= param) nav.city is '',
  // which previously left this hook disabled (no groups) while the panel showed
  // the defaulted city's region cards — a landing-vs-panel mismatch that made
  // macro-region-bubbles fall back to the full liveAreas pill set. Falling back
  // to DEFAULT_CITY here does NOT reintroduce the stale-data window this comment
  // used to warn about — that contrast was raw nav.city vs a conditional ''
  // placeholder, not vs `|| DEFAULT_CITY`, which resolves to the same city the
  // panel already renders.
  const {
    data: areaGroupsData,
    isLoading: isLoadingAreaGroups,
  } = useAreaGroups(nav.city || DEFAULT_CITY);

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
    isRegionalAreaGroupsError,
    refetchRegionalAreaGroups,
    selectedRegion,
    selectedMaxKm,
    agriMapListingsData,
    isLoadingAgriGroupListings,
    isAgriGroupListingsError,
    refetchAgriGroupListings,
    agriGroupLabel,
    selectedGroupListingItem,
    filteredAgriListings,
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
  const {
    isGroupResultsState,
    resolvedGroupForResults,
    resolvedGroupAreaKeys,
    groupResultsListings,
    groupResultsTotalElements,
    isLoadingGroupResults,
    isGroupResultsError,
    refetchGroupResults,
    groupResultsMarkers,
  } = useDiscoverResultsController({
    panelContent,
    city: nav.city,
    groupId: nav.groupId,
    areaGroupsData,
    intentListingPurpose,
    urlDiscoverFilters,
    isAuthenticated,
  });

  // ── Issue #2089 — bounded Browse (node + nodeListings=1) node-scoped markers ──
  // Mirrors the isGroupResultsState pattern directly above: this branch has
  // first-priority in resolveMarkerListings (before journey/selectedArea) so a
  // bounded node whose scope isn't a single "selectedArea" (e.g. a group/region
  // node with multiple descendantAreaKeys) never falls through to the unscoped
  // city-wide markerListings tail branch — the exact silent scope leak this
  // selector's frozen-contract comment warns about.
  // Issue #1824 Slice S4 — search-keyword state (searchQuery/debouncedSearch,
  // reverse URL-sync, 250ms debounce, handleSearchChange) now lives in
  // useDiscoverSearchState. See the hook's header comment for the KNOWN,
  // INTENTIONAL split-brain (debouncedSearch drives badge+markers here;
  // nav.q drives ActiveContextChips) — do NOT unify. Declared here (moved up from
  // its original post-node-listings-marker-fetch position) so debouncedSearch is
  // available to the bounded-Browse marker-fetch calls below (Issue #2089 fix-cycle
  // PR #2141 finding 1 — Map markers must share the same debounced search term as
  // the List surface's own useDiscoverSearchState call, both driven by the same nav.q).
  const { searchQuery, debouncedSearch, handleSearchChange } =
    useDiscoverSearchState({ urlQ: nav.q, setUrlSearch: actions.setSearchQuery });

  const isNodeListingsState = !!nav.nodeListings;
  const nodeListingsAreaKeys: string[] = useMemo(() => {
    if (!isNodeListingsState) return [];
    const node = areasNavigationJourney.node;
    if (!node) return [];
    if (node.descendantAreaKeys && node.descendantAreaKeys.length > 0) return node.descendantAreaKeys;
    return node.areaKey ? [node.areaKey] : [];
  }, [isNodeListingsState, areasNavigationJourney.node]);

  // Authenticated path: /api/discover/markers (full predicate, list+map consistent).
  // Issue #2087/#2089 code-review fix — scope via the canonical `nodeKey` param
  // (server-side hierarchy resolution), NOT client-derived `areaKeys`, so this
  // query shares the exact same scope-derivation mechanism as
  // NodeListingsSurface.tsx's authenticated List query (`useDiscoverListings`
  // called with `nodeKey: node.nodeKey`, no areaKeys). Two mechanisms deriving
  // "the same" scope independently risked Map silently under/over-scoping if
  // `descendantAreaKeys` ever drifted from the backend's own hierarchy
  // resolution. `enabled` additionally requires the node to have resolved
  // (mirrors the previous empty-areaKeys guard's loading-race handling) so an
  // unresolved node never fires an unscoped, city-wide-leaking request.
  const { data: nodeListingsMarkersData } = useDiscoverFilteredMarkers(
    nav.city,
    urlDiscoverFilters,
    isNodeListingsState && isAuthenticated && !!areasNavigationJourney.node?.nodeKey,
    null,        // bbox — no viewport clipping for bounded Browse
    // Issue #2089 fix-cycle (PR #2141 finding 1) — thread the same debounced search
    // term the List surface (NodeListingsSurface.tsx) sends to its own bounded-Browse
    // fetch, so a typed search narrows the Map markers exactly like it narrows the List.
    debouncedSearch?.trim() || undefined,
    intentListingPurpose,
    undefined,   // excludePropertyType — not applicable
    undefined,   // areaKeys — intentionally omitted; nodeKey below is the canonical scope
    areasNavigationJourney.node?.nodeKey,
  );

  // Anonymous path: /api/discover/cities/{city}/listings (public, multi-areaKeys
  // teaser). This endpoint has no nodeKey-based scoping support, so it
  // structurally still needs client-derived areaKeys — the same divergence
  // NodeListingsSurface.tsx's own anon fallback (`nodeAreaKeys`) accepts for
  // its equivalent public-teaser query.
  const { data: nodeListingsAnonData } = useDiscoverCityListings(
    buildCityListingsQueryParams(
      nav.city,
      isNodeListingsState && !isAuthenticated ? nodeListingsAreaKeys : [],
      urlDiscoverFilters,
      intentListingPurpose,
      // Issue #2089 fix-cycle (PR #2141 finding 1) — see the auth call above for rationale.
      debouncedSearch?.trim() || undefined,
    ),
  );

  // Unified node-listings marker surface (auth or anon). [] while resolving or
  // when the node genuinely has no listings — same empty-areaKeys-guard shape
  // as groupResultsMarkers above (never an unscoped city-wide flash).
  //
  // Issue #2142 Commit 2 — the anon branch (issue #2089's lat/lon ->
  // latitude/longitude fallback fix) moved verbatim into
  // adapters/anonMarkerAdapter.ts's resolveNodeListingsAnonMarkers. See that
  // file's header comment for why it was NOT converged with
  // useDiscoverGroupResults.ts's sibling anon-marker derivation (R7
  // differential test proved they diverge; useDiscoverGroupResults.ts is
  // untouched, outside this commit's allowed_files).
  const nodeListingsMarkers = useMemo(() => {
    if (!isNodeListingsState) return [];
    if (isAuthenticated) {
      if (!nodeListingsMarkersData?.markers) return [];
      const now = new Date().toISOString();
      return nodeListingsMarkersData.markers.map((m) => filteredMarkerToPropertyListing(m, now));
    }
    return resolveNodeListingsAnonMarkers(nodeListingsAnonData, new Date().toISOString());
  }, [isNodeListingsState, isAuthenticated, nodeListingsMarkersData, nodeListingsAnonData]);

  // Issue #2142 Commit 3 — selectedGroupListingItem/filteredAgriListings moved
  // into controllers/useDiscoverAgriController.ts (called above).

  const [nearSchoolOpen, setNearSchoolOpen] = useState(false);

  // a3 — map container ref for MarkerPopoverCard auto-positioning (clamp-to-bounds).
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

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
    markerPixelPos,
    handleSelectMarkerListing,
    handleMarkerClickWithPosition,
    handlePopoverDismiss,
    selectMarkerSibling,
    showMarkerInList,
    clearSelectedMarkerListing,
    clearMarkerPopoverFromUrl,
    isMarkerPopoverUrlBacked,
    hydrateSelectedMarkerFromUrl,
  } = markerController;

  // Issue #1374 — override panelContent to 'agri-detail' while an agri polygon is
  // selected. Confined to 'agri-selected' (not 'agri-landing') so a stale
  // selectedMarkerListing from a previous area visit cannot drive the detail panel
  // over the landing screen. URL state (areaKey/journey) is intentionally NOT cleared.
  const resolvedPanelContent: DiscoverPanelContent =
    selectedMarkerListing != null && panelContent === 'agri-selected'
      ? 'agri-detail'
      : panelContent;

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
  const { boundedSearchTriggered, setBoundedSearchTriggered, handleBoundedSearch } =
    useBoundedSearchTrigger();

  // Issue #2142 Commit 3 (C4) — useDiscoverInteractionState/useAreaSearchState/
  // useRegionGuideState/useReducedMotion (all self-contained, no-arg) +
  // handleAreaClusterClick moved into controllers/useDiscoverMapPresentationController.ts,
  // consolidated with the recenter affordance + camera/journey-predicates/
  // map-presentation cluster into ONE call further below — see that call
  // site's own comment for why consolidation picks the latest position.

  // "Showing X of N areas on the map" — sourced from AreaMarkerLayer's own
  // onMarkersComputed callback (never fetched/fabricated independently).
  const [areaMarkerCounts, setAreaMarkerCounts] = useState<{ shown: number; total: number }>({
    shown: 0,
    total: 0,
  });
  const handleAreaMarkersComputed = useCallback((shown: number, total: number) => {
    setAreaMarkerCounts((prev) => (prev.shown === shown && prev.total === total ? prev : { shown, total }));
  }, []);

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

  const {
    filters, selectedArea: legacySelectedArea, panToArea, mapZoom, mapReady, showLoader,
    selectedSchool, schoolBoardFilter, city, fitTick, resetMapTick,
    pendingAreaKeyRef, initialViewportRef, initialViewportWasBareAreaRef, resolveSignal,
    setFilters, setSelectedArea, setPanToArea, setMapReady, setMapZoom,
    setFitTick, setShowLoader, setSchoolBoardFilter, setSelectedSchool,
    handleCityChange, handleSchoolSelect, handleFiltersChange,
    handlePolygonDrawn, handlePolygonCleared,
    handleAreaClick, handleAreaSelect, handleAreaBack,
    page, setPage,
  } = useDiscoverPageState({ urlState: { ...nav, viewport } satisfies DiscoverUrlState, urlActions: actions });

  // Issue #2142 Commit 3 — controllers/useDiscoverViewportTracker.ts, called here
  // (right after `city` becomes available) rather than at its pre-refactor position
  // (before useDiscoverPageState) — see the removed-block comment above for why this
  // repositioning is behavior-preserving (still before useDiscoverMapData/
  // useDiscoverCameraOrchestration, the only two things that read its outputs).
  const viewportTrackerController = useDiscoverViewportTracker({ mobileView, city });
  const { mapBbox, handleBoundsChange } = viewportTrackerController;

  // Issue #1956 PR-4 (Option C) — bridges nodeAreaPoint into every existing
  // selectedArea-driven gate/consumer. Falls back to the legacy
  // areaKey-driven `selectedArea` FIRST, so nothing changes for any
  // pre-existing journey; `nodeAreaPoint` is only non-null while the
  // canonical `node=` journey is active and resolved to an AREA leaf, so the
  // two sources can never both be non-null for the same render (the legacy
  // journeys never set nav.node, and the node journey never sets nav.areaKey
  // — see [scope.three_areakeys]).
  // Issue #2083 (code-review Finding 1) — extracted to the exported, pure
  // `resolveEffectiveSelectedArea` (named export above, this file) so the
  // badge-bridge regression test can exercise this REAL production
  // expression instead of re-deriving `selectedArea ?? nodeAreaPoint` by
  // hand.
  const effectiveSelectedArea = resolveEffectiveSelectedArea(legacySelectedArea, nodeAreaPoint);

  // Issue #2083 (cycle 4, structural guard) — this class of bug recurred four
  // times because the legacy raw value and the bridged value were trivially
  // confusable by name (`selectedArea` vs `effectiveSelectedArea`). The raw
  // legacy value is now named `legacySelectedArea` everywhere on this page so
  // any future reader/consumer must make a DELIBERATE choice rather than
  // grabbing the wrong one by habit. ANY new consumer that needs "the area
  // the user currently has selected, however they got there" — badge/count
  // copy, area-scoped links, area-scoped filters — MUST read
  // `effectiveSelectedArea`, never `legacySelectedArea`.
  // `legacySelectedArea` alone is correct ONLY for a branch that is provably
  // legacy-areaKey-only (e.g. gated on `nav.journey === 'agri-first'` or
  // `nav.journey === 'school-first'`, journeys the canonical node hierarchy
  // never touches) or for a genuinely dead legacy-panel branch (see the
  // `selectedArea={effectiveSelectedArea}` comment at the
  // DiscoverRightPanelContainer call site below for that exact case).

  const isCityValid = city in CITY_CONFIG;

  // Issue #2142 Commit 3 (C1) — region summary/summaryRegions,
  // scopeNamespaces/resolvedUrlScope (via the `listingScope` selector),
  // useRegionScopedAreaGroups, and useDiscoverAreas (discoverAreasForPanel)
  // moved verbatim into controllers/useDiscoverGeographyController.ts.
  // Called here (same position as before, after `city` resolves from
  // useDiscoverPageState) — does NOT wrap useAreaGroups (stays page-level;
  // see the controller's own file-header comment for why) or
  // useRegionalAreaGroups/corridorGroups (documented deviation ->
  // useDiscoverAgriController, second batch).
  const {
    summaryRegions,
    scopeNamespaces,
    resolvedUrlScope,
    regionScopedGroupsData,
    isLoadingRegionScopedGroups,
    isRegionScopedGroupsError,
    refetchRegionScopedGroups,
    discoverAreasForPanel,
  } = useDiscoverGeographyController({
    city,
    isCityValid,
    navCity: nav.city || DEFAULT_CITY,
    scope: nav.scope,
    intentListingPurpose,
    areaGroupsData,
  });

  // Issue #1824 Slice S6 — composedResetMapTick + handleStartOver now live in
  // useDiscoverJourneyTransitions; see journeyView/journeyCommands below (declared
  // after useDiscoverMapData + schools, which the hook needs as injected deps).
  // The Start-Over a11y focus effect (#1817 AC8) is also declared there — it reads
  // journeyView.startOverTick and must run after the hook call is in scope.

  // Issue #2142 Commit 3 — the city-change bbox-reset effect moved into
  // controllers/useDiscoverViewportTracker.ts (called above with `city` as an input).

  // Issue #1824 Slice S7 — schoolFocusTick's writer effect now lives in
  // useDiscoverCameraOrchestration (reads selectedSchool injected below).

  // Area-scoping for the combined panel (AC4): when BOTH area and school are selected
  // and no user-drawn polygon is present, derive a bounding-box polygon from the area's
  // bbox so the listings request is spatially constrained to the intersection of area
  // bounds AND school proximity.
  //
  // Guard: !nav.schoolId restricts injection to combined state only.
  // Without this guard, area-first journey (area selected, no school) would also have
  // the polygon injected, routing the request through the polygon endpoint (capped at 200)
  // and breaking authenticated-user pagination.
  //
  // Polygon format: [[s,w],[s,e],[n,e],[n,w],[s,w]] — five [lat,lon] pairs matching
  // the PropertyFilters.polygon convention used by useDiscoverListings/the backend.
  const effectiveFilters = useMemo((): typeof filters => {
    // Only inject area-bbox polygon in combined state (area + school both present).
    // FIX CYCLE 2 (opus review, nit) — was `selectedArea?.bbox`, which never
    // injected a polygon for a canonical AREA-leaf + school combined state
    // (the node journey never sets the legacy `selectedArea`). Uses
    // `effectiveSelectedArea` — the same area+node bridge every other
    // selectedArea-driven gate on this page already reads — so a node leaf
    // gets the same area-bbox scoping a legacy areaKey selection does.
    if (!nav.schoolId || !effectiveSelectedArea?.bbox || filters.polygon) return filters;
    const [[s, w], [n, e]] = effectiveSelectedArea.bbox;
    const bboxPolygon: [number, number][] = [[s, w], [s, e], [n, e], [n, w], [s, w]];
    return { ...filters, polygon: bboxPolygon };
  }, [filters, effectiveSelectedArea, nav.schoolId]);

  // Issue #1655 — top-grouped-level guard: at the grouped overview level, individual
  // property markers and paginated listings should NOT be fetched. Only group/zone
  // count markers (from useDiscoverAreas / useAreaGroups / useRegionalAreaGroups)
  // are needed. This boolean mirrors the later isTopGroupedAreaOrSchool / isTopGroupedAgri
  // definitions (line ~2098) but is computed here so it can gate the data hooks.
  const isTopGroupedLevel = (() => {
    if (
      (nav.journey === 'area-first' || nav.journey === 'school-first') &&
      !nav.groupId &&
      !nav.areaKey &&
      // Issue #1956 PR-4 (gate 1) — `effectiveSelectedArea` also carries the
      // canonical AREA-leaf bridge, so a resolved node leaf correctly clears
      // this grouped-overview guard exactly like a legacy areaKey selection
      // does. See effectiveSelectedArea's declaration above.
      !effectiveSelectedArea &&
      !nav.schoolId &&
      !selectedSchool &&
      !nav.nodeListings
    ) return true;
    if (
      nav.journey === 'agri-first' &&
      !nav.selectedRegion &&
      !nav.areaKey &&
      !legacySelectedArea &&
      !nav.selectedLocality &&
      !nav.selectedGroup
    ) return true;
    return false;
  })();

  // Issue #1806 (FIX-1) — group-scope the map's marker fetch. The right panel
  // (AreaGroupSelectedPanel, reached whenever nav.groupId resolves to a
  // real group) already shows only the group's member areas; before this fix
  // the map's marker fetch ignored groupId entirely and showed city-wide
  // markers instead (the reported map/panel scope mismatch).
  //
  // This MUST be resolved here, before the useDiscoverMapData() call below,
  // which is earlier in the file than the focusedGroup/focusedGroupAreas
  // declarations used everywhere else on this page (~line 1631/2102, for
  // fitBounds + AreaMarkerLayer opacity/degradation props). Deliberately
  // duplicates that derivation — same resolver (resolveDiscoverGroupForAreaKey),
  // same inputs (areaGroupsData?.groups, nav.groupId, nav.areaKey) —
  // rather than reordering ~1600 lines of existing hooks to hoist them.
  //
  // Journey/state → groupAreaKeys mapping (DIRECTIVE 5):
  //   groupId == null                                    → undefined (unscoped; unchanged)
  //   groupId set AND journey==='school-first' AND schoolId set → undefined
  //     (guard: the school-radius surface is radius-scoped by design (#1261),
  //     never group-scoped — group-clipping markerListings here would
  //     silently shrink it, R5).
  //   groupId set (guard above not tripped) AND group not yet resolved
  //     (areaGroupsData still loading / groupId matches no group)  → []
  //     (empty-areaKeys guard DISABLES the fetch — an empty map, never an
  //     unscoped city-wide flash during the cold-load race, R4).
  //   groupId set AND group resolved                     → group.area_keys
  //     (the scoped fetch this fix exists for).
  const groupAreaKeysForMapData = useMemo((): string[] | undefined => {
    if (!nav.groupId) return undefined;
    if (nav.journey === 'school-first' && nav.schoolId) return undefined;
    const group = resolveDiscoverGroupForAreaKey(areaGroupsData?.groups, nav.groupId, nav.areaKey);
    return group?.area_keys ?? [];
  }, [nav.groupId, nav.journey, nav.schoolId, nav.areaKey, areaGroupsData?.groups]);

  const {
    areasLoading, listingDataLoading, markersLoading, isLoadingAreaListings,
    isFetching,
    discoverAreas, discoverAreasData, listingsWithCoords, filteredListings,
    markerListings, areaListings, isErrorAreaListings, areaMarkerListings,
    schoolRadiusListings, schoolRadiusListingsLoading, schoolRadiusHasMore,
    topLocalities, activeFocusBounds, trendsAreaKeys,
    cityCenter, cityZoom, schoolById, schoolByIdError, error,
    totalElements, totalPages,
    markersTruncated, markersReturnedElements, markersTotalFilteredElements,
    agriAreasData, isLoadingAgriAreas,
    cameraIntent, publishCameraIntent, publishClusterCameraIntent,
    // Issue #1762 — splittable LISTING-cluster tap camera producer (distinct
    // from publishClusterCameraIntent, which is area clusters only).
    publishMarkerClusterCameraIntent,
    // Issue #2088 (commit 6) — the Recenter affordance's camera producer.
    publishRecenterCameraIntent,
    // Issue #1956 PR 1 (FE-3, item 2) — threaded straight into
    // useDiscoverMapPresentation below and read by NOTHING else. Additive and
    // inert; it renders nothing in PR 1.
    visibleMemberSet,
  } = useDiscoverMapData({
    // Issue #1956 PR-4 (gate 3) — feeds the bridged AreaPoint so the
    // areaKeys derivation (useDiscoverMapData.ts:511) resolves to
    // [effectiveSelectedArea.areaKey] instead of [] at a canonical AREA leaf.
    city, selectedArea: effectiveSelectedArea, filters: effectiveFilters, debouncedSearch,
    urlSchoolId: nav.schoolId, isAuthenticated, fitTick,
    // Issue #1806 (FIX-1) — see groupAreaKeysForMapData above for the full
    // journey/state → value mapping.
    groupAreaKeys: groupAreaKeysForMapData,
    nodeKey: nav.nodeListings && areasNavigationJourney.node ? areasNavigationJourney.node.nodeKey : undefined,
    // Issue #1118: do NOT include !!nav.schoolId here. The /api/discover/markers
    // endpoint is auth-gated (returns 401 for anonymous users). Enabling the query for
    // unauthenticated school-first users caused a delayed marker disappearance: placeholderData
    // kept stale markers visible briefly, then the 401 settled and markers vanished while the
    // right panel was already empty (useDiscoverListings is also auth-gated synchronously).
    // Unauthenticated school-first users fall back to areaMarkerListings in the IIFE below.
    // Issue #1160 v3 Bug A2 — explicit auth+journey gating.
    //   Area-first: auth users only (matches existing behaviour).
    //   School-first: auth users only AND only when a schoolId is selected
    //     (top-level school-first browsing without schoolId leaves markers disabled
    //     since useDiscoverFilteredMarkers needs schoolLat/schoolLon to be meaningful).
    //   Anon school-first remains disabled (Issue #1118 regression guard — /api/discover/markers
    //     returns 401 for anon, which causes a delayed marker disappearance).
    // Issue #1115 — school-first branch additionally requires boundedSearchTriggered so
    // the /api/discover/markers fetch does NOT auto-fire on school select. The CTA in
    // SchoolSelectedPanel sets this flag. Area-first branch is untouched.
    // Issue #1655 — top-grouped guard: disable markers at grouped level so
    // useDiscoverFilteredMarkers does not fire for individual property coordinates.
    markersEnabled:
      !isTopGroupedLevel &&
      isAuthenticated &&
      (nav.journey === 'area-first' ||
        // Issue #1372 — agri-first journey must also enable markers so AgriMarkerClusterLayer
        // receives data. Without this, useDiscoverFilteredMarkers is never enabled in
        // agri-first mode and the cluster layer renders empty.
        nav.journey === 'agri-first' ||
        (nav.journey === 'school-first' &&
          !!nav.schoolId &&
          filters.schoolLat != null &&
          filters.schoolLon != null &&
          boundedSearchTriggered)) &&
      // zoomPolicy.shouldShowMarkers gate (same threshold as before:
      // zoom > AREA_LAYER_MAX_ZOOM). This live gate is the tested equivalent
      // of deriveScopeAwareMarkersEnabled (useDiscoverMapData.ts), which
      // covers the scope.kind==='group'||'area' && shouldShowMarkers(zoom)
      // contract in isolation (scopeAwareMarkers.test.tsx).
      // Issue #2087 — bounded listings bypass the zoom threshold and always
      // show property markers to replace the area navigation bubbles.
      (nav.nodeListings || shouldShowMarkers(mapZoom)),
    // Issue #1655 — suppress the paginated listings fetch at grouped overview level.
    // At top-grouped states the right panel shows groups/zones, not individual listings,
    // so there is no consumer for this data. Drilling down into a group/area/school
    // clears isTopGroupedLevel and re-enables the fetch.
    listingsEnabled: !isTopGroupedLevel,
    page,
    bbox: mapBbox,
    journey: nav.journey,
    // Issue #1494 — thread buy/rent intent as listingPurpose filter
    listingPurpose: intentListingPurpose,
  });

  // Issue #2142 Commit 3 (C4) — the "Recenter on <label>" affordance (issue
  // #2088 commit 6 — isSelectedNodeOutOfView/handleRecenterOnSelectedNode)
  // moved into controllers/useDiscoverMapPresentationController.ts,
  // consolidated with the camera/journey-predicates/map-presentation
  // cluster further below. selectedNodeBounds (previously computed here)
  // was already dead code (never read anywhere) — dropped, not moved.

  // Issue #1824 Slice S6 — the window.__debug.mapState effect (Playwright E2E contract)
  // moved a few lines down (after useDiscoverJourneyTransitions), because it now reads
  // journeyView.areaRestoreTick/cityRestoreTick. The object SHAPE is byte-identical.

  // Schools for SchoolMarkerLayer — fetched only in school-first journey when an area is selected.
  // Single owner: MapDiscovery fetches once and passes down to both SchoolMarkerLayer and
  // SchoolsInAreaPanel (via DiscoverRightPanel) to avoid duplicate API calls.
  // Issue #1131 — URL-backed board filter for schools. The board filters live in
  // nav.filters.boardFilters (parsed from repeated ?board=CBSE&board=ICSE params).
  // The previous code read `nav.boardFilters`, which is undefined on the URL state
  // shape — boardFilters live under `filters`. That bug meant the URL never reached the
  // schools query.
  const urlBoardFilters = useMemo(
    () => nav.filters.boardFilters ?? [],
    [nav.filters.boardFilters],
  );

  // Issue #2124 (fix-cycle) — true when journey=area-first and the canonical Areas
  // hierarchy is resolved to an AREA leaf (node=a:...). `derivePanelContent`
  // (panelContent below) only ever reads the LEGACY `areaKey`/`groupId` params, which
  // the canonical journey never sets — so panelContent alone cannot detect the
  // canonical "schools-in-area" sub-step. This is the server-resolved identity
  // (areasNavigationJourney.node, never parsed/reconstructed from `node=`) used by
  // both the schools query below and the school-select journey-flip guard in
  // useDiscoverJourneyTransitions.
  const hasResolvedCanonicalArea =
    nav.journey === 'area-first' && areasNavigationJourney.node?.nodeType === 'AREA';
  const canonicalSchoolsAreaKey =
    hasResolvedCanonicalArea && (nav.schoolPicking || nav.schoolId)
      ? areasNavigationJourney.node?.areaKey ?? undefined
      : undefined;

  // Issue #1798 — gate on panelContent (derivePanelContent's own routing result,
  // already computed above) instead of re-deriving journey === 'area-first' /
  // 'school-first' here. derivePanelContent resolves to 'schools-in-area' for
  // school-first+areaKey AND for area-first+schoolPicking AND for the "journeyless"
  // cold-load case (areaKey + schoolPicking with no explicit journey param — e.g.
  // /discover?areaKey=...&groupId=... with no journey=, per #1745 Batch B). The prior
  // literal `journey === 'area-first' && schoolPicking` check missed that third case,
  // so area-first "Add school" silently returned 0 schools for journeyless area URLs
  // even though the SchoolsInAreaPanel itself rendered correctly (routed via the same
  // journeyless fallback in derivePanelContent). Reusing panelContent keeps this query
  // byte-for-byte in sync with the single source of truth for panel routing.
  // Issue #2124 (fix-cycle) — ALSO falls back to canonicalSchoolsAreaKey so the
  // canonical area-first schools-in-area sub-step gets a real areaKey too.
  const schoolsAreaKey =
    (panelContent === 'schools-in-area' ? nav.areaKey ?? undefined : undefined) ??
    canonicalSchoolsAreaKey;
  // Issue #2142 Commit 3 — useSchoolsByArea/allSchools/schools/
  // useDiscoverJourneyTransitions/useSchoolListings/useSchoolFirstCounts
  // consolidated into ONE controllers/useDiscoverSchoolController.ts call,
  // positioned below (after focusedGroup/groupListingsCount) — see that
  // call site's own comment for why this consolidation moves the call
  // later than several of these hooks' individual pre-refactor positions.

  // Single setter consumed by chip UI: updates URL (canonical) and local state (mirror).
  // Always uses REPLACE semantics (actions.setBoardFilters is REPLACE-only).
  const handleBoardFilterChange = useCallback(
    (boards: string[]) => {
      setSchoolBoardFilter(boards);
      actions.setBoardFilters(boards);
    },
    [setSchoolBoardFilter, actions],
  );

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

  // isLoading depends on both hooks and useAuth — must be computed here (Rule 1).
  const isLoading =
    authLoading || !mapReady || areasLoading || listingDataLoading
    || (isAuthenticated && shouldShowMarkers(mapZoom) && markersLoading);

  // Discover count source of truth: /api/discover/areas (public, no auth).
  // cityTotal is the sum of per-area listingCount (live LIVE+not-archived+not-duplicate).
  // Do NOT use auth-gated Supabase arrays (listingsWithCoords / filteredListings)
  // for public Discover empty-state or city count display.
  const cityTotal = useMemo(
    () => discoverAreas.reduce((sum, a) => sum + (a.listingCount ?? 0), 0),
    [discoverAreas],
  );

  // Issue #1261 rev2 (AC11) — pure helper that converts the already-fetched + already-
  // client-filtered anon school-radius listings into Leaflet-pin shape for PropertyMap.
  // Exported for unit-test parity with the marker derivation flow. Mirrors the
  // areaMarkerListings useMemo in useDiscoverMapData.ts (filter null coords →
  // normalise lat/lon → cityListingToPropertyListing). Reuses the existing mapper so
  // the marker shape, popup, and clustering pipeline are identical to anon area pins.
  //
  // ANON-SAFE: consumes only fields from the 20-field public contract (id/propertyType/
  // title/locality/pricePaise/primaryImageUrl/listingPurpose/bedrooms/builtArea/landArea + units/
  // createdAt/lat/lon). Does NOT read trustTier/reraNumber/reraValid/sellerType/status/
  // updatedAt/lastUpdatedAt/firstPublishedAt. cityListingToPropertyListing synthesises
  // status='LIVE' and seller_type=null LOCALLY (no server private-field exposure).
  //
  // DECISION-1 parity: callers pass the post-applyAnonPropertyFilters set so map/panel/
  // badge all reflect the same filtered universe.

  // Issue #1175 v3 / Issue #1798 PR-B1 — focusedGroup is resolved from both groupId (by ID
  // or exact slug match) and automatically derived from nav.areaKey if needed.
  // Guarantees right panel, map layer, map markers, and map breadcrumb derive from unified context.
  // NOT owned by the School controller below — shared with groupListingsCount
  // (a badge concern, not school-specific), so it stays page-level and is
  // threaded into the controller as an input (same pattern as Geography's
  // areaGroupsData/Results controller split from Commit 3 batch 1).
  const focusedGroup = useMemo(() => {
    return resolveDiscoverGroupForAreaKey(areaGroupsData?.groups, nav.groupId, nav.areaKey);
  }, [areaGroupsData?.groups, nav.groupId, nav.areaKey]);

  // Issue #1175 v3 — group aggregate count for the badge.
  // Only active when groupId is set and no area/school is selected (those take precedence).
  // null  = group metadata still loading (isLoadingAreaGroups=true).
  // O(k) where k = member area count (bounded, typically 2–6).
  const groupListingsCount = useMemo((): number | null | undefined => {
    if (!nav.groupId) return undefined;          // no group active
    if (!focusedGroup) return null;                   // null when areaGroupsData still loading OR when groupId no longer exists — both intentionally hide the badge
    // Use a Set for O(1) membership checks → overall O(N + k) not O(N·k)
    const memberKeySet = new Set(focusedGroup.area_keys);
    return discoverAreas
      .filter((a) => memberKeySet.has(a.areaKey))
      .reduce((sum, a) => sum + (a.listingCount ?? 0), 0);
  }, [nav.groupId, focusedGroup, discoverAreas]);

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
    urlBoardFilters,
    schoolBoardFilter,
    panelContent,
    city,
    toast,
    hasResolvedCanonicalArea,
    boundedSearchTriggered,
    setBoundedSearchTriggered,
    schoolsAreaKey,
    categoryFilters: nav.filters.categoryFilters ?? [],
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
    schoolsQuery,
    schools,
    journeyView,
    journeyCommands,
    schoolListings,
    schoolRadiusFallbackMarkers,
    schoolFirstLandingSchoolCount,
    schoolFirstZoneSchoolCount,
    schoolFirstAreaSchoolCount,
    schoolZoneLabels,
  } = schoolController;

  // Issue #1817 (AC8) — after Start Over, move focus to the panel's h1 (city hero) so
  // keyboard users land somewhere sensible (design §8). Start Over always lands on the
  // guided-entry city landing (bare ?city=...), whose h1 carries id="discover-panel-h1"
  // (GuidedEntryPanel). Runs on the next paint after startOverTick changes, since the
  // panel tree must re-render to guided-entry (and mount the new h1) before it can be
  // focused; a plain synchronous focus() call would target the about-to-unmount node.
  // Issue #1824 Slice S6 — reads journeyView.startOverTick (moved-tick owner).
  const prevStartOverTickRef = useRef(journeyView.startOverTick);
  useEffect(() => {
    if (journeyView.startOverTick === prevStartOverTickRef.current) return;
    prevStartOverTickRef.current = journeyView.startOverTick;
    const raf = requestAnimationFrame(() => {
      document.getElementById('discover-panel-h1')?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [journeyView.startOverTick]);

  // Issue #1152 — derive the correct badge count given area/filter/loading context.
  // Uses raw filters, not effectiveFilters: the bbox polygon injected by effectiveFilters is system-managed; badge takes the area path when selectedArea != null regardless.
  // Cycle 7: areaListings re-added (Option B). areaListings comes from useDiscoverCityListings
  // which already applies bedrooms/propertyType/price at the backend, so its .length matches
  // the right panel exactly — satisfying AC4. The Cycle 3 failure was a test-side bug
  // (?bedrooms= vs ?beds= URL param); that URL contract is fixed in Cycle 5/6.
  // Issue #1175 v2 — schoolListingsCount carries the already-computed schoolListings.length
  // so badge follows the active school-radius count instead of being suppressed.
  // When school-radius is active but area listings are still loading, null is passed to
  // hide the badge temporarily (avoids flashing a stale area/city total).
  const schoolRadiusActive =
    filters.schoolLat != null && filters.schoolLon != null && filters.schoolRadiusKm != null;
  const discoverBadge = useMemo(
    () =>
      deriveDiscoverBadge({
        // Issue #2083 (F2 fix) — was the bare `selectedArea`, which is null
        // under the canonical `node=` journey (only the legacy `areaKey` path
        // sets it), so the area branch was skipped and the badge fell
        // through to the city-wide total (discoverBadge.ts's cityTotal
        // fallback) while the panel correctly showed area-scoped content.
        // `effectiveSelectedArea` bridges both sources — see its declaration
        // above.
        selectedArea: effectiveSelectedArea,
        filters,
        isLoadingAreaListings,
        cityTotal,
        areaListings,
        schoolListingsCount: schoolRadiusActive
          // Issue #1175 v2 corrective: on the auth path, filteredListings comes from
          // useDiscoverListings (backend proximity query), not from useDiscoverCityListings.
          // isLoadingAreaListings only tracks the public city-listings query and can be false
          // while the backend proximity query is still in-flight (listingDataLoading=true),
          // which would cause schoolListings.length to return 0 from an empty filteredListings
          // and the badge would briefly show "0 properties" instead of hiding.
          // Fix: also hide when the auth-path listing query is in-flight.
          // Issue #1261: on the anon path, schoolListings now comes from the public
          // /school-radius-listings endpoint, so hide while THAT query is in-flight too
          // (schoolRadiusListingsLoading) to avoid a transient "0 properties" flash.
          ? (isLoadingAreaListings
              || (isAuthenticated && listingDataLoading)
              || (!isAuthenticated && schoolRadiusListingsLoading))
            ? null
            : schoolListings.length
          : undefined,
        groupListingsCount,
        // Issue #1824 S4 — KNOWN, INTENTIONAL split-brain: this badge reads
        // debouncedSearch (local 250ms, from useDiscoverSearchState), NOT
        // nav.q (which drives ActiveContextChips). Do NOT unify — see
        // useDiscoverSearchState's header comment.
        searchQuery: debouncedSearch,
        // Issue #1817 — anon path only: schoolRadiusListings is the FULL radius set
        // BEFORE applyAnonPropertyFilters (schoolListings, above, is the post-filter
        // set), so its length is the honest unfiltered N. The authenticated proximity
        // endpoint pre-filters server-side and has no equivalent unfiltered total —
        // left undefined there so the selector falls back to the no-number state (AC6).
        schoolRadiusUnfilteredCount:
          schoolRadiusActive && !isAuthenticated && !schoolRadiusListingsLoading
            ? schoolRadiusListings.length
            : undefined,
      }),
    // schoolListings.length is a number primitive — safe dep (no spurious identity changes).
    // schoolRadiusActive is derived from filters (already a dep), but listed explicitly for clarity.
    // listingDataLoading added for auth-path loading guard (Issue #1175 v2 corrective).
    // groupListingsCount: derived from focusedGroup + discoverAreas — listed as a primitive
    // (number | null | undefined) so it is safe to use directly as a dep.
    // debouncedSearch: keyword search — badge shows filtered count when active (Issue #1185).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveSelectedArea, filters, isLoadingAreaListings, listingDataLoading, isAuthenticated, schoolRadiusListingsLoading, cityTotal, areaListings, schoolRadiusActive, schoolListings.length, groupListingsCount, debouncedSearch, schoolRadiusListings.length],
  );

  // Issue #1817 (code-review follow-up) — single computed copy string for the
  // area-selected scope, shared verbatim by the map badge (isAreaFirstSelectedAreaState
  // branch below) AND the AreaSelectedPanel result-summary stat (via DiscoverRightPanel
  // → AreaSelectedPanel's `areaResultSummaryText` prop), so the two surfaces can never
  // diverge — exactly one call to formatDiscoverBadgeCopy, exactly one selector
  // (discoverBadge) behind it.
  // Issue #2083 (diagnose-then-fix cycle 3, RC_B recurrence) — was gated on the
  // bare `selectedArea`, which is null under the canonical `node=` journey (only
  // the legacy `areaKey` path ever sets it — see effectiveSelectedArea's own
  // declaration/comment above for why "MUST read effectiveSelectedArea, never
  // the bare selectedArea" applies to every consumer here). That made this
  // string null at a resolved node-journey AREA leaf, so the map badge fell
  // through to the generic zero-state/fallback copy instead of area-scoped text
  // (e.g. missing the area's own name in a genuine zero-listing result).
  const areaResultSummaryText = useMemo(
    () =>
      effectiveSelectedArea
        ? formatDiscoverBadgeCopy(discoverBadge, {
            scopeLabel: effectiveSelectedArea.areaLabel,
            noun: 'verified properties',
            searchQuery: nav.q,
          })
        : null,
    [effectiveSelectedArea, discoverBadge, nav.q],
  );

  // Issue #1817 (AC11) — debounced, polite result-count announcement. A visually-hidden
  // mirror of the badge copy, updated ~500ms after the badge SETTLES (not while loading),
  // so screen-reader users hear one announcement per fetch settle — never per keystroke,
  // never mid-refetch. Uses the same shared copy contract as the generic map-badge branch
  // (formatDiscoverBadgeCopy) for an honest, if not always verbatim, summary of every scope.
  // Issue #1824 Slice S10a — the debounced state/effect body extracted to
  // useDiscoverBadgeAnnounce (verbatim; only nav.q → urlStateQ rename).
  const announcedBadgeText = useDiscoverBadgeAnnounce({
    discoverBadge,
    // Issue #2083 (F2 class sweep) — same defect as the visible badge above:
    // this is the a11y-announced MIRROR of that same copy, and it derives
    // its own scopeLabel independently (useDiscoverBadgeAnnounce.ts) rather
    // than reusing a shared string, so it needs the SAME bridge or a
    // screen-reader user hears "properties in Bangalore" while a sighted
    // user (once the badge above is fixed) sees the area-scoped copy.
    selectedArea: effectiveSelectedArea,
    focusedGroup,
    city,
    urlStateQ: nav.q,
  });

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

  // Issue #1157 rev-5 DEFECT A — gate for mounting the school-marker layer.
  // school-first keeps markers (first OR term). Additionally surface markers in the
  // area-first school-picking sub-step (schoolPicking) and in area-school-combined
  // (area-first + areaKey + schoolId), so the area-first flow shows both school
  // CARDS and map MARKERS. Reuses the schools[] already passed to PropertyMap —
  // no extra fetch.
  //
  // Visual-parity polish (cycle 3) — the school-first term is additionally gated on
  // `areaKey` being resolved. `schools` (allSchools, above) is fetched via
  // useSchoolsByArea(schoolsAreaKey, ...), and schoolsAreaKey is `undefined` for
  // school-first until an area is selected — so on the landing (school-browse) and
  // zone-selected (school-group-areas) states `schools` is ALWAYS empty regardless
  // of this gate. Un-gated, SchoolMarkerLayer still mounted at those two states
  // (journey === 'school-first' alone was true) and rendered its "No schools found
  // in this area" empty-state overlay even though the map is correctly showing zone/
  // area clusters, not individual school pins, at that zoom level — a stale/confusing
  // toast pre-dating this branch. Requiring `areaKey` removes the toast at exactly the
  // two states where there was never any real school-marker data to report, while
  // leaving schools-in-area / school-selected / area-school-combined (all of which
  // resolve an areaKey by construction — see setSchoolJourney) byte-for-byte unchanged.
  const showSchoolMarkers = deriveShowSchoolMarkers({
    journey: nav.journey,
    areaKey: nav.areaKey,
    schoolPicking: nav.schoolPicking,
    schoolId: nav.schoolId,
  });

  // MVP2 — in the agri-first journey the school controls are not part of the flow.
  // Hide (do not disable) the "Near a school" trigger button and the NearSchoolSheet
  // mount so a user in agri-first cannot open the school sheet (which would call
  // setSchoolJourney and flip the journey to school-first). Single boolean gate.
  const isAgriJourney = nav.journey === 'agri-first';

  // Issue #1157 — area-first Back wrapper. Ordering is significant (DEFECT B):
  //   1. schoolId set (area-school-combined) → backToSchoolPicking: drop schoolId +
  //      radiusKm, set schoolPicking=1, AND clear local school state (mirrors
  //      onClearSchool) so the radius circle + selected marker actually unmount and
  //      the area's schools-in-area markers reappear. journey/areaKey preserved.
  //   2. schoolPicking set (no schoolId) → clearSchoolPicking: return to area-selected.
  //   3. otherwise → canonical handleAreaBack (area dismissal). handleAreaBack is NOT
  //      modified.
  // schoolId is checked FIRST so combined → Back lands on schools-in-area, not
  // area-selected (the rev-4 ladder skipped this rung and fell through to area
  // dismissal without clearing the school).
  const handleAreaFirstBack = useCallback(() => {
    if (nav.schoolId) {
      // URL: drop schoolId + radiusKm, set schoolPicking=1 (single REPLACE).
      actions.backToSchoolPicking();
      // Local cleanup (modelled on onClearSchool): without this the cold-load/restore
      // effect would re-inject selectedSchool from a lingering urlSchoolId and the
      // schoolCircle (keyed off local selectedSchool + filters.schoolLat/Lon) would
      // stay drawn. After the REPLACE removes schoolId the restore effect is inert,
      // but the local clear must happen in the same handler.
      setSelectedSchool(null);
      setFilters((prev) => {
        const next = { ...prev };
        delete next.schoolLat;
        delete next.schoolLon;
        delete next.schoolRadiusKm;
        return next;
      });
      // Issue #1115 — school cleared; reset so CTA reappears on next school select.
      setBoundedSearchTriggered(false);
    } else if (nav.schoolPicking) {
      actions.clearSchoolPicking();
    } else {
      handleAreaBack();
    }
  }, [nav.schoolId, nav.schoolPicking, actions, handleAreaBack, setSelectedSchool, setFilters]);

  // Delayed-show spinner: only show after 200 ms to prevent flicker on fast loads.
  useEffect(() => {
    if (!isLoading) { setShowLoader(false); return; }
    const t = setTimeout(() => setShowLoader(true), 200);
    return () => clearTimeout(t);
  }, [isLoading, setShowLoader]);

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
  // NOTE: focusedGroup is declared earlier (before discoverBadge) so it can be used
  // for the groupListingsCount badge computation. Do not redeclare it here.

  const focusedGroupAreas = useMemo(
    () => focusedGroup?.area_keys,
    // Re-derive only when the selected group or the groups dataset changes.
    // Prevents AreaMarkerLayer from tearing down all markers on every background refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nav.groupId, areaGroupsData],
  );

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

  // activeContextChips is memoised so its identity only changes when a relevant
  // dimension actually changes — prevents unnecessary re-renders of DiscoverRightPanel.
  // Hoisted above the isCityValid early return to satisfy Rules of Hooks.
  // Issue #1854 — "Clear all" previously composed handleFiltersChange({}) (which
  // schedules a 300 ms-debounced setFiltersLive URL write) with a separate immediate
  // setSearchQuery('') write. Both writes close over the SAME pre-click URL snapshot
  // (react-router's useSearchParams setter is not a functional-setState queue), so the
  // immediate `q` clear lands first, then the still-pending debounced filters write
  // fires ~300 ms later against its stale snapshot and silently revives the old `q`.
  // actions.clearAllFiltersAndSearch() does both in a single atomic REPLACE, and
  // cancels any in-flight setFiltersLive/setSearchQuery timers first so nothing can
  // race in afterward. Local `filters` state is cleared directly (not via
  // handleFiltersChange, which would re-arm the debounced URL write). Journey, scope,
  // areaKey/schoolId, and the map camera are untouched (design §9: "Clear all drops all
  // filter+q keys but keeps city, journey, and scope keys").
  const handleClearAllFiltersAndSearch = useCallback(() => {
    setFilters({});
    actions.clearAllFiltersAndSearch();
  }, [setFilters, actions]);

  const activeContextChips = useMemo(
    () => (
      <ActiveContextChips
        // Issue #1824 S4 — KNOWN, INTENTIONAL split-brain: chips read
        // nav.q (URL-side debounce), NOT debouncedSearch (which drives
        // the badge + map markers via useDiscoverSearchState). Do NOT unify.
        searchQuery={nav.q}
        onClearSearch={() => actions.setSearchQuery('')}
        filters={{
          ...filters,
          // Issue #1132 — board/category filters are written directly to URL by
          // onClearBoard/onClearCategory (via actions) without going through
          // setFilters, so local `filters` state can lag behind. Always pass the
          // URL-authoritative values here so ActiveContextChips renders the correct
          // chip set without a useEffect sync (which caused an infinite re-render
          // loop because nav.filters.boardFilters is a new array ref each render).
          boardFilters: nav.filters.boardFilters,
          categoryFilters: nav.filters.categoryFilters,
          dateFrom: filters.dateFrom
            ? typeof filters.dateFrom === 'string'
              ? filters.dateFrom
              : filters.dateFrom.toISOString().slice(0, 10)
            : undefined,
          dateTo: filters.dateTo
            ? typeof filters.dateTo === 'string'
              ? filters.dateTo
              : filters.dateTo.toISOString().slice(0, 10)
            : undefined,
        }}
        onClearPropertyType={() =>
          handleFiltersChange({ ...filters, propertyTypes: undefined })
        }
        onClearBhk={() =>
          handleFiltersChange({ ...filters, bedrooms: undefined })
        }
        onClearPrice={() =>
          handleFiltersChange({ ...filters, priceMin: undefined, priceMax: undefined })
        }
        onClearBoard={(board) => {
          const next = (nav.filters.boardFilters ?? []).filter(
            (b) => b.toLowerCase() !== board.toLowerCase(),
          );
          actions.setBoardFilters(next);
        }}
        onClearCategory={(category) => {
          const next = (nav.filters.categoryFilters ?? []).filter(
            (c) => c.toLowerCase() !== category.toLowerCase(),
          );
          actions.setCategoryFilters(next);
        }}
        onClearSeller={() =>
          handleFiltersChange({ ...filters, sellerTypes: undefined })
        }
        onClearDateRange={() =>
          handleFiltersChange({ ...filters, dateFrom: undefined, dateTo: undefined })
        }
        onClearBoolean={(key) =>
          handleFiltersChange({ ...filters, [key]: undefined })
        }
        onClearAll={handleClearAllFiltersAndSearch}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nav.q, nav.filters.boardFilters, nav.filters.categoryFilters, filters, actions, handleClearAllFiltersAndSearch],
  );

  // Issue #2142 (correction pass) — memoizedInitialCenter/areaRestoreArea/
  // schoolMarkerPositions moved verbatim into
  // controllers/useDiscoverCameraController.ts. They are referential-identity
  // stabilisers for the three imperative panner effects (URLViewportController /
  // AreaRestorePanner / SchoolMarkerFocusPanner), so they belong with the
  // camera owner rather than in a surface builder — see that file's own
  // "IDENTITY STABILISERS" note.

  // Issue #2083 (F2 class sweep) — was the bare `selectedArea`, so a resolved
  // canonical-AREA-leaf node journey lost its area-scoped Trends link and
  // fell back to the generic (undefined / city-wide) trends surface even
  // though the panel and map both show that area's context.
  const trendsHref = effectiveSelectedArea
    ? `/trends/${city}/areas/${slugifyFromAreaKey(effectiveSelectedArea.areaKey)}`
    : undefined;

  const filtersContent = (
    <MapFilters
      filters={filters} onFiltersChange={handleFiltersChange}
      selectedSchool={selectedSchool} onSchoolSelect={journeyCommands.wrappedSchoolSelect}
      schoolBoardFilter={schoolBoardFilter} onSchoolBoardFilterChange={handleBoardFilterChange}
      city={city}
      trendsAreaKeys={effectiveSelectedArea ? [effectiveSelectedArea.areaKey] : trendsAreaKeys}
      isFetching={isFetching}
    />
  );

  // Issue #1160 GAP 2 — city coords for CityRestorePanner.
  // cityCenter and cityZoom from useDiscoverMapData are the canonical city-level viewport.
  // These are already available as props in MapDiscovery; just alias them for clarity.
  // CityRestorePanner uses them when cityRestoreTick increments (Back from schools-in-area).

  // Selected-school radius map overlays (radius legend) only render when a school is
  // selected AND the panel is school-selected/area-school-combined.
  const schoolRadiusOverlay = isSchoolRadiusOverlayState(resolvedPanelContent, !!selectedSchool);

  // The journey breadcrumb (City › Zone › Area › School) renders progressively across
  // ALL school-first drill-down states — zone selected, area selected, and school
  // selected — not only the radius state. The breadcrumb component omits segments whose
  // label is null, so a zone-only context reads "Udupi › University Belt" and an
  // area context reads "Udupi › University Belt › Manipal". Other journeys (area-first,
  // agri-first) keep the generic AreaIndicatorOverlay.
  const showSchoolBreadcrumb =
    nav.journey === 'school-first' &&
    // Issue #2083 cycle 4 — genuinely legacy-only: outer-ANDed with
    // journey === 'school-first', a journey the canonical node hierarchy
    // never drives (verified by code review).
    (!!nav.groupId || !!nav.areaKey || !!legacySelectedArea || !!selectedSchool);

  // Issue #1588 — public-landing marker set. The public landing shows ONLY areas that
  // have live properties — never muted/transparent 0-property markers. A clean, calm
  // empty map (with the centered empty-state message) is preferred over decorative pins,
  // so a city with no live properties (e.g. Bangalore) renders no area markers at all.
  // Drill-down states keep the full area set (unchanged).
  const isLandingState = resolvedPanelContent === 'guided-entry';

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
    hoveredListingId,
    hoveredAreaKeyForMap,
    highlightedAreaKeys,
    interactionCommands,
    handleAreaClusterClick,
    areaSearchQuery,
    debouncedAreaSearchQuery,
    setAreaSearchQuery,
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
    isSelectedNodeOutOfView,
    handleRecenterOnSelectedNode,
    schoolFocusTick,
    schoolMarkerFocusTick,
    selectedSchoolLat,
    selectedSchoolLon,
    agriGroupFocusBounds,
    canonicalNodeFitCount,
    isColdNavigate,
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
    isAreaFirstCityLanding,
    liveAreas,
    cityHasNoListings,
    isTopGroupedAreaOrSchool,
    isTopGroupedAgri,
    overviewAreas,
    areaSearchMatchKeys,
    resolvedRegionLabel,
    isRegionOverview,
    regionOverviewMarkerKind,
    regionOverviewShortLabel,
    areaJourneySegments,
    schoolJourneySegments,
  } = mapLayerController;

  const regionGuideController = useDiscoverRegionGuideController({ isRegionOverview });
  const {
    regionSelectSource,
    regionSelectNonce,
    regionGuideDismissed,
    armRegionSelect,
    dismissRegionGuide,
    prefersReducedMotion,
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
  const { handleOverviewAreaClick, activeAreasNavigationJourney } = overviewNavigationController;

  // Debug: expose areaListings and related data to window.__debug for Playwright tests.
  // Issue #1824 Slice S7 — schoolMarkerFocusTick now sourced from
  // useDiscoverCameraOrchestration (via the controller above); areaRestoreTick/
  // cityRestoreTick still read from journeyView (S6 owns them). The object
  // SHAPE is byte-identical (E2E contract, AC4).
  useEffect(() => {
    (window as Window & { __debug?: Record<string, unknown> }).__debug = {
      ...(window as Window & { __debug?: Record<string, unknown> }).__debug,
      propertyMapListings: {
        areaListings,
        areaMarkerListings,
        areaLen: areaListings.length,
        areaMarkerLen: areaMarkerListings.length,
        markerListings,
        markerLen: markerListings.length,
        // Issue #2083 cycle 4 (code-review nit) — was the bare legacy value,
        // which is null under a canonical node journey even though an area IS
        // selected (see effectiveSelectedArea's declaration above), silently
        // misleading any E2E assertion against this field. `selectedArea`
        // keeps its key name (E2E contract, AC4 — shape stays byte-identical)
        // but now carries the resolved value; `legacySelectedArea` is exposed
        // alongside it for anyone who specifically needs the raw legacy value.
        selectedArea: effectiveSelectedArea,
        legacySelectedArea,
      },
      mapState: {
        // PR #2128 review cycle 4 (fix-verify) — spread the existing
        // mapState FIRST so this effect merges instead of clobbering
        // fields another debug effect on this page independently owns
        // (currently: bottomOcclusionPx, set by the effect further down).
        // Without this, mapZoom's near-constant churn on any map
        // interaction re-runs THIS effect after the other one, wiping
        // whatever it just set — confirmed live (bottomOcclusionPx went
        // from present to completely absent a few seconds after being set).
        ...((window as Window & { __debug?: Record<string, unknown> }).__debug
          ?.mapState as Record<string, unknown> | undefined),
        zoom: mapZoom,
        city,
        // Issue #1160 — expose school centre for E2E viewport assertions.
        // SchoolFocusPanner pans the Leaflet map imperatively (no URL write),
        // so E2E must read the map centre from this debug object rather than
        // from URL params.
        schoolCenter: selectedSchool
          ? { lat: selectedSchool.latitude, lon: selectedSchool.longitude }
          : null,
        // Issue #1160 GAP 1+2 — expose restoration ticks for E2E assertability.
        // MF-6 asserts schoolMarkerFocusTick > 0 after listings settle.
        // MF-7 asserts areaRestoreTick incremented on Back from school-selected.
        // MF-8 asserts cityRestoreTick incremented on Back from schools-in-area.
        schoolMarkerFocusTick,
        areaRestoreTick: journeyView.areaRestoreTick,
        cityRestoreTick: journeyView.cityRestoreTick,
        // Issue #2083 (cycle 5) — see UseDiscoverCameraOrchestrationResult's
        // doc; asserted by issue-2083-home-breadcrumb-back-camera-race.spec.ts
        // to prove the canonical-node bbox refit does NOT double-fire on a
        // Back transition that already has a persisted viewport to restore.
        canonicalNodeFitCount,
      },
    };
  }, [areaListings, areaMarkerListings, markerListings, effectiveSelectedArea, legacySelectedArea, mapZoom, city, selectedSchool, schoolMarkerFocusTick, journeyView.areaRestoreTick, journeyView.cityRestoreTick, canonicalNodeFitCount]);

  // Issue #1595 — the area-first selected-group drill-down state (a group is focused,
  // no specific area selected yet). Drives the mock-aligned map chrome for this step:
  // the city switcher is hidden, the "verified properties in {group}" pill is centred
  // at the bottom, and the Areas legend is shown.
  // Issue #2083 cycle 4 (code-review BLOCKING fix, 4th recurrence of this bug
  // class) — was the bare legacy value, which is null under a pure canonical
  // node journey (?journey=area-first&groupId=<group>&node=<AREA leaf in that
  // group>, no legacy areaKey). resolvedPanelContent === 'area-groups-landing'
  // is reached there (discoverPanelState.ts:167) and focusedGroup still
  // resolves (node/groupId are independent URL axes — navigation.test.ts:72-78,
  // AC1.4), so this wrongly evaluated true and showed group-overview chrome
  // for a user who had already drilled into a specific area. Mirrors the
  // sibling guard isTopGroupedLevel (above), which already reads
  // effectiveSelectedArea correctly. Formula extracted to the exported, pure
  // `resolveIsSelectedGroupState` (above) so a regression test can exercise
  // the REAL production predicate — see
  // MapDiscovery.issue2083.selectedGroupState.test.ts.
  const isSelectedGroupState = resolveIsSelectedGroupState(
    resolvedPanelContent,
    focusedGroup,
    effectiveSelectedArea,
  );

  // Issue #1606 — area-first selected-AREA results state (terminal area chosen). Drives
  // the redesigned Manipal-style results panel and the 3-level map breadcrumb. Distinct
  // from isSelectedGroupState (no area yet) — here selectedArea is present.
  // Issue #2083 cycle 4 — genuinely legacy-only: derivePanelContent only ever
  // returns 'area-selected' when the legacy areaKey is truthy
  // (discoverPanelState.ts:123-135), so legacySelectedArea is correct here
  // (verified by code review).
  const isAreaFirstSelectedAreaState =
    resolvedPanelContent === 'area-selected' &&
    nav.journey === 'area-first' &&
    !!legacySelectedArea;

  // Issue #1798 PR-C — canonical listing-marker popover RENDER-eligibility predicate.
  // Previously this gate (formerly isAreaFirstPopoverEligible || isGroupResultsPopoverEligible)
  // required journey === 'area-first' plus specific panelContent values — strictly narrower
  // than the click-CAPTURE gate below (handleMarkerClickWithPosition), which already permits
  // journeyless and other non-agri-first states. That drift meant a listing marker click
  // could already write markerPixelPos/selectedMarkerListing and drive the #1547 right-panel
  // scroll+highlight, yet the popup itself would silently never render — the reported #1798
  // "popup missing" bug. Fixed by reusing the SAME condition as the capture gate so the two
  // can no longer drift apart. Still excludes agri-first (own peek/panel flow).
  //
  // Issue #1973 — the pure school-first journey (a school + radius selected, no area) is
  // cross-area: areaKey is null in that state, so the original single-clause predicate
  // (which required areaKey != null) rejected it even after a naive schoolId/journey
  // clause flip. Extended to an additive OR: the ORIGINAL area-gated clause is unchanged
  // (still covers area-first, and area-first area+school combined per #1738), plus a new
  // areaKey-FREE branch admitting school-first once a school is selected. Area/cluster/count
  // marker clicks are unaffected: they never set markerPixelPos, so the
  // `selectedMarkerListing != null && markerPixelPos != null` conjunction at the render site
  // below still keeps them popup-free regardless of this predicate. MUST stay byte-identical
  // to the capture-gate predicate in useMarkerSelection.ts's handleMarkerClickWithPosition —
  // see that function's comment — or the two can drift apart again (the exact #1798 bug).
  // Issue #1956 PR-4 (gate 2) — useDiscoverJourneyPredicates (out of this
  // PR's allowed scope) derives mapLayerCategory purely from URL state via
  // toLayerInput/selectDiscoverMapLayer internally, so it cannot see the
  // in-memory node bridge above and still resolves 'area-group-bubbles' for
  // a canonical AREA leaf (legacy `areaKey` URL param null). Recomputes the
  // SAME real selectDiscoverMapLayer with the CONTAINED `nodeAreaLeaf` field
  // (discoverLayerRegistry.ts) set, used ONLY for the resolveMarkerPopover
  // call below — mapLayerKind/mapLayerCategory themselves are left
  // untouched for their other pre-existing consumers.
  const effectiveMapLayerCategory: DiscoverMapLayerKind = isNodeAreaLeafActive
    ? selectDiscoverMapLayer(
        { ...toLayerInput({ ...nav, viewport } satisfies DiscoverUrlState), nodeAreaLeaf: true },
        'overview',
      )
    : mapLayerCategory;

  // Issue #1798 PR-C — canonical listing-marker popover RENDER-eligibility
  // predicate, now the ONE shared `isMarkerPopoverEligible` export (Issue
  // #1956 PR-4 scope amendment n=1 — see markerPopoverEligibility.ts's
  // module doc for the full four-site extraction history and the new
  // AREA-leaf arm). MUST stay in lock-step with useMarkerSelection.ts's
  // capture gate (risk R1) — both import the same function and are fed the
  // same `isNodeAreaLeafActive` value.
  const isMarkerPopoverEligible = computeMarkerPopoverEligible({
    journey: nav.journey,
    areaKey: nav.areaKey,
    schoolId: nav.schoolId,
    isNodeAreaLeaf: isNodeAreaLeafActive,
  });

  // Issue #2142 Commit 3 (C8) — bottomOcclusionPx/isPreviewSheetOpen/
  // previewOcclusionPx/handlePreviewSheetHeightChange + useMobileMapOverlayShell
  // (call site moved down from its early position, see comment there) moved
  // verbatim into controllers/useDiscoverMobilePresentationController.ts.
  // Called HERE (same late position as before) because it needs
  // isMarkerPopoverEligible, itself only available at this point.
  const mobilePresentationController = useDiscoverMobilePresentationController({
    mobileMapOpen,
    setMobileView,
    isMarkerPopoverEligible,
    selectedListingPreview,
  });
  const {
    mobileMapTriggerRef,
    bottomOcclusionPx,
    isPreviewSheetOpen,
    previewOcclusionPx,
    handlePreviewSheetHeightChange,
  } = mobilePresentationController;
  // E2E observability only (Playwright contract, matches the existing
  // canonicalNodeFitCount/schoolCenter convention on this same debug object)
  // — merges into the mapState sub-object built by the earlier debug effect
  // above without needing to move this value's own declaration earlier in
  // the component (isMarkerPopoverEligible/isNodeAreaLeafActive are not
  // available at that effect's point in the file).
  useEffect(() => {
    const w = window as Window & { __debug?: Record<string, unknown> };
    w.__debug = {
      ...w.__debug,
      mapState: {
        ...(w.__debug?.mapState as Record<string, unknown> | undefined),
        bottomOcclusionPx,
        previewOcclusionPx,
      },
    };
  }, [bottomOcclusionPx, previewOcclusionPx]);

  // Issue #1824 Slice S10b — the marker-resolve + stepper cluster (Issue
  // #1810 Stage 2A, MODEL A user-locked model, see approved-plan.toml
  // [user_decision]) is extracted verbatim into the pure resolveMarkerPopover
  // module. Issue #1939 — RELOCATED from just after the isCityValid early
  // return below (its original S10b position) to HERE, immediately after
  // isMarkerPopoverEligible. Still a plain const, not a hook, so this move
  // changes nothing about the computed value — only WHEN it is available.
  // It has to move because the new URL-hydration useEffect right below DOES
  // need currentMapMarkerListings as a real reactive dependency, and a
  // useEffect cannot be declared after a conditional return (Rules of
  // Hooks). Every field this call closes over was already available earlier
  // in the component before this move (per the original S10b comment).
  const { currentMapMarkerListings, markerPopoverStepper } = resolveMarkerPopover({
    mapLayerCategory: effectiveMapLayerCategory,
    selectedArea: effectiveSelectedArea,
    isGroupResultsState,
    isNodeListingsState,
    mapZoom,
    areaLayerMaxZoom: AREA_LAYER_MAX_ZOOM,
    isAuthenticated,
    journey: nav.journey,
    schoolId: nav.schoolId,
    groupResultsMarkers,
    nodeListingsMarkers,
    markerListings,
    areaMarkerListings,
    schoolRadiusFallbackMarkers,
    isLoadingAreaListings,
    isErrorAreaListings,
    markersLoading,
    isMarkerPopoverEligible,
    selectedMarkerListing,
  });

  // Issue #1939 — resolves the URL `listing` param against the SAME ordered
  // marker set PropertyMap renders (currentMapMarkerListings) and the panel
  // scroll/stepper already trust (Issue #1810 MODEL A). null whenever the id
  // is absent, not (yet) present in the loaded set, or filtered off the map
  // — the hydration effect below treats all of those as LEAVE_PARAM_NO_POPOVER
  // (safe no-op), never an error/toast. Gives the effect a stable,
  // identity-comparable dependency instead of the raw currentMapMarkerListings
  // array, which re-allocates on every filter/journey/area change (qa-fast
  // risk register item 3) — recomputing this memo on those changes is cheap
  // (an O(n) find over a small array); the EFFECT below only re-runs when the
  // *resolved result* actually changes.
  const urlHydratedMarkerListing = useMemo(
    () =>
      nav.selectedListing
        ? (currentMapMarkerListings.find((l) => l.id === nav.selectedListing) ?? null)
        : null,
    [nav.selectedListing, currentMapMarkerListings],
  );

  // Issue #1939 — URL → popover restore (Back/Forward/hard-refresh/deep-link).
  // The click/sibling/show-in-list handlers (useMarkerSelection) only ever
  // SET selectedMarkerListing/markerPixelPos from a user gesture; nothing
  // hydrated them from nav.selectedListing on mount or on a later
  // data/map-ready transition, so a deep-linked/refreshed `?listing=<uuid>`
  // restored the marker highlight (URL-driven — DiscoverMapCanvas passes
  // nav.selectedListing straight through to PropertyMap's
  // selectedListingId prop, no local state involved) but never the popover
  // card itself (gated on the two local states above).
  //
  // Reactive by construction: fires again whenever urlHydratedMarkerListing
  // (marker-data availability), isMarkerPopoverEligible (atomic journey
  // gate — school/agri-first never call hydrateSelectedMarkerFromUrl, so
  // neither local state is ever set for them), or mapReady flips — so a cold
  // hard-refresh where markers/area data resolve a render or two after mount
  // still restores the card once they do, instead of only checking once on
  // mount. hydrateSelectedMarkerFromUrl itself is idempotent (no-op if
  // already selected) and PERSISTENTLY suppressed (not just for one cycle)
  // right after showMarkerInList closes the card for the same id — including
  // across repeated re-fires of this effect caused by resolveMarkerPopover's
  // deliberately non-memoized currentMapMarkerListings — until
  // nav.selectedListing genuinely changes away from that id. See
  // useMarkerSelection's listTransitionSuppressIdRef for the full contract.
  //
  // Issue #1939 code-review F1 — REVERSE sync. When the URL genuinely no
  // longer carries a `listing` id (nav.selectedListing == null — e.g.
  // Back navigation past the point the id was pushed), the popover must
  // close even though nothing here ever called handlePopoverDismiss (which
  // owns the FORWARD direction: local state → URL). Deliberately keyed off
  // nav.selectedListing, not urlHydratedMarkerListing, so a same-id
  // marker that's momentarily absent from currentMapMarkerListings (e.g.
  // mid-filter-recompute) does NOT close a popover the URL still claims —
  // that transient-miss case is instead covered by
  // hydrateSelectedMarkerFromUrl's own bounded rAF retry (F2) for the DOM
  // node not being painted yet.
  //
  // Issue #1973 rev-2 (A1 fix) — this comment's original "cannot race the
  // click path" claim was WRONG for pure school-first: handleSelectMarkerListing
  // deliberately does NOT write the URL `listing` param there (the
  // #1547-deferred design), so a school-first click sets selectedMarkerListing
  // while nav.selectedListing stays null — landing exactly in this
  // branch and wiping the click-set popover (the reverse-sync clear-race).
  // The rev-1 gate fix (admitting pure school-first into isMarkerPopoverEligible)
  // is what made this branch reachable for that state at all; previously the
  // effect early-returned via the eligibility check above. Fixed by
  // isMarkerPopoverUrlBacked(): only clear here when the popover currently
  // tracked is URL-backed (source !== 'click') — i.e. skip the clear ONLY for
  // a pure click-set popover. Area-first (and agri-first/#1738 combined)
  // clicks ARE URL-backed (they write `listing`), so this guard does NOT
  // regress their Back-navigation close — see
  // MapDiscovery.issue1973.schoolFirstMarkerPopup.test.tsx AC11.
  //
  // Issue #1939 rework F3 — third reconciliation branch: the URL names a
  // listing id (nav.selectedListing != null) that is NOT (yet)
  // resolvable against the current marker set (urlHydratedMarkerListing ==
  // null), AND a DIFFERENT listing's popover is currently showing locally
  // (selectedMarkerListing != null && selectedMarkerListing.id !==
  // nav.selectedListing). Without this branch the effect did nothing
  // in this state, leaving the screen showing the OLD listing's popover
  // while the URL/selection had already moved to a new, unresolvable one.
  //
  // The `selectedMarkerListing?.id !== nav.selectedListing`
  // discriminator is what separates this (F3: a genuinely DIFFERENT id,
  // stale) from F2's bounded rAF retry (SAME id, still resolving/painting —
  // must be left alone to keep polling). Two sub-cases both correctly fall
  // out of requiring selectedMarkerListing to be non-null AND mismatched:
  //   - Same id mid-retry (F2): selectedMarkerListing is either still null
  //     (nothing painted yet) or already equals the target id once F2
  //     succeeds — this branch's `!= null` guard or id-equality guard skips
  //     it either way, so F2's retry is never torn down here.
  //   - Fresh deep-link to an unresolvable id with no popover open yet:
  //     selectedMarkerListing is null, so `selectedMarkerListing != null`
  //     is false and this branch is a no-op — it must NOT cancel a
  //     legitimately in-flight F2 retry for that same fresh id.
  // Only when a DIFFERENT listing is genuinely still displayed does this
  // branch fire, clearing it via clearMarkerPopoverFromUrl (which itself
  // cancels any in-flight retry for the OLD id FIRST, then clears local
  // state — see that method's JSDoc) while deliberately leaving the URL's
  // `listing` param untouched (no clearSelectedListing call) so that once
  // the new id resolves (urlHydratedMarkerListing becomes non-null on a
  // later render), the existing happy-path branch above hydrates it
  // normally, with its own F2 retry if needed.
  useEffect(() => {
    if (!isMarkerPopoverEligible || !mapReady) return;
    if (urlHydratedMarkerListing) {
      hydrateSelectedMarkerFromUrl(urlHydratedMarkerListing);
      return;
    }
    if (nav.selectedListing == null) {
      // Issue #1973 rev-2 (A1) — skip the clear ONLY for a pure click-set
      // (school-first) popover, which was never URL-backed to begin with.
      // A URL-backed popover (area-first/#1738 combined, or a hydrated
      // deep-link) still closes here, unconditionally.
      if (isMarkerPopoverUrlBacked()) {
        clearMarkerPopoverFromUrl();
      }
      return;
    }
    if (selectedMarkerListing != null && selectedMarkerListing.id !== nav.selectedListing) {
      clearMarkerPopoverFromUrl();
    }
  }, [
    isMarkerPopoverEligible,
    mapReady,
    urlHydratedMarkerListing,
    hydrateSelectedMarkerFromUrl,
    nav.selectedListing,
    clearMarkerPopoverFromUrl,
    isMarkerPopoverUrlBacked,
    selectedMarkerListing,
  ]);

  // Issue #1606 — resolved group display name for the area-first breadcrumb. Prefers the
  // backend group name, falls back to a prettified slug so a deep-linked groupId that has
  // not yet hydrated still reads as a human label (e.g. "University Belt"). Null when no
  // group context exists — the breadcrumb then omits the group crumb.
  const selectedGroupName =
    focusedGroup?.name ?? (nav.groupId ? prettifyZoneSlug(nav.groupId) : null);

  // Issue #2142 (correction pass) — regionGuideVisible/regionGuideRingActive
  // (issue #1808 deep-link-vs-pick rule) moved into
  // controllers/useDiscoverRegionGuideController.ts, next to the state they
  // read, so #1808 has exactly one owner.

  if (!isCityValid) return <CityNotSupported city={city} />;

  // Issue #1810 (Stage 2A) — steps the popup to the sibling at index±1 within
  // the ratified MODEL A set. Updates selectedMarkerListing + the shared
  // `listing` URL param (so the panel card highlight/scroll follows), and
  // makes NO camera call of any kind — MODEL B (on-map markers + panInside)
  // was explicitly rejected by the user; this function must never gain one.
  const handleStepMarkerListing = (direction: -1 | 1) => {
    if (markerPopoverStepper == null) return;
    const sibling = currentMapMarkerListings[markerPopoverStepper.index + direction];
    if (!sibling) return;
    selectMarkerSibling(sibling);
  };

  // Issue #1824 Slice S8 — the DiscoverMapCountBadge/DiscoverMapStatusHints
  // copy-fork guard (AC4): the SAME formatDiscoverBadgeCopy()/
  // deriveSchoolRadiusPillNoun()/hasActiveAnonPropertyFilter() calls that
  // previously lived inline in the JSX below, now computed once here and
  // passed by prop — the extracted components never import these page-owned
  // helpers, so the copy contract cannot fork (slice-s8-design.md FLAG-A/B).
  const groupSelectedBadgeCopy = formatDiscoverBadgeCopy(discoverBadge, {
    scopeLabel: focusedGroup?.name ?? '',
    noun: 'verified properties',
    searchQuery: nav.q,
  });
  // Issue #2083 (F2 fix, primary reported symptom) — this is the branch that
  // actually renders under the canonical node journey (isAreaFirstSelectedAreaState
  // and isSelectedGroupState are both provably false there — derivePanelContent
  // never returns 'area-selected' without the legacy `areaKey`, since the node
  // journey never sets it). Was the bare `selectedArea`, which is null here, so
  // this fell through straight to the city label — the exact "1,737 properties
  // in Bangalore" symptom reported against a 9-listing area.
  const fallbackBadgeCopy = formatDiscoverBadgeCopy(discoverBadge, {
    scopeLabel:
      effectiveSelectedArea?.areaLabel ??
      focusedGroup?.name ??
      (CITY_CONFIG[city]?.label ?? city),
    noun: effectiveSelectedArea ? 'homes' : 'properties',
    searchQuery: nav.q,
  });
  const schoolRadiusPillNoun = deriveSchoolRadiusPillNoun(nav.intent);
  const hasActiveAnonFilter = hasActiveAnonPropertyFilter(filters);

  // Issue #2142 Commit 4 — the mobile "List" toggle button, previously an
  // inline JSX conditional passed directly as DiscoverMapMount's
  // `mobileListButton` prop. Hoisted into a named const (same JSX/onClick/
  // testid/className, unchanged) so it can be threaded through
  // buildMapSurfaceView's flat params object below like every other value.
  const mobileListButton = mobileMapOpen ? (
    <button
      type="button"
      onClick={() => setMobileView('LIST')}
      data-testid="mobile-map-close-list-button"
      className="pointer-events-auto shrink-0 self-start rounded-full border border-border bg-background/95 px-4 py-2 text-sm font-medium shadow-md"
    >
      List
    </button>
  ) : null;

  // Issue #2142 Commit 4 — one flat object matching DiscoverMapCanvasProps
  // (every field DiscoverMapMount's JSX passed straight through) plus the
  // surface-only additions (mobileMapOpen, activeAreasNavigationJourney,
  // navJourney, isPreviewSheetOpen, selectedListingPreview, mapReady,
  // isSelectedNodeOutOfView) and the 3 command-only handlers the overlays
  // group needs. Passed to BOTH buildMapSurfaceView and
  // buildMapSurfaceCommands — each Picks only the fields it needs.
  // Issue #2142 Commit 5 (team-lead ruling) — nests the controllers' OWN
  // result objects (or small Picked subsets) instead of re-listing every
  // one of their fields individually; only genuinely page-local fields
  // (state this page owns directly, or derived consts with no controller
  // source) stay flat. buildMapSurfaceView/buildMapSurfaceCommands
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
    areaLayerMaxZoom: AREA_LAYER_MAX_ZOOM,
    selectedArea: effectiveSelectedArea,
    isBoundedBrowseState: isGroupResultsState || isNodeListingsState,
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
    mobileListButton,
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
    // Issue #1956 PR-5 defect fix (Phase 7A) — see the prior inline comment
    // (git history, same narrowing) for why `!mobileMapOpen` is ANDed in here.
    isMarkerPopoverEligible: isMarkerPopoverEligible && !mobileMapOpen,
    markerPopoverStepper,
    navigate,
    handleStepMarkerListing,
    showMarkerInList,
    // surface-only additions (not part of DiscoverMapCanvasProps)
    mobileMapOpen,
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
  const mapView = buildMapSurfaceView(mapProps);
  const mapCommands = buildMapSurfaceCommands(mapProps);

  // Issue #2142 Commit 4 — one flat object matching
  // DiscoverRightPanelContainerProps (every field DiscoverRightPanelContainer's
  // JSX passed straight through), passed to both buildPanelSurfaceView and
  // buildPanelSurfaceCommands.
  const panelProps = {
    resolvedPanelContent,
    areasNavigationJourney: activeAreasNavigationJourney,
    hoveredNavigationNodeKey,
    onNavigationNodeHoverChange: setHoveredNavigationNodeKey,
    focusedClusterMemberAreaKeys,
    onClusterFocusChange: setFocusedClusterMemberAreaKeys,
    onSelectedListingPreviewChange: setSelectedListingPreview,
    selectedMarkerListing,
    clearSelectedMarkerListing,
    city,
    activeContextChips,
    discoverAreas,
    // Issue #1956 PR-4 — harmless-but-consistent bridge: the legacy
    // DiscoverRightPanel branch this prop feeds is UNREACHABLE while
    // the canonical Areas journey is mounted (see
    // DiscoverPanelSurface's showAreasNavigationJourney
    // early-return, [scope.must_not_change]), so this has no visible
    // effect today — kept in sync with every other selectedArea
    // consumer on this page rather than silently left stale.
    selectedArea: effectiveSelectedArea,
    areaListings,
    isLoadingAreaListings,
    isAuthenticated,
    handleAreaSelect,
    areaResultSummaryText,
    journeyView,
    handleAreaFirstBack,
    journeyCommands,
    areasLoading,
    agriAreasData,
    isLoadingAgriAreas,
    areaGroupsData,
    isLoadingAreaGroups,
    regionScopedGroups: regionScopedGroupsData?.groups,
    isLoadingRegionScopedGroups,
    isRegionScopedGroupsError,
    refetchRegionScopedGroups,
    scopeNamespaces,
    armRegionSelect,
    regionGuideRingActive,
    regionOverviewMarkerKind,
    regionSelectNonce,
    prefersReducedMotion,
    summaryRegions,
    selectedGroupName,
    corridorGroups,
    isLoadingRegionalAreaGroups,
    isRegionalAreaGroupsError,
    refetchRegionalAreaGroups,
    selectedRegion,
    selectedMaxKm,
    filteredAgriListings,
    agriMapListingsData,
    isLoadingAgriGroupListings,
    isAgriGroupListingsError,
    agriGroupLabel,
    refetchAgriGroupListings,
    discoverAreasForPanel,
    filtersContent,
    trendsHref,
    isFetching,
    isLoading,
    searchQuery,
    handleSearchChange,
    filters,
    handleFiltersChange,
    selectedSchool,
    schools,
    schoolsQuery,
    schoolListings,
    listingDataLoading,
    handleBoundedSearch,
    interactionCommands,
    setAreaSearchQuery,
    areaMarkerCounts,
    highlightedAreaKeys,
    selectedGroupListingItem,
    navigate,
    cityTotal,
    cityHasNoListings,
    handleCityChange,
    groupResultsListings,
    isLoadingGroupResults,
    isGroupResultsError,
    groupResultsTotalElements,
    refetchGroupResults,
    page,
    totalPages,
    totalElements,
    setPage,
  };
  const panelView = buildPanelSurfaceView(panelProps);
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
  const overlayView = buildOverlaySurfaceView(overlayProps);
  const overlayCommands = buildOverlaySurfaceCommands(overlayProps);

  return (
    <DiscoverPageShell
      isMobileShell={isMobileShell}
      mobileMapOpen={mobileMapOpen}
      mobileMapTrigger={
        !mobileMapOpen
          ? { onOpenMap: () => setMobileView('MAP'), triggerRef: mobileMapTriggerRef }
          : undefined
      }
      mapSurface={
        <DiscoverMapSurface view={mapView} commands={mapCommands} mapContainerRef={mapContainerRef} />
      }
      panelSurface={<DiscoverPanelSurface view={panelView} commands={panelCommands} />}
      overlaySurface={<DiscoverOverlaySurface view={overlayView} commands={overlayCommands} />}
    />
  );
}
