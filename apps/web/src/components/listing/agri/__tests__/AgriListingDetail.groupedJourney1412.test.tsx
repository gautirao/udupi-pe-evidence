/**
 * Issue #2890 (L44) — Lower-level replacement coverage for `AgriListingDetail`
 * and `e2e/discover-agri-grouped-journey-1412.spec.ts` blockers (#5a, #7, #8, #9, #10, #11).
 *
 * Covers all 5 requirements of #2890 without mocking `ListingDetailBoundaryMap` or `@/lib/api`:
 *   1. L44-N1 (AC5 / #7, #11): Agricultural spec rows (water source, soil type, cultivation status,
 *      road access, ownership type, land area, approximate area in hectares + computedAreaAcres
 *      fallback, and crops on ListingDetail) rendered on `AgriListingDetail`.
 *   2. L44-N2 (AC5, AC5b / #7, #8): Real `ListingDetailBoundaryMap` inside `AgriListingDetail`
 *      renders `<Polygon>` with transformed [lat, lng] coords + `fitBounds` when `boundary` is a
 *      valid GeoJSON Polygon, and `<Marker>` centre-marker fallback when `boundary` is `null`.
 *   3. L44-N3 (AC5, AC5b / #7, #8): Paired positive + negative control for `hasBoundaryDisclaimer`
 *      (`AgriListingDetail.tsx:519`) when `boundary` is present vs `null`.
 *   4. L44-N4 (AC6 anon & authed / #9, #11): Anonymous render (`user=null`, price/survey withheld ->
 *      sign-in CTAs, empty hero media with 0 `<img>`, while spec rows + boundary disclaimer +
 *      boundary polygon still render) vs authenticated render (`user` present -> formatted price,
 *      survey number, spec rows, boundary disclaimer, and boundary polygon rendered).
 *   5. L44-N5 (AC3 / #5a) & L44-N6 (AC4+AC5 / #10):
 *      - L44-N5: `useRegionalAreaGroups('udupi')` through real `@/lib/api` (`globalThis.fetch` spy)
 *        issues `GET /api/discover/regional-area-groups?city=udupi&propertyType=agricultural_land`.
 *      - L44-N6: Composed join from `PropertyMap` (`AgriPolygonLayer`) polygon click ->
 *        `useDiscoverPageStateController` (`resolvedPanelContent = 'agri-detail'`) ->
 *        `AgriJourneyPanel` -> `AgriListingPanel` (`agri-detail-panel`) ->
 *        `agri-view-full-details-cta` click -> `/listing/:id` -> `<ListingDetail />` ->
 *        `<AgriListingDetail />` + `<ListingDetailBoundaryMap />`.
 */

import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { User, Session } from '@supabase/supabase-js';

// ─── Leaflet / react-leaflet boundary mocks (keep ListingDetailBoundaryMap & PropertyMap REAL) ──

const mockFitBounds = vi.hoisted(() => vi.fn());
const mockMapInstance = vi.hoisted(() => {
  const bounds = {
    getNorth: () => 14,
    getSouth: () => 13,
    getEast: () => 75,
    getWest: () => 74,
  };
  const instance = {
    fitBounds: mockFitBounds,
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    flyTo: vi.fn(),
    getBounds: vi.fn(() => bounds),
    getCenter: vi.fn(() => ({ lat: 13.353, lng: 74.793 })),
    getZoom: vi.fn(() => 16),
    setView: vi.fn(),
    getContainer: vi.fn(() => document.body),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
  };
  instance.setView.mockReturnValue(instance);
  return instance;
});
const mockUseAuth = vi.hoisted(() =>
  vi.fn<() => {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    isAdmin: boolean;
    isDealer: boolean;
  }>(() => ({
    user: null,
    session: null,
    isLoading: false,
    isAdmin: false,
    isDealer: false,
  })),
);
const mockGetSession = vi.hoisted(() =>
  vi.fn<() => Promise<{ data: { session: Session | null }; error: null }>>(() =>
    Promise.resolve({ data: { session: null }, error: null }),
  ),
);

