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
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AreaGroupsLandingPanel } from '../AreaGroupsLandingPanel';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { RegionScopedAreaGroup } from '@/hooks/useRegionScopedAreaGroups';
import type { ScopeNamespaces } from '@/features/discover/presentation/resolveScope';

// Issue #1910 (PR2) — capture the exact props ScopedSearch is rendered with,
// so the "ScopedSearch independence guard" test can assert regionScopedGroups
// never leaks into (or otherwise changes) ScopedSearch's own prop contract.
const scopedSearchCalls: unknown[] = [];
vi.mock('@/components/discover/ScopedSearch', () => ({
  ScopedSearch: (props: Record<string, unknown>) => {
    scopedSearchCalls.push(props);
    return <div data-testid="mock-scoped-search" />;
  },
}));

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
    //
    // Issue #1910 (PR2 review fix, round 3, code-review follow-up) — the
    // scope/region_key values here were originally the bare direction words
    // 'north'/'south'. Round 2 of this same review added canonical region-key
    // ALIASES (see resolveScope.ts CANONICAL_REGION_KEY_SET/REGION_KEY_ALIASES)
    // that classify those exact words as a REGION scope, which after this
    // round's `isRegionScopeUnresolved` guard now suppresses the Resolution-A
    // group-card fallback this test exercises (this test deliberately omits
    // regionScopedGroups, simulating a caller that never wires the
    // projection). Renamed to non-colliding tokens so this test keeps
    // isolating the legacy Resolution-A filter + clear-banner behavior it's
    // actually about, unaffected by the unrelated region-projection guard.
    const northGroup = makeGroup({ id: 'north-1', name: 'North Belt', region_label: 'North Bangalore', region_key: 'north-belt' });
    const southGroup = makeGroup({ id: 'south-1', name: 'South Belt', region_label: 'South Bangalore', region_key: 'south-belt' });
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[northGroup, southGroup]}
        isLoading={false}
        scope="north-belt"
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

// ─── Issue #1910 (PR2) — Resolution A→B: region-scoped projection ───────────

