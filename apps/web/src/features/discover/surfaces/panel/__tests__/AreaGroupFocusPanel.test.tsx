import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AreaGroupFocusPanel } from '../AreaGroupFocusPanel';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

/**
 * Issue #2213 — `AreaGroupFocusPanel` is a pure renderer (per
 * `surfaces/__tests__/surfaceLayering.guard.test.ts`): it owns no data
 * fetching or mutation of its own, only the local "which row is spinning"
 * presentation state. Every navigation/resolution outcome is exercised via
 * the injected `onSelectArea`/`isResolvingArea`/`onBack` props, mirroring how
 * `DiscoverPanelSurface` wires it in production.
 */
const GROUP: AreaGroup = {
  id: 'south-premium',
  name: 'South Premium',
  subtitle: 'Verified listings near the tech corridor',
  region_label: null,
  school_count: 0,
  area_keys: ['IN|KA|Bangalore|Koramangala', 'IN|KA|Bangalore|HSR'],
};

const DISCOVER_AREAS: DiscoverArea[] = [
  {
    areaKey: 'IN|KA|Bangalore|Koramangala',
    name: 'Koramangala',
    geoCenterLat: 12.93,
    geoCenterLon: 77.61,
    listingCount: 12,
    schoolCount: 2,
  },
];

