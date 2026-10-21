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
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mockDiscoverListings = vi.hoisted(() => vi.fn());
const mockTrendsOptions = vi.hoisted(() => vi.fn());
const mockSchoolRadiusListings = vi.hoisted(() => vi.fn());
const mockSchoolById = vi.hoisted(() => vi.fn());
const mockApiGet = vi.hoisted(() => vi.fn());
const mockRegisterAreaSetCameraActions = vi.hoisted(() => vi.fn());

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

// Issue #2017 (Fit all / focus-one) — this controller now also registers its
// AreaSetCameraActions into DiscoverShellContext via useDiscoverShell(). This
// suite renders the controller standalone (no <DiscoverProvider> above it —
// see makeWrapper below, QueryClientProvider only), so useDiscoverShell must
// be mocked or the real hook throws "must be used within a <DiscoverProvider>".
// Issue #2480 — mutable box simulating the shell's one-shot camera restore
// request, since a plain vi.fn(() => null) can't reflect what a prior
// setAreaSetCameraRestoreRequest() call recorded within the same test.
let mockRestoreRequest: {
  areaKey: string;
  bounds: [[number, number], [number, number]] | null;
  center: [number, number];
} | null = null;

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverShell: () => ({
    mobileView: 'LIST',
    setMobileView: vi.fn(),
    isMobileShell: false,
    isAreaSetDraftOpen: false,
    openAreaSetDraft: vi.fn(),
    closeAreaSetDraft: vi.fn(),
    fitAreaSet: vi.fn(),
    focusAreaSetMember: vi.fn(),
    registerAreaSetCameraActions: mockRegisterAreaSetCameraActions,
    getAreaSetCameraRestoreRequest: () => mockRestoreRequest,
    setAreaSetCameraRestoreRequest: (
      r: { areaKey: string; bounds: [[number, number], [number, number]] | null; center: [number, number] } | null,
    ) => {
      mockRestoreRequest = r;
    },
  }),
}));

// Import AFTER mocks — useDiscoverFilteredMarkers/useDiscoverCityListings/
// api are the only REAL pieces in the chain.
import { useDiscoverMapDataController } from './useDiscoverMapDataController';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';

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
  mockRestoreRequest = null;
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

describe('useDiscoverMapDataController — Issue #2015 code-review BLOCKING fix: committed VIEWPORT suppresses the live-drifting bbox param', () => {
  // The committed VIEWPORT scope's own frozen rectangle. Matches the exact
  // `s,w,n,e` wire format asserted in useDiscoverListings.issue2016.test.ts
  // ('12.9,77.5,13,77.6').
  const VIEWPORT_BOUNDS = { s: 12.9, w: 77.5, n: 13, e: 77.6 };
  // Post-activation live mapBbox — simulates the user panning away from the
  // committed rectangle. Deliberately disjoint from VIEWPORT_BOUNDS so a
  // regression (bbox leaking through) would produce an observably different
  // `bbox=` param, not one that happens to coincide with viewportScope.
  const PANNED_MAP_BBOX: [number, number, number, number] = [13.5, 78, 13.6, 78.1];

  function markersCallCount() {
    return mockApiGet.mock.calls.filter(([url]: [string]) => url.includes('/api/discover/markers')).length;
  }

  it('a committed VIEWPORT scope omits bbox= entirely (the frozen viewportScope param is the sole spatial filter)', async () => {
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          mapBbox: VIEWPORT_BOUNDS_AS_TUPLE(VIEWPORT_BOUNDS),
          nav: makeNav({
            journey: 'area-first',
            rawNodeParam: 'n:area-1',
            node: 'n:area-1',
            resultScope: { active: { kind: 'VIEWPORT', bounds: VIEWPORT_BOUNDS }, previous: null },
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

    // The BLOCKING bug: bbox must NOT be forwarded once VIEWPORT is committed —
    // the frozen rectangle already reaches the backend via viewportScope.
    expect(params.has('bbox')).toBe(false);
    expect(params.get('viewportScope')).toBe('12.9,77.5,13,77.6');
    // And no navigation-derived nodeKey/areaKeys leak alongside it either
    // (Finding 11's suppression covers VIEWPORT the same as POLYGON).
    expect(params.has('nodeKey')).toBe(false);
    expect(params.getAll('areaKeys')).toEqual([]);
  });

  it('a post-activation pan (live mapBbox changes) does NOT trigger a new fetch/query-key change from the bbox parameter', async () => {
    const wrapper = makeWrapper();
    const { rerender } = renderHook(
      (props: { mapBbox: [number, number, number, number] | null }) =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          mapBbox: props.mapBbox,
          nav: makeNav({
            journey: 'area-first',
            rawNodeParam: 'n:area-1',
            node: 'n:area-1',
            resultScope: { active: { kind: 'VIEWPORT', bounds: VIEWPORT_BOUNDS }, previous: null },
          }),
          effectiveSelectedArea: EFFECTIVE_SELECTED_AREA,
          areasNavigationJourney: makeAreasNavigationJourney({ node: AREA_LEAF }),
        }),
      { wrapper, initialProps: { mapBbox: VIEWPORT_BOUNDS_AS_TUPLE(VIEWPORT_BOUNDS) } },
    );

    await waitFor(() => {
      expect(findMarkersCall()).toBeDefined();
    });

    const [urlBeforePan] = findMarkersCall() as [string, unknown];
    const paramsBeforePan = new URLSearchParams(urlBeforePan.split('?')[1]);
    expect(paramsBeforePan.has('bbox')).toBe(false);

    const callCountBeforePan = markersCallCount();

    // Simulate a pan: the live mapBbox prop drifts to a disjoint rectangle
    // while the committed VIEWPORT scope itself is unchanged.
    rerender({ mapBbox: PANNED_MAP_BBOX });

    // Give TanStack Query a tick to fire a refetch if the bbox-derived query
    // key had changed (it must not have — effectiveBbox stays null for any
    // mapBbox value while VIEWPORT is committed).
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(markersCallCount()).toBe(callCountBeforePan);

    // Belt-and-braces: the (still-single) markers call's params are byte-
    // identical to the pre-pan snapshot — no bbox= appeared, no new fetch.
    const [urlAfterPan] = findMarkersCall() as [string, unknown];
    expect(urlAfterPan).toBe(urlBeforePan);
  });

  // #2750 PR-5 review-fix r2 (Codex C4, issue-2015 'filters' L384-422): adding a filter (ntm=1 -> newToMarket) while
  // rscope=vp is active must fire a FRESH request that carries BOTH the frozen viewport rectangle and the filter.
  it('changing a filter under a committed VIEWPORT scope fires a NEW markers request carrying both viewportScope and the filter (no bbox)', async () => {
    const wrapper = makeWrapper();
    const { rerender } = renderHook(
      (props: { filters: Record<string, unknown> }) =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          filters: props.filters,
          mapBbox: VIEWPORT_BOUNDS_AS_TUPLE(VIEWPORT_BOUNDS),
          nav: makeNav({
            journey: 'area-first',
            rawNodeParam: 'n:area-1',
            node: 'n:area-1',
            resultScope: { active: { kind: 'VIEWPORT', bounds: VIEWPORT_BOUNDS }, previous: null },
          }),
          effectiveSelectedArea: EFFECTIVE_SELECTED_AREA,
          areasNavigationJourney: makeAreasNavigationJourney({ node: AREA_LEAF }),
        }),
      { wrapper, initialProps: { filters: {} as Record<string, unknown> } },
    );

    await waitFor(() => {
      expect(findMarkersCall()).toBeDefined();
    });
    const [urlBefore] = findMarkersCall() as [string, unknown];
    const paramsBefore = new URLSearchParams(urlBefore.split('?')[1]);
    expect(paramsBefore.get('viewportScope')).toBe('12.9,77.5,13,77.6');
    expect(paramsBefore.has('newToMarket')).toBe(false);
    const countBefore = markersCallCount();

    rerender({ filters: { newToMarket: true } });

    await waitFor(() => {
      expect(markersCallCount()).toBe(countBefore + 1);
    });
    const markerUrls = mockApiGet.mock.calls
      .map(([url]: [string]) => url)
      .filter((url: string) => url.includes('/api/discover/markers'));
    const paramsAfter = new URLSearchParams(markerUrls[markerUrls.length - 1].split('?')[1]);
    expect(paramsAfter.get('newToMarket')).toBe('true');
    expect(paramsAfter.get('viewportScope')).toBe('12.9,77.5,13,77.6');
    expect(paramsAfter.has('bbox')).toBe(false);
  });
});

