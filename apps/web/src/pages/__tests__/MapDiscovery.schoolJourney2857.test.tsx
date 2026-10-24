/**
 * Issue #2857 (FU-LOWER-A) — L87, L89, and L157 page-level school-first replacements:
 *   - L87 E2E-7 (`e2e/discover-school-journey.spec.ts` line 538, G3-N5):
 *     selecting an area in `school-first` (`/discover?city=udupi&journey=school-first&areaKey=IN|KA|Udupi|Manipal`)
 *     fires `GET /api/public/schools/by-area` EXACTLY ONCE at the HTTP (`api.get`) boundary
 *     (proving `SchoolsInAreaPanel.tsx:168` suppresses its internal `useSchoolsByArea` query when
 *     `MapDiscovery` passes `schools` prop) and renders the school cards (`data-testid="school-card"`).
 *   - L87 E2E-8 (`e2e/discover-school-journey.spec.ts` lines 612-613, G3-N6):
 *     clicking a `school-card` in `SchoolsInAreaPanel` writes BOTH `schoolId=<id>` AND `radiusKm=3`
 *     alongside `areaKey` in the URL.
 *   - L89 E2E-6 (`e2e/discover-school-selected.spec.ts` lines 310-326, G3-N7):
 *     when `schoolId`, `radiusKm=3`, and `type=house` are active, the URL preserves `schoolId`,
 *     `radiusKm=3`, and `type=house` together and `GET /api/discover/listings` sends
 *     `schoolLat`, `schoolLon`, `schoolRadiusKm=3`, and `propertyTypes=house`.
 *   - L157 111-115 (`e2e/discover/issue-2770-compact-school-context.spec.ts` lines 111-115, G3-N8):
 *     in `AreaSchoolCombinedPanel` (`?city=udupi&journey=school-first&areaKey=IN|KA|Udupi|Manipal&schoolId=<id>&radiusKm=3`),
 *     clicking `Change school` (`change-school-btn`) clears `schoolId` and returns to the area view
 *     where the `"Schools in Manipal"` header row (`selected-area-summary-title`) precedes the
 *     `school-card` list in DOM order.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

const { mockApiGet, authState } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  authState: { isAuthenticated: false },
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
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: (props: Record<string, unknown>) => (
    <div
      data-testid="property-map-stub"
      data-journey={String(props.journey ?? '')}
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
  useAuth: () => ({
    user: authState.isAuthenticated ? { id: 'user-1', email: 'buyer@example.com' } : null,
    isAuthenticated: authState.isAuthenticated,
    isLoading: false,
  }),
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

const MOCK_SCHOOLS: SchoolResult[] = [
  {
    id: 'school-manipal-1',
    name: 'Manipal Junior College',
    board: 'CBSE',
    boardType: 'CBSE',
    latitude: 13.3525,
    longitude: 74.7868,
    address: 'Madhav Nagar, Manipal',
    distanceKm: 0.4,
    areaKey: 'IN|KA|Udupi|Manipal',
  },
  {
    id: 'school-manipal-2',
    name: 'Madhava Kripa School',
    board: 'CBSE',
    boardType: 'CBSE',
    latitude: 13.354,
    longitude: 74.789,
    address: 'Manipal University Road, Manipal',
    distanceKm: 0.8,
    areaKey: 'IN|KA|Udupi|Manipal',
  },
];

import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import MapDiscovery from '../MapDiscovery';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location-probe">{`${loc.pathname}${loc.search}`}</div>;
}

function renderHarness(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
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

function byAreaCalls(): string[] {
  return mockApiGet.mock.calls
    .map((c) => String(c[0]))
    .filter((url) => url.startsWith('/api/public/schools/by-area'));
}

function discoverListingsCalls(): string[] {
  return mockApiGet.mock.calls
    .map((c) => String(c[0]))
    .filter((url) => url.startsWith('/api/discover/listings?'));
}

describe('MapDiscovery — #2857 L87 (E2E-7, E2E-8), L89 (E2E-6), and L157 (111-115) school journey', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    mockApiGet.mockReset();
    mockApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/discover/areas')) {
        return {
          city: 'udupi',
          areas: [
            {
              areaKey: 'IN|KA|Udupi|Manipal',
              name: 'Manipal',
              areaLabel: 'Manipal',
              lat: 13.3525,
              lon: 74.7868,
              listingCount: 4,
              schoolCount: 2,
              medianPricePerSqft: 5200,
            },
          ],
        };
      }
      if (url.startsWith('/api/public/schools/by-area')) {
        return MOCK_SCHOOLS;
      }
      if (url.startsWith('/api/public/schools/school-manipal-1')) {
        return MOCK_SCHOOLS[0];
      }
      if (url.startsWith('/api/discover/cities/udupi/school-radius-listings')) {
        return {
          content: [
            {
              id: 'house-near-school-1',
              propertyType: 'house',
              title: 'Manipal Family House',
              locality: 'Manipal',
              areaKey: 'IN|KA|Udupi|Manipal',
              priceBand: '₹75L–1Cr',
              latitude: 13.353,
              longitude: 74.787,
            },
          ],
          page: 0,
          size: 50,
          hasMore: false,
        };
      }
      if (url.startsWith('/api/discover/listings?')) {
        return {
          content: [
            {
              id: 'house-near-school-1',
              listingNumber: 'L-101',
              propertyType: 'house',
              title: 'Manipal Family House',
              locality: 'Manipal',
              areaKey: 'IN|KA|Udupi|Manipal',
              pricePaise: 850000000,
              landArea: 5,
              landAreaUnit: 'cent',
              builtArea: 1800,
              builtAreaUnit: 'sqft',
              bedrooms: 3,
              latitude: 13.353,
              longitude: 74.787,
              heroImageUrl: null,
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: null,
              firstPublishedAt: null,
              lastUpdatedAt: null,
              daysOnMarket: 10,
              backOnMarket: false,
              reraNumber: null,
              reraValid: false,
              possessionStatus: 'ready_to_move',
              sellerType: 'owner',
              listingPurpose: 'sale',
              status: 'LIVE',
            },
          ],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        };
      }
      if (url.includes('/trends')) {
        return { defaultAreas: [], propertyTypes: [], listingPurposes: [] };
      }
      if (url.includes('/cities/udupi/listings')) {
        return {
          city: 'udupi',
          limitPerArea: 5,
          areas: [{ areaKey: 'IN|KA|Udupi|Manipal', listings: [] }],
        };
      }
      if (url.includes('/regions')) {
        return { regions: [] };
      }
      if (url.includes('/area-groups') || url.includes('/regional-area-groups')) {
        return { city: 'udupi', groups: [] };
      }
      if (url.includes('/agri-destinations')) {
        return { city: 'udupi', destinations: [] };
      }
      return { content: [], totalElements: 0, totalPages: 0, areas: [], defaultAreas: [], groups: [] };
    });
  });

  it('L87 E2E-7 & E2E-8 (G3-N5, G3-N6): school-first area selection fires GET /api/public/schools/by-area exactly once, renders school cards, and clicking a card writes schoolId and radiusKm=3 alongside areaKey', async () => {
    renderHarness('/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal');

    const cards = await screen.findAllByTestId('school-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Manipal Junior College');
    expect(cards[1]).toHaveTextContent('Madhava Kripa School');

    // E2E-7: exactly ONE /api/public/schools/by-area request fired (no duplicate fetch from SchoolsInAreaPanel)
    const calls = byAreaCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('areaKey=IN%7CKA%7CUdupi%7CManipal');

    // E2E-8: clicking a school card writes BOTH schoolId and radiusKm=3 alongside areaKey
    fireEvent.click(cards[0]);

    await waitFor(() => {
      const params = getSearchParams();
      expect(params.get('journey')).toBe('school-first');
      expect(params.get('areaKey')).toBe('IN|KA|Udupi|Manipal');
      expect(params.get('schoolId')).toBe('school-manipal-1');
      expect(params.get('radiusKm')).toBe('3');
    });
  });

  it('L89 E2E-6 (G3-N7): with schoolId and radiusKm=3 active alongside type=house, preserves all three in URL and sends schoolLat, schoolLon, schoolRadiusKm=3, and propertyTypes=house in the listings request', async () => {
    authState.isAuthenticated = true;

    renderHarness(
      '/discover?city=udupi&journey=school-first&schoolId=school-manipal-1&radiusKm=3&type=house',
    );

    await screen.findByTestId('school-summary-band');
    expect(screen.getByTestId('school-summary-name')).toHaveTextContent('Manipal Junior College');

    // Wait for /api/discover/listings request carrying school coords + radius 3 + propertyTypes=house
    await waitFor(() => {
      const matchingCalls = discoverListingsCalls().filter(
        (url) =>
          url.includes('schoolLat=13.3525') &&
          url.includes('schoolLon=74.7868') &&
          url.includes('schoolRadiusKm=3') &&
          url.includes('propertyTypes=house'),
      );
      expect(matchingCalls.length).toBeGreaterThanOrEqual(1);
    });

    // URL co-presence: schoolId, radiusKm=3, and type=house all remain intact in the URL
    const params = getSearchParams();
    expect(params.get('journey')).toBe('school-first');
    expect(params.get('schoolId')).toBe('school-manipal-1');
    expect(params.get('radiusKm')).toBe('3');
    expect(params.get('type')).toBe('house');
  });

  it('L157 111-115 (G3-N8): clicking Change school in AreaSchoolCombinedPanel clears schoolId and returns to the area view with "Schools in Manipal" header preceding the school cards list', async () => {
    renderHarness(
      '/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=school-manipal-1&radiusKm=3',
    );

    const changeSchoolBtn = await screen.findByTestId('change-school-btn');
    expect(screen.getByTestId('school-summary-name')).toHaveTextContent('Manipal Junior College');

    fireEvent.click(changeSchoolBtn);

    // URL clears schoolId and preserves journey=school-first + areaKey=IN|KA|Udupi|Manipal
    await waitFor(() => {
      const params = getSearchParams();
      expect(params.get('schoolId')).toBeNull();
      expect(params.get('areaKey')).toBe('IN|KA|Udupi|Manipal');
      expect(params.get('journey')).toBe('school-first');
    });

    // Back in the area view: "Schools in Manipal" row renders and precedes the school cards list in DOM order
    const areaHeading = await screen.findByTestId('selected-area-summary-title');
    expect(areaHeading).toHaveTextContent('Schools in Manipal');

    const schoolCards = await screen.findAllByTestId('school-card');
    expect(schoolCards).toHaveLength(2);
    expect(
      Boolean(
        areaHeading.compareDocumentPosition(schoolCards[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });
});
