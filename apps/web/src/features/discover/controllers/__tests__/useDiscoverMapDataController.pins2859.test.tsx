/**
 * #2859 B6 (handoff 285906) AC4 — the authed marker chain composed BELOW the page, down to captured
 * Leaflet pins: L41 (2193-8) and L209 (1240-7).
 *
 * What runs for real in ONE React tree:
 *   useDiscoverMapDataController -> useDiscoverMapData (REAL useDiscoverFilteredMarkers,
 *   useDiscoverCityListings, useDiscoverListings, useDiscoverAreas, useSchoolRadiusListings,
 *   the REAL filteredMarkerToPropertyListing / cityListingToPropertyListing mappers)
 *   -> REAL lib/api.ts -> global fetch (stubbed here; the captured URL + headers are asserted)
 *   -> useDiscoverMarkerPopoverController (REAL resolveMarkerPopover -> resolveMarkerListings)
 *   -> REAL PropertyMap -> REAL MarkerClusterLayer (ResidentialMarkerClusterLayer.tsx:409
 *   `L.marker([lat, lng], { icon })`, :441 `clusterGroup.addLayer(marker)`, :589 `map.addLayer`).
 *
 * Injected (named, NOT claimed):
 *   - the Supabase session (supabase.auth.getSession mocked: the header source api.ts:46-49)
 *     and the isAuthenticated flag (useAuth on the page) — both flipped together per arm;
 *   - Leaflet itself (R_pin): a "pin" is an L.marker created by the real layer and held by a cluster
 *     group that is currently added to the map; real marker paint is RETAIN;
 *   - the relay hops this harness does NOT mount: buildMapSurfaceModel / DiscoverMapSurface.tsx:395
 *     (`currentMapMarkerListings: view.markers.currentMapMarkerListings`) and DiscoverMapCanvas.tsx:807-808
 *     (`<PropertyMap listings={currentMapMarkerListings}`) — prop pass-throughs, RETAIN subclaims;
 *   - schoolRadiusFallbackMarkers = [] (the page derives it elsewhere; 1240-3/-5 cover it separately);
 *   - useTrendsOptions / useSchoolById (non-marker sub-hooks) and useDiscoverShell (context).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Leaflet capture (R_pin) ─────────────────────────────────────────────────
type CapturedMarker = { latlng: [number, number]; options: unknown };
type CapturedGroup = { layers: CapturedMarker[] };
const leafletState = vi.hoisted(() => ({
  groups: [] as Array<{ layers: Array<{ latlng: [number, number]; options: unknown }> }>,
  live: new Set<unknown>(),
}));

vi.mock('leaflet', () => {
  const noopChain = () => {
    const o: Record<string, unknown> = {};
    o.on = vi.fn(() => o);
    o.off = vi.fn(() => o);
    return o;
  };
  return {
    default: {
      Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
      divIcon: vi.fn((opts: unknown) => ({ options: opts })),
      marker: vi.fn((latlng: [number, number], options: unknown) => {
        const m: Record<string, unknown> = { latlng, options };
        m.on = vi.fn(() => m);
        m.off = vi.fn(() => m);
        m.getElement = vi.fn(() => null);
        m.setIcon = vi.fn(() => m);
        m.setZIndexOffset = vi.fn(() => m);
        m.bindTooltip = vi.fn(() => m);
        m.addTo = vi.fn(() => m);
        return m;
      }),
      markerClusterGroup: vi.fn(() => {
        const g: Record<string, unknown> & { layers: unknown[] } = { layers: [] };
        g.addLayer = vi.fn((m: unknown) => {
          g.layers.push(m);
          return g;
        });
        g.clearLayers = vi.fn(() => {
          g.layers.length = 0;
          return g;
        });
        g.getLayers = vi.fn(() => g.layers);
        g.on = vi.fn(() => g);
        g.off = vi.fn(() => g);
        g.refreshClusters = vi.fn(() => g);
        g.getVisibleParent = vi.fn(() => null);
        leafletState.groups.push(g as unknown as { layers: Array<{ latlng: [number, number]; options: unknown }> });
        return g;
      }),
      point: vi.fn((x: number, y: number) => ({ x, y })),
      latLng: vi.fn((lat: number, lng: number) => ({ lat, lng })),
      latLngBounds: vi.fn(() => ({
        isValid: () => true,
        extend: vi.fn(),
        pad: vi.fn(function pad(this: unknown) { return this; }),
        getCenter: () => ({ lat: 0, lng: 0 }),
        getNorthEast: () => ({ lat: 0, lng: 0 }),
        getSouthWest: () => ({ lat: 0, lng: 0 }),
      })),
      layerGroup: vi.fn(() => ({ ...noopChain(), addLayer: vi.fn(), clearLayers: vi.fn(), addTo: vi.fn() })),
    },
  };
});

const fakeMap = vi.hoisted(() => {
  const bounds = { getNorth: () => 14, getSouth: () => 13, getEast: () => 75, getWest: () => 74 };
  const m: Record<string, unknown> = {};
  Object.assign(m, {
    addLayer: (g: unknown) => {
      leafletState.live.add(g);
      return m;
    },
    removeLayer: (g: unknown) => {
      leafletState.live.delete(g);
      return m;
    },
    hasLayer: (g: unknown) => leafletState.live.has(g),
    flyTo: () => m,
    flyToBounds: () => m,
    fitBounds: () => m,
    panTo: () => m,
    panInside: () => m,
    setView: () => m,
    getBounds: () => bounds,
    getCenter: () => ({ lat: 13.35, lng: 74.78 }),
    getZoom: () => 14,
    getBoundsZoom: () => 14,
    getMaxZoom: () => 19,
    getMinZoom: () => 3,
    getSize: () => ({ x: 800, y: 600 }),
    getContainer: () => document.body,
    invalidateSize: () => m,
    stop: () => m,
    remove: () => m,
    on: () => m,
    off: () => m,
    once: () => m,
    whenReady: (cb: () => void) => {
      cb();
      return m;
    },
    latLngToContainerPoint: () => ({ x: 0, y: 0 }),
    containerPointToLatLng: () => ({ lat: 0, lng: 0 }),
  });
  return m;
});

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TileLayer: () => null,
  ZoomControl: () => null,
  useMap: () => fakeMap,
  useMapEvents: () => fakeMap,
}));
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.Default.css', () => ({}));
vi.mock('leaflet.markercluster', () => ({}));
vi.mock('leaflet-draw', () => ({}));
vi.mock('leaflet-draw/dist/leaflet.draw.css', () => ({}));
vi.mock('@/components/map/DrawControl', () => ({ DrawControl: () => null }));

// ─── Session source (the ONLY network-adjacent mock) ─────────────────────────
const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));

// ─── Non-marker sub-hooks + shell context ────────────────────────────────────
vi.mock('@/hooks/useTrendsOptions', () => ({ useTrendsOptions: () => ({ data: undefined }) }));
vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolById: () => ({ data: undefined, isLoading: false, error: null }),
}));
vi.mock('@/features/discover/context/useDiscoverContext', () => ({
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
    getAreaSetCameraRestoreRequest: () => null,
    setAreaSetCameraRestoreRequest: vi.fn(),
  }),
}));

// ─── Imports after mocks ─────────────────────────────────────────────────────
import { useDiscoverMapDataController } from '../useDiscoverMapDataController';
import { useDiscoverMarkerPopoverController } from '../useDiscoverMarkerPopoverController';
import { selectDiscoverMapLayer, toLayerInput } from '@/features/discover/selectors/mapLayerCategory';
import { PropertyMap } from '@/components/map/PropertyMap';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

// ─── Fixtures ────────────────────────────────────────────────────────────────
const CITY = 'bangalore';
const LEAF_KEY = 'IN|KA|Bengaluru|Yelahanka';
const OTHER_KEY = 'IN|KA|Bengaluru|Hebbal';
const TARGET_ID = 'b6-2193-target';
const OUTSIDE_ID = 'b6-2193-outside';

const AREA_LEAF: NonNullable<UseAreasNavigationJourneyResult['node']> = {
  nodeKey: 'n:area-1',
  nodeType: 'AREA',
  displayLabel: 'Yelahanka',
  depth: 2,
  regionKey: 'N',
  ancestry: [],
  nextLevelType: 'LISTINGS',
  children: [],
  revisionId: 1,
  bounds: null,
  descendantAreaKeys: null,
  areaKey: LEAF_KEY,
};
const LEAF_AREA_POINT: AreaPoint = {
  areaKey: LEAF_KEY,
  areaLabel: 'Yelahanka',
  geo_center_lat: 13.1,
  geo_center_lon: 77.6,
  bbox: null,
};

function makeNav(overrides: Partial<DiscoverNavContextValue> = {}): DiscoverNavContextValue {
  return {
    city: CITY,
    journey: 'area-first',
    areaKey: null,
    schoolId: null,
    groupId: null,
    scope: null,
    radiusKm: null,
    selectedLocality: null,
    filters: {},
    rawNodeParam: null,
    node: null,
    nodeListings: false,
    intent: 'buy',
    q: '',
    selectedGroup: null,
    selectedListing: null,
    ...overrides,
  } as DiscoverNavContextValue;
}

function makeJourney(overrides: Partial<UseAreasNavigationJourneyResult> = {}): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node: null,
    levelKind: 'listings',
    children: [],
    resolutionNotice: null,
    nodeCount: null,
    schoolsNotSimulatedForRevision: false,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
    ...overrides,
  } as UseAreasNavigationJourneyResult;
}

// ─── Fetch stub: routes on the EXACT pathname and records url + headers ──────
type Captured = { url: URL; headers: Record<string, string> };
let captured: Captured[] = [];
let markersBody: unknown = { city: CITY, markers: [], truncated: false };
let cityListingsBody: unknown = { city: CITY, limitPerArea: 50, areas: [] };
let fetchSpy: ReturnType<typeof vi.spyOn>;

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function routeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input), 'http://x');
  const headers = Object.fromEntries(
    Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
  );
  captured.push({ url, headers });
  const p = url.pathname;
  if (p === '/api/discover/markers') return Promise.resolve(json(markersBody));
  if (p === `/api/discover/cities/${CITY}/listings`) return Promise.resolve(json(cityListingsBody));
  if (p === `/api/discover/cities/${CITY}/school-radius-listings`) {
    return Promise.resolve(json({ content: [], hasMore: false }));
  }
  if (p === '/api/discover/listings') {
    return Promise.resolve(json({ content: [], totalElements: 0, totalPages: 0 }));
  }
  if (p === '/api/discover/areas') return Promise.resolve(json({ city: CITY, areas: [] }));
  return Promise.resolve(json({}));
}

const markersRequests = () => captured.filter((c) => c.url.pathname === '/api/discover/markers');
const cityListingsRequests = () =>
  captured.filter((c) => c.url.pathname === `/api/discover/cities/${CITY}/listings`);

/** Pins = markers held by a cluster group that is currently added to the map. */
function livePins(): CapturedMarker[] {
  return (leafletState.groups as CapturedGroup[])
    .filter((g) => leafletState.live.has(g))
    .flatMap((g) => g.layers);
}

