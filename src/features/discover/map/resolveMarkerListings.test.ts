import { describe, it, expect } from 'vitest';
import { resolveMarkerListings, type ResolveMarkerListingsInput } from './resolveMarkerListings';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

// Issue #1824 Slice S3 — invariant-preservation matrix for the extracted pure selector.
// Mirrors docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s3-design.md §3.
// Every `return` in the original IIFE gets >=1 assertion here. Reference-identity (`toBe`)
// is asserted wherever a source array is expected to flow through unchanged — this is the
// load-bearing #1806 property (React memo + markerPopoverStepper.findIndex both depend on
// the SAME array reference being returned, never a copy).

let idCounter = 0;

function makeMarker(): PropertyListingWithImages {
  idCounter += 1;
  return {
    id: `listing-${idCounter}`,
    property_type: 'house',
    title: null,
    locality: null,
    price: null,
    price_unit: null,
    land_area: null,
    land_area_unit: null,
    built_area: null,
    built_area_unit: null,
    bedrooms: null,
    bathrooms: null,
    contact_info: null,
    contact_phone: null,
    description: null,
    latitude: 13.34,
    longitude: 74.74,
    confidence_score: null,
    language_detected: null,
    price_per_cent_paise: null,
    is_valid: true,
    is_duplicate: false,
    status: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    raw_post_id: null,
    listing_purpose: 'sale',
    carpet_area: null,
    carpet_area_unit: null,
    floor_number: null,
    total_floors: null,
    furnishing_status: null,
    washrooms: null,
    parking_count: null,
    road_frontage_ft: null,
    commercial_usage: null,
    number_of_units: null,
    monthly_rent: null,
    security_deposit_months: null,
    lock_in_months: null,
    seller_type: null,
  };
}

function makeMarkers(count: number): PropertyListingWithImages[] {
  return Array.from({ length: count }, () => makeMarker());
}

const AREA: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.3527,
  geo_center_lon: 74.7889,
  bbox: null,
  listingCount: 5,
};

const AREA_LAYER_MAX_ZOOM = 12;

// Baseline input: not suppressed by layer/zoom, no area, not group-results, not school-first,
// all arrays empty, everything settled. Individual tests override only what they need to
// isolate the branch under test.
function baseInput(overrides: Partial<ResolveMarkerListingsInput> = {}): ResolveMarkerListingsInput {
  return {
    mapLayerCategory: 'all-areas',
    selectedArea: null,
    isGroupResultsState: false,
    mapZoom: 14,
    areaLayerMaxZoom: AREA_LAYER_MAX_ZOOM,
    isAuthenticated: true,
    journey: 'area-first',
    schoolId: null,
    groupResultsMarkers: [],
    markerListings: [],
    areaMarkerListings: [],
    schoolRadiusFallbackMarkers: [],
    isLoadingAreaListings: false,
    isErrorAreaListings: false,
    markersLoading: false,
    ...overrides,
  };
}

