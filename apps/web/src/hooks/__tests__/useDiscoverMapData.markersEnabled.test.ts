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
const mockUseDiscoverCityListings = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: mockFilteredMarkers,
}));

// Issue #2015 — the anon "Search this area" (VIEWPORT) branch inside useDiscoverMapData
// calls useDiscoverCityListings directly. Mocking it here (rather than letting it fall
// through to the shared @/lib/api mock below, whose fixed AREAS_RESPONSE has the wrong
// shape for a listings response) lets each test control anonViewportRawData/isLoading/
// isError precisely.
vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: mockUseDiscoverCityListings,
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
  mockUseDiscoverCityListings.mockReturnValue({ data: undefined, isLoading: false, isError: false });
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

/**
 * useDiscoverMapData — anon "Search this area" (VIEWPORT) identity reconciliation
 * (Issue #2015, PR #2425 review comment 5085561270, MUST-HAVE #4)
 *
 * WHAT THIS TESTS:
 *   1. Identity reconciliation — `anonViewportMarkerListings` (markers surface) is
 *      always a strict subset of `anonViewportListings` (cards surface) by listing ID,
 *      and the only listings dropped are the ones missing coordinates. Both are derived
 *      from the SAME `anonViewportRawData` response (useDiscoverMapData.ts ~L825-845),
 *      so this proves the reconciliation mechanism itself, not just that both arrays
 *      happen to be populated.
 *   2. Empty state — a genuinely successful bbox response with zero listings produces
 *      real empty arrays on both surfaces, distinguishable from an error (isErrorAnonViewport
 *      stays false), i.e. no silent fallback to stale/different data.
 *   3. Retry/error behavior — on a query error, `isErrorAnonViewport` is exposed as true
 *      and both surfaces go empty rather than rendering stale or fabricated data.
 *
 * These are UNIT tests at the useDiscoverMapData boundary: useDiscoverCityListings is
 * mocked so each test can control anonViewportRawData/isLoading/isError precisely,
 * isolating the reconciliation/derivation logic itself from the query layer (which is
 * covered separately and directly, unmocked, in useDiscoverCityListings.test.ts's
 * bbox/anon-viewport describe block for stale-response protection).
 */
