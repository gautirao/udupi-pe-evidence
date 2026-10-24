/**
 * #2859 B7 (issue 285907) WEB slice A — discover-cluster-focus-back, assertion cfb-8 (FALLBACK form).
 *
 * cfb-8 is "a click on the real cluster marker reaches the clusterFocus URL writer through PropertyMap ->
 * DiscoverMapCanvas onClusterFocusChange". The marker-click half (AreaDestinationMarkerLayer building a
 * visual-cluster card from the navigation hierarchy and calling `onClusterFocusChange`) needs the navigation
 * resolve + a projected Leaflet map; the canvas half is what no approved destination mounts. This file proves
 * the CANVAS half composed through the REAL page: MapDiscovery -> DiscoverMapSurface -> DiscoverMapCanvas hands
 * PropertyMap an `onClusterFocusChange` that, when PropertyMap invokes it, writes `clusterFocus=` to the URL as
 * ONE REPLACE, leaves `node=` untouched, and the written focus flows back to PropertyMap as
 * `focusedClusterMemberAreaKeys`. PropertyMap is a recording double here, so the PropertyMap ->
 * AreaDestinationMarkerLayer -> cluster-marker click hop (PropertyMap.tsx relay at the
 * `onClusterFocusChange={onClusterFocusChange}` line) and the painted cluster marker / real pointer are RETAIN.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

type CapturedMapProps = {
  onClusterFocusChange?: (keys: readonly string[] | null) => void;
  focusedClusterMemberAreaKeys?: readonly string[] | null;
};
const mapState = vi.hoisted(() => ({ props: undefined as unknown, renders: 0 }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));
vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: vi.fn((props: unknown) => {
    mapState.props = props;
    mapState.renders += 1;
    return <div data-testid="property-map-mock" />;
  }),
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

const mapProps = () => mapState.props as CapturedMapProps;

// ONE probe records every location the router held, in order.
const seen: Array<{ search: string; key: string }> = [];
let probeNavigate: ReturnType<typeof useNavigate> | undefined;
function LocationProbe() {
  const location = useLocation();
  probeNavigate = useNavigate();
  React.useEffect(() => {
    seen.push({ search: location.search, key: location.key });
  }, [location]);
  return null;
}
const lastParams = () => new URLSearchParams(seen[seen.length - 1]?.search ?? '');

// Two history entries so REPLACE vs PUSH is observable: PREV is the entry BEFORE the node entry.
const PREV_URL = '/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=11';
const NODE_URL = `${PREV_URL}&node=${encodeURIComponent('d:udupi-north')}`;
const MEMBERS = ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Kunjibettu', 'IN|KA|Udupi|Shivalli'] as const;

describe('#2859 B7 cfb-8 (canvas half) — PropertyMap onClusterFocusChange -> clusterFocus URL writer', () => {
  beforeEach(() => {
    // Fail-closed network: any request not otherwise answered gets 503 (no real loopback request is made).
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    seen.length = 0;
    mapState.props = undefined;
    mapState.renders = 0;
    probeNavigate = undefined;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a cluster-focus callback from PropertyMap writes clusterFocus=<members> as ONE REPLACE, leaves node= unchanged, and flows back as focusedClusterMemberAreaKeys', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[PREV_URL, NODE_URL]} initialIndex={1}>
          <LocationProbe />
          <Routes>
            <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // BEFORE: the canvas handed PropertyMap a callable relay; no focus in the URL; no focus down at the map.
    await waitFor(() => {
      expect(typeof mapProps().onClusterFocusChange).toBe('function');
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const before = lastParams();
    expect(before.get('node')).toBe('d:udupi-north');
    expect(before.has('clusterFocus')).toBe(false);
    expect(mapProps().focusedClusterMemberAreaKeys ?? null).toBeNull();
    const locationsBefore = seen.length;
    const keyBefore = seen[seen.length - 1].key;

    // ACTION: PropertyMap (the AreaDestinationMarkerLayer cluster click, here a recording double) fires the relay.
    act(() => {
      mapProps().onClusterFocusChange!([...MEMBERS]);
    });

    // AFTER: positive — the write landed in the URL, observed by the SAME probe.
    await waitFor(() => {
      expect(lastParams().has('clusterFocus')).toBe(true);
    });
    expect(seen.length).toBeGreaterThan(locationsBefore);
    expect(seen[seen.length - 1].key).not.toBe(keyBefore);
    const focus = lastParams().get('clusterFocus') ?? '';
    expect(decodeURIComponent(focus).split(',')).toEqual([...MEMBERS]);
    // node= untouched (negative, with the positive write observed above in this same it).
    expect(lastParams().get('node')).toBe('d:udupi-north');
    expect(lastParams().get('city')).toBe('udupi');
    // The written focus flows back down to the map layer.
    await waitFor(() => {
      expect(mapProps().focusedClusterMemberAreaKeys).toEqual([...MEMBERS]);
    });

    // REPLACE, not PUSH: one Back skips the focused entry entirely and lands on the entry BEFORE the node entry.
    act(() => {
      probeNavigate!(-1);
    });
    await waitFor(() => {
      expect(lastParams().has('node')).toBe(false);
    });
    expect(lastParams().has('clusterFocus')).toBe(false);
    expect(screen.getByTestId('property-map-mock')).toBeInTheDocument();
  });
});
