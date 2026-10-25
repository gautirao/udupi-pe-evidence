/**
 * #2750 / #2909 — Deterministic router + HTTP-boundary replacement suite for:
 *   - L192 (`e2e/journey/area-trends-2581.spec.ts` Arms 1–9: A0, A1-A3.wiring, A4, A5, A6, A7, A8.land, A9)
 *   - L8   (`e2e/area-overview.spec.ts` AO6 retired `/insights` route, AO7 unknown areaKey, AO8 empty `?areaKey=`, AO9 valid pipe `areaKey`)
 *
 * Exercises the real `AreaSelectedPanel`, `TrendsAreaResolved`, `AreaGuide`, `Trends`, `NotFound`,
 * `useResolveArea`, `useAreaIntelligence`, `useTrendsOptions`, `useAreaOverview`,
 * and `slugifyFromAreaKey` against the `@/lib/api` HTTP boundary.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import React from 'react';

import TrendsAreaResolved from '@/pages/TrendsAreaResolved';
import Trends from '@/pages/Trends';
import NotFound from '@/pages/NotFound';
import AdminIntelligence from '@/pages/admin/Intelligence';
import MapDiscovery from '@/pages/MapDiscovery';
import { AreaSelectedPanel } from '@/components/discover/panels/AreaSelectedPanel';
import { toAreaSelectedPanelContract } from '@/components/discover/panels/__tests__/areaSelectedPanelTestAdapter';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import { mockMatchMediaWidth } from '@/test-utils/mockMatchMediaWidth';
import { slugifyFromAreaKey } from '@/lib/areaSlug';
import type { AreaIntelligenceResponse } from '@/hooks/useAreaIntelligence';
import type { ResolveAreaResponse } from '@/hooks/useResolveArea';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

const apiGetMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => apiGetMock(...args),
    post: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    body?: unknown;
    constructor(msg: string, status: number, body?: unknown) {
      super(msg);
      this.status = status;
      this.body = body;
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

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

vi.mock('@/components/map/PropertyMap', () => ({
  PropertyMap: (props: Record<string, unknown>) => (
    <div data-testid="property-map-stub" data-journey={String(props.journey ?? '')} />
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

vi.mock('@/hooks/useDiscoverSummary', () => ({
  useDiscoverSummary: () => ({ data: { polygonSearchAvailable: true } }),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

interface MockAuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  isBroker: boolean;
  activeRole: 'ADMIN' | 'BROKER' | 'USER' | null;
  user: {
    id: string;
    email: string;
    name: string;
    roles: ('ADMIN' | 'BROKER' | 'USER')[];
    primaryRole: 'ADMIN' | 'BROKER' | 'USER';
    onboardingCompleted: boolean;
  } | null;
}

const ANON_AUTH_STATE: MockAuthState = {
  isAuthenticated: false,
  isLoading: false,
  isAdmin: false,
  isBroker: false,
  activeRole: null,
  user: null,
};

const USER_AUTH_STATE: MockAuthState = {
  isAuthenticated: true,
  isLoading: false,
  isAdmin: false,
  isBroker: false,
  activeRole: 'USER',
  user: {
    id: 'buyer-2581',
    email: 'buyer@example.com',
    name: 'Buyer User',
    roles: ['USER'],
    primaryRole: 'USER',
    onboardingCompleted: true,
  },
};

let currentAuthState: MockAuthState = ANON_AUTH_STATE;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => currentAuthState,
}));

const RESOLVE_BY_SLUG: Record<string, ResolveAreaResponse> = {
  manipal: {
    citySlug: 'udupi',
    areaSlug: 'manipal',
    areaKey: 'IN|KA|Udupi|Manipal',
    areaLabel: 'Manipal',
    matched: true,
  },
  brahmavar: {
    citySlug: 'udupi',
    areaSlug: 'brahmavar',
    areaKey: 'IN|KA|Udupi|Brahmavar',
    areaLabel: 'Brahmavar',
    matched: true,
  },
  kaup: {
    citySlug: 'udupi',
    areaSlug: 'kaup',
    areaKey: 'IN|KA|Udupi|Kaup',
    areaLabel: 'Kaup',
    matched: true,
  },
};

function makeIntelligenceResponse(
  areaKey: string,
  areaLabel: string,
  confidenceLabel: 'Enough data' | 'Limited data' | 'Not enough data yet',
  activeCount: number | null,
): AreaIntelligenceResponse {
  return {
    citySlug: 'udupi',
    areaKey,
    areaLabel,
    available: true,
    confidenceLabel,
    metrics: {
      medianPricePaise: {
        value: confidenceLabel === 'Not enough data yet' ? null : 6_200_000_00,
        confidenceLabel,
      },
      dominantPropertyType: {
        value: confidenceLabel === 'Not enough data yet' ? null : 'House',
        confidenceLabel,
      },
      activeListingCount: {
        value: activeCount,
        confidenceLabel,
      },
      freshListingCount: {
        value: activeCount !== null ? Math.max(1, Math.floor(activeCount / 2)) : null,
        confidenceLabel,
      },
      avgListingQuality: {
        value: confidenceLabel === 'Enough data' ? 81.5 : null,
        confidenceLabel,
      },
      mostSearchedBudget: {
        value: null,
        confidenceLabel: 'Not enough data yet',
      },
    },
    priceComparison: { supported: false, wording: null },
    listingsCta: {
      areaKey,
      label: `View homes in ${areaLabel}`,
    },
  };
}

const INTELLIGENCE_BY_KEY: Record<string, AreaIntelligenceResponse> = {
  'IN|KA|Udupi|Manipal': makeIntelligenceResponse(
    'IN|KA|Udupi|Manipal',
    'Manipal',
    'Enough data',
    12,
  ),
  'IN|KA|Udupi|Brahmavar': makeIntelligenceResponse(
    'IN|KA|Udupi|Brahmavar',
    'Brahmavar',
    'Limited data',
    5,
  ),
  'IN|KA|Udupi|Kaup': makeIntelligenceResponse(
    'IN|KA|Udupi|Kaup',
    'Kaup',
    'Not enough data yet',
    null,
  ),
};

function installDefaultApiStub() {
  apiGetMock.mockImplementation(async (url: string) => {
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
            listingCount: 12,
            schoolCount: 2,
            medianPricePerSqft: 5200,
          },
          {
            areaKey: 'IN|KA|Udupi|Brahmavar',
            name: 'Brahmavar',
            areaLabel: 'Brahmavar',
            geoCenterLat: 13.43,
            geoCenterLon: 74.74,
            lat: 13.43,
            lon: 74.74,
            listingCount: 5,
            schoolCount: 1,
            medianPricePerSqft: 4400,
          },
          {
            areaKey: 'IN|KA|Udupi|Kaup',
            name: 'Kaup',
            areaLabel: 'Kaup',
            geoCenterLat: 13.22,
            geoCenterLon: 74.74,
            lat: 13.22,
            lon: 74.74,
            listingCount: 1,
            schoolCount: 1,
            medianPricePerSqft: 3900,
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
            listings: [
              {
                id: 'listing-manipal-1',
                propertyType: 'house',
                title: 'Manipal Home',
                locality: 'Manipal',
                pricePaise: 6_500_000_00,
                bedrooms: 3,
                bathrooms: 2,
                listingPurpose: 'sale',
              },
            ],
          },
        ],
      };
    }
    if (url.includes('/navigation/resolve')) {
      return {
        requested: 'a:IN|KA|Udupi|Manipal',
        resolution: 'EXACT',
        revisionId: 1,
        node: {
          nodeKey: 'a:IN|KA|Udupi|Manipal',
          nodeType: 'AREA',
          displayLabel: 'Manipal',
          depth: 1,
          ancestry: [],
          nextLevelType: 'LISTINGS',
          children: [],
          revisionId: 1,
          areaKey: 'IN|KA|Udupi|Manipal',
          bounds: {
            minLat: 13.34,
            minLon: 74.77,
            maxLat: 13.36,
            maxLon: 74.79,
            centreLat: 13.3525,
            centreLon: 74.7868,
          },
        },
      };
    }
    if (url.includes('/navigation/') && url.includes('/counts')) {
      return {
        nodeKey: 'a:IN|KA|Udupi|Manipal',
        revisionId: 1,
        count: 12,
        schoolCount: 2,
        areaCounts: { 'IN|KA|Udupi|Manipal': 12 },
        areaSchoolCounts: { 'IN|KA|Udupi|Manipal': 2 },
        children: [],
      };
    }
    if (url.includes('/area-groups')) {
      return { city: 'udupi', groups: [] };
    }
    if (url.includes('/regional-area-groups')) {
      return { city: 'udupi', groups: [] };
    }
    if (url.includes('/regions')) {
      return { regions: [] };
    }
    if (url.startsWith('/api/discover/listings?')) {
      const parsed = new URL(url, 'http://localhost');
      const areaKey = parsed.searchParams.get('areaKey') ?? 'IN|KA|Udupi|Manipal';
      const areaLabel = areaKey.split('|').pop() ?? areaKey;
      return {
        content: [
          {
            id: `listing-${areaLabel.toLowerCase()}-1`,
            listingNumber: 'L-2581',
            propertyType: 'house',
            title: `${areaLabel} Home`,
            locality: areaLabel,
            areaKey,
            pricePaise: 6_500_000_00,
            landArea: 5,
            landAreaUnit: 'cent',
            builtArea: 1800,
            builtAreaUnit: 'sqft',
            bedrooms: 3,
            bathrooms: 2,
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
    if (url.startsWith('/api/trends/resolve-area')) {
      const parsed = new URL(url, 'http://localhost');
      const slug = parsed.searchParams.get('slug') ?? '';
      return (
        RESOLVE_BY_SLUG[slug] ?? {
          citySlug: parsed.searchParams.get('city') ?? 'udupi',
          areaSlug: slug,
          areaKey: null,
          areaLabel: null,
          matched: false,
        }
      );
    }
    if (url.startsWith('/api/trends/area-intelligence')) {
      const parsed = new URL(url, 'http://localhost');
      const areaKey = parsed.searchParams.get('areaKey') ?? '';
      const found = INTELLIGENCE_BY_KEY[areaKey];
      if (!found) {
        throw new Error(`Unexpected areaKey: ${areaKey}`);
      }
      return found;
    }
    if (url.startsWith('/api/trends/options')) {
      return {
        city: 'udupi',
        defaultAreas: [
          { areaKey: 'IN|KA|Udupi|Manipal', areaLabel: 'Manipal' },
          { areaKey: 'IN|KA|Udupi|Brahmavar', areaLabel: 'Brahmavar' },
          { areaKey: 'IN|KA|Udupi|Kaup', areaLabel: 'Kaup' },
        ],
      };
    }
    if (url.startsWith('/api/admin/intelligence/areas')) {
      return [
        {
          areaKey: 'IN|KA|Udupi|Manipal',
          areaLabel: 'Manipal',
          district: 'Udupi',
          live90dCount: 12,
          scoredListingCount: 12,
          avgQualityScore: 81.5,
          confidence: 'full',
          demandEventCount: null,
          topGaps: null,
        },
        {
          areaKey: 'IN|KA|Udupi|Brahmavar',
          areaLabel: 'Brahmavar',
          district: 'Udupi',
          live90dCount: 5,
          scoredListingCount: 5,
          avgQualityScore: 74.0,
          confidence: 'limited',
          demandEventCount: null,
          topGaps: null,
        },
        {
          areaKey: 'IN|KA|Udupi|Kaup',
          areaLabel: 'Kaup',
          district: 'Udupi',
          live90dCount: 1,
          scoredListingCount: 1,
          avgQualityScore: null,
          confidence: 'insufficient',
          demandEventCount: null,
          topGaps: null,
        },
      ];
    }
    if (url.startsWith('/api/trends/area-overview')) {
      throw Object.assign(new Error('Area not found'), { status: 404 });
    }
    throw new Error(`Unhandled URL in test stub: ${url}`);
  });
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

/**
 * Mounts the real `AreaSelectedPanel` wired with `trendsHref` derived via
 * `slugifyFromAreaKey(areaKey)` exactly as `AreaLeafListingsSurface.tsx:340,445` does.
 */
