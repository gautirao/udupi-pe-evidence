/**
 * Issue #1956 PR-4 FIX CYCLE 2 (opus review, blocking Finding 3) — the
 * AREA-leaf listings branch `DiscoverAreasJourneyPanel` added
 * (`AreaLeafListingsSurface`, gated on `if (selectedAreaPoint)`) had NO
 * render coverage: every case in the pre-existing
 * `DiscoverAreasJourneyPanel.test.tsx` uses `makeNode()`'s default
 * (nodeType ROOT / areaKey null / bounds null) or a Direction/Cluster
 * fixture, so `deriveAreaPointFromNode` returns null in all 18 of those
 * cases and the new branch is never entered there.
 *
 * `src/features/discover/views/__tests__/DiscoverAreasJourneyPanel.test.tsx`
 * is NOT in this PR's allowed_file_globs, so this is a NEW, separate spec
 * file under the allowed `src/features/discover/navigation/__tests__/`
 * path — it does not edit the existing 18-test file.
 *
 * Renders the REAL `DiscoverAreasJourneyPanel` (and the real
 * `AreaSelectedPanel` it mounts for an AREA leaf) inside
 * QueryClientProvider/MemoryRouter/DiscoverProvider — the actual providers
 * `AreaLeafListingsSurface`'s hooks need — with `useAuth` and
 * `useDiscoverCityListings` mocked (the two hooks whose real implementation
 * would otherwise require a live Supabase session / backend), and
 * `PropertyCard` stubbed to a minimal, controllable render so the
 * anon-vs-authed price-safety assertion tests THIS component's wiring
 * (which price field it forwards) rather than PropertyCard's own internal
 * formatting logic.
 */
import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverAreasJourneyPanel } from '../../views/DiscoverAreasJourneyPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { UseAreasNavigationJourneyResult } from '../useAreasNavigationJourney';
import type { NavigationNodeResponse } from '../types';
import type { DiscoverCityListingItem, DiscoverCityListingsParams } from '@/hooks/useDiscoverCityListings';
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

