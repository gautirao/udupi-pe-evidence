/**
 * Property-filter reset helpers shared by SchoolSelectedPanel and
 * AreaSchoolCombinedPanel — extracted verbatim from SchoolJourneyPanels.tsx
 * (Issue #2661 commit 2, pure-function extraction, no logic changes).
 */
import type { PropertyFilters } from '@/hooks/usePropertyListings';

/**
 * Intentionally scoped to the four filters surfaced in the "Clear filters" chip
 * (price range, bedrooms, property types). Toggle filters (sellerTypes, backOnMarket,
 * newToMarket, reraRegistered, readyToMove) are not shown in this panel's chip row
 * and are excluded by design.
 */
export function hasActiveSchoolPropertyFilters(filters: PropertyFilters): boolean {
  return Boolean(
    filters.propertyTypes?.length ||
    filters.bedrooms?.length ||
    filters.priceMin != null ||
    filters.priceMax != null,
  );
}

/** Clears the four property-filter keys above, preserving every other field (in
 * particular the school-proximity fields: schoolLat/schoolLon/schoolRadiusKm). */
export function clearSchoolPropertyFilters(filters: PropertyFilters): PropertyFilters {
  return {
    ...filters,
    propertyTypes: undefined,
    bedrooms: undefined,
    priceMin: undefined,
    priceMax: undefined,
  };
}
