/**
 * Testid inventory — Issue #2661 commit 1 (qa-fast + architect B6).
 *
 * For each of the 4 public panels' major rendered states, captures the ORDERED
 * list of every `data-testid` present as an explicit assertion (not a snapshot).
 * A later extraction that swaps a variant testid (e.g. `radius-btn` vs
 * `combined-radius-btn`) fails loudly here rather than silently drifting.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import {
  SchoolBrowsePanel,
  SchoolsInAreaPanel,
  SchoolSelectedPanel,
  AreaSchoolCombinedPanel,
} from '../SchoolJourneyPanels';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

function testIdsOf(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid]')).map(
    (el) => el.getAttribute('data-testid') ?? '',
  );
}

const mockSchool: SchoolResult = {
  id: 'sch-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  latitude: 13.3531,
  longitude: 74.7935,
  address: 'Manipal, Udupi District',
  distanceKm: 0.5,
};

const mockSchoolNoCoords: SchoolResult = {
  ...mockSchool,
  latitude: null as unknown as number,
  longitude: null as unknown as number,
};

const makeListing = (id: string): DiscoverCityListingItem => ({
  id,
  pricePaise: 500000000,
  propertyType: 'apartment',
  locality: 'Manipal',
  primaryImageUrl: null,
  lat: 13.354,
  lon: 74.791,
});

const mockArea: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.3531,
  geo_center_lon: 74.7935,
  bbox: [[13.34, 74.78], [13.37, 74.81]],
};

// ── SchoolBrowsePanel ──────────────────────────────────────────────────────────

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'udupi', areaKey: null, schoolId: null, radiusKm: null, q: '',
    journey: 'school-first' as const, groupId: null,
    filters: { boardFilters: [], categoryFilters: [] },
  }),
  useDiscoverViewport: () => ({ zoom: 14 }),
  useDiscoverActions: () => ({
    setSchoolJourney: vi.fn(),
    setSchoolParams: vi.fn(),
    clearAreaContext: vi.fn(),
    setFiltersLive: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePopularSchools', () => ({
  usePopularSchools: vi.fn(() => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() })),
}));
vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: { city: 'udupi', areas: [] }, isLoading: false, isError: false, refetch: vi.fn() })),
}));
vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
}));
vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: () => ({
    data: undefined, isLoading: false, isError: false, refetch: vi.fn(),
    isFetching: false, fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
  }),
}));

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('Testid inventory — SchoolBrowsePanel', () => {
  it('idle (no search, no zones/popular data)', () => {
    const { container } = render(
      <BrowserRouter>
        <QueryClientProvider client={makeQC()}>
          <SchoolBrowsePanel
            view={{ chrome: {}, city: { slug: 'udupi' }, scope: {}, zones: {} }}
            commands={{ chrome: {}, scope: {}, navigation: { selectAreaKey: vi.fn() } }}
          />
        </QueryClientProvider>
      </BrowserRouter>,
    );
    expect(testIdsOf(container)).toEqual(['school-browse-intro', 'school-browse-intro-title', 'school-browse-intro-count']);
  });
});

// ── SchoolsInAreaPanel wrapper (School-first, no area listings) ───────────────

describe('Testid inventory — SchoolsInAreaPanel wrapper (school-first, area listings absent)', () => {
  it('renders with no schools-in-area-properties section when areaListings is undefined', () => {
    const { container } = render(
      <MemoryRouter>
        <SchoolsInAreaPanel
          view={{
            chrome: { journey: 'school-first' },
            viewer: { intent: 'buy' },
            area: mockArea,
            schools: { data: [] },
            homes: { data: undefined },
          }}
          commands={{ chrome: {}, schools: {}, homes: {} }}
        />
      </MemoryRouter>,
    );
    // Only the inner RealSchoolsInAreaPanel's own empty-state testids are expected —
    // the "schools-in-area-properties" footer is absent (areaListings undefined).
    expect(testIdsOf(container)).not.toContain('schools-in-area-properties');
  });
});

// ── SchoolSelectedPanel ────────────────────────────────────────────────────────

function renderSelected(props: { school?: SchoolResult | null; listings?: DiscoverCityListingItem[]; isLoadingListings?: boolean } = {}) {
  const { school = mockSchool, listings = [makeListing('l-1')], isLoadingListings = false } = props;
  return renderWithProviders(
    <DiscoverProvider>
      <SchoolSelectedPanel
        view={{
          chrome: {},
          viewer: { isAuthenticated: false },
          school,
          radius: { km: 3 },
          listings: { data: listings, loading: isLoadingListings },
          propertyFilters: { value: {} },
          boundedSearch: {},
        }}
        commands={{
          chrome: {},
          radius: { change: vi.fn() },
          listings: {},
          propertyFilters: { replace: vi.fn() },
        }}
      />
    </DiscoverProvider>,
    { router: 'browser' },
  );
}

describe('Testid inventory — SchoolSelectedPanel', () => {
  it('loaded, with results', () => {
    const { container } = renderSelected({ listings: [makeListing('l-1')] });
    expect(testIdsOf(container)).toEqual([
      'school-selected-scroll',
      'school-summary-band',
      'school-summary-name',
      'change-school-btn',
      'school-summary-count',
      'radius-btn-3',
      'radius-btn-5',
      'radius-btn-10',
      'radius-result-heading',
      'radius-result-count',
      'school-listings-body',
      'listing-card',
      'listing-save-button',
      'distance-badge',
      'listing-view-details',
    ]);
  });

  it('loading (cold-load skeleton)', () => {
    const { container } = renderSelected({ school: null, listings: [], isLoadingListings: true });
    expect(testIdsOf(container)).toEqual([
      'school-selected-scroll',
      'school-summary-skeleton',
      'radius-btn-3',
      'radius-btn-5',
      'radius-btn-10',
      'school-listings-body',
      'listing-skeleton',
      'listing-skeleton',
      'listing-skeleton',
    ]);
  });

  it('empty (no listings)', () => {
    const { container } = renderSelected({ listings: [], isLoadingListings: false });
    expect(testIdsOf(container)).toEqual([
      'school-selected-scroll',
      'school-summary-band',
      'school-summary-name',
      'change-school-btn',
      'school-summary-count',
      'radius-btn-3',
      'radius-btn-5',
      'radius-btn-10',
      'school-listings-body',
      'school-radius-empty-state',
      'try-radius-5-btn',
      'try-radius-10-btn',
      'change-school-empty-btn',
    ]);
  });

  it('missing-coords', () => {
    const { container } = renderSelected({ school: mockSchoolNoCoords, listings: [], isLoadingListings: false });
    expect(testIdsOf(container)).toEqual([
      'school-selected-scroll',
      'school-summary-band',
      'school-summary-name',
      'change-school-btn',
      'school-summary-count',
      'radius-btn-3',
      'radius-btn-5',
      'radius-btn-10',
      'school-listings-body',
      'missing-coords-empty-state',
      'choose-another-school-btn',
    ]);
  });
});

// ── AreaSchoolCombinedPanel ────────────────────────────────────────────────────

function renderCombined(
  props: { selectedArea?: AreaPoint | null; selectedSchool?: SchoolResult | null; listings?: DiscoverCityListingItem[]; isLoadingListings?: boolean } = {},
) {
  const {
    selectedArea = mockArea,
    selectedSchool = mockSchool,
    listings = [makeListing('l-1')],
    isLoadingListings = false,
  } = props;
  return renderWithProviders(
    <DiscoverProvider>
      <AreaSchoolCombinedPanel
        view={{
          chrome: {},
          viewer: { isAuthenticated: false },
          area: selectedArea,
          school: selectedSchool,
          radius: { km: 3 },
          listings: { data: listings, loading: isLoadingListings },
          propertyFilters: { value: {} },
        }}
        commands={{
          chrome: {},
          radius: { change: vi.fn() },
          listings: {},
          propertyFilters: { replace: vi.fn() },
          school: { clear: vi.fn() },
        }}
      />
    </DiscoverProvider>,
    { router: 'browser' },
  );
}

describe('Testid inventory — AreaSchoolCombinedPanel', () => {
  it('loaded, with results', () => {
    const { container } = renderCombined({ listings: [makeListing('l-1')] });
    expect(testIdsOf(container)).toEqual([
      'combined-selected-scroll',
      'school-summary-band',
      'school-summary-name',
      'change-school-btn',
      'school-summary-count',
      'combined-radius-btn-3',
      'combined-radius-btn-5',
      'combined-radius-btn-10',
      'radius-result-heading',
      'radius-result-count',
      'combined-listings-body',
      'listing-card',
      'listing-save-button',
      'distance-badge',
      'listing-view-details',
    ]);
  });

  it('loading (cold-load hydration skeleton — selectedArea/selectedSchool not yet resolved)', () => {
    const { container } = renderCombined({ selectedArea: null, selectedSchool: null });
    expect(testIdsOf(container)).toEqual(['combined-loading-skeleton']);
  });

  it('empty (no listings)', () => {
    const { container } = renderCombined({ listings: [], isLoadingListings: false });
    expect(testIdsOf(container)).toEqual([
      'combined-selected-scroll',
      'school-summary-band',
      'school-summary-name',
      'change-school-btn',
      'school-summary-count',
      'combined-radius-btn-3',
      'combined-radius-btn-5',
      'combined-radius-btn-10',
      'combined-listings-body',
      'school-radius-empty-state',
      'try-radius-5-btn',
      'try-radius-10-btn',
      'view-all-in-area-btn',
      'change-school-empty-btn',
    ]);
  });
});
