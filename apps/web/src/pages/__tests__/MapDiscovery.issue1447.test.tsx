/**
 * Issue #1447 — MapDiscovery: sector overlay fit + map zoom correctness for cumulative maxKm.
 *
 * Tests the updated agriGroupFocusBounds useEffect which now unions sector geometry
 * with listing coordinates so the directional cone is always fully framed.
 *
 * AC1: sector-only bounds when no valid listings (empty listings array)
 * AC2: union bounds when a listing is inside the sector
 * AC3: larger maxKm produces larger bounds span
 * AC4: region cleared → focusBounds null
 * AC5: cityCenter unavailable → listing-only fallback (no crash)
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

// Captures focusBounds values passed to PropertyMap across renders.
// Reset before each test via splice.
const capturedFocusBounds: Array<[[number, number], [number, number]] | null | undefined> = [];

// ─── Hoisted handles ─────────────────────────────────────────────────────────

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

const mockUseDiscoverUrlState = vi.hoisted(() => vi.fn());

// Controllable per-test agri listings data
const mockAgriListingsData = vi.hoisted(() => ({
  current: null as { listings: AgriMapListingItem[] } | null,
}));

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// PropertyMap: capture focusBounds on each render
vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: vi.fn(({ focusBounds }: { focusBounds?: [[number, number], [number, number]] | null }) => {
    capturedFocusBounds.push(focusBounds);
    return <div data-testid="mock-property-map" />;
  }),
  PropertyListingWithImages: vi.fn(),
}));

vi.mock('@/components/layout/AppLayout', () => ({ RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Issue #1953 (build step 2) — MapDiscovery is no longer a production caller
// of useDiscoverUrlState(); it consumes the DiscoverProvider facade instead,
// so this suite mocks the facade module rather than the underlying hook.
vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => mockUseDiscoverUrlState()[0],
  useDiscoverViewport: () => mockUseDiscoverUrlState()[0].viewport,
  useDiscoverActions: () => mockUseDiscoverUrlState()[1],
  // Issue #1953 (build step 3) — MapDiscovery now also reads useDiscoverShell
  // (mobileView only, for the RH4 bboxTimerRef clear-on-leave-MAP effect).
  // This suite doesn't exercise the mobile shell, so a static desktop/LIST
  // stub is sufficient.
  useDiscoverShell: () => ({
    mobileView: 'LIST',
    setMobileView: vi.fn(),
    isMobileShell: false,
    isAreaSetDraftOpen: false,
    openAreaSetDraft: vi.fn(),
    closeAreaSetDraft: vi.fn(),
    fitAreaSet: vi.fn(),
    focusAreaSetMember: vi.fn(),
    registerAreaSetCameraActions: vi.fn(),
    getAreaSetCameraRestoreRequest: vi.fn(() => null),
    setAreaSetCameraRestoreRequest: vi.fn(),
    // Issue #2729 (R1 fix) — new required shell member (see context/types.ts).
    canonicalScopeLabel: null,
    setCanonicalScopeLabel: vi.fn(),
  }),
}));

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

// Udupi center from CITY_CONFIG — used to compute expected sector bounds
const UDUPI_LAT = 13.3409;
const UDUPI_LON = 74.7421;

// N at maxKm=25 sector extends north; maxLat should be significantly > UDUPI_LAT
// (approximately UDUPI_LAT + 25km/111km_per_deg ≈ UDUPI_LAT + 0.225)
const APPROX_N_25KM_MAX_LAT = UDUPI_LAT + 0.18; // conservative lower bound

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
    areaKey: null, viewport: null, filters: {}, schoolId: null, radiusKm: null,
    q: '', journey: 'agri-first' as const, groupId: null, schoolPicking: undefined,
    selectedGroup: null,
    selectedRegion: 'N' as const,
    selectedMaxKm: 25 as const,
    selectedListing: null as string | null,
    ...overrides,
  };
}

const makeAgriItem = (id: string, lat: number, lon: number): AgriMapListingItem => ({
  id, areaKey: 'IN|KA|Udupi|Manipal', latitude: lat, longitude: lon,
  propertyType: 'agricultural_land', locality: 'Test Village',
  landArea: 2.5, landAreaUnit: 'acre', computedAreaAcres: 2.5, pricePaise: 300000000,
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Issue #1447 — agriGroupFocusBounds includes sector geometry', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    mockAgriListingsData.current = null;
    capturedFocusBounds.splice(0);
    mockUseDiscoverUrlState.mockReturnValue([makeUrlState(), makeDefaultActions()]);
  });

  it('AC1: sector-only bounds when no valid listings — non-null and covers ≥25km north', async () => {
    // Empty listings — only sector geometry should frame the viewport
    mockAgriListingsData.current = { listings: [] };
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ selectedRegion: 'N', selectedMaxKm: 25 }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');

    // Wait for PropertyMap to receive a non-null focusBounds
    await waitFor(() => {
      const nonNull = capturedFocusBounds.filter(b => b != null);
      expect(nonNull.length).toBeGreaterThan(0);
    });

    const lastBounds = capturedFocusBounds.filter(b => b != null).at(-1)!;
    const [[minLat], [maxLat]] = lastBounds;
    // N sector at 25km: maxLat should extend well north of Udupi centroid
    expect(maxLat).toBeGreaterThan(APPROX_N_25KM_MAX_LAT);
    // minLat should be at or near centroid (apex is at centroid)
    expect(minLat).toBeLessThanOrEqual(UDUPI_LAT + 0.01);
  });

  it('AC2: union bounds with listings — focusBounds at least as large as sector bounds', async () => {
    // Listing inside the sector (north of Udupi)
    mockAgriListingsData.current = { listings: [makeAgriItem('listing-1', 13.38, 74.75)] };
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ selectedRegion: 'N', selectedMaxKm: 25 }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');

    await waitFor(() => {
      const nonNull = capturedFocusBounds.filter(b => b != null);
      expect(nonNull.length).toBeGreaterThan(0);
    });

    const lastBounds = capturedFocusBounds.filter(b => b != null).at(-1)!;
    const [[, minLon], [maxLat]] = lastBounds;

    // Union should extend at least as far north as the sector
    expect(maxLat).toBeGreaterThan(APPROX_N_25KM_MAX_LAT);
    // And should include the listing's lon (74.75)
    expect(minLon).toBeLessThanOrEqual(74.75);
  });

  it('AC3: maxKm=50 produces larger lat span than maxKm=25', async () => {
    mockAgriListingsData.current = { listings: [] };

    // Render with maxKm=25 first
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ selectedRegion: 'N', selectedMaxKm: 25 }),
      makeDefaultActions(),
    ]);

    const { rerender } = renderAt('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');

    await waitFor(() => {
      const nonNull = capturedFocusBounds.filter(b => b != null);
      expect(nonNull.length).toBeGreaterThan(0);
    });

    const bounds25 = capturedFocusBounds.filter(b => b != null).at(-1)!;
    const span25 = bounds25[1][0] - bounds25[0][0];

    // Clear capture, update to maxKm=50
    capturedFocusBounds.splice(0);
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ selectedRegion: 'N', selectedMaxKm: 50 }),
      makeDefaultActions(),
    ]);

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/discover?city=udupi&journey=agri-first&region=N&maxKm=50']}>
          <Routes>
            <Route path="/discover" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
            <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const nonNull = capturedFocusBounds.filter(b => b != null);
      expect(nonNull.length).toBeGreaterThan(0);
    });

    const bounds50 = capturedFocusBounds.filter(b => b != null).at(-1)!;
    const span50 = bounds50[1][0] - bounds50[0][0];

    expect(span50).toBeGreaterThan(span25);
  });

  it('AC4: region cleared → focusBounds is null', async () => {
    mockAgriListingsData.current = { listings: [] };
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ selectedRegion: null, selectedMaxKm: null }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=agri-first');

    // Give React time to settle
    await waitFor(() => {
      // PropertyMap must have been called at least once
      expect(capturedFocusBounds.length).toBeGreaterThan(0);
    });

    // All focusBounds calls while region is null should yield null (or undefined/activeFocusBounds)
    // The agriGroupFocusBounds state is null, so PropertyMap receives activeFocusBounds ?? null.
    // activeFocusBounds from useDiscoverMapData is undefined for empty data, so focusBounds=null.
    const lastBounds = capturedFocusBounds.at(-1);
    // null or undefined both acceptable — not a valid sector bbox
    expect(lastBounds == null || lastBounds === undefined).toBe(true);
  });

  it('AC5: cityCenter unavailable (unknown city slug) → no crash, CityNotSupported renders', async () => {
    // 'unknown-city' is not in CITY_CONFIG → isCityValid=false → early-return CityNotSupported.
    // PropertyMap is never mounted (expected), but the component must not throw.
    // The sector-bounds path that calls getSectorBounds is guarded by cityCenter != null,
    // so there is no crash even though cityCenter=undefined.
    const listing = makeAgriItem('listing-x', 13.40, 74.75);
    mockAgriListingsData.current = { listings: [listing] };
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({ city: 'unknown-city', selectedRegion: 'N', selectedMaxKm: 25 }),
      makeDefaultActions(),
    ]);

    let renderError: unknown = null;
    try {
      renderAt('/discover?city=unknown-city&journey=agri-first&region=N&maxKm=25');
    } catch (e) {
      renderError = e;
    }

    // No throw — the cityCenter=undefined guard in the useEffect is safe
    expect(renderError).toBeNull();

    // CityNotSupported screen rendered (isCityValid=false early-return path)
    await waitFor(() => {
      expect(document.body.textContent).toContain('City not supported');
    });

    // PropertyMap was NOT mounted for an unsupported city — this is correct behaviour
    expect(capturedFocusBounds.filter(b => b != null).length).toBe(0);
  });
});
