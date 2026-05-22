/**
 * SchoolsInAreaPanel — area-first select branching (Issue #1157 Option (i)).
 *
 * AC5: with the `schools` prop populated, the panel renders the area's school cards
 *      (parity with school-first — the prop-mode render path).
 * AC3: with `onSelectSchool` provided (area-first school-picking sub-step), clicking a
 *      school card calls onSelectSchool(school.id) and does NOT call the internal
 *      setSchoolJourney path → parent routes to area-school-combined without a journey flip.
 * School-first regression: WITHOUT the prop, clicking a card calls the internal
 *      setSchoolJourney path (journey flips to school-first) — byte-for-byte unchanged.
 *
 * Exactly one path runs per click.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

// --- Mocks (vi.hoisted ensures they are lifted before vi.mock calls) ---

const mockSetSchoolJourney = vi.hoisted(() => vi.fn());
const mockSetFiltersLive = vi.hoisted(() => vi.fn());
const mockSetSchoolParams = vi.hoisted(() => vi.fn());

const mockUrlState = vi.hoisted(() => ({
  city: 'udupi',
  areaKey: 'IN|KA|Udupi|Manipal',
  viewport: { zoom: 14 },
  schoolId: null,
  radiusKm: null,
  q: '',
  journey: 'area-first' as const,
  groupId: null,
  schoolPicking: true,
  filters: {
    boardFilters: [] as string[],
    categoryFilters: [] as string[],
  },
}));

vi.mock('@/hooks/useDiscoverUrlState', () => ({
  useDiscoverUrlState: vi.fn(() => [
    mockUrlState,
    {
      setFiltersLive: mockSetFiltersLive,
      setSchoolParams: mockSetSchoolParams,
      setSchoolJourney: mockSetSchoolJourney,
      clearAreaContext: vi.fn(),
    },
  ]),
}));

// Internal hook is disabled in prop mode, but it is still called unconditionally
// (Rules of Hooks). Provide a benign default so render does not throw.
vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: vi.fn(() => ({
    data: { pages: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
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
          areaKey: 'IN|KA|Udupi|Manipal',
          name: 'Manipal',
          areaLabel: 'Manipal',
          geoCenterLat: 13.35,
          geoCenterLon: 74.79,
          listingCount: 0,
          schoolCount: 12,
        },
      ],
    },
    isLoading: false,
  })),
}));

import { SchoolsInAreaPanel } from '../SchoolsInAreaPanel';
import { useSchoolsByArea } from '@/hooks/useSchoolsByArea';

const mockedUseSchoolsByArea = vi.mocked(useSchoolsByArea);

// Default standalone-hook return; per-test we override specific flags below.
function hookReturn(overrides: Record<string, unknown> = {}) {
  return {
    data: { pages: [] },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeSchool(overrides: Partial<SchoolResult> = {}): SchoolResult {
  return {
    id: 'school-1',
    name: 'Manipal Public School',
    address: 'Manipal',
    latitude: 13.35,
    longitude: 74.79,
    board: 'CBSE',
    boardType: null,
    schoolCategory: 'primary',
    distanceKm: null,
    prominenceTier: 'notable',
    areaKey: 'IN|KA|Udupi|Manipal',
    ...overrides,
  } as SchoolResult;
}

const TWELVE_SCHOOLS: SchoolResult[] = Array.from({ length: 12 }, (_, i) =>
  makeSchool({ id: `school-${i + 1}`, name: `School ${i + 1}` }),
);

function renderPanel(props: Partial<React.ComponentProps<typeof SchoolsInAreaPanel>> = {}) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <SchoolsInAreaPanel
        journey="area-first"
        onStartOver={vi.fn()}
        schools={TWELVE_SCHOOLS}
        schoolsLoading={false}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockSetSchoolJourney.mockReset();
  mockSetSchoolParams.mockReset();
  mockSetFiltersLive.mockReset();
  mockedUseSchoolsByArea.mockReturnValue(hookReturn());
});

// Standalone mode = no `schools` prop → the panel uses its internal useSchoolsByArea
// hook, which is where the `schools-error-state` + Retry button render in production.
function renderStandalone(props: Partial<React.ComponentProps<typeof SchoolsInAreaPanel>> = {}) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <SchoolsInAreaPanel journey="area-first" onStartOver={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

describe('SchoolsInAreaPanel — prop-mode school rendering (Issue #1157 AC5)', () => {
  it('renders all schools passed via the schools prop (count parity with school-first)', () => {
    renderPanel();
    expect(screen.getAllByTestId('school-card')).toHaveLength(12);
  });
});

describe('SchoolsInAreaPanel — area-first select branch (Issue #1157 AC3)', () => {
  it('with onSelectSchool: clicking a card calls onSelectSchool(school.id), NOT setSchoolJourney', () => {
    const onSelectSchool = vi.fn();
    renderPanel({ onSelectSchool });

    fireEvent.click(screen.getAllByTestId('school-card')[0]);

    expect(onSelectSchool).toHaveBeenCalledTimes(1);
    expect(onSelectSchool).toHaveBeenCalledWith('school-1');
    // Branch is exclusive: the internal journey-flip path must not run.
    expect(mockSetSchoolJourney).not.toHaveBeenCalled();
  });
});

describe('SchoolsInAreaPanel — retry loading feedback (Issue #1204 / #1170 AC6)', () => {
  // Prop mode = production. MapDiscovery passes schools/schoolsError/onSchoolsRetry/
  // schoolsFetching from ONE useSchoolsByArea infinite query. On a no-data refetch React
  // Query reverts status error→pending: schoolsError flips false, schoolsLoading flips true.
  // The panel must keep the error block + Retry-loading affordance mounted across that flip,
  // driven by a LOCAL latch (set on Retry click, cleared when fetching settles) — NOT by a
  // synthetic "isError && isFetching simultaneously" state the real query never produces.

  // Mirrors MapDiscovery's prop wiring across an errored → in-flight refetch transition.
  function renderPropMode(props: Partial<React.ComponentProps<typeof SchoolsInAreaPanel>> = {}) {
    const onSchoolsRetry = vi.fn();
    const utils = render(
      <QueryClientProvider client={makeQC()}>
        <SchoolsInAreaPanel
          journey="area-first"
          onStartOver={vi.fn()}
          schools={[]}
          schoolsLoading={false}
          schoolsError
          schoolsFetching={false}
          onSchoolsRetry={onSchoolsRetry}
          {...props}
        />
      </QueryClientProvider>,
    );
    const rerenderWith = (next: Partial<React.ComponentProps<typeof SchoolsInAreaPanel>>) =>
      utils.rerender(
        <QueryClientProvider client={makeQC()}>
          <SchoolsInAreaPanel
            journey="area-first"
            onStartOver={vi.fn()}
            schools={[]}
            schoolsLoading={false}
            schoolsError={false}
            schoolsFetching={false}
            onSchoolsRetry={onSchoolsRetry}
            {...next}
          />
        </QueryClientProvider>,
      );
    return { ...utils, onSchoolsRetry, rerenderWith };
  }

  it('error retry button is idle (enabled, "Retry") before any retry is clicked', () => {
    renderPropMode();
    const retry = screen.getByTestId('schools-error-retry');
    expect(retry).toHaveTextContent('Retry');
    expect(retry).not.toBeDisabled();
    expect(retry).toHaveAttribute('aria-busy', 'false');
  });

  it('keeps the error block + Retry-loading state mounted across the real error→pending flip', () => {
    const { rerenderWith } = renderPropMode();

    // Click Retry while errored (the only place schools-error-retry exists).
    fireEvent.click(screen.getByTestId('schools-error-retry'));

    // Production transition: the parent-owned no-data query reverts error→pending, so
    // schoolsError flips false and schoolsLoading flips true while the refetch is in flight.
    rerenderWith({ schoolsError: false, schoolsLoading: true, schoolsFetching: true });

    // The error block must STAY mounted (not unmount to a bare skeleton), with the Retry
    // button in its loading state. This FAILS on origin/main (skeleton wins).
    const retry = screen.getByTestId('schools-error-retry');
    expect(screen.getByTestId('schools-error-state')).toBeInTheDocument();
    expect(retry).toHaveTextContent('Retrying…');
    expect(retry).toBeDisabled();
    expect(retry).toHaveAttribute('aria-busy', 'true');
  });

  it('fires exactly one refetch (onSchoolsRetry) per Retry click', () => {
    const { onSchoolsRetry } = renderPropMode();
    fireEvent.click(screen.getByTestId('schools-error-retry'));
    expect(onSchoolsRetry).toHaveBeenCalledTimes(1);
  });

  it('recovery: pending → success clears the error block and renders the school list', () => {
    const { rerenderWith } = renderPropMode();
    fireEvent.click(screen.getByTestId('schools-error-retry'));
    rerenderWith({ schoolsError: false, schoolsLoading: true, schoolsFetching: true });

    // Refetch settles successfully with data.
    rerenderWith({
      schools: TWELVE_SCHOOLS,
      schoolsError: false,
      schoolsLoading: false,
      schoolsFetching: false,
    });

    expect(screen.queryByTestId('schools-error-state')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('school-card')).toHaveLength(12);
  });

  it('re-error: pending → fresh error re-shows the error block with Retry enabled again', () => {
    const { rerenderWith } = renderPropMode();
    fireEvent.click(screen.getByTestId('schools-error-retry'));
    rerenderWith({ schoolsError: false, schoolsLoading: true, schoolsFetching: true });

    // Refetch settles into a fresh error (no data).
    rerenderWith({ schoolsError: true, schoolsLoading: false, schoolsFetching: false });

    const retry = screen.getByTestId('schools-error-retry');
    expect(screen.getByTestId('schools-error-state')).toBeInTheDocument();
    expect(retry).toHaveTextContent('Retry');
    expect(retry).not.toBeDisabled();
    expect(retry).toHaveAttribute('aria-busy', 'false');
  });

  it('genuine initial load shows the skeleton, not the error block (latch starts false)', () => {
    render(
      <QueryClientProvider client={makeQC()}>
        <SchoolsInAreaPanel
          journey="area-first"
          onStartOver={vi.fn()}
          schools={[]}
          schoolsLoading
          schoolsError={false}
          schoolsFetching
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId('schools-error-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('school-card')).not.toBeInTheDocument();
    // Skeletons are the only content; no error/empty affordance.
    expect(screen.queryByText(/no schools found/i)).not.toBeInTheDocument();
  });

  it('genuine successful-empty shows the empty state with no retry spinner', () => {
    render(
      <QueryClientProvider client={makeQC()}>
        <SchoolsInAreaPanel
          journey="area-first"
          onStartOver={vi.fn()}
          schools={[]}
          schoolsLoading={false}
          schoolsError={false}
          schoolsFetching={false}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/no schools found/i)).toBeInTheDocument();
    expect(screen.queryByTestId('schools-error-state')).not.toBeInTheDocument();
  });

  it('does NOT enter the Retrying state for a "Load more" pagination fetch (standalone)', () => {
    // Standalone hook mode: a pagination fetch sets isFetching AND isFetchingNextPage.
    // No retry was clicked, so the latch is false and the (errored) Retry button stays idle.
    mockedUseSchoolsByArea.mockReturnValue(
      hookReturn({ isError: true, isFetching: true, isFetchingNextPage: true }),
    );
    renderStandalone();

    const retry = screen.getByTestId('schools-error-retry');
    expect(retry).toHaveTextContent('Retry');
    expect(retry).not.toBeDisabled();
  });
});

describe('SchoolsInAreaPanel — school-first select branch (regression: unchanged)', () => {
  it('without onSelectSchool: clicking a card calls the internal setSchoolJourney path', () => {
    renderPanel({ journey: 'school-first' });

    fireEvent.click(screen.getAllByTestId('school-card')[0]);

    expect(mockSetSchoolJourney).toHaveBeenCalledTimes(1);
    expect(mockSetSchoolJourney).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        areaKey: 'IN|KA|Udupi|Manipal',
      }),
    );
  });
});
