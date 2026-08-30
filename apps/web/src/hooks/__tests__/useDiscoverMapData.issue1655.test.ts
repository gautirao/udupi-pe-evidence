/**
 * Issue #1655 — top-grouped-level fetch gating tests.
 *
 * Confirms that:
 *   1. listingsEnabled=false disables useDiscoverListings (enabled arg = false).
 *   2. markersEnabled=false disables useDiscoverFilteredMarkers (enabled arg = false).
 *   3. listingsEnabled=true (default) enables useDiscoverListings for drill-down states.
 *   4. markersEnabled=true enables useDiscoverFilteredMarkers for drill-down states.
 *   5. Both work together: top-grouped level passes both as false/disabled;
 *      drill-down passes both as true/enabled.
 *
 * These tests validate the useDiscoverMapData boundary. The caller (MapDiscovery)
 * is responsible for computing isTopGroupedLevel and feeding the correct booleans.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

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

// Import hook AFTER mocks
import { useDiscoverMapData } from '../useDiscoverMapData';

// ─── Helpers ───────────────────────────────────────────────────────────────

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

const IDLE_RESULT = { data: undefined, isLoading: false, isFetching: false, error: null };

function setupDefaultMocks() {
  mockFilteredMarkers.mockReturnValue({ data: undefined, isLoading: false, isFetching: false });
  mockDiscoverListings.mockReturnValue(IDLE_RESULT);
  mockTrendsOptions.mockReturnValue({ data: undefined });
  mockSchoolRadiusListings.mockReturnValue({ data: undefined, isLoading: false });
  mockSchoolById.mockReturnValue({ data: undefined, isLoading: false, error: null });
  mockDiscoverAreasGet.mockResolvedValue(AREAS_RESPONSE);
}

/** Base params — authenticated, markers disabled (default for top-grouped). */
const BASE_PARAMS = {
  city: 'udupi',
  selectedArea: null as null,
  filters: {},
  debouncedSearch: '',
  urlSchoolId: null as null,
  isAuthenticated: true,
  fitTick: 0,
  markersEnabled: false,
  page: 0,
  bbox: null as null,
};

// ─── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe('Issue #1655 — listingsEnabled gate suppresses useDiscoverListings at top grouped level', () => {
  it('T1: listingsEnabled=false disables useDiscoverListings (enabled arg = false)', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          listingsEnabled: false,
          journey: 'area-first',
        }),
      { wrapper: makeWrapper() },
    );

    expect(mockDiscoverListings).toHaveBeenCalled();
    const callArgs = mockDiscoverListings.mock.calls[0][0] as { enabled: boolean };
    expect(callArgs.enabled).toBe(false);
  });

  it('T2: listingsEnabled=false disables useDiscoverListings for school-first', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          listingsEnabled: false,
          journey: 'school-first',
        }),
      { wrapper: makeWrapper() },
    );

    expect(mockDiscoverListings).toHaveBeenCalled();
    const callArgs = mockDiscoverListings.mock.calls[0][0] as { enabled: boolean };
    expect(callArgs.enabled).toBe(false);
  });

  it('T3: listingsEnabled=false disables useDiscoverListings for agri-first', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          listingsEnabled: false,
          journey: 'agri-first',
        }),
      { wrapper: makeWrapper() },
    );

    expect(mockDiscoverListings).toHaveBeenCalled();
    const callArgs = mockDiscoverListings.mock.calls[0][0] as { enabled: boolean };
    expect(callArgs.enabled).toBe(false);
  });

  it('T4: listingsEnabled=true (default) enables useDiscoverListings for drill-down', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          // listingsEnabled omitted → defaults to true
          journey: 'area-first',
        }),
      { wrapper: makeWrapper() },
    );

    expect(mockDiscoverListings).toHaveBeenCalled();
    const callArgs = mockDiscoverListings.mock.calls[0][0] as { enabled: boolean };
    expect(callArgs.enabled).toBe(true);
  });

  it('T5: listingsEnabled=true explicitly enables useDiscoverListings for drill-down', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          listingsEnabled: true,
          markersEnabled: true,
          journey: 'area-first',
        }),
      { wrapper: makeWrapper() },
    );

    expect(mockDiscoverListings).toHaveBeenCalled();
    const callArgs = mockDiscoverListings.mock.calls[0][0] as { enabled: boolean };
    expect(callArgs.enabled).toBe(true);
  });

  it('T6: unauthenticated + listingsEnabled=true → still disabled (auth gate)', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          isAuthenticated: false,
          listingsEnabled: true,
          journey: 'area-first',
        }),
      { wrapper: makeWrapper() },
    );

    expect(mockDiscoverListings).toHaveBeenCalled();
    const callArgs = mockDiscoverListings.mock.calls[0][0] as { enabled: boolean };
    expect(callArgs.enabled).toBe(false);
  });
});

describe('Issue #1655 — markersEnabled=false suppresses useDiscoverFilteredMarkers at top grouped level', () => {
  it('T7: markersEnabled=false disables useDiscoverFilteredMarkers for area-first', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          markersEnabled: false,
          listingsEnabled: false,
          journey: 'area-first',
        }),
      { wrapper: makeWrapper() },
    );

    expect(mockFilteredMarkers).toHaveBeenCalled();
    const enabledArg = mockFilteredMarkers.mock.calls[0][2];
    expect(enabledArg).toBe(false);
  });

  it('T8: markersEnabled=false disables useDiscoverFilteredMarkers for agri-first', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          markersEnabled: false,
          listingsEnabled: false,
          journey: 'agri-first',
        }),
      { wrapper: makeWrapper() },
    );

    expect(mockFilteredMarkers).toHaveBeenCalled();
    const enabledArg = mockFilteredMarkers.mock.calls[0][2];
    expect(enabledArg).toBe(false);
  });

  it('T9: markersEnabled=true enables useDiscoverFilteredMarkers for drill-down', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          markersEnabled: true,
          listingsEnabled: true,
          journey: 'area-first',
        }),
      { wrapper: makeWrapper() },
    );

    expect(mockFilteredMarkers).toHaveBeenCalled();
    const enabledArg = mockFilteredMarkers.mock.calls[0][2];
    expect(enabledArg).toBe(true);
  });
});
