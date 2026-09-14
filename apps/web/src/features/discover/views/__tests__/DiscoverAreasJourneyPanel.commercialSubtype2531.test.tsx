/**
 * Issue #2531 — the AREA-FIRST leaf query, the SIXTH of six production call sites.
 *
 * WHY THIS SPEC EXISTS. The first pass of #2531 fixed five call sites and looked
 * complete. It was not: `AreaLeafListingsSurface`'s own query
 * (`DiscoverAreasJourneyPanel.tsx`, the `useDiscoverCityListings({...})` call) goes
 * DIRECTLY to the hook rather than through `buildCityListingsQueryParams`, so neither the
 * adapter fix nor the widened params type reached it — a call site that never passes the
 * field in is unaffected by the field becoming expressible.
 *
 * That omission would have been the worst possible shape of "fixed": `NodeListingsSurface`
 * would narrow correctly while the AREA-FIRST journey — the buyer path this issue is
 * actually about — silently returned Shops for an Office selection. A partial fix that
 * looks complete.
 *
 * "N sites, not N−1" is the recurring failure class here: #2553 had four allowlists, and
 * this issue had six call sites while first being reported as four. So these tests assert
 * the REQUEST ARGUMENTS at the real call site, and every one asserts the query was CALLED
 * before asserting anything about its arguments — a spec that silently stops reaching the
 * call site must FAIL, not pass over an empty call list.
 *
 * The surface's own query is the fallback path, live whenever the map does not supply
 * `mapAreaListings` for this exact leaf. It is deliberately left unsupplied here so the
 * query under test actually fires.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { DiscoverAreasJourneyPanel } from '../DiscoverAreasJourneyPanel';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

// ─── Mocks ────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  // Anonymous: this is the anon teaser path the issue is about, and it also keeps the
  // auth-only /api/discover/listings query disabled so the city-listings call under test
  // is unambiguously the one being asserted on.
  useAuth: () => ({ user: null, isLoading: false }),
}));

/** Mutable so each test controls the URL-side filters the panel reads. */
let mockNavFilters: PropertyFilters = {};

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'udupi',
    q: '',
    intent: 'sale' as const,
    selectedListing: null,
    filters: mockNavFilters,
  }),
  useDiscoverActions: () => ({
    setSelectedListing: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setSearchQuery: vi.fn(),
    enterSchoolPicking: vi.fn(),
  }),
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
  }),
}));

type CityListingsArgs = Record<string, unknown>;

/**
 * A NON-EMPTY arm on purpose. An empty result set sends the panel down its
 * zero-result-recovery branch, which is a different render path than the one a real
 * narrowing buyer sees — and an empty arm is the standing way filter assertions go
 * vacuously green in this codebase.
 */
const CITY_LISTINGS_RESULT = {
  data: {
    city: 'udupi',
    limitPerArea: 50,
    areas: [
      {
        areaKey: 'IN|KA|Udupi|Manipal',
        areaName: 'Manipal',
        listings: [
          {
            id: 'l1',
            propertyType: 'commercial',
            commercialSubtype: 'OFFICE',
            title: 'An office',
            locality: 'Manipal',
            lat: 13.35,
            lon: 74.79,
          },
        ],
      },
    ],
  },
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
};

const mockUseDiscoverCityListings = vi.fn();

vi.mock('@/hooks/useDiscoverCityListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDiscoverCityListings')>();
  return {
    ...actual,
    useDiscoverCityListings: (...args: unknown[]) =>
      mockUseDiscoverCityListings(...(args as [CityListingsArgs])),
  };
});

// ─── Fixtures ─────────────────────────────────────────────────

function makeAreaLeafNode(): NavigationNodeResponse {
  return {
    nodeKey: 'a:manipal',
    nodeType: 'AREA',
    displayLabel: 'Manipal',
    depth: 2,
    regionKey: 'west',
    ancestry: [
      { nodeKey: 'd:w', nodeType: 'DIRECTION', displayLabel: 'West Udupi', displayOrder: 0 },
      { nodeKey: 'c:w:belt', nodeType: 'CLUSTER', displayLabel: 'University Belt', displayOrder: 0 },
    ],
    nextLevelType: 'LISTINGS',
    children: [],
    revisionId: 1,
    bounds: { centreLat: 13.35, centreLon: 74.79, minLat: 13.3, minLon: 74.7, maxLat: 13.4, maxLon: 74.8 },
    descendantAreaKeys: null,
    areaKey: 'IN|KA|Udupi|Manipal',
  };
}

