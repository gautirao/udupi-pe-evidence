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
});

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