function VIEWPORT_BOUNDS_AS_TUPLE(bounds: {
  s: number;
  w: number;
  n: number;
  e: number;
}): [number, number, number, number] {
  return [bounds.s, bounds.w, bounds.n, bounds.e];
}

// Issue #2017 (Fit all / focus-one, MUST-HAVE confirmed by the owner) — a
// real, NON-CONTIGUOUS 2-3 area committed AREA_SET (Hebbal / JP Nagar /
// Whitefield: three real Bangalore areas with disjoint, widely-separated
// bounding boxes — none adjacent or overlapping), proving:
//   (a) focus-one leaves the combined committed result set fully intact —
//       this controller receives `nav`/`resultScope` as a read-only prop and
//       has no action/setter capable of mutating it at all, so "does not
//       touch rareas" is a structural guarantee, not just an assertion; the
//       registered `focusAreaSetMember` closure only ever calls
//       `publishRecenterCameraIntent` — verified below by asserting the
//       controller's own `nav`/resultScope-derived identity is untouched
//       AND that the resulting camera intent frames ONLY the one area.
//   (b) "Fit all" (`fitAreaSet`) restores the union framing afterward —
//       called AFTER focus-one has already moved the camera to a single
//       area, proving it recomputes the union fresh rather than replaying a
//       stale target.
describe('useDiscoverMapDataController — Issue #2017 (Fit all / focus-one) camera actions for a committed non-contiguous AREA_SET', () => {
  const HEBBAL = {
    areaKey: 'IN|KA|Bengaluru|Hebbal',
    name: 'Hebbal',
    geoCenterLat: 13.05,
    geoCenterLon: 77.59,
    minLat: 13.04,
    minLon: 77.58,
    maxLat: 13.06,
    maxLon: 77.6,
    listingCount: 10,
    schoolCount: 2,
  };
  const JP_NAGAR = {
    areaKey: 'IN|KA|Bengaluru|JP Nagar',
    name: 'JP Nagar',
    geoCenterLat: 12.9,
    geoCenterLon: 77.58,
    minLat: 12.89,
    minLon: 77.57,
    maxLat: 12.91,
    maxLon: 77.59,
    listingCount: 8,
    schoolCount: 3,
  };
  const WHITEFIELD = {
    areaKey: 'IN|KA|Bengaluru|Whitefield',
    name: 'Whitefield',
    geoCenterLat: 12.97,
    geoCenterLon: 77.75,
    minLat: 12.96,
    minLon: 77.74,
    maxLat: 12.98,
    maxLon: 77.76,
    listingCount: 12,
    schoolCount: 4,
  };
  const NON_CONTIGUOUS_AREAS = [HEBBAL, JP_NAGAR, WHITEFIELD];
  const NON_CONTIGUOUS_AREA_KEYS = NON_CONTIGUOUS_AREAS.map((a) => a.areaKey);

  function setupNonContiguousAreasMock() {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/api/discover/markers')) return Promise.resolve(MARKERS_RESPONSE);
      if (url.includes('/listings')) return Promise.resolve({ city: 'bangalore', limitPerArea: 5, areas: [] });
      return Promise.resolve({ city: 'bangalore', areas: NON_CONTIGUOUS_AREAS });
    });
  }

  function renderWithCommittedAreaSet() {
    const nav = makeNav({
      journey: 'area-first',
      resultScope: { active: { kind: 'AREA_SET', areaKeys: NON_CONTIGUOUS_AREA_KEYS }, previous: null },
    });
    const hook = renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          nav,
          effectiveSelectedArea: null,
          areasNavigationJourney: makeAreasNavigationJourney(),
        }),
      { wrapper: makeWrapper() },
    );
    return { nav, ...hook };
  }

  function latestRegisteredActions() {
    const call = mockRegisterAreaSetCameraActions.mock.calls.at(-1);
    expect(call?.[0]).toBeTruthy();
    return call![0] as { fitAreaSet: () => void; focusAreaSetMember: (areaKey: string) => void };
  }

  beforeEach(setupNonContiguousAreasMock);

  it('focus-one (JP Nagar) frames the camera on that area alone, and never mutates the committed AREA_SET / rareas', async () => {
    const { result, nav } = renderWithCommittedAreaSet();

    // The auto-fit-on-commit effect publishes the UNION intent first — wait
    // for the areas to load and that initial framing to land.
    await waitFor(() => {
      expect(result.current.discoverAreasData?.areas.length).toBe(3);
      expect(result.current.cameraIntent?.framing).toBe('overview');
    });

    const actions = latestRegisteredActions();

    act(() => {
      actions.focusAreaSetMember(JP_NAGAR.areaKey);
    });

    await waitFor(() => {
      expect(result.current.cameraIntent?.framing).toBe('leaf');
    });

    // Frames JP Nagar's OWN bounds/centre — not the 3-area union.
    expect(result.current.cameraIntent?.bounds).toEqual([
      [JP_NAGAR.minLat, JP_NAGAR.minLon],
      [JP_NAGAR.maxLat, JP_NAGAR.maxLon],
    ]);
    expect(result.current.cameraIntent?.center).toEqual([JP_NAGAR.geoCenterLat, JP_NAGAR.geoCenterLon]);

    // Structural guarantee, verified: this controller receives `nav` as a
    // read-only prop and exposes no action capable of writing to it — the
    // SAME nav object instance passed in is still the one in scope, and the
    // committed AREA_SET it carries is unchanged (all 3 areas, in order).
    expect(nav.resultScope?.active).toEqual({
      kind: 'AREA_SET',
      areaKeys: NON_CONTIGUOUS_AREA_KEYS,
    });
  });

  it('"Fit all" (fitAreaSet), called after a prior focus-one, recomputes and restores the fresh union framing across all 3 non-contiguous areas', async () => {
    const { result } = renderWithCommittedAreaSet();

    await waitFor(() => {
      expect(result.current.discoverAreasData?.areas.length).toBe(3);
      expect(result.current.cameraIntent?.framing).toBe('overview');
    });

    const actions = latestRegisteredActions();

    // Move the camera to a single area first, exactly the state "Fit all"
    // must recover from.
    act(() => {
      actions.focusAreaSetMember(HEBBAL.areaKey);
    });
    await waitFor(() => {
      expect(result.current.cameraIntent?.center).toEqual([HEBBAL.geoCenterLat, HEBBAL.geoCenterLon]);
    });

    act(() => {
      actions.fitAreaSet();
    });

    await waitFor(() => {
      expect(result.current.cameraIntent?.framing).toBe('overview');
    });

    // Union bounds across Hebbal + JP Nagar + Whitefield (min/max of each
    // area's own bbox — see the fixtures above).
    expect(result.current.cameraIntent?.bounds).toEqual([
      [JP_NAGAR.minLat, JP_NAGAR.minLon],
      [HEBBAL.maxLat, WHITEFIELD.maxLon],
    ]);
    // `publishRecenterCameraIntent` -> `resolveCameraFraming` recomputes
    // `center` as the UNION BBOX'S OWN midpoint whenever a non-degenerate
    // bbox is present (see useDiscoverMapData.ts's `centroidOfBbox`) —
    // it does not just pass through `computeAreaSetCameraTarget`'s
    // mean-of-centres `center` field verbatim. Midpoint of the union bbox
    // asserted above: south/north from JP Nagar/Hebbal, west/east from
    // JP Nagar/Whitefield.
    expect(result.current.cameraIntent?.center).toEqual([
      (JP_NAGAR.minLat + HEBBAL.maxLat) / 2,
      (JP_NAGAR.minLon + WHITEFIELD.maxLon) / 2,
    ]);
  });
});