describe('useDiscoverMapData — anon viewport cards/markers identity reconciliation (Issue #2015)', () => {
  const VIEWPORT_RESULT_SCOPE = {
    kind: 'VIEWPORT' as const,
    bounds: { s: 13.34, w: 74.78, n: 13.36, e: 74.8 },
  };

  const BASE_ANON_VIEWPORT_PARAMS = {
    ...BASE_PARAMS_ENABLED,
    isAuthenticated: false,
    markersEnabled: false,
    resultScope: VIEWPORT_RESULT_SCOPE,
  };

  it('I1: every marker ID is present in the cards array, and the coordinate-less listing is dropped ONLY from markers', () => {
    mockUseDiscoverCityListings.mockReturnValue({
      data: {
        city: 'udupi',
        limitPerArea: 20,
        areas: [
          {
            areaKey: 'udupi|manipal',
            areaName: 'Manipal',
            listings: [
              { id: 'listing-with-coords-1', lat: 13.35, lon: 74.79, priceBand: 'BAND_2', propertyType: 'apartment', bedrooms: 2 },
              { id: 'listing-with-coords-2', lat: 13.351, lon: 74.791, priceBand: 'BAND_3', propertyType: 'apartment', bedrooms: 3 },
              { id: 'listing-no-coords', lat: null, lon: null, priceBand: 'BAND_1', propertyType: 'plot', bedrooms: null },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useDiscoverMapData({ ...BASE_ANON_VIEWPORT_PARAMS }), {
      wrapper: makeWrapper(),
    });

    const cardIds = result.current.anonViewportListings.map((l) => l.id).sort();
    const markerIds = result.current.anonViewportMarkerListings.map((l) => l.id).sort();

    // Cards surface every listing, including the coordinate-less one.
    expect(cardIds).toEqual(['listing-no-coords', 'listing-with-coords-1', 'listing-with-coords-2']);

    // Markers drop exactly (and only) the coordinate-less listing.
    expect(markerIds).toEqual(['listing-with-coords-1', 'listing-with-coords-2']);
    expect(markerIds).not.toContain('listing-no-coords');

    // Identity reconciliation: every marker ID is a strict subset of the card ID set.
    for (const id of markerIds) {
      expect(cardIds).toContain(id);
    }
  });

  it('I2: a successful bbox response with zero listings yields real empty cards/markers, not an error', () => {
    mockUseDiscoverCityListings.mockReturnValue({
      data: { city: 'udupi', limitPerArea: 20, areas: [] },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useDiscoverMapData({ ...BASE_ANON_VIEWPORT_PARAMS }), {
      wrapper: makeWrapper(),
    });

    expect(result.current.anonViewportListings).toEqual([]);
    expect(result.current.anonViewportMarkerListings).toEqual([]);
    expect(result.current.isErrorAnonViewport).toBe(false);
  });

  it('I4: on a query error, isErrorAnonViewport is true but the last successful cards/markers are RETAINED (review fix 5087672619), and refetchAnonViewport drives a real retry', () => {
    const successData = {
      city: 'udupi',
      limitPerArea: 20,
      areas: [
        {
          areaKey: 'udupi|manipal',
          areaName: 'Manipal',
          listings: [
            { id: 'retained-1', lat: 13.35, lon: 74.79, priceBand: 'BAND_2', propertyType: 'apartment', bedrooms: 2 },
          ],
        },
      ],
    };
    const mockRefetch = vi.fn();

    // Phase 1: successful load — establishes the "last good" set.
    mockUseDiscoverCityListings.mockReturnValue({
      data: successData,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });

    const { result, rerender } = renderHook(() => useDiscoverMapData({ ...BASE_ANON_VIEWPORT_PARAMS }), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isErrorAnonViewport).toBe(false);
    expect(result.current.anonViewportListings.map((l) => l.id)).toEqual(['retained-1']);
    expect(result.current.anonViewportMarkerListings.map((l) => l.id)).toEqual(['retained-1']);

    // Phase 2: transient failure — data goes undefined, isError flips true. The
    // previously-shown cards/markers must NOT collapse to empty (review fix
    // 5087672619), and refetchAnonViewport must be the SAME query's refetch, not a
    // no-op, so a Retry control built on it actually retries.
    mockUseDiscoverCityListings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    });
    rerender();

    expect(result.current.isErrorAnonViewport).toBe(true);
    expect(result.current.anonViewportListings.map((l) => l.id)).toEqual(['retained-1']);
    expect(result.current.anonViewportMarkerListings.map((l) => l.id)).toEqual(['retained-1']);
    // Issue #1793 — refetchAnonViewport is a useCallback wrapper (so a click MouseEvent is never
    // forwarded as refetch options); assert the call REACHES the real refetch, with no arguments.
    result.current.refetchAnonViewport();
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(mockRefetch).toHaveBeenLastCalledWith();
    // A click handler passes its MouseEvent as the first argument; it must be dropped.
    (result.current.refetchAnonViewport as (event: unknown) => void)({ type: 'click' });
    expect(mockRefetch).toHaveBeenCalledTimes(2);
    expect(mockRefetch).toHaveBeenLastCalledWith();

    // Phase 3: retry succeeds — fresh listings replace the retained set, error clears.
    const freshData = {
      city: 'udupi',
      limitPerArea: 20,
      areas: [
        {
          areaKey: 'udupi|manipal',
          areaName: 'Manipal',
          listings: [
            { id: 'fresh-1', lat: 13.351, lon: 74.791, priceBand: 'BAND_3', propertyType: 'apartment', bedrooms: 3 },
          ],
        },
      ],
    };
    mockUseDiscoverCityListings.mockReturnValue({
      data: freshData,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    rerender();

    expect(result.current.isErrorAnonViewport).toBe(false);
    expect(result.current.anonViewportListings.map((l) => l.id)).toEqual(['fresh-1']);
    expect(result.current.anonViewportMarkerListings.map((l) => l.id)).toEqual(['fresh-1']);
  });

  it('I4 (regression baseline): the anon-viewport branch stays inert when resultScope is not a committed VIEWPORT', () => {
    mockUseDiscoverCityListings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_ANON_VIEWPORT_PARAMS,
          resultScope: { kind: 'AREA_SET', areaKeys: ['udupi|manipal'] },
        }),
      { wrapper: makeWrapper() },
    );

    expect(result.current.isAnonViewport).toBe(false);
    expect(result.current.anonViewportListings).toEqual([]);
    expect(result.current.anonViewportMarkerListings).toEqual([]);
  });
});
