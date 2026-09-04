/**
 * Issue #1956 PR-5 — AC5.9 breadcrumb omission-class fix + AC5.10/AC5.10c
 * preview-lift, at the canonical AREA-leaf call site
 * (`DiscoverAreasJourneyPanel`'s `AreaLeafListingsSurface`).
 *
 * Regression coverage for the defect: the canonical AREA leaf rendered an
 * INCOMPLETE breadcrumb ("Home > Bangalore > Basaveshwara Nagar", Region
 * missing) even though `HierarchyBackButton` on the same screen proved the
 * app already has the ancestry data — the call site passed `cityLabel` only,
 * omitting `regionName`/`groupName`/all four `onCrumb*` handlers.
 *
 * Uses a genuine full-depth node (City -> DIRECTION -> CLUSTER -> AREA, R1
 * fixture shape) so BOTH the region AND the group crumb are exercised —
 * fixing the Region crumb alone would have left the Group crumb's identical
 * omission uncaught. Every assertion below is a REAL failing assertion (no
 * `isVisible().catch(() => false)` skip-and-pass guard).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { DiscoverAreasJourneyPanel } from '../DiscoverAreasJourneyPanel';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

// The AC5.10c matching test renders a real listing row (PropertyCard), which
// needs a QueryClientProvider (useSavedListingIds) — every other test in
// this file renders zero/empty listing sets and does not reach PropertyCard.
function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const NOOP_BUILD_HREF = () => null;

const mockUseAuth = vi.fn(() => ({ user: null, isLoading: false }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...(args as [])),
}));

const mockSetSelectedListing = vi.fn();
const mockSetFiltersCommitted = vi.fn();
let mockSelectedListing: string | null = null;
vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'bangalore',
    q: '',
    intent: 'sale' as const,
    get selectedListing() {
      return mockSelectedListing;
    },
    filters: { propertyTypes: [], bedrooms: [], priceMin: undefined, priceMax: undefined },
  }),
  useDiscoverActions: () => ({
    setSelectedListing: mockSetSelectedListing,
    setFiltersCommitted: mockSetFiltersCommitted,
    setSearchQuery: vi.fn(),
    enterSchoolPicking: vi.fn(),
  }),
  // Issue #2017 (owner-directed desktop rework) — AreaLeafListingsSurface
  // now reads isMobileShell/isAreaSetDraftOpen directly off useDiscoverShell
  // to decide whether to swap AreaSelectedPanel for the in-panel AREA_SET
  // draft view. This suite's own subject (breadcrumb/selected-listing-lift
  // behavior at the canonical AREA leaf) is unrelated to that draft flow, so
  // isAreaSetDraftOpen stays false — every existing assertion here should
  // keep exercising AreaSelectedPanel exactly as before.
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
  }),
}));

type CityListingsData = { areas: { areaKey: string; areaName: string; listings: DiscoverCityListingItem[] }[] };
const EMPTY_CITY_LISTINGS_RESPONSE: CityListingsData = {
  areas: [{ areaKey: 'IN|KA|Bengaluru|Manipal', areaName: 'Manipal', listings: [] }],
};
// A mutable box (not vitest's mockReturnValueOnce) so every render of this
// component within a single test — jsdom/React may commit more than one
// pass before effects settle — observes the SAME data, rather than a
// "once" queue being consumed by an intermediate render the test never
// observes directly.
let mockCityListingsData: CityListingsData = EMPTY_CITY_LISTINGS_RESPONSE;
const mockUseDiscoverCityListings = vi.fn(() => ({
  data: mockCityListingsData,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock('@/hooks/useDiscoverCityListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDiscoverCityListings')>();
  return { ...actual, useDiscoverCityListings: (...args: unknown[]) => mockUseDiscoverCityListings(...(args as [])) };
});

/** A genuine full-depth AREA leaf: City -> DIRECTION -> CLUSTER -> AREA. */
function makeFullDepthAreaLeafNode(): NavigationNodeResponse {
  return {
    nodeKey: 'a:manipal',
    nodeType: 'AREA',
    displayLabel: 'Manipal',
    depth: 2,
    regionKey: 'west',
    ancestry: [
      { nodeKey: 'd:w', nodeType: 'DIRECTION', displayLabel: 'West Bangalore', displayOrder: 0 },
      { nodeKey: 'c:w:university-belt', nodeType: 'CLUSTER', displayLabel: 'University Belt', displayOrder: 0 },
    ],
    nextLevelType: 'LISTINGS',
    children: [],
    revisionId: 1,
    bounds: { centreLat: 13.35, centreLon: 74.79, minLat: 13.3, minLon: 74.7, maxLat: 13.4, maxLon: 74.8 },
    descendantAreaKeys: null,
    areaKey: 'IN|KA|Bengaluru|Manipal',
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

describe('DiscoverAreasJourneyPanel — AC5.9 full breadcrumb at the canonical AREA leaf', () => {
  beforeEach(() => {
    mockSetSelectedListing.mockClear();
    mockSetFiltersCommitted.mockClear();
    mockUseDiscoverCityListings.mockClear();
  });

  it('renders the Region AND Group crumbs (not just City) for a full-depth node', () => {
    const selectNode = vi.fn();
    render(
      <MemoryRouter>
        <DiscoverAreasJourneyPanel
          journey={makeJourney({ node: makeFullDepthAreaLeafNode(), selectNode })}
          buildNodeHref={NOOP_BUILD_HREF}
        />
      </MemoryRouter>,
    );
    // Region crumb — the exact defect: this used to be silently absent.
    expect(screen.getByTestId('breadcrumb-region')).toHaveTextContent('West Bangalore');
    // Group crumb — the sibling omission the fix must ALSO close.
    expect(screen.getByTestId('breadcrumb-group')).toHaveTextContent('University Belt');
    // City crumb still present (was the only one wired pre-fix).
    expect(screen.getByTestId('breadcrumb-city')).toBeInTheDocument();
    // Terminal area crumb, non-clickable.
    expect(screen.getByTestId('breadcrumb-area')).toHaveTextContent('Manipal');
  });

  it('clicking the Region crumb calls journey.selectNode with the Region ancestor nodeKey — no second navigation mechanism', async () => {
    const user = userEvent.setup();
    const selectNode = vi.fn();
    render(
      <MemoryRouter>
        <DiscoverAreasJourneyPanel
          journey={makeJourney({ node: makeFullDepthAreaLeafNode(), selectNode })}
          buildNodeHref={NOOP_BUILD_HREF}
        />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('breadcrumb-region'));
    expect(selectNode).toHaveBeenCalledTimes(1);
    expect(selectNode).toHaveBeenCalledWith('d:w');
  });

  it('clicking the Group crumb calls journey.selectNode with the Group ancestor nodeKey', async () => {
    const user = userEvent.setup();
    const selectNode = vi.fn();
    render(
      <MemoryRouter>
        <DiscoverAreasJourneyPanel
          journey={makeJourney({ node: makeFullDepthAreaLeafNode(), selectNode })}
          buildNodeHref={NOOP_BUILD_HREF}
        />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('breadcrumb-group'));
    expect(selectNode).toHaveBeenCalledTimes(1);
    expect(selectNode).toHaveBeenCalledWith('c:w:university-belt');
  });

  it('clicking the Home crumb and the City crumb both call journey.selectNode with the city root key', async () => {
    const user = userEvent.setup();
    const selectNode = vi.fn();
    render(
      <MemoryRouter>
        <DiscoverAreasJourneyPanel
          journey={makeJourney({ node: makeFullDepthAreaLeafNode(), selectNode })}
          buildNodeHref={NOOP_BUILD_HREF}
        />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('breadcrumb-home'));
    expect(selectNode).toHaveBeenNthCalledWith(1, 'root');
    await user.click(screen.getByTestId('breadcrumb-city'));
    expect(selectNode).toHaveBeenNthCalledWith(2, 'root');
    expect(selectNode).toHaveBeenCalledTimes(2);
  });

  it('omits the Group crumb (but keeps Region) for a depth-1 AREA leaf with no Local Destination ancestor', () => {
    const depth1Node: NavigationNodeResponse = {
      ...makeFullDepthAreaLeafNode(),
      depth: 1,
      ancestry: [{ nodeKey: 'd:w', nodeType: 'DIRECTION', displayLabel: 'West Bangalore', displayOrder: 0 }],
    };
    render(
      <MemoryRouter>
        <DiscoverAreasJourneyPanel journey={makeJourney({ node: depth1Node })} buildNodeHref={NOOP_BUILD_HREF} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('breadcrumb-region')).toHaveTextContent('West Bangalore');
    expect(screen.queryByTestId('breadcrumb-group')).not.toBeInTheDocument();
  });
});

describe('DiscoverAreasJourneyPanel — AC5.10/AC5.10c selected-listing preview lift', () => {
  beforeEach(() => {
    mockUseDiscoverCityListings.mockClear();
    mockSelectedListing = null;
    mockCityListingsData = EMPTY_CITY_LISTINGS_RESPONSE;
  });

  it('reports null when no listing is selected', () => {
    const onSelectedListingPreviewChange = vi.fn();
    render(
      <MemoryRouter>
        <DiscoverAreasJourneyPanel
          journey={makeJourney({ node: makeFullDepthAreaLeafNode() })}
          buildNodeHref={NOOP_BUILD_HREF}
          onSelectedListingPreviewChange={onSelectedListingPreviewChange}
        />
      </MemoryRouter>,
    );
    expect(onSelectedListingPreviewChange).toHaveBeenCalledWith(null);
  });

  it('projects the ALREADY-FETCHED DiscoverCityListingItem via toSelectedListingPreview when its id matches nav.selectedListing — anon arm carries priceBand, never pricePaise', () => {
    mockSelectedListing = 'listing-1';
    mockCityListingsData = {
      areas: [
        {
          areaKey: 'IN|KA|Bengaluru|Manipal',
          areaName: 'Manipal',
          listings: [
            {
              id: 'listing-1',
              title: 'Sunrise Apartments, 3BHK',
              priceBand: '₹1-2Cr',
              propertyType: 'apartment',
              bedrooms: 3,
              primaryImageUrl: 'https://example.com/img.jpg',
              trustBadge: 'verified',
            } satisfies DiscoverCityListingItem,
          ],
        },
      ],
    };
    const onSelectedListingPreviewChange = vi.fn();
    renderWithProviders(
      <DiscoverAreasJourneyPanel
        journey={makeJourney({ node: makeFullDepthAreaLeafNode() })}
        buildNodeHref={NOOP_BUILD_HREF}
        onSelectedListingPreviewChange={onSelectedListingPreviewChange}
      />,
    );
    expect(onSelectedListingPreviewChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'anon',
        id: 'listing-1',
        title: 'Sunrise Apartments, 3BHK',
        priceBand: '₹1-2Cr',
        propertyType: 'apartment',
        bedrooms: 3,
        areaLabel: 'Manipal',
        trustBadge: 'verified',
      }),
    );
    // Structural guarantee (AC5.10c) — the anon arm never carries pricePaise.
    const lastCallArg = onSelectedListingPreviewChange.mock.calls.at(-1)?.[0];
    expect(lastCallArg).not.toHaveProperty('pricePaise');
  });

  it('reports null when the selected id is not present in this area\'s own fetched result set', () => {
    mockSelectedListing = 'not-in-this-area';
    const onSelectedListingPreviewChange = vi.fn();
    render(
      <MemoryRouter>
        <DiscoverAreasJourneyPanel
          journey={makeJourney({ node: makeFullDepthAreaLeafNode() })}
          buildNodeHref={NOOP_BUILD_HREF}
          onSelectedListingPreviewChange={onSelectedListingPreviewChange}
        />
      </MemoryRouter>,
    );
    expect(onSelectedListingPreviewChange).toHaveBeenCalledWith(null);
  });
});
