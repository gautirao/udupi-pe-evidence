/**
 * useDiscoverMapData — Issue #1806 (map/panel scope correctness) regression tests.
 *
 * Covers:
 *   T1 — groupAreaKeys param is forwarded as the 8th positional arg to
 *        useDiscoverFilteredMarkers (FIX-1 wiring at the hook boundary).
 *   T2 — groupAreaKeys=[] disables the marker fetch via the hook's own
 *        empty-areaKeys guard (real useDiscoverFilteredMarkers, not mocked,
 *        so this exercises the actual `enabled` computation).
 *   DIRECTIVE 1 — isErrorAreaListings is exposed and reflects
 *        useDiscoverCityListings' error state (previously silently dropped —
 *        see MapDiscovery.tsx FIX-2 for the consumer).
 *
 * Mocking strategy mirrors useDiscoverMapData.markersEnabled.test.ts: mock
 * every OTHER sub-hook, but leave useDiscoverFilteredMarkers and
 * useDiscoverCityListings REAL (only `api.get` is mocked) so their own
 * enabled-gate / query-state logic is exercised for real, not just forwarded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mockDiscoverListings = vi.hoisted(() => vi.fn());
const mockTrendsOptions = vi.hoisted(() => vi.fn());
const mockSchoolRadiusListings = vi.hoisted(() => vi.fn());
const mockSchoolById = vi.hoisted(() => vi.fn());
const mockApiGet = vi.hoisted(() => vi.fn());

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
  ApiError: class ApiError extends Error {
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.status = status;
    }
  },
}));

// Import hook AFTER mocks — useDiscoverFilteredMarkers and useDiscoverCityListings
// are intentionally REAL (they only depend on the mocked '@/lib/api').
import { useDiscoverMapData } from '../useDiscoverMapData';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const AREAS_RESPONSE = { city: 'bangalore', areas: [] };
const MARKERS_RESPONSE = { city: 'bangalore', markers: [] };

function setupDefaultMocks() {
  mockDiscoverListings.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, error: null });
  mockTrendsOptions.mockReturnValue({ data: undefined });
  mockSchoolRadiusListings.mockReturnValue({ data: undefined, isLoading: false });
  mockSchoolById.mockReturnValue({ data: undefined, isLoading: false, error: null });
  // Default: every api.get resolves harmlessly. Individual tests override per-URL.
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/api/discover/markers')) return Promise.resolve(MARKERS_RESPONSE);
    if (url.includes('/listings')) return Promise.resolve({ city: 'bangalore', limitPerArea: 5, areas: [] });
    return Promise.resolve(AREAS_RESPONSE);
  });
}

const BASE_PARAMS = {
  city: 'bangalore',
  selectedArea: null as null,
  filters: {},
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
  setupDefaultMocks();
});

describe('useDiscoverMapData — groupAreaKeys forwarding (Issue #1806 FIX-1, T1/T2)', () => {
  it('T1: forwards scope.kind="areas" areaKeys to /api/discover/markers as areaKeys, sorted, scoped to the group', async () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          scope: { kind: 'areas', areaKeys: ['IN|KA|Bengaluru|Yelahanka', 'IN|KA|Bengaluru|Hebbal'] },
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(
        expect.stringContaining('/api/discover/markers'),
        expect.anything(),
      );
    });

    const markersCall = mockApiGet.mock.calls.find(([url]: [string]) =>
      url.includes('/api/discover/markers'),
    );
    expect(markersCall).toBeDefined();
    const [url] = markersCall as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    const areaKeys = params.getAll('areaKeys');
    // Sorted for a stable cache key (useDiscoverFilteredMarkers behaviour) —
    // exactly the group's two member areas, nothing else.
    expect(areaKeys.sort()).toEqual(['IN|KA|Bengaluru|Hebbal', 'IN|KA|Bengaluru|Yelahanka'].sort());
  });

  it('T2a: scope.kind="areas" areaKeys=[] DISABLES the marker fetch (empty-areaKeys guard) — no unscoped city-wide request fires', async () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          scope: { kind: 'areas', areaKeys: [] },
        }),
      { wrapper: makeWrapper() },
    );

    // Give any (incorrect) fetch a chance to fire.
    await new Promise((r) => setTimeout(r, 50));

    const markersCall = mockApiGet.mock.calls.find(([url]: [string]) =>
      url.includes('/api/discover/markers'),
    );
    expect(markersCall).toBeUndefined();
  });

  it('T2b: scope omitted (default {kind:"city"}, no group focused) fires the unscoped city-wide request (unchanged behaviour)', async () => {
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      const markersCall = mockApiGet.mock.calls.find(([url]: [string]) =>
        url.includes('/api/discover/markers'),
      );
      expect(markersCall).toBeDefined();
    });

    const markersCall = mockApiGet.mock.calls.find(([url]: [string]) =>
      url.includes('/api/discover/markers'),
    );
    const [url] = markersCall as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.getAll('areaKeys')).toEqual([]);
  });
});

describe('useDiscoverMapData — isErrorAreaListings (Issue #1806 DIRECTIVE 1)', () => {
  it('exposes isErrorAreaListings=true when the area-listings query settles with an error (previously silently dropped)', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/listings')) return Promise.reject(new Error('simulated 500'));
      if (url.includes('/api/discover/markers')) return Promise.resolve(MARKERS_RESPONSE);
      return Promise.resolve(AREAS_RESPONSE);
    });

    const selectedArea = {
      areaKey: 'IN|KA|Bengaluru|Yelahanka',
      areaLabel: 'Yelahanka',
      geo_center_lat: 13.1,
      geo_center_lon: 77.6,
      bbox: null,
    };

    const { result } = renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          selectedArea,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isLoadingAreaListings).toBe(false);
    });
    expect(result.current.isErrorAreaListings).toBe(true);
    // The settled-error case must NOT be silently reported as a plain empty
    // array indistinguishable from a genuinely empty area.
    expect(result.current.areaListings).toEqual([]);
  });

  it('exposes isErrorAreaListings=false when the area-listings query settles successfully with zero listings', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/listings')) {
        return Promise.resolve({ city: 'bangalore', limitPerArea: 5, areas: [] });
      }
      if (url.includes('/api/discover/markers')) return Promise.resolve(MARKERS_RESPONSE);
      return Promise.resolve(AREAS_RESPONSE);
    });

    const selectedArea = {
      areaKey: 'IN|KA|Bengaluru|Yelahanka',
      areaLabel: 'Yelahanka',
      geo_center_lat: 13.1,
      geo_center_lon: 77.6,
      bbox: null,
    };

    const { result } = renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          selectedArea,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isLoadingAreaListings).toBe(false);
    });
    expect(result.current.isErrorAreaListings).toBe(false);
    expect(result.current.areaListings).toEqual([]);
  });
});

describe('useDiscoverMapData — school-first journey guard (Issue #1806 DIRECTIVE 5 / T9, hook boundary)', () => {
  it('T9: scope forwarded even when journey=school-first — the caller (useDiscoverMapDataController, via resolveDiscoverMarkerScope) owns the guard, not this hook', async () => {
    // This hook trusts its caller exactly like the existing markersEnabled gate
    // (see useDiscoverMapData.markersEnabled.test.ts R3). The actual "do not
    // area/node-clip school-first with schoolId" guard lives in
    // resolveDiscoverMarkerScope (Issue #2185 S2, rule 2), covered by
    // markerScope.test.ts. Documented here so the hook boundary contract is
    // explicit and doesn't silently drift.
    renderHook(
      () =>
        useDiscoverMapData({
          ...BASE_PARAMS,
          journey: 'school-first',
          scope: { kind: 'areas', areaKeys: ['IN|KA|Bengaluru|Hebbal'] },
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      const markersCall = mockApiGet.mock.calls.find(([url]: [string]) =>
        url.includes('/api/discover/markers'),
      );
      expect(markersCall).toBeDefined();
    });
    const markersCall = mockApiGet.mock.calls.find(([url]: [string]) =>
      url.includes('/api/discover/markers'),
    );
    const [url] = markersCall as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.getAll('areaKeys')).toEqual(['IN|KA|Bengaluru|Hebbal']);
  });
});
