/**
 * Issue #2809 (Q13 from #2807) — Area-first leaf must scope GET /api/discover/listings
 * with the selected areaKeys / resolved nodeKey (and never fire unscoped while resolving).
 *
 * Keeps useDiscoverMapDataController, useDiscoverMapData, useDiscoverListings,
 * useDiscoverFilteredMarkers, useDiscoverCityListings, and buildDiscoverSearchParams REAL,
 * mocking only api.get at the network boundary so exact wire URLs are inspected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockTrendsOptions = vi.hoisted(() => vi.fn());
const mockSchoolRadiusListings = vi.hoisted(() => vi.fn());
const mockSchoolById = vi.hoisted(() => vi.fn());
const mockApiGet = vi.hoisted(() => vi.fn());
const mockRegisterAreaSetCameraActions = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {},
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
    getAreaSetCameraRestoreRequest: () => null,
    setAreaSetCameraRestoreRequest: vi.fn(),
  }),
}));

import { useDiscoverMapDataController } from './useDiscoverMapDataController';
import { useDiscoverMapData } from '@/hooks/useDiscoverMapData';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function makeNav(overrides: Partial<DiscoverNavContextValue> = {}): DiscoverNavContextValue {
  return {
    city: 'udupi',
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
    intent: 'rent',
    q: '',
    selectedGroup: null,
    ...overrides,
  } as DiscoverNavContextValue;
}

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

const MANIPAL_AREA_LEAF: NonNullable<UseAreasNavigationJourneyResult['node']> = {
  nodeKey: 'a:IN|KA|Udupi|Manipal',
  nodeType: 'AREA',
  displayLabel: 'Manipal',
  depth: 2,
  regionKey: 'CENTRAL',
  ancestry: [],
  nextLevelType: 'LISTINGS',
  children: [],
  revisionId: 1,
  bounds: null,
  descendantAreaKeys: null,
  areaKey: 'IN|KA|Udupi|Manipal',
};

const MANIPAL_SELECTED_AREA = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.3525,
  geo_center_lon: 74.7928,
  bbox: null,
};

const BASE_CONTROLLER_PARAMS = {
  city: 'udupi',
  legacySelectedArea: null,
  filters: {
    propertyTypes: ['commercial'],
    commercialSubtypes: ['SHOP'],
  },
  selectedSchool: null,
  debouncedSearch: '',
  isAuthenticated: true,
  fitTick: 0,
  groupAreaKeysForMapData: undefined,
  boundedSearchTriggered: false,
  mapZoom: 14,
  mapReady: true,
  page: 0,
  mapBbox: null,
  intentListingPurpose: 'rent' as const,
  authLoading: false,
  setShowLoader: vi.fn(),
};

function findListingsCall() {
  return mockApiGet.mock.calls.find(([url]: [string]) => url.startsWith('/api/discover/listings?'));
}

function findMarkersCall() {
  return mockApiGet.mock.calls.find(([url]: [string]) => url.startsWith('/api/discover/markers?'));
}

function findPanelCall() {
  return mockApiGet.mock.calls.find(
    ([url]: [string]) => url.includes('/discover/cities/') && url.includes('/listings') && !url.includes('/markers'),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTrendsOptions.mockReturnValue({ data: undefined });
  mockSchoolRadiusListings.mockReturnValue({ data: undefined, isLoading: false });
  mockSchoolById.mockReturnValue({ data: undefined, isLoading: false, error: null });
  mockApiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/discover/listings?')) {
      return Promise.resolve({
        content: [],
        page: 0,
        size: 50,
        totalElements: 2,
        totalPages: 1,
      });
    }
    if (url.startsWith('/api/discover/markers?')) {
      return Promise.resolve({ city: 'udupi', markers: [] });
    }
    if (url.includes('/discover/cities/') && url.includes('/listings')) {
      return Promise.resolve({ city: 'udupi', limitPerArea: 5, areas: [] });
    }
    return Promise.resolve({ city: 'udupi', areas: [] });
  });
});

describe('Issue #2809 — Area-first leaf scopes GET /api/discover/listings', () => {
  it('T1: committed single-area AREA_SET at Manipal leaf sends areaKeys=IN|KA|Udupi|Manipal on GET /api/discover/listings matching scopeFingerprint and panel', async () => {
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          nav: makeNav({
            city: 'udupi',
            journey: 'area-first',
            rawNodeParam: 'a:IN|KA|Udupi|Manipal',
            node: 'a:IN|KA|Udupi|Manipal',
            intent: 'rent',
            resultScope: {
              active: { kind: 'AREA_SET', areaKeys: ['IN|KA|Udupi|Manipal'] },
              previous: null,
            },
          }),
          effectiveSelectedArea: MANIPAL_SELECTED_AREA,
          areasNavigationJourney: makeAreasNavigationJourney({ node: MANIPAL_AREA_LEAF }),
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(findListingsCall()).toBeDefined();
      expect(findMarkersCall()).toBeDefined();
      expect(findPanelCall()).toBeDefined();
    });

    const [listingsUrl] = findListingsCall() as [string];
    const listingsParams = new URLSearchParams(listingsUrl.split('?')[1]);

    expect(listingsParams.get('city')).toBe('udupi');
    expect(listingsParams.get('listingPurpose')).toBe('rent');
    expect(listingsParams.getAll('propertyTypes')).toEqual(['commercial']);
    expect(listingsParams.getAll('commercialSubtypes')).toEqual(['SHOP']);

    const fp = JSON.parse(listingsParams.get('scopeFingerprint') ?? '{}');
    expect(fp.scope).toEqual({ kind: 'AREA_SET', areaKeys: ['IN|KA|Udupi|Manipal'] });

    // Server-enforced geographic scope MUST be on the actual wire request:
    expect(listingsParams.getAll('areaKeys')).toEqual(['IN|KA|Udupi|Manipal']);
    expect(listingsParams.get('nodeKey')).toBeNull();

    // Parity with panel and markers requests:
    const [panelUrl] = findPanelCall() as [string];
    const panelParams = new URLSearchParams(panelUrl.split('?')[1]);
    expect(panelParams.getAll('areaKeys')).toEqual(['IN|KA|Udupi|Manipal']);

    const [markersUrl] = findMarkersCall() as [string];
    const markersParams = new URLSearchParams(markersUrl.split('?')[1]);
    expect(markersParams.get('nodeKey')).toBe('a:IN|KA|Udupi|Manipal');
  });

  it('T2: resolved canonical Area-first leaf on initial render tick (before resultScope effect commits) sends nodeKey=a:IN|KA|Udupi|Manipal instead of firing unscoped', async () => {
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          nav: makeNav({
            city: 'udupi',
            journey: 'area-first',
            rawNodeParam: 'a:IN|KA|Udupi|Manipal',
            node: 'a:IN|KA|Udupi|Manipal',
            intent: 'rent',
          }),
          effectiveSelectedArea: MANIPAL_SELECTED_AREA,
          areasNavigationJourney: makeAreasNavigationJourney({ node: MANIPAL_AREA_LEAF }),
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(findListingsCall()).toBeDefined();
    });

    const [listingsUrl] = findListingsCall() as [string];
    const listingsParams = new URLSearchParams(listingsUrl.split('?')[1]);

    expect(listingsParams.get('nodeKey')).toBe('a:IN|KA|Udupi|Manipal');
    expect(listingsParams.getAll('areaKeys')).toEqual([]);
  });

  it('T3: while canonical node is resolving (scope.kind === "unresolved"), GET /api/discover/listings never fires an unscoped city request', async () => {
    // Part A: via controller while node is resolving
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          nav: makeNav({
            city: 'udupi',
            journey: 'area-first',
            rawNodeParam: 'a:IN|KA|Udupi|Manipal',
            node: 'a:IN|KA|Udupi|Manipal',
          }),
          effectiveSelectedArea: null,
          areasNavigationJourney: makeAreasNavigationJourney({ node: null, isLoading: true }),
        }),
      { wrapper: makeWrapper() },
    );

    // Part B: direct useDiscoverMapData call with listingsEnabled=true but scope.kind === 'unresolved'
    renderHook(
      () =>
        useDiscoverMapData({
          city: 'udupi',
          selectedArea: null,
          filters: { propertyTypes: ['commercial'], commercialSubtypes: ['SHOP'] },
          debouncedSearch: '',
          urlSchoolId: null,
          isAuthenticated: true,
          fitTick: 0,
          markersEnabled: true,
          listingsEnabled: true,
          page: 0,
          bbox: null,
          journey: 'area-first',
          listingPurpose: 'rent',
          scope: { kind: 'unresolved', reason: 'node-resolving' },
          resultScope: null,
        }),
      { wrapper: makeWrapper() },
    );

    expect(findListingsCall()).toBeUndefined();
    expect(findMarkersCall()).toBeUndefined();
    expect(findPanelCall()).toBeUndefined();
  });

  it('T4: committed multi-area AREA_SET sends all areaKeys on GET /api/discover/listings', async () => {
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          nav: makeNav({
            city: 'udupi',
            journey: 'area-first',
            rawNodeParam: 'a:IN|KA|Udupi|Manipal',
            node: 'a:IN|KA|Udupi|Manipal',
            resultScope: {
              active: {
                kind: 'AREA_SET',
                areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Kunjibettu'],
              },
              previous: null,
            },
          }),
          effectiveSelectedArea: MANIPAL_SELECTED_AREA,
          areasNavigationJourney: makeAreasNavigationJourney({ node: MANIPAL_AREA_LEAF }),
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(findListingsCall()).toBeDefined();
    });

    const [listingsUrl] = findListingsCall() as [string];
    const listingsParams = new URLSearchParams(listingsUrl.split('?')[1]);

    expect([...listingsParams.getAll('areaKeys')].sort()).toEqual(
      ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Kunjibettu'].sort(),
    );
    expect(listingsParams.get('nodeKey')).toBeNull();
  });

  it('T5: legacy areaKey selection without canonical node sends areaKeys=[selectedArea.areaKey] on GET /api/discover/listings', async () => {
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          legacySelectedArea: MANIPAL_SELECTED_AREA,
          effectiveSelectedArea: MANIPAL_SELECTED_AREA,
          nav: makeNav({
            city: 'udupi',
            journey: 'area-first',
            areaKey: 'IN|KA|Udupi|Manipal',
          }),
          areasNavigationJourney: makeAreasNavigationJourney({ node: null }),
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(findListingsCall()).toBeDefined();
    });

    const [listingsUrl] = findListingsCall() as [string];
    const listingsParams = new URLSearchParams(listingsUrl.split('?')[1]);

    expect(listingsParams.getAll('areaKeys')).toEqual(['IN|KA|Udupi|Manipal']);
    expect(listingsParams.get('nodeKey')).toBeNull();
  });

  it('T6: candidate scope exclusivity — POLYGON and VIEWPORT omit areaKeys and nodeKey on GET /api/discover/listings even when an area leaf is selected', async () => {
    const polygonRing: [number, number][] = [
      [74.78, 13.34],
      [74.8, 13.34],
      [74.8, 13.36],
      [74.78, 13.34],
    ];

    const { unmount } = renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          filters: {
            ...BASE_CONTROLLER_PARAMS.filters,
            polygon: JSON.stringify(polygonRing),
          },
          nav: makeNav({
            city: 'udupi',
            journey: 'area-first',
            rawNodeParam: 'a:IN|KA|Udupi|Manipal',
            node: 'a:IN|KA|Udupi|Manipal',
            resultScope: {
              active: { kind: 'POLYGON', points: polygonRing },
              previous: null,
            },
          }),
          effectiveSelectedArea: MANIPAL_SELECTED_AREA,
          areasNavigationJourney: makeAreasNavigationJourney({ node: MANIPAL_AREA_LEAF }),
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(findListingsCall()).toBeDefined();
    });

    const [polygonListingsUrl] = findListingsCall() as [string];
    const polygonParams = new URLSearchParams(polygonListingsUrl.split('?')[1]);
    expect(polygonParams.get('polygon')).toBeTruthy();
    expect(polygonParams.getAll('areaKeys')).toEqual([]);
    expect(polygonParams.get('nodeKey')).toBeNull();

    unmount();
    vi.clearAllMocks();

    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          mapBbox: [13.34, 74.78, 13.36, 74.8],
          nav: makeNav({
            city: 'udupi',
            journey: 'area-first',
            rawNodeParam: 'a:IN|KA|Udupi|Manipal',
            node: 'a:IN|KA|Udupi|Manipal',
            resultScope: {
              active: { kind: 'VIEWPORT', bounds: { s: 13.34, w: 74.78, n: 13.36, e: 74.8 } },
              previous: null,
            },
          }),
          effectiveSelectedArea: MANIPAL_SELECTED_AREA,
          areasNavigationJourney: makeAreasNavigationJourney({ node: MANIPAL_AREA_LEAF }),
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(findListingsCall()).toBeDefined();
    });

    const [viewportListingsUrl] = findListingsCall() as [string];
    const viewportParams = new URLSearchParams(viewportListingsUrl.split('?')[1]);
    expect(viewportParams.get('viewportScope')).toBe('13.34,74.78,13.36,74.8');
    expect(viewportParams.getAll('areaKeys')).toEqual([]);
    expect(viewportParams.get('nodeKey')).toBeNull();
  });

  it('T7: school-first and agri-first journeys do not leak areaKeys/nodeKey onto GET /api/discover/listings', async () => {
    const { unmount } = renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          filters: {
            schoolLat: 13.35,
            schoolLon: 74.79,
            schoolRadiusKm: 3,
          },
          boundedSearchTriggered: true,
          nav: makeNav({
            city: 'udupi',
            journey: 'school-first',
            schoolId: '42',
            areaKey: 'IN|KA|Udupi|Manipal',
          }),
          effectiveSelectedArea: MANIPAL_SELECTED_AREA,
          areasNavigationJourney: makeAreasNavigationJourney({ node: null }),
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(findListingsCall()).toBeDefined();
    });

    const [schoolListingsUrl] = findListingsCall() as [string];
    const schoolParams = new URLSearchParams(schoolListingsUrl.split('?')[1]);
    expect(schoolParams.get('schoolAreaKey')).toBe('IN|KA|Udupi|Manipal');
    expect(schoolParams.getAll('areaKeys')).toEqual([]);
    expect(schoolParams.get('nodeKey')).toBeNull();

    unmount();
    vi.clearAllMocks();

    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          boundedSearchTriggered: true,
          nav: makeNav({
            city: 'udupi',
            journey: 'agri-first',
            selectedLocality: 'Manipal',
            resultScope: {
              active: { kind: 'AREA_SET', areaKeys: ['IN|KA|Udupi|Manipal'] },
              previous: null,
            },
          }),
          effectiveSelectedArea: null,
          areasNavigationJourney: makeAreasNavigationJourney({ node: null }),
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(findListingsCall()).toBeDefined();
    });

    const [agriListingsUrl] = findListingsCall() as [string];
    const agriParams = new URLSearchParams(agriListingsUrl.split('?')[1]);
    expect(agriParams.getAll('areaKeys')).toEqual([]);
    expect(agriParams.get('nodeKey')).toBeNull();
  });

  it('T8: group-scoped browse (scope.kind === "areas") sends groupAreaKeysForMapData on GET /api/discover/listings, and cold-loading group ([]) stays disabled', async () => {
    // Cold-loading group (groupAreaKeysForMapData = []) -> scope.kind === 'unresolved' ('group-cold-load') -> no unscoped request fires
    const { unmount } = renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          groupAreaKeysForMapData: [],
          nav: makeNav({
            city: 'udupi',
            journey: 'area-first',
            groupId: 'udupi-coastal',
          }),
          effectiveSelectedArea: null,
          areasNavigationJourney: makeAreasNavigationJourney({ node: null }),
        }),
      { wrapper: makeWrapper() },
    );

    expect(findListingsCall()).toBeUndefined();
    expect(findMarkersCall()).toBeUndefined();

    unmount();
    vi.clearAllMocks();

    // Resolved group -> sends group's areaKeys on GET /api/discover/listings
    const groupKeys = ['IN|KA|Udupi|Malpe', 'IN|KA|Udupi|Kaup'];
    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          groupAreaKeysForMapData: groupKeys,
          nav: makeNav({
            city: 'udupi',
            journey: 'area-first',
            groupId: 'udupi-coastal',
          }),
          effectiveSelectedArea: null,
          areasNavigationJourney: makeAreasNavigationJourney({ node: null }),
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(findListingsCall()).toBeDefined();
    });

    const [groupListingsUrl] = findListingsCall() as [string];
    const groupParams = new URLSearchParams(groupListingsUrl.split('?')[1]);
    expect([...groupParams.getAll('areaKeys')].sort()).toEqual([...groupKeys].sort());
    expect(groupParams.get('nodeKey')).toBeNull();
  });

  it('T9: transitioning from an Area-first leaf (with committed AREA_SET) into a school search in another area omits residual areaKeys and nodeKey on GET /api/discover/listings', async () => {
    const brahmavarSelectedArea = {
      areaKey: 'IN|KA|Udupi|Brahmavar',
      areaLabel: 'Brahmavar',
      geo_center_lat: 13.4316,
      geo_center_lon: 74.7453,
      bbox: null,
    };

    renderHook(
      () =>
        useDiscoverMapDataController({
          ...BASE_CONTROLLER_PARAMS,
          filters: {
            schoolLat: 13.4316,
            schoolLon: 74.7453,
            schoolRadiusKm: 3,
          },
          boundedSearchTriggered: true,
          // setSchoolJourney sets journey='school-first', schoolId, and areaKey for the
          // school's area while preserving any prior rscope=AREA_SET&rareas=IN|KA|Udupi|Manipal.
          nav: makeNav({
            city: 'udupi',
            journey: 'school-first',
            schoolId: '99',
            areaKey: 'IN|KA|Udupi|Brahmavar',
            resultScope: {
              active: { kind: 'AREA_SET', areaKeys: ['IN|KA|Udupi|Manipal'] },
              previous: null,
            },
          }),
          effectiveSelectedArea: brahmavarSelectedArea,
          areasNavigationJourney: makeAreasNavigationJourney({ node: null }),
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(findListingsCall()).toBeDefined();
      expect(findMarkersCall()).toBeDefined();
    });

    const [listingsUrl] = findListingsCall() as [string];
    const listingsParams = new URLSearchParams(listingsUrl.split('?')[1]);
    expect(listingsParams.get('schoolAreaKey')).toBe('IN|KA|Udupi|Brahmavar');
    expect(listingsParams.getAll('areaKeys')).toEqual([]);
    expect(listingsParams.get('nodeKey')).toBeNull();

    const [markersUrl] = findMarkersCall() as [string];
    const markersParams = new URLSearchParams(markersUrl.split('?')[1]);
    expect(markersParams.get('schoolAreaKey')).toBe('IN|KA|Udupi|Brahmavar');
    expect(markersParams.getAll('areaKeys')).toEqual([]);
    expect(markersParams.get('nodeKey')).toBeNull();
  });
});
