import { useMemo } from 'react';
import {
  deriveDiscoverBadge,
  formatDiscoverBadgeCopy,
} from '@/features/discover/selectors/badgeCopy';
import { useDiscoverBadgeAnnounce } from '@/features/discover/presentation/useDiscoverBadgeAnnounce';
import { deriveSchoolRadiusPillNoun } from '@/features/discover/presentation/schoolFirstCounts';
import { hasActiveAnonPropertyFilter } from '@/features/discover/presentation/anonPropertyFilters';
import { CITY_CONFIG } from '@/lib/localityUtils';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { SchoolRadiusListingItem } from '@/hooks/useSchoolRadiusListings';

export interface UseDiscoverBadgeControllerParams {
  effectiveSelectedArea: AreaPoint | null;
  focusedGroup: AreaGroup | null;
  groupId: string | null;
  discoverAreas: AreaPoint[];
  city: string;
  filters: PropertyFilters;
  areaListings: DiscoverCityListingItem[];
  isLoadingAreaListings: boolean;
  listingDataLoading: boolean;
  isAuthenticated: boolean;
  schoolListings: DiscoverCityListingItem[];
  schoolRadiusListings: SchoolRadiusListingItem[];
  schoolRadiusListingsLoading: boolean;
  /** Local 250 ms debounce — NOT nav.q. See the split-brain note below. */
  debouncedSearch: string;
  /** The URL keyword — drives copy suffixes and ActiveContextChips. */
  navQ: string;
  intent: string | null;
}

/**
 * Issue #2142 (correction pass) — THE SINGLE OWNER of Discover's result-count
 * badge, moved verbatim off MapDiscovery.tsx.
 *
 * Issue #1817's whole point is that the map badge and the panel's
 * result-summary stat can never diverge: exactly one `deriveDiscoverBadge`
 * call, and every rendered string derived from that one selector result.
 * On the page those pieces were spread over ~1,000 lines, with the two
 * map-only copy strings computed AFTER the city-validity early return.
 * Co-locating them makes the "cannot fork" property structural rather than
 * a comment.
 *
 * Owns: cityTotal, groupListingsCount, schoolRadiusActive, discoverBadge,
 * areaResultSummaryText (map + panel), announcedBadgeText (the a11y mirror),
 * groupSelectedBadgeCopy / fallbackBadgeCopy (map only),
 * schoolRadiusPillNoun, hasActiveAnonFilter.
 *
 * KNOWN, INTENTIONAL split-brain (do NOT unify): the COUNT reads
 * `debouncedSearch`; the COPY's search suffix and ActiveContextChips read
 * `nav.q`. See useDiscoverSearchState's header comment.
 */
