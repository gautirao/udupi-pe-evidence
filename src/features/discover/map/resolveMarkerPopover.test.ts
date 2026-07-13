import { describe, it, expect } from 'vitest';
import { resolveMarkerPopover, type ResolveMarkerPopoverInput } from './resolveMarkerPopover';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

// Issue #1824 Slice S10b — pure-module test for resolveMarkerPopover (the
// Issue #1810 Stage 2A MODEL A marker-resolve + stepper cluster, extracted
// verbatim out of MapDiscovery.tsx). Mirrors resolveMarkerListings.test.ts's
// fixture conventions. AC-BRANCH covers every markerPopoverStepper null
// branch + the {index,total} happy path, plus >=2 representative
// currentMapMarkerListings branches proving the resolveMarkerListings
// delegation wires through. AC-IDENTITY proves the module returns fresh
// objects each call (no caching/memoization).

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

const AREA_LAYER_MAX_ZOOM = 12;

// Baseline input: not suppressed by layer/zoom, no area, not group-results,
// not school-first, all arrays empty, everything settled, popover ineligible.
// Individual tests override only what they need to isolate the branch under
// test.
function baseInput(overrides: Partial<ResolveMarkerPopoverInput> = {}): ResolveMarkerPopoverInput {
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
    isMarkerPopoverEligible: false,
    selectedMarkerListing: null,
    ...overrides,
  };
}

describe('resolveMarkerPopover', () => {
  describe('currentMapMarkerListings delegation (>=2 representative branches)', () => {
    it('isGroupResultsState=true → returns groupResultsMarkers', () => {
      const groupResultsMarkers = makeMarkers(3);
      const result = resolveMarkerPopover(
        baseInput({ isGroupResultsState: true, groupResultsMarkers }),
      );
      expect(result.currentMapMarkerListings).toEqual(groupResultsMarkers);
    });

    it('selectedArea set, settled, areaMarkerListings non-empty → returns areaMarkerListings', () => {
      const areaMarkerListings = makeMarkers(2);
      const result = resolveMarkerPopover(
        baseInput({
          selectedArea: {
            areaKey: 'IN|KA|Udupi|Manipal',
            areaLabel: 'Manipal',
            geo_center_lat: 13.3527,
            geo_center_lon: 74.7889,
            bbox: null,
            listingCount: 5,
          },
          isLoadingAreaListings: false,
          areaMarkerListings,
        }),
      );
      expect(result.currentMapMarkerListings).toEqual(areaMarkerListings);
    });

    it('mapLayerCategory=area-group-bubbles → returns []', () => {
      const result = resolveMarkerPopover(baseInput({ mapLayerCategory: 'area-group-bubbles' }));
      expect(result.currentMapMarkerListings).toEqual([]);
    });
  });

  describe('markerPopoverStepper', () => {
    it('null when !isMarkerPopoverEligible', () => {
      const markerListings = makeMarkers(3);
      const selectedMarkerListing = markerListings[1];
      const result = resolveMarkerPopover(
        baseInput({
          isAuthenticated: true,
          markerListings,
          isMarkerPopoverEligible: false,
          selectedMarkerListing,
        }),
      );
      expect(result.markerPopoverStepper).toBeNull();
    });

    it('null when selectedMarkerListing == null', () => {
      const markerListings = makeMarkers(3);
      const result = resolveMarkerPopover(
        baseInput({
          isAuthenticated: true,
          markerListings,
          isMarkerPopoverEligible: true,
          selectedMarkerListing: null,
        }),
      );
      expect(result.markerPopoverStepper).toBeNull();
    });

    it('null when the listing id is not found in currentMapMarkerListings (idx === -1)', () => {
      const markerListings = makeMarkers(3);
      const notInSet = makeMarker();
      const result = resolveMarkerPopover(
        baseInput({
          isAuthenticated: true,
          markerListings,
          isMarkerPopoverEligible: true,
          selectedMarkerListing: notInSet,
        }),
      );
      expect(result.markerPopoverStepper).toBeNull();
    });

    it('null when currentMapMarkerListings.length <= 1', () => {
      const markerListings = makeMarkers(1);
      const result = resolveMarkerPopover(
        baseInput({
          isAuthenticated: true,
          markerListings,
          isMarkerPopoverEligible: true,
          selectedMarkerListing: markerListings[0],
        }),
      );
      expect(result.markerPopoverStepper).toBeNull();
    });

    it('{ index, total } for a found listing in a multi-member set (concrete values)', () => {
      const markerListings = makeMarkers(4);
      const selectedMarkerListing = markerListings[2];
      const result = resolveMarkerPopover(
        baseInput({
          isAuthenticated: true,
          markerListings,
          isMarkerPopoverEligible: true,
          selectedMarkerListing,
        }),
      );
      expect(result.markerPopoverStepper).toEqual({ index: 2, total: 4 });
    });
  });

  describe('AC-IDENTITY: fresh objects each call (no caching/memoization)', () => {
    it('currentMapMarkerListings: equal inputs → .toEqual value-equal but .not.toBe distinct references', () => {
      // Uses the layer-suppression branch (returns a fresh `[]` array literal
      // on every resolveMarkerListings call) rather than a passthrough branch
      // (e.g. groupResultsMarkers/areaMarkerListings), which legitimately
      // returns the SAME input reference both calls per the S3 module's
      // documented load-bearing #1806 passthrough behaviour — that reference
      // reuse is correct pre-existing behaviour, not evidence of caching in
      // THIS module. A caching bug added at the resolveMarkerPopover level
      // would make this literal-array branch return the SAME reference on
      // both calls; without caching it returns two distinct empty arrays.
      const input = baseInput({ mapLayerCategory: 'area-group-bubbles' });

      const a = resolveMarkerPopover(input);
      const b = resolveMarkerPopover(input);

      expect(a.currentMapMarkerListings).toEqual(b.currentMapMarkerListings);
      expect(a.currentMapMarkerListings).not.toBe(b.currentMapMarkerListings);
    });

    it('markerPopoverStepper: equal inputs → .toEqual value-equal but .not.toBe distinct references', () => {
      const markerListings = makeMarkers(3);
      const selectedMarkerListing = markerListings[1];
      const input = baseInput({
        isAuthenticated: true,
        markerListings,
        isMarkerPopoverEligible: true,
        selectedMarkerListing,
      });

      const a = resolveMarkerPopover(input);
      const b = resolveMarkerPopover(input);

      expect(a.markerPopoverStepper).toEqual(b.markerPopoverStepper);
      expect(a.markerPopoverStepper).not.toBeNull();
      expect(a.markerPopoverStepper).not.toBe(b.markerPopoverStepper);
    });
  });
});