function makeJourney(overrides: Partial<UseAreasNavigationJourneyResult> = {}): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node: makeAreaLeafNode(),
    levelKind: 'empty',
    children: [],
    resolutionNotice: null,
    nodeCount: null,
    schoolsNotSimulatedForRevision: false,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
    ...overrides,
  };
}

function renderPanel(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AreaSetDraftProvider>{ui}</AreaSetDraftProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * The arguments the AREA-leaf surface actually passed to its own query.
 *
 * Asserts the query was reached BEFORE returning its arguments: if a future refactor
 * stops rendering this surface, every test below must FAIL rather than pass over an
 * empty call list.
 */
function cityListingsArgs(): CityListingsArgs {
  const calls = mockUseDiscoverCityListings.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as CityListingsArgs;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockNavFilters = {};
  mockUseDiscoverCityListings.mockReturnValue(CITY_LISTINGS_RESULT);
});

describe('#2531 — the AREA-first leaf query forwards the Commercial subtype', () => {
  /**
   * The committed path: `areaLeafFilters` is MapDiscovery's own committed filter state,
   * handed down as this surface's `committedFilters`. #2553 made the subtype survive that
   * boundary; this asserts it survives the remaining hop to the query.
   */
  it('forwards a committed subtype from areaLeafFilters', () => {
    renderPanel(
      <DiscoverAreasJourneyPanel
        journey={makeJourney()}
        buildNodeHref={() => null}
        areaLeafFilters={{ commercialSubtypes: ['OFFICE'] }}
      />,
    );
    expect(cityListingsArgs().commercialSubtypes).toEqual(['OFFICE']);
  });

  /**
   * The URL path: with no committed filters the surface falls back to nav.filters, which
   * is what a shared/bookmarked `?subtype=OFFICE` link produces. Both branches of
   * `resolveEffectiveAreaLeafFilters` must reach the wire — testing only one would leave
   * the other free to drop the axis.
   */
  it('forwards a subtype that arrived via the URL when nothing is committed', () => {
    mockNavFilters = { commercialSubtypes: ['SHOP'] };
    renderPanel(<DiscoverAreasJourneyPanel journey={makeJourney()} buildNodeHref={() => null} />);
    expect(cityListingsArgs().commercialSubtypes).toEqual(['SHOP']);
  });

  it('forwards a multi-subtype selection whole', () => {
    renderPanel(
      <DiscoverAreasJourneyPanel
        journey={makeJourney()}
        buildNodeHref={() => null}
        areaLeafFilters={{ commercialSubtypes: ['SHOP', 'OFFICE'] }}
      />,
    );
    expect(cityListingsArgs().commercialSubtypes).toEqual(['SHOP', 'OFFICE']);
  });

  /**
   * ONE AXIS — the shape that reproduces the buyer report. Shop and Office both imply
   * property_type='commercial', so the property-type token cannot separate them. A fix
   * that only forwarded the subtype alongside a property type would drop it here.
   */
  it('forwards the subtype when NO propertyTypes is selected', () => {
    renderPanel(
      <DiscoverAreasJourneyPanel
        journey={makeJourney()}
        buildNodeHref={() => null}
        areaLeafFilters={{ commercialSubtypes: ['OFFICE'] }}
      />,
    );
    const args = cityListingsArgs();
    expect(args.propertyType).toBeUndefined();
    expect(args.commercialSubtypes).toEqual(['OFFICE']);
  });

  /**
   * Falsifiability control, same render shape, varying only the subtype. Without it a
   * surface that unconditionally emitted every known subtype would pass everything above.
   */
  it('omits the axis entirely when no subtype is selected', () => {
    renderPanel(
      <DiscoverAreasJourneyPanel
        journey={makeJourney()}
        buildNodeHref={() => null}
        areaLeafFilters={{ propertyTypes: ['commercial'] }}
      />,
    );
    const args = cityListingsArgs();
    expect(args.commercialSubtypes).toBeUndefined();
    // The control arm is the SAME query shape — proving the surface really is forwarding
    // filters, so "commercialSubtypes is undefined" is a real absence rather than an
    // un-rendered surface.
    expect(args.propertyType).toEqual(['commercial']);
  });

  it('normalises an empty subtype array to an omitted param, never "match none"', () => {
    renderPanel(
      <DiscoverAreasJourneyPanel
        journey={makeJourney()}
        buildNodeHref={() => null}
        areaLeafFilters={{ commercialSubtypes: [] }}
      />,
    );
    expect(cityListingsArgs().commercialSubtypes).toBeUndefined();
  });
});
