import { describe, it, expect } from 'vitest';
import { sortListingsBySchoolDistance } from './sortListingsBySchoolDistance';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

const mockSchool: SchoolResult = {
  id: 'sch-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  latitude: 13.3531,
  longitude: 74.7935,
  address: 'Manipal, Udupi District',
  distanceKm: 0.5,
};

const makeListing = (id: string, lat: number | null, lon: number | null): DiscoverCityListingItem => ({
  id,
  pricePaise: 100,
  propertyType: 'apartment',
  locality: 'Manipal',
  primaryImageUrl: null,
  lat,
  lon,
});

describe('sortListingsBySchoolDistance', () => {
  it('sorts nearest-first; listings without usable coordinates sort last', () => {
    const listings = [
      makeListing('far', 13.40, 74.85),
      makeListing('near', 13.3535, 74.794),
      makeListing('no-coords', null, null),
      makeListing('mid', 13.37, 74.82),
    ];
    const result = sortListingsBySchoolDistance(listings, mockSchool);
    expect(result.map((r) => r.listing.id)).toEqual(['near', 'mid', 'far', 'no-coords']);
    expect(result[3].distanceKm).toBeNull();
    expect(result[0].distanceKm).not.toBeNull();
  });

  it('every distanceKm is null when school is null', () => {
    const listings = [makeListing('a', 13.35, 74.79), makeListing('b', 13.4, 74.9)];
    const result = sortListingsBySchoolDistance(listings, null);
    expect(result.every((r) => r.distanceKm === null)).toBe(true);
  });

  it('every distanceKm is null when school has null coordinates (legacy row, runtime check via `as unknown`)', () => {
    const schoolNoCoords = { ...mockSchool, latitude: null, longitude: null } as unknown as SchoolResult;
    const listings = [makeListing('a', 13.35, 74.79)];
    const result = sortListingsBySchoolDistance(listings, schoolNoCoords);
    expect(result[0].distanceKm).toBeNull();
  });

  it('returns an empty array for an empty listings input', () => {
    expect(sortListingsBySchoolDistance([], mockSchool)).toEqual([]);
  });
});
