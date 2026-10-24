/**
 * #2859 B7 (issue 285907) WEB slice A — issue-2015-search-this-area-viewport, assertion 2015-12.
 *
 * 2015-12 is "a click on the real Search-this-area CTA reaches activateViewportSearch through DiscoverMapCanvas
 * `onActivate` and commits the VIEWPORT scope to the URL". SearchThisAreaCta (calls its prop) and
 * useDiscoverViewportSearch (activate() alone) each have isolated tests; the canvas relay between them
 * (DiscoverMapCanvas `<SearchThisAreaCta onActivate={onActivateViewportSearch ?? ...}>`) was mounted by none.
 *
 * Here the REAL page (MapDiscovery -> DiscoverProvider -> DiscoverMapCanvas -> real SearchThisAreaCta ->
 * real useDiscoverViewportSearch -> real URL facade) is driven from a recording PropertyMap double: the test
 * calls the `onBoundsChange` / `onUserCameraGesture` props the canvas gave the map (the BoundsWatcher
 * contract), then clicks the REAL CTA button. A real Leaflet pan / bounds event is an INJECTED boundary
 * (R_injected) and stays RETAIN.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import React from 'react';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';

const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
);

type CapturedMapProps = {
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
  onUserCameraGesture?: () => void;
};
const mapState = vi.hoisted(() => ({ props: undefined as unknown }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));
vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: vi.fn((props: unknown) => {
    mapState.props = props;
    return <div data-testid="property-map-mock" />;
  }),
}));
vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// The committed area must RESOLVE in the areas payload, else the page prunes the unresolvable scope from the URL.
vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: {
      city: 'udupi',
      areas: [
        {
          areaKey: 'IN|KA|Udupi|Manipal', name: 'Manipal', geoCenterLat: 13.34, geoCenterLon: 74.74,
          minLat: 13.3, minLon: 74.7, maxLat: 13.38, maxLon: 74.78, listingCount: 1, schoolCount: 3,
        },
      ],
    },
    isLoading: false,
  })),
}));
vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: vi.fn(() => ({
    data: {
      city: 'udupi',
      limitPerArea: 50,
      areas: [
        {
          areaKey: 'IN|KA|Udupi|Manipal', areaName: 'Manipal',
          listings: [
            { id: 'vp-1', title: 'Viewport Home', lat: 13.34, lon: 74.74, propertyType: 'apartment', pricePaise: 5_000_000_00, locality: 'Manipal' },
          ],
        },
      ],
    },
    isLoading: false,
    isError: false,
  })),
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
function LocationProbe() {
  const location = useLocation();
  React.useEffect(() => {
    seen.push({ search: location.search, key: location.key });
  }, [location]);
  return null;
}
const lastParams = () => new URLSearchParams(seen[seen.length - 1]?.search ?? '');

const AREA_KEY = 'IN|KA|Udupi|Manipal';
// A committed AREA_SET is what makes "Search this area" eligible (useDiscoverViewportSearch.isEligible).
const AREA_SET_URL = `/discover?city=udupi&lat=13.34000&lon=74.74000&zoom=13&journey=area-first&areaKey=${encodeURIComponent(
  AREA_KEY,
)}&rscope=areas&rareas=${encodeURIComponent(AREA_KEY)}`;
const BASELINE_BBOX: [number, number, number, number] = [13.3, 74.7, 13.4, 74.8];
// Center moved 0.05 deg north of a 0.1x0.1 box: drift ratio ~0.35 > the hook's 0.15 tolerance.
const DRIFTED_BBOX: [number, number, number, number] = [13.35, 74.7, 13.45, 74.8];

describe('#2859 B7 2015-12 — real Search-this-area CTA click -> DiscoverMapCanvas onActivate -> VIEWPORT commit in the URL', () => {
  beforeEach(() => {
    // Fail-closed network: any request not otherwise answered gets 503 (no real loopback request is made).
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    seen.length = 0;
    mapState.props = undefined;
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAdmin: false, isDealer: false });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no CTA and no rscope=vp before drift; a gesture + bbox drift past tolerance shows the REAL CTA; clicking it commits rscope=vp with 4-part rvp, rprev=areas:..., and hides the CTA', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[AREA_SET_URL]}>
          <LocationProbe />
          <Routes>
            <Route path="*" element={<DiscoverProvider><MapDiscovery /></DiscoverProvider>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(typeof mapProps().onBoundsChange).toBe('function');
      expect(typeof mapProps().onUserCameraGesture).toBe('function');
    });

    // The first settle seeds the drift baseline (useDiscoverViewportTracker debounces 300ms).
    act(() => {
      mapProps().onBoundsChange!(BASELINE_BBOX);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });

    // BEFORE: eligible scope is committed (rscope=areas) but nothing has drifted — no CTA, no VIEWPORT scope.
    expect(lastParams().get('rscope')).toBe('areas');
    expect(screen.queryByRole('button', { name: /search this area/i })).not.toBeInTheDocument();
    expect(seen.every((l) => new URLSearchParams(l.search).get('rscope') !== 'vp')).toBe(true);

    // A genuine gesture, then the bbox drifts past tolerance -> the REAL CTA renders (positive control for the
    // "no CTA" above: the absence was a state, not a blind query).
    act(() => {
      mapProps().onUserCameraGesture!();
    });
    act(() => {
      mapProps().onBoundsChange!(DRIFTED_BBOX);
    });
    const cta = await screen.findByRole('button', { name: /search this area/i });
    // Panning alone commits nothing.
    expect(lastParams().get('rscope')).toBe('areas');

    // ACTION: click the real CTA — DiscoverMapCanvas relays onClick to onActivateViewportSearch.
    fireEvent.click(cta);

    // AFTER: the URL carries the VIEWPORT scope for the drifted bbox, the prior AREA_SET in rprev, and the CTA is gone.
    await waitFor(() => {
      expect(lastParams().get('rscope')).toBe('vp');
    });
    const rvp = (lastParams().get('rvp') ?? '').split(',');
    expect(rvp).toHaveLength(4);
    expect(rvp.map(Number)).toEqual(DRIFTED_BBOX);
    expect(lastParams().get('rprev') ?? '').toMatch(/^areas:/);
    expect(lastParams().get('rprev')).toContain(AREA_KEY);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /search this area/i })).not.toBeInTheDocument();
    });
  });
});
