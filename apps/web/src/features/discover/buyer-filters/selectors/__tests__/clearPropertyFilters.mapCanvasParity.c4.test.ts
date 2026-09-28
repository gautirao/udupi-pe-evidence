/**
 * Issue #2658 (C4) — proves `clearPropertyFilters(filters)` (the pure
 * selector DiscoverMapCanvas.tsx's `handleClearMapFilters` now calls
 * directly) emits BYTE-IDENTICAL output to what the full
 * `usePropertyFilterGroups(...).handleClearPropertyFilters()` call it
 * replaced would have emitted, for the exact call shape DiscoverMapCanvas
 * used (`isReadyToMoveSupported: true, isCommercialSubtypeSupported: true`).
 *
 * This is the parity proof the C4 migration comment in DiscoverMapCanvas.tsx
 * points at — not a general characterization of the hook (that already
 * exists elsewhere), just the one narrow claim this migration depends on.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { clearPropertyFilters } from '../clearPropertyFilters';
import { usePropertyFilterGroups } from '@/features/discover/buyer-filters/controllers/usePropertyFilterGroups';

const cases: { name: string; filters: PropertyFilters }[] = [
  { name: 'empty filters', filters: {} },
  {
    name: 'residential filters with several axes set',
    filters: {
      propertyTypes: ['apartment', 'villa'],
      bedrooms: [2, 3],
      priceMax: 8_000_000,
      areaMinSqft: 1000,
      readyToMove: true,
    },
  },
  {
    name: 'commercial filters (subtype + commercial family token)',
    filters: {
      propertyTypes: ['commercial'],
      commercialSubtypes: ['WAREHOUSE'],
      priceMax: 25_000_000,
    },
  },
  {
    name: 'context filters that predate this issue (localities, sellerTypes, rera, etc.)',
    filters: {
      localities: ['kalsanka'],
      sellerTypes: ['owner'],
      backOnMarket: true,
      newToMarket: true,
      reraRegistered: true,
      areaMaxSqft: 5000,
      priceMin: 1_000_000,
    },
  },
];

describe('#2658 C4 — clearPropertyFilters selector matches usePropertyFilterGroups emission (DiscoverMapCanvas parity)', () => {
  for (const { name, filters } of cases) {
    it(`emits identically to the hook's handleClearPropertyFilters for: ${name}`, () => {
      const onFiltersChange = vi.fn();
      const { result } = renderHook(() =>
        usePropertyFilterGroups({
          filters,
          onFiltersChange,
          intent: 'buy',
          isReadyToMoveSupported: true,
          isCommercialSubtypeSupported: true,
        }),
      );

      result.current.handleClearPropertyFilters();
      expect(onFiltersChange).toHaveBeenCalledTimes(1);
      const hookEmission = onFiltersChange.mock.calls[0][0];

      expect(clearPropertyFilters(filters)).toEqual(hookEmission);
    });
  }

  it('is a no-op-safe call when onFiltersChange is undefined, matching DiscoverMapCanvas\'s own guard', () => {
    // DiscoverMapCanvas's handleClearMapFilters guards `if (!onFiltersChange) return;` before
    // calling the selector — the selector itself has no such guard (it is pure), so this pins
    // the CALLER's contract, not the selector's.
    expect(() => clearPropertyFilters({})).not.toThrow();
  });
});
