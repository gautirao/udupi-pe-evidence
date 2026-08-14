/**
 * Issue #1458 — MapDiscovery: filteredAgriListings useMemo filter logic.
 *
 * Asserts that filteredAgriListings correctly applies agriLandCategory,
 * agriFarmhouseAvailable, agriFencingDone, and agriWaterSource filters,
 * and that the result is what DiscoverRightPanel receives as agriGroupListings.
 *
 * (a) agriLandCategory exact match — FARMLAND; PLANTATION and null excluded
 * (b) agriFarmhouseAvailable=true — only true; false and null excluded
 * (c) agriFencingDone=false — only false; true and null excluded
 * (d) agriWaterSource=NOT_AVAILABLE — only NOT_AVAILABLE; WELL and null excluded
 * (d2) agriWaterSource=WELL — only WELL; NOT_AVAILABLE and null excluded
 * (e) Combined filters — landCategory=FARMLAND AND waterSource=WELL (intersection)
 * (f) No filter — all listings pass through
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';

// ─── Capture helper ──────────────────────────────────────────────────────────

// Captures agriGroupListings passed to DiscoverRightPanel; reset before each test.
const capturedAgriGroupListings = vi.hoisted(() => ({
  current: null as AgriMapListingItem[] | null,
}));

// ─── Hoisted handles ─────────────────────────────────────────────────────────

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

const mockUseDiscoverUrlState = vi.hoisted(() => vi.fn());

// Controllable per-test agri listings
const mockAgriListingsData = vi.hoisted(() => ({
  current: null as { listings: AgriMapListingItem[] } | null,
}));

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/components/discover/DiscoverRightPanel', () => ({
  DiscoverRightPanel: vi.fn((props: { agriGroupListings?: AgriMapListingItem[] }) => {
    capturedAgriGroupListings.current = props.agriGroupListings ?? null;
    return <div data-testid="mock-drp" />;
  }),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: vi.fn(() => <div data-testid="mock-property-map" />),
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
  useAgriDestinations: vi.fn(() => ({
    destinations: [],
    isLoading: false,
    isError: false,
    isNotYetPromoted: false,
    error: null,
    refetch: vi.fn(),
  })),
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
    areaKey: null, viewport: null,
    filters: {} as Record<string, unknown>,
    schoolId: null, radiusKm: null,
    q: '', journey: 'agri-first' as const, groupId: null, schoolPicking: undefined,
    selectedGroup: null,
    selectedRegion: 'N' as const,
    selectedMaxKm: 25 as const,
    selectedListing: null as string | null,
    intent: 'buy' as const,
    ...overrides,
  };
}

/** Rich agri item fixture including all 4 Issue #1458 fields. */
const makeAgriItem = (overrides: Partial<AgriMapListingItem>): AgriMapListingItem => ({
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
  ...overrides,
});

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