// ─── The harness: controller -> popover controller -> REAL PropertyMap ───────
interface HarnessProps {
  nav: DiscoverNavContextValue;
  isAuthenticated: boolean;
  effectiveSelectedArea: AreaPoint | null;
  areasNavigationJourney: UseAreasNavigationJourneyResult;
  isNodeAreaLeafActive: boolean;
  filters?: Record<string, unknown>;
  boundedSearchTriggered?: boolean;
}

function Harness({
  nav,
  isAuthenticated,
  effectiveSelectedArea,
  areasNavigationJourney,
  isNodeAreaLeafActive,
  filters = {},
  boundedSearchTriggered = false,
}: HarnessProps) {
  const data = useDiscoverMapDataController({
    nav,
    city: CITY,
    effectiveSelectedArea,
    legacySelectedArea: null,
    filters,
    selectedSchool: null,
    debouncedSearch: '',
    isAuthenticated,
    fitTick: 0,
    groupAreaKeysForMapData: undefined,
    areasNavigationJourney,
    boundedSearchTriggered,
    mapZoom: 14,
    mapReady: true,
    page: 0,
    mapBbox: null,
    intentListingPurpose: 'sale',
    authLoading: false,
    setShowLoader: () => {},
  });
  const mapLayerCategory = selectDiscoverMapLayer(
    toLayerInput({ ...nav, viewport: null } as unknown as DiscoverUrlState),
    'overview',
  );
  const { currentMapMarkerListings } = useDiscoverMarkerPopoverController({
    nav,
    viewport: null as unknown as DiscoverUrlState['viewport'],
    isNodeAreaLeafActive,
    mapLayerCategory,
    effectiveSelectedArea,
    isGroupResultsState: false,
    isNodeListingsState: false,
    mapZoom: 14,
    mapReady: true,
    isAuthenticated,
    groupResultsMarkers: [],
    nodeListingsMarkers: [],
    markerListings: data.markerListings,
    areaMarkerListings: data.areaMarkerListings,
    schoolRadiusFallbackMarkers: [],
    isLoadingAreaListings: data.isLoadingAreaListings,
    isErrorAreaListings: data.isErrorAreaListings,
    markersLoading: data.markersLoading,
    isAnonViewport: data.isAnonViewport,
    anonViewportMarkerListings: data.anonViewportMarkerListings,
    markerSelection: {
      selectedMarkerListing: null,
      selectMarkerSibling: vi.fn(),
      clearMarkerPopoverFromUrl: vi.fn(),
      isMarkerPopoverUrlBacked: () => false,
      hydrateSelectedMarkerFromUrl: vi.fn(),
    },
  });
  return (
    <>
      {/* areaListings = the panel's card source for an area leaf (the panel render hop is not mounted) */}
      <div data-testid="probe-area-listings">{data.areaListings.map((l) => l.id).join(',')}</div>
      <PropertyMap listings={currentMapMarkerListings} />
    </>
  );
}

