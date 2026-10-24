/**
 * #2859 B7 (issue 285907) WEB slice B1 — discover-group-results-1597, assertion 1597-7 (URL SURVIVAL ONLY).
 *
 * 1597-7 is "a cold-load groupResults=1 URL survives through the mounted page, not only through the URL facade".
 * The only sibling coverage is the facade (resultScope.atomicCommit, MUT-923 is a facade mutation) and
 * MapDiscovery.groupResults.test.tsx, which MOCKS useDiscoverUrlState. This file mounts the REAL MapDiscovery +
 * DiscoverProvider + REAL useDiscoverUrlState at a cold ?city=udupi&groupId=<g>&groupResults=1 and reads the URL
 * through a LocationProbe after the page settles.
 *
 * Claim wording (PR-5 note kept): the param has NO rendering consumer; only its survival in the URL is claimed.
 * The mount-time-write control: the area.ts default-journey probe (a 404 on the city-root resolve) makes the
 * page REPLACE-write scope='' into the URL at mount (area.ts:237-247). The probe sees that write in the same it,
 * so "groupResults survived" is read from a probe that demonstrably sees the page's own mount-time URL writes.
 * Tripwire: an injected groupResults strip inside that same write must redden the survival assertion; it proves
 * detection of an injected regression, not a product behaviour.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
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

const GROUP_ID = 'coastal-strip';
const AREA_KEY = 'IN|KA|Udupi|Kunjibettu';
const GROUP = {
  id: GROUP_ID,
  name: 'Coastal Strip',
  subtitle: null,
  region_label: null,
  school_count: 0,
  area_keys: [AREA_KEY],
  focus_lat: 13.35,
  focus_lon: 74.75,
};
vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: {
      city: 'udupi',
      areas: [{
        areaKey: AREA_KEY, areaLabel: 'Kunjibettu', name: 'Kunjibettu',
        geo_center_lat: 13.342, geo_center_lon: 74.745, geoCenterLat: 13.342, geoCenterLon: 74.745,
        minLat: 13.33, minLon: 74.73, maxLat: 13.36, maxLon: 74.76,
        bbox: [[13.33, 74.73], [13.36, 74.76]], listingCount: 3, schoolCount: 1, trendDirection: 'stable',
      }],
    },
    isLoading: false,
  })),
}));
vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: vi.fn(() => ({ data: { groups: [GROUP] }, isLoading: false })),
}));
vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: vi.fn(() => ({ data: { areas: [] }, isLoading: false })),
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

// The city-root resolve (area.ts defaultJourneyProbe) answers 404 -> the page REPLACE-writes scope='' at mount.
const realFetch = globalThis.fetch;

const seen: Array<{ search: string; key: string }> = [];
function LocationProbe() {
  const location = useLocation();
  React.useEffect(() => {
    seen.push({ search: location.search, key: location.key });
  }, [location]);
  return null;
}
const lastParams = () => new URLSearchParams(seen[seen.length - 1]?.search ?? '');

const COLD_URL = `/discover?city=udupi&groupId=${GROUP_ID}&groupResults=1`;

describe('#2859 B7 1597-7 — cold groupResults=1 URL survives through the mounted page (URL survival only)', () => {
  beforeEach(() => {
    seen.length = 0;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ message: 'no active navigation hierarchy for this city' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('after the page settles, groupResults=1 and groupId remain in the URL, and the same probe has seen the page perform its own mount-time scope= write', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[COLD_URL]}>
          <LocationProbe />
          <Routes>
            <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // BEFORE: the cold URL carries the param under test.
    expect(new URLSearchParams(seen[0].search).get('groupResults')).toBe('1');
    expect(new URLSearchParams(seen[0].search).get('groupId')).toBe(GROUP_ID);

    // POSITIVE CONTROL (same it, same probe): the page performs a mount-time URL write — scope='' (REPLACE) —
    // and the probe observes it. Without this the survival read below could come from a probe that sees nothing.
    await waitFor(() => {
      expect(lastParams().has('scope')).toBe(true);
    });
    expect(lastParams().get('scope')).toBe('');

    // let any further mount-time effect land
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // SURVIVAL: after the write above and the settle, the param (and the group it belongs to) are still there.
    expect(lastParams().get('groupResults')).toBe('1');
    expect(lastParams().get('groupId')).toBe(GROUP_ID);
    expect(lastParams().get('city')).toBe('udupi');
  });
});