// Issue #2480 — returning from a committed VIEWPORT/POLYGON result scope to
// a previously-committed single-area (N=1) AREA_SET scope committed the
// scope but did NOT re-fit the camera (a silent no-op — the N>1 case above
// already worked via the ambient union-fit effect). AreaSelectedPanel's
// Return handler now records a one-shot restore request
// (shell.setAreaSetCameraRestoreRequest({ areaKey })) before committing the
// scope; a post-commit effect in the controller reads that request and, iff
// the newly committed AREA_SET is exactly [request.areaKey], publishes a
// 'leaf'-framed camera intent and clears the request. The request is the
// discriminator that keeps this from double-firing on the ordinary
// selectArea() flow (#2017 no-regression) — ONLY the Return action sets it.
//
// `cameraIntent.seq` is strictly monotonic, so "exactly one publish" is
// asserted via the seq delta across the render transition, never via a
// "was called" check — a double-fire advances seq by 2 even when
// bounds/center happen to coincide.
describe('useDiscoverMapDataController — Issue #2480 (Return-to-scope camera restore)', () => {
  const AREA_X = {
    areaKey: 'IN|KA|Bengaluru|Indiranagar',
    name: 'Indiranagar',
    geoCenterLat: 12.97,
    geoCenterLon: 77.64,
    minLat: 12.96,
    minLon: 77.63,
    maxLat: 12.98,
    maxLon: 77.65,
    listingCount: 6,
    schoolCount: 1,
  };
  const AREA_Y = {
    areaKey: 'IN|KA|Bengaluru|Koramangala',
    name: 'Koramangala',
    geoCenterLat: 12.93,
    geoCenterLon: 77.62,
    minLat: 12.92,
    minLon: 77.61,
    maxLat: 12.94,
    maxLon: 77.63,
    listingCount: 9,
    schoolCount: 2,
  };
  const VIEWPORT_BOUNDS = { s: 12.9, w: 77.55, n: 13.05, e: 77.7 };
  // Issue #2480 — the request now carries its target pre-resolved (as
  // AreaSelectedPanel would resolve it from its own already-loaded
  // `previousAreas`), not just an `areaKey` for the controller to look up.
  const AREA_X_BOUNDS: [[number, number], [number, number]] = [
    [AREA_X.minLat, AREA_X.minLon],
    [AREA_X.maxLat, AREA_X.maxLon],
  ];
  const AREA_X_CENTER: [number, number] = [AREA_X.geoCenterLat, AREA_X.geoCenterLon];

  function setupAreasMock(areas: Array<typeof AREA_X>) {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/api/discover/markers')) return Promise.resolve(MARKERS_RESPONSE);
      if (url.includes('/listings')) return Promise.resolve({ city: 'bangalore', limitPerArea: 5, areas: [] });
      return Promise.resolve({ city: 'bangalore', areas });
    });
  }

  function renderController(nav: DiscoverNavContextValue) {
    return renderHook(
      (currentNav: DiscoverNavContextValue) =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          nav: currentNav,
          effectiveSelectedArea: null,
          areasNavigationJourney: makeAreasNavigationJourney(),
        }),
      { wrapper: makeWrapper(), initialProps: nav },
    );
  }

  it('N=1 restore: returning to a previously-committed single area re-fits the camera on that area (framing=leaf), publishing exactly once', async () => {
    setupAreasMock([AREA_X]);

    const preCommitNav = makeNav({
      journey: 'area-first',
      resultScope: {
        active: { kind: 'VIEWPORT', bounds: VIEWPORT_BOUNDS },
        previous: { kind: 'AREA_SET', areaKeys: [AREA_X.areaKey] },
      },
    });
    const { result, rerender } = renderController(preCommitNav);

    await waitFor(() => {
      expect(result.current.discoverAreasData?.areas.length).toBe(1);
    });
    const seqBefore = result.current.cameraIntent?.seq ?? 0;

    // AreaSelectedPanel's Return handler: record the one-shot request, THEN
    // commit the previous AREA_SET scope.
    mockRestoreRequest = { areaKey: AREA_X.areaKey, bounds: AREA_X_BOUNDS, center: AREA_X_CENTER };
    const postCommitNav = makeNav({
      journey: 'area-first',
      resultScope: {
        active: { kind: 'AREA_SET', areaKeys: [AREA_X.areaKey] },
        previous: { kind: 'VIEWPORT', bounds: VIEWPORT_BOUNDS },
      },
    });
    rerender(postCommitNav);

    await waitFor(() => {
      expect(result.current.cameraIntent?.framing).toBe('leaf');
    });

    expect(result.current.cameraIntent?.center).toEqual([AREA_X.geoCenterLat, AREA_X.geoCenterLon]);
    expect(result.current.cameraIntent?.bounds).toEqual([
      [AREA_X.minLat, AREA_X.minLon],
      [AREA_X.maxLat, AREA_X.maxLon],
    ]);
    // Exactly one publish from this effect — a double-fire would advance
    // seq by 2 even if bounds/center happen to match.
    expect((result.current.cameraIntent?.seq ?? 0) - seqBefore).toBe(1);
    // Mobile follow-up (#2480): the publish is ALSO marked never-delivered, so
    // a map that is not mounted right now — the normal case on mobile, where
    // Return is only reachable in List view — delivers it when it next mounts
    // instead of absorbing it via MapController's adopt-on-mount guard. Pinned
    // to the exact published seq, not merely non-null: the marker only works
    // because it identifies THIS intent.
    expect(result.current.pendingRemountCameraIntentSeqRef.current).toBe(
      result.current.cameraIntent?.seq,
    );
  });

  it('Issue #2017 no-regression: committing the same N=1 AREA_SET via the ordinary selectArea() flow (no restore request) publishes NO camera intent', async () => {
    setupAreasMock([AREA_X]);

    const initialNav = makeNav({
      journey: 'area-first',
      resultScope: { active: null, previous: null },
    });
    const { result, rerender } = renderController(initialNav);

    await waitFor(() => {
      expect(result.current.discoverAreasData?.areas.length).toBe(1);
    });
    const seqBefore = result.current.cameraIntent?.seq ?? 0;

    // No restore request set — this is the ordinary selectArea() commit
    // path, not a Return-to-scope action.
    expect(mockRestoreRequest).toBeNull();
    const committedNav = makeNav({
      journey: 'area-first',
      resultScope: { active: { kind: 'AREA_SET', areaKeys: [AREA_X.areaKey] }, previous: null },
    });
    rerender(committedNav);

    // Give effects a chance to run. The naive "await waitFor(condition)"
    // here would be checking a condition (`areas.length === 1`) that was
    // ALREADY true before this rerender, so it could resolve without ever
    // yielding to a later microtask/tick — making the "seq delta 0"
    // assertion below pass vacuously even if a publish were merely queued
    // rather than genuinely absent. Force a real subsequent tick by
    // rerendering again with the SAME committed scope (a no-op commit) and
    // letting the areas query settle again before asserting.
    await waitFor(() => {
      expect(result.current.discoverAreasData?.areas.length).toBe(1);
    });
    rerender(committedNav);
    await waitFor(() => {
      expect(result.current.areasLoading).toBe(false);
    });
    expect((result.current.cameraIntent?.seq ?? 0) - seqBefore).toBe(0);
    // Mobile follow-up (#2480): selectArea() must not arm the deliver-on-remount
    // marker either. If it did, its own (correct) camera intent would be
    // re-delivered on the next mobile Map open — the #2017 double-fire
    // resurrected one mount later, which a seq-delta check at THIS instant
    // cannot see.
    expect(result.current.pendingRemountCameraIntentSeqRef.current).toBeNull();
  });

  it('N>1 unchanged: a multi-area commit still fires the existing ambient union fit (framing=overview) exactly once', async () => {
    setupAreasMock([AREA_X, AREA_Y]);

    const initialNav = makeNav({
      journey: 'area-first',
      resultScope: { active: null, previous: null },
    });
    const { result, rerender } = renderController(initialNav);

    await waitFor(() => {
      expect(result.current.discoverAreasData?.areas.length).toBe(2);
    });
    const seqBefore = result.current.cameraIntent?.seq ?? 0;

    expect(mockRestoreRequest).toBeNull();
    const committedNav = makeNav({
      journey: 'area-first',
      resultScope: {
        active: { kind: 'AREA_SET', areaKeys: [AREA_X.areaKey, AREA_Y.areaKey] },
        previous: null,
      },
    });
    rerender(committedNav);

    await waitFor(() => {
      expect(result.current.cameraIntent?.framing).toBe('overview');
    });

    expect(result.current.cameraIntent?.bounds).toEqual([
      [AREA_Y.minLat, AREA_Y.minLon],
      [AREA_X.maxLat, AREA_X.maxLon],
    ]);
    // Only the pre-existing ambient effect fires — the new #2480 effect
    // does not add a second publish.
    expect((result.current.cameraIntent?.seq ?? 0) - seqBefore).toBe(1);
  });

  it('stale request dropped: a restore request for area X is discarded (and cleared) when the committed scope resolves to a different area Y', async () => {
    setupAreasMock([AREA_X, AREA_Y]);

    const initialNav = makeNav({
      journey: 'area-first',
      resultScope: { active: null, previous: null },
    });
    const { result, rerender } = renderController(initialNav);

    await waitFor(() => {
      expect(result.current.discoverAreasData?.areas.length).toBe(2);
    });
    const seqBefore = result.current.cameraIntent?.seq ?? 0;

    // Request recorded for X, but the scope that actually ends up committed
    // (e.g. browser Back landed elsewhere) is the unrelated area Y.
    mockRestoreRequest = { areaKey: AREA_X.areaKey, bounds: AREA_X_BOUNDS, center: AREA_X_CENTER };
    const committedNav = makeNav({
      journey: 'area-first',
      resultScope: { active: { kind: 'AREA_SET', areaKeys: [AREA_Y.areaKey] }, previous: null },
    });
    rerender(committedNav);

    await waitFor(() => {
      expect(mockRestoreRequest).toBeNull();
    });
    expect((result.current.cameraIntent?.seq ?? 0) - seqBefore).toBe(0);
  });

  // Issue #2480 fix — pins the deferred #2017 double-fire this fix removes.
  // The OLD design left a cold (areas-not-loaded) restore request pending so
  // it could "retry" once `discoverAreasData` arrived. But nothing consumed
  // it in the meantime, so an unrelated flow that recommitted the SAME
  // areaKey before data loaded left the request looking exactly as valid as
  // when it was issued — and when `discoverAreasData` finally changed
  // identity, the effect fired a second, spurious camera intent on top of
  // that unrelated flow's own already-correct publish. The fix resolves the
  // camera target at issue time (in the panel) and clears the request on
  // EVERY effect run, so `discoverAreasData` is no longer even a dependency
  // of this effect — it cannot be woken by a later, unrelated data arrival.
  it('deferred double-fire (fixed): a restore request consumed immediately at commit is not re-fired when discoverAreasData later resolves after an unrelated same-areaKey commit', async () => {
    let resolveAreas: (value: { city: string; areas: Array<typeof AREA_X> }) => void = () => {};
    const areasPromise = new Promise<{ city: string; areas: Array<typeof AREA_X> }>((resolve) => {
      resolveAreas = resolve;
    });
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/api/discover/markers')) return Promise.resolve(MARKERS_RESPONSE);
      if (url.includes('/listings')) return Promise.resolve({ city: 'bangalore', limitPerArea: 5, areas: [] });
      return areasPromise;
    });

    // AreaSelectedPanel's Return handler resolves the target from its OWN
    // (separately-loaded) `previousAreas` — so the request is fully
    // actionable even though this controller's `discoverAreasData` (a
    // DIFFERENT query instance) is still cold, unlike the old design where
    // the controller had to compute the target itself from that same query.
    mockRestoreRequest = { areaKey: AREA_X.areaKey, bounds: AREA_X_BOUNDS, center: AREA_X_CENTER };
    const nav = makeNav({
      journey: 'area-first',
      resultScope: { active: { kind: 'AREA_SET', areaKeys: [AREA_X.areaKey] }, previous: null },
    });
    const { result, rerender } = renderController(nav);

    // The committed AREA_SET already matches on mount, so the restore
    // effect fires and clears the request on its very first run — no
    // waiting on `discoverAreasData` at all.
    await waitFor(() => {
      expect(result.current.cameraIntent?.framing).toBe('leaf');
    });
    expect(result.current.cameraIntent?.center).toEqual(AREA_X_CENTER);
    expect(result.current.cameraIntent?.bounds).toEqual(AREA_X_BOUNDS);
    const seqAfterFirstPublish = result.current.cameraIntent?.seq ?? 0;
    expect(seqAfterFirstPublish).toBeGreaterThan(0);
    expect(mockRestoreRequest).toBeNull();

    // An unrelated flow recommits the SAME areaKey (e.g. an ordinary
    // selectArea() on the already-selected area) — no new restore request,
    // matching `committedAreaSetSignature` so this effect would not re-run
    // even under the old design's own guard.
    const sameAreaRecommitNav = makeNav({
      journey: 'area-first',
      resultScope: { active: { kind: 'AREA_SET', areaKeys: [AREA_X.areaKey] }, previous: null },
    });
    rerender(sameAreaRecommitNav);

    // `discoverAreasData` finally resolves — under the OLD design this was
    // exactly the trigger that re-ran the effect against the still-matching
    // stale request and fired a second camera intent. Under the fix, this
    // query identity is no longer in the effect's dependency array at all.
    await act(async () => {
      resolveAreas({ city: 'bangalore', areas: [AREA_X] });
    });
    await waitFor(() => {
      expect(result.current.discoverAreasData?.areas.length).toBe(1);
    });

    expect((result.current.cameraIntent?.seq ?? 0) - seqAfterFirstPublish).toBe(0);
    expect(mockRestoreRequest).toBeNull();
  });

  // Issue #2494 (mobile) — the N>1 ambient union-fit effect (above, in the
  // controller) now also marks its publish for delivery on remount, mirroring
  // the N=1 restore effect. Without this, "Return to <areas>" for a
  // previously-committed N>1 AREA_SET — reachable only from List view on
  // mobile, where the map is unmounted — landed its camera publish nowhere:
  // PropertyMap.tsx's adopt-on-mount guard silently absorbed it on the next
  // Map open instead of delivering it. AreaSelectedPanel.tsx's Return handler
  // has no restore-request path of its own for N>1 (only N=1 does — see the
  // #2480 describe block above), so this ambient effect is the ONLY producer
  // for an N>1 commit, whether reached via Return or an ordinary multi-area
  // commit (e.g. AreaSetChips' "Search these areas") — both land here as the
  // same committedAreaSetSignature transition.
  it('N>1 mobile deliver-on-remount (#2494): a multi-area AREA_SET commit marks the camera intent for delivery on the next mobile Map remount, publishing exactly once', async () => {
    setupAreasMock([AREA_X, AREA_Y]);

    const initialNav = makeNav({
      journey: 'area-first',
      resultScope: { active: null, previous: null },
    });
    const { result, rerender } = renderController(initialNav);

    await waitFor(() => {
      expect(result.current.discoverAreasData?.areas.length).toBe(2);
    });
    const seqBefore = result.current.cameraIntent?.seq ?? 0;

    const committedNav = makeNav({
      journey: 'area-first',
      resultScope: {
        active: { kind: 'AREA_SET', areaKeys: [AREA_X.areaKey, AREA_Y.areaKey] },
        previous: null,
      },
    });
    rerender(committedNav);

    await waitFor(() => {
      expect(result.current.cameraIntent?.framing).toBe('overview');
    });

    // Exactly one publish — same seq-delta discipline as every other test in
    // this suite (a double-fire would advance seq by 2 even if bounds/center
    // happen to coincide).
    expect((result.current.cameraIntent?.seq ?? 0) - seqBefore).toBe(1);
    // Pinned to the exact published seq, not merely non-null: the marker
    // only works because it identifies THIS intent.
    expect(result.current.pendingRemountCameraIntentSeqRef.current).toBe(
      result.current.cameraIntent?.seq,
    );
  });

  // Issue #2494 — the exact reported repro sequence: AREA_SET(N>1) is
  // committed once (arming lastAreaSetCameraSignature to that signature),
  // then the user leaves it (e.g. via "Search this area" committing a
  // VIEWPORT scope over it) and Returns to the SAME N>1 signature. Before
  // this fix, `lastAreaSetCameraSignature.current` was never cleared on
  // leaving N>1 state, so this second commit — despite being a genuine new
  // commit EVENT — matched the ref's stale value and the effect's own guard
  // (`committedAreaSetSignature === lastAreaSetCameraSignature.current`)
  // returned before ever reaching `publishRecenterCameraIntent`. This is a
  // SEPARATE gap from the deliverOnRemount fix above: even with
  // deliverOnRemount always set, a re-visit like this would still publish
  // NOTHING at all, on desktop or mobile alike.
  it('N>1 re-visit (#2494): returning to an N>1 AREA_SET signature already committed earlier in the session re-fires the camera fit', async () => {
    setupAreasMock([AREA_X, AREA_Y]);

    const initialNav = makeNav({
      journey: 'area-first',
      resultScope: { active: null, previous: null },
    });
    const { result, rerender } = renderController(initialNav);

    await waitFor(() => {
      expect(result.current.discoverAreasData?.areas.length).toBe(2);
    });

    // First commit of the N>1 signature — the ambient effect fires and
    // records it on lastAreaSetCameraSignature.
    const firstCommitNav = makeNav({
      journey: 'area-first',
      resultScope: {
        active: { kind: 'AREA_SET', areaKeys: [AREA_X.areaKey, AREA_Y.areaKey] },
        previous: null,
      },
    });
    rerender(firstCommitNav);
    await waitFor(() => {
      expect(result.current.cameraIntent?.framing).toBe('overview');
    });
    const seqAfterFirstCommit = result.current.cameraIntent?.seq ?? 0;
    expect(seqAfterFirstCommit).toBeGreaterThan(0);

    // Leave N>1 territory — mirrors "Search this area" committing a VIEWPORT
    // scope whose `previous` is the AREA_SET (the VIEWPORT bounds/previous
    // fields don't matter to this controller's own N>1 effect, only that
    // `resultScope.active.kind` is no longer 'AREA_SET').
    const viewportNav = makeNav({
      journey: 'area-first',
      resultScope: {
        active: { kind: 'VIEWPORT', bounds: VIEWPORT_BOUNDS },
        previous: { kind: 'AREA_SET', areaKeys: [AREA_X.areaKey, AREA_Y.areaKey] },
      },
    });
    rerender(viewportNav);
    await waitFor(() => {
      expect((result.current.cameraIntent?.seq ?? 0)).toBe(seqAfterFirstCommit);
    });

    // Return: recommits the IDENTICAL N>1 signature. This must fire again —
    // a double-fire-prevention guard meant for same-occurrence re-renders
    // must never suppress a genuinely new commit event.
    rerender(firstCommitNav);

    await waitFor(() => {
      expect((result.current.cameraIntent?.seq ?? 0) - seqAfterFirstCommit).toBe(1);
    });
    expect(result.current.pendingRemountCameraIntentSeqRef.current).toBe(
      result.current.cameraIntent?.seq,
    );
  });

  // #2750 PR-4 V1 (retires e2e issue-2494 L378 "mobile control: List->Map->List->Map with NO Return:
  // camera seq/center unchanged"). The cited "N>1 unchanged ... exactly once" `it` above never
  // re-runs the effect with an UNCHANGED signature, so deleting the same-signature guard left it
  // green (MUT-417/452 VACUOUS). Here the committed N>1 signature stays put while the effect's OTHER
  // dependency (`mapData.discoverAreasData`) changes identity — the real-world trigger for a
  // re-run without a new commit event — and no second camera intent may be published.
  it('no spurious re-publish (#2494): re-running the effect for the SAME committed N>1 signature (areas data refreshed, no Return) publishes nothing', async () => {
    setupAreasMock([AREA_X, AREA_Y]);

    const committedNav = makeNav({
      journey: 'area-first',
      resultScope: {
        active: { kind: 'AREA_SET', areaKeys: [AREA_X.areaKey, AREA_Y.areaKey] },
        previous: null,
      },
    });
    const { result, rerender } = renderHook(
      ({ nav, purpose }: { nav: DiscoverNavContextValue; purpose: string }) =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          intentListingPurpose: purpose,
          nav,
          effectiveSelectedArea: null,
          areasNavigationJourney: makeAreasNavigationJourney(),
        }),
      { wrapper: makeWrapper(), initialProps: { nav: committedNav, purpose: 'sale' } },
    );

    await waitFor(() => {
      expect(result.current.cameraIntent?.framing).toBe('overview');
    });
    const seqAfterCommit = result.current.cameraIntent?.seq ?? 0;
    expect(seqAfterCommit).toBeGreaterThan(0);
    const areasDataBefore = result.current.discoverAreasData;
    expect(areasDataBefore?.areas.length).toBe(2);

    // Same committed scope object shape, but the areas query key changes (Buy -> Rent), which yields
    // a NEW `discoverAreasData` object and therefore re-runs the camera effect for the same signature.
    rerender({ nav: committedNav, purpose: 'rent' });
    await waitFor(() => {
      expect(mockApiGet.mock.calls.some(([url]: [string]) => url.includes('purpose=rent'))).toBe(true);
    });
    await waitFor(() => {
      expect(result.current.discoverAreasData).not.toBe(areasDataBefore);
      expect(result.current.discoverAreasData?.areas.length).toBe(2);
    });
    // Let any (wrongly) queued publish land before asserting its absence.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    expect((result.current.cameraIntent?.seq ?? 0) - seqAfterCommit).toBe(0);
  });

  // Issue #2496's named coverage gap — "a mutation that arms deliverOnRemount
  // on EVERY publish (not just the intended opt-in call sites) currently
  // passes the full existing suite 33/33". The N=1 no-regression test above
  // (line 874) already discriminates the ordinary selectArea() flow; this
  // test discriminates the OTHER two producers that share this controller's
  // publishRecenterCameraIntent call but must NOT be marked: the user-
  // triggered "Fit all"/"focus one" AreaSetCameraActions (registered into
  // DiscoverShellContext below) are only reachable from on-map controls, so
  // — unlike the N>1 ambient commit effect just above — the map is always
  // already mounted when they fire, and marking them would leave a stale
  // marker to be wrongly re-delivered on a LATER, unrelated remount.
  it('over-arming guard (#2496): the user-triggered Fit-all/focus-one AreaSetCameraActions do not arm deliverOnRemount', async () => {
    setupAreasMock([AREA_X, AREA_Y]);

    const committedNav = makeNav({
      journey: 'area-first',
      resultScope: {
        active: { kind: 'AREA_SET', areaKeys: [AREA_X.areaKey, AREA_Y.areaKey] },
        previous: null,
      },
    });
    const { result } = renderController(committedNav);

    await waitFor(() => {
      expect(result.current.cameraIntent?.framing).toBe('overview');
    });
    // The commit itself already armed the marker (per the #2494 test above)
    // — clear it so this test isolates ONLY the two actions below.
    result.current.pendingRemountCameraIntentSeqRef.current = null;

    expect(mockRegisterAreaSetCameraActions).toHaveBeenCalled();
    const actions = mockRegisterAreaSetCameraActions.mock.calls.at(-1)?.[0] as
      | { fitAreaSet: () => void; focusAreaSetMember: (areaKey: string) => void }
      | undefined;

    const seqBeforeFit = result.current.cameraIntent?.seq ?? 0;
    act(() => {
      actions?.fitAreaSet();
    });
    await waitFor(() => {
      expect((result.current.cameraIntent?.seq ?? 0) - seqBeforeFit).toBe(1);
    });
    expect(result.current.pendingRemountCameraIntentSeqRef.current).toBeNull();

    const seqBeforeFocus = result.current.cameraIntent?.seq ?? 0;
    act(() => {
      actions?.focusAreaSetMember(AREA_X.areaKey);
    });
    await waitFor(() => {
      expect((result.current.cameraIntent?.seq ?? 0) - seqBeforeFocus).toBe(1);
    });
    expect(result.current.pendingRemountCameraIntentSeqRef.current).toBeNull();
  });
});

