import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { AppLayout } from '@/components/layout/AppLayout';
import { PropertyMap, PropertyListingWithImages } from '@/components/map/PropertyMap';
import { MapFilters } from '@/components/map/MapFilters';
import { DiscoverRightPanel } from '@/components/discover/DiscoverRightPanel';
import { AreaIndicatorOverlay } from '@/components/discover/AreaIndicatorOverlay';
import {
  SchoolJourneyBreadcrumb,
  SchoolRadiusLegend,
  isSchoolRadiusOverlayState,
  prettifyZoneSlug,
} from '@/components/discover/SchoolRadiusMapOverlay';
import { ActiveContextChips } from '@/components/discover/ActiveContextChips';
import { derivePanelContent } from '@/utils/discoverPanelState';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import { computeGroupBounds } from '@/utils/discoverGroupBounds';
import { CitySelect } from '@/components/discover/CitySelect';
import { CityNotSupported } from '@/components/discover/CityNotSupported';
import { MapStatsBar, MarkersTruncationNotice } from '@/components/discover/MapStatsBar';
import { MapEmptyGuidance } from '@/components/discover/MapEmptyGuidance';
import { useAuth } from '@/contexts/AuthContext';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { useDiscoverPageState } from '@/hooks/useDiscoverPageState';
import { useDiscoverMapData } from '@/hooks/useDiscoverMapData';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { useAreaGroups } from '@/hooks/useAreaGroups';
import { useRegionalAreaGroups } from '@/hooks/useRegionalAreaGroups';
import { useAgriMapListings } from '@/hooks/useAgriMapListings';
import { useSchoolsByArea } from '@/hooks/useSchoolsByArea';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { SchoolRadiusListingItem } from '@/hooks/useSchoolRadiusListings';
import { CITY_CONFIG } from '@/lib/localityUtils';
import { getSectorBounds } from '@/lib/geo';
import { clampSchoolRadiusKm, PropertyListing, PropertyImage } from '@/hooks/usePropertyListings';
import { cityListingToPropertyListing } from '@/lib/discoverMappers';
import { ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { NearSchoolSheet } from '@/components/map/NearSchoolSheet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';

// Re-exported so existing test imports from '@/pages/MapDiscovery' continue to resolve.
export { isNew } from '@/lib/isNew';

/** Zoom-band threshold: area overview rings show at zoom ≤ this; individual listing clusters show above it. */
const AREA_LAYER_MAX_ZOOM = 12;

// ── Discover badge derivation ─────────────────────────────────────────────────
//
// Pure helper — exported so it can be unit-tested without mounting the page.
// Determines what the "Showing X properties" badge should display, given the
// current area/filter/loading context.
//
// Priority (highest to lowest):
//   1. Area selected + loading area listings → hide (AC5: no stale number).
//   2. Area selected + property filters active → show areaListings.length (AC2+AC4:
//      areaListings is the filter-aware response from useDiscoverCityListings, so its
//      length matches the right panel exactly). Falls back to hide if areaListings is
//      not yet an array (defensive — should not occur after load settles).
//   3. Area selected + no property filters → show selectedArea.listingCount (AC1).
//      Falls back to hide if listingCount is null/undefined (AC4 safety).
//   4. No area, property filters active → hide (AC2 + AC4: filtered count is
//      auth-gated / unreliable; safer to hide than contradict right panel).
//   5. No area, no property filters → show cityTotal (AC3).
//   6. cityTotal === 0 (areas not yet loaded) → hide (AC5).

export interface DiscoverBadgeInput {
  selectedArea: { listingCount?: number | null } | null;
  filters: {
    propertyTypes?: unknown[];
    bedrooms?: unknown[];
    priceMin?: number;
    priceMax?: number;
    sellerTypes?: string[];
    dateFrom?: Date | null;
    dateTo?: Date | null;
    backOnMarket?: boolean;
    newToMarket?: boolean;
    reraRegistered?: boolean;
    readyToMove?: boolean;
  };
  isLoadingAreaListings: boolean;
  cityTotal: number;
  areaListings?: ReadonlyArray<unknown> | null;
  /**
   * Issue #1175 v2 — the already-computed count of listings that fall within
   * the active school-radius proximity filter.
   *
   * - `number`  → school-radius is active and resolved: badge shows this count
   *               (may be 0, meaning "0 properties within N km").
   * - `null`    → school-radius is active but listings are still loading:
   *               badge is hidden temporarily to avoid a flash of stale counts.
   * - `undefined` → no school-radius context: fall through to existing
   *                 area/city/filter paths (#1152 behaviour unchanged).
   */
  schoolListingsCount?: number | null;
  /**
   * Issue #1175 v3 — the sum of listingCount across all member areas of the
   * active group, when groupId is set but no area or school is selected.
   * Precedence: school > area > group > city.
   *
   * - `number`    → group metadata loaded: badge shows group aggregate (may be 0).
   * - `null`      → group metadata still loading: badge hidden temporarily.
   * - `undefined` → no group context active: fall through to city total.
   */
  groupListingsCount?: number | null;
  /** Free-text keyword query active in the search box. When set, badge uses filtered count. */
  searchQuery?: string;
}

export interface DiscoverBadgeResult {
  visible: boolean;
  count: number | null;
  loading: boolean;
}

export function deriveDiscoverBadge({
  selectedArea,
  filters,
  isLoadingAreaListings,
  cityTotal,
  areaListings,
  schoolListingsCount,
  groupListingsCount,
  searchQuery,
}: DiscoverBadgeInput): DiscoverBadgeResult {
  // Issue #1175 v2 — school-radius context: badge follows the active count.
  //
  // schoolListingsCount is set (not undefined) when a school-radius filter is active:
  //   • null    → listings are still loading → hide badge temporarily (avoids stale flash)
  //   • number  → resolved count (0 or N) → show it directly so badge stays truthful
  //
  // Showing 0 is intentional: it matches "No properties found within N km" in the right
  // panel rather than contradicting it with an unrelated area/city total.
  if (schoolListingsCount !== undefined) {
    if (schoolListingsCount === null) {
      // Still loading — hide temporarily rather than flash a stale number.
      return { visible: false, count: null, loading: true };
    }
    // Resolved (0 or N): show the scoped count.
    return { visible: true, count: schoolListingsCount, loading: false };
  }

  // Compute hasPropertyFilters once — used by both the area branch and the no-area branch.
  const hasPropertyFilters =
    (filters.propertyTypes?.length ?? 0) > 0 ||
    (filters.bedrooms?.length ?? 0) > 0 ||
    filters.priceMin != null ||
    filters.priceMax != null ||
    (filters.sellerTypes?.filter((s) => s.trim() !== '').length ?? 0) > 0 ||
    filters.dateFrom != null ||
    filters.dateTo != null ||
    !!filters.backOnMarket ||
    !!filters.newToMarket ||
    !!filters.reraRegistered ||
    !!filters.readyToMove;

  // Area selected path (AC1, AC2 combined, AC4, AC5)
  if (selectedArea != null) {
    if (isLoadingAreaListings) {
      return { visible: false, count: null, loading: true };
    }
    if (hasPropertyFilters || !!searchQuery) {
      // Area + property filters or keyword search: show the filtered count from areaListings
      // (filter-aware, matches right panel and map markers — AC4).
      // areaListings is undefined while the first fetch is in flight but
      // isLoadingAreaListings already caught that above; here it should be an array.
      if (Array.isArray(areaListings)) {
        return { visible: true, count: areaListings.length, loading: false };
      }
      // Defensive fallback: areaListings not yet an array (should not reach here
      // after loading settles, but hide rather than show a stale number).
      return { visible: false, count: null, loading: false };
    }
    const count = selectedArea.listingCount ?? null;
    if (count == null) {
      // AC4 safety: don't show a number we can't verify
      return { visible: false, count: null, loading: false };
    }
    return { visible: true, count, loading: false };
  }

  // No area: check for active property filters (AC2 + AC4)
  if (hasPropertyFilters) {
    // Filtered count is auth-gated and unreliable — hide to avoid AC4 contradiction.
    return { visible: false, count: null, loading: false };
  }

  // Issue #1175 v3 — group context (precedence: below school/area, above city).
  // groupListingsCount is set (not undefined) when a groupId is active and no area/school
  // is selected. null = group metadata still loading; number = resolved aggregate (0 or N).
  if (groupListingsCount !== undefined) {
    if (groupListingsCount === null) {
      return { visible: false, count: null, loading: true };
    }
    return { visible: true, count: groupListingsCount, loading: false };
  }

  // Baseline city total (AC3)
  if (cityTotal === 0) {
    return { visible: false, count: null, loading: false };
  }
  return { visible: true, count: cityTotal, loading: false };
}

// ── Anon client-side PropertyFilter parity (Issue #1261, DECISION-1) ──────────
//
// The public /school-radius-listings endpoint takes NO property-filter params, so
// when an anon user has active PropertyFilters we must apply them client-side over
// the endpoint content to match the auth path's filtered result.
//
// Only filters whose backing field is present in the 20-field anon contract are
// honoured:
//   propertyTypes → propertyType        bedrooms → bedrooms (4 = "4 or more")
//   priceMin/Max  → pricePaise (rupees) dateFrom/To → createdAt
//   backOnMarket  → backOnMarket        newToMarket → daysOnMarket (1..7)
//   readyToMove   → possessionStatus
//
// reraRegistered and sellerTypes are intentionally NOT applied — they rely on
// reraNumber / sellerType which the server EXCLUDES from the anon payload (AC6).
// Pure + exported so it can be unit-tested without mounting the page.
export function applyAnonPropertyFilters(
  listings: SchoolRadiusListingItem[],
  filters: {
    propertyTypes?: string[];
    bedrooms?: number[];
    priceMin?: number;
    priceMax?: number;
    dateFrom?: Date | null;
    dateTo?: Date | null;
    backOnMarket?: boolean;
    newToMarket?: boolean;
    readyToMove?: boolean;
  },
): SchoolRadiusListingItem[] {
  let result = listings;

  if (filters.propertyTypes && filters.propertyTypes.length > 0) {
    const wanted = new Set(filters.propertyTypes.map((t) => t.toLowerCase()));
    result = result.filter((l) => l.propertyType != null && wanted.has(l.propertyType.toLowerCase()));
  }

  if (filters.bedrooms && filters.bedrooms.length > 0) {
    const has4Plus = filters.bedrooms.includes(4);
    const exact = new Set(filters.bedrooms.filter((b) => b < 4));
    result = result.filter((l) => {
      if (l.bedrooms == null) return false;
      if (has4Plus && l.bedrooms >= 4) return true;
      return exact.has(l.bedrooms);
    });
  }

  // pricePaise is in paise; filters.priceMin/Max are in rupees (×100).
  if (filters.priceMin != null) {
    const minPaise = filters.priceMin * 100;
    result = result.filter((l) => l.pricePaise != null && l.pricePaise >= minPaise);
  }
  if (filters.priceMax != null) {
    const maxPaise = filters.priceMax * 100;
    result = result.filter((l) => l.pricePaise != null && l.pricePaise <= maxPaise);
  }

  if (filters.dateFrom) {
    const fromMs = filters.dateFrom.getTime();
    result = result.filter((l) => {
      if (!l.createdAt) return false;
      const t = new Date(l.createdAt).getTime();
      return Number.isFinite(t) && t >= fromMs;
    });
  }
  if (filters.dateTo) {
    const toMs = filters.dateTo.getTime();
    result = result.filter((l) => {
      if (!l.createdAt) return false;
      const t = new Date(l.createdAt).getTime();
      return Number.isFinite(t) && t <= toMs;
    });
  }

  if (filters.backOnMarket) {
    result = result.filter((l) => l.backOnMarket === true);
  }
  if (filters.newToMarket) {
    result = result.filter(
      (l) => typeof l.daysOnMarket === 'number' && l.daysOnMarket > 0 && l.daysOnMarket <= 7,
    );
  }
  if (filters.readyToMove) {
    result = result.filter((l) => l.possessionStatus === 'ready_to_move');
  }

  return result;
}

/**
 * Issue #1261 rev2 (AC11) — derive Leaflet-pin shape from the anon school-radius
 * listings already fetched + filtered for the right panel. Mirrors the
 * `areaMarkerListings` recipe in useDiscoverMapData.ts: filter null coordinates,
 * normalise lat/lon, then reuse `cityListingToPropertyListing` so the resulting
 * shape, popup content, and clustering pipeline are byte-identical to the existing
 * anon area-marker pins. Pure function — exported for unit-test parity.
 *
 * Caller MUST pass the post-applyAnonPropertyFilters set (DECISION-1 parity) so the
 * map and right panel reflect the same filtered universe. Empty input → empty output
 * (preserves the #1118 area-fallback's role for the "no radius hits yet" case).
 *
 * ANON-SAFE: consumes only fields from the 20-field public contract carried on
 * SchoolRadiusListingItem (id/propertyType/title/locality/pricePaise/primaryImageUrl/
 * listingPurpose/bedrooms/builtArea/landArea + units/createdAt/lat/lon). Does NOT read or rely
 * on trustTier/reraNumber/reraValid/sellerType/status/updatedAt/lastUpdatedAt/
 * firstPublishedAt — those are excluded server-side and never reach this helper.
 */
export function deriveAnonSchoolRadiusMarkers(
  listings: SchoolRadiusListingItem[],
): (PropertyListing & { images?: PropertyImage[] })[] {
  if (listings.length === 0) return [];
  const now = new Date().toISOString();
  return listings
    .filter((l) => l.lat != null && l.lon != null)
    .map((l) =>
      cityListingToPropertyListing(
        { ...l, lat: l.lat as number, lon: l.lon as number },
        now,
      ),
    );
}

/**
 * Issue #1261 delta (FINDING 1) — true when any client-side PropertyFilter that
 * applyAnonPropertyFilters can SHRINK the result by is active.
 *
 * The "showing first N" hint (school-radius-more-hint) gates visibility on the
 * server's UNFILTERED size+1 probe (`hasMore`) but displays the POST-filter count
 * (`schoolListings.length`). When a property filter is active those extra unseen
 * server rows may not match the filter, so the hint would dishonestly imply that
 * more *matching* homes exist beyond the shown N. We suppress the hint in that case
 * (AC8 truthfulness): the displayed filtered set IS the complete match over the
 * fetched page, and the endpoint takes no filter params so there is no honest way to
 * promise more matching results. The radius-only (no property filter) case keeps the
 * accurate hint, since then the displayed count equals the unfiltered server page.
 *
 * Mirrors exactly the keys applyAnonPropertyFilters honours — schoolLat/schoolLon/
 * schoolRadiusKm are deliberately excluded (they define the radius, not a refinement).
 */
export function hasActiveAnonPropertyFilter(filters: {
  propertyTypes?: string[];
  bedrooms?: number[];
  priceMin?: number;
  priceMax?: number;
  dateFrom?: Date | string | null;
  dateTo?: Date | string | null;
  backOnMarket?: boolean;
  newToMarket?: boolean;
  readyToMove?: boolean;
}): boolean {
  return Boolean(
    (filters.propertyTypes && filters.propertyTypes.length > 0) ||
      (filters.bedrooms && filters.bedrooms.length > 0) ||
      filters.priceMin != null ||
      filters.priceMax != null ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.backOnMarket ||
      filters.newToMarket ||
      filters.readyToMove,
  );
}

/** Issue #1457 — convert rupees (as stored in URL) to paise for comparison against pricePaise */
function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export default function MapDiscovery() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [urlState, urlActions] = useDiscoverUrlState();
  const isAuthenticated = !authLoading && user !== null;
  // Issue #1160 v3 Bug A1 — TanStack Query client used to read cached useSchoolById
  // result synchronously inside handleSelectSchoolById. See that callback for details.
  const queryClient = useQueryClient();

  const panelContent = derivePanelContent(urlState);

  // Fetch area groups for the current city.
  // The hook's enabled guard (city.length > 0) prevents fetching on empty city.
  // Passing urlState.city directly avoids a stale-data window that the conditional ''
  // approach would create when the panel briefly re-renders before city resolves.
  const {
    data: areaGroupsData,
    isLoading: isLoadingAreaGroups,
  } = useAreaGroups(urlState.city);

  // Issue #1429 (B2) — precomputed corridor groups for the agri-first landing panel.
  // useRegionalAreaGroups returns { groups, isLoading, error } directly (no .data wrapper).
  const {
    groups: corridorGroups,
    isLoading: isLoadingRegionalAreaGroups,
    isError: isRegionalAreaGroupsError,
    refetch: refetchRegionalAreaGroups,
  } = useRegionalAreaGroups(urlState.city);

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

  // Issue #1457 — client-side filtered agri listings (acreage always, price only when authed).
  // Single source of truth passed to both PropertyMap (markers) and DiscoverRightPanel (list).
  const filteredAgriListings = useMemo(() => {
    if (!agriMapListingsData?.listings) return null;
    const acresMin = urlState.filters.agriAcresMin;
    const acresMax = urlState.filters.agriAcresMax;
    const priceMinPaise = isAuthenticated && urlState.filters.agriPriceMin != null
      ? rupeesToPaise(urlState.filters.agriPriceMin)
      : null;
    const priceMaxPaise = isAuthenticated && urlState.filters.agriPriceMax != null
      ? rupeesToPaise(urlState.filters.agriPriceMax)
      : null;
    return agriMapListingsData.listings.filter((l) => {
      // Acreage filter: null computedAreaAcres excluded when filter is active
      if (acresMin != null || acresMax != null) {
        if (l.computedAreaAcres == null) return false;
        if (acresMin != null && l.computedAreaAcres < acresMin) return false;
        if (acresMax != null && l.computedAreaAcres > acresMax) return false;
      }
      // Price filter: only for authenticated users
      if (priceMinPaise != null || priceMaxPaise != null) {
        if (l.pricePaise == null) return false;
        if (priceMinPaise != null && l.pricePaise < priceMinPaise) return false;
        if (priceMaxPaise != null && l.pricePaise > priceMaxPaise) return false;
      }
      // Issue #1458 — categorical field filters (exact match; null = no filter = include all)
      if (urlState.filters.agriLandCategory != null) {
        if (l.landCategory !== urlState.filters.agriLandCategory) return false;
      }
      // Boolean tri-state: null = no filter; true/false = exact match.
      // null listing field is NOT the same as false — we only exclude on exact inequality.
      if (urlState.filters.agriFarmhouseAvailable != null) {
        if (l.farmhouseAvailable !== urlState.filters.agriFarmhouseAvailable) return false;
      }
      if (urlState.filters.agriFencingDone != null) {
        if (l.fencingDone !== urlState.filters.agriFencingDone) return false;
      }
      // Water source: exact string match. 'NOT_AVAILABLE' matches only 'NOT_AVAILABLE' rows (not null).
      if (urlState.filters.agriWaterSource != null) {
        if (l.waterSource !== urlState.filters.agriWaterSource) return false;
      }
      return true;
    });
  }, [
    agriMapListingsData,
    urlState.filters.agriAcresMin,
    urlState.filters.agriAcresMax,
    isAuthenticated,
    urlState.filters.agriPriceMin,
    urlState.filters.agriPriceMax,
    urlState.filters.agriLandCategory,
    urlState.filters.agriFarmhouseAvailable,
    urlState.filters.agriFencingDone,
    urlState.filters.agriWaterSource,
  ]);

  const [searchQuery, setSearchQuery] = useState(() => urlState.q);
  const [debouncedSearch, setDebouncedSearch] = useState(() => urlState.q);
  const [nearSchoolOpen, setNearSchoolOpen] = useState(false);

  // Issue #1373 — selected agri polygon listing for right-panel stub (#1374 content).
  const [selectedMarkerListing, setSelectedMarkerListing] = useState<PropertyListingWithImages | null>(null);

  // Issue #1466 — stable ref bundle so handleSelectMarkerListing's useCallback dep array
  // stays empty (stable identity). urlActions changes every render; urlState.selectedRegion
  // and journey are needed inside the callback but declared after this point in the file.
  // The ref is mutated on every render so the callback always reads the latest values.
  const markerListingCtxRef = useRef({ urlActions, urlState });
  markerListingCtxRef.current = { urlActions, urlState };

  const handleSelectMarkerListing = useCallback(
    (listing: PropertyListingWithImages | null) => {
      setSelectedMarkerListing(listing);
      // Issue #1466: In agri-group-selected context (corridor + distance tier chosen,
      // no specific area), a marker click must write listing=<uuid> to the URL so
      // derivePanelContent routes to 'agri-group-peek'. The agri-detail override
      // (resolvedPanelContent below) uses local selectedMarkerListing state and only
      // fires when panelContent==='agri-selected' (areaKey present) — no conflict here.
      const { urlActions: actions, urlState: state } = markerListingCtxRef.current;
      if (
        listing != null &&
        state.journey === 'agri-first' &&
        state.selectedRegion != null &&
        state.selectedMaxKm != null
      ) {
        actions.setSelectedListing(listing.id);
        return;
      }
      // Issue #1547 — residential area-first card↔marker sync. A residential marker
      // click in the area-selected state writes the shared `listing` URL param so the
      // matching result card highlights (copper selected state) and scrolls into view.
      // This is scoped to area-first (lowest marker/list desync); school-first markers
      // come from three desynced tier sources and are intentionally NOT wired here.
      // derivePanelContent only routes on `listing` when an agri region+maxKm are set,
      // so writing it here does NOT change residential panel routing.
      if (
        listing != null &&
        state.journey !== 'agri-first' &&
        state.areaKey != null &&
        state.schoolId == null
      ) {
        actions.setSelectedListing(listing.id);
      }
    },
    [],
  );

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
  const [boundedSearchTriggered, setBoundedSearchTriggered] = useState(false);

  // Issue #1064 AC2 — Start Over must reset the map viewport to city center/zoom.
  // useDiscoverPageState owns `resetMapTick` (incremented by handleAreaBack); we need a
  // second source of truth that increments on Start Over without modifying that hook
  // (out of scope per scope-lock). We compose both into a single number passed to
  // PropertyMap.resetMapTick; MapController's handledTickRef-based guard correctly
  // detects any net increase and triggers the flyTo(cityCenter, cityZoom).
  const [startOverTick, setStartOverTick] = useState(0);

  // Issue #1547 — ephemeral hover/focus id for card→marker highlight.
  // Lives in component state only — never written to URL. Resets to null on
  // mouseleave/blur and naturally on journey switch (component re-mounts / panel
  // unmounts). School-first intentionally NOT wired (RISK-3: 3-tier desynced markers).
  const [hoveredListingId, setHoveredListingId] = useState<string | null>(null);

  // Issue #1160 — school-focus tick for SchoolFocusPanner in PropertyMap.
  // Incremented when the selected school changes (new school ID) or when radiusKm
  // changes while a school is selected in school-first journey. The tick pattern
  // mirrors resetMapTick/startOverTick so SchoolFocusPanner fires exactly once per
  // increment without creating a feedback loop with ViewportWatcher.
  const [schoolFocusTick, setSchoolFocusTick] = useState(0);

  // Issue #1160 GAP 1 — SchoolMarkerFocusPanner: fires fitBounds after listings settle.
  // schoolMarkerFocusTick is incremented when listings are ready (non-empty, query settled).
  // Feedback-loop safety: the tick is only incremented by the listingsReadyKey effect, which
  // gates on a primitive string (not array identity). schoolMarkerFocusTick itself is NOT in
  // the dep array. ViewportWatcher does not write to this tick.
  const [schoolMarkerFocusTick, setSchoolMarkerFocusTick] = useState(0);

  // Issue #1160 GAP 2 — Back restoration ticks.
  // areaRestoreTick: incremented when Back is pressed from school-selected (level 2 → 1),
  //   only when areaKey is set (so AreaRestorePanner has a valid area to fly to).
  // cityRestoreTick: incremented when Back is pressed from schools-in-area (level 1 → 0).
  // Neither is incremented from handleStartOver (Start Over uses composedResetMapTick).
  const [areaRestoreTick, setAreaRestoreTick] = useState(0);
  const [cityRestoreTick, setCityRestoreTick] = useState(0);

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

  // Sync local searchQuery when the URL `q` param changes (e.g. browser back/forward).
  useEffect(() => {
    if (urlState.q !== searchQuery) {
      setSearchQuery(urlState.q);
    }
    // Only react to URL changes, not local state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.q]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const handleSearchChange = useCallback(
    (q: string) => {
      setSearchQuery(q);
      urlActions.setSearchQuery(q);
    },
    [urlActions],
  );

  const {
    filters, selectedArea, panToArea, mapZoom, mapReady, showLoader,
    selectedSchool, schoolBoardFilter, city, fitTick, resetMapTick,
    pendingAreaKeyRef, initialViewportRef, resolveSignal,
    setFilters, setSelectedArea, setPanToArea, setMapReady, setMapZoom,
    setFitTick, setShowLoader, setSchoolBoardFilter, setSelectedSchool,
    handleCityChange, handleSchoolSelect, handleFiltersChange,
    handlePolygonDrawn, handlePolygonCleared,
    handleAreaClick, handleAreaSelect, handleAreaBack,
    page, setPage,
  } = useDiscoverPageState({ urlState, urlActions });

  // Issue #1064 AC2 — composed tick + Start Over handler (see startOverTick declaration above).
  const composedResetMapTick = resetMapTick + startOverTick;
  const handleStartOver = useCallback(() => {
    urlActions.startOver();
    setStartOverTick((t) => t + 1);
    // Issue #1142 — Start Over must also clear local state that mirrors URL
    // school/area context. Without these, a competing effect re-writes schoolId
    // and radiusKm via handleFiltersChange → setSchoolParams, leaving stale params
    // in the URL after Start Over.
    setSelectedSchool(null);
    setSelectedArea(null);
    setPanToArea(null);
    // Issue #1153 — clear ALL local filter state, not just school params.
    // The previous partial-delete left bedrooms/propertyTypes/etc in local state,
    // causing ActiveContextChips to keep rendering stale chips after Start Over.
    setFilters({});
    setSchoolBoardFilter([]);
    // Issue #1115 — reset bounded-search gate so the CTA reappears on next school select.
    setBoundedSearchTriggered(false);
  }, [urlActions, setSelectedSchool, setSelectedArea, setPanToArea, setFilters, setSchoolBoardFilter]);

  // Reset bbox when city changes — the previous city's viewport is out-of-bounds for the new city.
  useEffect(() => {
    setMapBbox(null);
  }, [city]);

  // Issue #1160 — increment schoolFocusTick when the selected school changes or when
  // radiusKm changes while a school is selected in the school-first journey.
  //
  // Guards:
  //   1. journey === 'school-first': area-first journey must not be affected.
  //   2. selectedSchool with lat/lon present: SchoolFocusPanner requires hydrated coords.
  //      This handles the hydration-race edge case — the tick is not incremented until
  //      the school object (with latitude/longitude) is actually available.
  //   3. Dependency array contains selectedSchool?.id and urlState.radiusKm so the
  //      effect fires once per school change and once per radius change — NOT on every
  //      map-move event. schoolFocusTick itself is NOT in the dep array (would loop).
  //
  // Feedback-loop safety: SchoolFocusPanner reads schoolFocusTick and uses a
  // handledTickRef guard to act at most once per increment. ViewportWatcher fires
  // reportViewport on moveend/zoomend, but that only updates URL viewport params —
  // it does NOT write to schoolFocusTick, so no loop can form.
  const selectedSchoolId = selectedSchool?.id;
  const selectedSchoolLat = selectedSchool?.latitude;
  const selectedSchoolLon = selectedSchool?.longitude;
  useEffect(() => {
    if (urlState.journey !== 'school-first') return;
    if (selectedSchoolLat == null || selectedSchoolLon == null) return;
    setSchoolFocusTick((t) => t + 1);
  }, [selectedSchoolId, urlState.radiusKm, urlState.journey, selectedSchoolLat, selectedSchoolLon]);

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

  const {
    areasLoading, listingDataLoading, markersLoading, isLoadingAreaListings,
    isFetching,
    discoverAreas, listingsWithCoords, filteredListings,
    markerListings, areaListings, areaMarkerListings,
    schoolRadiusListings, schoolRadiusListingsLoading, schoolRadiusHasMore,
    topLocalities, activeFocusBounds, trendsAreaKeys,
    cityCenter, cityZoom, schoolById, schoolByIdError, error,
    totalElements, totalPages,
    markersTruncated, markersReturnedElements, markersTotalFilteredElements,
    agriAreasData, isLoadingAgriAreas,
  } = useDiscoverMapData({
    city, selectedArea, filters: effectiveFilters, debouncedSearch,
    urlSchoolId: urlState.schoolId, isAuthenticated, fitTick,
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
    markersEnabled:
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
    page,
    bbox: mapBbox,
    journey: urlState.journey,
    // Issue #1494 — thread buy/rent intent as listingPurpose filter
    listingPurpose: intentListingPurpose,
  });

  // Debug: expose areaListings and related data to window.__debug for Playwright tests
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
        areaRestoreTick,
        cityRestoreTick,
      },
    };
  }, [areaListings, areaMarkerListings, markerListings, selectedArea, mapZoom, city, selectedSchool, schoolMarkerFocusTick, areaRestoreTick, cityRestoreTick]);

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

  // Issue #1157 Option (i) — the schools query must fire for the area-first
  // "add a school in this area" sub-step too, not only school-first. Without this
  // the area-first SchoolsInAreaPanel renders 0 schools even though school-first
  // shows the area's full set for the same areaKey. The school-first branch stays
  // FIRST and byte-identical; the area-first branch is gated on schoolPicking so the
  // query only runs while the sub-step is active.
  const schoolsAreaKey =
    urlState.journey === 'school-first'
      ? (urlState.areaKey ?? undefined)
      : urlState.journey === 'area-first' && urlState.schoolPicking
        ? (urlState.areaKey ?? undefined)
        : undefined;
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

  // Sync URL → local schoolBoardFilter (which drives the chip UI inside NearSchoolSheet).
  // The URL is the source of truth; local state mirrors it so chip-toggle UI reads the
  // active set without re-parsing the URL. Both arrays are compared via JSON to avoid an
  // infinite loop when the array identity changes but the contents are equal.
  const urlBoardKey = urlBoardFilters.join('|');
  useEffect(() => {
    if (schoolBoardFilter.join('|') !== urlBoardKey) {
      setSchoolBoardFilter(urlBoardFilters);
    }
    // urlBoardKey alone captures the contents; setSchoolBoardFilter is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlBoardKey]);

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

  // Handler: selecting a school by ID from either the map marker click (Path A) or the
  // right-panel school card click (Path B — SchoolsInAreaPanel).
  //
  // Issue #1109 root cause: previously both paths called only urlActions.setSchoolParams,
  // which set urlState.schoolId without touching filters.schoolLat/schoolLon/schoolRadiusKm.
  // That caused useDiscoverFilteredMarkers to immediately fire a refetch (markersEnabled
  // became true) with NO school coordinates, producing a settled-state response with
  // wrong/empty markers. The school coords were only applied later when useSchoolById
  // resolved asynchronously — too late to prevent the settled-state disappearance.
  //
  // Fix: look up the school in the already-loaded schools[] array and immediately set
  // selectedSchool + filters.schoolLat/Lon/RadiusKm in the same synchronous batch.
  // This ensures useDiscoverFilteredMarkers always fires with correct school params,
  // so both the intermediate and settled-state responses contain the proximity markers.
  const handleSelectSchoolById = useCallback(
    (schoolId: string) => {
      const radiusKm = DEFAULT_SCHOOL_RADIUS_KM;
      urlActions.setSchoolParams({ schoolId, radiusKm });
      // Look up the school from the already-loaded schools[] (from useSchoolsByArea).
      // schools is derived from schoolsQuery which is fetched before the user can click.
      const school = schools.find((s) => s.id === schoolId) ?? null;
      if (school) {
        setSelectedSchool(school);
        setFilters((prev) => ({
          ...prev,
          schoolLat: school.latitude,
          schoolLon: school.longitude,
          schoolRadiusKm: radiusKm,
        }));
        // Issue #1115 — new school selected; reset so the CTA reappears.
        // Must come AFTER the coord-sync batch above (#1109 regression guard).
        setBoundedSearchTriggered(false);
        return;
      }

      // Issue #1160 v3 Bug A1 — top-level school-first selection (no areaKey) means
      // useSchoolsByArea is disabled, so schools[] is empty and the lookup above fails.
      // Before falling through to the async useSchoolById restore path (which causes
      // delayed markers/no markers), check the React Query cache: if the useSchoolById
      // query has already resolved for this id (e.g. another mount, deep-link prefetch,
      // or a previous click in the same session), reuse it synchronously so the markers
      // query fires immediately with the school coordinates.
      // Key shape must match useSchoolSearch.ts (SCHOOL_BY_ID_KEY = ['school-by-id']).
      const cachedSchool = queryClient.getQueryData<SchoolResult>(['school-by-id', schoolId]);
      if (cachedSchool) {
        setSelectedSchool(cachedSchool);
        setFilters((prev) => ({
          ...prev,
          schoolLat: cachedSchool.latitude,
          schoolLon: cachedSchool.longitude,
          schoolRadiusKm: radiusKm,
        }));
        // Issue #1115 — reset after coord-sync (#1109 guard preserved).
        setBoundedSearchTriggered(false);
        return;
      }
      // If neither path resolves, fall through to the existing useSchoolById async
      // restore effect which will set state once the fetch resolves. The placeholderData
      // in useDiscoverFilteredMarkers bridges the visual gap.
      // Issue #1115 — reset on fall-through too (coords will be set by the async effect).
      setBoundedSearchTriggered(false);
    },
    [urlActions, schools, setSelectedSchool, setFilters, queryClient],
  );

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

  // Convert filteredListings (PropertyListing[]) to DiscoverCityListingItem[] for
  // SchoolSelectedPanel card list. filteredListings is the school-proximity-filtered
  // set when schoolLat/Lon/RadiusKm filters are active.
  //
  // Issue #1122 — anonymous school-first path: filteredListings is always [] for anon
  // users because useDiscoverListings / useDiscoverFilteredMarkers are auth-gated.
  // Fall back to areaListings (from the public /api/discover/cities/{city}/listings
  // endpoint) so SchoolSelectedPanel cards are populated with full listing data.
  // areaListings is already typed as DiscoverCityListingItem[] — no mapping needed.
  //
  // Issue #1175 v2 — schoolListings is declared BEFORE discoverBadge so its .length
  // can be passed as schoolListingsCount into deriveDiscoverBadge without a second scan.
  const schoolListings = useMemo(
    (): DiscoverCityListingItem[] => {
      if (!isAuthenticated) {
        const sLat = filters.schoolLat;
        const sLon = filters.schoolLon;
        // Issue #1210: clamp so a 0 km radius does not silently filter out every
        // listing; the anon path mirrors the auth haversine filter's clamp.
        const radius = filters.schoolRadiusKm != null ? clampSchoolRadiusKm(filters.schoolRadiusKm) : null;
        if (sLat != null && sLon != null && radius != null) {
          // Issue #1261 — anon school-radius now sources from the PUBLIC
          // /school-radius-listings endpoint (cross-area, server-side ST_DWithin),
          // replacing the old single-area haversine over areaListings. The radius
          // circle now matches the listing set across area boundaries.
          //
          // DECISION-1 (Option A): the active PropertyFilters are NOT sent to this
          // endpoint (it has no filter params), so apply them CLIENT-SIDE here for
          // parity with the auth path. Only filters whose backing fields exist in the
          // 20-field anon contract are honoured. reraRegistered and sellerTypes rely on
          // server-EXCLUDED fields (reraNumber/sellerType) and are intentionally NOT
          // applied — anon never sees those fields (AC6).
          return applyAnonPropertyFilters(schoolRadiusListings, filters);
        }
        // No active school radius — fall back to area-scoped public browse.
        return areaListings;
      }
      // Authenticated path: map proximity-filtered listings (unchanged behaviour).
      return filteredListings.map((l) => ({
        id: l.id,
        propertyType: l.property_type,
        title: l.title,
        locality: l.locality,
        pricePaise: l.price != null ? l.price * 100 : undefined,
        primaryImageUrl: l.images?.[0]?.url ?? null,
        listingPurpose: l.listing_purpose,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        builtArea: l.built_area,
        builtAreaUnit: l.built_area_unit,
        landArea: l.land_area,
        landAreaUnit: l.land_area_unit,
        totalFloors: l.total_floors,
        parkingCount: l.parking_count,
        furnishingStatus: l.furnishing_status,
        createdAt: l.created_at,
        trustTier: l.trustTier,
        lat: l.latitude,
        lon: l.longitude,
      }));
    },
    [isAuthenticated, areaListings, schoolRadiusListings, filteredListings, filters],
  );

  // Issue #1261 rev2 (AC11) — radius-filtered marker pins from the PUBLIC school-radius
  // endpoint for both auth and anon users. For anon: always the primary marker source
  // (auth marker endpoint is disabled). For auth: serves as marker fallback BEFORE the
  // #1115 bounded-search CTA is triggered (markersEnabled=false → schoolRadiusEnabled=true
  // in the hook, so schoolRadiusListings is populated). Once CTA fires, markersEnabled
  // becomes true, schoolRadiusEnabled becomes false, schoolRadiusListings drains, and the
  // IIFE below switches to the richer auth markerListings instead.
  // Derives from schoolRadiusListings (public endpoint, server-side ST_DWithin — genuinely
  // radius-filtered) rather than schoolListings (which for auth users = city-wide
  // filteredListings — NOT radius-filtered, wrong source for marker pins).
  const schoolRadiusFallbackMarkers = useMemo(
    () =>
      urlState.journey === 'school-first' && urlState.schoolId
        ? deriveAnonSchoolRadiusMarkers(schoolRadiusListings)
        : [],
    [urlState.journey, urlState.schoolId, schoolRadiusListings],
  );

  // Issue #1175 v3 — focusedGroup is needed by the badge before the group-map behaviour
  // block (line ~920) so it is declared here. It depends only on urlState.groupId and
  // areaGroupsData, both available at this point. The group-map block below re-reads the
  // same expression via focusedGroupAreas (derived from focusedGroup).
  const focusedGroup = urlState.groupId
    ? (areaGroupsData?.groups ?? []).find((g) => g.id === urlState.groupId) ?? null
    : null;

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
        searchQuery: debouncedSearch,
      }),
    // schoolListings.length is a number primitive — safe dep (no spurious identity changes).
    // schoolRadiusActive is derived from filters (already a dep), but listed explicitly for clarity.
    // listingDataLoading added for auth-path loading guard (Issue #1175 v2 corrective).
    // groupListingsCount: derived from focusedGroup + discoverAreas — listed as a primitive
    // (number | null | undefined) so it is safe to use directly as a dep.
    // debouncedSearch: keyword search — badge shows filtered count when active (Issue #1185).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedArea, filters, isLoadingAreaListings, listingDataLoading, isAuthenticated, schoolRadiusListingsLoading, cityTotal, areaListings, schoolRadiusActive, schoolListings.length, groupListingsCount, debouncedSearch],
  );

  // Issue #1160 GAP 1 — listingsReadyKey: a stable primitive string that changes only when
  // all three conditions are true simultaneously:
  //   1. a school is selected (selectedSchoolId non-null)
  //   2. the area listings query has settled (!isLoadingAreaListings — boolean, not array identity)
  //   3. at least one listing is within the school radius (schoolListings.length > 0 — a number)
  // When null, SchoolMarkerFocusPanner does not fire. schoolListings.length is a number
  // (primitive) so it does not cause spurious identity changes; only isLoadingAreaListings
  // is guarded to prevent the array-identity concern flagged in qa-fast risk (b).
  const listingsReadyKey = useMemo((): string | null => {
    if (selectedSchoolId == null) return null;
    if (isLoadingAreaListings) return null;
    if (schoolListings.length === 0) return null;
    return `${selectedSchoolId}_${urlState.radiusKm ?? 0}_ready`;
  }, [selectedSchoolId, isLoadingAreaListings, schoolListings.length, urlState.radiusKm]);

  // Increment schoolMarkerFocusTick when listingsReadyKey transitions to a NEW non-null value.
  // listingsReadyKey is null when listings are empty or query not settled → Phase-1 SchoolFocusPanner
  // still fires first (handles the school-center focus); this only fires when markers are present.
  //
  // Issue #1547 ITEM 6 FIX — bbox-refetch zoom-reset bug:
  // The original code incremented on every non-null dep-change. listingsReadyKey encodes
  // `${schoolId}_${radiusKm}_ready`, which is a CONSTANT for a given school+radius selection.
  // A user zoom-in triggers a bbox refetch → isLoadingAreaListings toggles true → false → the
  // listingsReadyKey transitions null→same-string again → the tick incremented → SchoolMarkerFocusPanner
  // re-fired fitBounds(maxZoom=13) and snapped the map back. Fix: track the last KEY that
  // caused an increment in a ref; only increment when the key is DIFFERENT from the last handled.
  // This means a new school selection (different schoolId or radiusKm → new key string) still
  // triggers a fresh fit, but a bbox-driven loading-toggle to the SAME key is a no-op.
  const lastFittedListingsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (listingsReadyKey == null) return;
    if (listingsReadyKey === lastFittedListingsKeyRef.current) return;
    lastFittedListingsKeyRef.current = listingsReadyKey;
    setSchoolMarkerFocusTick((t) => t + 1);
  }, [listingsReadyKey]);

  // Radius change handler for SchoolSelectedPanel — uses REPLACE (not PUSH) per AC1.
  const handleRadiusChange = useCallback(
    (newRadiusKm: number) => {
      if (!urlState.schoolId) return;
      // Issue #1210: clamp so a 0 km (or sub-minimum) request never reaches URL/state.
      const radiusKm = clampSchoolRadiusKm(newRadiusKm);
      urlActions.setSchoolParams({ schoolId: urlState.schoolId, radiusKm });
      setFilters((prev) => ({ ...prev, schoolRadiusKm: radiusKm }));
      // Issue #1115 — radius change re-gates the search; CTA must reappear so the user
      // explicitly triggers a new bounded search for the updated radius.
      setBoundedSearchTriggered(false);
    },
    [urlState.schoolId, urlActions, setFilters],
  );

  // Issue #1143 — in-page Back for school-first journey levels.
  //
  // Level 2 (school-selected): clears schoolId + radiusKm, preserves areaKey.
  //   clearSchoolSelection is REPLACE — does not add a history entry.
  //   Local school state mirrors are cleared to keep filters consistent.
  //
  // Level 1 (schools-in-area): clears areaKey, preserves journey.
  //   clearAreaSelection is REPLACE.
  //   Local selectedArea is cleared so the map re-centres to city level.
  //
  // Level 0 (school-browse): no Back — onBack undefined, PanelHeader hides button.
  const handleSchoolFirstBackLevel2 = useCallback(() => {
    // Issue #1160 GAP 2: if areaKey is set, increment areaRestoreTick so AreaRestorePanner
    // re-fits the map to the area bounds after the school context is cleared.
    // Read urlState.areaKey at call-time (stable closure — urlState is re-derived each render).
    // Do NOT increment from handleStartOver (Start Over uses composedResetMapTick instead).
    //
    // Issue #1160 v3 Bug B: when areaKey is null (top-level school-selected deep-link with
    // no area context), there is no area to restore to — instead fly back to city center
    // via CityRestorePanner.
    if (urlState.areaKey != null) {
      setAreaRestoreTick((t) => t + 1);
    } else {
      setCityRestoreTick((t) => t + 1);
    }
    urlActions.clearSchoolSelection();
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
  }, [urlState.areaKey, urlActions, setSelectedSchool, setFilters]);

  const handleSchoolFirstBackLevel1 = useCallback(() => {
    // Issue #1160 GAP 2: increment cityRestoreTick so CityRestorePanner re-flies
    // the map to city center/zoom after the area context is cleared.
    // Only fires in school-first journey (this handler is only called from schoolFirstOnBack).
    // Do NOT increment from handleStartOver.
    //
    // Issue #1485 — when returning from schools-in-area (Level 3) to school-group-areas
    // (Level 2), we clear areaKey but KEEP groupId. The existing cityRestoreTick increment
    // is correct: after clearing areaKey the group fitBounds effect (L1360-1396) will
    // re-trigger on the still-set groupId and fit to the group bounds.
    setCityRestoreTick((t) => t + 1);
    urlActions.clearAreaSelection();
    setSelectedArea(null);
    setPanToArea(null);
  }, [urlActions, setSelectedArea, setPanToArea]);

  // Issue #1485 — Level 0 Back for school-group-areas → school-browse.
  // Clears groupId (PUSH from selectGroup(null)); areaKey and schoolId are already absent
  // at this level. The cityRestoreTick increment returns the map to city-center view.
  const handleSchoolFirstBackLevel0 = useCallback(() => {
    setCityRestoreTick((t) => t + 1);
    urlActions.selectGroup(null);
  }, [urlActions]);

  // schoolFirstOnBack: the correct in-page Back handler for the current school-first
  // panel level, or undefined when Back should be hidden (Level 0/browse or non-school journey).
  //
  // Issue #1485 — 4-level ladder (new levels L0 + L1 added):
  //   L3 school-selected / area-school-combined → handleSchoolFirstBackLevel2 (clear schoolId)
  //   L2 schools-in-area                        → handleSchoolFirstBackLevel1 (clear areaKey, keep groupId)
  //   L1 school-group-areas                     → handleSchoolFirstBackLevel0 (clear groupId)
  //   L0 school-browse                          → undefined (no Back)
  const schoolFirstOnBack: (() => void) | undefined =
    urlState.journey !== 'school-first'
      ? undefined
      : panelContent === 'school-selected' || panelContent === 'area-school-combined'
        ? handleSchoolFirstBackLevel2
        : panelContent === 'schools-in-area'
          ? handleSchoolFirstBackLevel1
          : panelContent === 'school-group-areas'
            ? handleSchoolFirstBackLevel0
            : undefined;

  // Clear handlers for AreaSchoolCombinedPanel — stable references so the panel does
  // not re-render on every map pan/zoom that re-runs the MapDiscovery render.
  const onClearSchool = useCallback(() => {
    // Single atomic URL mutation: removes schoolId + radiusKm. Preserves areaKey,
    // journey, board/category filters. Local selectedSchool state and proximity
    // fields in PropertyFilters are cleared separately (no URL mutation).
    urlActions.clearSchoolContext();
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
  }, [urlActions, setSelectedSchool, setFilters]);

  const onClearArea = useCallback(() => {
    // Removes areaKey from URL (REPLACE). Preserves schoolId, radiusKm,
    // board/category filters, property filters, and viewport.
    urlActions.clearAreaContext();
    setSelectedArea(null);
  }, [urlActions, setSelectedArea]);

  // Issue #1157 rev-5 DEFECT A — gate for mounting the school-marker layer.
  // school-first keeps markers (first OR term, value unchanged → byte-for-byte
  // identical school-first rendering). Additionally surface markers in the
  // area-first school-picking sub-step (schoolPicking) and in area-school-combined
  // (area-first + areaKey + schoolId), so the area-first flow shows both school
  // CARDS and map MARKERS. Reuses the schools[] already passed to PropertyMap —
  // no extra fetch.
  const showSchoolMarkers =
    urlState.journey === 'school-first' ||
    !!urlState.schoolPicking ||
    (urlState.journey === 'area-first' && !!urlState.areaKey && !!urlState.schoolId);

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

  // School restore on cold-load — runs once schoolById resolves (exact ID lookup, not substring search).
  const urlSchoolId = urlState.schoolId;
  const urlRadiusKm = urlState.radiusKm;

  // Keep urlActions in a ref so the cleanup effect below doesn't need it in its dep array,
  // avoiding a potential stale-closure/infinite-loop when the actions object identity changes.
  const urlActionsRef = useRef(urlActions);
  urlActionsRef.current = urlActions;

  useEffect(() => {
    // Issue #1160 v5 — outer guard change: fire when selectedSchool is missing OR when
    // filters.schoolLat is not yet set. The original `!selectedSchool` guard was too
    // strict: in the top-level cold-cache path, handleSelectSchoolById falls through
    // without setting selectedSchool or filters.schoolLat. If selectedSchool was
    // subsequently set by another path (e.g. a prior in-session selection that was not
    // fully cleared) while filters.schoolLat remained null, the !selectedSchool guard
    // would skip the entire effect body — markersEnabled stays false permanently because
    // markersEnabled requires filters.schoolLat != null.
    // Fix: also enter the body when filters.schoolLat is not yet synced, regardless of
    // selectedSchool state. The inner dedup guard below prevents redundant setFilters
    // calls when coords are already in sync.
    if (urlSchoolId && schoolById && (!selectedSchool || filters.schoolLat == null)) {
      // Dedup guard: when coords are already in sync (e.g. Bug A1 sync injection already
      // applied them), skip redundant setFilters to avoid an extra render. Still ensure
      // selectedSchool is set so downstream effects (SchoolFocusPanner, panel routing)
      // observe a non-null school.
      if (filters.schoolLat === schoolById.latitude && filters.schoolLon === schoolById.longitude) {
        if (!selectedSchool) setSelectedSchool(schoolById);
        return;
      }
      // Issue #1210: clamp on cold-load/restore so a `?radiusKm=0` deep-link (or a 0
      // reintroduced by browser Back) never lands in runtime state as 0.
      const radius = urlRadiusKm != null ? clampSchoolRadiusKm(urlRadiusKm) : DEFAULT_SCHOOL_RADIUS_KM;
      setSelectedSchool(schoolById);
      setFilters((prev) => ({ ...prev, schoolLat: schoolById.latitude, schoolLon: schoolById.longitude, schoolRadiusKm: radius }));
      // Issue #1146 — AC4: When radiusKm was absent from the URL (hand-crafted link,
      // old app version), backfill the default into the URL so it becomes honest.
      // Issue #1210: also rewrite when the URL carried a sub-minimum value (e.g. 0) so
      // the address bar reflects the clamped effective radius after restore.
      // Uses replace:true — this is housekeeping on cold-load mount, not a user
      // navigation event. A push here would create a phantom history entry that
      // breaks browser Back (Issue #1146 cycle-2 blocking fix / BN-4 contract).
      // Note: urlSchoolId is guaranteed non-null by the outer if-block; the
      // redundant `&& urlSchoolId` guard that was here has been removed.
      if (urlRadiusKm == null || urlRadiusKm !== radius) {
        urlActionsRef.current.setSchoolParams({ schoolId: urlSchoolId, radiusKm: radius }, { replace: true });
      }
    }
    // filters.schoolLat/schoolLon are read inside the guard above to detect prior sync injection,
    // so they belong in the dep array. selectedSchool is already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSchoolId, urlRadiusKm, schoolById, selectedSchool, filters.schoolLat, filters.schoolLon, setSelectedSchool, setFilters]);

  // Error cleanup — if the school lookup fails, clear the URL param and inform the user.
  // 404: silently drop (school no longer exists, no need to alarm the user).
  // Non-404 ApiError or network error (TypeError): clear param + show recoverable toast so the
  // user knows what happened and can search again.
  useEffect(() => {
    if (!urlSchoolId || !schoolByIdError) return;
    // Issue #1115 — school lookup failed; reset so CTA reappears on next school select.
    setBoundedSearchTriggered(false);
    if (schoolByIdError instanceof ApiError && schoolByIdError.status === 404) {
      urlActionsRef.current.setSchoolParams(null);
    } else {
      // Non-404 server errors and network failures (TypeError from fetch rejection).
      urlActionsRef.current.setSchoolParams(null);
      toast({
        title: 'School details unavailable',
        description: 'Could not load the selected school. Please search again.',
        variant: 'destructive',
      });
    }
  }, [urlSchoolId, schoolByIdError, toast]);

  // Refs kept current every render so the resolution effect can read them without
  // adding unstable objects to its dep array.
  const cityRef = useRef(city);
  cityRef.current = city;
  const urlCityRef = useRef(urlState.city ?? city);
  urlCityRef.current = urlState.city ?? city;

  // Deferred areaKey hydration — resolve once area data loads (Rule 2).
  // Lives here because it references refs from useDiscoverPageState AND data from useDiscoverMapData.
  const { deselectArea } = urlActions;
  useEffect(() => {
    if (areasLoading) return;
    const pending = pendingAreaKeyRef.current;
    if (!pending) return;
    pendingAreaKeyRef.current = null;
    const match = discoverAreas.find((a) => a.areaKey === pending);
    if (match) {
      setSelectedArea(match);
      if (!initialViewportRef.current) setPanToArea(match);
    } else if (cityRef.current !== urlCityRef.current) {
      // Local city (drives the areas query) hasn't synced with the URL city yet —
      // discoverAreas may be stale. Re-arm and wait for the re-fetch to complete.
      pendingAreaKeyRef.current = pending;
    } else {
      deselectArea();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areasLoading, discoverAreas, deselectArea, resolveSignal]);

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

  // Effect: when groupId changes and there is no areaKey, fitBounds to the group members.
  // When areaKey is set, the area-level fitBounds (existing logic) takes precedence.
  // When areaKey clears while groupId remains (user navigates back), re-trigger group bounds.
  const prevGroupIdRef = useRef<string | null>(null);
  const prevAreaKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Guard: wait for area data before computing bounds.
    // This must run BEFORE updating refs — on cold load with ?groupId= the effect fires
    // while areasLoading=true, and if refs were updated here the transition check would
    // see groupChanged=false on the second fire (when data has loaded) and skip fitBounds.
    if (!urlState.groupId) return;
    if (areasLoading) return;

    // Now that data is ready, compare against the previous stable values and advance refs.
    const groupChanged = urlState.groupId !== prevGroupIdRef.current;
    const areaKeyCleared =
      prevAreaKeyRef.current !== null && urlState.areaKey === null;

    prevGroupIdRef.current = urlState.groupId;
    prevAreaKeyRef.current = urlState.areaKey;

    // Only act when no area is selected
    if (urlState.areaKey !== null) return;
    // Act on group change OR when areaKey was just cleared (back navigation)
    if (!groupChanged && !areaKeyCleared) return;

    // Resolve member areas — filter discoverAreas to the group's area_keys.
    // Areas not in discoverAreas (partial membership) are silently dropped.
    const groupAreaKeys = focusedGroup?.area_keys ?? [];
    const memberAreas = discoverAreas.filter((a) => groupAreaKeys.includes(a.areaKey));
    const bounds = computeGroupBounds(memberAreas);
    if (bounds) {
      setPanToArea(bounds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.groupId, urlState.areaKey, areasLoading, discoverAreas, areaGroupsData]);

  // Issue #1410 (B3) — viewport-fit when agri group listings arrive.
  // Uses a state variable fed into PropertyMap's focusBounds so it's consistent with how
  // all other fitBounds effects work in this page (no direct mapRef access).
  const [agriGroupFocusBounds, setAgriGroupFocusBounds] = useState<[[number, number], [number, number]] | null>(null);

  useEffect(() => {
    // Issue #1429/#1447 — use selectedRegion + selectedMaxKm (corridor-first cumulative model)
    if (!selectedRegion || selectedMaxKm == null) {
      setAgriGroupFocusBounds(null);
      return;
    }

    // Issue #1480 — when a locality/town is selected, frame only that town's listings.
    // Locality branch takes priority over corridor framing; early-return prevents overwrite.
    const selectedLocality = urlState.selectedLocality ?? null;
    if (selectedLocality) {
      const localityListings = (agriMapListingsData?.listings ?? []).filter(
        (l) =>
          l.latitude != null &&
          l.longitude != null &&
          (l.locality ?? l.areaKey) === selectedLocality,
      );
      if (localityListings.length > 0) {
        const lats = localityListings.map((l) => l.latitude as number);
        const lons = localityListings.map((l) => l.longitude as number);
        setAgriGroupFocusBounds([
          [Math.min(...lats), Math.min(...lons)],
          [Math.max(...lats), Math.max(...lons)],
        ]);
      } else {
        // Locality matched no listings with valid coords — fall back to sector framing.
        const sectorBounds = cityCenter
          ? getSectorBounds(cityCenter[0], cityCenter[1], selectedRegion, selectedMaxKm)
          : null;
        setAgriGroupFocusBounds(sectorBounds);
      }
      return;
    }

    // Issue #1447 — include sector geometry in map fit so the directional cone is
    // always fully framed, even when listings are sparse or clustered near the centroid.
    const sectorBounds = cityCenter
      ? getSectorBounds(cityCenter[0], cityCenter[1], selectedRegion, selectedMaxKm)
      : null;

    // Filter out listings with null/undefined lat/lon before spreading into Math.min/max.
    // AgriMapListingItem declares latitude/longitude as number, but the server can return null
    // when the DB column is null; Math.min/max(undefined) = NaN which corrupts Leaflet fitBounds.
    const validListings = (agriMapListingsData?.listings ?? []).filter(
      l => l.latitude != null && l.longitude != null
    );

    let listingBounds: [[number, number], [number, number]] | null = null;
    if (validListings.length) {
      const lats = validListings.map(l => l.latitude as number);
      const lons = validListings.map(l => l.longitude as number);
      listingBounds = [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ];
    }

    if (!sectorBounds && !listingBounds) {
      setAgriGroupFocusBounds(null);
      return;
    }

    if (!sectorBounds) {
      // cityCenter unavailable (unknown city slug) — fall back to listing-only bounds
      setAgriGroupFocusBounds(listingBounds);
      return;
    }

    if (!listingBounds) {
      // No valid listings — frame the sector cone alone
      setAgriGroupFocusBounds(sectorBounds);
      return;
    }

    // Union: expand to contain both the sector geometry and visible listings
    setAgriGroupFocusBounds([
      [Math.min(sectorBounds[0][0], listingBounds[0][0]), Math.min(sectorBounds[0][1], listingBounds[0][1])],
      [Math.max(sectorBounds[1][0], listingBounds[1][0]), Math.max(sectorBounds[1][1], listingBounds[1][1])],
    ]);
  }, [selectedRegion, selectedMaxKm, agriMapListingsData, cityCenter, urlState.selectedLocality]);

  // Issue #1115 — wrap handleSchoolSelect (from useDiscoverPageState, forbidden to edit)
  // so that selecting a school via MapFilters or NearSchoolSheet also resets the
  // bounded-search gate. useDiscoverPageState.ts is not modified; reset is composed here
  // at the call-site where the handler is passed down.
  // useCallback is declared before the isCityValid early return (React hooks must always
  // be called on every render path). It closes over stable references only:
  // handleSchoolSelect never changes identity; setBoundedSearchTriggered is a stable setter.
  const wrappedHandleSchoolSelect = useCallback<typeof handleSchoolSelect>((school) => {
    setBoundedSearchTriggered(false);
    handleSchoolSelect(school);
  }, [handleSchoolSelect, setBoundedSearchTriggered]);

  // Issue #1115 — stable callback for the bounded-search CTA. Declared before the early
  // return so useCallback is called unconditionally (Rules of Hooks). The undefined branch
  // for anon users is applied at the JSX call-site, not here.
  const handleBoundedSearch = useCallback(() => {
    setBoundedSearchTriggered(true);
  }, [setBoundedSearchTriggered]);

  // activeContextChips is memoised so its identity only changes when a relevant
  // dimension actually changes — prevents unnecessary re-renders of DiscoverRightPanel.
  // Hoisted above the isCityValid early return to satisfy Rules of Hooks.
  const activeContextChips = useMemo(
    () => (
      <ActiveContextChips
        selectedArea={selectedArea}
        selectedSchool={selectedSchool}
        radiusKm={urlState.radiusKm}
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
        }}
        onClearArea={handleAreaBack}
        onClearSchool={onClearSchool}
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
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedArea, selectedSchool, urlState.radiusKm, urlState.q, urlState.filters.boardFilters, urlState.filters.categoryFilters, filters, urlActions, handleAreaBack],
  );

  // Memoize initialCenter to prevent URLViewportController effect re-runs on every parent render.
  // Hoisted above the isCityValid early return to satisfy Rules of Hooks.
  const memoizedInitialCenter = useMemo(
    () => urlState.viewport ? [urlState.viewport.lat, urlState.viewport.lon] as [number, number] : undefined,
    [urlState.viewport?.lat, urlState.viewport?.lon],
  );

  // Issue #1160 GAP 2 — derive area coordinates for AreaRestorePanner.
  // Re-derived from discoverAreas at render time (not captured at click time) so the
  // panner always has fresh coords. If discoverAreas hasn't loaded yet, the panner
  // receives null values and skips the restore (no crash).
  // Hoisted above the isCityValid early return to satisfy Rules of Hooks.
  const areaRestoreArea = useMemo(() => {
    if (!urlState.areaKey) return null;
    return discoverAreas.find((a) => a.areaKey === urlState.areaKey) ?? null;
  }, [urlState.areaKey, discoverAreas]);

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

  if (!isCityValid) return <CityNotSupported city={city} />;

  const trendsHref = selectedArea
    ? `/trends?city=${city}&areaKey=${encodeURIComponent(selectedArea.areaKey)}`
    : undefined;

  const filtersContent = (
    <MapFilters
      filters={filters} onFiltersChange={handleFiltersChange}
      selectedSchool={selectedSchool} onSchoolSelect={wrappedHandleSchoolSelect}
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

  // Selected-school radius map overlays (full journey breadcrumb + radius legend) only render
  // when a school is selected AND the panel is school-selected/area-school-combined.
  const schoolRadiusOverlay = isSchoolRadiusOverlayState(resolvedPanelContent, !!selectedSchool);

  return (
    <AppLayout>
      <div className="h-[calc(100vh-3.5rem)] flex flex-col lg:flex-row relative">
        <div className="lg:w-1/2 h-64 lg:h-full relative order-1 lg:order-1">
          {showLoader && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading map...</p>
              </div>
            </div>
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
              listings={(() => {
                if (mapZoom <= AREA_LAYER_MAX_ZOOM) return [];
                // school-first journey
                if (urlState.journey === 'school-first') {
                  // schoolId set: proximity markerListings drive the school-radius surface.
                  // Issue #1118: before school selection, markersEnabled was false so
                  // placeholderData has no previous data. Keep area markers visible until
                  // the school-proximity query settles to avoid a blank-map flash.
                  if (urlState.schoolId) {
                    // Issue #1261 rev2 (AC11+AC12) — three-tier marker priority for school-radius:
                    //
                    // Tier 1: richer auth markers (markersEnabled=true, CTA triggered, query resolved).
                    if (markerListings.length > 0) return markerListings;
                    //
                    // Tier 2: school-radius fallback markers (both auth+anon). schoolRadiusFallbackMarkers
                    // derives from schoolRadiusListings (public endpoint, server-side ST_DWithin —
                    // genuinely radius-filtered). For anon: always active (auth endpoint disabled).
                    // For auth: active before CTA (schoolRadiusEnabled=!markersEnabled=true in the hook);
                    // drains automatically once markersEnabled flips true (auth query fires).
                    // This satisfies the product truth: markers visible for ALL users regardless of auth.
                    if (schoolRadiusFallbackMarkers.length > 0) return schoolRadiusFallbackMarkers;
                    //
                    // Tier 3: area-scoped markers while the auth proximity query is in-flight
                    // (markersLoading=true after CTA, before the first /api/discover/markers response).
                    if (markersLoading && selectedArea && areaMarkerListings.length > 0) {
                      return areaMarkerListings;
                    }
                    return [];
                  }
                  // Issue #1074 Slice A: school-first + areaKey (no schoolId) → surface
                  // the area's property markers alongside the schools list. Mirrors the
                  // area-first fallback below.
                  if (selectedArea) {
                    return isLoadingAreaListings
                      ? []
                      : (areaMarkerListings.length > 0 ? areaMarkerListings : markerListings);
                  }
                  return [];
                }
                // area-first or area-selected: show property markers for the selected area
                // Works for both explicit area-first journey AND implicit area selection
                if (selectedArea) {
                  return isLoadingAreaListings ? [] : (areaMarkerListings.length > 0 ? areaMarkerListings : markerListings);
                }
                // No area selected: show markers only if authenticated
                return isAuthenticated ? markerListings : [];
              })()}
              focusBounds={agriGroupFocusBounds ?? activeFocusBounds}
              agriGroupListings={(selectedRegion && selectedMaxKm != null) ? filteredAgriListings : null}
              polygon={filters.polygon}
              onPolygonDrawn={handlePolygonDrawn}
              onPolygonCleared={handlePolygonCleared}
              schoolCircle={selectedSchool ? {
                lat: selectedSchool.latitude, lon: selectedSchool.longitude,
                // Issue #1210: clamp so the drawn circle reflects the effective (>=1 km) radius.
                radiusKm: clampSchoolRadiusKm(filters.schoolRadiusKm ?? DEFAULT_SCHOOL_RADIUS_KM), name: selectedSchool.name,
              } : undefined}
              initialCenter={memoizedInitialCenter}
              initialZoom={urlState.viewport?.zoom}
              cityCenter={cityCenter}
              cityZoom={cityZoom}
              areas={mapZoom <= AREA_LAYER_MAX_ZOOM && !isAgriJourney ? discoverAreas : []}
              onAreaClick={handleAreaClick}
              focusedGroupAreas={mapZoom <= AREA_LAYER_MAX_ZOOM ? focusedGroupAreas : undefined}
              onZoomChange={setMapZoom}
              onViewportChange={urlActions.reportViewport}
              onBoundsChange={handleBoundsChange}
              panToArea={panToArea}
              resetMapTick={composedResetMapTick}
              onReady={() => setMapReady(true)}
              journey={urlState.journey}
              selectedSchool={selectedSchool}
              schools={schools}
              showSchoolMarkers={showSchoolMarkers}
              onSelectSchool={handleSelectSchoolById}
              schoolsIsLoading={schoolsQuery.isLoading}
              schoolsIsError={schoolsQuery.isError}
              schoolsError={schoolsQuery.error}
              schoolFocusTick={schoolFocusTick}
              schoolFocusLat={selectedSchoolLat}
              schoolFocusLon={selectedSchoolLon}
              schoolFocusRadiusKm={(() => {
                // Issue #1210: clamp so the auto-zoom fits the effective (>=1 km) circle.
                const r = urlState.radiusKm ?? filters.schoolRadiusKm;
                return r != null ? clampSchoolRadiusKm(r) : r;
              })()}
              schoolMarkerFocusTick={schoolMarkerFocusTick}
              schoolMarkerPositions={schoolMarkerPositions}
              areaRestoreTick={areaRestoreTick}
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
              cityRestoreTick={cityRestoreTick}
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
              selectedListingId={urlState.selectedListing}
              hoveredListingId={hoveredListingId}
            />
          )}

          {/* Top-left context overlay. For the selected-school radius state, show the full
              resolved journey breadcrumb (City › Zone › Area › School); otherwise the generic
              area indicator. Rendering one OR the other avoids a duplicate breadcrumb. */}
          <div className="absolute top-4 left-4 z-[1000]">
            {schoolRadiusOverlay ? (
              <SchoolJourneyBreadcrumb
                cityLabel={CITY_CONFIG[city]?.label ?? city}
                zoneLabel={focusedGroup?.name ?? prettifyZoneSlug(urlState.groupId)}
                areaLabel={selectedArea?.areaLabel ?? null}
                schoolName={selectedSchool?.name ?? null}
              />
            ) : (
              <AreaIndicatorOverlay
                cityLabel={CITY_CONFIG[city]?.label ?? city}
                focusedGroup={focusedGroup}
                selectedArea={selectedArea}
              />
            )}
          </div>

          {/* Radius legend — bottom-left, raised above the Leaflet zoom control (bottomleft).
              Only the selected-school radius state; swatches match the real map markers/ring. */}
          {schoolRadiusOverlay && (
            <div className="absolute bottom-24 left-4 z-[1000]">
              <SchoolRadiusLegend
                radiusKm={clampSchoolRadiusKm(filters.schoolRadiusKm ?? DEFAULT_SCHOOL_RADIUS_KM)}
              />
            </div>
          )}

          {/* City select — top-right */}
          <div className="absolute top-4 right-4 z-[1000] w-44">
            <CitySelect value={city} onChange={handleCityChange} className="bg-card shadow-sm" />
          </div>

          {/* "Near a school" quick-filter button removed (Figma polish) — the school
              journey is reachable via the "Search by school area" card in the right panel.
              NearSchoolSheet stays mounted below but is no longer triggered from here. */}

          {/* City / area listing count — bottom-right (Issue #1152) */}
          {discoverBadge.visible && discoverBadge.count != null && (
            <div className="absolute bottom-16 right-4 z-[1000]" data-testid="discover-badge">
              <div className="bg-card/95 rounded-lg px-4 py-2 shadow-sm text-sm border border-border">
                Showing{' '}
                <strong>{discoverBadge.count.toLocaleString()}</strong>
                {' '}properties
              </div>
            </div>
          )}

          {/* Issue #1261 — non-blocking "showing first N" hint for the anonymous
              school-radius result. The public endpoint returns a single page (size=50)
              with no total count; hasMore signals more listings exist beyond it.
              DECISION-2: no load-more UI in this slice — only this advisory hint.
              FINDING 1: hasMore reflects the UNFILTERED server probe but the shown
              count is post-filter; when any client-side PropertyFilter is active the
              extra server rows may not match, so suppress the hint to avoid promising
              more *matching* homes than exist (AC8 truthfulness). */}
          {!isAuthenticated &&
            schoolRadiusActive &&
            schoolRadiusHasMore &&
            !hasActiveAnonPropertyFilter(filters) && (
            <div className="absolute bottom-28 right-4 z-[1000]" data-testid="school-radius-more-hint">
              <div
                className="bg-card/95 rounded-lg px-4 py-2 shadow-sm text-xs text-muted-foreground border border-border max-w-[16rem]"
                aria-live="polite"
              >
                Showing the first {schoolListings.length} homes near this school. Zoom or refine your search to narrow results.
              </div>
            </div>
          )}

          {isAuthenticated && (filters.polygon || !!selectedSchool) && (
            <MapStatsBar
              filters={filters} selectedSchool={selectedSchool}
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
            hasAreaSelected={!!selectedArea}
            areaLayerMaxZoom={AREA_LAYER_MAX_ZOOM}
          />
        </div>

        <DiscoverRightPanel
          panelContent={resolvedPanelContent}
          selectedMarkerListing={selectedMarkerListing}
          onClearAgriSelection={() => setSelectedMarkerListing(null)}
          city={city}
          journey={urlState.journey}
          activeContextChips={activeContextChips}
          areas={discoverAreas}
          selectedArea={selectedArea}
          areaListings={areaListings}
          isLoadingListings={isLoadingAreaListings}
          isAuthenticated={isAuthenticated}
          onAreaSelect={handleAreaSelect}
          // schoolFirstOnBack is undefined when panelContent is not 'school-browse' or
          // 'school-selected' (i.e. Level 0), so Back correctly hides at Level 0.
          // 'school-selected' panelContent is only reachable in the school-first journey.
          onBack={urlState.journey === 'school-first' ? schoolFirstOnBack : handleAreaFirstBack}
          onStartOver={handleStartOver}
          isLoadingAreas={areasLoading}
          agriAreasData={agriAreasData}
          isLoadingAgriAreas={isLoadingAgriAreas}
          urlAreaKey={urlState.areaKey}
          onSelectJourney={(j) => urlActions.setJourney(j)}
          areaGroups={areaGroupsData?.groups ?? []}
          isLoadingAreaGroups={isLoadingAreaGroups}
          // Issue #1178 — forward the active groupId so AreaGroupsLandingPanel can
          // highlight the deep-linked group card / show a non-alarming notice when
          // the groupId matches no loaded group. Prop wiring only — no routing change.
          groupId={urlState.groupId ?? null}
          onSelectGroup={(groupId) => urlActions.selectGroup(groupId)}
          // Issue #1483 — clear groupId to return from Level-2 area list to Level-1 group cards.
          // Issue #1485 — same callback also used by school-first: school-group-areas → school-browse.
          onClearGroup={() => urlActions.selectGroup(null)}
          // Issue #1485 — forward area-groups loading state separately for school-first zone cards
          // so school-browse can show skeletons without coupling to the area-first isLoadingAreaGroups.
          isLoadingAreaGroupsForSchool={isLoadingAreaGroups}
          // Issue #1429 — agri-first corridor groups (cumulative corridor model)
          corridorGroups={corridorGroups}
          isLoadingRegionalGroups={isLoadingRegionalAreaGroups}
          // Issue #1453 — surface fetch error so CorridorLandingPanel can show error+retry UI.
          isRegionalGroupsError={isRegionalAreaGroupsError}
          onRetryRegionalGroups={refetchRegionalAreaGroups}
          selectedRegion={selectedRegion}
          selectedMaxKm={selectedMaxKm}
          onSetRegion={(dir) => urlActions.setRegion(dir)}
          onSetRegionWithMaxKm={(dir, km) => urlActions.setRegionWithMaxKm(dir, km)}
          onSetMaxKm={(km) => urlActions.setMaxKm(km)}
          onClearRegionAndMaxKm={() => urlActions.clearRegionAndMaxKm()}
          // Issue #1425 — agri-group-selected panel data
          // Issue #1457 — pass filteredAgriListings (client-side filtered) instead of raw
          agriGroupListings={filteredAgriListings}
          // Issue #1460 — thread truncated/limit from useAgriMapListings to surface the cap notice.
          agriGroupTruncated={agriMapListingsData?.truncated ?? false}
          agriGroupListingsLimit={agriMapListingsData?.limit}
          isLoadingAgriGroupListings={isLoadingAgriGroupListings}
          isAgriGroupListingsError={isAgriGroupListingsError}
          agriGroupLabel={agriGroupLabel}
          onRetryAgriGroupListings={refetchAgriGroupListings}
          onClearRegionalGroup={() => urlActions.clearRegionAndMaxKm()}
          discoverAreas={discoverAreasForPanel}
          onSelectAreaKey={(areaKey) => {
            // Issue #1067 R2 — right-panel area-card click must trigger map flyTo
            // in addition to updating the URL. The deferred-hydration effect at
            // lines 312-329 only fires on cold-load (initialViewportRef gate), so
            // in-session selections never panned without this branch. Routing
            // through handleAreaSelect reuses the canonical AreaPoint handler
            // (URL update + setPanToArea + filter reset) — single source of truth.
            // Issue #1489 — discoverAreas (AreaPoint[]) from useDiscoverMapData is
            // intentionally kept here (not discoverAreasForPanel) because
            // handleAreaSelect needs AreaPoint for setSelectedArea / setPanToArea
            // (geo fit-bounds). discoverAreasForPanel passes to the panel for display.
            const match = discoverAreas.find((a) => a.areaKey === areaKey);
            if (match) {
              handleAreaSelect(match);
            } else {
              urlActions.selectArea(areaKey);
            }
          }}
          onSelectSchool={handleSelectSchoolById}
          onAddSchool={urlActions.enterSchoolPicking}
          filtersContent={filtersContent}
          trendsHref={trendsHref}
          isFetching={isFetching}
          isInitialLoading={isLoading}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          selectedSchool={selectedSchool}
          schools={schools}
          schoolsLoading={schoolsQuery.isLoading}
          // Issue #1198 — wire the dormant #1144/#1170 schools-in-area error/retry channel.
          // These are the EXISTING useSchoolsByArea signals (same query that already feeds
          // PropertyMap's schoolsIsError/schoolsError); no new query/effect/config is added.
          schoolsError={schoolsQuery.isError}
          onSchoolsRetry={schoolsQuery.refetch}
          schoolsFetching={schoolsQuery.isFetching}
          schoolListings={schoolListings}
          schoolListingsLoading={listingDataLoading}
          radiusKm={urlState.radiusKm}
          onRadiusChange={handleRadiusChange}
          onClearSchool={onClearSchool}
          onClearArea={onClearArea}
          // Issue #1115 — bounded-search CTA wiring.
          onBoundedSearch={isAuthenticated ? handleBoundedSearch : undefined}
          boundedSearchTriggered={boundedSearchTriggered}
          // Issue #1547 — shared card↔marker selection (URL/parent-derived via the
          // `listing` param). selectedListingId drives the copper selected card frame +
          // scroll-into-view. The selection DRIVER is the map marker (marker→URL, see
          // handleSelectMarkerListing); the residential card's primary action is
          // navigation, so onSelectResultListing is intentionally left unwired to avoid
          // a redundant history PUSH right before navigate.
          selectedListingId={urlState.selectedListing}
          // Issue #1547 — ephemeral hover/focus signal for card→marker highlight.
          // hoveredListingId is ephemeral useState (NOT URL); resets to null on mouseleave/blur
          // and naturally on journey switch. School-first NOT wired (RISK-3 unsafe tier sources).
          onHoverResultListing={setHoveredListingId}
          // Issue #1430 — agri-group listing peek wiring.
          onSelectAgriGroupListing={(id) => urlActions.setSelectedListing(id)}
          selectedGroupListingItem={selectedGroupListingItem}
          onCloseGroupPeek={() => urlActions.clearSelectedListing()}
          onViewGroupListingDetails={(id) => navigate(`/listing/${id}`)}
          // Issue #1464 — agri-group-locality drill-down wiring.
          selectedLocality={urlState.selectedLocality ?? null}
          onSetLocality={(locality) => urlActions.setLocality(locality)}
          onClearLocality={() => urlActions.clearLocality()}
          // Issue #1457 — agri filter props
          agriAcresMin={urlState.filters.agriAcresMin}
          agriAcresMax={urlState.filters.agriAcresMax}
          agriPriceMin={urlState.filters.agriPriceMin}
          agriPriceMax={urlState.filters.agriPriceMax}
          // Issue #1458 — agri categorical/boolean filter props
          agriLandCategory={urlState.filters.agriLandCategory ?? null}
          agriFarmhouseAvailable={urlState.filters.agriFarmhouseAvailable ?? null}
          agriFencingDone={urlState.filters.agriFencingDone ?? null}
          agriWaterSource={urlState.filters.agriWaterSource ?? null}
          onApplyAgriFilters={(filterValues) =>
            urlActions.setFiltersCommitted({
              ...urlState.filters,
              ...filterValues,
              // Belt-and-suspenders: never write price params for anon users even if UI bypassed
              agriPriceMin: isAuthenticated ? filterValues.agriPriceMin : undefined,
              agriPriceMax: isAuthenticated ? filterValues.agriPriceMax : undefined,
              // Issue #1458 — categorical/boolean filters pass through as-is (no auth gate)
              agriLandCategory: filterValues.agriLandCategory ?? null,
              agriFarmhouseAvailable: filterValues.agriFarmhouseAvailable ?? null,
              agriFencingDone: filterValues.agriFencingDone ?? null,
              agriWaterSource: filterValues.agriWaterSource ?? null,
            })
          }
          onClearAgriFilters={() => urlActions.clearAgriFilters()}
          // Issue #1494 — buy/rent intent selector
          intent={urlState.intent}
          onIntentChange={(newIntent) => urlActions.setIntent(newIntent)}
          footerContent={isAuthenticated && !selectedArea && totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-border bg-card shrink-0">
              <Button
                variant="outline" size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                {page + 1} / {totalPages} · {totalElements.toLocaleString()} listings
              </span>
              <Button
                variant="outline" size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          ) : null}
        />
      </div>
      {/* NearSchoolSheet — not mounted in the agri-first journey (MVP2): structurally
          prevents the sheet (which calls setSchoolJourney on select) from flipping
          agri-first to school-first. */}
      {!isAgriJourney && (
        <NearSchoolSheet
          open={nearSchoolOpen}
          onOpenChange={setNearSchoolOpen}
          selectedSchool={selectedSchool}
          onSchoolSelect={wrappedHandleSchoolSelect}
          radiusKm={filters.schoolRadiusKm ?? DEFAULT_SCHOOL_RADIUS_KM}
          onRadiusChange={(km) => handleFiltersChange({ ...filters, schoolRadiusKm: km })}
          boardFilter={schoolBoardFilter}
          onBoardFilterChange={handleBoardFilterChange}
          city={isCityValid ? city : null}
        />
      )}
    </AppLayout>
  );
}
