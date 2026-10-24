/**
 * #2859 batch B7 (handoff 285907) WEB slice C — e2e/discover-map-hierarchy.spec.ts (manifest L72).
 *
 * Page-level (jsdom) replacement for the legacy-landing map-hierarchy claims, at the spec's own URL
 * `/discover?city=udupi&scope=` (the empty `scope=` sentinel that suppresses the area-first default,
 * state/url/area.ts hasExplicitScope). Harness copied from
 * MapDiscovery.issue1745-batchB-overviewClick.test.tsx (never edited): PropertyMap mocked capturing
 * `areas` + `onAreaClick`; REAL useDiscoverUrlState / DiscoverProvider / right panel; LocationProbe.
 *
 * Claim scope (R_stub_ui): the captured PropertyMap `areas` GIVEN stubbed groups / areas / region-summary
 * responses. Server-side membership is excluded. Painted Leaflet markers and real pointer clicks are
 * RETAIN (R_injected); MemoryRouter navigate(-1) proves the react-router contract, not the browser stack.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

const propertyMapProps = vi.hoisted(() => ({
  current: null as { areas: AreaPoint[]; onAreaClick?: (area: AreaPoint) => void } | null,
}));
const navRef = vi.hoisted(() => ({ current: null as null | ((delta: number) => void) }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: (props: { areas?: AreaPoint[]; onAreaClick?: (area: AreaPoint) => void }) => {
    propertyMapProps.current = { areas: props.areas ?? [], onAreaClick: props.onAreaClick };
    return <div data-testid="property-map-mock" />;
  },
}));

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Udupi fixture (same shape as the spec's DISCOVER_AREAS / AREA_GROUPS / SUMMARY fixtures) ───
const MANIPAL = 'IN|KA|Udupi|Manipal';
const UDYAVAR = 'IN|KA|Udupi|Udyavar';
const KATAPADI = 'IN|KA|Udupi|Katapadi';
const MALPE = 'IN|KA|Udupi|Malpe';
const SOUTH = 'south-udupi';
const COASTAL = 'coastal-belt';

type Area = {
  areaKey: string; areaLabel: string; name: string;
  geo_center_lat: number; geo_center_lon: number; geoCenterLat: number; geoCenterLon: number;
  minLat: number; minLon: number; maxLat: number; maxLon: number;
  bbox: [[number, number], [number, number]];
  listingCount: number; schoolCount: number; trendDirection: 'stable';
};
function mkArea(areaKey: string, name: string, lat: number, lon: number, listingCount: number): Area {
  return {
    areaKey, areaLabel: name, name,
    geo_center_lat: lat, geo_center_lon: lon, geoCenterLat: lat, geoCenterLon: lon,
    minLat: lat - 0.02, minLon: lon - 0.02, maxLat: lat + 0.02, maxLon: lon + 0.02,
    bbox: [[lat - 0.02, lon - 0.02], [lat + 0.02, lon + 0.02]],
    listingCount, schoolCount: 1, trendDirection: 'stable',
  };
}
const UDUPI_AREAS = [
  mkArea(MANIPAL, 'Manipal', 13.3509, 74.7932, 5),
  mkArea(UDYAVAR, 'Udyavar', 13.28, 74.79, 3),
  mkArea(KATAPADI, 'Katapadi', 13.33, 74.75, 2),
  mkArea(MALPE, 'Malpe', 13.35, 74.7, 4),
];
const UDUPI_GROUPS = [
  { id: SOUTH, name: 'South Udupi', subtitle: null, region_label: null, school_count: 0, area_keys: [MANIPAL, UDYAVAR, KATAPADI], focus_lat: 13.31, focus_lon: 74.78 },
  { id: COASTAL, name: 'Coastal Belt', subtitle: null, region_label: null, school_count: 0, area_keys: [MALPE], focus_lat: 13.35, focus_lon: 74.7 },
];
const UDUPI_REGIONS = {
  cityId: 1, citySlug: 'udupi',
  regions: [
    { key: SOUTH, label: 'South Udupi', listingCount: 10 },
    { key: COASTAL, label: 'Coastal Belt', listingCount: 4 },
  ],
};

// ─── Bangalore fixture (4-level lockstep): Hebbal is the NON-MEMBER of airport-belt ───
const BLR_YEL = 'IN|KA|Bangalore|Yelahanka';
const BLR_DEV = 'IN|KA|Bangalore|Devanahalli';
const BLR_HEB = 'IN|KA|Bangalore|Hebbal';
const BLR_AREAS = [
  mkArea(BLR_YEL, 'Yelahanka', 13.1, 77.59, 15),
  mkArea(BLR_DEV, 'Devanahalli', 13.25, 77.7, 10),
  mkArea(BLR_HEB, 'Hebbal', 13.03, 77.58, 5),
];
const BLR_GROUPS = [
  { id: 'airport-belt', name: 'Airport Belt', subtitle: null, region_label: 'North Bangalore', school_count: 0, area_keys: [BLR_YEL, BLR_DEV], focus_lat: 13.17, focus_lon: 77.64 },
  { id: 'hebbal-belt', name: 'Hebbal Belt', subtitle: null, region_label: 'North Bangalore', school_count: 0, area_keys: [BLR_HEB], focus_lat: 13.03, focus_lon: 77.58 },
];
const BLR_REGIONS = {
  cityId: 2, citySlug: 'bangalore',
  regions: [{ key: 'north', label: 'North Bangalore', listingCount: 30 }],
};
const BLR_REGION_PROJECTION = {
  citySlug: 'bangalore', regionKey: 'north',
  groups: [
    { groupSlug: 'airport-belt', name: 'Airport Belt', listingCount: 25, focusLat: 13.17, focusLon: 77.64, minLat: 13.08, minLon: 77.57, maxLat: 13.27, maxLon: 77.72, boundsStatus: 'COMPLETE' },
    { groupSlug: 'empty-belt', name: 'Empty Belt', listingCount: 0, focusLat: 13.0, focusLon: 77.5, minLat: 12.99, minLon: 77.49, maxLat: 13.01, maxLon: 77.51, boundsStatus: 'COMPLETE' },
    { groupSlug: 'hebbal-belt', name: 'Hebbal Belt', listingCount: 5, focusLat: 13.03, focusLon: 77.58, minLat: 13.01, minLon: 77.56, maxLat: 13.05, maxLon: 77.6, boundsStatus: 'COMPLETE' },
  ],
};

// ─── Agri fixture ───
const HERGA = 'IN|KA|Udupi|Herga';
const AGRI_CORRIDORS = [
  {
    directionCode: 'N', groupName: 'North Corridor — 10–25 km',
    availableMaxDistances: [{ maxKm: 25, distanceLabel: '25 km', includedBandCodes: ['10_25'], listingCount: 6, agriAcreage: 12.5, areaKeys: [HERGA] }],
  },
];
const AGRI_AREAS = [mkArea(HERGA, 'Herga', 13.4, 74.8, 6)];

// ─── Mutable per-test fixture ───
const fx = vi.hoisted(() => ({
  city: 'udupi' as string,
  areas: [] as unknown[],
  groups: [] as unknown[],
  regions: { cityId: 1, citySlug: 'udupi', regions: [] as unknown[] } as unknown,
  projection: undefined as undefined | Record<string, unknown>,
  corridors: [] as unknown[],
  agriAreas: [] as unknown[],
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn((_city: string, propertyType?: string) => ({
    data: { city: fx.city, areas: propertyType ? fx.agriAreas : fx.areas },
    isLoading: false,
  })),
}));
vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: vi.fn(() => ({ data: { areas: [] }, isLoading: false })),
}));
vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: vi.fn(() => ({ data: undefined, isLoading: false, isFetching: false, error: null })),
}));
vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: vi.fn(() => ({ data: undefined, isLoading: false, isFetching: false })),
}));
vi.mock('@/hooks/useDiscoverRegionSummary', () => ({
  useDiscoverRegionSummary: vi.fn(() => ({ data: fx.regions, isLoading: false, isError: false })),
}));
vi.mock('@/hooks/useTrendsOptions', () => ({ useTrendsOptions: vi.fn(() => ({ data: undefined })) }));
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
vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: vi.fn(() => ({ data: { groups: fx.groups }, isLoading: false })),
}));
vi.mock('@/hooks/useRegionScopedAreaGroups', () => ({
  useRegionScopedAreaGroups: vi.fn((_c: string, regionKey: string | null | undefined) => ({
    data: regionKey && fx.projection && fx.projection.regionKey === regionKey ? fx.projection : undefined,
    isLoading: false,
  })),
}));
vi.mock('@/hooks/useRegionalAreaGroups', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useRegionalAreaGroups')>();
  return {
    ...actual,
    useRegionalAreaGroups: vi.fn(() => ({
      groups: fx.corridors, isLoading: false, isError: false, isNotGeneratedForRevision: false,
      error: null, refetch: vi.fn(),
    })),
    useAgriDestinations: vi.fn(() => ({
      destinations: [], isLoading: false, isError: false, isNotGeneratedForRevision: false,
      error: null, refetch: vi.fn(),
    })),
  };
});
vi.mock('@/hooks/useAgriMapListings', () => ({
  useAgriMapListings: vi.fn(() => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() })),
}));
vi.mock('react-leaflet', () => ({
  MapContainer: () => null, TileLayer: () => null, Marker: () => null, Popup: () => null,
  useMap: () => ({ flyTo: vi.fn(), invalidateSize: vi.fn(), fitBounds: vi.fn() }),
  useMapEvents: () => null, Circle: () => null, Polygon: () => null, ZoomControl: () => null,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) } },
}));

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location-probe">{loc.pathname + loc.search}</div>;
}
function NavProbe() {
  const navigate = useNavigate();
  navRef.current = (delta: number) => navigate(delta);
  return null;
}
const renderAt = (entries: string[], initialIndex = entries.length - 1) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
        <LocationProbe />
        <NavProbe />
        <Routes>
          <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const url = () => screen.getByTestId('location-probe').textContent ?? '';
const params = () => new URLSearchParams(url().split('?')[1] ?? '');
/** Exact value of a URL param (null when absent) - never a substring match. */
const param = (name: string) => params().get(name);
const keys = () => (propertyMapProps.current?.areas ?? []).map((a) => a.areaKey).sort();
const labels = () => (propertyMapProps.current?.areas ?? []).map((a) => a.areaLabel).sort();