describe('AreaGroupsLandingPanel — region-scoped projection (Issue #1910 Resolution A→B)', () => {
  const makeRegionScopedGroup = (
    overrides: Partial<RegionScopedAreaGroup> = {},
  ): RegionScopedAreaGroup => ({
    groupSlug: 'tech-corridor',
    name: 'Tech Corridor',
    subtitle: null,
    scopingRegionKey: 'east',
    regionDisplayOrder: 1,
    areaKeys: ['IN|KA|Bengaluru|Whitefield'],
    listingCount: 42,
    focusLat: 12.97,
    focusLon: 77.75,
    minLat: 12.9,
    minLon: 77.7,
    maxLat: 13.0,
    maxLon: 77.8,
    boundsStatus: 'COMPLETE',
    ...overrides,
  });

  it('shows a group in the region-scoped list even though its OLD unscoped region_key is a different region ("Resolution A" bug)', () => {
    // The unscoped `groups` list carries this group's plurality region_key as
    // 'west' — under the OLD region_key === activeScope filter ("Resolution
    // A"), it would be silently dropped when scope="east" even though it has
    // real members in the east region. The region-scoped projection
    // (regionScopedGroups) is the source of truth once supplied.
    const unscopedGroups = [
      makeGroup({
        id: 'tech-corridor',
        name: 'Tech Corridor',
        region_key: 'west',
        area_keys: ['IN|KA|Bengaluru|Whitefield', 'IN|KA|Bengaluru|SomeWestArea'],
      }),
    ];
    const regionScopedGroups = [makeRegionScopedGroup()];

    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={unscopedGroups}
        isLoading={false}
        scope="east"
        summaryRegions={[{ regionKey: 'east', regionLabel: 'East Bangalore' }]}
        regionScopedGroups={regionScopedGroups}
        isLoadingRegionScopedGroups={false}
      />,
    );

    // Group card renders (Resolution A would have dropped it).
    expect(screen.getByTestId('area-group-card-tech-corridor')).toBeInTheDocument();
    // "for sale" figure comes from the projection's own listingCount (42),
    // not a client-side area-sum join.
    const card = screen.getByTestId('area-group-card-tech-corridor');
    expect(card).toHaveTextContent('42');
    expect(card).toHaveTextContent(/for sale/i);
  });

  it('uses the projection listingCount (via summaryRegions) for the intro total tally, not a re-sum from fallbackAreas', () => {
    const unscopedGroups = [
      makeGroup({ id: 'tech-corridor', name: 'Tech Corridor', region_key: 'west' }),
    ];
    const regionScopedGroups = [makeRegionScopedGroup({ listingCount: 42 })];

    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={unscopedGroups}
        isLoading={false}
        scope="east"
        // Issue #1910 (PR2 review fix, Finding 5) — summaryRegions must carry
        // a real listingCount for the intro total to render at all; a
        // missing/non-numeric listingCount now hides the total entirely
        // (see "hides the headline... stat entirely" below) rather than
        // ever falling back to summing regionScopedGroups' own figures.
        summaryRegions={[{ regionKey: 'east', regionLabel: 'East Bangalore', listingCount: 42 }]}
        regionScopedGroups={regionScopedGroups}
        // A fallbackAreas listing count that does NOT match 42 — proves the
        // intro tally is not derived from this.
        fallbackAreas={[makeArea({ areaKey: 'IN|KA|Bengaluru|Whitefield', listingCount: 999 })]}
        onSelectArea={vi.fn()}
      />,
    );

    expect(screen.getByTestId('area-groups-intro')).toHaveTextContent('42');
    expect(screen.getByTestId('area-groups-intro')).not.toHaveTextContent('999');
  });

  // ─── Issue #1910 (PR2 review fix, Finding 1) ───────────────────────────────
  // area_group_members has no uniqueness constraint, so two groups in the SAME
  // region can share a member area. Summing each group's own (per-group
  // de-duplicated) listingCount then double-counts any listing in that shared
  // area. The headline total must instead come from summaryRegions' own
  // region-level COUNT(DISTINCT ...) figure.
  it('uses summaryRegions.listingCount for the headline total, not the naive sum of overlapping groups', () => {
    const sharedAreaKey = 'IN|KA|Bengaluru|SharedZone';
    const unscopedGroups = [
      makeGroup({ id: 'tech-corridor', name: 'Tech Corridor', region_key: 'east', area_keys: [sharedAreaKey, 'IN|KA|Bengaluru|TechOnly'] }),
      makeGroup({ id: 'north-corridor', name: 'North Corridor', region_key: 'east', area_keys: [sharedAreaKey, 'IN|KA|Bengaluru|NorthOnly'] }),
    ];
    // Both groups' listingCount are already de-duplicated WITHIN each group,
    // but they share `sharedAreaKey` — so naive summing (30 + 25 = 55) double-
    // counts the listings in that shared area. The true region-level distinct
    // total is 40 (what summaryRegions reports).
    const regionScopedGroups = [
      makeRegionScopedGroup({ groupSlug: 'tech-corridor', scopingRegionKey: 'east', areaKeys: [sharedAreaKey, 'IN|KA|Bengaluru|TechOnly'], listingCount: 30 }),
      makeRegionScopedGroup({ groupSlug: 'north-corridor', name: 'North Corridor', scopingRegionKey: 'east', areaKeys: [sharedAreaKey, 'IN|KA|Bengaluru|NorthOnly'], listingCount: 25 }),
    ];
    const naiveSum = 30 + 25; // 55 — what the pre-fix code would have shown.
    const trueDistinctTotal = 40; // what summaryRegions (the real source of truth) reports.
    expect(trueDistinctTotal).toBeLessThan(naiveSum);

    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={unscopedGroups}
        isLoading={false}
        scope="east"
        summaryRegions={[{ regionKey: 'east', regionLabel: 'East Bangalore', listingCount: trueDistinctTotal }]}
        regionScopedGroups={regionScopedGroups}
        isLoadingRegionScopedGroups={false}
      />,
    );

    const intro = screen.getByTestId('area-groups-intro');
    expect(intro).toHaveTextContent(String(trueDistinctTotal));
    expect(intro).not.toHaveTextContent(String(naiveSum));
  });

  // Issue #1910 (PR2 review fix, Finding 5) — when summaryRegions has no
  // matching entry for the active region, the headline total must hide
  // entirely (null) rather than fall back to summing regionScopedGroups'
  // own listingCounts — a figure this same file's module comment already
  // documents as double-counting whenever a listing's area belongs to two
  // groups active in this region. A known-wrong number is worse than none.
  it('hides the headline "properties" stat entirely when summaryRegions has no matching entry — never falls back to the double-counting group-sum', () => {
    const regionScopedGroups = [
      makeRegionScopedGroup({ groupSlug: 'tech-corridor', scopingRegionKey: 'east', listingCount: 30 }),
      makeRegionScopedGroup({ groupSlug: 'north-corridor', name: 'North Corridor', scopingRegionKey: 'east', listingCount: 25 }),
    ];
    const wouldBeNaiveSum = 30 + 25; // 55 — the double-counting figure that must NEVER render.

    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        // Non-empty so the panel's outer `groups.length > 0` gate renders
        // the intro/zone-list body at all — the region-projection branch
        // (useRegionProjection) replaces this unscoped list for DISPLAY,
        // but the top-level gate still reads the raw `groups` prop.
        groups={[makeGroup({ id: 'tech-corridor', region_key: 'west' })]}
        isLoading={false}
        scope="east"
        // No matching entry for the resolved region key — summaryRegions
        // covers a different region entirely.
        summaryRegions={[{ regionKey: 'west', regionLabel: 'West Bangalore', listingCount: 999 }]}
        regionScopedGroups={regionScopedGroups}
        isLoadingRegionScopedGroups={false}
      />,
    );

    const intro = screen.getByTestId('area-groups-intro');
    expect(intro).not.toHaveTextContent(String(wouldBeNaiveSum));
    // Stat is a dedicated tile that AreaGroupsIntro only renders when
    // forSaleCount != null — assert the "properties" label itself is absent
    // WITHIN the intro card, proving the tile was hidden rather than merely
    // showing a different number.
    expect(within(intro).queryByText(/propert(y|ies)/i)).not.toBeInTheDocument();
  });

  it('shows loading skeletons (not a stale card list) when a refetch is in flight for an already-supplied projection', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[makeGroup({ id: 'tech-corridor', region_key: 'west' })]}
        isLoading={false}
        scope="east"
        summaryRegions={[{ regionKey: 'east', regionLabel: 'East Bangalore' }]}
        regionScopedGroups={[makeRegionScopedGroup()]}
        isLoadingRegionScopedGroups={true}
      />,
    );
    expect(screen.getByTestId('region-scoped-groups-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('area-group-card-tech-corridor')).not.toBeInTheDocument();
  });

  it('shows loading skeletons for the zone list on the FIRST load of a region scope, before regionScopedGroups has ever been supplied (Issue #1910 review fix, Finding 2)', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[makeGroup({ id: 'tech-corridor', region_key: 'west' })]}
        isLoading={false}
        scope="east"
        summaryRegions={[{ regionKey: 'east', regionLabel: 'East Bangalore' }]}
        regionScopedGroups={undefined}
        isLoadingRegionScopedGroups={true}
      />,
    );
    // Review fix (#1910 PR2) — regionScopedGroups is undefined on the FIRST
    // load of a region scope (it has never been fetched yet), exactly as it
    // is once a fetch genuinely fails. The loading gate is now
    // `isRegionScopeActive && isLoadingRegionScopedGroups` (not
    // `useRegionProjection && ...`, which additionally required
    // regionScopedGroups to already be a defined array — never true here) so
    // this renders the skeleton, never the stale/incorrect Resolution-A
    // (`scopedGroups`) fallback list that region_key-filters the unscoped
    // `groups` prop.
    expect(screen.getByTestId('region-scoped-groups-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('area-group-card-tech-corridor')).not.toBeInTheDocument();
  });

  it('does NOT use the projection when scope resolves to a GROUP, not a region (Level-1 group-as-scope case unaffected)', () => {
    const groups = [
      makeGroup({ id: 'south-udupi', name: 'South Udupi', region_key: null, area_keys: ['IN|KA|Udupi|Malpe'] }),
    ];
    const regionScopedGroups = [makeRegionScopedGroup({ groupSlug: 'should-not-appear' })];

    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={groups}
        isLoading={false}
        scope="south-udupi"
        summaryRegions={[]}
        regionScopedGroups={regionScopedGroups}
      />,
    );

    // scope="south-udupi" resolves to kind:'group' (matches a group slug, not
    // a region key) — the region projection must NOT be used.
    expect(screen.queryByTestId('area-group-card-should-not-appear')).not.toBeInTheDocument();
  });
});

