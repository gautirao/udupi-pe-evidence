import { describe, it, expect } from 'vitest';
import { filterSchoolRadiusListingsByAreaBbox } from './anonPropertyFilters';
import type { SchoolRadiusListingItem } from '@/hooks/useSchoolRadiusListings';

function makeListing(overrides: Partial<SchoolRadiusListingItem> = {}): SchoolRadiusListingItem {
  return {
    id: 'l-1',
    propertyType: 'house',
    lat: 12.9,
    lon: 77.5,
    ...overrides,
  } as SchoolRadiusListingItem;
}

// Issue #2183 — filterSchoolRadiusListingsByAreaBbox is the client-side equivalent
// of the polygon rectangle DiscoverListingPredicateBuilder.java applies server-side
// for the authenticated area+school-radius combined state (the injected polygon IS
// the area's bbox rectangle). This keeps the anon/pre-CTA school-radius fallback
// (map markers + anon panel count) from disagreeing with that authenticated count.
describe('filterSchoolRadiusListingsByAreaBbox', () => {
  const bbox: [[number, number], [number, number]] = [[12.8, 77.4], [13.0, 77.6]];

  it('null bbox: returns the input array unchanged (identity), matching the pure school-first no-area-context case', () => {
    const listings = [makeListing()];
    expect(filterSchoolRadiusListingsByAreaBbox(listings, null)).toBe(listings);
    expect(filterSchoolRadiusListingsByAreaBbox(listings, undefined)).toBe(listings);
  });

  it('keeps a listing whose lat/lon falls within the bbox rectangle (inclusive of the boundary)', () => {
    const inside = makeListing({ id: 'inside', lat: 12.9, lon: 77.5 });
    const onBoundary = makeListing({ id: 'boundary', lat: 12.8, lon: 77.4 });
    const result = filterSchoolRadiusListingsByAreaBbox([inside, onBoundary], bbox);
    expect(result.map((l) => l.id)).toEqual(['inside', 'boundary']);
  });

  it('drops a listing whose lat/lon falls outside the bbox rectangle', () => {
    const outsideNorth = makeListing({ id: 'outside-north', lat: 13.1, lon: 77.5 });
    const outsideEast = makeListing({ id: 'outside-east', lat: 12.9, lon: 77.9 });
    const result = filterSchoolRadiusListingsByAreaBbox([outsideNorth, outsideEast], bbox);
    expect(result).toEqual([]);
  });

  it('drops a listing with a null/missing lat or lon rather than throwing', () => {
    const noLat = makeListing({ id: 'no-lat', lat: null });
    const noLon = makeListing({ id: 'no-lon', lon: undefined });
    const result = filterSchoolRadiusListingsByAreaBbox([noLat, noLon], bbox);
    expect(result).toEqual([]);
  });
});
