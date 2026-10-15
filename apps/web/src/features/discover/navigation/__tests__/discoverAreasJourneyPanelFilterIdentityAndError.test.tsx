/**
 * Issue #1956 PR-4 FIX PASS 4 (performance-analyst REQUEST_CHANGES against
 * FIX CYCLE 3's Fix B) — two regressions closed by this pass:
 *
 * 1. FIX CYCLE 3 pointed the AREA-leaf chip DISPLAY at `committedFilters` but
 *    left the listing QUERY ARGS reading `nav.filters` (URL state, debounce-
 *    lagged) — reintroducing a chip-vs-query/count mismatch immediately after
 *    a chip toggle. This spec asserts on the `useDiscoverCityListings` call
 *    ARGS directly (not rendered output) to prove chips and query share one
 *    filter identity, and is written to FAIL against the pre-fix code (which
 *    read `nav.filters.propertyTypes` — undefined in this fixture's URL —
 *    for the query's `propertyType` arg while chips read `committedFilters`).
 *
 * 2. A listing-query 404/500/timeout (`isLoading:false, data:undefined,
 *    isError:true`) previously fell straight through to
 *    `areaListingsForPanel = []` -> AreaSelectedPanel's own listing-empty
 *    state, presenting a backend failure as "0 verified properties in
 *    {area}" (indistinguishable from a genuine zero-result). This spec
 *    asserts the panel now renders the existing error/retry affordance
 *    instead, and that the "0 results" empty-state testid does NOT appear.
 *
 * Placed under `navigation/__tests__/` (allowed_file_globs) rather than the
 * forbidden `views/__tests__/` — same pattern as
 * `discoverAreasJourneyPanelAreaLeaf.test.tsx`, which this spec's mocking
 * setup mirrors.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FlatPropsAreasJourneyPanel } from '@/features/discover/areas-journey/testing/FlatPropsAreasJourneyPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { UseAreasNavigationJourneyResult } from '../useAreasNavigationJourney';
import type { NavigationNodeResponse } from '../types';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

// ── Mocks ────────────────────────────────────────────────────────────────

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

const mockUseDiscoverCityListings = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useDiscoverCityListings', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useDiscoverCityListings')>(
    '@/hooks/useDiscoverCityListings',
  );
  return {
    ...actual,
    useDiscoverCityListings: (...args: unknown[]) => mockUseDiscoverCityListings(...args),
  };
});

vi.mock('@/components/discover/PropertyCard', () => ({
  PropertyCard: ({ listing }: { listing: { id: string } }) => (
    <div data-testid={`property-card-${listing.id}`} />
  ),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────

const NOOP_BUILD_HREF = () => null;

function makeAreaLeafNode(overrides: Partial<NavigationNodeResponse> = {}): NavigationNodeResponse {
  return {
    nodeKey: 'a:IN|KA|Bangalore|Manipal',
    nodeType: 'AREA',
    displayLabel: 'Manipal',
    depth: 2,
    regionKey: 'east',
    ancestry: [],
    nextLevelType: 'LISTINGS',
    children: [],
    revisionId: 1,
    bounds: {
      centreLat: 13.35,
      centreLon: 74.79,
      minLat: 13.3,
      minLon: 74.75,
      maxLat: 13.4,
      maxLon: 74.83,
    },
    descendantAreaKeys: null,
    areaKey: 'IN|KA|Bangalore|Manipal',
    ...overrides,
  };
}

function makeJourney(overrides: Partial<UseAreasNavigationJourneyResult> = {}): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node: null,
    levelKind: 'empty',
    children: [],
    wasTruncated: false,
    resolutionNotice: null,
    nodeCount: null,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
    ...overrides,
  };
}

function renderPanel(
  node: NavigationNodeResponse | null,
  areaLeafFilters?: PropertyFilters,
  onAreaLeafFiltersChange?: (next: PropertyFilters) => void,
  // No propertyTypes/bedrooms/price in the URL, so `nav.filters` derived from
  // it carries none — a divergent value here proves which source the query
  // args are actually read from.
  url = '/discover?city=bangalore&journey=area-first&intent=buy',
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <DiscoverProvider>
          <FlatPropsAreasJourneyPanel
            journey={makeJourney({
              node,
              nodeCount: { listingCount: 1, schoolCount: 0, matchingAreaCount: null },
              children: [],
            })}
            buildNodeHref={NOOP_BUILD_HREF}
            areaLeafFilters={areaLeafFilters}
            onAreaLeafFiltersChange={onAreaLeafFiltersChange}
          />
        </DiscoverProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DiscoverAreasJourneyPanel — AREA-leaf filter identity + listing-error presentation (Issue #1956 PR-4 FIX PASS 4)', () => {
  it('query args read the SAME committed filter identity the chips display, not the debounce-lagged nav.filters (FAILS pre-fix)', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseDiscoverCityListings.mockReturnValue({
      data: { areas: [{ areaKey: 'IN|KA|Bangalore|Manipal', listings: [] }] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    // committedFilters (page-local state) diverges from the URL's nav.filters
    // (which is empty per the render URL above) — proving, via the assertion
    // below, which source the four query args are actually built from.
    const committedFilters: PropertyFilters = {
      propertyTypes: ['apartment'],
      bedrooms: [3],
      priceMin: 50,
      priceMax: 100,
    };

    renderPanel(makeAreaLeafNode(), committedFilters, vi.fn());

    // Assert on the query ARGS, not rendered output — this is the exact
    // identity performance-analyst flagged as diverging from the chips.
    expect(mockUseDiscoverCityListings).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyType: ['apartment'],
        bedrooms: [3],
        minPrice: 5000, // priceMin (rupees) * 100 -> paise
        maxPrice: 10000,
      }),
    );

    // The chip-display quick-filter buttons reflect the identical source —
    // "Apartments" and "3 BHK" chips are pressed, proving no second,
    // independently-derived filter value exists for chips vs. query.
    expect(screen.getByTestId('quick-chip-apartment')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('quick-chip-3-bhk')).toHaveAttribute('aria-pressed', 'true');
  });

  it('a listing-query error renders the existing error/retry affordance, never the "0 results" empty state (FAILS pre-fix)', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    const refetch = vi.fn();
    mockUseDiscoverCityListings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    renderPanel(makeAreaLeafNode());

    // Distinguishable from a genuine zero-result: the "0 results" empty
    // state must NOT render, and the error/retry affordance must.
    expect(screen.queryByTestId('area-empty-state')).not.toBeInTheDocument();
    // #2750 PR-4 B1 T3 — the zero-result testid is `area-zero-result-recovery` (#2018); the line above
    // names the retired id, so on its own it could not fail.
    expect(screen.queryByTestId('area-zero-result-recovery')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-result-summary')).not.toBeInTheDocument();
    expect(screen.getByTestId('areas-journey-panel-listings-error')).toBeInTheDocument();
    expect(screen.queryByText(/0 verified/i)).not.toBeInTheDocument();
    // #2750 PR-4 B1 T3 (retires e2e issue-1956-pr4-listings-error-state `error copy`): the failure is
    // worded as a load failure, naming the area — the testid alone would also pass for a silent box.
    expect(screen.getByTestId('areas-journey-panel-listings-error')).toHaveTextContent(
      "We couldn't load properties in Manipal. Please try again.",
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // #2750 PR-4 B1 T3 (retires e2e issue-1956-pr4-listings-error-state `404 also error`).
  // Every test above injects `isError: true` into a mocked hook, so none of them reaches the line that
  // DECIDES a non-2xx is an error: `lib/api.ts` `if (!response.ok) throw new ApiError(...)`. Here the
  // REAL `useDiscoverCityListings` (via vi.importActual, which the file-level factory already spreads)
  // runs over the REAL `lib/api.ts`; only the network edge (`fetch`) is stubbed. A 404 must end in the
  // same error affordance as a 500 and must NOT read as a genuine "0 verified properties".
  it('#2750 B1 T3 a real HTTP 404 from the city-listings endpoint (through lib/api.ts) renders the error affordance, not the empty state; a 200 with no listings still renders the empty state', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    const actual = await vi.importActual<typeof import('@/hooks/useDiscoverCityListings')>(
      '@/hooks/useDiscoverCityListings',
    );
    mockUseDiscoverCityListings.mockImplementation(actual.useDiscoverCityListings);
    const jsonResponse = (status: number, statusText: string, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        statusText,
        headers: { 'Content-Type': 'application/json' },
      });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // A fresh Response per call (a body can be read once). Only the city-listings URL is under test;
    // any other incidental request the panel makes gets an inert 200 `{}`.
    const respondToListingsWith = (status: number, statusText: string, body: unknown) =>
      fetchMock.mockImplementation((url: unknown) =>
        Promise.resolve(
          String(url).includes('/api/discover/cities/bangalore/listings')
            ? jsonResponse(status, statusText, body)
            : jsonResponse(200, 'OK', {}),
        ),
      );
    try {
      respondToListingsWith(404, 'Not Found', { message: 'not found' });
      const notFound = renderPanel(makeAreaLeafNode());

      expect(await screen.findByTestId('areas-journey-panel-listings-error')).toBeInTheDocument();
      expect(screen.queryByTestId('area-empty-state')).not.toBeInTheDocument();
      expect(screen.queryByTestId('area-zero-result-recovery')).not.toBeInTheDocument();
      expect(screen.queryByTestId('area-result-summary')).not.toBeInTheDocument();
      expect(screen.queryByText(/0 verified/i)).not.toBeInTheDocument();
      // The request really went through the real hook to the real endpoint path.
      expect(
        fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/discover/cities/bangalore/listings')),
      ).toBe(true);
      notFound.unmount();

      // Control arm, same wiring and same URL: a 200 whose area has no listings is the GENUINE empty
      // state — so the error affordance above is caused by the 404, not by this harness.
      fetchMock.mockReset();
      respondToListingsWith(200, 'OK', {
        city: 'bangalore',
        limitPerArea: 5,
        areas: [{ areaKey: 'IN|KA|Bangalore|Manipal', areaName: 'Manipal', listings: [] }],
      });
      renderPanel(makeAreaLeafNode());

      // (`area-zero-result-recovery` is the zero-result testid since #2018; `area-empty-state` above is
      // the older name and no longer renders anywhere, so it is checked but never relied on alone.)
      expect(await screen.findByTestId('area-zero-result-recovery')).toBeInTheDocument();
      expect(screen.queryByTestId('areas-journey-panel-listings-error')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
      mockUseDiscoverCityListings.mockReset();
    }
  });
});