// ─── Issue #1910 (PR2) — Udupi / non-region-scope non-regression ────────────

describe('AreaGroupsLandingPanel — non-region-scope non-regression (Issue #1910)', () => {
  it('keeps the existing macro-region-section rendering unchanged when scope is null, regardless of regionScopedGroups', () => {
    const northGroup = makeGroup({ id: 'north-1', name: 'North Belt', region_label: 'North Bangalore' });
    const southGroup = makeGroup({ id: 'south-1', name: 'South Belt', region_label: 'South Bangalore' });
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={[northGroup, southGroup]}
        isLoading={false}
        scope={null}
        regionScopedGroups={undefined}
      />,
    );
    expect(screen.getByTestId('macro-region-section-North Bangalore')).toBeInTheDocument();
    expect(screen.getByTestId('macro-region-section-South Bangalore')).toBeInTheDocument();
  });
});

// ─── Issue #1910 (PR2) — ScopedSearch independence guard ────────────────────

describe('AreaGroupsLandingPanel — ScopedSearch independence guard (Issue #1910)', () => {
  it('renders ScopedSearch with identical props whether or not regionScopedGroups is supplied', () => {
    scopedSearchCalls.length = 0;
    const sharedProps = {
      ...baseProps,
      groups: [makeGroup({ id: 'north-1', region_key: 'north' })],
      isLoading: false,
      scope: 'north',
      summaryRegions: [{ regionKey: 'north', regionLabel: 'North Bangalore' }],
      city: 'bangalore',
      fallbackAreas: [makeArea()],
      onSelectArea: vi.fn(),
    };

    const { unmount } = renderPanel(<AreaGroupsLandingPanel {...sharedProps} />);
    expect(scopedSearchCalls).toHaveLength(1);
    const withoutProjection = scopedSearchCalls[0];
    unmount();

    scopedSearchCalls.length = 0;
    renderPanel(
      <AreaGroupsLandingPanel
        {...sharedProps}
        regionScopedGroups={[
          {
            groupSlug: 'tech-corridor',
            name: 'Tech Corridor',
            subtitle: null,
            scopingRegionKey: 'north',
            regionDisplayOrder: 1,
            areaKeys: ['IN|KA|Bengaluru|Whitefield'],
            listingCount: 5,
            focusLat: 12.9,
            focusLon: 77.6,
            minLat: 12.8,
            minLon: 77.5,
            maxLat: 13.0,
            maxLon: 77.7,
            boundsStatus: 'COMPLETE',
          },
        ]}
        isLoadingRegionScopedGroups={false}
      />,
    );
    expect(scopedSearchCalls).toHaveLength(1);
    const withProjection = scopedSearchCalls[0];

    expect(withProjection).toEqual(withoutProjection);
  });
});

