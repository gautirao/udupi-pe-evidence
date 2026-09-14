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
 * Issue #2533 — `useDiscoverCityListings` now accepts the FULL
 * `propertyType`/`bedrooms` selection and sends it as repeated params, so this
 * adapter forwards `PropertyFilters`' arrays whole. It previously forwarded
 * only the first value of each and left the rest to a client-side pass
 * (`applyAnonPropertyFilters`), which under-included: the server's
 * 20-per-area teaser cap was applied to the over-broad single-value result set
 * before the client narrowed it.
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
    propertyType: filters.propertyTypes?.length ? filters.propertyTypes : undefined,
    bedrooms: filters.bedrooms?.length ? filters.bedrooms : undefined,
    minPrice: filters.priceMin != null ? filters.priceMin * 100 : undefined,
    maxPrice: filters.priceMax != null ? filters.priceMax * 100 : undefined,
    q,
    listingPurpose,
  };
}