// ─── G1-N1 (#2750 PR-3 B1) — markersEnabled gate, observed at the network layer ─────
// The gate is ONE expression (useDiscoverMapDataController.ts markersEnabled). Each
// case varies exactly ONE term while every other term is held in the "enabled"
// position, and observes the real GET /api/discover/markers call on the mocked
// api.get — never a hook flag. Retires the markers assertions of the legacy specs
// discover-agri-journey-1375 / verify-agri-clusters-1372 / discover-agri-polygons-1373
// / discover-agri-grouped-journey-1412 / discover-agri-price-gate-1551 (AC-MKR).
describe('useDiscoverMapDataController — G1-N1 markersEnabled gate (network-observed)', () => {
  function markersCalls(): string[] {
    return mockApiGet.mock.calls
      .map(([url]: [string]) => url)
      .filter((url: string) => url.includes('/api/discover/markers'));
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

  function renderAgri(params: Record<string, unknown> = {}, navOverrides: Record<string, unknown> = {}) {
    return renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          nav: makeNav({ journey: 'agri-first', selectedRegion: 'N', ...navOverrides } as Partial<DiscoverNavContextValue>),
          effectiveSelectedArea: null,
          areasNavigationJourney: makeAreasNavigationJourney(),
          ...params,
        }),
      { wrapper: makeWrapper() },
    );
  }

  function renderSchoolFirst(params: Record<string, unknown> = {}) {
    return renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          filters: { schoolLat: 13.1, schoolLon: 77.6, schoolRadiusKm: 3 },
          boundedSearchTriggered: true,
          nav: makeNav({ journey: 'school-first', schoolId: 'school-42' }),
          effectiveSelectedArea: null,
          areasNavigationJourney: makeAreasNavigationJourney(),
          ...params,
        }),
      { wrapper: makeWrapper() },
    );
  }

  it('G1-N1 agri-first + authed + region + zoom>12: exactly one markers call carrying propertyTypes=agricultural_land', async () => {
    renderAgri();
    await waitFor(() => {
      expect(markersCalls()).toHaveLength(1);
    });
    const params = new URLSearchParams(markersCalls()[0].split('?')[1]);
    expect(params.getAll('propertyTypes')).toEqual(['agricultural_land']);
  });

  it('G1-N1 agri-first ANON (only isAuthenticated varied): zero markers calls (R4: /api/discover/markers is auth-gated)', async () => {
    renderAgri({ isAuthenticated: false });
    await settle();
    expect(markersCalls()).toHaveLength(0);
  });

  it('G1-N1 agri-first with no region/locality (only top-grouped term varied): zero markers calls', async () => {
    renderAgri({}, { selectedRegion: null });
    await settle();
    expect(markersCalls()).toHaveLength(0);
  });

  it('G1-N1 agri-first authed at zoom 10 (only zoom term varied, nodeListings falsy): zero markers calls', async () => {
    renderAgri({ mapZoom: 10 });
    await settle();
    expect(markersCalls()).toHaveLength(0);
  });

  it('G1-N1 school-first + schoolId + coords + boundedSearchTriggered + authed: exactly one markers call (paired control)', async () => {
    renderSchoolFirst();
    await waitFor(() => {
      expect(markersCalls()).toHaveLength(1);
    });
  });

  it('G1-N1 school-first authed but boundedSearchTriggered=false (only that term varied): zero markers calls', async () => {
    renderSchoolFirst({ boundedSearchTriggered: false });
    await settle();
    expect(markersCalls()).toHaveLength(0);
  });

  it('G1-N1 school-first bounded ANON (only isAuthenticated varied vs the control above): zero markers calls', async () => {
    renderSchoolFirst({ isAuthenticated: false });
    await settle();
    expect(markersCalls()).toHaveLength(0);
  });
});

