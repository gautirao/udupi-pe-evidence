/**
 * Issue #1460 — MapDiscovery: truncated/limit wiring to DiscoverRightPanel
 *
 * Proves that agriMapListingsData.truncated and agriMapListingsData.limit are
 * threaded from useAgriMapListings through MapDiscovery → DiscoverRightPanel →
 * AgriGroupSelectedPanel so the cap notice renders in the DOM.
 *
 * AC1: truncated=true → "Showing first N plots" notice is visible.
 * AC2: truncated=false → notice is NOT in the DOM.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';

// ─── Hoisted handles ──────────────────────────────────────────────────────────

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

const mockUseDiscoverUrlState = vi.hoisted(() => vi.fn());

// Controllable per-test agri listings response (includes truncated + limit)
const mockAgriListingsData = vi.hoisted(() => ({
  current: null as { listings: AgriMapListingItem[]; truncated: boolean; limit: number } | null,
}));

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: () => <div data-testid="property-map-mock" />,
  PropertyListingWithImages: vi.fn(),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useDiscoverUrlState', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useDiscoverUrlState')>(
    '@/hooks/useDiscoverUrlState',
  );
  return {
    ...actual,
    useDiscoverUrlState: () => mockUseDiscoverUrlState(),
  };
});

vi.mock('@/hooks/useAgriMapListings', () => ({
  useAgriMapListings: vi.fn(() => ({
    data: mockAgriListingsData.current,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: { city: 'udupi', areas: [] }, isLoading: false })),
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
  useDiscoverFilteredMarkers: vi.fn(() => ({
    data: undefined, isLoading: false, isFetching: false,
  })),
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
    data: undefined, isLoading: false, isError: false, error: null,
    fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
    isFetching: false, refetch: vi.fn(),
  })),
}));

vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: vi.fn(() => ({ data: { groups: [] }, isLoading: false })),
}));

vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useRegionalAreaGroups: vi.fn(() => ({ groups: [], isLoading: false, error: null })),
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeDefaultActions() {
  return {
    selectArea: vi.fn(), deselectArea: vi.fn(), setSchoolParams: vi.fn(),
    setFiltersLive: vi.fn(), setFiltersCommitted: vi.fn(), setBoardFilters: vi.fn(),
    setCategoryFilters: vi.fn(), clearAreaContext: vi.fn(), clearSchoolContext: vi.fn(),
    startOver: vi.fn(), setJourney: vi.fn(), selectGroup: vi.fn(), setSchoolJourney: vi.fn(),
    setSearchQuery: vi.fn(), reportViewport: vi.fn(), setCity: vi.fn(), changeCity: vi.fn(),
    selectRegionalGroup: vi.fn(), setRegion: vi.fn(), setRegionWithMaxKm: vi.fn(),
    setMaxKm: vi.fn(), clearRegionAndMaxKm: vi.fn(), setSelectedListing: vi.fn(),
    clearSelectedListing: vi.fn(), setLocality: vi.fn(), clearLocality: vi.fn(),
    enterSchoolPicking: vi.fn(), clearSchoolPicking: vi.fn(), backToSchoolPicking: vi.fn(),
    clearSchoolSelection: vi.fn(), clearAreaSelection: vi.fn(),
  };
}

/** URL state that puts MapDiscovery into agri-group-selected panel. */
function makeUrlState(overrides: Record<string, unknown> = {}) {
  return {
    city: 'udupi',
    areaKey: null, viewport: null,
    filters: {} as Record<string, unknown>,
    schoolId: null, radiusKm: null,
    q: '', journey: 'agri-first' as const, groupId: null, schoolPicking: undefined,
    selectedGroup: null,
    selectedRegion: 'N' as const,
    selectedMaxKm: 25 as const,
    selectedListing: null as string | null,
    selectedLocality: null as string | null,
    intent: 'buy' as const,
    ...overrides,
  };
}

const makeAgriItem = (): AgriMapListingItem => ({
  id: crypto.randomUUID(),
  areaKey: 'IN|KA|Udupi|Manipal',
  latitude: 13.3409,
  longitude: 74.7421,
  propertyType: 'agricultural_land',
  locality: 'Test Village',
  landArea: 2.5,
  landAreaUnit: 'acre',
  computedAreaAcres: 2.5,
  pricePaise: 300000000,
  listingPurpose: 'sale',
  waterSource: null,
  landCategory: null,
  farmhouseAvailable: null,
  fencingDone: null,
  title: 'Test agri listing',
});

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/discover" element={<MapDiscovery />} />
          <Route path="*" element={<MapDiscovery />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Issue #1460 — truncated/limit wiring: MapDiscovery → DiscoverRightPanel → AgriGroupSelectedPanel', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    mockAgriListingsData.current = null;
    mockUseDiscoverUrlState.mockReturnValue([makeUrlState(), makeDefaultActions()]);
  });

  it('AC1: truncated=true renders "Showing first N plots" notice in the DOM', async () => {
    mockAgriListingsData.current = {
      listings: [makeAgriItem(), makeAgriItem()],
      truncated: true,
      limit: 250,
    };

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');

    await waitFor(() => {
      expect(
        screen.getByText(/Showing first 250 plots/),
      ).toBeInTheDocument();
    });
  });

  it('AC2: truncated=false does NOT render the truncation notice', async () => {
    mockAgriListingsData.current = {
      listings: [makeAgriItem(), makeAgriItem()],
      truncated: false,
      limit: 250,
    };

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');

    // Allow the component to settle before asserting absence.
    await waitFor(() => {
      expect(screen.getByTestId('agri-group-selected-panel')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Showing first \d+ plots/)).not.toBeInTheDocument();
  });
});
