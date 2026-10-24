/**
 * #2859 B6 (handoff 285906) AC9(a) — L120 S2-2 + the purpose halves of S2-7 / S2-16 on the CAPTURED
 * outbound request (R_wire): for a single-area canonical leaf, the request that the map-data chain
 * sends to /api/discover/cities/{city}/listings carries exactly one areaKeys (the LEAF) and
 * listingPurpose=rent for intentListingPurpose 'rent'; the 'sale' control is in the same it.
 *
 * Real: useDiscoverMapDataController -> useDiscoverMapData (activeAreaListingKeys :826-831,
 * useDiscoverCityListings call :859-879, listingPurpose :875) -> useDiscoverCityListings -> lib/api.ts
 * -> global fetch (stubbed). Mocked: supabase.auth.getSession (session source), useTrendsOptions,
 * useSchoolById, useDiscoverShell. Not exercised: the URL `node=` / `intent=` parse and the page's
 * effectiveSelectedArea bridge (RETAIN, AC9(c) / R_page); intent -> intentListingPurpose is the sibling
 * useDiscoverPageContext.intent2859 test.
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

const CITY = 'bangalore';
const LEAF = 'IN|KA|Bengaluru|Basaveshwara Nagar';
const PARENT_LIKE = 'IN|KA|Bengaluru';
const LISTINGS_PATH = `/api/discover/cities/${CITY}/listings`;

const AREA_LEAF = {
  nodeKey: 'a:IN|KA|Bengaluru|Basaveshwara Nagar',
  nodeType: 'AREA',
  displayLabel: 'Basaveshwara Nagar',
  depth: 2,
  regionKey: 'W',
  ancestry: [],
  nextLevelType: 'LISTINGS',
  children: [],
  revisionId: 1,
  bounds: null,
  descendantAreaKeys: null,
  areaKey: LEAF,
} as unknown as NonNullable<UseAreasNavigationJourneyResult['node']>;

const JOURNEY = {
  isLoading: false,
  isError: false,
  error: null,
  node: AREA_LEAF,
  levelKind: 'listings',
  children: [],
  resolutionNotice: null,
  nodeCount: null,
  schoolsNotSimulatedForRevision: false,
  selectNode: vi.fn(),
  refetch: vi.fn(),
  historyAdjacencyLog: [],
} as unknown as UseAreasNavigationJourneyResult;

const NAV = {
  city: CITY,
  journey: 'area-first',
  areaKey: null,
  schoolId: null,
  groupId: null,
  scope: null,
  radiusKm: null,
  selectedLocality: null,
  filters: {},
  rawNodeParam: AREA_LEAF.nodeKey,
  node: AREA_LEAF.nodeKey,
  nodeListings: false,
  intent: 'buy',
  q: '',
  selectedGroup: null,
} as unknown as DiscoverNavContextValue;

const LEAF_AREA = { areaKey: LEAF, areaLabel: 'Basaveshwara Nagar', geo_center_lat: 12.99, geo_center_lon: 77.54, bbox: null };

let captured: URL[] = [];
let fetchSpy: ReturnType<typeof vi.spyOn>;

function routeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input), 'http://x');
  captured.push(url);
  const body =
    url.pathname === LISTINGS_PATH
      ? { city: CITY, limitPerArea: 50, areas: [{ areaKey: LEAF, areaName: 'Basaveshwara Nagar', listings: [] }] }
      : url.pathname === '/api/discover/markers'
        ? { city: CITY, markers: [], truncated: false }
        : url.pathname === '/api/discover/listings'
          ? { content: [], totalElements: 0, totalPages: 0 }
          : url.pathname === '/api/discover/areas'
            ? { city: CITY, areas: [] }
            : {};
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function renderWith(intentListingPurpose: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(
    () =>
      useDiscoverMapDataController({
        nav: NAV,
        city: CITY,
        effectiveSelectedArea: LEAF_AREA,
        legacySelectedArea: null,
        filters: {},
        selectedSchool: null,
        debouncedSearch: '',
        isAuthenticated: false,
        fitTick: 0,
        groupAreaKeysForMapData: undefined,
        areasNavigationJourney: JOURNEY,
        boundedSearchTriggered: false,
        mapZoom: 14,
        mapReady: true,
        page: 0,
        mapBbox: null,
        intentListingPurpose,
        authLoading: false,
        setShowLoader: () => {},
      }),
    { wrapper: ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children) },
  );
}

const listingsRequests = () => captured.filter((u) => u.pathname === LISTINGS_PATH);

beforeEach(() => {
  captured = [];
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: null } });
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(routeFetch as typeof fetch);
});
afterEach(() => {
  fetchSpy.mockRestore();
});

describe('#2859 B6 AC9(a) single-area leaf -> captured city-listings request (REAL lib/api, fetch-stubbed)', () => {
  it("S2-2 + S2-7.purpose / S2-16.purpose (L120): the captured request carries getAll('areaKeys') == [LEAF] and getAll('listingPurpose') == ['rent'] for 'rent'; the 'sale' control in the same it carries ['sale'] and the same single areaKeys", async () => {
    const rent = renderWith('rent');
    await waitFor(() => {
      expect(listingsRequests()).toHaveLength(1);
    });
    expect(listingsRequests()[0].searchParams.getAll('areaKeys')).toEqual([LEAF]);
    expect(listingsRequests()[0].searchParams.getAll('areaKeys')).not.toContain(PARENT_LIKE);
    expect(listingsRequests()[0].searchParams.getAll('listingPurpose')).toEqual(['rent']);
    rent.unmount();

    captured = [];
    renderWith('sale');
    await waitFor(() => {
      expect(listingsRequests()).toHaveLength(1);
    });
    expect(listingsRequests()[0].searchParams.getAll('areaKeys')).toEqual([LEAF]);
    expect(listingsRequests()[0].searchParams.getAll('listingPurpose')).toEqual(['sale']);
  });
});
