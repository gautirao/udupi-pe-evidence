import { DEFAULT_CITY } from '@/lib/localityUtils';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverUrlFilters } from '@/hooks/useDiscoverUrlState';

/**
 * Issue #2353 — the ONE place the "effective city" fallback rule is written.
 *
 * Before this extraction, `raw || DEFAULT_CITY` was inlined independently at
 * `useDiscoverUrlState.ts`'s raw URL read (`urlParams.get('city') ?? ''`, which
 * can genuinely be `''` when no `city=` param is present — the root cause of
 * the historical J1-B "effective city" drift class of bug), and again at both
 * `useDiscoverPageState.ts`'s `city` state initializer and
 * `DiscoverAreasJourneyPanel.tsx`'s `AreaLeafListingsSurface` query args. All
 * three copies happened to agree (same `DEFAULT_CITY` constant), but nothing
 * enforced that agreement — a future caller copying (or forgetting) the same
 * inline expression could silently reintroduce the drift. Byte-identical
 * output to every inline copy it replaces.
 */
export function resolveEffectiveCity(rawCity: string | null | undefined): string {
  return rawCity || DEFAULT_CITY;
}

/**
 * Issue #2353 — extracted, byte-for-byte-identical from
 * `DiscoverAreasJourneyPanel.tsx`'s `AreaLeafListingsSurface` (see that call
 * site's own PR-4 FIX PASS 4 comment for full history). A minimal
 * `PropertyFilters` projection (propertyTypes/bedrooms/priceMin/priceMax
 * only) used as BOTH this surface's `useDiscoverCityListings` query args AND
 * its chip-display `filters` prop, so a chip toggle can never show new chip
 * state next to stale cards/count.
 *
 * Prefers `committedFilters` (the caller-owned page-local filter state, e.g.
 * `MapDiscovery`'s `filters`) when supplied; falls back to `navFilters` (raw
 * `useDiscoverNav().filters`, URL-derived and ~300ms-debounced) for
 * callers/tests that render the surface in isolation without a caller-owned
 * filters state.
 */
export function resolveEffectiveAreaLeafFilters(
  committedFilters: PropertyFilters | undefined,
  navFilters: DiscoverUrlFilters,
): PropertyFilters {
  return committedFilters
    ? {
        propertyTypes: committedFilters.propertyTypes,
        bedrooms: committedFilters.bedrooms,
        priceMin: committedFilters.priceMin,
        priceMax: committedFilters.priceMax,
      }
    : {
        propertyTypes: navFilters.propertyTypes as PropertyFilters['propertyTypes'],
        bedrooms: navFilters.bedrooms,
        priceMin: navFilters.priceMin,
        priceMax: navFilters.priceMax,
      };
}
