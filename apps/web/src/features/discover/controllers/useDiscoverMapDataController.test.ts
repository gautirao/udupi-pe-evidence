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
});