function useUdupi() {
  fx.city = 'udupi';
  fx.areas = UDUPI_AREAS;
  fx.groups = UDUPI_GROUPS;
  fx.regions = UDUPI_REGIONS;
  fx.projection = undefined;
  fx.corridors = [];
  fx.agriAreas = [];
}
function useBangalore() {
  fx.city = 'bangalore';
  fx.areas = BLR_AREAS;
  fx.groups = BLR_GROUPS;
  fx.regions = BLR_REGIONS;
  fx.projection = BLR_REGION_PROJECTION;
  fx.corridors = [];
  fx.agriAreas = [];
}

const SPEC_URL = '/discover?city=udupi&scope=';

describe('#2859 B7 L72 map-hierarchy (page-level, spec URL ?city=udupi&scope=)', () => {
  beforeEach(() => {
    // Fail-closed network: any request not otherwise answered gets 503 (no real loopback request is made).
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    propertyMapProps.current = null;
    navRef.current = null;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
    useUdupi();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('MH-1: the empty-scope landing renders BOUNDED macro-region bubbles (2 groups, not 4 areas) with the summary counts and keeps scope=; scope=<group> renders its member pills', async () => {
    renderAt([SPEC_URL]);
    await waitFor(() => expect(propertyMapProps.current?.areas.length).toBeGreaterThan(0));

    // The legacy guided-entry landing rendered (not the area-first default) and scope= is still on the URL.
    expect(param('scope')).toBe('');
    expect(screen.getByTestId('guided-entry-panel')).toBeInTheDocument();
    expect(params().has('journey')).toBe(false);

    // Bubbles = the 2 summary regions, never the 4 individual areas; labels + counts from the summary.
    const areas = propertyMapProps.current!.areas;
    expect(areas).toHaveLength(2);
    expect(keys()).toEqual([COASTAL, SOUTH].sort());
    expect(areas.find((a) => a.areaKey === SOUTH)).toMatchObject({ areaLabel: 'South Udupi', listingCount: 10 });
    expect(areas.find((a) => a.areaKey === COASTAL)).toMatchObject({ areaLabel: 'Coastal Belt', listingCount: 4 });
    for (const a of UDUPI_AREAS) expect(keys()).not.toContain(a.areaKey);
  });

  it('MH-1 control (same claim, other arm): scope=south-udupi renders the 3 member pills, not bubbles', async () => {
    renderAt([`${SPEC_URL.replace('scope=', '')}scope=${SOUTH}`]);
    await waitFor(() => expect(propertyMapProps.current?.areas.length).toBeGreaterThan(0));
    expect(keys()).toEqual([KATAPADI, MANIPAL, UDYAVAR].sort());
    expect(keys()).not.toContain(MALPE);
    expect(keys()).not.toContain(SOUTH);
  });

  it('MH-1 composed (one it): bounded bubbles BEFORE, then the scope=<group> arm in the SAME mount shows members (positive control for the bubble negatives)', async () => {
    renderAt([SPEC_URL]);
    await waitFor(() => expect(keys()).toEqual([COASTAL, SOUTH].sort()));
    // positive control in the same it: a region card click moves the same probe/captured set to members
    const grid = await screen.findByTestId('guided-entry-regions-grid');
    await userEvent.click(within(grid).getByRole('button', { name: /South Udupi/ }));
    await waitFor(() => expect(keys()).toEqual([KATAPADI, MANIPAL, UDYAVAR].sort()));
    expect(param('scope')).toBe(SOUTH);
  });

  it('MH-2: right-panel region card click writes the literal scope=south-udupi, drills to the 3 member pills (Malpe / Coastal absent), panel stays guided-entry', async () => {
    renderAt([SPEC_URL]);
    await waitFor(() => expect(keys()).toEqual([COASTAL, SOUTH].sort()));
    expect(param('scope')).toBe('');

    const grid = await screen.findByTestId('guided-entry-regions-grid');
    const card = within(grid).getByRole('button', { name: /South Udupi/ });
    expect(within(grid).getByRole('button', { name: /South Udupi/ })).toHaveTextContent('10');
    expect(within(grid).getByRole('button', { name: /Coastal Belt/ })).toHaveTextContent('4');
    await userEvent.click(card);

    await waitFor(() => expect(param('scope')).toBe(SOUTH));
    expect(params().has('areaKey')).toBe(false);
    await waitFor(() => expect(keys()).toEqual([KATAPADI, MANIPAL, UDYAVAR].sort()));
    expect(labels()).not.toContain('Malpe');
    expect(labels()).not.toContain('Coastal Belt');
    // panel routing unchanged: still the guided-entry panel, with the clicked card now pressed
    expect(screen.getByTestId('guided-entry-panel')).toBeInTheDocument();
    expect(within(screen.getByTestId('guided-entry-regions-grid')).getByRole('button', { name: /South Udupi/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('MH-2b: a map bubble click at the spec URL writes scope=south-udupi (not areaKey=) and drills to the member pills', async () => {
    renderAt([SPEC_URL]);
    await waitFor(() => expect(keys()).toEqual([COASTAL, SOUTH].sort()));
    expect(param('scope')).toBe('');

    const bubble = propertyMapProps.current!.areas.find((a) => a.areaKey === SOUTH)!;
    act(() => {
      propertyMapProps.current!.onAreaClick!(bubble);
    });

    await waitFor(() => expect(param('scope')).toBe(SOUTH));
    expect(params().has('areaKey')).toBe(false);
    expect(params().has('rscope')).toBe(false);
    await waitFor(() => expect(keys()).toEqual([KATAPADI, MANIPAL, UDYAVAR].sort()));
  });

  it('MH-3: Back from scope=south-udupi to the scope= entry clears the real scope and the bubbles return (react-router contract only)', async () => {
    renderAt([SPEC_URL, `/discover?city=udupi&scope=${SOUTH}`]);
    // before: entry B renders the member pills
    await waitFor(() => expect(keys()).toEqual([KATAPADI, MANIPAL, UDYAVAR].sort()));
    expect(param('scope')).toBe(SOUTH);

    act(() => {
      navRef.current!(-1);
    });

    await waitFor(() => expect(keys()).toEqual([COASTAL, SOUTH].sort()));
    expect(param('scope')).toBe('');
    expect(labels()).toEqual(['Coastal Belt', 'South Udupi']);
  });

  it('MH-AGRI: agri corridor landing renders the corridor bubble (positive) and no residential region/area pills (negative)', async () => {
    fx.corridors = AGRI_CORRIDORS;
    fx.agriAreas = AGRI_AREAS;
    renderAt(['/discover?city=udupi&scope=&journey=agri-first']);

    // positive control: the corridor bubble IS rendered, from the agri branch
    await waitFor(() => expect(keys()).toEqual(['N']));
    const corridor = propertyMapProps.current!.areas[0];
    expect(corridor).toMatchObject({ areaKey: 'N', areaLabel: 'North Corridor — 10–25 km', listingCount: 6, isGroup: true });

    // negative: none of the residential regions / groups / areas leak in
    expect(keys()).not.toContain(SOUTH);
    expect(keys()).not.toContain(COASTAL);
    for (const a of UDUPI_AREAS) expect(keys()).not.toContain(a.areaKey);
    expect(labels()).not.toContain('South Udupi');
    expect(labels()).not.toContain('Manipal');
  });

  it('MH-4L: Bangalore 4-level lockstep city -> macro-region -> zone -> area; the non-member area (Hebbal) never appears in airport-belt', async () => {
    useBangalore();
    renderAt(['/discover?city=bangalore&scope=']);

    // L1: macro-region bubble only
    await waitFor(() => expect(labels()).toEqual(['North Bangalore']));
    expect(labels()).not.toContain('Airport Belt');
    expect(labels()).not.toContain('Yelahanka');

    // L2: click the macro-region -> zone bubbles inside North Bangalore
    act(() => {
      propertyMapProps.current!.onAreaClick!(propertyMapProps.current!.areas[0]);
    });
    await waitFor(() => expect(param('scope')).toBe('north'));
    await waitFor(() => expect(labels()).toEqual(['Airport Belt', 'Hebbal Belt']));
    expect(labels()).not.toContain('North Bangalore');
    expect(labels()).not.toContain('Yelahanka');

    // L3: click the zone -> area pills of airport-belt ONLY (Hebbal is the discriminating non-member)
    act(() => {
      const zone = propertyMapProps.current!.areas.find((a) => a.areaLabel === 'Airport Belt')!;
      propertyMapProps.current!.onAreaClick!(zone);
    });
    await waitFor(() => expect(keys()).toEqual([BLR_DEV, BLR_YEL].sort()));
    expect(keys()).not.toContain(BLR_HEB);
    expect(labels()).not.toContain('Hebbal Belt');
    expect(param('groupId')).toBe('airport-belt');
    expect(params().has('areaKey')).toBe(false);
  });
});
