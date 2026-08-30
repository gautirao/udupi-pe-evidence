/**
 * AreasBreadcrumbTrail — Issue #1956 PR 2 (Slice 5, AC5.1/AC5.2/AC5.14).
 *
 * JSDOM computes no layout, so this suite proves STRUCTURE (crumb count,
 * labels, href presence/absence, current-item non-linkage, the 4-item depth
 * guard) — never real clipping/rendered-width. AC5.14's true no-clip claim
 * requires a real browser at 390x844 (see the handoff's risk_r4_geometry).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AreasBreadcrumbTrail } from '../AreasBreadcrumbTrail';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

function makeNode(overrides: Partial<NavigationNodeResponse>): NavigationNodeResponse {
  return {
    nodeKey: 'd:north',
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

const renderTrail = (node: NavigationNodeResponse | null, buildHref = vi.fn((k: string) => `?node=${k}`)) =>
  render(
    <MemoryRouter>
      <AreasBreadcrumbTrail node={node} buildHref={buildHref} />
    </MemoryRouter>,
  );

describe('AreasBreadcrumbTrail', () => {
  it('renders nothing when node is null', () => {
    const { container } = renderTrail(null);
    expect(container.firstChild).toBeNull();
  });

  it('renders City > Direction for a Direction node (2 crumbs)', () => {
    renderTrail(makeNode({}));
    const nav = screen.getByTestId('areas-breadcrumb-trail');
    expect(nav).toHaveTextContent('Bangalore');
    expect(nav).toHaveTextContent('North Bangalore');
  });

  it('the terminal crumb is current and never a link (AC5.2)', () => {
    renderTrail(makeNode({}));
    const terminal = screen.getByText('North Bangalore');
    expect(terminal).toHaveAttribute('aria-current', 'page');
    expect(terminal.closest('a')).toBeNull();
  });

  it('every ancestor crumb links via buildHref, never onClick (AC5.2/T4)', () => {
    const buildHref = vi.fn((k: string) => `?node=${k}`);
    renderTrail(makeNode({}), buildHref);
    const cityLink = screen.getByText('Bangalore').closest('a');
    expect(cityLink).toHaveAttribute('href', '/?node=root');
    expect(buildHref).toHaveBeenCalledWith('root');
    // buildHref is never invoked for the terminal (current) crumb.
    expect(buildHref).not.toHaveBeenCalledWith('d:north');
  });

  it('renders City > Direction > Local Destination > Area at the 4-item cap (AC5.1)', () => {
    const node = makeNode({
      nodeKey: 'a:IN|KA|Bengaluru|Whitefield',
      nodeType: 'AREA',
      displayLabel: 'Whitefield',
      depth: 2,
      ancestry: [
        { nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 },
        { nodeKey: 'd:north', nodeType: 'DIRECTION', displayLabel: 'North Bangalore', displayOrder: 1 },
        { nodeKey: 'c:north:hebbal-kempapura', nodeType: 'CLUSTER', displayLabel: 'Hebbal - Kempapura', displayOrder: 1 },
      ],
    });
    renderTrail(node);
    const nav = screen.getByTestId('areas-breadcrumb-trail');
    for (const label of ['Bangalore', 'North Bangalore', 'Hebbal - Kempapura', 'Whitefield']) {
      expect(nav).toHaveTextContent(label);
    }
  });

  it('AC14 — a real Direction > Local Destination > Area ancestry chain (through a real CLUSTER level) renders City + all 3 real crumbs (4 total); the ancestry survives through a Local Destination', () => {
    // The server (NavigationNodeResponse.forNode / graph.ancestryOf) never
    // synthesizes a "root"/ROOT ancestry entry — no NavigationNode row backs
    // the city key — so the real ancestry shape omits root. PR #2141
    // follow-up: AreasBreadcrumbTrail now SYNTHESIZES the leading City crumb
    // itself in that case (see the module doc), so the real production chain
    // is City + Direction + Local Destination + Area = 4, landing exactly on
    // AC5.1's own "four items maximum" contract instead of stopping at 3.
    const node = makeNode({
      nodeKey: 'a:IN|KA|Bengaluru|Whitefield',
      nodeType: 'AREA',
      displayLabel: 'Whitefield',
      depth: 2,
      ancestry: [
        { nodeKey: 'd:north', nodeType: 'DIRECTION', displayLabel: 'North Bangalore', displayOrder: 1 },
        { nodeKey: 'c:north:hebbal-kempapura', nodeType: 'CLUSTER', displayLabel: 'Hebbal - Kempapura', displayOrder: 1 },
      ],
    });
    const buildHref = vi.fn((k: string) => `?node=${k}`);
    render(
      <MemoryRouter>
        <AreasBreadcrumbTrail node={node} buildHref={buildHref} cityLabel="Bangalore" />
      </MemoryRouter>,
    );

    const nav = screen.getByTestId('areas-breadcrumb-trail');
    expect(nav).toBeInTheDocument();
    // All 4 crumbs, in order, each individually present — the depth guard
    // (AREAS_BREADCRUMB_MAX_ITEMS=4) does NOT trigger at exactly the cap.
    const labels = ['Bangalore', 'North Bangalore', 'Hebbal - Kempapura', 'Whitefield'];
    for (const label of labels) {
      expect(nav).toHaveTextContent(label);
    }
    expect(screen.queryByTestId('areas-breadcrumb-depth-guard')).not.toBeInTheDocument();
    // The terminal (4th) crumb is the current, unlinked one — proving this
    // really is a 4-deep chain reaching the AREA leaf, not a shorter chain
    // that happens to mention all labels somewhere in the DOM.
    const terminal = screen.getByText('Whitefield');
    expect(terminal).toHaveAttribute('aria-current', 'page');
    expect(terminal.closest('a')).toBeNull();
    // The Local Destination (CLUSTER) crumb is a real, linked ancestor —
    // this is the genuine proof that ancestry survives THROUGH a Local
    // Destination (CLUSTER) level, which is what AC14 requires.
    const localDestinationCrumb = screen.getByText('Hebbal - Kempapura');
    expect(localDestinationCrumb.closest('a')).toHaveAttribute('href', '/?node=c:north:hebbal-kempapura');
    // The synthesized City crumb is a real, linked ancestor pointing at the
    // synthetic root via the SAME buildHref data path — this is the actual
    // "back to City root" affordance PR #2141's Fix 1 requires.
    const cityCrumb = screen.getByText('Bangalore');
    expect(cityCrumb.closest('a')).toHaveAttribute('href', '/?node=root');
    expect(buildHref).toHaveBeenCalledWith('root');
  });

  it('PR #2141 Fix 1 — a Direction node (empty ancestry, the trap case) still renders a tappable City crumb back to root', () => {
    const buildHref = vi.fn((k: string) => `?node=${k}`);
    render(
      <MemoryRouter>
        <AreasBreadcrumbTrail
          node={makeNode({ ancestry: [] })}
          buildHref={buildHref}
          cityLabel="Bangalore"
        />
      </MemoryRouter>,
    );
    const nav = screen.getByTestId('areas-breadcrumb-trail');
    expect(nav).toHaveTextContent('Bangalore');
    expect(nav).toHaveTextContent('North Bangalore');
    const cityCrumb = screen.getByText('Bangalore');
    expect(cityCrumb.closest('a')).toHaveAttribute('href', '/?node=root');
    expect(buildHref).toHaveBeenCalledWith('root');
    // The terminal Direction crumb stays current/unlinked — City is the only
    // navigable ancestor at this level.
    const terminal = screen.getByText('North Bangalore');
    expect(terminal).toHaveAttribute('aria-current', 'page');
    expect(terminal.closest('a')).toBeNull();
  });

  it('a city-root node (empty ancestry) renders a single, current, unlinked crumb', () => {
    const root = makeNode({
      nodeKey: 'root',
      nodeType: 'ROOT',
      displayLabel: 'Bangalore',
      depth: -1,
      ancestry: [],
    });
    renderTrail(root);
    const terminal = screen.getByText('Bangalore');
    expect(terminal).toHaveAttribute('aria-current', 'page');
    expect(terminal.closest('a')).toBeNull();
  });

  it('renders no href for an ancestor whose key buildHref rejects (malformed/oversized)', () => {
    renderTrail(makeNode({}), vi.fn(() => null));
    const cityCrumb = screen.getByText('Bangalore');
    expect(cityCrumb.closest('a')).toBeNull();
  });

  describe('AC5.1 depth-guard — an ancestry deeper than the 4-item cap is SURFACED, never flattened', () => {
    it('renders a distinct overflow notice instead of a (silently truncated) trail', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const overDeep = makeNode({
        nodeKey: 'a:IN|KA|Bengaluru|Deep',
        nodeType: 'AREA',
        displayLabel: 'Deep Area',
        ancestry: [
          { nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 },
          { nodeKey: 'd:north', nodeType: 'DIRECTION', displayLabel: 'North', displayOrder: 1 },
          { nodeKey: 'c:north:a', nodeType: 'CLUSTER', displayLabel: 'Cluster A', displayOrder: 1 },
          { nodeKey: 'c:north:a:b', nodeType: 'CLUSTER', displayLabel: 'Cluster B', displayOrder: 1 },
        ],
      });
      renderTrail(overDeep);

      expect(screen.getByTestId('areas-breadcrumb-depth-guard')).toBeInTheDocument();
      expect(screen.queryByTestId('areas-breadcrumb-trail')).not.toBeInTheDocument();
      // Never silently truncated into what would look like a valid 4-item trail.
      expect(screen.queryByText('Deep Area')).not.toBeInTheDocument();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