// ─── Issue #1910 (PR2 review fix, Finding 2) — injected alias-aware scopeNamespaces ─
//
// NOTE on what these tests actually assert: `resolveScope`'s `kind: 'group'`
// classification (the case `groupNameSlugs` restores — e.g. aliasing
// "k-r-puram-belt" to the real group id "kr-puram-belt") has NO separate
// consuming branch inside THIS component today — Level-2 group drill-down is
// driven entirely by the `groupId` prop via `resolveActiveDiscoverGroup`
// (its own independent slug matcher), not by `scope`/`resolveScope`. The
// ONLY branch inside this component that consults `resolvedScope` at all is
// the `kind === 'region'` check that gates `useRegionProjection` /
// `isRegionScopeActive`. So the observable, executable proof that an
// INJECTED `scopeNamespaces` prop is actually used (end-to-end) rather than
// silently dropped in favour of the local reduced rebuild is on that same
// `regionKeys` axis — a scope value that resolves as a region ONLY when the
// injected namespace (not the locally-rebuilt one) supplies the matching key.
describe('AreaGroupsLandingPanel — injected scopeNamespaces (Issue #1910 review fix, Finding 2)', () => {
  // Issue #1910 (PR2 review fix, canonical region aliases) — resolveScope now
  // recognizes canonical backend region keys (N/E/S/W/CENTRAL/...) AND their
  // lowercase legacy aliases (north/east/south/west/central/...) built in,
  // regardless of what `ns.regionKeys` any caller supplies. "east" is one of
  // those aliases, so it no longer isolates "does scopeNamespaces actually
  // get used" — it would resolve to region 'E' even with NO namespace
  // supplied at all. "zone-x" is neither a canonical key, an alias, nor a
  // group slug — it can ONLY resolve as a region via an explicitly-supplied
  // `ns.regionKeys` entry, which is exactly what these two tests need to
  // isolate the scopeNamespaces-prop-propagation behaviour they test.
  const unscopedGroups = [
    makeGroup({
      id: 'other-group',
      name: 'Other Group',
      region_key: 'somewhere-else', // deliberately NOT 'zone-x', so the
      // Resolution-A fallback filter (`groups.filter(g => g.region_key ===
      // activeScope)`) finds nothing for scope="zone-x" — isolates the
      // assertion to the region-projection path only.
      area_keys: ['IN|KA|Bengaluru|Elsewhere'],
    }),
  ];
  const regionScopedGroups = [
    {
      groupSlug: 'tech-corridor',
      name: 'Tech Corridor',
      subtitle: null,
      scopingRegionKey: 'zone-x',
      regionDisplayOrder: 1,
      areaKeys: ['IN|KA|Bengaluru|Whitefield'],
      listingCount: 42,
      focusLat: 12.97,
      focusLon: 77.75,
      minLat: 12.9,
      minLon: 77.7,
      maxLat: 13.0,
      maxLon: 77.8,
      boundsStatus: 'COMPLETE' as const,
    },
  ];

  it('classifies scope="zone-x" as a region — and renders the projection — using the injected scopeNamespaces even though the local summaryRegions prop is empty', () => {
    // summaryRegions is deliberately EMPTY here — the panel's own local
    // reduced namespace (built from summaryRegions/groups) would compute
    // regionKeys as an empty Set, so "zone-x" would resolve to kind:'none'
    // WITHOUT the injected prop (it is not a canonical key/alias/group slug
    // either). The injected `scopeNamespaces.regionKeys` (mirroring
    // MapDiscovery's real, alias-aware, single-source-of-truth namespace,
    // which also carries `groupNameSlugs`) includes "zone-x", so resolution
    // — and therefore useRegionProjection — must follow the INJECTED
    // namespace, not the local rebuild.
    const scopeNamespaces: ScopeNamespaces = {
      regionKeys: new Set(['zone-x']),
      groupSlugs: new Set(unscopedGroups.map((g) => g.id)),
      groupNameSlugs: new Map([['k-r-puram-belt', 'kr-puram-belt']]),
    };

    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={unscopedGroups}
        isLoading={false}
        scope="zone-x"
        summaryRegions={[]}
        regionScopedGroups={regionScopedGroups}
        isLoadingRegionScopedGroups={false}
        scopeNamespaces={scopeNamespaces}
      />,
    );

    // Only reachable if resolvedScope.kind === 'region' (useRegionProjection)
    // — the Resolution-A fallback (unscopedGroups filtered by region_key)
    // would have rendered nothing for this group set.
    expect(screen.getByTestId('area-group-card-tech-corridor')).toBeInTheDocument();
  });

  it('does NOT resolve scope="zone-x" as a region (falls back to the reduced local namespace) when scopeNamespaces is omitted and summaryRegions is empty', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={unscopedGroups}
        isLoading={false}
        scope="zone-x"
        summaryRegions={[]}
        regionScopedGroups={regionScopedGroups}
        isLoadingRegionScopedGroups={false}
        // scopeNamespaces intentionally omitted — the panel must fall back
        // to its own local reduced namespace, which has no way to know
        // "zone-x" is a valid region key without a summaryRegions entry (and
        // "zone-x" is not a canonical key/alias resolveScope recognizes
        // built-in either).
      />,
    );

    // Resolution-A fallback also finds nothing (region_key mismatch), so the
    // empty-region message renders instead of the projection's group card.
    expect(screen.queryByTestId('area-group-card-tech-corridor')).not.toBeInTheDocument();
  });
});

