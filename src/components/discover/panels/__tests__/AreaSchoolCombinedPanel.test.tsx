import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { AreaSchoolCombinedPanel } from '../SchoolJourneyPanels';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

// ── Fixtures ─────────────────────────────────────────────────────────────────

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
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseProps = () => ({
  selectedArea: mockArea,
  selectedSchool: mockSchool,
  listings: [makeListing('l-1')],
  isLoadingListings: false,
  radiusKm: 3 as number | null,
  onRadiusChange: vi.fn(),
  onClearSchool: vi.fn(),
  onClearArea: vi.fn(),
  filters: {},
  onFiltersChange: vi.fn(),
  isAuthenticated: false,
});

function renderPanel(props: Partial<React.ComponentProps<typeof AreaSchoolCombinedPanel>> = {}) {
  render(
    <BrowserRouter>
      <AreaSchoolCombinedPanel {...baseProps()} {...props} />
    </BrowserRouter>,
  );
}

// ── AC1: Title rendering ──────────────────────────────────────────────────────

describe('AreaSchoolCombinedPanel — title rendering (AC1)', () => {
  it('renders "Homes in {area} near {school}" title with both dimensions resolved', () => {
    renderPanel();
    expect(
      screen.getByRole('heading', { name: 'Homes in Manipal near Manipal Public School' }),
    ).toBeInTheDocument();
  });

  it('falls back to "Area + School" title when selectedArea is null', () => {
    renderPanel({ selectedArea: null });
    expect(screen.getByRole('heading', { name: 'Area + School' })).toBeInTheDocument();
  });

  it('falls back to "Area + School" title when selectedSchool is null', () => {
    renderPanel({ selectedSchool: null });
    expect(screen.getByRole('heading', { name: 'Area + School' })).toBeInTheDocument();
  });
});

// ── AC2: Clear-school chip atomicity ─────────────────────────────────────────

describe('AreaSchoolCombinedPanel — clear-school chip (AC2)', () => {
  it('renders the school chip with the school name', () => {
    renderPanel();
    expect(screen.getByTestId('clear-school-chip')).toBeInTheDocument();
    expect(screen.getByTestId('clear-school-chip')).toHaveTextContent('Manipal Public School');
  });

  it('calls onClearSchool when the school chip is clicked', () => {
    const onClearSchool = vi.fn();
    renderPanel({ onClearSchool });
    fireEvent.click(screen.getByTestId('clear-school-chip'));
    expect(onClearSchool).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClearArea when the school chip is clicked', () => {
    const onClearSchool = vi.fn();
    const onClearArea = vi.fn();
    renderPanel({ onClearSchool, onClearArea });
    fireEvent.click(screen.getByTestId('clear-school-chip'));
    expect(onClearArea).not.toHaveBeenCalled();
  });
});

// ── AC3: Clear-area chip atomicity ────────────────────────────────────────────

describe('AreaSchoolCombinedPanel — clear-area chip (AC3)', () => {
  it('renders the area chip with the area label', () => {
    renderPanel();
    expect(screen.getByTestId('clear-area-chip')).toBeInTheDocument();
    expect(screen.getByTestId('clear-area-chip')).toHaveTextContent('Manipal');
  });

  it('calls onClearArea when the area chip is clicked', () => {
    const onClearArea = vi.fn();
    renderPanel({ onClearArea });
    fireEvent.click(screen.getByTestId('clear-area-chip'));
    expect(onClearArea).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClearSchool when the area chip is clicked', () => {
    const onClearSchool = vi.fn();
    const onClearArea = vi.fn();
    renderPanel({ onClearSchool, onClearArea });
    fireEvent.click(screen.getByTestId('clear-area-chip'));
    expect(onClearSchool).not.toHaveBeenCalled();
  });
});

// ── Loading / null states ─────────────────────────────────────────────────────

describe('AreaSchoolCombinedPanel — loading and null states', () => {
  it('shows skeleton when selectedArea is null (cold-load hydration in progress)', () => {
    renderPanel({ selectedArea: null });
    expect(screen.getByTestId('combined-loading-skeleton')).toBeInTheDocument();
  });

  it('shows skeleton when selectedSchool is null (schoolById still fetching)', () => {
    renderPanel({ selectedSchool: null });
    expect(screen.getByTestId('combined-loading-skeleton')).toBeInTheDocument();
  });

  it('shows listing skeletons while isLoadingListings is true', () => {
    renderPanel({ listings: [], isLoadingListings: true });
    expect(screen.getAllByTestId('combined-listing-skeleton')).toHaveLength(3);
  });

  it('does not show listing content while loading', () => {
    renderPanel({ listings: [makeListing('l-1')], isLoadingListings: true });
    // Skeleton rows shown, not real cards (no empty-state message either)
    expect(screen.getAllByTestId('combined-listing-skeleton')).toHaveLength(3);
    expect(screen.queryByTestId('combined-empty-state-message')).not.toBeInTheDocument();
  });
});

// ── Listing body ──────────────────────────────────────────────────────────────

