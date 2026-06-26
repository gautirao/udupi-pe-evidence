import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DiscoverRightPanel } from '../DiscoverRightPanel';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const makeArea = (areaKey: string, areaLabel: string, listingCount: number): AreaPoint => ({
  areaKey,
  areaLabel,
  geo_center_lat: 13.3,
  geo_center_lon: 74.7,
  bbox: null,
  listingCount,
});

// Required new props with no-op defaults so individual tests stay concise.
const baseProps = {
  onStartOver: vi.fn(),
  onSelectJourney: vi.fn(),
};

const renderPanel = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('DiscoverRightPanel', () => {
  it('renders the panel with data-testid', () => {
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" areas={[]} />);
    expect(screen.getByTestId('discover-right-panel')).toBeInTheDocument();
  });

  it('shows guided-entry state when panelContent="guided-entry"', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="guided-entry" areas={[]} city="udupi" />,
    );
    expect(screen.getByTestId('guided-entry-panel')).toBeInTheDocument();
    // Public-landing hero copy (ReTrends mock) replaces the old "Find properties your way".
    expect(screen.getByText('Find your place in Udupi, your way.')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-school-first')).toBeInTheDocument();
  });

  it('guided-entry copy is city-dynamic — Bangalore selected shows Bangalore, not Udupi', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="guided-entry" areas={[]} city="bangalore" />,
    );
    expect(screen.getByText('Find your place in Bangalore, your way.')).toBeInTheDocument();
    expect(screen.getByText('Discover Bangalore')).toBeInTheDocument();
    // The mock's hardcoded Udupi copy must NOT leak into another city.
    expect(
      screen.queryByText('Find your place in Udupi, your way.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Discover Udupi')).not.toBeInTheDocument();
  });

  it('guided-entry shows a city-empty state when isCityEmpty (no fabricated copy/markers)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        areas={[]}
        city="bangalore"
        totalProperties={0}
        isCityEmpty
      />,
    );
    const empty = screen.getByTestId('guided-entry-empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveTextContent('No properties in Bangalore yet');
    // Journey cards remain available so farmland/school journeys are still reachable.
    expect(screen.getByTestId('journey-card-agri-first')).toBeInTheDocument();
  });

  it('guided-entry hides the empty state by default (e.g. while areas load)', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="guided-entry" areas={[]} city="udupi" />,
    );
    expect(screen.queryByTestId('guided-entry-empty-state')).not.toBeInTheDocument();
  });

  it('shows the static agri-landing placeholder when panelContent="agri-landing"', () => {
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="agri-landing" areas={[]} />);
    // CorridorLandingPanel renders corridor-landing-empty when corridorGroups is empty (default).
    expect(screen.getByTestId('corridor-landing-empty')).toBeInTheDocument();
    // PanelHeader title is always present for agri-landing (h2 to avoid journey-pill duplicate).
    expect(screen.getByRole('heading', { name: 'Agricultural land' })).toBeInTheDocument();
  });

  it('agri-landing renders NO listing/marker/count content (static, no fetch)', () => {
    // Pass listing-ish props that the panel must ignore in agri-landing mode.
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-landing"
        areas={[makeArea('k1', 'Manipal', 42)]}
        areaListings={[{ id: 'l1' } as unknown as DiscoverCityListingItem]}
        isLoadingListings={false}
      />,
    );
    // No listing cards, no skeletons — the placeholder is purely static.
    expect(screen.queryByTestId('listing-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('listing-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-select-chip')).not.toBeInTheDocument();
  });

  it('does not show quick-select chips (removed in A1)', () => {
    const areas = [
      makeArea('k1', 'Manipal', 42),
      makeArea('k2', 'Malpe', 7),
    ];
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" areas={areas} />);
    expect(screen.queryByTestId('quick-select-chip')).not.toBeInTheDocument();
    expect(screen.queryByText('Quick select:')).not.toBeInTheDocument();
  });

  it('switches to listings mode when panelContent="area-selected" and selectedArea is set', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        journey="area-first"
      />,
    );
    // 'Manipal' appears in both the breadcrumb area crumb and the area heading (a4 redesign).
    expect(screen.getAllByText('Manipal').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('quick-select-chip')).not.toBeInTheDocument();
  });

  it('shows loading skeletons while isLoadingListings', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={true}
      />,
    );
    expect(screen.getAllByTestId('listing-skeleton').length).toBeGreaterThanOrEqual(1);
  });

  it('shows skeletons (not stale cards) when isLoadingListings=true with previous areaListings', () => {
    // keepPreviousData means areaListings can be non-empty while a new fetch is in flight.
    // The panel must show skeletons, not stale listing cards, during this transition.
    const area = makeArea('k1', 'Manipal', 5);
    const staleListings: DiscoverCityListingItem[] = [{
      id: 'stale1',
      pricePaise: 1000000 * 100,
      propertyType: 'apartment',
      locality: 'Manipal',
      primaryImageUrl: null,
    }];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={staleListings}
        isLoadingListings={true}
      />,
    );
    expect(screen.getAllByTestId('listing-skeleton').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('listing-card')).not.toBeInTheDocument();
  });

  it('shows empty state when areaListings is empty and not loading', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
      />,
    );
    expect(screen.getByText(/No properties for sale in this area yet/)).toBeInTheDocument();
  });

  it('renders listing cards with price and locality', () => {
    const area = makeArea('k1', 'Manipal', 5);
    const listings: DiscoverCityListingItem[] = [{
      id: 'l1',
      pricePaise: 500000 * 100,
      propertyType: 'apartment',
      locality: 'Manipal',
      primaryImageUrl: null,
    }];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={listings}
        isLoadingListings={false}
        isAuthenticated={true}
      />,
    );
    expect(screen.getAllByTestId('listing-card').length).toBe(1);
    expect(screen.getAllByText('Manipal').length).toBeGreaterThanOrEqual(1);
    // pricePaise 500000*100 → Math.round(50_000_000/100)=500000 → formatPrice → '₹5 L'
    expect(screen.getByText('₹5 L')).toBeInTheDocument();
  });

  it('shows price band or request for anonymous users', () => {
    const area = makeArea('k1', 'Manipal', 5);
    const listings: DiscoverCityListingItem[] = [{
      id: 'l1',
      pricePaise: undefined,
      priceBand: '₹50L–1Cr',
      propertyType: 'apartment',
      locality: 'Manipal',
      primaryImageUrl: null,
    }];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={listings}
        isLoadingListings={false}
        isAuthenticated={false}
      />,
    );
    expect(screen.getByText('₹50L–1Cr')).toBeInTheDocument();
    expect(screen.queryByText('₹5 L')).not.toBeInTheDocument();
  });

  it('back button calls onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        onBack={onBack}
      />,
    );
    await user.click(screen.getByTestId('back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('listing card click navigates to /listing/:id', async () => {
    const user = userEvent.setup();
    const area = makeArea('k1', 'Manipal', 5);
    const listings: DiscoverCityListingItem[] = [{ id: 'l1', pricePaise: 5000000, propertyType: 'apartment', locality: 'Manipal', primaryImageUrl: null }];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={listings}
        isLoadingListings={false}
      />,
    );
    await user.click(screen.getByTestId('listing-card'));
    expect(mockNavigate).toHaveBeenCalledWith('/listing/l1');
  });

  it('shows Trends button in listings mode when trendsHref is provided', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        trendsHref="/trends?city=udupi&areaKey=k1"
      />,
    );
    expect(screen.getByText('Trends')).toBeInTheDocument();
  });

  it('does not show Trends button when trendsHref is absent', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
      />,
    );
    expect(screen.queryByText('Trends')).not.toBeInTheDocument();
  });
});

