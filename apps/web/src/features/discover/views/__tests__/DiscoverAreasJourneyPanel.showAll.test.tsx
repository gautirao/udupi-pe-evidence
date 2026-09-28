/**
 * DiscoverAreasJourneyPanel — "Show all <n> areas" (Issue #2088, BR6).
 *
 * BR6: cluster focus is CLEARED when "Show all" is selected, restoring the
 * full child set. `DiscoverAreasJourneyPanel.test.tsx`'s existing "Show all
 * areas" test only proves the CLICK calls `onClusterFocusChange(null)` — it
 * never re-queries the panel afterwards, so it cannot distinguish "clears
 * focus" from "calls a callback that happens to do nothing". This file
 * closes that gap with a STATEFUL wrapper (mirroring how the real caller,
 * MapDiscovery.tsx, owns `focusedClusterMemberAreaKeys` as state and feeds
 * `onClusterFocusChange` back into it) so a real React re-render actually
 * occurs, and asserts the panel POST-CLICK renders exactly
 * `node.children.length` rows in the restored `navigation-level-panel` —
 * never just that the URL param / callback fired.
 */
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { FlatPropsAreasJourneyPanel } from '@/features/discover/areas-journey/testing/FlatPropsAreasJourneyPanel';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

const NOOP_BUILD_HREF = () => null;

function makeNode(overrides: Partial<NavigationNodeResponse> = {}): NavigationNodeResponse {
  return {
    nodeKey: 'root',
    nodeType: 'ROOT',
    displayLabel: 'Bangalore',
    depth: -1,
    regionKey: null,
    ancestry: [],
    nextLevelType: 'DIRECTION',
    children: [],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: null,
    areaKey: null,
    ...overrides,
  };
}

function makeJourney(overrides: Partial<UseAreasNavigationJourneyResult> = {}): UseAreasNavigationJourneyResult {
  return {
    isLoading: false,
    isError: false,
    error: null,
    node: null,
    levelKind: 'empty',
    children: [],
    wasTruncated: false,
    resolutionNotice: null,
    nodeCount: null,
    selectNode: vi.fn(),
    refetch: vi.fn(),
    historyAdjacencyLog: [],
    ...overrides,
  };
}

// Three real member AREA children under one cluster — the full set BR6
// requires "Show all" to restore.
const RAW_CHILDREN: NavigationNodeResponse['children'] = [
  { nodeKey: 'a:alpha', nodeType: 'AREA', displayLabel: 'Alpha', displayOrder: 1, areaKey: 'alpha', centreLat: 12.9, centreLon: 77.6 },
  { nodeKey: 'a:bravo', nodeType: 'AREA', displayLabel: 'Bravo', displayOrder: 2, areaKey: 'bravo', centreLat: 12.91, centreLon: 77.61 },
  { nodeKey: 'a:charlie', nodeType: 'AREA', displayLabel: 'Charlie', displayOrder: 3, areaKey: 'charlie', centreLat: 12.92, centreLon: 77.62 },
];
const TYPED_CHILDREN: UseAreasNavigationJourneyResult['children'] = [
  { nodeKey: 'a:alpha', nodeType: 'AREA', displayLabel: 'Alpha', displayOrder: 1, listingCount: 5, schoolCount: null, isLeafArea: true, matchingAreaCount: null },
  { nodeKey: 'a:bravo', nodeType: 'AREA', displayLabel: 'Bravo', displayOrder: 2, listingCount: 3, schoolCount: null, isLeafArea: true, matchingAreaCount: null },
  { nodeKey: 'a:charlie', nodeType: 'AREA', displayLabel: 'Charlie', displayOrder: 3, listingCount: 1, schoolCount: null, isLeafArea: true, matchingAreaCount: null },
];
const FOCUSED_TWO_OF_THREE = ['alpha', 'bravo'];

/**
 * Owns `focusedClusterMemberAreaKeys` as REAL React state, feeding
 * `onClusterFocusChange` back into it — the exact contract
 * `DiscoverAreasJourneyPanel`'s own prop doc describes for a controlling
 * parent (mirrors MapDiscovery.tsx's real wiring), so clicking "Show all"
 * genuinely re-renders this component with a cleared focus instead of just
 * invoking a spy.
 */
function StatefulHarness({ initialFocus }: { initialFocus: readonly string[] | null }) {
  const [focus, setFocus] = useState<readonly string[] | null>(initialFocus);
  const journey = makeJourney({
    node: makeNode({ children: RAW_CHILDREN }),
    nodeCount: { listingCount: 9, schoolCount: 0, matchingAreaCount: null },
    children: TYPED_CHILDREN,
  });
  return (
    <FlatPropsAreasJourneyPanel
      journey={journey}
      buildNodeHref={NOOP_BUILD_HREF}
      focusedClusterMemberAreaKeys={focus}
      onClusterFocusChange={setFocus}
    />
  );
}

describe('DiscoverAreasJourneyPanel — "Show all <n> areas" (BR6)', () => {
  it('POSITIVE CONTROL — before clicking, only the focused 2-of-3 subset is rendered (proves the starting state is genuinely narrowed, not already "all")', () => {
    render(
      <MemoryRouter>
        <StatefulHarness initialFocus={FOCUSED_TWO_OF_THREE} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('areas-cluster-focus-panel')).toBeInTheDocument();
    expect(screen.getByTestId('areas-cluster-focus-member-a:alpha')).toBeInTheDocument();
    expect(screen.getByTestId('areas-cluster-focus-member-a:bravo')).toBeInTheDocument();
    expect(screen.queryByTestId('areas-cluster-focus-member-a:charlie')).not.toBeInTheDocument();
    expect(screen.getByTestId('areas-cluster-focus-clear')).toHaveTextContent('Show all 3 areas');
  });

  it('clicking "Show all 3 areas" clears focus AND restores exactly node.children.length (3) rows in the normal navigation-level-panel', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <StatefulHarness initialFocus={FOCUSED_TWO_OF_THREE} />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId('areas-cluster-focus-clear'));

    // The cluster-focus surface is GONE — this is now the restored full-list panel.
    expect(screen.queryByTestId('areas-cluster-focus-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('areas-journey-panel')).toBeInTheDocument();

    // Re-query the panel AFTER Show-all — exactly node.children.length (3)
    // rows, matching RAW_CHILDREN/TYPED_CHILDREN's length, never the
    // previously-focused 2.
    expect(screen.getByTestId('navigation-child-card-a:alpha')).toBeInTheDocument();
    expect(screen.getByTestId('navigation-child-card-a:bravo')).toBeInTheDocument();
    expect(screen.getByTestId('navigation-child-card-a:charlie')).toBeInTheDocument();
    // `[data-testid^="navigation-child-card-"]` ALSO matches the sibling
    // `navigation-child-card-listings-<nodeKey>` element each card renders
    // (a distinct child testid that happens to share the same prefix) — the
    // exact per-nodeKey testid (`navigation-child-card-<nodeKey>`, with no
    // further suffix) is the real "one row per child" identity.
    const list = screen.getByTestId('navigation-child-list');
    const rows = TYPED_CHILDREN.filter(
      (child) => list.querySelector(`[data-testid="navigation-child-card-${child.nodeKey}"]`) != null,
    );
    expect(rows).toHaveLength(TYPED_CHILDREN.length);
  });
});
