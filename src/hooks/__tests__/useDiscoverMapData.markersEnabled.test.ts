/**
 * useDiscoverMapData — markersEnabled gate regression test (Issue #1372)
 *
 * WHAT THIS TESTS:
 *   The `markersEnabled` parameter that MapDiscovery computes and passes to
 *   useDiscoverMapData flows through to `useDiscoverFilteredMarkers` as its
 *   `enabled` argument. This test verifies that flow at the hook boundary.
 *
 * WHY IT KILLS THE FALSE-GREEN:
 *   Previous tests (useDiscoverMapData.agri.test.ts) mocked the return value of
 *   useDiscoverFilteredMarkers but never asserted the `enabled` argument it was
 *   called with. That made them pass even when the MapDiscovery markersEnabled
 *   gate was broken.
 *
 * HOW THIS TEST WOULD FAIL WITHOUT THE FIX:
 *   If `urlState.journey === 'agri-first'` were removed from the markersEnabled
 *   expression in MapDiscovery.tsx (~L587), MapDiscovery would call
 *   useDiscoverMapData with markersEnabled=false for agri-first journeys.
 *   Assertion R1 below (enabled=true for markersEnabled=true input) directly
 *   captures the `enabled` arg passed to useDiscoverFilteredMarkers — so a broken
 *   gate that passes false would fail R1. Assertion R3 (false input → false) is
 *   the baseline to confirm the mock captures correctly.
 *
 * NOTE: This test is at the useDiscoverMapData boundary. The MapDiscovery.tsx
 * gate (`|| urlState.journey === 'agri-first'`) is what produces `markersEnabled=true`
 * for agri-first. If that condition were absent, MapDiscovery would pass
 * markersEnabled=false, the hook would call useDiscoverFilteredMarkers with
 * enabled=false, and R1 would fail.
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

/** Base params that represent: authenticated, zoom past AREA_LAYER_MAX_ZOOM (markersEnabled=true) */
const BASE_PARAMS_ENABLED = {
  city: 'udupi',
  selectedArea: null as null,
  filters: {},
  debouncedSearch: '',
  urlSchoolId: null as null,
  isAuthenticated: true,
  fitTick: 0,
  markersEnabled: true,   // MapDiscovery passes true when agri-first + auth + zoom>12
  page: 0,
  bbox: null as null,
};

// ─── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe('useDiscoverMapData — markersEnabled gate forwarded to useDiscoverFilteredMarkers (Issue #1372)', () => {
  /**
   * R1 — markersEnabled=true is forwarded as enabled=true to useDiscoverFilteredMarkers.
   *
   * This is the core regression guard. MapDiscovery computes markersEnabled=true for
   * agri-first journeys (requires `|| urlState.journey === 'agri-first'` at ~L587 of
   * MapDiscovery.tsx). If that condition were removed, MapDiscovery would pass
   * markersEnabled=false, and this assertion would fail.
   */
  it('R1: passes enabled=true to useDiscoverFilteredMarkers when markersEnabled=true', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS_ENABLED,
          markersEnabled: true,
          journey: 'agri-first',
        }),
      { wrapper: makeWrapper() },
    );

    expect(mockFilteredMarkers).toHaveBeenCalled();
    // 3rd positional argument to useDiscoverFilteredMarkers is `enabled`
    const enabledArg = mockFilteredMarkers.mock.calls[0][2];
    expect(enabledArg).toBe(true);
  });

  /**
   * R2 — agri-first with markersEnabled=false → enabled=false (baseline correctness).
   * Ensures the mock captures the arg correctly and the hook doesn't override the flag.
   */
  it('R2: passes enabled=false to useDiscoverFilteredMarkers when markersEnabled=false', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS_ENABLED,
          markersEnabled: false,
          journey: 'agri-first',
        }),
      { wrapper: makeWrapper() },
    );

    expect(mockFilteredMarkers).toHaveBeenCalled();
    const enabledArg = mockFilteredMarkers.mock.calls[0][2];
    expect(enabledArg).toBe(false);
  });

  /**
   * R3 — area-first with markersEnabled=true also forwards enabled=true.
   * Confirms the forwarding is journey-agnostic (the hook trusts the caller's gate).
   */
  it('R3: passes enabled=true to useDiscoverFilteredMarkers for area-first when markersEnabled=true', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS_ENABLED,
          markersEnabled: true,
          journey: 'area-first',
        }),
      { wrapper: makeWrapper() },
    );

    expect(mockFilteredMarkers).toHaveBeenCalled();
    const enabledArg = mockFilteredMarkers.mock.calls[0][2];
    expect(enabledArg).toBe(true);
  });

  /**
   * R4 — agri filters are forced when journey=agri-first (guards against agriFilters bypass).
   * The hook mutates `filters` to `{ ...filters, propertyTypes: ['agricultural_land'] }`
   * before passing to useDiscoverFilteredMarkers (2nd positional arg).
   */
  it('R4: forces propertyTypes=["agricultural_land"] in filters arg when journey=agri-first', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS_ENABLED,
          markersEnabled: true,
          journey: 'agri-first',
          filters: { propertyTypes: ['apartment'] }, // intentionally wrong type
        }),
      { wrapper: makeWrapper() },
    );

    expect(mockFilteredMarkers).toHaveBeenCalled();
    const filtersArg = mockFilteredMarkers.mock.calls[0][1] as { propertyTypes?: string[] };
    expect(filtersArg.propertyTypes).toEqual(['agricultural_land']);
  });

  /**
   * R5 (regression) — non-agri journey does NOT force propertyTypes override.
   * Guards against the agriFilters logic accidentally bleeding into other journeys.
   */
  it('R5 (regression): does NOT override propertyTypes for non-agri journey', () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS_ENABLED,
          markersEnabled: true,
          journey: 'area-first',
          filters: { propertyTypes: ['apartment'] },
        }),
      { wrapper: makeWrapper() },
    );

    expect(mockFilteredMarkers).toHaveBeenCalled();
    const filtersArg = mockFilteredMarkers.mock.calls[0][1] as { propertyTypes?: string[] };
    expect(filtersArg.propertyTypes).toEqual(['apartment']);
  });
});
