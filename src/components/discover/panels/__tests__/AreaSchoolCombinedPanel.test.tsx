import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { AreaSchoolCombinedPanel } from '../SchoolJourneyPanels';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

const mockSchoolNoCoords: SchoolResult = {
  ...mockSchool,
  latitude: null as unknown as number,
  longitude: null as unknown as number,
};

const makeListing = (id: string, overrides: Partial<DiscoverCityListingItem> = {}): DiscoverCityListingItem => ({
  id,
  pricePaise: 5000000 * 100,
  propertyType: 'apartment',
  locality: 'Manipal',
  primaryImageUrl: null,
  lat: 13.354,
  lon: 74.791,
  ...overrides,
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

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
  return render(
    <BrowserRouter>
      <QueryClientProvider client={makeQC()}>
        <AreaSchoolCombinedPanel {...baseProps()} {...props} />
      </QueryClientProvider>
    </BrowserRouter>,
  );
}

// ── AC1: ReTrends redesign — title is now "Find homes near a school" ──────────

describe('AreaSchoolCombinedPanel — title rendering (ReTrends redesign)', () => {
  it('renders "Find homes near a school" title in PanelHeader', () => {
    renderPanel();
    expect(
      screen.getByRole('heading', { name: 'Find homes near a school' }),
    ).toBeInTheDocument();
  });

  it('shows "Find homes near a school" title when selectedArea is null (skeleton state)', () => {
    renderPanel({ selectedArea: null });
    expect(screen.getByRole('heading', { name: 'Find homes near a school' })).toBeInTheDocument();
  });

  it('shows "Find homes near a school" title when selectedSchool is null (skeleton state)', () => {
    renderPanel({ selectedSchool: null });
    expect(screen.getByRole('heading', { name: 'Find homes near a school' })).toBeInTheDocument();
  });
});

// ── AC2: Ink-navy school summary band ─────────────────────────────────────────

describe('AreaSchoolCombinedPanel — school summary band (ReTrends redesign)', () => {
  it('renders school name in the summary band', () => {
    renderPanel();
    expect(screen.getByTestId('school-summary-name')).toHaveTextContent('Manipal Public School');
  });

  it('renders the summary band element', () => {
    renderPanel();
    expect(screen.getByTestId('school-summary-band')).toBeInTheDocument();
  });

  it('renders school board badge when board is present', () => {
    renderPanel();
    expect(screen.getByText('CBSE')).toBeInTheDocument();
  });

  it('renders boardType when board is null', () => {
    renderPanel({ selectedSchool: { ...mockSchool, board: null, boardType: 'State' } });
    expect(screen.getByText('State')).toBeInTheDocument();
  });

  it('omits board badge when both board and boardType are null', () => {
    renderPanel({ selectedSchool: { ...mockSchool, board: null, boardType: null } });
    expect(screen.queryByText('CBSE')).not.toBeInTheDocument();
  });

  it('renders school address when present', () => {
    renderPanel();
    expect(screen.getByText('Manipal, Udupi District')).toBeInTheDocument();
  });

  it('renders count + "homes for sale" label for intent=buy', () => {
    renderPanel({ listings: [makeListing('l-1'), makeListing('l-2')], intent: 'buy' });
    expect(screen.getByTestId('school-summary-count')).toHaveTextContent('2');
    expect(screen.getByTestId('school-summary-count')).toHaveTextContent('homes for sale');
  });

  it('renders count + "rentals available" label for intent=rent', () => {
    renderPanel({ listings: [makeListing('l-1')], intent: 'rent' });
    expect(screen.getByTestId('school-summary-count')).toHaveTextContent('1');
    expect(screen.getByTestId('school-summary-count')).toHaveTextContent('rental available');
  });

  it('"Change school" button calls onClearSchool', () => {
    const onClearSchool = vi.fn();
    renderPanel({ onClearSchool });
    fireEvent.click(screen.getByTestId('change-school-btn'));
    expect(onClearSchool).toHaveBeenCalledTimes(1);
  });
});

// ── Loading / null states ──────────────────────────────────────────────────────

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
    expect(screen.getAllByTestId('combined-listing-skeleton')).toHaveLength(3);
    expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();
  });
});

// ── Radius chips (ReTrends redesign: [3, 5, 10] km) ─────────────────────────

