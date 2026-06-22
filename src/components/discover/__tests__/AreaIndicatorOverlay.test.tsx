import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { AreaIndicatorOverlay } from '../AreaIndicatorOverlay';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';

const mockArea: AreaPoint = {
  areaKey: 'manipal|udupi|udupi-manipal',
  areaLabel: 'Manipal',
  lat: 13.35,
  lon: 74.79,
  listingCount: 5,
};

const mockGroup: AreaGroup = {
  id: 'group-1',
  name: 'Central Udupi',
  subtitle: 'Near city centre',
  area_keys: ['manipal|udupi|udupi-manipal'],
  city: 'udupi-manipal',
};

const mockGroupNoSubtitle: AreaGroup = {
  id: 'group-2',
  name: 'North Belt',
  subtitle: null,
  area_keys: [],
  city: 'udupi-manipal',
};

describe('AreaIndicatorOverlay', () => {
  it('renders city state when no area or group is selected', () => {
    render(
      <AreaIndicatorOverlay
        cityLabel="Udupi / Manipal"
        focusedGroup={null}
        selectedArea={null}
      />,
    );
    const el = screen.getByTestId('area-indicator-overlay');
    expect(el).toHaveAttribute('data-state', 'city');
    expect(screen.getByText('Udupi / Manipal')).toBeInTheDocument();
  });

  it('renders group state when a group is focused but no area selected', () => {
    render(
      <AreaIndicatorOverlay
        cityLabel="Udupi / Manipal"
        focusedGroup={mockGroup}
        selectedArea={null}
      />,
    );
    const el = screen.getByTestId('area-indicator-overlay');
    expect(el).toHaveAttribute('data-state', 'group');
    expect(screen.getByText('Central Udupi')).toBeInTheDocument();
    expect(screen.getByText('Near city centre')).toBeInTheDocument();
  });

  it('falls back to a conservative generic subtitle when no metadata is available', () => {
    render(
      <AreaIndicatorOverlay
        cityLabel="Udupi / Manipal"
        focusedGroup={mockGroupNoSubtitle}
        selectedArea={null}
      />,
    );
    // No backend subtitle/region and no adapter entry → generic, never group-specific.
    expect(screen.getByText('Neighbourhood group')).toBeInTheDocument();
  });

  it('uses frontend metadata adapter region label when backend subtitle is absent (Issue #1595)', () => {
    render(
      <AreaIndicatorOverlay
        cityLabel="Udupi / Manipal"
        focusedGroup={{
          id: 'university-belt',
          name: 'University Belt',
          subtitle: null,
          region_label: null,
          school_count: 0,
          area_keys: [],
        }}
        selectedArea={null}
      />,
    );
    expect(screen.getByText('University Belt')).toBeInTheDocument();
    // Adapter fallback region label for the known group.
    expect(screen.getByText('Central Udupi')).toBeInTheDocument();
  });

  it('renders area state (highest priority) when an area is selected', () => {
    render(
      <AreaIndicatorOverlay
        cityLabel="Udupi / Manipal"
        focusedGroup={mockGroup}
        selectedArea={mockArea}
      />,
    );
    const el = screen.getByTestId('area-indicator-overlay');
    expect(el).toHaveAttribute('data-state', 'area');
    expect(screen.getByText('Manipal')).toBeInTheDocument();
    // City subline visible below the area label
    expect(screen.getByText('Udupi / Manipal')).toBeInTheDocument();
    // Group name should NOT be visible
    expect(screen.queryByText('Central Udupi')).not.toBeInTheDocument();
  });

  it('area state takes priority over group even when group present', () => {
    render(
      <AreaIndicatorOverlay
        cityLabel="Udupi / Manipal"
        focusedGroup={mockGroup}
        selectedArea={mockArea}
      />,
    );
    expect(
      screen.getByTestId('area-indicator-overlay'),
    ).toHaveAttribute('data-state', 'area');
  });
});
