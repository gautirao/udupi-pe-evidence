import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * useDiscoverRegionSummary — Issue #1882 (Track A PR2 Slice S2a; purpose
 * scoping added in the ADVISORY-1 rework).
 *
 * Consumes the PUBLIC backend region-summary rollup added in PR1:
 * GET /api/discover/cities/{citySlug}/regions. This is the canonical,
 * backend-owned source for region key/label/bounds/centre/counts — it
 * REPLACES the client-side `aggregateMacroRegions` derivation (which
 * inferred macro-regions from `/api/discover/summary` + area-group
 * `region_label` string matching). Response fields are surfaced 1:1;
 * this hook performs NO client-side aggregation.
 *
 * Public/unauthenticated (`skipAuth: true`), mirroring the useAreaGroups
 * convention — region summaries are not user-specific.
 *
 * ADVISORY-1 (rework) — the backend endpoint now accepts an OPTIONAL
 * `listingPurpose` query param (canonical {sale, rent}) that filters
 * `listingCount` ONLY (geometry/membership/order/boundsStatus unchanged).
 * When omitted/undefined, the endpoint preserves its prior combined-count
 * behaviour exactly (backward compatible). `listingPurpose` is included in
 * the query key so switching buy<->rent always triggers a fresh fetch —
 * it can never silently reuse a stale count from the previous purpose.
 *
 * Issue #1910 (PR2 review fix) — a genuine backend failure (500/network
 * error/timeout) now surfaces as a real `isError`/`error` on the returned
 * query result instead of being swallowed into a fake-success
 * `{ regions: [] }`. Swallowing made a real failure visually IDENTICAL to
 * "this city legitimately has zero regions", which GuidedEntryPanel's
 * `isSummaryError` branch (and any future caller) needs to be able to tell
 * apart. `retry: false` mirrors `useRegionScopedAreaGroups`'s established
 * error-surfacing convention so a failure resolves to `isError: true`
 * promptly rather than after React Query's default retry backoff.
 */

export interface RegionSummaryBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface RegionSummaryCentre {
  lat: number;
  lon: number;
}

export interface RegionSummaryRegion {
  key: string;
  label: string;
  displayOrder: number;
  bounds: RegionSummaryBounds;
  centre: RegionSummaryCentre;
  areaCount: number;
  listingCount: number;
  countStatus: string;
  /** 'COMPLETE' when every member area contributed real geometry; 'APPROXIMATE' otherwise. */
  boundsStatus: 'COMPLETE' | 'APPROXIMATE';
  missingBoundsAreaCount: number;
}

export interface RegionSummaryResponse {
  cityId: number | null;
  citySlug: string;
  regions: RegionSummaryRegion[];
}

export const DISCOVER_REGION_SUMMARY_QUERY_KEY_BASE = ['discover-region-summary'] as const;

/**
 * Fetch the backend-owned region summary for a city slug.
 *
 * Unknown/unsupported city slugs return HTTP 200 with `{ cityId: null,
 * regions: [] }` (not a 404) — callers must handle an empty `regions` array
 * gracefully rather than treating it as an error state.
 *
 * @param listingPurpose — current Discover buy/rent selection, canonical
 * vocabulary {'sale', 'rent'} (same as DiscoverSummaryListingPurpose /
 * intentListingPurpose elsewhere in the codebase — 'buy' is never sent, it
 * maps to 'sale' at the call site). Typed as `string` (matching the
 * pre-existing `listingPurpose?: string` convention on
 * useDiscoverMapData/useAgriMapListings, etc.) so callers can pass their
 * existing intentListingPurpose value directly with no extra cast.
 * null/undefined omits the param entirely and gets the combined count.
 * Included in the query key (below) so a purpose change always refetches.
 */
export function useDiscoverRegionSummary(
  citySlug: string,
  listingPurpose?: string | null,
) {
  return useQuery<RegionSummaryResponse>({
    // listingPurpose is part of the key — switching buy<->rent produces a
    // distinct cache entry, so it can never reuse a stale count from the
    // previous purpose (it always triggers a fresh fetch, matching the
    // useDiscoverSummary convention this hook replaces).
    queryKey: [...DISCOVER_REGION_SUMMARY_QUERY_KEY_BASE, citySlug, listingPurpose ?? null],
    queryFn: async () => {
      const query = listingPurpose ? `?listingPurpose=${encodeURIComponent(listingPurpose)}` : '';
      return await api.get<RegionSummaryResponse>(
        `/api/discover/cities/${encodeURIComponent(citySlug)}/regions${query}`,
        { skipAuth: true },
      );
    },
    enabled: citySlug.length > 0,
    staleTime: 60_000,
    retry: false,
  });
}
