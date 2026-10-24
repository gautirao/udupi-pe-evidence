/**
 * #2859 B7 (issue 285907) WEB slice A — discover-1939-listing-peek-url-restore, assertion 1939-14 (+ 1939-7).
 *
 * 1939-14: the URL `listing=<id>` reaches the REAL residential marker layer (PropertyMap -> MarkerClusterLayer,
 * PropertyMap.tsx `selectedListingId` -> createSelectedMarkerIcon) as the selected-state icon
 * (`data-selected="true"`), and dropping `listing=` clears it. The existing page harness
 * (MapDiscovery.issue2149.secondMarkerTap.test.tsx) mounts a MOCK PropertyMap that merely forwards the prop, so
 * the marker-layer half of the hop was never composed with the URL half.
 *
 * Here the REAL PropertyMap + REAL MarkerClusterLayer + REAL markerIcons mount inside the REAL MapDiscovery /
 * DiscoverProvider / router. Only `leaflet` and `react-leaflet` are replaced (jsdom cannot paint Leaflet): the
 * leaflet double records every `L.marker(...)` the layer builds and the `L.divIcon({html})` it was given, so the
 * "rendered marker" is the icon HTML the real layer chose for each listing. The double also emulates the one
 * thing Leaflet's paint gives the page (an element carrying `data-listing-id` that `useMarkerSelection`'s
 * popover hydration reads) — that is an INJECTED boundary: painted Leaflet DOM, a real pointer and real pan
 * are RETAIN (R_injected), only the icon the layer selected is claimed.
 *
 * 1939-7 (plan rev2 F1): "hydration writes no other URL param" is a negative; its positive control is a URL
 * write observed by the SAME LocationProbe in the SAME it (popover X removing `listing=`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { useDiscoverCityListings } from '@/hooks/useDiscoverCityListings';

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

// ─── leaflet / react-leaflet doubles (record what the REAL layer builds) ────────────────────────────────────
type FakeMarker = {
  latlng: [number, number];
  icon: { options: { html: string; className?: string } } | undefined;
  handlers: Record<string, Array<(e: unknown) => void>>;
  el: HTMLElement | null;
  on: (type: string, fn: (e: unknown) => void) => FakeMarker;
  setIcon: (icon: FakeMarker['icon']) => void;
  getElement: () => HTMLElement | null;
};
type FakeGroup = { markers: FakeMarker[]; removed: boolean };

const leafletState = vi.hoisted(() => ({
  groups: [] as unknown[],
  mapHandlers: {} as Record<string, Array<() => void>>,
}));

vi.mock('leaflet', () => {
  const makeMarker = (latlng: [number, number], opts?: { icon?: FakeMarker['icon'] }): FakeMarker => {
    const marker: FakeMarker = {
      latlng,
      icon: opts?.icon,
      handlers: {},
      el: null,
      on(type, fn) {
        (marker.handlers[type] ??= []).push(fn);
        return marker;
      },
      setIcon(icon) {
        marker.icon = icon;
      },
      getElement: () => marker.el,
    };
    return marker;
  };
  return {
    default: {
      Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
      divIcon: vi.fn((opts: { html: string; className?: string }) => ({ options: opts })),
      marker: vi.fn(makeMarker),
      markerClusterGroup: vi.fn(() => {
        const group = {
          markers: [] as FakeMarker[],
          removed: false,
          _spiderfied: null as unknown,
          options: {},
          addLayer(m: FakeMarker) {
            group.markers.push(m);
          },
          on: vi.fn().mockReturnThis(),
          off: vi.fn().mockReturnThis(),
        };
        leafletState.groups.push(group);
        return group;
      }),
      point: vi.fn((x: number, y: number) => ({ x, y })),
      latLngBounds: vi.fn((b: [[number, number], [number, number]]) => ({
        getCenter: () => ({ lat: (b[0][0] + b[1][0]) / 2, lng: (b[0][1] + b[1][1]) / 2 }),
        getSouthWest: () => ({ lat: b[0][0], lng: b[0][1] }),
        getNorthEast: () => ({ lat: b[1][0], lng: b[1][1] }),
      })),
    },
  };
});
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.Default.css', () => ({}));
vi.mock('leaflet.markercluster', () => ({}));
vi.mock('leaflet-draw', () => ({}));
vi.mock('leaflet-draw/dist/leaflet.draw.css', () => ({}));

const mapContainerEl = vi.hoisted(() => {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true });
  return el;
});

const mapStub = vi.hoisted(() => {
  const stub = {
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    setView: vi.fn(),
    setZoom: vi.fn(),
    panTo: vi.fn(),
    // Emulates Leaflet "painting" a marker layer: each marker gets an element carrying whatever the layer's own
    // `marker.on('add')` handler stamps (data-listing-id). INJECTED boundary (R_injected), not claimed.
    addLayer: vi.fn((group: { markers: FakeMarker[] }) => {
      group.markers.forEach((m) => {
        const el = document.createElement('div');
        el.setAttribute('data-test-painted-marker', 'true');
        mapContainerEl.appendChild(el);
        m.el = el;
        (m.handlers.add ?? []).forEach((fn) => fn({}));
      });
    }),
    removeLayer: vi.fn((group: { markers: FakeMarker[]; removed: boolean }) => {
      group.removed = true;
      group.markers.forEach((m) => m.el?.remove());
    }),
    getZoom: vi.fn(() => 14),
    getBoundsZoom: vi.fn(() => 15),
    getBounds: vi.fn(() => ({
      getNorth: () => 13.4,
      getSouth: () => 13.3,
      getEast: () => 74.8,
      getWest: () => 74.7,
    })),
    getContainer: vi.fn(() => mapContainerEl),
    on: vi.fn((type: string, fn: () => void) => {
      (leafletState.mapHandlers[type] ??= []).push(fn);
    }),
    off: vi.fn((type: string, fn: () => void) => {
      leafletState.mapHandlers[type] = (leafletState.mapHandlers[type] ?? []).filter((f) => f !== fn);
    }),
    once: vi.fn(),
    invalidateSize: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 13.34, lng: 74.74 })),
    remove: vi.fn(),
  };
  return stub;
});

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div
      data-testid="leaflet-double-container"
      ref={(node) => {
        if (node && !node.contains(mapContainerEl)) node.appendChild(mapContainerEl);
      }}
    >
      {children}
    </div>
  ),
  TileLayer: () => null,
  ZoomControl: () => null,
  Marker: () => null,
  Popup: () => null,
  Circle: () => null,
  Polygon: () => null,
  Tooltip: () => null,
  useMap: () => mapStub,
  useMapEvents: () => mapStub,
}));

vi.mock('@/components/map/DrawControl', () => ({ DrawControl: () => null }));
vi.mock('@/components/map/AreaMarkerLayer', () => ({
  AreaMarkerLayer: () => null,
  AreaDestinationMarkerLayer: () => null,
}));
vi.mock('@/components/map/SchoolMarkerLayer', () => ({
  SchoolMarkerLayer: () => null,
  SELECTED_SCHOOL_PANE_NAME: 'selected-school-pane',
}));
vi.mock('@/dev/ScaleHud', () => ({ ScaleHud: () => null }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));
vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: { city: 'udupi', areas: [] }, isLoading: false })),
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
vi.mock('@/hooks/useSchoolRadiusListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSchoolRadiusListings')>();
  return { ...actual, useSchoolRadiusListings: vi.fn(() => ({ data: undefined, isLoading: false })) };
});
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
vi.mock('@/hooks/useAreaGroups', () => ({ useAreaGroups: vi.fn(() => ({ data: undefined, isLoading: false })) }));
vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useRegionalAreaGroups: vi.fn(() => ({ groups: [], isLoading: false, error: null })),
  useAgriDestinations: vi.fn(() => ({
    destinations: [], isLoading: false, isError: false, isNotYetPromoted: false, error: null, refetch: vi.fn(),
  })),
}));
vi.mock('@/hooks/useDiscoverSummary', () => ({
  useDiscoverSummary: vi.fn(() => ({
    data: {
      city: 'udupi', propertyType: null, groupBy: 'area_group', totalActiveListings: 4,
      regions: [{ regionKey: 'north', regionLabel: 'North Udupi', listingCount: 4 }],
    },
    isLoading: false,
  })),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  },
}));

// ─── fixtures ──────────────────────────────────────────────────────────────────────────────────────────────
const MANIPAL = 'IN|KA|Udupi|Manipal';
const cityListing = (id: string, title: string, lat: number, lon: number, pricePaise: number) => ({
  id, title, lat, lon, propertyType: 'apartment', pricePaise, locality: 'Manipal',
});
const LISTING_A = cityListing('sel-a', 'Selected Home A', 13.34, 74.74, 5_000_000_00);
const LISTING_B = cityListing('sel-b', 'Selected Home B', 13.36, 74.76, 6_000_000_00);

function provideMarkers(listings: Array<ReturnType<typeof cityListing>>) {
  vi.mocked(useDiscoverAreas).mockReturnValue({
    data: {
      city: 'udupi',
      areas: [
        {
          areaKey: MANIPAL, name: 'Manipal', geoCenterLat: 13.34, geoCenterLon: 74.74,
          minLat: 13.3, minLon: 74.7, maxLat: 13.38, maxLon: 74.78, listingCount: listings.length, schoolCount: 3,
        },
      ],
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useDiscoverAreas>);
  vi.mocked(useDiscoverCityListings).mockReturnValue({
    data: { city: 'udupi', limitPerArea: 50, areas: [{ areaKey: MANIPAL, areaName: 'Manipal', listings }] },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useDiscoverCityListings>);
}

const peekUrl = (listingId?: string) =>
  `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=14&journey=area-first&areaKey=${encodeURIComponent(MANIPAL)}${
    listingId ? `&listing=${listingId}` : ''
  }`;

// ONE LocationProbe: records every location the router ever held (search + key), in order.
const seen: Array<{ pathname: string; search: string; key: string }> = [];
let probeNavigate: ReturnType<typeof useNavigate> | undefined;
function LocationProbe() {
  const location = useLocation();
  probeNavigate = useNavigate();
  React.useEffect(() => {
    seen.push({ pathname: location.pathname, search: location.search, key: location.key });
  }, [location]);
  return null;
}
const lastSearch = () => new URLSearchParams(seen[seen.length - 1]?.search ?? '');

const tree = (url: string, qc: QueryClient) => (
  <QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[url]}>
      <LocationProbe />
      <Routes>
        <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
);

/** The icon HTML the REAL MarkerClusterLayer currently renders for a listing (latest live cluster group). */
function renderedIconHtml(listing: { lat: number; lon: number }): string | null {
  const groups = (leafletState.groups as FakeGroup[]).filter((g) => !g.removed);
  const group = groups[groups.length - 1];
  const marker = group?.markers.find((m) => m.latlng[0] === listing.lat && m.latlng[1] === listing.lon);
  return marker?.icon?.options.html ?? null;
}
const isSelectedMarker = (listing: { lat: number; lon: number }) =>
  renderedIconHtml(listing)?.includes('data-selected="true"') ?? false;

