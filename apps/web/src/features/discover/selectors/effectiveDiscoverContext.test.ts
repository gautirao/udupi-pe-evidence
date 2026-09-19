import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveCity,
  resolveEffectiveAreaLeafFilters,
  resolveEffectiveResultFamily,
  resolveEffectiveQueryFilters,
} from './effectiveDiscoverContext';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverUrlFilters } from '@/hooks/useDiscoverUrlState';

describe('resolveEffectiveCity (#2353 — single source for the city fallback)', () => {
  it('falls back to DEFAULT_CITY when raw city is an empty string', () => {
    expect(resolveEffectiveCity('')).toBe(DEFAULT_CITY);
  });

  it('falls back to DEFAULT_CITY when raw city is null', () => {
    expect(resolveEffectiveCity(null)).toBe(DEFAULT_CITY);
  });

  it('falls back to DEFAULT_CITY when raw city is undefined', () => {
    expect(resolveEffectiveCity(undefined)).toBe(DEFAULT_CITY);
  });

  it('passes through a non-empty raw city unchanged', () => {
    expect(resolveEffectiveCity('bangalore')).toBe('bangalore');
  });
});

describe('resolveEffectiveAreaLeafFilters (#2353 — single source for the AreaLeafListingsSurface filter projection)', () => {
  const navFilters: DiscoverUrlFilters = {
    propertyTypes: ['apartment'],
    bedrooms: [2, 3],
    priceMin: 1000000,
    priceMax: 5000000,
    // Fields outside the minimal projection — must NOT leak into the result.
    sellerTypes: ['owner'],
    backOnMarket: true,
  };

  it('projects committedFilters when supplied, dropping fields outside the minimal set', () => {
    const committedFilters: PropertyFilters = {
      propertyTypes: ['villa'],
      bedrooms: [4],
      priceMin: 2000000,
      priceMax: 9000000,
      sellerTypes: ['broker'],
    };

    expect(resolveEffectiveAreaLeafFilters(committedFilters, navFilters)).toEqual({
      propertyTypes: ['villa'],
      bedrooms: [4],
      priceMin: 2000000,
      priceMax: 9000000,
    });
  });

  it('falls back to projecting navFilters when committedFilters is undefined', () => {
    expect(resolveEffectiveAreaLeafFilters(undefined, navFilters)).toEqual({
      propertyTypes: ['apartment'],
      bedrooms: [2, 3],
      priceMin: 1000000,
      priceMax: 5000000,
    });
  });

  /**
   * Issue #2553 — the projection dropped `commercialSubtypes`, so a committed
   * Commercial subtype never reached AreaSelectedPanel's chip-display `filters`
   * prop (nor the AREA-leaf surface's own listings query). Same omission class
   * the Issue #2023 comment above `readyToMove` in this function records.
   */
  it('projects commercialSubtypes from committedFilters (#2553)', () => {
    const committedFilters: PropertyFilters = {
      propertyTypes: ['commercial'],
      commercialSubtypes: ['WAREHOUSE'],
    };
    expect(resolveEffectiveAreaLeafFilters(committedFilters, navFilters).commercialSubtypes).toEqual([
      'WAREHOUSE',
    ]);
  });

  it('projects commercialSubtypes from navFilters on the fallback path (#2553)', () => {
    expect(
      resolveEffectiveAreaLeafFilters(undefined, { ...navFilters, commercialSubtypes: ['SHOP'] })
        .commercialSubtypes,
    ).toEqual(['SHOP']);
  });

  it('projects navFilters fields as undefined when absent', () => {
    const emptyNavFilters: DiscoverUrlFilters = {};
    expect(resolveEffectiveAreaLeafFilters(undefined, emptyNavFilters)).toEqual({
      propertyTypes: undefined,
      bedrooms: undefined,
      priceMin: undefined,
      priceMax: undefined,
    });
  });
});

describe('resolveEffectiveResultFamily & resolveEffectiveQueryFilters (#2622 — Residential family default)', () => {
  it('resolves family to residential by default when filters are family-silent', () => {
    expect(resolveEffectiveResultFamily({ filters: {} })).toBe('residential');
    expect(resolveEffectiveResultFamily({ filters: undefined })).toBe('residential');
  });

  it('resolves family to residential when explicit residential propertyTypes are present', () => {
    expect(resolveEffectiveResultFamily({ filters: { propertyTypes: ['apartment'] } })).toBe('residential');
    expect(resolveEffectiveResultFamily({ filters: { propertyTypes: ['villa', 'house'] } })).toBe('residential');
  });

  it('resolves family to commercial when commercialSubtypes are present', () => {
    expect(resolveEffectiveResultFamily({ filters: { commercialSubtypes: ['SHOP'] } })).toBe('commercial');
    expect(resolveEffectiveResultFamily({ filters: { commercialSubtypes: ['OFFICE', 'WAREHOUSE'] } })).toBe('commercial');
  });

  it('resolves family to commercial when commercial propertyTypes are present', () => {
    expect(resolveEffectiveResultFamily({ filters: { propertyTypes: ['commercial'] } })).toBe('commercial');
    expect(resolveEffectiveResultFamily({ filters: { propertyTypes: ['warehouse'] } })).toBe('commercial');
  });

  it('resolves family to agricultural when in agri journey or agricultural_land is selected', () => {
    expect(resolveEffectiveResultFamily({ filters: {}, isAgriJourney: true })).toBe('agricultural');
    expect(resolveEffectiveResultFamily({ filters: { propertyTypes: ['agricultural_land'] } })).toBe('agricultural');
  });

  it('defaults query propertyTypes to all residential shapes when family is silent', () => {
    const effective = resolveEffectiveQueryFilters({});
    expect(effective.propertyTypes).toEqual([
      'apartment',
      'house',
      'villa',
      'residential_plot',
      'land',
    ]);
  });

  it('preserves explicit residential propertyTypes in query filters', () => {
    const effective = resolveEffectiveQueryFilters({ propertyTypes: ['apartment'] });
    expect(effective.propertyTypes).toEqual(['apartment']);
  });

  it('preserves commercialSubtypes and does not force residential propertyTypes in commercial mode', () => {
    const effective = resolveEffectiveQueryFilters({ commercialSubtypes: ['SHOP'] });
    expect(effective.commercialSubtypes).toEqual(['SHOP']);
    expect(effective.propertyTypes).toBeUndefined();
  });

  it('preserves commercial propertyTypes in commercial mode', () => {
    const effective = resolveEffectiveQueryFilters({ propertyTypes: ['commercial'] });
    expect(effective.propertyTypes).toEqual(['commercial']);
  });

  it('forces agricultural_land propertyType in agricultural mode', () => {
    const effective = resolveEffectiveQueryFilters({}, true);
    expect(effective.propertyTypes).toEqual(['agricultural_land']);
  });
});

