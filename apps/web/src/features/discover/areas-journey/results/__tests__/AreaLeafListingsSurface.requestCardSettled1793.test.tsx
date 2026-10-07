/**
 * Issue #1793 PR-C (fix cycle 1, CR F1/F2) — the "Request a property" card's settled gate, through the
 * REAL AreaLeafListingsSurface -> AreaSelectedPanel -> ListingsBody chain (the AREA path, where
 * AreaSelectedPanel sits between the resolver and ListingsBody and is outside this slice's boundary)
 * and the surface's school+area combined panel.
 *
 * Only `useAuth` and the city-listings hook (live backend/Supabase) are stubbed. What is asserted is
 * what a buyer sees: the card follows the scope's OWN query, never the shared `isFetching`.
 */
import type { ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FlatPropsAreasJourneyPanel } from '@/features/discover/areas-journey/testing/FlatPropsAreasJourneyPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

const mockUseDiscoverCityListings = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useDiscoverCityListings', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useDiscoverCityListings')>(
    '@/hooks/useDiscoverCityListings',
  );
  return { ...actual, useDiscoverCityListings: (...args: unknown[]) => mockUseDiscoverCityListings(...args) };
});

const AREA_KEY = 'IN|KA|Bangalore|Manipal';
const CARD = 'Request a property';

const node: NavigationNodeResponse = {
  nodeKey: `a:${AREA_KEY}`,
  nodeType: 'AREA',
  displayLabel: 'Manipal',
  depth: 2,
  regionKey: 'east',
  ancestry: [],
  nextLevelType: 'LISTINGS',
  children: [],
  revisionId: 1,
  bounds: { centreLat: 13.35, centreLon: 74.79, minLat: 13.3, minLon: 74.75, maxLat: 13.4, maxLon: 74.83 },
  descendantAreaKeys: null,
  areaKey: AREA_KEY,
};

// Only the members the leaf surface reads are meaningful; the rest are inert (same shape as the
// sibling discoverAreasJourneyPanelAreaLeaf spec's fixture).
const journey = (): UseAreasNavigationJourneyResult => ({
  isLoading: false,
  isError: false,
  error: null,
  node,
  levelKind: 'empty',
  children: [],
  wasTruncated: false,
  resolutionNotice: null,
  nodeCount: { listingCount: 0, schoolCount: 0, matchingAreaCount: null },
  selectNode: vi.fn(),
  refetch: vi.fn(),
  historyAdjacencyLog: [],
}) as unknown as UseAreasNavigationJourneyResult; // test fixture: see note above

const school: SchoolResult = {
  id: 'sch-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  latitude: 13.35,
  longitude: 74.79,
  address: 'Manipal',
  distanceKm: 0.5,
  areaKey: AREA_KEY,
};

type Props = Partial<ComponentProps<typeof FlatPropsAreasJourneyPanel>>;

function renderSurface(extra: Props, url = '/discover?city=bangalore&journey=area-first&intent=buy') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = (props: Props) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <DiscoverProvider>
          <AreaSetDraftProvider>
            <FlatPropsAreasJourneyPanel journey={journey()} buildNodeHref={() => null} {...props} />
          </AreaSetDraftProvider>
        </DiscoverProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(element(extra));
  return { ...result, update: (next: Props) => result.rerender(element(next)) };
}

/** A settled, empty map-supplied AREA result (the production source for the canonical leaf). */
const AREA_ZERO: Props = {
  mapAreaListings: [],
  mapAreaListingsAreaKey: AREA_KEY,
  mapAreaListingsLoading: false,
  mapAreaListingsError: false,
  mapAreaListingsFetching: false,
  mapAreaListingsPlaceholder: false,
};