describe('AreaSchoolCombinedPanel — radius chips (ReTrends redesign)', () => {
  it('renders radius chips [3, 5, 10] only', () => {
    renderPanel();
    expect(screen.getByTestId('combined-radius-btn-3')).toBeInTheDocument();
    expect(screen.getByTestId('combined-radius-btn-5')).toBeInTheDocument();
    expect(screen.getByTestId('combined-radius-btn-10')).toBeInTheDocument();
    // Old options must not exist
    expect(screen.queryByTestId('combined-radius-btn-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('combined-radius-btn-2')).not.toBeInTheDocument();
  });

  it('marks the 3 km chip active (aria-pressed=true) when radiusKm=3', () => {
    renderPanel({ radiusKm: 3 });
    expect(screen.getByTestId('combined-radius-btn-3')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('combined-radius-btn-5')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('combined-radius-btn-10')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onRadiusChange(5) when the 5 km chip is clicked', () => {
    const onRadiusChange = vi.fn();
    renderPanel({ onRadiusChange, radiusKm: 3 });
    fireEvent.click(screen.getByTestId('combined-radius-btn-5'));
    expect(onRadiusChange).toHaveBeenCalledWith(5);
    expect(onRadiusChange).toHaveBeenCalledTimes(1);
  });

  it('calls onRadiusChange(10) when the 10 km chip is clicked', () => {
    const onRadiusChange = vi.fn();
    renderPanel({ onRadiusChange, radiusKm: 3 });
    fireEvent.click(screen.getByTestId('combined-radius-btn-10'));
    expect(onRadiusChange).toHaveBeenCalledWith(10);
  });

  it('defaults to 3 km active when radiusKm is null', () => {
    renderPanel({ radiusKm: null });
    expect(screen.getByTestId('combined-radius-btn-3')).toHaveAttribute('aria-pressed', 'true');
  });

  it('active chip shows listing count; inactive chips have no fabricated count', () => {
    renderPanel({ listings: [makeListing('l-1'), makeListing('l-2')], radiusKm: 3 });
    expect(screen.getByTestId('combined-radius-btn-3')).toHaveTextContent('2');
    expect(screen.getByTestId('combined-radius-btn-5')).not.toHaveTextContent('home');
    expect(screen.getByTestId('combined-radius-btn-10')).not.toHaveTextContent('home');
  });
});

// ── Result heading ─────────────────────────────────────────────────────────────

describe('AreaSchoolCombinedPanel — result heading', () => {
  it('shows "Homes for sale near this school" heading (intent=buy) with count and radius', () => {
    renderPanel({ listings: [makeListing('l-1'), makeListing('l-2')], radiusKm: 3, intent: 'buy' });
    const heading = screen.getByTestId('radius-result-heading');
    expect(heading).toHaveTextContent('Homes for sale near this school');
    expect(heading).toHaveTextContent('2 within 3 km');
  });

  it('shows "Rentals near this school" heading when intent=rent', () => {
    renderPanel({ listings: [makeListing('l-1')], radiusKm: 5, intent: 'rent' });
    const heading = screen.getByTestId('radius-result-heading');
    expect(heading).toHaveTextContent('Rentals near this school');
    expect(heading).toHaveTextContent('1 within 5 km');
  });

  it('does not show result heading when no listings', () => {
    renderPanel({ listings: [], isLoadingListings: false });
    expect(screen.queryByTestId('radius-result-heading')).not.toBeInTheDocument();
  });
});

// ── Listing body (2-col card grid) ────────────────────────────────────────────

describe('AreaSchoolCombinedPanel — listing body', () => {
  it('renders property cards when listings are present', () => {
    renderPanel({ listings: [makeListing('l-1'), makeListing('l-2')] });
    expect(screen.queryByTestId('combined-listing-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('listing-card')).toHaveLength(2);
  });

  it('renders selected card with isSelected=true when selectedListingId matches', () => {
    renderPanel({
      listings: [makeListing('l-1'), makeListing('l-2')],
      selectedListingId: 'l-1',
    });
    const cards = screen.getAllByTestId('listing-card');
    expect(cards[0]).toHaveAttribute('aria-pressed', 'true');
    expect(cards[0]).toHaveAttribute('data-selected', 'true');
    expect(cards[1]).toHaveAttribute('aria-pressed', 'false');
  });

  it('agri guard — panel renders server-provided listings without client filtering', () => {
    // Agri exclusion is server-side (#1463). Panel renders whatever server returns.
    const agriListing = makeListing('agri-1', { propertyType: 'agricultural_land' });
    renderPanel({ listings: [agriListing] });
    expect(screen.getAllByTestId('listing-card')).toHaveLength(1);
  });
});

// ── Empty states (ReTrends redesign) ──────────────────────────────────────────

describe('AreaSchoolCombinedPanel — empty state (ReTrends redesign)', () => {
  it('renders SchoolRadiusEmptyState with honest copy when listings are empty', () => {
    renderPanel({ listings: [], isLoadingListings: false, radiusKm: 3 });
    expect(screen.getByTestId('school-radius-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('school-radius-empty-state')).toHaveTextContent('Manipal Public School');
    expect(screen.getByTestId('school-radius-empty-state')).toHaveTextContent('3 km');
  });

  it('"Try 5 km" button present when active radius is 3 km', () => {
    renderPanel({ listings: [], radiusKm: 3 });
    expect(screen.getByTestId('try-radius-5-btn')).toBeInTheDocument();
  });

  it('"Try 10 km" button present when active radius is 3 km', () => {
    renderPanel({ listings: [], radiusKm: 3 });
    expect(screen.getByTestId('try-radius-10-btn')).toBeInTheDocument();
  });

  it('at max radius (10 km) no "Try N km" buttons shown', () => {
    renderPanel({ listings: [], radiusKm: 10 });
    expect(screen.queryByTestId('try-radius-5-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('try-radius-10-btn')).not.toBeInTheDocument();
  });

  it('"Try 5 km" calls onRadiusChange(5)', () => {
    const onRadiusChange = vi.fn();
    renderPanel({ listings: [], radiusKm: 3, onRadiusChange });
    fireEvent.click(screen.getByTestId('try-radius-5-btn'));
    expect(onRadiusChange).toHaveBeenCalledWith(5);
  });

  it('"View all in area" calls onClearSchool', () => {
    const onClearSchool = vi.fn();
    renderPanel({ listings: [], radiusKm: 3, onClearSchool });
    fireEvent.click(screen.getByTestId('view-all-in-area-btn'));
    expect(onClearSchool).toHaveBeenCalledTimes(1);
  });

  it('"Change school" in empty state calls onClearSchool', () => {
    const onClearSchool = vi.fn();
    renderPanel({ listings: [], radiusKm: 3, onClearSchool });
    fireEvent.click(screen.getByTestId('change-school-empty-btn'));
    expect(onClearSchool).toHaveBeenCalledTimes(1);
  });

  it('"Clear property filters" shown when filters active + calls onFiltersChange', () => {
    const onFiltersChange = vi.fn();
    renderPanel({
      listings: [],
      filters: { propertyTypes: ['apartment'] },
      onFiltersChange,
    });
    expect(screen.getByTestId('clear-filters-btn')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('clear-filters-btn'));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ propertyTypes: undefined }),
    );
  });

  it('"Clear property filters" absent when no filters active', () => {
    renderPanel({ listings: [], filters: {} });
    expect(screen.queryByTestId('clear-filters-btn')).not.toBeInTheDocument();
  });

  it('"Clear property filters" preserves school proximity fields on clear', () => {
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
    fireEvent.click(screen.getByTestId('clear-filters-btn'));
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

  it('renders rent-aware copy in empty state when intent=rent', () => {
    renderPanel({ listings: [], intent: 'rent' });
    expect(screen.getByTestId('school-radius-empty-state')).toHaveTextContent('rentals');
  });
});

// ── Missing-coords empty state ─────────────────────────────────────────────────

describe('AreaSchoolCombinedPanel — missing-coords state', () => {
  it('renders MissingCoordsEmptyState when school has null latitude', () => {
    renderPanel({ selectedSchool: mockSchoolNoCoords, listings: [], isLoadingListings: false });
    expect(screen.getByTestId('missing-coords-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('missing-coords-empty-state')).toHaveTextContent('Manipal Public School');
  });

  it('"View all homes in area" in missing-coords state calls onClearSchool', () => {
    const onClearSchool = vi.fn();
    renderPanel({ selectedSchool: mockSchoolNoCoords, listings: [], isLoadingListings: false, onClearSchool });
    fireEvent.click(screen.getByTestId('view-all-in-area-missing-coords-btn'));
    expect(onClearSchool).toHaveBeenCalledTimes(1);
  });

  it('"Choose another school" in missing-coords state calls onClearSchool', () => {
    const onClearSchool = vi.fn();
    renderPanel({ selectedSchool: mockSchoolNoCoords, listings: [], isLoadingListings: false, onClearSchool });
    fireEvent.click(screen.getByTestId('choose-another-school-btn'));
    expect(onClearSchool).toHaveBeenCalledTimes(1);
  });
});

// ── AC4: Area + school intersection rendering (preserved) ────────────────────

describe('AreaSchoolCombinedPanel — area+school intersection', () => {
  it('renders listings that satisfy both area and school constraints', () => {
    const intersectionListings = [makeListing('in-area-near-school-1'), makeListing('in-area-near-school-2')];
    renderPanel({ listings: intersectionListings });
    expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('combined-listing-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('combined-loading-skeleton')).not.toBeInTheDocument();
  });

  it('does not render listing body when selectedArea is null (scoping not yet resolved)', () => {
    renderPanel({ selectedArea: null, listings: [makeListing('unscoped')] });
    expect(screen.getByTestId('combined-loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();
  });
});

// ── Issue #1170: in-flight refetch dim ────────────────────────────────────────

describe('AreaSchoolCombinedPanel — in-flight refetch dim (Issue #1170)', () => {
  it('dims the listing body while a refetch is in flight (isFetching && not initial load)', () => {
    const { container } = renderPanel({
      listings: [makeListing('l-1')],
      isLoadingListings: false,
      isFetching: true,
    });
    const body = container.querySelector('.flex-1.overflow-y-auto');
    expect(body).toHaveClass('opacity-50');
    expect(body).toHaveClass('pointer-events-none');
  });

  it('does NOT dim during the initial skeleton load', () => {
    const { container } = renderPanel({
      listings: [],
      isLoadingListings: true,
      isFetching: true,
    });
    const body = container.querySelector('.flex-1.overflow-y-auto');
    expect(body).toHaveClass('opacity-100');
    expect(body).not.toHaveClass('opacity-50');
  });

  it('does NOT dim a settled result (no refetch in flight)', () => {
    const { container } = renderPanel({
      listings: [makeListing('l-1')],
      isLoadingListings: false,
      isFetching: false,
    });
    const body = container.querySelector('.flex-1.overflow-y-auto');
    expect(body).toHaveClass('opacity-100');
  });
});
