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
 * @param limit - Optional max candidates; server default 6, clamped [1,12].
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
  limit?: number,
) {
  const source = useDiscoverSource();
  const sortedSelected = [...selected].sort();

  return useQuery<NearbyAreaCandidatesResponse>({
    queryKey: discoverKey(source, 'discover-nearby-area-candidates', city, sortedSelected, filters, limit ?? null),
    queryFn: () => {
      const params = buildDiscoverSearchParams({ city, filters });
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
