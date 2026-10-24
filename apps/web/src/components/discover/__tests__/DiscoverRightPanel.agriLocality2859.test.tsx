/**
 * #2859 B6 (handoff 285906) AC6(a) — e2e/discover-telemetry-consent-1531.spec.ts row 1 (csv92), render half.
 *
 * The spec deep link `/discover?city=udupi&journey=agri-first&region=S&maxKm=25&locality=Brahmavar`
 * carries FREE-TEXT `locality=`, which the URL domain drops (features/discover/state/url/agricultural.ts:56,
 * :126-137, :262-273), so that URL derives `agri-group-selected`, not `agri-group-locality`
 * (see hooks/__tests__/useDiscoverUrlState.agriLocality2859.test.ts). What it really renders is the
 * PanelHeader `<h1>Agricultural land</h1>` of the agri-group-selected branch (AgriJourneyPanel.tsx:192).
 * The `agri-group-locality` panel is reachable only with an area_key-shaped locality / destKey; its
 * breadcrumb (AgriGroupLocalityPanel.tsx:423-435) is asserted WITHIN agri-group-locality-panel because the
 * PanelHeader (AgriJourneyPanel.tsx:161) is a second DOM source of the same words.
 *
 * Real: flatPropsRightPanel -> DiscoverRightPanel -> AgriJourneyPanel -> PanelHeader + the agri panels.
 * Mocked (hermetic, copied from DiscoverRightPanel.agriGroupPeek.test.tsx:25-93, not imported):
 * useAgriListingDetail, useAgriDestinations, AuthContext, the Supabase client, useNavigate and the
 * unrelated discover data hooks. No Radix Sheet / Popover is opened (R_jsdom).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverRightPanel } from '@/features/discover/right-panel/testing/flatPropsRightPanel';
import type { AgriMapListingItem } from '@/hooks/useAgriMapListings';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

const mockUseAgriDestinations = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAgriListingDetail', () => ({
  useAgriListingDetail: vi.fn(() => ({ data: undefined, isLoading: true, isError: false })),
}));
vi.mock('@/hooks/useRegionalAreaGroups', () => ({ useAgriDestinations: mockUseAgriDestinations }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null, isLoading: false, isAdmin: false, isDealer: false })),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
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
vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: { city: 'udupi', areas: [] }, isLoading: false, error: null })),
}));
vi.mock('@/hooks/useSchoolSearch', () => ({ useSchoolSearch: vi.fn(() => ({ data: [], isLoading: false, error: null })) }));
vi.mock('@/hooks/usePopularSchools', () => ({ usePopularSchools: vi.fn(() => ({ data: [], isLoading: false, error: null })) }));
vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: vi.fn(() => ({
    data: { pages: [] }, isLoading: false, fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
  })),
}));

const LOCALITY_KEY = 'IN|KA|Udupi|Brahmavar';
const item = (id: string): AgriMapListingItem => ({
  id,
  areaKey: LOCALITY_KEY,
  latitude: 13.43,
  longitude: 74.75,
  propertyType: 'agricultural_land',
  locality: 'Brahmavar',
  landArea: 2.5,
  landAreaUnit: 'acre',
  computedAreaAcres: 2.5,
  pricePaise: 3_000_000 * 100,
});

const baseProps = { areas: [], onStartOver: vi.fn(), onSelectJourney: vi.fn(), city: 'udupi' };

const renderPanel = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  mockUseAgriDestinations.mockReturnValue({
    destinations: [
      { areaKey: LOCALITY_KEY, displayName: 'Brahmavar', distanceKm: 18, bearingDeg: 180, direction: 'S', parcelCount: 1 },
    ],
    isLoading: false, isError: false, isNotYetPromoted: false, error: null, refetch: vi.fn(),
  });
});

describe('#2859 B6 AC6(a) agri deep link -> right panel "Agricultural land"', () => {
  it('1531-1.render (L92): the panel the spec URL really derives (agri-group-selected) renders exactly one "Agricultural land" heading inside discover-right-panel', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-selected"
        selectedRegion="S"
        selectedMaxKm={25}
        agriGroupListings={[item('agri-2859-1')]}
        agriGroupLabel="South · up to 25 km"
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
        onClearRegionalGroup={vi.fn()}
      />,
    );
    const panel = screen.getByTestId('discover-right-panel');
    expect(within(panel).getByTestId('agri-group-selected-panel')).toBeInTheDocument();
    const headings = within(panel).getAllByRole('heading', { name: 'Agricultural land' });
    expect(headings).toHaveLength(1);
    expect(headings[0].tagName).toBe('H1');
  });

  it('1531-1.breadcrumb (L92): with an area_key locality the agri-group-locality panel itself carries the "Agricultural land" breadcrumb (scoped to agri-group-locality-panel, not the PanelHeader)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-group-locality"
        selectedRegion="S"
        selectedMaxKm={25}
        selectedLocality={LOCALITY_KEY}
        agriGroupListings={[item('agri-2859-1')]}
        isLoadingAgriGroupListings={false}
        isAgriGroupListingsError={false}
        onRetryAgriGroupListings={vi.fn()}
        onClearLocality={vi.fn()}
      />,
    );
    const localityPanel = screen.getByTestId('agri-group-locality-panel');
    expect(within(localityPanel).getByText('Agricultural land', { selector: 'span' })).toBeInTheDocument();
    expect(within(localityPanel).getByTestId('agri-locality-name')).toHaveTextContent('Brahmavar');
    // The PanelHeader is the second source of the words and sits OUTSIDE the locality panel.
    const header = screen.getByRole('heading', { name: 'Agricultural land' });
    expect(localityPanel.contains(header)).toBe(false);
  });
});
