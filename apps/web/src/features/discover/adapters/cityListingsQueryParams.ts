import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverCityListingsParams } from '@/hooks/useDiscoverCityListings';

type BuiltCityListingsQueryParams = Pick<
  DiscoverCityListingsParams,
  | 'city'
  | 'areaKeys'
  | 'limitPerArea'
  | 'propertyType'
  | 'commercialSubtypes'
  | 'bedrooms'
  | 'minPrice'
  | 'maxPrice'
  // Issue #2555 — the AREA (SQ FT) axis. Like `commercialSubtypes` before it, this was
  // not merely dropped on the anon path: absent from this Pick<> union it was
  // UNREPRESENTABLE, so a committed area bound could not be expressed here at all.
  | 'areaMinSqft'
  | 'areaMaxSqft'
  | 'listingPurpose'
  | 'q'
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
 * Issue #2531 — `commercialSubtypes` is forwarded too. Before this it was not merely
 * dropped, it was UNREPRESENTABLE: the Pick<> union above had no such member, so a
 * committed Commercial subtype could not be expressed on the anon path at all and the
 * backend (which has accepted the param since #2509) returned every commercial family.
 * Forwarded independently of `propertyType` because a Commercial selection rides the
 * subtype axis ALONE — gating it on `propertyTypes` being set would re-drop it.
 *
 * BEDROOMS ARE NOT GATED HERE, deliberately — do not read that as an oversight. #2527 asks the
 * anon path to reuse the shared `shouldSubmitBedrooms` predicate rather than grow a second
 * implementation, and #2531 added that call one layer down, inside `useDiscoverCityListings`. That
 * is the last point before the URL is built and the one function all six production call sites
 * funnel through, so a single gate cannot drift and a future call site inherits it; gating here
 * PLUS the four direct call sites would be five places to keep in step — the "N sites, not N-1"
 * shape #2531 exists to remove. So this adapter still RETURNS `bedrooms` for a plot-only or
 * commercial-only selection; the hook is what declines to emit it.
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
    commercialSubtypes: filters.commercialSubtypes?.length ? filters.commercialSubtypes : undefined,
    bedrooms: filters.bedrooms?.length ? filters.bedrooms : undefined,
    minPrice: filters.priceMin != null ? filters.priceMin * 100 : undefined,
    maxPrice: filters.priceMax != null ? filters.priceMax * 100 : undefined,
    // Issue #2555 — forwarded in SQUARE FEET, unconverted. Unlike price above, this axis
    // has no unit change at the boundary: `PropertyFilters` holds sq ft and the backend
    // compares sq ft (`AreaBoundsParam`), so a `* 100` here would be a 100x narrowing.
    //
    // Forwarded unconditionally, with no applicability gate. That is NOT the `bedrooms`
    // shape documented above: bedrooms are suppressed for plot-only/commercial-only
    // selections because such rows carry `bedrooms` NULL, so the predicate can only ever
    // match nothing. An area bound has no such shape — #2459 resolves the column PER ROW
    // (built-up / plot / warehouse), so every property shape has a comparable quantity and
    // there is nothing to suppress.
    areaMinSqft: filters.areaMinSqft,
    areaMaxSqft: filters.areaMaxSqft,
    q,
    listingPurpose,
  };
}
