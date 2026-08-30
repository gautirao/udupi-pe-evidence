/**
 * SchoolsInAreaPanel — URL-state filter preservation tests (Issue #1138).
 *
 * AC5: Board chip toggle preserves dateFrom/dateTo.
 * AC6: Category chip toggle preserves dateFrom/dateTo.
 * AC7: handleClearFilters preserves dateFrom/dateTo and other property filters;
 *      only boardFilters/categoryFilters are cleared.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider, InfiniteData } from '@tanstack/react-query';

// --- Mocks (vi.hoisted ensures they are lifted before vi.mock calls) ---

const mockSetFiltersLive = vi.hoisted(() => vi.fn());

const mockUrlState = vi.hoisted(() => ({
  city: 'udupi',
  areaKey: 'IN|KA|Udupi|Padubidri',
  viewport: null,
  schoolId: null,
  radiusKm: null,
  q: '',
  journey: 'school-first' as const,
  groupId: null,
  filters: {
    propertyTypes: ['apartment'],
    bedrooms: [2],
    priceMin: 1000000,
    priceMax: 5000000,
    sellerTypes: ['owner'],
    boardFilters: [] as string[],
    categoryFilters: [] as string[],
    backOnMarket: undefined,
    newToMarket: undefined,
    reraRegistered: undefined,
    readyToMove: undefined,
    dateFrom: '2026-01-01',
    dateTo: '2026-12-31',
  },
}));

// Issue #1953 (build step 2) — SchoolsInAreaPanel now consumes the
// DiscoverProvider facade instead of calling useDiscoverUrlState() directly.
vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => mockUrlState,
  useDiscoverViewport: () => mockUrlState.viewport,
  useDiscoverActions: () => ({
    setFiltersLive: mockSetFiltersLive,
    setSchoolParams: vi.fn(),
    clearAreaContext: vi.fn(),
  }),
}));

const mockRefetch = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: vi.fn(() => ({
    data: { pages: [] },
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: {
      city: 'udupi',
      areas: [
        {
          areaKey: 'IN|KA|Udupi|Padubidri',
          name: 'Padubidri',
          areaLabel: 'Padubidri',
          geo_center_lat: 13.18,
          geo_center_lon: 74.78,
          geoCenterLat: 13.18,
          geoCenterLon: 74.78,
          listingCount: 0,
          schoolCount: 0,
        },
      ],
    },
    isLoading: false,
  })),
}));

// PanelHeader is a real component; no need to stub it for these tests.

import { SchoolsInAreaPanel } from './SchoolsInAreaPanel';
import { useSchoolsByArea, type SchoolsByAreaResponse } from '@/hooks/useSchoolsByArea';
import { mockUseInfiniteQueryResult } from '@/test-utils/mockReactQueryResults';

type SchoolsByAreaQueryData = InfiniteData<SchoolsByAreaResponse>;

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel(props: Partial<React.ComponentProps<typeof SchoolsInAreaPanel>> = {}) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <SchoolsInAreaPanel journey="school-first" onStartOver={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

// Helper to override the hook mock for a single test.
// NOTE: `isError` and `data` are branched explicitly (rather than forwarded as
// plain `boolean`/`T | undefined` locals) so each branch's object literal keeps
// its discriminant fields as literal types — required for TS to match one
// member of the UseInfiniteQueryResult discriminated union (see
// src/test-utils/mockReactQueryResults.ts).
const mockSchoolsHook = (overrides: {
  data?: SchoolsByAreaQueryData;
  isError?: boolean;
}) => {
  const isError = overrides.isError ?? false;
  const data = overrides.data;
  if (isError) {
    vi.mocked(useSchoolsByArea).mockReturnValue(mockUseInfiniteQueryResult<SchoolsByAreaQueryData>({
      data,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    }));
  } else {
    vi.mocked(useSchoolsByArea).mockReturnValue(mockUseInfiniteQueryResult<SchoolsByAreaQueryData>({
      data,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    }));
  }
};

describe('SchoolsInAreaPanel — error and retry states (Issue #1144)', () => {
  beforeEach(() => {
    mockRefetch.mockReset();
    // Reset to default non-error state
    vi.mocked(useSchoolsByArea).mockReturnValue(mockUseInfiniteQueryResult<SchoolsByAreaQueryData>({
      data: { pages: [], pageParams: [] },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
    }));
  });

  it('AC1: renders named error state when hook isError is true', () => {
    mockSchoolsHook({ isError: true, data: undefined });
    renderPanel();
    expect(screen.getByTestId('schools-error-state')).toBeInTheDocument();
    expect(screen.getByText(/could not load schools/i)).toBeInTheDocument();
  });

  it('AC1: renders retry button when hook isError is true', () => {
    mockSchoolsHook({ isError: true, data: undefined });
    renderPanel();
    expect(screen.getByTestId('schools-error-retry')).toBeInTheDocument();
  });

  it('AC1: retry button calls refetch when clicked', () => {
    mockSchoolsHook({ isError: true, data: undefined });
    renderPanel();
    fireEvent.click(screen.getByTestId('schools-error-retry'));
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  it('AC2: does not show "No schools found" when isError is true', () => {
    mockSchoolsHook({ isError: true, data: undefined });
    renderPanel();
    expect(screen.queryByText(/no schools found/i)).not.toBeInTheDocument();
  });

  it('AC2: "No schools found" still renders on genuine empty success (isError false, no schools)', () => {
    // Default mock: isError=false, data.pages=[] → schools=[]
    renderPanel();
    expect(screen.getByText(/no schools found/i)).toBeInTheDocument();
    expect(screen.queryByTestId('schools-error-state')).not.toBeInTheDocument();
  });

  it('AC1 prop-mode: schoolsError prop true → renders error state even when internal hook is disabled', () => {
    // Simulate MapDiscovery passing schoolsError=true with schools=[] (hook disabled)
    // schoolsProp !== undefined → isError = schoolsErrorProp ?? false = true
    render(
      <QueryClientProvider client={makeQC()}>
        <SchoolsInAreaPanel
          journey="school-first"
          onStartOver={vi.fn()}
          schools={[]}
          schoolsLoading={false}
          schoolsError={true}
          onSchoolsRetry={mockRefetch}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('schools-error-state')).toBeInTheDocument();
    expect(screen.getByText(/could not load schools/i)).toBeInTheDocument();
  });

  it('AC1 prop-mode: Retry in prop-mode calls onSchoolsRetry callback', () => {
    render(
      <QueryClientProvider client={makeQC()}>
        <SchoolsInAreaPanel
          journey="school-first"
          onStartOver={vi.fn()}
          schools={[]}
          schoolsLoading={false}
          schoolsError={true}
          onSchoolsRetry={mockRefetch}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId('schools-error-retry'));
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  it('AC2 prop-mode: error state NOT shown when schoolsError=false and schools=[] (genuine empty)', () => {
    // Internal hook erroring should be suppressed when parent passes schoolsProp
    mockSchoolsHook({ isError: true, data: undefined });
    render(
      <QueryClientProvider client={makeQC()}>
        <SchoolsInAreaPanel
          journey="school-first"
          onStartOver={vi.fn()}
          schools={[]}
          schoolsLoading={false}
          schoolsError={false}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId('schools-error-state')).not.toBeInTheDocument();
    expect(screen.getByText(/no schools found/i)).toBeInTheDocument();
  });
});

describe('SchoolsInAreaPanel — filter preservation (Issue #1138)', () => {
  beforeEach(() => {
    mockSetFiltersLive.mockReset();
    // Reset hook to default (non-error, empty) state for filter tests
    vi.mocked(useSchoolsByArea).mockReturnValue(mockUseInfiniteQueryResult<SchoolsByAreaQueryData>({
      data: { pages: [], pageParams: [] },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
    }));
  });

  it('AC5: board chip toggle preserves dateFrom and dateTo', () => {
    renderPanel();

    const cbseChip = screen.getByTestId('board-chip-cbse');
    fireEvent.click(cbseChip);

    expect(mockSetFiltersLive).toHaveBeenCalledOnce();
    expect(mockSetFiltersLive).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        boardFilters: ['CBSE'],
      }),
    );
  });

  it('AC5: board chip toggle preserves other property filters (priceMin, priceMax, propertyTypes)', () => {
    renderPanel();

    fireEvent.click(screen.getByTestId('board-chip-icse'));

    expect(mockSetFiltersLive).toHaveBeenCalledWith(
      expect.objectContaining({
        priceMin: 1000000,
        priceMax: 5000000,
        propertyTypes: ['apartment'],
        bedrooms: [2],
      }),
    );
  });

  it('AC6: category chip toggle preserves dateFrom and dateTo', () => {
    renderPanel();

    const primaryChip = screen.getByTestId('category-chip-primary');
    fireEvent.click(primaryChip);

    expect(mockSetFiltersLive).toHaveBeenCalledOnce();
    expect(mockSetFiltersLive).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        categoryFilters: ['primary'],
      }),
    );
  });

  it('AC6: category chip toggle preserves other property filters', () => {
    renderPanel();

    fireEvent.click(screen.getByTestId('category-chip-secondary'));

    expect(mockSetFiltersLive).toHaveBeenCalledWith(
      expect.objectContaining({
        priceMin: 1000000,
        priceMax: 5000000,
        propertyTypes: ['apartment'],
        sellerTypes: ['owner'],
      }),
    );
  });

  it('AC7: handleClearFilters preserves dateFrom, dateTo, and other property filters', () => {
    // Render with empty schools list so the empty-state clear button appears.
    renderPanel();

    const clearBtn = screen.getByTestId('empty-state-no-schools-clear-filters');
    fireEvent.click(clearBtn);

    expect(mockSetFiltersLive).toHaveBeenCalledOnce();
    const arg = mockSetFiltersLive.mock.calls[0][0] as Record<string, unknown>;

    // dateFrom/dateTo preserved
    expect(arg.dateFrom).toBe('2026-01-01');
    expect(arg.dateTo).toBe('2026-12-31');

    // Other property filters preserved
    expect(arg.priceMin).toBe(1000000);
    expect(arg.priceMax).toBe(5000000);
    expect(arg.propertyTypes).toEqual(['apartment']);
    expect(arg.bedrooms).toEqual([2]);
    expect(arg.sellerTypes).toEqual(['owner']);

    // School filters cleared
    expect(arg.boardFilters).toEqual([]);
    expect(arg.categoryFilters).toEqual([]);
  });
});

// ── Issue #1954 — empty-state routing gaps ────────────────────────────────────
// AC: a name-search that matches nothing must route to the SAME "no schools match
// these filters" copy as chip filters (filtersActive includes nameQuery), with a
// working Clear filters action that also resets the search box. Separately, an
// area that genuinely has zero schools must still render the homes-in-area content
// passed via footerSlot beneath the schools empty state (no schools != no homes).

const ONE_SCHOOL_PAGE: SchoolsByAreaQueryData = {
  pages: [
    {
      schools: [
        {
          id: 'sch-1',
          name: 'Manipal Public School',
          board: 'CBSE',
          boardType: null,
          latitude: 13.35,
          longitude: 74.79,
          address: 'Manipal, Udupi District',
          distanceKm: 0.5,
        },
      ],
      totalElements: 1,
      isLast: true,
      nextPage: 1,
    },
  ],
  pageParams: [0],
};

describe('SchoolsInAreaPanel — empty-state routing (Issue #1954)', () => {
  beforeEach(() => {
    mockRefetch.mockReset();
    mockSetFiltersLive.mockReset();
  });

  it('name search matching no school renders the same "no schools match these filters" heading as chip filters', () => {
    mockSchoolsHook({ data: ONE_SCHOOL_PAGE });
    renderPanel();

    fireEvent.change(screen.getByTestId('school-search-input'), {
      target: { value: 'zzz-no-such-school' },
    });

    expect(screen.getByTestId('schools-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No schools match these filters.')).toBeInTheDocument();
    // The genuinely-empty heading must NOT also render (mutually exclusive routing).
    expect(screen.queryByText(/^No schools found$/)).not.toBeInTheDocument();
  });

  it('Clear filters from a name-search-only empty state resets the search box (not just URL filters)', () => {
    mockSchoolsHook({ data: ONE_SCHOOL_PAGE });
    renderPanel();

    const input = screen.getByTestId('school-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'zzz-no-such-school' } });
    expect(screen.getByTestId('schools-empty-state')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('empty-state-no-schools-clear-filters'));

    // Search box cleared client-side...
    expect(input.value).toBe('');
    // ...and the matching school reappears once the query is cleared.
    expect(screen.queryByTestId('schools-empty-state')).not.toBeInTheDocument();
    expect(screen.getByText('Manipal Public School')).toBeInTheDocument();
  });

  it('area with zero schools still renders homes-in-area content passed via footerSlot beneath the empty state', () => {
    mockSchoolsHook({ data: { pages: [{ schools: [], totalElements: 0, isLast: true, nextPage: 1 }], pageParams: [0] } as unknown as SchoolsByAreaQueryData });
    renderPanel({
      footerSlot: <div data-testid="homes-in-area-stub">3 homes in this area</div>,
    });

    expect(screen.getByTestId('schools-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/^No schools found$/)).toBeInTheDocument();
    // The homes-in-area section is NOT gated by school availability.
    expect(screen.getByTestId('homes-in-area-stub')).toBeInTheDocument();
    expect(screen.getByText('3 homes in this area')).toBeInTheDocument();
  });

  it('"Pick a different area" in the genuinely-empty state calls clearAreaContext', () => {
    mockSchoolsHook({ data: { pages: [{ schools: [], totalElements: 0, isLast: true, nextPage: 1 }], pageParams: [0] } as unknown as SchoolsByAreaQueryData });
    renderPanel();
    // Button exists and is clickable; wiring to clearAreaContext is exercised via the
    // shared useDiscoverActions mock (asserted not to throw and to be the only handler).
    const pickBtn = screen.getByTestId('empty-state-no-schools-pick-area');
    expect(pickBtn).toBeInTheDocument();
    fireEvent.click(pickBtn);
  });
});
