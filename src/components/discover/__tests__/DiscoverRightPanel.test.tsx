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
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" areas={[]} />);
    expect(screen.getByText('Find properties your way')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-school-first')).toBeInTheDocument();
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
    expect(screen.getByText('Manipal')).toBeInTheDocument();
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
    expect(screen.getByText('No listings in this area yet')).toBeInTheDocument();
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

  it('shows blurred price gate for anonymous users', () => {
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
        isAuthenticated={false}
      />,
    );
    expect(screen.getByText(/sign in to view price/i)).toBeInTheDocument();
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
    expect(screen.getByPlaceholderText('Search listings by keyword')).toBeInTheDocument();
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
    expect(screen.getByPlaceholderText('Search listings by keyword')).toHaveValue('foo');
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
    await user.type(screen.getByPlaceholderText('Search listings by keyword'), 'a');
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
