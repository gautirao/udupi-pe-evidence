import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { PublicDiscoverLayout } from '@/components/layout/PublicDiscoverLayout';
import { computeZoneLabelPoints } from '@/lib/schoolZoneLabels';
import type { AreaPoint, AreaMarkerClusterInfo } from '@/components/map/AreaMarkerLayer';
import { MapFilters } from '@/components/map/MapFilters';
import {
  isSchoolRadiusOverlayState,
  prettifyZoneSlug,
} from '@/components/discover/SchoolRadiusMapOverlay';
import { ActiveContextChips } from '@/components/discover/ActiveContextChips';
import { AREA_LAYER_MAX_ZOOM, shouldShowMarkers } from '@/lib/map/zoomPolicy';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import {
  computeDiscoverLayer,
  toLayerInput,
  selectDiscoverMapLayer,
  resolveActiveDiscoverGroup,
  resolveDiscoverGroupForAreaKey,
  type DiscoverMapLayerKind,
} from '@/utils/discoverLayerRegistry';
import { CityNotSupported } from '@/components/discover/CityNotSupported';
import { DiscoverControlBar } from '@/components/discover/DiscoverControlBar';
import { useDiscoverInteractionState } from '@/features/discover/state/useDiscoverInteractionState';
import { useReducedMotion } from '@/features/discover/state/useReducedMotion';
import { useRegionGuideState } from '@/features/discover/state/useRegionGuideState';
import { useAreaSearchState } from '@/features/discover/state/useAreaSearchState';
import { useDiscoverSearchState } from '@/features/discover/state/useDiscoverSearchState';
import { useMarkerSelection } from '@/features/discover/state/useMarkerSelection';
import { useDiscoverJourneyTransitions } from '@/features/discover/state/useDiscoverJourneyTransitions';
import { useDiscoverCameraOrchestration } from '@/features/discover/state/useDiscoverCameraOrchestration';
import { resolveMarkerPopover } from '@/features/discover/map/resolveMarkerPopover';
import { useDiscoverMapPresentation } from '@/features/discover/presentation/useDiscoverMapPresentation';
import { useDiscoverJourneyPredicates } from '@/features/discover/presentation/useDiscoverJourneyPredicates';
import { useDiscoverBadgeAnnounce } from '@/features/discover/presentation/useDiscoverBadgeAnnounce';
import { useDiscoverGroupResults } from '@/features/discover/presentation/useDiscoverGroupResults';
import { useFilteredAgriListings } from '@/features/discover/presentation/useFilteredAgriListings';
import { useSchoolListings } from '@/features/discover/presentation/useSchoolListings';
import { useSchoolFirstCounts } from '@/features/discover/presentation/useSchoolFirstCounts';
import { useAuth } from '@/contexts/AuthContext';
import {
  isSelectedNodeOutOfView as checkIsSelectedNodeOutOfView,
  getCameraIntentForRecenter,
} from './MapDiscovery.recenter';
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
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { useAreaGroups, type AreaGroup } from '@/hooks/useAreaGroups';
import { useRegionScopedAreaGroups } from '@/hooks/useRegionScopedAreaGroups';
import { useRegionalAreaGroups } from '@/hooks/useRegionalAreaGroups';
import { resolveScope, type ScopeNamespaces } from '@/features/discover/presentation/resolveScope';
import { labelToSlug } from '@/utils/macroRegionResolver';
import type { DiscoverSummaryRegion } from '@/hooks/useDiscoverSummary';
import { useDiscoverRegionSummary } from '@/hooks/useDiscoverRegionSummary';
import { useAgriMapListings } from '@/hooks/useAgriMapListings';
import { useSchoolsByArea } from '@/hooks/useSchoolsByArea';
import { useDiscoverListings } from '@/hooks/useDiscoverListings';
import { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';
import { useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';
import { CITY_CONFIG, DEFAULT_CITY } from '@/lib/localityUtils';
import { slugifyFromAreaKey } from '@/lib/areaSlug';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { DiscoverMapMount } from '@/features/discover/views/DiscoverMapMount';
import { useMobileMapOverlayShell } from '@/hooks/useMobileMapOverlayShell';
import { DiscoverOverlaySheets } from '@/features/discover/views/DiscoverOverlaySheets';
import { DiscoverRightPanelContainer } from '@/features/discover/views/DiscoverRightPanelContainer';
import { MobileClusterSheet } from '@/features/discover/views/mobile/MobileClusterSheet';
import { MobileListingPreviewSheet } from '@/features/discover/views/mobile/MobileListingPreviewSheet';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import {
  deriveDiscoverBadge,
  formatDiscoverBadgeCopy,
} from '@/features/discover/presentation/discoverBadge';
import { useAreasNavigationJourney } from '@/features/discover/navigation/useAreasNavigationJourney';
import { useClusterFocusUrlParam } from '@/features/discover/state/url/clusterFocus';
import type { DiscoverNavigationCountsFilters } from '@/hooks/useDiscoverNavigationCounts';
import { deriveAreaPointFromNode } from '@/features/discover/navigation/nodeAreaPoint';
import { isMarkerPopoverEligible as computeMarkerPopoverEligible } from '@/features/discover/navigation/markerPopoverEligibility';
import {
  deriveShowSchoolMarkers,
  deriveSchoolRadiusPillNoun,
} from '@/features/discover/presentation/schoolFirstCounts';
import {
  hasActiveAnonPropertyFilter,
} from '@/features/discover/presentation/anonPropertyFilters';

/**
 * Issue #2083 (code-review Finding 1) — the exact "bridge" expression this
 * component uses to fold the legacy areaKey-driven `selectedArea` and the
 * canonical node-journey's `nodeAreaPoint` into a single value every
 * selectedArea-driven consumer (badge/count copy, area-scoped links,
 * area-scoped filters, map highlight) reads. Extracted to a pure, exported
 * function — rather than left as an inline `selectedArea ?? nodeAreaPoint`
 * in the component body — specifically so tests can exercise the REAL
 * production expression at the REAL call site instead of re-deriving the
 * formula by hand (see MapDiscovery.issue2083.badgeBridge.test.ts).
 *
 * `selectedArea` always wins when both are non-null; per the two sources'
 * own invariants (nodeAreaPoint.ts's module doc, the call site below) they
 * are mutually exclusive in practice — the legacy areaKey-driven journeys
 * never populate `nav.node`, and the canonical node journey never
 * populates `nav.areaKey` — so the precedence is a defensive default only,
 * not a meaningful behavioural choice.
 */
export function resolveEffectiveSelectedArea(
  selectedArea: AreaPoint | null | undefined,
  nodeAreaPoint: AreaPoint | null | undefined,
): AreaPoint | null {
  return selectedArea ?? nodeAreaPoint ?? null;
}

/**
 * Issue #2083 cycle 4 (code-review BLOCKING fix, 4th recurrence of this bug
 * class) — the area-first selected-GROUP drill-down guard. Extracted to a
 * pure, exported function for the same reason as `resolveEffectiveSelectedArea`
 * above: MapDiscovery cannot be mounted in JSDOM (Leaflet/QueryClient/Router/
 * Auth), so this lets a regression test exercise the REAL production
 * predicate at its REAL call site instead of re-deriving the formula by hand.
 *
 * Must be gated on `effectiveSelectedArea` (the node+legacy bridge), never
 * the bare legacy value — see `resolveEffectiveSelectedArea`'s own doc above.
 * A pure canonical node journey (`?journey=area-first&groupId=<group>&node=
 * <AREA leaf in that group>`, no legacy areaKey) reaches
 * `resolvedPanelContent === 'area-groups-landing'` with `focusedGroup`
 * truthy AND an area resolved via `nodeAreaPoint` — gating on the bare
 * legacy value would wrongly report "no area selected yet" and surface
 * group-overview map chrome for a user who has already drilled into a
 * specific area.
 */
export function resolveIsSelectedGroupState(
  resolvedPanelContent: DiscoverPanelContent,
  focusedGroup: AreaGroup | null | undefined,
  effectiveSelectedArea: AreaPoint | null | undefined,
): boolean {
  return resolvedPanelContent === 'area-groups-landing' && !!focusedGroup && !effectiveSelectedArea;
}

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
  const { triggerRef: mobileMapTriggerRef } = useMobileMapOverlayShell({
    isOpen: mobileMapOpen,
    onClose: () => setMobileView('LIST'),
  });
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
  const showAreasNavigationJourney = nav.journey === 'area-first';
  // Issue #1956 PR 2 (Slice 3, pass 4, AC3.9) — the ONE ephemeral hover/focus
  // node_key, lifted here for the same reason `areasNavigationJourney` is:
  // threaded unchanged to BOTH the map's AreaDestinationMarkerLayer and the
  // panel's NavigationChildCard list so a hover on either side highlights the
  // matching item on the other, by stable node_key. Plain useState (never the
  // URL) — hover creates no history entry and no camera fit.
  const [hoveredNavigationNodeKey, setHoveredNavigationNodeKey] = useState<string | null>(null);
  // Issue #1956 PR 3 (bounded state-lift, AC4.12/AC4.5) — the ONE focused
  // visual-AREA-cluster identity, lifted here for the same reason
  // `hoveredNavigationNodeKey` is: threaded unchanged to BOTH the map's
  // AreaDestinationMarkerLayer (`focusedClusterMemberAreaKeys`) and the
  // panel's DiscoverAreasJourneyPanel (via DiscoverRightPanelContainer) so a
  // cluster-marker click on the map and the panel's own member list can
  // never disagree on the focused member set (AC4.12). The member `areaKey`s
  // ARE the identity — the map's own visual clustering (pan/zoom-dependent
  // pixel grouping) picks them; this state does not re-derive or re-cluster,
  // it only stores what the layer reports back.
  //
  // Issue #2088 (commit 5) — MIGRATED off plain `useState` onto the new
  // `clusterFocus` URL domain (state/url/clusterFocus.ts), so this
  // presentation state now survives browser Back/Forward (AC6) instead of
  // being wiped on every remount. `useClusterFocusUrlParam` always writes
  // with `{ replace: true }` (D2_binding_requirements BR3/BR6 — never a
  // hierarchy history entry). The node-change reset effect that used to live
  // here (REQUIRED CHANGE 7) is RETIRED below: `navigation.ts`'s
  // `applyNodeDelta` now deletes `clusterFocus` in its own delete-list (BR5),
  // so every node write carries the same guarantee this effect used to
  // provide locally — see `clusterFocus.ts`'s module doc for the full
  // BR1-BR8 accounting.
  const { clusterFocus: focusedClusterMemberAreaKeys, setClusterFocus: setFocusedClusterMemberAreaKeys } =
    useClusterFocusUrlParam();
  // Issue #1494 — map URL intent ('buy'|'rent') to backend listingPurpose
  // ('sale'|'rent'). 'buy' is the default; absent/invalid intent → 'sale'.
  // Never send 'buy' to the backend.
  // Issue #2083 RC_C — HOISTED up from its original position (further down,
  // just above the agri map-listings fetch) so it is in scope for the
  // `navigationCountsFilters` object below, which must be built BEFORE the
  // `useAreasNavigationJourney` call.
  const intentListingPurpose: string = nav.intent === 'rent' ? 'rent' : 'sale';

  // Issue #2083 RC_C — the FULL filter set for navigation destination counts,
  // not purpose alone. Before this fix `useAreasNavigationJourney` below was
  // called with no `filters` key at all, so it fell back to the hook's
  // EMPTY_FILTERS default and the counts endpoint was ALWAYS requested
  // blended (Buy and Rent produced byte-identical counts — F7). Purpose-only
  // would have fixed that one symptom while leaving counts silently
  // disagreeing with the visible list whenever any OTHER filter (bedrooms,
  // propertyTypes, seller type, ready-to-move, etc.) is active — trading one
  // reported bug for a subtler unreported one (AC10 / the issue's own DoD
  // names "filters-active" states explicitly). `nav.filters` is the SAME URL
  // filter state every other Discover data hook on this page reads; the
  // fields below are exactly the ones `DiscoverNavigationCountsFilters` (and
  // the shared `DiscoverListingPredicateBuilder` behind it) already accept —
  // no schema change on either side, only supplying what was already
  // plumbed and simply never passed here.
  const navigationCountsFilters: DiscoverNavigationCountsFilters = {
    purpose: intentListingPurpose,
    propertyTypes: nav.filters.propertyTypes,
    bedrooms: nav.filters.bedrooms,
    sellerTypes: nav.filters.sellerTypes,
    readyToMove: nav.filters.readyToMove,
    reraRegistered: nav.filters.reraRegistered,
    newToMarket: nav.filters.newToMarket,
    backOnMarket: nav.filters.backOnMarket,
  };

  const areasNavigationJourney = useAreasNavigationJourney({
    // Matches the established `nav.city || DEFAULT_CITY` idiom this early
    // section already uses (see useAreaGroups/useRegionalAreaGroups below) —
    // the `city` local const is only defined later, inside useDiscoverPageState.
    city: nav.city || DEFAULT_CITY,
    requestedNodeKey: nav.rawNodeParam ?? null,
    onSelectNode: actions.goToNode,
    filters: navigationCountsFilters,
    enabled: showAreasNavigationJourney,
  });

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

  // Issue #1429 (B2) — precomputed corridor groups for the agri-first landing panel.
  // useRegionalAreaGroups returns { groups, isLoading, error } directly (no .data wrapper).
  // Issue #1745 Batch B — same DEFAULT_CITY fallback as useAreaGroups above, for
  // agri-first city-landing consistency (same bug class: empty nav.city
  // disabling the hook while the panel shows the defaulted city).
  const {
    groups: corridorGroups,
    isLoading: isLoadingRegionalAreaGroups,
    isError: isRegionalAreaGroupsError,
    refetch: refetchRegionalAreaGroups,
  } = useRegionalAreaGroups(nav.city || DEFAULT_CITY);

  // Issue #1429 — derive areaKeys from the selected corridor + distance tier to fetch
  // agri map listings. Hook is disabled when selectedRegion + selectedMaxKm are not both set.
  // Look up the corridor by selectedRegion, then find the tier by selectedMaxKm.
  const selectedRegion = nav.selectedRegion ?? null;
  const selectedMaxKm = nav.selectedMaxKm ?? null;
  const selectedCorridorData = selectedRegion
    ? corridorGroups.find((g) => g.directionCode === selectedRegion) ?? null
    : null;
  const selectedTierData = selectedCorridorData && selectedMaxKm != null
    ? selectedCorridorData.availableMaxDistances.find((t) => t.maxKm === selectedMaxKm) ?? null
    : null;
  const selectedGroupAreaKeys = selectedTierData?.areaKeys ?? [];
  // Issue #1494 — map URL intent ('buy'|'rent') to backend listingPurpose ('sale'|'rent').
  // 'buy' is the default; absent/invalid intent → 'sale'. Never send 'buy' to the backend.
  // Declaration hoisted above (before `areasNavigationJourney`) in #2083 RC_C —
  // see that hoisted declaration's comment for why.

  const {
    data: agriMapListingsData,
    isLoading: isLoadingAgriGroupListings,
    isError: isAgriGroupListingsError,
    refetch: refetchAgriGroupListings,
  } = useAgriMapListings(nav.city, selectedGroupAreaKeys, intentListingPurpose, isAuthenticated);

  // Issue #1429 — corridor + distance tier label for the agri-group-selected panel header chip.
  // Show "groupName · distanceLabel" when both are selected; fall back to just groupName.
  const agriGroupLabel = selectedCorridorData
    ? selectedTierData
      ? `${selectedCorridorData.groupName} · ${selectedTierData.distanceLabel}`
      : selectedCorridorData.groupName
    : null;

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
  // Cold-load safety: areaGroupsData resolves before panelContent routes to 'area-group-results'
  // because derivePanelContent only routes there when groupId is present; groupId drives
  // the useAreaGroups fetch; when areaGroupsData has loaded, the resolved group is present.
  const isGroupResultsState = panelContent === 'area-group-results';
  const resolvedGroupForResults = isGroupResultsState
    ? resolveActiveDiscoverGroup(areaGroupsData?.groups, nav.groupId)
    : null;
  const resolvedGroupAreaKeys: string[] = resolvedGroupForResults?.area_keys ?? [];

  // ── Authenticated path: /api/discover/listings (paginated, fully filtered) ──
  const {
    data: groupResultsAuthedData,
    isLoading: isLoadingGroupResultsAuthed,
    isError: isGroupResultsErrorAuthed,
    refetch: refetchGroupResultsAuthed,
  } = useDiscoverListings({
    city: nav.city,
    page: 0,
    size: 50,
    // Issue #1597 — thread the active URL discover filters (propertyTypes, price, bedrooms,
    // etc.) so that the group-results list respects user-applied filters.
    filters: urlDiscoverFilters,
    // Gate: only fire for authenticated users in group-results state.
    enabled: isGroupResultsState && isAuthenticated,
    listingPurpose: intentListingPurpose,
    areaKeys: isGroupResultsState ? resolvedGroupAreaKeys : undefined,
  });

  // ── Authenticated path: /api/discover/markers (full predicate, list+map consistent) ──
  // Issue #1597 — use useDiscoverFilteredMarkers (→ /api/discover/markers) rather than
  // useDiscoverMarkers (→ /api/listings/markers) because the public endpoint silently
  // ignores areaKeys and property filters (ListingMarkersController has no @RequestParam
  // for them). The authed endpoint honours the full predicate including areaKeys + intent.
  // bbox=null: group-results show all matching markers regardless of viewport.
  const {
    data: groupResultsMarkersData,
  } = useDiscoverFilteredMarkers(
    nav.city,
    urlDiscoverFilters,
    isGroupResultsState && isAuthenticated, // only fire for authenticated users
    null,        // bbox — no viewport clipping for group-results
    undefined,   // q — no keyword search in group-results
    intentListingPurpose,
    undefined,   // excludePropertyType — not applicable
    isGroupResultsState ? resolvedGroupAreaKeys : undefined,
  );

  // ── Anonymous path: /api/discover/cities/{city}/listings (public, multi-areaKeys) ──
  // Mirrors the anon fallback for school-first (schoolListings useMemo) and area-first.
  // useDiscoverCityListings only accepts a single propertyType and bedrooms value; pass the
  // first value and filter remaining values client-side via applyAnonPropertyFilters below.
  //
  // Per-area teaser cap: the backend clamps server-side to MAX_LIMIT=20 per area
  // (CityAreaListingsService.java Math.min(raw, 20)), so anon users see ≤20 listings/area
  // regardless of limitPerArea. This is an ACCEPTED, documented limitation — the anon path
  // is a teaser, not a full paginated view (consistent with existing area-first anon behavior).
  const anonGroupFilters = urlDiscoverFilters;
  const {
    data: groupResultsAnonData,
    isLoading: isLoadingGroupResultsAnon,
    isError: isGroupResultsErrorAnon,
    refetch: refetchGroupResultsAnon,
  } = useDiscoverCityListings({
    city: nav.city,
    areaKeys: isGroupResultsState && !isAuthenticated ? resolvedGroupAreaKeys : [],
    limitPerArea: 20, // server caps at 20 anyway (MAX_LIMIT in CityAreaListingsService)
    // Forward the first propertyType/bedrooms value; remaining are filtered client-side.
    propertyType: anonGroupFilters.propertyTypes?.[0],
    bedrooms: anonGroupFilters.bedrooms?.[0],
    // priceMin/priceMax: convert from rupees (PropertyFilters unit) to paise (backend unit).
    minPrice: anonGroupFilters.priceMin != null ? anonGroupFilters.priceMin * 100 : undefined,
    maxPrice: anonGroupFilters.priceMax != null ? anonGroupFilters.priceMax * 100 : undefined,
    listingPurpose: intentListingPurpose,
  });

  // Issue #1824 Slice S11b (C2) — anon/auth group-results derivation lifted into
  // useDiscoverGroupResults (see the hook's header comment for the moved-cluster
  // audit notes + the internal-only groupResultsAnonRaw/groupResultsAnonListings).
  const {
    groupResultsListings,
    groupResultsTotalElements,
    isLoadingGroupResults,
    isGroupResultsError,
    refetchGroupResults,
    groupResultsMarkers,
  } = useDiscoverGroupResults({
    isGroupResultsState,
    isAuthenticated,
    groupResultsAuthedData,
    isLoadingGroupResultsAuthed,
    isGroupResultsErrorAuthed,
    refetchGroupResultsAuthed,
    groupResultsMarkersData,
    groupResultsAnonData,
    isLoadingGroupResultsAnon,
    isGroupResultsErrorAnon,
    refetchGroupResultsAnon,
    anonGroupFilters,
  });

  // Issue #1430 — derive the AgriMapListingItem for the selected listing peek.
  // Finds the matching item from the already-loaded agri map listings.
  // Returns null when selectedListing is absent or not found (safe fallback).
  const selectedGroupListingItem = useMemo(
    () =>
      nav.selectedListing && agriMapListingsData?.listings
        ? (agriMapListingsData.listings.find((l) => l.id === nav.selectedListing) ?? null)
        : null,
    [nav.selectedListing, agriMapListingsData?.listings],
  );

  // Issue #1824 Slice S11b (C4) — client-side filtered agri listings lifted into
  // useFilteredAgriListings (see the hook's header comment).
  const filteredAgriListings = useFilteredAgriListings({
    agriMapListingsData,
    filters: nav.filters,
    isAuthenticated,
  });

  // Issue #1824 Slice S4 — search-keyword state (searchQuery/debouncedSearch,
  // reverse URL-sync, 250ms debounce, handleSearchChange) now lives in
  // useDiscoverSearchState. See the hook's header comment for the KNOWN,
  // INTENTIONAL split-brain (debouncedSearch drives badge+markers here;
  // nav.q drives ActiveContextChips) — do NOT unify.
  const { searchQuery, debouncedSearch, handleSearchChange } =
    useDiscoverSearchState({ urlQ: nav.q, setUrlSearch: actions.setSearchQuery });

  const [nearSchoolOpen, setNearSchoolOpen] = useState(false);

  // a3 — map container ref for MarkerPopoverCard auto-positioning (clamp-to-bounds).
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  // Issue #1824 Slice S5 — EARLY marker-selection cluster (selectedMarkerListing,
  // markerPixelPos, the markerListingCtxRef identity-stable-handler pattern, and
  // handleSelectMarkerListing/handleMarkerClickWithPosition/handlePopoverDismiss)
  // extracted verbatim to useMarkerSelection. See the hook's header comment and
  // docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s5-design.md
  // for the full history (#1373, #1466, #1547, #1738, #1798, #1810).
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
  } = useMarkerSelection({
    urlActions: actions,
    urlState: { ...nav, viewport } satisfies DiscoverUrlState,
    mapContainerRef,
    // Issue #1956 PR-4 (risk R1) — the SAME leaf-identity boolean fed to the
    // page-level isMarkerPopoverEligible render gate below, so the capture
    // gate (in the hook) and the render gate can never drift on this arm.
    isNodeAreaLeaf: isNodeAreaLeafActive,
  });

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
  // useDiscoverJourneyTransitions) as a documented deviation from the S6 plan: the
  // raw useState pair must stay declared before useDiscoverMapData below, which reads
  // boundedSearchTriggered synchronously in its markersEnabled param. Moving it into
  // the journey hook would create a circular dependency, since that hook's own moved
  // effects need useDiscoverMapData's OUTPUTS (discoverAreas/areasLoading/schoolById/
  // schoolByIdError). See useDiscoverJourneyTransitions.ts's file-header "Deviation 2"
  // comment for the full rationale. Every WRITE SITE for this flag still lives in the
  // journey hook's commands (injected setter) — only the useState call itself is here.
  const [boundedSearchTriggered, setBoundedSearchTriggered] = useState(false);

  // Issue #1824 Slice S1 — ephemeral hover/emphasis cluster extracted to a
  // leaf state hook (hoveredListingId, hoveredAreaKeyForMap,
  // highlightedAreaKeys). See useDiscoverInteractionState for full history
  // (Issues #1547, #1798 PR-B, #1806 FIX-5d) — none of this is ever written
  // to the URL.
  const { view: interactionView, commands: interactionCommands } = useDiscoverInteractionState();
  const { hoveredListingId, hoveredAreaKeyForMap, highlightedAreaKeys } = interactionView;

  // Issue #1798 PR-B — panel↔map area-marker plumbing (Unit D).
  // areaSearchQuery/debouncedAreaSearchQuery now live in useAreaSearchState
  // above (Issue #1824 S2c).
  const { areaSearchQuery, debouncedAreaSearchQuery, setAreaSearchQuery } = useAreaSearchState();

  // hoveredAreaKeyForMap now lives in useDiscoverInteractionState above (Issue #1824 S1).

  // regionSelectSource/regionSelectNonce/regionGuideDismissed/armRegionSelect
  // now live in useRegionGuideState above (Issue #1824 S2b).
  const { view: regionGuideView, commands: regionGuideCommands } = useRegionGuideState();
  const { regionSelectSource, regionSelectNonce, regionGuideDismissed } = regionGuideView;
  const { armRegionSelect, dismissRegionGuide } = regionGuideCommands;

  // Issue #1808 §8 — reduced-motion detection for the guidance ring/nudge.
  // Issue #1824 Slice S2a — extracted to useReducedMotion (behaviour-preserving).
  const prefersReducedMotion = useReducedMotion();

  // highlightedAreaKeys now lives in useDiscoverInteractionState above (Issue #1824 S1).
  // Issue #1806 (FIX-5d) — non-splittable area-cluster chip click → highlight the
  // panel's member-area rows. Never drives any camera movement (the camera
  // intentionally holds still for a non-splittable cluster click).
  const handleAreaClusterClick = useCallback((cluster: AreaMarkerClusterInfo) => {
    interactionCommands.setHighlightedAreas(cluster.areas.map((a) => a.areaKey));
  }, [interactionCommands]);

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

  // Transient map bbox — not stored in URL. Updated on pan/zoom via onBoundsChange.
  // Stored as a ref for the debounce timer and as state to trigger re-renders/refetches.
  const [mapBbox, setMapBbox] = useState<[number, number, number, number] | null>(null);
  const bboxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBoundsChange = useCallback(
    (bbox: [number, number, number, number]) => {
      if (bboxTimerRef.current) clearTimeout(bboxTimerRef.current);
      bboxTimerRef.current = setTimeout(() => {
        setMapBbox(bbox);
      }, 300);
    },
    [],
  );

  // Cleanup bbox timer on unmount
  useEffect(() => {
    return () => {
      if (bboxTimerRef.current) clearTimeout(bboxTimerRef.current);
    };
  }, []);

  // RH4 (issue #1953, narrowed) — the mobile map view unmounts when switching
  // from MAP to LIST, but MapDiscovery itself does not unmount then, so the
  // unmount-only cleanup above never runs for that transition. Without this, a
  // bboxTimer armed by the last pan/zoom before leaving MAP could still fire
  // setMapBbox after the map is gone. Keyed on mobileView only, so this fires
  // on the MAP -> LIST transition, not on every render.
  useEffect(() => {
    if (mobileView !== 'MAP' && bboxTimerRef.current) {
      clearTimeout(bboxTimerRef.current);
      bboxTimerRef.current = null;
    }
  }, [mobileView]);

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

  // Issue #1882 (Track A PR2 Slice S2c) — backend-owned region summary for the
  // journeyless-landing macro-region bubbles (see overviewAreas below), sourced
  // from the PUBLIC GET /api/discover/cities/{citySlug}/regions rollup (PR1).
  // Called with the SAME city GuidedEntryPanel uses, so the query key matches
  // exactly and this hits the React Query cache the right panel already
  // populated — zero extra fetch. REPLACES the client-side aggregateMacroRegions
  // derivation (which inferred macro-regions from /api/discover/summary +
  // area-group region_label string matching) — summaryRegions below is now a
  // 1:1 map of the backend response with NO client-side aggregation.
  // ADVISORY-1 rework — reuse the EXISTING intentListingPurpose mapping
  // (declared above, nav.intent 'rent'→'rent' else 'sale') rather than
  // inventing a new one; threading it here closes the data-accuracy gap
  // where region listingCount lost buy/rent purpose scoping after the
  // cutover to this endpoint.
  const { data: regionSummaryData } = useDiscoverRegionSummary(city, intentListingPurpose);
  const summaryRegions: DiscoverSummaryRegion[] = useMemo(
    () =>
      (regionSummaryData?.regions ?? []).map((r) => ({
        regionKey: r.key,
        regionLabel: r.label,
        listingCount: r.listingCount,
      })),
    [regionSummaryData],
  );

  // Issue #1910 (PR2) — single source-of-truth region/group namespaces for
  // resolveScope, built ONCE here and reused by handleOverviewAreaClick,
  // useDiscoverMapPresentation, and (via DiscoverRightPanelContainer)
  // AreaGroupsLandingPanel — so scope classification can never drift
  // between call sites.
  const scopeNamespaces: ScopeNamespaces = useMemo(() => {
    const groups = areaGroupsData?.groups ?? [];
    // Issue #1910 (PR2 fix-up, Finding 1) — restores the pre-#1910 ad-hoc
    // `g.name.toLowerCase() === activeScope.toLowerCase()` /
    // `labelToSlug(g.name) === activeScope` fallback (see
    // ScopeNamespaces.groupNameSlugs JSDoc) that plain `groupSlugs`
    // membership does not reproduce, since a group's `id` (DB `slug`) is not
    // always literally `labelToSlug(name)` — e.g. `kr-puram-belt` for
    // "K R Puram Belt" (V106__seed_bangalore_macro_region_mapping.sql).
    const groupNameSlugs = new Map<string, string>();
    for (const g of groups) {
      groupNameSlugs.set(labelToSlug(g.name), g.id);
      groupNameSlugs.set(g.name.toLowerCase(), g.id);
    }
    return {
      regionKeys: new Set(summaryRegions.map((r) => r.regionKey)),
      groupSlugs: new Set(groups.map((g) => g.id)),
      groupNameSlugs,
    };
  }, [summaryRegions, areaGroupsData]);

  // Issue #1910 (PR2) — region-scoped area-group projection (PR1 endpoint),
  // enabled ONLY when the active nav.scope resolves to a REGION (never
  // fires for Udupi's non-region-scoped views, or a direct group/area
  // scope) — see useRegionScopedAreaGroups's `enabled` guard.
  const resolvedUrlScope = useMemo(
    () => resolveScope(nav.scope ?? null, scopeNamespaces),
    [nav.scope, scopeNamespaces],
  );
  const regionScopeKeyForFetch = resolvedUrlScope.kind === 'region' ? resolvedUrlScope.regionKey : null;
  const {
    data: regionScopedGroupsData,
    isLoading: isLoadingRegionScopedGroups,
    // Issue #1910 (PR2 review fix, Finding 3) — surface the real fetch-error
    // state so AreaGroupsLandingPanel can show an honest error+retry UI
    // instead of a misleading "0 zones found" empty state.
    isError: isRegionScopedGroupsError,
    refetch: refetchRegionScopedGroups,
  } = useRegionScopedAreaGroups(nav.city || DEFAULT_CITY, regionScopeKeyForFetch, intentListingPurpose);

  // Issue #1824 Slice S6 — composedResetMapTick + handleStartOver now live in
  // useDiscoverJourneyTransitions; see journeyView/journeyCommands below (declared
  // after useDiscoverMapData + schools, which the hook needs as injected deps).
  // The Start-Over a11y focus effect (#1817 AC8) is also declared there — it reads
  // journeyView.startOverTick and must run after the hook call is in scope.

  // Reset bbox when city changes — the previous city's viewport is out-of-bounds for the new city.
  useEffect(() => {
    setMapBbox(null);
  }, [city]);

  // Issue #1824 Slice S7 — schoolFocusTick's writer effect now lives in
  // useDiscoverCameraOrchestration (reads selectedSchool injected below).

  const isCityValid = city in CITY_CONFIG;

  // Issue #1489 — SchoolGroupAreasPanel (school-first L2) and AreaGroupsLandingPanel
  // (area-first L2) both expect DiscoverArea[] (has `name`). The `discoverAreas` from
  // useDiscoverMapData is AreaPoint[] (has `areaLabel` but no `name`). We call
  // useDiscoverAreas here with the same React Query key ['discover-areas', city] so this
  // hits the cache — zero extra HTTP request. The result is only passed to the panel prop;
  // the onSelectAreaKey callback below intentionally continues using the AreaPoint[]
  // `discoverAreas` from useDiscoverMapData for geo fit-bounds via handleAreaSelect.
  const { data: _areasDataForPanel } = useDiscoverAreas(isCityValid ? city : '');
  const discoverAreasForPanel = _areasDataForPanel?.areas ?? [];

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
    if (nav.nodeListings) return false;
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
      !selectedSchool
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
  // Issue #2087 — Node Listings Surface mode uses the canonical node's descendant areas.
  const groupAreaKeysForMapData = useMemo((): string[] | undefined => {
    if (nav.nodeListings && areasNavigationJourney.node) {
      return areasNavigationJourney.node.descendantAreaKeys ?? [];
    }
    if (!nav.groupId) return undefined;
    if (nav.journey === 'school-first' && nav.schoolId) return undefined;
    const group = resolveDiscoverGroupForAreaKey(areaGroupsData?.groups, nav.groupId, nav.areaKey);
    return group?.area_keys ?? [];
  }, [nav.nodeListings, areasNavigationJourney.node, nav.groupId, nav.journey, nav.schoolId, nav.areaKey, areaGroupsData?.groups]);

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
      // Issue #1882 (Track A PR2 Slice S1/S3) — consumes the shared
      // zoomPolicy.shouldShowMarkers gate (same threshold as before:
      // zoom > AREA_LAYER_MAX_ZOOM). This live gate is the tested equivalent
      // of deriveScopeAwareMarkersEnabled (useDiscoverMapData.ts), which
      // covers the scope.kind==='group'||'area' && shouldShowMarkers(zoom)
      // contract in isolation (scopeAwareMarkers.test.tsx).
      // Issue #2087 — Node Listings Surface mode bypasses the zoom gate to show markers immediately.
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

  // ── Issue #2088 (commit 6) — "Recenter on <label>" affordance ────────────
  //
  // VISIBILITY: derived from `mapBbox` — the [south, west, north, east]
  // viewport this page already tracks via the EXISTING `handleBoundsChange`
  // pipeline (declared above; wired to `DiscoverMapMount`'s `onBoundsChange`,
  // fed by Leaflet's own `map.getBounds()` inside `PropertyMap.tsx`'s
  // BoundsWatcher on every moveend/zoomend, 300ms-debounced). This IS "Leaflet
  // state", reused rather than re-derived: no new prop reaches into
  // `DiscoverMapCanvas.tsx`/`PropertyMap.tsx` (both outside this issue's
  // edit boundary) to call `map.getBounds()` a second way.
  //
  // `journey.node.bounds.centreLat/centreLon` is present on every resolved
  // node in the live API response (types.ts's `NavigationBounds`).
  const selectedNodeBounds = areasNavigationJourney.node?.bounds ?? null;

  const isSelectedNodeOutOfView = useMemo(() => {
    if (!showAreasNavigationJourney) return false;
    return checkIsSelectedNodeOutOfView(areasNavigationJourney.node, mapBbox);
  }, [showAreasNavigationJourney, mapBbox, areasNavigationJourney.node]);

  // ACTION: republishes the existing CameraIntent stream via the new
  // `publishRecenterCameraIntent` producer (useDiscoverMapData.ts) — writes
  // NO URL param directly, so the resulting map move flows through the
  // normal debounced {replace:true} viewport write (viewport.ts) and adds
  // ZERO history entries, by construction (same mechanism every other
  // camera-intent-driven move on this page already uses).
  const handleRecenterOnSelectedNode = useCallback(() => {
    const intent = getCameraIntentForRecenter(areasNavigationJourney.node);
    if (!intent) return;
    publishRecenterCameraIntent(intent.cameraBounds, intent.centre, intent.kind);
  }, [areasNavigationJourney.node, publishRecenterCameraIntent]);

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
  const schoolsAreaKey =
    panelContent === 'schools-in-area' ? (nav.areaKey ?? undefined) : undefined;
  const schoolsQuery = useSchoolsByArea(
    schoolsAreaKey,
    urlBoardFilters,
    nav.filters.categoryFilters ?? [],
    20,
  );
  const allSchools = useMemo(
    () => schoolsQuery.data?.pages.flatMap((p) => p.schools) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schoolsQuery.data?.pages],
  );

  // Issue #1824 Slice S6 — the board-filter URL→local sync effect (incl. its
  // lint suppression + single-dep [urlBoardKey] array) moved into
  // useDiscoverJourneyTransitions below.

  // Single setter consumed by chip UI: updates URL (canonical) and local state (mirror).
  // Always uses REPLACE semantics (actions.setBoardFilters is REPLACE-only).
  const handleBoardFilterChange = useCallback(
    (boards: string[]) => {
      setSchoolBoardFilter(boards);
      actions.setBoardFilters(boards);
    },
    [setSchoolBoardFilter, actions],
  );

  // Client-side filter — defends against stale server responses and provides instant
  // feedback before the next useSchoolsByArea refetch resolves. Board comparison is
  // case-insensitive (uppercased on both sides) per AC: "CBSE", "cbse", "Cbse" all match.
  const schools = useMemo(() => {
    if (urlBoardFilters.length === 0) return allSchools;
    const wanted = new Set(urlBoardFilters.map((b) => b.toUpperCase()));
    return allSchools.filter((s) => {
      const board = (s.board ?? s.boardType ?? '').toUpperCase();
      return wanted.has(board);
    });
  }, [allSchools, urlBoardFilters]);

  // Issue #1824 Slice S6 — journey-transition orchestration (R10) extracted to
  // useDiscoverJourneyTransitions: startOverTick/areaRestoreTick/cityRestoreTick +
  // composedResetMapTick, handleStartOver, handleSelectSchoolById, handleRadiusChange,
  // the school-first Back ladder (handleSchoolFirstBackLevel2/1/0 + schoolFirstOnBack),
  // onClearSchool/onClearArea, the handleSchoolSelect wrapper, the board-filter sync
  // effect, the schoolById restore/error effect, and the deferred areaKey hydration
  // effect. See docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s6-design.md.
  // Called here (after useDiscoverMapData + schools) because its injected deps
  // (discoverAreas, areasLoading, schoolById, schoolByIdError, schools) are outputs of
  // those two. boundedSearchTriggered/setBoundedSearchTriggered stay page-local (see
  // their useState declaration above) — injected here rather than owned by the hook;
  // see useDiscoverJourneyTransitions.ts's "Deviation 2" header comment for why.
  const { view: journeyView, commands: journeyCommands } = useDiscoverJourneyTransitions({
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
    schools,
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
    boundedSearchTriggered,
    setBoundedSearchTriggered,
  });

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

  // Issue #1824 Slice S7 — the window.__debug.mapState effect (Playwright E2E
  // contract) moved a few lines down (after useDiscoverCameraOrchestration),
  // because it now reads cameraView-derived schoolMarkerFocusTick (S7 owns
  // it; declared via the destructure above). The object SHAPE is
  // byte-identical (AC4).

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

  // Issue #1824 Slice S11b (C3) — school-listings + school-radius-fallback-markers
  // derivation lifted into useSchoolListings (see the hook's header comment). MUST
  // stay called BEFORE the page-local discoverBadge useMemo below, which reads
  // schoolListings.length (Issue #1175 v2 / #1152).
  const { schoolListings, schoolRadiusFallbackMarkers } = useSchoolListings({
    isAuthenticated,
    filters,
    areaListings,
    schoolRadiusListings,
    filteredListings,
    journey: nav.journey,
    schoolId: nav.schoolId,
  });

  // Issue #1175 v3 / Issue #1798 PR-B1 — focusedGroup is resolved from both groupId (by ID
  // or exact slug match) and automatically derived from nav.areaKey if needed.
  // Guarantees right panel, map layer, map markers, and map breadcrumb derive from unified context.
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

  // Issue #1824 Slice S11b (C5) — school-first status-pill count derivations
  // lifted into useSchoolFirstCounts (see the hook's header comment). Called
  // AFTER focusedGroup (above) since schoolFirstZoneSchoolCount depends on it.
  const {
    schoolFirstLandingSchoolCount,
    schoolFirstZoneSchoolCount,
    schoolFirstAreaSchoolCount,
    schoolZoneLabels,
  } = useSchoolFirstCounts({
    journey: nav.journey,
    groupId: nav.groupId,
    // Issue #2083 cycle 4 — genuinely legacy-only: every consumer in
    // schoolFirstCounts.ts early-returns unless journey === 'school-first',
    // a journey the canonical node hierarchy never sets areaKey/nodeAreaPoint
    // through, so the legacy value is correct here (verified by code review).
    selectedArea: legacySelectedArea,
    focusedGroup,
    areasLoading,
    discoverAreas,
  });

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

  // Issue #1824 Slice S7 — camera panner/tick orchestration (R9): schoolFocusTick +
  // schoolMarkerFocusTick (+ the #1547 fit-once listingsReadyKey guard) + the
  // group/scope/agri fitBounds effects extracted to useDiscoverCameraOrchestration.
  // Called here (after useDiscoverMapData + schoolListings + focusedGroup +
  // summaryRegions, which the hook needs as injected deps). focusedGroup and
  // summaryRegions are injected as the SAME page useMemo references (OQ2) — the
  // hook does NOT recompute them, so the group/scope one-shot dep arrays keep
  // their exact identity-stability behaviour. mapBbox/bboxTimerRef/
  // handleBoundsChange/their cleanup effect/the city-change bbox-reset effect
  // stay page-local (see useDiscoverCameraOrchestration.ts's file-header
  // "DEVIATION" comment for why — mapBbox is a plain in-scope JS variable read
  // by the useDiscoverMapData call above, so it cannot live in a hook that must
  // itself be called after useDiscoverMapData).
  const {
    schoolFocusTick,
    schoolMarkerFocusTick,
    schoolFocusLat: selectedSchoolLat,
    schoolFocusLon: selectedSchoolLon,
    agriGroupFocusBounds,
    canonicalNodeFitCount,
  } = useDiscoverCameraOrchestration({
    // Issue #2083 (cycle 5) — the canonical-node fit-once effect now also
    // reads `viewport`/`historyAction` (POP-restoration guard); `nav` alone
    // omits `viewport` (DiscoverNavContextValue = Omit<DiscoverUrlState,
    // 'viewport'>), so it must be merged in here, same pattern the other
    // whole-object consumers already use (see the DEVIATION comment above).
    urlState: { ...nav, viewport },
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
    regionScopedGroups: regionScopedGroupsData?.groups,
    isLoadingRegionScopedGroups,
    // Issue #1956 PR 2 (Slice 3, AC3.10/T2) — the SAME areasNavigationJourney
    // instance's node identity/bounds, not a re-fetch.
    navigationNodeKey: areasNavigationJourney.node?.nodeKey ?? null,
    navigationNodeBounds: areasNavigationJourney.node?.bounds ?? null,
  });

  // Debug: expose areaListings and related data to window.__debug for Playwright tests.
  // Issue #1824 Slice S7 — schoolMarkerFocusTick now sourced from
  // useDiscoverCameraOrchestration (destructured above); areaRestoreTick/
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

  // Issue #1115 — stable callback for the bounded-search CTA. Declared before the early
  // return so useCallback is called unconditionally (Rules of Hooks). The undefined branch
  // for anon users is applied at the JSX call-site, not here.
  const handleBoundedSearch = useCallback(() => {
    setBoundedSearchTriggered(true);
  }, [setBoundedSearchTriggered]);

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

  // Memoize initialCenter to prevent URLViewportController effect re-runs on every parent render.
  // Hoisted above the isCityValid early return to satisfy Rules of Hooks.
  const memoizedInitialCenter = useMemo(
    () => viewport ? [viewport.lat, viewport.lon] as [number, number] : undefined,
    [viewport],
  );

  // Issue #1160 GAP 2 — derive area coordinates for AreaRestorePanner.
  // Re-derived from discoverAreas at render time (not captured at click time) so the
  // panner always has fresh coords. If discoverAreas hasn't loaded yet, the panner
  // receives null values and skips the restore (no crash).
  // Hoisted above the isCityValid early return to satisfy Rules of Hooks.
  const areaRestoreArea = useMemo(() => {
    if (!nav.areaKey) return null;
    return discoverAreasData?.areas?.find((a) => a.areaKey === nav.areaKey) ?? null;
  }, [nav.areaKey, discoverAreasData]);

  // Issue #1547 ITEM 6 — memoize school marker positions to prevent SchoolMarkerFocusPanner
  // from re-running its useEffect on every render due to inline array recreation.
  // schoolListings is already a memoized array; filter+map creates a new identity each render.
  const schoolMarkerPositions = useMemo(
    () =>
      schoolListings
        .filter((l) => l.lat != null && l.lon != null)
        .map((l) => ({ lat: l.lat as number, lon: l.lon as number })),
    [schoolListings],
  );

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

  // Issue #1824 Slice S11d — pre-layer "C1" predicate cluster (area-first city
  // landing, live areas, empty-city gate, top-grouped area/school/agri gates,
  // and the mapLayerKind/mapLayerCategory derivation) extracted verbatim into
  // useDiscoverJourneyPredicates. See
  // docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s11d-implementation.md.
  const {
    mapLayerKind,
    mapLayerCategory,
    isAreaFirstCityLanding,
    liveAreas,
    cityHasNoListings,
    isTopGroupedAreaOrSchool,
    isTopGroupedAgri,
  } = useDiscoverJourneyPredicates({
    resolvedPanelContent,
    focusedGroup,
    // Issue #1956 PR-4 — bridged so isAreaFirstCityLanding/liveAreas/
    // cityHasNoListings correctly treat a resolved AREA leaf as "not the
    // city landing", consistent with gate 1/3 above. mapLayerKind/
    // mapLayerCategory (this same hook's OTHER outputs) are computed
    // purely from URL state internally and are NOT fixed by this — see
    // effectiveMapLayerCategory below, which is the actual gate-2 fix.
    selectedArea: effectiveSelectedArea,
    selectedSchool,
    discoverAreas,
    areasLoading,
    cityTotal,
    urlState: { ...nav, viewport } satisfies DiscoverUrlState,
    isAgriJourney,
    mapZoom,
  });

  // Issue #1824 Slice S9b1 — overviewAreas + areaSearchMatchKeys now live in
  // useDiscoverMapPresentation (src/features/discover/presentation/); see
  // docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s9b-design.md.
  // Injected refs are passed UNWRAPPED (memo identity-stability, AC3) — no
  // ?? []/spread/.filter()/new-literal wrapping at this call site.
  const {
    overviewAreas,
    areaSearchMatchKeys,
    resolvedRegionLabel,
    isRegionOverview,
    regionOverviewMarkerKind,
    regionOverviewShortLabel,
    areaJourneySegments,
    schoolJourneySegments,
  } = useDiscoverMapPresentation({
    mapLayerKind,
    isLoadingAreaGroups,
    isLoadingRegionalAreaGroups,
    isLandingState,
    isAreaFirstCityLanding,
    areaGroupsData,
    discoverAreas,
    corridorGroups,
    agriAreasData,
    liveAreas,
    urlState: { ...nav, viewport } satisfies DiscoverUrlState,
    summaryRegions,
    cityCenter,
    focusedGroup,
    debouncedAreaSearchQuery,
    city,
    selectedArea: effectiveSelectedArea,
    selectedSchool,
    selectedMarkerListing,
    scopeNamespaces,
    regionScopedGroups: regionScopedGroupsData?.groups,
    // Issue #1956 PR 1 (FE-3, item 2) — the ONE visible-member set, produced by
    // useDiscoverMapData above. Passing it (rather than letting this hook derive
    // its own) is what makes it genuinely SHARED. Deliberately not destructured
    // out of the result: PR 1 has no consumer.
    visibleMemberSet,
  });

  // Issue #1910 (PR2) — resolveScope-based classification REPLACES the old
  // ad-hoc region-vs-group-vs-area OR-match, reusing the SAME scopeNamespaces
  // built once above (single source of truth with useDiscoverMapPresentation
  // and AreaGroupsLandingPanel).
  const handleOverviewAreaClick = useCallback((area: AreaPoint) => {
    if (isTopGroupedAgri && corridorGroups.some((c) => c.directionCode === area.areaKey)) {
      actions.setRegionWithMaxKm(area.areaKey);
      return;
    }
    const resolvedAreaKeyScope = resolveScope(area.areaKey, scopeNamespaces);
    if (mapLayerKind === 'macro-region-bubbles' && resolvedAreaKeyScope.kind !== 'none') {
      actions.setScope(area.areaKey);
      // Issue #1808 — arm the region-overview guidance one-shot pulse. Does
      // NOT change the setScope call above (regression-guarded state contract).
      armRegionSelect('map');
      return;
    }
    if (resolvedAreaKeyScope.kind === 'group') {
      actions.selectGroup(area.areaKey);
      return;
    }
    handleAreaClick(area);
  }, [isTopGroupedAgri, corridorGroups, scopeNamespaces, mapLayerKind, actions, handleAreaClick, armRegionSelect]);

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
    mapZoom,
    areaLayerMaxZoom: AREA_LAYER_MAX_ZOOM,
    isAuthenticated,
    journey: nav.journey,
    schoolId: nav.schoolId,
    groupResultsMarkers,
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

  // Issue #1808 — the ring/helper (not the card/legend) fire only on an actual
  // map/panel pick, never on deep-link/refresh (design §5/§9, AC5).
  const regionGuideVisible = isRegionOverview && !regionGuideDismissed;
  const regionGuideRingActive = regionGuideVisible && regionSelectSource !== 'deeplink';

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

  return (
    <PublicDiscoverLayout>
      <div className="flex h-full flex-col">
        {/* Issue #1953 (build step 6) — mount the unified control bar (built in
            step 5, previously rendered nowhere) so city/Buy-Rent/area-jump are
            actually reachable. Consumes ONLY the DiscoverProvider facade
            (useDiscoverNav/useDiscoverActions/useDiscoverAreas internally) —
            no URL state or router props are threaded in from here.
            Issue #1953 FIX1 (post-launch hit-test defect) — the earlier
            "own horizontal scroll on narrow viewports" approach traded one
            unreachability for another: at 390px two of the three controls
            scrolled off-screen instead of clipping, still unreachable, and
            the page-level "Map" trigger (below, now removed) was a `fixed`
            overlay anchored into the SAME top-right space as this row,
            covering it. DiscoverControlBar.tsx now wraps onto a second line
            at <lg widths (no overflow-x needed) and owns the mobile Map/List
            trigger itself as a flex sibling, so the trigger structurally
            cannot overlap the row's own controls. */}
        {/* Issue #2108 (shell fix) — this row is now MOBILE-ONLY, gated on the
            SAME real `isMobileShell` flag (useDiscoverShell's 820px
            matchMedia, not a Tailwind breakpoint) this file already uses for
            every other mobile-shell decision on this page (mobileMapOpen,
            the mobile Map/List trigger, etc.). The approved mock has no
            full-width toolbar row above the map: city + Buy/Rent + area
            search live inside the right panel's own column, as
            DiscoverControlBar's desktop render inside DiscoverRightPanel
            (gated on the same `isMobileShell` prop — see that file).
            A CSS-only `lg:hidden`/`hidden lg:block` split was tried first and
            reverted: jsdom does not evaluate media queries, so both mounts
            rendered simultaneously in every test, producing duplicate
            `discover-control-bar` testids (Index.invalidCity.test.tsx et al).
            Gating on the real boolean instead means exactly one control bar
            ever mounts, in both a real browser and in jsdom — mobile
            behaviour (this row's markup/testid/mobileMapTrigger wiring) is
            otherwise unchanged. */}
        {isMobileShell && (
          <div
            className="shrink-0 border-b border-border bg-card px-4 py-2.5"
            data-testid="discover-control-bar-row"
          >
            <DiscoverControlBar
              mobileMapTrigger={
                !mobileMapOpen
                  ? { onOpenMap: () => setMobileView('MAP'), triggerRef: mobileMapTriggerRef }
                  : undefined
              }
            />
          </div>
        )}
        <div className="min-h-0 flex-1 flex flex-col lg:flex-row relative">
        {/* Issue #1953 (build step 4) — mobile "Map" trigger. Was a
            page-level `fixed top-20 right-4` button here; moved into
            DiscoverControlBar (rendered above, as a flex sibling of city/
            Buy-Rent/area-search) by FIX1 — see the control-bar-row comment
            above for why. mobileMapTriggerRef / isMobileShell / mobileMapOpen
            stay defined in this scope; they are threaded into
            DiscoverControlBar's `mobileMapTrigger` prop instead of used
            directly here. */}
        {/* a3 — mapContainerRef wraps the full map half-panel for MarkerPopoverCard bounds clamp.
            R-C — warm map gutter background (#EDEBE6) so the gutter between the map tile and
            panel edge is warm off-white, not default grey.
            Issue #1953 (build step 4) — DiscoverMapMount owns whether
            DiscoverMapCanvas mounts at all (real unmount on mobile List — see
            DiscoverMapMount.tsx). This wrapper only becomes a full-screen
            overlay on mobile MAP; `contents` keeps it invisible to layout
            otherwise, so desktop is unaffected. The prop list below passes
            straight through to DiscoverMapCanvas, unchanged.
            Issue #1953 (post-step-4 fix) — z-[60], not z-40: RoleAwareHeader
            (src/components/layout/AppLayout.tsx) is `sticky top-0 z-50` and
            sits ABOVE the page content in the DOM, so a `z-40` "full-screen"
            overlay rendered z-40 stacks BELOW the header — the header's
            "Sign in" link visually and hit-test intercepts clicks meant for
            the overlay's own "List" close button. z-[60] is a genuine
            stacking-context comparison against the header's z-50 (both are
            top-level positioned elements, no intervening stacking context),
            so raising this above 50 is sufficient and correct — no
            display:none/visibility trick on the header, true overlay only. */}
        <div
          className={
            mobileMapOpen ? 'fixed inset-0 z-[60] bg-background [&>div]:!h-full' : 'contents'
          }
        >
          {mobileMapOpen && (
            <button
              type="button"
              onClick={() => setMobileView('LIST')}
              data-testid="mobile-map-close-list-button"
              className="absolute right-4 top-4 z-50 rounded-full border border-border bg-background/95 px-4 py-2 text-sm font-medium shadow-md"
            >
              List
            </button>
          )}
          {/* Issue #1956 PR-5 (Slice 3, AC5.6/AC5.7) — the MAP-mode counterpart
              of DiscoverAreasJourneyPanel's own (LIST-mode-only-visible)
              focused-cluster branch. Mounted INSIDE this SAME z-[60] overlay
              container (never portalled — see [reuse_seams].sheet_stacking),
              so it inherits the correct stacking context above the map
              canvas with no z fight against the shared sheet primitive.
              Reuses the SAME areasNavigationJourney instance and the SAME
              focusedClusterMemberAreaKeys/setFocusedClusterMemberAreaKeys
              state this file already owns and threads to the map layer and
              the panel — no second navigation-journey call, no new state. */}
          {mobileMapOpen && (
            <MobileClusterSheet
              journey={areasNavigationJourney}
              focusedClusterMemberAreaKeys={focusedClusterMemberAreaKeys}
              onClusterFocusChange={setFocusedClusterMemberAreaKeys}
            />
          )}
          {/* Issue #1956 PR-5 (Slice 5, AC5.10/AC5.10c) — the mobile Map-mode
              listing preview sheet. Mounted INSIDE this SAME z-[60] overlay
              container (never portalled — [reuse_seams].sheet_stacking),
              following the MarkerPopoverCard/MobileClusterSheet precedent.
              `selectedListingPreview` is a plain projection of the URL-backed
              `listing=` peek (OQ6 — KEEP the existing PUSH writer; no
              suppression seam added). Dismissing routes through the SAME
              clearSelectedListing() every other peek-close affordance uses,
              so camera/filters/result-count/Map-mode are all unchanged. */}
          {mobileMapOpen && selectedListingPreview && (
            <MobileListingPreviewSheet
              preview={selectedListingPreview}
              onDismiss={() => actions.clearSelectedListing()}
              onViewDetails={(id) => navigate(`/listing/${id}`)}
            />
          )}
          <DiscoverMapMount
          mapContainerRef={mapContainerRef}
          markerPixelPos={markerPixelPos}
          handlePopoverDismiss={handlePopoverDismiss}
          showLoader={showLoader}
          error={error}
          currentMapMarkerListings={currentMapMarkerListings}
          agriGroupFocusBounds={agriGroupFocusBounds}
          activeFocusBounds={activeFocusBounds}
          selectedRegion={selectedRegion}
          selectedMaxKm={selectedMaxKm}
          filteredAgriListings={filteredAgriListings}
          filters={filters}
          isLandingState={isLandingState}
          handlePolygonDrawn={handlePolygonDrawn}
          handlePolygonCleared={handlePolygonCleared}
          selectedSchool={selectedSchool}
          memoizedInitialCenter={memoizedInitialCenter}
          cityCenter={cityCenter}
          cityZoom={cityZoom}
          overviewAreas={overviewAreas}
          handleOverviewAreaClick={handleOverviewAreaClick}
          publishCameraIntent={publishCameraIntent}
          cameraIntent={cameraIntent}
          focusedGroupAreas={focusedGroupAreas}
          areaLayerMaxZoom={AREA_LAYER_MAX_ZOOM}
          // Issue #1956 PR-4 (Option C) — same bridge as the data hooks
          // above, so the map's own selectedArea-driven behaviour (fitBounds,
          // area-marker fade/highlight) treats a resolved canonical AREA leaf
          // identically to a legacy areaKey selection.
          selectedArea={effectiveSelectedArea}
          areaSearchMatchKeys={areaSearchMatchKeys}
          hoveredAreaKeyForMap={hoveredAreaKeyForMap}
          publishClusterCameraIntent={publishClusterCameraIntent}
          // REQUIRED CHANGE 6 (review fix, AC4.4/AC4.5) — the canonical
          // Areas-journey visual-cluster tap reuses the SAME
          // publishClusterCameraIntent producer as the legacy dense-area
          // degradation path above (shared monotonic cameraIntentSeqRef via
          // useDiscoverMapData). Safe to share: AreaDestinationMarkerLayer
          // and the legacy AreaMarkerLayer are mutually exclusive
          // (showAreasNavigationDestinations), so the two producers are
          // never invoked for the same render.
          onAreaVisualClusterCameraIntent={publishClusterCameraIntent}
          handleAreaClusterClick={handleAreaClusterClick}
          handleAreaMarkersComputed={handleAreaMarkersComputed}
          areasNavigationJourney={areasNavigationJourney}
          hoveredNavigationNodeKey={hoveredNavigationNodeKey}
          onNavigationNodeHoverChange={setHoveredNavigationNodeKey}
          focusedClusterMemberAreaKeys={focusedClusterMemberAreaKeys}
          onClusterFocusChange={setFocusedClusterMemberAreaKeys}
          // Issue #1956 PR 2 (Slice 5) — the map-side canonical Areas
          // breadcrumb's pure href builder (same `actions.buildNodeHref`
          // the right panel's HierarchyBackButton uses).
          buildNavigationNodeHref={actions.buildNodeHref}
          schoolZoneLabels={schoolZoneLabels}
          setMapZoom={setMapZoom}
          handleBoundsChange={handleBoundsChange}
          panToArea={panToArea}
          journeyView={journeyView}
          setMapReady={setMapReady}
          schools={schools}
          showSchoolMarkers={showSchoolMarkers}
          journeyCommands={journeyCommands}
          schoolsQuery={schoolsQuery}
          schoolFocusTick={schoolFocusTick}
          selectedSchoolLat={selectedSchoolLat}
          selectedSchoolLon={selectedSchoolLon}
          schoolMarkerFocusTick={schoolMarkerFocusTick}
          schoolMarkerPositions={schoolMarkerPositions}
          areaRestoreArea={areaRestoreArea}
          isAgriJourney={isAgriJourney}
          selectedMarkerListing={selectedMarkerListing}
          handleSelectMarkerListing={handleSelectMarkerListing}
          hoveredListingId={hoveredListingId}
          handleMarkerClickWithPosition={handleMarkerClickWithPosition}
          isAreaFirstCityLanding={isAreaFirstCityLanding}
          showSchoolBreadcrumb={showSchoolBreadcrumb}
          areaJourneySegments={areaJourneySegments}
          schoolJourneySegments={schoolJourneySegments}
          focusedGroup={focusedGroup}
          city={city}
          schoolRadiusOverlay={schoolRadiusOverlay}
          resolvedPanelContent={resolvedPanelContent}
          isSelectedGroupState={isSelectedGroupState}
          handleCityChange={handleCityChange}
          regionGuideVisible={regionGuideVisible}
          resolvedRegionLabel={resolvedRegionLabel}
          regionSelectNonce={regionSelectNonce}
          regionOverviewMarkerKind={regionOverviewMarkerKind}
          regionGuideRingActive={regionGuideRingActive}
          prefersReducedMotion={prefersReducedMotion}
          dismissRegionGuide={dismissRegionGuide}
          isRegionOverview={isRegionOverview}
          regionOverviewShortLabel={regionOverviewShortLabel}
          areaMarkerListings={areaMarkerListings}
          announcedBadgeText={announcedBadgeText}
          discoverBadge={discoverBadge}
          areaResultSummaryText={areaResultSummaryText}
          groupSelectedBadgeCopy={groupSelectedBadgeCopy}
          fallbackBadgeCopy={fallbackBadgeCopy}
          isAreaFirstSelectedAreaState={isAreaFirstSelectedAreaState}
          schoolRadiusActive={schoolRadiusActive}
          schoolRadiusPillNoun={schoolRadiusPillNoun}
          schoolFirstAreaSchoolCount={schoolFirstAreaSchoolCount}
          schoolFirstZoneSchoolCount={schoolFirstZoneSchoolCount}
          schoolFirstLandingSchoolCount={schoolFirstLandingSchoolCount}
          cityTotal={cityTotal}
          isAuthenticated={isAuthenticated}
          schoolRadiusHasMore={schoolRadiusHasMore}
          schoolListings={schoolListings}
          hasActiveAnonFilter={hasActiveAnonFilter}
          markersTruncated={markersTruncated}
          markersReturnedElements={markersReturnedElements}
          markersTotalFilteredElements={markersTotalFilteredElements}
          isLoading={isLoading}
          mapZoom={mapZoom}
          // Issue #1956 PR-5 defect fix (Phase 7A) — on mobile Map mode,
          // MobileListingPreviewSheet (rendered above at the mobileMapOpen
          // branch, L2070) is the intended single preview surface for a
          // selected listing. The legacy MarkerPopoverCard (rendered inside
          // DiscoverMapCanvas via DiscoverMapMarkerPopover, gated on this
          // exact prop) has no mobile guard of its own, so without this
          // AND-clause both surfaces render simultaneously for the same
          // `listing=` selection — confirmed live via getComputedStyle
          // (both fully visible, same z-index). This is a RENDER-gate-only
          // change: the raw `isMarkerPopoverEligible` const above (used by
          // the capture/URL-write effects, risk R1) is untouched — only the
          // value threaded into DiscoverMapMount's render prop is narrowed.
          // Desktop is unaffected: mobileMapOpen is `isMobileShell &&
          // mobileView === 'MAP'` (L120), always false on desktop, so
          // `!mobileMapOpen` is always true there and this reduces to the
          // original `isMarkerPopoverEligible`. Mobile LIST mode is also
          // unaffected: mobileMapOpen is false there too (and
          // DiscoverMapMount already real-unmounts the map in that state),
          // so this clause is a no-op in that branch, not a new suppression
          // path. Every other journey (school-first, agri-first, area) that
          // feeds into `isMarkerPopoverEligible` is equally covered, since
          // MobileListingPreviewSheet's own mobileMapOpen gate is
          // journey-agnostic.
          isMarkerPopoverEligible={isMarkerPopoverEligible && !mobileMapOpen}
          markerPopoverStepper={markerPopoverStepper}
          navigate={navigate}
          handleStepMarkerListing={handleStepMarkerListing}
          showMarkerInList={showMarkerInList}
          />
          {/* Issue #2088 (commit 6) — "Recenter on <label>" affordance.
              Portalled into `mapContainerRef.current` — the real DOM node
              `DiscoverMapCanvas.tsx` (outside this issue's edit boundary)
              attaches via the `mapContainerRef` prop above, already threaded
              through this page — rather than adding new JSX inside that
              forbidden file. `mapReady` gates the portal until that ref is
              actually populated (mirrors this page's own `setMapReady`
              contract, used elsewhere on this page as the "the map instance
              now exists" signal). Renders nothing when no node is selected,
              no bounds are known, or the node's centre is already in view.

              Issue #2088 live-verify fix — this button WAS mounting (DOM
              present, visible/opacity/display all fine) but was completely
              hidden behind `DiscoverMapCountBadge`'s "Showing N verified
              properties across <City>" pill: that badge anchors to the exact
              same `absolute bottom-* left-1/2 -translate-x-1/2` spot inside
              this same `mapContainerRef` box at `z-[1000]`, versus this
              button's `z-[500]` — same stacking context (both are descendants
              of the `position: relative` map container), so the badge always
              painted on top and fully occluded it. `DiscoverMapCountBadge.tsx`
              is outside this issue's edit boundary, so the fix lives entirely
              here: `bottom-20` clears the badge's own band (bottom-5, ~38px
              tall) with margin, so the two never overlap regardless of which
              one is taller at a given viewport width. */}
          {mapReady && mapContainerRef.current && isSelectedNodeOutOfView && areasNavigationJourney.node &&
            createPortal(
              <button
                type="button"
                data-testid="areas-recenter-button"
                onClick={handleRecenterOnSelectedNode}
                className="absolute bottom-20 left-1/2 z-[500] -translate-x-1/2 rounded-full border border-border bg-background/95 px-4 py-2 text-sm font-medium shadow-md"
              >
                Recenter on {areasNavigationJourney.node.displayLabel}
              </button>,
              mapContainerRef.current,
            )}
        </div>

        <DiscoverRightPanelContainer
          resolvedPanelContent={resolvedPanelContent}
          areasNavigationJourney={areasNavigationJourney}
          hoveredNavigationNodeKey={hoveredNavigationNodeKey}
          onNavigationNodeHoverChange={setHoveredNavigationNodeKey}
          focusedClusterMemberAreaKeys={focusedClusterMemberAreaKeys}
          onClusterFocusChange={setFocusedClusterMemberAreaKeys}
          onSelectedListingPreviewChange={setSelectedListingPreview}
          selectedMarkerListing={selectedMarkerListing}
          clearSelectedMarkerListing={clearSelectedMarkerListing}
          city={city}
          activeContextChips={activeContextChips}
          discoverAreas={discoverAreas}
          // Issue #1956 PR-4 — harmless-but-consistent bridge: the legacy
          // DiscoverRightPanel branch this prop feeds is UNREACHABLE while
          // the canonical Areas journey is mounted (see
          // DiscoverRightPanelContainer's showAreasNavigationJourney
          // early-return, [scope.must_not_change]), so this has no visible
          // effect today — kept in sync with every other selectedArea
          // consumer on this page rather than silently left stale.
          selectedArea={effectiveSelectedArea}
          areaListings={areaListings}
          isLoadingAreaListings={isLoadingAreaListings}
          isAuthenticated={isAuthenticated}
          handleAreaSelect={handleAreaSelect}
          areaResultSummaryText={areaResultSummaryText}
          journeyView={journeyView}
          handleAreaFirstBack={handleAreaFirstBack}
          journeyCommands={journeyCommands}
          areasLoading={areasLoading}
          agriAreasData={agriAreasData}
          isLoadingAgriAreas={isLoadingAgriAreas}
          areaGroupsData={areaGroupsData}
          isLoadingAreaGroups={isLoadingAreaGroups}
          regionScopedGroups={regionScopedGroupsData?.groups}
          isLoadingRegionScopedGroups={isLoadingRegionScopedGroups}
          isRegionScopedGroupsError={isRegionScopedGroupsError}
          refetchRegionScopedGroups={refetchRegionScopedGroups}
          scopeNamespaces={scopeNamespaces}
          armRegionSelect={armRegionSelect}
          regionGuideRingActive={regionGuideRingActive}
          regionOverviewMarkerKind={regionOverviewMarkerKind}
          regionSelectNonce={regionSelectNonce}
          prefersReducedMotion={prefersReducedMotion}
          summaryRegions={summaryRegions}
          selectedGroupName={selectedGroupName}
          corridorGroups={corridorGroups}
          isLoadingRegionalAreaGroups={isLoadingRegionalAreaGroups}
          isRegionalAreaGroupsError={isRegionalAreaGroupsError}
          refetchRegionalAreaGroups={refetchRegionalAreaGroups}
          selectedRegion={selectedRegion}
          selectedMaxKm={selectedMaxKm}
          filteredAgriListings={filteredAgriListings}
          agriMapListingsData={agriMapListingsData}
          isLoadingAgriGroupListings={isLoadingAgriGroupListings}
          isAgriGroupListingsError={isAgriGroupListingsError}
          agriGroupLabel={agriGroupLabel}
          refetchAgriGroupListings={refetchAgriGroupListings}
          discoverAreasForPanel={discoverAreasForPanel}
          filtersContent={filtersContent}
          trendsHref={trendsHref}
          isFetching={isFetching}
          isLoading={isLoading}
          searchQuery={searchQuery}
          handleSearchChange={handleSearchChange}
          filters={filters}
          handleFiltersChange={handleFiltersChange}
          selectedSchool={selectedSchool}
          schools={schools}
          schoolsQuery={schoolsQuery}
          schoolListings={schoolListings}
          listingDataLoading={listingDataLoading}
          handleBoundedSearch={handleBoundedSearch}
          interactionCommands={interactionCommands}
          setAreaSearchQuery={setAreaSearchQuery}
          areaMarkerCounts={areaMarkerCounts}
          highlightedAreaKeys={highlightedAreaKeys}
          selectedGroupListingItem={selectedGroupListingItem}
          navigate={navigate}
          cityTotal={cityTotal}
          cityHasNoListings={cityHasNoListings}
          handleCityChange={handleCityChange}
          groupResultsListings={groupResultsListings}
          isLoadingGroupResults={isLoadingGroupResults}
          isGroupResultsError={isGroupResultsError}
          groupResultsTotalElements={groupResultsTotalElements}
          refetchGroupResults={refetchGroupResults}
          page={page}
          totalPages={totalPages}
          totalElements={totalElements}
          setPage={setPage}
        />
        </div>
      </div>
      <DiscoverOverlaySheets
        isAgriJourney={isAgriJourney}
        nearSchoolOpen={nearSchoolOpen}
        setNearSchoolOpen={setNearSchoolOpen}
        selectedSchool={selectedSchool}
        journeyCommands={journeyCommands}
        filters={filters}
        handleFiltersChange={handleFiltersChange}
        schoolBoardFilter={schoolBoardFilter}
        handleBoardFilterChange={handleBoardFilterChange}
        isCityValid={isCityValid}
        city={city}
      />
    </PublicDiscoverLayout>
  );
}
