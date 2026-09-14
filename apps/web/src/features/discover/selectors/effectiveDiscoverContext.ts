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
 * Issue #2553 — the ONE place a panel-emitted `PropertyFilters` is converted into
 * the `DiscoverUrlFilters` shape `setFiltersCommitted` writes to the URL.
 *
 * WHY THIS EXISTS RATHER THAN AN ALLOWLIST. The three `setFiltersCommitted`
 * fallbacks this replaces each rebuilt the committed object from an explicit list
 * of five keys. That shape silently dropped `readyToMove` (Issue #2023) and then
 * `commercialSubtypes` (Issue #2553): a panel could emit an axis, no allowlist
 * named it, and it vanished between the click and the URL with nothing failing.
 * Forwarding what the panel actually emitted removes the whole class — a new axis
 * travels through without anyone remembering to add it in three places.
 *
 * `dateFrom`/`dateTo` are the only axes whose REPRESENTATION differs between the
 * two shapes (`Date` on `PropertyFilters`, ISO `YYYY-MM-DD` string in the URL), so
 * they are the only keys excluded. They sit outside every caller's projection, so
 * `next` never carries a meaningful value for them; `base` supplies them unchanged,
 * exactly as the allowlists did.
 */
export function toCommittedUrlFilters(
  base: DiscoverUrlFilters,
  next: PropertyFilters,
): DiscoverUrlFilters {
  const { dateFrom: _dateFrom, dateTo: _dateTo, ...urlSafe } = next;
  return { ...base, ...urlSafe };
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
        // Issue #2553 — was missing from this projection, so a committed
        // Commercial subtype never reached AreaSelectedPanel's chip-display
        // `filters` prop for the AREA-leaf surface. The panel derives
        // `activeCommercialSubtypes` from this prop, so without it the chip
        // cannot render as selected even once the commit boundary forwards it.
        commercialSubtypes: committedFilters.commercialSubtypes,
        bedrooms: committedFilters.bedrooms,
        priceMin: committedFilters.priceMin,
        priceMax: committedFilters.priceMax,
        // Issue #2023 — was missing from this projection, so a readyToMove
        // toggle never reached AreaSelectedPanel's chip-display `filters` prop
        // for the AREA-leaf surface (AreaLeafListingsSurface).
        readyToMove: committedFilters.readyToMove,
      }
    : {
        propertyTypes: navFilters.propertyTypes as PropertyFilters['propertyTypes'],
        commercialSubtypes: navFilters.commercialSubtypes as PropertyFilters['commercialSubtypes'],
        bedrooms: navFilters.bedrooms,
        priceMin: navFilters.priceMin,
        priceMax: navFilters.priceMax,
        readyToMove: navFilters.readyToMove,
      };
}
