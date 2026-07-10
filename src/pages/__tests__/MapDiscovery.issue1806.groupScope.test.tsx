/**
 * Issue #1806 — MapDiscovery: map/panel scope correctness (FIX-1/FIX-2, T1/T2/T3/T9).
 *
 * BUG_REPRO (bug-repro-report.toml): authenticated, journey=area-first, groupId set
 * (e.g. 'north-growth'), groupResults ABSENT (the plain group-drill-down state, NOT
 * the 'View all' group-results state), zoom > AREA_LAYER_MAX_ZOOM(=12). Before this
 * fix, GET /api/discover/markers fired with NO areaKeys param and returned
 * city-wide markers while the right panel (AreaGroupSelectedPanel, reached via
 * DiscoverRightPanel → 'area-groups-landing' → AreaGroupsLandingPanel's Level-2
 * branch) showed only the group's member areas — see DIRECTIVE 4 trace.
 *
 * Distinguishing this scoped-drill-down state from #1597's group-RESULTS state
 * (MapDiscovery.groupResults.test.tsx) matters here: this suite intentionally
 * omits `groupResults=1` from every URL so panelContent resolves to
 * 'area-groups-landing', not 'area-group-results' — the code path FIX-1 targets.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

// ─── Hoisted handles ─────────────────────────────────────────────────────────

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: { id: 'u1' }, isLoading: false, isAdmin: false, isDealer: false })),
);

const capturedListings = vi.hoisted(() => ({
  current: null as PropertyListingWithImages[] | null,
}));

const mockUseDiscoverUrlState = vi.hoisted(() => vi.fn());
const mockUseAreaGroups = vi.hoisted(() => vi.fn());
const mockUseDiscoverListings = vi.hoisted(() => vi.fn());
const mockUseDiscoverCityListings = vi.hoisted(() => vi.fn());

// Every useDiscoverFilteredMarkers call across the page (useDiscoverMapData's
// call AND the direct #1597 group-results call) is captured here, keyed by
// whether its 8th positional arg (areaKeys) is defined.
const capturedMarkersCalls = vi.hoisted(() => ({
  current: [] as { areaKeys: string[] | undefined; enabled: boolean }[],
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────

const GROUP_ID = 'north-growth';
const AREA_KEY_HEBBAL = 'IN|KA|Bengaluru|Hebbal';
const AREA_KEY_YELAHANKA = 'IN|KA|Bengaluru|Yelahanka';

const NORTH_GROWTH_GROUP = {
  id: GROUP_ID,
  name: 'North Growth',
  area_keys: [AREA_KEY_HEBBAL, AREA_KEY_YELAHANKA],
  subtitle: null,
  description: null,
};

const CITY_MARKER_ID = 'city-wide-marker-999';
const CITY_MARKERS_RESPONSE = {
  city: 'bangalore',
  markers: [
    { id: CITY_MARKER_ID, lat: 13.0, lon: 77.6, pricePaise: 7000000, locality: null, propertyType: null },
  ],
  truncated: false,
};
const SCOPED_MARKERS_RESPONSE = {
  city: 'bangalore',
  markers: [
    { id: 'hebbal-1', lat: 13.045, lon: 77.62, pricePaise: 5000000, locality: 'Hebbal', propertyType: 'apartment' },
  ],
  truncated: false,
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: (props: { listings?: PropertyListingWithImages[] }) => {
    capturedListings.current = props.listings ?? [];
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

vi.mock('@/hooks/useDiscoverUrlState', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useDiscoverUrlState')>(
    '@/hooks/useDiscoverUrlState',
  );
  return { ...actual, useDiscoverUrlState: () => mockUseDiscoverUrlState() };
});

vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: () => mockUseAreaGroups(),
}));

vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: () => mockUseDiscoverListings(),
}));

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: (
    _city: string,
    _filters: unknown,
    enabled: boolean,
    _bbox: unknown,
    _q: unknown,
    _listingPurpose: unknown,
    _excludePropertyType: unknown,
    areaKeys?: string[],
  ) => {
    capturedMarkersCalls.current.push({ areaKeys, enabled });
    if (areaKeys !== undefined && areaKeys.length > 0) {
      return { data: SCOPED_MARKERS_RESPONSE, isLoading: false, isFetching: false };
    }
    if (areaKeys !== undefined) {
      // [] — empty-areaKeys guard disables the fetch.
      return { data: undefined, isLoading: false, isFetching: false };
    }
    // Unscoped city-wide call.
    return { data: CITY_MARKERS_RESPONSE, isLoading: false, isFetching: false };
  },
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: {
      city: 'bangalore',
      areas: [
        {
          areaKey: AREA_KEY_HEBBAL, areaLabel: 'Hebbal', name: 'Hebbal',
          geo_center_lat: 13.045, geo_center_lon: 77.62,
          listingCount: 5, schoolCount: 2, trendDirection: 'stable',
          bbox: [[13.03, 77.6], [13.06, 77.64]],
        },
        {
          areaKey: AREA_KEY_YELAHANKA, areaLabel: 'Yelahanka', name: 'Yelahanka',
          geo_center_lat: 13.1, geo_center_lon: 77.6,
          listingCount: 3, schoolCount: 1, trendDirection: 'stable',
          bbox: [[13.08, 77.58], [13.12, 77.62]],
        },
      ],
    },
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: () => mockUseDiscoverCityListings(),
}));

vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useRegionalAreaGroups: vi.fn(() => ({ groups: [], isLoading: false, isError: false, refetch: vi.fn() })),
}));

vi.mock('@/hooks/useAgriMapListings', () => ({
  useAgriMapListings: vi.fn(() => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() })),
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

vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: vi.fn(() => ({ data: undefined })),
}));

vi.mock('@/hooks/useListingSearch', () => ({
  useListingSearch: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
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
  };
}

// NOTE: `groupResults` is deliberately NOT set — this is the plain
// group-drill-down state (panelContent === 'area-groups-landing'), NOT the
// #1597 group-results state (panelContent === 'area-group-results').
function makeGroupDrilldownUrlState(overrides: Record<string, unknown> = {}) {
  return {
    city: 'bangalore',
    areaKey: null,
    viewport: { lat: 13.07513, lon: 77.59987, zoom: 13 },
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: 'area-first' as const,
    groupId: GROUP_ID,
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Issue #1806 — MapDiscovery group-drill-down map/panel scope correctness', () => {
  beforeEach(() => {
    capturedListings.current = null;
    capturedMarkersCalls.current = [];
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' }, isLoading: false, isAdmin: false, isDealer: false,
    });
    mockUseDiscoverUrlState.mockReturnValue([
      makeGroupDrilldownUrlState(),
      makeDefaultActions(),
    ]);
    mockUseAreaGroups.mockReturnValue({
      data: { groups: [NORTH_GROWTH_GROUP] },
      isLoading: false,
    });
    mockUseDiscoverListings.mockReturnValue({
      data: { content: [], totalElements: 0, page: 0, size: 50, totalPages: 0, aggregates: null },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    mockUseDiscoverCityListings.mockReturnValue({
      data: { areas: [] }, isLoading: false, isError: false, refetch: vi.fn(),
    });
  });

  it('T1 (AC1): group resolved → the useDiscoverMapData marker call carries exactly the group member area keys, and PropertyMap never receives the unscoped city-wide marker', async () => {
    renderAt(`/discover?city=bangalore&journey=area-first&groupId=${GROUP_ID}&lat=13.07513&lon=77.59987&zoom=13`);

    await waitFor(() => {
      expect(capturedListings.current).not.toBeNull();
    });

    // The unscoped city-wide marker must never leak into the map.
    const ids = (capturedListings.current ?? []).map((l) => l.id);
    expect(ids).not.toContain(CITY_MARKER_ID);

    // The direct #1597 group-results call is disabled here (groupResults is
    // unset), so it always passes areaKeys=undefined — every call carrying a
    // non-empty, defined areaKeys array across this render's effect cycle
    // must therefore be useDiscoverMapData's call (FIX-1), and every one of
    // them must be scoped to exactly the group's member areas — never a
    // partial or drifting set across re-renders.
    const scopedCalls = capturedMarkersCalls.current.filter(
      (c) => c.areaKeys !== undefined && c.areaKeys.length > 0,
    );
    expect(scopedCalls.length).toBeGreaterThan(0);
    for (const call of scopedCalls) {
      expect(call.areaKeys?.slice().sort()).toEqual([AREA_KEY_HEBBAL, AREA_KEY_YELAHANKA].sort());
    }
  });

  it('T2 (AC3): group NOT yet resolved (areaGroupsData still loading) → areaKeys=[] (fetch disabled), never undefined (no unscoped flash)', async () => {
    mockUseAreaGroups.mockReturnValue({ data: undefined, isLoading: true });

    renderAt(`/discover?city=bangalore&journey=area-first&groupId=${GROUP_ID}&lat=13.07513&lon=77.59987&zoom=13`);

    await waitFor(() => {
      expect(capturedListings.current).not.toBeNull();
    });

    // No city-wide leak while the group is still resolving.
    const ids = (capturedListings.current ?? []).map((l) => l.id);
    expect(ids).not.toContain(CITY_MARKER_ID);
    expect(capturedListings.current).toHaveLength(0);

    // At least one call in this render carried areaKeys=[] (defined, empty) —
    // never a defined-with-members array (group unresolved) and never left
    // undefined for the useDiscoverMapData call (which would fire unscoped).
    const disabledCalls = capturedMarkersCalls.current.filter(
      (c) => c.areaKeys !== undefined && c.areaKeys.length === 0,
    );
    expect(disabledCalls.length).toBeGreaterThan(0);
  });

  it('T9 (AC12): groupId set BUT journey=school-first with schoolId set → the school-radius surface is NOT group-clipped (areaKeys stays undefined for that call)', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeGroupDrilldownUrlState({
        journey: 'school-first',
        schoolId: 'school-1',
        filters: { schoolLat: 13.05, schoolLon: 77.6, schoolRadiusKm: 2 },
      }),
      makeDefaultActions(),
    ]);

    renderAt(
      `/discover?city=bangalore&journey=school-first&groupId=${GROUP_ID}&schoolId=school-1&lat=13.07513&lon=77.59987&zoom=13`,
    );

    await waitFor(() => {
      expect(capturedListings.current).not.toBeNull();
    });

    // No call in this render should carry a non-empty scoped areaKeys array —
    // the school-first + schoolId guard must hold even though groupId is set.
    const scopedCalls = capturedMarkersCalls.current.filter(
      (c) => c.areaKeys !== undefined && c.areaKeys.length > 0,
    );
    expect(scopedCalls).toHaveLength(0);
  });
});

describe('Issue #1806 — MapDiscovery FIX-2: selected empty area shows empty state, not borrowed markers', () => {
  beforeEach(() => {
    capturedListings.current = null;
    capturedMarkersCalls.current = [];
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' }, isLoading: false, isAdmin: false, isDealer: false,
    });
    mockUseAreaGroups.mockReturnValue({ data: { groups: [] }, isLoading: false });
    mockUseDiscoverListings.mockReturnValue({
      data: { content: [], totalElements: 0, page: 0, size: 50, totalPages: 0, aggregates: null },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
  });

  function makeAreaSelectedUrlState(overrides: Record<string, unknown> = {}) {
    return {
      city: 'bangalore',
      areaKey: AREA_KEY_HEBBAL,
      viewport: { lat: 13.045, lon: 77.62, zoom: 14 },
      filters: {},
      schoolId: null,
      radiusKm: null,
      q: '',
      journey: 'area-first' as const,
      groupId: null,
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

  it('settled + genuinely zero listings (no error) → renders no listing markers, not city-wide/group markerListings', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeAreaSelectedUrlState(),
      makeDefaultActions(),
    ]);
    // Settled, zero listings, no error.
    mockUseDiscoverCityListings.mockReturnValue({
      data: { city: 'bangalore', limitPerArea: 50, areas: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderAt(`/discover?city=bangalore&journey=area-first&areaKey=${AREA_KEY_HEBBAL}&lat=13.045&lon=77.62&zoom=14`);

    await waitFor(() => {
      expect(capturedListings.current).not.toBeNull();
    });

    expect(capturedListings.current).toHaveLength(0);
    expect((capturedListings.current ?? []).map((l) => l.id)).not.toContain(CITY_MARKER_ID);
  });

  it('settled + area-listings query ERRORED → preserves the fallback (DIRECTIVE 1) rather than silently showing nothing', async () => {
    mockUseDiscoverUrlState.mockReturnValue([
      makeAreaSelectedUrlState(),
      makeDefaultActions(),
    ]);
    // Settled with an ERROR — data is undefined, isError true.
    mockUseDiscoverCityListings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    renderAt(`/discover?city=bangalore&journey=area-first&areaKey=${AREA_KEY_HEBBAL}&lat=13.045&lon=77.62&zoom=14`);

    await waitFor(() => {
      expect(capturedListings.current).not.toBeNull();
    });

    // The preserved fallback surfaces markerListings (city-wide, since no
    // group is focused in this fixture) rather than a silently blank map.
    const ids = (capturedListings.current ?? []).map((l) => l.id);
    expect(ids).toContain(CITY_MARKER_ID);
  });
});
