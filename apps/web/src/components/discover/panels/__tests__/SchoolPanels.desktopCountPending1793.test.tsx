/**
 * Issue #1793 SR-024 (PR-A, RB3) — panel-level wiring guard for the desktop SchoolContextHeader.
 *
 * #2770 moved the desktop "N homes within X km" stat into SchoolContextHeader. The leaf test
 * (SchoolContextHeader.countPending1793) cannot notice a PANEL that stops passing `countPending`.
 * These tests render SchoolSelectedPanel (isDesktop) and AreaSchoolCombinedPanel (compactContext,
 * isDesktop, and both) and assert, for the anonymous viewer, that the count is omitted while the
 * school-radius request is loading / failed-empty, and shown for a genuine settled zero and for a
 * signed-in viewer. Every case first asserts the HEADER itself rendered (radius chip INSIDE the
 * school-summary-band, no breadcrumb) so the absence assertions cannot pass vacuously.
 */
import React from 'react';
import { screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { SchoolSelectedPanel, AreaSchoolCombinedPanel } from '../SchoolJourneyPanels';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

const area: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.3531,
  geo_center_lon: 74.7935,
  bbox: [[13.34, 74.78], [13.37, 74.81]],
};

const school: SchoolResult = {
  id: 'sch-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  latitude: 13.3531,
  longitude: 74.7935,
  address: 'Manipal, Udupi District',
  distanceKm: 0.5,
};

interface Scenario {
  listings?: DiscoverCityListingItem[];
  loading?: boolean;
  error?: boolean;
  isAuthenticated?: boolean;
}

const common = (s: Scenario) => ({
  viewer: { intent: 'buy' as const, isAuthenticated: s.isAuthenticated ?? false },
  school,
  radius: { km: 3 },
  listings: { data: s.listings ?? [], loading: s.loading ?? false, error: s.error },
  propertyFilters: { value: {} },
});

const commonCommands = () => ({
  chrome: {},
  radius: { change: vi.fn() },
  listings: { retry: vi.fn() },
  propertyFilters: { replace: vi.fn() },
});

function renderSelectedDesktop(s: Scenario) {
  return renderWithProviders(
    <DiscoverProvider>
      <SchoolSelectedPanel
        isDesktop
        view={{ chrome: {}, ...common(s), boundedSearch: {} }}
        commands={commonCommands()}
      />
    </DiscoverProvider>,
    { router: 'browser' },
  );
}

function renderCombined(s: Scenario, flags: { compactContext?: boolean; isDesktop?: boolean }) {
  return renderWithProviders(
    <DiscoverProvider>
      <AreaSchoolCombinedPanel
        {...flags}
        view={{ chrome: {}, ...common(s), area }}
        commands={{ ...commonCommands(), school: { clear: vi.fn() } }}
      />
    </DiscoverProvider>,
    { router: 'browser' },
  );
}

const CASES = [
  {
    name: 'SchoolSelectedPanel (isDesktop)',
    chip: 'radius-btn-3',
    render: (s: Scenario) => renderSelectedDesktop(s),
  },
  {
    name: 'AreaSchoolCombinedPanel (compactContext)',
    chip: 'combined-radius-btn-3',
    render: (s: Scenario) => renderCombined(s, { compactContext: true }),
  },
  {
    name: 'AreaSchoolCombinedPanel (isDesktop)',
    chip: 'combined-radius-btn-3',
    render: (s: Scenario) => renderCombined(s, { isDesktop: true }),
  },
  {
    name: 'AreaSchoolCombinedPanel (compactContext + isDesktop)',
    chip: 'combined-radius-btn-3',
    render: (s: Scenario) => renderCombined(s, { compactContext: true, isDesktop: true }),
  },
];

describe.each(CASES)('$name — desktop header countPending wiring (#1793 RB3)', ({ chip, render }) => {
  /** Positive proof the desktop SchoolContextHeader (not the stacked band) rendered. */
  function expectDesktopHeaderRendered() {
    const band = screen.getByTestId('school-summary-band');
    expect(within(band).getByTestId('school-summary-name')).toHaveTextContent('Manipal Public School');
    expect(within(band).getByTestId(chip)).toBeInTheDocument();
    expect(within(band).getByTestId('change-school-btn')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'School breadcrumb' })).not.toBeInTheDocument();
  }

  it('anonymous + loading: count omitted, header present', () => {
    render({ loading: true });
    expectDesktopHeaderRendered();
    expect(screen.queryByTestId('school-summary-count')).not.toBeInTheDocument();
    expect(screen.queryByText(/homes? within 3 km/)).not.toBeInTheDocument();
  });

  it('anonymous + error with no listings: count omitted, error block shown, header present', () => {
    render({ error: true });
    expectDesktopHeaderRendered();
    expect(screen.getByTestId('school-radius-listings-error')).toBeInTheDocument();
    expect(screen.queryByTestId('school-summary-count')).not.toBeInTheDocument();
    expect(screen.queryByText(/homes? within 3 km/)).not.toBeInTheDocument();
  });

  it('anonymous + settled genuine zero: count IS shown as 0', () => {
    render({});
    expectDesktopHeaderRendered();
    expect(screen.getByTestId('school-summary-count')).toHaveTextContent('0 homes within 3 km');
  });

  it('control: signed-in viewer is unchanged, count shown (even while loading with no data)', () => {
    render({ isAuthenticated: true, loading: true });
    expectDesktopHeaderRendered();
    expect(screen.getByTestId('school-summary-count')).toHaveTextContent('0 homes within 3 km');
  });
});
