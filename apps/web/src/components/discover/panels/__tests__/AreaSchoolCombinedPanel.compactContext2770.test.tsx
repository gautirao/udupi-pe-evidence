/**
 * Issue #2770 — compact selected-school context.
 *
 * Desktop reskin (compactContext / isDesktop): ONE context block (name, board, Change school,
 * radius chips, "N homes within X km"), no stacked "Search radius" caption. Below it (mobile and
 * 821-1365): the bounded-compaction band — breadcrumb kept, caption sr-only, same testids.
 * AC5 no-dead-controls: a Filters control exists ONLY when filtersContent is provided.
 */
import React from 'react';
import { screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSchoolCombinedPanel, SchoolSelectedPanel } from '../SchoolJourneyPanels';
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

const listing = (id: string): DiscoverCityListingItem => ({
  id,
  pricePaise: 5000000 * 100,
  propertyType: 'apartment',
  locality: 'Manipal',
  primaryImageUrl: null,
  lat: 13.354,
  lon: 74.791,
});

interface CombinedOpts {
  compactContext?: boolean;
  isDesktop?: boolean;
  filtersContent?: React.ReactNode;
  onClearSchool?: () => void;
  onRadiusChange?: (km: number) => void;
}

function renderCombined({ compactContext, isDesktop, filtersContent, onClearSchool = vi.fn(), onRadiusChange = vi.fn() }: CombinedOpts = {}) {
  return renderWithProviders(
    <DiscoverProvider>
      <AreaSchoolCombinedPanel
        compactContext={compactContext}
        isDesktop={isDesktop}
        view={{
          chrome: { filtersContent },
          viewer: { isAuthenticated: false },
          area,
          school,
          radius: { km: 3 },
          listings: { data: [listing('l-1'), listing('l-2')], loading: false },
          propertyFilters: { value: {} },
        }}
        commands={{
          chrome: {},
          radius: { change: onRadiusChange },
          listings: {},
          propertyFilters: { replace: vi.fn() },
          school: { clear: onClearSchool },
        }}
      />
    </DiscoverProvider>,
    { router: 'browser' },
  );
}

describe('AreaSchoolCombinedPanel — compact desktop context block (#2770)', () => {
  it('renders name, board, Change school, radius chips and the count inside ONE school-summary-band', () => {
    renderCombined({ compactContext: true });
    const band = screen.getByTestId('school-summary-band');
    expect(band.className).toContain('bg-[#0F172A]');
    expect(within(band).getByTestId('school-summary-name')).toHaveTextContent('Manipal Public School');
    expect(within(band).getByText('CBSE')).toBeInTheDocument();
    expect(within(band).getByTestId('change-school-btn')).toBeInTheDocument();
    for (const km of [3, 5, 10]) {
      expect(within(band).getByTestId(`combined-radius-btn-${km}`)).toBeInTheDocument();
    }
    expect(within(band).getByTestId('school-summary-count')).toHaveTextContent('2 homes within 3 km');
    // Stacked-only affordances are gone: no breadcrumb, no visible "Search radius" caption.
    expect(screen.queryByRole('navigation', { name: 'School breadcrumb' })).not.toBeInTheDocument();
    expect(screen.queryByText('Search radius')).not.toBeInTheDocument();
  });

  it('chips never wrap their label and the count truncates instead of squeezing them', () => {
    renderCombined({ compactContext: true });
    for (const km of [3, 5, 10]) {
      expect(screen.getByTestId(`combined-radius-btn-${km}`).className).toContain('whitespace-nowrap');
    }
    const count = screen.getByTestId('school-summary-count');
    expect(count.className).toContain('min-w-0');
    expect(count.className).toContain('truncate');
  });

  it('marks the active radius pressed and operates the chips', () => {
    const onRadiusChange = vi.fn();
    renderCombined({ compactContext: true, onRadiusChange });
    expect(screen.getByTestId('combined-radius-btn-3')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('combined-radius-btn-5')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByTestId('combined-radius-btn-10'));
    expect(onRadiusChange).toHaveBeenCalledWith(10);
  });

  it('Change school keeps its behaviour: calls school.clear', () => {
    const onClearSchool = vi.fn();
    renderCombined({ compactContext: true, onClearSchool });
    fireEvent.click(screen.getByTestId('change-school-btn'));
    expect(onClearSchool).toHaveBeenCalledTimes(1);
  });

  it('keeps the count line above the grid and the #2769 grid wrapper', () => {
    renderCombined({ compactContext: true });
    expect(screen.getByTestId('radius-result-heading')).toBeInTheDocument();
    expect(screen.getByTestId('radius-result-count')).toHaveTextContent('2');
    const body = screen.getByTestId('combined-listings-body');
    expect(body.className).toContain('discover-panel-container');
    expect(body.querySelector(':scope > .discover-results-grid')).not.toBeNull();
  });

  it('isDesktop alone also selects the compact block (legacy bridge passes isDesktop only)', () => {
    renderCombined({ isDesktop: true });
    expect(screen.queryByRole('navigation', { name: 'School breadcrumb' })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('school-summary-band')).getByTestId('combined-radius-btn-3')).toBeInTheDocument();
  });
});

