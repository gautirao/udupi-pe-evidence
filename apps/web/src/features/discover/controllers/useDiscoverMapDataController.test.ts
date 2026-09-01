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

// Issue #2193 AC2 — the PANEL twin of findMarkersCall. The right panel's data
// comes from a SEPARATE hook/endpoint (useDiscoverCityListings ->
// GET /api/discover/cities/<city>/listings?areaKeys=...), reached for real
// through the same mocked api.get in this test (it is NOT among the sub-hooks
// mocked at the top of this file). Excludes the markers URL explicitly so a
// same-substring collision can never make both helpers resolve to one call.
function findPanelCall() {
  return mockApiGet.mock.calls.find(
    ([url]: [string]) => url.includes('/discover/cities/') && url.includes('/listings') && !url.includes('/markers'),
  );
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

describe('useDiscoverMapDataController — Issue #2193 AC2: same-geography contract (map/panel scope agreement)', () => {
  // WHAT THIS TEST ACTUALLY PROVES, scope-narrowed to the resolved-AREA-leaf
  // state it exercises: the /api/discover/markers REQUEST is correctly
  // node-scoped and NAMES THE SAME AREA as the panel's own request —
  //   markers request: GET /api/discover/markers?nodeKey=<leaf>            (useDiscoverFilteredMarkers)
  //   panel request:   GET /api/discover/cities/<city>/listings?areaKeys=<area> (useDiscoverCityListings)
  // Nothing at the type level forces those two REQUESTS to name the SAME
  // geography — they are two independently-computed params threaded through
  // two independent hooks — so this is a genuine, valuable regression guard
  // on request scoping.
  //
  // WHAT THIS TEST DOES NOT PROVE, for this specific state: that the markers
  // RESPONSE is what determines the rendered marker set. For a resolved
  // canonical AREA leaf, `resolveMarkerListings.ts` (:146-168) takes the
  // `selectedArea` branch, which returns `areaMarkerListings` whenever it is
  // non-empty and only falls back to the `/api/discover/markers` response
  // (`markerListings`) `if (isErrorAreaListings)`. `areaMarkerListings` is
  // itself derived (`useDiscoverMapData.ts` :689-703) from `areaListings`,
  // sourced from `cityListingsData` (`useDiscoverCityListings`, :582-595 and
  // :667-670) — the SAME public teaser response that feeds the panel. So in
  // THIS state, panel and rendered markers already share one response by
  // construction; the markers request asserted below is still fired (and
  // still JWT-gated) but is an error-fallback source here, not the primary
  // source of truth for what's on screen. (It genuinely IS the primary,
  // markers-first source for the group-results and `nodeListings=1` states —
  // this narrowing applies only to the plain resolved `node=` AREA-leaf state
  // this describe block covers.)
  it('marker nodeKey and panel areaKeys resolve to the SAME area — not merely both present (N3 hardening)', async () => {
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
      expect(findPanelCall()).toBeDefined();
    });

    const [markersUrl] = findMarkersCall() as [string, unknown];
    const markerParams = new URLSearchParams(markersUrl.split('?')[1]);

    const [panelUrl] = findPanelCall() as [string, unknown];
    const panelParams = new URLSearchParams(panelUrl.split('?')[1]);

    // The marker request is scoped to the resolved node leaf...
    expect(markerParams.get('nodeKey')).toBe(AREA_LEAF.nodeKey);
    // ...and the panel request is scoped to areaKeys=[...]. Presence alone is
    // NOT the assertion (that would pass even if the panel's areaKeys named a
    // totally different area than the marker's nodeKey resolved to). Instead
    // compare against `AREA_LEAF.areaKey` — the SAME node object's own
    // canonical area-bridge field that fed `effectiveSelectedArea` — so a
    // scope desync (panel pointed at area A while markers resolve node B)
    // makes this assertion fail, not merely a "was something sent" check.
    expect(panelParams.getAll('areaKeys')).toEqual([AREA_LEAF.areaKey]);

    // Belt-and-braces identity check: the panel's sole areaKeys value and the
    // area backing the marker's resolved node are literally the same string.
    expect(panelParams.getAll('areaKeys')).toEqual([EFFECTIVE_SELECTED_AREA.areaKey]);
    expect(EFFECTIVE_SELECTED_AREA.areaKey).toBe(AREA_LEAF.areaKey);
  });
});

describe('useDiscoverMapDataController — Issue #2016 code-review Finding 11: committed POLYGON/VIEWPORT suppresses navigation-derived areaKeys/nodeKey', () => {
  const POLYGON_COORDS: [number, number][] = [[12.9, 77.5], [12.95, 77.55], [12.9, 77.6]];

  it('a committed POLYGON scope over a resolved canonical node sends polygon and OMITS nodeKey/areaKeys', async () => {
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          // The filters.polygon bridge (useDiscoverPageState.ts) would set this
          // from the committed scope in the real app; set it directly here since
          // this test exercises the controller in isolation.
          filters: { polygon: POLYGON_COORDS },
          nav: makeNav({
            journey: 'area-first',
            rawNodeParam: 'n:area-1',
            node: 'n:area-1',
            resultScope: { active: { kind: 'POLYGON', coordinates: POLYGON_COORDS }, previous: null },
          }),
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

    expect(params.get('polygon')).toBeTruthy();
    expect(params.has('nodeKey')).toBe(false);
    expect(params.getAll('areaKeys')).toEqual([]);
  });

  it('a committed POLYGON scope over a legacy areaKeys group scope sends polygon and OMITS areaKeys', async () => {
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          filters: { polygon: POLYGON_COORDS },
          groupAreaKeysForMapData: ['IN|KA|Bengaluru|Hebbal', 'IN|KA|Bengaluru|Nagawara'],
          nav: makeNav({
            journey: 'area-first',
            groupId: 'hebbal-belt',
            resultScope: { active: { kind: 'POLYGON', coordinates: POLYGON_COORDS }, previous: null },
          }),
          effectiveSelectedArea: null,
          areasNavigationJourney: makeAreasNavigationJourney(),
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(findMarkersCall()).toBeDefined();
    });

    const [url] = findMarkersCall() as [string, unknown];
    const params = new URLSearchParams(url.split('?')[1]);

    expect(params.get('polygon')).toBeTruthy();
    expect(params.getAll('areaKeys')).toEqual([]);
  });

  it('control: a committed AREA_SET scope does NOT suppress the navigation-derived nodeKey — only POLYGON/VIEWPORT do', async () => {
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          nav: makeNav({
            journey: 'area-first',
            rawNodeParam: 'n:area-1',
            node: 'n:area-1',
            resultScope: {
              active: { kind: 'AREA_SET', areaKeys: [EFFECTIVE_SELECTED_AREA.areaKey] },
              previous: null,
            },
          }),
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
    expect(params.get('nodeKey')).toBe('n:area-1');
  });
});