describe('AreaGroupFocusPanel', () => {
  it('renders the group name/subtitle and joins each member areaKey against discoverAreas for name + listing count', () => {
    render(
      <AreaGroupFocusPanel
        group={GROUP}
        discoverAreas={DISCOVER_AREAS}
        onSelectArea={vi.fn()}
        isResolvingArea={false}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId('area-group-focus-heading')).toHaveTextContent('South Premium');
    expect(screen.getByText('Verified listings near the tech corridor')).toBeInTheDocument();
    expect(
      screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|Koramangala'),
    ).toHaveTextContent('Koramangala');
    expect(screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|Koramangala')).toHaveTextContent(
      '12 listings',
    );
  });

  it('falls back to the raw areaKey for a member with no matching discoverAreas entry (never fabricates a display name)', () => {
    render(
      <AreaGroupFocusPanel
        group={GROUP}
        discoverAreas={DISCOVER_AREAS}
        onSelectArea={vi.fn()}
        isResolvingArea={false}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|HSR')).toHaveTextContent(
      'IN|KA|Bangalore|HSR',
    );
    expect(screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|HSR')).toHaveTextContent(
      'No listings yet',
    );
  });

  it('renders the empty state when the group has no member areas, without inventing rows', () => {
    render(
      <AreaGroupFocusPanel
        group={{ ...GROUP, area_keys: [] }}
        discoverAreas={DISCOVER_AREAS}
        onSelectArea={vi.fn()}
        isResolvingArea={false}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId('area-group-focus-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('area-group-focus-list')).not.toBeInTheDocument();
  });

  it('clicking a member area dispatches onSelectArea with that exact areaKey — no other side effect', async () => {
    const user = userEvent.setup();
    const onSelectArea = vi.fn();
    render(
      <AreaGroupFocusPanel
        group={GROUP}
        discoverAreas={DISCOVER_AREAS}
        onSelectArea={onSelectArea}
        isResolvingArea={false}
        onBack={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|Koramangala'));
    expect(onSelectArea).toHaveBeenCalledTimes(1);
    expect(onSelectArea).toHaveBeenCalledWith('IN|KA|Bangalore|Koramangala');
  });

  it('"All areas" dispatches onBack, not onSelectArea', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onSelectArea = vi.fn();
    render(
      <AreaGroupFocusPanel
        group={GROUP}
        discoverAreas={DISCOVER_AREAS}
        onSelectArea={onSelectArea}
        isResolvingArea={false}
        onBack={onBack}
      />,
    );

    await user.click(screen.getByTestId('area-group-focus-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSelectArea).not.toHaveBeenCalled();
  });

  it('shows "Opening…" on the CLICKED row and disables EVERY row while a resolution is in flight', async () => {
    const user = userEvent.setup();
    const onSelectArea = vi.fn();
    const { rerender } = render(
      <AreaGroupFocusPanel
        group={GROUP}
        discoverAreas={DISCOVER_AREAS}
        onSelectArea={onSelectArea}
        isResolvingArea={false}
        onBack={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|Koramangala'));
    rerender(
      <AreaGroupFocusPanel
        group={GROUP}
        discoverAreas={DISCOVER_AREAS}
        onSelectArea={onSelectArea}
        isResolvingArea
        onBack={vi.fn()}
      />,
    );

    const clicked = screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|Koramangala');
    expect(clicked).toHaveTextContent('Opening…');
    expect(clicked).toBeDisabled();
    // Code review fix (PR #2214) — the un-clicked sibling row must ALSO
    // disable: `isResolvingArea` reflects one shared in-flight resolver
    // (useDiscoverJourneySwitchController's resolveAreaNavigationPath), so a
    // second click on a different row while the first is still resolving
    // must never look clickable and then silently no-op.
    const sibling = screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|HSR');
    expect(sibling).toBeDisabled();
    // The sibling's OWN label still reads its real listing count, not
    // "Opening…" — only the row the shopper actually clicked shows that.
    expect(sibling).toHaveTextContent('No listings yet');
  });

  it('a second click on a different row while the first is still resolving never fires onSelectArea a second time (no silent no-op — the row is genuinely disabled)', async () => {
    const user = userEvent.setup();
    const onSelectArea = vi.fn();
    const { rerender } = render(
      <AreaGroupFocusPanel
        group={GROUP}
        discoverAreas={DISCOVER_AREAS}
        onSelectArea={onSelectArea}
        isResolvingArea={false}
        onBack={vi.fn()}
      />,
    );

    // Click area A (Koramangala) — resolution starts.
    await user.click(screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|Koramangala'));
    rerender(
      <AreaGroupFocusPanel
        group={GROUP}
        discoverAreas={DISCOVER_AREAS}
        onSelectArea={onSelectArea}
        isResolvingArea
        onBack={vi.fn()}
      />,
    );

    // Before A settles, attempt to click area B (HSR) — must be disabled and
    // produce no dispatch at all, never a silent swallowed click.
    const areaB = screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|HSR');
    expect(areaB).toBeDisabled();
    await user.click(areaB);
    expect(onSelectArea).toHaveBeenCalledTimes(1);
    expect(onSelectArea).toHaveBeenCalledWith('IN|KA|Bangalore|Koramangala');
    expect(onSelectArea).not.toHaveBeenCalledWith('IN|KA|Bangalore|HSR');
  });

  it('clears the pending row once isResolvingArea settles back to false (the error-recovery path — the row re-enables so another area can be tried)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AreaGroupFocusPanel
        group={GROUP}
        discoverAreas={DISCOVER_AREAS}
        onSelectArea={vi.fn()}
        isResolvingArea={false}
        onBack={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|Koramangala'));
    rerender(
      <AreaGroupFocusPanel
        group={GROUP}
        discoverAreas={DISCOVER_AREAS}
        onSelectArea={vi.fn()}
        isResolvingArea
        onBack={vi.fn()}
      />,
    );
    // Settles back to false — the shared resolver errored (stale areaKey);
    // the toast itself is the controller's responsibility, not this panel's.
    rerender(
      <AreaGroupFocusPanel
        group={GROUP}
        discoverAreas={DISCOVER_AREAS}
        onSelectArea={vi.fn()}
        isResolvingArea={false}
        onBack={vi.fn()}
      />,
    );

    const row = screen.getByTestId('area-group-focus-member-IN|KA|Bangalore|Koramangala');
    expect(row).not.toBeDisabled();
    expect(row).toHaveTextContent('12 listings');
  });
});
