/**
 * SchoolBrowsePanel — zero-results headline (Issue #1196)
 *
 * Regression: the search zero-results branch renders the shared EmptyState with
 * the headline "No schools found". The headline was passed via a `title=` prop,
 * but EmptyState reads its headline from `heading=` (rendered as an <h3>), so the
 * headline was silently dropped — only the description showed.
 *
 * AC1: the "No schools found" headline renders in the zero-results EmptyState.
 * AC2: the description "Try a different search term." still renders alongside it.
 * AC4: this test fails on the buggy `title=` prop (heading absent) and passes
 *      after the rename to `heading=`. No waitForTimeout — driven by userEvent.
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

vi.mock('@/hooks/usePopularSchools', () => ({
  usePopularSchools: vi.fn(() => ({
    data: [],
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
          view={{ chrome: {}, city: { slug: 'udupi' }, scope: {}, zones: {} }}
          commands={{ chrome: {}, scope: {}, navigation: { selectAreaKey: vi.fn() } }}
        />
      </QueryClientProvider>
    </BrowserRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SchoolBrowsePanel — zero-results headline (Issue #1196)', () => {
  beforeEach(() => {
    mockUseSchoolSearch.mockReset();
  });

  it('AC1: renders the "No schools found" headline in the zero-results state', async () => {
    const user = userEvent.setup();
    // Search active (>= 2 chars), settled, zero results.
    mockUseSchoolSearch.mockReturnValue({ data: [], isLoading: false, isError: false });

    renderPanel();
    await user.type(screen.getByPlaceholderText('Search school name...'), 'zzz');

    // Asserted by role/visible text — the headline <h3> has no data-testid, and the
    // EmptyState component must stay untouched. This is the assertion that fails when
    // the headline is passed via the wrong `title=` prop (heading <h3> renders empty).
    expect(
      screen.getByRole('heading', { name: /no schools found/i }),
    ).toBeInTheDocument();
  });

  it('AC2: still renders the description alongside the headline', async () => {
    const user = userEvent.setup();
    mockUseSchoolSearch.mockReturnValue({ data: [], isLoading: false, isError: false });

    renderPanel();
    await user.type(screen.getByPlaceholderText('Search school name...'), 'zzz');

    expect(screen.getByText(/try a different search term/i)).toBeInTheDocument();
  });
});
