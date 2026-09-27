/**
 * R7 differential test — Issue #2661 commit 1.
 *
 * SchoolSelectedPanel and AreaSchoolCombinedPanel independently implement the same
 * distance-sort + filter-reset + listing-body logic (duplicated, not shared — this
 * is exactly what a later commit (C4/C5, out of scope for commits 1-3) is expected
 * to unify). This test is the safety net for that future unification: it proves,
 * BEFORE any sharing happens, that both panels produce IDENTICAL rendered listing
 * ORDER and IDENTICAL "Clear property filters" reset behaviour for the same inputs.
 * Testids are expected to differ (school-listings-body vs combined-listings-body)
 * and are asserted separately, never compared to each other.
 *
 * If a later commit changes one panel's sort/filter-reset behaviour without
 * updating the other, this test fails — signalling the two have drifted apart
 * again (a regression on the very thing that commit was meant to fix).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { SchoolSelectedPanel, AreaSchoolCombinedPanel } from '../SchoolJourneyPanels';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

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

const mockArea: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.3531,
  geo_center_lon: 74.7935,
  bbox: [[13.34, 74.78], [13.37, 74.81]],
};

// Deliberately server-ordered (created_at DESC-like) — NOT already distance-sorted —
// so the test actually exercises the sort, not an already-sorted no-op input.
const LISTINGS: DiscoverCityListingItem[] = [
  { id: 'far', pricePaise: 100, propertyType: 'apartment', locality: 'Manipal', primaryImageUrl: null, lat: 13.40, lon: 74.85 },
  { id: 'near', pricePaise: 100, propertyType: 'apartment', locality: 'Manipal', primaryImageUrl: null, lat: 13.3535, lon: 74.794 },
  { id: 'mid', pricePaise: 100, propertyType: 'apartment', locality: 'Manipal', primaryImageUrl: null, lat: 13.37, lon: 74.82 },
  { id: 'no-coords', pricePaise: 100, propertyType: 'apartment', locality: 'Manipal', primaryImageUrl: null, lat: null, lon: null },
];

const FILTERS_ACTIVE: PropertyFilters = {
  propertyTypes: ['apartment'],
  bedrooms: [2],
  priceMin: 1000000,
  priceMax: 5000000,
  schoolLat: 13.35,
  schoolLon: 74.79,
  schoolRadiusKm: 3,
};

/**
 * Distance-badge text per rendered card, in DOM order (e.g. "0.1 km from school"),
 * or null for a card with no distance badge (no usable coordinates). Distances are
 * unique across the LISTINGS fixture, so this doubles as an identity key.
 */
function listingOrder(bodyTestId: string): Array<string | null> {
  const body = screen.getByTestId(bodyTestId);
  return Array.from(body.querySelectorAll('[data-testid="listing-card"]')).map((card) => {
    const badge = card.querySelector('[data-testid="distance-badge"]');
    return badge?.textContent ?? null;
  });
}

describe('R7 — SchoolSelectedPanel vs AreaSchoolCombinedPanel differential (Issue #2661)', () => {
  it('both panels sort the SAME listings into the SAME nearest-first order for the same school', () => {
    renderWithProviders(
      <DiscoverProvider>
        <SchoolSelectedPanel
          view={{
            chrome: {},
            viewer: {},
            school: mockSchool,
            radius: { km: 10 },
            listings: { data: LISTINGS, loading: false },
            propertyFilters: { value: {} },
            boundedSearch: {},
          }}
          commands={{
            chrome: {},
            radius: { change: vi.fn() },
            listings: {},
            propertyFilters: { replace: vi.fn() },
          }}
        />
      </DiscoverProvider>,
      { router: 'browser' },
    );
    const selectedOrder = listingOrder('school-listings-body');

    renderWithProviders(
      <DiscoverProvider>
        <AreaSchoolCombinedPanel
          view={{
            chrome: {},
            viewer: {},
            area: mockArea,
            school: mockSchool,
            radius: { km: 10 },
            listings: { data: LISTINGS, loading: false },
            propertyFilters: { value: {} },
          }}
          commands={{
            chrome: {},
            radius: { change: vi.fn() },
            listings: {},
            propertyFilters: { replace: vi.fn() },
            school: { clear: vi.fn() },
          }}
        />
      </DiscoverProvider>,
      { router: 'browser' },
    );
    const combinedOrder = listingOrder('combined-listings-body');

    // The no-coords listing (null distance badge) always sorts last in both;
    // nearest-first (ascending distance) for the rest.
    expect(selectedOrder).toHaveLength(4);
    expect(selectedOrder[3]).toBeNull();
    expect(selectedOrder.slice(0, 3).every((d) => d !== null)).toBe(true);
    expect(selectedOrder).toEqual(combinedOrder);
  });

  it('both panels reset the SAME 4 property-filter keys on "Clear property filters", preserving school-proximity fields identically', () => {
    const onFiltersChangeSelected = vi.fn();
    const { unmount } = renderWithProviders(
      <DiscoverProvider>
        <SchoolSelectedPanel
          view={{
            chrome: {},
            viewer: {},
            school: mockSchool,
            radius: { km: 3 },
            listings: { data: [], loading: false },
            propertyFilters: { value: FILTERS_ACTIVE },
            boundedSearch: {},
          }}
          commands={{
            chrome: {},
            radius: { change: vi.fn() },
            listings: {},
            propertyFilters: { replace: onFiltersChangeSelected },
          }}
        />
      </DiscoverProvider>,
      { router: 'browser' },
    );
    screen.getByTestId('clear-filters-btn').click();
    unmount();

    const onFiltersChangeCombined = vi.fn();
    renderWithProviders(
      <DiscoverProvider>
        <AreaSchoolCombinedPanel
          view={{
            chrome: {},
            viewer: {},
            area: mockArea,
            school: mockSchool,
            radius: { km: 3 },
            listings: { data: [], loading: false },
            propertyFilters: { value: FILTERS_ACTIVE },
          }}
          commands={{
            chrome: {},
            radius: { change: vi.fn() },
            listings: {},
            propertyFilters: { replace: onFiltersChangeCombined },
            school: { clear: vi.fn() },
          }}
        />
      </DiscoverProvider>,
      { router: 'browser' },
    );
    screen.getByTestId('clear-filters-btn').click();

    expect(onFiltersChangeSelected).toHaveBeenCalledTimes(1);
    expect(onFiltersChangeCombined).toHaveBeenCalledTimes(1);
    // Same reset shape from both panels (testids for the reset button happen to be
    // identical here — school-radius-empty-state's clear-filters-btn — only the
    // resulting filters object is compared, never the DOM element).
    expect(onFiltersChangeSelected.mock.calls[0][0]).toEqual(onFiltersChangeCombined.mock.calls[0][0]);
    expect(onFiltersChangeSelected.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        propertyTypes: undefined,
        bedrooms: undefined,
        priceMin: undefined,
        priceMax: undefined,
        schoolLat: 13.35,
        schoolLon: 74.79,
        schoolRadiusKm: 3,
      }),
    );
  });
});
