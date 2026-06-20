/**
 * Unit tests for SchoolGroupAreasPanel (Issue #1485 Level-2 panel).
 *
 * Covers:
 * - Zone card area list rendering with correct counts
 * - Client-side join (group.area_keys ∩ discoverAreas)
 * - Loading skeleton state
 * - Empty state when no areas resolve
 * - Back button callback
 * - onSelectAreaKey called with canonical areaKey
 * - Start Over present
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SchoolGroupAreasPanel } from '../SchoolGroupAreasPanel';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const GROUP: AreaGroup = {
  id: 'south-zone',
  name: 'South Zone',
  subtitle: 'Southern neighbourhoods',
  region_label: 'South',
  school_count: 8,
  area_keys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Malpe', 'IN|KA|Udupi|Kunjibettu'],
};

const AREAS: DiscoverArea[] = [
  {
    areaKey: 'IN|KA|Udupi|Manipal',
    name: 'Manipal',
    geoCenterLat: 13.35,
    geoCenterLon: 74.79,
    listingCount: 12,
    schoolCount: 4,
  },
  {
    areaKey: 'IN|KA|Udupi|Malpe',
    name: 'Malpe',
    geoCenterLat: 13.36,
    geoCenterLon: 74.70,
    listingCount: 7,
    schoolCount: 2,
  },
  // This area is NOT in the group — should be filtered out
  {
    areaKey: 'IN|KA|Udupi|Hebri',
    name: 'Hebri',
    geoCenterLat: 13.48,
    geoCenterLon: 75.05,
    listingCount: 3,
    schoolCount: 1,
  },
];

const defaultProps = {
  group: GROUP,
  discoverAreas: AREAS,
  isLoading: false,
  onBack: vi.fn(),
  onSelectAreaKey: vi.fn(),
  onStartOver: vi.fn(),
  journey: 'school-first' as const,
};

const renderPanel = (props = defaultProps) =>
  render(
    <MemoryRouter>
      <SchoolGroupAreasPanel {...props} />
    </MemoryRouter>,
  );

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SchoolGroupAreasPanel', () => {
  it('renders area rows for areas in the group (client-side join)', () => {
    renderPanel();
    // Manipal and Malpe are in group.area_keys
    expect(screen.getByText('Manipal')).toBeInTheDocument();
    expect(screen.getByText('Malpe')).toBeInTheDocument();
    // Hebri is NOT in group.area_keys — must not appear
    expect(screen.queryByText('Hebri')).not.toBeInTheDocument();
  });

  it('shows school count and listing count for each area row', () => {
    renderPanel();
    // Manipal: 4 schools, 12 listings
    expect(screen.getByTestId('school-group-area-row-IN|KA|Udupi|Manipal')).toHaveTextContent('4 schools');
    expect(screen.getByTestId('school-group-area-row-IN|KA|Udupi|Manipal')).toHaveTextContent('12 listings');
    // Malpe: 2 schools, 7 listings
    expect(screen.getByTestId('school-group-area-row-IN|KA|Udupi|Malpe')).toHaveTextContent('2 schools');
    expect(screen.getByTestId('school-group-area-row-IN|KA|Udupi|Malpe')).toHaveTextContent('7 listings');
  });

  it('calls onSelectAreaKey with the exact canonical areaKey when a row is clicked', async () => {
    const onSelectAreaKey = vi.fn();
    renderPanel({ ...defaultProps, onSelectAreaKey });
    await userEvent.click(screen.getByTestId('school-group-area-row-IN|KA|Udupi|Manipal'));
    expect(onSelectAreaKey).toHaveBeenCalledWith('IN|KA|Udupi|Manipal');
    expect(onSelectAreaKey).toHaveBeenCalledTimes(1);
  });

  it('calls onBack when Back button is clicked', async () => {
    const onBack = vi.fn();
    renderPanel({ ...defaultProps, onBack });
    await userEvent.click(screen.getByTestId('school-group-areas-back-btn'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows loading skeletons when isLoading=true', () => {
    renderPanel({ ...defaultProps, isLoading: true });
    expect(screen.getByTestId('school-group-areas-loading')).toBeInTheDocument();
    // No area rows while loading
    expect(screen.queryByTestId(/school-group-area-row/)).not.toBeInTheDocument();
  });

  it('shows empty state when group area_keys match no discoverAreas', () => {
    const emptyGroup: AreaGroup = { ...GROUP, area_keys: ['IN|KA|Udupi|NonExistent'] };
    renderPanel({ ...defaultProps, group: emptyGroup });
    expect(screen.getByTestId('school-group-areas-empty')).toBeInTheDocument();
    expect(screen.getByText('No areas in this zone')).toBeInTheDocument();
  });

  it('shows empty state when discoverAreas is empty', () => {
    renderPanel({ ...defaultProps, discoverAreas: [] });
    expect(screen.getByTestId('school-group-areas-empty')).toBeInTheDocument();
  });

  it('renders "Back to all area zones" in the Back button label', () => {
    renderPanel();
    const backBtn = screen.getByTestId('school-group-areas-back-btn');
    expect(backBtn).toHaveTextContent('Back to all area zones');
  });

  it('renders the list container with the correct testid', () => {
    renderPanel();
    expect(screen.getByTestId('school-group-areas-list')).toBeInTheDocument();
  });

  it('singular school/listing labels for count=1', () => {
    const singleCountArea: DiscoverArea = {
      areaKey: 'IN|KA|Udupi|Manipal',
      name: 'Manipal',
      geoCenterLat: 13.35,
      geoCenterLon: 74.79,
      listingCount: 1,
      schoolCount: 1,
    };
    renderPanel({ ...defaultProps, discoverAreas: [singleCountArea, AREAS[1]] });
    expect(screen.getByTestId('school-group-area-row-IN|KA|Udupi|Manipal')).toHaveTextContent('1 school');
    expect(screen.getByTestId('school-group-area-row-IN|KA|Udupi|Manipal')).toHaveTextContent('1 listing');
  });
});
