import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSchoolListings, type UseSchoolListingsParams } from './useSchoolListings';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { SchoolRadiusListingItem } from '@/hooks/useSchoolRadiusListings';
import type { PropertyFilters, PropertyListing, PropertyImage } from '@/hooks/usePropertyListings';

function makeAreaListing(overrides: Partial<DiscoverCityListingItem> = {}): DiscoverCityListingItem {
  return {
    id: 'area-1',
    propertyType: 'house',
    locality: 'Udupi',
    pricePaise: 5000000,
    ...overrides,
  };
}

function makeSchoolRadiusListing(overrides: Partial<SchoolRadiusListingItem> = {}): SchoolRadiusListingItem {
  return {
    id: 'radius-1',
    propertyType: 'house',
    title: 'Radius Listing',
    locality: 'Manipal',
    pricePaise: 6000000,
    primaryImageUrl: null,
    listingPurpose: 'sale',
    bedrooms: 3,
    builtArea: null,
    builtAreaUnit: null,
    landArea: null,
    landAreaUnit: null,
    createdAt: '2026-01-01T00:00:00Z',
    lat: 13.35,
    lon: 74.79,
    ...overrides,
  } as SchoolRadiusListingItem;
}

function makeFilteredListing(overrides: Partial<PropertyListing & { images?: PropertyImage[] }> = {}): PropertyListing & { images?: PropertyImage[] } {
  return {
    id: 'filtered-1',
    property_type: 'house',
    title: 'Filtered Listing',
    locality: 'Manipal',
    price: 60000,
    listing_purpose: 'sale',
    bedrooms: 3,
    bathrooms: 2,
    built_area: null,
    built_area_unit: null,
    land_area: null,
    land_area_unit: null,
    total_floors: null,
    parking_count: null,
    furnishing_status: null,
    created_at: '2026-01-01T00:00:00Z',
    latitude: 13.35,
    longitude: 74.79,
    images: [],
    ...overrides,
  } as unknown as PropertyListing & { images?: PropertyImage[] };
}

const EMPTY_FILTERS: PropertyFilters = {};

function makeParams(overrides: Partial<UseSchoolListingsParams> = {}): UseSchoolListingsParams {
  return {
    isAuthenticated: false,
    filters: EMPTY_FILTERS,
    areaListings: [makeAreaListing()],
    schoolRadiusListings: [makeSchoolRadiusListing()],
    filteredListings: [makeFilteredListing()],
    journey: null,
    schoolId: null,
    ...overrides,
  };
}

describe('useSchoolListings', () => {
  it('anon, no active school-radius: falls back to areaListings', () => {
    const { result } = renderHook(() => useSchoolListings(makeParams()));
    expect(result.current.schoolListings).toEqual([makeAreaListing()]);
  });

  it('anon, active school-radius: applies applyAnonPropertyFilters over schoolRadiusListings', () => {
    const { result } = renderHook(() =>
      useSchoolListings(
        makeParams({
          filters: { ...EMPTY_FILTERS, schoolLat: 13.35, schoolLon: 74.79, schoolRadiusKm: 2 },
        }),
      ),
    );
    expect(result.current.schoolListings).toHaveLength(1);
    expect(result.current.schoolListings[0].id).toBe('radius-1');
  });

  it('authenticated: maps filteredListings (snake_case PropertyListing) to DiscoverCityListingItem shape, never fabricating trustBadge', () => {
    const { result } = renderHook(() => useSchoolListings(makeParams({ isAuthenticated: true })));
    expect(result.current.schoolListings).toHaveLength(1);
    const item = result.current.schoolListings[0];
    expect(item.id).toBe('filtered-1');
    expect(item.propertyType).toBe('house');
    expect(item.pricePaise).toBe(6000000);
    // Issue #1567/#1616 — must never replicate the internal trust-tier letter grade.
    expect(item.trustBadge).toBeNull();
  });

  it('schoolRadiusFallbackMarkers: empty unless journey=school-first AND schoolId is set', () => {
    const notSchoolFirst = renderHook(() => useSchoolListings(makeParams({ journey: null, schoolId: 'school-1' })));
    expect(notSchoolFirst.result.current.schoolRadiusFallbackMarkers).toEqual([]);

    const noSchoolId = renderHook(() => useSchoolListings(makeParams({ journey: 'school-first', schoolId: null })));
    expect(noSchoolId.result.current.schoolRadiusFallbackMarkers).toEqual([]);

    const active = renderHook(() => useSchoolListings(makeParams({ journey: 'school-first', schoolId: 'school-1' })));
    expect(active.result.current.schoolRadiusFallbackMarkers).toHaveLength(1);
  });

  // ── Memo-identity (AC-MEMO-IDENTITY) ──────────────────────────────────────
  it('schoolListings: identity-stable across a no-op rerender (same props)', () => {
    const params = makeParams();
    const { result, rerender } = renderHook((p: UseSchoolListingsParams) => useSchoolListings(p), {
      initialProps: params,
    });
    const first = result.current.schoolListings;
    rerender(params);
    expect(result.current.schoolListings).toBe(first);
  });

  it('schoolListings: recomputes (positive control) when isAuthenticated changes', () => {
    const params = makeParams();
    const { result, rerender } = renderHook((p: UseSchoolListingsParams) => useSchoolListings(p), {
      initialProps: params,
    });
    const first = result.current.schoolListings;
    rerender({ ...params, isAuthenticated: true });
    expect(result.current.schoolListings).not.toBe(first);
  });

  it('schoolRadiusFallbackMarkers: identity-stable across a no-op rerender (same props)', () => {
    const params = makeParams({ journey: 'school-first', schoolId: 'school-1' });
    const { result, rerender } = renderHook((p: UseSchoolListingsParams) => useSchoolListings(p), {
      initialProps: params,
    });
    const first = result.current.schoolRadiusFallbackMarkers;
    rerender(params);
    expect(result.current.schoolRadiusFallbackMarkers).toBe(first);
  });

  it('schoolRadiusFallbackMarkers: recomputes (positive control) when schoolRadiusListings changes', () => {
    const params = makeParams({ journey: 'school-first', schoolId: 'school-1' });
    const { result, rerender } = renderHook((p: UseSchoolListingsParams) => useSchoolListings(p), {
      initialProps: params,
    });
    const first = result.current.schoolRadiusFallbackMarkers;
    rerender({ ...params, schoolRadiusListings: [makeSchoolRadiusListing({ id: 'radius-2' })] });
    expect(result.current.schoolRadiusFallbackMarkers).not.toBe(first);
  });
});