vi.mock('react-leaflet', () => ({
  MapContainer: ({
    children,
    center,
    zoom,
  }: {
    children: React.ReactNode;
    center?: [number, number];
    zoom?: number;
  }) => (
    <div
      data-testid="leaflet-map-container"
      data-center={JSON.stringify(center ?? null)}
      data-zoom={String(zoom ?? '')}
    >
      {children}
    </div>
  ),
  TileLayer: () => <div data-testid="leaflet-tile-layer" />,
  ZoomControl: () => null,
  Circle: () => null,
  Tooltip: () => null,
  Polygon: ({
    positions,
    pathOptions,
    eventHandlers,
  }: {
    positions: [number, number][];
    pathOptions?: Record<string, unknown>;
    eventHandlers?: { click?: () => void };
  }) => (
    <div
      data-testid={eventHandlers?.click ? 'agri-polygon' : 'leaflet-boundary-polygon'}
      data-positions={JSON.stringify(positions)}
      data-path-options={JSON.stringify(pathOptions ?? null)}
      onClick={eventHandlers?.click}
    />
  ),
  Marker: ({ position }: { position: [number, number] }) => (
    <div
      data-testid="leaflet-centre-marker"
      data-position={JSON.stringify(position)}
    />
  ),
  useMap: () => mockMapInstance,
  useMapEvents: () => mockMapInstance,
}));

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      bindTooltip: vi.fn().mockReturnThis(),
    })),
    markerClusterGroup: vi.fn(() => ({
      addLayer: vi.fn(),
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
    })),
    point: vi.fn((x: number, y: number) => ({ x, y })),
  },
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.Default.css', () => ({}));
vi.mock('leaflet.markercluster', () => ({}));
vi.mock('leaflet-draw', () => ({}));
vi.mock('leaflet-draw/dist/leaflet.draw.css', () => ({}));
vi.mock('@/components/map/DrawControl', () => ({
  DrawControl: () => null,
}));

