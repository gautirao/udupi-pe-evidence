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
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
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
});