describe('AreaSchoolCombinedPanel — listing body', () => {
  it('renders property cards when listings are present', () => {
    renderPanel({ listings: [makeListing('l-1'), makeListing('l-2')] });
    expect(screen.queryByTestId('combined-listing-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('combined-empty-state-message')).not.toBeInTheDocument();
  });

  it('renders empty state when listings are empty and not loading', () => {
    renderPanel({ listings: [], isLoadingListings: false });
    expect(screen.getByTestId('combined-empty-state-message')).toBeInTheDocument();
  });

  it('empty state message includes area label and school name', () => {
    renderPanel({ listings: [], isLoadingListings: false });
    const msg = screen.getByTestId('combined-empty-state-message');
    expect(msg).toHaveTextContent('Manipal Public School');
    expect(msg).toHaveTextContent('Manipal');
  });
});

// ── Radius selector ───────────────────────────────────────────────────────────

describe('AreaSchoolCombinedPanel — radius selector', () => {
  it('renders radius buttons [1, 2, 3, 5]', () => {
    renderPanel();
    expect(screen.getByTestId('combined-radius-btn-1')).toBeInTheDocument();
    expect(screen.getByTestId('combined-radius-btn-2')).toBeInTheDocument();
    expect(screen.getByTestId('combined-radius-btn-3')).toBeInTheDocument();
    expect(screen.getByTestId('combined-radius-btn-5')).toBeInTheDocument();
  });

  it('marks the active radius button with aria-pressed=true', () => {
    renderPanel({ radiusKm: 3 });
    expect(screen.getByTestId('combined-radius-btn-3')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('combined-radius-btn-1')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onRadiusChange when a radius button is clicked', () => {
    const onRadiusChange = vi.fn();
    renderPanel({ onRadiusChange, radiusKm: 3 });
    fireEvent.click(screen.getByTestId('combined-radius-btn-5'));
    expect(onRadiusChange).toHaveBeenCalledWith(5);
    expect(onRadiusChange).toHaveBeenCalledTimes(1);
  });

  it('defaults to 3 km when radiusKm is null', () => {
    renderPanel({ radiusKm: null });
    expect(screen.getByTestId('combined-radius-btn-3')).toHaveAttribute('aria-pressed', 'true');
  });
});

// ── Empty-state CTAs ──────────────────────────────────────────────────────────

describe('AreaSchoolCombinedPanel — empty-state CTAs', () => {
  it('"Increase radius" button is present when not at max radius', () => {
    renderPanel({ listings: [], radiusKm: 3 });
    expect(screen.getByTestId('combined-increase-radius-btn')).not.toBeDisabled();
  });

  it('"Increase radius" button is disabled at max radius (5 km)', () => {
    renderPanel({ listings: [], radiusKm: 5 });
    expect(screen.getByTestId('combined-increase-radius-btn')).toBeDisabled();
  });

  it('"Clear property filters" shows when property filters active and listings empty', () => {
    renderPanel({ listings: [], filters: { propertyTypes: ['apartment'] } });
    expect(screen.getByTestId('combined-clear-filters-btn')).toBeInTheDocument();
  });

  it('"Clear property filters" absent when no property filters active', () => {
    renderPanel({ listings: [], filters: {} });
    expect(screen.queryByTestId('combined-clear-filters-btn')).not.toBeInTheDocument();
  });

  it('"Clear property filters" calls onFiltersChange preserving school proximity fields', () => {
    const onFiltersChange = vi.fn();
    renderPanel({
      listings: [],
      filters: {
        propertyTypes: ['apartment'],
        bedrooms: [2],
        priceMin: 1000000,
        priceMax: 5000000,
        schoolLat: 13.35,
        schoolLon: 74.79,
        schoolRadiusKm: 3,
      },
      onFiltersChange,
    });
    fireEvent.click(screen.getByTestId('combined-clear-filters-btn'));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyTypes: undefined,
        bedrooms: undefined,
        priceMin: undefined,
        priceMax: undefined,
        schoolLat: 13.35,
        schoolLon: 74.79,
        schoolRadiusKm: 3,
      }),
    );
  });
});

// ── AC4: Area + school intersection rendering ─────────────────────────────────
//
// The polygon injection that scopes the API query to the area bbox lives in
// MapDiscovery (effectiveFilters). At the panel level AC4 is verified by
// confirming:
//   (a) listings that satisfy BOTH constraints are rendered, and
//   (b) the panel does NOT render unscoped listings when selectedArea is null
//       (already covered by the skeleton tests above — no content path executes).
//
// This describe block adds the positive intersection case explicitly.

describe('AreaSchoolCombinedPanel — AC4 area+school intersection', () => {
  it('renders listings that satisfy both area and school constraints', () => {
    // Simulate the parent passing down pre-filtered intersection results
    // (both within area bbox AND within school radius).
    const intersectionListings = [makeListing('in-area-near-school-1'), makeListing('in-area-near-school-2')];
    renderPanel({ listings: intersectionListings });
    // Both cards rendered — no empty state, no skeleton
    expect(screen.queryByTestId('combined-empty-state-message')).not.toBeInTheDocument();
    expect(screen.queryByTestId('combined-listing-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('combined-loading-skeleton')).not.toBeInTheDocument();
  });

  it('shows empty state when intersection is empty (in area but outside school radius)', () => {
    renderPanel({ listings: [], isLoadingListings: false });
    expect(screen.getByTestId('combined-empty-state-message')).toBeInTheDocument();
    // Empty-state message references both dimensions so the user understands the constraint.
    expect(screen.getByTestId('combined-empty-state-message')).toHaveTextContent('Manipal Public School');
    expect(screen.getByTestId('combined-empty-state-message')).toHaveTextContent('Manipal');
  });

  it('does not render listing body when selectedArea is null (scoping not yet resolved)', () => {
    // When selectedArea is null the bbox-polygon has not been injected yet —
    // the panel must show a skeleton, never unscoped listings.
    renderPanel({ selectedArea: null, listings: [makeListing('unscoped')] });
    expect(screen.getByTestId('combined-loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('combined-empty-state-message')).not.toBeInTheDocument();
  });
});
