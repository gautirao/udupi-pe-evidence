/**
 * Issue #1821 — cold-load area drill-down loses tight camera fit when a
 * groupId/scope is present alongside an inherited lat/lon/zoom viewport.
 *
 * Root cause: the deferred areaKey-hydration effect in MapDiscovery.tsx gates
 * the area-specific setPanToArea(match) call behind
 * `if (!initialViewportRef.current)`. initialViewportRef is a useRef snapshot
 * of urlState.viewport taken once at mount (useDiscoverPageState.ts) — it
 * cannot tell a genuinely restored area viewport (#1160/#1069, bare
 * areaKey-only URL) apart from a viewport merely inherited from an earlier
 * group/region navigation step (region -> group -> area drill-down, then
 * reload/bookmark/share).
 *
 * Fix: a companion ref (initialViewportWasBareAreaRef) narrows the trust
 * condition — an inherited viewport is only trusted (area fit suppressed)
 * when the mount-time URL had NO groupId/scope alongside areaKey.
 *
 * This suite mocks useDiscoverUrlState directly (per the MapDiscovery.issue1806
 * pattern) so the mount-time urlState shape — and therefore what
 * initialViewportRef/initialViewportWasBareAreaRef capture at first render —
 * is fully controlled per test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';

// ─── Hoisted handles ───────────────────────────────────────────────────────

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

const mockUseDiscoverUrlState = vi.hoisted(() => vi.fn());
const mockUseAreaGroups = vi.hoisted(() => vi.fn());
const mockUseDiscoverListings = vi.hoisted(() => vi.fn());
const mockUseDiscoverCityListings = vi.hoisted(() => vi.fn());

const propertyMapPropsLog = vi.hoisted(() => ({
  panToAreas: [] as Array<unknown>,
}));

// Captures DiscoverRightPanel's selectedArea prop across renders — the positive
// signal that the deferred areaKey-hydration effect's `if (match)` branch
// actually ran (setSelectedArea(match) fired), independent of whether the
// area-specific setPanToArea call also fired. Needed so the AC2 test proves
// "reached this branch AND correctly chose not to override the viewport",
// not merely "one bad panToArea value never appeared" (which would also pass
// if the branch never ran at all).
const rightPanelPropsLog = vi.hoisted(() => ({
  selectedAreas: [] as Array<unknown>,
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const GROUP_ID = 'airport-belt';
const AREA_KEY_DEVANAHALLI = 'IN|KA|Bengaluru|Devanahalli';
const AREA_KEY_OTHER_MEMBER = 'IN|KA|Bengaluru|Bagalur';

// Devanahalli's OWN bounds — tight, distinct from the group's wide bbox and
// from the stale inherited group/region viewport in the reported bug URL
// (lat=13.16923, lon=77.63743, zoom=12).
const DEVANAHALLI = {
  areaKey: AREA_KEY_DEVANAHALLI,
  areaLabel: 'Devanahalli',
  name: 'Devanahalli',
  geo_center_lat: 13.2437,
  geo_center_lon: 77.7108,
  geoCenterLat: 13.2437,
  geoCenterLon: 77.7108,
  minLat: 13.23, minLon: 77.7, maxLat: 13.26, maxLon: 77.72,
  bbox: [[13.23, 77.7], [13.26, 77.72]] as [[number, number], [number, number]],
  listingCount: 4, schoolCount: 1, trendDirection: 'stable',
};

const AIRPORT_BELT_GROUP = {
  id: GROUP_ID,
  name: 'Airport Belt',
  subtitle: null,
  description: null,
  area_keys: [AREA_KEY_DEVANAHALLI, AREA_KEY_OTHER_MEMBER],
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: (props: { panToArea?: unknown }) => {
    propertyMapPropsLog.panToAreas.push(props.panToArea ?? null);
    return <div data-testid="property-map-mock" />;
  },
}));

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/layout/PublicDiscoverLayout', () => ({
  PublicDiscoverLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/discover/DiscoverRightPanel', () => ({
  DiscoverRightPanel: (props: { selectedArea?: unknown }) => {
    rightPanelPropsLog.selectedAreas.push(props.selectedArea ?? null);
    return <div data-testid="discover-right-panel-mock" />;
  },
}));

vi.mock('@/hooks/useDiscoverUrlState', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useDiscoverUrlState')>(
    '@/hooks/useDiscoverUrlState',
  );
  return { ...actual, useDiscoverUrlState: () => mockUseDiscoverUrlState() };
});

vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: () => mockUseAreaGroups(),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: { city: 'bangalore', areas: [DEVANAHALLI] },
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: () => mockUseDiscoverListings(),
}));

vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: () => mockUseDiscoverCityListings(),
}));

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: vi.fn(() => ({ data: undefined, isLoading: false, isFetching: false })),
}));

vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useRegionalAreaGroups: vi.fn(() => ({ groups: [], isLoading: false, isError: false, refetch: vi.fn() })),
}));

vi.mock('@/hooks/useAgriMapListings', () => ({
  useAgriMapListings: vi.fn(() => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() })),
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
  })),
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDefaultActions() {
  return {
    selectArea: vi.fn(), deselectArea: vi.fn(), setSchoolParams: vi.fn(),
    setFiltersLive: vi.fn(), setFiltersCommitted: vi.fn(),
    setBoardFilters: vi.fn(), setCategoryFilters: vi.fn(),
    clearAreaContext: vi.fn(), clearSchoolContext: vi.fn(),
    startOver: vi.fn(), setJourney: vi.fn(), selectGroup: vi.fn(),
    setSchoolJourney: vi.fn(), setSearchQuery: vi.fn(),
    reportViewport: vi.fn(), setCity: vi.fn(), changeCity: vi.fn(),
    selectRegionalGroup: vi.fn(), setRegion: vi.fn(),
    setRegionWithMaxKm: vi.fn(), setMaxKm: vi.fn(),
    clearRegionAndMaxKm: vi.fn(), setSelectedListing: vi.fn(),
    clearSelectedListing: vi.fn(), setLocality: vi.fn(), clearLocality: vi.fn(),
    enterSchoolPicking: vi.fn(), clearSchoolPicking: vi.fn(),
    backToSchoolPicking: vi.fn(), clearSchoolSelection: vi.fn(),
    clearAreaSelection: vi.fn(),
    enterGroupResults: vi.fn(), clearGroupResults: vi.fn(),
    setScope: vi.fn(),
  };
}

function makeUrlState(overrides: Record<string, unknown> = {}) {
  return {
    city: 'bangalore',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: 'area-first' as const,
    groupId: null,
    scope: null,
    selectedGroup: null,
    schoolPicking: undefined,
    groupResults: undefined,
    intent: 'buy' as const,
    selectedRegion: null,
    selectedMaxKm: null,
    selectedListing: null,
    selectedLocality: null,
    ...overrides,
  };
}

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

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

describe('Issue #1821 — cold-load area drill-down camera fit', () => {
  beforeEach(() => {
    propertyMapPropsLog.panToAreas.length = 0;
    rightPanelPropsLog.selectedAreas.length = 0;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    mockUseAreaGroups.mockReturnValue({ data: { groups: [AIRPORT_BELT_GROUP] }, isLoading: false });
    mockUseDiscoverListings.mockReturnValue({
      data: { content: [], totalElements: 0, page: 0, size: 50, totalPages: 0, aggregates: null },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    mockUseDiscoverCityListings.mockReturnValue({
      data: { areas: [] }, isLoading: false, isError: false, refetch: vi.fn(),
    });
  });

  it('AC1: cold mount with groupId + areaKey + an inherited viewport from a DIFFERENT prior scope fits tightly to the resolved area\'s own bounds', async () => {
    // Reproduces the reported bug shape: region -> group -> area drill-down,
    // then reload/bookmark/share. The lat/lon/zoom in the URL are the STALE
    // group/region viewport (zoom=12, the AREA_PANNER_GROUP_MAX_ZOOM clamp),
    // not Devanahalli's own tight bounds.
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({
        areaKey: AREA_KEY_DEVANAHALLI,
        groupId: GROUP_ID,
        scope: 'north',
        viewport: { lat: 13.16923, lon: 77.63743, zoom: 12 },
      }),
      makeDefaultActions(),
    ]);

    renderAt(
      `/discover?city=bangalore&scope=north&groupId=${GROUP_ID}&lat=13.16923&lon=77.63743&zoom=12&areaKey=${encodeURIComponent(AREA_KEY_DEVANAHALLI)}`,
    );

    await waitFor(() => {
      const last = propertyMapPropsLog.panToAreas.at(-1) as { areaKey?: string } | null;
      expect(last).not.toBeNull();
      // The area-specific fit must fire — panToArea resolves to Devanahalli's
      // OWN AreaPoint (areaKey === Devanahalli), not the inherited group
      // viewport being silently kept (which would leave panToArea unset/null
      // or stuck at a stale/synthetic group-bounds value).
      expect(last?.areaKey).toBe(AREA_KEY_DEVANAHALLI);
    });
  });

  it('AC2 (#1160/#1069 non-regression): cold mount with a bare area-only URL (areaKey + viewport, no groupId/scope) preserves the user\'s own restored viewport — no fit override', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeUrlState({
        areaKey: AREA_KEY_DEVANAHALLI,
        groupId: null,
        scope: null,
        viewport: { lat: 13.25, lon: 77.72, zoom: 15 },
      }),
      makeDefaultActions(),
    ]);

    renderAt(
      `/discover?city=bangalore&lat=13.25&lon=77.72&zoom=15&areaKey=${encodeURIComponent(AREA_KEY_DEVANAHALLI)}`,
    );

    // POSITIVE signal: wait for setSelectedArea(match) to fire — proof the
    // `if (match)` branch of the deferred areaKey-hydration effect actually
    // ran and reached the bare-area gate, not merely that PropertyMap's
    // first render (which happens before the effect even runs) was captured.
    // DiscoverRightPanel's selectedArea prop mirrors MapDiscovery's local
    // selectedArea state, which is only ever set inside that branch.
    await waitFor(() => {
      const lastSelectedArea = rightPanelPropsLog.selectedAreas.at(-1) as { areaKey?: string } | null;
      expect(lastSelectedArea?.areaKey).toBe(AREA_KEY_DEVANAHALLI);
    });

    // NEGATIVE signal: having confirmed the branch was reached and evaluated,
    // the area-specific setPanToArea(match) must NOT also have fired — the
    // inherited (genuinely restored) viewport is trusted and preserved as-is,
    // matching the original #1160/#1069 guard behaviour for bare area-only
    // deep links.
    const panToAreaFired = propertyMapPropsLog.panToAreas.some(
      (p) => (p as { areaKey?: string } | null)?.areaKey === AREA_KEY_DEVANAHALLI,
    );
    expect(panToAreaFired).toBe(false);
  });
});
