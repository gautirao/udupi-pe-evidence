/**
 * Issue #1745 Batch B map-hierarchy fix — handleOverviewAreaClick routing (code-review
 * follow-up).
 *
 * BUG this covers: at the journeyless city landing (no journey, scope=null),
 * MapDiscovery renders macro-region bubbles (mapLayerKind === 'macro-region-bubbles')
 * whose `areaKey` is a region GROUP id (see the 'macro-region-bubbles' branch of the
 * `overviewAreas` memo), not a real area. Before this fix, `handleOverviewAreaClick`'s
 * group special-cases were gated on `isTopGroupedAreaOrSchool` / `isTopGroupedAgri`
 * (both journey-gated, so false at the journeyless landing) — a bubble click fell
 * through to `handleAreaClick(area)`, which set `areaKey=<groupId>` (an invalid area)
 * in the URL instead of drilling into the region.
 *
 * FIX: `handleOverviewAreaClick` now branches on `mapLayerKind === 'macro-region-bubbles'`
 * and calls `urlActions.setScope(area.areaKey)` — mirroring the GuidedEntryPanel region
 * card (see GuidedEntryPanel.tsx `handleRegionClick`) — instead of falling through.
 *
 * Harness mirrors MapDiscovery.issue1186.test.tsx: PropertyMap is mocked to capture the
 * `areas` + `onAreaClick` props (leaflet marker clicks cannot be simulated in JSDOM), and
 * a LocationProbe renders the live URL so assertions can inspect the resulting URL
 * contract directly, rather than mocking urlActions (proves the REAL useDiscoverUrlState
 * wiring, not just that some mock fn was called).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

// ─── Hoisted handles ────────────────────────────────────────────
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

// Captures the most recent `areas` + `onAreaClick` PropertyMap received.
const propertyMapProps = vi.hoisted(() => ({
  current: null as { areas: AreaPoint[]; onAreaClick?: (area: AreaPoint) => void } | null,
}));

// ─── Mocks ──────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: (props: { areas?: AreaPoint[]; onAreaClick?: (area: AreaPoint) => void }) => {
    propertyMapProps.current = { areas: props.areas ?? [], onAreaClick: props.onAreaClick };
    return <div data-testid="property-map-mock" />;
  },
}));

vi.mock('@/components/layout/AppLayout', () => ({ RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const COASTAL_GROUP_ID = 'coastal-homes';
const AREA_KEY_A = 'IN|KA|Udupi|Malpe';
const AREA_KEY_B = 'IN|KA|Udupi|Ullal';

const COASTAL_GROUP = {
  id: COASTAL_GROUP_ID,
  name: 'Coastal Homes',
  subtitle: null,
  region_label: null,
  school_count: 0,
  area_keys: [AREA_KEY_A, AREA_KEY_B],
  focus_lat: 13.35,
  focus_lon: 74.75,
};

const AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: AREA_KEY_A,
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
      trendDirection: 'stable' as const,
    },
    {
      areaKey: AREA_KEY_B,
      areaLabel: 'Ullal',
      name: 'Ullal',
      geo_center_lat: 13.36,
      geo_center_lon: 74.71,
      geoCenterLat: 13.36,
      geoCenterLon: 74.71,
      minLat: 13.35, minLon: 74.7, maxLat: 13.37, maxLon: 74.72,
      bbox: [[13.35, 74.7], [13.37, 74.72]] as [[number, number], [number, number]],
      listingCount: 2,
      schoolCount: 1,
      trendDirection: 'stable' as const,
    },
  ],
};

const SUMMARY_RESPONSE = {
  city: 'udupi',
  propertyType: null,
  groupBy: 'area_group',
  totalActiveListings: 6,
  regions: [{ regionKey: COASTAL_GROUP_ID, regionLabel: 'Coastal Homes', listingCount: 6 }],
  hotspots: [],
  generatedAt: new Date().toISOString(),
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
  useDiscoverFilteredMarkers: vi.fn(() => ({
    data: undefined, isLoading: false, isFetching: false,
  })),
}));

vi.mock('@/hooks/useDiscoverSummary', () => ({
  useDiscoverSummary: vi.fn(() => ({ data: SUMMARY_RESPONSE, isLoading: false, isError: false })),
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
  })),
}));

const mockUseAreaGroups = vi.hoisted(() =>
  vi.fn((_city: string) => ({ data: { groups: [COASTAL_GROUP] }, isLoading: false })),
);

vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: (...args: Parameters<typeof mockUseAreaGroups>) => mockUseAreaGroups(...args),
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

/** Renders the live URL (path + search) so tests can assert URL-state mutations. */
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location-probe">{loc.pathname + loc.search}</div>;
}

