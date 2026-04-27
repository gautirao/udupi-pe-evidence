import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DiscoverRightPanel } from '../DiscoverRightPanel';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';

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
});
