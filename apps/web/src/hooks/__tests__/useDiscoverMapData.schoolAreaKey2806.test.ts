import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ────────────────────────────────────────────

const mockDiscoverAreasGet = vi.hoisted(() => vi.fn());
const mockDiscoverListings = vi.hoisted(() => vi.fn());
const mockFilteredMarkers = vi.hoisted(() => vi.fn());
const mockTrendsOptions = vi.hoisted(() => vi.fn());
const mockSchoolRadiusListings = vi.hoisted(() => vi.fn());
const mockSchoolById = vi.hoisted(() => vi.fn());
const mockCityListings = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockDiscoverAreasGet },
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

vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: mockCityListings,
}));

import { useDiscoverMapData } from '../useDiscoverMapData';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const SELECTED_AREA = {
  areaKey: 'IN|KA|Udupi|Kunjibettu',
  areaLabel: 'Kunjibettu',
  geo_center_lat: 13.34,
  geo_center_lon: 74.76,
  bbox: [
    [13.32, 74.74],
    [13.36, 74.79],
  ] as [[number, number], [number, number]],
  listingCount: 42,
  schoolCount: 3,
};

const BASE_PARAMS = {
  city: 'udupi',
  selectedArea: SELECTED_AREA,
  filters: {
    schoolLat: 13.33,
    schoolLon: 74.76,
    schoolRadiusKm: 3,
  } as Record<string, unknown>,
  debouncedSearch: '',
  urlSchoolId: 'school-1',
  isAuthenticated: false,
  fitTick: 0,
  markersEnabled: false,
  page: 0,
  bbox: null as null,
};

function lastSchoolRadiusArgs(): Record<string, unknown> {
  const calls = mockSchoolRadiusListings.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDiscoverListings.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, error: null });
  mockFilteredMarkers.mockReturnValue({ data: undefined, isLoading: false, isFetching: false });
  mockTrendsOptions.mockReturnValue({ data: undefined });
  mockSchoolRadiusListings.mockReturnValue({ data: undefined, isLoading: false });
  mockSchoolById.mockReturnValue({ data: undefined, isLoading: false, error: null });
  mockCityListings.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  mockDiscoverAreasGet.mockResolvedValue({ city: 'udupi', areas: [] });
});

describe('#2806 useDiscoverMapData — schoolAreaKey forwarding & unresolved-Area gating for useSchoolRadiusListings', () => {
  it('passes selectedArea.areaKey as schoolAreaKey in combined Area+School state (urlSchoolId + selectedArea, no polygon)', () => {
    renderHook(() => useDiscoverMapData({ ...BASE_PARAMS } as never), {
      wrapper: makeWrapper(),
    });

    const args = lastSchoolRadiusArgs();
    expect(args.schoolAreaKey).toBe('IN|KA|Udupi|Kunjibettu');
    expect(args.enabled).toBe(true);
  });

  it('omits schoolAreaKey in pure School-first state (selectedArea is null, no urlAreaKey)', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          selectedArea: null,
          urlAreaKey: null,
        } as never),
      { wrapper: makeWrapper() },
    );

    const args = lastSchoolRadiusArgs();
    expect(args.schoolAreaKey).toBeUndefined();
    expect(args.enabled).toBe(true);
  });

  it('omits schoolAreaKey when a committed drawn polygon filter is active (mutually exclusive with schoolAreaKey)', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          filters: {
            ...BASE_PARAMS.filters,
            polygon: [
              [13.32, 74.74],
              [13.36, 74.74],
              [13.36, 74.79],
              [13.32, 74.79],
            ],
          },
        } as never),
      { wrapper: makeWrapper() },
    );

    const args = lastSchoolRadiusArgs();
    expect(args.schoolAreaKey).toBeUndefined();
    expect(args.enabled).toBe(true);
  });

  it('disables useSchoolRadiusListings while a URL-selected Area is still unresolved (urlAreaKey present, selectedArea null)', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          selectedArea: null,
          urlAreaKey: 'IN|KA|Udupi|Kunjibettu',
        } as never),
      { wrapper: makeWrapper() },
    );

    const args = lastSchoolRadiusArgs();
    expect(args.enabled).toBe(false);
  });

  it('disables useSchoolRadiusListings when scope.kind === "unresolved"', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          selectedArea: null,
          scope: { kind: 'unresolved' },
        } as never),
      { wrapper: makeWrapper() },
    );

    const args = lastSchoolRadiusArgs();
    expect(args.enabled).toBe(false);
  });
});
