/**
 * useDiscoverMapData / useDiscoverCityListings — Issue #2531
 *
 * WHAT WAS BROKEN. The backend has accepted `commercialSubtypes` on
 * GET /api/discover/cities/{city}/listings since #2509, and #2553 made a committed
 * Commercial subtype survive the commit boundary into the panel's filters. But the
 * axis then hit a wall: `DiscoverCityListingsParams` had no such field, so the
 * subtype was not merely dropped on the way to the wire — it was UNREPRESENTABLE.
 * A buyer selecting "Office" got Shops back, because the request never carried the
 * narrowing at all and the server cannot narrow on a question it was not asked.
 *
 * These tests assert the REQUEST SHAPE — the repeated param actually reaching the
 * wire — not a rendered count. The endpoint is what the fix widens, and a count
 * assertion would pass just as well against an unfiltered response (the exact
 * false-green this defect already produced once).
 *
 * Following the sibling #2533 spec's discipline: every test asserts the call was
 * FOUND before asserting anything about its URL. The `if (call) { ... }` idiom
 * passes vacuously when no call is made, which is indistinguishable from the bug.
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
      listings: [{ id: 'l1', propertyType: 'commercial', commercialSubtype: 'OFFICE' }],
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

/** The anon VIEWPORT request (#2015 bbox-only mode) — no areaKeys, carries `bbox`. */
function findViewportCall(): string | undefined {
  const urls = mockApiGet.mock.calls.map(([url]: [string]) => url as string);
  return urls.find((u) => u.includes('/listings?') && u.includes('bbox=') && !u.includes('areaKeys='));
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
    Promise.resolve(url.includes('/listings?') ? CITY_LISTINGS_RESPONSE : AREAS_RESPONSE),
  );
});

describe('useDiscoverMapData — Commercial subtype reaches the city-listings endpoint (#2531)', () => {
  it('sends a single selected subtype as a repeated, plural-named param', async () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          selectedArea: SELECTED_AREA,
          filters: { commercialSubtypes: ['OFFICE'] },
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(findCityListingsCall()).toBeDefined());

    const params = paramsOf(findCityListingsCall()!);
    expect(params.getAll('commercialSubtypes')).toEqual(['OFFICE']);
  });

  it('sends every selected subtype — a multi-select is narrowed, not dropped', async () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          selectedArea: SELECTED_AREA,
          filters: { commercialSubtypes: ['SHOP', 'OFFICE'] },
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(findCityListingsCall()).toBeDefined());

    const params = paramsOf(findCityListingsCall()!);
    expect(params.getAll('commercialSubtypes')).toEqual(['SHOP', 'OFFICE']);
  });

  /**
   * ONE AXIS (see listing-constants.ts:195-204 and AreaSelectedPanel's one-axis
   * contract): a Commercial selection rides `commercialSubtypes` ALONE and sets no
   * `propertyTypes`. A fix that forwarded the subtype only when a property type was
   * also present would pass the two tests above if they happened to set both — and
   * would drop the subtype on every real selection. This pins the real shape.
   */
  it('forwards the subtype when NO propertyType is selected (the real one-axis shape)', async () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          selectedArea: SELECTED_AREA,
          filters: { commercialSubtypes: ['OFFICE'] },
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(findCityListingsCall()).toBeDefined());

    const params = paramsOf(findCityListingsCall()!);
    expect(params.getAll('commercialSubtypes')).toEqual(['OFFICE']);
    expect(params.has('propertyType')).toBe(false);
  });

  /**
   * Falsifiability control — SAME query shape, varying only the axis under test.
   * Without this, a fix that unconditionally appended every known subtype would
   * pass every assertion above.
   */
  it('omits the param entirely when no subtype is selected', async () => {
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
    expect(params.has('commercialSubtypes')).toBe(false);
  });

  /**
   * MAP/LIST AGREEMENT. This hook feeds the card list AND the map markers from the
   * city-listings queries. Fixing only the area-click call would leave the anon
   * VIEWPORT set asking a DIFFERENT question, so a "Search this area" result would
   * show pins the cards had excluded. Both call sites must carry the same predicate.
   */
  it('the anon VIEWPORT (bbox-only) call carries the subtype too, so markers and cards agree', async () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          isAuthenticated: false,
          resultScope: { kind: 'VIEWPORT', bounds: { s: 13.3, w: 74.7, n: 13.4, e: 74.8 } },
          filters: { commercialSubtypes: ['OFFICE'] },
        } as Parameters<typeof useDiscoverMapData>[0]),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(findViewportCall()).toBeDefined());

    const params = paramsOf(findViewportCall()!);
    expect(params.getAll('commercialSubtypes')).toEqual(['OFFICE']);
  });

  /**
   * The agri journey pins the family to agricultural_land. A leftover Commercial
   * subtype would AND against that and empty the agri result set — the same
   * shape as the readyToMove/possessionStatus false-empty documented in
   * NodeListingsSurface.tsx. Mirrors the existing `discoverPropertyType` forcing.
   */
  it('does not leak a Commercial subtype into the agri journey', async () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          selectedArea: SELECTED_AREA,
          journey: 'agri-first',
          filters: { commercialSubtypes: ['OFFICE'] },
        } as Parameters<typeof useDiscoverMapData>[0]),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(findCityListingsCall()).toBeDefined());

    const params = paramsOf(findCityListingsCall()!);
    expect(params.has('commercialSubtypes')).toBe(false);
    expect(params.getAll('propertyType')).toEqual(['agricultural_land']);
  });
});

describe('useDiscoverMapData — subtype participates in the cache key (#2531)', () => {
  /**
   * The subtype must reach the KEY as well as the wire. If it reached only the wire,
   * switching Shop→Office would hit the already-cached Shop entry and (with
   * `keepPreviousData`) render the previous rows with no refetch — a silent wrong
   * answer rather than a visible error. Asserting a SECOND request fires is what
   * distinguishes "re-asked the server" from "served the stale set".
   */
  it('changing the subtype issues a new request rather than serving the cached one', async () => {
    const { rerender } = renderHook(
      ({ subtypes }: { subtypes: string[] }) =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          selectedArea: SELECTED_AREA,
          filters: { commercialSubtypes: subtypes },
        } as Parameters<typeof useDiscoverMapData>[0]),
      { wrapper: makeWrapper(), initialProps: { subtypes: ['SHOP'] } },
    );

    await waitFor(() => expect(findCityListingsCall()).toBeDefined());
    const shopUrls = mockApiGet.mock.calls
      .map(([u]: [string]) => u as string)
      .filter((u) => u.includes('commercialSubtypes=SHOP'));
    expect(shopUrls.length).toBeGreaterThan(0);

    rerender({ subtypes: ['OFFICE'] });

    await waitFor(() => {
      const officeUrls = mockApiGet.mock.calls
        .map(([u]: [string]) => u as string)
        .filter((u) => u.includes('commercialSubtypes=OFFICE'));
      expect(officeUrls.length).toBeGreaterThan(0);
    });
  });
});
