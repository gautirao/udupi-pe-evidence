/**
 * Characterization test — Issue #2661 commit 1 (H4, CRITICAL per qa-fast).
 *
 * SchoolJourneyPanels.tsx's `SchoolsInAreaPanel` wrapper renders its "Homes in area"
 * footer section based on `areaListings !== undefined || isLoadingAreaListings`
 * (see `homesSection` in SchoolJourneyPanels.tsx) — NOT on `areaListings.length`.
 * This distinguishes:
 *   - areaListings === undefined (and not loading): the section is ABSENT entirely
 *     (parent hasn't wired area-listings — e.g. plain school-first with no area).
 *   - areaListings === [] (empty array): the section IS PRESENT, showing the
 *     "No homes/rentals ... yet" empty message.
 * A refactor that swaps this to `(areaListings ?? []).length` or similar would
 * silently merge these two states. This oracle pins both arms explicitly.
 *
 * Not already covered: existing tests for the wrapper (SchoolsInAreaPanel.school-first-
 * redesign.test.tsx) only ever pass a populated `areaListings` array; none exercise the
 * undefined-vs-empty-array boundary.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'udupi',
    areaKey: 'IN|KA|Udupi|Manipal',
    groupId: null,
    journey: 'school-first' as const,
    intent: 'buy',
    filters: { boardFilters: [], categoryFilters: [] },
  }),
  useDiscoverViewport: () => ({ zoom: 14 }),
  useDiscoverActions: () => ({
    setFiltersLive: vi.fn(),
    setSchoolParams: vi.fn(),
    setSchoolJourney: vi.fn(),
    clearAreaContext: vi.fn(),
  }),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: () => ({ data: { city: 'udupi', areas: [] }, isLoading: false }),
}));

vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

import { SchoolsInAreaPanel } from '../SchoolJourneyPanels';

const AREA_POINT = { areaKey: 'IN|KA|Udupi|Manipal', areaLabel: 'Manipal' } as unknown as AreaPoint;

function renderWrapper(props: { areaListings?: unknown[]; isLoadingAreaListings?: boolean } = {}) {
  const { areaListings, isLoadingAreaListings } = props;
  return render(
    <MemoryRouter>
      <SchoolsInAreaPanel
        view={{
          chrome: { journey: 'school-first' },
          viewer: { intent: 'buy' },
          area: AREA_POINT,
          schools: { data: [] },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          homes: { data: areaListings as any, loading: isLoadingAreaListings },
        }}
        commands={{ chrome: {}, schools: {}, homes: {} }}
      />
    </MemoryRouter>,
  );
}

describe('SchoolsInAreaPanel wrapper — homes-section gating (Issue #2661 H4, CRITICAL)', () => {
  it('areaListings === undefined (not loading): the homes section is ABSENT', () => {
    renderWrapper({ areaListings: undefined, isLoadingAreaListings: false });
    expect(screen.queryByTestId('schools-in-area-properties')).not.toBeInTheDocument();
  });

  it('areaListings === [] (empty array): the homes section IS PRESENT with the empty message', () => {
    renderWrapper({ areaListings: [], isLoadingAreaListings: false });
    const section = screen.getByTestId('schools-in-area-properties');
    expect(section).toBeInTheDocument();
    expect(section).toHaveTextContent(/no homes for sale in manipal yet/i);
  });

  it('areaListings === undefined but isLoadingAreaListings === true: the section IS PRESENT (loading skeleton)', () => {
    renderWrapper({ areaListings: undefined, isLoadingAreaListings: true });
    expect(screen.getByTestId('schools-in-area-properties')).toBeInTheDocument();
  });
});
