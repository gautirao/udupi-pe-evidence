/**
 * Issue #2461 — committed-POLYGON panel parity at the useDiscoverMapData
 * boundary.
 *
 * The map's markers/totals were already polygon-scoped via `resultScope`, but
 * nothing exposed the resultScope-aware `discoverListingsPage`
 * (`GET /api/discover/listings?polygon=`, the ruled POLYGON parity target) in
 * the `DiscoverCityListingItem` shape `AreaSelectedPanel` renders — so the
 * card list stayed AREA-keyed. These tests pin the new `isPolygonScope` /
 * `polygonListings` / `polygonListingsLoading` / `isErrorPolygonListings` /
 * `refetchPolygonListings` derivation, and that the sibling VIEWPORT / AREA
 * derivations are untouched by it.
 *
 * Mocking mirrors useDiscoverMapData.issue1655.test.ts (the same boundary).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { DiscoverListingItem, DiscoverListingsPage } from '@/hooks/useDiscoverListings';
import type { ResultScope } from '@/features/discover/state/resultScope';

const mockFilteredMarkers = vi.hoisted(() => vi.fn());
const mockDiscoverListings = vi.hoisted(() => vi.fn());
const mockTrendsOptions = vi.hoisted(() => vi.fn());
const mockSchoolRadiusListings = vi.hoisted(() => vi.fn());
const mockSchoolById = vi.hoisted(() => vi.fn());
const mockDiscoverAreasGet = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: mockFilteredMarkers,
}));
vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: mockDiscoverListings,
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
vi.mock('@/lib/api', () => ({
  api: { get: mockDiscoverAreasGet },
  ApiError: class extends Error {},
}));

import { useDiscoverMapData } from '../useDiscoverMapData';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const POLYGON_COORDS: [number, number][] = [
  [12.92, 77.51],
  [12.93, 77.53],
  [12.91, 77.54],
];
const POLYGON_SCOPE: ResultScope = { kind: 'POLYGON', coordinates: POLYGON_COORDS };
const VIEWPORT_SCOPE: ResultScope = {
  kind: 'VIEWPORT',
  bounds: { s: 12.9, w: 77.5, n: 12.95, e: 77.56 },
};

function makeListing(id: string): DiscoverListingItem {
  return {
    id,
    listingNumber: null,
    propertyType: 'apartment',
    title: null,
    locality: `Locality ${id}`,
    areaKey: 'IN|KA|Bengaluru|RR Nagar',
    pricePaise: 5_000_000_00,
    landArea: null,
    landAreaUnit: null,
    builtArea: null,
    builtAreaUnit: null,
    bedrooms: 2,
    latitude: 12.92,
    longitude: 77.52,
    heroImageUrl: `https://img/${id}.jpg`,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: null,
    firstPublishedAt: null,
    lastUpdatedAt: null,
    daysOnMarket: 3,
    backOnMarket: false,
    reraNumber: null,
    reraValid: false,
    possessionStatus: null,
    sellerType: null,
    listingPurpose: 'sale',
    status: 'LIVE',
  };
}

const POLYGON_PAGE: DiscoverListingsPage = {
  content: [makeListing('poly-1'), makeListing('poly-2'), makeListing('poly-3'), makeListing('poly-4')],
  page: 0,
  size: 50,
  totalElements: 4,
  totalPages: 1,
};

const mockRefetchListings = vi.fn();

const BASE_PARAMS = {
  city: 'bangalore',
  selectedArea: null as null,
  filters: { polygon: POLYGON_COORDS },
  debouncedSearch: '',
  urlSchoolId: null as null,
  isAuthenticated: true,
  fitTick: 0,
  markersEnabled: true,
  page: 0,
  bbox: null as null,
  journey: 'area-first' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFilteredMarkers.mockReturnValue({ data: undefined, isLoading: false, isFetching: false });
  mockDiscoverListings.mockReturnValue({
    data: POLYGON_PAGE,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: mockRefetchListings,
  });
  mockTrendsOptions.mockReturnValue({ data: undefined });
  mockSchoolRadiusListings.mockReturnValue({ data: undefined, isLoading: false });
  mockSchoolById.mockReturnValue({ data: undefined, isLoading: false, error: null });
  mockDiscoverAreasGet.mockResolvedValue({ city: 'bangalore', areas: [] });
});

describe('Issue #2461 — useDiscoverMapData exposes the committed-POLYGON card list', () => {
  it('authenticated + committed POLYGON: polygonListings carries the SAME identities as discoverListingsPage, in the panel card shape', () => {
    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, resultScope: POLYGON_SCOPE }),
      { wrapper: makeWrapper() },
    );

    expect(result.current.isPolygonScope).toBe(true);
    expect(result.current.polygonListings.map((l) => l.id)).toEqual(['poly-1', 'poly-2', 'poly-3', 'poly-4']);
    // Same remap `authViewportListings` uses — PropertyCard reads primaryImageUrl/lat/lon.
    expect(result.current.polygonListings[0].primaryImageUrl).toBe('https://img/poly-1.jpg');
    expect(result.current.polygonListingsLoading).toBe(false);
    expect(result.current.isErrorPolygonListings).toBe(false);
    // The VIEWPORT branch must stay dormant — the two kinds are mutually exclusive.
    expect(result.current.isAuthViewport).toBe(false);
    expect(result.current.authViewportListings).toEqual([]);
  });

  it('committed POLYGON: loading and error mirror the listings query, and Retry re-issues that query', () => {
    mockDiscoverListings.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      error: null,
      refetch: mockRefetchListings,
    });
    const { result, rerender } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, resultScope: POLYGON_SCOPE }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.polygonListingsLoading).toBe(true);
    expect(result.current.polygonListings).toEqual([]);

    mockDiscoverListings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new Error('boom'),
      refetch: mockRefetchListings,
    });
    rerender();
    expect(result.current.isErrorPolygonListings).toBe(true);

    act(() => {
      result.current.refetchPolygonListings();
    });
    expect(mockRefetchListings).toHaveBeenCalledTimes(1);
  });

  it('committed VIEWPORT (control): the polygon branch stays empty and the VIEWPORT branch is unchanged', () => {
    const { result } = renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          filters: {},
          resultScope: VIEWPORT_SCOPE,
        }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.isPolygonScope).toBe(false);
    expect(result.current.polygonListings).toEqual([]);
    expect(result.current.isAuthViewport).toBe(true);
    expect(result.current.authViewportListings.map((l) => l.id)).toEqual(['poly-1', 'poly-2', 'poly-3', 'poly-4']);
  });

  it('no committed scope (AREA/AREA_SET control): the polygon branch stays empty', () => {
    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, filters: {}, resultScope: null }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.isPolygonScope).toBe(false);
    expect(result.current.polygonListings).toEqual([]);
    expect(result.current.polygonListingsLoading).toBe(false);
    expect(result.current.isErrorPolygonListings).toBe(false);
  });

  it('anonymous caller with a POLYGON scope never activates the branch (polygon search is signed-in-only)', () => {
    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, isAuthenticated: false, resultScope: POLYGON_SCOPE }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.isPolygonScope).toBe(false);
    expect(result.current.polygonListings).toEqual([]);
  });
});