// ─── Issue #1910 (PR2 review fix, Finding 3) — region-projection error/retry state ─

describe('AreaGroupsLandingPanel — region-projection error state (Issue #1910 review fix, Finding 3)', () => {
  const regionScopeProps = {
    ...baseProps,
    groups: [makeGroup({ id: 'tech-corridor', region_key: 'west' })],
    isLoading: false,
    scope: 'east',
    summaryRegions: [{ regionKey: 'east', regionLabel: 'East Bangalore' }],
  };

  it('renders an error+retry state (not the empty-groups message) when the projection query is in an error state for an active region scope', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...regionScopeProps}
        regionScopedGroups={undefined}
        isLoadingRegionScopedGroups={false}
        isRegionScopedGroupsError={true}
      />,
    );

    expect(screen.getByTestId('region-scoped-groups-error')).toBeInTheDocument();
    expect(screen.queryByText(/no zones found matching this region filter/i)).not.toBeInTheDocument();
  });

  it('calls onRetryRegionScopedGroups when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    renderPanel(
      <AreaGroupsLandingPanel
        {...regionScopeProps}
        regionScopedGroups={undefined}
        isLoadingRegionScopedGroups={false}
        isRegionScopedGroupsError={true}
        onRetryRegionScopedGroups={onRetry}
      />,
    );

    await userEvent.click(screen.getByTestId('region-scoped-groups-retry-btn'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render the error state when there is no error (real empty-groups case still shows the empty message)', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...regionScopeProps}
        regionScopedGroups={[]}
        isLoadingRegionScopedGroups={false}
        isRegionScopedGroupsError={false}
      />,
    );

    expect(screen.queryByTestId('region-scoped-groups-error')).not.toBeInTheDocument();
    expect(screen.getByText(/no zones found matching this region filter/i)).toBeInTheDocument();
  });

  it('prioritizes the loading skeleton over the error state when both flags are (incorrectly) supplied together', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...regionScopeProps}
        regionScopedGroups={[]}
        isLoadingRegionScopedGroups={true}
        isRegionScopedGroupsError={true}
      />,
    );

    expect(screen.getByTestId('region-scoped-groups-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('region-scoped-groups-error')).not.toBeInTheDocument();
  });
});

