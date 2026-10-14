import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { SchoolSelectedPanel } from '../SchoolJourneyPanels';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type { PropertyFilters } from '@/hooks/usePropertyListings';


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

/**
 * Flat logical overrides — the pre-commit-5 prop shape. Every test below still
 * overrides by these same flat names; `buildSelectedPanelProps` is the single
 * place that translates them into the real `{view,commands}` contract, so this
 * commit's `expect(` lines needed zero changes (see Issue #2661 commit 5 report).
 */
interface SchoolSelectedPanelFlatOverrides {
  school?: SchoolResult | null;
  listings?: DiscoverCityListingItem[];
  isLoadingListings?: boolean;
  isFetching?: boolean;
  radiusKm?: number | null;
  onRadiusChange?: (radiusKm: number) => void;
  filters?: PropertyFilters;
  onFiltersChange?: (filters: PropertyFilters) => void;
  isAuthenticated?: boolean;
  onStartOver?: () => void;
  onBack?: () => void;
  journey?: React.ComponentProps<typeof SchoolSelectedPanel>['view']['chrome']['journey'];
  filtersContent?: React.ReactNode;
  activeContextChips?: React.ReactNode;
  onBoundedSearch?: () => void;
  boundedSearchTriggered?: boolean;
  intent?: DiscoverIntent;
  selectedListingId?: string | null;
  onSelectListing?: (id: string) => void;
  onHoverListing?: (id: string | null) => void;
}

/**
 * Scenario-builder (Issue #2661 commit 1 prep, updated commit 5) — constructs
 * SchoolSelectedPanel's `{view,commands}` props from a single overridable flat
 * shape rather than inline object literals scattered through the file.
 */
function buildSelectedPanelProps(
  overrides: SchoolSelectedPanelFlatOverrides = {},
): React.ComponentProps<typeof SchoolSelectedPanel> {
  const {
    school = mockSchool,
    listings = [makeListing('l-1')],
    isLoadingListings = false,
    isFetching,
    radiusKm = 3,
    onRadiusChange = vi.fn(),
    filters = {},
    onFiltersChange = vi.fn(),
    isAuthenticated = false,
    onStartOver,
    onBack,
    journey,
    filtersContent,
    activeContextChips,
    onBoundedSearch,
    boundedSearchTriggered,
    intent,
    selectedListingId,
    onSelectListing,
    onHoverListing,
  } = overrides;
  return {
    view: {
      chrome: { journey, activeContextChips, filtersContent },
      viewer: { intent, isAuthenticated },
      school,
      radius: { km: radiusKm },
      listings: { data: listings, loading: isLoadingListings, fetching: isFetching, selectedId: selectedListingId },
      propertyFilters: { value: filters },
      boundedSearch: { triggered: boundedSearchTriggered },
    },
    commands: {
      chrome: { startOver: onStartOver, back: onBack },
      radius: { change: onRadiusChange },
      listings: { select: onSelectListing, hover: onHoverListing },
      propertyFilters: { replace: onFiltersChange },
      boundedSearch: onBoundedSearch ? { trigger: onBoundedSearch } : undefined,
    },
  };
}

