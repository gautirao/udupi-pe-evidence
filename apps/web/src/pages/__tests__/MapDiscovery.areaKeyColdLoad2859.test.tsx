/**
 * #2859 B7 (issue 285907) WEB slice B2 — discover-url-state, assertion url-state-1.
 *
 * url-state-1: "a cold, journey-less ?areaKey= URL shows listing-card(s) and the back-button, keeps areaKey; the
 * back-button drops areaKey". REAL MapDiscovery + DiscoverProvider + REAL useDiscoverUrlState + REAL
 * useDiscoverCityListings + REAL lib/api (global fetch stub). Other data hooks mocked.
 *
 * Product path observed (area.ts:196-248): a journey-less URL (no journey=, no scope=) runs the default-journey
 * probe GET /api/discover/cities/<city>/navigation/resolve?node=root.
 *   - 404 (ApiError, area.ts:229) -> the page REPLACE-writes scope='' (area.ts:237-247) and moves to the legacy
 *     shell, which renders the area panel (listing cards + back-button) for the areaKey. THIS is the claim.
 *   - 200 -> the journey stays 'area-first' (area.ts:250-257); see the 200-arm observation recorded in B2.md.
 * So the claim is narrowed to "a cold journey-less ?areaKey= on a city WITHOUT a navigation hierarchy".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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

const AREA_KEY = 'IN|KA|Udupi|Manipal';
vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: {
      city: 'udupi',
      areas: [{
        areaKey: 'IN|KA|Udupi|Manipal', areaLabel: 'Manipal', name: 'Manipal',
        geo_center_lat: 13.35, geo_center_lon: 74.79, geoCenterLat: 13.35, geoCenterLon: 74.79,
        minLat: 13.3, minLon: 74.75, maxLat: 13.4, maxLon: 74.83,
        bbox: [[13.3, 74.75], [13.4, 74.83]], listingCount: 2, schoolCount: 0, trendDirection: 'stable',
      }],
    },
    isLoading: false,
  })),
}));
vi.mock('@/hooks/useAreaGroups', () => ({ useAreaGroups: vi.fn(() => ({ data: undefined, isLoading: false })) }));
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

const fetchCalls: string[] = [];
let resolveStatus = 404;
const realFetch = globalThis.fetch;
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
const wireRoot = {
  nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Udupi', depth: 0, regionKey: null, ancestry: [],
  nextLevelType: 'DIRECTION', children: [] as unknown[], revisionId: 1, bounds: null, descendantAreaKeys: null, areaKey: null,
};

const seen: Array<{ search: string; key: string }> = [];
function LocationProbe() {
  const location = useLocation();
  React.useEffect(() => {
    seen.push({ search: location.search, key: location.key });
  }, [location]);
  return null;
}
const lastParams = () => new URLSearchParams(seen[seen.length - 1]?.search ?? '');

const COLD_URL = `/discover?city=udupi&areaKey=${encodeURIComponent(AREA_KEY)}`;

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[COLD_URL]}>
        <LocationProbe />
        <Routes>
          <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('#2859 B7 url-state-1 — cold journey-less ?areaKey= (city without a hierarchy) renders cards + back-button, then Back drops areaKey', () => {
  beforeEach(() => {
    seen.length = 0;
    fetchCalls.length = 0;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.includes('/navigation/resolve')) {
        // NOTE: the 200 arm below is intentionally NOT driven by any it in this file (the 200 hierarchy path is
        // RETAIN / OQ2); every it here sets resolveStatus = 404 (the journey-less, no-hierarchy city).
        return resolveStatus === 200
          ? jsonResponse(200, { requested: 'root', resolution: 'EXACT', node: wireRoot, revisionId: 1 })
          : jsonResponse(404, { message: 'no active navigation hierarchy for this city' });
      }
      if (url.includes('/navigation/') && url.includes('/counts')) {
        return jsonResponse(200, {
          nodeKey: 'root', count: 2, schoolCount: 0, areaCounts: {}, areaSchoolCounts: {}, children: [], revisionId: 1,
        });
      }
      if (/\/cities\/[^/]+\/listings/.test(url)) {
        return jsonResponse(200, {
          city: 'udupi', limitPerArea: 50,
          areas: [{
            areaKey: AREA_KEY, areaName: 'Manipal',
            listings: [
              { id: 'l-1', title: 'Manipal 2BHK', propertyType: 'apartment', listingPurpose: 'sale', priceBand: '50L-1Cr', bedrooms: 2, lat: 13.35, lon: 74.79 },
              { id: 'l-2', title: 'Manipal villa', propertyType: 'villa', listingPurpose: 'sale', priceBand: '1-2Cr', bedrooms: 3, lat: 13.351, lon: 74.791 },
            ],
          }],
        });
      }
      return jsonResponse(404, { message: 'not stubbed' });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    resolveStatus = 404;
  });

  it('renders listing-card(s) and the back-button with areaKey kept, no interaction; clicking back-button drops areaKey', async () => {
    resolveStatus = 404;
    const user = userEvent.setup();
    mount();

    // BEFORE: the cold URL carries the areaKey; the page performs its own scope='' REPLACE after the 404 probe
    // (observed by the same probe: positive control that the probe sees page URL writes).
    expect(new URLSearchParams(seen[0].search).get('areaKey')).toBe(AREA_KEY);
    const back = await screen.findByTestId('back-button');
    const cards = await screen.findAllByTestId('listing-card');
    expect(cards.length).toBeGreaterThanOrEqual(1);
    await waitFor(() => {
      expect(lastParams().get('scope')).toBe('');
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(lastParams().get('areaKey')).toBe(AREA_KEY);
    expect(lastParams().get('city')).toBe('udupi');

    // ACTION: click the real back-button.
    await user.click(back);

    // AFTER: areaKey dropped (observed by the same probe); the cold-load panel is gone.
    await waitFor(() => {
      expect(lastParams().has('areaKey')).toBe(false);
    });
    expect(lastParams().get('city')).toBe('udupi');
    await waitFor(() => {
      expect(screen.queryByTestId('back-button')).not.toBeInTheDocument();
    });
  });
});
