/**
 * Issue #1064 — MapDiscovery integration / Start Over wiring tests.
 *
 * Symptom 2 (AC2): clicking Start Over must increment the resetMapTick value
 *   PropertyMap receives, so MapController's flyTo(cityCenter, cityZoom) fires.
 *
 * Symptom 3 (AC3, integration): Malpe school-first deep link with selectedArea
 *   resolved must render SchoolsInAreaPanel with the school names — not the
 *   silent GuidedEntryPanel fall-back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';

// ─── Hoisted handles ───────────────────────────────────────────
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

// Capture every props snapshot PropertyMap receives across renders.
const propertyMapPropsLog = vi.hoisted(() => ({
  resetMapTicks: [] as number[],
}));

// ─── Mocks ─────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: (props: { resetMapTick?: number }) => {
    propertyMapPropsLog.resetMapTicks.push(props.resetMapTick ?? 0);
    return <div data-testid="property-map-mock" />;
  },
}));

vi.mock('@/components/layout/AppLayout', () => ({ RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Areas hook — Malpe present.
const MALPE_AREA_KEY = 'IN|KA|Udupi|Malpe';
const MANIPAL_AREA_KEY = 'IN|KA|Udupi|Manipal';
const AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: MALPE_AREA_KEY,
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
      areaKey: MANIPAL_AREA_KEY,
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

const KNOWN_SCHOOLS = [
  { id: 'sc-1', name: 'Kodavoor School', latitude: 13.354, longitude: 74.708, city: 'udupi', areaKey: MALPE_AREA_KEY, board: 'STATE', category: 'PRIMARY' },
  { id: 'sc-2', name: 'PRETTY ANGELS PRE SCHOOL MALPE', latitude: 13.355, longitude: 74.71, city: 'udupi', areaKey: MALPE_AREA_KEY, board: 'STATE', category: 'PRE_SCHOOL' },
  { id: 'sc-3', name: 'KADAL SURF SCHOOL | SUP | KAYAKING', latitude: 13.36, longitude: 74.7, city: 'udupi', areaKey: MALPE_AREA_KEY, board: 'OTHER', category: 'OTHER' },
  { id: 'sc-4', name: 'Noor ul Furqan special school', latitude: 13.357, longitude: 74.711, city: 'udupi', areaKey: MALPE_AREA_KEY, board: 'STATE', category: 'SPECIAL' },
];

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: undefined })),
  useSchoolById: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
}));

vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: vi.fn((areaKey?: string) => ({
    data: areaKey === MALPE_AREA_KEY
      ? { pages: [{ schools: KNOWN_SCHOOLS }] }
      : undefined,
    isLoading: false,
    isError: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
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

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

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

describe('Issue #1064 — MapDiscovery wiring', () => {
  beforeEach(() => {
    propertyMapPropsLog.resetMapTicks.length = 0;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  describe('Symptom 2 (AC2) — Start Over resets map viewport', () => {
    it('clicking Start Over increments resetMapTick passed to PropertyMap', async () => {
      const user = userEvent.setup();
      const MANIPAL_URL =
        '/discover?city=udupi&journey=area-first&lat=13.35501&lon=74.79999&zoom=14' +
        '&areaKey=' + encodeURIComponent(MANIPAL_AREA_KEY);

      renderAt(MANIPAL_URL);

      // Wait until PropertyMap has rendered at least once with a known tick.
      await waitFor(() => {
        expect(propertyMapPropsLog.resetMapTicks.length).toBeGreaterThan(0);
      });
      const tickBefore = propertyMapPropsLog.resetMapTicks.at(-1)!;

      // The Start Over button lives in the right-panel header — query by accessible name.
      const startOverButtons = await screen.findAllByRole('button', { name: /start over/i });
      // Click the first reachable one (right-panel header).
      await user.click(startOverButtons[0]);

      // Issue #1817 (AC8) — an area is selected here (deeper than a region), so
      // Start over now shows a confirm popover before resetting; confirm it.
      const confirmButtons = await screen.findAllByTestId('start-over-confirm');
      await user.click(confirmButtons[0]);

      // After confirming, MapDiscovery re-renders with composedResetMapTick incremented.
      await waitFor(() => {
        const tickAfter = propertyMapPropsLog.resetMapTicks.at(-1)!;
        expect(tickAfter).toBeGreaterThan(tickBefore);
      });
    });
  });

  describe('Symptom 3 (AC3) — Malpe school-first hydration', () => {
    it('renders SchoolsInAreaPanel (not GuidedEntryPanel) for resolved Malpe deep link', async () => {
      const MALPE_SCHOOL_FIRST_URL =
        '/discover?city=udupi&journey=school-first' +
        '&areaKey=' + encodeURIComponent(MALPE_AREA_KEY);

      renderAt(MALPE_SCHOOL_FIRST_URL);

      // At least one of the known Malpe schools must be visible.
      await waitFor(() => {
        const anySchool =
          screen.queryByText('Kodavoor School') ??
          screen.queryByText('PRETTY ANGELS PRE SCHOOL MALPE') ??
          screen.queryByText('KADAL SURF SCHOOL | SUP | KAYAKING') ??
          screen.queryByText('Noor ul Furqan special school');
        expect(anySchool).not.toBeNull();
      });

      // Regression: GuidedEntryPanel signature element must NOT render.
      expect(screen.queryByText('Find properties your way')).not.toBeInTheDocument();
    });
  });
});