// Stubbed so the anon/authed price assertion below tests THIS component's
// data wiring (which of pricePaise/priceBand it forwards, driven by the
// mocked useDiscoverCityListings response), not PropertyCard's own
// formatPrice/auth-branch rendering logic.
// Issue #2051 — extended to also surface monthlyRentRupees/monthlyRentBand so the
// R2 anon-leak guard below can assert on the rent field the same way the existing
// pricePaise/priceBand guard does.
vi.mock('@/components/discover/PropertyCard', () => ({
  PropertyCard: ({ listing }: { listing: DiscoverCityListingItem }) => (
    <div data-testid={`property-card-${listing.id}`}>
      {listing.pricePaise != null
        ? `EXACT:${listing.pricePaise}`
        : listing.monthlyRentRupees != null
          ? `RENT_EXACT:${listing.monthlyRentRupees}`
          : (listing.priceBand ?? listing.monthlyRentBand ?? 'no-price')}
    </div>
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

function makeListing(overrides: Partial<DiscoverCityListingItem> = {}): DiscoverCityListingItem {
  return {
    id: 'listing-1',
    propertyType: 'apartment',
    bedrooms: 2,
    primaryImageUrl: null,
    priceBand: '₹50L - ₹75L',
    trustBadge: 'verified',
    locality: 'Manipal',
    ...overrides,
  } as DiscoverCityListingItem;
}

// FIX CYCLE 3 — extraProps lets the FIX B test inject
// areaLeafFilters/onAreaLeafFiltersChange without a second render helper.
function renderPanel(
  node: NavigationNodeResponse | null,
  url = '/discover?city=bangalore&journey=area-first&intent=buy',
  extraProps: Partial<ComponentProps<typeof DiscoverAreasJourneyPanel>> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <DiscoverProvider>
          <DiscoverAreasJourneyPanel
            journey={makeJourney({
              node,
              nodeCount: { listingCount: 1, schoolCount: 0, matchingAreaCount: null },
              children: [],
            })}
            buildNodeHref={NOOP_BUILD_HREF}
            {...extraProps}
          />
        </DiscoverProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const INVARIANT_8_LITERALS = [
  /edit areas/i,
  /clear selected areas/i,
  /add nearby areas/i,
  /draw search area/i,
  /search this area/i,
  /create alert/i,
];

describe('DiscoverAreasJourneyPanel — AREA-leaf listings surface (Issue #1956 PR-4)', () => {
  it('AREA leaf (populated bounds) renders the listings surface, not the structural empty branch, with no invariant-8 controls', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseDiscoverCityListings.mockReturnValue({
      data: { areas: [{ areaKey: 'IN|KA|Bangalore|Manipal', listings: [makeListing()] }] },
      isLoading: false,
    });

    renderPanel(makeAreaLeafNode());

    expect(screen.getByTestId('areas-journey-panel-listings')).toBeInTheDocument();
    expect(screen.queryByTestId('areas-journey-panel-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('property-card-listing-1')).toBeInTheDocument();
    for (const forbidden of INVARIANT_8_LITERALS) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });

  it('anon arm — no exact price string renders (GUARD test: fixture carries BOTH pricePaise and priceBand, so a leak would show)', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseDiscoverCityListings.mockReturnValue({
      data: {
        areas: [
          {
            areaKey: 'IN|KA|Bangalore|Manipal',
            // FIX CYCLE 3 (SF4) — the PREVIOUS fixture set `pricePaise:
            // undefined`, so this assertion was fixture-driven (it would have
            // passed even if the surface leaked pricePaise, because there
            // was structurally no pricePaise to leak). This fixture now
            // carries BOTH `pricePaise` and `priceBand` — an actual guard
            // failure (the surface forwarding pricePaise to an anon render)
            // would make `EXACT:7500000` appear and fail this assertion.
            listings: [makeListing({ priceBand: '₹50L - ₹75L', pricePaise: 7_500_000 })],
          },
        ],
      },
      isLoading: false,
    });

    renderPanel(makeAreaLeafNode());

    const card = screen.getByTestId('property-card-listing-1');
    expect(card).toHaveTextContent('₹50L - ₹75L');
    expect(screen.queryByText(/EXACT:/)).not.toBeInTheDocument();
    // The hook must be called with isAuthenticated: false for the anon arm.
    expect(mockUseDiscoverCityListings).toHaveBeenCalledWith(
      expect.objectContaining({ isAuthenticated: false }),
    );
  });

  it('anon arm — monthlyRentRupees is stripped for anon (R2, Issue #2051 — GUARD test: fixture carries BOTH monthlyRentRupees and monthlyRentBand, so a leak would show)', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseDiscoverCityListings.mockReturnValue({
      data: {
        areas: [
          {
            areaKey: 'IN|KA|Bangalore|Manipal',
            listings: [
              makeListing({
                listingPurpose: 'rent',
                priceBand: undefined,
                pricePaise: undefined,
                monthlyRentBand: '₹20–35K',
                monthlyRentRupees: 25000,
              }),
            ],
          },
        ],
      },
      isLoading: false,
    });

    renderPanel(makeAreaLeafNode());

    const card = screen.getByTestId('property-card-listing-1');
    expect(card).toHaveTextContent('₹20–35K');
    expect(screen.queryByText(/RENT_EXACT:/)).not.toBeInTheDocument();
    expect(mockUseDiscoverCityListings).toHaveBeenCalledWith(
      expect.objectContaining({ isAuthenticated: false }),
    );
  });

  it('authed arm — exact price flows through when the mocked hook returns pricePaise', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' }, isLoading: false });
    mockUseDiscoverCityListings.mockReturnValue({
      data: {
        areas: [
          {
            areaKey: 'IN|KA|Bangalore|Manipal',
            listings: [makeListing({ priceBand: undefined, pricePaise: 7_500_000 })],
          },
        ],
      },
      isLoading: false,
    });

    renderPanel(makeAreaLeafNode());

    expect(screen.getByTestId('property-card-listing-1')).toHaveTextContent('EXACT:7500000');
    expect(mockUseDiscoverCityListings).toHaveBeenCalledWith(
      expect.objectContaining({ isAuthenticated: true }),
    );
  });

  it('AC4.7 — zero listings at a resolved AREA leaf renders AreaSelectedPanel\'s OWN listing-empty state (area-empty-state), never the structural Direction-level empty branch', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseDiscoverCityListings.mockReturnValue({
      data: { areas: [{ areaKey: 'IN|KA|Bangalore|Manipal', listings: [] }] },
      isLoading: false,
    });

    renderPanel(makeAreaLeafNode());

    expect(screen.getByTestId('areas-journey-panel-listings')).toBeInTheDocument();
    expect(screen.getByTestId('area-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('areas-journey-panel-empty')).not.toBeInTheDocument();
    expect(screen.queryByText(/no matches with current filters/i)).not.toBeInTheDocument();
  });

  it('FIX CYCLE 2, Finding 1 — AREA node with areaKey set but bounds: null falls back to the structural empty branch, never the listings surface', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseDiscoverCityListings.mockReturnValue({ data: undefined, isLoading: false });

    renderPanel(makeAreaLeafNode({ bounds: null }));

    expect(screen.queryByTestId('areas-journey-panel-listings')).not.toBeInTheDocument();
    expect(screen.getByTestId('areas-journey-panel-empty')).toBeInTheDocument();
  });

  // ── FIX CYCLE 3 — Fix A (blocking) ──────────────────────────────────────
  it('FIX A — within-area search binds to the immediate value; typing never gets swallowed', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseDiscoverCityListings.mockReturnValue({
      data: { areas: [{ areaKey: 'IN|KA|Bangalore|Manipal', listings: [makeListing()] }] },
      isLoading: false,
    });
    const user = userEvent.setup();

    renderPanel(makeAreaLeafNode());

    const input = screen.getByTestId('area-search-input');
    await user.type(input, 'man');

    // Synchronous, per-keystroke assertion — a debounced/stale-URL-derived
    // controlled value would reset the DOM input on every re-render and this
    // would fail (previously read `nav.q`, unchanged until the 250ms
    // debounce commits, instead of `useDiscoverSearchState`'s own immediate
    // `searchQuery`).
    expect(input).toHaveValue('man');
  });

  // ── FIX CYCLE 3 — Fix B (blocking) ──────────────────────────────────────
  it('FIX B — a chip toggle calls the injected page-level filters handler with the merged next filters, not the URL-only setFiltersCommitted path', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseDiscoverCityListings.mockReturnValue({
      data: { areas: [{ areaKey: 'IN|KA|Bangalore|Manipal', listings: [makeListing()] }] },
      isLoading: false,
    });
    const user = userEvent.setup();
    const onAreaLeafFiltersChange = vi.fn();
    // A field that exists on the page's full PropertyFilters shape but NOT
    // on the URL-derived DiscoverUrlFilters subset (e.g. schoolLat) would be
    // a stronger discriminator, but sellerTypes is present on both shapes
    // and is simplest to assert verbatim below; the point of this fixture
    // is that it is a DISTINCT object from `nav.filters` (never mutated by
    // the URL), so a call that preserves it end-to-end proves the merge
    // read `committedFilters`, not `nav.filters`.
    const areaLeafFilters: PropertyFilters = { sellerTypes: ['owner'] };

    renderPanel(makeAreaLeafNode(), undefined, {
      areaLeafFilters,
      onAreaLeafFiltersChange,
    });

    await user.click(screen.getByTestId('quick-chip-apartment'));

    expect(onAreaLeafFiltersChange).toHaveBeenCalledTimes(1);
    expect(onAreaLeafFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ sellerTypes: ['owner'], propertyTypes: ['apartment'] }),
    );
  });

  // ── Issue #2344 AC7 — city-fallback regression coverage ──────────────────
  // Defect: `AreaLeafListingsSurface` passed `city: nav.city` verbatim to
  // useDiscoverCityListings. On an anonymous URL that omits `city=` entirely,
  // `nav.city` resolves to '' (useDiscoverUrlState.ts: `urlParams.get('city')
  // ?? ''`), so the hook was called with an empty city and (in production)
  // matched zero areas — rendering the AREA leaf's own listing-empty state
  // even though the map/overlay for the same AREA had real listings. Fix:
  // `city: nav.city || DEFAULT_CITY`. These tests key on the PARITY
  // invariant (non-empty data must render a listing card, never the
  // area-empty-state) rather than a literal count, per AC12.
  describe('AC7 — falsy city URL param falls back to DEFAULT_CITY', () => {
    // Argument-sensitive: pre-fix, the surface is called with city: '' and
    // must observe the EMPTY branch below; post-fix it is called with
    // city: 'bangalore' and observes the non-empty branch. A fixed
    // mockReturnValue could not distinguish these two cases.
    //
    // mockClear() is load-bearing, not hygiene. `mockUseDiscoverCityListings`
    // is a module-scoped vi.hoisted() mock and this file has no beforeEach /
    // vi.clearAllMocks(), so its call history otherwise accumulates across the
    // whole file. Every earlier test renders with a default URL carrying
    // `city=bangalore`, and `toHaveBeenCalledWith` matches ANY recorded call —
    // so without this clear the city-arg assertions below would already be
    // satisfied before these tests ran, i.e. be silent no-ops. Clearing scopes
    // them to the render under test, which is what makes them real proof.
    // Preferred over toHaveBeenLastCalledWith because it removes the leaked
    // history at source rather than working around it, and does not depend on
    // the render under test being the last one the component performs.
    function mockCityAwareListings() {
      mockUseDiscoverCityListings.mockClear();
      mockUseDiscoverCityListings.mockImplementation(({ city }: DiscoverCityListingsParams) => {
        if (!city) {
          return { data: { areas: [{ areaKey: 'IN|KA|Bangalore|Manipal', listings: [] }] }, isLoading: false };
        }
        return {
          data: { areas: [{ areaKey: 'IN|KA|Bangalore|Manipal', listings: [makeListing()] }] },
          isLoading: false,
        };
      });
    }

    it('URL with no city= param (anonymous bug URL) still resolves listings — must NOT render the honest empty state when the map/overlay has data', () => {
      mockUseAuth.mockReturnValue({ user: null, isLoading: false });
      mockCityAwareListings();

      // Deliberately omits city= — reproduces the reported anonymous URL.
      renderPanel(makeAreaLeafNode(), '/discover?journey=area-first&intent=buy');

      expect(mockUseDiscoverCityListings).toHaveBeenCalledWith(expect.objectContaining({ city: 'bangalore' }));
      expect(screen.getByTestId('property-card-listing-1')).toBeInTheDocument();
      expect(screen.queryByTestId('area-empty-state')).not.toBeInTheDocument();
    });

    it('explicit city=bangalore renders identically to the omitted-city fallback (parity)', () => {
      mockUseAuth.mockReturnValue({ user: null, isLoading: false });
      mockCityAwareListings();

      renderPanel(makeAreaLeafNode(), '/discover?city=bangalore&journey=area-first&intent=buy');

      expect(mockUseDiscoverCityListings).toHaveBeenCalledWith(expect.objectContaining({ city: 'bangalore' }));
      expect(screen.getByTestId('property-card-listing-1')).toBeInTheDocument();
      expect(screen.queryByTestId('area-empty-state')).not.toBeInTheDocument();
    });

    it('a genuinely empty AREA still renders the honest empty state — the fallback must not mask real emptiness', () => {
      mockUseAuth.mockReturnValue({ user: null, isLoading: false });
      // City resolves correctly (explicit param here, sidestepping the
      // defect entirely) but the hook genuinely returns zero listings for
      // this area — proves the fix is scoped to the falsy-city defect, not
      // a blanket empty-state suppression.
      mockUseDiscoverCityListings.mockReturnValue({
        data: { areas: [{ areaKey: 'IN|KA|Bangalore|Manipal', listings: [] }] },
        isLoading: false,
      });

      renderPanel(makeAreaLeafNode(), '/discover?city=bangalore&journey=area-first&intent=buy');

      expect(screen.getByTestId('area-empty-state')).toBeInTheDocument();
      expect(screen.queryByTestId('property-card-listing-1')).not.toBeInTheDocument();
    });
  });
});

