import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { aggregateMacroRegions } from '@/utils/macroRegionResolver';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import {
  computeDiscoverLayer,
  toLayerInput,
  resolveActiveDiscoverGroup,
  resolveDiscoverGroupForAreaKey,
} from '@/utils/discoverLayerRegistry';
import { CityNotSupported } from '@/components/discover/CityNotSupported';
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
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { useDiscoverPageState } from '@/hooks/useDiscoverPageState';
import { useDiscoverMapData } from '@/hooks/useDiscoverMapData';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { useAreaGroups } from '@/hooks/useAreaGroups';
import { useRegionalAreaGroups } from '@/hooks/useRegionalAreaGroups';
import { useDiscoverSummary, type DiscoverSummaryListingPurpose } from '@/hooks/useDiscoverSummary';
import { useAgriMapListings } from '@/hooks/useAgriMapListings';
import { useSchoolsByArea } from '@/hooks/useSchoolsByArea';
import { useDiscoverListings } from '@/hooks/useDiscoverListings';
import { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';
import { useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';
import { CITY_CONFIG, DEFAULT_CITY } from '@/lib/localityUtils';
import { slugifyFromAreaKey } from '@/lib/areaSlug';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { DiscoverMapCanvas } from '@/features/discover/views/DiscoverMapCanvas';
import { DiscoverOverlaySheets } from '@/features/discover/views/DiscoverOverlaySheets';
import { DiscoverRightPanelContainer } from '@/features/discover/views/DiscoverRightPanelContainer';
// S9a — relocated to src/features/discover/presentation/ (discoverBadge.ts,
// schoolFirstCounts.ts, anonPropertyFilters.ts). Imported here for the component
// body's own calls, and re-exported below so existing '@/pages/MapDiscovery'
// importers (unit tests + DiscoverMapCountBadge.tsx's DiscoverBadgeResult type
// import) continue to resolve unchanged.
import {
  deriveDiscoverBadge,
  formatDiscoverBadgeCopy,
  type DiscoverBadgeInput,
  type DiscoverBadgeState,
  type DiscoverBadgeResult,
} from '@/features/discover/presentation/discoverBadge';
import {
  deriveSchoolFirstLandingSchoolCount,
  deriveSchoolFirstZoneSchoolCount,
  deriveSchoolFirstAreaSchoolCount,
  deriveShowSchoolMarkers,
  deriveSchoolRadiusPillNoun,
  type SchoolFirstLandingCountInput,
  type SchoolFirstZoneCountInput,
  type SchoolFirstAreaCountInput,
  type ShowSchoolMarkersInput,
} from '@/features/discover/presentation/schoolFirstCounts';
import {
  applyAnonPropertyFilters,
  deriveAnonSchoolRadiusMarkers,
  hasActiveAnonPropertyFilter,
} from '@/features/discover/presentation/anonPropertyFilters';

// Re-exported so existing test imports from '@/pages/MapDiscovery' continue to resolve.
export { isNew } from '@/lib/isNew';

/** Zoom-band threshold: area overview rings show at zoom ≤ this; individual listing clusters show above it. */
const AREA_LAYER_MAX_ZOOM = 12;

// S9a re-export shim — keeps '@/pages/MapDiscovery' importers (5 unit test files +
// DiscoverMapCountBadge.tsx) resolving unchanged. See slice-s9-design.md OQ1.
export {
  deriveDiscoverBadge,
  formatDiscoverBadgeCopy,
  deriveSchoolFirstLandingSchoolCount,
  deriveSchoolFirstZoneSchoolCount,
  deriveSchoolFirstAreaSchoolCount,
  deriveShowSchoolMarkers,
  deriveSchoolRadiusPillNoun,
  applyAnonPropertyFilters,
  deriveAnonSchoolRadiusMarkers,
  hasActiveAnonPropertyFilter,
};
export type {
  DiscoverBadgeInput,
  DiscoverBadgeState,
  DiscoverBadgeResult,
  SchoolFirstLandingCountInput,
  SchoolFirstZoneCountInput,
  SchoolFirstAreaCountInput,
  ShowSchoolMarkersInput,
};

export default function MapDiscovery() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [urlState, urlActions] = useDiscoverUrlState();
  const isAuthenticated = !authLoading && user !== null;
  // Issue #1160 v3 Bug A1 — TanStack Query client used to read cached useSchoolById
  // result synchronously inside handleSelectSchoolById. See that callback for details.
  const queryClient = useQueryClient();

  // Issue #1745 P2 — routed through the layer-registry façade (discoverLayerRegistry.ts)
  // rather than calling derivePanelContent directly. computeDiscoverLayer delegates to
  // derivePanelContent by construction, so this is behaviour-preserving.
  const panelContent = computeDiscoverLayer(toLayerInput(urlState));

  // Issue #1597 — early derivation of PropertyFilters from URL state, available before
  // useDiscoverPageState is called. Used by the group-results listings query so it respects
  // active discover filters (propertyTypes, price, bedrooms, etc.).
  // Mirrors the urlState.filters → PropertyFilters mapping in useDiscoverPageState's useState
  // initializer. dateFrom/dateTo are ISO strings in URL state; PropertyFilters expects Date.
  // schoolLat/schoolLon/polygon are NOT included: group-results is not a school or polygon state.
  const urlDiscoverFilters: PropertyFilters = useMemo(() => {
    const f = urlState.filters;
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
  // urlState.filters object identity changes on every URL change — use the individual
  // scalar fields as deps so React can skip re-derivation when nothing changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    urlState.filters.propertyTypes,
    urlState.filters.bedrooms,
    urlState.filters.priceMin,
    urlState.filters.priceMax,
    urlState.filters.sellerTypes,
    urlState.filters.boardFilters,
    urlState.filters.categoryFilters,
    urlState.filters.backOnMarket,
    urlState.filters.newToMarket,
    urlState.filters.reraRegistered,
    urlState.filters.readyToMove,
    urlState.filters.dateFrom,
    urlState.filters.dateTo,
  ]);

  // Fetch area groups for the current city.
  // The hook's enabled guard (city.length > 0) prevents fetching on empty city.
  // Issue #1745 Batch B map-hierarchy fix — pass the DEFAULTED city (matching
  // useDiscoverPageState's `urlState.city || DEFAULT_CITY`), not the raw
  // urlState.city. At plain /discover (no ?city= param) urlState.city is '',
  // which previously left this hook disabled (no groups) while the panel showed
  // the defaulted city's region cards — a landing-vs-panel mismatch that made
  // macro-region-bubbles fall back to the full liveAreas pill set. Falling back
  // to DEFAULT_CITY here does NOT reintroduce the stale-data window this comment
  // used to warn about — that contrast was raw urlState.city vs a conditional ''
  // placeholder, not vs `|| DEFAULT_CITY`, which resolves to the same city the
  // panel already renders.
  const {
    data: areaGroupsData,
    isLoading: isLoadingAreaGroups,
  } = useAreaGroups(urlState.city || DEFAULT_CITY);

  // Issue #1429 (B2) — precomputed corridor groups for the agri-first landing panel.
  // useRegionalAreaGroups returns { groups, isLoading, error } directly (no .data wrapper).
  // Issue #1745 Batch B — same DEFAULT_CITY fallback as useAreaGroups above, for
  // agri-first city-landing consistency (same bug class: empty urlState.city
  // disabling the hook while the panel shows the defaulted city).
  const {
    groups: corridorGroups,
    isLoading: isLoadingRegionalAreaGroups,
    isError: isRegionalAreaGroupsError,
    refetch: refetchRegionalAreaGroups,
  } = useRegionalAreaGroups(urlState.city || DEFAULT_CITY);

  // Issue #1429 — derive areaKeys from the selected corridor + distance tier to fetch
  // agri map listings. Hook is disabled when selectedRegion + selectedMaxKm are not both set.
  // Look up the corridor by selectedRegion, then find the tier by selectedMaxKm.
  const selectedRegion = urlState.selectedRegion ?? null;
  const selectedMaxKm = urlState.selectedMaxKm ?? null;
  const selectedCorridorData = selectedRegion
    ? corridorGroups.find((g) => g.directionCode === selectedRegion) ?? null
    : null;
  const selectedTierData = selectedCorridorData && selectedMaxKm != null
    ? selectedCorridorData.availableMaxDistances.find((t) => t.maxKm === selectedMaxKm) ?? null
    : null;
  const selectedGroupAreaKeys = selectedTierData?.areaKeys ?? [];
  // Issue #1494 — map URL intent ('buy'|'rent') to backend listingPurpose ('sale'|'rent').
  // 'buy' is the default; absent/invalid intent → 'sale'. Never send 'buy' to the backend.
  const intentListingPurpose: string = urlState.intent === 'rent' ? 'rent' : 'sale';

  const {
    data: agriMapListingsData,
    isLoading: isLoadingAgriGroupListings,
    isError: isAgriGroupListingsError,
    refetch: refetchAgriGroupListings,
  } = useAgriMapListings(urlState.city, selectedGroupAreaKeys, intentListingPurpose, isAuthenticated);

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
    ? resolveActiveDiscoverGroup(areaGroupsData?.groups, urlState.groupId)
    : null;
  const resolvedGroupAreaKeys: string[] = resolvedGroupForResults?.area_keys ?? [];

  // ── Authenticated path: /api/discover/listings (paginated, fully filtered) ──
  const {
    data: groupResultsAuthedData,
    isLoading: isLoadingGroupResultsAuthed,
    isError: isGroupResultsErrorAuthed,
    refetch: refetchGroupResultsAuthed,
  } = useDiscoverListings({
    city: urlState.city,
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
    urlState.city,
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
    city: urlState.city,
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
      urlState.selectedListing && agriMapListingsData?.listings
        ? (agriMapListingsData.listings.find((l) => l.id === urlState.selectedListing) ?? null)
        : null,
    [urlState.selectedListing, agriMapListingsData?.listings],
  );

  // Issue #1824 Slice S11b (C4) — client-side filtered agri listings lifted into
  // useFilteredAgriListings (see the hook's header comment).
  const filteredAgriListings = useFilteredAgriListings({
    agriMapListingsData,
    filters: urlState.filters,
    isAuthenticated,
  });

  // Issue #1824 Slice S4 — search-keyword state (searchQuery/debouncedSearch,
  // reverse URL-sync, 250ms debounce, handleSearchChange) now lives in
  // useDiscoverSearchState. See the hook's header comment for the KNOWN,
  // INTENTIONAL split-brain (debouncedSearch drives badge+markers here;
  // urlState.q drives ActiveContextChips) — do NOT unify.
  const { searchQuery, debouncedSearch, handleSearchChange } =
    useDiscoverSearchState({ urlQ: urlState.q, setUrlSearch: urlActions.setSearchQuery });

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
  } = useMarkerSelection({ urlActions, urlState });

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

  const {
    filters, selectedArea, panToArea, mapZoom, mapReady, showLoader,
    selectedSchool, schoolBoardFilter, city, fitTick, resetMapTick,
    pendingAreaKeyRef, initialViewportRef, initialViewportWasBareAreaRef, resolveSignal,
    setFilters, setSelectedArea, setPanToArea, setMapReady, setMapZoom,
    setFitTick, setShowLoader, setSchoolBoardFilter, setSelectedSchool,
    handleCityChange, handleSchoolSelect, handleFiltersChange,
    handlePolygonDrawn, handlePolygonCleared,
    handleAreaClick, handleAreaSelect, handleAreaBack,
    page, setPage,
  } = useDiscoverPageState({ urlState, urlActions });

  // Issue #1745 Batch B map-hierarchy fix — backend-owned region counts for the
  // journeyless-landing macro-region bubbles (see overviewAreas below). Called with the
  // SAME { city, listingPurpose } shape GuidedEntryPanel uses (city, listingPurpose only —
  // no propertyType/groupBy/hotspotLimit — so groupBy defaults to 'area_group' and
  // hotspotLimit defaults to 8 identically), so the query key matches exactly and this
  // hits the React Query cache the right panel already populated — zero extra fetch.
  const summaryListingPurpose: DiscoverSummaryListingPurpose =
    urlState.intent === 'rent' ? 'rent' : 'sale';
  const { data: discoverSummaryData } = useDiscoverSummary({
    city,
    listingPurpose: summaryListingPurpose,
  });
  const rawSummaryRegions = discoverSummaryData?.regions;
  const areaGroupsList = areaGroupsData?.groups;
  const summaryRegions = useMemo(
    () => aggregateMacroRegions(rawSummaryRegions, areaGroupsList, discoverSummaryData?.totalActiveListings),
    [rawSummaryRegions, areaGroupsList, discoverSummaryData?.totalActiveListings]
  );

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
  // Guard: !urlState.schoolId restricts injection to combined state only.
  // Without this guard, area-first journey (area selected, no school) would also have
  // the polygon injected, routing the request through the polygon endpoint (capped at 200)
  // and breaking authenticated-user pagination.
  //
  // Polygon format: [[s,w],[s,e],[n,e],[n,w],[s,w]] — five [lat,lon] pairs matching
  // the PropertyFilters.polygon convention used by useDiscoverListings/the backend.
  const effectiveFilters = useMemo((): typeof filters => {
    // Only inject area-bbox polygon in combined state (area + school both present).
    if (!urlState.schoolId || !selectedArea?.bbox || filters.polygon) return filters;
    const [[s, w], [n, e]] = selectedArea.bbox;
    const bboxPolygon: [number, number][] = [[s, w], [s, e], [n, e], [n, w], [s, w]];
    return { ...filters, polygon: bboxPolygon };
  }, [filters, selectedArea, urlState.schoolId]);

  // Issue #1655 — top-grouped-level guard: at the grouped overview level, individual
  // property markers and paginated listings should NOT be fetched. Only group/zone
  // count markers (from useDiscoverAreas / useAreaGroups / useRegionalAreaGroups)
  // are needed. This boolean mirrors the later isTopGroupedAreaOrSchool / isTopGroupedAgri
  // definitions (line ~2098) but is computed here so it can gate the data hooks.
  const isTopGroupedLevel = (() => {
    if (
      (urlState.journey === 'area-first' || urlState.journey === 'school-first') &&
      !urlState.groupId &&
      !urlState.areaKey &&
      !selectedArea &&
      !urlState.schoolId &&
      !selectedSchool
    ) return true;
    if (
      urlState.journey === 'agri-first' &&
      !urlState.selectedRegion &&
      !urlState.areaKey &&
      !selectedArea &&
      !urlState.selectedLocality &&
      !urlState.selectedGroup
    ) return true;
    return false;
  })();

  // Issue #1806 (FIX-1) — group-scope the map's marker fetch. The right panel
  // (AreaGroupSelectedPanel, reached whenever urlState.groupId resolves to a
  // real group) already shows only the group's member areas; before this fix
  // the map's marker fetch ignored groupId entirely and showed city-wide
  // markers instead (the reported map/panel scope mismatch).
  //
  // This MUST be resolved here, before the useDiscoverMapData() call below,
  // which is earlier in the file than the focusedGroup/focusedGroupAreas
  // declarations used everywhere else on this page (~line 1631/2102, for
  // fitBounds + AreaMarkerLayer opacity/degradation props). Deliberately
  // duplicates that derivation — same resolver (resolveDiscoverGroupForAreaKey),
  // same inputs (areaGroupsData?.groups, urlState.groupId, urlState.areaKey) —
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
    if (!urlState.groupId) return undefined;
    if (urlState.journey === 'school-first' && urlState.schoolId) return undefined;
    const group = resolveDiscoverGroupForAreaKey(areaGroupsData?.groups, urlState.groupId, urlState.areaKey);
    return group?.area_keys ?? [];
  }, [urlState.groupId, urlState.journey, urlState.schoolId, urlState.areaKey, areaGroupsData?.groups]);

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
  } = useDiscoverMapData({
    city, selectedArea, filters: effectiveFilters, debouncedSearch,
    urlSchoolId: urlState.schoolId, isAuthenticated, fitTick,
    // Issue #1806 (FIX-1) — see groupAreaKeysForMapData above for the full
    // journey/state → value mapping.
    groupAreaKeys: groupAreaKeysForMapData,
    // Issue #1118: do NOT include !!urlState.schoolId here. The /api/discover/markers
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
      (urlState.journey === 'area-first' ||
        // Issue #1372 — agri-first journey must also enable markers so AgriMarkerClusterLayer
        // receives data. Without this, useDiscoverFilteredMarkers is never enabled in
        // agri-first mode and the cluster layer renders empty.
        urlState.journey === 'agri-first' ||
        (urlState.journey === 'school-first' &&
          !!urlState.schoolId &&
          filters.schoolLat != null &&
          filters.schoolLon != null &&
          boundedSearchTriggered)) &&
      mapZoom > AREA_LAYER_MAX_ZOOM,
    // Issue #1655 — suppress the paginated listings fetch at grouped overview level.
    // At top-grouped states the right panel shows groups/zones, not individual listings,
    // so there is no consumer for this data. Drilling down into a group/area/school
    // clears isTopGroupedLevel and re-enables the fetch.
    listingsEnabled: !isTopGroupedLevel,
    page,
    bbox: mapBbox,
    journey: urlState.journey,
    // Issue #1494 — thread buy/rent intent as listingPurpose filter
    listingPurpose: intentListingPurpose,
  });

  // Issue #1824 Slice S6 — the window.__debug.mapState effect (Playwright E2E contract)
  // moved a few lines down (after useDiscoverJourneyTransitions), because it now reads
  // journeyView.areaRestoreTick/cityRestoreTick. The object SHAPE is byte-identical.

  // Schools for SchoolMarkerLayer — fetched only in school-first journey when an area is selected.
  // Single owner: MapDiscovery fetches once and passes down to both SchoolMarkerLayer and
  // SchoolsInAreaPanel (via DiscoverRightPanel) to avoid duplicate API calls.
  // Issue #1131 — URL-backed board filter for schools. The board filters live in
  // urlState.filters.boardFilters (parsed from repeated ?board=CBSE&board=ICSE params).
  // The previous code read `urlState.boardFilters`, which is undefined on the URL state
  // shape — boardFilters live under `filters`. That bug meant the URL never reached the
  // schools query.
  const urlBoardFilters = useMemo(
    () => urlState.filters.boardFilters ?? [],
    [urlState.filters.boardFilters],
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
    panelContent === 'schools-in-area' ? (urlState.areaKey ?? undefined) : undefined;
  const schoolsQuery = useSchoolsByArea(
    schoolsAreaKey,
    urlBoardFilters,
    urlState.filters.categoryFilters ?? [],
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
  // Always uses REPLACE semantics (urlActions.setBoardFilters is REPLACE-only).
  const handleBoardFilterChange = useCallback(
    (boards: string[]) => {
      setSchoolBoardFilter(boards);
      urlActions.setBoardFilters(boards);
    },
    [setSchoolBoardFilter, urlActions],
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
    urlState,
    urlActions,
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
    || (isAuthenticated && mapZoom > AREA_LAYER_MAX_ZOOM && markersLoading);

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
    journey: urlState.journey,
    schoolId: urlState.schoolId,
  });

  // Issue #1175 v3 / Issue #1798 PR-B1 — focusedGroup is resolved from both groupId (by ID
  // or exact slug match) and automatically derived from urlState.areaKey if needed.
  // Guarantees right panel, map layer, map markers, and map breadcrumb derive from unified context.
  const focusedGroup = useMemo(() => {
    return resolveDiscoverGroupForAreaKey(areaGroupsData?.groups, urlState.groupId, urlState.areaKey);
  }, [areaGroupsData?.groups, urlState.groupId, urlState.areaKey]);

  // Issue #1175 v3 — group aggregate count for the badge.
  // Only active when groupId is set and no area/school is selected (those take precedence).
  // null  = group metadata still loading (isLoadingAreaGroups=true).
  // O(k) where k = member area count (bounded, typically 2–6).
  const groupListingsCount = useMemo((): number | null | undefined => {
    if (!urlState.groupId) return undefined;          // no group active
    if (!focusedGroup) return null;                   // null when areaGroupsData still loading OR when groupId no longer exists — both intentionally hide the badge
    // Use a Set for O(1) membership checks → overall O(N + k) not O(N·k)
    const memberKeySet = new Set(focusedGroup.area_keys);
    return discoverAreas
      .filter((a) => memberKeySet.has(a.areaKey))
      .reduce((sum, a) => sum + (a.listingCount ?? 0), 0);
  }, [urlState.groupId, focusedGroup, discoverAreas]);

  // Issue #1824 Slice S11b (C5) — school-first status-pill count derivations
  // lifted into useSchoolFirstCounts (see the hook's header comment). Called
  // AFTER focusedGroup (above) since schoolFirstZoneSchoolCount depends on it.
  const {
    schoolFirstLandingSchoolCount,
    schoolFirstZoneSchoolCount,
    schoolFirstAreaSchoolCount,
    schoolZoneLabels,
  } = useSchoolFirstCounts({
    journey: urlState.journey,
    groupId: urlState.groupId,
    selectedArea,
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
        selectedArea,
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
        // urlState.q (which drives ActiveContextChips). Do NOT unify — see
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
    [selectedArea, filters, isLoadingAreaListings, listingDataLoading, isAuthenticated, schoolRadiusListingsLoading, cityTotal, areaListings, schoolRadiusActive, schoolListings.length, groupListingsCount, debouncedSearch, schoolRadiusListings.length],
  );

  // Issue #1817 (code-review follow-up) — single computed copy string for the
  // area-selected scope, shared verbatim by the map badge (isAreaFirstSelectedAreaState
  // branch below) AND the AreaSelectedPanel result-summary stat (via DiscoverRightPanel
  // → AreaSelectedPanel's `areaResultSummaryText` prop), so the two surfaces can never
  // diverge — exactly one call to formatDiscoverBadgeCopy, exactly one selector
  // (discoverBadge) behind it.
  const areaResultSummaryText = useMemo(
    () =>
      selectedArea
        ? formatDiscoverBadgeCopy(discoverBadge, {
            scopeLabel: selectedArea.areaLabel,
            noun: 'verified properties',
            searchQuery: urlState.q,
          })
        : null,
    [selectedArea, discoverBadge, urlState.q],
  );

  // Issue #1817 (AC11) — debounced, polite result-count announcement. A visually-hidden
  // mirror of the badge copy, updated ~500ms after the badge SETTLES (not while loading),
  // so screen-reader users hear one announcement per fetch settle — never per keystroke,
  // never mid-refetch. Uses the same shared copy contract as the generic map-badge branch
  // (formatDiscoverBadgeCopy) for an honest, if not always verbatim, summary of every scope.
  // Issue #1824 Slice S10a — the debounced state/effect body extracted to
  // useDiscoverBadgeAnnounce (verbatim; only urlState.q → urlStateQ rename).
  const announcedBadgeText = useDiscoverBadgeAnnounce({
    discoverBadge,
    selectedArea,
    focusedGroup,
    city,
    urlStateQ: urlState.q,
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
  } = useDiscoverCameraOrchestration({
    urlState,
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
        selectedArea,
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
      },
    };
  }, [areaListings, areaMarkerListings, markerListings, selectedArea, mapZoom, city, selectedSchool, schoolMarkerFocusTick, journeyView.areaRestoreTick, journeyView.cityRestoreTick]);

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
    journey: urlState.journey,
    areaKey: urlState.areaKey,
    schoolPicking: urlState.schoolPicking,
    schoolId: urlState.schoolId,
  });

  // MVP2 — in the agri-first journey the school controls are not part of the flow.
  // Hide (do not disable) the "Near a school" trigger button and the NearSchoolSheet
  // mount so a user in agri-first cannot open the school sheet (which would call
  // setSchoolJourney and flip the journey to school-first). Single boolean gate.
  const isAgriJourney = urlState.journey === 'agri-first';

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
    if (urlState.schoolId) {
      // URL: drop schoolId + radiusKm, set schoolPicking=1 (single REPLACE).
      urlActions.backToSchoolPicking();
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
    } else if (urlState.schoolPicking) {
      urlActions.clearSchoolPicking();
    } else {
      handleAreaBack();
    }
  }, [urlState.schoolId, urlState.schoolPicking, urlActions, handleAreaBack, setSelectedSchool, setFilters]);

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
    [urlState.groupId, areaGroupsData],
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
  // Issue #1817 (AC10) — "Clear all" composes the two existing, already-tested atomic
  // primitives (handleFiltersChange + setSearchQuery) rather than a new URL action:
  // handleFiltersChange({}) serialises every DiscoverUrlFilters key as absent (see
  // serializeFilters — a key not present in the payload is explicitly deleted from the
  // URL, not just skipped), which clears type/beds/price/seller/board/category/booleans/
  // dates via a single REPLACE. setSearchQuery('') separately clears `q`. Journey, scope,
  // areaKey/schoolId, and the map camera are untouched by either call (design §9: "Clear
  // all drops all filter+q keys but keeps city, journey, and scope keys").
  const handleClearAllFiltersAndSearch = useCallback(() => {
    handleFiltersChange({});
    urlActions.setSearchQuery('');
  }, [handleFiltersChange, urlActions]);

  const activeContextChips = useMemo(
    () => (
      <ActiveContextChips
        // Issue #1824 S4 — KNOWN, INTENTIONAL split-brain: chips read
        // urlState.q (URL-side debounce), NOT debouncedSearch (which drives
        // the badge + map markers via useDiscoverSearchState). Do NOT unify.
        searchQuery={urlState.q}
        onClearSearch={() => urlActions.setSearchQuery('')}
        filters={{
          ...filters,
          // Issue #1132 — board/category filters are written directly to URL by
          // onClearBoard/onClearCategory (via urlActions) without going through
          // setFilters, so local `filters` state can lag behind. Always pass the
          // URL-authoritative values here so ActiveContextChips renders the correct
          // chip set without a useEffect sync (which caused an infinite re-render
          // loop because urlState.filters.boardFilters is a new array ref each render).
          boardFilters: urlState.filters.boardFilters,
          categoryFilters: urlState.filters.categoryFilters,
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
          const next = (urlState.filters.boardFilters ?? []).filter(
            (b) => b.toLowerCase() !== board.toLowerCase(),
          );
          urlActions.setBoardFilters(next);
        }}
        onClearCategory={(category) => {
          const next = (urlState.filters.categoryFilters ?? []).filter(
            (c) => c.toLowerCase() !== category.toLowerCase(),
          );
          urlActions.setCategoryFilters(next);
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
    [urlState.q, urlState.filters.boardFilters, urlState.filters.categoryFilters, filters, urlActions, handleClearAllFiltersAndSearch],
  );

  // Memoize initialCenter to prevent URLViewportController effect re-runs on every parent render.
  // Hoisted above the isCityValid early return to satisfy Rules of Hooks.
  const memoizedInitialCenter = useMemo(
    () => urlState.viewport ? [urlState.viewport.lat, urlState.viewport.lon] as [number, number] : undefined,
    [urlState.viewport],
  );

  // Issue #1160 GAP 2 — derive area coordinates for AreaRestorePanner.
  // Re-derived from discoverAreas at render time (not captured at click time) so the
  // panner always has fresh coords. If discoverAreas hasn't loaded yet, the panner
  // receives null values and skips the restore (no crash).
  // Hoisted above the isCityValid early return to satisfy Rules of Hooks.
  const areaRestoreArea = useMemo(() => {
    if (!urlState.areaKey) return null;
    return discoverAreasData?.areas?.find((a) => a.areaKey === urlState.areaKey) ?? null;
  }, [urlState.areaKey, discoverAreasData]);

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

  const trendsHref = selectedArea
    ? `/trends/${city}/areas/${slugifyFromAreaKey(selectedArea.areaKey)}`
    : undefined;

  const filtersContent = (
    <MapFilters
      filters={filters} onFiltersChange={handleFiltersChange}
      selectedSchool={selectedSchool} onSchoolSelect={journeyCommands.wrappedSchoolSelect}
      schoolBoardFilter={schoolBoardFilter} onSchoolBoardFilterChange={handleBoardFilterChange}
      city={city}
      trendsAreaKeys={selectedArea ? [selectedArea.areaKey] : trendsAreaKeys}
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
    urlState.journey === 'school-first' &&
    (!!urlState.groupId || !!urlState.areaKey || !!selectedArea || !!selectedSchool);

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
    selectedArea,
    selectedSchool,
    discoverAreas,
    areasLoading,
    cityTotal,
    urlState,
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
    urlState,
    summaryRegions,
    cityCenter,
    focusedGroup,
    debouncedAreaSearchQuery,
    city,
    selectedArea,
    selectedSchool,
    selectedMarkerListing,
  });

  const handleOverviewAreaClick = useCallback((area: AreaPoint) => {
    if (isTopGroupedAgri && corridorGroups.some((c) => c.directionCode === area.areaKey)) {
      urlActions.setRegionWithMaxKm(area.areaKey);
      return;
    }
    if (
      mapLayerKind === 'macro-region-bubbles' &&
      (summaryRegions.some((r) => r.regionKey === area.areaKey) ||
        (areaGroupsData?.groups ?? []).some((g) => g.id === area.areaKey))
    ) {
      urlActions.setScope(area.areaKey);
      // Issue #1808 — arm the region-overview guidance one-shot pulse. Does
      // NOT change the setScope call above (regression-guarded state contract).
      armRegionSelect('map');
      return;
    }
    if ((areaGroupsData?.groups ?? []).some((g) => g.id === area.areaKey)) {
      urlActions.selectGroup(area.areaKey);
      return;
    }
    handleAreaClick(area);
  }, [isTopGroupedAgri, corridorGroups, areaGroupsData, mapLayerKind, urlActions, handleAreaClick, summaryRegions, armRegionSelect]);

  // Issue #1595 — the area-first selected-group drill-down state (a group is focused,
  // no specific area selected yet). Drives the mock-aligned map chrome for this step:
  // the city switcher is hidden, the "verified properties in {group}" pill is centred
  // at the bottom, and the Areas legend is shown.
  const isSelectedGroupState =
    resolvedPanelContent === 'area-groups-landing' && !!focusedGroup && !selectedArea;

  // Issue #1606 — area-first selected-AREA results state (terminal area chosen). Drives
  // the redesigned Manipal-style results panel and the 3-level map breadcrumb. Distinct
  // from isSelectedGroupState (no area yet) — here selectedArea is present.
  const isAreaFirstSelectedAreaState =
    resolvedPanelContent === 'area-selected' &&
    urlState.journey === 'area-first' &&
    !!selectedArea;

  // Issue #1798 PR-C — canonical listing-marker popover RENDER-eligibility predicate.
  // Previously this gate (formerly isAreaFirstPopoverEligible || isGroupResultsPopoverEligible)
  // required journey === 'area-first' plus specific panelContent values — strictly narrower
  // than the click-CAPTURE gate below (handleMarkerClickWithPosition / the setSelectedListing
  // branch of handleSelectMarkerListing), which already permits journeyless and other
  // non-agri-first states. That drift meant a listing marker click could already write
  // markerPixelPos/selectedMarkerListing and drive the #1547 right-panel scroll+highlight,
  // yet the popup itself would silently never render — the reported #1798 "popup missing"
  // bug. Fixed by reusing the SAME condition as the capture gate so the two can no longer
  // drift apart. Still excludes agri-first (own peek/panel) and school-first once a school
  // is selected (3 desynced marker tiers; owns its own tiered/peek flows) — see #1738/#1547.
  // Area/cluster/count marker clicks are unaffected: they never set markerPixelPos, so the
  // `selectedMarkerListing != null && markerPixelPos != null` conjunction at the render site
  // below still keeps them popup-free regardless of this predicate.
  const isMarkerPopoverEligible =
    urlState.journey !== 'agri-first' &&
    urlState.areaKey != null &&
    (urlState.schoolId == null || urlState.journey === 'area-first');

  // Issue #1606 — resolved group display name for the area-first breadcrumb. Prefers the
  // backend group name, falls back to a prettified slug so a deep-linked groupId that has
  // not yet hydrated still reads as a human label (e.g. "University Belt"). Null when no
  // group context exists — the breadcrumb then omits the group crumb.
  const selectedGroupName =
    focusedGroup?.name ?? (urlState.groupId ? prettifyZoneSlug(urlState.groupId) : null);

  // Issue #1808 — the ring/helper (not the card/legend) fire only on an actual
  // map/panel pick, never on deep-link/refresh (design §5/§9, AC5).
  const regionGuideVisible = isRegionOverview && !regionGuideDismissed;
  const regionGuideRingActive = regionGuideVisible && regionSelectSource !== 'deeplink';

  if (!isCityValid) return <CityNotSupported city={city} />;

  // Issue #1824 Slice S10b — the marker-resolve + stepper cluster (Issue
  // #1810 Stage 2A, MODEL A user-locked model, see approved-plan.toml
  // [user_decision]) is extracted verbatim into the pure resolveMarkerPopover
  // module. Not a hook (plain const), so it is safe to declare after the
  // early return above; every field it closes over is already declared
  // earlier in this component. See
  // docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s10b-design.md.
  const { currentMapMarkerListings, markerPopoverStepper } = resolveMarkerPopover({
    mapLayerCategory,
    selectedArea,
    isGroupResultsState,
    mapZoom,
    areaLayerMaxZoom: AREA_LAYER_MAX_ZOOM,
    isAuthenticated,
    journey: urlState.journey,
    schoolId: urlState.schoolId,
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
    searchQuery: urlState.q,
  });
  const fallbackBadgeCopy = formatDiscoverBadgeCopy(discoverBadge, {
    scopeLabel:
      selectedArea?.areaLabel ??
      focusedGroup?.name ??
      (CITY_CONFIG[city]?.label ?? city),
    noun: selectedArea ? 'homes' : 'properties',
    searchQuery: urlState.q,
  });
  const schoolRadiusPillNoun = deriveSchoolRadiusPillNoun(urlState.intent);
  const hasActiveAnonFilter = hasActiveAnonPropertyFilter(filters);

  return (
    <PublicDiscoverLayout>
      <div className="h-full flex flex-col lg:flex-row relative">
        {/* a3 — mapContainerRef wraps the full map half-panel for MarkerPopoverCard bounds clamp.
            R-C — warm map gutter background (#EDEBE6) so the gutter between the map tile and
            panel edge is warm off-white, not default grey. */}
        <DiscoverMapCanvas
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
          urlState={urlState}
          cityCenter={cityCenter}
          cityZoom={cityZoom}
          overviewAreas={overviewAreas}
          handleOverviewAreaClick={handleOverviewAreaClick}
          publishCameraIntent={publishCameraIntent}
          cameraIntent={cameraIntent}
          focusedGroupAreas={focusedGroupAreas}
          areaLayerMaxZoom={AREA_LAYER_MAX_ZOOM}
          selectedArea={selectedArea}
          areaSearchMatchKeys={areaSearchMatchKeys}
          hoveredAreaKeyForMap={hoveredAreaKeyForMap}
          publishClusterCameraIntent={publishClusterCameraIntent}
          handleAreaClusterClick={handleAreaClusterClick}
          handleAreaMarkersComputed={handleAreaMarkersComputed}
          schoolZoneLabels={schoolZoneLabels}
          urlActions={urlActions}
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
          isMarkerPopoverEligible={isMarkerPopoverEligible}
          markerPopoverStepper={markerPopoverStepper}
          navigate={navigate}
          handleStepMarkerListing={handleStepMarkerListing}
          showMarkerInList={showMarkerInList}
        />

        <DiscoverRightPanelContainer
          resolvedPanelContent={resolvedPanelContent}
          selectedMarkerListing={selectedMarkerListing}
          clearSelectedMarkerListing={clearSelectedMarkerListing}
          city={city}
          urlState={urlState}
          urlActions={urlActions}
          activeContextChips={activeContextChips}
          discoverAreas={discoverAreas}
          selectedArea={selectedArea}
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
