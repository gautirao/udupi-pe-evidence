/**
 * Radius-snap table — Issue #2661 commit 1 characterization.
 *
 * Exercises SchoolSelectedPanel's internal snapRadiusKm(radiusKm) across the full
 * input table {null, 0, 1, 2, 4, 7, 8, 15, NaN}, asserting exactly one radius chip
 * ([3, 5, 10]) is aria-pressed=true and it is the expected snapped value.
 * snapRadiusKm is not exported yet (commit 2 extracts it to
 * schools/radius/radiusOptions.ts with its own colocated unit test) — this test
 * exercises it indirectly via the rendered chips, so it stays valid unchanged
 * after that extraction (same render, same DOM).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { SchoolSelectedPanel } from '../SchoolJourneyPanels';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

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

function renderPanel(radiusKm: number | null) {
  return renderWithProviders(
    <DiscoverProvider>
      <SchoolSelectedPanel
        view={{
          chrome: {},
          viewer: { isAuthenticated: false },
          school: mockSchool,
          radius: { km: radiusKm },
          listings: { data: [], loading: false },
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

describe('SchoolSelectedPanel — radius-snap table (Issue #2661)', () => {
  it.each<[number | null, 3 | 5 | 10]>([
    [null, 3],
    [0, 3],
    [1, 3],
    [2, 3],
    [4, 3],
    [7, 5],
    [8, 10],
    [15, 10],
    [NaN, 3],
  ])('radiusKm=%p snaps to exactly one active chip: %i km', (input, expected) => {
    renderPanel(input);
    const chips: Array<[3 | 5 | 10, HTMLElement]> = [3, 5, 10].map((km) => [
      km as 3 | 5 | 10,
      screen.getByTestId(`radius-btn-${km}`),
    ]);

    const pressed = chips.filter(([, el]) => el.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0][0]).toBe(expected);
  });
});
