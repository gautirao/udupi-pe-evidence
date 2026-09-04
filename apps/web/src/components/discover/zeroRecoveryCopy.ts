/**
 * Issue #2018 (slice 1) — pure copy derivation for the zero-result recovery
 * banner, kept out of the component for the same reason `emptyStateCopy.ts`
 * (its sibling) is: it is framework-agnostic string logic with no knowledge
 * of URL state, callbacks or React, so it can be unit-tested directly and
 * reused without dragging the component's provider requirements along.
 */
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { formatPrice } from '@/lib/formatters';

/**
 * Compact, human-readable summary of what the shopper actually asked for —
 * the mock's mono scope/filter line (`EPZero` L287,
 * `{scope} — {filterLabels}`).
 *
 * Presentation-only derivation (the "derived display values" side of the
 * frontend/backend boundary): it never decides eligibility, only how the
 * already-applied filters are named back to the shopper. Naming them matters
 * here specifically because the issue forbids silently broadening a search —
 * the shopper has to be able to SEE that what they asked for is still exactly
 * what is being asked of the server.
 */
export function summariseActiveFilters(
  filters: PropertyFilters,
  intent: 'buy' | 'rent',
  searchQuery?: string,
): string[] {
  const parts: string[] = [intent === 'rent' ? 'Rent' : 'Buy'];

  if (filters.propertyTypes?.length) {
    parts.push(filters.propertyTypes.map((t) => t.replace(/_/g, ' ')).join(' / '));
  }
  if (filters.bedrooms?.length) {
    parts.push(
      [...filters.bedrooms]
        .sort((a, b) => a - b)
        .map((b) => `${b} BHK`)
        .join(' / '),
    );
  }
  // `priceMin`/`priceMax` are held in RUPEES in PropertyFilters (the paise
  // conversion happens at the query boundary — see AreaLeafListingsSurface's
  // `* 100`), so they go straight into formatPrice, which expects rupees.
  if (filters.priceMin != null && filters.priceMax != null) {
    parts.push(`${formatPrice(filters.priceMin)} – ${formatPrice(filters.priceMax)}`);
  } else if (filters.priceMax != null) {
    parts.push(`up to ${formatPrice(filters.priceMax)}`);
  } else if (filters.priceMin != null) {
    parts.push(`from ${formatPrice(filters.priceMin)}`);
  }
  if (filters.readyToMove) parts.push(intent === 'rent' ? 'Available now' : 'Ready to move');
  if (filters.reraRegistered) parts.push('RERA registered');
  if (filters.newToMarket) parts.push('New to market');
  if (filters.backOnMarket) parts.push('Back on market');
  if (searchQuery?.trim()) parts.push(`“${searchQuery.trim()}”`);

  return parts;
}
