/**
 * #2859 B6 (handoff 285906) AC8(b) — L95 1567-7a: the legacy `areaKey=` area selection delivers the
 * response `trustBadge` word UNCHANGED into `areaListings`, for an anonymous AND an authenticated
 * viewer, through the REAL controller + useDiscoverMapData + useDiscoverCityListings + lib/api.ts
 * (global fetch stubbed, only supabase.auth.getSession mocked: R_wire).
 *
 * Legacy shape fed in: nav.areaKey = KEY (no node=), legacySelectedArea = effectiveSelectedArea = the
 * AreaPoint the page derives from `areaKey=` (area.ts:48 reads the raw param; compatibility.ts:20-23
 * documents the node= normaliser as future, so the legacy URL is LIVE). The URL -> page ->
 * legacySelectedArea derivation itself is NOT mounted here (R_page; RETAIN 1567-7.page).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));
vi.mock('@/hooks/useTrendsOptions', () => ({ useTrendsOptions: () => ({ data: undefined }) }));
vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolById: () => ({ data: undefined, isLoading: false, error: null }),
}));
vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverShell: () => ({
    registerAreaSetCameraActions: vi.fn(),
    getAreaSetCameraRestoreRequest: () => null,
    setAreaSetCameraRestoreRequest: vi.fn(),
  }),
}));

import { useDiscoverMapDataController } from '../useDiscoverMapDataController';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

const CITY = 'udupi';
const KEY = 'IN|KA|Udupi|Manipal';
const LEGACY_AREA = { areaKey: KEY, areaLabel: 'Manipal', geo_center_lat: 13.35, geo_center_lon: 74.78, bbox: null };
const LISTINGS_PATH = `/api/discover/cities/${CITY}/listings`;

const RESPONSE = {
  city: CITY,
  limitPerArea: 50,
  areas: [
    {
      areaKey: KEY,
      areaName: 'Manipal',
      listings: [
        { id: 'b6-1567-v', title: 'V home', lat: 13.351, lon: 74.781, propertyType: 'house', trustBadge: 'verified' },
        { id: 'b6-1567-t', title: 'T home', lat: 13.352, lon: 74.782, propertyType: 'house', trustBadge: 'trusted' },
        { id: 'b6-1567-l', title: 'L home', lat: 13.353, lon: 74.783, propertyType: 'house', trustBadge: 'listed' },
        { id: 'b6-1567-n', title: 'N home', lat: 13.354, lon: 74.784, propertyType: 'house', trustBadge: null },
      ],
    },
  ],
};
const EXPECTED_WORDS = {
  'b6-1567-v': 'verified',
  'b6-1567-t': 'trusted',
  'b6-1567-l': 'listed',
  'b6-1567-n': null,
};

type Captured = { url: URL; headers: Record<string, string> };
let captured: Captured[] = [];
let fetchSpy: ReturnType<typeof vi.spyOn>;

function routeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input), 'http://x');
  const headers = Object.fromEntries(
    Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
  );
  captured.push({ url, headers });
  const body =
    url.pathname === LISTINGS_PATH
      ? RESPONSE
      : url.pathname === '/api/discover/markers'
        ? { city: CITY, markers: [], truncated: false }
        : url.pathname === '/api/discover/listings'
          ? { content: [], totalElements: 0, totalPages: 0 }
          : url.pathname === '/api/discover/areas'
            ? { city: CITY, areas: [] }
            : {};
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function makeNav(): DiscoverNavContextValue {
  return {
    city: CITY,
    journey: 'area-first',
    areaKey: KEY,
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
  } as unknown as DiscoverNavContextValue;
}

const JOURNEY = {
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
} as unknown as UseAreasNavigationJourneyResult;

function renderFor(isAuthenticated: boolean) {
  mockGetSession.mockResolvedValue({
    data: { session: isAuthenticated ? { access_token: 'b6-1567-token' } : null },
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(
    () =>
      useDiscoverMapDataController({
        nav: makeNav(),
        city: CITY,
        effectiveSelectedArea: LEGACY_AREA,
        legacySelectedArea: LEGACY_AREA,
        filters: {},
        selectedSchool: null,
        debouncedSearch: '',
        isAuthenticated,
        fitTick: 0,
        groupAreaKeysForMapData: undefined,
        areasNavigationJourney: JOURNEY,
        boundedSearchTriggered: false,
        mapZoom: 14,
        mapReady: true,
        page: 0,
        mapBbox: null,
        intentListingPurpose: 'sale',
        authLoading: false,
        setShowLoader: () => {},
      }),
    { wrapper: ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children) },
  );
}

const listingsRequests = () => captured.filter((c) => c.url.pathname === LISTINGS_PATH);

beforeEach(() => {
  captured = [];
  mockGetSession.mockReset();
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(routeFetch as typeof fetch);
});
afterEach(() => {
  fetchSpy.mockRestore();
});

describe('#2859 B6 AC8(b) legacy areaKey= selection -> areaListings trustBadge (REAL lib/api, fetch-stubbed)', () => {
  it('1567-7a (L95): the response trustBadge word reaches areaListings unchanged for the anonymous AND the authenticated viewer (null stays null); anon request has no Authorization, authed carries Bearer', async () => {
    // ANON viewer
    const anon = renderFor(false);
    await waitFor(() => {
      expect(anon.result.current.areaListings).toHaveLength(4);
    });
    expect(Object.fromEntries(anon.result.current.areaListings.map((l) => [l.id, l.trustBadge ?? null]))).toEqual(
      EXPECTED_WORDS,
    );
    expect(listingsRequests()).toHaveLength(1);
    expect(listingsRequests()[0].url.searchParams.getAll('areaKeys')).toEqual([KEY]);
    expect(listingsRequests()[0].headers['authorization']).toBeUndefined();
    // the raw grade never appears on what the client keeps
    expect(JSON.stringify(anon.result.current.areaListings)).not.toMatch(/trustTier/);
    anon.unmount();

    // AUTHED viewer (only the session + isAuthenticated varied)
    captured = [];
    const authed = renderFor(true);
    await waitFor(() => {
      expect(authed.result.current.areaListings).toHaveLength(4);
    });
    expect(Object.fromEntries(authed.result.current.areaListings.map((l) => [l.id, l.trustBadge ?? null]))).toEqual(
      EXPECTED_WORDS,
    );
    expect(listingsRequests()).toHaveLength(1);
    expect(listingsRequests()[0].url.searchParams.getAll('areaKeys')).toEqual([KEY]);
    expect(listingsRequests()[0].headers['authorization']).toBe('Bearer b6-1567-token');
  });
});
