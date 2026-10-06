/**
 * Issue #1793 SR-024 PR-A R1 (WORKDONE_REVIEW) — canonical-path proof that the school summary band
 * and radius chips never claim a ZERO count while the anon school-radius request is failed or
 * loading. Renders the REAL `AreaFirstJourneyPanel` -> `AreaLeafListingsSurface` ->
 * `AreaSchoolCombinedPanel` chain (same harness as AreaFirstJourneyPanel.errorSignals1793.test.tsx).
 * A genuine zero and signed-in viewers keep their counts.
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AreaFirstJourneyPanel } from '../AreaFirstJourneyPanel';
import type { AreaFirstJourneyPanelCommands, AreaFirstJourneyPanelView } from '../AreaFirstJourneyPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import {
  makeAreaLeafNode,
  makeJourney,
} from '@/features/discover/areas-journey/testing/areasJourneyPanelTestAdapter';

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

vi.mock('@/components/discover/PropertyCard', () => ({
  PropertyCard: ({ listing }: { listing: DiscoverCityListingItem }) => (
    <div data-testid={`property-card-${listing.id}`} />
  ),
}));

vi.mock('../DiscoverJourneyPanelShell', () => ({
  DiscoverJourneyPanelShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const AREA_KEY = 'IN|KA|Bangalore|Manipal';
const fn = () => vi.fn();

const SCHOOL = {
  id: 's1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  latitude: 13.3531,
  longitude: 74.7935,
  address: 'Manipal',
  distanceKm: 0.5,
};

interface Scenario {
  geography?: Record<string, unknown>;
  schools?: Record<string, unknown>;
  geographyCommands?: Record<string, unknown>;
}

function build(s: Scenario) {
  const refetchAreaListings = fn();
  const geography = {
    areaListings: [],
    isLoadingAreaListings: false,
    isErrorAreaListings: false,
    isFetchingAreaListings: false,
    selectedArea: { areaKey: AREA_KEY },
    isAnonViewport: false,
    anonViewportListings: [],
    anonViewportListingsLoading: false,
    isErrorAnonViewport: false,
    isAuthViewport: false,
    authViewportListings: [],
    authViewportListingsLoading: false,
    isPolygonScope: false,
    polygonListings: [],
    polygonListingsLoading: false,
    isErrorPolygonListings: false,
    refetchPolygonListings: fn(),
    ...s.geography,
  };
  const view = {
    pageContext: { nav: { nodeListings: false, radiusKm: 3 }, isMobileShell: false },
    routing: { city: 'bangalore' },
    navigation: {
      areasNavigationJourney: makeJourney({
        node: makeAreaLeafNode(),
        nodeCount: { listingCount: 1, schoolCount: 0, matchingAreaCount: null },
      }),
      hoveredNavigationNodeKey: null,
      focusedClusterMemberAreaKeys: null,
    },
    geography,
    filters: { filters: {} },
    schools: {
      selectedSchool: null,
      schools: [],
      schoolsQuery: { isLoading: false, isError: false, isFetching: false, refetch: fn() },
      schoolListings: [],
      ...s.schools,
    },
    results: { listingDataLoading: false },
    interaction: { prefersReducedMotion: false },
  } as unknown as AreaFirstJourneyPanelView;

  const commands = {
    pageContext: {
      actions: {
        clearNodeListings: fn(),
        enterNodeListings: fn(),
        buildNodeHref: () => null,
        enterSchoolPicking: fn(),
      },
    },
    navigation: {
      onNavigationNodeHoverChange: fn(),
      onClusterFocusChange: fn(),
      onSelectedListingPreviewChange: fn(),
      journeyCommands: { changeRadius: fn(), clearSchool: fn(), selectSchoolById: fn(), startOver: fn() },
      selectJourney: fn(),
    },
    filters: { handleFiltersChange: fn() },
    geography: {
      handleAreaFirstBack: fn(),
      refetchAreaListings,
      handleRedrawPolygon: fn(),
      ...s.geographyCommands,
    },
  } as unknown as AreaFirstJourneyPanelCommands;

  return { view, commands, refetchAreaListings };
}

function renderPanel(s: Scenario, url = '/discover?city=bangalore&journey=area-first&intent=buy') {
  const { view, commands, refetchAreaListings } = build(s);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <DiscoverProvider>
          <AreaSetDraftProvider>
            <AreaFirstJourneyPanel view={view} commands={commands} />
          </AreaSetDraftProvider>
        </DiscoverProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { refetchAreaListings };
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: null, isLoading: false });
  mockUseDiscoverCityListings.mockReturnValue({
    data: { areas: [{ areaKey: AREA_KEY, listings: [] }] },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  });
});

const COMBINED_URL = '/discover?city=bangalore&journey=area-first&intent=buy&schoolId=s1';

function expectNoZeroCount() {
  expect(screen.queryByTestId('school-summary-count')).not.toBeInTheDocument();
  expect(screen.queryByText(/homes? for sale/i)).not.toBeInTheDocument();
  expect(within(screen.getByTestId('combined-radius-btn-3')).queryByText(/\b0 homes?\b/)).not.toBeInTheDocument();
  expect(screen.queryByText(/\b0 homes?\b/)).not.toBeInTheDocument();
}

describe('#1793 R1 — canonical area-first + school combined view never claims a zero count while failed or loading', () => {
  it('error (anon): header band and radius chips omit the count next to the error block', () => {
    renderPanel(
      {
        schools: { selectedSchool: SCHOOL, schoolListings: [], isErrorSchoolRadiusListings: true },
        geographyCommands: { refetchSchoolRadiusListings: fn() },
      },
      COMBINED_URL,
    );
    expect(screen.getByTestId('school-radius-listings-error')).toBeInTheDocument();
    expectNoZeroCount();
  });

  it('loading (anon, pending or retrying): header band and radius chips omit the count', () => {
    renderPanel(
      {
        schools: {
          selectedSchool: SCHOOL,
          schoolListings: [],
          isErrorSchoolRadiusListings: false,
          schoolRadiusPanelLoading: true,
        },
        geographyCommands: { refetchSchoolRadiusListings: fn() },
      },
      COMBINED_URL,
    );
    expect(screen.getByTestId('school-summary-band')).toBeInTheDocument();
    expectNoZeroCount();
  });

  it('control: a genuine zero (not failed, not loading) still shows the zero counts', () => {
    renderPanel(
      {
        schools: { selectedSchool: SCHOOL, schoolListings: [], isErrorSchoolRadiusListings: false },
        geographyCommands: { refetchSchoolRadiusListings: fn() },
      },
      COMBINED_URL,
    );
    expect(screen.getByTestId('school-radius-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('school-summary-count')).toHaveTextContent('0');
    expect(screen.getByTestId('combined-radius-btn-3')).toHaveTextContent('0 homes');
  });

  it('signed-in control (unchanged): a signed-in viewer with a settled empty result keeps the zero counts', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isLoading: false });
    renderPanel(
      {
        schools: { selectedSchool: SCHOOL, schoolListings: [], isErrorSchoolRadiusListings: false },
        geographyCommands: { refetchSchoolRadiusListings: fn() },
      },
      COMBINED_URL,
    );
    expect(screen.getByTestId('school-summary-count')).toHaveTextContent('0');
    expect(screen.getByTestId('combined-radius-btn-3')).toHaveTextContent('0 homes');
  });
});