/** Wait until DiscoverRightPanel receives a non-null agriGroupListings array. */
async function waitForCapture() {
  await waitFor(() => {
    expect(capturedAgriGroupListings.current).not.toBeNull();
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Issue #1458 — filteredAgriListings filter logic (DiscoverRightPanel receives filtered set)', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    mockAgriListingsData.current = null;
    capturedAgriGroupListings.current = null;
    mockUseDiscoverUrlState.mockReturnValue([makeUrlState(), makeDefaultActions()]);
  });

  // ── (a) agriLandCategory exact match ─────────────────────────────────────

  it('(a) agriLandCategory=FARMLAND: only FARMLAND passes; PLANTATION and null excluded', async () => {
    const farmland = makeAgriItem({ landCategory: 'FARMLAND' });
    const plantation = makeAgriItem({ landCategory: 'PLANTATION' });
    const nullCat = makeAgriItem({ landCategory: null });

    mockAgriListingsData.current = { listings: [farmland, plantation, nullCat] };
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ filters: { agriLandCategory: 'FARMLAND' } }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');
    await waitForCapture();

    const result = capturedAgriGroupListings.current!;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(farmland.id);
  });

  // ── (b) agriFarmhouseAvailable=true ──────────────────────────────────────

  it('(b) agriFarmhouseAvailable=true: only true passes; false and null excluded', async () => {
    const withFarmhouse = makeAgriItem({ farmhouseAvailable: true });
    const noFarmhouse = makeAgriItem({ farmhouseAvailable: false });
    const nullFarmhouse = makeAgriItem({ farmhouseAvailable: null });

    mockAgriListingsData.current = { listings: [withFarmhouse, noFarmhouse, nullFarmhouse] };
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ filters: { agriFarmhouseAvailable: true } }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');
    await waitForCapture();

    const result = capturedAgriGroupListings.current!;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(withFarmhouse.id);
  });

  // ── (c) agriFencingDone=false ─────────────────────────────────────────────

  it('(c) agriFencingDone=false: only false passes; true and null excluded', async () => {
    const fenced = makeAgriItem({ fencingDone: true });
    const unfenced = makeAgriItem({ fencingDone: false });
    const nullFencing = makeAgriItem({ fencingDone: null });

    mockAgriListingsData.current = { listings: [fenced, unfenced, nullFencing] };
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ filters: { agriFencingDone: false } }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');
    await waitForCapture();

    const result = capturedAgriGroupListings.current!;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(unfenced.id);
  });

  // ── (d) agriWaterSource=NOT_AVAILABLE ────────────────────────────────────

  it('(d) agriWaterSource=NOT_AVAILABLE: only NOT_AVAILABLE passes; WELL and null excluded', async () => {
    const notAvail = makeAgriItem({ waterSource: 'NOT_AVAILABLE' });
    const well = makeAgriItem({ waterSource: 'WELL' });
    const nullWater = makeAgriItem({ waterSource: null });

    mockAgriListingsData.current = { listings: [notAvail, well, nullWater] };
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ filters: { agriWaterSource: 'NOT_AVAILABLE' } }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');
    await waitForCapture();

    const result = capturedAgriGroupListings.current!;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(notAvail.id);
  });

  // ── (d2) agriWaterSource=WELL ────────────────────────────────────────────

  it('(d2) agriWaterSource=WELL: only WELL passes; NOT_AVAILABLE and null excluded', async () => {
    const notAvail = makeAgriItem({ waterSource: 'NOT_AVAILABLE' });
    const well = makeAgriItem({ waterSource: 'WELL' });
    const nullWater = makeAgriItem({ waterSource: null });

    mockAgriListingsData.current = { listings: [notAvail, well, nullWater] };
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ filters: { agriWaterSource: 'WELL' } }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');
    await waitForCapture();

    const result = capturedAgriGroupListings.current!;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(well.id);
  });

  // ── (e) Combined filters: landCategory AND waterSource intersection ───────

  it('(e) Combined agriLandCategory=FARMLAND + agriWaterSource=WELL: only intersection passes', async () => {
    const farmlandWell = makeAgriItem({ landCategory: 'FARMLAND', waterSource: 'WELL' });
    const farmlandNotAvail = makeAgriItem({ landCategory: 'FARMLAND', waterSource: 'NOT_AVAILABLE' });
    const plantationWell = makeAgriItem({ landCategory: 'PLANTATION', waterSource: 'WELL' });

    mockAgriListingsData.current = { listings: [farmlandWell, farmlandNotAvail, plantationWell] };
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ filters: { agriLandCategory: 'FARMLAND', agriWaterSource: 'WELL' } }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');
    await waitForCapture();

    const result = capturedAgriGroupListings.current!;
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(farmlandWell.id);
  });

  // ── (f) No filter — all listings pass through ─────────────────────────────

  it('(f) No agri filters set: all listings pass through to DiscoverRightPanel', async () => {
    const a = makeAgriItem({ landCategory: 'FARMLAND', waterSource: 'WELL', farmhouseAvailable: true, fencingDone: false });
    const b = makeAgriItem({ landCategory: 'PLANTATION', waterSource: 'NOT_AVAILABLE', farmhouseAvailable: false, fencingDone: true });
    const c = makeAgriItem({ landCategory: null, waterSource: null, farmhouseAvailable: null, fencingDone: null });

    mockAgriListingsData.current = { listings: [a, b, c] };
    // filters is empty object (no agri filter keys) — all listings must pass
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ filters: {} }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');
    await waitForCapture();

    const result = capturedAgriGroupListings.current!;
    // All 3 listings should reach DiscoverRightPanel unfiltered
    expect(result).toHaveLength(3);
    const ids = result.map((l) => l.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids).toContain(c.id);
  });
});
