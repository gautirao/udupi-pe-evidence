import type { PropertyFilters } from '@/hooks/usePropertyListings';

/**
 * Issue #2658 (C1) — pure extraction of usePropertyFilterGroups'
 * `hasPropertyFilters` (Issues #2450, #2555, #2023 code-review follow-up).
 *
 * Asymmetric by design, not by accident:
 * - `propertyTypes` / `commercialSubtypes` / `bedrooms`: truthy-length checks.
 * - `priceMin` / `priceMax`: truthy checks — `0` does NOT count as a filter.
 * - `areaMinSqft` / `areaMaxSqft`: `!= null` checks — `0` DOES count, because
 *   an explicit 0 sq ft bound is still a real (if odd) narrowing, unlike a
 *   price of 0 which reads as "no price entered".
 * - `readyToMove`: counts only when the calling surface's listings hook can
 *   actually filter on it (`isReadyToMoveSupported`); otherwise a
 *   stale/URL-carried value must not drive "filters are active" copy.
 */
export const hasPropertyFilters = (
  filters: PropertyFilters,
  { isReadyToMoveSupported = true }: { isReadyToMoveSupported?: boolean } = {},
): boolean =>
  Boolean(
    filters.propertyTypes?.length ||
      filters.commercialSubtypes?.length ||
      filters.bedrooms?.length ||
      filters.priceMin ||
      filters.priceMax ||
      filters.areaMinSqft != null ||
      filters.areaMaxSqft != null ||
      (isReadyToMoveSupported && filters.readyToMove),
  );