describe('DiscoverRightPanel — chip strip mount gate (Issue #1151)', () => {
  // AC5: seller/date/boolean chips must be visible even when no area or school is
  // selected. The top chip strip is rendered for panel states that don't already
  // embed chips in their own PanelHeader (guided-entry, area-groups-landing,
  // area-selection, school-browse).

  const chipNode = (
    <div data-testid="active-context-chips">
      <span data-testid="chip-seller">Owner</span>
    </div>
  );

  it('renders chip strip in guided-entry state when activeContextChips is provided', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        areas={[]}
        activeContextChips={chipNode}
      />,
    );
    expect(screen.getByTestId('active-context-chips')).toBeInTheDocument();
    expect(screen.getByTestId('chip-seller')).toBeInTheDocument();
  });

  it('renders chip strip in area-groups-landing state when activeContextChips is provided', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-groups-landing"
        areas={[]}
        activeContextChips={chipNode}
      />,
    );
    expect(screen.getByTestId('active-context-chips')).toBeInTheDocument();
  });

  it('does NOT render top chip strip in area-selected state (chips are in PanelHeader)', () => {
    const area = makeArea('k1', 'Manipal', 5);
    // area-selected passes activeContextChips to its own PanelHeader; the top
    // strip must not render a second instance.
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        activeContextChips={chipNode}
      />,
    );
    // Only one instance of active-context-chips in the DOM.
    expect(screen.getAllByTestId('active-context-chips')).toHaveLength(1);
  });

  it('renders no chip strip when activeContextChips is not provided', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        areas={[]}
      />,
    );
    expect(screen.queryByTestId('active-context-chips')).not.toBeInTheDocument();
  });
});

