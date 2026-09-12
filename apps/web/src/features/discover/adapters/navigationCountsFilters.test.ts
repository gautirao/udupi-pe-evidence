import { describe, it, expect } from 'vitest';
import { buildNavigationCountsFilters } from './navigationCountsFilters';
import type { DiscoverUrlFilters } from '@/hooks/useDiscoverUrlState';

describe('buildNavigationCountsFilters (#2142 Commit 2 — moved verbatim from MapDiscovery.tsx)', () => {
  it('threads purpose and forwards only the 7 fields DiscoverNavigationCountsFilters accepts', () => {
    const filters: DiscoverUrlFilters = {
      propertyTypes: ['house'],
      bedrooms: [2, 3],
      sellerTypes: ['owner'],
      readyToMove: true,
      reraRegistered: false,
      newToMarket: true,
      backOnMarket: false,
      priceMin: 1000000,
      priceMax: 5000000,
    };
    const result = buildNavigationCountsFilters('rent', filters);
    expect(result).toEqual({
      purpose: 'rent',
      propertyTypes: ['house'],
      bedrooms: [2, 3],
      sellerTypes: ['owner'],
      readyToMove: true,
      reraRegistered: false,
      newToMarket: true,
      backOnMarket: false,
    });
  });

  it('handles an empty filter set (Buy default, no other filters)', () => {
    const result = buildNavigationCountsFilters('sale', {});
    expect(result.purpose).toBe('sale');
    expect(result.propertyTypes).toBeUndefined();
  });
});

/**
 * Issue #2459 AC2 — "Plots never show or submit a Bedroom filter."
 *
 * Navigation counts run through the SAME `DiscoverListingPredicateBuilder` as listings and
 * markers. Suppressing the bedroom predicate on those two while leaving it here would let a
 * destination advertise a count its own result list cannot produce — a disagreement that did not
 * exist before AC2, when every path emitted bedrooms consistently (and consistently wrongly).
 */
describe('buildNavigationCountsFilters — #2459 AC2 bedroom suppression', () => {
  it('drops bedrooms for a plot-only selection', () => {
    const result = buildNavigationCountsFilters('sale', {
      propertyTypes: ['residential_plot'],
      bedrooms: [2, 3],
    });
    expect(result.bedrooms).toBeUndefined();
    // Suppression is bedroom-only — the selection itself must still reach the counts endpoint,
    // or the destination counts would silently widen to every property type.
    expect(result.propertyTypes).toEqual(['residential_plot']);
  });

  it('drops bedrooms for every plot-meaning type, not just the residential one', () => {
    for (const plotType of ['residential_plot', 'land', 'agricultural_land', 'commercial_land']) {
      const result = buildNavigationCountsFilters('sale', {
        propertyTypes: [plotType],
        bedrooms: [3],
      });
      expect(result.bedrooms).toBeUndefined();
    }
  });

  it('drops bedrooms for a commercial selection narrowed to LAND', () => {
    // `commercialSubtypes` is not forwarded onward by this adapter, but it IS read from the input
    // to resolve the meaning — so the narrowing still counts as plot-only.
    const result = buildNavigationCountsFilters('sale', {
      propertyTypes: ['commercial'],
      commercialSubtypes: ['LAND'],
      bedrooms: [3],
    });
    expect(result.bedrooms).toBeUndefined();
  });

  it('KEEPS bedrooms for a dwelling selection — the guard is not a blanket removal', () => {
    const result = buildNavigationCountsFilters('sale', {
      propertyTypes: ['apartment'],
      bedrooms: [2, 3],
    });
    expect(result.bedrooms).toEqual([2, 3]);
  });

  it('KEEPS bedrooms for a MIXED dwelling+plot selection — AC2 covers plot-ONLY', () => {
    const result = buildNavigationCountsFilters('sale', {
      propertyTypes: ['apartment', 'residential_plot'],
      bedrooms: [3],
    });
    expect(result.bedrooms).toEqual([3]);
  });

  it('KEEPS bedrooms when no property type is selected', () => {
    const result = buildNavigationCountsFilters('sale', { bedrooms: [3] });
    expect(result.bedrooms).toEqual([3]);
  });
});
