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
});
