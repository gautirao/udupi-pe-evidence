/**
 * useDiscoverMapDataController — Issue #2185 S2 (canonical node marker scope).
 *
 * THE DEFECT: on the canonical node journey, `nav.groupId` is NEVER set, so
 * `groupAreaKeysForMapData` is `undefined`, so — before this fix — the
 * `areaKeys`/`nodeKey` args reaching `useDiscoverFilteredMarkers` were both
 * absent and the marker query fired UNSCOPED CITY-WIDE at a resolved AREA
 * leaf, while the right panel fetched `[selectedArea.areaKey]` via a
 * different hook. That divergence is the map/panel mismatch this issue
 * fixes (`resolveDiscoverMarkerScope`, rule 5).
 *
 * Mocking strategy mirrors useDiscoverMapData.issue1806.test.ts: mock every
 * OTHER sub-hook `useDiscoverMapData` calls, but leave `useDiscoverFilteredMarkers`
 * (and therefore this controller's `resolveDiscoverMarkerScope` wiring) and
 * `api.get` REAL, so the actual request URL is exercised end-to-end.
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

// Import AFTER mocks — useDiscoverFilteredMarkers/useDiscoverCityListings/
// api are the only REAL pieces in the chain.
import { useDiscoverMapDataController } from './useDiscoverMapDataController';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function makeNav(overrides: Partial<DiscoverNavContextValue> = {}): DiscoverNavContextValue {
  return {
    city: 'bangalore',
    journey: 'area-first',
    areaKey: null,
    schoolId: null,
    groupId: null,
    scope: null,
    radiusKm: null,
    selectedLocality: null,
    filters: {},
    rawNodeParam: null,
    node: null,
    nodeListings: false,
    intent: 'buy',
    q: '',
    selectedGroup: null,
    ...overrides,
  } as DiscoverNavContextValue;
}

const AREAS_RESPONSE = { city: 'bangalore', areas: [] };
const MARKERS_RESPONSE = { city: 'bangalore', markers: [] };

function setupDefaultMocks() {
  mockDiscoverListings.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, error: null });
  mockTrendsOptions.mockReturnValue({ data: undefined });
  mockSchoolRadiusListings.mockReturnValue({ data: undefined, isLoading: false });
  mockSchoolById.mockReturnValue({ data: undefined, isLoading: false, error: null });
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/api/discover/markers')) return Promise.resolve(MARKERS_RESPONSE);
    if (url.includes('/listings')) return Promise.resolve({ city: 'bangalore', limitPerArea: 5, areas: [] });
    return Promise.resolve(AREAS_RESPONSE);
  });
}

const AREA_LEAF: NonNullable<UseAreasNavigationJourneyResult['node']> = {
  nodeKey: 'n:area-1',
  nodeType: 'AREA',
  displayLabel: 'Manipal',
  depth: 2,
  regionKey: 'N',
  ancestry: [],
  nextLevelType: 'LISTINGS',
  children: [],
  revisionId: 1,
  bounds: null,
  descendantAreaKeys: null,
  areaKey: 'IN|KA|Bengaluru|Yelahanka',
};

function makeAreasNavigationJourney(
  overrides: Partial<UseAreasNavigationJourneyResult> = {},
): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node: null,
    levelKind: 'listings',
    children: [],
    resolutionNotice: null,
    nodeCount: null,
    schoolsNotSimulatedForRevision: false,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
    ...overrides,
  } as UseAreasNavigationJourneyResult;
}

const EFFECTIVE_SELECTED_AREA = {
  areaKey: 'IN|KA|Bengaluru|Yelahanka',
  areaLabel: 'Yelahanka',
  geo_center_lat: 13.1,
  geo_center_lon: 77.6,
  bbox: null,
};

const BASE_CONTROLLER_PARAMS = {
  city: 'bangalore',
  legacySelectedArea: null,
  filters: {},
  selectedSchool: null,
  debouncedSearch: '',
  isAuthenticated: true,
  fitTick: 0,
  groupAreaKeysForMapData: undefined,
  boundedSearchTriggered: false,
  mapZoom: 14, // above AREA_LAYER_MAX_ZOOM (12) so shouldShowMarkers(mapZoom) is true
  mapReady: true,
  page: 0,
  mapBbox: null,
  intentListingPurpose: 'sale',
  authLoading: false,
  setShowLoader: vi.fn(),
};

function findMarkersCall() {
  return mockApiGet.mock.calls.find(([url]: [string]) => url.includes('/api/discover/markers'));
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe('useDiscoverMapDataController — canonical AREA-leaf marker scope (Issue #2185 S2)', () => {
  it('a resolved canonical AREA leaf scopes the marker request to that node — nodeKey=... is present on the URL (THE core fix)', async () => {
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          nav: makeNav({ journey: 'area-first', rawNodeParam: 'n:area-1', node: 'n:area-1' }),
          effectiveSelectedArea: EFFECTIVE_SELECTED_AREA,
          areasNavigationJourney: makeAreasNavigationJourney({ node: AREA_LEAF }),
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(findMarkersCall()).toBeDefined();
    });

    const [url] = findMarkersCall() as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);

    // Silently-UNSCOPED guard (the specific false-green this test defeats):
    // assert the actual request URL carries nodeKey=..., not just that SOME
    // markers response arrived (a marker-count assertion alone would still
    // pass on a city-wide fetch against a small dataset).
    expect(params.get('nodeKey')).toBe('n:area-1');
    // And no legacy areaKeys= leaks alongside it — exactly one scope.
    expect(params.getAll('areaKeys')).toEqual([]);
  });

  it('rule 2: school-first + a selected school AND a canonical node BOTH present -> city (no nodeKey, no areaKeys) — the radius surface is never area/node-clipped', async () => {
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          filters: { schoolLat: 13.1, schoolLon: 77.6, schoolRadiusKm: 2 },
          boundedSearchTriggered: true,
          nav: makeNav({
            journey: 'school-first',
            schoolId: 'school-42',
            rawNodeParam: 'n:cluster-1',
            node: 'n:cluster-1',
          }),
          effectiveSelectedArea: null,
          areasNavigationJourney: makeAreasNavigationJourney({
            node: { ...AREA_LEAF, nodeKey: 'n:cluster-1', nodeType: 'CLUSTER' },
          }),
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(findMarkersCall()).toBeDefined();
    });

    const [url] = findMarkersCall() as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('nodeKey')).toBe(false);
    expect(params.getAll('areaKeys')).toEqual([]);
  });

  it('rule 3 / AC6: agri-first marker request is byte-identical to pre-#2185 behaviour — no nodeKey, no areaKeys, even with a resolved node', async () => {
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          nav: makeNav({ journey: 'agri-first', rawNodeParam: 'n:area-1', node: 'n:area-1' }),
          effectiveSelectedArea: null,
          legacySelectedArea: EFFECTIVE_SELECTED_AREA,
          areasNavigationJourney: makeAreasNavigationJourney({ node: AREA_LEAF }),
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(findMarkersCall()).toBeDefined();
    });

    const [url] = findMarkersCall() as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('nodeKey')).toBe(false);
    expect(params.getAll('areaKeys')).toEqual([]);
  });
});
