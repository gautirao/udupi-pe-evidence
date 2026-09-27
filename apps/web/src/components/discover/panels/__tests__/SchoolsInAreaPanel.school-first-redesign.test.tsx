/**
 * School-first selected-area page redesign (University Belt → Manipal).
 *
 * Covers the ReTrends redesign of the school-first `schools-in-area` state:
 *   - selected-area summary (breadcrumb + school/homes metrics, Buy/Rent wording)
 *   - "Find a school in {area}" section + search + live result count
 *   - Board/Level filter chips
 *   - client-side school-name search filtering
 *   - clear-filters resets search + chips
 *   - search-aware empty state
 *   - school card with "View homes" CTA → setSchoolJourney
 *   - homes-below grid excludes agricultural land + respects Buy/Rent wording
 *   - area-first journey is NOT regressed (no selected-area summary)
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { SchoolsInAreaPanel as RealSchoolsInAreaPanel } from '../SchoolsInAreaPanel';
import { SchoolsInAreaPanel as SchoolsInAreaWrapper } from '../SchoolJourneyPanels';

// ── Mocks ──────────────────────────────────────────────────────────────────
const setFiltersLive = vi.fn();
const setSchoolJourney = vi.fn();
const clearAreaContext = vi.fn();

let mockUrlState: Record<string, unknown> = {};

// Issue #1953 (build step 2) — SchoolsInAreaPanel now consumes the
// DiscoverProvider facade instead of calling useDiscoverUrlState() directly.
vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => mockUrlState,
  useDiscoverViewport: () => (mockUrlState as { viewport?: unknown }).viewport ?? null,
  useDiscoverActions: () => ({ setFiltersLive, setSchoolJourney, clearAreaContext }),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: () => ({
    data: {
      city: 'udupi',
      areas: [
        {
          areaKey: 'IN|KA|Udupi|Manipal',
          name: 'Manipal',
          geoCenterLat: 13.355,
          geoCenterLon: 74.8,
          listingCount: 5,
          schoolCount: 12,
        },
      ],
    },
  }),
}));

vi.mock('@/hooks/useSchoolsByArea', () => ({
  useSchoolsByArea: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

// PropertyCard pulls in the auth-gated Supabase client; stub it to a marker div that
// exposes the listing id + property type, and forwards the card↔marker wiring
// (onHover / onSelect / isSelected) so we can assert the wrapper threads them.
vi.mock('@/components/discover/PropertyCard', () => ({
  PropertyCard: ({
    listing,
    onHover,
    onSelect,
    isSelected,
  }: {
    listing: { id: string; propertyType?: string };
    onHover?: (id: string | null) => void;
    onSelect?: (id: string) => void;
    isSelected?: boolean;
  }) => (
    <div
      data-testid="property-card"
      data-proptype={listing.propertyType}
      data-selected={isSelected ? 'true' : undefined}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
      onClick={() => onSelect?.(listing.id)}
    >
      {listing.id}
    </div>
  ),
}));

const SCHOOLS = [
  {
    id: 's-dps',
    name: 'Delhi Public School, Manipal',
    board: 'CBSE',
    boardType: null,
    latitude: 13.3585,
    longitude: 74.784,
    address: 'Eshwar Nagar, Manipal',
    distanceKm: 0.4,
    areaKey: 'IN|KA|Udupi|Manipal',
    nearbyListingCount: 6,
    schoolCategory: 'higher_secondary',
  },
  {
    id: 's-mit',
    name: 'Manipal Institute of Technology',
    board: null,
    boardType: null,
    latitude: 13.349,
    longitude: 74.793,
    address: 'Eshwar Nagar, Manipal',
    distanceKm: 0.9,
    areaKey: 'IN|KA|Udupi|Manipal',
    nearbyListingCount: null,
    schoolCategory: null,
  },
] as unknown as SchoolResult[];

// Six schools to exercise the default-collapsed list (COLLAPSED_SCHOOLS = 4).
const MANY_SCHOOLS = Array.from({ length: 6 }, (_, i) => ({
  id: `s-${i}`,
  name: `Manipal School ${i}`,
  board: 'CBSE',
  boardType: null,
  latitude: 13.35,
  longitude: 74.79,
  address: `Road ${i}, Manipal`,
  distanceKm: i,
  areaKey: 'IN|KA|Udupi|Manipal',
  nearbyListingCount: null,
  schoolCategory: 'primary',
})) as unknown as SchoolResult[];

beforeEach(() => {
  setFiltersLive.mockClear();
  setSchoolJourney.mockClear();
  clearAreaContext.mockClear();
  mockUrlState = {
    city: 'udupi',
    areaKey: 'IN|KA|Udupi|Manipal',
    groupId: 'university-belt',
    journey: 'school-first',
    intent: 'buy',
    viewport: { lat: 13.355, lon: 74.8, zoom: 14 },
    filters: { boardFilters: [], categoryFilters: [] },
  };
});

function renderPanel(props: Record<string, unknown> = {}) {
  return render(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <RealSchoolsInAreaPanel
      journey="school-first"
      onStartOver={vi.fn()}
      schools={SCHOOLS}
      intent="buy"
      homesCount={5}
      {...(props as any)}
    />,
  );
}

describe('School-first selected-area redesign — RealSchoolsInAreaPanel', () => {
  it('renders the selected-area summary with breadcrumb + school/homes metrics', () => {
    renderPanel();
    const summary = screen.getByTestId('selected-area-summary');
    expect(summary).toBeInTheDocument();
    // Breadcrumb context: Udupi › University Belt › Manipal
    expect(within(summary).getByText('Udupi')).toBeInTheDocument();
    expect(within(summary).getByText('University Belt')).toBeInTheDocument();
    // Metrics (real records, not fabricated)
    expect(screen.getByTestId('summary-school-count')).toHaveTextContent('12');
    expect(screen.getByTestId('summary-homes-count')).toHaveTextContent('5');
    // Buy wording
    expect(within(summary).getByText(/homes for sale/i)).toBeInTheDocument();
  });

  it('summary uses Rent wording when intent=rent', () => {
    renderPanel({ intent: 'rent' });
    const summary = screen.getByTestId('selected-area-summary');
    expect(within(summary).getByText(/rentals available/i)).toBeInTheDocument();
    expect(within(summary).queryByText(/homes for sale/i)).not.toBeInTheDocument();
  });

  it('renders "Schools in Manipal" hero title + section heading, search input and result count', () => {
    renderPanel();
    // Mock parity (cycle 2): the hero title AND the section heading both read
    // "Schools in Manipal" (serif hero title + small-caps section label) — two
    // distinct elements by design, so assert both render rather than a single match.
    expect(screen.getAllByText(/schools in manipal/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('selected-area-summary-title')).toHaveTextContent('Schools in Manipal');
    expect(screen.getByTestId('school-search-input')).toBeInTheDocument();
    expect(screen.getByTestId('school-result-count')).toHaveTextContent('Showing 2 of 2 schools');
  });

  it('renders Board and Level filter chips', () => {
    renderPanel();
    expect(screen.getByTestId('board-chip-cbse')).toBeInTheDocument();
    expect(screen.getByTestId('board-chip-icse')).toBeInTheDocument();
    expect(screen.getByTestId('board-chip-state')).toBeInTheDocument();
    expect(screen.getByTestId('board-chip-international')).toBeInTheDocument();
    expect(screen.getByTestId('category-chip-primary')).toBeInTheDocument();
    expect(screen.getByTestId('category-chip-secondary')).toBeInTheDocument();
    expect(screen.getByTestId('category-chip-higher_secondary')).toBeInTheDocument();
  });

  it('toggling a board chip writes the filter to URL state', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('board-chip-cbse'));
    expect(setFiltersLive).toHaveBeenCalledWith(
      expect.objectContaining({ boardFilters: ['CBSE'] }),
    );
  });

  it('search filters the school cards and updates the result count', () => {
    renderPanel();
    expect(screen.getAllByTestId('school-card')).toHaveLength(2);
    fireEvent.change(screen.getByTestId('school-search-input'), { target: { value: 'Delhi' } });
    const cards = screen.getAllByTestId('school-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('Delhi Public School, Manipal');
    expect(screen.getByTestId('school-result-count')).toHaveTextContent('Showing 1 of 2 schools');
  });

  it('shows the empty state when the search matches nothing, and clear filters resets it', () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('school-search-input'), { target: { value: 'zzzzz' } });
    const empty = screen.getByTestId('schools-empty-state');
    expect(within(empty).getByText(/no schools match these filters\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('empty-state-no-schools-clear-filters'));
    // Search is reset locally → cards return; board/category cleared via URL action.
    expect(screen.queryByTestId('schools-empty-state')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('school-card')).toHaveLength(2);
    expect(setFiltersLive).toHaveBeenCalled();
  });

  it('surfaces an inline Clear filters action while a search is active', () => {
    renderPanel();
    expect(screen.queryByTestId('school-clear-filters')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('school-search-input'), { target: { value: 'Delhi' } });
    expect(screen.getByTestId('school-clear-filters')).toBeInTheDocument();
  });

  it('school card shows a "View homes" CTA; selecting it advances the school journey', () => {
    renderPanel();
    const cards = screen.getAllByTestId('school-card');
    expect(within(cards[0]).getByText(/view homes/i)).toBeInTheDocument();
    // Card with real nearby count shows it (mock parity, cycle 2: "N homes within {radius} km");
    // the null-count card must NOT fabricate a number.
    expect(within(cards[0]).getByText(/homes within \d+ km/i)).toBeInTheDocument();
    fireEvent.click(cards[0]);
    expect(setSchoolJourney).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 's-dps' }),
    );
  });

  it('area-first journey does NOT render the selected-area summary (no regression)', () => {
    renderPanel({ journey: 'area-first' });
    expect(screen.queryByTestId('selected-area-summary')).not.toBeInTheDocument();
    // Filter chips + school cards still render for the area-first school-picking sub-step.
    expect(screen.getByTestId('board-chip-cbse')).toBeInTheDocument();
    expect(screen.getAllByTestId('school-card').length).toBeGreaterThan(0);
  });

  describe('collapsed school list (Show all / Show fewer)', () => {
    it('defaults to the first 4 schools with a "Show all 6 schools" toggle', () => {
      renderPanel({ schools: MANY_SCHOOLS });
      expect(screen.getAllByTestId('school-card')).toHaveLength(4);
      expect(screen.getByTestId('schools-show-all-toggle')).toHaveTextContent('Show all 6 schools');
      // Result count still reflects the full match set, not the collapsed view.
      expect(screen.getByTestId('school-result-count')).toHaveTextContent('Showing 6 of 6 schools');
    });

    it('expands to all schools then collapses again', () => {
      renderPanel({ schools: MANY_SCHOOLS });
      fireEvent.click(screen.getByTestId('schools-show-all-toggle'));
      expect(screen.getAllByTestId('school-card')).toHaveLength(6);
      expect(screen.getByTestId('schools-show-all-toggle')).toHaveTextContent('Show fewer');
      fireEvent.click(screen.getByTestId('schools-show-all-toggle'));
      expect(screen.getAllByTestId('school-card')).toHaveLength(4);
    });

    it('shows all matches (no collapse toggle) while a search is active', () => {
      renderPanel({ schools: MANY_SCHOOLS });
      // "Manipal School" matches all 6 → with a search active the list is not collapsed.
      fireEvent.change(screen.getByTestId('school-search-input'), { target: { value: 'Manipal School' } });
      expect(screen.getAllByTestId('school-card')).toHaveLength(6);
      expect(screen.queryByTestId('schools-show-all-toggle')).not.toBeInTheDocument();
    });

    it('does not show the toggle when 4 or fewer schools match', () => {
      renderPanel({ schools: SCHOOLS });
      expect(screen.queryByTestId('schools-show-all-toggle')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('school-card')).toHaveLength(2);
    });
  });
});

describe('School-first homes-below section — SchoolsInAreaPanel wrapper', () => {
  const AREA_POINT = { areaKey: 'IN|KA|Udupi|Manipal', areaLabel: 'Manipal' } as unknown as React.ComponentProps<
    typeof SchoolsInAreaWrapper
  >['view']['area'];

  const LISTINGS = [
    { id: 'l1', propertyType: 'apartment', pricePaise: 13500000 },
    { id: 'l2', propertyType: 'villa', pricePaise: 26500000 },
    { id: 'l-agri', propertyType: 'agricultural_land', pricePaise: 9000000 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any;

  it('excludes agricultural land from the homes grid and uses Buy wording', () => {
    render(
      <MemoryRouter>
        <SchoolsInAreaWrapper
          view={{
            chrome: { journey: 'school-first' },
            viewer: { intent: 'buy' },
            area: AREA_POINT,
            schools: { data: SCHOOLS },
            homes: { data: LISTINGS },
          }}
          commands={{ chrome: {}, schools: {}, homes: {} }}
        />
      </MemoryRouter>,
    );
    const cards = screen.getAllByTestId('property-card');
    // 3 listings in, agri filtered out → 2 home cards.
    expect(cards).toHaveLength(2);
    cards.forEach((c) => expect(c).not.toHaveAttribute('data-proptype', 'agricultural_land'));
    expect(screen.getByText(/homes for sale in manipal/i)).toBeInTheDocument();
    expect(screen.getByTestId('schools-in-area-homes-count')).toHaveTextContent('2');
  });

  it('uses Rent wording when intent=rent', () => {
    render(
      <MemoryRouter>
        <SchoolsInAreaWrapper
          view={{
            chrome: { journey: 'school-first' },
            viewer: { intent: 'rent' },
            area: AREA_POINT,
            schools: { data: SCHOOLS },
            homes: { data: LISTINGS },
          }}
          commands={{ chrome: {}, schools: {}, homes: {} }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/rentals in manipal/i)).toBeInTheDocument();
    expect(screen.getByTestId('schools-in-area-homes-count')).toHaveTextContent(/rentals available/i);
  });

  it('hovering a home card calls onHoverListing with the listing id (card→marker)', () => {
    const onHoverListing = vi.fn();
    render(
      <MemoryRouter>
        <SchoolsInAreaWrapper
          view={{
            chrome: { journey: 'school-first' },
            viewer: { intent: 'buy' },
            area: AREA_POINT,
            schools: { data: SCHOOLS },
            homes: { data: LISTINGS },
          }}
          commands={{ chrome: {}, schools: {}, homes: { hover: onHoverListing } }}
        />
      </MemoryRouter>,
    );
    const cards = screen.getAllByTestId('property-card');
    fireEvent.mouseEnter(cards[0]);
    expect(onHoverListing).toHaveBeenCalledWith('l1');
    fireEvent.mouseLeave(cards[0]);
    expect(onHoverListing).toHaveBeenCalledWith(null);
  });

  it('renders ONE scroll surface — the homes section has no nested scrollbar', () => {
    const { container } = render(
      <MemoryRouter>
        <SchoolsInAreaWrapper
          view={{
            chrome: { journey: 'school-first' },
            viewer: { intent: 'buy' },
            area: AREA_POINT,
            schools: { data: SCHOOLS },
            homes: { data: LISTINGS },
          }}
          commands={{ chrome: {}, schools: {}, homes: {} }}
        />
      </MemoryRouter>,
    );
    // Exactly one vertical scroll container in the whole right panel.
    expect(container.querySelectorAll('.overflow-y-auto')).toHaveLength(1);
    // The homes section must not introduce its own scroll / max-height.
    const homes = screen.getByTestId('schools-in-area-properties');
    expect(homes.className).not.toMatch(/max-h-/);
    expect(homes.querySelector('.overflow-y-auto')).toBeNull();
  });

  it('marks the matching card selected when selectedListingId is set (marker→card)', () => {
    render(
      <MemoryRouter>
        <SchoolsInAreaWrapper
          view={{
            chrome: { journey: 'school-first' },
            viewer: { intent: 'buy' },
            area: AREA_POINT,
            schools: { data: SCHOOLS },
            homes: { data: LISTINGS, selectedId: 'l2' },
          }}
          commands={{ chrome: {}, schools: {}, homes: {} }}
        />
      </MemoryRouter>,
    );
    const selected = screen.getAllByTestId('property-card').filter(
      (c) => c.getAttribute('data-selected') === 'true',
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('l2');
  });
});