describe('SchoolSelectedPanel', () => {
  const renderPanel = (props: SchoolSelectedPanelFlatOverrides = {}) => {
    return renderWithProviders(
      <DiscoverProvider>
        <SchoolSelectedPanel {...buildSelectedPanelProps(props)} />
      </DiscoverProvider>,
      { router: 'browser' },
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

  // ── G2-N8 (#2750 PR-3 B1): PanelHeader Back chevron iff onBack ────────────────
  // Retires school-first-back-nav BN-1 (L2 back button present), BN-2 (L1), BN-3 (L0: no back button
  // in DOM). Both arms: `onBack != null &&` -> `true &&` breaks the absent arm; -> `false &&` breaks
  // the present arm; each mutation flips exactly one of the two tests.
  it('G2-N8 panel-header-back-button is present and calls onBack exactly once when onBack is provided', () => {
    const onBack = vi.fn();
    renderPanel({ onBack });
    const back = screen.getByTestId('panel-header-back-button');
    expect(back).toHaveAccessibleName('Back');
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('G2-N8 panel-header-back-button is absent from the DOM when onBack is undefined', () => {
    renderPanel({ onBack: undefined });
    expect(screen.queryByTestId('panel-header-back-button')).not.toBeInTheDocument();
    // sanity: the panel itself did render (the absence is not "nothing rendered")
    expect(screen.getByRole('heading', { name: 'Find homes near a school' })).toBeInTheDocument();
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

  it('shows result heading "Homes near {School}" with count+radius when listings present (mock parity, cycle 2)', () => {
    renderPanel({ listings: [makeListing('l-1'), makeListing('l-2')], radiusKm: 3, intent: 'buy' });
    // mockSchool.name === 'Manipal Public School' — the heading names the real selected
    // school, never the generic "this school" placeholder, once it has resolved.
    expect(screen.getByTestId('radius-result-heading')).toHaveTextContent('Homes near Manipal Public School');
    expect(screen.getByTestId('radius-result-heading')).toHaveTextContent('2 within 3 km');
  });

  it('shows "Rentals near {School}" heading when intent=rent', () => {
    renderPanel({ listings: [makeListing('l-1')], radiusKm: 5, intent: 'rent' });
    expect(screen.getByTestId('radius-result-heading')).toHaveTextContent('Rentals near Manipal Public School');
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
    const body = container.querySelector('[data-testid="school-listings-body"]');
    expect(body).toHaveClass('opacity-50');
    expect(body).toHaveClass('pointer-events-none');
  });

  it('does NOT dim during the initial skeleton load (isFetching suppressed by isLoadingListings)', () => {
    const { container } = renderWithReturn({
      listings: [],
      isLoadingListings: true,
      isFetching: true,
    });
    const body = container.querySelector('[data-testid="school-listings-body"]');
    expect(body).toHaveClass('opacity-100');
    expect(body).not.toHaveClass('opacity-50');
  });

  it('does NOT dim a settled result (no refetch in flight)', () => {
    const { container } = renderWithReturn({
      listings: [makeListing('l-1')],
      isLoadingListings: false,
      isFetching: false,
    });
    const body = container.querySelector('[data-testid="school-listings-body"]');
    expect(body).toHaveClass('opacity-100');
  });

  // ── school-results-polish: single continuous scroll region ────────────────────

  it('wraps the summary band, radius chips and listings in one continuous scroll container', () => {
    const { container } = renderWithReturn({
      listings: [makeListing('l-1')],
      isLoadingListings: false,
      isFetching: false,
    });
    const scroll = container.querySelector('[data-testid="school-selected-scroll"]');
    expect(scroll).toBeTruthy();
    expect(scroll).toHaveClass('overflow-y-auto');
    // Summary band and the listings body both live inside the single scroll
    // container so they scroll together as one column.
    expect(scroll?.querySelector('[data-testid="school-summary-band"]')).toBeTruthy();
    expect(scroll?.querySelector('[data-testid="school-listings-body"]')).toBeTruthy();
    // The inner listings body must NOT own its own scroll (would be a nested trap).
    const body = container.querySelector('[data-testid="school-listings-body"]');
    expect(body).not.toHaveClass('overflow-y-auto');
  });

  // ── AC4: empty state (ReTrends redesign) ──────────────────────────────────────

  it('shows SchoolRadiusEmptyState when listings are empty and not loading', () => {
    renderPanel({ listings: [], isLoadingListings: false, radiusKm: 3 });
    expect(screen.getByTestId('school-radius-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('school-radius-empty-state')).toHaveTextContent('Manipal Public School');
    expect(screen.getByTestId('school-radius-empty-state')).toHaveTextContent('3 km');
  });

  // G3-FOCUS4-COPY (#2750 PR-3 B1; close-or-keep for discover-school-first-markers FOCUS-4, :390). The spec
  // asserted `/no properties/i`, a string that no longer exists anywhere in the school empty state (the
  // copy is "No {homes|rentals} found within {r} km of {school}", SchoolRadiusEmptyState.tsx:76-78).
  // The regex is OBSOLETE; this pins the CURRENT copy exactly, for both intents.
  it('G3-FOCUS4-COPY empty radius copy is exactly "No homes found within 3 km of Manipal Public School" (buy) / "No rentals found ..." (rent), and never "No properties"', () => {
    const { unmount } = renderPanel({ listings: [], radiusKm: 3, intent: 'buy' });
    const buy = screen.getByTestId('school-radius-empty-state');
    expect(buy).toHaveTextContent('No homes found within 3 km of Manipal Public School');
    expect(buy).not.toHaveTextContent(/no properties/i);
    unmount();

    renderPanel({ listings: [], radiusKm: 5, intent: 'rent' });
    const rent = screen.getByTestId('school-radius-empty-state');
    expect(rent).toHaveTextContent('No rentals found within 5 km of Manipal Public School');
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

