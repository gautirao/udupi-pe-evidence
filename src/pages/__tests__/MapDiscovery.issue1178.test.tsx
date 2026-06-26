/**
 * Issue #1178 — MapDiscovery integration: group card highlight + invalid-groupId notice.
 *
 * The area-groups-landing panel must, on cold load:
 *   AC4 — highlight the deep-linked group card when ?groupId=<valid>.
 *   AC3 — show a non-alarming notice (no highlight) when ?groupId=<invalid>.
 *   Whitespace groupId behaves like normal browse (no notice, no highlight).
 *   AC2 — clicking a different group card updates the URL groupId and moves the
 *         highlight.
 *
 * Prop wiring is the only production change in MapDiscovery; routing (derivePanelContent)
 * is unchanged. These tests assert the rendered DOM, not just URL params.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';

// ─── Hoisted handles ───────────────────────────────────────────
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

// ─── Mocks ─────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: () => <div data-testid="property-map-mock" />,
}));

vi.mock('@/components/layout/AppLayout', () => ({ RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const COASTAL_AREA_KEY = 'IN|KA|Udupi|Malpe';
const HILLS_AREA_KEY = 'IN|KA|Udupi|Manipal';
const AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: COASTAL_AREA_KEY,
      areaLabel: 'Malpe',
      name: 'Malpe',
      geo_center_lat: 13.354,
      geo_center_lon: 74.708,
      geoCenterLat: 13.354,
      geoCenterLon: 74.708,
      minLat: 13.34, minLon: 74.69, maxLat: 13.37, maxLon: 74.72,
      bbox: [[13.34, 74.69], [13.37, 74.72]] as [[number, number], [number, number]],
      listingCount: 4,
      schoolCount: 4,
      trendDirection: 'stable',
    },
    {
      areaKey: HILLS_AREA_KEY,
      areaLabel: 'Manipal',
      name: 'Manipal',
      geo_center_lat: 13.3528,
      geo_center_lon: 74.7917,
      geoCenterLat: 13.3528,
      geoCenterLon: 74.7917,
      minLat: 13.345, minLon: 74.78, maxLat: 13.36, maxLon: 74.8,
      bbox: [[13.345, 74.78], [13.36, 74.8]] as [[number, number], [number, number]],
      listingCount: 4,
      schoolCount: 0,
      trendDirection: 'stable',
    },
  ],
};

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

vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}));

// Two real groups whose member areas exist in AREAS_RESPONSE.
const GROUPS = [
  {
    id: 'coastal-homes',
    name: 'Coastal Homes',
    subtitle: 'Malpe beachfront',
    region_label: 'Coast',
    school_count: 4,
    area_keys: [COASTAL_AREA_KEY],
  },
  {
    id: 'hill-homes',
    name: 'Hill Homes',
    subtitle: 'Manipal uplands',
    region_label: 'Hills',
    school_count: 0,
    area_keys: [HILLS_AREA_KEY],
  },
];

vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: vi.fn(() => ({ data: { groups: GROUPS }, isLoading: false })),
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

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

// Spy that exposes the current URL search string for URL-contract assertions.
let currentSearch = '';
function LocationSpy() {
  const location = useLocation();
  currentSearch = location.search;
  return null;
}

const renderAt = (url: string) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[url]}>
        <LocationSpy />
        <Routes>
          <Route path="/discover" element={<MapDiscovery />} />
          <Route path="*" element={<MapDiscovery />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('Issue #1178 — MapDiscovery group highlight + invalid notice', () => {
  beforeEach(() => {
    currentSearch = '';
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  it('AC4: cold-load with valid ?groupId opens Level-2 for that group', async () => {
    renderAt('/discover?city=udupi&journey=area-first&groupId=coastal-homes');

    // Level-2 panel renders immediately — valid groupId resolves to coastal-homes group
    const level2 = await screen.findByTestId('area-group-level2');
    expect(level2).toBeInTheDocument();
    // coastal-homes area_keys = [COASTAL_AREA_KEY] → Malpe area row is shown
    expect(screen.getByTestId('browse-all-area-IN|KA|Udupi|Malpe')).toBeInTheDocument();
    // Back-to-all button allows returning to the L1 group list
    expect(screen.getByTestId('area-group-back-to-all')).toBeInTheDocument();
    // L1 group cards are NOT shown in Level-2
    expect(screen.queryByTestId('area-group-card-coastal-homes')).not.toBeInTheDocument();
    // No invalid-group notice (valid groupId)
    expect(screen.queryByTestId('area-group-invalid-message')).not.toBeInTheDocument();
  });

  it('AC3: cold-load with invalid ?groupId shows the notice and no highlight', async () => {
    renderAt('/discover?city=udupi&journey=area-first&groupId=nonexistent-slug');

    const msg = await screen.findByTestId('area-group-invalid-message');
    expect(msg).toHaveTextContent('This group is not available. Please select a group below.');
    expect(screen.getByTestId('area-group-card-coastal-homes')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('area-group-card-hill-homes')).not.toHaveAttribute('aria-current');
  });

  it('whitespace ?groupId behaves like normal browse (no notice, no highlight)', async () => {
    renderAt('/discover?city=udupi&journey=area-first&groupId=%20');

    await screen.findByTestId('area-group-card-coastal-homes');
    expect(screen.queryByTestId('area-group-invalid-message')).not.toBeInTheDocument();
    expect(screen.getByTestId('area-group-card-coastal-homes')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('area-group-card-hill-homes')).not.toHaveAttribute('aria-current');
  });

  it('AC2: back-to-all from Level-2 returns to the L1 group card list', async () => {
    const user = userEvent.setup();
    renderAt('/discover?city=udupi&journey=area-first&groupId=coastal-homes');

    // Level-2 is shown on cold-load (valid groupId)
    await screen.findByTestId('area-group-level2');

    // Click the back-to-all button
    await user.click(screen.getByTestId('area-group-back-to-all'));

    // L1 group cards are shown again
    await screen.findByTestId('area-group-card-coastal-homes');
    expect(screen.getByTestId('area-group-card-hill-homes')).toBeInTheDocument();

    // Level-2 panel is gone
    expect(screen.queryByTestId('area-group-level2')).not.toBeInTheDocument();
  });
});
