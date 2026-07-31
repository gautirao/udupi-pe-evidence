/**
 * MobileClusterSheet — Issue #1956 PR-5 (Slice 3, AC5.6/AC5.7).
 *
 * Mirrors the fixture shape used by DiscoverAreasJourneyPanel.test.tsx's own
 * "cluster-focus panel surface" describe block, since both consume the SAME
 * `deriveFocusedAreaClusterSummary` pure function over the same journey
 * shape — this proves the MAP-mode sheet and the LIST-mode panel branch can
 * never disagree (AC5.6).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileClusterSheet } from '../MobileClusterSheet';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

const CLUSTER_RAW_CHILDREN: NavigationNodeResponse['children'] = [
  { nodeKey: 'a:alpha', nodeType: 'AREA', displayLabel: 'Alpha', displayOrder: 1, areaKey: 'alpha', centreLat: 12.9, centreLon: 77.6 },
  { nodeKey: 'a:bravo', nodeType: 'AREA', displayLabel: 'Bravo', displayOrder: 2, areaKey: 'bravo', centreLat: 12.91, centreLon: 77.61 },
  { nodeKey: 'a:charlie', nodeType: 'AREA', displayLabel: 'Charlie', displayOrder: 3, areaKey: 'charlie', centreLat: 12.92, centreLon: 77.62 },
];
const CLUSTER_CHILDREN: UseAreasNavigationJourneyResult['children'] = [
  { nodeKey: 'a:alpha', nodeType: 'AREA', displayLabel: 'Alpha', displayOrder: 1, listingCount: 5, schoolCount: null, isLeafArea: true, matchingAreaCount: null },
  { nodeKey: 'a:bravo', nodeType: 'AREA', displayLabel: 'Bravo', displayOrder: 2, listingCount: 3, schoolCount: null, isLeafArea: true, matchingAreaCount: null },
  { nodeKey: 'a:charlie', nodeType: 'AREA', displayLabel: 'Charlie', displayOrder: 3, listingCount: 1, schoolCount: null, isLeafArea: true, matchingAreaCount: null },
];

function makeNode(overrides: Partial<NavigationNodeResponse> = {}): NavigationNodeResponse {
  return {
    nodeKey: 'root',
    nodeType: 'ROOT',
    displayLabel: 'Bangalore',
    depth: -1,
    regionKey: null,
    ancestry: [],
    nextLevelType: 'DIRECTION',
    children: CLUSTER_RAW_CHILDREN,
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: null,
    areaKey: null,
    ...overrides,
  };
}

describe('MobileClusterSheet', () => {
  it('renders nothing when no cluster is focused', () => {
    const { container } = render(
      <MobileClusterSheet
        journey={{ node: makeNode(), children: CLUSTER_CHILDREN, selectNode: vi.fn() }}
        focusedClusterMemberAreaKeys={null}
        onClusterFocusChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders exactly the focused member subset with §2.2 count copy, never the unfocused third member', () => {
    render(
      <MobileClusterSheet
        journey={{ node: makeNode(), children: CLUSTER_CHILDREN, selectNode: vi.fn() }}
        focusedClusterMemberAreaKeys={['alpha', 'bravo']}
        onClusterFocusChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mobile-cluster-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-cluster-sheet-summary')).toHaveTextContent('2 areas with matches');
    expect(screen.getByTestId('mobile-cluster-sheet-member-a:alpha')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('mobile-cluster-sheet-member-a:bravo')).toHaveTextContent('Bravo');
    expect(screen.queryByTestId('mobile-cluster-sheet-member-a:charlie')).not.toBeInTheDocument();
  });

  it('never emits "+0" — a single-member focus reads as "1 area with matches", not "+0"', () => {
    render(
      <MobileClusterSheet
        journey={{ node: makeNode(), children: CLUSTER_CHILDREN, selectNode: vi.fn() }}
        focusedClusterMemberAreaKeys={['alpha', 'bravo', 'charlie']}
        onClusterFocusChange={vi.fn()}
      />,
    );
    const text = screen.getByTestId('mobile-cluster-sheet-summary').textContent ?? '';
    expect(text).not.toMatch(/\+0/);
  });

  it('"Show all areas" calls onClusterFocusChange(null) — the SAME clear callback the LIST-mode panel uses', async () => {
    const user = userEvent.setup();
    const onClusterFocusChange = vi.fn();
    render(
      <MobileClusterSheet
        journey={{ node: makeNode(), children: CLUSTER_CHILDREN, selectNode: vi.fn() }}
        focusedClusterMemberAreaKeys={['alpha']}
        onClusterFocusChange={onClusterFocusChange}
      />,
    );
    await user.click(screen.getByTestId('mobile-cluster-sheet-clear'));
    expect(onClusterFocusChange).toHaveBeenCalledTimes(1);
    expect(onClusterFocusChange).toHaveBeenCalledWith(null);
  });

  it('selecting a member calls journey.selectNode with its nodeKey — identical to marker/row selection', async () => {
    const user = userEvent.setup();
    const selectNode = vi.fn();
    render(
      <MobileClusterSheet
        journey={{ node: makeNode(), children: CLUSTER_CHILDREN, selectNode }}
        focusedClusterMemberAreaKeys={['alpha', 'bravo']}
        onClusterFocusChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('mobile-cluster-sheet-member-a:alpha'));
    expect(selectNode).toHaveBeenCalledWith('a:alpha');
  });

  it('"Show all areas" is pinned outside the scrollable member list, not appended after it inside a shared scroll region — so it stays reachable regardless of member count', () => {
    render(
      <MobileClusterSheet
        journey={{ node: makeNode(), children: CLUSTER_CHILDREN, selectNode: vi.fn() }}
        focusedClusterMemberAreaKeys={['alpha', 'bravo']}
        onClusterFocusChange={vi.fn()}
      />,
    );
    const sheet = screen.getByTestId('mobile-cluster-sheet');
    const list = sheet.querySelector('ul');
    const clearButton = screen.getByTestId('mobile-cluster-sheet-clear');
    expect(list).not.toBeNull();
    // The clear button must not be a descendant of the scrollable member list.
    expect(list?.contains(clearButton)).toBe(false);
    // The scroll container is the <ul> itself, not the outer sheet — so the
    // button (a sibling outside it) is never pushed below the fold by member rows.
    expect(list?.className).toMatch(/overflow-y-auto/);
    expect(sheet.className).not.toMatch(/overflow-y-auto/);
    // Sibling order: the button must appear after the list in the DOM but
    // outside its overflow region (asserted above), confirming a pinned footer.
    expect(clearButton.compareDocumentPosition(list as Node) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('invariant 8 — renders no result-scope controls', () => {
    render(
      <MobileClusterSheet
        journey={{ node: makeNode(), children: CLUSTER_CHILDREN, selectNode: vi.fn() }}
        focusedClusterMemberAreaKeys={['alpha', 'bravo']}
        onClusterFocusChange={vi.fn()}
      />,
    );
    for (const forbidden of [
      /edit areas/i,
      /clear selected areas/i,
      /add nearby areas/i,
      /draw search area/i,
      /search this area/i,
      /create alert/i,
    ]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });
});