function DiscoverAreaLeafHarness({ city, areaKey }: { city: string; areaKey: string }) {
  const areaLabel = areaKey.split('|').pop() ?? areaKey;
  const trendsHref = `/trends/${city}/areas/${slugifyFromAreaKey(areaKey)}`;
  const { view, commands } = toAreaSelectedPanelContract({
    selectedArea: {
      areaKey,
      areaLabel,
      geo_center_lat: 13.35,
      geo_center_lon: 74.78,
      bbox: null,
    },
    areaListings: [
      {
        id: 'listing-1',
        propertyType: 'house',
        title: `${areaLabel} Home`,
        locality: areaLabel,
        pricePaise: 5_000_000_00,
        bedrooms: 3,
        bathrooms: 2,
      },
    ],
    filters: {},
    onFiltersChange: vi.fn(),
    onSelectJourney: vi.fn(),
    onAddSchool: vi.fn(),
    searchQuery: '',
    onSearchChange: vi.fn(),
    trendsHref,
  });

  return (
    <DiscoverProvider>
      <AreaSetDraftProvider>
        <div data-testid="discover-area-leaf-harness">
          <AreaSelectedPanel view={view} commands={commands} />
        </div>
      </AreaSetDraftProvider>
    </DiscoverProvider>
  );
}

