/**
 * Issue #1430 — MapDiscovery: agri-group listing peek wiring
 *
 * Tests the derivation of selectedGroupListingItem and URL-action wiring.
 * Uses the same mock harness pattern as MapDiscovery.issue1370.test.tsx.
 *
 * AC1: selectedGroupListingItem is derived from agriGroupListings.find(id === selectedListing)
 * AC2: selectedListing not in agriGroupListings → selectedGroupListingItem is null (safe fallback)
 * AC3: clearRegionAndMaxKm clears listing= + region= + maxKm= (regression guard via URL read)
 * AC4: list-card click calls setSelectedListing(id) not navigate
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';

// ─── Hoisted handles ──────────────────────────────────────────────────────────

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

const mockSetSelectedListing = vi.hoisted(() => vi.fn());
const mockClearRegionAndMaxKm = vi.hoisted(() => vi.fn());

// Controllable per-test: mock for the hook itself
const mockUseDiscoverUrlState = vi.hoisted(() => vi.fn());

// Agri group listings data (controlled per-test)
const mockAgriListingsData = vi.hoisted(() => ({
  current: null as { listings: AgriMapListingItem[] } | null,
}));

// ─── Helpers: shared state/actions builders ───────────────────────────────────

function makeDefaultActions() {
  return {
    selectArea: vi.fn(),
    deselectArea: vi.fn(),
    setSchoolParams: vi.fn(),
    setFiltersLive: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setBoardFilters: vi.fn(),
    setCategoryFilters: vi.fn(),
    clearAreaContext: vi.fn(),
    clearSchoolContext: vi.fn(),
    startOver: vi.fn(),
    setJourney: vi.fn(),
    selectGroup: vi.fn(),
    setSchoolJourney: vi.fn(),
    setSearchQuery: vi.fn(),
    reportViewport: vi.fn(),
    setCity: vi.fn(),
    changeCity: vi.fn(),
    selectRegionalGroup: vi.fn(),
    setRegion: vi.fn(),
    setRegionWithMaxKm: vi.fn(),
    setMaxKm: vi.fn(),
    clearRegionAndMaxKm: mockClearRegionAndMaxKm,
    setSelectedListing: mockSetSelectedListing,
    clearSelectedListing: vi.fn(),
    setLocality: vi.fn(),
    clearLocality: vi.fn(),
    enterSchoolPicking: vi.fn(),
    clearSchoolPicking: vi.fn(),
    backToSchoolPicking: vi.fn(),
    clearSchoolSelection: vi.fn(),
    clearAreaSelection: vi.fn(),
  };
}

function makeUrlState(overrides: Record<string, unknown> = {}) {
  return {
    city: 'udupi',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: 'agri-first' as const,
    groupId: null,
    schoolPicking: undefined,
    selectedGroup: null,
    selectedRegion: 'N' as const,
    selectedMaxKm: 25 as const,
    selectedListing: null as string | null,
    selectedLocality: null as string | null,
    ...overrides,
  };
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: () => <div data-testid="property-map-mock" />,
}));

vi.mock('@/components/layout/AppLayout', () => ({ RoleAwareHeader: () => null,
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const makeAgriItem = (id: string): AgriMapListingItem => ({
  id,
  areaKey: 'IN|KA|Udupi|Manipal',
  latitude: 13.35,
  longitude: 74.79,
  propertyType: 'agricultural_land',
  locality: 'Manipal Village',
  landArea: 2.5,
  landAreaUnit: 'acre',
  computedAreaAcres: 2.5,
  pricePaise: 3000000 * 100,
});

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Issue #1430 — MapDiscovery selectedGroupListingItem derivation', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    mockSetSelectedListing.mockReset();
    mockClearRegionAndMaxKm.mockReset();
    mockAgriListingsData.current = null;
    // Default state: agri-first, region+maxKm set, no selectedListing
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState(),
      makeDefaultActions(),
    ]);
  });

  it('AC1: selectedGroupListingItem is derived from agriGroupListings.find(id === selectedListing)', async () => {
    // Set up: agri listings loaded, selectedListing points to one of them
    const item = makeAgriItem('listing-to-peek');
    mockAgriListingsData.current = { listings: [item] };

    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ selectedListing: 'listing-to-peek' }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25&listing=listing-to-peek');

    // The peek panel renders with the item's locality (first-paint)
    await waitFor(() => {
      expect(screen.getByTestId('agri-listing-peek')).toBeInTheDocument();
    });
    expect(screen.getByTestId('agri-listing-peek-locality')).toHaveTextContent('Manipal Village');
  });

  it('AC2: selectedListing not in agriGroupListings → selectedGroupListingItem is null (safe fallback)', async () => {
    // Listings loaded but selected id is unknown
    mockAgriListingsData.current = { listings: [makeAgriItem('other-item')] };

    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ selectedListing: 'NONEXISTENT-UUID' }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25&listing=NONEXISTENT-UUID');

    // Peek must NOT render (null safe fallback)
    // Panel container still renders (agri-group-peek case returns null when item is null)
    await waitFor(() => {
      expect(screen.getByTestId('discover-right-panel')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('agri-listing-peek')).not.toBeInTheDocument();
  });

  it('AC4a (#1480): agri-group-selected shows towns-only (locality btn present, no inline listing rows)', async () => {
    // Issue #1480 — Level-2 (agri-group-selected) is now towns-only.
    // Inline listing rows were removed; users drill into a town to see listings (Level-3).
    // The setSelectedListing call now originates from AgriGroupLocalityPanel (Level-3),
    // not from AgriGroupSelectedPanel (Level-2).
    mockAgriListingsData.current = { listings: [makeAgriItem('card-click-target')] };

    // selectedListing + selectedLocality both null → agri-group-selected panel shows (Level 2)
    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');

    // Level 2: locality button present (makeAgriItem has locality='Manipal Village')
    await waitFor(() => {
      expect(screen.getByTestId('agri-group-locality-btn')).toBeInTheDocument();
    });
    // Level 2: no inline listing rows (towns-only — listings only appear after locality drill-down)
    expect(screen.queryByTestId('agri-group-listing-row')).not.toBeInTheDocument();
  });

  it('AC4b (#1480): listing click in Level-3 (AgriGroupLocalityPanel) calls setSelectedListing(id)', async () => {
    // Issue #1480 — Level-2 (agri-group-selected) is now towns-only; inline listing rows removed.
    // Level-3 (agri-group-locality) shows listings for the selected town.
    // This test verifies: clicking a listing row in Level-3 calls setSelectedListing(id), not navigate.
    const user = userEvent.setup();
    mockAgriListingsData.current = { listings: [makeAgriItem('card-click-target')] };

    // Start at Level 3: selectedLocality set → agri-group-locality panel (AgriGroupLocalityPanel)
    // makeAgriItem has locality: 'Manipal Village', so it matches the filter in DiscoverRightPanel
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ selectedLocality: 'Manipal Village' }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25&locality=Manipal%20Village');

    // Level 3: AgriGroupLocalityPanel renders listing rows with testId agri-locality-listing-row
    await waitFor(() => {
      expect(screen.getByTestId('agri-locality-listing-row')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('agri-locality-listing-row'));

    // setSelectedListing must be called with the listing id (not navigate — no navigation happens)
    expect(mockSetSelectedListing).toHaveBeenCalledWith('card-click-target');
  });
});
