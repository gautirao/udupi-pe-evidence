/**
 * Issue #2450 — the AREA (SQ FT) bound must REACH the AREA-first leaf query.
 *
 * WHY THIS SPEC EXISTS, AND WHY IT IS NOT THE #2531 URL-REACHABILITY SHAPE.
 * `commercialSubtypeReachability2531.test.ts` joins the real URL parser to the real
 * ADAPTER (`buildCityListingsQueryParams`). That adapter already forwards both bounds as
 * of #2555 (`cityListingsQueryParams.ts:90-91`), so a spec on that template would have
 * passed BEFORE this fix and proved nothing about this defect — it would exercise a path
 * that was never broken.
 *
 * This call site is broken precisely because it BYPASSES that adapter: it builds its own
 * params object inline and enumerates the fields it forwards. So the assertion has to be
 * made against the arguments THIS surface hands its own query, which is what the #2531
 * PANEL spec (`DiscoverAreasJourneyPanel.commercialSubtype2531.test.tsx`) does, and this
 * file follows that template rather than the URL one.
 *
 * THE DEFECT. `resolveEffectiveAreaLeafFilters` already projects `areaMinSqft`/
 * `areaMaxSqft` — which is why the chip latches and the bound appears in the page URL —
 * and the params object then dropped them on the way to the wire. Carried, not forwarded:
 * the same shape #2531 found here for `commercialSubtypes`, and the reason that call's own
 * comment warns that widening the hook's params type does nothing for a call site that
 * never passes the field in.
 *
 * Measured before the fix: the chip read `aria-pressed="true"` with `&areaMinSqft=1000` in
 * the URL while the outgoing request carried no bound, and both arms rendered the same 10
 * cards including a 600 sq ft row. The backend returns 1 row for that same query, so the
 * predicate worked and nothing reached it.
 *
 * Every test asserts the query was CALLED before asserting on its arguments (see
 * `cityListingsArgs`), so a future refactor that stops rendering this surface FAILS rather
 * than passing over an empty call list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { FlatPropsAreasJourneyPanel } from '@/features/discover/areas-journey/testing/FlatPropsAreasJourneyPanel';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

// ─── Mocks ────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  // Anonymous: the anon teaser path this issue is about, and it keeps the auth-only
  // /api/discover/listings query disabled so the city-listings call under test is
  // unambiguously the one being asserted on.
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
    // Issue #2729 (R1 fix) — new required shell member (see context/types.ts).
    canonicalScopeLabel: null,
    setCanonicalScopeLabel: vi.fn(),
  }),
}));

type CityListingsArgs = Record<string, unknown>;

/**
 * A NON-EMPTY arm on purpose. An empty result set sends the panel down its
 * zero-result-recovery branch, a different render path than the one a narrowing buyer
 * sees — and an empty arm is the standing way filter assertions go vacuously green here.
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
            propertyType: 'apartment',
            title: 'A flat',
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
 * Asserts the query was reached BEFORE returning its arguments: if a future refactor stops
 * rendering this surface, every test below must FAIL rather than pass over an empty list.
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

describe('#2450 — the AREA-first leaf query forwards the area (sq ft) bound', () => {
  /**
   * The committed path: `areaLeafFilters` is MapDiscovery's own committed filter state,
   * handed down as this surface's `committedFilters`.
   */
  it('forwards a committed lower bound', () => {
    renderPanel(
      <FlatPropsAreasJourneyPanel
        journey={makeJourney()}
        buildNodeHref={() => null}
        areaLeafFilters={{ areaMinSqft: 1000 }}
      />,
    );
    expect(cityListingsArgs().areaMinSqft).toBe(1000);
  });

  /**
   * The URL path: with no committed filters the surface falls back to nav.filters, which is
   * what a shared or bookmarked `?areaMinSqft=1000` link produces — and it is the exact
   * shape the live measurement used (chip pressed, bound in the URL, absent from the
   * request). Both branches of `resolveEffectiveAreaLeafFilters` must reach the wire;
   * testing only one would leave the other free to drop the axis.
   */
  it('forwards a lower bound that arrived via the URL when nothing is committed', () => {
    mockNavFilters = { areaMinSqft: 1000 };
    renderPanel(<FlatPropsAreasJourneyPanel journey={makeJourney()} buildNodeHref={() => null} />);
    expect(cityListingsArgs().areaMinSqft).toBe(1000);
  });

  /**
   * The upper bound is a SEPARATE param on the request and a separate line at the call
   * site, so forwarding one does not imply forwarding the other — exactly the asymmetry
   * that lets a half-fix look complete.
   */
  it('forwards a committed upper bound', () => {
    renderPanel(
      <FlatPropsAreasJourneyPanel
        journey={makeJourney()}
        buildNodeHref={() => null}
        areaLeafFilters={{ areaMaxSqft: 2000 }}
      />,
    );
    expect(cityListingsArgs().areaMaxSqft).toBe(2000);
  });

  it('forwards both ends of a committed range, with min and max distinguishable', () => {
    renderPanel(
      <FlatPropsAreasJourneyPanel
        journey={makeJourney()}
        buildNodeHref={() => null}
        areaLeafFilters={{ areaMinSqft: 800, areaMaxSqft: 1600 }}
      />,
    );
    // Deliberately different values: a min/max transposition is the likeliest defect in two
    // adjacent numeric params and would be invisible to an assertion reusing one number.
    expect(cityListingsArgs().areaMinSqft).toBe(800);
    expect(cityListingsArgs().areaMaxSqft).toBe(1600);
  });

  /**
   * FALSIFIABILITY CONTROL — identical render shape, varying only the bound. Without it, a
   * call site that hard-coded some bound would satisfy every assertion above.
   */
  it('omits the axis entirely when no bound is selected', () => {
    renderPanel(<FlatPropsAreasJourneyPanel journey={makeJourney()} buildNodeHref={() => null} />);
    expect(cityListingsArgs().areaMinSqft).toBeUndefined();
    expect(cityListingsArgs().areaMaxSqft).toBeUndefined();
  });

  /**
   * A zero lower bound is a REAL selection, not an absent one. The URL layer already
   * distinguishes these (`areaBoundsSqft.test.ts` asserts `areaMinSqft=0` is emitted rather
   * than dropped), so a `?.length`-style or falsy-guard forwarding at this call site would
   * silently re-introduce the drop for that value alone.
   */
  it('forwards a zero lower bound rather than treating 0 as absent', () => {
    renderPanel(
      <FlatPropsAreasJourneyPanel
        journey={makeJourney()}
        buildNodeHref={() => null}
        areaLeafFilters={{ areaMinSqft: 0 }}
      />,
    );
    expect(cityListingsArgs().areaMinSqft).toBe(0);
  });

  /**
   * THE MUTUAL-EXCLUSIVITY ARM — and the reason the arms above deliberately mount WITHOUT a
   * map prop rather than letting a fixture default decide which site they exercise.
   *
   * `DiscoverAreasJourneyPanel:987` passes
   * `areaKeys: hasMapAreaListings || isScopeSubstituted ? [] : [areaPoint.areaKey]`, and
   * `useDiscoverCityListings`' enabled gate requires either non-empty areaKeys or a non-null
   * bbox. So site 3 and site 5 are never live at the same time: when the map supplies
   * `mapAreaListings`, THIS query is switched off and `useDiscoverMapData`'s own query
   * (site 5) is the one that actually fetches.
   *
   * That is why fixing site 3 alone could not be trusted. The live capture that reported this
   * defect cannot say which of the two produced the request it recorded, so a green suite
   * covering only this site would have been compatible with the rendered path still dropping
   * the axis. Site 5 is covered by `useDiscoverMapData.areaBounds2450.test.ts`; this arm pins
   * the exclusivity itself, so a change making BOTH live (or neither) fails loudly here.
   */
  it('disables its own query when the map supplies listings — site 5 is live in that state', () => {
    renderPanel(
      <FlatPropsAreasJourneyPanel
        journey={makeJourney()}
        buildNodeHref={() => null}
        areaLeafFilters={{ areaMinSqft: 1000 }}
        mapAreaListings={[]}
        mapAreaListingsAreaKey="IN|KA|Udupi|Manipal"
      />,
    );
    // Empty areaKeys with no bbox is exactly what switches this query off, so whether the
    // bound reaches it is moot in this state — the map's own query must carry it instead.
    expect(cityListingsArgs().areaKeys).toEqual([]);
  });
});
