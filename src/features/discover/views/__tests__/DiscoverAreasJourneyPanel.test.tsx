/**
 * Issue #1956 PR 2 (Slice 3) — DiscoverAreasJourneyPanel.
 *
 * Covers all four required UI states (loading/error/empty/success) over the
 * ONE `useAreasNavigationJourney` result object this component receives as a
 * prop — it never calls the hook itself, so map/panel identity (AC3.4/AC3.9)
 * is the caller's responsibility, not re-derived here.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { DiscoverAreasJourneyPanel } from '../DiscoverAreasJourneyPanel';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

/**
 * Every render call below now passes `buildNodeHref` (Issue #1956 PR 2, Slice
 * 5). `HierarchyBackButton` calls `useLocation`/`useNavigate` UNCONDITIONALLY
 * (fix-verify cycle 1's guarded-POP adjacency tracking, `HierarchyBackButton`
 * module doc) — rules-of-hooks forbids calling them only for the non-root
 * branch, so ANY render that reaches `journey.node` truthy (i.e. every case
 * past the loading/error/node-null gates) needs a `<MemoryRouter>` wrapper
 * now, even the root fixture whose empty `ancestry` still renders `null`.
 */
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

describe('DiscoverAreasJourneyPanel', () => {
  it('loading state', () => {
    render(<DiscoverAreasJourneyPanel journey={makeJourney({ isLoading: true })} buildNodeHref={NOOP_BUILD_HREF} />);
    expect(screen.getByTestId('areas-journey-panel-loading')).toBeInTheDocument();
  });

  it('error state — shows a retry CTA that calls journey.refetch', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    render(<DiscoverAreasJourneyPanel journey={makeJourney({ isError: true, refetch })} buildNodeHref={NOOP_BUILD_HREF} />);
    const errorState = screen.getByTestId('areas-journey-panel-error');
    expect(errorState).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('empty state — node resolved but no children, renders the honest empty state (AC3.8)', () => {
    render(
      <MemoryRouter>
        <DiscoverAreasJourneyPanel
          journey={makeJourney({
            node: makeNode(),
            nodeCount: { listingCount: 0, schoolCount: 0, matchingAreaCount: null },
            children: [],
          })}
          buildNodeHref={NOOP_BUILD_HREF}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('areas-journey-panel-empty')).toBeInTheDocument();
    expect(screen.getByTestId('navigation-level-empty')).toBeInTheDocument();
  });

  it('success state — renders the level panel with destination cards', () => {
    render(
      <MemoryRouter>
        <DiscoverAreasJourneyPanel
          journey={makeJourney({
            node: makeNode(),
            nodeCount: { listingCount: 20, schoolCount: 3, matchingAreaCount: null },
            children: [
              {
                nodeKey: 'd:n',
                nodeType: 'DIRECTION',
                displayLabel: 'North Bangalore',
                displayOrder: 1,
                listingCount: 20,
                schoolCount: 3,
                isLeafArea: false,
                matchingAreaCount: null,
              },
            ],
          })}
          buildNodeHref={NOOP_BUILD_HREF}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('areas-journey-panel')).toBeInTheDocument();
    expect(screen.getByTestId('navigation-child-card-d:n')).toBeInTheDocument();
  });

  // ── Issue #1956 PR-5 (Slice 1, AC5.1/AC5.13) — mobile list-first stack ──
  // jsdom has no layout engine (see this PR's [test_strategy].jsdom_cannot_prove),
  // so this proves the underlying MARKUP is list-first by default (base
  // Tailwind class, no media query needed to activate it) rather than the
  // real 390x844 visual reflow, which is the job of
  // e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts. `NavigationChildList`
  // itself is out of this PR's allowed_file_globs and untouched — this is a
  // proof-only test, not a construction one.
  describe('mobile list-first navigation stack (AC5.1/AC5.13)', () => {
    it('renders the CURRENT node\'s direct children in a single-column-by-default grid (list-first at 390px)', () => {
      render(
        <MemoryRouter>
          <DiscoverAreasJourneyPanel
            journey={makeJourney({
              // Non-root ancestry so HierarchyBackButton actually renders
              // (AC5.7 hides it only at the city root's empty ancestry).
              node: makeNode({
                nodeKey: 'd:root-child',
                nodeType: 'DIRECTION',
                displayLabel: 'Some Direction',
                ancestry: [{ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 }],
              }),
              nodeCount: { listingCount: 20, schoolCount: 3, matchingAreaCount: null },
              children: [
                {
                  nodeKey: 'd:n',
                  nodeType: 'DIRECTION',
                  displayLabel: 'North Bangalore',
                  displayOrder: 1,
                  listingCount: 20,
                  schoolCount: 3,
                  isLeafArea: false,
                  matchingAreaCount: null,
                },
                {
                  nodeKey: 'd:s',
                  nodeType: 'DIRECTION',
                  displayLabel: 'South Bangalore',
                  displayOrder: 2,
                  listingCount: 15,
                  schoolCount: 2,
                  isLeafArea: false,
                  matchingAreaCount: null,
                },
              ],
            })}
            buildNodeHref={(k) => `?node=${k}`}
          />
        </MemoryRouter>,
      );
      const list = screen.getByTestId('navigation-child-list');
      // Base (no-media-query) class is single-column — the sm: two-column
      // variant only activates at >=640px, well above the 390px viewport
      // AC5.1 targets, so the rendered stack is list-first by construction.
      expect(list).toHaveClass('grid-cols-1');
      expect(list.getAttribute('role')).toBe('list');
      // Renders EXACTLY the current node's direct children — not a flattened
      // or parent set.
      expect(screen.getByTestId('navigation-child-card-d:n')).toBeInTheDocument();
      expect(screen.getByTestId('navigation-child-card-d:s')).toBeInTheDocument();
      // The named canonical-parent Back control (AC5.2) is laid out FIRST
      // in DOM order — top of the mobile stack.
      const panel = screen.getByTestId('areas-journey-panel');
      const back = screen.getByTestId('areas-hierarchy-back');
      expect(panel.firstElementChild).toBe(back);
    });
  });

  it('renders nothing when node is null and not loading/erroring (gate closed)', () => {
    const { container } = render(
      <DiscoverAreasJourneyPanel journey={makeJourney()} buildNodeHref={NOOP_BUILD_HREF} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('invariant 8 — never renders any result-scope controls', () => {
    render(
      <MemoryRouter>
        <DiscoverAreasJourneyPanel
          journey={makeJourney({
            node: makeNode(),
            nodeCount: { listingCount: 20, schoolCount: 3, matchingAreaCount: null },
            children: [
              {
                nodeKey: 'd:n',
                nodeType: 'DIRECTION',
                displayLabel: 'North Bangalore',
                displayOrder: 1,
                listingCount: 20,
                schoolCount: 3,
                isLeafArea: false,
                matchingAreaCount: null,
              },
            ],
          })}
          buildNodeHref={NOOP_BUILD_HREF}
        />
      </MemoryRouter>,
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

  // ── Issue #1956 PR 2 (Slice 5) — the visible in-app hierarchy Back control ──
  describe('HierarchyBackButton wiring (AC5.2/AC5.7)', () => {
    it('is absent at the city root (empty ancestry)', () => {
      render(
        <MemoryRouter>
          <DiscoverAreasJourneyPanel
            journey={makeJourney({
              node: makeNode(), // default fixture is the root (ancestry: [])
              nodeCount: { listingCount: 0, schoolCount: 0, matchingAreaCount: null },
              children: [],
            })}
            buildNodeHref={(k) => `?node=${k}`}
          />
        </MemoryRouter>,
      );
      expect(screen.queryByTestId('areas-hierarchy-back')).not.toBeInTheDocument();
    });

    it('renders and links to the canonical parent for a non-root resolved node', () => {
      render(
        <MemoryRouter>
          <DiscoverAreasJourneyPanel
            journey={makeJourney({
              node: makeNode({
                nodeKey: 'd:n',
                nodeType: 'DIRECTION',
                displayLabel: 'North Bangalore',
                depth: 0,
                ancestry: [{ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 }],
              }),
              nodeCount: { listingCount: 20, schoolCount: 3, matchingAreaCount: 5 },
              children: [],
            })}
            buildNodeHref={(k) => `?node=${k}`}
          />
        </MemoryRouter>,
      );
      const back = screen.getByTestId('areas-hierarchy-back');
      expect(back).toHaveAttribute('href', '/?node=root');
      expect(back).toHaveTextContent('Bangalore');
    });
  });

  // ── Issue #1956 PR 3 (Slice 4 + bounded state-lift) — visual AREA cluster
  // focus surface. `focusedClusterMemberAreaKeys` is the SAME raw areaKey
  // array `AreaDestinationMarkerLayer`'s `onClusterFocusChange` reports to a
  // controlling parent (mirrored prop shape) — this panel derives its own
  // member list + count copy from `journey.node.children`/`journey.children`
  // filtered to that array, via the SAME `presentClusterRepresentatives`
  // function the map layer calls internally (AC4.12).
  describe('cluster-focus panel surface (AC4.6/AC4.12)', () => {
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
    const FOCUSED_AREA_KEYS = ['alpha', 'bravo'] as const;

    function renderFocused(overrides: { onClusterFocusChange?: (keys: readonly string[] | null) => void; selectNode?: ReturnType<typeof vi.fn> } = {}) {
      return render(
        <MemoryRouter>
          <DiscoverAreasJourneyPanel
            journey={makeJourney({
              node: makeNode({ children: CLUSTER_RAW_CHILDREN }),
              nodeCount: { listingCount: 9, schoolCount: 0, matchingAreaCount: null },
              children: CLUSTER_CHILDREN,
              selectNode: overrides.selectNode ?? vi.fn(),
            })}
            buildNodeHref={NOOP_BUILD_HREF}
            focusedClusterMemberAreaKeys={FOCUSED_AREA_KEYS}
            onClusterFocusChange={overrides.onClusterFocusChange}
          />
        </MemoryRouter>,
      );
    }

    it('renders a DISTINCT testid from navigation-level-panel, never that one, when a cluster is focused', () => {
      renderFocused();
      expect(screen.getByTestId('areas-cluster-focus-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('navigation-level-panel')).not.toBeInTheDocument();
    });

    it('shows exactly the focused member subset (identical areaKey set, AC4.12) — never the third, unfocused member', () => {
      renderFocused();
      expect(screen.getByTestId('areas-cluster-focus-member-a:alpha')).toHaveTextContent('Alpha');
      expect(screen.getByTestId('areas-cluster-focus-member-a:bravo')).toHaveTextContent('Bravo');
      expect(screen.queryByTestId('areas-cluster-focus-member-a:charlie')).not.toBeInTheDocument();
    });

    it('the count copy is the total over exactly the focused members (AC4.12) — "2 areas with matches", not the 3-child total', () => {
      renderFocused();
      expect(screen.getByTestId('areas-cluster-focus-summary')).toHaveTextContent('2 areas with matches');
    });

    it('"Show all areas" clears focus by calling onClusterFocusChange(null)', async () => {
      const user = userEvent.setup();
      const onClusterFocusChange = vi.fn();
      renderFocused({ onClusterFocusChange });
      await user.click(screen.getByTestId('areas-cluster-focus-clear'));
      expect(onClusterFocusChange).toHaveBeenCalledTimes(1);
      expect(onClusterFocusChange).toHaveBeenCalledWith(null);
    });

    it('selecting a focused member calls journey.selectNode with its nodeKey — the SAME action every other child uses', async () => {
      const user = userEvent.setup();
      const selectNode = vi.fn();
      renderFocused({ selectNode });
      await user.click(screen.getByTestId('areas-cluster-focus-member-a:alpha'));
      expect(selectNode).toHaveBeenCalledWith('a:alpha');
    });

    it('falls back to the normal navigation-level-panel when no cluster is focused (null)', () => {
      render(
        <MemoryRouter>
          <DiscoverAreasJourneyPanel
            journey={makeJourney({
              node: makeNode(),
              nodeCount: { listingCount: 20, schoolCount: 3, matchingAreaCount: null },
              children: [],
            })}
            buildNodeHref={NOOP_BUILD_HREF}
            focusedClusterMemberAreaKeys={null}
          />
        </MemoryRouter>,
      );
      expect(screen.queryByTestId('areas-cluster-focus-panel')).not.toBeInTheDocument();
    });

    it('does not mutate node/browser-history state when focusing or clearing a cluster (AC4.5 item 4)', async () => {
      const user = userEvent.setup();
      const onClusterFocusChange = vi.fn();
      const selectNode = vi.fn();
      const locationBefore = window.location.href;
      const historyLengthBefore = window.history.length;
      renderFocused({ onClusterFocusChange, selectNode });
      await user.click(screen.getByTestId('areas-cluster-focus-clear'));
      // Clearing focus never calls the node-selection action, and never
      // touches window.location or pushes a history entry — only
      // `onClusterFocusChange` fires.
      expect(selectNode).not.toHaveBeenCalled();
      expect(window.location.href).toBe(locationBefore);
      expect(window.history.length).toBe(historyLengthBefore);
    });

    // REQUIRED CHANGE 1 (review fix, AC4.12) — the map's own
    // AreaDestinationMarkerLayer filters focused members through
    // journey-aware eligibility (clusterVisibleAreaMembers) BEFORE building
    // its cluster; this panel used to derive its member list by areaKey
    // membership alone, with no eligibility filter, so a member that dropped
    // to zero listings still rendered here (reading "0 properties") while
    // the map had already dropped it. This test proves the panel now applies
    // the SAME filter.
    it('excludes a focused member with listingCount 0 from BOTH the list and the count — never a stale "0 properties" row (AC4.12)', () => {
      const rawChildren: NavigationNodeResponse['children'] = [
        ...CLUSTER_RAW_CHILDREN,
      ];
      const zeroContentChildren: UseAreasNavigationJourneyResult['children'] = [
        CLUSTER_CHILDREN[0],
        CLUSTER_CHILDREN[1],
        { ...CLUSTER_CHILDREN[2], listingCount: 0 },
      ];
      render(
        <MemoryRouter>
          <DiscoverAreasJourneyPanel
            journey={makeJourney({
              node: makeNode({ children: rawChildren }),
              nodeCount: { listingCount: 8, schoolCount: 0, matchingAreaCount: null },
              children: zeroContentChildren,
            })}
            buildNodeHref={NOOP_BUILD_HREF}
            focusedClusterMemberAreaKeys={['alpha', 'bravo', 'charlie']}
          />
        </MemoryRouter>,
      );
      expect(screen.getByTestId('areas-cluster-focus-panel')).toBeInTheDocument();
      expect(screen.getByTestId('areas-cluster-focus-member-a:alpha')).toBeInTheDocument();
      expect(screen.getByTestId('areas-cluster-focus-member-a:bravo')).toBeInTheDocument();
      expect(screen.queryByTestId('areas-cluster-focus-member-a:charlie')).not.toBeInTheDocument();
      expect(screen.getByTestId('areas-cluster-focus-summary')).toHaveTextContent('2 areas with matches');
    });

    it('falls back to the normal level panel when EVERY focused member is zero-content (nothing eligible survives)', () => {
      const zeroContentChildren: UseAreasNavigationJourneyResult['children'] = CLUSTER_CHILDREN.map((c) => ({
        ...c,
        listingCount: 0,
      }));
      render(
        <MemoryRouter>
          <DiscoverAreasJourneyPanel
            journey={makeJourney({
              node: makeNode({ children: CLUSTER_RAW_CHILDREN }),
              nodeCount: { listingCount: 0, schoolCount: 0, matchingAreaCount: null },
              children: zeroContentChildren,
            })}
            buildNodeHref={NOOP_BUILD_HREF}
            focusedClusterMemberAreaKeys={FOCUSED_AREA_KEYS}
          />
        </MemoryRouter>,
      );
      expect(screen.queryByTestId('areas-cluster-focus-panel')).not.toBeInTheDocument();
    });

    // REQUIRED CHANGE 2 (review fix) — `presentClusterRepresentatives` used
    // to be called with the default 2-name representative cap, so a 5-member
    // focus rendered "+3 areas with matches" directly above a list naming
    // all 5 areas — "+N" means "N more beyond the names shown", which is
    // false when every name IS on screen. Passing the panel's real
    // (post-eligibility) displayed count as the limit fixes this.
    it('never renders the "+N" form — every focused member is already on screen, so a 5-member focus reads "5 areas with matches"', () => {
      const rawChildren: NavigationNodeResponse['children'] = [
        { nodeKey: 'a:alpha', nodeType: 'AREA', displayLabel: 'Alpha', displayOrder: 1, areaKey: 'alpha', centreLat: 12.9, centreLon: 77.6 },
        { nodeKey: 'a:bravo', nodeType: 'AREA', displayLabel: 'Bravo', displayOrder: 2, areaKey: 'bravo', centreLat: 12.91, centreLon: 77.61 },
        { nodeKey: 'a:charlie', nodeType: 'AREA', displayLabel: 'Charlie', displayOrder: 3, areaKey: 'charlie', centreLat: 12.92, centreLon: 77.62 },
        { nodeKey: 'a:delta', nodeType: 'AREA', displayLabel: 'Delta', displayOrder: 4, areaKey: 'delta', centreLat: 12.93, centreLon: 77.63 },
        { nodeKey: 'a:echo', nodeType: 'AREA', displayLabel: 'Echo', displayOrder: 5, areaKey: 'echo', centreLat: 12.94, centreLon: 77.64 },
      ];
      const typedChildren: UseAreasNavigationJourneyResult['children'] = [
        { nodeKey: 'a:alpha', nodeType: 'AREA', displayLabel: 'Alpha', displayOrder: 1, listingCount: 5, schoolCount: null, isLeafArea: true, matchingAreaCount: null },
        { nodeKey: 'a:bravo', nodeType: 'AREA', displayLabel: 'Bravo', displayOrder: 2, listingCount: 4, schoolCount: null, isLeafArea: true, matchingAreaCount: null },
        { nodeKey: 'a:charlie', nodeType: 'AREA', displayLabel: 'Charlie', displayOrder: 3, listingCount: 3, schoolCount: null, isLeafArea: true, matchingAreaCount: null },
        { nodeKey: 'a:delta', nodeType: 'AREA', displayLabel: 'Delta', displayOrder: 4, listingCount: 2, schoolCount: null, isLeafArea: true, matchingAreaCount: null },
        { nodeKey: 'a:echo', nodeType: 'AREA', displayLabel: 'Echo', displayOrder: 5, listingCount: 1, schoolCount: null, isLeafArea: true, matchingAreaCount: null },
      ];
      render(
        <MemoryRouter>
          <DiscoverAreasJourneyPanel
            journey={makeJourney({
              node: makeNode({ children: rawChildren }),
              nodeCount: { listingCount: 15, schoolCount: 0, matchingAreaCount: null },
              children: typedChildren,
            })}
            buildNodeHref={NOOP_BUILD_HREF}
            focusedClusterMemberAreaKeys={['alpha', 'bravo', 'charlie', 'delta', 'echo']}
          />
        </MemoryRouter>,
      );
      for (const key of ['alpha', 'bravo', 'charlie', 'delta', 'echo']) {
        expect(screen.getByTestId(`areas-cluster-focus-member-a:${key}`)).toBeInTheDocument();
      }
      const summary = screen.getByTestId('areas-cluster-focus-summary');
      expect(summary).toHaveTextContent('5 areas with matches');
      expect(summary.textContent).not.toMatch(/\+\d/);
    });
  });
});
