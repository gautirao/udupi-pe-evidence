/**
 * Issue #2860 (L43 / OQ_R43) — Composed MapDiscovery tests for e2e/discover-agri-direction-first-1448.spec.ts.
 *
 * Exercises the real chain: panel callback -> rightPanelContract wiring -> real useDiscoverUrlState writes ->
 * real agri hooks (useRegionalAreaGroups, useAgriDestinations, useAgriMapListings) -> useDiscoverAgriController ->
 * buildMapSurfaceModel -> DiscoverMapCanvas / AgriJourneyPanel / AgriGroupListingPeek.
 * Only @/lib/api (HTTP boundary) and PropertyMap (Leaflet boundary) are replaced.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import MapDiscovery from '../MapDiscovery';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';

const AREA_MANIPAL = 'IN|KA|Udupi|Manipal';
const AREA_KOTA = 'IN|KA|Udupi|Kota';
const LISTING_1 = 'agri-1448-listing-001';
const LISTING_2 = 'agri-1448-listing-002';

interface RecordedApiCall {
  path: string;
  pathname: string;
  searchParams: URLSearchParams;
}

const { apiGetMock, apiCalls } = vi.hoisted(() => {
  const calls: RecordedApiCall[] = [];
  const fn = vi.fn();
  return { apiGetMock: fn, apiCalls: calls };
});

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      get: (...args: [string, unknown?]) => apiGetMock(...args),
    },
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, isAdmin: false, isDealer: false }),
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: (props: {
    sectorOverlay?: { directionCode: string; maxKm: number } | null;
    agriDestinationMarkers?: Array<{ areaKey: string }> | null;
  }) => (
    <div
      data-testid="property-map-mock"
      data-sector-overlay={JSON.stringify(props.sectorOverlay ?? null)}
      data-agri-dest-keys={JSON.stringify((props.agriDestinationMarkers ?? []).map((m) => m.areaKey))}
    />
  ),
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
  useDiscoverListings: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isFetching: false,
    error: null,
  })),
}));

vi.mock('@/hooks/useDiscoverFilteredMarkers', () => ({
  useDiscoverFilteredMarkers: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isFetching: false,
  })),
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

vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: vi.fn(() => ({ data: { groups: [] }, isLoading: false })),
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

const REGIONAL_AREA_GROUPS_PAYLOAD = {
  city: 'udupi',
  groups: [
    {
      directionCode: 'N',
      groupName: 'N towards Brahmavar',
      availableMaxDistances: [
        { maxKm: 10, distanceLabel: 'Within 10 km', includedBandCodes: ['0_10'], listingCount: 2, areaKeys: [AREA_MANIPAL] },
        { maxKm: 25, distanceLabel: 'Up to 25 km', includedBandCodes: ['0_10', '10_25'], listingCount: 5, areaKeys: [AREA_MANIPAL] },
        { maxKm: 50, distanceLabel: 'Up to 50 km', includedBandCodes: ['0_10', '10_25', '25_50'], listingCount: 8, areaKeys: [AREA_MANIPAL, AREA_KOTA] },
        { maxKm: 100, distanceLabel: 'Up to 100 km', includedBandCodes: ['0_10', '10_25', '25_50', '50_up'], listingCount: 12, areaKeys: [AREA_MANIPAL, AREA_KOTA] },
      ],
    },
    {
      directionCode: 'NW',
      groupName: 'NW towards Kundapura',
      availableMaxDistances: [
        { maxKm: 10, distanceLabel: 'Within 10 km', includedBandCodes: ['0_10'], listingCount: 1, areaKeys: [AREA_KOTA] },
        { maxKm: 25, distanceLabel: 'Up to 25 km', includedBandCodes: ['0_10', '10_25'], listingCount: 3, areaKeys: [AREA_KOTA] },
        { maxKm: 50, distanceLabel: 'Up to 50 km', includedBandCodes: ['0_10', '10_25', '25_50'], listingCount: 6, areaKeys: [AREA_KOTA] },
        { maxKm: 100, distanceLabel: 'Up to 100 km', includedBandCodes: ['0_10', '10_25', '25_50', '50_up'], listingCount: 9, areaKeys: [AREA_KOTA] },
      ],
    },
  ],
};

const BUCKET_MANIPAL = {
  areaKey: AREA_MANIPAL,
  displayName: 'Manipal',
  distanceKm: 8.2,
  bearingDeg: 12,
  direction: 'N',
  parcelCount: 2,
  parcelAcreage: 5.5,
};

const BUCKET_KOTA = {
  areaKey: AREA_KOTA,
  displayName: 'Kota',
  distanceKm: 32.0,
  bearingDeg: 350,
  direction: 'N',
  parcelCount: 1,
  parcelAcreage: 4.0,
};

const PARCELS_MANIPAL = [
  {
    id: LISTING_1,
    areaKey: AREA_MANIPAL,
    latitude: 13.353,
    longitude: 74.793,
    propertyType: 'agricultural_land',
    locality: 'Manipal',
    landArea: 3.0,
    landAreaUnit: 'acres',
    computedAreaAcres: 3.0,
    pricePaise: 7500000,
    boundaryGeoJson: null,
  },
  {
    id: LISTING_2,
    areaKey: AREA_MANIPAL,
    latitude: 13.356,
    longitude: 74.795,
    propertyType: 'agricultural_land',
    locality: 'Manipal',
    landArea: 2.5,
    landAreaUnit: 'acres',
    computedAreaAcres: 2.5,
    pricePaise: 5000000,
    boundaryGeoJson: null,
  },
];

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <output data-testid="loc" data-pathname={location.pathname} data-search={location.search}>
        {location.pathname}
        {location.search}
      </output>
      <button type="button" data-testid="nav-back" onClick={() => navigate(-1)}>
        Back
      </button>
    </div>
  );
}

function getLocParams(): URLSearchParams {
  const search = screen.getByTestId('loc').getAttribute('data-search') ?? '';
  return new URLSearchParams(search);
}

function renderHarness(initialEntries: string[], initialIndex = initialEntries.length - 1) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        <LocationProbe />
        <Routes>
          <Route
            path="/discover"
            element={
              <DiscoverProvider>
                <MapDiscovery />
              </DiscoverProvider>
            }
          />
          <Route
            path="*"
            element={
              <DiscoverProvider>
                <MapDiscovery />
              </DiscoverProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiCalls.length = 0;
  apiGetMock.mockReset();
  apiGetMock.mockImplementation(async (rawPath: string) => {
    const u = new URL(rawPath, 'http://127.0.0.1:8080');
    apiCalls.push({ path: rawPath, pathname: u.pathname, searchParams: u.searchParams });

    if (u.pathname.includes('/api/discover/regional-area-groups')) {
      return REGIONAL_AREA_GROUPS_PAYLOAD;
    }
    if (u.pathname.includes('/api/discover/agri-destinations')) {
      const maxKm = u.searchParams.get('maxKm');
      return {
        city: 'udupi',
        destinations: maxKm === '50' ? [BUCKET_MANIPAL, BUCKET_KOTA] : [BUCKET_MANIPAL],
      };
    }
    if (u.pathname.includes('/api/discover/agri-map-listings')) {
      const areaKey = u.searchParams.get('areaKey');
      return {
        city: 'udupi',
        listings: areaKey === AREA_MANIPAL ? PARCELS_MANIPAL : [],
        truncated: false,
        limit: 250,
      };
    }
    if (u.pathname.startsWith('/api/public/listings/')) {
      const id = u.pathname.split('/').pop() ?? LISTING_1;
      return {
        id,
        title: 'Agri Plot North Udupi',
        locality: 'Manipal',
        city: 'Udupi',
        propertyType: 'agricultural_land',
        price: 7500000,
        landArea: 3.0,
        landAreaUnit: 'acres',
        computedAreaAcres: 2.97,
        images: [],
        description: 'Fertile agricultural plot in the North corridor.',
        status: 'LIVE',
      };
    }
    return {};
  });
});

describe('MapDiscovery — agri direction-first #1448 composed replacement (L43)', () => {
  it('one click on a direction card PUSHes region and maxKm=25 together, lands on agri-group-selected-panel with no distance-chip step, and Back returns to the landing list', async () => {
    const user = userEvent.setup();
    renderHarness(['/discover?city=udupi', '/discover?city=udupi&journey=agri-first'], 1);

    // Leg 1 (setup, uncredited): landing list visible with two corridor cards (N, NW)
    await waitFor(() => expect(screen.getByTestId('corridor-landing-list')).toBeInTheDocument());
    const cards = screen.getAllByTestId('corridor-card');
    expect(cards).toHaveLength(2);
    expect(screen.queryByTestId('agri-group-selected-panel')).toBeNull();
    expect(getLocParams().get('region')).toBeNull();
    expect(getLocParams().get('maxKm')).toBeNull();

    // Leg 2: click the SECOND card (NW)
    await user.click(cards[1]);

    // Leg 3 (credited L43-M1): URL search params carry region=NW AND maxKm=25 together
    await waitFor(() => {
      const p = getLocParams();
      expect(p.get('region')).toBe('NW');
      expect(p.get('maxKm')).toBe('25');
      expect(p.get('journey')).toBe('agri-first');
    });

    // Leg 4 (uncredited under M1 since Leg 3 fails first): selected panel visible, intermediate distance chips absent
    expect(await screen.findByTestId('agri-group-selected-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('corridor-distance-chips')).toBeNull();

    // Leg 5 (credited L43-M2): Back returns to the exact pre-click landing URL (no region, no maxKm, journey=agri-first)
    await user.click(screen.getByTestId('nav-back'));
    await waitFor(() => {
      const p = getLocParams();
      expect(p.get('region')).toBeNull();
      expect(p.get('maxKm')).toBeNull();
      expect(p.get('journey')).toBe('agri-first');
      expect(screen.getByTestId('loc').getAttribute('data-pathname')).toBe('/discover');
    });

    // Leg 6 (uncredited under M2): landing list visible again, chips and selected panel absent
    expect(await screen.findByTestId('corridor-landing-list')).toBeInTheDocument();
    expect(screen.queryByTestId('corridor-distance-chips')).toBeNull();
    expect(screen.queryByTestId('agri-group-selected-panel')).toBeNull();
  });

  it('chip 25 -> 50 -> 25 on a cold-loaded corridor updates URL, chip state, destination rows, map overlay prop and destination markers in place', async () => {
    const user = userEvent.setup();
    renderHarness(['/discover?city=udupi&journey=agri-first&region=N&maxKm=25']);

    // Leg 1 (cold load setup, uncredited): selected panel visible, chip 25 pressed, Manipal row present, Kota absent
    const panel = await screen.findByTestId('agri-group-selected-panel');
    expect(panel).toBeInTheDocument();
    expect(await screen.findByTestId('distance-chip-25')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('distance-chip-50')).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(screen.getAllByTestId('agri-group-locality-btn')).toHaveLength(1));
    expect(screen.getByTestId('agri-group-locality-btn')).toHaveTextContent('Manipal');
    expect(screen.getByTestId('agri-group-locality-btn').textContent).not.toContain('|');
    expect(within(panel).queryByText('Kota')).toBeNull();
    expect(screen.getByTestId('property-map-mock')).toHaveAttribute(
      'data-sector-overlay',
      JSON.stringify({ directionCode: 'N', maxKm: 25 }),
    );

    // Leg 2 (credited L43-M3): click chip 50 -> URL maxKm=50, region=N
    await user.click(screen.getByTestId('distance-chip-50'));
    await waitFor(() => {
      const p = getLocParams();
      expect(p.get('maxKm')).toBe('50');
      expect(p.get('region')).toBe('N');
    });

    // Leg 3 (credited L43-M4): chip 50 aria-pressed=true, chip 25 false, panel stays mounted
    expect(screen.getByTestId('distance-chip-50')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('distance-chip-25')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('agri-group-selected-panel')).toBeInTheDocument();

    // Leg 4 (credited L43-M5): PropertyMap sectorOverlay prop updates to maxKm 50
    expect(screen.getByTestId('property-map-mock')).toHaveAttribute(
      'data-sector-overlay',
      JSON.stringify({ directionCode: 'N', maxKm: 50 }),
    );

    // Leg 5 (credited L43-M6): destination rows update to the 50 km payload (Manipal + Kota)
    await waitFor(() => expect(screen.getAllByTestId('agri-group-locality-btn')).toHaveLength(2));
    const labels50 = screen.getAllByTestId('agri-group-locality-btn').map((el) => el.textContent ?? '');
    expect(labels50.some((t) => t.includes('Manipal'))).toBe(true);
    expect(labels50.some((t) => t.includes('Kota'))).toBe(true);

    // Leg 6 (credited L43-M7): PropertyMap agriDestinationMarkers areaKeys equal [Manipal, Kota]
    await waitFor(() => {
      expect(screen.getByTestId('property-map-mock')).toHaveAttribute(
        'data-agri-dest-keys',
        JSON.stringify([AREA_MANIPAL, AREA_KOTA]),
      );
    });

    // Leg 7 (uncredited): recorded agri-destinations calls include direction=N & maxKm=50
    expect(
      apiCalls.some(
        (c) =>
          c.pathname.includes('/api/discover/agri-destinations') &&
          c.searchParams.get('direction') === 'N' &&
          c.searchParams.get('maxKm') === '50',
      ),
    ).toBe(true);

    // Leg 8 (uncredited round-trip): click chip 25 -> maxKm=25, Kota gone, overlay back to 25
    await user.click(screen.getByTestId('distance-chip-25'));
    await waitFor(() => expect(getLocParams().get('maxKm')).toBe('25'));
    await waitFor(() => expect(screen.getAllByTestId('agri-group-locality-btn')).toHaveLength(1));
    expect(within(screen.getByTestId('agri-group-selected-panel')).queryByText('Kota')).toBeNull();
    expect(screen.getByTestId('property-map-mock')).toHaveAttribute(
      'data-sector-overlay',
      JSON.stringify({ directionCode: 'N', maxKm: 25 }),
    );
  });

  it('drilling into a destination loads its parcels by the single areaKey, a row click opens the peek, and closing the peek keeps region, maxKm and destKey', async () => {
    const user = userEvent.setup();
    renderHarness(['/discover?city=udupi&journey=agri-first&region=N&maxKm=25']);

    const localityBtn = await screen.findByTestId('agri-group-locality-btn');
    await user.click(localityBtn);

    // Leg 1 (credited L43-M8): destKey=IN|KA|Udupi|Manipal in URL, region=N and maxKm=25 kept, locality panel visible
    await waitFor(() => {
      const p = getLocParams();
      expect(p.get('destKey')).toBe(AREA_MANIPAL);
      expect(p.get('region')).toBe('N');
      expect(p.get('maxKm')).toBe('25');
    });
    expect(await screen.findByTestId('agri-group-locality-panel')).toBeInTheDocument();

    // Leg 2 (credited L43-M9): agri-map-listings called with single areaKey (no areaKeys), two parcel rows visible
    await waitFor(() => expect(screen.getAllByTestId('agri-locality-listing-row')).toHaveLength(2));
    const listingsCall = apiCalls.find((c) => c.pathname.includes('/api/discover/agri-map-listings'));
    expect(listingsCall).toBeDefined();
    expect(listingsCall?.searchParams.get('areaKey')).toBe(AREA_MANIPAL);
    expect(listingsCall?.searchParams.has('areaKeys')).toBe(false);

    // Leg 3 (credited L43-M10): click first parcel row -> listing= in URL, still on /discover, peek visible with controls
    await user.click(screen.getAllByTestId('agri-locality-listing-row')[0]);
    await waitFor(() => {
      expect(getLocParams().get('listing')).toBe(LISTING_1);
      expect(screen.getByTestId('loc').getAttribute('data-pathname')).toBe('/discover');
    });
    const peek = await screen.findByTestId('agri-listing-peek');
    expect(peek).toHaveTextContent('Manipal');
    expect(screen.getByTestId('agri-listing-peek-view-details')).toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-close')).toBeInTheDocument();

    // Leg 3b (uncredited): public listing detail fetched
    await waitFor(() =>
      expect(apiCalls.some((c) => c.pathname === `/api/public/listings/${LISTING_1}`)).toBe(true),
    );

    // Leg 4 (credited L43-M11): close peek -> listing removed; region, maxKm, destKey kept; locality panel visible
    await user.click(screen.getByTestId('agri-listing-peek-close'));
    await waitFor(() => {
      const p = getLocParams();
      expect(p.get('listing')).toBeNull();
      expect(p.get('region')).toBe('N');
      expect(p.get('maxKm')).toBe('25');
      expect(p.get('destKey')).toBe(AREA_MANIPAL);
    });
    expect(screen.queryByTestId('agri-listing-peek')).toBeNull();
    expect(screen.getByTestId('agri-group-locality-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-group-selected-panel')).toBeNull();
  });

  it('the selected-panel clear button removes all region state and returns to the landing list; Back restores the corridor', async () => {
    const user = userEvent.setup();
    renderHarness(
      [
        '/discover?city=udupi',
        '/discover?city=udupi&journey=agri-first',
        '/discover?city=udupi&journey=agri-first&region=N&maxKm=25',
      ],
      2,
    );

    expect(await screen.findByTestId('agri-group-selected-panel')).toBeInTheDocument();

    // Leg 1 (credited L43-M12): click clear -> region, maxKm, listing, destKey all absent; landing list visible
    await user.click(screen.getByTestId('agri-group-selected-clear'));
    await waitFor(() => {
      const p = getLocParams();
      expect(p.get('region')).toBeNull();
      expect(p.get('maxKm')).toBeNull();
      expect(p.get('listing')).toBeNull();
      expect(p.get('destKey')).toBeNull();
    });
    expect(await screen.findByTestId('corridor-landing-list')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-group-selected-panel')).toBeNull();

    // Leg 2 (uncredited): Back restores the corridor
    await user.click(screen.getByTestId('nav-back'));
    await waitFor(() => {
      const p = getLocParams();
      expect(p.get('region')).toBe('N');
      expect(p.get('maxKm')).toBe('25');
    });
    expect(await screen.findByTestId('agri-group-selected-panel')).toBeInTheDocument();
  });

  it.each([
    ['area-first', false],
    ['school-first', false],
    ['agri-first', true],
  ] as const)(
    'journey %s with region+maxKm: sectorOverlay and agri selected panel follow isAgriJourney=%s',
    async (journey, expectAgri) => {
      renderHarness([`/discover?city=udupi&journey=${journey}&region=N&maxKm=25`]);

      if (expectAgri) {
        expect(await screen.findByTestId('agri-group-selected-panel')).toBeInTheDocument();
        expect(screen.getByTestId('property-map-mock')).toHaveAttribute(
          'data-sector-overlay',
          JSON.stringify({ directionCode: 'N', maxKm: 25 }),
        );
      } else {
        await waitFor(() => expect(screen.getByTestId('property-map-mock')).toBeInTheDocument());
        expect(screen.getByTestId('property-map-mock')).toHaveAttribute('data-sector-overlay', 'null');
        expect(screen.queryByTestId('agri-group-selected-panel')).toBeNull();
        expect(screen.queryByTestId('agri-listing-peek')).toBeNull();
      }
    },
  );
});
