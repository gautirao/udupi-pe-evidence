/**
 * #2859 B7 (issue 285907) WEB slice B2 — discover-city-listings-empty-city-guard-2189, assertion 2189-5.
 *
 * 2189-5 is "the page's URL city reaches useDiscoverCityListings and the OUTBOUND request is a well-formed
 * /api/discover/cities/<city>/listings, never /api/discover/cities//listings". The existing hook test mocks
 * @/lib/api (argument coverage only). This file mounts the REAL MapDiscovery + DiscoverProvider with the REAL
 * useDiscoverCityListings and the REAL lib/api; the only boundary stubbed is global fetch (R_wire), and every
 * request URL the page makes is read from the captured fetch calls.
 *
 * Arm A (positive control): ?city=bangalore&node=<AREA leaf> -> a captured GET .../cities/bangalore/listings.
 * Arm B (same it, remount): no city in the URL. The page does NOT pass a raw '' to the hook: the composition
 * (useDiscoverPageComposition.ts:164/337) defaults city to DEFAULT_CITY (bangalore), so the request that fires is the
 * well-formed .../cities/bangalore/listings. Arm B is therefore a TRIPWIRE for the "areaKeys resolve before city"
 * shape (it detects a page that stops defaulting), NOT proof the hook's Boolean(city) guard is reachable from the page.
 * In BOTH arms no request URL matches /cities\/\/listings/ across the whole mount.
 *
 * Data boundary (named, not claimed): what the server returns is a stub. 2189-3 (cards >= 1) is NOT claimed here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));
vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: () => <div data-testid="property-map-mock" />,
}));
vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const AREA_KEY = 'IN|KA|Bangalore|Domlur';
vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: {
      city: 'bangalore',
      areas: [{
        areaKey: 'IN|KA|Bangalore|Domlur', areaLabel: 'Domlur', name: 'Domlur',
        geo_center_lat: 12.96, geo_center_lon: 77.64, geoCenterLat: 12.96, geoCenterLon: 77.64,
        minLat: 12.95, minLon: 77.63, maxLat: 12.97, maxLon: 77.65,
        bbox: [[12.95, 77.63], [12.97, 77.65]], listingCount: 3, schoolCount: 0, trendDirection: 'stable',
      }],
    },
    isLoading: false,
  })),
}));
vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: vi.fn(() => ({ data: undefined, isLoading: false, isFetching: false, error: null })),
}));
vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: vi.fn(() => ({ data: undefined, isLoading: false, isFetching: false })),
}));
vi.mock('@/hooks/useTrendsOptions', () => ({ useTrendsOptions: vi.fn(() => ({ data: undefined })) }));
vi.mock('@/hooks/useListingSearch', () => ({
  useListingSearch: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
}));
vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: undefined })),
  useSchoolById: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
}));
vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: vi.fn(() => ({
    data: undefined, isLoading: false, isError: false, error: null,
    fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
  })),
}));
vi.mock('@/hooks/useAreaGroups', () => ({ useAreaGroups: vi.fn(() => ({ data: undefined, isLoading: false })) }));
vi.mock('react-leaflet', () => ({
  MapContainer: () => null, TileLayer: () => null, Marker: () => null, Popup: () => null,
  useMap: () => ({ flyTo: vi.fn(), invalidateSize: vi.fn(), fitBounds: vi.fn() }),
  useMapEvents: () => null, Circle: () => null, Polygon: () => null, ZoomControl: () => null,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  },
}));

const NODE_KEY = 'a:IN|KA|Bangalore|Domlur';
const wireLeaf = {
  nodeKey: NODE_KEY, nodeType: 'AREA', displayLabel: 'Domlur', depth: 3, regionKey: 'r:central',
  ancestry: [{ nodeKey: 'd:central', nodeType: 'DIRECTION', displayLabel: 'Central', displayOrder: 1 }],
  nextLevelType: 'LISTINGS', children: [] as unknown[], revisionId: 1,
  bounds: { centreLat: 12.96, centreLon: 77.64, minLat: 12.95, minLon: 77.63, maxLat: 12.97, maxLon: 77.65 },
  descendantAreaKeys: null, areaKey: AREA_KEY,
};
const wireRoot = {
  nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', depth: 0, regionKey: null, ancestry: [],
  nextLevelType: 'DIRECTION', children: [] as unknown[], revisionId: 1, bounds: null, descendantAreaKeys: null, areaKey: null,
};
const fetchCalls: string[] = [];
const realFetch = globalThis.fetch;
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
const listingRequests = () => fetchCalls.filter((u) => /\/listings\?/.test(u) && /\/api\/discover\/cities\//.test(u));
const emptyCityRequests = () => fetchCalls.filter((u) => /\/cities\/\/listings/.test(u));

function mountAt(url: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('#2859 B7 2189-5 — page URL city -> real useDiscoverCityListings -> outbound request (real lib/api, fetch stub)', () => {
  beforeEach(() => {
    fetchCalls.length = 0;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.includes('/navigation/resolve')) {
        const node = new URL(url).searchParams.get('node');
        return jsonResponse(200, { requested: node, resolution: 'EXACT', node: node === NODE_KEY ? wireLeaf : wireRoot, revisionId: 1 });
      }
      if (/\/cities\/[^/]+\/listings/.test(url)) {
        return jsonResponse(200, { city: 'bangalore', limitPerArea: 50, areas: [{ areaKey: AREA_KEY, areaName: 'Domlur', listings: [] }] });
      }
      return jsonResponse(404, { message: 'not stubbed' });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('arm A: ?city=bangalore&node=<leaf> sends GET /api/discover/cities/bangalore/listings and never /cities//listings; arm B (no city) also never sends /cities//listings', async () => {
    // ---------------- ARM A (positive control) ----------------
    const a = mountAt(`/discover?city=bangalore&node=${encodeURIComponent(NODE_KEY)}`);
    await waitFor(() => {
      expect(listingRequests().length).toBeGreaterThan(0);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    const armA = listingRequests();
    expect(armA.every((u) => new URL(u).pathname === '/api/discover/cities/bangalore/listings')).toBe(true);
    expect(armA.some((u) => new URL(u).searchParams.getAll('areaKeys').includes(AREA_KEY))).toBe(true);
    expect(emptyCityRequests()).toEqual([]);
    a.unmount();

    // ---------------- ARM B (same it, remount): empty city in the URL ----------------
    fetchCalls.length = 0;
    const b = mountAt(`/discover?areaKey=${encodeURIComponent(AREA_KEY)}`);
    // wait on the positive itself (no fixed sleep before it), then let the negatives settle as arm A does
    await waitFor(() => {
      expect(listingRequests().length).toBeGreaterThan(0);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    // the probe is live: the page did reach the network (navigation resolve) in this arm too
    expect(fetchCalls.some((u) => u.includes('/navigation/resolve'))).toBe(true);
    // with the city absent the page DEFAULTS it (DEFAULT_CITY), so the hook still gets a non-empty city and the
    // request that fires is the well-formed one (observed at base: /api/discover/cities/bangalore/listings).
    expect(listingRequests().length).toBeGreaterThan(0);
    expect(listingRequests().every((u) => new URL(u).pathname === '/api/discover/cities/bangalore/listings')).toBe(true);
    expect(emptyCityRequests()).toEqual([]);
    expect(fetchCalls.filter((u) => u.includes('/cities//'))).toEqual([]);
    b.unmount();
  });
});