// Stub unrelated side-widgets on AgriListingDetail / ListingDetail; keep AgriListingDetail,
// ListingDetailBoundaryMap, ListingGallery, ListingDetail, PropertyMap, AgriJourneyPanel,
// AgriListingPanel, useDiscoverPageStateController, useRegionalAreaGroups, and @/lib/api REAL.
vi.mock('@/components/poi/NearbyPois', () => ({
  NearbyPois: () => <div data-testid="nearby-pois" />,
}));
vi.mock('@/components/listing/SimilarListings', () => ({
  SimilarListings: () => <div data-testid="similar-listings" />,
}));
vi.mock('@/components/listing/AreaMarketWidget', () => ({
  AreaMarketWidget: () => <div data-testid="area-market" />,
}));
vi.mock('@/hooks/useSchoolSearch', () => ({
  useNearbySchools: () => ({ data: null, isLoading: false, isError: false }),
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
  RoleAwareHeader: () => null,
}));
vi.mock('@/components/listing/RequestViewingModal', () => ({
  RequestViewingModal: () => null,
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

// ─── Real production imports under test ──────────────────────────────────────

import { AgriListingDetail } from '../AgriListingDetail';
import ListingDetail, { type PublicListingDetail } from '@/pages/ListingDetail';
import { PropertyMap } from '@/components/map/PropertyMap';
import { AgriJourneyPanel } from '@/features/discover/right-panel/agri/AgriJourneyPanel';
import { useDiscoverPageStateController } from '@/features/discover/controllers/useDiscoverPageStateController';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { derivePanelContent } from '@/features/discover/utils/discoverPanelState';
import { useRegionalAreaGroups } from '@/hooks/useRegionalAreaGroups';
import type { PropertyListing } from '@/hooks/usePropertyListings';
import type { AgriJourneyCommands, AgriJourneyView } from '@/features/discover/right-panel/contracts';

// ─── Shared fixtures (mirroring e2e/discover-agri-grouped-journey-1412.spec.ts) ─

const AGRI_ID_WITH_BOUNDARY = 'agri-grouped-001';
const AGRI_ID_NO_BOUNDARY = 'agri-grouped-002';

// GeoJSON stores [lng, lat]; closed 5-point ring (4 distinct vertices).
const AGRI_BOUNDARY_GEOJSON = JSON.stringify({
  type: 'Polygon',
  coordinates: [
    [
      [74.792, 13.353],
      [74.795, 13.353],
      [74.795, 13.356],
      [74.792, 13.356],
      [74.792, 13.353],
    ],
  ],
});

// Expected Leaflet [lat, lng] ring after fromGeoJsonString strips closing vertex and flips [lng, lat] -> [lat, lng].
const EXPECTED_LEAFLET_POSITIONS: [number, number][] = [
  [13.353, 74.792],
  [13.353, 74.795],
  [13.356, 74.795],
  [13.356, 74.792],
];

const AUTH_USER: User = {
  id: 'user-1412',
  email: 'buyer@example.invalid',
} as User;

const AUTH_SESSION: Session = {
  access_token: 'jwt-1412',
  user: AUTH_USER,
} as Session;

const AUTHED_DETAIL_WITH_BOUNDARY: PublicListingDetail = {
  id: AGRI_ID_WITH_BOUNDARY,
  title: 'Grouped Agri Plot North',
  locality: 'Manipal',
  propertyType: 'agricultural_land',
  status: 'LIVE',
  listingNumber: 1412,
  images: [],
  price: 7_500_000,
  pricePaise: 750_000_000,
  landArea: 3.0,
  landAreaUnit: 'acres',
  computedAreaAcres: 2.97,
  waterSource: 'BOREWELL',
  soilType: 'RED_LATERITE',
  roadAccess: 'TARRED_ROAD',
  cultivationStatus: 'ARECA_PLANTATION',
  ownershipType: 'FREEHOLD',
  surveyNumber: 'SY 45/2B',
  boundary: AGRI_BOUNDARY_GEOJSON,
  latitude: 13.353,
  longitude: 74.793,
  crops: ['ARECA_SUPARI', 'COCONUT'],
};

const ANON_DETAIL_WITH_BOUNDARY: PublicListingDetail = {
  ...AUTHED_DETAIL_WITH_BOUNDARY,
  // Backend teaser projection (#1454) withholds price/pricePaise/surveyNumber and coarsens coords:
  price: null,
  pricePaise: null,
  surveyNumber: null,
  images: [],
  primaryImageUrl: null,
  imageCount: 0,
  latitude: 13.35,
  longitude: 74.79,
};

const DETAIL_WITHOUT_BOUNDARY: PublicListingDetail = {
  ...ANON_DETAIL_WITH_BOUNDARY,
  id: AGRI_ID_NO_BOUNDARY,
  title: 'Grouped Agri Plot North 2',
  landArea: 1.5,
  landAreaUnit: 'acres',
  computedAreaAcres: 1.48,
  waterSource: null,
  soilType: null,
  roadAccess: null,
  cultivationStatus: null,
  ownershipType: 'FREEHOLD',
  boundary: null,
  latitude: 13.354,
  longitude: 74.794,
};

const DISCLAIMER_TEXT =
  'The boundary drawn on the map is approximate and should be legally verified before purchase.';

function getOverviewSection(): HTMLElement {
  const heading = screen.getByRole('heading', { name: 'Property Overview' });
  const section = heading.closest('section');
  if (!section) throw new Error('Property Overview section not found');
  return section;
}

function expectOverviewRow(overview: HTMLElement, label: string, expectedValue: string) {
  const labelEl = within(overview).getByText(label, { selector: 'span' });
  const row = labelEl.parentElement;
  expect(row).not.toBeNull();
  expect(within(row as HTMLElement).getByText(expectedValue)).toBeInTheDocument();
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe('#2890 (L44) — AgriListingDetail & grouped-agri 1412 lower-level replacement suite', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockFitBounds.mockClear();
    mockUseAuth.mockReturnValue({
      user: null,
      session: null,
      isLoading: false,
      isAdmin: false,
      isDealer: false,
    });
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ── 1a. L44-N1: Agricultural spec rows on AgriListingDetail + ListingDetail ──────────

  it('L44-N1 (AC5 / #7, #11): renders water source, soil type, cultivation status, road access, ownership type, land area, approximate area (plus computedAreaAcres fallback), and crops', () => {
    const first = render(
      <MemoryRouter>
        <AgriListingDetail
          listing={AUTHED_DETAIL_WITH_BOUNDARY}
          user={AUTH_USER}
          copied={false}
          onShare={vi.fn()}
          onOpenBookingModal={vi.fn()}
        />
      </MemoryRouter>,
    );

    const overview = getOverviewSection();
    expectOverviewRow(overview, 'Land Area', '3.00 acres');
    // 3.0 acres * 0.404686 = 1.214058 -> ~1.21 hectares
    expectOverviewRow(overview, 'Approx. Area', '~1.21 hectares');
    expectOverviewRow(overview, 'Survey Number', 'SY 45/2B');
    expectOverviewRow(overview, 'Water Source', 'Borewell');
    expectOverviewRow(overview, 'Soil Type', 'Red laterite');
    expectOverviewRow(overview, 'Cultivation Status', 'Areca plantation');
    expectOverviewRow(overview, 'Road Access', 'Tarred road');
    expectOverviewRow(overview, 'Ownership Type', 'Freehold');
    first.unmount();

    // Fallback arm: when declared landArea is null, Approx. Area derives from computedAreaAcres (2.97 * 0.404686 = ~1.20 hectares)
    const computedOnly: PublicListingDetail = {
      ...AUTHED_DETAIL_WITH_BOUNDARY,
      landArea: null,
      landAreaUnit: null,
      computedAreaAcres: 2.97,
    };
    const second = render(
      <MemoryRouter>
        <AgriListingDetail
          listing={computedOnly}
          user={AUTH_USER}
          copied={false}
          onShare={vi.fn()}
          onOpenBookingModal={vi.fn()}
        />
      </MemoryRouter>,
    );
    const overviewFallback = getOverviewSection();
    expect(within(overviewFallback).queryByText('Land Area')).not.toBeInTheDocument();
    expectOverviewRow(overviewFallback, 'Approx. Area', '~1.20 hectares');
    second.unmount();
  });

  // ── 1b. L44-N2: Real ListingDetailBoundaryMap inside AgriListingDetail ───────────────

  it('L44-N2 (AC5, AC5b / #7, #8): real ListingDetailBoundaryMap inside AgriListingDetail renders Polygon + fitBounds when boundary GeoJSON is present, and centre-marker fallback when boundary is null', () => {
    const withBoundary = render(
      <MemoryRouter>
        <AgriListingDetail
          listing={AUTHED_DETAIL_WITH_BOUNDARY}
          user={AUTH_USER}
          copied={false}
          onShare={vi.fn()}
          onOpenBookingModal={vi.fn()}
        />
      </MemoryRouter>,
    );

    const polygonEl = screen.getByTestId('leaflet-boundary-polygon');
    expect(JSON.parse(polygonEl.getAttribute('data-positions') ?? '[]')).toEqual(
      EXPECTED_LEAFLET_POSITIONS,
    );
    expect(screen.queryByTestId('leaflet-centre-marker')).not.toBeInTheDocument();
    expect(mockFitBounds).toHaveBeenCalledTimes(1);
    expect(mockFitBounds).toHaveBeenCalledWith(EXPECTED_LEAFLET_POSITIONS, { padding: [20, 20] });
    withBoundary.unmount();

    mockFitBounds.mockClear();

    render(
      <MemoryRouter>
        <AgriListingDetail
          listing={DETAIL_WITHOUT_BOUNDARY}
          user={null}
          copied={false}
          onShare={vi.fn()}
          onOpenBookingModal={vi.fn()}
        />
      </MemoryRouter>,
    );

    const markerEl = screen.getByTestId('leaflet-centre-marker');
    expect(JSON.parse(markerEl.getAttribute('data-position') ?? '[]')).toEqual([13.354, 74.794]);
    expect(screen.queryByTestId('leaflet-boundary-polygon')).not.toBeInTheDocument();
    expect(mockFitBounds).not.toHaveBeenCalled();
  });

  // ── 1c. L44-N3: Boundary disclaimer present AND absent (hasBoundaryDisclaimer) ───────

  it('L44-N3 (AC5, AC5b / #7, #8): hasBoundaryDisclaimer renders the amber boundary disclaimer when boundary is non-empty and omits it when boundary is null', () => {
    const present = render(
      <MemoryRouter>
        <AgriListingDetail
          listing={AUTHED_DETAIL_WITH_BOUNDARY}
          user={AUTH_USER}
          copied={false}
          onShare={vi.fn()}
          onOpenBookingModal={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(within(getOverviewSection()).getByText(DISCLAIMER_TEXT)).toBeInTheDocument();
    present.unmount();

    render(
      <MemoryRouter>
        <AgriListingDetail
          listing={DETAIL_WITHOUT_BOUNDARY}
          user={null}
          copied={false}
          onShare={vi.fn()}
          onOpenBookingModal={vi.fn()}
        />
      </MemoryRouter>,
    );

    const overviewAbsent = getOverviewSection();
    expectOverviewRow(overviewAbsent, 'Land Area', '1.50 acres');
    expectOverviewRow(overviewAbsent, 'Ownership Type', 'Freehold');
    expect(screen.queryByText(DISCLAIMER_TEXT)).not.toBeInTheDocument();
  });

  // ── 1d. L44-N4: Anonymous vs authenticated render on AgriListingDetail ───────────────

  it('L44-N4 (AC6 / #9, #11): anonymous render gates price and survey number with sign-in CTAs, renders empty-photo state (0 <img>), and preserves spec rows + boundary disclaimer + polygon; authenticated render shows formatted price + survey number + spec rows + disclaimer', () => {
    const anonRender = render(
      <MemoryRouter>
        <AgriListingDetail
          listing={ANON_DETAIL_WITH_BOUNDARY}
          user={null}
          copied={false}
          onShare={vi.fn()}
          onOpenBookingModal={vi.fn()}
        />
      </MemoryRouter>,
    );

    // Anon price + survey sign-in affordances present; actual price & survey values absent
    expect(screen.getByTestId('agri-detail-price-signin')).toHaveTextContent(/sign in to view price/i);
    expect(screen.getByTestId('agri-detail-price-locked-tile')).toBeInTheDocument();
    expect(screen.getByTestId('agri-detail-survey-signin')).toHaveTextContent(/sign in to view/i);
    expect(screen.queryAllByText(/₹75 L/)).toHaveLength(0);
    expect(screen.queryByText('SY 45/2B')).not.toBeInTheDocument();

    // Anon public fixture has no images -> empty hero state rendered, zero <img> elements
    expect(screen.getByText('Photos not uploaded yet')).toBeInTheDocument();
    expect(anonRender.container.querySelectorAll('img')).toHaveLength(0);

    // Spec rows, boundary disclaimer, and boundary polygon remain visible for anonymous users
    const anonOverview = getOverviewSection();
    expectOverviewRow(anonOverview, 'Land Area', '3.00 acres');
    expectOverviewRow(anonOverview, 'Approx. Area', '~1.21 hectares');
    expectOverviewRow(anonOverview, 'Water Source', 'Borewell');
    expectOverviewRow(anonOverview, 'Soil Type', 'Red laterite');
    expectOverviewRow(anonOverview, 'Cultivation Status', 'Areca plantation');
    expectOverviewRow(anonOverview, 'Road Access', 'Tarred road');
    expectOverviewRow(anonOverview, 'Ownership Type', 'Freehold');
    expect(within(anonOverview).getByText(DISCLAIMER_TEXT)).toBeInTheDocument();
    expect(screen.getByTestId('leaflet-boundary-polygon')).toBeInTheDocument();

    anonRender.unmount();

    // Authenticated control with the same parcel's full public projection
    render(
      <MemoryRouter>
        <AgriListingDetail
          listing={AUTHED_DETAIL_WITH_BOUNDARY}
          user={AUTH_USER}
          copied={false}
          onShare={vi.fn()}
          onOpenBookingModal={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('₹75 L').length).toBeGreaterThan(0);
    expect(screen.getByText('₹25 L/acre · 3.00 acres')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-detail-price-signin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agri-detail-price-locked-tile')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agri-detail-survey-signin')).not.toBeInTheDocument();

    const authedOverview = getOverviewSection();
    expectOverviewRow(authedOverview, 'Survey Number', 'SY 45/2B');
    expectOverviewRow(authedOverview, 'Land Area', '3.00 acres');
    expectOverviewRow(authedOverview, 'Approx. Area', '~1.21 hectares');
    expectOverviewRow(authedOverview, 'Water Source', 'Borewell');
    expectOverviewRow(authedOverview, 'Soil Type', 'Red laterite');
    expectOverviewRow(authedOverview, 'Cultivation Status', 'Areca plantation');
    expectOverviewRow(authedOverview, 'Road Access', 'Tarred road');
    expectOverviewRow(authedOverview, 'Ownership Type', 'Freehold');
    expect(within(authedOverview).getByText(DISCLAIMER_TEXT)).toBeInTheDocument();
    expect(screen.getByTestId('leaflet-boundary-polygon')).toBeInTheDocument();
  });

  // ── 1e (Part 1). L44-N5: AC3 504-507 useRegionalAreaGroups real lib/api URL check ────

  it('L44-N5 (AC3 / #5a): useRegionalAreaGroups issues GET /api/discover/regional-area-groups?city=udupi&propertyType=agricultural_land via real lib/api without auth header', async () => {
    const capturedRequests: Array<{ url: URL; headers: Record<string, string> }> = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      capturedRequests.push({
        url: new URL(rawUrl, 'http://localhost:8085'),
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      return new Response(
        JSON.stringify({
          city: 'udupi',
          groups: [
            {
              directionCode: 'N',
              groupName: 'N towards Brahmavar',
              availableMaxDistances: [
                {
                  maxKm: 25,
                  distanceLabel: 'Up to 25 km',
                  includedBandCodes: ['0_10', '10_25'],
                  listingCount: 5,
                  agriAcreage: 18.0,
                  areaKeys: ['IN|KA|Udupi|Manipal'],
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    function RegionalGroupsProbe() {
      const { groups, isLoading } = useRegionalAreaGroups('udupi');
      if (isLoading) return <div data-testid="groups-loading" />;
      return <div data-testid="groups-loaded">{groups.map((g) => g.groupName).join(',')}</div>;
    }

    const queryClient = makeQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <RegionalGroupsProbe />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('groups-loaded')).toHaveTextContent('N towards Brahmavar'));

    expect(capturedRequests).toHaveLength(1);
    const req = capturedRequests[0];
    expect(req.url.pathname).toBe('/api/discover/regional-area-groups');
    expect(req.url.searchParams.get('city')).toBe('udupi');
    expect(req.url.searchParams.get('propertyType')).toBe('agricultural_land');
    expect(req.headers.Authorization).toBeUndefined();
  });

  // ── 1e (Part 2). L44-N6: Composed AC4+AC5 Join (polygon click -> peek panel -> CTA -> /listing/:id -> ListingDetail -> AgriListingDetail) ──

  it('L44-N6 (AC4+AC5 / #10): clicking an agri polygon in PropertyMap flips resolvedPanelContent to agri-detail, mounts AgriListingPanel, and clicking View full details navigates to /listing/:id and renders AgriListingDetail with spec rows, disclaimer, and boundary polygon', async () => {
    mockUseAuth.mockReturnValue({
      user: AUTH_USER,
      session: AUTH_SESSION,
      isLoading: false,
      isAdmin: false,
      isDealer: false,
    });
    mockGetSession.mockResolvedValue({ data: { session: AUTH_SESSION }, error: null });

    const fetchedPaths: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const parsed = new URL(rawUrl, 'http://localhost:8085');
      fetchedPaths.push(parsed.pathname);

      if (parsed.pathname === `/api/public/listings/${AGRI_ID_WITH_BOUNDARY}`) {
        return new Response(JSON.stringify(AUTHED_DETAIL_WITH_BOUNDARY), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (parsed.pathname === `/api/public/listings/${AGRI_ID_WITH_BOUNDARY}/price-history`) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (parsed.pathname === `/api/listings/${AGRI_ID_WITH_BOUNDARY}/trust`) {
        return new Response(JSON.stringify({ badges: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    const agriPolygonMarker: PropertyListing = {
      id: AGRI_ID_WITH_BOUNDARY,
      property_type: 'agricultural_land',
      latitude: 13.353,
      longitude: 74.793,
      title: 'Grouped Agri Plot North',
      price: 7_500_000,
      price_unit: null,
      land_area: 3.0,
      land_area_unit: 'acres',
      built_area: null,
      built_area_unit: null,
      bedrooms: null,
      bathrooms: null,
      contact_info: null,
      contact_phone: null,
      description: null,
      confidence_score: null,
      language_detected: null,
      price_per_cent_paise: null,
      is_valid: true,
      is_duplicate: false,
      status: 'LIVE',
      created_at: '',
      updated_at: '',
      listing_purpose: 'sale',
      carpet_area: null,
      carpet_area_unit: null,
      floor_number: null,
      total_floors: null,
      furnishing_status: null,
      washrooms: null,
      parking_count: null,
      road_frontage_ft: null,
      commercial_usage: null,
      number_of_units: null,
      monthly_rent: null,
      security_deposit_months: null,
      lock_in_months: null,
      seller_type: null,
      raw_post_id: null,
      locality: 'Manipal',
      boundary_geojson: AGRI_BOUNDARY_GEOJSON,
    };

    function DiscoverAgriPolygonJoinHarness() {
      const [urlState, urlActions] = useDiscoverUrlState();
      const [selectedMarkerListing, setSelectedMarkerListing] = useState<PropertyListing | null>(null);
      const rawPanelContent = derivePanelContent(urlState);
      const { resolvedPanelContent } = useDiscoverPageStateController({
        urlState,
        urlActions,
        nodeAreaPoint: null,
        panelContent: rawPanelContent,
        selectedMarkerListing,
        isAuthenticated: true,
        authLoading: false,
      });

      const view: AgriJourneyView = {
        corridors: { groups: [], loading: false, error: false, notGenerated: false, discoverAreas: [] },
        selection: { region: null, maxKm: null, locality: null, groupLabel: null },
        groupListings: { data: [], loading: false, error: false, truncated: false, limit: undefined },
        areaSummary: { data: [], loading: false, listings: [], listingsLoading: false },
        filters: {
          values: {
            agriAcresMin: undefined,
            agriAcresMax: undefined,
            agriPriceMin: undefined,
            agriPriceMax: undefined,
            agriLandCategory: null,
            agriFarmhouseAvailable: null,
            agriFencingDone: null,
            agriWaterSource: null,
          },
        },
        peek: { item: null, markerListing: selectedMarkerListing },
      };

      const commands: AgriJourneyCommands = {
        corridors: {
          retry: undefined,
          setRegionWithMaxKm: undefined,
          setMaxKm: undefined,
          clearRegionAndMaxKm: undefined,
          selectAreaKey: () => {},
        },
        groupListings: { retry: undefined, clearGroup: undefined, select: undefined },
        locality: { set: undefined, clear: undefined },
        filters: { apply: undefined, clear: undefined },
        peek: {
          close: undefined,
          viewDetails: undefined,
          clearMarkerSelection: () => setSelectedMarkerListing(null),
        },
      };

      return (
        <div>
          <div data-testid="resolved-panel-content">{resolvedPanelContent}</div>
          <PropertyMap
            listings={[agriPolygonMarker]}
            isAgriMode={true}
            mapZoom={16}
            selectedPolygonListing={selectedMarkerListing}
            onSelectListing={(listing) => setSelectedMarkerListing(listing)}
          />
          {(resolvedPanelContent === 'agri-selected' || resolvedPanelContent === 'agri-detail') && (
            <AgriJourneyPanel
              panelContent={resolvedPanelContent}
              view={view}
              commands={commands}
              context={{ city: 'udupi', cityLabel: 'Udupi', intent: 'buy', isAuthenticated: true }}
              area={{
                point: {
                  areaKey: 'IN|KA|Udupi|Manipal',
                  name: 'Manipal',
                  lat: 13.3509,
                  lon: 74.7932,
                  listingCount: 1,
                  schoolCount: 0,
                },
              }}
              selectedListingId={null}
              onStartOver={() => {}}
            />
          )}
        </div>
      );
    }

    function LocationReadout() {
      const location = useLocation();
      return <div data-testid="router-pathname">{location.pathname}</div>;
    }

    const queryClient = makeQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/discover?journey=agri-first&city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal']}>
          <LocationReadout />
          <Routes>
            <Route path="/discover" element={<DiscoverAgriPolygonJoinHarness />} />
            <Route path="/listing/:id" element={<ListingDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Pre-click: panel is agri-selected, peek panel is not mounted
    expect(screen.getByTestId('resolved-panel-content')).toHaveTextContent('agri-selected');
    expect(screen.queryByTestId('agri-detail-panel')).not.toBeInTheDocument();

    // Hop 1 -> 2: click the rendered agri polygon in PropertyMap
    fireEvent.click(screen.getByTestId('agri-polygon'));
    expect(screen.getByTestId('resolved-panel-content')).toHaveTextContent('agri-detail');

    // Hop 3: AgriListingPanel mounts and renders the listing fetched from GET /api/public/listings/:id
    await waitFor(() => expect(screen.getByTestId('agri-detail-panel')).toBeInTheDocument());
    expect(screen.getByTestId('agri-detail-title')).toHaveTextContent('Grouped Agri Plot North');
    expect(fetchedPaths).toContain(`/api/public/listings/${AGRI_ID_WITH_BOUNDARY}`);

    // Hop 4: click "View full details" CTA -> navigates to /listing/agri-grouped-001
    fireEvent.click(screen.getByTestId('agri-view-full-details-cta'));
    await waitFor(() =>
      expect(screen.getByTestId('router-pathname')).toHaveTextContent(`/listing/${AGRI_ID_WITH_BOUNDARY}`),
    );

    // Hop 5: ListingDetail renders AgriListingDetail + crops + spec rows + disclaimer + boundary polygon
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Grouped Agri Plot North' })).toBeInTheDocument(),
    );
    expect(screen.getByTestId('agri-detail-crops')).toHaveTextContent('Areca / supari, Coconut');

    const overview = getOverviewSection();
    expectOverviewRow(overview, 'Survey Number', 'SY 45/2B');
    expectOverviewRow(overview, 'Land Area', '3.00 acres');
    expectOverviewRow(overview, 'Approx. Area', '~1.21 hectares');
    expectOverviewRow(overview, 'Water Source', 'Borewell');
    expectOverviewRow(overview, 'Soil Type', 'Red laterite');
    expectOverviewRow(overview, 'Cultivation Status', 'Areca plantation');
    expectOverviewRow(overview, 'Ownership Type', 'Freehold');
    expect(within(overview).getByText(DISCLAIMER_TEXT)).toBeInTheDocument();
    expect(screen.getByTestId('leaflet-boundary-polygon')).toBeInTheDocument();
  });
});
