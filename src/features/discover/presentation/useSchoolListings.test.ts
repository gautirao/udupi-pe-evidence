import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSchoolListings, type UseSchoolListingsParams } from './useSchoolListings';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { SchoolRadiusListingItem } from '@/hooks/useSchoolRadiusListings';
import type { PropertyFilters, PropertyListing, PropertyImage } from '@/hooks/usePropertyListings';

// Issue #2183 — a selected area whose bbox contains the (13.35, 74.79) coordinate
// every fixture listing above uses by default.
function makeSelectedAreaContaining(overrides: Partial<AreaPoint> = {}): AreaPoint {
  return {
    areaKey: 'area:manipal',
    areaLabel: 'Manipal',
    geo_center_lat: 13.35,
    geo_center_lon: 74.79,
    bbox: [[13.3, 74.7], [13.4, 74.9]],
    listingCount: null,
    schoolCount: null,
    ...overrides,
  } as AreaPoint;
}

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
    selectedArea: null,
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

  it('authenticated: maps filteredListings (snake_case PropertyListing) to DiscoverCityListingItem shape, passing trustBadge through', () => {
    const { result } = renderHook(() =>
      useSchoolListings(
        makeParams({
          isAuthenticated: true,
          filteredListings: [makeFilteredListing({ trustBadge: 'verified' })],
        }),
      ),
    );
    expect(result.current.schoolListings).toHaveLength(1);
    const item = result.current.schoolListings[0];
    expect(item.id).toBe('filtered-1');
    expect(item.propertyType).toBe('house');
    expect(item.pricePaise).toBe(6000000);
    // Issue #1954 — the public trustBadge word now flows through from the source
    // PropertyListing (it is no longer hardcoded to null).
    expect(item.trustBadge).toBe('verified');
  });

  it('authenticated: trustBadge is null when absent on the source listing (never fabricated)', () => {
    const { result } = renderHook(() =>
      useSchoolListings(
        makeParams({
          isAuthenticated: true,
          filteredListings: [makeFilteredListing({ trustBadge: undefined })],
        }),
      ),
    );
    const item = result.current.schoolListings[0];
    // Issue #1567/#1616 — must never replicate the internal trust-tier letter grade;
    // absent source data yields null, not a fabricated badge.
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

  // ── Issue #2183 regression: area-bbox scoping of the school-radius fallback ──
  //
  // Repro: a direct URL load of the school-first journey with both `areaKey`
  // (the school's own area — written by handleSchoolSelect as breadcrumb
  // context on EVERY school pick) and `schoolId` set resolves to the
  // 'area-school-combined' panel state. The AUTHENTICATED path's badge/panel
  // count is scoped to the intersection of the selected area's bbox AND the
  // school radius (useDiscoverMapDataController.ts's effectiveFilters `polygon`
  // injection — the polygon IS literally the area's bbox rectangle). Before
  // this fix, the anon panel count and the pre-CTA map fallback markers
  // (schoolRadiusFallbackMarkers, active for anon AND for authenticated users
  // before the bounded-search CTA) read raw schoolRadiusListings with no area
  // bound at all, so the map could show homes far outside the area the
  // authenticated badge had already excluded — the map/panel disagreement
  // reported in #2183.
  describe('Issue #2183 — area-bbox scoping keeps the school-radius fallback consistent with the combined-state panel count', () => {
    it('anon, active school-radius, selected area whose bbox EXCLUDES the listing: schoolListings and schoolRadiusFallbackMarkers both drop to empty', () => {
      const areaFarFromListing: AreaPoint = {
        areaKey: 'area:far',
        areaLabel: 'Far Area',
        geo_center_lat: 12.9,
        geo_center_lon: 77.5,
        bbox: [[12.9, 77.5], [12.95, 77.6]],
      };
      const { result } = renderHook(() =>
        useSchoolListings(
          makeParams({
            filters: { ...EMPTY_FILTERS, schoolLat: 13.35, schoolLon: 74.79, schoolRadiusKm: 2 },
            journey: 'school-first',
            schoolId: 'school-1',
            selectedArea: areaFarFromListing,
          }),
        ),
      );
      // Panel count: the fixture listing (13.35, 74.79) falls outside
      // areaFarFromListing's bbox, so it must be excluded — matching what the
      // authenticated path's polygon-scoped query would also exclude.
      expect(result.current.schoolListings).toEqual([]);
      // Map fallback markers: must agree with the panel count above — this is
      // the exact map/panel disagreement #2183 reported.
      expect(result.current.schoolRadiusFallbackMarkers).toEqual([]);
    });

    it('anon, active school-radius, selected area whose bbox CONTAINS the listing: schoolListings and schoolRadiusFallbackMarkers both keep it', () => {
      const { result } = renderHook(() =>
        useSchoolListings(
          makeParams({
            filters: { ...EMPTY_FILTERS, schoolLat: 13.35, schoolLon: 74.79, schoolRadiusKm: 2 },
            journey: 'school-first',
            schoolId: 'school-1',
            selectedArea: makeSelectedAreaContaining(),
          }),
        ),
      );
      expect(result.current.schoolListings).toHaveLength(1);
      expect(result.current.schoolListings[0].id).toBe('radius-1');
      expect(result.current.schoolRadiusFallbackMarkers).toHaveLength(1);
    });

    it('anon, active school-radius, no selected area (pure school-first, no area context): unchanged — no bbox filtering applied', () => {
      const { result } = renderHook(() =>
        useSchoolListings(
          makeParams({
            filters: { ...EMPTY_FILTERS, schoolLat: 13.35, schoolLon: 74.79, schoolRadiusKm: 2 },
            journey: 'school-first',
            schoolId: 'school-1',
            selectedArea: null,
          }),
        ),
      );
      expect(result.current.schoolListings).toHaveLength(1);
      expect(result.current.schoolRadiusFallbackMarkers).toHaveLength(1);
    });

    // Fix cycle 2 (code review) — the anon schoolListings branch above is gated
    // ONLY on `!isAuthenticated && filters.schoolLat/Lon/RadiusKm`, with NO
    // journey check (unlike schoolRadiusFallbackMarkers, which requires
    // journey === 'school-first'). It is therefore reachable from the
    // canonical `node=` area-first + school-combined state, where journey
    // stays 'area-first' (per e2e/discover-area-selected-filters.spec.ts) and
    // the caller must pass effectiveSelectedArea (not the always-null legacy
    // value) for this scoping to take effect. This case proves the hook itself
    // applies the bbox scoping regardless of journey — i.e. it does NOT
    // silently no-op just because journey isn't 'school-first'.
    it('anon, active school-radius, journey=area-first (canonical node= area+school-combined state), selected area bbox EXCLUDES the listing: schoolListings drops it', () => {
      const areaFarFromListing: AreaPoint = {
        areaKey: 'area:far',
        areaLabel: 'Far Area',
        geo_center_lat: 12.9,
        geo_center_lon: 77.5,
        bbox: [[12.9, 77.5], [12.95, 77.6]],
      };
      const { result } = renderHook(() =>
        useSchoolListings(
          makeParams({
            filters: { ...EMPTY_FILTERS, schoolLat: 13.35, schoolLon: 74.79, schoolRadiusKm: 2 },
            journey: 'area-first',
            schoolId: 'school-1',
            selectedArea: areaFarFromListing,
          }),
        ),
      );
      expect(result.current.schoolListings).toEqual([]);
    });

    it('selected area with a null bbox: treated as no area constraint (identity pass-through), matching filterSchoolRadiusListingsByAreaBbox\'s null-bbox no-op contract', () => {
      const { result } = renderHook(() =>
        useSchoolListings(
          makeParams({
            filters: { ...EMPTY_FILTERS, schoolLat: 13.35, schoolLon: 74.79, schoolRadiusKm: 2 },
            journey: 'school-first',
            schoolId: 'school-1',
            selectedArea: makeSelectedAreaContaining({ bbox: null }),
          }),
        ),
      );
      expect(result.current.schoolListings).toHaveLength(1);
      expect(result.current.schoolRadiusFallbackMarkers).toHaveLength(1);
    });
  });
});