describe('resolveMarkerListings', () => {
  describe('layer suppression (L3255-3260)', () => {
    const suppressCategories: ResolveMarkerListingsInput['mapLayerCategory'][] = [
      'area-group-bubbles',
      'agri-corridor-bubbles',
      'macro-region-bubbles',
      'region-zone-areas',
    ];
    it.each(suppressCategories)('returns [] for mapLayerCategory=%s', (category) => {
      const result = resolveMarkerListings(baseInput({ mapLayerCategory: category }));
      expect(result).toEqual([]);
    });
  });

  it('zoom/landing suppression: no area, not group, zoom <= areaLayerMaxZoom → []', () => {
    const result = resolveMarkerListings(
      baseInput({ selectedArea: null, isGroupResultsState: false, mapZoom: 12 }),
    );
    expect(result).toEqual([]);
  });

  it('zoom exactly above threshold is NOT suppressed (preserves <=, not <)', () => {
    const markerListings = makeMarkers(1);
    const result = resolveMarkerListings(
      baseInput({ selectedArea: null, isGroupResultsState: false, mapZoom: 13, markerListings }),
    );
    expect(result).toBe(markerListings);
  });

  describe('FIX-1 group-scope (L3267)', () => {
    it('isGroupResultsState returns groupResultsMarkers, never the city-wide markerListings', () => {
      const groupResultsMarkers = makeMarkers(2);
      const cityWideMarkerListings = makeMarkers(5);
      const result = resolveMarkerListings(
        baseInput({
          isGroupResultsState: true,
          groupResultsMarkers,
          markerListings: cityWideMarkerListings,
        }),
      );
      expect(result).toBe(groupResultsMarkers);
      expect(result).not.toBe(cityWideMarkerListings);
    });

    it('isGroupResultsState with empty groupResultsMarkers returns [] (no fallthrough to other branches)', () => {
      const cityWideMarkerListings = makeMarkers(5);
      const result = resolveMarkerListings(
        baseInput({
          isGroupResultsState: true,
          groupResultsMarkers: [],
          markerListings: cityWideMarkerListings,
        }),
      );
      expect(result).toEqual([]);
    });
  });

  describe('school-first + schoolId (three-tier priority, L3278-3293)', () => {
    it('Tier 1: markerListings non-empty wins', () => {
      const markerListings = makeMarkers(1);
      const schoolRadiusFallbackMarkers = makeMarkers(1);
      const areaMarkerListings = makeMarkers(1);
      const result = resolveMarkerListings(
        baseInput({
          journey: 'school-first',
          schoolId: 'school-1',
          markerListings,
          schoolRadiusFallbackMarkers,
          areaMarkerListings,
          markersLoading: true,
          selectedArea: AREA,
        }),
      );
      expect(result).toBe(markerListings);
    });

    it('Tier 2: markerListings empty, schoolRadiusFallbackMarkers non-empty wins', () => {
      const schoolRadiusFallbackMarkers = makeMarkers(1);
      const areaMarkerListings = makeMarkers(1);
      const result = resolveMarkerListings(
        baseInput({
          journey: 'school-first',
          schoolId: 'school-1',
          markerListings: [],
          schoolRadiusFallbackMarkers,
          areaMarkerListings,
          markersLoading: true,
          selectedArea: AREA,
        }),
      );
      expect(result).toBe(schoolRadiusFallbackMarkers);
    });

    it('Tier 3: markerListings + schoolRadiusFallbackMarkers empty, markersLoading + selectedArea + areaMarkerListings non-empty wins', () => {
      const areaMarkerListings = makeMarkers(1);
      const result = resolveMarkerListings(
        baseInput({
          journey: 'school-first',
          schoolId: 'school-1',
          markerListings: [],
          schoolRadiusFallbackMarkers: [],
          areaMarkerListings,
          markersLoading: true,
          selectedArea: AREA,
        }),
      );
      expect(result).toBe(areaMarkerListings);
    });

    it('Tier 3 gate fails when markersLoading is false → []', () => {
      const areaMarkerListings = makeMarkers(1);
      const result = resolveMarkerListings(
        baseInput({
          journey: 'school-first',
          schoolId: 'school-1',
          markerListings: [],
          schoolRadiusFallbackMarkers: [],
          areaMarkerListings,
          markersLoading: false,
          selectedArea: AREA,
        }),
      );
      expect(result).toEqual([]);
    });

    it('school exhausted: all tiers empty/gated → []', () => {
      const result = resolveMarkerListings(
        baseInput({
          journey: 'school-first',
          schoolId: 'school-1',
          markerListings: [],
          schoolRadiusFallbackMarkers: [],
          areaMarkerListings: [],
          markersLoading: false,
          selectedArea: null,
        }),
      );
      expect(result).toEqual([]);
    });
  });

  describe('school-first + selectedArea, no schoolId (L3298-3307, FIX-2 ternary)', () => {
    it('loading → []', () => {
      const markerListings = makeMarkers(1);
      const result = resolveMarkerListings(
        baseInput({
          journey: 'school-first',
          schoolId: null,
          selectedArea: AREA,
          isLoadingAreaListings: true,
          areaMarkerListings: [],
          isErrorAreaListings: false,
          markerListings,
        }),
      );
      expect(result).toEqual([]);
    });

    it('settled + areaMarkerListings non-empty → areaMarkerListings', () => {
      const areaMarkerListings = makeMarkers(1);
      const result = resolveMarkerListings(
        baseInput({
          journey: 'school-first',
          schoolId: null,
          selectedArea: AREA,
          isLoadingAreaListings: false,
          areaMarkerListings,
          isErrorAreaListings: false,
        }),
      );
      expect(result).toBe(areaMarkerListings);
    });

    it('settled + empty + isErrorAreaListings → markerListings fallback', () => {
      const markerListings = makeMarkers(1);
      const result = resolveMarkerListings(
        baseInput({
          journey: 'school-first',
          schoolId: null,
          selectedArea: AREA,
          isLoadingAreaListings: false,
          areaMarkerListings: [],
          isErrorAreaListings: true,
          markerListings,
        }),
      );
      expect(result).toBe(markerListings);
    });

    it('settled + empty + not error → []', () => {
      const markerListings = makeMarkers(1);
      const result = resolveMarkerListings(
        baseInput({
          journey: 'school-first',
          schoolId: null,
          selectedArea: AREA,
          isLoadingAreaListings: false,
          areaMarkerListings: [],
          isErrorAreaListings: false,
          markerListings,
        }),
      );
      expect(result).toEqual([]);
    });

    it('school-first, no schoolId, no selectedArea → []', () => {
      const markerListings = makeMarkers(1);
      const result = resolveMarkerListings(
        baseInput({
          journey: 'school-first',
          schoolId: null,
          selectedArea: null,
          markerListings,
        }),
      );
      expect(result).toEqual([]);
    });
  });

  describe('area-first / area-selected, FIX-2 ternary (L3311-3334)', () => {
    it('loading → []', () => {
      const areaMarkerListings = makeMarkers(1);
      const result = resolveMarkerListings(
        baseInput({
          journey: 'area-first',
          selectedArea: AREA,
          isLoadingAreaListings: true,
          areaMarkerListings,
        }),
      );
      expect(result).toEqual([]);
    });

    it('settled + areaMarkerListings non-empty → areaMarkerListings', () => {
      const areaMarkerListings = makeMarkers(2);
      const result = resolveMarkerListings(
        baseInput({
          journey: 'area-first',
          selectedArea: AREA,
          isLoadingAreaListings: false,
          areaMarkerListings,
        }),
      );
      expect(result).toBe(areaMarkerListings);
    });

    it('FIX-2a — settled + empty + no error → [] (never falls back to city-wide markerListings, the core #1806 bug)', () => {
      const cityWideMarkerListings = makeMarkers(5);
      const result = resolveMarkerListings(
        baseInput({
          journey: 'area-first',
          selectedArea: AREA,
          isLoadingAreaListings: false,
          areaMarkerListings: [],
          isErrorAreaListings: false,
          markerListings: cityWideMarkerListings,
        }),
      );
      expect(result).toEqual([]);
      expect(result).not.toBe(cityWideMarkerListings);
    });

    it('FIX-2b — settled + empty + error → markerListings fallback', () => {
      const markerListings = makeMarkers(3);
      const result = resolveMarkerListings(
        baseInput({
          journey: 'area-first',
          selectedArea: AREA,
          isLoadingAreaListings: false,
          areaMarkerListings: [],
          isErrorAreaListings: true,
          markerListings,
        }),
      );
      expect(result).toBe(markerListings);
    });
  });

  describe('no area selected — auth gate (L3336)', () => {
    it('authenticated → markerListings', () => {
      const markerListings = makeMarkers(2);
      const result = resolveMarkerListings(
        baseInput({
          selectedArea: null,
          isGroupResultsState: false,
          mapZoom: 14,
          isAuthenticated: true,
          markerListings,
        }),
      );
      expect(result).toBe(markerListings);
    });

    it('anonymous → [] (never leaks markerListings)', () => {
      const markerListings = makeMarkers(2);
      const result = resolveMarkerListings(
        baseInput({
          selectedArea: null,
          isGroupResultsState: false,
          mapZoom: 14,
          isAuthenticated: false,
          markerListings,
        }),
      );
      expect(result).toEqual([]);
    });
  });
});