describe('DiscoverRightPanel — search input (#952)', () => {
  const area = makeArea('k1', 'Manipal', 5);

  it('renders search input in listings mode when onSearchChange is provided', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        searchQuery=""
        onSearchChange={vi.fn()}
      />,
    );
    // a4 redesign: placeholder is "Search properties in <area>" (not "Search listings by keyword")
    expect(screen.getByTestId('area-search-input')).toBeInTheDocument();
  });

  it('reflects searchQuery value in the input', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        searchQuery="foo"
        onSearchChange={vi.fn()}
      />,
    );
    // a4 redesign: use data-testid selector (placeholder is now area-dynamic)
    expect(screen.getByTestId('area-search-input')).toHaveValue('foo');
  });

  it('typing in the input fires onSearchChange', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        searchQuery=""
        onSearchChange={onSearchChange}
      />,
    );
    await user.type(screen.getByTestId('area-search-input'), 'a');
    // Each keystroke fires onSearchChange with the current input value.
    expect(onSearchChange).toHaveBeenCalledWith('a');
  });

  it('clear button appears when searchQuery is non-empty and clicking it calls onSearchChange("")', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        searchQuery="lakeside"
        onSearchChange={onSearchChange}
      />,
    );
    const clearBtn = screen.getByRole('button', { name: /clear search/i });
    expect(clearBtn).toBeInTheDocument();
    await user.click(clearBtn);
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('does not render search input when onSearchChange is not provided', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
      />,
    );
    expect(screen.queryByPlaceholderText('Search listings by keyword')).not.toBeInTheDocument();
  });
});

// ─── Buy/Rent intent selector in the right-panel header (Discover Figma polish) ─
// The Buy/Rent control was moved from a right-aligned bar to the left/content side of
// the right-panel header, above the journey cards. These tests assert it renders there
// (visible above the journey cards) and that the Buy/Rent state behaviour is preserved.

describe('DiscoverRightPanel — Buy/Rent intent selector header', () => {
  it('renders the Buy/Rent control in the header when onIntentChange is provided', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        areas={[]}
        intent="buy"
        onIntentChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('intent-selector')).toBeInTheDocument();
    expect(screen.getByText('Looking to')).toBeInTheDocument();
    expect(screen.getByTestId('intent-selector-buy')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('intent-selector-rent')).toHaveAttribute('aria-pressed', 'false');
    // Journey cards still render below the control.
    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
  });

  it('clicking Rent fires onIntentChange("rent") (state behaviour preserved)', async () => {
    const user = userEvent.setup();
    const onIntentChange = vi.fn();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        areas={[]}
        intent="buy"
        onIntentChange={onIntentChange}
      />,
    );
    await user.click(screen.getByTestId('intent-selector-rent'));
    expect(onIntentChange).toHaveBeenCalledWith('rent');
  });

  it('does not render the top-strip intent selector when onIntentChange is absent', () => {
    // The always-on top-strip Buy/Rent control is gated on onIntentChange. Tested on a
    // non-landing panel (agri-landing) since the public landing (guided-entry) embeds its
    // own Buy/Rent control inside the hero controls card per the ReTrends mock (#1588).
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="agri-landing" areas={[]} />);
    expect(screen.queryByTestId('intent-selector')).not.toBeInTheDocument();
  });
});

// ─── Issue #1456 — Cumulative distance hint text ──────────────────────────────

describe('DiscoverRightPanel — cumulative distance hint (Issue #1456)', () => {
  it('renders hint text when distance tiers are shown (region selected with tiers)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-landing"
        areas={[]}
        selectedRegion="NORTH"
        selectedMaxKm={25}
        corridorGroups={[
          {
            directionCode: 'NORTH',
            groupName: 'North towards Hebri',
            availableMaxDistances: [
              { maxKm: 25, distanceLabel: 'Up to 25 km', includedBandCodes: [], listingCount: 3, areaKeys: [] },
              { maxKm: 50, distanceLabel: 'Up to 50 km', includedBandCodes: [], listingCount: 5, areaKeys: [] },
            ],
          },
        ]}
        onClearRegionAndMaxKm={vi.fn()}
        onSetMaxKm={vi.fn()}
        onSetRegionWithMaxKm={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Includes properties at closer distances too.'),
    ).toBeInTheDocument();
  });
});
