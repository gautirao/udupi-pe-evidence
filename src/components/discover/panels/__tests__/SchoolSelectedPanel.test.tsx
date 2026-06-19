import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { SchoolSelectedPanel } from '../SchoolJourneyPanels';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

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

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('SchoolSelectedPanel', () => {
  const renderPanel = (
    props: Partial<React.ComponentProps<typeof SchoolSelectedPanel>> = {},
  ) => {
    const defaultProps: React.ComponentProps<typeof SchoolSelectedPanel> = {
      school: mockSchool,
      listings: [makeListing('l-1')],
      isLoadingListings: false,
      radiusKm: 3,
      onRadiusChange: vi.fn(),
      filters: {},
      onFiltersChange: vi.fn(),
      isAuthenticated: false,
    };

    return render(
      <BrowserRouter>
        <QueryClientProvider client={makeQC()}>
          <SchoolSelectedPanel {...defaultProps} {...props} />
        </QueryClientProvider>
      </BrowserRouter>,
    );
  };

  const renderWithReturn = renderPanel;

  // ── AC1: ReTrends header + school summary band ────────────────────────────────

  it('renders "Find homes near a school" in the panel header (ReTrends redesign)', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Find homes near a school' })).toBeInTheDocument();
  });

  it('renders school name in the ink-navy summary band', () => {
    renderPanel();
    expect(screen.getByTestId('school-summary-name')).toHaveTextContent('Manipal Public School');
  });

  it('renders school board badge in the summary band', () => {
    renderPanel();
    expect(screen.getByText('CBSE')).toBeInTheDocument();
  });

  it('falls back to boardType when board is null', () => {
    renderPanel({ school: { ...mockSchool, board: null, boardType: 'CBSE (legacy)' } });
    expect(screen.getByText('CBSE (legacy)')).toBeInTheDocument();
  });

  it('renders school address in the summary band', () => {
    renderPanel();
    expect(screen.getByText('Manipal, Udupi District')).toBeInTheDocument();
  });

  it('renders listing count + "homes for sale" for intent=buy', () => {
    renderPanel({ listings: [makeListing('l-1'), makeListing('l-2')], intent: 'buy' });
    expect(screen.getByTestId('school-summary-count')).toHaveTextContent('2');
    expect(screen.getByTestId('school-summary-count')).toHaveTextContent('homes for sale');
  });

  it('renders listing count + "rentals available" for intent=rent', () => {
    renderPanel({ listings: [makeListing('l-1')], intent: 'rent' });
    expect(screen.getByTestId('school-summary-count')).toHaveTextContent('rental available');
  });

  it('shows a skeleton summary band when school is null', () => {
    renderPanel({ school: null });
    expect(screen.getByTestId('school-summary-skeleton')).toBeInTheDocument();
  });

  it('"Change school" calls onBack', () => {
    const onBack = vi.fn();
    renderPanel({ onBack });
    fireEvent.click(screen.getByTestId('change-school-btn'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  // ── AC2: radius chips [3, 5, 10] ─────────────────────────────────────────────

  it('renders radius chips [3, 5, 10] only (ReTrends redesign)', () => {
    renderPanel();
    expect(screen.getByTestId('radius-btn-3')).toBeInTheDocument();
    expect(screen.getByTestId('radius-btn-5')).toBeInTheDocument();
    expect(screen.getByTestId('radius-btn-10')).toBeInTheDocument();
    // Old options must not exist
    expect(screen.queryByTestId('radius-btn-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('radius-btn-2')).not.toBeInTheDocument();
  });

  it('marks current radiusKm=3 chip as active (aria-pressed=true)', () => {
    renderPanel({ radiusKm: 3 });
    expect(screen.getByTestId('radius-btn-3')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('radius-btn-5')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('radius-btn-10')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onRadiusChange(5) when the 5 km chip is clicked', () => {
    const onRadiusChange = vi.fn();
    renderPanel({ onRadiusChange, radiusKm: 3 });
    fireEvent.click(screen.getByTestId('radius-btn-5'));
    expect(onRadiusChange).toHaveBeenCalledWith(5);
    expect(onRadiusChange).toHaveBeenCalledTimes(1);
  });

  it('calls onRadiusChange(10) when the 10 km chip is clicked', () => {
    const onRadiusChange = vi.fn();
    renderPanel({ onRadiusChange, radiusKm: 3 });
    fireEvent.click(screen.getByTestId('radius-btn-10'));
    expect(onRadiusChange).toHaveBeenCalledWith(10);
  });

  it('defaults to 3 km active when radiusKm is null', () => {
    renderPanel({ radiusKm: null });
    expect(screen.getByTestId('radius-btn-3')).toHaveAttribute('aria-pressed', 'true');
  });

  it('active chip shows listing count', () => {
    renderPanel({ listings: [makeListing('l-1'), makeListing('l-2')], radiusKm: 3 });
    expect(screen.getByTestId('radius-btn-3')).toHaveTextContent('2');
    expect(screen.getByTestId('radius-btn-5')).not.toHaveTextContent('home');
  });

  // ── Legacy radius snapping: out-of-set values always resolve to one active chip ──

  it('snaps invalid radiusKm=0 to the nearest chip (3 km active)', () => {
    // snapRadiusKm(0): clampSchoolRadiusKm(0) → 1, not in [3,5,10] → nearest = 3.
    // The UI must always have exactly one active chip — no zero-active-chip state.
    renderPanel({ radiusKm: 0 });
    expect(screen.getByTestId('radius-btn-3')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('radius-btn-5')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('radius-btn-10')).toHaveAttribute('aria-pressed', 'false');
  });

  it.each([
    [2, 3],
    [4, 3],
    [7, 5],
    [20, 10],
  ])('snaps legacy radiusKm=%i to nearest chip %i km active', (raw, expected) => {
    renderPanel({ radiusKm: raw });
    expect(screen.getByTestId(`radius-btn-${expected}`)).toHaveAttribute('aria-pressed', 'true');
  });

  it.each([3, 5, 10])('leaves valid radius %i km unchanged in the control', (km) => {
    renderPanel({ radiusKm: km });
    expect(screen.getByTestId(`radius-btn-${km}`)).toHaveAttribute('aria-pressed', 'true');
  });

  // ── AC3: listing cards ────────────────────────────────────────────────────────

  it('renders listing cards when listings are present', () => {
    renderPanel({ listings: [makeListing('l-1'), makeListing('l-2')] });
    expect(screen.queryByTestId('listing-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('school-radius-empty-state')).not.toBeInTheDocument();
  });

  it('renders loading skeletons while loading', () => {
    renderPanel({ listings: [], isLoadingListings: true });
    expect(screen.getAllByTestId('listing-skeleton')).toHaveLength(3);
  });

  // ── Result heading ────────────────────────────────────────────────────────────

  it('shows result heading "Homes for sale near this school" with count+radius when listings present', () => {
    renderPanel({ listings: [makeListing('l-1'), makeListing('l-2')], radiusKm: 3, intent: 'buy' });
    expect(screen.getByTestId('radius-result-heading')).toHaveTextContent('Homes for sale near this school');
    expect(screen.getByTestId('radius-result-heading')).toHaveTextContent('2 within 3 km');
  });

  it('shows "Rentals near this school" heading when intent=rent', () => {
    renderPanel({ listings: [makeListing('l-1')], radiusKm: 5, intent: 'rent' });
    expect(screen.getByTestId('radius-result-heading')).toHaveTextContent('Rentals near this school');
  });

  it('does not show result heading when 0 listings', () => {
    renderPanel({ listings: [], isLoadingListings: false });
    expect(screen.queryByTestId('radius-result-heading')).not.toBeInTheDocument();
  });

  // ── Issue #1170: in-flight refetch dim ────────────────────────────────────────

  it('dims the listing body while a refetch is in flight (isFetching && not initial load)', () => {
    const { container } = renderWithReturn({
      listings: [makeListing('l-1')],
      isLoadingListings: false,
      isFetching: true,
    });
    const body = container.querySelector('.flex-1.overflow-y-auto');
    expect(body).toHaveClass('opacity-50');
    expect(body).toHaveClass('pointer-events-none');
  });

  it('does NOT dim during the initial skeleton load (isFetching suppressed by isLoadingListings)', () => {
    const { container } = renderWithReturn({
      listings: [],
      isLoadingListings: true,
      isFetching: true,
    });
    const body = container.querySelector('.flex-1.overflow-y-auto');
    expect(body).toHaveClass('opacity-100');
    expect(body).not.toHaveClass('opacity-50');
  });

  it('does NOT dim a settled result (no refetch in flight)', () => {
    const { container } = renderWithReturn({
      listings: [makeListing('l-1')],
      isLoadingListings: false,
      isFetching: false,
    });
    const body = container.querySelector('.flex-1.overflow-y-auto');
    expect(body).toHaveClass('opacity-100');
  });

  // ── AC4: empty state (ReTrends redesign) ──────────────────────────────────────

  it('shows SchoolRadiusEmptyState when listings are empty and not loading', () => {
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

  it('"Try 5 km" calls onRadiusChange(5)', () => {
    const onRadiusChange = vi.fn();
    renderPanel({ listings: [], radiusKm: 3, onRadiusChange });
    fireEvent.click(screen.getByTestId('try-radius-5-btn'));
    expect(onRadiusChange).toHaveBeenCalledWith(5);
  });

  it('at max radius (10 km) no "Try N km" buttons shown', () => {
    renderPanel({ listings: [], radiusKm: 10 });
    expect(screen.queryByTestId('try-radius-5-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('try-radius-10-btn')).not.toBeInTheDocument();
  });

  it('"Change school" empty-state button calls onBack via handleChangeSchool', () => {
    const onBack = vi.fn();
    renderPanel({ listings: [], radiusKm: 3, onBack });
    fireEvent.click(screen.getByTestId('change-school-empty-btn'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('"Clear property filters" button shows when property filters are active and listings empty', () => {
    renderPanel({
      listings: [],
      filters: { propertyTypes: ['apartment'] },
    });
    expect(screen.getByTestId('clear-filters-btn')).toBeInTheDocument();
  });

  it('"Clear property filters" is absent when no property filters are active', () => {
    renderPanel({ listings: [], filters: {} });
    expect(screen.queryByTestId('clear-filters-btn')).not.toBeInTheDocument();
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

  // ── Missing-coords state ──────────────────────────────────────────────────────

  it('renders MissingCoordsEmptyState when school has null latitude', () => {
    renderPanel({ school: mockSchoolNoCoords, listings: [], isLoadingListings: false });
    expect(screen.getByTestId('missing-coords-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('missing-coords-empty-state')).toHaveTextContent('Manipal Public School');
  });

  it('"Choose another school" in missing-coords state calls onBack', () => {
    const onBack = vi.fn();
    renderPanel({ school: mockSchoolNoCoords, listings: [], onBack });
    fireEvent.click(screen.getByTestId('choose-another-school-btn'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  // ── Issue #1115: bounded-search CTA ──────────────────────────────────────────

  it('renders the bounded-search CTA when auth, onBoundedSearch provided, and not yet triggered', () => {
    renderPanel({
      isAuthenticated: true,
      onBoundedSearch: vi.fn(),
      boundedSearchTriggered: false,
    });
    expect(screen.getByTestId('school-bounded-search-cta')).toBeInTheDocument();
    expect(screen.getByTestId('school-bounded-search-cta')).toHaveTextContent(/search within/i);
  });

  it('hides the CTA for anon users even when onBoundedSearch is provided', () => {
    renderPanel({
      isAuthenticated: false,
      onBoundedSearch: vi.fn(),
      boundedSearchTriggered: false,
    });
    expect(screen.queryByTestId('school-bounded-search-cta')).not.toBeInTheDocument();
  });

  it('hides the CTA when onBoundedSearch is not provided', () => {
    renderPanel({
      isAuthenticated: true,
      onBoundedSearch: undefined,
      boundedSearchTriggered: false,
    });
    expect(screen.queryByTestId('school-bounded-search-cta')).not.toBeInTheDocument();
  });

  it('calls onBoundedSearch when the CTA is clicked', () => {
    const onBoundedSearch = vi.fn();
    renderPanel({
      isAuthenticated: true,
      onBoundedSearch,
      boundedSearchTriggered: false,
    });
    fireEvent.click(screen.getByTestId('school-bounded-search-cta'));
    expect(onBoundedSearch).toHaveBeenCalledTimes(1);
  });

  it('hides the CTA and shows results count once boundedSearchTriggered is true', () => {
    renderPanel({
      isAuthenticated: true,
      onBoundedSearch: vi.fn(),
      boundedSearchTriggered: true,
      listings: [makeListing('l-1'), makeListing('l-2')],
      isLoadingListings: false,
    });
    expect(screen.queryByTestId('school-bounded-search-cta')).not.toBeInTheDocument();
    expect(screen.getByTestId('school-bounded-search-count')).toBeInTheDocument();
  });

  it('helper copy shows correct count and school name after search triggered', () => {
    renderPanel({
      isAuthenticated: true,
      onBoundedSearch: vi.fn(),
      boundedSearchTriggered: true,
      listings: [makeListing('l-1'), makeListing('l-2'), makeListing('l-3')],
      isLoadingListings: false,
    });
    expect(screen.getByTestId('school-bounded-search-count')).toHaveTextContent(
      '3 properties for sale found near Manipal Public School',
    );
  });

  it('helper copy uses singular "property" when count is 1', () => {
    renderPanel({
      isAuthenticated: true,
      onBoundedSearch: vi.fn(),
      boundedSearchTriggered: true,
      listings: [makeListing('l-1')],
      isLoadingListings: false,
    });
    expect(screen.getByTestId('school-bounded-search-count')).toHaveTextContent(
      '1 property for sale found near Manipal Public School',
    );
  });

  it('does not show helper count while listings are still loading', () => {
    renderPanel({
      isAuthenticated: true,
      onBoundedSearch: vi.fn(),
      boundedSearchTriggered: true,
      listings: [],
      isLoadingListings: true,
    });
    expect(screen.queryByTestId('school-bounded-search-count')).not.toBeInTheDocument();
  });

  it('hides the count label during an active refetch (isFetching=true)', () => {
    renderPanel({
      isAuthenticated: true,
      onBoundedSearch: vi.fn(),
      boundedSearchTriggered: true,
      listings: [makeListing('l-1'), makeListing('l-2')],
      isLoadingListings: false,
      isFetching: true,
    });
    expect(screen.queryByTestId('school-bounded-search-count')).not.toBeInTheDocument();
  });

  it('shows the count label when a refetch is NOT in flight (isFetching=false)', () => {
    renderPanel({
      isAuthenticated: true,
      onBoundedSearch: vi.fn(),
      boundedSearchTriggered: true,
      listings: [makeListing('l-1'), makeListing('l-2')],
      isLoadingListings: false,
      isFetching: false,
    });
    expect(screen.getByTestId('school-bounded-search-count')).toBeInTheDocument();
  });

  // ── Issue #1494 — intent-aware copy ──────────────────────────────────────────

  describe('intent-aware result count and empty state (Issue #1494)', () => {
    it('shows "for sale" in count helper by default (intent=buy)', () => {
      renderPanel({
        isAuthenticated: true,
        onBoundedSearch: vi.fn(),
        boundedSearchTriggered: true,
        listings: [makeListing('l-1')],
        isLoadingListings: false,
        intent: 'buy',
      });
      expect(screen.getByTestId('school-bounded-search-count')).toHaveTextContent('for sale');
    });

    it('shows "for rent" in count helper when intent=rent', () => {
      renderPanel({
        isAuthenticated: true,
        onBoundedSearch: vi.fn(),
        boundedSearchTriggered: true,
        listings: [makeListing('l-1')],
        isLoadingListings: false,
        intent: 'rent',
      });
      expect(screen.getByTestId('school-bounded-search-count')).toHaveTextContent('for rent');
    });

    it('shows "homes" in empty state by default (intent=buy)', () => {
      renderPanel({ listings: [] });
      expect(screen.getByTestId('school-radius-empty-state')).toHaveTextContent('homes');
    });

    it('shows "rentals" in empty state when intent=rent', () => {
      renderPanel({ listings: [], intent: 'rent' });
      expect(screen.getByTestId('school-radius-empty-state')).toHaveTextContent('rentals');
    });
  });
});
