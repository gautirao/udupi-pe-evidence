/**
 * Tests for AgriRegionalGroupsPanel
 *
 * Covers all 8 canonical test IDs:
 *   agri-regional-groups, agri-regional-group-row, agri-regional-group-label,
 *   agri-regional-group-count, agri-regional-group-acreage, agri-regional-groups-empty,
 *   agri-regional-groups-loading, agri-regional-group-clear
 *
 * Scenarios:
 * - Loading state renders agri-regional-groups-loading
 * - Empty groups renders agri-regional-groups-empty
 * - 3 groups: all canonical test IDs present
 * - Selecting a group calls onSelectGroup with correct { directionKey, distanceBandKey }
 * - Selected group shows clear button; clicking calls onSelectGroup(null)
 * - agriAcreage=null: acreage element absent
 * - agriAcreage=125.5: renders formatted "125.5 acres"
 * - distanceBandKey='50_up' renders correctly
 * - Label text is group.label (not a derived string)
 * - Count shows listingCount
 * - Error fallback (empty groups, hook caught): no crash
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AgriRegionalGroupsPanel } from '../AgriRegionalGroupsPanel';
import type { RegionalAreaGroup } from '@/hooks/useRegionalAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeGroup = (overrides: Partial<RegionalAreaGroup> = {}): RegionalAreaGroup => ({
  label: 'North of Udupi · 10–25 km',
  directionKey: 'N',
  distanceBandKey: '10_25',
  listingCount: 7,
  agriAcreage: 125.5,
  areaKeys: ['IN|KA|Udupi|Area1'],
  ...overrides,
});

const makeArea = (overrides: Partial<DiscoverArea> = {}): DiscoverArea => ({
  areaKey: 'IN|KA|Udupi|Manipal',
  name: 'Manipal',
  geoCenterLat: 13.35,
  geoCenterLon: 74.79,
  listingCount: 12,
  schoolCount: 3,
  ...overrides,
});

const noop = () => {};

const defaultProps = {
  city: 'udupi',
  groups: [],
  isLoading: false,
  selectedGroup: null,
  onSelectGroup: noop,
};

// ─── Loading state ────────────────────────────────────────────────────────────

describe('AgriRegionalGroupsPanel — loading', () => {
  it('renders agri-regional-groups-loading when isLoading=true', () => {
    render(<AgriRegionalGroupsPanel {...defaultProps} isLoading={true} />);
    expect(screen.getByTestId('agri-regional-groups-loading')).toBeInTheDocument();
  });

  it('does NOT render groups container while loading', () => {
    render(<AgriRegionalGroupsPanel {...defaultProps} isLoading={true} />);
    expect(screen.queryByTestId('agri-regional-groups')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agri-regional-groups-empty')).not.toBeInTheDocument();
  });
});

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('AgriRegionalGroupsPanel — empty', () => {
  it('renders agri-regional-groups-empty when groups is empty', () => {
    render(<AgriRegionalGroupsPanel {...defaultProps} groups={[]} />);
    expect(screen.getByTestId('agri-regional-groups-empty')).toBeInTheDocument();
  });

  it('does NOT render groups container when empty', () => {
    render(<AgriRegionalGroupsPanel {...defaultProps} groups={[]} />);
    expect(screen.queryByTestId('agri-regional-groups')).not.toBeInTheDocument();
  });

  it('shows fallback area list when discoverAreas supplied', () => {
    const areas = [makeArea({ name: 'Manipal' }), makeArea({ areaKey: 'other', name: 'Udupi Town' })];
    const onSelectAreaKey = vi.fn();
    render(
      <AgriRegionalGroupsPanel
        {...defaultProps}
        groups={[]}
        discoverAreas={areas}
        onSelectAreaKey={onSelectAreaKey}
      />,
    );
    expect(screen.getByText('Manipal')).toBeInTheDocument();
    expect(screen.getByText('Udupi Town')).toBeInTheDocument();
  });

  it('no crash when groups=[] and no discoverAreas (error fallback)', () => {
    expect(() =>
      render(<AgriRegionalGroupsPanel {...defaultProps} groups={[]} />),
    ).not.toThrow();
    expect(screen.getByTestId('agri-regional-groups-empty')).toBeInTheDocument();
  });
});

// ─── Groups list ──────────────────────────────────────────────────────────────

describe('AgriRegionalGroupsPanel — groups rendered', () => {
  const groups = [
    makeGroup({ directionKey: 'N', distanceBandKey: '10_25', label: 'North · 10–25 km', listingCount: 5, agriAcreage: 100.0 }),
    makeGroup({ directionKey: 'S', distanceBandKey: '0_10', label: 'South · 0–10 km', listingCount: 3, agriAcreage: null }),
    makeGroup({ directionKey: 'N', distanceBandKey: '50_up', label: 'North · 50+ km', listingCount: 1, agriAcreage: 200.3 }),
  ];

  it('renders agri-regional-groups container', () => {
    render(<AgriRegionalGroupsPanel {...defaultProps} groups={groups} />);
    expect(screen.getByTestId('agri-regional-groups')).toBeInTheDocument();
  });

  it('renders a row for each group', () => {
    render(<AgriRegionalGroupsPanel {...defaultProps} groups={groups} />);
    expect(screen.getAllByTestId('agri-regional-group-row')).toHaveLength(3);
  });

  it('renders agri-regional-group-label for each group with group.label text', () => {
    render(<AgriRegionalGroupsPanel {...defaultProps} groups={groups} />);
    const labels = screen.getAllByTestId('agri-regional-group-label');
    expect(labels).toHaveLength(3);
    expect(labels[0]).toHaveTextContent('North · 10–25 km');
    expect(labels[1]).toHaveTextContent('South · 0–10 km');
    expect(labels[2]).toHaveTextContent('North · 50+ km');
  });

  it('renders agri-regional-group-count with listingCount', () => {
    render(<AgriRegionalGroupsPanel {...defaultProps} groups={groups} />);
    const counts = screen.getAllByTestId('agri-regional-group-count');
    expect(counts[0]).toHaveTextContent('5');
    expect(counts[1]).toHaveTextContent('3');
    expect(counts[2]).toHaveTextContent('1');
  });

  it('renders agri-regional-group-acreage when agriAcreage is a positive number', () => {
    render(<AgriRegionalGroupsPanel {...defaultProps} groups={groups} />);
    const acreages = screen.getAllByTestId('agri-regional-group-acreage');
    // groups[0] has 100.0, groups[2] has 200.3; groups[1] has null
    expect(acreages).toHaveLength(2);
    expect(acreages[0]).toHaveTextContent('100.0 acres');
    expect(acreages[1]).toHaveTextContent('200.3 acres');
  });

  it('does NOT render acreage element when agriAcreage is null', () => {
    const singleGroup = [makeGroup({ agriAcreage: null, directionKey: 'E', distanceBandKey: '0_10', label: 'East · 0–10 km' })];
    render(<AgriRegionalGroupsPanel {...defaultProps} groups={singleGroup} />);
    expect(screen.queryByTestId('agri-regional-group-acreage')).not.toBeInTheDocument();
  });

  it('does NOT render "undefined" or "null" as acreage text', () => {
    render(<AgriRegionalGroupsPanel {...defaultProps} groups={groups} />);
    const acreages = screen.queryAllByTestId('agri-regional-group-acreage');
    for (const el of acreages) {
      expect(el.textContent).not.toContain('undefined');
      expect(el.textContent).not.toContain('null');
    }
  });

  it('renders distanceBandKey 50_up group correctly', () => {
    render(<AgriRegionalGroupsPanel {...defaultProps} groups={groups} />);
    // groups[2] has distanceBandKey='50_up' and label 'North · 50+ km'
    const labels = screen.getAllByTestId('agri-regional-group-label');
    expect(labels[2]).toHaveTextContent('North · 50+ km');
  });
});

// ─── Selection behavior ───────────────────────────────────────────────────────

describe('AgriRegionalGroupsPanel — selection', () => {
  it('calls onSelectGroup with correct { directionKey, distanceBandKey } on click', async () => {
    const user = userEvent.setup();
    const onSelectGroup = vi.fn();
    const groups = [
      makeGroup({ directionKey: 'NE', distanceBandKey: '25_50', label: 'NE · 25–50 km', agriAcreage: null }),
    ];

    render(
      <AgriRegionalGroupsPanel
        {...defaultProps}
        groups={groups}
        onSelectGroup={onSelectGroup}
      />,
    );

    const row = screen.getByTestId('agri-regional-group-row');
    await user.click(row);

    expect(onSelectGroup).toHaveBeenCalledOnce();
    expect(onSelectGroup).toHaveBeenCalledWith({ directionKey: 'NE', distanceBandKey: '25_50' });
  });

  it('shows agri-regional-group-clear button for the selected group', () => {
    const groups = [
      makeGroup({ directionKey: 'N', distanceBandKey: '10_25', label: 'North · 10–25 km', agriAcreage: null }),
      makeGroup({ directionKey: 'S', distanceBandKey: '0_10', label: 'South · 0–10 km', agriAcreage: null }),
    ];

    render(
      <AgriRegionalGroupsPanel
        {...defaultProps}
        groups={groups}
        selectedGroup={{ directionKey: 'N', distanceBandKey: '10_25' }}
      />,
    );

    // Only the selected group shows the clear button
    expect(screen.getByTestId('agri-regional-group-clear')).toBeInTheDocument();
  });

  it('clicking the clear button calls onSelectGroup(null)', async () => {
    const user = userEvent.setup();
    const onSelectGroup = vi.fn();
    const groups = [
      makeGroup({ directionKey: 'N', distanceBandKey: '10_25', label: 'North · 10–25 km', agriAcreage: null }),
    ];

    render(
      <AgriRegionalGroupsPanel
        {...defaultProps}
        groups={groups}
        selectedGroup={{ directionKey: 'N', distanceBandKey: '10_25' }}
        onSelectGroup={onSelectGroup}
      />,
    );

    const clearBtn = screen.getByTestId('agri-regional-group-clear');
    await user.click(clearBtn);

    expect(onSelectGroup).toHaveBeenCalledOnce();
    expect(onSelectGroup).toHaveBeenCalledWith(null);
  });

  it('does NOT show clear button for unselected groups', () => {
    const groups = [
      makeGroup({ directionKey: 'N', distanceBandKey: '10_25', label: 'North · 10–25 km', agriAcreage: null }),
    ];

    render(
      <AgriRegionalGroupsPanel
        {...defaultProps}
        groups={groups}
        selectedGroup={null}
      />,
    );

    expect(screen.queryByTestId('agri-regional-group-clear')).not.toBeInTheDocument();
  });
});

// ─── Acreage formatting ───────────────────────────────────────────────────────

describe('AgriRegionalGroupsPanel — acreage formatting', () => {
  it('formats agriAcreage=125.5 as "125.5 acres"', () => {
    const groups = [makeGroup({ agriAcreage: 125.5, directionKey: 'W', distanceBandKey: '0_10', label: 'West · 0–10 km' })];
    render(<AgriRegionalGroupsPanel {...defaultProps} groups={groups} />);
    expect(screen.getByTestId('agri-regional-group-acreage')).toHaveTextContent('125.5 acres');
  });

  it('does NOT render acreage when agriAcreage=0', () => {
    const groups = [makeGroup({ agriAcreage: 0, directionKey: 'W', distanceBandKey: '0_10', label: 'West · 0–10 km' })];
    render(<AgriRegionalGroupsPanel {...defaultProps} groups={groups} />);
    // 0 is not a positive number — acreage element should be absent
    expect(screen.queryByTestId('agri-regional-group-acreage')).not.toBeInTheDocument();
  });
});