describe('#2859 B7 1939-14 / 1939-7 — URL listing= reaches the REAL marker layer', () => {
  beforeEach(() => {
    // Fail-closed network: any request not otherwise answered gets 503 (no real loopback request is made).
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    seen.length = 0;
    probeNavigate = undefined;
    leafletState.groups.length = 0;
    for (const k of Object.keys(leafletState.mapHandlers)) delete leafletState.mapHandlers[k];
    mapContainerEl.replaceChildren();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isLoading: false, isAdmin: false, isDealer: false });
    provideMarkers([LISTING_A, LISTING_B]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(useDiscoverAreas).mockReturnValue({ data: { city: 'udupi', areas: [] }, isLoading: false } as unknown as ReturnType<typeof useDiscoverAreas>);
    vi.mocked(useDiscoverCityListings).mockReturnValue({ data: { areas: [] }, isLoading: false } as unknown as ReturnType<typeof useDiscoverCityListings>);
  });

  it('cold listing=A renders A (not B) with the selected icon on the real layer, hydration writes no other URL param (same-probe X control), and dropping/moving listing= moves the selected icon', async () => {
    render(tree(peekUrl('sel-a'), new QueryClient({ defaultOptions: { queries: { retry: false } } })));

    // BEFORE (1939-14): the real layer built both markers; A carries the selected icon, B the default icon.
    await waitFor(() => {
      expect(renderedIconHtml(LISTING_A)).not.toBeNull();
      expect(renderedIconHtml(LISTING_B)).not.toBeNull();
    });
    expect(isSelectedMarker(LISTING_A)).toBe(true);
    expect(isSelectedMarker(LISTING_B)).toBe(false);
    expect(renderedIconHtml(LISTING_B)).toContain('data-testid="property-marker"');

    // Popover hydrated from the cold link (needs the painted-element lookup the leaflet double emulates).
    const card = await screen.findByTestId('marker-popover-card');
    expect(card).toHaveTextContent('Selected Home A');

    // 1939-7 NEGATIVE: hydration wrote NOTHING. Same probe: exactly one location was ever observed, still the
    // router's initial entry ('default' key), with the cold URL's params untouched.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400)); // outlast the 300ms viewport/URL debounce
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].key).toBe('default');
    const cold = new URLSearchParams(seen[0].search);
    expect(cold.get('city')).toBe('udupi');
    expect(cold.get('journey')).toBe('area-first');
    expect(cold.get('areaKey')).toBe(MANIPAL);
    expect(cold.get('listing')).toBe('sel-a');
    expect([...cold.keys()].sort()).toEqual(['areaKey', 'city', 'journey', 'lat', 'listing', 'lon', 'zoom']);

    // 1939-7 POSITIVE CONTROL (same it, same probe): a deliberate in-app URL write — the popover X removing
    // listing= — IS observed by this probe, so the single-location result above is a real "no write", not a blind probe.
    fireEvent.click(screen.getByRole('button', { name: 'Close property preview' }));
    await waitFor(() => {
      expect(seen.length).toBe(2);
    });
    expect(seen[1].key).not.toBe('default');
    expect(lastSearch().has('listing')).toBe(false);
    expect(lastSearch().get('areaKey')).toBe(MANIPAL);

    // AFTER (1939-14): the URL dropped listing= -> the real layer repaints A with the DEFAULT icon.
    // The icons must still be RENDERED (non-null, property markers) — otherwise "not selected" would also hold
    // for a torn-down layer (isSelectedMarker is false for a null icon).
    await waitFor(() => {
      expect(renderedIconHtml(LISTING_A)).toContain('data-testid="property-marker"');
      expect(isSelectedMarker(LISTING_A)).toBe(false);
    });
    expect(renderedIconHtml(LISTING_B)).toContain('data-testid="property-marker"');
    expect(isSelectedMarker(LISTING_B)).toBe(false);
    expect(screen.queryByTestId('marker-popover-card')).not.toBeInTheDocument();

    // And the selection MOVES with the URL: listing=B selects B's icon, A stays default.
    act(() => {
      probeNavigate!(peekUrl('sel-b'));
    });
    await waitFor(() => {
      expect(isSelectedMarker(LISTING_B)).toBe(true);
    });
    expect(renderedIconHtml(LISTING_A)).toContain('data-testid="property-marker"');
    expect(isSelectedMarker(LISTING_A)).toBe(false);
    expect(lastSearch().get('listing')).toBe('sel-b');
  });
});
