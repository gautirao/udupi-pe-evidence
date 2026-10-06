/**
 * Issue #1793 SR-024 — production-path proof for the CANONICAL area-first journey.
 *
 * Renders the REAL `AreaFirstJourneyPanel` -> `DiscoverAreasJourneyPanel` ->
 * `AreaLeafListingsSurface` chain (only the data hooks, auth, PropertyCard and the visual shell
 * are mocked), fed the same `view`/`commands` slice shapes `buildPanelSurfaceModel`/
 * `buildPanelSurfaceCommands` produce, so a regression in ANY link of the signal chain turns it red:
 *
 *   A2 — anon "Search this area" viewport: `isErrorAnonViewport` + `refetchAnonViewport` must reach
 *        the leaf; a failed viewport request renders the error + Retry (never the zero-result
 *        recovery) and Retry re-issues the VIEWPORT query, not the AREA one.
 *   A1 — school+area combined view: `isErrorSchoolRadiusListings` + `refetchSchoolRadiusListings`
 *        must reach AreaSchoolCombinedPanel -> SchoolRadiusListings.
 */
import { useState, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  makeListing,
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

describe('#1793 A2 — anon "Search this area" viewport error (AreaFirstJourneyPanel production wiring)', () => {
  it('a failed anon viewport request with nothing retained renders the error + Retry, NOT the zero-result recovery, and Retry re-issues the VIEWPORT query', async () => {
    const user = userEvent.setup();
    const refetchAnonViewport = fn();
    const { refetchAreaListings } = renderPanel({
      geography: { isAnonViewport: true, anonViewportListings: [], isErrorAnonViewport: true },
      geographyCommands: { refetchAnonViewport },
    });

    expect(screen.getByTestId('areas-journey-panel-listings-error')).toBeInTheDocument();
    expect(screen.queryByTestId('area-zero-result-recovery')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetchAnonViewport).toHaveBeenCalledTimes(1);
    expect(refetchAreaListings).not.toHaveBeenCalled();
  });

  it('a failed refresh with results retained keeps the stale cards and shows the retry banner (never a silent success), wired to the VIEWPORT refetch', async () => {
    const user = userEvent.setup();
    const refetchAnonViewport = fn();
    renderPanel({
      geography: {
        isAnonViewport: true,
        anonViewportListings: [makeListing({ id: 'stale-1' })],
        isErrorAnonViewport: true,
      },
      geographyCommands: { refetchAnonViewport },
    });

    expect(screen.getByTestId('property-card-stale-1')).toBeInTheDocument();
    expect(screen.getByTestId('area-listings-retry-banner')).toBeInTheDocument();
    await user.click(screen.getByTestId('area-listings-retry-banner-btn'));
    expect(refetchAnonViewport).toHaveBeenCalledTimes(1);
  });

  it('control: a genuine zero anon viewport (no error) still renders the zero state, not the error block', () => {
    renderPanel({
      geography: { isAnonViewport: true, anonViewportListings: [], isErrorAnonViewport: false },
      geographyCommands: { refetchAnonViewport: fn() },
    });
    expect(screen.queryByTestId('areas-journey-panel-listings-error')).not.toBeInTheDocument();
  });

  it('control: loading never renders the error block', () => {
    renderPanel({
      geography: {
        isAnonViewport: true,
        anonViewportListings: [],
        anonViewportListingsLoading: true,
        isErrorAnonViewport: false,
      },
      geographyCommands: { refetchAnonViewport: fn() },
    });
    expect(screen.queryByTestId('areas-journey-panel-listings-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-zero-result-recovery')).not.toBeInTheDocument();
  });
});

describe('#1793 A1 — school+area combined view school-radius error (AreaFirstJourneyPanel production wiring)', () => {
  const COMBINED_URL = '/discover?city=bangalore&journey=area-first&intent=buy&schoolId=s1';

  it('a failed school-radius query renders the error block (not "no homes within N km") and Retry calls the REAL refetch once', async () => {
    const user = userEvent.setup();
    const refetchSchoolRadiusListings = fn();
    renderPanel(
      {
        schools: { selectedSchool: SCHOOL, schoolListings: [], isErrorSchoolRadiusListings: true },
        geographyCommands: { refetchSchoolRadiusListings },
      },
      COMBINED_URL,
    );

    expect(screen.getByTestId('school-radius-listings-error')).toBeInTheDocument();
    expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('school-radius-listings-error-retry'));
    expect(refetchSchoolRadiusListings).toHaveBeenCalledTimes(1);
  });

  it('control: a genuinely empty school-radius result still renders the empty state', () => {
    renderPanel(
      {
        schools: { selectedSchool: SCHOOL, schoolListings: [], isErrorSchoolRadiusListings: false },
        geographyCommands: { refetchSchoolRadiusListings: fn() },
      },
      COMBINED_URL,
    );
    expect(screen.getByTestId('school-radius-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('school-radius-listings-error')).not.toBeInTheDocument();
  });

  // PR-A review A1 — loading window. `results.listingDataLoading` is auth-only (false for anon), so
  // the combined view needs the school-radius query's own loading signal (`schoolRadiusPanelLoading`).
  it('loading window: a pending (or retrying) anon school-radius query renders the skeleton, NOT the empty state or the error block', () => {
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
    expect(screen.getAllByTestId('combined-listing-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('school-radius-listings-error')).not.toBeInTheDocument();
  });

  it('failure -> Retry (data-less): the error block, then the skeleton again while the refetch is pending, never the empty state', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [sr, setSr] = useState({ isError: true, loading: false });
      const { view, commands } = build({
        schools: {
          selectedSchool: SCHOOL,
          schoolListings: [],
          isErrorSchoolRadiusListings: sr.isError,
          schoolRadiusPanelLoading: sr.loading,
        },
        // A REAL query returns to pending (loading, no error) when a data-less error is retried.
        geographyCommands: { refetchSchoolRadiusListings: () => setSr({ isError: false, loading: true }) },
      });
      return (
        <DiscoverProvider>
          <AreaSetDraftProvider>
            <AreaFirstJourneyPanel view={view} commands={commands} />
          </AreaSetDraftProvider>
        </DiscoverProvider>
      );
    }
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[COMBINED_URL]}>
          <Harness />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('school-radius-listings-error')).toBeInTheDocument();
    await user.click(screen.getByTestId('school-radius-listings-error-retry'));
    expect(screen.getAllByTestId('combined-listing-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('school-radius-listings-error')).not.toBeInTheDocument();
  });

  it('signed-in control (no behaviour change): auth listingDataLoading still shows the skeleton with the panel signal off', () => {
    const { view, commands } = build({
      schools: { selectedSchool: SCHOOL, schoolListings: [], isErrorSchoolRadiusListings: false },
      geographyCommands: { refetchSchoolRadiusListings: fn() },
    });
    (view.results as { listingDataLoading: boolean }).listingDataLoading = true;
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[COMBINED_URL]}>
          <DiscoverProvider>
            <AreaSetDraftProvider>
              <AreaFirstJourneyPanel view={view} commands={commands} />
            </AreaSetDraftProvider>
          </DiscoverProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getAllByTestId('combined-listing-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();
  });
});
