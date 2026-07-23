/**
 * SchoolBrowsePanel — search-loading label (Issue #1150)
 *
 * AC1/AC2: While a school search is in flight (isSearching === true AND
 *          schoolSearchResult.isLoading === true) the panel shows an explicit
 *          'Searching for "{query}"…' label above the skeletons so buyers
 *          understand why Popular schools / Browse by area disappeared.
 * AC3 (no-regression): label is ABSENT for empty input (Popular schools shown);
 *          results still render via SchoolCard; "No schools found" empty state
 *          still appears for zero results.
 * AC4: label is derived from existing state — no new query/effect/network call.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockUseSchoolSearch = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: mockUseSchoolSearch,
}));

// Popular schools resolves with one entry so we can assert it is shown for empty
// input (proving the search-loading label is gated to isSearching).
vi.mock('@/hooks/usePopularSchools', () => ({
  usePopularSchools: vi.fn(() => ({
    data: [
      {
        id: 'sch-pop', name: 'Manipal Public School', board: 'CBSE', boardType: null,
        address: 'Manipal', latitude: 13.35, longitude: 74.79,
        distanceKm: 0.5, areaKey: 'IN|KA|Udupi|Manipal',
      },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: { city: 'udupi', areas: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
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

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel() {
  return render(
    <BrowserRouter>
      <QueryClientProvider client={makeQC()}>
        <SchoolBrowsePanel
          city="udupi"
          onSelectSchool={vi.fn()}
          onSelectAreaKey={vi.fn()}
        />
      </QueryClientProvider>
    </BrowserRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SchoolBrowsePanel — search-loading label (Issue #1150)', () => {
  beforeEach(() => {
    mockUseSchoolSearch.mockReset();
  });

  it('AC2: shows the "Searching for {query}…" label while a search is loading', async () => {
    const user = userEvent.setup();
    mockUseSchoolSearch.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderPanel();
    await user.type(screen.getByPlaceholderText('Search school name...'), 'man');

    const label = screen.getByTestId('school-search-loading-label');
    expect(label).toBeInTheDocument();
    expect(label).toHaveTextContent('Searching for');
    expect(label).toHaveTextContent('man');
  });

  it('AC2: trims leading/trailing whitespace in the displayed query', async () => {
    const user = userEvent.setup();
    mockUseSchoolSearch.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderPanel();
    await user.type(screen.getByPlaceholderText('Search school name...'), '  ab');

    // Trimmed: no leading-space artifact in the rendered text.
    expect(screen.getByTestId('school-search-loading-label')).toHaveTextContent(
      /Searching for [“"]ab[”"]/,
    );
  });

  it('AC3: label is ABSENT for empty input and Popular schools is shown', () => {
    mockUseSchoolSearch.mockReturnValue({ data: [], isLoading: false, isError: false });

    renderPanel();
    expect(screen.queryByTestId('school-search-loading-label')).not.toBeInTheDocument();
    expect(screen.getByText('Popular schools')).toBeInTheDocument();
    expect(screen.getByText('Manipal Public School')).toBeInTheDocument();
  });

  it('AC3: results still render via SchoolCard once search resolves with data', async () => {
    const user = userEvent.setup();
    mockUseSchoolSearch.mockReturnValue({
      data: [
        {
          id: 'sch-1', name: 'St Cecily High School', board: 'ICSE', boardType: null,
          address: 'Brahmavar', latitude: 13.4, longitude: 74.7,
          distanceKm: 1.2, areaKey: 'IN|KA|Udupi|Brahmavar',
        },
      ],
      isLoading: false,
      isError: false,
    });

    renderPanel();
    await user.type(screen.getByPlaceholderText('Search school name...'), 'cec');

    expect(screen.queryByTestId('school-search-loading-label')).not.toBeInTheDocument();
    expect(screen.getByText('St Cecily High School')).toBeInTheDocument();
  });

  it('AC3: the search empty state still appears for zero results', async () => {
    const user = userEvent.setup();
    mockUseSchoolSearch.mockReturnValue({ data: [], isLoading: false, isError: false });

    renderPanel();
    await user.type(screen.getByPlaceholderText('Search school name...'), 'zzz');

    expect(screen.queryByTestId('school-search-loading-label')).not.toBeInTheDocument();
    // The search empty branch renders EmptyState with this description. (The branch
    // also passes title="No schools found", but EmptyState renders `heading`, not
    // `title` — a pre-existing prop mismatch outside this issue's scope; asserting on
    // the rendered description is the robust no-regression signal.)
    expect(screen.getByText(/try a different search term/i)).toBeInTheDocument();
  });
});
