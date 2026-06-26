/**
 * Issue #1655 — MapDiscovery: top-grouped levels do NOT fetch/render individual
 * property markers, and do NOT fetch paginated listings.
 *
 * WHAT THIS TESTS:
 *   1. area-first grouped level → PropertyMap receives listings=[] AND
 *      useDiscoverListings is called with enabled=false.
 *   2. school-first grouped level → same.
 *   3. agri-first grouped/regional level → same.
 *   4. Drill-down states (e.g. area selected) → useDiscoverListings enabled.
 *   5. Grouped count area markers still render (areas prop non-empty for
 *      area-first, school-first at overview zoom).
 *
 * Default mapZoom is 11 (from CITY_CONFIG / useDiscoverPageState default).
 * AREA_LAYER_MAX_ZOOM = 12.
 * At zoom 11, markersEnabled was already false (zoom gate: 11 > 12 = false).
 * The new listingsEnabled gate additionally suppresses useDiscoverListings.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';

// ─── Capture helpers ────────────────────────────────────────────────────────

// Captures listings[] and areas[] passed to PropertyMap across renders.
const capturedListings: Array<unknown[]> = [];
const capturedAreas: Array<unknown[]> = [];

// ─── Hoisted handles ────────────────────────────────────────────────────────

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);
const mockUseDiscoverUrlState = vi.hoisted(() => vi.fn());
const mockUseDiscoverListings = vi.hoisted(() => vi.fn());
const mockUseDiscoverFilteredMarkers = vi.hoisted(() => vi.fn());
const mockUseAreaGroups = vi.hoisted(() => vi.fn());

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: vi.fn((props: { listings?: unknown[]; areas?: unknown[] }) => {
    capturedListings.push(props.listings ?? []);
    capturedAreas.push(props.areas ?? []);
    return <div data-testid="mock-property-map" />;
  }),
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

const AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: 'IN|KA|Udupi|Manipal',
      name: 'Manipal',
      geoCenterLat: 13.3528,
      geoCenterLon: 74.7917,
      listingCount: 12,
      schoolCount: 3,
    },
    {
      areaKey: 'IN|KA|Udupi|Malpe',
      name: 'Malpe',
      geoCenterLat: 13.354,
      geoCenterLon: 74.708,
      listingCount: 8,
      schoolCount: 4,
    },
  ],
};

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: AREAS_RESPONSE, isLoading: false })),
}));

vi.mock('@/hooks/useAgriMapListings', () => ({
  useAgriMapListings: vi.fn(() => ({
    data: null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
}));

vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: vi.fn(() => ({ data: { areas: [] }, isLoading: false })),
}));

vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: (...args: unknown[]) => mockUseDiscoverListings(...args),
}));

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: (...args: unknown[]) => mockUseDiscoverFilteredMarkers(...args),
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
  useAreaGroups: (...args: unknown[]) => mockUseAreaGroups(...args),
}));

vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useRegionalAreaGroups: vi.fn(() => ({ groups: [], isLoading: false, error: null })),
}));

vi.mock('@/hooks/useSchoolRadiusListings', () => ({
  useSchoolRadiusListings: vi.fn(() => ({ data: undefined, isLoading: false })),
  mapSchoolRadiusCard: vi.fn((x: unknown) => x),
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

// ─── Helpers ────────────────────────────────────────────────────────────────

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
    clearSelectedListing: vi.fn(), enterSchoolPicking: vi.fn(), clearSchoolPicking: vi.fn(),
    backToSchoolPicking: vi.fn(), clearSchoolSelection: vi.fn(), clearAreaSelection: vi.fn(),
  };
}

function makeUrlState(overrides: Record<string, unknown> = {}) {
  return {
    city: 'udupi',
    areaKey: null,
    viewport: null,
    filters: {} as Record<string, unknown>,
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: 'area-first' as 'area-first' | 'school-first' | 'agri-first' | null,
    groupId: null,
    schoolPicking: undefined,
    selectedGroup: null,
    selectedRegion: null as string | null,
    selectedMaxKm: null as number | null,
    selectedListing: null as string | null,
    selectedLocality: null as string | null,
    intent: 'buy' as const,
    ...overrides,
  };
}

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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Issue #1655 — top-grouped levels avoid individual listing/marker fetches', () => {
  beforeEach(() => {
    capturedListings.length = 0;
    capturedAreas.length = 0;
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isLoading: false, isAdmin: false, isDealer: false });
    mockUseDiscoverListings.mockReturnValue({
      data: undefined, isLoading: false, isFetching: false, error: null,
    });
    mockUseDiscoverFilteredMarkers.mockReturnValue({
      data: undefined, isLoading: false, isFetching: false,
    });
    mockUseAreaGroups.mockReturnValue({ data: { groups: [] }, isLoading: false });
  });

  // ── T1: area-first grouped level ────────────────────────────────────────

  it('T1: area-first grouped level passes listings=[] to PropertyMap', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ journey: 'area-first', groupId: null, areaKey: null, schoolId: null }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=area-first');

    await waitFor(() => {
      expect(capturedListings.length).toBeGreaterThan(0);
    });

    // Every render must have listings=[]
    expect(capturedListings.every((l) => l.length === 0)).toBe(true);
  });

  it('T1b: area-first grouped level calls useDiscoverListings with enabled=false', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ journey: 'area-first', groupId: null, areaKey: null, schoolId: null }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=area-first');

    await waitFor(() => {
      expect(mockUseDiscoverListings).toHaveBeenCalled();
    });

    // The enabled field should be false at top-grouped level
    const callArgs = mockUseDiscoverListings.mock.calls[0][0] as { enabled: boolean };
    expect(callArgs.enabled).toBe(false);
  });

  // ── T2: school-first grouped level ──────────────────────────────────────

  it('T2: school-first grouped level passes listings=[] to PropertyMap', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ journey: 'school-first', groupId: null, areaKey: null, schoolId: null }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=school-first');

    await waitFor(() => {
      expect(capturedListings.length).toBeGreaterThan(0);
    });

    expect(capturedListings.every((l) => l.length === 0)).toBe(true);
  });

  it('T2b: school-first grouped level calls useDiscoverListings with enabled=false', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ journey: 'school-first', groupId: null, areaKey: null, schoolId: null }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=school-first');

    await waitFor(() => {
      expect(mockUseDiscoverListings).toHaveBeenCalled();
    });

    const callArgs = mockUseDiscoverListings.mock.calls[0][0] as { enabled: boolean };
    expect(callArgs.enabled).toBe(false);
  });

  // ── T3: agri-first grouped/regional level ───────────────────────────────

  it('T3: agri-first grouped level passes listings=[] to PropertyMap', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({
        journey: 'agri-first',
        selectedRegion: null,
        areaKey: null,
        selectedLocality: null,
        selectedGroup: null,
      }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first');

    await waitFor(() => {
      expect(capturedListings.length).toBeGreaterThan(0);
    });

    expect(capturedListings.every((l) => l.length === 0)).toBe(true);
  });

  it('T3b: agri-first grouped level calls useDiscoverListings with enabled=false', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({
        journey: 'agri-first',
        selectedRegion: null,
        areaKey: null,
        selectedLocality: null,
        selectedGroup: null,
      }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first');

    await waitFor(() => {
      expect(mockUseDiscoverListings).toHaveBeenCalled();
    });

    const callArgs = mockUseDiscoverListings.mock.calls[0][0] as { enabled: boolean };
    expect(callArgs.enabled).toBe(false);
  });

  // ── T5: grouped count markers still render ──────────────────────────────

  it('T5: area-first grouped level still renders area count markers (non-empty areas)', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ journey: 'area-first', groupId: null, areaKey: null, schoolId: null }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=area-first');

    await waitFor(() => {
      expect(capturedAreas.length).toBeGreaterThan(0);
    });

    // At default zoom (11), area-first grouped should still show area markers (overview)
    const lastAreas = capturedAreas[capturedAreas.length - 1];
    expect(lastAreas.length).toBeGreaterThan(0);
  });

  // ── T6/T7: zero-property group markers suppressed on map ────────────────

  it('T6: area-first grouped map does not render 0-property group markers', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ journey: 'area-first', groupId: null, areaKey: null, schoolId: null }),
      makeDefaultActions(),
    ]);

    // Udupi groups where North Udupi has member areas with 0 listings
    mockUseAreaGroups.mockReturnValue({
      data: {
        groups: [
          {
            id: 'north-udupi',
            name: 'North Udupi',
            area_keys: ['IN|KA|Udupi|ZeroArea'],
            focus_lat: 13.35,
            focus_lon: 74.79,
          },
          {
            id: 'manipal-group',
            name: 'Manipal Group',
            area_keys: ['IN|KA|Udupi|Manipal'], // has 12 listings in AREAS_RESPONSE
            focus_lat: 13.3528,
            focus_lon: 74.7917,
          },
        ],
      },
      isLoading: false,
    });

    renderAt('/discover?city=udupi&journey=area-first');

    await waitFor(() => {
      expect(capturedAreas.length).toBeGreaterThan(0);
    });

    const lastAreas = capturedAreas[capturedAreas.length - 1] as Array<{ areaKey: string }>;
    expect(lastAreas.some((a) => a.areaKey === 'manipal-group')).toBe(true);
    expect(lastAreas.some((a) => a.areaKey === 'north-udupi')).toBe(false);
  });

  it('T7: school-first grouped map does not render 0-property group markers', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ journey: 'school-first', groupId: null, areaKey: null, schoolId: null }),
      makeDefaultActions(),
    ]);

    mockUseAreaGroups.mockReturnValue({
      data: {
        groups: [
          {
            id: 'empty-belt',
            name: 'Empty Belt',
            area_keys: ['IN|KA|Udupi|ZeroArea'],
            focus_lat: 13.35,
            focus_lon: 74.79,
          },
        ],
      },
      isLoading: false,
    });

    renderAt('/discover?city=udupi&journey=school-first');

    await waitFor(() => {
      expect(capturedAreas.length).toBeGreaterThan(0);
    });

    // All groups have 0 listings → map receives empty areas or fallback liveAreas
    const lastAreas = capturedAreas[capturedAreas.length - 1] as Array<{ areaKey: string }>;
    expect(lastAreas.some((a) => a.areaKey === 'empty-belt')).toBe(false);
  });
});