// ─── G2-N9 / G3-M2 (#2750 PR-3 B1) — school-first markers request + public-endpoint enable arg ───
// R4 NOTE (security, G3-M1): the anon arm that proves `isAuthenticated &&` at
// useDiscoverMapDataController.ts:262 is the G1-N1 pair above ("school-first bounded ANON" vs the
// authed "paired control", MUT-10: ONLY the two anon arms turn red, the control stays green). Its
// setup already meets the M1 requirements: journey=school-first, schoolId, schoolLat/Lon,
// boundedSearchTriggered:true, mapZoom 14 > AREA_LAYER_MAX_ZOOM (12), nodeListings falsy (makeNav default).
// The tests below are the REMAINING G2-N9 / G3-M2 arms and deliberately do not repeat it.
// Retire: school-first-map-focus MF-9/MF-12, discover-school-bounded-search BSC-2 (exactly one call),
// issue-2205 (no markers call without a school), discover-anon-school-radius SR-1/AUTH-SR-1 (M2).
describe('useDiscoverMapDataController — G2-N9 school-first markers request params + remaining gate terms', () => {
  function markersUrls(): string[] {
    return mockApiGet.mock.calls
      .map(([url]: [string]) => url)
      .filter((url: string) => url.includes('/api/discover/markers'));
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
  const SCHOOL_FILTERS = { schoolLat: 13.3525, schoolLon: 74.7864, schoolRadiusKm: 3 };

  function render(params: Record<string, unknown> = {}, navOverrides: Record<string, unknown> = {}) {
    return renderHook(
      (p: Record<string, unknown>) =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          filters: SCHOOL_FILTERS,
          boundedSearchTriggered: true,
          nav: makeNav({ journey: 'school-first', schoolId: 'school-42', ...navOverrides } as Partial<DiscoverNavContextValue>),
          effectiveSelectedArea: null,
          areasNavigationJourney: makeAreasNavigationJourney(),
          ...p,
        }),
      { wrapper: makeWrapper(), initialProps: params },
    );
  }

  it('G2-N9(a) authed bounded search: the markers URL carries schoolLat=13.3525, schoolLon=74.7864, schoolRadiusKm=3 EXACTLY, and every markers call has schoolLat', async () => {
    render();
    await waitFor(() => {
      expect(markersUrls()).toHaveLength(1);
    });
    const params = new URLSearchParams(markersUrls()[0].split('?')[1]);
    expect(params.getAll('schoolLat')).toEqual(['13.3525']);
    expect(params.getAll('schoolLon')).toEqual(['74.7864']);
    expect(params.getAll('schoolRadiusKm')).toEqual(['3']);
    for (const url of markersUrls()) {
      expect(new URLSearchParams(url.split('?')[1]).has('schoolLat')).toBe(true);
    }
  });

  it('G2-N9(a)-ext the CTA flip (boundedSearchTriggered false -> true) takes the markers call count from 0 to EXACTLY 1', async () => {
    const { rerender } = render({ boundedSearchTriggered: false });
    await settle();
    expect(markersUrls()).toHaveLength(0);

    rerender({ boundedSearchTriggered: true });
    await waitFor(() => {
      expect(markersUrls()).toHaveLength(1);
    });
    await settle();
    expect(markersUrls()).toHaveLength(1);
  });

  it('G2-N9 coord guard: schoolLat missing (all other terms enabled) -> zero markers calls', async () => {
    render({ filters: { schoolLon: 74.7864, schoolRadiusKm: 3 } });
    await settle();
    expect(markersUrls()).toHaveLength(0);
  });

  it('G2-N9 coord guard: schoolLon missing (all other terms enabled) -> zero markers calls', async () => {
    render({ filters: { schoolLat: 13.3525, schoolRadiusKm: 3 } });
    await settle();
    expect(markersUrls()).toHaveLength(0);
  });

  it('G2-N9 schoolId guard: school-first with coords + bounded + authed but NO schoolId (areaKey set so the top-grouped guard is NOT what blocks it) -> zero markers calls', async () => {
    // With areaKey null/schoolId null the #1655 top-grouped guard would block the call on its own and
    // the schoolId term would never be exercised (a dropped term stayed green: MUT-68 first run).
    // areaKey set => isTopGroupedLevel false => the schoolId term is the only thing that varies.
    render({}, { schoolId: null, areaKey: 'IN|KA|Udupi|Manipal' });
    await settle();
    expect(markersUrls()).toHaveLength(0);
  });

  // #2750 PR-5 review-fix r3 (Codex P2 4292420347, regression-1240-marker-lat-lon): the composed
  // RESPONSE -> mapper -> markerListings path. Before this `it`, every covering test proved only that
  // the request fires, or that the mapper works alone, so a hook that stopped applying the mapper
  // (or stopped forwarding `markerListings`) left them all green while authed users saw no pins.
  // The api layer is mocked at the wire (the REAL backend field names lat/lon, NOT latitude/longitude);
  // the real useDiscoverFilteredMarkers, the real mapper and the real useDiscoverMapData memo run.
  it('G2-N9 composed 1240: an authed markers response with backend lat/lon fields surfaces as markerListings with DEFINED latitude/longitude; the anon arm gets none and fires no request', async () => {
    const MARKERS_LAT_LON = {
      city: 'bangalore',
      markers: [
        { id: 'reg-pin-1', lat: 13.3555, lon: 74.7894, pricePaise: 500_000_000, locality: 'Manipal' },
        { id: 'reg-pin-2', lat: 13.3505, lon: 74.7884, pricePaise: 450_000_000, locality: 'Manipal' },
      ],
      truncated: false,
    };
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/api/discover/markers')) return Promise.resolve(MARKERS_LAT_LON);
      if (url.includes('/listings')) return Promise.resolve({ city: 'bangalore', limitPerArea: 5, areas: [] });
      return Promise.resolve(AREAS_RESPONSE);
    });

    const authed = render();
    await waitFor(() => {
      expect(authed.result.current.markerListings).toHaveLength(2);
    });
    const [pin1, pin2] = authed.result.current.markerListings;
    expect(pin1.id).toBe('reg-pin-1');
    expect(pin1.latitude).toBe(13.3555);
    expect(pin1.longitude).toBe(74.7894);
    expect(pin2.id).toBe('reg-pin-2');
    expect(pin2.latitude).toBe(13.3505);
    expect(pin2.longitude).toBe(74.7884);
    authed.unmount();

    // Anon control (only isAuthenticated varied): the same mocked response is never requested, so no pins.
    mockApiGet.mockClear();
    const anon = render({ isAuthenticated: false });
    await settle();
    expect(markersUrls()).toHaveLength(0);
    expect(anon.result.current.markerListings).toEqual([]);
  });

  // G3-M2: the PUBLIC school-radius endpoint's `enabled` arg (useDiscoverMapData.ts schoolRadiusEnabled).
  // Observed on the mocked useSchoolRadiusListings hook's LAST call args (a layer assertion; the
  // outgoing no-Authorization-header half is an OPEN ITEM, see G2G3-tests.md: the allowed-file list
  // does not include useSchoolRadiusListings.test.ts).
  describe('G3-M2 useSchoolRadiusListings enabled arg', () => {
    function lastRadiusArgs(): { enabled: boolean; schoolLat?: number } {
      return mockSchoolRadiusListings.mock.calls.at(-1)?.[0] as { enabled: boolean; schoolLat?: number };
    }

    it('G3-M2 anon + coords -> enabled true (their only listing source)', async () => {
      render({ isAuthenticated: false });
      await waitFor(() => {
        expect(lastRadiusArgs()).toBeDefined();
      });
      expect(lastRadiusArgs().enabled).toBe(true);
      expect(lastRadiusArgs().schoolLat).toBe(13.3525);
    });

    it('G3-M2 authed, markers NOT yet enabled (pre-CTA) + coords -> enabled true (fallback pins)', async () => {
      render({ boundedSearchTriggered: false });
      await waitFor(() => {
        expect(lastRadiusArgs()).toBeDefined();
      });
      expect(lastRadiusArgs().enabled).toBe(true);
    });

    it('G3-M2 authed, markers enabled (post-CTA) + coords -> enabled false', async () => {
      render();
      await waitFor(() => {
        expect(markersUrls()).toHaveLength(1);
      });
      expect(lastRadiusArgs().enabled).toBe(false);
    });

    it('G3-M2 anon without coords -> enabled false', async () => {
      render({ isAuthenticated: false, filters: {} });
      await waitFor(() => {
        expect(lastRadiusArgs()).toBeDefined();
      });
      expect(lastRadiusArgs().enabled).toBe(false);
    });
  });
});

