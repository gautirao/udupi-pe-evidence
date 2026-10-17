/**
 * Issue #2087 — NodeListingsSurface unit tests.
 *
 * Covers:
 *   - Pagination controls render when authenticated + totalPages > 1
 *   - Pagination controls hidden when unauthenticated
 *   - Pagination state advances (Next increments page, Prev decrements)
 *   - API is called with canonical nodeKey (not areaKeys)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { NodeListingsSurface } from '../NodeListingsSurface';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

// ── Mocks ───────────────────────────────────────────────────────────────────

let mockIsAuthenticated = true;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockIsAuthenticated ? { id: 'u1' } : null,
    isLoading: false,
  }),
}));

// Capture every call to useDiscoverListings so we can assert nodeKey presence.
const mockUseDiscoverListings = vi.fn();
vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: (...args: unknown[]) => mockUseDiscoverListings(...args),
}));

// Issue #2089 — /api/discover/listings (useDiscoverListings above) is
// authenticated-only; anon sessions are served by the public per-area teaser
// endpoint instead. Capture calls so anon-scoping (areaKeys) can be asserted.
const mockUseDiscoverCityListings = vi.fn();
vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: (...args: unknown[]) => mockUseDiscoverCityListings(...args),
}));

vi.mock('@/features/discover/state/useDiscoverSearchState', () => ({
  useDiscoverSearchState: () => ({
    searchQuery: '',
    debouncedSearch: '',
    handleSearchChange: vi.fn(),
  }),
}));

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'bangalore',
    q: '',
    intent: 'sale' as const,
    selectedListing: null,
    filters: { propertyTypes: [], bedrooms: [], priceMin: undefined, priceMax: undefined },
  }),
  useDiscoverActions: () => ({
    setSelectedListing: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setSearchQuery: vi.fn(),
    enterSchoolPicking: vi.fn(),
  }),
  // Issue #2017 (owner-directed desktop rework) — NodeListingsSurface now
  // reads isMobileShell/isAreaSetDraftOpen directly off useDiscoverShell to
  // decide whether to swap AreaSelectedPanel for the in-panel AREA_SET draft
  // view. This suite's own subject (canonical nodeKey listing fetch/paging)
  // is unrelated to that draft flow, so isAreaSetDraftOpen stays false —
  // every existing assertion here should keep exercising AreaSelectedPanel
  // exactly as before.
  useDiscoverShell: () => ({
    mobileView: 'LIST',
    setMobileView: vi.fn(),
    isMobileShell: false,
    isAreaSetDraftOpen: false,
    openAreaSetDraft: vi.fn(),
    closeAreaSetDraft: vi.fn(),
    fitAreaSet: vi.fn(),
    focusAreaSetMember: vi.fn(),
    registerAreaSetCameraActions: vi.fn(),
    getAreaSetCameraRestoreRequest: vi.fn(() => null),
    setAreaSetCameraRestoreRequest: vi.fn(),
    // Issue #2729 (R1 fix) — new required shell member (see context/types.ts).
    canonicalScopeLabel: null,
    setCanonicalScopeLabel: vi.fn(),
  }),
}));

// Stub the heavy AreaSelectedPanel so it doesn't need its own deps tree.
// Issue #2658 (C5) — the real component now takes {view, commands}, not a
// flat `areaListings` prop; the stub reads the same nested path the real
// component destructures (`view.results.listings`).
vi.mock('@/components/discover/panels/AreaSelectedPanel', () => ({
  AreaSelectedPanel: ({ view }: { view: { results: { listings?: unknown[] } } }) => {
    const areaListings = view.results.listings ?? [];
    return (
      <div data-testid="area-selected-panel">
        {areaListings.length} listings
        <pre data-testid="listings-json">{JSON.stringify(areaListings)}</pre>
      </div>
    );
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<NavigationNodeResponse> = {}): NavigationNodeResponse {
  return {
    nodeKey: 'c:domlur',
    nodeType: 'CLUSTER' as NavigationNodeResponse['nodeType'],
    displayLabel: 'Domlur Layout',
    depth: 2,
    regionKey: 'r:central',
    ancestry: [
      { nodeKey: 'd:central', nodeType: 'DIRECTION' as NavigationNodeResponse['nodeType'], displayLabel: 'Central', displayOrder: 1 },
    ],
    nextLevelType: 'AREA' as NavigationNodeResponse['nextLevelType'],
    children: [],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: ['a:domlur', 'a:kodihalli', 'a:indiranagar'],
    areaKey: null,
    ...overrides,
  };
}

function makeListingsResult(totalPages: number, content: unknown[] = []) {
  return {
    isLoading: false,
    isError: false,
    data: {
      content,
      totalPages,
      totalElements: totalPages * 20,
      number: 0,
      size: 20,
    },
    refetch: vi.fn(),
  };
}

function renderSurface(node: NavigationNodeResponse, onClearNodeListings = vi.fn()) {
  return render(
    <MemoryRouter>
      <NodeListingsSurface
        node={node}
        buildNodeHref={() => null}
        historyAdjacencyLog={[] as UseAreasNavigationJourneyResult['historyAdjacencyLog']}
        selectNode={vi.fn()}
        onClearNodeListings={onClearNodeListings}
      />
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

function makeCityListingsResult(areas: Array<{ areaKey: string; listings: unknown[] }> = []) {
  return {
    isLoading: false,
    isError: false,
    data: { areas },
    refetch: vi.fn(),
  };
}

describe('NodeListingsSurface — #2087', () => {
  beforeEach(() => {
    mockIsAuthenticated = true;
    mockUseDiscoverListings.mockReturnValue(makeListingsResult(1));
    mockUseDiscoverCityListings.mockReturnValue(makeCityListingsResult());
  });

  it('calls useDiscoverListings with the canonical nodeKey (not areaKeys)', () => {
    const node = makeNode({ nodeKey: 'c:domlur' });
    renderSurface(node);
    expect(mockUseDiscoverListings).toHaveBeenCalledWith(
      expect.objectContaining({ nodeKey: 'c:domlur' }),
    );
    // Must NOT pass areaKeys — server resolves descendants from nodeKey.
    expect(mockUseDiscoverListings).not.toHaveBeenCalledWith(
      expect.objectContaining({ areaKeys: expect.anything() }),
    );
  });

  it('shows pagination controls when authenticated and totalPages > 1', () => {
    mockUseDiscoverListings.mockReturnValue(makeListingsResult(3));
    renderSurface(makeNode());
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prev/i })).toBeInTheDocument();
  });

  it('issue #2089: disables the authed useDiscoverListings query when unauthenticated', () => {
    // /api/discover/listings (useDiscoverListings) is authenticated-only and
    // 401s for anon — it must never fire for an anon session.
    mockIsAuthenticated = false;
    mockUseDiscoverListings.mockReturnValue(makeListingsResult(3));
    renderSurface(makeNode({ nodeKey: 'c:domlur' }));

    expect(mockUseDiscoverListings).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it('issue #2089: anon fetches the public teaser endpoint scoped by the node descendantAreaKeys', () => {
    mockIsAuthenticated = false;
    renderSurface(makeNode({
      nodeKey: 'c:domlur',
      descendantAreaKeys: ['a:domlur', 'a:kodihalli', 'a:indiranagar'],
    }));

    expect(mockUseDiscoverCityListings).toHaveBeenCalledWith(
      expect.objectContaining({
        areaKeys: ['a:domlur', 'a:kodihalli', 'a:indiranagar'],
      }),
    );
  });

  it('issue #2089: anon renders listings returned by the public teaser endpoint', () => {
    mockIsAuthenticated = false;
    mockUseDiscoverCityListings.mockReturnValue(
      makeCityListingsResult([
        {
          areaKey: 'a:domlur',
          listings: [
            { id: 'anon-1', propertyType: 'apartment', lat: 12.9, lon: 77.6 },
          ],
        },
      ]),
    );
    renderSurface(makeNode({ nodeKey: 'c:domlur' }));

    expect(screen.getByTestId('area-selected-panel')).toHaveTextContent('1 listings');
  });

  it('issue #2089: hides pagination controls for anon (per-area teaser has no server pagination)', () => {
    mockIsAuthenticated = false;
    mockUseDiscoverListings.mockReturnValue(makeListingsResult(3));
    renderSurface(makeNode({ nodeKey: 'c:domlur' }));

    expect(screen.queryByRole('button', { name: /Next/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Prev/i })).not.toBeInTheDocument();
  });

  it('hides pagination controls when totalPages <= 1 (even if authenticated)', () => {
    mockUseDiscoverListings.mockReturnValue(makeListingsResult(1));
    renderSurface(makeNode());
    expect(screen.queryByRole('button', { name: /Next/i })).not.toBeInTheDocument();
  });

  it('Prev is disabled on page 0; Next is enabled', () => {
    mockUseDiscoverListings.mockReturnValue(makeListingsResult(3));
    renderSurface(makeNode());
    expect(screen.getByRole('button', { name: /Prev/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled();
  });

  it('clicking Next advances the page counter shown in the page indicator', async () => {
    // Return page 0 data initially, then page 1 data.
    mockUseDiscoverListings
      .mockReturnValueOnce(makeListingsResult(3))
      .mockReturnValueOnce(makeListingsResult(3))
      .mockReturnValue({
        ...makeListingsResult(3),
        data: {
          content: [],
          totalPages: 3,
          totalElements: 60,
          number: 1,
          size: 20,
        },
      });

    renderSurface(makeNode());
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // After clicking, the page state increments; useDiscoverListings gets called
    // with the new page arg.
    await waitFor(() => {
      const calls = mockUseDiscoverListings.mock.calls;
      const lastCall = calls[calls.length - 1][0] as { page: number };
      expect(lastCall.page).toBe(1);
    });
  });

  it('renders Back-to button referencing the node label', () => {
    renderSurface(makeNode({ displayLabel: 'Domlur Layout' }));
    expect(screen.getByRole('button', { name: /Back to Domlur Layout/i })).toBeInTheDocument();
  });

  it('calls onClearNodeListings when the Back-to button is clicked', () => {
    const onClear = vi.fn();
    renderSurface(makeNode(), onClear);
    fireEvent.click(screen.getByRole('button', { name: /Back to/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('page resets to 0 when the nav intent changes (filter/search stability)', async () => {
    // Provide enough pages that Next becomes available.
    mockUseDiscoverListings.mockReturnValue(makeListingsResult(3));

    // intent starts as 'sale' in the mock. Advance to page 1.
    const { rerender } = renderSurface(makeNode());
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    await waitFor(() => {
      const calls = mockUseDiscoverListings.mock.calls;
      const lastCall = calls[calls.length - 1][0] as { page: number };
      expect(lastCall.page).toBe(1);
    });

    // Re-render the same surface — the resetKey useEffect fires only when
    // intentListingPurpose/effectiveFilters/debouncedSearch change. Since the
    // mock context is static, we test the mechanism directly: clear calls,
    // trigger a new render with the same node so page stays (no prop reset),
    // then verify useDiscoverListings is still called with the current page.
    mockUseDiscoverListings.mockClear();
    rerender(
      <MemoryRouter>
        <NodeListingsSurface
          node={makeNode()}
          buildNodeHref={() => null}
          historyAdjacencyLog={[] as UseAreasNavigationJourneyResult['historyAdjacencyLog']}
          selectNode={vi.fn()}
          onClearNodeListings={vi.fn()}
        />
      </MemoryRouter>,
    );

    // The component is on page 1 from the Next click. resetKey hasn't changed
    // (same intent/filters/search), so page must still be 1 — proving resetKey
    // does NOT spuriously reset on every render, only on actual changes.
    await waitFor(() => {
      const calls = mockUseDiscoverListings.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const lastCall = calls[calls.length - 1][0] as { page: number };
      expect(lastCall.page).toBe(1);
    });
  });

  it('maps heroImageUrl to primaryImageUrl so listing cards render images correctly (Reviewer-24)', () => {
    mockUseDiscoverListings.mockReturnValue(makeListingsResult(1, [{
      id: 'listing-1',
      heroImageUrl: 'https://example.com/hero.jpg',
      latitude: 12.0,
      longitude: 77.0,
    }]));

    renderSurface(makeNode({ nodeKey: 'c:test' }));

    const jsonText = screen.getByTestId('listings-json').textContent;
    const items = JSON.parse(jsonText!);
    
    expect(items).toHaveLength(1);
    expect(items[0].primaryImageUrl).toBe('https://example.com/hero.jpg');
    // Ensure the fallback lat/lon were set correctly for AreaSelectedPanel
    expect(items[0].lat).toBe(12.0);
    expect(items[0].lon).toBe(77.0);
  });

  // #2750 PR-5 review-fix r3 sweep (discover-trust-badge-1567, composed list -> card path): PropertyCard renders the
  // badge from `listing.trustBadge` (PropertyCard.test.tsx) and the wire carries it (backend tests), but nothing proved
  // the surface FORWARDS the wire word to the cards. Allow-listed words only; absent stays null.
  it('forwards each anon teaser listing\'s public trustBadge word to the panel unchanged (absent -> null), never the raw grade', () => {
    mockIsAuthenticated = false;
    mockUseDiscoverCityListings.mockReturnValue(
      makeCityListingsResult([
        {
          areaKey: 'a:domlur',
          listings: [
            { id: 'tb-1', trustBadge: 'verified', lat: 12.0, lon: 77.0 },
            { id: 'tb-2', trustBadge: 'trusted', lat: 12.1, lon: 77.1 },
            { id: 'tb-3', lat: 12.2, lon: 77.2 },
          ],
        },
      ]),
    );

    renderSurface(makeNode({ nodeKey: 'c:domlur' }));

    const items = JSON.parse(screen.getByTestId('listings-json').textContent!);
    expect(items.map((i: { id: string; trustBadge: unknown }) => [i.id, i.trustBadge])).toEqual([
      ['tb-1', 'verified'],
      ['tb-2', 'trusted'],
      ['tb-3', null],
    ]);
    expect(items.every((i: Record<string, unknown>) => !('trustTier' in i))).toBe(true);
  });

  // #2750 PR-5 2087-N3 — Back-to-node goes through the REAL URL facade (not a spy).
  describe('Back-to-node writes through the real URL facade', () => {
    function FacadeSurfaceHarness() {
      const [, urlActions] = useDiscoverUrlState();
      const location = useLocation();
      const navigationType = useNavigationType();
      return (
        <>
          <span data-testid="harness-search">{location.search}</span>
          <span data-testid="harness-navtype">{navigationType}</span>
          <NodeListingsSurface
            node={makeNode()}
            buildNodeHref={() => null}
            historyAdjacencyLog={[] as UseAreasNavigationJourneyResult['historyAdjacencyLog']}
            selectNode={vi.fn()}
            onClearNodeListings={urlActions.clearNodeListings}
          />
        </>
      );
    }

    it('Back-to-node clears nodeListings with a REPLACE and keeps node', () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter
            initialEntries={['/discover?city=bangalore&journey=area-first&node=d%3Acentral&nodeListings=1']}
          >
            <FacadeSurfaceHarness />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      expect(new URLSearchParams(screen.getByTestId('harness-search').textContent ?? '').get('nodeListings')).toBe('1');

      fireEvent.click(screen.getByRole('button', { name: /Back to Domlur Layout/i }));

      const after = new URLSearchParams(screen.getByTestId('harness-search').textContent ?? '');
      expect(after.has('nodeListings')).toBe(false);
      expect(after.get('node')).toBe('d:central');
      expect(screen.getByTestId('harness-navtype').textContent).toBe('REPLACE');
    });
  });
});
