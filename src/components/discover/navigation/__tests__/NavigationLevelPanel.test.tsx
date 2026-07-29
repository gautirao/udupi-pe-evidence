/**
 * Issue #1956 PR 2 (Slice 3) — NavigationLevelPanel.
 *
 * AC3.4 — the heading names the node explicitly and its count line is derived
 * from `nodeCount` (the SAME object the map consumes via
 * useAreasNavigationJourney, never re-fetched here).
 * AC3.7 — a CLUSTER-level node's children are still rendered as a plain
 * bounded list (no third public level is ever synthesized by this component;
 * it merely renders whatever real children it is handed).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavigationLevelPanel } from '../NavigationLevelPanel';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

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

function makeJourney(
  overrides: Partial<UseAreasNavigationJourneyResult> = {},
): Pick<
  UseAreasNavigationJourneyResult,
  'node' | 'levelKind' | 'children' | 'resolutionNotice' | 'nodeCount' | 'selectNode'
> {
  return {
    node: makeNode(),
    levelKind: 'directions',
    children: [],
    resolutionNotice: null,
    // matchingAreaCount deliberately DIFFERS from listingCount so a test
    // asserting the rendered copy proves the heading reads matchingAreaCount,
    // not listingCount (count_display_defect_2026_07_29).
    nodeCount: { listingCount: 999, schoolCount: 5, matchingAreaCount: 42 },
    selectNode: vi.fn(),
    ...overrides,
  };
}

describe('NavigationLevelPanel', () => {
  it('renders nothing when node is null (not yet resolved)', () => {
    const { container } = render(<NavigationLevelPanel journey={makeJourney({ node: null })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('AC3.4 — heading names the node and shows the SAME nodeCount the map uses', () => {
    render(<NavigationLevelPanel journey={makeJourney()} />);
    const heading = screen.getByTestId('navigation-level-heading');
    expect(heading.textContent).toContain('Bangalore');
    expect(screen.getByTestId('navigation-level-heading-count').textContent).toBe('42 areas with matches');
    expect(screen.getByTestId('navigation-level-panel')).toHaveAttribute('data-node-key', 'root');
  });

  it('shows the LOCKED zero literal in the heading when nodeCount.matchingAreaCount is 0, never "+N"', () => {
    render(
      <NavigationLevelPanel
        journey={makeJourney({ nodeCount: { listingCount: 999, schoolCount: 0, matchingAreaCount: 0 } })}
      />,
    );
    expect(screen.getByTestId('navigation-level-heading-count').textContent).toBe(
      'No matches with current filters',
    );
  });

  it('count_display_defect_2026_07_29 (regression) — heading reads matchingAreaCount, never listingCount', () => {
    render(
      <NavigationLevelPanel
        journey={makeJourney({ nodeCount: { listingCount: 1736, schoolCount: 5, matchingAreaCount: 12 } })}
      />,
    );
    expect(screen.getByTestId('navigation-level-heading-count').textContent).toBe('12 areas with matches');
  });

  it('omits the areas-with-matches heading line (never falls back to listingCount) when matchingAreaCount is not derivable (e.g. the synthetic city root)', () => {
    render(
      <NavigationLevelPanel
        journey={makeJourney({ nodeCount: { listingCount: 500, schoolCount: 5, matchingAreaCount: null } })}
      />,
    );
    expect(screen.queryByTestId('navigation-level-heading-count')).not.toBeInTheDocument();
  });

  it('count_display_defect_2026_07_29 (pass 4 regression) — the missing areas-with-matches line never suppresses the journey-aware listing count in the heading', () => {
    render(
      <NavigationLevelPanel
        journey={makeJourney({ nodeCount: { listingCount: 500, schoolCount: 5, matchingAreaCount: null } })}
      />,
    );
    expect(screen.queryByTestId('navigation-level-heading-count')).not.toBeInTheDocument();
    expect(screen.getByTestId('navigation-level-heading-listings').textContent).toBe('500 listings');
  });

  it('count_display_defect_2026_07_29 (pass 4 regression) — a zero matchingAreaCount heading shows ONLY the locked zero literal, never an additional listings line', () => {
    render(
      <NavigationLevelPanel
        journey={makeJourney({ nodeCount: { listingCount: 999, schoolCount: 0, matchingAreaCount: 0 } })}
      />,
    );
    expect(screen.getByTestId('navigation-level-heading-count').textContent).toBe(
      'No matches with current filters',
    );
    expect(screen.queryByTestId('navigation-level-heading-listings')).not.toBeInTheDocument();
  });

  it('renders the resolution notice when present', () => {
    render(
      <NavigationLevelPanel
        journey={makeJourney({
          resolutionNotice: {
            blocking: false,
            rung: 'ancestor',
            requestedNodeKey: 'a:stale',
            resolvedNodeKey: 'd:n',
          },
        })}
      />,
    );
    expect(screen.getByTestId('navigation-resolution-notice')).toBeInTheDocument();
  });

  it('AC3.8 — an empty children list renders the honest empty state, never a fabricated destination', () => {
    render(<NavigationLevelPanel journey={makeJourney({ children: [] })} />);
    expect(screen.getByTestId('navigation-level-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('navigation-child-list')).not.toBeInTheDocument();
  });

  it('renders the bounded child list when children are present', () => {
    render(
      <NavigationLevelPanel
        journey={makeJourney({
          children: [
            {
              nodeKey: 'd:n',
              nodeType: 'DIRECTION',
              displayLabel: 'North Bangalore',
              displayOrder: 1,
              listingCount: 5,
              schoolCount: null,
              isLeafArea: false,
              matchingAreaCount: null,
            },
          ],
        })}
      />,
    );
    expect(screen.getByTestId('navigation-child-list')).toBeInTheDocument();
    expect(screen.getByTestId('navigation-child-card-d:n')).toBeInTheDocument();
  });
});