// ─── #2750 PR-5 2193-N2 [SEC] — grouped-overview guard: no node/area/group/school => no marker/listing fetch ───
// The guard is `isTopGroupedLevel` (useDiscoverMapDataController.ts:134-147). A "zero calls" assertion alone
// passes if it is read before the hook has had a chance to fetch, so the SAME `it` first proves the hook DOES
// fetch (positive arm: the :224 resolved-leaf scenario, exactly one markers call carrying nodeKey), then runs the
// negative arm and settles for the same window. Both arms are authed, area-first, zoom 14.
describe('useDiscoverMapDataController — 2193-N2 [SEC] grouped overview issues no markers or listings fetch', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
  function markersUrls(): string[] {
    return mockApiGet.mock.calls
      .map(([url]: [string]) => url)
      .filter((url: string) => url.includes('/api/discover/markers'));
  }
  function listingsEnabledCalls(): number {
    return mockDiscoverListings.mock.calls.filter(
      ([args]: [{ enabled?: boolean }]) => args?.enabled === true,
    ).length;
  }

  // #2750 PR-5 2193-N2
  it('area-first with no node, area, group or school issues neither a markers call nor a listings call (positive arm: a resolved leaf does)', async () => {
    // POSITIVE ARM (paired control): a resolved canonical AREA leaf -> exactly one markers call scoped by nodeKey,
    // and the paginated-listings hook is enabled.
    const positive = renderHook(
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
      expect(markersUrls()).toHaveLength(1);
    });
    await settle();
    expect(markersUrls()).toHaveLength(1);
    expect(new URLSearchParams(markersUrls()[0].split('?')[1]).get('nodeKey')).toBe('n:area-1');
    expect(listingsEnabledCalls()).toBeGreaterThan(0);
    positive.unmount();

    // NEGATIVE ARM: same authed/area-first/zoom-14 setup, but nothing selected at all.
    mockApiGet.mockClear();
    mockDiscoverListings.mockClear();
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          nav: makeNav({
            journey: 'area-first',
            nodeListings: false,
            areaKey: null,
            groupId: null,
            schoolId: null,
          }),
          effectiveSelectedArea: null,
          areasNavigationJourney: makeAreasNavigationJourney(),
        }),
      { wrapper: makeWrapper() },
    );
    await settle();
    expect(markersUrls()).toEqual([]);
    expect(findPanelCall()).toBeUndefined();
    expect(listingsEnabledCalls()).toBe(0);
    // The hook did run (it queried the areas list through the same mocked api.get): not a never-mounted false green.
    expect(mockApiGet.mock.calls.length).toBeGreaterThan(0);
  });
});