export function useDiscoverBadgeController({
  effectiveSelectedArea,
  focusedGroup,
  groupId,
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
  navQ,
  intent,
}: UseDiscoverBadgeControllerParams) {
  // Discover count source of truth: /api/discover/areas (public, no auth).
  // cityTotal is the sum of per-area listingCount (live LIVE+not-archived+not-duplicate).
  // Do NOT use auth-gated Supabase arrays (listingsWithCoords / filteredListings)
  // for public Discover empty-state or city count display.
  const cityTotal = useMemo(
    () => discoverAreas.reduce((sum, a) => sum + (a.listingCount ?? 0), 0),
    [discoverAreas],
  );

  // Issue #1175 v3 — group aggregate count for the badge.
  // Only active when groupId is set and no area/school is selected (those take precedence).
  // null  = group metadata still loading (isLoadingAreaGroups=true).
  // O(k) where k = member area count (bounded, typically 2–6).
  const groupListingsCount = useMemo((): number | null | undefined => {
    if (!groupId) return undefined;          // no group active
    if (!focusedGroup) return null;                   // null when areaGroupsData still loading OR when groupId no longer exists — both intentionally hide the badge
    // Use a Set for O(1) membership checks → overall O(N + k) not O(N·k)
    const memberKeySet = new Set(focusedGroup.area_keys);
    return discoverAreas
      .filter((a) => memberKeySet.has(a.areaKey))
      .reduce((sum, a) => sum + (a.listingCount ?? 0), 0);
  }, [groupId, focusedGroup, discoverAreas]);

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
        // `effectiveSelectedArea` bridges both sources.
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
    //
    // Issue #2142 (correction pass) — the page carried an
    // `eslint-disable-next-line react-hooks/exhaustive-deps` here. It is
    // dropped, not moved: with every input now an explicit controller param,
    // the rule reports no problem, and keeping a dead suppression would hide a
    // real future violation.
    [effectiveSelectedArea, filters, isLoadingAreaListings, listingDataLoading, isAuthenticated, schoolRadiusListingsLoading, cityTotal, areaListings, schoolRadiusActive, schoolListings.length, groupListingsCount, debouncedSearch, schoolRadiusListings.length],
  );

  // Issue #1817 (code-review follow-up) — single computed copy string for the
  // area-selected scope, shared verbatim by the map badge (isAreaFirstSelectedAreaState
  // branch) AND the AreaSelectedPanel result-summary stat (via DiscoverRightPanel
  // → AreaSelectedPanel's `areaResultSummaryText` prop), so the two surfaces can never
  // diverge — exactly one call to formatDiscoverBadgeCopy, exactly one selector
  // (discoverBadge) behind it.
  // Issue #2083 (diagnose-then-fix cycle 3, RC_B recurrence) — was gated on the
  // bare `selectedArea`, which is null under the canonical `node=` journey, so
  // this string was null at a resolved node-journey AREA leaf and the map badge
  // fell through to the generic zero-state/fallback copy instead of area-scoped
  // text (e.g. missing the area's own name in a genuine zero-listing result).
  const areaResultSummaryText = useMemo(
    () =>
      effectiveSelectedArea
        ? formatDiscoverBadgeCopy(discoverBadge, {
            scopeLabel: effectiveSelectedArea.areaLabel,
            noun: 'verified properties',
            searchQuery: navQ,
          })
        : null,
    [effectiveSelectedArea, discoverBadge, navQ],
  );

  // Issue #1817 (AC11) — debounced, polite result-count announcement. A visually-hidden
  // mirror of the badge copy, updated ~500ms after the badge SETTLES (not while loading),
  // so screen-reader users hear one announcement per fetch settle — never per keystroke,
  // never mid-refetch.
  // Issue #1824 Slice S10a — the debounced state/effect body lives in
  // useDiscoverBadgeAnnounce.
  const announcedBadgeText = useDiscoverBadgeAnnounce({
    discoverBadge,
    // Issue #2083 (F2 class sweep) — same defect as the visible badge above:
    // this is the a11y-announced MIRROR of that same copy, and it derives
    // its own scopeLabel independently (useDiscoverBadgeAnnounce.ts) rather
    // than reusing a shared string, so it needs the SAME bridge or a
    // screen-reader user hears "properties in Bangalore" while a sighted
    // user sees the area-scoped copy.
    selectedArea: effectiveSelectedArea,
    focusedGroup,
    city,
    urlStateQ: navQ,
  });

  // Issue #1824 Slice S8 — the DiscoverMapCountBadge/DiscoverMapStatusHints
  // copy-fork guard (AC4): the SAME formatDiscoverBadgeCopy()/
  // deriveSchoolRadiusPillNoun()/hasActiveAnonPropertyFilter() calls that
  // previously lived inline in the page's JSX, computed once here and passed
  // by prop — the extracted components never import these helpers, so the copy
  // contract cannot fork (slice-s8-design.md FLAG-A/B).
  //
  // Issue #2142 (correction pass) — these two used to be computed AFTER
  // MapDiscovery.tsx's `if (!isCityValid) return` early exit. They are pure
  // string formatting over already-computed values, so hoisting them above
  // that gate (which now lives in the composition hook) is behaviour-neutral.
  const groupSelectedBadgeCopy = formatDiscoverBadgeCopy(discoverBadge, {
    scopeLabel: focusedGroup?.name ?? '',
    noun: 'verified properties',
    searchQuery: navQ,
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
    searchQuery: navQ,
  });
  const schoolRadiusPillNoun = deriveSchoolRadiusPillNoun(intent);
  const hasActiveAnonFilter = hasActiveAnonPropertyFilter(filters);

  return {
    cityTotal,
    groupListingsCount,
    schoolRadiusActive,
    discoverBadge,
    areaResultSummaryText,
    announcedBadgeText,
    groupSelectedBadgeCopy,
    fallbackBadgeCopy,
    schoolRadiusPillNoun,
    hasActiveAnonFilter,
  };
}
