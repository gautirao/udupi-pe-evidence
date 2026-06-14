import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
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

const makeListing = (id: string): DiscoverCityListingItem => ({
  id,
  pricePaise: 5000000 * 100,
  propertyType: 'apartment',
  locality: 'Manipal',
  primaryImageUrl: null,
});

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
        <SchoolSelectedPanel {...defaultProps} {...props} />
      </BrowserRouter>,
    );
  };

  // Alias used by the Issue #1170 dim tests — returns the render result for
  // container-level class assertions (the opacity dim has no semantic role/testid).
  const renderWithReturn = renderPanel;

  // ── AC1: school header ────────────────────────────────────────────────────

  it('renders school name in the panel header', () => {
    renderPanel();
    expect(screen.getByText('Manipal Public School')).toBeInTheDocument();
  });

  it('renders school board', () => {
    renderPanel();
    expect(screen.getByText('CBSE')).toBeInTheDocument();
  });

  it('falls back to boardType when board is null', () => {
    renderPanel({ school: { ...mockSchool, board: null, boardType: 'CBSE (legacy)' } });
    expect(screen.getByText('CBSE (legacy)')).toBeInTheDocument();
  });

  // ── AC2: radius selector ──────────────────────────────────────────────────

  it('renders radius buttons [1, 2, 3, 5]', () => {
    renderPanel();
    expect(screen.getByTestId('radius-btn-1')).toBeInTheDocument();
    expect(screen.getByTestId('radius-btn-2')).toBeInTheDocument();
    expect(screen.getByTestId('radius-btn-3')).toBeInTheDocument();
    expect(screen.getByTestId('radius-btn-5')).toBeInTheDocument();
  });

  it('marks current radiusKm button as active (aria-pressed)', () => {
    renderPanel({ radiusKm: 3 });
    expect(screen.getByTestId('radius-btn-3')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('radius-btn-1')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('radius-btn-5')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onRadiusChange with the selected km when a radius button is clicked', () => {
    const onRadiusChange = vi.fn();
    renderPanel({ onRadiusChange, radiusKm: 3 });
    fireEvent.click(screen.getByTestId('radius-btn-5'));
    expect(onRadiusChange).toHaveBeenCalledWith(5);
    expect(onRadiusChange).toHaveBeenCalledTimes(1);
  });

  it('defaults to 3 km active when radiusKm is null', () => {
    renderPanel({ radiusKm: null });
    expect(screen.getByTestId('radius-btn-3')).toHaveAttribute('aria-pressed', 'true');
  });

  // ── Issue #1210: radiusKm=0 clamps to the minimum (1 km) in the control + label ──

  it('clamps radiusKm=0 to the 1 km button being active (chip/control reflects effective radius)', () => {
    renderPanel({ radiusKm: 0 });
    // Before the fix `effectiveRadius` was 0, so NO radius button was active.
    expect(screen.getByTestId('radius-btn-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('radius-btn-2')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('radius-btn-3')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('radius-btn-5')).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders the empty-state distance as "within 1 km" (not "within 0 km") when radiusKm=0', () => {
    renderPanel({ radiusKm: 0, listings: [], isLoadingListings: false });
    expect(screen.getByTestId('empty-state-message')).toHaveTextContent(
      'No properties for sale found within 1 km of Manipal Public School',
    );
  });

  it.each([1, 2, 3, 5])('leaves valid radius %i km unchanged in the control', (km) => {
    renderPanel({ radiusKm: km });
    expect(screen.getByTestId(`radius-btn-${km}`)).toHaveAttribute('aria-pressed', 'true');
  });

  // ── AC3: listing cards ────────────────────────────────────────────────────

  it('renders listing cards when listings are present', () => {
    renderPanel({ listings: [makeListing('l-1'), makeListing('l-2')] });
    // PropertyCard renders each listing; we verify skeletons are absent
    expect(screen.queryByTestId('listing-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('empty-state-message')).not.toBeInTheDocument();
  });

  it('renders loading skeletons while loading', () => {
    renderPanel({ listings: [], isLoadingListings: true });
    expect(screen.getAllByTestId('listing-skeleton')).toHaveLength(3);
  });

  // ── Issue #1170: in-flight refetch dim (AC2/AC4) ──────────────────────────
  // The listing body is dimmed while a refetch (isFetching) is in flight, distinct
  // from the initial skeleton load, and never on a settled/cached result.

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

  it('keeps the empty-state CTA interactive while a refetch is NOT in flight', () => {
    renderPanel({ listings: [], isLoadingListings: false, isFetching: false });
    expect(screen.getByTestId('increase-radius-btn')).not.toBeDisabled();
  });

  // ── AC4: empty state ──────────────────────────────────────────────────────

  it('shows empty-state message when listings are empty and not loading', () => {
    renderPanel({ listings: [], isLoadingListings: false });
    expect(screen.getByTestId('empty-state-message')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-message')).toHaveTextContent(
      'No properties for sale found within 3 km of Manipal Public School',
    );
  });

  it('"Increase radius" button is present and enabled when not at max radius', () => {
    renderPanel({ listings: [], radiusKm: 3 });
    const btn = screen.getByTestId('increase-radius-btn');
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it('"Increase radius" button is disabled at max radius (5 km)', () => {
    renderPanel({ listings: [], radiusKm: 5 });
    expect(screen.getByTestId('increase-radius-btn')).toBeDisabled();
  });

  it('"Increase radius" cycles 1→2→3→5', () => {
    const onRadiusChange = vi.fn();
    // Start at 1 km
    renderPanel({ listings: [], radiusKm: 1, onRadiusChange });
    fireEvent.click(screen.getByTestId('increase-radius-btn'));
    expect(onRadiusChange).toHaveBeenCalledWith(2);
  });

  it('"Increase radius" cycles 3→5', () => {
    const onRadiusChange = vi.fn();
    renderPanel({ listings: [], radiusKm: 3, onRadiusChange });
    fireEvent.click(screen.getByTestId('increase-radius-btn'));
    expect(onRadiusChange).toHaveBeenCalledWith(5);
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

  // ── Issue #1115: bounded-search CTA ──────────────────────────────────────

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

  // Issue #1115 DEFECT 3 — count label must not show a stale number during a refetch.
  // The listing body is already dimmed (#1170 pattern); the count is suppressed too so the
  // user does not see a confident stale count while fresh data is in flight.
  it('hides the count label during an active refetch (isFetching=true) even with non-empty listings', () => {
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

  // ── Issue #1494 — intent-aware copy (AC5 school journey) ─────────────────

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
      expect(screen.getByTestId('school-bounded-search-count')).toHaveTextContent('1 property for sale found near Manipal Public School');
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

    it('shows "No properties for sale" empty state by default (intent=buy)', () => {
      renderPanel({ listings: [] });
      expect(screen.getByTestId('empty-state-message')).toHaveTextContent(
        'No properties for sale found',
      );
    });

    it('shows "No properties for rent" empty state when intent=rent', () => {
      renderPanel({ listings: [], intent: 'rent' });
      expect(screen.getByTestId('empty-state-message')).toHaveTextContent(
        'No properties for rent found',
      );
    });
  });
});
