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

  // Issue #2533 — was "forwards only the FIRST value". useDiscoverCityListings now sends
  // the full selection as repeated params, so the adapter forwards both arrays whole.
  it('forwards the FULL propertyType/bedrooms selection', () => {
    const filters: PropertyFilters = { propertyTypes: ['house', 'apartment'], bedrooms: [2, 3] };
    const result = buildCityListingsQueryParams('udupi', [], filters, 'sale');
    expect(result.propertyType).toEqual(['house', 'apartment']);
    expect(result.bedrooms).toEqual([2, 3]);
  });

  // Falsifiability control: an absent selection must stay undefined, not become an
  // empty array that a future caller could mistake for "match none".
  it('leaves propertyType/bedrooms undefined when nothing is selected', () => {
    const result = buildCityListingsQueryParams('udupi', [], {}, 'sale');
    expect(result.propertyType).toBeUndefined();
    expect(result.bedrooms).toBeUndefined();
  });

  // ─── Issue #2531 — Commercial subtype forwarding ───────────────────────────
  //
  // Before this fix the field was not merely dropped, it was UNREPRESENTABLE: the
  // BuiltCityListingsQueryParams Pick<> union had no `commercialSubtypes` member, so
  // a committed Commercial subtype could not be expressed on the anon path at all.

  it('forwards the FULL commercialSubtypes selection', () => {
    const filters: PropertyFilters = { commercialSubtypes: ['SHOP', 'OFFICE'] };
    const result = buildCityListingsQueryParams('udupi', [], filters, 'sale');
    expect(result.commercialSubtypes).toEqual(['SHOP', 'OFFICE']);
  });

  /**
   * ONE AXIS: a Commercial selection rides `commercialSubtypes` alone and sets no
   * `propertyTypes`. An implementation that forwarded the subtype only alongside a
   * property type would drop it on every real selection, so this pins the real shape
   * rather than the convenient one.
   */
  it('forwards commercialSubtypes even when no propertyTypes is selected', () => {
    const filters: PropertyFilters = { commercialSubtypes: ['OFFICE'] };
    const result = buildCityListingsQueryParams('udupi', [], filters, 'sale');
    expect(result.commercialSubtypes).toEqual(['OFFICE']);
    expect(result.propertyType).toBeUndefined();
  });

  // Falsifiability control, same query shape: absent selection stays undefined rather
  // than becoming an empty array a caller could mistake for "match none".
  it('leaves commercialSubtypes undefined when nothing is selected', () => {
    const result = buildCityListingsQueryParams('udupi', [], {}, 'sale');
    expect(result.commercialSubtypes).toBeUndefined();
  });

  it('normalises an empty commercialSubtypes array to undefined', () => {
    const filters: PropertyFilters = { commercialSubtypes: [] };
    const result = buildCityListingsQueryParams('udupi', [], filters, 'sale');
    expect(result.commercialSubtypes).toBeUndefined();
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
