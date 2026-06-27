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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

vi.mock('@/hooks/useDiscoverUrlState', () => ({
  useDiscoverUrlState: vi.fn(() => [
    mockUrlState,
    {
      setFiltersLive: mockSetFiltersLive,
      setSchoolParams: vi.fn(),
      clearAreaContext: vi.fn(),
    },
  ]),
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
import { useSchoolsByArea } from '@/hooks/useSchoolsByArea';

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <SchoolsInAreaPanel journey="school-first" onStartOver={vi.fn()} />
    </QueryClientProvider>,
  );
}

// Helper to override the hook mock for a single test
const mockSchoolsHook = (overrides: Record<string, unknown>) => {
  vi.mocked(useSchoolsByArea).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    ...overrides,
  } as ReturnType<typeof useSchoolsByArea>);
};

describe('SchoolsInAreaPanel — error and retry states (Issue #1144)', () => {
  beforeEach(() => {
    mockRefetch.mockReset();
    // Reset to default non-error state
    vi.mocked(useSchoolsByArea).mockReturnValue({
      data: { pages: [] },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
    } as any);
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
    vi.mocked(useSchoolsByArea).mockReturnValue({
      data: { pages: [] },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
    } as any);
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