const renderAt = (url: string) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
        <Routes>
          <Route path="/discover" element={<MapDiscovery />} />
          <Route path="*" element={<MapDiscovery />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('Issue #1745 Batch B — handleOverviewAreaClick routing (code-review BLOCKING fix)', () => {
  beforeEach(() => {
    propertyMapProps.current = null;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    mockUseAreaGroups.mockReset();
    mockUseAreaGroups.mockReturnValue({ data: { groups: [COASTAL_GROUP] }, isLoading: false });
  });

  it('macro-region bubble click (journeyless landing, scope=null) sets scope=<groupId>, NOT areaKey', async () => {
    renderAt('/discover?city=udupi');

    await waitFor(() => {
      expect(propertyMapProps.current?.onAreaClick).toBeTypeOf('function');
    });
    // The rendered bubble set is the macro-region group ('macro-region-bubbles' branch):
    // one bubble whose areaKey is the group id, not a real area key.
    const bubbles = propertyMapProps.current!.areas;
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].areaKey).toBe(COASTAL_GROUP_ID);

    act(() => {
      propertyMapProps.current!.onAreaClick!(bubbles[0]);
    });

    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe).toHaveTextContent(`scope=${COASTAL_GROUP_ID}`);
    });
    const probe = screen.getByTestId('location-probe');
    // Must NOT have set areaKey to the group id (the pre-fix bug).
    expect(probe.textContent).not.toContain(`areaKey=${encodeURIComponent(COASTAL_GROUP_ID)}`);
    expect(probe.textContent).not.toContain(`areaKey=${COASTAL_GROUP_ID}`);
  });

  it('region-zone-areas pill click (journeyless landing, scope=<groupId>) sets a real areaKey', async () => {
    renderAt(`/discover?city=udupi&scope=${COASTAL_GROUP_ID}`);

    await waitFor(() => {
      expect(propertyMapProps.current?.onAreaClick).toBeTypeOf('function');
    });
    // The rendered set is now the group's real member areas ('region-zone-areas' branch).
    const pills = propertyMapProps.current!.areas;
    expect(pills.map((a) => a.areaKey).sort()).toEqual([AREA_KEY_A, AREA_KEY_B].sort());

    const malpe = pills.find((a) => a.areaKey === AREA_KEY_A)!;
    act(() => {
      propertyMapProps.current!.onAreaClick!(malpe);
    });

    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe).toHaveTextContent(`areaKey=${encodeURIComponent(AREA_KEY_A)}`);
    });
  });

  // ─── Guard fix (rework cycle) — zero-groups macro-region-bubbles fallback ────

  it('zero-groups fallback: macro-region-bubbles renders real area pills, and clicking one sets areaKey (NOT scope)', async () => {
    // City has no area_groups — overviewAreas' 'macro-region-bubbles' branch falls
    // back to liveAreas (real areas), per `if (groups.length === 0) return liveAreas;`.
    mockUseAreaGroups.mockReturnValue({ data: { groups: [] }, isLoading: false });

    renderAt('/discover?city=udupi');

    await waitFor(() => {
      expect(propertyMapProps.current?.onAreaClick).toBeTypeOf('function');
    });
    // The rendered set is the real fallback areas, NOT a group bubble.
    const pills = propertyMapProps.current!.areas;
    expect(pills.map((a) => a.areaKey).sort()).toEqual([AREA_KEY_A, AREA_KEY_B].sort());

    const malpe = pills.find((a) => a.areaKey === AREA_KEY_A)!;
    act(() => {
      propertyMapProps.current!.onAreaClick!(malpe);
    });

    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe).toHaveTextContent(`areaKey=${encodeURIComponent(AREA_KEY_A)}`);
    });
    // Must NOT have taken the setScope path with a real areaKey (the guard's purpose).
    const probe = screen.getByTestId('location-probe');
    expect(probe.textContent).not.toContain(`scope=${AREA_KEY_A}`);
    expect(probe.textContent).not.toContain(`scope=${encodeURIComponent(AREA_KEY_A)}`);
  });

  // ─── Fix B (rework cycle) — no-city-param default resolution ────────────────

  it('no-city-param default: useAreaGroups is called with the DEFAULTED city, not the raw empty urlState.city', async () => {
    // Plain /discover with no ?city= param — urlState.city resolves to '' while the
    // panel uses the DEFAULT_CITY-defaulted value. Both group hooks must use the
    // same defaulted city so macro-region-bubbles doesn't fall back to liveAreas
    // due to a spuriously-disabled useAreaGroups({city: ''}) call.
    renderAt('/discover');

    await waitFor(() => {
      expect(mockUseAreaGroups).toHaveBeenCalled();
    });
    const cityArgsUsed = mockUseAreaGroups.mock.calls.map((call) => call[0]);
    expect(cityArgsUsed).toContain('udupi');
    expect(cityArgsUsed).not.toContain('');
  });
});
