/**
 * useDiscoverMapData — Issue #2533 (frontend half)
 *
 * The backend half (cdf36c8a, PR #2550) widened `propertyType`/`bedrooms` on
 * GET /api/discover/cities/{city}/listings from a single value to a repeated
 * param, keeping the parameter NAMES unchanged. Nothing on the frontend ever
 * sent the repeated form, so that half is buyer-inert on its own.
 *
 * WHAT WAS BROKEN. Every call site collapsed the multi-select to a single
 * value with `filters.propertyTypes?.length === 1 ? filters.propertyTypes[0]
 * : undefined`. On a multi-select that yields `undefined` — the filter is not
 * narrowed, it is DROPPED. Per the #2530 hotfix commit: with propertyType
 * undefined the query key reverts to the unfiltered shape already cached at
 * page load, so React Query serves from cache and `keepPreviousData` keeps the
 * old rows. A buyer selecting Commercial + Warehouse therefore keeps seeing
 * apartments, houses and land — gross over-inclusion, not an empty list.
 *
 * These tests assert the REQUEST SHAPE (the repeated param actually reaching
 * the wire), not a rendered count: the endpoint is what the fix widens, and a
 * count assertion here would pass just as well against an unfiltered response.
 *
 * Deliberately NOT following the `if (cityListingsCall) { ... }` idiom used by
 * the sibling agri spec — that shape passes vacuously when the call is never
 * made, which is indistinguishable from the bug. Every test here asserts the
 * call was found BEFORE asserting anything about its URL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────

const mockApiGet = vi.hoisted(() => vi.fn());
const mockDiscoverListings = vi.hoisted(() => vi.fn());
const mockFilteredMarkers = vi.hoisted(() => vi.fn());
const mockTrendsOptions = vi.hoisted(() => vi.fn());
const mockSchoolRadiusListings = vi.hoisted(() => vi.fn());
const mockSchoolById = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet },
  ApiError: class extends Error {},
}));

vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: mockDiscoverListings,
}));

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: mockFilteredMarkers,
}));

vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: mockTrendsOptions,
}));

vi.mock('@/hooks/useSchoolRadiusListings', () => ({
  useSchoolRadiusListings: mockSchoolRadiusListings,
  mapSchoolRadiusCard: vi.fn((x: unknown) => x),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolById: mockSchoolById,
}));

// Import hook AFTER mocks
import { useDiscoverMapData } from '../useDiscoverMapData';

// ─── Helpers ──────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: 'IN|KA|Udupi|Manipal',
      name: 'Manipal',
      geoCenterLat: 13.35,
      geoCenterLon: 74.79,
      listingCount: 42,
      schoolCount: 3,
    },
  ],
};

const CITY_LISTINGS_RESPONSE = {
  city: 'udupi',
  limitPerArea: 50,
  areas: [
    {
      areaKey: 'IN|KA|Udupi|Manipal',
      areaName: 'Manipal',
      listings: [{ id: 'l1', propertyType: 'commercial' }],
    },
  ],
};

const SELECTED_AREA = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.35,
  geo_center_lon: 74.79,
  bbox: null as null,
  listingCount: 42,
  schoolCount: 3,
};

const BASE_PARAMS = {
  city: 'udupi',
  selectedArea: null as null,
  filters: {},
  debouncedSearch: '',
  urlSchoolId: null as null,
  isAuthenticated: false,
  fitTick: 0,
  markersEnabled: false,
  page: 0,
  bbox: null as null,
};

/** The area-listings request — the one carrying `areaKeys`, not the areas summary call. */
function findCityListingsCall(): string | undefined {
  const urls = mockApiGet.mock.calls.map(([url]: [string]) => url as string);
  return urls.find((u) => u.includes('/listings?') && u.includes('areaKeys='));
}

function paramsOf(url: string): URLSearchParams {
  return new URLSearchParams(url.split('?')[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDiscoverListings.mockReturnValue({
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
  });
  mockFilteredMarkers.mockReturnValue({ data: undefined, isLoading: false, isFetching: false });
  mockTrendsOptions.mockReturnValue({ data: undefined });
  mockSchoolRadiusListings.mockReturnValue({ data: undefined, isLoading: false });
  mockSchoolById.mockReturnValue({ data: undefined, isLoading: false, error: null });
  mockApiGet.mockImplementation((url: string) =>
    Promise.resolve(url.includes('areaKeys=') ? CITY_LISTINGS_RESPONSE : AREAS_RESPONSE),
  );
});

describe('useDiscoverMapData — multi-value narrowing reaches the city-listings endpoint (#2533)', () => {
  it('sends every selected propertyType as a repeated param', async () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          selectedArea: SELECTED_AREA,
          filters: { propertyTypes: ['commercial', 'warehouse'] },
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(findCityListingsCall()).toBeDefined());

    const params = paramsOf(findCityListingsCall()!);
    expect(params.getAll('propertyType')).toEqual(['commercial', 'warehouse']);
  });

  it('sends every selected bedrooms value as a repeated param', async () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          selectedArea: SELECTED_AREA,
          filters: { bedrooms: [2, 3] },
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(findCityListingsCall()).toBeDefined());

    const params = paramsOf(findCityListingsCall()!);
    expect(params.getAll('bedrooms')).toEqual(['2', '3']);
  });

  // Regression guard for the single-value path the backend deliberately kept
  // wire-compatible: one selected value must still send exactly one param, in
  // the same `?propertyType=apartment` shape as before this change.
  it('a single selected value still sends exactly one param (unchanged wire shape)', async () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          selectedArea: SELECTED_AREA,
          filters: { propertyTypes: ['apartment'], bedrooms: [3] },
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(findCityListingsCall()).toBeDefined());

    const params = paramsOf(findCityListingsCall()!);
    expect(params.getAll('propertyType')).toEqual(['apartment']);
    expect(params.getAll('bedrooms')).toEqual(['3']);
  });

  // Falsifiability control, same query shape: with NO property filter selected
  // the param must be absent entirely. Without this, a fix that unconditionally
  // appended every known type would pass the two tests above.
  it('omits both params entirely when nothing is selected', async () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          selectedArea: SELECTED_AREA,
          filters: {},
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(findCityListingsCall()).toBeDefined());

    const params = paramsOf(findCityListingsCall()!);
    expect(params.has('propertyType')).toBe(false);
    expect(params.has('bedrooms')).toBe(false);
  });
});
