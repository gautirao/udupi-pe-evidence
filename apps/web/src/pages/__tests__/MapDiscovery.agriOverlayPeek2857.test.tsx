/**
 * Issue #2857 (FU-LOWER-A) — L45 & L47 page-level replacements:
 *   - L47 AC3 (`e2e/discover-agri-overlay-peek-journey-1431.spec.ts` lines 409-431):
 *     cold-loading the Level-3 peek URL (`/discover?city=udupi&journey=agri-first&region=N&maxKm=25&destKey=IN|KA|Udupi|Manipal&listing=<id>`)
 *     mounts `AgriGroupListingPeek` (`agri-listing-peek`), and clicking the View Details CTA
 *     (`agri-listing-peek-view-details` -> `commands.peek.viewDetails`) navigates to `/listing/<id>`.
 *   - L45 AC6 (`e2e/discover-agri-journey-1375.spec.ts` lines 709-741):
 *     browser Back (`navigate(-1)`) from `/listing/<id>` returns to `/discover` with
 *     `journey=agri-first`, `city=udupi`, and the agri geography state (`destKey`/`region`/`maxKm`
 *     or `areaKey`) intact, re-mounting the agri panel.
 *   - L45 AC9 (`e2e/discover-agri-journey-1375.spec.ts` lines 763-768):
 *     in `agri-first`, the agri panel renders and zero school panels (`discover-schools-journey-panel-shell`,
 *     `school-selected-scroll`, `school-summary-band`, `schools-in-area-panel`) mount — paired in the
 *     same `it` with a `school-first` positive control where the school panel mounts and agri panels do not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation, useNavigate, useParams } from 'react-router-dom';

const { mockApiGet } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet, post: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.status = status;
    }
  },
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

// ── Stub PropertyMap (Leaflet canvas requires real layout engines) ──────────
vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: (props: Record<string, unknown>) => (
    <div
      data-testid="property-map-stub"
      data-journey={String(props.journey ?? '')}
      data-selected-listing-id={String(props.selectedListingId ?? '')}
    />
  ),
}));

vi.mock('@/components/Header', () => ({
  Header: () => <header data-testid="header-stub" />,
}));
vi.mock('@/components/MobileBottomNav', () => ({
  MobileBottomNav: () => <nav data-testid="mobile-bottom-nav-stub" />,
}));
vi.mock('@/components/SeoHead', () => ({
  SeoHead: () => null,
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, session: null, isAuthenticated: false, isLoading: false }),
}));
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('@/hooks/useSavedSearch', () => ({
  useSavedSearches: () => ({
    savedSearches: [],
    saveSearch: vi.fn(),
    deleteSearch: vi.fn(),
    getMatchingSavedSearch: () => undefined,
  }),
}));
vi.mock('@/hooks/useShortlist', () => ({
  useShortlist: () => ({
    isShortlisted: () => false,
    toggleShortlist: vi.fn(),
    shortlistedIds: [],
  }),
}));

const MOCK_AGRI_LISTINGS = [
  {
    id: 'agri-1448-listing-001',
    title: 'Fertile Manipal Farmland',
    locality: 'Manipal',
    areaKey: 'IN|KA|Udupi|Manipal',
    propertyType: 'agricultural_land',
    listingPurpose: 'sale',
    pricePaise: 450000000,
    landArea: 2.0,
    landAreaUnit: 'acres',
    computedAreaAcres: 2.0,
    waterSource: 'BOREWELL',
    soilType: 'RED',
    roadAccess: 'PAVED',
    latitude: 13.3525,
    longitude: 74.7868,
  },
];

import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import MapDiscovery from '../MapDiscovery';

function LocationAndHistoryProbe() {
  const loc = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <div data-testid="location-probe">{`${loc.pathname}${loc.search}`}</div>
      <button type="button" data-testid="nav-back" onClick={() => navigate(-1)}>
        Back
      </button>
    </div>
  );
}

function ListingDetailRouteStub() {
  const { id } = useParams<{ id: string }>();
  return <div data-testid="listing-detail-route">{`Listing detail: ${id}`}</div>;
}

function renderHarness(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationAndHistoryProbe />
        <Routes>
          <Route
            path="/discover"
            element={
              <DiscoverProvider>
                <MapDiscovery />
              </DiscoverProvider>
            }
          />
          <Route path="/listing/:id" element={<ListingDetailRouteStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function getSearchParams(): URLSearchParams {
  const raw = screen.getByTestId('location-probe').textContent ?? '';
  const qIndex = raw.indexOf('?');
  return new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : '');
}

describe('MapDiscovery — #2857 L45 (AC6, AC9) & L47 (AC3) agri overlay peek & back navigation', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiGet.mockImplementation(async (url: string) => {
      if (url.includes('/regional-area-groups')) {
        return {
          city: 'udupi',
          groups: [
            {
              directionCode: 'N',
              groupName: 'North towards Brahmavar',
              availableMaxDistances: [
                {
                  maxKm: 25,
                  distanceLabel: 'Up to 25 km',
                  includedBandCodes: ['0_25'],
                  listingCount: 2,
                  agriAcreage: 4.5,
                  areaKeys: ['IN|KA|Udupi|Manipal'],
                },
              ],
            },
          ],
        };
      }
      if (url.includes('/agri-destinations')) {
        return {
          city: 'udupi',
          destinations: [
            {
              areaKey: 'IN|KA|Udupi|Manipal',
              displayName: 'Manipal',
              parcelCount: 1,
              minPricePaise: 450000000,
              maxPricePaise: 450000000,
              minAreaAcres: 2.0,
              maxAreaAcres: 2.0,
              distanceKm: 5.2,
              bearingDeg: 15,
              directionCode: 'N',
            },
          ],
        };
      }
      if (url.includes('/agri-map-listings')) {
        return {
          listings: MOCK_AGRI_LISTINGS,
          totalCount: 1,
          truncated: false,
          limit: 250,
        };
      }
      if (url.includes('/api/public/listings/agri-1448-listing-001')) {
        return {
          id: 'agri-1448-listing-001',
          title: 'Fertile Manipal Farmland',
          description: 'Fertile plot with borewell',
          images: [],
        };
      }
      if (url.startsWith('/api/discover/areas')) {
        return {
          city: 'udupi',
          areas: [
            {
              areaKey: 'IN|KA|Udupi|Manipal',
              name: 'Manipal',
              areaLabel: 'Manipal',
              geoCenterLat: 13.3525,
              geoCenterLon: 74.7868,
              lat: 13.3525,
              lon: 74.7868,
              listingCount: 2,
              schoolCount: 3,
              agriAcreage: 4.5,
            },
          ],
        };
      }
      if (url.includes('/cities/udupi/listings')) {
        return {
          city: 'udupi',
          limitPerArea: 5,
          areas: [
            {
              areaKey: 'IN|KA|Udupi|Manipal',
              listings: MOCK_AGRI_LISTINGS,
            },
          ],
        };
      }
      if (url.startsWith('/api/public/schools/by-area')) {
        return [
          {
            id: 'school-manipal-1',
            name: 'Manipal Junior College',
            city: 'udupi',
            areaKey: 'IN|KA|Udupi|Manipal',
            latitude: 13.3525,
            longitude: 74.7868,
          },
        ];
      }
      if (url.includes('/trends')) {
        return { defaultAreas: [], propertyTypes: [], listingPurposes: [] };
      }
      if (url.includes('/regions')) {
        return { regions: [] };
      }
      if (url.includes('/area-groups')) {
        return { city: 'udupi', groups: [] };
      }
      return { content: [], totalElements: 0, totalPages: 0, areas: [], defaultAreas: [], groups: [] };
    });
  });

  it('L47 AC3 + L45 AC6 (G1-N15): cold-loading peek URL renders AgriGroupListingPeek, clicking View full details navigates to /listing/:id, and browser Back restores /discover with agri-first state and panel', async () => {
    renderHarness(
      '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&destKey=IN%7CKA%7CUdupi%7CManipal&listing=agri-1448-listing-001',
    );

    // 1. L47 AC3: cold-load Level-3 peek URL renders AgriGroupListingPeek with the parcel title & CTA
    const peek = await screen.findByTestId('agri-listing-peek');
    expect(peek).toBeInTheDocument();
    expect(screen.getByTestId('agri-listing-peek-title')).toHaveTextContent(
      'Fertile Manipal Farmland',
    );

    const viewDetailsBtn = screen.getByTestId('agri-listing-peek-view-details');
    fireEvent.click(viewDetailsBtn);

    // Clicking View full details navigates to /listing/agri-1448-listing-001
    await waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).toBe(
        '/listing/agri-1448-listing-001',
      );
    });
    expect(screen.getByTestId('listing-detail-route')).toHaveTextContent(
      'Listing detail: agri-1448-listing-001',
    );

    // 2. L45 AC6: browser Back from /listing/:id restores /discover with journey=agri-first, city=udupi, and agri state
    fireEvent.click(screen.getByTestId('nav-back'));

    await waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).toContain('/discover?');
    });
    const paramsAfterPeekBack = getSearchParams();
    expect(paramsAfterPeekBack.get('journey')).toBe('agri-first');
    expect(paramsAfterPeekBack.get('city')).toBe('udupi');
    expect(paramsAfterPeekBack.get('region')).toBe('N');
    expect(paramsAfterPeekBack.get('maxKm')).toBe('25');
    expect(paramsAfterPeekBack.get('destKey')).toBe('IN|KA|Udupi|Manipal');
    expect(paramsAfterPeekBack.get('listing')).toBe('agri-1448-listing-001');
    expect(await screen.findByTestId('agri-listing-peek')).toBeInTheDocument();
  });

  it('L45 AC6 areaKey arm (G1-N16): clicking an agri parcel card from areaKey-scoped agri-first navigates to /listing/:id and browser Back restores journey=agri-first, city=udupi, and areaKey', async () => {
    renderHarness('/discover?city=udupi&journey=agri-first&areaKey=IN%7CKA%7CUdupi%7CManipal');

    const agriCard = await screen.findByTestId('agri-listing-card');
    expect(agriCard).toHaveTextContent('Fertile Manipal Farmland');
    fireEvent.click(agriCard);

    await waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).toBe(
        '/listing/agri-1448-listing-001',
      );
    });

    fireEvent.click(screen.getByTestId('nav-back'));

    await waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).toContain('/discover?');
    });
    const params = getSearchParams();
    expect(params.get('journey')).toBe('agri-first');
    expect(params.get('city')).toBe('udupi');
    expect(params.get('areaKey')).toBe('IN|KA|Udupi|Manipal');
    expect(await screen.findByTestId('agri-listing-card')).toBeInTheDocument();
  });

  it('L45 AC9 (G1-N17): agri-first renders the agri panel and zero school panels, paired with school-first positive control', async () => {
    // 1. Positive control: school-first with areaKey=IN|KA|Udupi|Manipal mounts SchoolsInAreaPanel and zero agri panels
    const schoolControl = renderHarness(
      '/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal',
    );
    expect(await screen.findByTestId('selected-area-summary-title')).toHaveTextContent(
      'Schools in Manipal',
    );
    expect(await screen.findByTestId('school-card')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-group-selected-panel')).toBeNull();
    expect(screen.queryByTestId('agri-listing-peek')).toBeNull();
    schoolControl.unmount();

    // 2. Agri-first assertion: mounts agri-group-selected-panel and zero school panels
    renderHarness('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');
    expect(await screen.findByTestId('agri-group-selected-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('discover-schools-journey-panel-shell')).toBeNull();
    expect(screen.queryByTestId('school-card')).toBeNull();
    expect(screen.queryByTestId('school-selected-scroll')).toBeNull();
    expect(screen.queryByTestId('school-summary-band')).toBeNull();
  });
});
