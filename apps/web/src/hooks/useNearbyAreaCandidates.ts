import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { buildDiscoverSearchParams } from '@/lib/discoverSearchParams';
import { useDiscoverSource, discoverKey } from '@/features/discover/state/DiscoverDataSourceContext';

export interface NearbyAreaCandidate {
  areaKey: string;
  name: string;
  geoCenterLat: number;
  geoCenterLon: number;
  eligibleListingCount: number;
  schoolCount: number;
}

export interface NearbyAreaCandidatesResponse {
  city: string;
  selectedAreaKeys: string[];
  candidates: NearbyAreaCandidate[];
}

/** Options for {@link useNearbyAreaCandidates}; see that hook's doc for each field. */
export interface NearbyAreaCandidatesOptions {
  listingPurpose?: string;
  limit?: number;
}

/**
 * Issue #2017 code-review Finding 2 (PR #2424) — bounded, filter-aware
 * "nearby area" suggestions for the AREA_SET multi-area chip strip, backed
 * by `GET /api/discover/areas/nearby-candidates` (NearbyAreaCandidatesController).
 * Replaces the pure client-side `selectNearbyAreaSuggestions` selector, which
 * was unbounded relative to eligibility (ignored active discover filters and
 * per-area listing counts) — the backend pre-excludes `selected` and
 * pre-ranks/filters candidates server-side; this hook must NOT re-filter or
 * re-rank the response.
 *
 * @param city - City identifier. Empty string disables the query.
 * @param selected - Currently-selected/draft area keys, pre-exclusion input.
 *   Sorted before entering the queryKey so key REORDERING (e.g. removing then
 *   re-adding in a different order) doesn't spuriously invalidate the cache.
 * @param filters - Active discover filters (same shape/serialization as
 *   DiscoverListingsController's query, via buildDiscoverSearchParams) —
 *   included in the queryKey so a filter change correctly busts the cache.
 * @param options.listingPurpose - The buy/rent purpose the listings query sends (`'sale'` |
 *   `'rent'`, via `useDiscoverPageContext().intentListingPurpose`). Issue #2456: the endpoint
 *   applies it through the same `DiscoverListingPredicateBuilder` as the listings query, so it
 *   MUST match the listings request or `eligibleListingCount` admits rent listings into a Buy
 *   search — the fixture's two ₹0 rent rows at RR Nagar inflated the count before this existed.
 *   Part of the query key so switching Buy ↔ Rent refetches. Same shape as
 *   `useRelaxationPreviews`' options after PR #2457.
 * @param options.limit - Optional max candidates; server default 6, clamped [1,12].
 *
 * LIVE MODE ONLY: `NearbyAreaCandidatesController` has no admin
 * city-launch-preview counterpart (unlike the `areas`/`markers`/`listings`
 * endpoints in `DiscoverDataSourceContext.discoverPath`), so this hook is
 * disabled outright when `useDiscoverSource()` is in `preview` mode — see
 * that file's doc comment: "callers MUST gate `enabled` on
 * `source.mode === 'preview'`" for any endpoint kind with no meaningful
 * preview branch. The AREA_SET multi-area picker is not reachable from the
 * admin preview surface today, so an empty `candidates: []` result is the
 * correct behaviour there, not a wrong-endpoint call.
 */
export function useNearbyAreaCandidates(
  city: string,
  selected: string[],
  filters: PropertyFilters,
  options: NearbyAreaCandidatesOptions = {},
) {
  const { listingPurpose, limit } = options;
  const source = useDiscoverSource();
  const sortedSelected = [...selected].sort();

  return useQuery<NearbyAreaCandidatesResponse>({
    queryKey: discoverKey(
      source,
      'discover-nearby-area-candidates',
      city,
      sortedSelected,
      filters,
      listingPurpose ?? null,
      limit ?? null,
    ),
    queryFn: () => {
      const params = buildDiscoverSearchParams({ city, filters, listingPurpose });
      sortedSelected.forEach((areaKey) => params.append('selected', areaKey));
      if (limit != null) {
        params.set('limit', String(limit));
      }
      const path = `/api/discover/areas/nearby-candidates?${params.toString()}`;
      return api.get<NearbyAreaCandidatesResponse>(path, { skipAuth: true });
    },
    enabled: city.length > 0 && source.mode === 'live',
    // Shorter than useDiscoverAreas's 300s staleTime — this hook must react
    // promptly to selection/filter changes while the picker is open, not
    // stay pinned to a stale suggestion list.
    staleTime: 30_000,
  });
}
