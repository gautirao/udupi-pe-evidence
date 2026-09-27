/**
 * SchoolBrowsePanel — error and retry states (Issue #1144)
 *
 * AC3: popularSchoolsResult.isError and discoverAreasResult.isError render
 *      inline error messages with retry actions in their respective sections.
 * AC4: Empty-state semantics unchanged; loading / success paths unaffected.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockPopularRefetch = vi.hoisted(() => vi.fn());
const mockAreasRefetch = vi.hoisted(() => vi.fn());

const mockPopularSchoolsResult = vi.hoisted(() => ({
  data: undefined as unknown[],
  isLoading: false,
  isError: false,
  refetch: mockPopularRefetch,
}));

const mockDiscoverAreasResult = vi.hoisted(() => ({
  data: undefined as { areas: unknown[] } | undefined,
  isLoading: false,
  isError: false,
  refetch: mockAreasRefetch,
}));

vi.mock('@/hooks/usePopularSchools', () => ({
  usePopularSchools: vi.fn(() => mockPopularSchoolsResult),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => mockDiscoverAreasResult),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
  })),
}));

// Issue #1953 (build step 2) — SchoolBrowsePanel now consumes the
// DiscoverProvider facade instead of calling useDiscoverUrlState() directly.
vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'udupi',
    areaKey: null,
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: 'school-first' as const,
    groupId: null,
    filters: {
      propertyTypes: [],
      bedrooms: [],
      priceMin: undefined,
      priceMax: undefined,
      sellerTypes: [],
      boardFilters: [],
      categoryFilters: [],
    },
  }),
  useDiscoverViewport: () => null,
  useDiscoverActions: () => ({
    setSchoolJourney: vi.fn(),
    setSchoolParams: vi.fn(),
    clearAreaContext: vi.fn(),
    setFiltersLive: vi.fn(),
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

import { SchoolBrowsePanel } from '../SchoolJourneyPanels';
import { usePopularSchools } from '@/hooks/usePopularSchools';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { mockUseQueryResult } from '@/test-utils/mockReactQueryResults';

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel() {
  return render(
    <BrowserRouter>
      <QueryClientProvider client={makeQC()}>
        <SchoolBrowsePanel
          view={{ chrome: {}, city: { slug: 'udupi' }, scope: {}, zones: {} }}
          commands={{ chrome: {}, scope: {}, navigation: { selectAreaKey: vi.fn() } }}
        />
      </QueryClientProvider>
    </BrowserRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SchoolBrowsePanel — popular schools error state (Issue #1144 AC3)', () => {
  beforeEach(() => {
    mockPopularRefetch.mockReset();
    mockAreasRefetch.mockReset();
    // Default: no errors, no data
    vi.mocked(usePopularSchools).mockReturnValue(mockUseQueryResult({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: mockPopularRefetch,
    }));
    vi.mocked(useDiscoverAreas).mockReturnValue(mockUseQueryResult({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: mockAreasRefetch,
    }));
  });

  it('AC3: renders popular-schools inline error when popularSchoolsResult.isError is true', () => {
    vi.mocked(usePopularSchools).mockReturnValue(mockUseQueryResult({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockPopularRefetch,
    }));

    renderPanel();
    expect(screen.getByTestId('popular-schools-error-state')).toBeInTheDocument();
    expect(screen.getByText(/could not load popular schools/i)).toBeInTheDocument();
  });

  it('AC3: popular-schools error state has a Retry button that calls refetch', () => {
    vi.mocked(usePopularSchools).mockReturnValue(mockUseQueryResult({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockPopularRefetch,
    }));

    renderPanel();
    fireEvent.click(screen.getByTestId('popular-schools-error-retry'));
    expect(mockPopularRefetch).toHaveBeenCalledOnce();
  });

  it('AC4: popular-schools section renders normally when not errored and has data', () => {
    vi.mocked(usePopularSchools).mockReturnValue(mockUseQueryResult({
      data: [
        {
          id: 'sch-1', name: 'Manipal Public School', board: 'CBSE', boardType: null,
          address: 'Manipal', latitude: 13.35, longitude: 74.79,
          distanceKm: 0.5, areaKey: 'IN|KA|Udupi|Manipal',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: mockPopularRefetch,
    }));

    renderPanel();
    expect(screen.queryByTestId('popular-schools-error-state')).not.toBeInTheDocument();
    expect(screen.getByText('Manipal Public School')).toBeInTheDocument();
  });
});

describe('SchoolBrowsePanel — discover areas error state (Issue #1144 AC3)', () => {
  beforeEach(() => {
    mockPopularRefetch.mockReset();
    mockAreasRefetch.mockReset();
    vi.mocked(usePopularSchools).mockReturnValue(mockUseQueryResult({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: mockPopularRefetch,
    }));
    vi.mocked(useDiscoverAreas).mockReturnValue(mockUseQueryResult({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: mockAreasRefetch,
    }));
  });

  it('AC3: renders areas inline error when discoverAreasResult.isError is true', () => {
    vi.mocked(useDiscoverAreas).mockReturnValue(mockUseQueryResult({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockAreasRefetch,
    }));

    renderPanel();
    expect(screen.getByTestId('discover-areas-error-state')).toBeInTheDocument();
    expect(screen.getByText(/could not load school areas/i)).toBeInTheDocument();
  });

  it('AC3: areas error state has a Retry button that calls refetch', () => {
    vi.mocked(useDiscoverAreas).mockReturnValue(mockUseQueryResult({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockAreasRefetch,
    }));

    renderPanel();
    fireEvent.click(screen.getByTestId('discover-areas-error-retry'));
    expect(mockAreasRefetch).toHaveBeenCalledOnce();
  });

  it('AC4: areas section renders normally when not errored and has data', () => {
    vi.mocked(useDiscoverAreas).mockReturnValue(mockUseQueryResult({
      data: {
        city: 'udupi',
        areas: [
          {
            areaKey: 'IN|KA|Udupi|Manipal', name: 'Manipal',
            schoolCount: 6, listingCount: 4,
            geoCenterLat: 13.35, geoCenterLon: 74.79,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: mockAreasRefetch,
    }));

    renderPanel();
    expect(screen.queryByTestId('discover-areas-error-state')).not.toBeInTheDocument();
    expect(screen.getByTestId('area-card')).toBeInTheDocument();
  });

  it('AC3: both error states render independently when both hooks error', () => {
    vi.mocked(usePopularSchools).mockReturnValue(mockUseQueryResult({
      data: undefined, isLoading: false, isError: true, refetch: mockPopularRefetch,
    }));
    vi.mocked(useDiscoverAreas).mockReturnValue(mockUseQueryResult({
      data: undefined, isLoading: false, isError: true, refetch: mockAreasRefetch,
    }));

    renderPanel();
    expect(screen.getByTestId('popular-schools-error-state')).toBeInTheDocument();
    expect(screen.getByTestId('discover-areas-error-state')).toBeInTheDocument();
  });
});
