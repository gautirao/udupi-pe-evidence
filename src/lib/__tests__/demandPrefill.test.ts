/**
 * demandPrefill — unit tests (Issue #1748).
 *
 * Covers the prefill-threading contract:
 *  - parse drops junk / empty and narrows listingPurpose to sale|rent
 *  - recommendJourney maps known types and returns null for ambiguous/unknown
 *  - buildPrefillSearch round-trips only present params, '' when empty
 *  - subtype resolvers accept only their own family, null otherwise (safe fallback)
 */
import { describe, it, expect } from 'vitest';
import {
  parseDemandPrefill,
  recommendJourney,
  buildPrefillSearch,
  residentialSubtypeFromPropertyType,
  commercialTypeFromPropertyType,
} from '../demandPrefill';

const sp = (q: string) => new URLSearchParams(q);

describe('parseDemandPrefill', () => {
  it('parses the canonical TopGapCards prefill triple', () => {
    expect(parseDemandPrefill(sp('areaKey=brahmavar&propertyType=apartment&listingPurpose=sale'))).toEqual({
      areaKey: 'brahmavar',
      propertyType: 'apartment',
      listingPurpose: 'sale',
    });
  });

  it('normalises propertyType to lowercase/trimmed', () => {
    expect(parseDemandPrefill(sp('propertyType=%20Apartment%20')).propertyType).toBe('apartment');
  });

  it('narrows listingPurpose to sale|rent and drops anything else', () => {
    expect(parseDemandPrefill(sp('listingPurpose=rent')).listingPurpose).toBe('rent');
    expect(parseDemandPrefill(sp('listingPurpose=lease')).listingPurpose).toBeUndefined();
    expect(parseDemandPrefill(sp('listingPurpose=bogus')).listingPurpose).toBeUndefined();
  });

  it('drops empty / whitespace-only values', () => {
    expect(parseDemandPrefill(sp('areaKey=&propertyType=%20%20'))).toEqual({});
  });

  it('returns an empty object when there are no params (direct navigation)', () => {
    expect(parseDemandPrefill(sp(''))).toEqual({});
  });
});

describe('recommendJourney', () => {
  it.each(['apartment', 'house', 'villa', 'residential_plot'])('%s → residential', (t) => {
    expect(recommendJourney(t)).toBe('residential');
  });

  it.each(['commercial', 'commercial_building', 'warehouse', 'commercial_land'])('%s → commercial', (t) => {
    expect(recommendJourney(t)).toBe('commercial');
  });

  it.each(['agricultural_land', 'farmland', 'plantation', 'farm_plot', 'agricultural_plot'])('%s → agricultural', (t) => {
    expect(recommendJourney(t)).toBe('agricultural');
  });

  it('returns null for ambiguous / unknown / empty values', () => {
    expect(recommendJourney('land')).toBeNull();
    expect(recommendJourney('other')).toBeNull();
    expect(recommendJourney('spaceship')).toBeNull();
    expect(recommendJourney('')).toBeNull();
    expect(recommendJourney(undefined)).toBeNull();
    expect(recommendJourney(null)).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(recommendJourney('APARTMENT')).toBe('residential');
  });
});

describe('buildPrefillSearch', () => {
  it('forwards only the present params', () => {
    expect(buildPrefillSearch({ areaKey: 'brahmavar', propertyType: 'apartment', listingPurpose: 'sale' })).toBe(
      '?areaKey=brahmavar&propertyType=apartment&listingPurpose=sale',
    );
  });

  it('omits absent params', () => {
    expect(buildPrefillSearch({ areaKey: 'brahmavar' })).toBe('?areaKey=brahmavar');
  });

  it('returns an empty string when nothing to forward', () => {
    expect(buildPrefillSearch({})).toBe('');
  });

  it('round-trips through parseDemandPrefill', () => {
    const original = { areaKey: 'kaup', propertyType: 'warehouse', listingPurpose: 'rent' as const };
    const search = buildPrefillSearch(original);
    expect(parseDemandPrefill(new URLSearchParams(search))).toEqual(original);
  });
});

describe('residentialSubtypeFromPropertyType', () => {
  it.each(['apartment', 'house', 'villa', 'residential_plot'])('accepts residential subtype %s', (t) => {
    expect(residentialSubtypeFromPropertyType(t)).toBe(t);
  });

  it('returns null for non-residential / unknown types (form keeps its default)', () => {
    expect(residentialSubtypeFromPropertyType('commercial')).toBeNull();
    expect(residentialSubtypeFromPropertyType('agricultural_land')).toBeNull();
    expect(residentialSubtypeFromPropertyType('land')).toBeNull();
    expect(residentialSubtypeFromPropertyType(undefined)).toBeNull();
  });
});

describe('commercialTypeFromPropertyType', () => {
  it.each(['commercial', 'commercial_building', 'warehouse', 'commercial_land'])('accepts commercial type %s', (t) => {
    expect(commercialTypeFromPropertyType(t)).toBe(t);
  });

  it('returns null for non-commercial / unknown types (form keeps its default)', () => {
    expect(commercialTypeFromPropertyType('apartment')).toBeNull();
    expect(commercialTypeFromPropertyType('agricultural_land')).toBeNull();
    expect(commercialTypeFromPropertyType('other')).toBeNull();
    expect(commercialTypeFromPropertyType(null)).toBeNull();
  });
});
