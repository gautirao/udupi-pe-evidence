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

  // ── Issue #2806 / #2183: server-scoped schoolAreaKey pass-through vs legacy client bbox fallback ──
  describe('Issue #2806 & #2183 — server-scoped schoolAreaKey avoids double-filtering coarsened coordinates; legacy fallback applies when not server-scoped', () => {
    it('#2806: when server-scoped by schoolId + selectedArea.areaKey (no polygon), does NOT re-filter schoolRadiusListings by client selectedArea.bbox (preserves coarsened boundary listing)', () => {
      // Simulate a boundary listing whose exact DB geog is inside the Area bounds,
      // but whose 2-decimal-place coarsened coordinate (13.35, 74.79) sits just outside
      // selectedArea.bbox ([[13.352, 74.792], [13.38, 74.82]]).
      const boundaryArea: AreaPoint = {
        areaKey: 'IN|KA|Udupi|Kunjibettu',
        areaLabel: 'Kunjibettu',
        geo_center_lat: 13.36,
        geo_center_lon: 74.8,
        bbox: [[13.352, 74.792], [13.38, 74.82]],
      };
      const { result } = renderHook(() =>
        useSchoolListings(
          makeParams({
            filters: { ...EMPTY_FILTERS, schoolLat: 13.33, schoolLon: 74.76, schoolRadiusKm: 3 },
            journey: 'school-first',
            schoolId: 'school-1',
            selectedArea: boundaryArea,
          }),
        ),
      );
      expect(result.current.schoolListings).toHaveLength(1);
      expect(result.current.schoolListings[0].id).toBe('radius-1');
      expect(result.current.schoolRadiusFallbackMarkers).toHaveLength(1);
      expect(result.current.schoolRadiusFallbackMarkers[0].id).toBe('radius-1');
    });

    it('#2806: when server-scoped via explicit filters.schoolAreaKey (journey=area-first), does NOT re-filter schoolRadiusListings by client selectedArea.bbox', () => {
      const boundaryArea: AreaPoint = {
        areaKey: 'IN|KA|Udupi|Kunjibettu',
        areaLabel: 'Kunjibettu',
        geo_center_lat: 13.36,
        geo_center_lon: 74.8,
        bbox: [[13.352, 74.792], [13.38, 74.82]],
      };
      const { result } = renderHook(() =>
        useSchoolListings(
          makeParams({
            filters: {
              ...EMPTY_FILTERS,
              schoolLat: 13.33,
              schoolLon: 74.76,
              schoolRadiusKm: 3,
              schoolAreaKey: 'IN|KA|Udupi|Kunjibettu',
            },
            journey: 'area-first',
            schoolId: null,
            selectedArea: boundaryArea,
          }),
        ),
      );
      expect(result.current.schoolListings).toHaveLength(1);
      expect(result.current.schoolListings[0].id).toBe('radius-1');
    });

    it('#2183 fallback: when NOT server-scoped by schoolAreaKey (e.g. polygon filter active), client selectedArea.bbox still filters out-of-bbox listings', () => {
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
            filters: {
              ...EMPTY_FILTERS,
              schoolLat: 13.35,
              schoolLon: 74.79,
              schoolRadiusKm: 2,
              polygon: [
                [12.9, 77.5],
                [12.95, 77.5],
                [12.95, 77.6],
                [12.9, 77.6],
              ],
            },
            journey: 'school-first',
            schoolId: 'school-1',
            selectedArea: areaFarFromListing,
          }),
        ),
      );
      expect(result.current.schoolListings).toEqual([]);
      expect(result.current.schoolRadiusFallbackMarkers).toEqual([]);
    });

    it('#2183 fallback: when schoolId is null and no schoolAreaKey is on filters, client selectedArea.bbox excludes out-of-bbox listings', () => {
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
            schoolId: null,
            selectedArea: areaFarFromListing,
          }),
        ),
      );
      expect(result.current.schoolListings).toEqual([]);
    });

    it('#2806 response-scope guard: when schoolRadiusListings still carries rows from a previous Area (mismatched scopedAreaKey or areaKey), client bbox clipping is NOT bypassed', () => {
      const newlySelectedArea: AreaPoint = {
        areaKey: 'IN|KA|Udupi|Kunjibettu',
        areaLabel: 'Kunjibettu',
        geo_center_lat: 12.9,
        geo_center_lon: 77.5,
        bbox: [[12.9, 77.5], [12.95, 77.6]],
      };
      const { result } = renderHook(() =>
        useSchoolListings(
          makeParams({
            filters: { ...EMPTY_FILTERS, schoolLat: 13.35, schoolLon: 74.79, schoolRadiusKm: 3 },
            journey: 'school-first',
            schoolId: 'school-1',
            selectedArea: newlySelectedArea,
            schoolRadiusListings: [
              makeSchoolRadiusListing({
                id: 'stale-prev-area',
                areaKey: 'IN|KA|Udupi|Manipal',
                scopedAreaKey: 'IN|KA|Udupi|Manipal',
              }),
            ],
          }),
        ),
      );
      expect(result.current.schoolListings).toEqual([]);
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

  // ── Issue #2184 regression: authenticated wide-radius (10km) area-school-combined
  // panel/map disagreement ──────────────────────────────────────────────────────
  //
  // Repro (live-verified): an authenticated area-school-combined session
  // (areaKey + schoolId both set, radiusKm=10) where the PUBLIC
  // /school-radius-listings endpoint's capped `page=0&size=50` city-wide window
  // (schoolRadiusListings) happens to contain ZERO rows for the selected area
  // (hasMore=true is common at this cap — the endpoint has no ordering guarantee
  // that a given area's matches land within the first page). Before this fix,
  // schoolRadiusFallbackMarkers (the map's pre-CTA fallback, Tier 2 in
  // resolveMarkerListings.ts) derived from that same incomplete public-endpoint
  // window for BOTH auth and anon users, so it went to 0 — while schoolListings
  // (the panel) derives from `filteredListings`, the authenticated combined
  // area-bbox-polygon + school-radius backend query, which is genuinely complete
  // and returned 6 real listings. The panel showed "6 homes"; the map showed
  // zero pins. All prior #2183 coverage above used the 3km/5km case where the
  // public-endpoint window and the authenticated combined query happened to
  // agree — this is the first case that exercises the 10km-scale divergence.
  describe('Issue #2184 — authenticated schoolRadiusFallbackMarkers derives from filteredListings, not the capped public school-radius window', () => {
    it('authenticated, combined area+school state: schoolRadiusFallbackMarkers matches schoolListings even when the public school-radius page (schoolRadiusListings) is empty for this area', () => {
      const sixFilteredListings = Array.from({ length: 6 }, (_, i) =>
        makeFilteredListing({ id: `filtered-${i}`, latitude: 12.9 + i * 0.001, longitude: 77.58 + i * 0.001 }),
      );
      const { result } = renderHook(() =>
        useSchoolListings(
          makeParams({
            isAuthenticated: true,
            filters: { ...EMPTY_FILTERS, schoolLat: 12.900026, schoolLon: 77.5276092, schoolRadiusKm: 10 },
            journey: 'school-first',
            schoolId: 'school-1',
            selectedArea: makeSelectedAreaContaining({ bbox: [[12.91, 77.58], [12.94, 77.61]] }),
            // The public capped page found nothing in this area (hasMore=true upstream) —
            // must NOT be the source schoolRadiusFallbackMarkers falls back to for auth users.
            schoolRadiusListings: [],
            filteredListings: sixFilteredListings,
          }),
        ),
      );
      expect(result.current.schoolListings).toHaveLength(6);
      // The core #2184 invariant: map marker count agrees with panel listing count.
      expect(result.current.schoolRadiusFallbackMarkers).toHaveLength(6);
      expect(result.current.schoolRadiusFallbackMarkers.map((m) => m.id).sort()).toEqual(
        sixFilteredListings.map((l) => l.id).sort(),
      );
    });

    it('authenticated: schoolRadiusFallbackMarkers excludes filteredListings entries with null coordinates', () => {
      const { result } = renderHook(() =>
        useSchoolListings(
          makeParams({
            isAuthenticated: true,
            journey: 'school-first',
            schoolId: 'school-1',
            filteredListings: [
              makeFilteredListing({ id: 'has-coords' }),
              makeFilteredListing({ id: 'no-coords', latitude: null, longitude: null }),
            ],
          }),
        ),
      );
      expect(result.current.schoolRadiusFallbackMarkers).toHaveLength(1);
      expect(result.current.schoolRadiusFallbackMarkers[0].id).toBe('has-coords');
    });

    it('authenticated, genuinely zero matching listings: both schoolListings and schoolRadiusFallbackMarkers agree at zero (no false-positive parity)', () => {
      const { result } = renderHook(() =>
        useSchoolListings(
          makeParams({
            isAuthenticated: true,
            journey: 'school-first',
            schoolId: 'school-1',
            filteredListings: [],
          }),
        ),
      );
      expect(result.current.schoolListings).toEqual([]);
      expect(result.current.schoolRadiusFallbackMarkers).toEqual([]);
    });
  });
});
