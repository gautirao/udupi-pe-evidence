/**
 * Issue #1793 SR-024 — a backend/network failure must surface as an ERROR signal at the
 * useDiscoverMapData boundary, never as a silently-empty list/count.
 *
 * A1 (Schools): `isErrorSchoolRadiusListings` / `refetchSchoolRadiusListings` mirror the
 *   school-radius query, gated on that query actually being the panel's card source.
 * A2 (anon viewport): `isErrorAnonViewport` is gated on `isAnonViewport` (a disabled query must
 *   never leak a stale error into the panel).
 * A3 (map canvas): `isErrorDiscoverAreas` / `refetchDiscoverAreas` mirror the blended
 *   /api/discover/areas query so the map's "No properties listed" copy can tell a failed
 *   request from a genuinely empty city.
 *
 * Mocking mirrors useDiscoverMapData.issue2461.test.ts (the same boundary).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ResultScope } from '@/features/discover/state/resultScope';

const mockFilteredMarkers = vi.hoisted(() => vi.fn());
const mockDiscoverListings = vi.hoisted(() => vi.fn());
const mockTrendsOptions = vi.hoisted(() => vi.fn());
const mockSchoolRadiusListings = vi.hoisted(() => vi.fn());
const mockSchoolById = vi.hoisted(() => vi.fn());
const mockApiGet = vi.hoisted(() => vi.fn());

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
  api: { get: mockApiGet },
  ApiError: class extends Error {},
}));

import { useDiscoverMapData } from '../useDiscoverMapData';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const VIEWPORT_SCOPE: ResultScope = {
  kind: 'VIEWPORT',
  bounds: { s: 12.9, w: 77.5, n: 12.95, e: 77.56 },
};

const BASE_PARAMS = {
  city: 'bangalore',
  selectedArea: null as null,
  filters: {},
  debouncedSearch: '',
  urlSchoolId: null as null,
  isAuthenticated: false,
  fitTick: 0,
  markersEnabled: false,
  page: 0,
  bbox: null as null,
  journey: 'school-first' as const,
};

const SCHOOL_FILTERS = { schoolLat: 12.9, schoolLon: 77.5, schoolRadiusKm: 3 };
const mockRefetchSchoolRadius = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockFilteredMarkers.mockReturnValue({ data: undefined, isLoading: false, isFetching: false });
  mockDiscoverListings.mockReturnValue({
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  });
  mockTrendsOptions.mockReturnValue({ data: undefined });
  mockSchoolRadiusListings.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: mockRefetchSchoolRadius });
  mockSchoolById.mockReturnValue({ data: undefined, isLoading: false, error: null });
  mockApiGet.mockResolvedValue({ city: 'bangalore', areas: [] });
});

describe('Issue #1793 A1 — school-radius listings error signal', () => {
  it('anon + school radius active: a failed school-radius query is exposed as isErrorSchoolRadiusListings and Retry re-issues that query', () => {
    mockSchoolRadiusListings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetchSchoolRadius,
    });
    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, filters: SCHOOL_FILTERS }),
      { wrapper: makeWrapper() },
    );

    expect(result.current.isErrorSchoolRadiusListings).toBe(true);
    act(() => {
      result.current.refetchSchoolRadiusListings();
    });
    expect(mockRefetchSchoolRadius).toHaveBeenCalledTimes(1);
  });

  it('gated on the query being ENABLED: with no school coordinates a stale isError never surfaces', () => {
    mockSchoolRadiusListings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetchSchoolRadius,
    });
    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, filters: {} }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.isErrorSchoolRadiusListings).toBe(false);
  });

  it('control: a healthy school-radius query is not an error', () => {
    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, filters: SCHOOL_FILTERS }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.isErrorSchoolRadiusListings).toBe(false);
  });

  it('authenticated caller: the school-radius query is only the marker fallback (cards come from the auth listings), so its failure is NOT a panel error', () => {
    mockSchoolRadiusListings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetchSchoolRadius,
    });
    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, isAuthenticated: true, filters: SCHOOL_FILTERS }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.isErrorSchoolRadiusListings).toBe(false);
  });
});

describe('Issue #1793 A2 — anon viewport error signal is gated on the anon viewport scope', () => {
  it('anon + committed VIEWPORT + failed request: isErrorAnonViewport is true and Retry re-issues the viewport request', async () => {
    mockApiGet.mockImplementation((path: string) =>
      path.includes('/listings') ? Promise.reject(new Error('500')) : Promise.resolve({ city: 'bangalore', areas: [] }),
    );
    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, journey: 'area-first', resultScope: VIEWPORT_SCOPE }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isErrorAnonViewport).toBe(true));
    expect(result.current.isAnonViewport).toBe(true);

    const listingCallsBefore = mockApiGet.mock.calls.filter(([p]) => String(p).includes('/listings')).length;
    act(() => {
      result.current.refetchAnonViewport();
    });
    await waitFor(() =>
      expect(mockApiGet.mock.calls.filter(([p]) => String(p).includes('/listings')).length).toBeGreaterThan(listingCallsBefore),
    );
  });

  it('control: with no committed VIEWPORT scope the anon viewport error stays false', async () => {
    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, journey: 'area-first', resultScope: null }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.isAnonViewport).toBe(false);
    expect(result.current.isErrorAnonViewport).toBe(false);
  });
});

describe('Issue #1793 A3 — /api/discover/areas error signal', () => {
  it('a failed /api/discover/areas request is exposed as isErrorDiscoverAreas and Retry re-issues it', async () => {
    mockApiGet.mockRejectedValue(new Error('500'));
    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, journey: 'area-first' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isErrorDiscoverAreas).toBe(true));

    const callsBefore = mockApiGet.mock.calls.filter(([p]) => String(p).includes('/api/discover/areas')).length;
    act(() => {
      result.current.refetchDiscoverAreas();
    });
    await waitFor(() =>
      expect(
        mockApiGet.mock.calls.filter(([p]) => String(p).includes('/api/discover/areas')).length,
      ).toBeGreaterThan(callsBefore),
    );
  });

  it('control: a genuinely empty city (200 with zero areas) is NOT an error', async () => {
    mockApiGet.mockResolvedValue({ city: 'bangalore', areas: [] });
    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, journey: 'area-first' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.areasLoading).toBe(false));
    expect(result.current.isErrorDiscoverAreas).toBe(false);
  });
});
