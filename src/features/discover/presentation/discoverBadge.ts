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
