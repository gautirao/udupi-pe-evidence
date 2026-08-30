/**
 * Issue #1067 R1 — integration test.
 *
 * Renders MapDiscovery with the Padubidri school-first deep-link URL and
 * asserts SchoolsInAreaPanel hydrates with one of the three known Padubidri
 * school names. Critically: this test mocks `@/lib/api` (the layer the R1 fix
 * migrates to), NOT `useSchoolsByArea` — so it exercises the api.get path end
 * to end. If the hook regresses to raw `fetch`, api.get would not be called
 * and the panel would render empty.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '@/pages/MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(msg: string, status: number, body: unknown) {
      super(msg);
      this.status = status;
      this.body = body;
    }
  },
}));

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
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RoleAwareHeader: () => <div data-testid="role-aware-header-mock" />,
}));

const PADUBIDRI_AREA_KEY = 'IN|KA|Udupi|Padubidri';
const AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: PADUBIDRI_AREA_KEY,
      areaLabel: 'Padubidri',
      name: 'Padubidri',
      geo_center_lat: 13.1843,
      geo_center_lon: 74.7841,
      geoCenterLat: 13.1843,
      geoCenterLon: 74.7841,
      minLat: 13.17,
      minLon: 74.77,
      maxLat: 13.2,
      maxLon: 74.8,
      bbox: [[13.17, 74.77], [13.2, 74.8]] as [[number, number], [number, number]],
      listingCount: 5,
      schoolCount: 3,
      trendDirection: 'stable',
    },
  ],
};

// useDiscoverAreas is mocked because it normally uses api.get too — but the
// hook also has shape-mapping for AreaPoint upstream. Keep it independent of
// the api.get mock to isolate the R1 path being tested.
vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: AREAS_RESPONSE, isLoading: false })),
}));

vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: vi.fn(() => ({ data: { areas: [] }, isLoading: false })),
}));

vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: vi.fn(() => ({
    data: undefined, isLoading: false, isFetching: false, error: null,
  })),
}));

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: vi.fn(() => ({ data: undefined, isLoading: false, isFetching: false })),
}));

vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: vi.fn(() => ({ data: undefined })),
}));

vi.mock('@/hooks/useListingSearch', () => ({
  useListingSearch: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: undefined })),
  useSchoolById: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
}));

vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock('react-leaflet', () => ({
  MapContainer: () => null,
  TileLayer: () => null,
  Marker: () => null,
  Popup: () => null,
  useMap: () => ({ flyTo: vi.fn(), invalidateSize: vi.fn(), fitBounds: vi.fn() }),
  useMapEvents: () => null,
  Circle: () => null,
  Polygon: () => null,
  ZoomControl: () => null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  },
}));

const PADUBIDRI_SCHOOLS = [
  {
    id: '5f993163-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Kinara Global School',
    boardType: null,
    board: null,
    latitude: 13.184,
    longitude: 74.785,
    address: 'Padubidri',
    distanceKm: null,
    prominenceTier: 'notable',
    schoolCategory: null,
  },
  {
    id: '70ecdb26-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    name: 'Mahalakshmi English Medium School. Uchila',
    boardType: null,
    board: null,
    latitude: 13.185,
    longitude: 74.786,
    address: 'Uchila',
    distanceKm: null,
    prominenceTier: 'notable',
    schoolCategory: null,
  },
  {
    id: '613a4997-cccc-cccc-cccc-cccccccccccc',
    name: 'School Play Ground',
    boardType: null,
    board: null,
    latitude: 13.183,
    longitude: 74.784,
    address: 'Padubidri',
    distanceKm: null,
    prominenceTier: 'notable',
    schoolCategory: null,
  },
];

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// Issue #1953 (build step 2) — MapDiscovery is no longer a production caller
// of useDiscoverUrlState(); it consumes the DiscoverProvider facade instead,
// so the route element needs a real provider ancestor (inside the Router).
const renderAt = (url: string) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/discover" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
          <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('Issue #1067 R1 — SchoolsInAreaPanel hydrates via api.get', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    // Route every api.get call hitting the schools-by-area endpoint to the fixture.
    mockApiGet.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/public/schools/by-area')) {
        return PADUBIDRI_SCHOOLS;
      }
      return [];
    });
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  it('renders Padubidri school names when school-first deep link loads', async () => {
    const url =
      '/discover?city=udupi&journey=school-first' +
      '&areaKey=' + encodeURIComponent(PADUBIDRI_AREA_KEY);

    renderAt(url);

    // At least one of the three known Padubidri school names is rendered.
    await waitFor(() => {
      const anySchool =
        screen.queryByText('Kinara Global School') ??
        screen.queryByText('Mahalakshmi English Medium School. Uchila') ??
        screen.queryByText('School Play Ground');
      expect(anySchool).not.toBeNull();
    });

    // api.get was called with the correct path + skipAuth.
    const schoolsCalls = mockApiGet.mock.calls.filter(([path]) =>
      typeof path === 'string' && path.startsWith('/api/public/schools/by-area'),
    );
    expect(schoolsCalls.length).toBeGreaterThan(0);
    const [, options] = schoolsCalls[0] as [string, { skipAuth?: boolean }];
    expect(options).toEqual({ skipAuth: true });

    // Regression: GuidedEntryPanel signature must NOT render.
    expect(screen.queryByTestId('guided-entry-panel')).not.toBeInTheDocument();
  });
});