beforeEach(() => {
  vi.stubEnv('VITE_PROPERTY_REQUESTS_ENABLED', 'true');
  mockUseAuth.mockReturnValue({ user: null, isLoading: false });
  mockUseDiscoverCityListings.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, isError: false });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AREA path (AreaLeafListingsSurface -> AreaSelectedPanel -> ListingsBody)', () => {
  it('settled zero: the card renders', () => {
    renderSurface(AREA_ZERO);
    expect(screen.getByRole('button', { name: CARD })).toBeInTheDocument();
  });

  it('F1a: an anonymous keepPreviousData placeholder [] (fetching false) shows NO card; it appears when the new key settles', () => {
    const { update } = renderSurface({ ...AREA_ZERO, mapAreaListingsPlaceholder: true });
    expect(screen.getByTestId('area-zero-result-recovery')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
    update({ ...AREA_ZERO, mapAreaListingsPlaceholder: false });
    expect(screen.getByRole('button', { name: CARD })).toBeInTheDocument();
  });

  it('F1b: an anon viewport re-search over the previous viewport\'s [] shows NO card until the new viewport settles', () => {
    const viewport: Props = {
      isAnonViewport: true,
      anonViewportListings: [],
      anonViewportListingsLoading: false,
      isPlaceholderAnonViewport: true,
    };
    const { update } = renderSurface({ ...AREA_ZERO, ...viewport });
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
    update({ ...AREA_ZERO, ...viewport, isPlaceholderAnonViewport: false });
    expect(screen.getByRole('button', { name: CARD })).toBeInTheDocument();
  });

  it('F1c: a same-key background refetch (fetching true, not a placeholder) keeps the card AND its typed draft mounted', async () => {
    const { update } = renderSurface(AREA_ZERO);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: CARD }));
    await user.type(screen.getByLabelText(/phone number/i), '9876543210');

    update({ ...AREA_ZERO, mapAreaListingsFetching: true });
    expect(screen.getByLabelText(/phone number/i)).toHaveValue('9876543210');
    // ...and the zero-result state is still the dimmed one: this is a refetch, not a placeholder.
    expect(screen.getByRole('button', { name: CARD })).toBeInTheDocument();
  });

  it.each([
    ['loading', { mapAreaListingsLoading: true }],
    ['error', { mapAreaListingsError: true }],
  ])('hidden while %s', (_n, patch) => {
    renderSurface({ ...AREA_ZERO, ...patch });
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
  });
});

describe('school + area combined panel (school-radius card source)', () => {
  const COMBINED = '/discover?city=bangalore&journey=area-first&intent=buy&schoolId=sch-1';
  const combined: Props = {
    ...AREA_ZERO,
    selectedSchool: school,
    schoolListings: [],
    schoolListingsLoading: false,
    radiusKm: 3,
    schoolListingsSettled: true,
    schoolListingsHasMore: false,
  };

  it('settled, uncapped zero: the card renders in the school empty state', () => {
    renderSurface(combined, COMBINED);
    expect(screen.getByTestId('school-radius-empty-state')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CARD })).toBeInTheDocument();
  });

  it('F1a: not settled (anonymous radius placeholder) -> empty state, no card', () => {
    renderSurface({ ...combined, schoolListingsSettled: false }, COMBINED);
    expect(screen.getByTestId('school-radius-empty-state')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
  });

  it('F2: an anonymous capped page (hasMore) filtered to empty -> no card; uncapped -> card', () => {
    const { unmount } = renderSurface({ ...combined, schoolListingsHasMore: true }, COMBINED);
    expect(screen.getByTestId('school-radius-empty-state')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
    unmount();
    renderSurface({ ...combined, schoolListingsHasMore: false }, COMBINED);
    expect(screen.getByRole('button', { name: CARD })).toBeInTheDocument();
  });

  it('no settled signal supplied at all -> no card (never shown without proof)', () => {
    renderSurface({ ...combined, schoolListingsSettled: undefined }, COMBINED);
    expect(screen.queryByRole('button', { name: CARD })).not.toBeInTheDocument();
  });
});
