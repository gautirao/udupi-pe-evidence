/**
 * Issue #2857 (FU-LOWER-A) — L217 replacement (`e2e/verify-agri-clusters-1372.spec.ts` AC7).
 *
 * Proves `useDiscoverMapDataController` (`useDiscoverMapDataController.ts:260-280`):
 *   - AC7 (G1-N14): in `area-first` at a non-top-grouped level (`areaKey` / `effectiveSelectedArea`
 *     selected) with an authenticated user at `mapZoom > 12` (`MARKER_ZOOM_THRESHOLD = 12`),
 *     `GET /api/discover/markers` fires with `city=udupi`, paired in the same `it` with negative
 *     controls for anonymous (`isAuthenticated: false`), low zoom (`mapZoom: 10 <= 12`), and
 *     top-grouped level (`areaKey: null`, `effectiveSelectedArea: null`).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockDiscoverListings = vi.hoisted(() => vi.fn());
const mockTrendsOptions = vi.hoisted(() => vi.fn());
const mockSchoolRadiusListings = vi.hoisted(() => vi.fn());
const mockSchoolById = vi.hoisted(() => vi.fn());
const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
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
    registerAreaSetCameraActions: vi.fn(),
    getAreaSetCameraRestoreRequest: () => null,
    setAreaSetCameraRestoreRequest: vi.fn(),
  }),
}));

import {
  useDiscoverMapDataController,
  type UseDiscoverMapDataControllerParams,
} from '../useDiscoverMapDataController';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

const MANIPAL_AREA: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  lat: 13.3525,
  lon: 74.7868,
  listingCount: 5,
  medianPricePerSqft: 5200,
};

function makeNav(overrides: Partial<DiscoverNavContextValue> = {}): DiscoverNavContextValue {
  return {
    city: 'udupi',
    journey: 'area-first',
    areaKey: 'IN|KA|Udupi|Manipal',
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

function makeParams(
  overrides: Partial<UseDiscoverMapDataControllerParams> = {},
): UseDiscoverMapDataControllerParams {
  return {
    nav: makeNav(),
    city: 'udupi',
    effectiveSelectedArea: MANIPAL_AREA,
    legacySelectedArea: MANIPAL_AREA,
    filters: {},
    selectedSchool: null,
    debouncedSearch: '',
    isAuthenticated: true,
    fitTick: 0,
    groupAreaKeysForMapData: undefined,
    areasNavigationJourney: makeAreasNavigationJourney(),
    boundedSearchTriggered: false,
    mapZoom: 14,
    mapReady: true,
    page: 0,
    mapBbox: null,
    intentListingPurpose: 'sale',
    authLoading: false,
    setShowLoader: vi.fn(),
    ...overrides,
  };
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function markersCalls() {
  return mockApiGet.mock.calls.filter(
    ([url]: [string]) => typeof url === 'string' && url.includes('/api/discover/markers'),
  );
}

describe('useDiscoverMapDataController — #2857 L217 AC7 area-first authed markers at zoom > 12', () => {
  beforeEach(() => {
    mockDiscoverListings.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, error: null });
    mockTrendsOptions.mockReturnValue({ data: undefined });
    mockSchoolRadiusListings.mockReturnValue({ data: undefined, isLoading: false });
    mockSchoolById.mockReturnValue({ data: undefined, isLoading: false, error: null });
    mockApiGet.mockReset();
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/api/discover/markers')) {
        return Promise.resolve({
          city: 'udupi',
          markers: [{ id: 'marker-1', latitude: 13.3525, longitude: 74.7868, price: 6500000 }],
        });
      }
      if (url.includes('/listings')) {
        return Promise.resolve({ city: 'udupi', limitPerArea: 5, areas: [] });
      }
      return Promise.resolve({ city: 'udupi', areas: [] });
    });
  });

  it('AC7 (G1-N14): fires GET /api/discover/markers in area-first when authenticated at zoom > 12, and suppresses it for anon, zoom <= 12, or top-grouped level', async () => {
    // Negative control 1: anonymous user at zoom 14 in area-first -> 0 marker calls
    renderHook(
      () =>
        useDiscoverMapDataController(
          makeParams({
            isAuthenticated: false,
            mapZoom: 14,
          }),
        ),
      { wrapper: makeWrapper() },
    );
    expect(markersCalls()).toHaveLength(0);

    // Negative control 2: authenticated user at zoom 10 (<= AREA_LAYER_MAX_ZOOM 12) -> 0 marker calls
    renderHook(
      () =>
        useDiscoverMapDataController(
          makeParams({
            isAuthenticated: true,
            mapZoom: 10,
          }),
        ),
      { wrapper: makeWrapper() },
    );
    expect(markersCalls()).toHaveLength(0);

    // Negative control 3: authenticated user at zoom 14 but top-grouped level -> 0 marker calls
    renderHook(
      () =>
        useDiscoverMapDataController(
          makeParams({
            isAuthenticated: true,
            mapZoom: 14,
            effectiveSelectedArea: null,
            legacySelectedArea: null,
            nav: makeNav({ areaKey: null }),
          }),
        ),
      { wrapper: makeWrapper() },
    );
    expect(markersCalls()).toHaveLength(0);

    // Positive AC7 assertion: authenticated user in area-first with effectiveSelectedArea at zoom 14 (> 12)
    renderHook(
      () =>
        useDiscoverMapDataController(
          makeParams({
            isAuthenticated: true,
            mapZoom: 14,
            effectiveSelectedArea: MANIPAL_AREA,
            legacySelectedArea: MANIPAL_AREA,
            nav: makeNav({ journey: 'area-first', areaKey: 'IN|KA|Udupi|Manipal' }),
          }),
        ),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(markersCalls().length).toBeGreaterThanOrEqual(1);
    });
    const [markerUrl] = markersCalls()[0];
    expect(markerUrl).toContain('/api/discover/markers?');
    expect(markerUrl).toContain('city=udupi');
  });
});
