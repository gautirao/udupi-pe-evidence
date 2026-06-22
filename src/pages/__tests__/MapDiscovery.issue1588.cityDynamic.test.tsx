/**
 * Issue #1588 follow-up — Discover landing is city-dynamic, not hardcoded to Udupi.
 *
 * WHAT THIS TESTS (map markers / area pills):
 *   MapDiscovery derives the overview area markers from `discoverAreas`, which is
 *   fetched per-city via useDiscoverMapData → useDiscoverAreas. The `overviewAreas`
 *   derivation must therefore reflect ONLY the selected city's data:
 *
 *     - Selected city has areas with listings → those areas are passed to PropertyMap.
 *     - Selected city has NO areas/listings (e.g. Bangalore) → an EMPTY areas[] is
 *       passed. No other city's (Udupi's) markers may leak in, and no fabricated
 *       0-property markers appear on the calm landing.
 *
 * Companion copy/empty-state tests live in
 *   src/components/discover/__tests__/DiscoverRightPanel.test.tsx and JourneySwitcher.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

// ─── Capture helper ──────────────────────────────────────────────────────────

const capturedAreas: Array<DiscoverArea[]> = [];

// ─── Hoisted handles ─────────────────────────────────────────────────────────

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);
const mockUseDiscoverUrlState = vi.hoisted(() => vi.fn());
const mockUseDiscoverAreas = vi.hoisted(() => vi.fn());

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: vi.fn((props: { areas?: DiscoverArea[] }) => {
    capturedAreas.push(props.areas ?? []);
    return <div data-testid="mock-property-map" />;
  }),
  PropertyListingWithImages: vi.fn(),
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

const UDUPI_AREAS = {
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

// Bangalore has no live property areas — the backend returns an empty set for the city.
const BANGALORE_EMPTY = { city: 'bangalore', areas: [] as DiscoverArea[] };

// Bangalore returns KNOWN areas but every one has zero live listings. The public
// landing must still render NO markers (no faint "Yelahanka 0 properties" pins).
const BANGALORE_ZERO_AREAS = {
  city: 'bangalore',
  areas: [
    {
      areaKey: 'IN|KA|Bengaluru|Yelahanka',
      name: 'Yelahanka',
      geoCenterLat: 13.1007,
      geoCenterLon: 77.5963,
      listingCount: 0,
      schoolCount: 0,
    },
    {
      areaKey: 'IN|KA|Bengaluru|Marathahalli',
      name: 'Marathahalli',
      geoCenterLat: 12.9569,
      geoCenterLon: 77.7011,
      listingCount: 0,
      schoolCount: 0,
    },
  ],
};

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: () => mockUseDiscoverAreas(),
}));

vi.mock('@/hooks/useAgriMapListings', () => ({
  useAgriMapListings: vi.fn(() => ({
    data: null, isLoading: false, isError: false, refetch: vi.fn(),
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
    setIntent: vi.fn(),
    selectRegionalGroup: vi.fn(), setRegion: vi.fn(), setRegionWithMaxKm: vi.fn(),
    setMaxKm: vi.fn(), clearRegionAndMaxKm: vi.fn(), setSelectedListing: vi.fn(),
    clearSelectedListing: vi.fn(), enterSchoolPicking: vi.fn(), clearSchoolPicking: vi.fn(),
    backToSchoolPicking: vi.fn(), clearSchoolSelection: vi.fn(), clearAreaSelection: vi.fn(),
    setLocality: vi.fn(), clearLocality: vi.fn(), clearAgriFilters: vi.fn(),
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
    journey: null as 'area-first' | 'school-first' | 'agri-first' | null,
    groupId: null,
    schoolPicking: undefined,
    selectedGroup: null,
    selectedRegion: null,
    selectedMaxKm: null,
    selectedListing: null as string | null,
    selectedLocality: null,
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

function lastCapturedAreas(): DiscoverArea[] {
  return capturedAreas[capturedAreas.length - 1] ?? [];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Issue #1588 — Discover landing markers are city-scoped (no Udupi leak)', () => {
  beforeEach(() => {
    capturedAreas.length = 0;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    mockUseDiscoverAreas.mockReturnValue({ data: UDUPI_AREAS, isLoading: false });
  });

  it('Udupi landing passes the city\'s areas to PropertyMap (regression — markers present)', async () => {
    mockUseDiscoverAreas.mockReturnValue({ data: UDUPI_AREAS, isLoading: false });
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ city: 'udupi' }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi');

    await waitFor(() => expect(capturedAreas.length).toBeGreaterThan(0));
    expect(lastCapturedAreas().length).toBeGreaterThan(0);
  });

  it('Bangalore (no listings) passes EMPTY areas — no Udupi/area pills leak in', async () => {
    mockUseDiscoverAreas.mockReturnValue({ data: BANGALORE_EMPTY, isLoading: false });
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ city: 'bangalore' }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=bangalore');

    await waitFor(() => expect(capturedAreas.length).toBeGreaterThan(0));
    // Every render passed [] — no fabricated 0-property markers, no Udupi data leak.
    expect(capturedAreas.every((a) => a.length === 0)).toBe(true);
  });

  it('Bangalore with known areas but ALL 0 listings shows NO markers (no faint 0-property pins)', async () => {
    mockUseDiscoverAreas.mockReturnValue({ data: BANGALORE_ZERO_AREAS, isLoading: false });
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ city: 'bangalore' }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=bangalore');

    await waitFor(() => expect(capturedAreas.length).toBeGreaterThan(0));
    // The landing renders only areas with live properties; all areas here have
    // listingCount 0, so PropertyMap must receive [] on every render — the map
    // stays clean rather than showing muted "0 properties" markers.
    expect(capturedAreas.every((a) => a.length === 0)).toBe(true);
  });
});
