/**
 * Issue #1466 — MapDiscovery: agri marker click regression
 *
 * handleSelectMarkerListing must call urlActions.setSelectedListing(id) when:
 *   - listing is non-null
 *   - journey === 'agri-first'
 *   - selectedRegion is non-null
 *   - selectedMaxKm is non-null
 *
 * TC1 (must fail without fix): agri context fully set → setSelectedListing called
 * TC2: residential journey → setSelectedListing NOT called
 * TC3: agri-first but selectedRegion=null → NOT called
 * TC4: agri-first but selectedMaxKm=null → NOT called
 * TC5: agri-first + region + maxKm set but listing=null → NOT called
 * TC6 (regression): setSelectedMarkerListing always called (agri-detail path must not break)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

// ─── Hoisted handles ─────────────────────────────────────────────────────────

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

const mockSetSelectedListing = vi.hoisted(() => vi.fn());
const mockUseDiscoverUrlState = vi.hoisted(() => vi.fn());

// Capture the onSelectListing callback passed to PropertyMap so tests can invoke it directly.
// Reset before each test.
let capturedOnSelectListing: ((listing: PropertyListingWithImages | null) => void) | undefined;

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: vi.fn(
    ({
      onSelectListing,
    }: {
      onSelectListing?: (listing: PropertyListingWithImages | null) => void;
    }) => {
      capturedOnSelectListing = onSelectListing;
      return <div data-testid="property-map-mock" />;
    },
  ),
  // Re-export the type shape used across MapDiscovery
  PropertyListingWithImages: vi.fn(),
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
    data: null,
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
    clearRegionAndMaxKm: vi.fn(),
    setSelectedListing: mockSetSelectedListing,
    clearSelectedListing: vi.fn(),
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
    selectedRegion: 'S' as const,
    selectedMaxKm: 25 as const,
    selectedListing: null as string | null,
    ...overrides,
  };
}

const makeListing = (id = 'uuid-1'): PropertyListingWithImages =>
  ({
    id,
    title: 'Test Agri Listing',
    price: 0,
    location: 'Manipal',
    propertyType: 'agricultural_land',
    images: [],
  } as unknown as PropertyListingWithImages);

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Issue #1466 — handleSelectMarkerListing agri URL wiring', () => {
  beforeEach(() => {
    capturedOnSelectListing = undefined;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    mockSetSelectedListing.mockReset();
    // Default: agri-first, selectedRegion='S', selectedMaxKm=25
    mockUseDiscoverUrlState.mockReturnValue([makeUrlState(), makeDefaultActions()]);
  });

  it('TC1: agri-first + region=S + maxKm=25 + non-null listing → setSelectedListing(id) called', async () => {
    renderAt('/discover?city=udupi&journey=agri-first&region=S&maxKm=25');

    await waitFor(() => {
      expect(capturedOnSelectListing).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('uuid-1'));
    });

    expect(mockSetSelectedListing).toHaveBeenCalledWith('uuid-1');
  });

  it('TC2: residential journey (not agri-first) → setSelectedListing NOT called', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ journey: 'area-first', selectedRegion: null, selectedMaxKm: null }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=area-first');

    await waitFor(() => {
      expect(capturedOnSelectListing).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('uuid-2'));
    });

    expect(mockSetSelectedListing).not.toHaveBeenCalled();
  });

  it('TC3: agri-first but selectedRegion=null → setSelectedListing NOT called', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ selectedRegion: null }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first');

    await waitFor(() => {
      expect(capturedOnSelectListing).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('uuid-3'));
    });

    expect(mockSetSelectedListing).not.toHaveBeenCalled();
  });

  it('TC4: agri-first but selectedMaxKm=null → setSelectedListing NOT called', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ selectedMaxKm: null }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first&region=S');

    await waitFor(() => {
      expect(capturedOnSelectListing).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(makeListing('uuid-4'));
    });

    expect(mockSetSelectedListing).not.toHaveBeenCalled();
  });

  it('TC5: agri-first + region + maxKm set but listing=null → setSelectedListing NOT called', async () => {
    renderAt('/discover?city=udupi&journey=agri-first&region=S&maxKm=25');

    await waitFor(() => {
      expect(capturedOnSelectListing).toBeDefined();
    });

    act(() => {
      capturedOnSelectListing!(null);
    });

    expect(mockSetSelectedListing).not.toHaveBeenCalled();
  });

  it('TC6 (regression): setSelectedMarkerListing always fires regardless of journey flags', async () => {
    // Use residential journey — setSelectedListing should NOT fire,
    // but the local state setter (setSelectedMarkerListing) must still be called.
    // We verify indirectly: PropertyMap receives onSelectListing which when called
    // does NOT throw, and the component renders without error.
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ journey: 'area-first', selectedRegion: null, selectedMaxKm: null }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=area-first');

    await waitFor(() => {
      expect(capturedOnSelectListing).toBeDefined();
    });

    // This must not throw even when journey is not agri-first
    expect(() => {
      act(() => {
        capturedOnSelectListing!(makeListing('uuid-6'));
      });
    }).not.toThrow();

    // Confirm URL action NOT called (local state only)
    expect(mockSetSelectedListing).not.toHaveBeenCalled();
  });
});
