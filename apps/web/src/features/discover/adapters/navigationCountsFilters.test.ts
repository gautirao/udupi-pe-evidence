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
