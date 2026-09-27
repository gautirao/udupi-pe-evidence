/**
 * Characterization test — Issue #1160 / #2661 commit 1 (H1, CRITICAL per qa-fast).
 *
 * SchoolBrowsePanel.handleSchoolSelect must call urlActions.setSchoolJourney(...) with
 * a payload that includes areaKey (plus schoolId/radiusKm/lat/lon/zoom) atomically, and
 * must NEVER delegate to the parent's onSelectSchool callback. See the in-source comment
 * at SchoolJourneyPanels.tsx (handleSchoolSelect, "Issue #1160 cycle-3") for the React 18
 * batching bug this guards against: calling onSelectSchool here would race a second
 * setUrlParams call in the same synchronous handler and silently drop areaKey.
 *
 * This is a regression oracle for the upcoming decomposition (#2661): it must keep
 * passing byte-for-byte after SchoolBrowsePanel is extracted/moved in later commits.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';

const mockSetSchoolJourney = vi.hoisted(() => vi.fn());
const mockViewport = vi.hoisted(() => ({ zoom: 16 }));

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'udupi',
    areaKey: null,
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: 'school-first' as const,
    groupId: null,
    filters: { boardFilters: [], categoryFilters: [] },
  }),
  useDiscoverViewport: () => mockViewport,
  useDiscoverActions: () => ({
    setSchoolJourney: mockSetSchoolJourney,
    setSchoolParams: vi.fn(),
    clearAreaContext: vi.fn(),
    setFiltersLive: vi.fn(),
  }),
}));

const POPULAR_SCHOOL = {
  id: 'sch-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  address: 'Manipal, Udupi District',
  latitude: 13.3531,
  longitude: 74.7935,
  distanceKm: 0.5,
  areaKey: 'IN|KA|Udupi|Manipal',
};

vi.mock('@/hooks/usePopularSchools', () => ({
  usePopularSchools: vi.fn(() => ({
    data: [POPULAR_SCHOOL],
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

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
}));

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

beforeEach(() => {
  mockSetSchoolJourney.mockReset();
});

describe('SchoolBrowsePanel — school-card select (Issue #1160, CRITICAL)', () => {
  it('clicking a school card fires setSchoolJourney exactly once with areaKey (+ schoolId/radiusKm/lat/lon/zoom)', () => {
    renderPanel();

    fireEvent.click(screen.getByTestId('school-card'));

    expect(mockSetSchoolJourney).toHaveBeenCalledTimes(1);
    expect(mockSetSchoolJourney).toHaveBeenCalledWith({
      schoolId: POPULAR_SCHOOL.id,
      radiusKm: DEFAULT_SCHOOL_RADIUS_KM,
      lat: POPULAR_SCHOOL.latitude,
      lon: POPULAR_SCHOOL.longitude,
      zoom: mockViewport.zoom,
      areaKey: POPULAR_SCHOOL.areaKey,
    });
    // Issue #2661 commit 5 — the #1160 guard ("never delegate to onSelectSchool")
    // is now a STRUCTURAL guarantee: SchoolBrowsePanel's `commands` type has no
    // select-school-equivalent action anywhere, so there is nothing left to call.
    // See schoolBrowsePanel.noSelectSchoolCommand.test.ts for the type-level guard.
  });
});
