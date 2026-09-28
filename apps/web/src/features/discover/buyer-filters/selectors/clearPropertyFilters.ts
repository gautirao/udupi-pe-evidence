import type { PropertyFilters } from '@/hooks/usePropertyListings';

/**
 * Issue #2658 (C1) — pure extraction of usePropertyFilterGroups'
 * `handleClearPropertyFilters` EMISSION (Issues #2450, #2555 fifth-cycle
 * review). Family-override/memory reset is a CONTROLLER concern (C2), not a
 * pure-selector one — this returns only the next filters object.
 *
 * "Clear filters" promises a fully unfiltered state: every axis this panel
 * owns is wiped, including the context filters (localities, sellerTypes,
 * back/newToMarket, rera) that predate this issue but share the same
 * promise. Wiping only propertyTypes/bedrooms/price and leaving e.g.
 * `areaMinSqft` in place would be a "Clear filters" that does not clear.
 *
 * Also replaces DiscoverMapCanvas's independent 3rd instance of this same
 * emission shape (see the architect's plan, section 2) — that migration
 * lands in C4.
 */
export const clearPropertyFilters = (filters: PropertyFilters): PropertyFilters => ({
  ...filters,
  propertyTypes: undefined,
  commercialSubtypes: undefined,
  bedrooms: undefined,
  priceMin: undefined,
  priceMax: undefined,
  areaMinSqft: undefined,
  areaMaxSqft: undefined,
  localities: undefined,
  sellerTypes: undefined,
  backOnMarket: undefined,
  newToMarket: undefined,
  reraRegistered: undefined,
  readyToMove: undefined,
});
