/**
 * Issue #2450 — SITE 4 of four: the anon node-listings teaser must forward the AREA (SQ FT)
 * bound.
 *
 * WHY A TEST PER SITE. `useDiscoverCityListings` has six production call sites. Two reach it
 * through `buildCityListingsQueryParams`, which has forwarded both bounds since #2555; the
 * other four build their params inline and enumerate the fields they pass, and all four
 * dropped the axis. A single reachability test covering one site would have passed at
 * #2531's five-of-six state — which is exactly how that defect survived a fix that "looked
 * complete". So each inline site gets its own arm.
 *
 * WHAT MADE THIS SITE PARTICULARLY DECEPTIVE. #2555 already added both bounds to this
 * surface's `effectiveFilters` projection (NodeListingsSurface.tsx:89-90 and :102-103, plus
 * the memo deps at :119-120), with a comment explaining that the projection alone was the
 * fix. It was not: the value ARRIVED in `effectiveFilters` and was then dropped on the way
 * to the query — carried-but-not-forwarded, one layer below the boundary #2555 closed. A
 * reader checking "does the projection carry it?" would have concluded this site was fine.
 *
 * ANONYMOUS ON PURPOSE. `/api/discover/listings` (useDiscoverListings) is authenticated-only;
 * an anon session is served by this public per-area teaser instead. Running authenticated
 * would leave the query under test idle and the assertions vacuous.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NodeListingsSurface } from '../NodeListingsSurface';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false }),
}));

const mockUseDiscoverListings = vi.fn();
vi.mock('@/hooks/useDiscoverListings', () => ({
  useDiscoverListings: (...args: unknown[]) => mockUseDiscoverListings(...args),
}));

type CityListingsArgs = Record<string, unknown>;
const mockUseDiscoverCityListings = vi.fn();
vi.mock('@/hooks/useDiscoverCityListings', () => ({
  useDiscoverCityListings: (...args: unknown[]) =>
    mockUseDiscoverCityListings(...(args as [CityListingsArgs])),
}));

vi.mock('@/features/discover/state/useDiscoverSearchState', () => ({
  useDiscoverSearchState: () => ({
    searchQuery: '',
    debouncedSearch: '',
    handleSearchChange: vi.fn(),
  }),
}));

/** Mutable so each arm controls the URL-side filters this surface reads. */
let mockNavFilters: PropertyFilters = {};

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'bangalore',
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

vi.mock('@/components/discover/panels/AreaSelectedPanel', () => ({
  AreaSelectedPanel: ({ areaListings }: { areaListings: unknown[] }) => (
    <div data-testid="area-selected-panel">{areaListings.length} listings</div>
  ),
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeNode(): NavigationNodeResponse {
  return {
    nodeKey: 'c:domlur',
    nodeType: 'CLUSTER' as NavigationNodeResponse['nodeType'],
    displayLabel: 'Domlur Layout',
    depth: 2,
    regionKey: 'r:central',
    ancestry: [],
    nextLevelType: 'AREA' as NavigationNodeResponse['nextLevelType'],
    children: [],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: ['a:domlur', 'a:kodihalli'],
    areaKey: null,
  };
}

function renderSurface(committedFilters?: PropertyFilters) {
  return render(
    <MemoryRouter>
      <NodeListingsSurface
        node={makeNode()}
        buildNodeHref={() => null}
        historyAdjacencyLog={[] as UseAreasNavigationJourneyResult['historyAdjacencyLog']}
        committedFilters={committedFilters}
        selectNode={vi.fn()}
      />
    </MemoryRouter>,
  );
}

/**
 * The arguments this surface actually passed to its teaser query. Asserts the query was
 * reached BEFORE returning arguments, so a refactor that stops rendering this surface FAILS
 * rather than passing over an empty call list.
 */
function cityListingsArgs(): CityListingsArgs {
  const calls = mockUseDiscoverCityListings.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as CityListingsArgs;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockNavFilters = {};
  mockUseDiscoverListings.mockReturnValue({
    isLoading: false,
    isError: false,
    data: undefined,
    refetch: vi.fn(),
  });
  mockUseDiscoverCityListings.mockReturnValue({
    isLoading: false,
    isError: false,
    data: { areas: [] },
    refetch: vi.fn(),
  });
});

describe('#2450 site 4 — the anon node-listings teaser forwards the area (sq ft) bound', () => {
  it('forwards a committed lower bound', () => {
    renderSurface({ areaMinSqft: 1000 });
    expect(cityListingsArgs().areaMinSqft).toBe(1000);
  });

  /** The cold-load / shared-link branch of the projection, which serves `?areaMinSqft=1200`. */
  it('forwards a lower bound that arrived via the URL when nothing is committed', () => {
    mockNavFilters = { areaMinSqft: 1200 };
    renderSurface();
    expect(cityListingsArgs().areaMinSqft).toBe(1200);
  });

  it('forwards a committed upper bound', () => {
    renderSurface({ areaMaxSqft: 2000 });
    expect(cityListingsArgs().areaMaxSqft).toBe(2000);
  });

  it('forwards both ends of a range, with min and max distinguishable', () => {
    // Different values deliberately: a transposition of two adjacent numeric params would be
    // invisible to an assertion that reused one number.
    renderSurface({ areaMinSqft: 800, areaMaxSqft: 1600 });
    expect(cityListingsArgs().areaMinSqft).toBe(800);
    expect(cityListingsArgs().areaMaxSqft).toBe(1600);
  });

  /** FALSIFIABILITY CONTROL — identical render shape, varying only the bound. */
  it('omits the axis entirely when no bound is selected', () => {
    renderSurface();
    expect(cityListingsArgs().areaMinSqft).toBeUndefined();
    expect(cityListingsArgs().areaMaxSqft).toBeUndefined();
  });

  it('forwards a zero lower bound rather than treating 0 as absent', () => {
    renderSurface({ areaMinSqft: 0 });
    expect(cityListingsArgs().areaMinSqft).toBe(0);
  });
});