// ─── Issue #1910 (PR2 review fix, round 3) — Resolution-A count leakage ─────
//
// During the pending/error window (regionScopedGroups still undefined),
// `displayGroups` falls back to the Resolution-A `scopedGroups` list (the
// unscoped `groups` prop filtered by `region_key === activeScope`) — a
// DIFFERENT, untrustworthy dataset from the region projection. The intro
// stats (group/area/property counts) and the "Zones in X" badge count must
// not leak that Resolution-A-derived number while loading or erroring.
describe('AreaGroupsLandingPanel — Resolution-A count leakage guard (Issue #1910 review fix, round 3)', () => {
  // Deliberately gives the Resolution-A fallback filter a NON-EMPTY, WRONG
  // result: two groups plurality-keyed to 'east' with a combined 3 area_keys
  // and fallbackAreas listing counts that sum to 500 — a number that must
  // never appear anywhere while the projection is unresolved.
  const leakyUnscopedGroups = [
    makeGroup({
      id: 'wrong-group-1',
      name: 'Wrong Group One',
      region_key: 'east',
      area_keys: ['IN|KA|Bengaluru|WrongAreaA', 'IN|KA|Bengaluru|WrongAreaB'],
    }),
    makeGroup({
      id: 'wrong-group-2',
      name: 'Wrong Group Two',
      region_key: 'east',
      area_keys: ['IN|KA|Bengaluru|WrongAreaC'],
    }),
  ];
  const leakyFallbackAreas = [
    makeArea({ areaKey: 'IN|KA|Bengaluru|WrongAreaA', listingCount: 200 }),
    makeArea({ areaKey: 'IN|KA|Bengaluru|WrongAreaB', listingCount: 200 }),
    makeArea({ areaKey: 'IN|KA|Bengaluru|WrongAreaC', listingCount: 100 }),
  ];

  it('does not render the intro (or its Resolution-A-derived counts) while the region projection is LOADING', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={leakyUnscopedGroups}
        isLoading={false}
        scope="east"
        summaryRegions={[{ regionKey: 'east', regionLabel: 'East Bangalore' }]}
        fallbackAreas={leakyFallbackAreas}
        onSelectArea={vi.fn()}
        regionScopedGroups={undefined}
        isLoadingRegionScopedGroups={true}
      />,
    );

    expect(screen.getByTestId('region-scoped-groups-loading')).toBeInTheDocument();
    // The intro must not render at all — no Resolution-A group/area/property
    // counts leak through (2 wrong groups, 3 wrong areas, 500 wrong total).
    expect(screen.queryByTestId('area-groups-intro')).not.toBeInTheDocument();
    expect(screen.queryByText('Wrong Group One')).not.toBeInTheDocument();
    expect(screen.queryByText('Wrong Group Two')).not.toBeInTheDocument();
    expect(screen.queryByText('500')).not.toBeInTheDocument();
    // The "Zones in X" header count badge must also be suppressed.
    expect(screen.queryByText(/^2 groups$/)).not.toBeInTheDocument();
  });

  it('does not render the intro (or its Resolution-A-derived counts) while the region projection is in an ERROR state', () => {
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={leakyUnscopedGroups}
        isLoading={false}
        scope="east"
        summaryRegions={[{ regionKey: 'east', regionLabel: 'East Bangalore' }]}
        fallbackAreas={leakyFallbackAreas}
        onSelectArea={vi.fn()}
        regionScopedGroups={undefined}
        isLoadingRegionScopedGroups={false}
        isRegionScopedGroupsError={true}
      />,
    );

    expect(screen.getByTestId('region-scoped-groups-error')).toBeInTheDocument();
    expect(screen.queryByTestId('area-groups-intro')).not.toBeInTheDocument();
    expect(screen.queryByText('Wrong Group One')).not.toBeInTheDocument();
    expect(screen.queryByText('Wrong Group Two')).not.toBeInTheDocument();
    expect(screen.queryByText('500')).not.toBeInTheDocument();
    expect(screen.queryByText(/^2 groups$/)).not.toBeInTheDocument();
  });

  it('does not render Resolution-A group CARDS (or the intro) in the ambiguous window where a region scope is active but neither the loading nor error flag is set yet and regionScopedGroups is still undefined', () => {
    // Issue #1910 (PR2 review fix, round 3, code-review follow-up) — this is
    // the narrow React Query "idle" window: the projection query hasn't been
    // observed as fetching (isLoadingRegionScopedGroups=false) and hasn't
    // errored (isRegionScopedGroupsError=false), yet regionScopedGroups is
    // still undefined (useRegionProjection is false). Without the
    // `isRegionScopeUnresolved` guard on the final ternary branch, this state
    // would fall through to `displayGroups` (Resolution-A) and render the
    // WRONG group cards themselves — not just wrong summary counts.
    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={leakyUnscopedGroups}
        isLoading={false}
        scope="east"
        summaryRegions={[{ regionKey: 'east', regionLabel: 'East Bangalore' }]}
        fallbackAreas={leakyFallbackAreas}
        onSelectArea={vi.fn()}
        regionScopedGroups={undefined}
        isLoadingRegionScopedGroups={false}
        isRegionScopedGroupsError={false}
      />,
    );

    expect(screen.getByTestId('region-scoped-groups-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('area-groups-intro')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-group-card-wrong-group-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-group-card-wrong-group-2')).not.toBeInTheDocument();
    expect(screen.queryByText('Wrong Group One')).not.toBeInTheDocument();
    expect(screen.queryByText('Wrong Group Two')).not.toBeInTheDocument();
    expect(screen.queryByText('500')).not.toBeInTheDocument();
    expect(screen.queryByText(/^2 groups$/)).not.toBeInTheDocument();
  });

  it('renders the intro with the correct projection-derived counts once the projection resolves (success case unaffected)', () => {
    const regionScopedGroups: RegionScopedAreaGroup[] = [
      {
        groupSlug: 'tech-corridor',
        name: 'Tech Corridor',
        subtitle: null,
        scopingRegionKey: 'east',
        regionDisplayOrder: 1,
        areaKeys: ['IN|KA|Bengaluru|Whitefield'],
        listingCount: 42,
        focusLat: 12.97,
        focusLon: 77.75,
        minLat: 12.9,
        minLon: 77.7,
        maxLat: 13.0,
        maxLon: 77.8,
        boundsStatus: 'COMPLETE',
      },
    ];

    renderPanel(
      <AreaGroupsLandingPanel
        {...baseProps}
        groups={leakyUnscopedGroups}
        isLoading={false}
        scope="east"
        summaryRegions={[{ regionKey: 'east', regionLabel: 'East Bangalore', listingCount: 42 }]}
        fallbackAreas={leakyFallbackAreas}
        onSelectArea={vi.fn()}
        regionScopedGroups={regionScopedGroups}
        isLoadingRegionScopedGroups={false}
      />,
    );

    const intro = screen.getByTestId('area-groups-intro');
    expect(intro).toBeInTheDocument();
    expect(intro).toHaveTextContent('42');
    expect(intro).not.toHaveTextContent('500');
    expect(screen.getByText('1 group')).toBeInTheDocument();
  });
});
