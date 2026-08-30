import { describe, it, expect } from 'vitest';
import { buildCityListingsQueryParams } from './cityListingsQueryParams';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

describe('buildCityListingsQueryParams (#2142 Commit 2 — moved verbatim from MapDiscovery.tsx, 2 call sites deduped)', () => {
  it('forwards city/areaKeys/listingPurpose and defaults limitPerArea to 20 (server teaser cap)', () => {
    const result = buildCityListingsQueryParams('udupi', ['IN|KA|Udupi|Manipal'], {}, 'sale');
    expect(result.city).toBe('udupi');
    expect(result.areaKeys).toEqual(['IN|KA|Udupi|Manipal']);
    expect(result.limitPerArea).toBe(20);
    expect(result.listingPurpose).toBe('sale');
  });

  it('forwards only the FIRST propertyType/bedrooms value (useDiscoverCityListings single-value limitation)', () => {
    const filters: PropertyFilters = { propertyTypes: ['house', 'apartment'], bedrooms: [2, 3] };
    const result = buildCityListingsQueryParams('udupi', [], filters, 'sale');
    expect(result.propertyType).toBe('house');
    expect(result.bedrooms).toBe(2);
  });

  it('converts priceMin/priceMax from rupees to paise (x100)', () => {
    const filters: PropertyFilters = { priceMin: 1000000, priceMax: 5000000 };
    const result = buildCityListingsQueryParams('udupi', [], filters, 'sale');
    expect(result.minPrice).toBe(100000000);
    expect(result.maxPrice).toBe(500000000);
  });

  it('leaves minPrice/maxPrice undefined when not set (no accidental 0 -> 0)', () => {
    const result = buildCityListingsQueryParams('udupi', [], {}, 'sale');
    expect(result.minPrice).toBeUndefined();
    expect(result.maxPrice).toBeUndefined();
  });

  it('q is optional and defaults to undefined (group-results call site never passes it)', () => {
    const result = buildCityListingsQueryParams('udupi', [], {}, 'sale');
    expect(result.q).toBeUndefined();
  });

  it('q is threaded through when provided (node-listings call site passes debouncedSearch)', () => {
    const result = buildCityListingsQueryParams('udupi', [], {}, 'sale', 'manipal');
    expect(result.q).toBe('manipal');
  });
});