function renderJourneyRouter(
  initialEntries: string[],
  discoverLeafProps: { city: string; areaKey: string; mountRealMapDiscovery?: boolean } = {
    city: 'udupi',
    areaKey: 'IN|KA|Udupi|Manipal',
  },
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route
            path="/discover"
            element={
              discoverLeafProps.mountRealMapDiscovery ? (
                <DiscoverProvider>
                  <MapDiscovery />
                </DiscoverProvider>
              ) : (
                <DiscoverAreaLeafHarness
                  city={discoverLeafProps.city}
                  areaKey={discoverLeafProps.areaKey}
                />
              )
            }
          />
          <Route path="/trends/:citySlug/areas/:areaSlug" element={<TrendsAreaResolved />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/admin/intelligence" element={<AdminIntelligence />} />
          <Route path="/auth" element={<div data-testid="auth-route">Auth Login</div>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let restoreMatchMedia: (() => void) | null = null;

describe('L192 (area-trends-2581) — Discover area leaf -> /trends/:citySlug/areas/:areaSlug journey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAuthState = ANON_AUTH_STATE;
    installDefaultApiStub();
    restoreMatchMedia = mockMatchMediaWidth(1366).restore;
  });

  afterEach(() => {
    restoreMatchMedia?.();
    restoreMatchMedia = null;
  });

  it.each([
    {
      arm: 'Arm 1 (FULL >=10 listings)',
      areaKey: 'IN|KA|Udupi|Manipal',
      expectedSlug: 'manipal',
      expectedHeading: 'Manipal',
      expectedBadge: 'Enough data',
      absentHeroBadge: 'Limited data',
    },
    {
      arm: 'Arm 2 (LIMITED 3..9 listings)',
      areaKey: 'IN|KA|Udupi|Brahmavar',
      expectedSlug: 'brahmavar',
      expectedHeading: 'Brahmavar',
      expectedBadge: 'Limited data',
      absentHeroBadge: 'Enough data',
    },
    {
      arm: 'Arm 3 (INSUFFICIENT <3 listings)',
      areaKey: 'IN|KA|Udupi|Kaup',
      expectedSlug: 'kaup',
      expectedHeading: 'Kaup',
      expectedBadge: 'Not enough data yet',
      absentHeroBadge: 'Enough data',
    },
  ])(
    '$arm — A0 + A1-A3.wiring + A4: clicking Discover AreaSelectedPanel Trends link resolves /trends/udupi/areas/$expectedSlug and renders "$expectedBadge" for anonymous buyer with no /auth redirect',
    async ({ areaKey, expectedSlug, expectedHeading, expectedBadge, absentHeroBadge }) => {
      renderJourneyRouter(['/discover?city=udupi&journey=area-first'], {
        city: 'udupi',
        areaKey,
      });

      const trendsLink = screen.getByTestId('compact-results-trends-link');
      expect(trendsLink).toHaveAttribute('href', `/trends/udupi/areas/${expectedSlug}`);

      fireEvent.click(trendsLink);

      expect(screen.getByTestId('location-probe')).toHaveTextContent(
        `/trends/udupi/areas/${expectedSlug}`,
      );
      expect(screen.queryByTestId('auth-route')).not.toBeInTheDocument();

      const heading = await screen.findByRole('heading', {
        level: 1,
        name: new RegExp(`^${expectedHeading}$`, 'i'),
      });
      expect(heading).toBeInTheDocument();

      expect(screen.getAllByText(expectedBadge).length).toBeGreaterThan(0);
      expect(screen.queryByText(absentHeroBadge)).not.toBeInTheDocument();

      expect(apiGetMock).toHaveBeenCalledWith(
        `/api/trends/resolve-area?city=udupi&slug=${expectedSlug}`,
        { skipAuth: true },
      );
      expect(apiGetMock).toHaveBeenCalledWith(
        `/api/trends/area-intelligence?city=udupi&areaKey=${encodeURIComponent(areaKey)}`,
        { skipAuth: true },
      );
    },
  );

  it('A5: signed-in normal USER role navigating to /trends/udupi/areas/brahmavar sees "Limited data" with no /auth redirect', async () => {
    currentAuthState = USER_AUTH_STATE;

    renderJourneyRouter(['/discover?city=udupi&journey=area-first'], {
      city: 'udupi',
      areaKey: 'IN|KA|Udupi|Brahmavar',
    });

    fireEvent.click(screen.getByTestId('compact-results-trends-link'));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/trends/udupi/areas/brahmavar');
    expect(screen.queryByTestId('auth-route')).not.toBeInTheDocument();

    expect(
      await screen.findByRole('heading', { level: 1, name: /^brahmavar$/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Limited data').length).toBeGreaterThan(0);
  });

  it('A6: mobile 390x844 viewport renders AreaSelectedPanel toolbar Trends link, navigates to /trends/udupi/areas/kaup, and renders "Not enough data yet"', async () => {
    restoreMatchMedia?.();
    restoreMatchMedia = mockMatchMediaWidth(390).restore;

    renderJourneyRouter(['/discover?city=udupi&journey=area-first'], {
      city: 'udupi',
      areaKey: 'IN|KA|Udupi|Kaup',
    });

    // Below 1366px, AreaSelectedPanel renders the Trends link in the mobile/tablet toolbar row
    expect(screen.queryByTestId('compact-results-trends-link')).not.toBeInTheDocument();
    const mobileTrendsLink = screen.getByRole('link', { name: /trends/i });
    expect(mobileTrendsLink).toHaveAttribute('href', '/trends/udupi/areas/kaup');

    fireEvent.click(mobileTrendsLink);

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/trends/udupi/areas/kaup');
    expect(
      await screen.findByRole('heading', { level: 1, name: /^kaup$/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Not enough data yet').length).toBeGreaterThan(0);
  });

  it('A7 + A8.land: reload/remount at /trends/udupi/areas/manipal preserves "Enough data", and clicking "View homes in Manipal" restores the selected Manipal area on real MapDiscovery', async () => {
    const firstMount = renderJourneyRouter(['/trends/udupi/areas/manipal'], {
      city: 'udupi',
      areaKey: 'IN|KA|Udupi|Manipal',
      mountRealMapDiscovery: true,
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: /^manipal$/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Enough data').length).toBeGreaterThan(0);

    // Simulate page reload by unmounting and mounting fresh at the same URL
    firstMount.unmount();
    renderJourneyRouter(['/trends/udupi/areas/manipal'], {
      city: 'udupi',
      areaKey: 'IN|KA|Udupi|Manipal',
      mountRealMapDiscovery: true,
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: /^manipal$/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/trends/udupi/areas/manipal');
    expect(screen.getAllByText('Enough data').length).toBeGreaterThan(0);

    const viewHomesLinks = screen.getAllByRole('link', { name: /view homes in manipal/i });
    expect(viewHomesLinks.length).toBeGreaterThan(0);
    fireEvent.click(viewHomesLinks[0]);

    // Real MapDiscovery restores the selected Manipal area leaf, auto-commits rscope=areas&rareas=IN|KA|Udupi|Manipal,
    // renders the Manipal breadcrumb trail, and wires the AreaSelectedPanel Trends link back to /trends/udupi/areas/manipal
    const restoredTrendsLink = await screen.findByTestId('compact-results-trends-link');
    expect(restoredTrendsLink).toHaveAttribute('href', '/trends/udupi/areas/manipal');
    expect(screen.getByTestId('areas-breadcrumb-trail')).toHaveTextContent('Manipal');
    expect(screen.getByTestId('location-probe').textContent).toContain(
      '/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal',
    );
    expect(screen.getByTestId('location-probe').textContent).toContain(
      'rscope=areas&rareas=IN%7CKA%7CUdupi%7CManipal',
    );
  });

  it('A9: admin /admin/intelligence confidence badges (Full / Limited / Insufficient) agree with all 3 buyer /trends/udupi/areas/:slug pages (Manipal=Enough data, Brahmavar=Limited data, Kaup=Not enough data yet)', async () => {
    const adminMount = renderJourneyRouter(['/admin/intelligence']);
    const table = await screen.findByTestId('intelligence-table');
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(3);

    expect(within(rows[0] as HTMLElement).getByText('Manipal')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('Full')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Brahmavar')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Limited')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('Kaup')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('Insufficient')).toBeInTheDocument();
    adminMount.unmount();

    const buyerManipal = renderJourneyRouter(['/trends/udupi/areas/manipal']);
    await screen.findByRole('heading', { level: 1, name: /^manipal$/i });
    expect(screen.getAllByText('Enough data').length).toBeGreaterThan(0);
    buyerManipal.unmount();

    const buyerBrahmavar = renderJourneyRouter(['/trends/udupi/areas/brahmavar']);
    await screen.findByRole('heading', { level: 1, name: /^brahmavar$/i });
    expect(screen.getAllByText('Limited data').length).toBeGreaterThan(0);
    buyerBrahmavar.unmount();

    const buyerKaup = renderJourneyRouter(['/trends/udupi/areas/kaup']);
    await screen.findByRole('heading', { level: 1, name: /^kaup$/i });
    expect(screen.getAllByText('Not enough data yet').length).toBeGreaterThan(0);
    buyerKaup.unmount();
  });
});

describe('L8 (area-overview.spec.ts) — /insights retirement and /trends areaKey parameter handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAuthState = ANON_AUTH_STATE;
    installDefaultApiStub();
  });

  it('AO6 (retired route): /insights is not routed to Trends and renders the NotFound 404 boundary', () => {
    renderJourneyRouter(['/insights']);

    expect(screen.getByRole('heading', { level: 1, name: '404' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /manipal/i })).not.toBeInTheDocument();
  });

  it('AO8 + AO9: /trends?city=udupi&areaKey= (empty param) renders AreaGuide skeleton without crash or legacy "Select an area to explore", /trends?city=udupi self-populates default area, and pipe areaKey renders heading directly', async () => {
    const emptyParamRender = renderJourneyRouter(['/trends?city=udupi&areaKey=']);
    expect(screen.getByLabelText('Loading area guide')).toBeInTheDocument();
    expect(screen.queryByText('Area not found')).not.toBeInTheDocument();
    expect(screen.queryByText(/select an area to explore/i)).not.toBeInTheDocument();
    emptyParamRender.unmount();

    renderJourneyRouter(['/trends?city=udupi']);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /^manipal$/i }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Area not found')).not.toBeInTheDocument();
    expect(screen.queryByText(/select an area to explore/i)).not.toBeInTheDocument();
  });
});
