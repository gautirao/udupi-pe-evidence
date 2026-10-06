/**
 * Issue #1793 SR-024 (AC A1) — a failed school-radius listings request must render the
 * request-failure block + Retry in BOTH school result panels, never SchoolRadiusEmptyState
 * ("No homes found within N km"), which would present a backend failure as an empty market.
 */
import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { SchoolSelectedPanel, AreaSchoolCombinedPanel } from '../SchoolJourneyPanels';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

const mockArea: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.3531,
  geo_center_lon: 74.7935,
  bbox: [[13.34, 74.78], [13.37, 74.81]],
};

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

const makeListing = (id: string): DiscoverCityListingItem => ({
  id,
  pricePaise: 5000000 * 100,
  propertyType: 'apartment',
  locality: 'Manipal',
  primaryImageUrl: null,
  lat: 13.354,
  lon: 74.791,
});

interface Scenario {
  listings?: DiscoverCityListingItem[];
  loading?: boolean;
  error?: boolean;
  retry?: () => void;
}

function selectedProps(s: Scenario): React.ComponentProps<typeof SchoolSelectedPanel> {
  return {
    view: {
      chrome: {},
      viewer: { intent: 'buy', isAuthenticated: false },
      school: mockSchool,
      radius: { km: 3 },
      listings: { data: s.listings ?? [], loading: s.loading ?? false, error: s.error },
      propertyFilters: { value: {} },
      boundedSearch: {},
    },
    commands: {
      chrome: {},
      radius: { change: vi.fn() },
      listings: { retry: s.retry },
      propertyFilters: { replace: vi.fn() },
    },
  };
}

function combinedProps(s: Scenario): React.ComponentProps<typeof AreaSchoolCombinedPanel> {
  return {
    view: {
      chrome: {},
      viewer: { intent: 'buy', isAuthenticated: false },
      area: mockArea,
      school: mockSchool,
      radius: { km: 3 },
      listings: { data: s.listings ?? [], loading: s.loading ?? false, error: s.error },
      propertyFilters: { value: {} },
    },
    commands: {
      chrome: {},
      radius: { change: vi.fn() },
      listings: { retry: s.retry },
      propertyFilters: { replace: vi.fn() },
      school: { clear: vi.fn() },
    },
  };
}

const PANELS = [
  {
    name: 'SchoolSelectedPanel',
    render: (s: Scenario) =>
      renderWithProviders(
        <DiscoverProvider>
          <SchoolSelectedPanel {...selectedProps(s)} />
        </DiscoverProvider>,
        { router: 'browser' },
      ),
  },
  {
    name: 'AreaSchoolCombinedPanel',
    render: (s: Scenario) =>
      renderWithProviders(
        <DiscoverProvider>
          <AreaSchoolCombinedPanel {...combinedProps(s)} />
        </DiscoverProvider>,
        { router: 'browser' },
      ),
  },
];

describe.each(PANELS)('$name — #1793 A1 request-failure state', ({ render }) => {
  it('error + no listings renders the error block with Retry, NOT the "no homes within N km" empty state', () => {
    render({ error: true, retry: vi.fn() });
    expect(screen.getByTestId('school-radius-listings-error')).toBeInTheDocument();
    expect(screen.getByText('We could not load these results')).toBeInTheDocument();
    expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();
  });

  it('Retry calls the supplied refetch exactly once', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render({ error: true, retry });
    await user.click(screen.getByTestId('school-radius-listings-error-retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('control: a genuine zero result (no error) still renders the empty state, not the error block', () => {
    render({ error: false });
    expect(screen.getByTestId('school-radius-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('school-radius-listings-error')).not.toBeInTheDocument();
  });

  it('loading never renders either the error block or the empty state', () => {
    render({ loading: true, error: true });
    expect(screen.queryByTestId('school-radius-listings-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();
  });

  it('results retained alongside an error: the cards stay (no full-replace error block)', () => {
    render({ error: true, listings: [makeListing('l-1')], retry: vi.fn() });
    expect(screen.queryByTestId('school-radius-listings-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();
  });
});
