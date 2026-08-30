import { useCallback, useMemo, useState } from 'react';
import { useDiscoverRegionSummary } from '@/hooks/useDiscoverRegionSummary';
import { useRegionScopedAreaGroups } from '@/hooks/useRegionScopedAreaGroups';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { resolveScope, type ScopeNamespaces } from '@/features/discover/selectors/listingScope';
import { labelToSlug } from '@/utils/macroRegionResolver';
import type { DiscoverSummaryRegion } from '@/hooks/useDiscoverSummary';
import type { useAreaGroups } from '@/hooks/useAreaGroups';

export interface UseDiscoverGeographyControllerParams {
  /** From useDiscoverPageState() — the DEFAULTED city. */
  city: string;
  /** `city in CITY_CONFIG`, computed at the page level (gates the page's own early return too). */
  isCityValid: boolean;
  /** Raw nav.city (pre-DEFAULT_CITY fallback), used for the region-scoped-groups fetch idiom. */
  navCity: string;
  /** Raw nav.scope. */
  scope: string | null | undefined;
  intentListingPurpose: string;
  /** From the page-level useAreaGroups() call (needed early by useDiscoverResultsController too). */
  areaGroupsData: ReturnType<typeof useAreaGroups>['data'];
}

/**
 * Issue #2142 Commit 3 (C1, per approved plan) — moved verbatim out of
 * MapDiscovery.tsx. Wraps useDiscoverRegionSummary (+ summaryRegions
 * derivation), scopeNamespaces/resolvedUrlScope (via the `listingScope`
 * selector from Commit 2), useRegionScopedAreaGroups, and useDiscoverAreas
 * (discoverAreasForPanel).
 *
 * Deliberately does NOT wrap `useAreaGroups` — that call stays at the page
 * level because `useDiscoverResultsController` also needs `areaGroupsData`
 * EARLY (before `city` resolves, for its group-results derivation), while
 * everything in THIS controller needs `city`/`intentListingPurpose` (only
 * available after useDiscoverPageState) — the two halves of what the
 * pre-refactor page treated as one contiguous "geography" section actually
 * have different ordering constraints. `areaGroupsData` is threaded in here
 * as an input rather than re-fetched.
 *
 * Deliberately does NOT wrap `useRegionalAreaGroups`/corridorGroups either —
 * documented deviation from the architect's original sketch (which placed
 * it here): it's consumed only by agri-specific derivation
 * (selectedCorridorData/selectedTierData/useAgriMapListings), so it moves to
 * useDiscoverAgriController (C6, second batch) instead — cohesion-by-consumer
 * over textual-proximity-in-the-old-page, approved by team-lead as an
 * in-scope implementation refinement (no file-family/API/migration/invariant
 * implication).
 *
 * Called AFTER `city` resolves (from useDiscoverPageState) — same position
 * as its pre-refactor call sites.
 */
export function useDiscoverGeographyController({
  city,
  isCityValid,
  navCity,
  scope,
  intentListingPurpose,
  areaGroupsData,
}: UseDiscoverGeographyControllerParams) {
  // Issue #1882 (Track A PR2 Slice S2c) — backend-owned region summary for the
  // journeyless-landing macro-region bubbles, sourced from the PUBLIC
  // GET /api/discover/cities/{citySlug}/regions rollup.
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
    // name/label fallback that plain `groupSlugs` membership does not
    // reproduce, since a group's `id` (DB `slug`) is not always literally
    // `labelToSlug(name)`.
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

  // Issue #1910 (PR2) — region-scoped area-group projection, enabled ONLY
  // when the active nav.scope resolves to a REGION.
  const resolvedUrlScope = useMemo(
    () => resolveScope(scope ?? null, scopeNamespaces),
    [scope, scopeNamespaces],
  );
  const regionScopeKeyForFetch = resolvedUrlScope.kind === 'region' ? resolvedUrlScope.regionKey : null;
  const {
    data: regionScopedGroupsData,
    isLoading: isLoadingRegionScopedGroups,
    // Issue #1910 (PR2 review fix, Finding 3) — surface the real fetch-error
    // state so AreaGroupsLandingPanel can show an honest error+retry UI.
    isError: isRegionScopedGroupsError,
    refetch: refetchRegionScopedGroups,
  } = useRegionScopedAreaGroups(navCity, regionScopeKeyForFetch, intentListingPurpose);

  // Issue #1489 — SchoolGroupAreasPanel (school-first L2) and
  // AreaGroupsLandingPanel (area-first L2) both expect DiscoverArea[] (has
  // `name`). Called with the SAME React Query key ['discover-areas', city]
  // so this hits the cache — zero extra HTTP request.
  const { data: _areasDataForPanel } = useDiscoverAreas(isCityValid ? city : '');
  const discoverAreasForPanel = _areasDataForPanel?.areas ?? [];

  // "Showing X of N areas on the map" — sourced from AreaMarkerLayer's own
  // onMarkersComputed callback (never fetched/fabricated independently).
  //
  // Issue #2142 (correction pass) — moved here from MapDiscovery.tsx. It is a
  // report-up of how many AREA markers the map actually rendered, which is
  // this controller's own subject matter; the panel is its only reader.
  const [areaMarkerCounts, setAreaMarkerCounts] = useState<{ shown: number; total: number }>({
    shown: 0,
    total: 0,
  });
  const handleAreaMarkersComputed = useCallback((shown: number, total: number) => {
    setAreaMarkerCounts((prev) => (prev.shown === shown && prev.total === total ? prev : { shown, total }));
  }, []);

  return {
    areaMarkerCounts,
    handleAreaMarkersComputed,
    summaryRegions,
    scopeNamespaces,
    resolvedUrlScope,
    regionScopedGroupsData,
    isLoadingRegionScopedGroups,
    isRegionScopedGroupsError,
    refetchRegionScopedGroups,
    discoverAreasForPanel,
  };
}
