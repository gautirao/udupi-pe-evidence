/**
 * Tests for AreaGroupsLandingPanel
 *
 * Covers:
 * - Loading state: shows skeleton cards
 * - Loaded state with groups: renders group cards with correct content
 * - Empty state (no groups): renders Browse-all fallback with areas
 * - Empty state (no groups, no areas): renders no-areas message
 * - Click group card → calls onSelectGroup with group id
 * - Click Browse-all area → calls onSelectArea with areaKey
 * - Accessibility: aria-busy, aria-labels on buttons
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AreaGroupsLandingPanel } from '../AreaGroupsLandingPanel';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

// ─── Fixtures ─────────────────────────────────────────────────

const makeGroup = (overrides: Partial<AreaGroup> = {}): AreaGroup => ({
  id: 'south-zone',
  name: 'South Zone',
  subtitle: 'Koramangala, HSR, BTM',
  region_label: 'South',
  school_count: 12,
  area_keys: ['IN|KA|Bengaluru|Koramangala', 'IN|KA|Bengaluru|HSR'],
  ...overrides,
});

const makeArea = (overrides: Partial<DiscoverArea> = {}): DiscoverArea => ({
  areaKey: 'IN|KA|Bengaluru|Koramangala',
  name: 'Koramangala',
  geoCenterLat: 12.94,
  geoCenterLon: 77.62,
  listingCount: 23,
  schoolCount: 5,
  ...overrides,
});

const baseProps = {
  isLoading: false,
  onSelectGroup: vi.fn(),
  onStartOver: vi.fn(),
};

const renderPanel = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

// ─── Tests ────────────────────────────────────────────────────

describe('AreaGroupsLandingPanel — loading state', () => {
  it('renders skeleton cards when isLoading is true', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[]} isLoading={true} />,
    );
    expect(screen.getByTestId('area-groups-loading')).toBeInTheDocument();
    // No group list should be visible
    expect(screen.queryByTestId('area-groups-list')).not.toBeInTheDocument();
  });

  it('sets aria-busy when loading', () => {
    const { container } = renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[]} isLoading={true} />,
    );
    const scrollable = container.querySelector('[aria-busy="true"]');
    expect(scrollable).toBeInTheDocument();
  });
});

describe('AreaGroupsLandingPanel — loaded state with groups', () => {
  const groups = [
    makeGroup({ id: 'south-zone', name: 'South Zone' }),
    makeGroup({ id: 'north-zone', name: 'North Zone', subtitle: 'Yelahanka, Hebbal', region_label: 'North', area_keys: ['IN|KA|Bengaluru|Yelahanka'] }),
  ];

  it('renders a card for each group', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={groups} isLoading={false} />,
    );
    expect(screen.getByTestId('area-group-card-south-zone')).toBeInTheDocument();
    expect(screen.getByTestId('area-group-card-north-zone')).toBeInTheDocument();
  });

  it('renders group name', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[makeGroup()]} isLoading={false} />,
    );
    expect(screen.getByText('South Zone')).toBeInTheDocument();
  });

  it('renders group subtitle when present', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[makeGroup()]} isLoading={false} />,
    );
    expect(screen.getByText('Koramangala, HSR, BTM')).toBeInTheDocument();
  });

  it('renders region_label when present', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[makeGroup()]} isLoading={false} />,
    );
    expect(screen.getByText('South')).toBeInTheDocument();
  });

  it('shows area count badge', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[makeGroup()]} isLoading={false} />,
    );
    expect(screen.getByText('2 areas')).toBeInTheDocument();
  });

  it('renders group list container', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[makeGroup()]} isLoading={false} />,
    );
    expect(screen.getByTestId('area-groups-list')).toBeInTheDocument();
  });

  it('does not render Browse-all when groups are present', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[makeGroup()]} isLoading={false} />,
    );
    expect(screen.queryByText(/browse all areas/i)).not.toBeInTheDocument();
  });
});

describe('AreaGroupsLandingPanel — click group card → calls onSelectGroup', () => {
  it('calls onSelectGroup with group id on card click', async () => {
    const onSelectGroup = vi.fn();
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[makeGroup({ id: 'south-zone' })]}
        isLoading={false}
        onSelectGroup={onSelectGroup}
      />,
    );
    await userEvent.click(screen.getByTestId('area-group-card-south-zone'));
    expect(onSelectGroup).toHaveBeenCalledWith('south-zone');
  });

  it('calls onSelectGroup once per click (no duplicate submission)', async () => {
    const onSelectGroup = vi.fn();
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[makeGroup({ id: 'south-zone' })]}
        isLoading={false}
        onSelectGroup={onSelectGroup}
      />,
    );
    await userEvent.click(screen.getByTestId('area-group-card-south-zone'));
    expect(onSelectGroup).toHaveBeenCalledTimes(1);
  });
});

describe('AreaGroupsLandingPanel — empty state (no groups, with fallback areas)', () => {
  const areas = [
    makeArea({ areaKey: 'IN|KA|Bengaluru|Koramangala', name: 'Koramangala', listingCount: 23 }),
    makeArea({ areaKey: 'IN|KA|Bengaluru|HSR', name: 'HSR Layout', listingCount: 7 }),
  ];

  it('renders Browse-all section heading', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[]}
        isLoading={false}
        fallbackAreas={areas}
        onSelectArea={vi.fn()}
      />,
    );
    expect(screen.getByText(/browse all areas/i)).toBeInTheDocument();
  });

  it('renders an item for each fallback area', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[]}
        isLoading={false}
        fallbackAreas={areas}
        onSelectArea={vi.fn()}
      />,
    );
    expect(screen.getByTestId('browse-all-area-IN|KA|Bengaluru|Koramangala')).toBeInTheDocument();
    expect(screen.getByTestId('browse-all-area-IN|KA|Bengaluru|HSR')).toBeInTheDocument();
  });

  it('renders area name and listing count', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[]}
        isLoading={false}
        fallbackAreas={[makeArea({ name: 'Koramangala', listingCount: 23 })]}
        onSelectArea={vi.fn()}
      />,
    );
    expect(screen.getByText('Koramangala')).toBeInTheDocument();
    expect(screen.getByText('23 listings')).toBeInTheDocument();
  });

  it('calls onSelectArea with areaKey when a fallback area is clicked', async () => {
    const onSelectArea = vi.fn();
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[]}
        isLoading={false}
        fallbackAreas={[makeArea({ areaKey: 'IN|KA|Bengaluru|Koramangala' })]}
        onSelectArea={onSelectArea}
      />,
    );
    await userEvent.click(screen.getByTestId('browse-all-area-IN|KA|Bengaluru|Koramangala'));
    expect(onSelectArea).toHaveBeenCalledWith('IN|KA|Bengaluru|Koramangala');
  });
});

describe('AreaGroupsLandingPanel — empty state (no groups, no fallback areas)', () => {
  it('renders no-areas message', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[]}
        isLoading={false}
        fallbackAreas={[]}
        onSelectArea={vi.fn()}
      />,
    );
    expect(screen.getByText('No areas found')).toBeInTheDocument();
  });
});

describe('AreaGroupsLandingPanel — header', () => {
  it('renders "Select area" as panel header title', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[]} isLoading={false} />,
    );
    expect(screen.getByText('Select area')).toBeInTheDocument();
  });

  it('shows Start over button (from PanelHeader with journey=area-first)', () => {
    const onStartOver = vi.fn();
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[]} isLoading={false} onStartOver={onStartOver} />,
    );
    expect(screen.getByTestId('start-over-button')).toBeInTheDocument();
  });

  it('calls onStartOver when Start over is clicked', async () => {
    const onStartOver = vi.fn();
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[]} isLoading={false} onStartOver={onStartOver} />,
    );
    await userEvent.click(screen.getByTestId('start-over-button'));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });
});