describe('AreaSchoolCombinedPanel — bounded compaction below the desktop reskin (#2770)', () => {
  it('keeps the stacked band (breadcrumb, change button, count) and the radius chips outside it', () => {
    renderCombined();
    const band = screen.getByTestId('school-summary-band');
    expect(band.className).toContain('bg-[#0F172A]');
    expect(within(band).getByRole('navigation', { name: 'School breadcrumb' })).toBeInTheDocument();
    expect(within(band).getByTestId('school-summary-name')).toHaveTextContent('Manipal Public School');
    expect(within(band).getByTestId('change-school-btn')).toBeInTheDocument();
    expect(within(band).getByTestId('school-summary-count')).toHaveTextContent('2');
    for (const km of [3, 5, 10]) {
      const chip = screen.getByTestId(`combined-radius-btn-${km}`);
      expect(band.contains(chip)).toBe(false);
      expect(chip.className).toContain('min-h-11'); // >= 44px touch target
    }
    // Caption stays in the DOM for assistive tech, but is visually hidden.
    expect(screen.getByText('Search radius').className).toContain('sr-only');
  });

  it('Change school is operable', () => {
    const onClearSchool = vi.fn();
    renderCombined({ onClearSchool });
    fireEvent.click(screen.getByTestId('change-school-btn'));
    expect(onClearSchool).toHaveBeenCalledTimes(1);
  });
});

describe('AreaSchoolCombinedPanel — no dead Filters control (#2770 AC5)', () => {
  const filtersButtons = () => screen.queryAllByRole('button', { name: /filters/i });

  it('with filtersContent: the Filters trigger is present', () => {
    renderCombined({ compactContext: true, isDesktop: true, filtersContent: <div>Filter controls</div> });
    expect(screen.getByTestId('combined-filters-trigger')).toBeInTheDocument();
    expect(filtersButtons().length).toBeGreaterThan(0);
  });

  it('without filtersContent (canonical path, compact block): zero Filters buttons and no filter bar', () => {
    const { container } = renderCombined({ compactContext: true });
    expect(filtersButtons()).toHaveLength(0);
    expect(screen.queryByTestId('combined-filters-trigger')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid^="combined-filter-toolbar"]')).toBeNull();
  });

  it('without filtersContent (below the reskin): zero Filters buttons', () => {
    renderCombined();
    expect(filtersButtons()).toHaveLength(0);
  });
});

describe('SchoolSelectedPanel — parity with the combined panel (#2770)', () => {
  function renderSelected(isDesktop: boolean) {
    return renderWithProviders(
      <DiscoverProvider>
        <SchoolSelectedPanel
          isDesktop={isDesktop}
          view={{
            chrome: {},
            viewer: { isAuthenticated: false },
            school,
            radius: { km: 3 },
            listings: { data: [listing('l-1'), listing('l-2')], loading: false },
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

  it('desktop: chips live inside the compact band', () => {
    renderSelected(true);
    const band = screen.getByTestId('school-summary-band');
    expect(within(band).getByTestId('radius-btn-3')).toBeInTheDocument();
    expect(within(band).getByTestId('change-school-btn')).toBeInTheDocument();
    expect(within(band).getByTestId('school-summary-count')).toHaveTextContent('2 homes within 3 km');
  });

  it('below the reskin: bounded-compaction band, chips outside it', () => {
    renderSelected(false);
    const band = screen.getByTestId('school-summary-band');
    expect(within(band).getByRole('navigation', { name: 'School breadcrumb' })).toBeInTheDocument();
    expect(band.contains(screen.getByTestId('radius-btn-3'))).toBe(false);
  });
});
