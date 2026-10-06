/**
 * Issue #2770 (L3) — SURFACE-level pin for the selected-school state on the canonical area-first
 * AREA leaf. `AreaLeafListingsSurface` is the real production render site: it derives the
 * desktop-reskin signal (>=1366px, not the mobile shell) itself and forwards it as
 * `compactContext` ONLY (never `isDesktop`, which would also mount the CompactFilterBar).
 * Panel-level tests cannot catch that wiring, so this renders the whole surface.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AreaLeafListingsSurface } from '../AreaLeafListingsSurface';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import {
  makeAreaLeafNode,
  makeListing,
} from '@/features/discover/areas-journey/testing/areasJourneyPanelTestAdapter';
import { deriveAreaPointFromNode } from '@/features/discover/navigation/nodeAreaPoint';
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

vi.mock('@/components/discover/PropertyCard', () => ({
  PropertyCard: ({ listing }: { listing: { id: string } }) => <div data-testid={`property-card-${listing.id}`} />,
}));

const school: SchoolResult = {
  id: 'sch-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  latitude: 13.3531,
  longitude: 74.7935,
  address: 'Manipal, Udupi District',
  distanceKm: 0.5,
};

const originalMatchMedia = window.matchMedia;

/** matchMedia mock that evaluates min-width / max-width px queries against a fixed viewport width. */
function mockViewportWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const min = /\(min-width:\s*(\d+(?:\.\d+)?)px\)/.exec(query);
    const max = /\(max-width:\s*(\d+(?:\.\d+)?)px\)/.exec(query);
    const matches = (min ? width >= Number(min[1]) : true) && (max ? width <= Number(max[1]) : true);
    return {
      matches: Boolean(min || max) && matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  }) as typeof window.matchMedia;
}

function renderSurface() {
  const node = makeAreaLeafNode();
  const areaPoint = deriveAreaPointFromNode(node);
  if (!areaPoint) throw new Error('fixture node must derive an AreaPoint');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/discover?city=bangalore&journey=area-first&intent=buy&schoolId=sch-1']}>
        <DiscoverProvider>
          <AreaSetDraftProvider>
            <AreaLeafListingsSurface
              view={{
                leaf: { areaPoint, node, historyAdjacencyLog: [] },
                results: { source: { areaBase: { listings: [], areaKey: null }, scope: { kind: 'none' } } as never },
                schools: {
                  inArea: { data: [school], loading: false, fetching: false, error: false },
                  selected: school,
                  selectedListings: { data: [makeListing({ id: 'l-1' }), makeListing({ id: 'l-2' })], loading: false },
                  radiusKm: 3,
                },
              }}
              commands={{
                hierarchy: { selectNode: vi.fn() },
                navigation: { buildNodeHref: () => null, startOver: vi.fn() },
                results: {},
                schools: { clear: vi.fn(), changeRadius: vi.fn() },
              }}
            />
          </AreaSetDraftProvider>
        </DiscoverProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: null, isLoading: false });
  mockUseDiscoverCityListings.mockReturnValue({
    data: { areas: [{ areaKey: 'IN|KA|Bangalore|Manipal', listings: [] }] },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  });
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('AreaLeafListingsSurface — selected-school state (#2770)', () => {
  it('>=1366 desktop: compact block (chips inside the band) and NO filter toolbar / Filters button', () => {
    mockViewportWidth(1366);
    const { container } = renderSurface();
    expect(screen.getByTestId('areas-journey-panel-school-combined')).toBeInTheDocument();
    const band = screen.getByTestId('school-summary-band');
    // Positive control: the compact block is what rendered.
    expect(within(band).getByTestId('combined-radius-btn-3')).toBeInTheDocument();
    expect(container.querySelector('[data-testid^="combined-filter-toolbar"]')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /filters/i })).toHaveLength(0);
  });

  it('1365: the stacked band (chips outside school-summary-band), still no filter toolbar', () => {
    mockViewportWidth(1365);
    const { container } = renderSurface();
    const band = screen.getByTestId('school-summary-band');
    const chip = screen.getByTestId('combined-radius-btn-3');
    expect(band.contains(chip)).toBe(false);
    expect(container.querySelector('[data-testid^="combined-filter-toolbar"]')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /filters/i })).toHaveLength(0);
  });
});