// ─── Issue #2353 — AREA-leaf duplicate-fetch dedup + areaKey identity guard ──
//
// AreaLeafListingsSurface can now be handed the map's ALREADY-FETCHED
// `areaListings` (via `mapAreaListings`/`mapAreaListingsAreaKey`) instead of
// issuing its own `useDiscoverCityListings` call. These tests pin BOTH
// halves of that contract: (1) the dedup itself — supplying matching
// map-sourced data disables this surface's own query — and (2) the identity
// guard a code-review pass added — mismatched (or absent) map data falls
// back to the surface's own query rather than ever rendering one area's
// listings under a different area's heading (`resolveEffectiveSelectedArea`
// can diverge from the node-resolved leaf when a URL carries both a legacy
// `areaKey=` and a canonical `node=`).
describe('DiscoverAreasJourneyPanel — AREA-leaf duplicate-fetch dedup (Issue #2353)', () => {
  it('mapAreaListings with a MATCHING areaKey disables the surface\'s own useDiscoverCityListings query (areaKeys: [])', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseDiscoverCityListings.mockClear();
    // The surface's own (should-be-disabled) query is stubbed to return NO
    // data — if the dedup were broken and this query's result leaked
    // through, the assertion below on the map-supplied listing would fail.
    mockUseDiscoverCityListings.mockReturnValue({ data: undefined, isLoading: false });

    renderPanel(makeAreaLeafNode(), undefined, {
      mapAreaListings: [makeListing()],
      mapAreaListingsAreaKey: 'IN|KA|Bangalore|Manipal',
      mapAreaListingsLoading: false,
      mapAreaListingsError: false,
    });

    // Disabled: useDiscoverCityListings' own `enabled: areaKeys.length > 0`
    // gate trips on an empty array — no second, identically-scoped fetch.
    expect(mockUseDiscoverCityListings).toHaveBeenCalledWith(
      expect.objectContaining({ areaKeys: [] }),
    );
    // Renders the map-supplied listing, proving it is the data source used.
    expect(screen.getByTestId('property-card-listing-1')).toBeInTheDocument();
  });

  it('mapAreaListings with a MISMATCHED areaKey falls back to the surface\'s own query — never trusts data fetched for a different area', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseDiscoverCityListings.mockClear();
    mockUseDiscoverCityListings.mockReturnValue({
      data: {
        areas: [{ areaKey: 'IN|KA|Bangalore|Manipal', listings: [makeListing()] }],
      },
      isLoading: false,
    });

    renderPanel(makeAreaLeafNode(), undefined, {
      // Simulates the #2184/#2353-code-review divergence: mapAreaListings is
      // present, but keyed to a DIFFERENT area than the leaf this surface
      // resolved (`makeAreaLeafNode()`'s areaKey is 'IN|KA|Bangalore|Manipal').
      mapAreaListings: [makeListing({ id: 'listing-from-other-area' })],
      mapAreaListingsAreaKey: 'IN|KA|Bangalore|SomeOtherArea',
    });

    // Own query re-enabled — exactly current pre-#2353 behaviour — despite
    // mapAreaListings being supplied.
    expect(mockUseDiscoverCityListings).toHaveBeenCalledWith(
      expect.objectContaining({ areaKeys: ['IN|KA|Bangalore|Manipal'] }),
    );
    // Renders the surface's OWN query result, never the mismatched
    // map-supplied listing — the failure mode is "one extra fetch", not
    // "wrong data".
    expect(screen.getByTestId('property-card-listing-1')).toBeInTheDocument();
    expect(
      screen.queryByTestId('property-card-listing-from-other-area'),
    ).not.toBeInTheDocument();
  });

  it('omitting mapAreaListings entirely uses the surface\'s own query — the pre-#2353 / standalone-render fallback path', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseDiscoverCityListings.mockClear();
    mockUseDiscoverCityListings.mockReturnValue({
      data: {
        areas: [{ areaKey: 'IN|KA|Bangalore|Manipal', listings: [makeListing()] }],
      },
      isLoading: false,
    });

    renderPanel(makeAreaLeafNode());

    expect(mockUseDiscoverCityListings).toHaveBeenCalledWith(
      expect.objectContaining({ areaKeys: ['IN|KA|Bangalore|Manipal'] }),
    );
    expect(screen.getByTestId('property-card-listing-1')).toBeInTheDocument();
  });

  it('Retry on a map-sourced error calls mapAreaListingsRefetch, not a no-op (code-review fix — was a dead button)', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseDiscoverCityListings.mockClear();
    mockUseDiscoverCityListings.mockReturnValue({ data: undefined, isLoading: false });
    const mapAreaListingsRefetch = vi.fn();
    const user = userEvent.setup();

    renderPanel(makeAreaLeafNode(), undefined, {
      mapAreaListings: [],
      mapAreaListingsAreaKey: 'IN|KA|Bangalore|Manipal',
      mapAreaListingsError: true,
      mapAreaListingsRefetch,
    });

    const retryButton = screen.getByRole('button', { name: /retry/i });
    await user.click(retryButton);

    expect(mapAreaListingsRefetch).toHaveBeenCalledTimes(1);
  });

  it('mapAreaListingsFetching surfaces AreaSelectedPanel\'s keepPreviousData refresh-in-flight indicator, not settled stale cards (code-review fix)', () => {
    // Issue #2353 (code-review fix) — `useDiscoverCityListings` uses
    // `placeholderData: keepPreviousData`, so on a filter/search rekey it
    // deliberately keeps rendering the PREVIOUS response while a new fetch
    // is in flight: `isFetching: true` while `isLoading` stays `false`. This
    // simulates exactly that state via the map-sourced props (mirroring
    // `useDiscoverMapData.isFetchingAreaListings`) and asserts the panel
    // surfaces AreaSelectedPanel's own established "refresh in flight"
    // convention (a dimmed, non-interactive overlay on the listings body —
    // see AreaSelectedPanel.tsx's `isFetching && !isInitialLoading` class)
    // rather than presenting the stale card as fully settled/current.
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    mockUseDiscoverCityListings.mockClear();
    mockUseDiscoverCityListings.mockReturnValue({ data: undefined, isLoading: false });

    const { container } = renderPanel(makeAreaLeafNode(), undefined, {
      mapAreaListings: [makeListing()],
      mapAreaListingsAreaKey: 'IN|KA|Bangalore|Manipal',
      mapAreaListingsLoading: false,
      mapAreaListingsFetching: true,
    });

    // The stale (previous) card is still shown — keepPreviousData's whole
    // point — never blanked to a loading skeleton.
    expect(screen.getByTestId('property-card-listing-1')).toBeInTheDocument();
    // ...but it is NOT presented as fully settled: the dimmed/non-interactive
    // overlay convention fires. A regression to the hardcoded-`false` bug
    // would leave this query empty (no `.pointer-events-none.opacity-50`
    // element), since AreaSelectedPanel would see `isFetching: false`.
    expect(container.querySelector('.pointer-events-none.opacity-50')).not.toBeNull();
  });
});
