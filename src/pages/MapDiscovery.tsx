import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { PublicDiscoverLayout } from '@/components/layout/PublicDiscoverLayout';
import { MapAreaLegend } from '@/components/discover/MapAreaLegend';
import { MapRegionOverviewLegend } from '@/components/discover/MapRegionOverviewLegend';
import { RegionGuidanceCard, type RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';
import { MapAgriLegend } from '@/components/discover/MapAgriLegend';
import { MapSchoolLegend, type SchoolLegendStage } from '@/components/discover/MapSchoolLegend';
import { MapMarkerLegend } from '@/components/discover/MapMarkerLegend';
import { MarkerPopoverCard } from '@/components/discover/MarkerPopoverCard';
import { PropertyMap, PropertyListingWithImages } from '@/components/map/PropertyMap';
import { computeZoneLabelPoints } from '@/lib/schoolZoneLabels';
import type { ZoneLabelPoint } from '@/components/map/SchoolZoneLabelLayer';
import type { AreaPoint, AreaMarkerClusterInfo } from '@/components/map/AreaMarkerLayer';
import { MapFilters } from '@/components/map/MapFilters';
import { DiscoverRightPanel } from '@/components/discover/DiscoverRightPanel';
import { AreaIndicatorOverlay } from '@/components/discover/AreaIndicatorOverlay';
import { DiscoverMapBreadcrumb, type DiscoverMapCrumb } from '@/components/discover/DiscoverMapBreadcrumb';
import {
  SchoolRadiusLegend,
  isSchoolRadiusOverlayState,
  prettifyZoneSlug,
  areaKeyToLabel,
} from '@/components/discover/SchoolRadiusMapOverlay';
import { ActiveContextChips } from '@/components/discover/ActiveContextChips';
import { resolveScopeKeyFromLabel, matchesMacroRegion, labelToSlug, aggregateMacroRegions } from '@/utils/macroRegionResolver';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import {
  computeDiscoverLayer,
  toLayerInput,
  selectDiscoverMapLayer,
  resolveActiveDiscoverGroup,
  resolveDiscoverGroupForAreaKey,
  type DiscoverMapLayerKind,
} from '@/utils/discoverLayerRegistry';
import { computeGroupBounds } from '@/utils/discoverGroupBounds';
import { CitySelect } from '@/components/discover/CitySelect';
import { CityNotSupported } from '@/components/discover/CityNotSupported';
import { MapStatsBar, MarkersTruncationNotice } from '@/components/discover/MapStatsBar';
import { MapEmptyGuidance } from '@/components/discover/MapEmptyGuidance';
import { useDiscoverInteractionState } from '@/features/discover/state/useDiscoverInteractionState';
import { useReducedMotion } from '@/features/discover/state/useReducedMotion';
import { useRegionGuideState } from '@/features/discover/state/useRegionGuideState';
import { useAreaSearchState } from '@/features/discover/state/useAreaSearchState';
import { useDiscoverSearchState } from '@/features/discover/state/useDiscoverSearchState';
import { useMarkerSelection } from '@/features/discover/state/useMarkerSelection';
import { useDiscoverJourneyTransitions } from '@/features/discover/state/useDiscoverJourneyTransitions';
import { useDiscoverCameraOrchestration } from '@/features/discover/state/useDiscoverCameraOrchestration';
import { resolveMarkerListings } from '@/features/discover/map/resolveMarkerListings';
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
import type { DiscoverListingItem } from '@/hooks/useDiscoverListings';
import { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';
import { useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { SchoolRadiusListingItem } from '@/hooks/useSchoolRadiusListings';
import { CITY_CONFIG, DEFAULT_CITY } from '@/lib/localityUtils';
import { slugifyFromAreaKey } from '@/lib/areaSlug';
import { clampSchoolRadiusKm, PropertyListing, PropertyImage, PropertyFilters } from '@/hooks/usePropertyListings';
import { cityListingToPropertyListing, filteredMarkerToPropertyListing } from '@/lib/discoverMappers';
import { ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { NearSchoolSheet } from '@/components/map/NearSchoolSheet';
import { DiscoverConsentBanner } from '@/components/discover/DiscoverConsentBanner';
import { DiscoverPrivacyToggle } from '@/components/discover/DiscoverPrivacyToggle';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, GraduationCap, ChevronLeft, ChevronRight } from 'lucide-react';

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
  /**
   * Issue #1817 — the UNFILTERED count of listings within the active school radius,
   * i.e. N before applyAnonPropertyFilters. Only derivable on the anon path (the public
   * /school-radius-listings endpoint returns the full radius set; filters are applied
   * client-side — see applyAnonPropertyFilters). The authenticated proximity endpoint
   * pre-filters server-side and does not retain this total, so authed callers must leave
   * this `undefined` — the selector then honestly falls back to the no-number
   * "Filtered results" state (AC6) rather than fabricating N.
   */
  schoolRadiusUnfilteredCount?: number | null;
}

/** Issue #1817 — design state codes driving badge/panel-stat copy (design §6 state table). */
export type DiscoverBadgeState =
  | 'ok'
  | 'loading'
  | 'zero-filters'
  | 'zero-search'
  | 'zero-empty'
  | 'stale';

export interface DiscoverBadgeResult {
  /** @deprecated kept for back-compat call-sites; true whenever the badge should render at all (with or without a number — see `state`). */
  visible: boolean;
  /**
   * @deprecated back-compat alias — equals `m` when filters/search are active and
   * derivable, otherwise `n`. New call-sites should read `n`/`m`/`state` directly.
   */
  count: number | null;
  loading: boolean;
  /** Issue #1817 — total in-scope count (N), independent of filters/search. Null when not yet resolved or not derivable. */
  n: number | null;
  /**
   * Issue #1817 — filtered/matched count (M). Equals `n` when no filters/search are
   * active. Null when M cannot be honestly derived for the active scope (the
   * authenticated school-radius + filters gap) — the state falls back to `'stale'` and
   * no number is shown (AC6: "a number the user cannot trust is worse than no number").
   */
  m: number | null;
  /** Issue #1817 — whether filters and/or a search query are currently narrowing the in-scope set. */
  hasActiveFilters: boolean;
  /**
   * Issue #1817 — whether a property FILTER specifically is active (independent of
   * search). Distinguishes "search only" from "filters only" / "filters and search"
   * for the copy contract (design §6: `your filters` | `"{q}"` | `your filters and "{q}"`) —
   * `hasActiveFilters` alone cannot make that distinction since it is true for either.
   */
  hasPropertyFilters: boolean;
  /** Issue #1817 — design state code (design §6 badge state table); drives copy at the render call-site. */
  state: DiscoverBadgeState;
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
  schoolRadiusUnfilteredCount,
}: DiscoverBadgeInput): DiscoverBadgeResult {
  // Compute hasPropertyFilters once — used by every branch below.
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
  const hasSearch = !!searchQuery && searchQuery.trim() !== '';
  const hasActiveFilters = hasPropertyFilters || hasSearch;
  const zeroState: DiscoverBadgeState = hasPropertyFilters
    ? 'zero-filters'
    : hasSearch
      ? 'zero-search'
      : 'zero-empty';

  const loadingResult: DiscoverBadgeResult = {
    visible: false,
    count: null,
    loading: true,
    n: null,
    m: null,
    hasActiveFilters,
    hasPropertyFilters,
    state: 'loading',
  };
  /** AC6 — a number we cannot stand behind is worse than none: labelled fallback, no figure. */
  const staleResult: DiscoverBadgeResult = {
    visible: true,
    count: null,
    loading: false,
    n: null,
    m: null,
    hasActiveFilters,
    hasPropertyFilters,
    state: 'stale',
  };

  // Issue #1175 v2 / #1817 — school-radius context: badge follows the active count.
  //
  // schoolListingsCount is set (not undefined) when a school-radius filter is active:
  //   • null    → listings are still loading → hide badge temporarily (avoids stale flash)
  //   • number  → resolved count (0 or N-if-unfiltered)
  if (schoolListingsCount !== undefined) {
    if (schoolListingsCount === null) {
      return loadingResult;
    }
    if (!hasActiveFilters) {
      // No filters/search: schoolListingsCount already IS the unfiltered radius total.
      const state: DiscoverBadgeState = schoolListingsCount === 0 ? 'zero-empty' : 'ok';
      return {
        visible: true,
        count: schoolListingsCount,
        loading: false,
        n: schoolListingsCount,
        m: schoolListingsCount,
        hasActiveFilters,
        hasPropertyFilters,
        state,
      };
    }
    // Filters/search active: M is schoolListingsCount, but N (the unfiltered radius
    // total) is only derivable on the anon path (schoolRadiusUnfilteredCount).
    if (schoolRadiusUnfilteredCount == null) {
      // Authenticated school-radius + filters gap (count-contract review, Q1):
      // no honest N — fall back to the no-number "Filtered results" state.
      return staleResult;
    }
    const m = schoolListingsCount;
    const state: DiscoverBadgeState = m === 0 ? zeroState : 'ok';
    return {
      visible: true,
      count: m,
      loading: false,
      n: schoolRadiusUnfilteredCount,
      m,
      hasActiveFilters,
      hasPropertyFilters,
      state,
    };
  }

  // Area selected path (AC1, AC2 combined, AC4, AC5)
  if (selectedArea != null) {
    if (isLoadingAreaListings) {
      return loadingResult;
    }
    if (hasActiveFilters) {
      // Area + property filters or keyword search: show the filtered count from areaListings
      // (filter-aware, matches right panel and map markers — AC4). N is the area's
      // unfiltered listingCount (may be null/undefined for stale area metadata).
      if (Array.isArray(areaListings)) {
        const m = areaListings.length;
        const n = selectedArea.listingCount ?? null;
        const state: DiscoverBadgeState = m === 0 ? zeroState : 'ok';
        return { visible: true, count: m, loading: false, n, m, hasActiveFilters, hasPropertyFilters, state };
      }
      // Defensive fallback: areaListings not yet an array (should not reach here
      // after loading settles, but hide rather than show a stale number).
      return { visible: false, count: null, loading: false, n: null, m: null, hasActiveFilters, hasPropertyFilters, state: 'loading' };
    }
    const count = selectedArea.listingCount ?? null;
    if (count == null) {
      // AC4 safety: don't show a number we can't verify
      return { visible: false, count: null, loading: false, n: null, m: null, hasActiveFilters, hasPropertyFilters, state: 'stale' };
    }
    const state: DiscoverBadgeState = count === 0 ? 'zero-empty' : 'ok';
    return { visible: true, count, loading: false, n: count, m: count, hasActiveFilters, hasPropertyFilters, state };
  }

  // No area, no school-radius: filters/search active but the only scopes left (group/city)
  // do not have a filter-aware query backing them — a trustworthy M cannot be derived here.
  // AC6 + the anon-count-exposure guard (qa-fast): never show a number in this case, for
  // BOTH authed and anon users. Falls back to the labelled "Filtered results" state instead
  // of hiding outright, per the design's own no-number fallback (§6).
  if (hasActiveFilters) {
    return staleResult;
  }

  // Issue #1175 v3 — group context (precedence: below school/area, above city).
  // groupListingsCount is set (not undefined) when a groupId is active and no area/school
  // is selected. null = group metadata still loading; number = resolved aggregate (0 or N).
  if (groupListingsCount !== undefined) {
    if (groupListingsCount === null) {
      return loadingResult;
    }
    const state: DiscoverBadgeState = groupListingsCount === 0 ? 'zero-empty' : 'ok';
    return {
      visible: true,
      count: groupListingsCount,
      loading: false,
      n: groupListingsCount,
      m: groupListingsCount,
      hasActiveFilters,
      hasPropertyFilters,
      state,
    };
  }

  // Baseline city total (AC3)
  if (cityTotal === 0) {
    return { visible: false, count: null, loading: false, n: null, m: null, hasActiveFilters, hasPropertyFilters, state: 'stale' };
  }
  return { visible: true, count: cityTotal, loading: false, n: cityTotal, m: cityTotal, hasActiveFilters, hasPropertyFilters, state: 'ok' };
}

/**
 * Issue #1817 — pure copy formatter implementing the design's badge/panel-stat copy
 * contract (design §6). Consumed by both the map badge pill and the panel header stat
 * so their wording can never diverge. Exported for isolated unit testing.
 */
export function formatDiscoverBadgeCopy(
  badge: Pick<DiscoverBadgeResult, 'n' | 'm' | 'hasActiveFilters' | 'hasPropertyFilters' | 'state'>,
  opts: { scopeLabel: string; noun: string; searchQuery?: string },
): string {
  const { scopeLabel, noun, searchQuery } = opts;
  const q = searchQuery?.trim();
  if (badge.state === 'stale') {
    return 'Filtered results';
  }
  if (badge.state === 'zero-search') {
    return `No results for "${q ?? ''}" in ${scopeLabel}`;
  }
  if (badge.state === 'zero-empty' && !badge.hasActiveFilters) {
    return 'No listings here yet';
  }
  const n = badge.n ?? 0;
  if (!badge.hasActiveFilters) {
    return `${n.toLocaleString()} ${noun} in ${scopeLabel}`;
  }
  const m = badge.m ?? 0;
  // design §6/AC5: "your filters" | `"{q}"` | `your filters and "{q}"` — determined by
  // hasPropertyFilters + presence of q independently (hasActiveFilters alone is true for
  // either and cannot distinguish "search only" from "filters and search").
  const matchTarget = q
    ? badge.hasPropertyFilters
      ? `your filters and "${q}"`
      : `"${q}"`
    : 'your filters';
  return `${m.toLocaleString()} of ${n.toLocaleString()} match ${matchTarget} in ${scopeLabel}`;
}

// ── School-first status-pill "Showing X schools" derivation ────────────────────
//
// Pure helpers — exported so they can be unit-tested without mounting the page
// (mirrors deriveDiscoverBadge above). Each returns the school count the bottom
// status pill should show for one school-first pre-radius state, reusing the same
// discoverAreas/focusedGroup/selectedArea data already driving the school-first
// panels/hero — no new fetch, no fabrication.
//
// All three are gated on `areasLoading`, exactly like the existing
// schoolListingsCount null-while-loading pattern above, so the pill never flashes
// "Showing 0 schools" mid-load — it simply hides (returns null) until settled.

interface SchoolFirstAreaLike {
  areaKey: string;
  schoolCount?: number | null;
}

interface SchoolFirstSelectedAreaLike {
  schoolCount?: number | null;
}

interface SchoolFirstGroupLike {
  area_keys: string[];
}

export interface SchoolFirstLandingCountInput {
  journey: string | null | undefined;
  groupId: string | null | undefined;
  selectedArea: SchoolFirstSelectedAreaLike | null | undefined;
  areasLoading: boolean;
  discoverAreas: ReadonlyArray<SchoolFirstAreaLike>;
}

/** School-first landing (no zone/area/school selected yet) — schools across the city scope currently on the map. */
export function deriveSchoolFirstLandingSchoolCount({
  journey,
  groupId,
  selectedArea,
  areasLoading,
  discoverAreas,
}: SchoolFirstLandingCountInput): number | null {
  if (areasLoading) return null;
  if (journey !== 'school-first' || !!groupId || selectedArea != null) return null;
  return discoverAreas.reduce((sum, a) => sum + (a.schoolCount ?? 0), 0);
}

export interface SchoolFirstZoneCountInput {
  journey: string | null | undefined;
  groupId: string | null | undefined;
  selectedArea: SchoolFirstSelectedAreaLike | null | undefined;
  focusedGroup: SchoolFirstGroupLike | null | undefined;
  areasLoading: boolean;
  discoverAreas: ReadonlyArray<SchoolFirstAreaLike>;
}

/** School-first zone selected (no area selected yet) — schools summed across the zone's member areas. */
export function deriveSchoolFirstZoneSchoolCount({
  journey,
  groupId,
  selectedArea,
  focusedGroup,
  areasLoading,
  discoverAreas,
}: SchoolFirstZoneCountInput): number | null {
  if (areasLoading) return null;
  if (journey !== 'school-first' || !groupId || selectedArea != null || !focusedGroup) return null;
  const memberKeySet = new Set(focusedGroup.area_keys);
  return discoverAreas
    .filter((a) => memberKeySet.has(a.areaKey))
    .reduce((sum, a) => sum + (a.schoolCount ?? 0), 0);
}

export interface SchoolFirstAreaCountInput {
  journey: string | null | undefined;
  selectedArea: SchoolFirstSelectedAreaLike | null | undefined;
  areasLoading: boolean;
}

/** School-first area selected (no school picked yet) — schools in the selected area. */
export function deriveSchoolFirstAreaSchoolCount({
  journey,
  selectedArea,
  areasLoading,
}: SchoolFirstAreaCountInput): number | null {
  if (areasLoading) return null;
  if (journey !== 'school-first' || selectedArea == null) return null;
  return selectedArea.schoolCount ?? null;
}

// ── School-marker-layer visibility gate (Issue #1157 rev-5 DEFECT A) ───────────
//
// Pure helper — exported so it can be unit-tested without mounting the page.
// school-first only mounts the marker layer once an area is resolved (areaKey set)
// — at landing/zone-selected there is never any school-marker data to show (the
// schools-by-area query is disabled until areaKey resolves), so requiring areaKey
// here is a no-op for real marker rendering while also suppressing
// SchoolMarkerLayer's "No schools found in this area" empty-state toast at those
// two states (visual-parity polish, cycle 3). area-first keeps its existing
// school-picking / area-school-combined behaviour unchanged.
export interface ShowSchoolMarkersInput {
  journey: string | null | undefined;
  areaKey: string | null | undefined;
  schoolPicking: boolean | null | undefined;
  schoolId: string | null | undefined;
}

export function deriveShowSchoolMarkers({
  journey,
  areaKey,
  schoolPicking,
  schoolId,
}: ShowSchoolMarkersInput): boolean {
  return (
    (journey === 'school-first' && !!areaKey) ||
    !!schoolPicking ||
    (journey === 'area-first' && !!areaKey && !!schoolId)
  );
}

/**
 * Status-pill noun for the school-first, school-selected (school-radius-active)
 * state — "Showing X homes"/"Showing X rentals". Pure so the branch is
 * unit-testable without mounting the page.
 */
export function deriveSchoolRadiusPillNoun(intent: string | null | undefined): 'homes' | 'rentals' {
  return intent === 'rent' ? 'rentals' : 'homes';
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

  // ── Anon teaser filter audit ───────────────────────────────────────────────
  // applyAnonPropertyFilters reads these fields from each listing item.
  // Fields are checked against DiscoverCityListingItem (the public endpoint shape):
  //
  //   SUPPORTED — field present on DiscoverCityListingItem; safe to apply:
  //     propertyTypes  → l.propertyType      ✓ present
  //     bedrooms       → l.bedrooms           ✓ present
  //     priceMin/Max   → l.pricePaise         ✓ present
  //     dateFrom/dateTo → l.createdAt         ✓ present
  //
  //   STRIPPED — field ABSENT from DiscoverCityListingItem; would false-empty the teaser:
  //     backOnMarket   → l.backOnMarket       ✗ absent (SchoolRadiusListingItem extension only)
  //     newToMarket    → l.daysOnMarket       ✗ absent (SchoolRadiusListingItem extension only)
  //     readyToMove    → l.possessionStatus   ✗ absent (SchoolRadiusListingItem extension only)
  //
  //   NOT READ by applyAnonPropertyFilters — these may remain on the spread filter object but
  //   the helper never reads them, so they cannot affect the anon result (no false-empty):
  //     reraRegistered, sellerTypes, categoryFilters (school-journey only)
  //
  // This is the documented anon teaser limitation: the anon path is a reduced experience.
  // The authed full path (useDiscoverListings + useDiscoverFilteredMarkers) applies ALL filters
  // server-side and is unaffected by this stripping.

  // Flatten the multi-area response into a single list for rendering.
  // Strip the three unsupported flags before delegating to applyAnonPropertyFilters so no
  // active URL flag can silently zero the anon teaser.
  const groupResultsAnonRaw: DiscoverCityListingItem[] = useMemo(() => {
    if (!isGroupResultsState || isAuthenticated) return [];
    const raw = (groupResultsAnonData?.areas ?? []).flatMap((a) => a.listings);
    // Strip STRIPPED flags (see audit above) via destructuring so they are not forwarded to
    // applyAnonPropertyFilters (the public DiscoverCityListingItem shape lacks their backing fields).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { backOnMarket: _bom, newToMarket: _ntm, readyToMove: _rtm, ...supportedFilters } =
      anonGroupFilters;
    return applyAnonPropertyFilters(
      raw as Parameters<typeof applyAnonPropertyFilters>[0],
      supportedFilters,
    ) as DiscoverCityListingItem[];
  }, [isGroupResultsState, isAuthenticated, groupResultsAnonData, anonGroupFilters]);

  // Normalise anon city-listing items to DiscoverListingItem shape so the unified surface
  // is correctly typed without unsafe casts. Fields absent from the public endpoint default
  // to null/0/false — values the panel already guards against (null-checks, optional renders).
  // heroImageUrl ← primaryImageUrl (different field name between the two response shapes).
  const groupResultsAnonListings: DiscoverListingItem[] = useMemo(
    () =>
      groupResultsAnonRaw.map((l): DiscoverListingItem => ({
        id: l.id,
        listingNumber: null,
        propertyType: l.propertyType ?? '',
        title: l.title ?? null,
        locality: l.locality ?? null,
        areaKey: null,
        pricePaise: l.pricePaise ?? null,
        landArea: l.landArea ?? null,
        landAreaUnit: l.landAreaUnit ?? null,
        builtArea: l.builtArea ?? null,
        builtAreaUnit: l.builtAreaUnit ?? null,
        bedrooms: l.bedrooms ?? null,
        latitude: l.lat ?? l.latitude ?? null,
        longitude: l.lon ?? l.longitude ?? null,
        heroImageUrl: l.primaryImageUrl ?? null,
        createdAt: l.createdAt ?? new Date(0).toISOString(),
        updatedAt: null,
        firstPublishedAt: null,
        lastUpdatedAt: null,
        daysOnMarket: 0,
        backOnMarket: false,
        reraNumber: null,
        reraValid: false,
        trustBadge: l.trustBadge ?? null,
        possessionStatus: null,
        sellerType: null,
        listingPurpose: l.listingPurpose ?? null,
        status: 'active',
      })),
    [groupResultsAnonRaw],
  );

  // ── Unified group-results surface (authed or anon) ──
  // The right panel and map always read from these unified variables so downstream code
  // (DiscoverRightPanel props, groupResultsMarkers) is unaffected by the auth split.
  const groupResultsListings: DiscoverListingItem[] = isAuthenticated
    ? (groupResultsAuthedData?.content ?? [])
    : groupResultsAnonListings;
  const groupResultsTotalElements = isAuthenticated
    ? groupResultsAuthedData?.totalElements
    : groupResultsAnonListings.length;
  const isLoadingGroupResults = isAuthenticated ? isLoadingGroupResultsAuthed : isLoadingGroupResultsAnon;
  const isGroupResultsError = isAuthenticated ? isGroupResultsErrorAuthed : isGroupResultsErrorAnon;
  const refetchGroupResults = isAuthenticated ? refetchGroupResultsAuthed : refetchGroupResultsAnon;

  // Issue #1597 — convert group-filtered markers to PropertyListingWithImages[] for PropertyMap.
  // Auth path: filteredMarkerToPropertyListing from /api/discover/markers (full predicate).
  // Anon path: cityListingToPropertyListing derived from groupResultsAnonListings (same recipe
  // as areaMarkerListings — filter null coords then reuse the city-listing mapper).
  // Returns [] when:
  //   - Not in the group-results state (no-op for all other panel states)
  //   - areaGroupsData is still loading (resolvedGroupAreaKeys is empty → hook disabled → data undefined)
  //   - The query is still in-flight
  // This ensures NO unfiltered markers leak to the map while the query is pending.
  const groupResultsMarkers = useMemo((): (PropertyListing & { images?: PropertyImage[] })[] => {
    if (!isGroupResultsState) return [];
    if (isAuthenticated) {
      if (!groupResultsMarkersData?.markers) return [];
      const now = new Date().toISOString();
      return groupResultsMarkersData.markers.map((m) => filteredMarkerToPropertyListing(m, now));
    }
    // Anon: derive markers from the same filtered city listings already shown in the panel.
    // Uses groupResultsAnonRaw (DiscoverCityListingItem[], has lat/lon fields from the
    // public endpoint) rather than the normalized DiscoverListingItem[] shape, because
    // cityListingToPropertyListing expects the raw city-listing shape.
    // Filters null/undefined coords so Leaflet never receives NaN lat/lon.
    if (groupResultsAnonRaw.length === 0) return [];
    const now = new Date().toISOString();
    return groupResultsAnonRaw
      .filter((l) => l.lat != null && l.lon != null)
      .map((l) => cityListingToPropertyListing(
        { ...l, lat: l.lat as number, lon: l.lon as number },
        now,
      ));
  }, [isGroupResultsState, isAuthenticated, groupResultsMarkersData, groupResultsAnonRaw]);

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
        // l.trustTier here is the DEALER contract's raw internal letter grade
        // (A/B/C/D — see usePropertyListings.ts), not the public-safe badge word.
        // DiscoverCityListingItem.trustBadge is public vocabulary only
        // ("verified"/"trusted"/"listed"); the letter-to-word mapping is a backend-only
        // concern (TrustBadge.java) and must never be replicated client-side (#1567/#1616).
        // The dealer endpoint does not (yet) expose a public-safe badge field, so there is
        // no honest value to pass through here — null (no badge) is correct, not a regression.
        trustBadge: null,
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

  // Visual-parity polish (cycle 3/4) — school-first "Showing X schools" status-pill
  // counts. Reuses discoverAreas/focusedGroup/selectedArea already computed above
  // (same data the school-first panels/hero already display) — no new fetch.
  // Derivations are pure exported helpers (mirrors deriveDiscoverBadge) so they can
  // be unit-tested without mounting the page — see
  // src/pages/__tests__/MapDiscovery.school-pill.test.tsx.
  // null = not applicable to the current state (falls through to the generic
  // properties-count pill below), the source data hasn't resolved yet, OR
  // areasLoading is still true — gated exactly like schoolListingsCount above so the
  // pill never flashes "Showing 0 schools" mid-load.
  const schoolFirstLandingSchoolCount = useMemo(
    () =>
      deriveSchoolFirstLandingSchoolCount({
        journey: urlState.journey,
        groupId: urlState.groupId,
        selectedArea,
        areasLoading,
        discoverAreas,
      }),
    [urlState.journey, urlState.groupId, selectedArea, areasLoading, discoverAreas],
  );

  const schoolFirstZoneSchoolCount = useMemo(
    () =>
      deriveSchoolFirstZoneSchoolCount({
        journey: urlState.journey,
        groupId: urlState.groupId,
        selectedArea,
        focusedGroup,
        areasLoading,
        discoverAreas,
      }),
    [urlState.journey, urlState.groupId, selectedArea, focusedGroup, areasLoading, discoverAreas],
  );

  const schoolFirstAreaSchoolCount = deriveSchoolFirstAreaSchoolCount({
    journey: urlState.journey,
    selectedArea,
    areasLoading,
  });

  // School-first overview: dark zone/group label pills positioned truthfully
  // (group focus point, else member-area bounds-centre; groups with neither are
  // dropped). Shown ONLY in the school-first browse/landing state (no group/area/
  // school selected) and only at overview zoom, so they never clutter drill-down
  // states or other journeys. onSelectZone reuses the existing selectGroup action.
  const schoolZoneLabels = useMemo<ZoneLabelPoint[]>(() => {
    // Issue #1655 — unified group listing pins replace legacy schoolZoneLabels pills at Level 0.
    return [];
  }, []);

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
  const [announcedBadgeText, setAnnouncedBadgeText] = useState('');
  const badgeAnnounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (discoverBadge.loading) return; // never announce mid-refetch
    if (badgeAnnounceTimer.current) clearTimeout(badgeAnnounceTimer.current);
    badgeAnnounceTimer.current = setTimeout(() => {
      const text = !discoverBadge.visible
        ? ''
        : formatDiscoverBadgeCopy(discoverBadge, {
            scopeLabel:
              selectedArea?.areaLabel ?? focusedGroup?.name ?? (CITY_CONFIG[city]?.label ?? city),
            noun: selectedArea ? 'homes' : 'properties',
            searchQuery: urlState.q,
          });
      setAnnouncedBadgeText(text);
    }, 500);
    return () => {
      if (badgeAnnounceTimer.current) clearTimeout(badgeAnnounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoverBadge, selectedArea, focusedGroup, city, urlState.q]);

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
  // Issue #1607 — the area-first CITY-LEVEL landing (group cards shown, no group or
  // area resolved yet). Treated like the public guided-entry landing for map chrome:
  // only areas WITH live properties get a marker (zero-listing areas — including any
  // seed/test areas — never render as misleading pins), plus the "Home › City › Areas"
  // breadcrumb, the Areas legend, and the centred city-wide summary pill. Zero areas
  // stay fully discoverable through the right-panel group/area lists.
  const isAreaFirstCityLanding =
    resolvedPanelContent === 'area-groups-landing' && !focusedGroup && !selectedArea;
  const liveAreas = discoverAreas.filter((a) => (a.listingCount ?? 0) > 0);
  // Issue #1588 follow-up — the selected city has finished loading and has zero live
  // properties. Gated on !areasLoading so the empty-state notice never flashes during
  // the load window (when cityTotal is transiently 0). City-scoped: discoverAreas comes
  // from /api/discover/areas for the current city, so this is true only for the real
  // selected city, never leaked from another city's data.
  const cityHasNoListings = !areasLoading && cityTotal === 0;

  const isTopGroupedAreaOrSchool =
    (urlState.journey === 'area-first' || urlState.journey === 'school-first') &&
    !urlState.groupId &&
    !urlState.areaKey &&
    !selectedArea &&
    !urlState.schoolId &&
    !selectedSchool;

  const isTopGroupedAgri =
    isAgriJourney &&
    !urlState.selectedRegion &&
    !urlState.areaKey &&
    !selectedArea &&
    !urlState.selectedLocality &&
    !urlState.selectedGroup;

  // Issue #1745 Batch B map-hierarchy fix — single derivation rule deciding WHICH
  // family of map markers `overviewAreas` (below) and the `listings` prop selection
  // (in the PropertyMap render further down) should use for the current URL state.
  // `mapLayerCategory` is the URL-driven category IGNORING the current zoom (bucket
  // forced to 'overview') — used wherever a decision must NOT flip with manual
  // zooming (e.g. suppressing raw listing markers at a grouped/landing state).
  // `mapLayerKind` additionally folds in the REAL current zoom bucket — used for the
  // area-marker layer itself, which already always hid above AREA_LAYER_MAX_ZOOM.
  // Composes with `computeDiscoverLayer`/`derivePanelContent` for the panel axis
  // (see discoverLayerRegistry.ts); does not duplicate journey-precedence routing.
  const discoverLayerInput = toLayerInput(urlState);
  const mapLayerCategory: DiscoverMapLayerKind = selectDiscoverMapLayer(discoverLayerInput, 'overview');
  const mapLayerKind: DiscoverMapLayerKind = selectDiscoverMapLayer(
    discoverLayerInput,
    mapZoom > AREA_LAYER_MAX_ZOOM ? 'detail' : 'overview',
  );

  const overviewAreas = useMemo((): AreaPoint[] => {
    if (mapLayerKind === 'zoom-gated' || mapLayerKind === 'agri-drilldown') return [];

    if (mapLayerKind === 'area-group-bubbles' || mapLayerKind === 'region-zone-areas') {
      if (isLoadingAreaGroups) return [];
      const groups = areaGroupsData?.groups ?? [];
      const activeScope = urlState.scope ?? null;

      let targetGroups = groups;
      if (activeScope) {
        targetGroups = groups.filter(
          (g) =>
            g.id === activeScope ||
            g.name.toLowerCase() === activeScope.toLowerCase() ||
            labelToSlug(g.name) === activeScope ||
            matchesMacroRegion(g.region_label, activeScope, summaryRegions)
        );
        if (targetGroups.length === 0) return [];

        // If the matched scope is itself a single area group (e.g. Udupi 3-level where scope="south-udupi" is group.id),
        // there are no sub-zones inside it, so return its member areas directly.
        const isDirectGroupMatch =
          targetGroups.length === 1 &&
          (targetGroups[0].id === activeScope || labelToSlug(targetGroups[0].name) === activeScope);
        if (isDirectGroupMatch) {
          const groupAreaKeys = targetGroups[0].area_keys ?? [];
          return discoverAreas.filter((a) => groupAreaKeys.includes(a.areaKey));
        }
      } else if (groups.length === 0) {
        return isLandingState || isAreaFirstCityLanding ? liveAreas : discoverAreas;
      }

      return targetGroups
        .map((group): AreaPoint | null => {
          const groupAreaKeys = group.area_keys ?? [];
          const memberAreas = discoverAreas.filter((a) => groupAreaKeys.includes(a.areaKey));
          const totalListings = memberAreas.reduce((sum, a) => sum + (a.listingCount ?? 0), 0);

          let lat = group.focus_lat != null ? group.focus_lat : null;
          let lon = group.focus_lon != null ? group.focus_lon : null;
          if (lat == null || lon == null) {
            const coords = memberAreas.filter((a) => a.geo_center_lat != null && a.geo_center_lon != null);
            if (coords.length > 0) {
              lat = coords.reduce((sum, a) => sum + a.geo_center_lat, 0) / coords.length;
              lon = coords.reduce((sum, a) => sum + a.geo_center_lon, 0) / coords.length;
            }
          }
          if (lat == null || lon == null) return null;

          const unionBbox = computeGroupBounds(memberAreas)?.bbox ?? null;

          return {
            areaKey: group.id,
            areaLabel: group.name,
            geo_center_lat: lat,
            geo_center_lon: lon,
            bbox: unionBbox,
            listingCount: totalListings,
            schoolCount: undefined,
            isGroup: true,
          };
        })
        .filter((a): a is AreaPoint => a !== null && (a.listingCount ?? 0) > 0);
    }

    // Issue #1745 Batch B map-hierarchy fix — journeyless city landing,
    // scope=null: macro-region summary bubbles from useDiscoverSummary().regions.
    if (mapLayerKind === 'macro-region-bubbles') {
      if (isLoadingAreaGroups) return [];
      const groups = areaGroupsData?.groups ?? [];
      if (groups.length === 0 || summaryRegions.length === 0) {
        return isLandingState || isAreaFirstCityLanding ? liveAreas : discoverAreas;
      }
      return summaryRegions
        .map((region): AreaPoint | null => {
          if (region.listingCount == null || region.listingCount === 0) return null;

          const matchingGroups = groups.filter(
            (g) =>
              g.id === region.regionKey ||
              g.name.toLowerCase() === region.regionLabel.toLowerCase() ||
              matchesMacroRegion(g.region_label, region.regionKey, summaryRegions) ||
              matchesMacroRegion(g.region_label, region.regionLabel, summaryRegions)
          );

          const groupAreaKeys = matchingGroups.flatMap((g) => g.area_keys ?? []);
          const memberAreas = discoverAreas.filter((a) => groupAreaKeys.includes(a.areaKey));
          const focusGroups = matchingGroups.filter((g) => g.focus_lat != null && g.focus_lon != null);

          let lat: number | null = null;
          let lon: number | null = null;
          
          if (focusGroups.length > 0) {
            lat = focusGroups.reduce((sum, g) => sum + (g.focus_lat as number), 0) / focusGroups.length;
            lon = focusGroups.reduce((sum, g) => sum + (g.focus_lon as number), 0) / focusGroups.length;
          } else {
            const coords = memberAreas.filter((a) => a.geo_center_lat != null && a.geo_center_lon != null);
            if (coords.length > 0) {
              lat = coords.reduce((sum, a) => sum + a.geo_center_lat, 0) / coords.length;
              lon = coords.reduce((sum, a) => sum + a.geo_center_lon, 0) / coords.length;
            }
          }

          if (lat == null || lon == null) {
            const rKey = region.regionKey.toLowerCase();
            const rLabel = region.regionLabel.toLowerCase();
            const fallbackCoords = (discoverAreas.length > 0 ? discoverAreas : liveAreas).filter(
              (a) =>
                (a.areaLabel ?? '').toLowerCase().includes(rKey) ||
                (a.areaLabel ?? '').toLowerCase().includes(rLabel) ||
                rLabel.includes((a.areaLabel ?? '').toLowerCase())
            );
            if (fallbackCoords.length > 0) {
              const valid = fallbackCoords.filter((a) => a.geo_center_lat != null && a.geo_center_lon != null);
              if (valid.length > 0) {
                lat = valid.reduce((sum, a) => sum + a.geo_center_lat, 0) / valid.length;
                lon = valid.reduce((sum, a) => sum + a.geo_center_lon, 0) / valid.length;
              }
            }
          }

          if (lat == null || lon == null) {
            const baseLat = urlState.viewport?.lat ?? cityCenter[0] ?? 13.34;
            const baseLon = urlState.viewport?.lon ?? cityCenter[1] ?? 74.74;
            const offset = 0.04;
            const key = region.regionKey.toLowerCase();
            lat =
              baseLat +
              (key.includes('north') || key === 'n' ? offset : key.includes('south') || key === 's' ? -offset : 0);
            lon =
              baseLon +
              (key.includes('east') || key === 'e' ? offset : key.includes('west') || key === 'w' ? -offset : 0);
          }

          const unionBbox = computeGroupBounds(memberAreas)?.bbox ?? null;

          return {
            areaKey: region.regionKey,
            areaLabel: region.regionLabel,
            geo_center_lat: lat,
            geo_center_lon: lon,
            bbox: unionBbox,
            listingCount: region.listingCount,
            schoolCount: undefined,
            isMacroRegion: true,
            isSelected: urlState.scope === region.regionKey || labelToSlug(region.regionLabel) === urlState.scope,
          };
        })
        .filter((a): a is AreaPoint => a !== null);
    }

    if (mapLayerKind === 'agri-corridor-bubbles') {
      if (isLoadingRegionalAreaGroups) return [];
      if (corridorGroups.length === 0) return [];
      const sourceAreas = agriAreasData ?? [];
      return corridorGroups
        .map((corridor): AreaPoint => {
          const uniqueAreaKeys = Array.from(new Set(corridor.availableMaxDistances.flatMap((t) => t.areaKeys)));
          const memberAreas = sourceAreas.filter((a) => uniqueAreaKeys.includes(a.areaKey));
          let totalListings = memberAreas.reduce((sum, a) => sum + (a.listingCount ?? 0), 0);
          if (totalListings === 0) {
            totalListings = corridor.availableMaxDistances.reduce((max, t) => Math.max(max, t.listingCount ?? 0), 0);
          }

          const memberAreasWithCoords = memberAreas.filter((a) => a.geoCenterLat != null && a.geoCenterLon != null);
          let lat: number | null = null;
          let lon: number | null = null;
          if (memberAreasWithCoords.length > 0) {
            lat = memberAreasWithCoords.reduce((sum, a) => sum + a.geoCenterLat, 0) / memberAreasWithCoords.length;
            lon = memberAreasWithCoords.reduce((sum, a) => sum + a.geoCenterLon, 0) / memberAreasWithCoords.length;
          } else {
            const baseLat = urlState.viewport?.lat ?? 13.34;
            const baseLon = urlState.viewport?.lon ?? 74.74;
            const offset = 0.04;
            lat = baseLat + (corridor.directionCode.includes('N') ? offset : corridor.directionCode.includes('S') ? -offset : 0);
            lon = baseLon + (corridor.directionCode.includes('E') ? offset : corridor.directionCode.includes('W') ? -offset : 0);
          }

          const mappedMembers: AreaPoint[] = memberAreas.map((a) => ({
            areaKey: a.areaKey,
            areaLabel: a.name,
            geo_center_lat: a.geoCenterLat,
            geo_center_lon: a.geoCenterLon,
            bbox:
              a.minLat != null && a.minLon != null && a.maxLat != null && a.maxLon != null
                ? ([[a.minLat, a.minLon], [a.maxLat, a.maxLon]] as [[number, number], [number, number]])
                : null,
            listingCount: a.listingCount,
          }));
          const unionBbox = computeGroupBounds(mappedMembers)?.bbox ?? null;

          return {
            areaKey: corridor.directionCode,
            areaLabel: corridor.groupName,
            geo_center_lat: lat,
            geo_center_lon: lon,
            bbox: unionBbox,
            listingCount: totalListings,
            isGroup: true,
          };
        })
        .filter((a) => (a.listingCount ?? 0) > 0);
    }

    // Issue #1798 PR-B1 — strictly align overview area markers with the active group or area context.
    // If an area is explicitly selected (`urlState.areaKey`), we do not show parent overview areas;
    // only the area's listings stand out on the map.
    if (urlState.areaKey) {
      return [];
    }
    // If a group is selected (`focusedGroup`), we strictly limit overview areas to member areas (`focusedGroup.area_keys`).
    if (focusedGroup) {
      const memberKeySet = new Set(focusedGroup.area_keys);
      return discoverAreas.filter((a) => memberKeySet.has(a.areaKey));
    }

    // 'all-areas' — every remaining residential drill-down state (school selected, combined) —
    // unchanged: full discoverAreas, dimmed via the separate `focusedGroupAreas` prop passed to PropertyMap.
    return isLandingState || isAreaFirstCityLanding ? liveAreas : discoverAreas;
  }, [
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
    urlState.viewport,
    urlState.scope,
    summaryRegions,
    cityCenter,
    urlState.areaKey,
    focusedGroup,
  ]);

  // Issue #1815 (R3b/R6) — a panel search match must promote that area to a
  // full labelled map pin (AreaMarkerLayer's documented searchMatchKeys
  // contract: "Areas matching the active panel search — always forced to
  // full labelled pins"). debouncedAreaSearchQuery (declared above) already
  // exists purely to drive this — wired up from the panel via
  // onAreaSearchQueryChange={setAreaSearchQuery} below — but the final step
  // (turning the live query into actual matched area KEYS) was never
  // implemented; this constant was hardcoded to `undefined`, so
  // applyForcedAlways in areaMarkerBucketing.ts never had anything to
  // force-promote. Mirrors ScopedSearch's own matching predicate (name or
  // areaKey, case-insensitive substring — see
  // src/components/discover/ScopedSearch.tsx's matchingAreas), adapted to
  // the shape actually in scope here: `discoverAreas` at this point in the
  // component is AreaPoint[] (has `areaLabel`, NOT `name` — see the comment
  // on discoverAreasForPanel a few hundred lines up), not the DiscoverArea[]
  // ScopedSearch's own predicate is written against. Matches are NOT capped
  // to 8 (that cap is a dropdown-suggestion-list concern, unrelated to
  // marker promotion). This only affects AreaMarkerLayer's bucketing
  // (representative selection) — never a camera move or URL/route change;
  // searchMatchKeys is read solely inside computeAreaMarkers's
  // applyForcedAlways, which has no camera-intent side effect.
  const areaSearchMatchKeys = useMemo(() => {
    const q = debouncedAreaSearchQuery.trim().toLowerCase();
    if (!q) return undefined;
    const matches = discoverAreas
      .filter((a) => a.areaLabel.toLowerCase().includes(q) || a.areaKey.toLowerCase().includes(q))
      .map((a) => a.areaKey);
    return matches.length > 0 ? matches : undefined;
  }, [debouncedAreaSearchQuery, discoverAreas]);

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

  // Issue #1798 PR-B1 — unified region/scope resolution for map breadcrumb hierarchy.
  const resolvedRegionLabel =
    (urlState.scope
      ? summaryRegions.find((r) => r.regionKey.toLowerCase() === urlState.scope?.toLowerCase())?.regionLabel ?? prettifyZoneSlug(urlState.scope)
      : focusedGroup?.region_label) ?? null;

  const resolvedScopeKeyForHref =
    urlState.scope ??
    (focusedGroup?.region_label
      ? summaryRegions.find((r) => r.regionLabel.toLowerCase() === focusedGroup.region_label!.toLowerCase())?.regionKey ?? focusedGroup.region_label.toLowerCase().replace(/\s+/g, '-')
      : null);

  // Issue #1808 — region-overview predicate (AC2-AC12): scope set, journey
  // null, no narrower selection. Deliberately independent of resolvedPanelContent
  // (derivePanelContent does not read `scope` — see discoverPanelState.ts —
  // so this state still resolves to panelContent 'guided-entry', rendering
  // GuidedEntryPanel; the guidance ring/helper are wired into GuidedEntryPanel's
  // existing JourneySwitcher section, NOT AreaGroupsLandingPanel, which is only
  // reachable once journey is set and is never mounted at this state).
  const isRegionOverview =
    urlState.scope != null &&
    urlState.journey == null &&
    !urlState.groupId &&
    !urlState.areaKey &&
    !urlState.schoolId &&
    selectedMarkerListing == null;

  // Issue #1808 q1 — marker-accurate variant derived from the ACTUAL resolved
  // overview markers (never a curated/withheld preview). `overviewAreas` items
  // carry `isGroup: true` only for the zone/group-bubble branch of the
  // region-zone-areas layer (see the useMemo above); the direct-group-match
  // branch returns member AREA points with no `isGroup` flag.
  const regionOverviewMarkerKind: RegionOverviewMarkerKind =
    isRegionOverview && mapLayerKind === 'region-zone-areas' && overviewAreas.length > 0
      ? (overviewAreas.some((a) => a.isGroup) ? 'zones' : 'areas')
      : null;

  // Issue #1808 — short region label for the map legend line 1 (e.g. "East"
  // from "East Bangalore"). Presentational formatting only, no new data source.
  const regionOverviewShortLabel = resolvedRegionLabel
    ? (() => {
        const cityLabel = CITY_CONFIG[city]?.label ?? city;
        const stripped = resolvedRegionLabel.replace(new RegExp(`\\s*${cityLabel}$`, 'i'), '').trim();
        return stripped.length > 0 ? stripped : resolvedRegionLabel;
      })()
    : null;

  // Issue #1808 — the ring/helper (not the card/legend) fire only on an actual
  // map/panel pick, never on deep-link/refresh (design §5/§9, AC5).
  const regionGuideVisible = isRegionOverview && !regionGuideDismissed;
  const regionGuideRingActive = regionGuideVisible && regionSelectSource !== 'deeplink';

  const areaJourneySegmentsRaw: { key: string; label: string | null | undefined; emphasis?: DiscoverMapCrumb['emphasis']; maxWidthClass?: string; href?: string }[] = [
    {
      key: 'city',
      label: CITY_CONFIG[city]?.label ?? city,
      href: (resolvedRegionLabel || focusedGroup || selectedArea || urlState.groupId || urlState.areaKey) ? `/discover?city=${encodeURIComponent(city)}&journey=${encodeURIComponent(urlState.journey || 'area-first')}` : undefined,
    },
    {
      key: 'region',
      label: resolvedRegionLabel,
      href: (focusedGroup || selectedArea || urlState.groupId || urlState.areaKey) && resolvedScopeKeyForHref ? `/discover?city=${encodeURIComponent(city)}&journey=${encodeURIComponent(urlState.journey || 'area-first')}&scope=${encodeURIComponent(resolvedScopeKeyForHref)}` : undefined,
      maxWidthClass: 'max-w-[140px]',
      emphasis: (focusedGroup || selectedArea || urlState.groupId || urlState.areaKey) ? ('muted' as const) : ('strong' as const),
    },
    {
      key: 'group',
      label: focusedGroup?.name ?? (urlState.groupId ? prettifyZoneSlug(urlState.groupId) : null),
      href: (selectedArea || urlState.areaKey) && (focusedGroup?.id || urlState.groupId) ? `/discover?city=${encodeURIComponent(city)}&journey=${encodeURIComponent(urlState.journey || 'area-first')}&groupId=${encodeURIComponent(focusedGroup?.id ?? urlState.groupId!)}` : undefined,
      maxWidthClass: 'max-w-[160px]',
      emphasis: (selectedArea || urlState.areaKey) ? ('muted' as const) : ('strong' as const),
    },
    {
      key: 'area',
      label: selectedArea?.areaLabel ?? areaKeyToLabel(urlState.areaKey),
      maxWidthClass: 'max-w-[160px]',
      emphasis: 'strong' as const,
    },
  ];
  const areaJourneySegments: DiscoverMapCrumb[] = areaJourneySegmentsRaw
    .filter((s): s is { key: string; label: string; emphasis?: DiscoverMapCrumb['emphasis']; maxWidthClass?: string; href?: string } =>
      typeof s.label === 'string' && s.label.trim().length > 0)
    .map((s) => ({ key: s.key, label: s.label, emphasis: s.emphasis, maxWidthClass: s.maxWidthClass, href: s.href }));

  // Issue #1745 P4 — resolved City › Zone › Area › School segments for the school-journey
  // map breadcrumb (DiscoverMapBreadcrumb). Built here (not inside the shared component,
  // which never filters/fabricates) so any segment whose label hasn't resolved yet is
  // dropped — a zone-only context reads "Udupi › University Belt", an area context reads
  // "Udupi › University Belt › Manipal". The school segment only appears once a schoolId is
  // actually in the URL (guards against a stale selectedSchool lagging a back navigation).
  // Not memoized: this component already has pre-existing conditionally-invoked hooks
  // further down (rules-of-hooks violations predating #1745 P4 — out of scope here), so a
  // useMemo placed after them would itself become conditional. The computation below is a
  // handful of string comparisons — cheap enough to run on every render without memoizing.
  const schoolJourneySegmentsRaw: { key: string; label: string | null | undefined; emphasis?: DiscoverMapCrumb['emphasis']; maxWidthClass?: string }[] = [
    { key: 'city', label: CITY_CONFIG[city]?.label ?? city },
    { key: 'region', label: resolvedRegionLabel, maxWidthClass: 'max-w-[140px]' },
    { key: 'zone', label: focusedGroup?.name ?? prettifyZoneSlug(urlState.groupId) },
    { key: 'area', label: selectedArea?.areaLabel ?? areaKeyToLabel(urlState.areaKey) },
    {
      key: 'school',
      label: urlState.schoolId ? (selectedSchool?.name ?? null) : null,
      emphasis: 'school',
      maxWidthClass: 'max-w-[180px]',
    },
  ];
  const schoolJourneySegments: DiscoverMapCrumb[] = schoolJourneySegmentsRaw
    .filter((s): s is { key: string; label: string; emphasis?: DiscoverMapCrumb['emphasis']; maxWidthClass?: string } =>
      typeof s.label === 'string' && s.label.trim().length > 0)
    .map((s) => ({ key: s.key, label: s.label, emphasis: s.emphasis, maxWidthClass: s.maxWidthClass }));

  if (!isCityValid) return <CityNotSupported city={city} />;

  // Issue #1810 (Stage 2A, MODEL A) — the single ordered listing-marker array
  // that feeds PropertyMap's markers AND doubles as the popup stepper's
  // ratified panel-scope set (user-locked model, see approved-plan.toml
  // [user_decision]). Extracted from the inline IIFE previously passed
  // directly as PropertyMap's `listings` prop so the stepper below reads the
  // EXACT same array PropertyMap renders — no separate marker-set plumbing,
  // no new camera-intent types, no PropertyMap changes. Not a hook (plain
  // const), so it is safe to declare after the early return above; every
  // variable it closes over is already declared earlier in this component.
  const currentMapMarkerListings = resolveMarkerListings({
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
  });

  // Issue #1810 (Stage 2A) — MODEL A stepper set: the clicked listing's 1-based
  // position within currentMapMarkerListings (the SAME array feeding the map +
  // in-scope with the results panel). null when ineligible, the listing isn't
  // found in the set (defensive), or the set has <=1 member — the popup then
  // renders no stepper at all (AC8). Deliberately NOT a hook: cheap, recomputed
  // every render, no camera side effects of any kind.
  const markerPopoverStepper =
    isMarkerPopoverEligible && selectedMarkerListing != null
      ? (() => {
          const idx = currentMapMarkerListings.findIndex((l) => l.id === selectedMarkerListing.id);
          if (idx === -1 || currentMapMarkerListings.length <= 1) return null;
          return { index: idx, total: currentMapMarkerListings.length };
        })()
      : null;

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

  return (
    <PublicDiscoverLayout>
      <div className="h-full flex flex-col lg:flex-row relative">
        {/* a3 — mapContainerRef wraps the full map half-panel for MarkerPopoverCard bounds clamp.
            R-C — warm map gutter background (#EDEBE6) so the gutter between the map tile and
            panel edge is warm off-white, not default grey. */}
        <div ref={mapContainerRef} className="lg:w-1/2 h-64 lg:h-full relative order-1 lg:order-1" style={{ background: 'hsl(var(--map-bg))' }} onClick={
          // a3 — background click dismisses the marker popover. stopPropagation is applied
          // inside the card itself so clicks inside the card do not trigger this.
          markerPixelPos != null ? handlePopoverDismiss : undefined
        }>
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
              initialZoom={urlState.viewport?.zoom}
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
              focusedGroupAreas={mapZoom <= AREA_LAYER_MAX_ZOOM ? focusedGroupAreas : undefined}
              // Issue #1798 PR-B — area-marker density degradation. Gated on the SAME
              // condition as focusedGroupAreas above (a dense group of member areas is
              // focused, at/below the area-marker zoom cutoff) — this is the shared
              // area-first/school-first "dense group selected" seam per Stage-A evidence
              // (focusedGroupAreas is derived from urlState.groupId alone, journey-agnostic).
              enableAreaMarkerDegradation={mapZoom <= AREA_LAYER_MAX_ZOOM && !!focusedGroupAreas}
              selectedAreaKey={selectedArea?.areaKey ?? urlState.areaKey ?? null}
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
              schoolZoneLabels={schoolZoneLabels}
              onSelectZone={(groupId) => urlActions.selectGroup(groupId)}
              onZoomChange={setMapZoom}
              onViewportChange={urlActions.reportViewport}
              onBoundsChange={handleBoundsChange}
              panToArea={panToArea}
              resetMapTick={journeyView.composedResetMapTick}
              onReady={() => setMapReady(true)}
              journey={urlState.journey}
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
                const r = urlState.radiusKm ?? filters.schoolRadiusKm;
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
              selectedListingId={urlState.selectedListing}
              hoveredListingId={hoveredListingId}
              onMarkerClickWithPosition={handleMarkerClickWithPosition}
            />
          )}

          {/* Top-left context overlay. For school-first drill-down states (zone / area /
              school selected), show the progressively-resolved journey breadcrumb
              (City › Zone › Area › School); otherwise the generic area indicator.
              Rendering one OR the other avoids a duplicate breadcrumb. */}
          <div className="absolute top-4 left-4 z-[1000]">
            {isAreaFirstCityLanding ? (
              // Issue #1607 — the area-first city-level landing shows the
              // "Home › City › Areas" breadcrumb (mock placement). Home and the city
              // crumb route progressively; "Areas" is the terminal (current) page.
              <DiscoverMapBreadcrumb
                testId="area-first-landing-breadcrumb"
                containerClassName="px-3.5 shadow-md"
                leadingIcon={MapPin}
                leadingIconClassName="text-[hsl(var(--copper))]"
                segments={[
                  { key: 'home', label: 'Home', href: '/' },
                  {
                    key: 'city',
                    label: CITY_CONFIG[city]?.label ?? city,
                    href: `/discover?city=${encodeURIComponent(city)}`,
                    maxWidthClass: 'max-w-[140px]',
                  },
                  { key: 'areas', label: 'Areas', current: true, emphasis: 'strong' },
                ]}
              />
            ) : showSchoolBreadcrumb ? (
              <DiscoverMapBreadcrumb
                ariaLabel="Journey breadcrumb"
                testId="school-journey-breadcrumb"
                density="compact"
                containerClassName="max-w-[min(88vw,520px)] border-border/60 py-1.5 shadow-md"
                separatorClassName="text-muted-foreground/50"
                leadingIcon={GraduationCap}
                leadingIconClassName="text-[hsl(var(--plum))]"
                segments={schoolJourneySegments}
              />
            ) : areaJourneySegments.length > 1 ? (
              // Issue #1595 / Issue #1606 / Issue #1798 PR-B1 — unified City › Region › Group › Area
              // map breadcrumb across all area-first drill-down and return states.
              <DiscoverMapBreadcrumb
                testId="map-group-breadcrumb"
                leadingIcon={MapPin}
                leadingIconClassName="text-[hsl(var(--copper))]"
                segments={areaJourneySegments}
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

          {/* City select — top-right. Issue #1588 — hidden on the public landing
              (guided-entry), where the city control lives in the right-panel hero
              controls card; restored for every drill-down state. Issue #1595 — also
              hidden on the area-first selected-group step (not part of the approved
              mock); city remains switchable from the landing via Start over. Issue #1607 —
              also hidden on the area-first city landing, where the city switcher now lives
              in the right-panel controls card (mock parity). Issue #1606 — also hidden on the
              area-first selected-AREA results, where City + Looking-to move into the in-panel
              controls card (mock parity, no duplicate control). */}
          {resolvedPanelContent !== 'guided-entry' && !isSelectedGroupState && !isAreaFirstCityLanding && resolvedPanelContent !== 'area-selected' && (
            <div className="absolute top-4 right-4 z-[1000] w-44">
              <CitySelect value={city} onChange={handleCityChange} className="bg-card shadow-sm" />
            </div>
          )}

          {/* Issue #1808 — region-overview map guidance card. Region-overview
              is a sub-state of 'guided-entry' (scope set, journey null), so
              CitySelect above is already hidden here — no collision. Never
              covers the map centre or the CitySelect control (top-right
              desktop / top-of-map mobile, below the breadcrumb). Presentational
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

          {/* Area-count legend — bottom-left, public landing only. Shown ONLY when there
              are actual area markers on the map (hidden entirely on empty cities), and
              never over the school-radius legend. All landing markers are areas with
              properties, so only the "Areas with properties" row is shown (Issue #1588).
              Issue #1808 — excluded at region-overview (scope set), which now shows the
              marker-accurate MapRegionOverviewLegend below instead; the city-landing
              (scope=null) rendering here is otherwise unchanged. */}
          {resolvedPanelContent === 'guided-entry' && !schoolRadiusOverlay && overviewAreas.length > 0 && !isRegionOverview && (
            <div className="absolute bottom-10 left-4 z-[1000]">
              <MapAreaLegend showZeroRow={false} />
            </div>
          )}

          {/* Issue #1808 — region-aware legend variant, region-overview only.
              Gated on regionGuideVisible (not the raw isRegionOverview) so the
              legend note clears together with the card + ring on dismiss (AC6). */}
          {regionGuideVisible && !schoolRadiusOverlay && regionOverviewShortLabel && (
            <div className="absolute bottom-10 left-4 z-[1000]">
              <MapRegionOverviewLegend
                regionShortLabel={regionOverviewShortLabel}
                markerKind={regionOverviewMarkerKind}
              />
            </div>
          )}

          {/* a2 — Marker-meaning legend for the area-first selected-area results state.
              Shown only when there is at least one area marker and we are in area-selected.
              Does not render on guided-entry / selected-group (those keep MapAreaLegend).
              Does not clash with badge (bottom-16 right-4), zoom (bottom-right), or attribution. */}
          {isAreaFirstSelectedAreaState && !schoolRadiusOverlay && areaMarkerListings.length > 0 && (
            <div className="absolute bottom-10 left-4 z-[1000]">
              <MapMarkerLegend listings={areaMarkerListings} />
            </div>
          )}

          {/* Issue #1595 — the area-first selected-group drill-down shows the same
              "Areas" legend, since its map surfaces member-area markers with counts. */}
          {isSelectedGroupState && !schoolRadiusOverlay && (
            <div className="absolute bottom-10 left-4 z-[1000]">
              <MapAreaLegend showZeroRow={false} />
            </div>
          )}

          {/* Issue #1607 — the area-first city landing shows only areas WITH properties
              (zero-listing areas are hidden, mirroring the guided-entry landing), so the
              legend carries just the "Areas with properties" row. */}
          {isAreaFirstCityLanding && !schoolRadiusOverlay && overviewAreas.length > 0 && (
            <div className="absolute bottom-10 left-4 z-[1000]">
              <MapAreaLegend showZeroRow={false} />
            </div>
          )}

          {/* Issue #1771 — Agri-first journey map legend, contextual per drill-down stage:
              landing → Corridors; corridor selected → Corridors + Village clusters;
              locality selected → Parcels. */}
          {urlState.journey === 'agri-first' && !schoolRadiusOverlay && (
            <div className="absolute bottom-10 left-4 z-[1000]">
              <MapAgriLegend
                stage={
                  urlState.selectedLocality
                    ? 'locality'
                    : selectedRegion
                      ? 'corridor'
                      : 'landing'
                }
              />
            </div>
          )}

          {/* School-first journey map legend, contextual per drill-down stage (mirrors
              the #1771 MapAgriLegend pattern): school-browse → School zones;
              school-group-areas → Areas; schools-in-area → Schools. Once a specific
              school is selected the existing SchoolRadiusLegend (above) already covers
              the school marker + radius-circle swatches, so this legend is gated off via
              !schoolRadiusOverlay to avoid a redundant/competing bottom-left legend. */}
          {urlState.journey === 'school-first' && !schoolRadiusOverlay && (
            <div className="absolute bottom-10 left-4 z-[1000]">
              <MapSchoolLegend
                stage={
                  ((): SchoolLegendStage => {
                    if (resolvedPanelContent === 'schools-in-area') return 'area';
                    if (resolvedPanelContent === 'school-group-areas') return 'zone';
                    return 'landing';
                  })()
                }
              />
            </div>
          )}

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
              kept bottom-right for contextual (area/school/group) drill-down counts. */}
          {resolvedPanelContent !== 'guided-entry' && !isAreaFirstCityLanding && discoverBadge.visible && (discoverBadge.count != null || discoverBadge.state === 'stale') && (
            <div
              className={
                // Issue #1595 — on the selected-group step the pill is centred at the bottom.
                // Issue #1606 — area-first selected-area step also centres the pill (bottom-8
                // for clearance above attribution; clear of zoom bottom-right + legend bottom-left).
                // Every other drill-down context keeps the compact bottom-right placement.
                isSelectedGroupState || isAreaFirstSelectedAreaState
                  ? 'absolute bottom-8 left-1/2 z-[1000] -translate-x-1/2'
                  : 'absolute bottom-16 right-4 z-[1000]'
              }
              data-testid="discover-badge"
            >
              <div
                className="flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card/95 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur-sm"
                aria-busy={discoverBadge.loading}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {/* Issue #1595 — in the selected-group drill-down the footer pill names the
                    group and marks the count as verified ("Showing 8 verified properties in
                    University Belt").
                    Issue #1606 — in the area-first selected-area state the pill reads
                    "Showing N verified properties in {areaLabel}". Every other context keeps
                    the plain "N properties".
                    Issue #1817 — the 'stale' state (count-contract unreliable, e.g. authed
                    school-radius + filters) is checked FIRST, before any of the specific
                    journey branches below, because those branches assume a non-null count. */}
                {discoverBadge.state === 'stale' ? (
                  <span data-testid="discover-badge-stale">Filtered results</span>
                ) : resolvedPanelContent === 'area-groups-landing' && focusedGroup && !selectedArea ? (
                  // Issue #1817 (code-review follow-up) — routed through the shared copy
                  // contract so filters/search active here render `M of N match ... in
                  // {Group}` (design §6 "Area group selected + filters") instead of always
                  // showing the plain verified-properties form.
                  <span>
                    {formatDiscoverBadgeCopy(discoverBadge, {
                      scopeLabel: focusedGroup.name,
                      noun: 'verified properties',
                      searchQuery: urlState.q,
                    })}
                  </span>
                ) : isAreaFirstSelectedAreaState && selectedArea ? (
                  // Issue #1817 (code-review follow-up) — same fix for the area-first
                  // selected-area state (design §6 "Area selected + filters" → `5 of 18
                  // match in Whitefield"). Reuses areaResultSummaryText — the SAME
                  // computed string the AreaSelectedPanel stat renders — so the two
                  // surfaces can never diverge.
                  <span>{areaResultSummaryText}</span>
                ) : urlState.journey === 'school-first' && schoolRadiusActive ? (
                  // School-first, school selected — the badge count IS the school-radius
                  // listing count (schoolListingsCount, threaded above), so "homes"/"rentals"
                  // is an honest label here (mock parity: "Showing X homes").
                  <span>
                    Showing{' '}
                    <strong className="font-semibold tabular-nums text-foreground">
                      {discoverBadge.count.toLocaleString()}
                    </strong>
                    {' '}{deriveSchoolRadiusPillNoun(urlState.intent)}
                  </span>
                ) : urlState.journey === 'school-first' && !schoolRadiusActive && selectedArea && schoolFirstAreaSchoolCount != null ? (
                  // School-first, area selected, no school picked yet — mock parity:
                  // "Showing X schools" using the same schoolCount the area-selected hero
                  // displays (selectedArea.schoolCount), not the generic listings total.
                  <span>
                    Showing{' '}
                    <strong className="font-semibold tabular-nums text-foreground">
                      {schoolFirstAreaSchoolCount.toLocaleString()}
                    </strong>
                    {' '}school{schoolFirstAreaSchoolCount === 1 ? '' : 's'}
                  </span>
                ) : urlState.journey === 'school-first' && !schoolRadiusActive && !selectedArea && focusedGroup && schoolFirstZoneSchoolCount != null ? (
                  // School-first, zone selected, no area picked yet — mock parity:
                  // "Showing X schools" using the same member-area schoolCount sum the
                  // zone-selected hero displays.
                  <span>
                    Showing{' '}
                    <strong className="font-semibold tabular-nums text-foreground">
                      {schoolFirstZoneSchoolCount.toLocaleString()}
                    </strong>
                    {' '}school{schoolFirstZoneSchoolCount === 1 ? '' : 's'}
                  </span>
                ) : urlState.journey === 'school-first' && !schoolRadiusActive && !selectedArea && !focusedGroup && schoolFirstLandingSchoolCount != null ? (
                  // School-first landing (no zone/area/school selected yet) — mock parity:
                  // "Showing X schools" across the city scope currently on the map.
                  <span>
                    Showing{' '}
                    <strong className="font-semibold tabular-nums text-foreground">
                      {schoolFirstLandingSchoolCount.toLocaleString()}
                    </strong>
                    {' '}school{schoolFirstLandingSchoolCount === 1 ? '' : 's'}
                  </span>
                ) : (
                  // Issue #1817 — generic fallback (city / group / area outside the
                  // special-cased journeys above): render via the shared copy contract
                  // so this pill and the panel header stat can never diverge (AC4/AC5).
                  <span>
                    {formatDiscoverBadgeCopy(discoverBadge, {
                      scopeLabel:
                        selectedArea?.areaLabel ??
                        focusedGroup?.name ??
                        (CITY_CONFIG[city]?.label ?? city),
                      noun: selectedArea ? 'homes' : 'properties',
                      searchQuery: urlState.q,
                    })}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Public-landing summary pill — bottom-center, city-wide verified total (Issue #1588).
              Issue #1607 — the area-first city landing reuses the same centred pill so the
              card "properties" stat, the map markers, and this pill all report one figure. */}
          {(resolvedPanelContent === 'guided-entry' || isAreaFirstCityLanding) && cityTotal > 0 && (
            <div className="absolute bottom-5 left-1/2 z-[1000] -translate-x-1/2" data-testid="discover-badge">
              <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-muted-foreground shadow-md">
                <MapPin className="h-[15px] w-[15px] shrink-0 text-[hsl(var(--copper))]" aria-hidden="true" />
                <span>
                  Showing{' '}
                  <strong className="font-mono font-bold tabular-nums text-foreground">
                    {cityTotal.toLocaleString()}
                  </strong>
                  {' '}verified properties across {CITY_CONFIG[city]?.label ?? city}
                </span>
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
            hasAreaSelected={!!selectedArea}
            areaLayerMaxZoom={AREA_LAYER_MAX_ZOOM}
          />

          {/* a3 — Marker popover mini card. Gated to listing-marker clicks via
              isMarkerPopoverEligible (Issue #1798 PR-C): journey !== agri-first,
              areaKey set, and (no school selected OR journey === area-first) — the
              same condition used by the click-capture gates that populate
              markerPixelPos/selectedMarkerListing, so render eligibility can never
              drift from capture eligibility again. School-first (3 desynced marker
              tiers) and agri-first (own peek/panel) are intentionally excluded.
              Area/cluster/count marker clicks never populate markerPixelPos, so they
              stay popup-free regardless. ONE popover at a time; clicking a new marker
              replaces it. Dismiss: X button (inside card), Escape key, map-background
              click (onClick on this container div). */}
          {isMarkerPopoverEligible &&
            selectedMarkerListing != null &&
            markerPixelPos != null && (
              <MarkerPopoverCard
                listing={selectedMarkerListing}
                isAuthenticated={isAuthenticated}
                markerPixelPos={markerPixelPos}
                mapContainerRef={mapContainerRef}
                onDismiss={handlePopoverDismiss}
                onViewDetails={(id) => navigate(`/listing/${id}`)}
                stepper={
                  markerPopoverStepper != null
                    ? {
                        index: markerPopoverStepper.index,
                        total: markerPopoverStepper.total,
                        onPrev: () => handleStepMarkerListing(-1),
                        onNext: () => handleStepMarkerListing(1),
                      }
                    : null
                }
                onShowInList={showMarkerInList}
              />
            )}
        </div>

        <DiscoverRightPanel
          panelContent={resolvedPanelContent}
          selectedMarkerListing={selectedMarkerListing}
          onClearAgriSelection={clearSelectedMarkerListing}
          city={city}
          cityLabel={CITY_CONFIG[city]?.label ?? city}
          journey={urlState.journey}
          activeContextChips={activeContextChips}
          areas={discoverAreas}
          selectedArea={selectedArea}
          areaListings={areaListings}
          isLoadingListings={isLoadingAreaListings}
          isAuthenticated={isAuthenticated}
          onAreaSelect={handleAreaSelect}
          // Issue #1817 (code-review follow-up) — precomputed via the shared
          // formatDiscoverBadgeCopy(discoverBadge, ...) call above (areaResultSummaryText),
          // so AreaSelectedPanel's result-summary stat can never diverge from the map badge.
          areaResultSummaryText={areaResultSummaryText}
          // schoolFirstOnBack is undefined when panelContent is not 'school-browse' or
          // 'school-selected' (i.e. Level 0), so Back correctly hides at Level 0.
          // 'school-selected' panelContent is only reachable in the school-first journey.
          onBack={urlState.journey === 'school-first' ? journeyView.schoolFirstOnBack : handleAreaFirstBack}
          onStartOver={journeyCommands.startOver}
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
          // Issue #1745 — 4-level residential Discover hierarchy
          scope={urlState.scope ?? null}
          onClearScope={() => urlActions.setScope(null)}
          // Issue #1808 — region-overview guidance signal, threaded to
          // GuidedEntryPanel (case 'guided-entry') for the panel attention
          // ring + aria-live helper on the existing JourneySwitcher section.
          regionGuideRingActive={regionGuideRingActive}
          regionGuideMarkerKind={regionOverviewMarkerKind}
          regionGuideNonce={regionSelectNonce}
          prefersReducedMotion={prefersReducedMotion}
          onRegionSelectFromPanel={() => armRegionSelect('panel')}
          summaryRegions={summaryRegions}
          onBackToRegion={(regionLabel) => {
            const targetScope = resolveScopeKeyFromLabel(regionLabel, summaryRegions);
            if (targetScope) {
              urlActions.setScope(targetScope);
            }
          }}
          // Issue #1606 — area-first results breadcrumb: resolved group name + city-crumb nav.
          // selectGroup(null) clears both groupId and areaKey in a single PUSH, returning to
          // the area-first landing (Level 1 group cards) while preserving journey=area-first.
          selectedGroupName={selectedGroupName}
          onNavigateAreaLanding={() => urlActions.selectGroup(null)}
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
          onSelectSchool={journeyCommands.selectSchoolById}
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
          onRadiusChange={journeyCommands.changeRadius}
          onClearSchool={journeyCommands.clearSchool}
          onClearArea={journeyCommands.clearArea}
          // Issue #1115 — bounded-search CTA wiring.
          onBoundedSearch={isAuthenticated ? handleBoundedSearch : undefined}
          boundedSearchTriggered={journeyView.boundedSearchTriggered}
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
          onHoverResultListing={interactionCommands.hoverListing}
          // Issue #1798 PR-B (Unit D/F) — panel↔map area-marker plumbing. Mirrors the
          // onHoverResultListing pattern above: purely ephemeral state, no camera move.
          onAreaSearchQueryChange={setAreaSearchQuery}
          onAreaHover={interactionCommands.hoverArea}
          shownAreaCount={areaMarkerCounts.shown}
          totalAreaMarkerCount={areaMarkerCounts.total}
          // Issue #1806 (FIX-5d) — non-splittable cluster click highlight signal.
          highlightedAreaKeys={highlightedAreaKeys}
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
          // Issue #1588 — public landing controls (city) + journey-card count chips.
          onCityChange={handleCityChange}
          totalProperties={cityTotal}
          areasCount={discoverAreas.filter((a) => (a.listingCount ?? 0) > 0).length}
          isCityEmpty={cityHasNoListings}
          // Issue #1597 — group-results state wiring
          onEnterGroupResults={urlActions.enterGroupResults}
          groupResultsListings={groupResultsListings}
          isLoadingGroupResults={isLoadingGroupResults}
          isGroupResultsError={isGroupResultsError}
          groupResultsTotalElements={groupResultsTotalElements}
          onRetryGroupResults={refetchGroupResults}
          onClearGroupResults={urlActions.clearGroupResults}
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
          onSchoolSelect={journeyCommands.wrappedSchoolSelect}
          radiusKm={filters.schoolRadiusKm ?? DEFAULT_SCHOOL_RADIUS_KM}
          onRadiusChange={(km) => handleFiltersChange({ ...filters, schoolRadiusKm: km })}
          boardFilter={schoolBoardFilter}
          onBoardFilterChange={handleBoardFilterChange}
          city={isCityValid ? city : null}
        />
      )}
      {/* Issue #1576 — telemetry consent banner (first-visit, undecided state only) */}
      <DiscoverConsentBanner />
      {/* Issue #1576 — persistent privacy toggle so users can revoke consent later */}
      <div className="fixed bottom-4 right-4 z-40">
        <DiscoverPrivacyToggle />
      </div>
    </PublicDiscoverLayout>
  );
}
