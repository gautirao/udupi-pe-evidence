import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { DiscoverRightPanel } from '../DiscoverRightPanel';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { DiscoverAreaListingItem } from '@/hooks/useDiscoverAreaListings';

const makeArea = (areaKey: string, areaLabel: string, listingCount: number): AreaPoint => ({
  areaKey,
  areaLabel,
  geo_center_lat: 13.3,
  geo_center_lon: 74.7,
  bbox: null,
  listingCount,
});

describe('DiscoverRightPanel', () => {
  it('renders the panel with data-testid', () => {
    render(<DiscoverRightPanel areas={[]} />);
    expect(screen.getByTestId('discover-right-panel')).toBeInTheDocument();
  });

  it('shows "No areas found" when areas is empty', () => {
    render(<DiscoverRightPanel areas={[]} />);
    expect(screen.getByText('No areas found')).toBeInTheDocument();
  });

  it('renders area cards with name and listing count', () => {
    const areas = [
      makeArea('IN|KA|Udupi|Manipal', 'Manipal', 42),
      makeArea('IN|KA|Udupi|Malpe', 'Malpe', 7),
    ];
    render(<DiscoverRightPanel areas={areas} />);
    expect(screen.getByText('Manipal')).toBeInTheDocument();
    expect(screen.getByText('42 properties')).toBeInTheDocument();
    expect(screen.getByText('Malpe')).toBeInTheDocument();
    expect(screen.getByText('7 properties')).toBeInTheDocument();
    expect(screen.getAllByTestId('area-card')).toHaveLength(2);
  });

  it('shows area count in the header', () => {
    const areas = [makeArea('k1', 'Manipal', 5), makeArea('k2', 'Malpe', 3)];
    render(<DiscoverRightPanel areas={areas} />);
    expect(screen.getByText('2 areas')).toBeInTheDocument();
  });

  it('does not render listing count when listingCount is null', () => {
    const area: AreaPoint = { areaKey: 'k1', areaLabel: 'Manipal', geo_center_lat: 13, geo_center_lon: 74, bbox: null, listingCount: null };
    render(<DiscoverRightPanel areas={[area]} />);
    expect(screen.queryByText(/properties/)).not.toBeInTheDocument();
  });

  it('renders area cards with onClick handler', async () => {
    const user = userEvent.setup();
    const onAreaSelect = vi.fn();
    const areas = [makeArea('k1', 'Manipal', 5)];
    render(<DiscoverRightPanel areas={areas} onAreaSelect={onAreaSelect} />);
    await user.click(screen.getByTestId('area-card'));
    expect(onAreaSelect).toHaveBeenCalledWith(expect.objectContaining({ areaKey: 'k1' }));
  });

  it('switches to listings mode when selectedArea is set', () => {
    const area = makeArea('k1', 'Manipal', 5);
    render(<DiscoverRightPanel areas={[area]} selectedArea={area} areaListings={[]} isLoadingListings={false} />);
    expect(screen.getByTestId('back-button')).toBeInTheDocument();
    expect(screen.getByText('Manipal')).toBeInTheDocument();
    expect(screen.queryByTestId('area-card')).not.toBeInTheDocument();
  });

  it('shows loading skeletons while isLoadingListings', () => {
    const area = makeArea('k1', 'Manipal', 5);
    render(<DiscoverRightPanel areas={[area]} selectedArea={area} areaListings={[]} isLoadingListings={true} />);
    expect(screen.getAllByTestId('listing-skeleton').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when areaListings is empty and not loading', () => {
    const area = makeArea('k1', 'Manipal', 5);
    render(<DiscoverRightPanel areas={[area]} selectedArea={area} areaListings={[]} isLoadingListings={false} />);
    expect(screen.getByText('No listings in this area yet')).toBeInTheDocument();
  });

  it('renders listing cards with price and locality', () => {
    const area = makeArea('k1', 'Manipal', 5);
    const listings: DiscoverAreaListingItem[] = [{
      id: 'l1',
      pricePaise: 500000 * 100,
      propertyType: 'apartment',
      locality: 'Manipal',
      primaryImageUrl: null,
    }];
    render(<DiscoverRightPanel areas={[area]} selectedArea={area} areaListings={listings} isLoadingListings={false} />);
    expect(screen.getAllByTestId('listing-card').length).toBe(1);
    // 'Manipal' appears in both the header and the locality field
    expect(screen.getAllByText('Manipal').length).toBeGreaterThanOrEqual(1);
  });

  it('back button calls onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const area = makeArea('k1', 'Manipal', 5);
    render(<DiscoverRightPanel areas={[area]} selectedArea={area} areaListings={[]} isLoadingListings={false} onBack={onBack} />);
    await user.click(screen.getByTestId('back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
