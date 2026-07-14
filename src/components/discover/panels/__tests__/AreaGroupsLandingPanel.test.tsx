/**
 * Tests for AreaGroupsLandingPanel
 *
 * Covers:
 * - Loading state: shows skeleton cards
 * - Level 1 (no groupId / invalid groupId): renders group cards with correct content
 * - Level 2 (valid resolved groupId): renders that group's area rows, not group cards
 * - Cold-load pending (groupId set, isLoading=true): shows skeletons, no flash of cards
 * - Level-2 area row click → onSelectArea called with canonical areaKey
 * - Level-2 "up to all groups" → onClearGroup called
 * - Level-2 graceful empty state when group area_keys absent from discoverAreas
 * - Empty state (no groups): renders Browse-all fallback with areas
 * - Empty state (no groups, no areas): renders no-areas message
 * - Click group card → calls onSelectGroup with group id
 * - Click Browse-all area → calls onSelectArea with areaKey
 * - Issue #1178 invalid / blank groupId notice preserved
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const renderPanel = (ui: React.ReactElement, options = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(ui, { wrapper: Wrapper, ...options });
};

// ─── Loading state ────────────────────────────────────────────

describe('AreaGroupsLandingPanel — loading state', () => {
  it('renders skeleton cards when isLoading is true', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[]} isLoading={true} />,
    );
    expect(screen.getByTestId('area-groups-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('area-groups-list')).not.toBeInTheDocument();
  });

  it('sets aria-busy when loading', () => {
    const { container } = renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[]} isLoading={true} />,
    );
    const scrollable = container.querySelector('[aria-busy="true"]');
    expect(scrollable).toBeInTheDocument();
  });

  // Issue #1483 AC2 — cold-load with a groupId set must show skeletons, not flash group cards
  // or the invalid-group notice. The Level-2 branch is gated behind !isLoading.
  it('AC2 cold-load: groupId set + isLoading=true → skeletons only, no group cards, no invalid notice', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[]}
        isLoading={true}
        groupId="south-zone"
        fallbackAreas={[makeArea()]}
        onSelectArea={vi.fn()}
      />,
    );
    expect(screen.getByTestId('area-groups-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('area-group-level2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-groups-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-group-invalid-message')).not.toBeInTheDocument();
  });
});

// ─── Level-1: group card list ─────────────────────────────────

describe('AreaGroupsLandingPanel — Level-1 (no valid groupId) group card list', () => {
  const groups = [
    makeGroup({ id: 'south-zone', name: 'South Zone' }),
    makeGroup({ id: 'north-zone', name: 'North Zone', subtitle: 'Yelahanka, Hebbal', region_label: 'North', area_keys: ['IN|KA|Bengaluru|Yelahanka'] }),
  ];

  it('renders a card for each group when no groupId is set', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={groups} isLoading={false} />,
    );
    expect(screen.getByTestId('area-group-card-south-zone')).toBeInTheDocument();
    expect(screen.getByTestId('area-group-card-north-zone')).toBeInTheDocument();
  });

  it('renders group name, subtitle and region_label', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[makeGroup()]} isLoading={false} />,
    );
    expect(screen.getByText('South Zone')).toBeInTheDocument();
    expect(screen.getByText('Koramangala, HSR, BTM')).toBeInTheDocument();
    expect(screen.getAllByText('South').length).toBeGreaterThanOrEqual(1);
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

  it('does not render Browse-all or Level-2 when groups are present and no groupId', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[makeGroup()]} isLoading={false} />,
    );
    expect(screen.queryByText(/browse all areas/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-group-level2')).not.toBeInTheDocument();
  });

  it('renders under macro-region section headers when scope is null/absent', () => {
    const northGroup = makeGroup({ id: 'north-1', name: 'North Belt', region_label: 'North Bangalore' });
    const southGroup = makeGroup({ id: 'south-1', name: 'South Belt', region_label: 'South Bangalore' });
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[northGroup, southGroup]} isLoading={false} scope={null} />,
    );
    expect(screen.getByTestId('macro-region-section-North Bangalore')).toBeInTheDocument();
    expect(screen.getByTestId('macro-region-section-South Bangalore')).toBeInTheDocument();
  });

  it('filters groups by scope and shows clear filter banner when scope is provided', () => {
    const onClearScope = vi.fn();
    // Issue #1882 (Track A PR2 Slice S2c) — scope filtering now compares the
    // backend-derived region_key with strict equality (not a region_label/
    // direction heuristic), so the fixtures carry region_key explicitly.
    const northGroup = makeGroup({ id: 'north-1', name: 'North Belt', region_label: 'North Bangalore', region_key: 'north' });
    const southGroup = makeGroup({ id: 'south-1', name: 'South Belt', region_label: 'South Bangalore', region_key: 'south' });
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[northGroup, southGroup]}
        isLoading={false}
        scope="north"
        onClearScope={onClearScope}
      />,
    );
    expect(screen.getByTestId('macro-region-filter-banner')).toBeInTheDocument();
    expect(screen.getByText('North Belt')).toBeInTheDocument();
    expect(screen.queryByText('South Belt')).not.toBeInTheDocument();

    const clearBtn = screen.getByTestId('clear-scope-button');
    clearBtn.click();
    expect(onClearScope).toHaveBeenCalledTimes(1);
  });
});

// ─── Level-2: resolved groupId → area rows ───────────────────

describe('AreaGroupsLandingPanel — Level-2 (valid resolved groupId) area list (Issue #1483)', () => {
  const groupAreas = [
    makeArea({ areaKey: 'IN|KA|Bengaluru|Koramangala', name: 'Koramangala', listingCount: 23 }),
    makeArea({ areaKey: 'IN|KA|Bengaluru|HSR', name: 'HSR Layout', listingCount: 7 }),
  ];
  // A third area NOT in the group — must not appear in Level-2.
  const allAreas = [
    ...groupAreas,
    makeArea({ areaKey: 'IN|KA|Bengaluru|Whitefield', name: 'Whitefield', listingCount: 50 }),
  ];
  const group = makeGroup({
    id: 'south-zone',
    name: 'South Zone',
    area_keys: ['IN|KA|Bengaluru|Koramangala', 'IN|KA|Bengaluru|HSR'],
  });

  it('AC1 renders area rows for the resolved group, not group cards', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[group]}
        isLoading={false}
        groupId="south-zone"
        fallbackAreas={allAreas}
        onSelectArea={vi.fn()}
      />,
    );
    // Level-2 container present
    expect(screen.getByTestId('area-group-level2')).toBeInTheDocument();
    // Area rows for the group members
    expect(screen.getByTestId('browse-all-area-IN|KA|Bengaluru|Koramangala')).toBeInTheDocument();
    expect(screen.getByTestId('browse-all-area-IN|KA|Bengaluru|HSR')).toBeInTheDocument();
    // Non-member area must NOT appear
    expect(screen.queryByTestId('browse-all-area-IN|KA|Bengaluru|Whitefield')).not.toBeInTheDocument();
    // Group cards must NOT appear
    expect(screen.queryByTestId('area-group-card-south-zone')).not.toBeInTheDocument();
  });

  it('AC1 area row count equals number of group area_keys present in discoverAreas', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[group]}
        isLoading={false}
        groupId="south-zone"
        fallbackAreas={allAreas}
        onSelectArea={vi.fn()}
      />,
    );
    // 2 area_keys in group, 2 present in allAreas. Locality cards carry the
    // `browse-all-area-*` testid (active = <button>, zero-property = muted <div>).
    const areaRows = screen
      .getByTestId('area-group-level2')
      .querySelectorAll('[data-testid^="browse-all-area-"]');
    expect(areaRows).toHaveLength(2);
  });

  it('renders area name and property count in Level-2 locality cards', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[group]}
        isLoading={false}
        groupId="south-zone"
        fallbackAreas={allAreas}
        onSelectArea={vi.fn()}
      />,
    );
    expect(screen.getByText('Koramangala')).toBeInTheDocument();
    expect(screen.getByText('HSR Layout')).toBeInTheDocument();
    // Count + "properties" label live in separate nodes — assert on the card content.
    const koramangala = screen.getByTestId('browse-all-area-IN|KA|Bengaluru|Koramangala');
    expect(koramangala).toHaveTextContent('23');
    expect(koramangala).toHaveTextContent(/properties/i);
    const hsr = screen.getByTestId('browse-all-area-IN|KA|Bengaluru|HSR');
    expect(hsr).toHaveTextContent('7');
    expect(hsr).toHaveTextContent(/properties/i);
  });

  it('AC3 area-row click → onSelectArea called with canonical areaKey', async () => {
    const onSelectArea = vi.fn();
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[group]}
        isLoading={false}
        groupId="south-zone"
        fallbackAreas={allAreas}
        onSelectArea={onSelectArea}
      />,
    );
    await userEvent.click(screen.getByTestId('browse-all-area-IN|KA|Bengaluru|Koramangala'));
    expect(onSelectArea).toHaveBeenCalledWith('IN|KA|Bengaluru|Koramangala');
    expect(onSelectArea).toHaveBeenCalledTimes(1);
  });

  it('AC5 "up to all groups" button is rendered when onClearGroup is provided', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[group]}
        isLoading={false}
        groupId="south-zone"
        fallbackAreas={allAreas}
        onSelectArea={vi.fn()}
        onClearGroup={vi.fn()}
      />,
    );
    expect(screen.getByTestId('area-group-back-to-all')).toBeInTheDocument();
  });

  it('AC5 "up to all groups" button click → calls onClearGroup', async () => {
    const onClearGroup = vi.fn();
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[group]}
        isLoading={false}
        groupId="south-zone"
        fallbackAreas={allAreas}
        onSelectArea={vi.fn()}
        onClearGroup={onClearGroup}
      />,
    );
    await userEvent.click(screen.getByTestId('area-group-back-to-all'));
    expect(onClearGroup).toHaveBeenCalledTimes(1);
  });

  it('AC5 "up to all groups" button is NOT rendered when onClearGroup is omitted', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[group]}
        isLoading={false}
        groupId="south-zone"
        fallbackAreas={allAreas}
        onSelectArea={vi.fn()}
        // onClearGroup intentionally omitted
      />,
    );
    expect(screen.queryByTestId('area-group-back-to-all')).not.toBeInTheDocument();
  });

  it('"back to all groups" affordance uses the redesigned label (Issue #1595)', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[group]}
        isLoading={false}
        groupId="south-zone"
        fallbackAreas={allAreas}
        onSelectArea={vi.fn()}
        onClearGroup={vi.fn()}
      />,
    );
    expect(screen.getByTestId('area-group-back-to-all')).toHaveTextContent(
      'Back to all neighbourhood groups',
    );
  });

  it('graceful empty state when group area_keys are absent from discoverAreas', () => {
    // Group has two area_keys but neither appears in fallbackAreas.
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[group]}
        isLoading={false}
        groupId="south-zone"
        fallbackAreas={[makeArea({ areaKey: 'IN|KA|Bengaluru|Whitefield', name: 'Whitefield' })]}
        onSelectArea={vi.fn()}
      />,
    );
    // Level-2 container is still rendered (not a crash)
    expect(screen.getByTestId('area-group-level2')).toBeInTheDocument();
    // BrowseAllFallback empty state
    expect(screen.getByText('No areas found')).toBeInTheDocument();
    // No group cards
    expect(screen.queryByTestId('area-group-card-south-zone')).not.toBeInTheDocument();
  });

  it('Level-2 does NOT render when fallbackAreas/onSelectArea are not provided', () => {
    // Without the discriminated union being satisfied, Level-2 cannot show area rows.
    // Falls back to group-card list (Level-1) for the resolved groupId.
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[group]}
        isLoading={false}
        groupId="south-zone"
        // fallbackAreas and onSelectArea intentionally omitted
      />,
    );
    // Must NOT crash, must fall through to Level-1 group cards
    expect(screen.queryByTestId('area-group-level2')).not.toBeInTheDocument();
    expect(screen.getByTestId('area-groups-list')).toBeInTheDocument();
  });
});

// ─── Level-1: click group card ───────────────────────────────

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

// ─── Empty state: no groups, Browse-all fallback ─────────────

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

// ─── Issue #1178: invalid / blank groupId (preserved unchanged) ──

describe('AreaGroupsLandingPanel — invalid groupId message (Issue #1178)', () => {
  const groups = [
    makeGroup({ id: 'group-A', name: 'Group A' }),
    makeGroup({ id: 'group-B', name: 'Group B' }),
  ];

  it('AC7 shows a non-alarming notice when groupId matches no loaded group', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={groups}
        isLoading={false}
        groupId="nonexistent-slug"
      />,
    );
    const msg = screen.getByTestId('area-group-invalid-message');
    expect(msg).toBeInTheDocument();
    expect(msg).toHaveTextContent('This group is not available. Please select a group below.');
    expect(msg).toHaveAttribute('role', 'status');
    expect(msg).toHaveAttribute('aria-live', 'polite');
    // No card should be highlighted.
    expect(screen.getByTestId('area-group-card-group-A')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('area-group-card-group-B')).not.toHaveAttribute('aria-current');
    // Must NOT show Level-2 (invalid groupId — no focusedGroup)
    expect(screen.queryByTestId('area-group-level2')).not.toBeInTheDocument();
  });

  it('does NOT show the notice while loading (prevents flash on cold load)', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[]}
        isLoading={true}
        groupId="nonexistent-slug"
      />,
    );
    expect(screen.queryByTestId('area-group-invalid-message')).not.toBeInTheDocument();
  });

  it('does NOT show the notice when there are no groups (fallback mode)', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[]}
        isLoading={false}
        groupId="nonexistent-slug"
        fallbackAreas={[makeArea()]}
        onSelectArea={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('area-group-invalid-message')).not.toBeInTheDocument();
  });

  it('does NOT show the notice when groupId matches a loaded group', () => {
    // groupId matches → Level-2 renders, not group-cards with notice
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={groups}
        isLoading={false}
        groupId="group-A"
        fallbackAreas={[makeArea({ areaKey: 'IN|KA|Bengaluru|Koramangala' })]}
        onSelectArea={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('area-group-invalid-message')).not.toBeInTheDocument();
  });

  it('AC7 treats a whitespace-only groupId as no selection (no notice, no highlight, no Level-2)', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={groups}
        isLoading={false}
        groupId="   "
      />,
    );
    expect(screen.queryByTestId('area-group-invalid-message')).not.toBeInTheDocument();
    expect(screen.getByTestId('area-group-card-group-A')).not.toHaveAttribute('aria-current');
    expect(screen.queryByTestId('area-group-level2')).not.toBeInTheDocument();
  });
});

// ─── Issue #1178: group card highlight (now only for no-group/invalid cases) ──

describe('AreaGroupsLandingPanel — group card highlight for non-matching state (Issue #1178)', () => {
  const groups = [
    makeGroup({ id: 'group-A', name: 'Group A', area_keys: ['IN|KA|Bengaluru|Koramangala'] }),
    makeGroup({ id: 'group-B', name: 'Group B', area_keys: ['IN|KA|Bengaluru|HSR'] }),
  ];

  it('uses baseline styling for all cards when no groupId is set', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={groups} isLoading={false} />,
    );
    const cardA = screen.getByTestId('area-group-card-group-A');
    expect(cardA.className).toContain('bg-card');
    expect(cardA).not.toHaveAttribute('aria-current');
  });

  it('moves the highlight when groupId prop changes to an invalid id (falls through to group cards)', () => {
    // groupId="group-A" but no fallbackAreas → Level-2 skipped → group cards shown
    // In the group-card branch, focusedGroup drives the highlight.
    // Note: when groupId is valid AND fallbackAreas are provided, Level-2 shows instead of cards.
    // This test verifies the Level-1 highlight when fallbackAreas/onSelectArea are absent.
    const { rerender } = renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={groups}
        isLoading={false}
        groupId="group-A"
        // No fallbackAreas/onSelectArea — falls through to group-card Level-1
      />,
    );
    // group-A highlighted in Level-1
    expect(screen.getByTestId('area-group-card-group-A')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('area-group-card-group-B')).not.toHaveAttribute('aria-current');

    rerender(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={groups}
        isLoading={false}
        groupId="group-B"
      />,
    );
    expect(screen.getByTestId('area-group-card-group-A')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('area-group-card-group-B')).toHaveAttribute('aria-current', 'true');
  });

  it('highlights the matching card when groupId is padded but valid (no fallbackAreas)', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={groups}
        isLoading={false}
        groupId="  group-A  "
        // No fallbackAreas — Level-1 card view
      />,
    );
    const selected = screen.getByTestId('area-group-card-group-A');
    expect(selected).toHaveAttribute('aria-current', 'true');
    // Issue #1607 polish — the selected card uses the mock's copper highlight
    // (copper tint + copper border) instead of the previous navy/muted treatment.
    expect(selected.className).toContain('bg-copper-tint');
    expect(selected.className).toContain('border-copper');
    expect(screen.queryByTestId('area-group-invalid-message')).not.toBeInTheDocument();
  });
});

// ─── Header ──────────────────────────────────────────────────

describe('AreaGroupsLandingPanel — header', () => {
  it('renders the mock-aligned "Choose an area" hero title (Issue #1607)', () => {
    renderPanel(
      <AreaGroupsLandingPanel {...baseProps} groups={[]} isLoading={false} />,
    );
    // No cityLabel supplied → neutral "Choose an area" (never "…in this city").
    expect(screen.getByText('Choose an area')).toBeInTheDocument();
  });

  it('includes the city name in the hero when cityLabel is supplied (Issue #1607)', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[]}
        isLoading={false}
        cityLabel="Udupi"
      />,
    );
    expect(screen.getByText('Choose an area in Udupi')).toBeInTheDocument();
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
