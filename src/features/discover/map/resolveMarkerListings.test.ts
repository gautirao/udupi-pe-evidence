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
    isNodeListingsState: false,
    mapZoom: 14,
    areaLayerMaxZoom: AREA_LAYER_MAX_ZOOM,
    isAuthenticated: true,
    journey: 'area-first',
    schoolId: null,
    groupResultsMarkers: [],
    nodeListingsMarkers: [],
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

  describe('Issue #2089 bounded-Browse node-scope', () => {
    it('isNodeListingsState returns nodeListingsMarkers, never the city-wide markerListings', () => {
      const nodeListingsMarkers = makeMarkers(2);
      const cityWideMarkerListings = makeMarkers(5);
      const result = resolveMarkerListings(
        baseInput({
          isNodeListingsState: true,
          nodeListingsMarkers,
          markerListings: cityWideMarkerListings,
        }),
      );
      expect(result).toBe(nodeListingsMarkers);
      expect(result).not.toBe(cityWideMarkerListings);
    });

    it('isNodeListingsState with empty nodeListingsMarkers returns [] (no fallthrough to other branches)', () => {
      const cityWideMarkerListings = makeMarkers(5);
      const result = resolveMarkerListings(
        baseInput({
          isNodeListingsState: true,
          nodeListingsMarkers: [],
          markerListings: cityWideMarkerListings,
        }),
      );
      expect(result).toEqual([]);
    });

    it('isNodeListingsState bypasses the zoom-suppression threshold (no selectedArea, zoom <= areaLayerMaxZoom)', () => {
      const nodeListingsMarkers = makeMarkers(3);
      const result = resolveMarkerListings(
        baseInput({
          isNodeListingsState: true,
          nodeListingsMarkers,
          selectedArea: null,
          mapZoom: 10,
        }),
      );
      expect(result).toBe(nodeListingsMarkers);
    });

    it('isGroupResultsState (the pre-existing #1597 branch) still wins when both flags are somehow true — node-listings does not preempt it', () => {
      const nodeListingsMarkers = makeMarkers(1);
      const groupResultsMarkers = makeMarkers(4);
      const result = resolveMarkerListings(
        baseInput({
          isGroupResultsState: true,
          groupResultsMarkers,
          isNodeListingsState: true,
          nodeListingsMarkers,
        }),
      );
      expect(result).toBe(groupResultsMarkers);
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

  // Issue #2193 AC3 (marker half) — real PropertyMap rendering proved genuinely
  // infeasible in this suite (every existing PropertyMap.*.test.tsx mocks the
  // `leaflet` module itself — `marker`/`divIcon` are `vi.fn()` stubs — so no
  // existing convention in this repo produces a real DOM
  // `data-testid="property-marker"` element under JSDOM; see specialist report
  // for the full R2 discussion). This proves the MARKER-SELECTION layer instead:
  // resolveMarkerListings is the pure selector that decides which listing array
  // actually reaches <PropertyMap listings={...}> for a resolved AREA leaf. The
  // Leaflet DOM render itself remains UNPROVEN by this test — stated explicitly,
  // not silently substituted.
  describe('Issue #2193 AC3 — dual-surface contract (marker-selection half), by listing id', () => {
    const TARGET_AREA_KEY = 'QA|QA|qa2193audit|TargetArea';
    const OUTSIDE_AREA_KEY = 'QA|QA|qa2193audit|OutsideArea';
    const TARGET_LISTING_ID = '11111111-1111-1111-1111-111111111111';
    const OUTSIDE_LISTING_ID = '22222222-2222-2222-2222-222222222222';

    const TARGET_AREA: AreaPoint = {
      areaKey: TARGET_AREA_KEY,
      areaLabel: 'TargetArea',
      geo_center_lat: 13.0,
      geo_center_lon: 74.0,
      bbox: [[12.9, 73.9], [13.1, 74.1]],
      listingCount: 1,
    };

    function makeIdentifiedMarker(id: string, lat: number, lon: number): PropertyListingWithImages {
      return { ...makeMarker(), id, latitude: lat, longitude: lon };
    }

    // ONE shared fixture payload (N5) — the SAME two listing objects are reused
    // as the source of truth for both this selector-level assertion and (via
    // the identical TARGET_LISTING_ID / TARGET_AREA_KEY constants) the AC3
    // panel-render spec in
    // src/components/discover/__tests__/DiscoverDualSurfaceInvariant2193.test.tsx.
    // A desync (panel/marker fixtures built independently) is exactly what N5
    // exists to defeat, so the identifiers here are NOT re-invented per file.
    const targetListing = makeIdentifiedMarker(TARGET_LISTING_ID, 13.0, 74.0);
    const outsideListing = makeIdentifiedMarker(OUTSIDE_LISTING_ID, 20.0, 80.0);

    it('a resolved AREA leaf surfaces ONLY the in-area TARGET listing by id — the OUTSIDE listing (negative control) never leaks in', () => {
      // R5: zoom explicitly set/asserted ABOVE the marker-visibility threshold
      // so an absent marker cannot be misread as "correctly suppressed".
      const mapZoom = 14;
      const areaLayerMaxZoom = 12;
      expect(mapZoom).toBeGreaterThan(areaLayerMaxZoom);

      const result = resolveMarkerListings(
        baseInput({
          selectedArea: TARGET_AREA,
          mapZoom,
          areaLayerMaxZoom,
          isLoadingAreaListings: false,
          isErrorAreaListings: false,
          // areaMarkerListings is what the real controller derives from the
          // SAME node-scoped payload the panel consumes (areaListings ->
          // withCoords, useDiscoverMapData.ts) — deliberately containing
          // ONLY the target listing, proving scope containment at the
          // selector boundary regardless of what a wider unscoped fetch
          // might have returned.
          areaMarkerListings: [targetListing],
          // markerListings simulates an UNSCOPED/city-wide fetch that (bug
          // scenario) leaked the OUTSIDE listing too — proving the selector
          // prefers the area-scoped array and never falls through to it here.
          markerListings: [targetListing, outsideListing],
        }),
      );

      const ids = result.map((l) => l.id);
      expect(ids).toContain(TARGET_LISTING_ID);
      expect(ids).not.toContain(OUTSIDE_LISTING_ID);
      expect(result).toEqual([targetListing]);
    });

    it('discriminating negative control — swapping selectedArea to OUTSIDE_AREA_KEY with only outsideListing scoped proves the TARGET is excluded when out of scope', () => {
      const result = resolveMarkerListings(
        baseInput({
          selectedArea: { ...TARGET_AREA, areaKey: OUTSIDE_AREA_KEY, areaLabel: 'OutsideArea' },
          mapZoom: 14,
          areaLayerMaxZoom: 12,
          areaMarkerListings: [outsideListing],
          markerListings: [targetListing, outsideListing],
        }),
      );
      const ids = result.map((l) => l.id);
      expect(ids).toContain(OUTSIDE_LISTING_ID);
      expect(ids).not.toContain(TARGET_LISTING_ID);
    });
  });
});
