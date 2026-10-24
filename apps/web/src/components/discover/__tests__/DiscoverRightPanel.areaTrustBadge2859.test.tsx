/**
 * #2859 B6 (handoff 285906) AC8(c) — L95 1567-7b: the area-selected right panel (the legacy
 * `areaKey=` area panel) renders each listing's trustBadge as the REAL PropertyCard badge label, for
 * an anonymous AND an authenticated viewer, with a null-badge control card in the same render.
 *
 * Harness: the flatPropsRightPanel test adapter (as DiscoverRightPanel.routing.test.tsx uses it),
 * real AreaSelectedPanel -> ListingsBody -> PropertyCard. Its mocks are replicated here (never
 * imported from that file). `areaListings` is handed in as a prop (the hook half is
 * useDiscoverMapDataController.legacyAreaTrust2859; the page relay between them is RETAIN, R_page).
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, within, cleanup } from '@testing-library/react';
import React from 'react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import { DiscoverRightPanel } from '@/features/discover/right-panel/testing/flatPropsRightPanel';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('@/hooks/useRegionalAreaGroups', () => ({
  useAgriDestinations: () => ({
    destinations: [],
    isLoading: false,
    isError: false,
    isNotYetPromoted: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn((city: string) => ({ data: { city, areas: [] }, isLoading: false, error: null })),
}));

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'udupi',
    areaKey: 'IN|KA|Udupi|Manipal',
    boardFilters: [],
    categoryFilters: [],
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: 'area-first' as const,
    groupId: null,
    filters: {},
  }),
  useDiscoverViewport: () => null,
  useDiscoverShell: () => ({
    mobileView: 'LIST' as const,
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
    canonicalScopeLabel: null,
    setCanonicalScopeLabel: vi.fn(),
  }),
  useDiscoverActions: () => ({
    selectArea: vi.fn(),
    deselectArea: vi.fn(),
    setSchoolParams: vi.fn(),
    setFiltersLive: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setBoardFilters: vi.fn(),
    setCategoryFilters: vi.fn(),
    clearAreaContext: vi.fn(),
    clearSchoolContext: vi.fn(),
    startOver: vi.fn(),
    setJourney: vi.fn(),
    selectGroup: vi.fn(),
    setSchoolJourney: vi.fn(),
    setSearchQuery: vi.fn(),
    reportViewport: vi.fn(),
    setCity: vi.fn(),
    changeCity: vi.fn(),
    setScope: vi.fn(),
  }),
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

const AREA: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.35,
  geo_center_lon: 74.78,
  bbox: null,
  listingCount: 4,
};

const listing = (id: string, title: string, trustBadge: DiscoverCityListingItem['trustBadge']): DiscoverCityListingItem => ({
  id,
  title,
  pricePaise: 500000 * 100,
  propertyType: 'apartment',
  locality: 'Manipal',
  primaryImageUrl: null,
  trustBadge,
});

const LISTINGS: DiscoverCityListingItem[] = [
  listing('b6-1567-v', 'Verified Home B6', 'verified'),
  listing('b6-1567-t', 'Trusted Home B6', 'trusted'),
  listing('b6-1567-l', 'Listed Home B6', 'listed'),
  listing('b6-1567-n', 'Unbadged Home B6', null),
  // 1567-2 absent key (backend omits the field) and 1567-3 an out-of-vocabulary value
  { ...listing('b6-1567-a', 'Absent Badge Home B6', null), trustBadge: undefined },
  listing('b6-1567-u', 'Unknown Badge Home B6', 'gold' as unknown as DiscoverCityListingItem['trustBadge']),
];

function cardFor(title: string): HTMLElement {
  const card = screen.getAllByTestId('listing-card').find((c) => within(c).queryByText(title) != null);
  if (!card) throw new Error(`no listing-card for ${title}`);
  return card;
}

function renderPanel(isAuthenticated: boolean) {
  return renderWithProviders(
    <AreaSetDraftProvider>
      <DiscoverRightPanel
        areas={[]}
        onStartOver={vi.fn()}
        onSelectJourney={vi.fn()}
        panelContent="area-selected"
        selectedArea={AREA}
        areaListings={LISTINGS}
        isLoadingListings={false}
        isAuthenticated={isAuthenticated}
      />
    </AreaSetDraftProvider>,
  );
}

function expectBadges() {
  expect(screen.getAllByTestId('listing-card')).toHaveLength(6);
  expect(within(cardFor('Verified Home B6')).getByTestId('trust-badge')).toHaveTextContent('Verified');
  expect(within(cardFor('Trusted Home B6')).getByTestId('trust-badge')).toHaveTextContent('Trusted');
  expect(within(cardFor('Listed Home B6')).getByTestId('trust-badge')).toHaveTextContent('Listed');
  // negative cards, positive controls above in the SAME render: null, absent and unknown -> no badge
  expect(within(cardFor('Unbadged Home B6')).queryByTestId('trust-badge')).toBeNull();
  expect(within(cardFor('Absent Badge Home B6')).queryByTestId('trust-badge')).toBeNull();
  expect(within(cardFor('Unknown Badge Home B6')).queryByTestId('trust-badge')).toBeNull();
  expect(screen.getAllByTestId('trust-badge')).toHaveLength(3);
}

describe('#2859 B6 AC8(c) area-selected right panel -> REAL PropertyCard trust badge, anon AND authed', () => {
  it('1567-7b / 1567-2 / 1567-3 (L95): the area-selected panel renders Verified / Trusted / Listed badge labels from areaListings for the anonymous AND the authenticated viewer; the null, absent and unknown-value cards in the same render have none', () => {
    renderPanel(false);
    expectBadges();
    cleanup();

    renderPanel(true);
    expectBadges();
  });
});
