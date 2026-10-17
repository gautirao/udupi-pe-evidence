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
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { NavigationLevelPanel } from '../NavigationLevelPanel';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

// Issue #2084 (AC6) — the default fixture is now a generic, NON-root
// DIRECTION node. Before #2084, every test below defaulted to the literal
// synthetic city ROOT (`nodeKey: 'root'`, `nodeType: 'ROOT'`) purely as an
// arbitrary example node — none of them were actually testing city-root
// behaviour. #2084 gives the literal ROOT node a real, distinct heading
// (the invitational eyebrow/question), so a "generic node" fixture can no
// longer be the synthetic root without silently exercising that special
// case. Dedicated city-ROOT coverage lives in the "AC6 — city ROOT" and
// "AC7 — section eyebrow/count + divider" describe blocks below, which pass
// `nodeKey: 'root'`/`nodeType: 'ROOT'` explicitly via `overrides`.
function makeNode(overrides: Partial<NavigationNodeResponse> = {}): NavigationNodeResponse {
  return {
    nodeKey: 'd:n',
    nodeType: 'DIRECTION',
    displayLabel: 'North Bangalore',
    depth: 0,
    regionKey: 'north',
    ancestry: [{ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 }],
    nextLevelType: 'AREA',
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
    expect(heading.textContent).toContain('North Bangalore');
    expect(screen.getByTestId('navigation-level-heading-count').textContent).toBe(
      '42 areas with matches here. Crowded markers are grouped on the map for legibility only.',
    );
    expect(screen.getByTestId('navigation-level-panel')).toHaveAttribute('data-node-key', 'd:n');
  });

  it('shows the LOCKED zero literal in the heading when nodeCount.matchingAreaCount is 0, never "+N"', () => {
    render(
      <NavigationLevelPanel
        journey={makeJourney({ nodeCount: { listingCount: 999, schoolCount: 0, matchingAreaCount: 0 } })}
      />,
    );
    expect(screen.queryByTestId('navigation-level-heading-count')).not.toBeInTheDocument();
    expect(screen.getByText('No matches with current filters')).toBeInTheDocument();
  });

  it('count_display_defect_2026_07_29 (regression) — heading reads matchingAreaCount, never listingCount', () => {
    render(
      <NavigationLevelPanel
        journey={makeJourney({ nodeCount: { listingCount: 1736, schoolCount: 5, matchingAreaCount: 12 } })}
      />,
    );
    expect(screen.getByTestId('navigation-level-heading-count').textContent).toBe(
      '12 areas with matches here. Crowded markers are grouped on the map for legibility only.',
    );
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
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('listings')).toBeInTheDocument();
  });

  it('count_display_defect_2026_07_29 (pass 4 regression) — a zero matchingAreaCount heading shows ONLY the locked zero literal, never an additional listings line', () => {
    render(
      <NavigationLevelPanel
        journey={makeJourney({ nodeCount: { listingCount: 999, schoolCount: 0, matchingAreaCount: 0 } })}
      />,
    );
    expect(screen.getByText('No matches with current filters')).toBeInTheDocument();
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

  // ── Issue #2084 (AC6) — city-ROOT invitational heading ──────────────────
  describe('AC6 — city ROOT heading vs. a Direction node heading', () => {
    it('at the city ROOT, renders the invitational eyebrow + question INSTEAD of node.displayLabel/nodeCount', () => {
      render(
        <NavigationLevelPanel
          journey={makeJourney({
            node: makeNode({
              nodeKey: 'root',
              nodeType: 'ROOT',
              displayLabel: 'Bangalore',
              depth: -1,
              ancestry: [],
              nextLevelType: 'DIRECTION',
            }),
            levelKind: 'directions',
          })}
          cityLabel="Bangalore"
        />,
      );
      expect(screen.getByTestId('navigation-level-root-eyebrow')).toHaveTextContent('Discover Bangalore');
      expect(screen.getByTestId('navigation-level-root-heading')).toHaveTextContent(
        'Where do you want to explore?',
      );
      // The node-scoped heading/count testids belong to the non-root branch
      // only — city-wide counts now live in the JourneySwitcher metrics
      // strip (CQ3), never repeated in this heading.
      expect(screen.queryByRole('heading', { name: 'Bangalore' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('navigation-level-heading-count')).not.toBeInTheDocument();
      expect(screen.queryByTestId('navigation-level-heading-listings')).not.toBeInTheDocument();
    });

    it('a Direction node keeps its existing node-scoped heading + scoped counts, UNCHANGED in kind', () => {
      render(<NavigationLevelPanel journey={makeJourney()} cityLabel="Bangalore" />);
      // node.displayLabel from the default (non-root) fixture, exactly as
      // AC3.4's pre-existing behaviour asserts elsewhere in this file.
      expect(screen.getByTestId('navigation-level-heading')).toHaveTextContent('North Bangalore');
      expect(screen.getByTestId('navigation-level-heading-count')).toHaveTextContent('42 areas with matches');
      expect(screen.queryByTestId('navigation-level-root-eyebrow')).not.toBeInTheDocument();
      expect(screen.queryByTestId('navigation-level-root-heading')).not.toBeInTheDocument();
    });
  });

  // ── Issue #2084 (AC7) — section eyebrow/count + divider above the child list ──
  describe('AC7 — section eyebrow/count above the child list', () => {
    const DIRECTION_CHILDREN: UseAreasNavigationJourneyResult['children'] = [
      { nodeKey: 'd:n', nodeType: 'DIRECTION', displayLabel: 'North Bangalore', displayOrder: 1, listingCount: 5, schoolCount: null, isLeafArea: false, matchingAreaCount: null },
      { nodeKey: 'd:s', nodeType: 'DIRECTION', displayLabel: 'South Bangalore', displayOrder: 2, listingCount: 3, schoolCount: null, isLeafArea: false, matchingAreaCount: null },
    ];
    const AREA_CHILDREN: UseAreasNavigationJourneyResult['children'] = [
      { nodeKey: 'a:alpha', nodeType: 'AREA', displayLabel: 'Alpha', displayOrder: 1, listingCount: 5, schoolCount: null, isLeafArea: true, matchingAreaCount: null },
      { nodeKey: 'a:bravo', nodeType: 'AREA', displayLabel: 'Bravo', displayOrder: 2, listingCount: 3, schoolCount: null, isLeafArea: true, matchingAreaCount: null },
      { nodeKey: 'a:charlie', nodeType: 'AREA', displayLabel: 'Charlie', displayOrder: 3, listingCount: 1, schoolCount: null, isLeafArea: true, matchingAreaCount: null },
    ];

    it('city ROOT — "Explore {cityLabel}" eyebrow (Issue #2086 copy change from the former literal "Directions") with count = children.length, rendered ABOVE the child list, with a divider', () => {
      render(
        <NavigationLevelPanel
          journey={makeJourney({
            node: makeNode({ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', ancestry: [], nextLevelType: 'DIRECTION' }),
            levelKind: 'directions',
            children: DIRECTION_CHILDREN,
          })}
          cityLabel="Bangalore"
        />,
      );
      const label = screen.getByTestId('navigation-level-section-label');
      // Issue #2086 changed this eyebrow from the literal 'Directions' to
      // `Explore ${cityLabel}` — asserting the NEW copy is the point of this
      // test, not a reversion to the old literal.
      expect(label).toHaveTextContent('Explore Bangalore');
      expect(label).not.toHaveTextContent('Directions');
      expect(screen.getByTestId('navigation-level-section-count')).toHaveTextContent('2');
      // Divider — the section-label row itself carries the border-b rule
      // separating it (and the switcher block above it, mounted by this
      // panel's caller) from the list.
      expect(label.className).toContain('border-b');
      // Ordered before the list in the DOM.
      const list = screen.getByTestId('navigation-child-list');
      expect(label.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('AC10 — the section count is journey.children.length, NOT discoverAreas.length/cityTotal (this component never receives those)', () => {
      render(
        <NavigationLevelPanel
          journey={makeJourney({
            node: makeNode(), // Direction node, nextLevelType AREA
            levelKind: 'areas',
            children: AREA_CHILDREN,
          })}
        />,
      );
      expect(screen.getByTestId('navigation-level-section-label')).toHaveTextContent('Areas in North Bangalore');
      // Exactly 3 — the length of the AREA_CHILDREN array actually rendered,
      // proving the count is NOT any external city-wide total (which this
      // component's props do not even expose).
      expect(screen.getByTestId('navigation-level-section-count')).toHaveTextContent('3');
    });

    it('omits the section label when there are no children (the empty message stands alone)', () => {
      render(<NavigationLevelPanel journey={makeJourney({ children: [] })} />);
      expect(screen.queryByTestId('navigation-level-section-label')).not.toBeInTheDocument();
      expect(screen.getByTestId('navigation-level-empty')).toBeInTheDocument();
    });
  });

  describe('Issue #2087 — Browse listings CTA eligibility', () => {
    it('is eligible when the canonical descendant area count is 15 (inclusive boundary)', () => {
      const onBrowseListings = vi.fn();
      render(
        <NavigationLevelPanel
          journey={makeJourney({
            node: makeNode({ descendantAreaKeys: new Array(15).fill('a') }),
          })}
          onBrowseListings={onBrowseListings}
        />
      );
      expect(screen.getByTestId('browse-node-listings-cta')).toBeInTheDocument();
    });

    it('is ineligible when the canonical descendant area count is 16 (exceeds boundary)', () => {
      const onBrowseListings = vi.fn();
      render(
        <NavigationLevelPanel
          journey={makeJourney({
            node: makeNode({ descendantAreaKeys: new Array(16).fill('a') }),
          })}
          onBrowseListings={onBrowseListings}
        />
      );
      expect(screen.queryByTestId('browse-node-listings-cta')).not.toBeInTheDocument();
    });

    it('is eligible for a shallow non-root stable node (e.g. Udupi region) if its total descendant areas <= 15', () => {
      const onBrowseListings = vi.fn();
      render(
        <NavigationLevelPanel
          journey={makeJourney({
            node: makeNode({
              nodeKey: 'r:udupi',
              nodeType: 'DIRECTION',
              descendantAreaKeys: new Array(10).fill('a'),
            }),
          })}
          onBrowseListings={onBrowseListings}
        />
      );
      expect(screen.getByTestId('browse-node-listings-cta')).toBeInTheDocument();
    });

    it('is never eligible at the city ROOT, even if descendant areas <= 15', () => {
      const onBrowseListings = vi.fn();
      render(
        <NavigationLevelPanel
          journey={makeJourney({
            node: makeNode({
              nodeKey: 'root',
              nodeType: 'ROOT',
              descendantAreaKeys: new Array(10).fill('a'),
            }),
          })}
          onBrowseListings={onBrowseListings}
        />
      );
      expect(screen.queryByTestId('browse-node-listings-cta')).not.toBeInTheDocument();
    });

    it('shows the listing count in the CTA using nodeCount.listingCount', () => {
      const onBrowseListings = vi.fn();
      const journey = makeJourney({
        node: makeNode({ descendantAreaKeys: new Array(15).fill('a') }),
      });
      // Override the default nodeCount with a specific listingCount
      journey.nodeCount = { listingCount: 42, matchingAreaCount: 5, schoolCount: 0 };
      
      render(
        <NavigationLevelPanel
          journey={journey}
          onBrowseListings={onBrowseListings}
        />
      );
      expect(screen.getByRole('button', { name: /Browse all 42 listings/i })).toBeInTheDocument();
    });
  });

  // #2750 PR-5 2087-N2 — the Browse-all click goes through the REAL URL facade (not a spy).
  describe('Issue #2087 — Browse listings CTA writes nodeListings through the real URL facade', () => {
    let navigateRef: ReturnType<typeof useNavigate> | null = null;

    function FacadeHarness({ nodeDescendants }: { nodeDescendants: number }) {
      const [, urlActions] = useDiscoverUrlState();
      const location = useLocation();
      const navigationType = useNavigationType();
      navigateRef = useNavigate();
      return (
        <>
          <span data-testid="harness-search">{location.search}</span>
          <span data-testid="harness-navtype">{navigationType}</span>
          <NavigationLevelPanel
            journey={makeJourney({
              node: makeNode({
                nodeKey: 'd:central',
                descendantAreaKeys: new Array(nodeDescendants).fill('a'),
              }),
            })}
            onBrowseListings={urlActions.enterNodeListings}
          />
        </>
      );
    }

    function renderFacadeHarness(nodeDescendants: number) {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/discover?city=bangalore&journey=area-first&node=d%3Acentral']}>
            <FacadeHarness nodeDescendants={nodeDescendants} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    }

    it('clicking Browse-all writes nodeListings=1 as a PUSH through the real URL facade', () => {
      const eligible = renderFacadeHarness(10);
      const initialSearch = screen.getByTestId('harness-search').textContent;
      expect(initialSearch).not.toContain('nodeListings');

      fireEvent.click(screen.getByTestId('browse-node-listings-cta'));

      const afterClick = new URLSearchParams(screen.getByTestId('harness-search').textContent ?? '');
      expect(afterClick.get('nodeListings')).toBe('1');
      expect(afterClick.get('node')).toBe('d:central');
      expect(screen.getByTestId('harness-navtype').textContent).toBe('PUSH');

      // PUSH means Back returns to the entry without nodeListings (a REPLACE would overwrite it).
      act(() => {
        navigateRef?.(-1);
      });
      expect(screen.getByTestId('harness-search').textContent).toBe(initialSearch);
      eligible.unmount();

      // Control arm: 16 descendant keys is over the bound -> no CTA, nothing written.
      renderFacadeHarness(16);
      expect(screen.queryByTestId('browse-node-listings-cta')).not.toBeInTheDocument();
      expect(screen.getByTestId('harness-search').textContent).toBe(initialSearch);
    });
  });
});
