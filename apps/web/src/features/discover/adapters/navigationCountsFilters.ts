import type { DiscoverNavigationCountsFilters } from '@/hooks/useDiscoverNavigationCounts';
import type { DiscoverUrlFilters } from '@/hooks/useDiscoverUrlState';

/**
 * Issue #2142 Commit 2 — moved verbatim out of MapDiscovery.tsx.
 *
 * Issue #2083 RC_C fix: the FULL filter set for navigation destination
 * counts, not purpose alone. Before this fix `useAreasNavigationJourney` was
 * called with no `filters` key at all, so it fell back to the hook's
 * EMPTY_FILTERS default and the counts endpoint was ALWAYS requested
 * blended (Buy and Rent produced byte-identical counts). `filters` here is
 * the SAME URL filter state every other Discover data hook reads; the
 * fields below are exactly the ones `DiscoverNavigationCountsFilters` (and
 * the shared `DiscoverListingPredicateBuilder` behind it) already accept.
 */
export function buildNavigationCountsFilters(
  purpose: string,
  filters: DiscoverUrlFilters,
): DiscoverNavigationCountsFilters {
  return {
    purpose,
    propertyTypes: filters.propertyTypes,
    bedrooms: filters.bedrooms,
    sellerTypes: filters.sellerTypes,
    readyToMove: filters.readyToMove,
    reraRegistered: filters.reraRegistered,
    newToMarket: filters.newToMarket,
    backOnMarket: filters.backOnMarket,
  };
}