// ─── #2750 PR-5 B1 T3 2017-N11 — a committed AREA_SET scope broadens the area-listings request to EVERY key ───
// Query side of issue-2017-multi-area-areaset-commit-regression ("Show listings" after adding a nearby area must not
// keep fetching only the pre-commit single area). Real useDiscoverCityListings, mocked api.get (same harness as above).
describe('useDiscoverMapDataController — 2017-N11 committed AREA_SET sends every area key on the city-listings request', () => {
  const KEY_A = EFFECTIVE_SELECTED_AREA.areaKey;
  const KEY_B = 'IN|KA|Bengaluru|Hebbal';

  async function panelAreaKeysFor(resultScope: DiscoverNavContextValue['resultScope']): Promise<string[]> {
    mockApiGet.mockClear();
    const view = renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          nav: makeNav({ journey: 'area-first', resultScope }),
          effectiveSelectedArea: EFFECTIVE_SELECTED_AREA,
          areasNavigationJourney: makeAreasNavigationJourney(),
        }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => {
      expect(findPanelCall()).toBeDefined();
    });
    const [panelUrl] = findPanelCall() as [string, unknown];
    view.unmount();
    return new URLSearchParams(panelUrl.split('?')[1]).getAll('areaKeys');
  }

  // #2750 PR-5 2017-N11
  it('a committed AREA_SET [A,B] sends BOTH area keys on the city-listings request', async () => {
    // Control arms first (they must hold whatever the multi-area behaviour is): a single-key AREA_SET and no scope at
    // all both fetch exactly the one selected area.
    expect(await panelAreaKeysFor({ active: { kind: 'AREA_SET', areaKeys: [KEY_A] }, previous: null })).toEqual([KEY_A]);
    expect(await panelAreaKeysFor(undefined)).toEqual([KEY_A]);

    // The committed multi-area set: BOTH keys (the request canonicalises the key order, so compare as a set).
    const both = await panelAreaKeysFor({ active: { kind: 'AREA_SET', areaKeys: [KEY_A, KEY_B] }, previous: null });
    expect([...both].sort()).toEqual([KEY_A, KEY_B].sort());
  });
});

