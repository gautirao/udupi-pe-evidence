/**
 * DiscoverAreasJourneyPanel — AC3 complete direct-child rendering (Issue
 * #2088, "ALSO AUTHOR" list) + the "Search this area" absence assertion
 * extended to the DESKTOP surface.
 *
 * AC3 (#1956/#2086 durable guarantee): the panel renders the CURRENT node's
 * COMPLETE, uncapped set of direct children — never a client-side-truncated
 * subset. `staticSweep.test.ts` already has a durable STATIC guard against a
 * `.slice(` truncation ever being reintroduced into source; this file is the
 * complementary BEHAVIOURAL proof at the actual rendered-DOM boundary, sized
 * to the real magnitude live Directions carry (36-86 children — the
 * candidate fixture's own clusters are only 5-8, too small to catch a
 * regression like "cap at 20").
 *
 * The Invariant-8 "no result-scope control" sweep already covers "Search
 * this area" for the MOBILE surface (`mobileSurfaceInvariant8.test.ts`,
 * source-text sweep) and for this panel generically
 * (`DiscoverAreasJourneyPanel.test.tsx`'s "invariant 8" test, one small
 * 1-child fixture). Neither exercises the DESKTOP-shaped large-children
 * render path this file already sets up for AC3 — this file adds that
 * assertion on the SAME large render, so a regression that only appears once
 * real card volume is rendered (e.g. a "Search this area" CTA injected after
 * every Nth card) cannot hide behind the smaller fixtures.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
    selectNode: () => {},
    refetch: () => {},
    historyAdjacencyLog: [],
    ...overrides,
  };
}

/**
 * Real-magnitude Direction with 64 CLUSTER ("Local Destination") children —
 * inside the documented live range (36-86), well above any plausible
 * hardcoded cap (the retired MAX_DIRECTION_DESTINATIONS was much smaller —
 * see staticSweep.test.ts's "no production module truncates node.children"
 * guard) and above the candidate fixture's own 5-8-child clusters.
 */
const CHILD_COUNT = 64;
const RAW_CHILDREN: NavigationNodeResponse['children'] = Array.from({ length: CHILD_COUNT }, (_, i) => ({
  nodeKey: `c:central:cluster-${i}`,
  nodeType: 'CLUSTER' as const,
  displayLabel: `Cluster ${i}`,
  displayOrder: i,
  areaKey: null,
}));
const TYPED_CHILDREN: UseAreasNavigationJourneyResult['children'] = Array.from(
  { length: CHILD_COUNT },
  (_, i) => ({
    nodeKey: `c:central:cluster-${i}`,
    nodeType: 'CLUSTER' as const,
    displayLabel: `Cluster ${i}`,
    displayOrder: i,
    listingCount: i + 1,
    schoolCount: null,
    isLeafArea: false,
    matchingAreaCount: null,
  }),
);

function renderLargePanel() {
  return render(
    <MemoryRouter>
      <FlatPropsAreasJourneyPanel
        journey={makeJourney({
          node: makeNode({
            nodeKey: 'd:central',
            nodeType: 'DIRECTION',
            displayLabel: 'Central Bangalore',
            ancestry: [{ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 }],
            children: RAW_CHILDREN,
          }),
          nodeCount: { listingCount: 2000, schoolCount: 40, matchingAreaCount: CHILD_COUNT },
          children: TYPED_CHILDREN,
        })}
        buildNodeHref={NOOP_BUILD_HREF}
      />
    </MemoryRouter>,
  );
}

describe('DiscoverAreasJourneyPanel — AC3: complete, uncapped direct-child rendering at real magnitude', () => {
  it(`renders exactly ${CHILD_COUNT} destination cards — one per direct child, no client-side cap`, () => {
    renderLargePanel();
    const rendered = TYPED_CHILDREN.filter(
      (child) => screen.queryByTestId(`navigation-child-card-${child.nodeKey}`) != null,
    );
    expect(rendered).toHaveLength(CHILD_COUNT);
  });

  it('renders the FIRST and LAST child in document order — no truncation from either end', () => {
    renderLargePanel();
    expect(screen.getByTestId('navigation-child-card-c:central:cluster-0')).toHaveTextContent('Cluster 0');
    expect(
      screen.getByTestId(`navigation-child-card-c:central:cluster-${CHILD_COUNT - 1}`),
    ).toHaveTextContent(`Cluster ${CHILD_COUNT - 1}`);
  });

  it('POSITIVE CONTROL — a "+N" summary form never appears at this structural level even with 64 children (proves this is the full list, not a "+N more" degraded view masquerading as complete)', () => {
    renderLargePanel();
    const list = screen.getByTestId('navigation-child-list');
    expect(list.textContent).not.toMatch(/\+\d+\s*(more|nearby)/i);
  });

  it('AC — no result-scope control ("Search this area" or its siblings) appears on the DESKTOP surface even at this real card volume', () => {
    renderLargePanel();
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
