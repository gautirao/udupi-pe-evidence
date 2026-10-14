/**
 * DiscoverRightPanel routing tests for agri-group-peek (Issue #1430)
 *
 * Covers:
 * - panelContent='agri-group-peek' with valid item → renders AgriGroupListingPeek
 * - panelContent='agri-group-peek' with null item → renders null (safe fallback)
 * - panelContent='agri-group-selected' (no listing) → still renders AgriGroupSelectedPanel
 * - panelContent='agri-detail' (agri-selected context) → still renders AgriListingPanel (unchanged)
 * - onSelectAgriGroupListing wired to agri-group-selected: clicking a listing row calls it
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { formatPrice } from '@/lib/formatters';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverRightPanel } from '@/features/discover/right-panel/testing/flatPropsRightPanel';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockUseAgriListingDetail = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAgriListingDetail', () => ({
  useAgriListingDetail: mockUseAgriListingDetail,
}));

// Issue #2151 PR C (C-F4) — AgriGroupSelectedPanel now fetches server-supplied destination
// buckets via useAgriDestinations directly. Mocked here (rather than left to hit the real
// endpoint) both to keep this a hermetic routing test and to avoid the real
// useRegionalAreaGroups.ts module's transitive '@/lib/api' → Supabase client import, which
// requires env vars this test environment doesn't configure.
const mockUseAgriDestinations = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useAgriDestinations: mockUseAgriDestinations,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
}));

// Prevent supabase crash from transitive imports
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: { city: 'udupi', areas: [] },
    isLoading: false,
    error: null,
  })),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: [], isLoading: false, error: null })),
}));

vi.mock('@/hooks/usePopularSchools', () => ({
  usePopularSchools: vi.fn(() => ({ data: [], isLoading: false, error: null })),
}));

vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: vi.fn(() => ({
    data: { pages: [] },
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeAgriItem = (id: string): AgriMapListingItem => ({
  id,
  areaKey: 'IN|KA|Udupi|Manipal',
  latitude: 13.35,
  longitude: 74.79,
  propertyType: 'agricultural_land',
  locality: 'Manipal Village',
  landArea: 2.5,
  landAreaUnit: 'acre',
  computedAreaAcres: 2.5,
  pricePaise: 3000000 * 100,
});

const baseProps = {
  areas: [],
  onStartOver: vi.fn(),
  onSelectJourney: vi.fn(),
};

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const renderPanel = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiscoverRightPanel — agri-group-peek routing (Issue #1430)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    // Default: detail hook is loading
    mockUseAgriListingDetail.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    // Default: one server-supplied destination bucket so the Level-2 towns list has something
    // to render (mirrors the shape GET /api/discover/agri-destinations returns).
    mockUseAgriDestinations.mockReturnValue({
      destinations: [
        {
          areaKey: 'IN|KA|Udupi|Manipal',
          displayName: 'Manipal Village',
          distanceKm: 10,
          bearingDeg: 0,
          direction: 'N',
          parcelCount: 2,
        },
      ],
      isLoading: false,
      isError: false,
      isNotYetPromoted: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('panelContent=agri-group-peek with valid item → renders AgriGroupListingPeek', () => {
    const item = makeAgriItem('listing-1');
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-peek"
        selectedGroupListingItem={item}
        onCloseGroupPeek={vi.fn()}
        onViewGroupListingDetails={vi.fn()}
      />,
    );
    expect(screen.getByTestId('agri-listing-peek')).toBeInTheDocument();
  });

  it('panelContent=agri-group-peek with null item → renders null (safe fallback)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-peek"
        selectedGroupListingItem={null}
        onCloseGroupPeek={vi.fn()}
        onViewGroupListingDetails={vi.fn()}
      />,
    );
    // The right panel container renders but the peek itself is absent
    expect(screen.queryByTestId('agri-listing-peek')).not.toBeInTheDocument();
  });

  it('panelContent=agri-group-selected (no listing) → still renders AgriGroupSelectedPanel', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-selected"
        agriGroupListings={[makeAgriItem('l1'), makeAgriItem('l2')]}
        agriGroupLabel="North · 10–25 km"
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
        onClearRegionalGroup={vi.fn()}
      />,
    );
    expect(screen.getByTestId('agri-group-selected-panel')).toBeInTheDocument();
    // Peek must NOT be rendered
    expect(screen.queryByTestId('agri-listing-peek')).not.toBeInTheDocument();
  });

  it('panelContent=agri-detail → still renders AgriListingPanel (unchanged)', () => {
    // Cast via unknown: PropertyListing requires ~35 fields; only the subset consumed by
    // AgriListingPanel (id, locality, latitude, longitude) matters for this routing test.
    const marker = {
      id: 'marker-1',
      title: 'Test agri plot',
      price: 5000000,
      property_type: 'land',
      locality: 'Manipal',
      images: [],
      latitude: 13.35,
      longitude: 74.79,
    } as unknown as PropertyListingWithImages;
    // Stub detail hook for the AgriListingPanel
    mockUseAgriListingDetail.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-detail"
        selectedMarkerListing={marker}
        onClearAgriSelection={vi.fn()}
      />,
    );
    expect(screen.getByTestId('agri-detail-loading')).toBeInTheDocument();
    // Peek must NOT be rendered
    expect(screen.queryByTestId('agri-listing-peek')).not.toBeInTheDocument();
  });

  it('agri-group-selected: locality button visible and no inline listing rows (Issue #1480 Level-2 towns-only)', async () => {
    // Issue #1480 — Level 2 shows towns only; inline listing rows removed.
    // Clicking a locality button drills into Level 3 (AgriGroupLocalityPanel).
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-selected"
        agriGroupListings={[makeAgriItem('listing-click-target')]}
        agriGroupLabel="North · 10–25 km"
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
        onClearRegionalGroup={vi.fn()}
      />,
    );

    // Level 2: locality button present, no listing rows
    expect(screen.getByTestId('agri-group-locality-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('agri-group-listing-row')).not.toBeInTheDocument();
    // navigate must NOT have been called (user hasn't clicked anything)
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // Issue #2151 PR C (gap closure) — regression coverage for the shopper-visible defect where the
  // Agri locality panel rendered the raw canonical areaKey (e.g. 'IN|KA|Udupi|Manipal') instead of
  // a human-readable name. `selectedLocality` is now areas.area_key (C-F1); the panel must resolve
  // it against the server-supplied destination buckets (mocked above via mockUseAgriDestinations).
  it('panelContent=agri-group-locality resolves selectedLocality areaKey to its bucket displayName, never the raw pipe-delimited key', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-locality"
        selectedLocality="IN|KA|Udupi|Manipal"
        agriGroupListings={[makeAgriItem('listing-1')]}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
        onRetryAgriGroupListings={vi.fn()}
        onClearLocality={vi.fn()}
      />,
    );

    const name = screen.getByTestId('agri-locality-name');
    expect(name).toHaveTextContent('Manipal Village');
    expect(name).not.toHaveTextContent('IN|KA|Udupi|Manipal');
    expect(screen.queryByText('IN|KA|Udupi|Manipal')).not.toBeInTheDocument();
  });

  it('panelContent=agri-group-locality falls back to a generic placeholder (never the raw areaKey) when no matching destination bucket is loaded', () => {
    mockUseAgriDestinations.mockReturnValue({
      destinations: [],
      isLoading: true,
      isError: false,
      isNotYetPromoted: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-locality"
        selectedLocality="IN|KA|Udupi|Manipal"
        agriGroupListings={[]}
        isLoadingAgriGroupListings
        isAgriGroupListingsError={false}
        onRetryAgriGroupListings={vi.fn()}
        onClearLocality={vi.fn()}
      />,
    );

    const name = screen.getByTestId('agri-locality-name');
    expect(name).not.toHaveTextContent('IN|KA|Udupi|Manipal');
    expect(screen.queryByText('IN|KA|Udupi|Manipal')).not.toBeInTheDocument();
  });

  // Issue #2151 PR C (code-reviewer finding, MEDIUM) — useAgriDestinations must not fire a real
  // GET /api/discover/agri-destinations on every Discover render. Issue #2657 C4 — the hook moved
  // (verbatim gate/cache-key) into AgriJourneyPanel, which mounts ONLY for the 6 agri-first
  // panelContent values, so for a genuinely non-agri state (e.g. 'area-selection') the hook is not
  // called AT ALL now — a strictly stronger form of "no fetch" than the pre-C4 empty-city gate.
  it('gates the destinations fetch: not called at all when panelContent is a non-agri state', () => {
    mockUseAgriDestinations.mockClear();
    renderPanel(<DiscoverRightPanel {...baseProps} city="udupi" panelContent="area-selection" />);

    expect(mockUseAgriDestinations).not.toHaveBeenCalled();
  });

  // ── G1-N8 (#2750 PR-3 B1) — R4 SECURITY: price visibility threading ──────────────────────────
  // The REAL AgriJourneyPanel (via the flat DiscoverRightPanel adapter) renders the REAL
  // AgriGroupLocalityPanel — nothing between them is mocked — so the `isAuthenticated`
  // threaded at AgriJourneyPanel.tsx (`isAuthenticated={context.isAuthenticated}`) is what
  // decides the card's price branch. The fixture carries a NON-NULL pricePaise, so the anon arm
  // cannot false-pass on a missing value. Retires discover-agri-price-gate-1551 AC-ANON/AC-AUTHED
  // (the "isAuthenticated actually reaches the card" half — the original #1551 bug).
  describe('G1-N8 isAuthenticated threading AgriJourneyPanel -> AgriGroupLocalityPanel (R4)', () => {
    const pricedItem = makeAgriItem('priced-1'); // pricePaise = 3000000 * 100 (non-null)

    function renderLocality(isAuthenticated: boolean) {
      return renderPanel(
        <DiscoverRightPanel
          {...baseProps}
          city="udupi"
          panelContent="agri-group-locality"
          selectedLocality="IN|KA|Udupi|Manipal"
          isAuthenticated={isAuthenticated}
          agriGroupListings={[pricedItem]}
          isLoadingAgriGroupListings={false}
          isAgriGroupListingsError={false}
          onRetryAgriGroupListings={vi.fn()}
          onClearLocality={vi.fn()}
        />,
      );
    }

    it('G1-N8 ANON: the card shows the sign-in affordance and NO price (no rupee glyph, no formatted value) although pricePaise is non-null', () => {
      renderLocality(false);
      const list = screen.getByTestId('agri-locality-listings-list');
      expect(within(list).getAllByTestId('agri-locality-listing-row')).toHaveLength(1);
      expect(within(list).getByTestId('agri-locality-price-signin')).toHaveTextContent('Sign in to view price');
      expect(list.textContent).not.toMatch(/₹/);
      expect(list.textContent).not.toContain(formatPrice(3000000));
    });

    it('G1-N8 AUTHED (control, identical fixture): the card shows the exact formatted price and NO sign-in affordance', () => {
      renderLocality(true);
      const list = screen.getByTestId('agri-locality-listings-list');
      expect(within(list).getAllByTestId('agri-locality-listing-row')).toHaveLength(1);
      expect(within(list).queryByTestId('agri-locality-price-signin')).not.toBeInTheDocument();
      expect(within(list).getByText(formatPrice(3000000), { exact: true })).toBeInTheDocument();
    });

    // G1-N8 (1468 AC3) — the Level-3 list handed to the locality panel is filtered to the
    // selected destination key (AgriJourneyPanel.tsx localityListings filter).
    it('G1-N8 Level-3 rows are filtered to the selected destKey: a mixed-areaKey list renders only the matching parcel', () => {
      const other = { ...makeAgriItem('other-area-1'), areaKey: 'IN|KA|Udupi|Shirva' };
      renderPanel(
        <DiscoverRightPanel
          {...baseProps}
          city="udupi"
          panelContent="agri-group-locality"
          selectedLocality="IN|KA|Udupi|Manipal"
          isAuthenticated
          agriGroupListings={[pricedItem, other]}
          isLoadingAgriGroupListings={false}
          isAgriGroupListingsError={false}
          onRetryAgriGroupListings={vi.fn()}
          onClearLocality={vi.fn()}
        />,
      );
      const rows = screen.getAllByTestId('agri-locality-listing-row');
      expect(rows).toHaveLength(1);
      expect(screen.getByTestId('agri-locality-count')).toHaveTextContent('1');
    });

    // G1-N8 (1375 AC8 / 1412 AC4+AC5) — the polygon-selected agri-detail peek's "View full details"
    // CTA routes to the listing's own detail page (AgriJourneyPanel `onNavigate`).
    it("G1-N8 agri-detail: the 'View full details' CTA navigates to /listing/<selected marker id>", () => {
      mockUseAgriListingDetail.mockReturnValue({
        data: {
          id: 'marker-xyz',
          status: 'LIVE',
          propertyType: 'agricultural_land',
          title: 'Polygon parcel',
          locality: 'Shirva',
          price: 5000000,
          pricePaise: 500000000,
          landArea: 2.5,
          landAreaUnit: 'acres',
          latitude: 13.2,
          longitude: 74.8,
          images: [],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      const marker = { id: 'marker-xyz', latitude: 13.2, longitude: 74.8 } as unknown as PropertyListingWithImages;
      renderPanel(
        <DiscoverRightPanel
          {...baseProps}
          panelContent="agri-detail"
          selectedMarkerListing={marker}
          onClearAgriSelection={vi.fn()}
        />,
      );
      expect(mockNavigate).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('agri-view-full-details-cta'));
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/listing/marker-xyz');
    });
  });

  it('gates the destinations fetch: passes the real city when panelContent is agri-group-locality', () => {
    mockUseAgriDestinations.mockClear();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        city="udupi"
        panelContent="agri-group-locality"
        selectedLocality="IN|KA|Udupi|Manipal"
        agriGroupListings={[]}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
        onRetryAgriGroupListings={vi.fn()}
        onClearLocality={vi.fn()}
      />,
    );

    expect(mockUseAgriDestinations).toHaveBeenCalledTimes(1);
    const [cityArg] = mockUseAgriDestinations.mock.calls[0];
    expect(cityArg).toBe('udupi');
  });
});
