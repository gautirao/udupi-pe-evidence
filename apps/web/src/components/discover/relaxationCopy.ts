/**
 * Issue #2018 (slice 2) — pure label derivation and filter application for the zero-result
 * recovery panel's relaxation rows, kept out of the component for the same reason
 * `zeroRecoveryCopy.ts` (its sibling) is: framework-agnostic logic with no knowledge of URL state,
 * callbacks or React, so it is unit-testable directly.
 *
 * Nothing here decides eligibility or invents a number — the counts are the server's. This module
 * only names the offer and turns it into an explicit `PropertyFilters` assignment.
 */
import type { PropertyFilters, PropertyType } from '@/hooks/usePropertyListings';
import { formatPrice } from '@/lib/formatters';
import type { RelaxationPreview } from '@/hooks/useRelaxationPreviews';

/**
 * The mock's row label (`ExpPanel.jsx` `EPZero` L333, vocabulary from `exp-data.js` L259-278).
 *
 * The bedroom label names the value being ADDED, which is derived by diffing the offer against the
 * live filters. That diff is exact rather than approximate: `filters` is part of the query key the
 * preview came back under (see `useRelaxationPreviews`' stale-response guard), so the offer in hand
 * was always computed from precisely these filters.
 *
 * @param intent - buy/rent, so the possession row names the same constraint the banner's filter
 *   summary already names ("Ready to move" vs "Available now" — see `summariseActiveFilters`).
 */
export function relaxationLabel(
  preview: RelaxationPreview,
  filters: PropertyFilters,
  intent: 'buy' | 'rent',
): string {
  switch (preview.kind) {
    case 'PRICE_MAX':
      return preview.priceMax != null
        ? `Increase maximum price to ${formatPrice(preview.priceMax)}`
        : 'Remove the maximum price';

    case 'READY_TO_MOVE':
      return `Remove ${intent === 'rent' ? 'Available now' : 'Ready to move'}`;

    case 'BEDROOMS': {
      const next = preview.bedrooms ?? [];
      if (next.length === 0) {
        return 'Accept any number of bedrooms';
      }
      const current = new Set(filters.bedrooms ?? []);
      const added = next.filter((b) => !current.has(b));
      if (added.length === 1) {
        // 4 is "4 or more" throughout the filter vocabulary, so it must not read as exactly 4.
        return added[0] >= 4 ? 'Include 4+ BHK' : `Include ${added[0]} BHK`;
      }
      // Defensive: the server offers one added value at a time, so this is unreachable today. It
      // states the resulting set rather than guessing at a single value.
      return `Include ${next
        .slice()
        .sort((a, b) => a - b)
        .map((b) => (b >= 4 ? '4+' : String(b)))
        .join(' / ')} BHK`;
    }

    case 'PROPERTY_TYPES':
      return (preview.propertyTypes ?? []).length === 0
        ? 'Include every property type'
        : `Include ${(preview.propertyTypes ?? []).map((t) => t.replace(/_/g, ' ')).join(' / ')}`;
  }
}

/**
 * Applies EXACTLY ONE filter change and returns the resulting filters.
 *
 * Every branch spreads the incoming `filters` and overwrites a single key, so no other filter and
 * no scope value can move: geography, purpose, city and category are structurally untouchable from
 * here. An empty `bedrooms`/`propertyTypes` offer clears that filter (`undefined`) rather than
 * setting an empty array, which the query serializer would render as an unsatisfiable IN list.
 */
export function applyRelaxationPreview(
  filters: PropertyFilters,
  preview: RelaxationPreview,
): PropertyFilters {
  switch (preview.kind) {
    case 'PRICE_MAX':
      return { ...filters, priceMax: preview.priceMax };

    case 'READY_TO_MOVE':
      // Cleared, not set to `false`: the constraint is dropped so it also leaves the URL and the
      // banner's filter summary, rather than lingering as an inert `readyToMove=false`.
      return { ...filters, readyToMove: undefined };

    case 'BEDROOMS':
      return {
        ...filters,
        bedrooms: preview.bedrooms?.length ? [...preview.bedrooms] : undefined,
      };

    case 'PROPERTY_TYPES':
      return {
        ...filters,
        propertyTypes: preview.propertyTypes?.length
          ? ([...preview.propertyTypes] as PropertyType[])
          : undefined,
      };
  }
}
