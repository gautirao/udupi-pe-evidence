/**
 * Issue #1793 SR-024 (AC A2) — `isErrorAnonViewport` must be gated on `isAnonViewport`.
 *
 * The anon "Search this area" query is DISABLED outside an anon committed-VIEWPORT scope, but a
 * disabled react-query observer can still report `isError: true` (e.g. a prior error on the same
 * cache entry). Read raw, that stale error leaked into the panel as a request failure on a surface
 * that was not even showing the viewport result. This file mocks the city-listings query so the
 * stale `isError: true` is deterministic, independent of react-query's cache behaviour.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ResultScope } from '@/features/discover/state/resultScope';

const mockFilteredMarkers = vi.hoisted(() => vi.fn());
const mockDiscoverListings = vi.hoisted(() => vi.fn());
const mockTrendsOptions = vi.hoisted(() => vi.fn());
const mockSchoolRadiusListings = vi.hoisted(() => vi.fn());
const mockSchoolById = vi.hoisted(() => vi.fn());
const mockCityListings = vi.hoisted(() => vi.fn());
const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({ useDiscoverFilteredMarkers: mockFilteredMarkers }));
vi.mock('@/hooks/useDiscoverListings', () => ({ useDiscoverListings: mockDiscoverListings }));
vi.mock('@/hooks/useTrendsOptions', () => ({ useTrendsOptions: mockTrendsOptions }));
vi.mock('@/hooks/useSchoolRadiusListings', () => ({
  useSchoolRadiusListings: mockSchoolRadiusListings,
  mapSchoolRadiusCard: vi.fn((x: unknown) => x),
}));
vi.mock('@/hooks/useSchoolSearch', () => ({ useSchoolById: mockSchoolById }));
vi.mock('@/hooks/useDiscoverCityListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDiscoverCityListings')>();
  return { ...actual, useDiscoverCityListings: mockCityListings };
});
vi.mock('@/lib/api', () => ({ api: { get: mockApiGet }, ApiError: class extends Error {} }));

import { useDiscoverMapData } from '../useDiscoverMapData';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const VIEWPORT_SCOPE: ResultScope = { kind: 'VIEWPORT', bounds: { s: 12.9, w: 77.5, n: 12.95, e: 77.56 } };

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
  journey: 'area-first' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFilteredMarkers.mockReturnValue({ data: undefined, isLoading: false, isFetching: false });
  mockDiscoverListings.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, error: null, refetch: vi.fn() });
  mockTrendsOptions.mockReturnValue({ data: undefined });
  mockSchoolRadiusListings.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
  mockSchoolById.mockReturnValue({ data: undefined, isLoading: false, error: null });
  mockApiGet.mockResolvedValue({ city: 'bangalore', areas: [] });
  // Every city-listings query (AREA and anon viewport) reports a stale error.
  mockCityListings.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, isError: true, refetch: vi.fn() });
});

describe('Issue #1793 A2 — isErrorAnonViewport is gated on isAnonViewport', () => {
  it('outside an anon VIEWPORT scope a stale isError from the disabled query never surfaces', () => {
    const { result } = renderHook(() => useDiscoverMapData({ ...BASE_PARAMS, resultScope: null }), {
      wrapper: makeWrapper(),
    });
    expect(result.current.isAnonViewport).toBe(false);
    expect(result.current.isErrorAnonViewport).toBe(false);
  });

  it('control: inside an anon VIEWPORT scope the same query error DOES surface', () => {
    const { result } = renderHook(() => useDiscoverMapData({ ...BASE_PARAMS, resultScope: VIEWPORT_SCOPE }), {
      wrapper: makeWrapper(),
    });
    expect(result.current.isAnonViewport).toBe(true);
    expect(result.current.isErrorAnonViewport).toBe(true);
  });

  it('an authenticated caller with a VIEWPORT scope is not an anon viewport, so no anon viewport error', () => {
    const { result } = renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, isAuthenticated: true, resultScope: VIEWPORT_SCOPE }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.isAnonViewport).toBe(false);
    expect(result.current.isErrorAnonViewport).toBe(false);
  });
});