// ─── #2858 batch 1 (Lane C of #2750) — preview-source marker scope through the REAL controller ───
// Lower-level replacement for the retired preview marker-scope E2E (#2205). The controller is mounted inside a
// preview DiscoverDataSourceProvider, so the REAL resolveDiscoverMarkerScope preview branch and the REAL
// useDiscoverFilteredMarkers preview path builder run; only api.get (the HTTP boundary) is stubbed.
describe('useDiscoverMapDataController — preview source marker scope (#2858/#2205)', () => {
  const PREVIEW_MARKERS_PATH = '/api/admin/city-launch/cities/7/revisions/42/preview/markers';
  const GROUP_KEYS = ['IN|KA|Udupi|Malpe', 'IN|KA|Udupi|Ullal', 'IN|KA|Udupi|Kaup'];

  function makePreviewControllerWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(DiscoverDataSourceProvider, {
          value: { mode: 'preview', cityId: 7, revisionId: 42, citySlug: 'udupi' },
          children,
        }),
      );
  }

  function servePreviewMocks() {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/preview/markers')) return Promise.resolve(MARKERS_RESPONSE);
      if (url.includes('/listings')) return Promise.resolve({ city: 'udupi', limitPerArea: 5, areas: [] });
      return Promise.resolve(AREAS_RESPONSE);
    });
  }

  function findPreviewMarkersCall() {
    return mockApiGet.mock.calls.find(([url]: [string]) => url.startsWith(PREVIEW_MARKERS_PATH));
  }

  it('preview source + resolved AREA node: the marker request path is .../preview/markers?node=<key> only — no areaKeys (#2858/#2205)', async () => {
    servePreviewMocks();
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          // A legacy group scope is ALSO present, so "no areaKeys" proves node-over-group precedence in preview.
          groupAreaKeysForMapData: GROUP_KEYS,
          nav: makeNav({ journey: 'area-first', rawNodeParam: 'n:area-1', node: 'n:area-1' }),
          effectiveSelectedArea: EFFECTIVE_SELECTED_AREA,
          areasNavigationJourney: makeAreasNavigationJourney({ node: AREA_LEAF }),
        }),
      { wrapper: makePreviewControllerWrapper() },
    );

    await waitFor(() => {
      expect(findPreviewMarkersCall()).toBeDefined();
    });

    const [path] = findPreviewMarkersCall() as [string, unknown];
    // Preview's /markers contract uses node=, not the live nodeKey=.
    expect(path).toBe(`${PREVIEW_MARKERS_PATH}?node=n%3Aarea-1`);
    const params = new URLSearchParams(path.split('?')[1]);
    expect(params.has('nodeKey')).toBe(false);
    expect(params.getAll('areaKeys')).toEqual([]);
    // Never the live endpoint while a preview source is active.
    expect(mockApiGet.mock.calls.some(([url]: [string]) => url.includes('/api/discover/markers'))).toBe(false);
  });

  it("preview source + legacy group members and no node: the marker request carries exactly the group's areaKeys and no node= (#2858/#2205)", async () => {
    servePreviewMocks();
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          groupAreaKeysForMapData: GROUP_KEYS,
          nav: makeNav({ journey: 'area-first', rawNodeParam: null, node: null }),
          effectiveSelectedArea: EFFECTIVE_SELECTED_AREA,
          areasNavigationJourney: makeAreasNavigationJourney({ node: null }),
        }),
      { wrapper: makePreviewControllerWrapper() },
    );

    await waitFor(() => {
      expect(findPreviewMarkersCall()).toBeDefined();
    });

    const [path] = findPreviewMarkersCall() as [string, unknown];
    const params = new URLSearchParams(path.split('?')[1]);
    // The request canonicalises (sorts) the key order, so compare as a set — exactly the 3 members, nothing more.
    expect([...params.getAll('areaKeys')].sort()).toEqual([...GROUP_KEYS].sort());
    expect(params.has('node')).toBe(false);
    expect(params.has('nodeKey')).toBe(false);
  });
});

// ─── #2858 batch 2 (Lane C of #2750) — 2204 flow 4: group-focus marker fetch vs the area-layer zoom band ───
// Lower-level replacement for the zoom-band half of issue-2204-canonical-node-browser-proof (flow 4): a journeyless-style
// `groupId=` focus (area-first + groupId, no areaKey, no node) issues NO markers request at/below AREA_LAYER_MAX_ZOOM (12)
// and, once past it, ONE request scoped to exactly the group's member areaKeys (the same set the panel shows).
// The REAL resolveDiscoverMarkerScope + REAL useDiscoverFilteredMarkers run; only api.get (the HTTP boundary) is stubbed.
// B2-N4 (zero calls) is vacuous on its own, so B2-N5 is its paired positive arm: same nav, same params, only mapZoom varies.
describe('useDiscoverMapDataController — 2204-F4 group-focus marker fetch vs the zoom band (#2858 batch 2)', () => {
  const GROUP_KEYS = ['IN|KA|Bengaluru|Hebbal', 'IN|KA|Bengaluru|Jakkur', 'IN|KA|Bengaluru|Yelahanka'];
  const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
  function markersUrls(): string[] {
    return mockApiGet.mock.calls
      .map(([url]: [string]) => url)
      .filter((url: string) => url.includes('/api/discover/markers'));
  }
  function renderGroupFocus(mapZoom: number) {
    return renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          mapZoom,
          groupAreaKeysForMapData: GROUP_KEYS,
          nav: makeNav({ journey: 'area-first', groupId: 'south-premium', areaKey: null }),
          effectiveSelectedArea: null,
          areasNavigationJourney: makeAreasNavigationJourney(),
        }),
      { wrapper: makeWrapper() },
    );
  }

  it('2204-F4 group focus below the area-layer zoom band: area-first + groupId + authed at mapZoom 12 issues ZERO markers calls (only the zoom term varied)', async () => {
    renderGroupFocus(12);
    await settle();
    expect(markersUrls()).toEqual([]);
    // The hook did run (it queried the areas list through the same mocked api.get): not a never-mounted false green.
    expect(mockApiGet.mock.calls.length).toBeGreaterThan(0);
  });

  it("2204-F4 group focus past the zoom band: exactly one markers call at mapZoom 14, carrying exactly the group's 3 areaKeys and no nodeKey", async () => {
    renderGroupFocus(14);
    await waitFor(() => {
      expect(markersUrls()).toHaveLength(1);
    });
    await settle();
    expect(markersUrls()).toHaveLength(1);
    const params = new URLSearchParams(markersUrls()[0].split('?')[1]);
    expect(new Set(params.getAll('areaKeys'))).toEqual(new Set(GROUP_KEYS));
    expect(params.getAll('areaKeys')).toHaveLength(GROUP_KEYS.length);
    expect(params.get('nodeKey')).toBeNull();
  });
});
