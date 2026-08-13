import { useDiscoverListings } from '@/hooks/useDiscoverListings';
import { useDiscoverFilteredMarkers } from '@/hooks/useDiscoverFilteredMarkers';
import { useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';
import { useDiscoverGroupResults } from '@/features/discover/presentation/useDiscoverGroupResults';
import { resolveActiveDiscoverGroup } from '@/features/discover/selectors/mapLayerCategory';
import { buildCityListingsQueryParams } from '@/features/discover/adapters/cityListingsQueryParams';
import type { useAreaGroups } from '@/hooks/useAreaGroups';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverPanelContent } from '@/features/discover/selectors/panelContent';

export interface UseDiscoverResultsControllerParams {
  panelContent: DiscoverPanelContent;
  city: string;
  groupId: string | null | undefined;
  areaGroupsData: ReturnType<typeof useAreaGroups>['data'];
  intentListingPurpose: string;
  urlDiscoverFilters: PropertyFilters;
  isAuthenticated: boolean;
}

/**
 * Issue #2142 Commit 3 (C3, per approved plan) — moved verbatim out of
 * MapDiscovery.tsx. Wraps the group-results triad
 * (useDiscoverListings/useDiscoverFilteredMarkers authed +
 * useDiscoverCityListings anon, the latter via the `cityListingsQueryParams`
 * adapter from Commit 2) + useDiscoverGroupResults (unchanged, unifies the
 * auth/anon split into one surface).
 *
 * Called EARLY (before useDiscoverPageState/`city` resolves in the
 * pre-refactor page) — `panelContent` is computed even earlier at the top
 * of the component, and `areaGroupsData` (from the page-level `useAreaGroups`
 * call, itself called early because THIS controller needs it early) is
 * available by this point too. Self-contained otherwise (`urlDiscoverFilters`
 * is a page-level useMemo with no dependency on `city`).
 */
export function useDiscoverResultsController({
  panelContent,
  city,
  groupId,
  areaGroupsData,
  intentListingPurpose,
  urlDiscoverFilters,
  isAuthenticated,
}: UseDiscoverResultsControllerParams) {
  // Issue #1597 — group-results state: server-filtered listings + markers across all
  // child areas of the selected area-group. Queries gate on:
  //   1. panelContent === 'area-group-results' (avoid fetching in drill-down or other states)
  //   2. Resolved area_keys from the already-loaded areaGroupsData (prevents cold-load leak)
  //   3. area_keys.length > 0 (empty-areaKeys guard -> hook's enabled guard handles 400 prevention)
  //
  // Cold-load safety: areaGroupsData resolves before panelContent routes to 'area-group-results'
  // because derivePanelContent only routes there when groupId is present; groupId drives
  // the useAreaGroups fetch; when areaGroupsData has loaded, the resolved group is present.
  const isGroupResultsState = panelContent === 'area-group-results';
  const resolvedGroupForResults = isGroupResultsState
    ? resolveActiveDiscoverGroup(areaGroupsData?.groups, groupId)
    : null;
  const resolvedGroupAreaKeys: string[] = resolvedGroupForResults?.area_keys ?? [];

  // ── Authenticated path: /api/discover/listings (paginated, fully filtered) ──
  const {
    data: groupResultsAuthedData,
    isLoading: isLoadingGroupResultsAuthed,
    isError: isGroupResultsErrorAuthed,
    refetch: refetchGroupResultsAuthed,
  } = useDiscoverListings({
    city,
    page: 0,
    size: 50,
    filters: urlDiscoverFilters,
    enabled: isGroupResultsState && isAuthenticated,
    listingPurpose: intentListingPurpose,
    areaKeys: isGroupResultsState ? resolvedGroupAreaKeys : undefined,
  });

  // ── Authenticated path: /api/discover/markers (full predicate, list+map consistent) ──
  // Issue #1597 — use useDiscoverFilteredMarkers (-> /api/discover/markers) rather than
  // useDiscoverMarkers (-> /api/listings/markers) because the public endpoint silently
  // ignores areaKeys and property filters. bbox=null: group-results show all matching
  // markers regardless of viewport.
  const { data: groupResultsMarkersData } = useDiscoverFilteredMarkers(
    city,
    urlDiscoverFilters,
    isGroupResultsState && isAuthenticated,
    null,
    undefined,
    intentListingPurpose,
    undefined,
    isGroupResultsState ? resolvedGroupAreaKeys : undefined,
  );

  // ── Anonymous path: /api/discover/cities/{city}/listings (public, multi-areaKeys) ──
  // Per-area teaser cap: the backend clamps server-side to MAX_LIMIT=20 per area, so anon
  // users see <=20 listings/area regardless of limitPerArea — an ACCEPTED, documented
  // limitation (the anon path is a teaser, not a full paginated view).
  const anonGroupFilters = urlDiscoverFilters;
  const {
    data: groupResultsAnonData,
    isLoading: isLoadingGroupResultsAnon,
    isError: isGroupResultsErrorAnon,
    refetch: refetchGroupResultsAnon,
  } = useDiscoverCityListings(
    buildCityListingsQueryParams(
      city,
      isGroupResultsState && !isAuthenticated ? resolvedGroupAreaKeys : [],
      anonGroupFilters,
      intentListingPurpose,
    ),
  );

  // Issue #1824 Slice S11b (C2) — anon/auth group-results derivation lifted into
  // useDiscoverGroupResults (unchanged).
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

  return {
    isGroupResultsState,
    resolvedGroupForResults,
    resolvedGroupAreaKeys,
    groupResultsListings,
    groupResultsTotalElements,
    isLoadingGroupResults,
    isGroupResultsError,
    refetchGroupResults,
    groupResultsMarkers,
  };
}
