import { describe, it, expect } from 'vitest';
import { hasActiveSchoolPropertyFilters, clearSchoolPropertyFilters } from './schoolPropertyFilters';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

describe('hasActiveSchoolPropertyFilters', () => {
  it('is false for an empty filters object', () => {
    expect(hasActiveSchoolPropertyFilters({})).toBe(false);
  });

  it.each<[Partial<PropertyFilters>]>([
    [{ propertyTypes: ['apartment'] }],
    [{ bedrooms: [2] }],
    [{ priceMin: 1000000 }],
    [{ priceMax: 5000000 }],
  ])('is true when %o is set', (partial) => {
    expect(hasActiveSchoolPropertyFilters(partial as PropertyFilters)).toBe(true);
  });

  it('ignores toggle filters not in the "Clear filters" chip (sellerTypes)', () => {
    expect(hasActiveSchoolPropertyFilters({ sellerTypes: ['owner'] } as PropertyFilters)).toBe(false);
  });
});

describe('clearSchoolPropertyFilters', () => {
  it('clears propertyTypes/bedrooms/priceMin/priceMax and preserves everything else', () => {
    const filters: PropertyFilters = {
      propertyTypes: ['apartment'],
      bedrooms: [2],
      priceMin: 1000000,
      priceMax: 5000000,
      schoolLat: 13.35,
      schoolLon: 74.79,
      schoolRadiusKm: 3,
    };
    expect(clearSchoolPropertyFilters(filters)).toEqual({
      propertyTypes: undefined,
      bedrooms: undefined,
      priceMin: undefined,
      priceMax: undefined,
      schoolLat: 13.35,
      schoolLon: 74.79,
      schoolRadiusKm: 3,
    });
  });
});
