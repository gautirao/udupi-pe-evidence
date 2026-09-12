import type { DiscoverNavigationCountsFilters } from '@/hooks/useDiscoverNavigationCounts';
import type { DiscoverUrlFilters } from '@/hooks/useDiscoverUrlState';
import { shouldSubmitBedrooms } from '@/features/discover/filters/bedroomApplicability';

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
    // Issue #2459 AC2 — a plot-only OR commercial-only selection submits NO bedroom predicate here
    // either (BOTH sentences of the rule; see bedroomApplicability.ts).
    //
    // The counts endpoint sits behind the SAME `DiscoverListingPredicateBuilder` as listings and
    // markers (see this function's header), so a bedroom constraint applied here but suppressed
    // there would make a destination advertise a count its own result list cannot produce.
    // Suppressing at only the two `/api/discover/{listings,markers}` call sites would have been
    // WORSE than the original defect: before AC2 every path emitted bedrooms — wrong, but
    // consistent — whereas a partial fix invents a disagreement that did not previously exist.
    //
    // The predicate is read from the INPUT `DiscoverUrlFilters`, which still carries
    // `commercialSubtypes`, even though this adapter does not forward that field onward. A
    // commercial selection narrowed to LAND is therefore correctly recognised as plot-only — and
    // an UNNARROWED commercial selection is suppressed by the commercial-only half regardless,
    // which is why that half does not depend on the subtype reaching this adapter at all.
    bedrooms: shouldSubmitBedrooms(filters) ? filters.bedrooms : undefined,
    sellerTypes: filters.sellerTypes,
    readyToMove: filters.readyToMove,
    reraRegistered: filters.reraRegistered,
    newToMarket: filters.newToMarket,
    backOnMarket: filters.backOnMarket,
  };
}
