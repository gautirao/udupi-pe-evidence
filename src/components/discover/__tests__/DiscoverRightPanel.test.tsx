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

const renderPanel = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('DiscoverRightPanel', () => {
  it('renders the panel with data-testid', () => {
    renderPanel(<DiscoverRightPanel areas={[]} />);
    expect(screen.getByTestId('discover-right-panel')).toBeInTheDocument();
  });

  it('shows empty-state placeholder when no area is selected', () => {
    renderPanel(<DiscoverRightPanel areas={[]} />);
    expect(screen.getByText('Select an area to explore')).toBeInTheDocument();
  });

  it('shows quick-select chips for up to 4 areas in empty state', () => {
    const areas = [
      makeArea('k1', 'Manipal', 42),
      makeArea('k2', 'Malpe', 7),
      makeArea('k3', 'Udupi', 15),
      makeArea('k4', 'Brahmavar', 3),
      makeArea('k5', 'Kundapur', 9),
    ];
    renderPanel(<DiscoverRightPanel areas={areas} />);
    const chips = screen.getAllByTestId('quick-select-chip');
    expect(chips).toHaveLength(4);
    expect(chips[0]).toHaveTextContent('Manipal');
    expect(chips[3]).toHaveTextContent('Brahmavar');
  });

  it('does not show quick-select section when areas is empty', () => {
    renderPanel(<DiscoverRightPanel areas={[]} />);
    expect(screen.queryByText('Quick select:')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-select-chip')).not.toBeInTheDocument();
  });

  it('quick-select chip click calls onAreaSelect with the area', async () => {
    const user = userEvent.setup();
    const onAreaSelect = vi.fn();
    const areas = [makeArea('k1', 'Manipal', 5)];
    renderPanel(<DiscoverRightPanel areas={areas} onAreaSelect={onAreaSelect} />);
    await user.click(screen.getByTestId('quick-select-chip'));
    expect(onAreaSelect).toHaveBeenCalledWith(expect.objectContaining({ areaKey: 'k1' }));
  });

  it('switches to listings mode when selectedArea is set', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(<DiscoverRightPanel areas={[area]} selectedArea={area} areaListings={[]} isLoadingListings={false} />);
    expect(screen.getByTestId('back-button')).toBeInTheDocument();
    expect(screen.getByText('Manipal')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-select-chip')).not.toBeInTheDocument();
  });

  it('shows loading skeletons while isLoadingListings', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(<DiscoverRightPanel areas={[area]} selectedArea={area} areaListings={[]} isLoadingListings={true} />);
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
        areas={[area]}
        selectedArea={area}
        areaListings={staleListings}
        isLoadingListings={true}
      />
    );
    expect(screen.getAllByTestId('listing-skeleton').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('listing-card')).not.toBeInTheDocument();
  });

  it('shows empty state when areaListings is empty and not loading', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(<DiscoverRightPanel areas={[area]} selectedArea={area} areaListings={[]} isLoadingListings={false} />);
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
    renderPanel(<DiscoverRightPanel areas={[area]} selectedArea={area} areaListings={listings} isLoadingListings={false} isAuthenticated={true} />);
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
    renderPanel(<DiscoverRightPanel areas={[area]} selectedArea={area} areaListings={listings} isLoadingListings={false} isAuthenticated={false} />);
    expect(screen.getByText(/sign in to view price/i)).toBeInTheDocument();
    expect(screen.queryByText('₹5 L')).not.toBeInTheDocument();
  });

  it('back button calls onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(<DiscoverRightPanel areas={[area]} selectedArea={area} areaListings={[]} isLoadingListings={false} onBack={onBack} />);
    await user.click(screen.getByTestId('back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('listing card click navigates to /listing/:id', async () => {
    const user = userEvent.setup();
    const area = makeArea('k1', 'Manipal', 5);
    const listings: DiscoverCityListingItem[] = [{ id: 'l1', pricePaise: 5000000, propertyType: 'apartment', locality: 'Manipal', primaryImageUrl: null }];
    renderPanel(
      <DiscoverRightPanel
        areas={[area]}
        selectedArea={area}
        areaListings={listings}
        isLoadingListings={false}
      />
    );
    await user.click(screen.getByTestId('listing-card'));
    expect(mockNavigate).toHaveBeenCalledWith('/listing/l1');
  });

  it('shows Trends button in listings mode when trendsHref is provided', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        trendsHref="/trends?city=udupi&areaKey=k1"
      />
    );
    expect(screen.getByText('Trends')).toBeInTheDocument();
  });

  it('does not show Trends button when trendsHref is absent', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(<DiscoverRightPanel areas={[area]} selectedArea={area} areaListings={[]} isLoadingListings={false} />);
    expect(screen.queryByText('Trends')).not.toBeInTheDocument();
  });
});
