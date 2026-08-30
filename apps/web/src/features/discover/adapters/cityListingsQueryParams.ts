import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverCityListingsParams } from '@/hooks/useDiscoverCityListings';

type BuiltCityListingsQueryParams = Pick<
  DiscoverCityListingsParams,
  'city' | 'areaKeys' | 'limitPerArea' | 'propertyType' | 'bedrooms' | 'minPrice' | 'maxPrice' | 'listingPurpose' | 'q'
>;

/**
 * Issue #2142 Commit 2 — moved verbatim out of MapDiscovery.tsx.
 *
 * Two call sites (the anon group-results teaser query and the anon
 * node-listings/bounded-Browse teaser query) independently built this exact
 * same params shape for `useDiscoverCityListings`, differing only in
 * whether a `q` (debounced search) value was threaded through. Both moved
 * verbatim here — no logic changed.
 *
 * `useDiscoverCityListings` only accepts a single `propertyType`/`bedrooms`
 * value; the first value from `PropertyFilters`' array fields is forwarded
 * and remaining values are filtered client-side elsewhere
 * (`applyAnonPropertyFilters`) — this adapter does not change that
 * limitation, only relocates the params-construction expression.
 *
 * Per-area teaser cap: the backend clamps server-side to MAX_LIMIT=20 per
 * area (CityAreaListingsService.java `Math.min(raw, 20)`), so `limitPerArea`
 * is always 20 here regardless of caller — the anon path is a teaser, not a
 * full paginated view.
 *
 * priceMin/priceMax are converted from rupees (`PropertyFilters`' unit) to
 * paise (the backend's unit) — same conversion at both original call sites.
 */
export function buildCityListingsQueryParams(
  city: string,
  areaKeys: string[],
  filters: PropertyFilters,
  listingPurpose: string,
  q?: string,
): BuiltCityListingsQueryParams {
  return {
    city,
    areaKeys,
    limitPerArea: 20,
    propertyType: filters.propertyTypes?.[0],
    bedrooms: filters.bedrooms?.[0],
    minPrice: filters.priceMin != null ? filters.priceMin * 100 : undefined,
    maxPrice: filters.priceMax != null ? filters.priceMax * 100 : undefined,
    q,
    listingPurpose,
  };
}
