/**
 * Issue #2461 — committed-POLYGON card parity at the CANONICAL area-first
 * surface (`DiscoverAreasJourneyPanel` -> `AreaLeafListingsSurface`).
 *
 * The legacy `DiscoverRightPanel` bridge and this canonical surface each own a
 * copy of the VIEWPORT substitution; both left POLYGON on the AREA-keyed
 * path. This suite pins the canonical copy: under `isPolygonScope` the
 * surface renders `polygonListings` (the resultScope-aware
 * `/api/discover/listings?polygon=` page) and DISABLES its own AREA-keyed
 * `useDiscoverCityListings` query (areaKeys: []), exactly as it does for
 * VIEWPORT. Setup mirrors DiscoverAreasJourneyPanel.areaLeafBreadcrumb.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { DiscoverAreasJourneyPanel } from '../DiscoverAreasJourneyPanel';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const NOOP_BUILD_HREF = () => null;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isLoading: false }),
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
    commitResultScope: vi.fn(),
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
    startDrawSearchArea: vi.fn(),
  }),
}));

type CityListingsData = { areas: { areaKey: string; areaName: string; listings: DiscoverCityListingItem[] }[] };
const AREA_KEYED: DiscoverCityListingItem[] = [
  { id: 'area-1', pricePaise: 4_000_000_00, propertyType: 'apartment', locality: 'RR Nagar', primaryImageUrl: null },
  { id: 'area-2', pricePaise: 4_500_000_00, propertyType: 'apartment', locality: 'RR Nagar', primaryImageUrl: null },
];
const AREA_KEYED_RESPONSE: CityListingsData = {
  areas: [{ areaKey: 'IN|KA|Bengaluru|RR Nagar', areaName: 'RR Nagar', listings: AREA_KEYED }],
};
const mockUseDiscoverCityListings = vi.fn(() => ({
  data: AREA_KEYED_RESPONSE,
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));
vi.mock('@/hooks/useDiscoverCityListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDiscoverCityListings')>();
  return { ...actual, useDiscoverCityListings: (...args: unknown[]) => mockUseDiscoverCityListings(...(args as [])) };
});

function makeAreaLeafNode(): NavigationNodeResponse {
  return {
    nodeKey: 'a:rr-nagar',
    nodeType: 'AREA',
    displayLabel: 'RR Nagar',
    depth: 2,
    regionKey: 'west',
    ancestry: [
      { nodeKey: 'd:w', nodeType: 'DIRECTION', displayLabel: 'West Bangalore', displayOrder: 0 },
      { nodeKey: 'c:w:rr-belt', nodeType: 'CLUSTER', displayLabel: 'RR Belt', displayOrder: 0 },
    ],
    nextLevelType: 'LISTINGS',
    children: [],
    revisionId: 1,
    bounds: { centreLat: 12.92, centreLon: 77.52, minLat: 12.9, minLon: 77.5, maxLat: 12.95, maxLon: 77.55 },
    descendantAreaKeys: null,
    areaKey: 'IN|KA|Bengaluru|RR Nagar',
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
    resolutionNotice: null,
    nodeCount: null,
    schoolsNotSimulatedForRevision: false,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
    ...overrides,
  };
}

const POLYGON_SCOPED: DiscoverCityListingItem[] = [
  { id: 'poly-1', pricePaise: 5_000_000_00, propertyType: 'apartment', locality: 'Poly Locality 1', primaryImageUrl: null },
  { id: 'poly-2', pricePaise: 5_100_000_00, propertyType: 'villa', locality: 'Poly Locality 2', primaryImageUrl: null },
  { id: 'poly-3', pricePaise: 5_200_000_00, propertyType: 'land', locality: 'Poly Locality 3', primaryImageUrl: null },
  { id: 'poly-4', pricePaise: 5_300_000_00, propertyType: 'apartment', locality: 'Poly Locality 4', primaryImageUrl: null },
];

function lastCityListingsArgs(): { areaKeys: string[] } {
  const call = mockUseDiscoverCityListings.mock.calls.at(-1);
  if (!call) throw new Error('useDiscoverCityListings was never called');
  return (call as unknown as [{ areaKeys: string[] }])[0];
}

describe('DiscoverAreasJourneyPanel — Issue #2461 committed POLYGON card parity (canonical surface)', () => {
  beforeEach(() => {
    mockUseDiscoverCityListings.mockClear();
  });

  it('renders polygonListings (4) instead of the AREA-keyed leaf list (2), and disables the AREA-keyed query', () => {
    renderWithProviders(
      <DiscoverAreasJourneyPanel
        journey={makeJourney({ node: makeAreaLeafNode() })}
        buildNodeHref={NOOP_BUILD_HREF}
        isPolygonScope
        polygonListings={POLYGON_SCOPED}
        polygonListingsLoading={false}
      />,
    );
    expect(screen.getAllByTestId('listing-card')).toHaveLength(4);
    expect(screen.getByTestId('area-header-count')).toHaveTextContent('4');
    for (const l of POLYGON_SCOPED) {
      expect(screen.getByText(l.locality as string)).toBeInTheDocument();
    }
    // The surface's own AREA-keyed fetch is disabled (empty areaKeys) under a
    // polygon scope — same as the existing VIEWPORT behaviour.
    expect(lastCityListingsArgs().areaKeys).toEqual([]);
  });

  it('a failed POLYGON request renders the request-failure state and Retry re-issues the polygon query', async () => {
    const refetchPolygonListings = vi.fn();
    renderWithProviders(
      <DiscoverAreasJourneyPanel
        journey={makeJourney({ node: makeAreaLeafNode() })}
        buildNodeHref={NOOP_BUILD_HREF}
        isPolygonScope
        polygonListings={[]}
        polygonListingsLoading={false}
        isErrorPolygonListings
        refetchPolygonListings={refetchPolygonListings}
      />,
    );
    // The canonical surface owns its own request-failure block (no testid);
    // the copy + Retry button are its stable contract.
    expect(screen.getByText(/couldn't load properties/i)).toBeInTheDocument();
    expect(screen.queryByTestId('area-zero-result-recovery')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('listing-card')).toHaveLength(0);
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(refetchPolygonListings).toHaveBeenCalledTimes(1);
  });

  it('control: without a committed POLYGON the AREA-keyed leaf list renders and its query stays keyed to the leaf', () => {
    renderWithProviders(
      <DiscoverAreasJourneyPanel
        journey={makeJourney({ node: makeAreaLeafNode() })}
        buildNodeHref={NOOP_BUILD_HREF}
        polygonListings={POLYGON_SCOPED}
      />,
    );
    expect(screen.getAllByTestId('listing-card')).toHaveLength(2);
    expect(screen.getByTestId('area-header-count')).toHaveTextContent('2');
    expect(lastCityListingsArgs().areaKeys).toEqual(['IN|KA|Bengaluru|RR Nagar']);
  });
});