function mount(props: HarnessProps) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
}

const settle = () => new Promise((r) => setTimeout(r, 80));

function asSession(authed: boolean) {
  mockGetSession.mockResolvedValue({
    data: { session: authed ? { access_token: 'b6-authed-token' } : null },
  });
}

function resetCapture() {
  captured = [];
  leafletState.groups.length = 0;
  leafletState.live.clear();
}

beforeEach(() => {
  resetCapture();
  mockGetSession.mockReset();
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(routeFetch as typeof fetch);
});

afterEach(() => {
  cleanup();
  fetchSpy.mockRestore();
});

describe('#2859 B6 AC4 authed marker chain -> captured PropertyMap pins (controller -> resolveMarkerPopover -> PropertyMap, fetch-stubbed lib/api)', () => {
  it('1240-7 (L209): an authed bounded school-first markers response with backend lat/lon becomes pins at exactly those lat/lng; anon control in the same it: zero /api/discover/markers requests and zero pins', async () => {
    markersBody = {
      city: CITY,
      markers: [
        { id: 'b6-1240-pin-1', lat: 13.3555, lon: 74.7894, pricePaise: 500_000_000, locality: 'Manipal' },
        { id: 'b6-1240-pin-2', lat: 13.3505, lon: 74.7884, pricePaise: 450_000_000, locality: 'Manipal' },
      ],
      truncated: false,
    };
    cityListingsBody = { city: CITY, limitPerArea: 50, areas: [] };
    const schoolProps = {
      nav: makeNav({ journey: 'school-first', schoolId: 'school-42' }),
      effectiveSelectedArea: null,
      areasNavigationJourney: makeJourney(),
      isNodeAreaLeafActive: false,
      filters: { schoolLat: 13.3525, schoolLon: 74.7864, schoolRadiusKm: 3 },
      boundedSearchTriggered: true,
    };

    // AUTHED arm
    asSession(true);
    const authed = mount({ ...schoolProps, isAuthenticated: true });
    await waitFor(() => {
      expect(livePins()).toHaveLength(2);
    });
    expect(markersRequests()).toHaveLength(1);
    expect(markersRequests()[0].headers['authorization']).toBe('Bearer b6-authed-token');
    expect(markersRequests()[0].url.searchParams.getAll('schoolLat')).toEqual(['13.3525']);
    const authedLatLngs = livePins().map((p) => p.latlng);
    expect(authedLatLngs).toEqual(
      expect.arrayContaining([
        [13.3555, 74.7894],
        [13.3505, 74.7884],
      ]),
    );
    expect(authedLatLngs).toHaveLength(2);
    for (const [lat, lng] of authedLatLngs) {
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
    }
    authed.unmount();

    // ANON control (only the session + isAuthenticated varied; same response armed)
    resetCapture();
    asSession(false);
    mount({ ...schoolProps, isAuthenticated: false });
    await settle();
    await settle();
    expect(markersRequests()).toHaveLength(0);
    expect(livePins()).toHaveLength(0);
    // Not a never-mounted false green: the anon tree did reach fetch (public endpoints) and built a layer.
    expect(captured.length).toBeGreaterThan(0);
    expect(leafletState.groups.length).toBeGreaterThan(0);
  });

  it('2193-8 (L41): an authed canonical AREA leaf yields exactly one pin, the TARGET, while the authed markers response and the city-listings response both also carry an OUTSIDE listing; anon control in the same it: zero /api/discover/markers requests, public city-listings request without Authorization, still only the TARGET pin', async () => {
    markersBody = {
      city: CITY,
      markers: [
        { id: TARGET_ID, lat: 13.1001, lon: 77.6001, pricePaise: 700_000_000, locality: 'Yelahanka' },
        { id: OUTSIDE_ID, lat: 13.2002, lon: 77.7002, pricePaise: 800_000_000, locality: 'Hebbal' },
      ],
      truncated: false,
    };
    cityListingsBody = {
      city: CITY,
      limitPerArea: 50,
      areas: [
        {
          areaKey: LEAF_KEY,
          areaName: 'Yelahanka',
          listings: [{ id: TARGET_ID, title: 'Target home', lat: 13.1001, lon: 77.6001, pricePaise: 700_000_000, propertyType: 'house' }],
        },
        {
          areaKey: OTHER_KEY,
          areaName: 'Hebbal',
          listings: [{ id: OUTSIDE_ID, title: 'Outside home', lat: 13.2002, lon: 77.7002, pricePaise: 800_000_000, propertyType: 'house' }],
        },
      ],
    };
    const leafProps = {
      nav: makeNav({ journey: 'area-first', rawNodeParam: 'n:area-1', node: 'n:area-1' }),
      effectiveSelectedArea: LEAF_AREA_POINT,
      areasNavigationJourney: makeJourney({ node: AREA_LEAF }),
      isNodeAreaLeafActive: true,
    };

    // AUTHED arm
    asSession(true);
    const authed = mount({ ...leafProps, isAuthenticated: true });
    await waitFor(() => {
      expect(livePins()).toHaveLength(1);
    });
    await waitFor(() => {
      expect(markersRequests()).toHaveLength(1);
    });
    await settle();
    expect(livePins()).toHaveLength(1);
    expect(livePins()[0].latlng).toEqual([13.1001, 77.6001]);
    expect(livePins().some((p) => p.latlng[0] === 13.2002 && p.latlng[1] === 77.7002)).toBe(false);
    // the OUTSIDE listing WAS available to the client on both requests (positive control for the absence)
    expect(markersRequests()[0].headers['authorization']).toBe('Bearer b6-authed-token');
    expect(markersRequests()[0].url.searchParams.get('nodeKey')).toBe('n:area-1');
    expect(cityListingsRequests()).toHaveLength(1);
    expect(cityListingsRequests()[0].url.searchParams.getAll('areaKeys')).toEqual([LEAF_KEY]);
    // the panel's card source carries the TARGET only (OUTSIDE sat under another areaKey in the response)
    expect(authed.getByTestId('probe-area-listings').textContent).toBe(TARGET_ID);
    authed.unmount();

    // ANON control (only the session + isAuthenticated varied)
    resetCapture();
    asSession(false);
    mount({ ...leafProps, isAuthenticated: false });
    await waitFor(() => {
      expect(livePins()).toHaveLength(1);
    });
    await settle();
    expect(markersRequests()).toHaveLength(0);
    expect(cityListingsRequests()).toHaveLength(1);
    expect(cityListingsRequests()[0].headers['authorization']).toBeUndefined();
    expect(livePins()).toHaveLength(1);
    expect(livePins()[0].latlng).toEqual([13.1001, 77.6001]);
  });

  it('2193-6 (L41): area-first with NO node, area, group or school sends neither a /api/discover/markers nor a city-listings request (captured fetch) and builds no pins; positive arm in the same it: the resolved leaf sends both and pins the TARGET', async () => {
    markersBody = {
      city: CITY,
      markers: [{ id: TARGET_ID, lat: 13.1001, lon: 77.6001, pricePaise: 700_000_000, locality: 'Yelahanka' }],
      truncated: false,
    };
    cityListingsBody = {
      city: CITY,
      limitPerArea: 50,
      areas: [
        {
          areaKey: LEAF_KEY,
          areaName: 'Yelahanka',
          listings: [{ id: TARGET_ID, title: 'Target home', lat: 13.1001, lon: 77.6001, pricePaise: 700_000_000, propertyType: 'house' }],
        },
      ],
    };
    asSession(true);

    // POSITIVE arm: resolved leaf
    const positive = mount({
      nav: makeNav({ journey: 'area-first', rawNodeParam: 'n:area-1', node: 'n:area-1' }),
      effectiveSelectedArea: LEAF_AREA_POINT,
      areasNavigationJourney: makeJourney({ node: AREA_LEAF }),
      isNodeAreaLeafActive: true,
      isAuthenticated: true,
    });
    await waitFor(() => {
      expect(markersRequests()).toHaveLength(1);
      expect(cityListingsRequests()).toHaveLength(1);
      expect(livePins()).toHaveLength(1);
    });
    positive.unmount();

    // NEGATIVE arm: same authed area-first zoom-14 tree, nothing selected
    resetCapture();
    mount({
      nav: makeNav({ journey: 'area-first' }),
      effectiveSelectedArea: null,
      areasNavigationJourney: makeJourney(),
      isNodeAreaLeafActive: false,
      isAuthenticated: true,
    });
    await settle();
    await settle();
    expect(markersRequests()).toHaveLength(0);
    expect(cityListingsRequests()).toHaveLength(0);
    expect(captured.some((c) => c.url.pathname === '/api/discover/listings')).toBe(false);
    expect(livePins()).toHaveLength(0);
    // the tree did run and reach fetch (areas list): not a never-mounted false green
    expect(captured.some((c) => c.url.pathname === '/api/discover/areas')).toBe(true);
  });
});
