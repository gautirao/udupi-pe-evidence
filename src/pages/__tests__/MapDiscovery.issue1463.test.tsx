/**
 * Issue #1463 — MapDiscovery: area rings suppressed in agri-first journey.
 *
 * WHAT THIS TESTS:
 *   Line 1781 of MapDiscovery.tsx:
 *     `areas={mapZoom <= AREA_LAYER_MAX_ZOOM && !isAgriJourney ? discoverAreas : []}`
 *
 *   The `!isAgriJourney` guard ensures that residential area rings (Malpe, Manipal, etc.)
 *   are hidden when the user is in agri-first mode.
 *
 * Tests:
 * P1  area-first journey: PropertyMap receives non-empty areas (rings visible)
 * P2  agri-first journey: PropertyMap receives empty areas (rings hidden)
 * P3  school-first journey: PropertyMap receives non-empty areas (rings visible)
 *
 * Default mapZoom is 11 (from CITY_CONFIG / useDiscoverPageState default),
 * which is ≤ AREA_LAYER_MAX_ZOOM (12), so the zoom condition is satisfied —
 * the only variable under test is isAgriJourney.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

// ─── Capture helper ──────────────────────────────────────────────────────────

// Collects every areas[] value passed to PropertyMap across renders.
// Cleared before each test.
const capturedAreas: Array<DiscoverArea[]> = [];

// ─── Hoisted handles ─────────────────────────────────────────────────────────

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

const mockUseDiscoverUrlState = vi.hoisted(() => vi.fn());

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Capture areas prop on each render.
vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: vi.fn((props: { areas?: DiscoverArea[] }) => {
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    viewport: null,           // no viewport → mapZoom defaults to 11 (≤ AREA_LAYER_MAX_ZOOM=12)
    filters: {} as Record<string, unknown>,
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: 'area-first' as 'area-first' | 'school-first' | 'agri-first' | null,
    groupId: null,
    schoolPicking: undefined,
    selectedGroup: null,
    selectedRegion: 'N' as const,
    selectedMaxKm: 25 as const,
    selectedListing: null as string | null,
    intent: 'buy' as const,
    ...overrides,
  };
}

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/discover" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
          <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Returns the last areas[] value captured from PropertyMap renders. */
function lastCapturedAreas(): DiscoverArea[] {
  return capturedAreas[capturedAreas.length - 1] ?? [];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Issue #1463 — area rings suppressed in agri-first; visible in other journeys', () => {
  beforeEach(() => {
    capturedAreas.length = 0;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  /**
   * P1 — area-first: residential area rings must be visible (non-empty areas prop).
   * mapZoom=11 (default) ≤ AREA_LAYER_MAX_ZOOM=12 AND !isAgriJourney → discoverAreas passed.
   */
  it('P1: area-first journey passes non-empty areas to PropertyMap (area rings visible)', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ journey: 'area-first' }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=area-first');

    await waitFor(() => {
      expect(capturedAreas.length).toBeGreaterThan(0);
    });

    expect(lastCapturedAreas().length).toBeGreaterThan(0);
  });

  /**
   * P2 — agri-first: residential area rings must be hidden (empty areas prop).
   * !isAgriJourney=false → [] regardless of zoom.
   */
  it('P2: agri-first journey passes empty areas to PropertyMap (area rings hidden)', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ journey: 'agri-first' }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');

    await waitFor(() => {
      expect(capturedAreas.length).toBeGreaterThan(0);
    });

    // Every render must have passed [] — the rings are always hidden in agri-first.
    expect(capturedAreas.every((a) => a.length === 0)).toBe(true);
  });

  /**
   * P3 — school-first: residential area rings must be visible (non-empty areas prop).
   * mapZoom=11 (default) ≤ AREA_LAYER_MAX_ZOOM=12 AND !isAgriJourney → discoverAreas passed.
   */
  it('P3: school-first journey passes non-empty areas to PropertyMap (area rings visible)', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ journey: 'school-first' }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=school-first');

    await waitFor(() => {
      expect(capturedAreas.length).toBeGreaterThan(0);
    });

    expect(lastCapturedAreas().length).toBeGreaterThan(0);
  });
});
