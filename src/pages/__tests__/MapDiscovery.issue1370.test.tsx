/**
 * Issue #1370 (MVP2) — MapDiscovery school-control visibility.
 *
 * UPDATED (Discover Figma polish): the on-map "Near a school" quick-filter button was
 * removed from ALL journeys. The school-first journey remains reachable via the
 * "Search by school area" journey card in the right panel. These tests now assert the
 * button is ABSENT in every journey (agri-first, area-first, guided-entry), which both
 * preserves the original #1370 AC4 guarantee (agri-first never exposes school controls)
 * and locks in the button removal.
 *
 * Harness mirrors MapDiscovery.issue1178.test.tsx — only PropertyMap, AppLayout, and
 * react-leaflet are mocked, so the real MapDiscovery chrome renders and can be asserted
 * against the DOM. The always-present Buy/Rent `intent-selector` is used as the mount
 * anchor so button-absence is asserted only after the right-panel chrome has rendered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const AREA_KEY = 'IN|KA|Udupi|Manipal';
const AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: AREA_KEY,
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

vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: vi.fn(() => ({ data: { groups: [] }, isLoading: false })),
}));

vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useRegionalAreaGroups: vi.fn(() => ({ groups: [], isLoading: false, error: null })),
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

const renderAt = (url: string) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/discover" element={<MapDiscovery />} />
          <Route path="*" element={<MapDiscovery />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('Issue #1370 / Figma polish — "Near a school" button removed from all journeys', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  it('AC4: agri-first journey does NOT render the "Near a school" button', async () => {
    renderAt('/discover?city=udupi&journey=agri-first');

    // CorridorLandingPanel renders (proves we are in the agri journey).
    // No corridorGroups are mocked so the empty state renders.
    await screen.findByTestId('corridor-landing-empty');

    // School controls are hidden (absent), not merely disabled.
    // Exact-match guards the REMOVED map quick-filter button ("Near a school"); it must
    // NOT collide with the public-landing journey card ("Search near a school", #1588).
    expect(screen.queryByRole('button', { name: /^near a school$/i })).toBeNull();
  });

  it('area-first journey no longer renders the "Near a school" button (removed in Figma polish)', async () => {
    renderAt('/discover?city=udupi&journey=area-first');

    // Anchor on the always-present Buy/Rent control so chrome has mounted before asserting.
    await screen.findByTestId('intent-selector');
    // Exact-match guards the REMOVED map quick-filter button ("Near a school"); it must
    // NOT collide with the public-landing journey card ("Search near a school", #1588).
    expect(screen.queryByRole('button', { name: /^near a school$/i })).toBeNull();
  });

  it('guided-entry (no journey) no longer renders the "Near a school" button (removed in Figma polish)', async () => {
    renderAt('/discover?city=udupi');

    await screen.findByTestId('intent-selector');
    // Exact-match guards the REMOVED map quick-filter button ("Near a school"); it must
    // NOT collide with the public-landing journey card ("Search near a school", #1588).
    expect(screen.queryByRole('button', { name: /^near a school$/i })).toBeNull();
  });
});
