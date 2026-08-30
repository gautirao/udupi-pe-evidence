/**
 * Issue #1178 — MapDiscovery integration: group card highlight + invalid-groupId notice.
 *
 * ORIGINALLY, the area-groups-landing panel (AreaGroupsLandingPanel), on cold load:
 *   AC4 — highlighted the deep-linked group card when ?groupId=<valid>.
 *   AC3 — showed a non-alarming notice (no highlight) when ?groupId=<invalid>.
 *   Whitespace groupId behaved like normal browse (no notice, no highlight).
 *   AC2 — clicking a different group card updated the URL groupId and moved the
 *         highlight; "back to all" cleared groupId and returned to the L1 list.
 *
 * Issue #1956 PR-6 (final cutover, Step 3) — AreaGroupsLandingPanel is DELETED.
 *
 * Issue #1956 PR-6 REWORK ([rulings.oq_a_v2], superseding the retain-legacy
 * Option A guard this file previously asserted) — `journey=area-first` mounts
 * the canonical `DiscoverAreasJourneyPanel` UNCONDITIONALLY again, with no
 * legacy-routing exception. All four URLs below carry only a `groupId` (no
 * `areaKey`), which is exactly the case
 * `[orchestrator_judgement_groupid_only]` covers: there is no resolved AREA to
 * preserve and no `groupId` -> node resolution path exists, so canonical
 * mounts at the city root and the stale `groupId` is ignored, rather than
 * falling back to the deleted group-highlight/invalid-notice/Level-2 UI (or
 * even the `AreaSelectionPanel` placeholder — that placeholder is reachable
 * only via a direct component-level render of `panelContent="area-groups-
 * landing"`, e.g. `DiscoverRightPanel.routing.test.tsx`, never through this
 * page-level gate). Updated below to assert the real, current destination.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';

// ─── Hoisted handles ───────────────────────────────────────────
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

// ─── Mocks ─────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: () => <div data-testid="property-map-mock" />,
}));

vi.mock('@/components/layout/AppLayout', () => ({ RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const COASTAL_AREA_KEY = 'IN|KA|Udupi|Malpe';
const HILLS_AREA_KEY = 'IN|KA|Udupi|Manipal';
const AREAS_RESPONSE = {
  city: 'udupi',
  areas: [
    {
      areaKey: COASTAL_AREA_KEY,
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
      areaKey: HILLS_AREA_KEY,
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

// Two real groups whose member areas exist in AREAS_RESPONSE.
const GROUPS = [
  {
    id: 'coastal-homes',
    name: 'Coastal Homes',
    subtitle: 'Malpe beachfront',
    region_label: 'Coast',
    school_count: 4,
    area_keys: [COASTAL_AREA_KEY],
  },
  {
    id: 'hill-homes',
    name: 'Hill Homes',
    subtitle: 'Manipal uplands',
    region_label: 'Hills',
    school_count: 0,
    area_keys: [HILLS_AREA_KEY],
  },
];

vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: vi.fn(() => ({ data: { groups: GROUPS }, isLoading: false })),
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

// Spy that exposes the current URL search string for URL-contract assertions.
let currentSearch = '';
function LocationSpy() {
  const location = useLocation();
  currentSearch = location.search;
  return null;
}

const renderAt = (url: string) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={[url]}>
        <LocationSpy />
        <Routes>
          <Route path="/discover" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
          <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('Issue #1178 — MapDiscovery group highlight + invalid notice', () => {
  beforeEach(() => {
    currentSearch = '';
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });

  it('AC4 (changed): cold-load with a valid ?groupId (no areaKey) mounts canonical at the city root, per [orchestrator_judgement_groupid_only]', async () => {
    renderAt('/discover?city=udupi&journey=area-first&groupId=coastal-homes');

    // Canonical mounts instead of the legacy DiscoverRightPanel — the legacy
    // panel's own always-present wrapper must be absent.
    await waitFor(() => {
      expect(screen.queryByTestId('discover-right-panel')).not.toBeInTheDocument();
    });
    // Neither the deleted Level-1/Level-2 legacy UI, nor its AreaSelectionPanel
    // placeholder fallback, is reachable through this page-level gate.
    expect(screen.queryByTestId('area-group-level2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('browse-all-area-IN|KA|Udupi|Malpe')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-group-back-to-all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-group-card-coastal-homes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-group-invalid-message')).not.toBeInTheDocument();
  });

  it('AC3 (changed): cold-load with an invalid ?groupId (no areaKey) mounts canonical the same way — an unknown groupId is simply ignored', async () => {
    renderAt('/discover?city=udupi&journey=area-first&groupId=nonexistent-slug');

    await waitFor(() => {
      expect(screen.queryByTestId('discover-right-panel')).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('area-group-invalid-message')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-group-card-coastal-homes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-group-card-hill-homes')).not.toBeInTheDocument();
  });

  it('whitespace ?groupId (changed): behaves the same as any other groupId-only URL — canonical mounts, never the deleted browse UI', async () => {
    renderAt('/discover?city=udupi&journey=area-first&groupId=%20');

    await waitFor(() => {
      expect(screen.queryByTestId('discover-right-panel')).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('area-group-invalid-message')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-group-card-coastal-homes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-group-card-hill-homes')).not.toBeInTheDocument();
  });

  it('AC2 (changed): no groupId at all lands on the identical canonical Areas surface as a groupId-only URL', async () => {
    renderAt('/discover?city=udupi&journey=area-first');

    // Canonical mounts instead of the legacy DiscoverRightPanel — the legacy
    // panel's own always-present wrapper must be absent.
    await waitFor(() => {
      expect(screen.queryByTestId('discover-right-panel')).not.toBeInTheDocument();
    });
    // The deleted Level-1/Level-2 legacy UI must never appear either.
    expect(screen.queryByTestId('area-group-level2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-group-card-coastal-homes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-group-card-hill-homes')).not.toBeInTheDocument();
  });
});
