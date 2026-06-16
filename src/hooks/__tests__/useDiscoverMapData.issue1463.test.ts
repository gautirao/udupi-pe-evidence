/**
 * useDiscoverMapData — Issue #1463: excludePropertyType routing
 *
 * RISK-4 guard: verifies that the 7th positional argument passed to
 * useDiscoverFilteredMarkers is 'agricultural_land' for non-agri journeys and
 * undefined for agri-first, so agri boundary GeoJSON markers are never
 * accidentally suppressed.
 *
 * Tests:
 * E1  area-first journey passes excludePropertyType='agricultural_land'
 * E2  school-first journey passes excludePropertyType='agricultural_land'
 * E3  agri-first journey passes excludePropertyType=undefined (NOT excluded)
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

const BASE_PARAMS = {
  city: 'udupi',
  selectedArea: null as null,
  filters: {},
  debouncedSearch: '',
  urlSchoolId: null as null,
  isAuthenticated: true,
  fitTick: 0,
  markersEnabled: true,
  page: 0,
  bbox: null as null,
};

// The 7th positional arg to useDiscoverFilteredMarkers is excludePropertyType.
function getExcludePropertyTypeArg(): string | undefined {
  expect(mockFilteredMarkers).toHaveBeenCalled();
  return mockFilteredMarkers.mock.calls[0][6] as string | undefined;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe('useDiscoverMapData — Issue #1463: excludePropertyType forwarded to useDiscoverFilteredMarkers', () => {
  /**
   * E1 — area-first journey: agri markers must be excluded from the filtered markers
   * response so they don't pollute the residential area-first view.
   */
  it('E1: area-first journey passes excludePropertyType="agricultural_land" (7th arg)', () => {
    renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, journey: 'area-first' }),
      { wrapper: makeWrapper() },
    );

    expect(getExcludePropertyTypeArg()).toBe('agricultural_land');
  });

  /**
   * E2 — school-first journey: same exclusion as area-first.
   */
  it('E2: school-first journey passes excludePropertyType="agricultural_land" (7th arg)', () => {
    renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, journey: 'school-first' }),
      { wrapper: makeWrapper() },
    );

    expect(getExcludePropertyTypeArg()).toBe('agricultural_land');
  });

  /**
   * E3 — agri-first journey: must pass undefined so the `if (excludePropertyType)` guard
   * in useDiscoverFilteredMarkers does NOT add the param to the URL, preserving agri
   * boundary GeoJSON markers. This is the CRITICAL safety invariant.
   */
  it('E3: agri-first journey passes excludePropertyType=undefined (agri markers NOT excluded)', () => {
    renderHook(
      () => useDiscoverMapData({ ...BASE_PARAMS, journey: 'agri-first' }),
      { wrapper: makeWrapper() },
    );

    expect(getExcludePropertyTypeArg()).toBeUndefined();
  });
});
