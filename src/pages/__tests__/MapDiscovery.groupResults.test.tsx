/**
 * Issue #1597 — MapDiscovery: group-results map marker isolation + filter threading
 *
 * Gate F no-leakage contract:
 *   When panelContent === 'area-group-results', the PropertyMap `listings` prop
 *   must receive ONLY the group-filtered markers from groupResultsMarkersData,
 *   and must NOT receive the unfiltered whole-city markerListings.
 *
 * AC assertions:
 *   1. In area-group-results state, PropertyMap receives ONLY the group-filtered markers
 *      (identified by the group marker IDs, NOT the unfiltered city marker ID).
 *   2. When the group has no resolved area_keys (empty / group still loading), PropertyMap
 *      receives an empty listings array (no ghost/whole-city leak).
 *   3. In a non-group-results state (area-selected), PropertyMap receives the regular
 *      marker set — regression guard.
 *   4. Active URL filters (propertyTypes, priceMin, bedrooms) are forwarded to the
 *      group-results LISTINGS query and MARKERS query (not dropped).
 *   5. Anonymous (logged-out) buyer: authed group-results queries are disabled; PropertyMap
 *      receives markers derived from the public useDiscoverCityListings response.
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

// Capture the most recent `listings` prop passed to PropertyMap
const capturedListings = vi.hoisted(() => ({
  current: null as PropertyListingWithImages[] | null,
}));

// Controllable mock for useDiscoverUrlState
const mockUseDiscoverUrlState = vi.hoisted(() => vi.fn());

// Controllable mock for useAreaGroups — controls the resolved group
const mockUseAreaGroups = vi.hoisted(() => vi.fn());

// Controllable mock for useDiscoverListings — controls the right-panel listings
const mockUseDiscoverListings = vi.hoisted(() => vi.fn());

// Capture the most recent params object passed to useDiscoverListings
// Used by AC4 to assert that URL filters are forwarded to the group-results listings query.
// Typed loosely here to avoid a dynamic import inside vi.hoisted (which runs at module eval).
const capturedListingsParams = vi.hoisted(() => ({
  current: null as {
    city: string;
    page: number;
    size?: number;
    filters: { propertyTypes?: string[]; priceMin?: number; bedrooms?: number[] };
    enabled?: boolean;
    areaKeys?: string[];
    listingPurpose?: string;
  } | null,
}));

// Controllable mock for useDiscoverFilteredMarkers.
// useDiscoverFilteredMarkers is now called TWICE in MapDiscovery:
//   1. Via useDiscoverMapData (regular area-first markers — no areaKeys)
//   2. Directly for group-results markers (with areaKeys)
// The mock routes by areaKeys presence so each call gets the right fixture.
const mockUseDiscoverFilteredMarkers = vi.hoisted(() => vi.fn());

// Capture the group-results markers call params (the one with areaKeys) for AC4.
const capturedMarkersParams = vi.hoisted(() => ({
  current: null as {
    city?: string;
    filters?: { propertyTypes?: string[]; priceMin?: number; bedrooms?: number[] };
    areaKeys?: string[];
    listingPurpose?: string;
  } | null,
}));

// AC6 — J1 anon guard: record every `enabled` value passed to useDiscoverFilteredMarkers
// across ALL call sites. Used to assert no auth-gated /api/discover/markers call fires for anon.
// Cleared in beforeEach; tests read this after render+waitFor.
const capturedMarkersEnabledCalls = vi.hoisted(() => ({
  current: [] as boolean[],
}));

// Controllable mock for useDiscoverCityListings — used in AC5 to simulate the anon path.
const mockUseDiscoverCityListings = vi.hoisted(() => vi.fn());

// Capture the most recent params passed to useDiscoverCityListings for AC5 assertions.
const capturedCityListingsParams = vi.hoisted(() => ({
  current: null as {
    city?: string;
    areaKeys?: string[];
    limitPerArea?: number;
    propertyType?: string;
    bedrooms?: number;
  } | null,
}));

// AC6c: accumulate ALL areaKeys values passed to useDiscoverCityListings across all renders.
// Used to assert that AT SOME POINT the hook was called with the group's area_keys.
// (The last-call capture in capturedCityListingsParams may be from a subsequent re-render
// where the component passed areaKeys=[] — this accumulator catches the scoped call.)
const allCityListingsAreaKeys = vi.hoisted(() => ({
  current: [] as (string[] | undefined)[],
}));

// ─── Shared fixture data ──────────────────────────────────────────────────────

const COASTAL_GROUP_ID = 'coastal-homes';
const AREA_KEY_A = 'IN|KA|Udupi|Malpe';
const AREA_KEY_B = 'IN|KA|Udupi|Ullal';

const COASTAL_GROUP = {
  id: COASTAL_GROUP_ID,
  name: 'Coastal Homes',
  area_keys: [AREA_KEY_A, AREA_KEY_B],
  subtitle: 'Sea-facing properties',
  description: null,
};

// These are the marker IDs the backend returns for the group's area_keys
// They use the DiscoverFilteredMarker shape (lat/lon/locality/propertyType).
const GROUP_MARKER_ID_1 = 'group-marker-001';
const GROUP_MARKER_ID_2 = 'group-marker-002';
// This is the unfiltered whole-city marker that must NOT appear in group-results state
const CITY_MARKER_ID = 'city-wide-marker-999';

// DiscoverFilteredMarkersResponse shape (locality + propertyType included)
const GROUP_MARKERS_RESPONSE = {
  city: 'udupi',
  markers: [
    { id: GROUP_MARKER_ID_1, lat: 13.354, lon: 74.708, pricePaise: 5000000, locality: 'Malpe', propertyType: 'house' },
    { id: GROUP_MARKER_ID_2, lat: 13.36, lon: 74.72, pricePaise: 6000000, locality: 'Ullal', propertyType: 'apartment' },
  ],
  truncated: false,
};

const CITY_MARKERS_RESPONSE = {
  city: 'udupi',
  markers: [
    { id: CITY_MARKER_ID, lat: 13.399, lon: 74.75, pricePaise: 7000000, locality: null, propertyType: null },
  ],
  truncated: false,
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Capture `listings` prop; render a minimal stub
vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: (props: { listings?: PropertyListingWithImages[] }) => {
    capturedListings.current = props.listings ?? [];
    return <div data-testid="property-map-mock" />;
  },
}));

vi.mock('@/components/layout/AppLayout', () => ({ RoleAwareHeader: () => null,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useDiscoverListings: (params: any) => {
    // Only capture the group-results call — the one that carries areaKeys.
    // useDiscoverMapData also calls useDiscoverListings (without areaKeys), and its
    // last call would overwrite the group-results params we want to assert on.
    if (params.areaKeys !== undefined) {
      capturedListingsParams.current = params;
    }
    return mockUseDiscoverListings();
  },
}));

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useDiscoverFilteredMarkers: (city: string, filters: any, enabled: boolean, bbox: unknown, q: unknown, listingPurpose: string, excludePropertyType: unknown, areaKeys?: string[]) => {
    // Record every enabled value across all call sites (AC6 anon-gate assertion).
    capturedMarkersEnabledCalls.current.push(enabled);
    // Group-results markers call carries areaKeys; regular area-first markers call does not.
    if (areaKeys !== undefined) {
      // Capture group-results markers call params for AC4 assertion
      capturedMarkersParams.current = { city, filters, areaKeys, listingPurpose };
      // Return the controllable group-results markers response
      return mockUseDiscoverFilteredMarkers();
    }
    // Regular call from useDiscoverMapData — return city-wide markers (must NOT appear on map)
    return { data: CITY_MARKERS_RESPONSE, isLoading: false, isFetching: false };
  },
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: {
      city: 'udupi',
      areas: [
        {
          areaKey: AREA_KEY_A, areaLabel: 'Malpe', name: 'Malpe',
          geo_center_lat: 13.354, geo_center_lon: 74.708,
          listingCount: 4, schoolCount: 2, trendDirection: 'stable',
          bbox: [[13.34, 74.69], [13.37, 74.72]],
        },
      ],
    },
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useDiscoverCityListings', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useDiscoverCityListings: (params: any) => {
    capturedCityListingsParams.current = params;
    allCityListingsAreaKeys.current.push(params.areaKeys);
    return mockUseDiscoverCityListings();
  },
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
    // Issue #1597 actions
    enterGroupResults: vi.fn(), clearGroupResults: vi.fn(),
  };
}

function makeGroupResultsUrlState(overrides: Record<string, unknown> = {}) {
  return {
    city: 'udupi',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: 'area-first' as const,
    groupId: COASTAL_GROUP_ID,
    selectedGroup: null,
    schoolPicking: undefined,
    groupResults: true as const,
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

describe('Issue #1597 — MapDiscovery group-results map marker isolation (Gate F)', () => {
  beforeEach(() => {
    capturedListings.current = null;
    capturedListingsParams.current = null;
    capturedMarkersParams.current = null;
    capturedCityListingsParams.current = null;
    capturedMarkersEnabledCalls.current = [];
    allCityListingsAreaKeys.current = [];
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' }, isLoading: false, isAdmin: false, isDealer: false,
    });
    // Default anon city listings: empty (used only in AC5 tests; authed tests don't rely on it).
    mockUseDiscoverCityListings.mockReturnValue({ data: { areas: [] }, isLoading: false, isError: false, refetch: vi.fn() });
    // Default: group-results state with a resolved group.
    // viewport.zoom=14 ensures useDiscoverPageState initialises mapZoom > AREA_LAYER_MAX_ZOOM=12,
    // so the PropertyMap listings IIFE passes the zoom guard and reaches the isGroupResultsState branch.
    mockUseDiscoverUrlState.mockReturnValue([
      makeGroupResultsUrlState({ viewport: { lat: 13.354, lon: 74.708, zoom: 14 } }),
      makeDefaultActions(),
    ]);
    mockUseAreaGroups.mockReturnValue({
      data: { groups: [COASTAL_GROUP] },
      isLoading: false,
    });
    // group-results markers hook returns group-filtered markers (DiscoverFilteredMarkersResponse shape)
    mockUseDiscoverFilteredMarkers.mockReturnValue({
      data: GROUP_MARKERS_RESPONSE,
      isLoading: false,
      isFetching: false,
    });
    // right-panel listings hook
    mockUseDiscoverListings.mockReturnValue({
      data: { content: [], totalElements: 0, page: 0, size: 50, totalPages: 0, aggregates: null },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
  });

  it('AC1: area-group-results state → PropertyMap receives ONLY group-filtered markers (no city-wide ghost markers)', async () => {
    // zoom=14 pushes past AREA_LAYER_MAX_ZOOM=12 so the listings IIFE does not early-return [].
    renderAt('/discover?city=udupi&journey=area-first&groupId=coastal-homes&groupResults=1&lat=13.354&lon=74.708&zoom=14');

    await waitFor(() => {
      expect(capturedListings.current).not.toBeNull();
    });

    // Must contain both group markers
    const ids = (capturedListings.current ?? []).map((l) => l.id);
    expect(ids).toContain(GROUP_MARKER_ID_1);
    expect(ids).toContain(GROUP_MARKER_ID_2);

    // Must NOT contain the unfiltered city-wide marker
    expect(ids).not.toContain(CITY_MARKER_ID);

    // Exactly 2 group markers (tight bound)
    expect(ids).toHaveLength(2);
  });

  it('AC2a: group has no resolved area_keys (empty array) → PropertyMap receives empty listings (no ghost markers)', async () => {
    // Group resolves but has no member areas
    mockUseAreaGroups.mockReturnValue({
      data: { groups: [{ ...COASTAL_GROUP, area_keys: [] }] },
      isLoading: false,
    });
    // When area_keys is empty, the hook is disabled → data is undefined
    mockUseDiscoverFilteredMarkers.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
    });

    renderAt('/discover?city=udupi&journey=area-first&groupId=coastal-homes&groupResults=1&lat=13.354&lon=74.708&zoom=14');

    await waitFor(() => {
      expect(capturedListings.current).not.toBeNull();
    });

    // No markers at all — empty-areaKeys guard held
    expect(capturedListings.current).toHaveLength(0);
    expect((capturedListings.current ?? []).map((l) => l.id)).not.toContain(CITY_MARKER_ID);
  });

  it('AC2b: group not yet resolved (areaGroupsData still loading) → PropertyMap receives empty listings', async () => {
    // Group data loading — no groups in response yet
    mockUseAreaGroups.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    // Markers hook disabled (empty areaKeys from unresolved group) → data undefined
    mockUseDiscoverFilteredMarkers.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
    });

    renderAt('/discover?city=udupi&journey=area-first&groupId=coastal-homes&groupResults=1&lat=13.354&lon=74.708&zoom=14');

    await waitFor(() => {
      expect(capturedListings.current).not.toBeNull();
    });

    // Empty — cold-load guard held
    expect(capturedListings.current).toHaveLength(0);
  });

  it('AC4 filter-threading: active URL filters are forwarded to the group-results LISTINGS and MARKERS queries (not dropped)', async () => {
    // URL state has active propertyTypes + price + bedrooms filter
    mockUseDiscoverUrlState.mockReturnValue([
      makeGroupResultsUrlState({
        viewport: { lat: 13.354, lon: 74.708, zoom: 14 },
        filters: { propertyTypes: ['house'] as string[], priceMin: 5000000, bedrooms: [3] },
      }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=area-first&groupId=coastal-homes&groupResults=1&lat=13.354&lon=74.708&zoom=14&propertyTypes=house&priceMin=5000000&bedrooms=3');

    await waitFor(() => {
      // Wait for component to mount and call useDiscoverListings (group-results branch)
      expect(capturedListingsParams.current).not.toBeNull();
    });

    // ── LISTINGS query ──
    const lp = capturedListingsParams.current!;
    expect(lp.filters.propertyTypes).toEqual(['house']);
    expect(lp.filters.priceMin).toBe(5000000);
    expect(lp.filters.bedrooms).toEqual([3]);
    expect(lp.areaKeys).toEqual([AREA_KEY_A, AREA_KEY_B]);
    expect(lp.enabled).toBe(true);

    // ── MARKERS query ──
    await waitFor(() => {
      expect(capturedMarkersParams.current).not.toBeNull();
    });
    const mp = capturedMarkersParams.current!;
    // Markers must receive the same property filters (not dropped)
    expect(mp.filters?.propertyTypes).toEqual(['house']);
    expect(mp.filters?.priceMin).toBe(5000000);
    expect(mp.filters?.bedrooms).toEqual([3]);
    // Markers must also receive the same areaKeys
    expect(mp.areaKeys).toEqual(
      expect.arrayContaining([AREA_KEY_A, AREA_KEY_B]),
    );
    // listingPurpose from intent (buy → 'sale')
    expect(mp.listingPurpose).toBe('sale');
  });

  it('AC5a anon path: anonymous buyer receives group markers from public useDiscoverCityListings, NOT from authed endpoints', async () => {
    // Simulate anonymous (logged-out) user.
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });

    // The anon public endpoint returns two in-group listings with coords.
    const ANON_LISTING_ID_1 = 'anon-listing-001';
    const ANON_LISTING_ID_2 = 'anon-listing-002';
    mockUseDiscoverCityListings.mockReturnValue({
      data: {
        city: 'udupi',
        limitPerArea: 50,
        areas: [
          {
            areaKey: AREA_KEY_A,
            areaName: 'Malpe',
            listings: [
              { id: ANON_LISTING_ID_1, lat: 13.354, lon: 74.708, pricePaise: 5000000, propertyType: 'house' },
            ],
          },
          {
            areaKey: AREA_KEY_B,
            areaName: 'Ullal',
            listings: [
              { id: ANON_LISTING_ID_2, lat: 13.36, lon: 74.72, pricePaise: 6200000, propertyType: 'apartment' },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderAt('/discover?city=udupi&journey=area-first&groupId=coastal-homes&groupResults=1&lat=13.354&lon=74.708&zoom=14');

    await waitFor(() => {
      expect(capturedListings.current).not.toBeNull();
    });

    // PropertyMap must receive the anon group markers (from public endpoint)
    const ids = (capturedListings.current ?? []).map((l) => l.id);
    expect(ids).toContain(ANON_LISTING_ID_1);
    expect(ids).toContain(ANON_LISTING_ID_2);

    // Must NOT contain the unfiltered city-wide marker (no-leakage: same contract as AC1)
    expect(ids).not.toContain(CITY_MARKER_ID);
    // Must NOT contain the authed group markers (those come from the authed endpoint, gated off)
    expect(ids).not.toContain(GROUP_MARKER_ID_1);
    expect(ids).not.toContain(GROUP_MARKER_ID_2);

    // The authed listings query must have been called with enabled=false (auth gate)
    // capturedListingsParams is only set when areaKeys is passed — verify it was disabled.
    if (capturedListingsParams.current !== null) {
      expect(capturedListingsParams.current.enabled).toBe(false);
    }
  });

  it('AC5b anon path: anonymous buyer with empty group area_keys receives empty markers (no ghost leak)', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    // Group has no area_keys — city listings hook is disabled (empty areaKeys passed)
    mockUseAreaGroups.mockReturnValue({
      data: { groups: [{ ...COASTAL_GROUP, area_keys: [] }] },
      isLoading: false,
    });
    mockUseDiscoverCityListings.mockReturnValue({
      data: { city: 'udupi', limitPerArea: 50, areas: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderAt('/discover?city=udupi&journey=area-first&groupId=coastal-homes&groupResults=1&lat=13.354&lon=74.708&zoom=14');

    await waitFor(() => {
      expect(capturedListings.current).not.toBeNull();
    });

    // No markers — empty-areaKeys guard holds on both authed and anon paths
    expect(capturedListings.current).toHaveLength(0);
  });

  // ── AC5c: per-flag regression for the anon filter-to-empty defect ───────────
  // Each test activates exactly ONE unsupported filter flag and verifies the teaser
  // is NOT empty (the flag is stripped, not applied as a filter-to-empty predicate).
  //
  // Root cause: applyAnonPropertyFilters reads backOnMarket, daysOnMarket (newToMarket),
  // possessionStatus (readyToMove) — fields absent from DiscoverCityListingItem (the public
  // endpoint shape). Before the fix, activating any of these flags silently zeroed the teaser.
  // After the fix, they are stripped before delegating to applyAnonPropertyFilters.

  it('AC5c-bom anon path + backOnMarket active → teaser NOT empty (backOnMarket stripped, not filter-to-empty)', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    mockUseDiscoverUrlState.mockReturnValue([
      makeGroupResultsUrlState({
        viewport: { lat: 13.354, lon: 74.708, zoom: 14 },
        filters: { backOnMarket: true },
      }),
      makeDefaultActions(),
    ]);

    const ANON_BOM_ID = 'anon-bom-001';
    mockUseDiscoverCityListings.mockReturnValue({
      data: {
        city: 'udupi',
        limitPerArea: 20,
        areas: [{
          areaKey: AREA_KEY_A,
          areaName: 'Malpe',
          listings: [{ id: ANON_BOM_ID, lat: 13.354, lon: 74.708, pricePaise: 5000000, propertyType: 'house' }],
        }],
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    });

    renderAt('/discover?city=udupi&journey=area-first&groupId=coastal-homes&groupResults=1&lat=13.354&lon=74.708&zoom=14&bom=1');

    await waitFor(() => { expect(capturedListings.current).not.toBeNull(); });
    expect((capturedListings.current ?? []).map((l) => l.id)).toContain(ANON_BOM_ID);
    expect((capturedListings.current ?? []).map((l) => l.id)).not.toContain(CITY_MARKER_ID);
  });

  it('AC5c-ntm anon path + newToMarket active → teaser NOT empty (newToMarket stripped; reads daysOnMarket which is absent)', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    mockUseDiscoverUrlState.mockReturnValue([
      makeGroupResultsUrlState({
        viewport: { lat: 13.354, lon: 74.708, zoom: 14 },
        filters: { newToMarket: true },
      }),
      makeDefaultActions(),
    ]);

    const ANON_NTM_ID = 'anon-ntm-001';
    mockUseDiscoverCityListings.mockReturnValue({
      data: {
        city: 'udupi',
        limitPerArea: 20,
        areas: [{
          areaKey: AREA_KEY_A,
          areaName: 'Malpe',
          listings: [{ id: ANON_NTM_ID, lat: 13.354, lon: 74.708, pricePaise: 6000000, propertyType: 'apartment' }],
        }],
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    });

    renderAt('/discover?city=udupi&journey=area-first&groupId=coastal-homes&groupResults=1&lat=13.354&lon=74.708&zoom=14&ntm=1');

    await waitFor(() => { expect(capturedListings.current).not.toBeNull(); });
    expect((capturedListings.current ?? []).map((l) => l.id)).toContain(ANON_NTM_ID);
    expect((capturedListings.current ?? []).map((l) => l.id)).not.toContain(CITY_MARKER_ID);
  });

  it('AC5c-rtm anon path + readyToMove active → teaser NOT empty (readyToMove stripped; reads possessionStatus which is absent)', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    mockUseDiscoverUrlState.mockReturnValue([
      makeGroupResultsUrlState({
        viewport: { lat: 13.354, lon: 74.708, zoom: 14 },
        filters: { readyToMove: true },
      }),
      makeDefaultActions(),
    ]);

    const ANON_RTM_ID = 'anon-rtm-001';
    mockUseDiscoverCityListings.mockReturnValue({
      data: {
        city: 'udupi',
        limitPerArea: 20,
        areas: [{
          areaKey: AREA_KEY_A,
          areaName: 'Malpe',
          listings: [{ id: ANON_RTM_ID, lat: 13.354, lon: 74.708, pricePaise: 5500000, propertyType: 'house' }],
        }],
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    });

    renderAt('/discover?city=udupi&journey=area-first&groupId=coastal-homes&groupResults=1&lat=13.354&lon=74.708&zoom=14&rtm=1');

    await waitFor(() => { expect(capturedListings.current).not.toBeNull(); });
    expect((capturedListings.current ?? []).map((l) => l.id)).toContain(ANON_RTM_ID);
    expect((capturedListings.current ?? []).map((l) => l.id)).not.toContain(CITY_MARKER_ID);
  });

  // ── AC6: J1 anon journey — ZERO auth-gated /api/discover/markers requests ────
  // Guards the invariant that drove the J1 pre-push smoke failure: an anonymous user
  // in any area-first discover state must NEVER trigger an auth-gated markers call
  // (useDiscoverFilteredMarkers with enabled=true). Three sub-tests cover every anon
  // state this PR can reach. Each asserts capturedMarkersEnabledCalls contains NO true.
  // These tests MUST PASS on the current branch — if they fail it is a regression.

  it('AC6a anon-gate: city-overview anon (/discover?city=udupi, no areaKey) → zero enabled=true markers calls', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    // City-overview: no areaKey, no groupResults — 'area-overview' panel state
    mockUseDiscoverUrlState.mockReturnValue([
      {
        city: 'udupi',
        areaKey: null,
        viewport: { lat: 13.354, lon: 74.708, zoom: 12 },
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
      },
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&lat=13.354&lon=74.708&zoom=12');

    await waitFor(() => { expect(capturedListings.current).not.toBeNull(); });

    // Every call to useDiscoverFilteredMarkers must have enabled=false for anon.
    expect(capturedMarkersEnabledCalls.current.length).toBeGreaterThan(0);
    expect(capturedMarkersEnabledCalls.current.every((e) => e === false)).toBe(true);
  });

  it('AC6b anon-gate: area-selected anon (J1 journey — areaKey set) → zero enabled=true markers calls', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    // J1: area-selected state with areaKey — the exact journey that caused the pre-push smoke failure
    mockUseDiscoverUrlState.mockReturnValue([
      makeGroupResultsUrlState({
        areaKey: AREA_KEY_A,
        groupResults: undefined,
        groupId: null,
        viewport: { lat: 13.354, lon: 74.708, zoom: 14 },
      }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=area-first&areaKey=' + encodeURIComponent(AREA_KEY_A) + '&lat=13.354&lon=74.708&zoom=14');

    await waitFor(() => { expect(capturedListings.current).not.toBeNull(); });

    // useDiscoverFilteredMarkers must be called with enabled=false for all anon invocations.
    expect(capturedMarkersEnabledCalls.current.length).toBeGreaterThan(0);
    expect(capturedMarkersEnabledCalls.current.every((e) => e === false)).toBe(true);
  });

  it('AC6c anon-gate: group-results anon (groupResults=1 + groupId) → zero enabled=true markers calls; public useDiscoverCityListings IS called with group area_keys', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    // Group-results state (new #1597 state) — anon user
    // (default beforeEach sets this state; just override auth to anon)

    const ANON_GRP_ID = 'anon-grp-001';
    mockUseDiscoverCityListings.mockReturnValue({
      data: {
        city: 'udupi',
        limitPerArea: 20,
        areas: [{
          areaKey: AREA_KEY_A,
          areaName: 'Malpe',
          listings: [{ id: ANON_GRP_ID, lat: 13.354, lon: 74.708, pricePaise: 5000000, propertyType: 'house' }],
        }],
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    });

    renderAt('/discover?city=udupi&journey=area-first&groupId=coastal-homes&groupResults=1&lat=13.354&lon=74.708&zoom=14');

    await waitFor(() => { expect(capturedListings.current).not.toBeNull(); });

    // (a) Auth-gated markers hook must have enabled=false on every invocation for anon.
    expect(capturedMarkersEnabledCalls.current.length).toBeGreaterThan(0);
    expect(capturedMarkersEnabledCalls.current.every((e) => e === false)).toBe(true);

    // (b) Public useDiscoverCityListings path IS used: the anon listing appears on the map.
    // This confirms the anon path fired (useDiscoverCityListings returned data → marker visible).
    expect((capturedListings.current ?? []).map((l) => l.id)).toContain(ANON_GRP_ID);

    // (c) useDiscoverCityListings was called with the group's area_keys at least once —
    // confirms anon group-results is scoped to the group, not the whole city.
    // Uses the accumulator (allCityListingsAreaKeys) rather than last-call capture
    // because re-renders may overwrite capturedCityListingsParams with a later [] call.
    await waitFor(() => {
      const anyWithGroupKeys = allCityListingsAreaKeys.current.some(
        (keys) =>
          Array.isArray(keys) &&
          keys.includes(AREA_KEY_A) &&
          keys.includes(AREA_KEY_B),
      );
      expect(anyWithGroupKeys).toBe(true);
    });
  });

  it('AC3 regression: non-group-results state (area-selected) does NOT produce group markers on the map', async () => {
    // area-first + areaKey set → area-selected state (not area-group-results)
    mockUseDiscoverUrlState.mockReturnValue([
      makeGroupResultsUrlState({ areaKey: AREA_KEY_A, groupResults: undefined }),
      makeDefaultActions(),
    ]);

    renderAt('/discover?city=udupi&journey=area-first&areaKey=' + encodeURIComponent(AREA_KEY_A) + '&lat=13.354&lon=74.708&zoom=14');

    await waitFor(() => {
      expect(capturedListings.current).not.toBeNull();
    });

    // In area-selected state, group-results markers must NOT be served
    const ids = (capturedListings.current ?? []).map((l) => l.id);
    expect(ids).not.toContain(GROUP_MARKER_ID_1);
    expect(ids).not.toContain(GROUP_MARKER_ID_2);
  });
});
