/**
 * HierarchyBackButton — Issue #1956 PR 2 (Slice 5, AC5.2-AC5.10), fix-verify
 * cycles 1, 3 and 4 (`hierarchy_back_guarded_pop` /
 * `user_rulings_2026_07_29_cycle3_grant` / cycle-4 history-index rework).
 *
 * Proves: the control resolves the CANONICAL parent from `node.ancestry`
 * (never browser history) as the DESTINATION, is absent at the city root
 * (AC5.7), degrades to "render nothing" for an unwritable parent key, and the
 * GUARD's decision logic (`decideHierarchyBackMechanism`, owned by
 * `useAreasNavigationJourney.ts`) chooses POP only when a recorded
 * history-adjacency log PROVES adjacency BY BROWSER HISTORY SLOT
 * (`window.history.state.idx`) — never by `location.key`, never by a
 * repeated `nodeKey` — and REPLACE for every other case. The pure-function
 * tests below are the fully provable half of this fix.
 *
 * ── FIX-VERIFY CYCLE 4 — WHY `window.history` IS SIMULATED HERE ──
 * `MemoryRouter` keeps its OWN in-memory navigation stack, entirely separate
 * from `window.history` — it never calls `pushState`/`replaceState`. The
 * corrected identity model reads `window.history.state.idx` directly (see
 * `readBrowserHistoryIndex` in `useAreasNavigationJourney.ts`), so these
 * component-wiring tests drive BOTH stacks in parallel: `MemoryRouter`'s own
 * `navigate()` for the visible location/DOM the component renders against,
 * and an explicit `window.history.replaceState({ idx }, ...)` call for the
 * slot value the corrected hook logic actually reads — mirroring exactly
 * what a real `BrowserRouter` would leave in `window.history.state` after a
 * push/replace, without needing jsdom's async `history.back()/go()`
 * traversal semantics (which this suite does not need: it proves the
 * IDENTITY MODEL deterministically). What this still cannot prove — the real
 * ~650-900ms delayed camera-fit REPLACE at actual human-reaction-time timing,
 * and the real browser's own Back/Forward traversal — needs the real-browser
 * E2E pass; see `e2e/discover/issue-1956-pr2-*.spec.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useNavigate, useLocation } from 'react-router-dom';
import { HierarchyBackButton } from '../HierarchyBackButton';
import {
  decideHierarchyBackMechanism,
  useHierarchyBackAdjacencyLog,
  type HistoryAdjacencyEntry,
} from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

function makeNode(overrides: Partial<NavigationNodeResponse>): NavigationNodeResponse {
  return {
    nodeKey: 'a:IN|KA|Bengaluru|Whitefield',
    nodeType: 'AREA',
    displayLabel: 'Whitefield',
    depth: 1,
    regionKey: null,
    ancestry: [
      { nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 },
      { nodeKey: 'd:north', nodeType: 'DIRECTION', displayLabel: 'North Bangalore', displayOrder: 1 },
    ],
    nextLevelType: 'LISTINGS',
    children: [],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: null,
    areaKey: 'IN|KA|Bengaluru|Whitefield',
    ...overrides,
  };
}

const renderBack = (node: NavigationNodeResponse | null, buildHref = vi.fn((k: string) => `?node=${k}`)) =>
  render(
    <MemoryRouter>
      <HierarchyBackButton node={node} buildHref={buildHref} historyAdjacencyLog={[]} />
    </MemoryRouter>,
  );

// Fix-verify cycle 4 — `window.history` is a real jsdom singleton shared
// across every test in this file (MemoryRouter never touches it, but the
// component under test now reads it directly). Reset it to a known baseline
// before each test so no test's ending slot leaks into the next.
beforeEach(() => {
  window.history.replaceState({ idx: 0 }, '', '/');
});

describe('HierarchyBackButton', () => {
  it('renders nothing when node is null', () => {
    const { container } = renderBack(null);
    expect(container.firstChild).toBeNull();
  });

  it('AC5.7 — renders nothing at the city root (empty ancestry)', () => {
    const root = makeNode({ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', ancestry: [] });
    const { container } = renderBack(root);
    expect(container.firstChild).toBeNull();
  });

  it('navigates to the immediate ancestor (last entry of node.ancestry), not the whole chain', () => {
    const buildHref = vi.fn((k: string) => `?node=${k}`);
    renderBack(makeNode({}), buildHref);
    expect(buildHref).toHaveBeenCalledWith('d:north');
    expect(buildHref).not.toHaveBeenCalledWith('root');
    const link = screen.getByTestId('areas-hierarchy-back');
    expect(link).toHaveAttribute('href', '/?node=d:north');
    expect(link).toHaveTextContent('North Bangalore');
    expect(link).toHaveAttribute('aria-label', 'Back to North Bangalore');
  });

  it('uses a single-level ancestor for a Direction node (parent is the city root)', () => {
    const buildHref = vi.fn((k: string) => `?node=${k}`);
    renderBack(
      makeNode({
        nodeKey: 'd:north',
        nodeType: 'DIRECTION',
        displayLabel: 'North Bangalore',
        ancestry: [{ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 }],
      }),
      buildHref,
    );
    expect(buildHref).toHaveBeenCalledWith('root');
    expect(screen.getByTestId('areas-hierarchy-back')).toHaveAttribute('href', '/?node=root');
  });

  it('renders nothing when buildHref rejects the parent key (defensive — never a dead link)', () => {
    const { container } = renderBack(makeNode({}), vi.fn(() => null));
    expect(container.firstChild).toBeNull();
  });

  it('cold-load convergence (AC5.5) — resolves purely from ancestry, independent of any prior render/history', () => {
    // A fresh single render with no prior navigation state still produces the
    // correct canonical-parent href — the control never consults browser
    // history to decide its destination.
    const buildHref = vi.fn((k: string) => `?node=${k}`);
    renderBack(makeNode({}), buildHref);
    expect(screen.getByTestId('areas-hierarchy-back')).toHaveAttribute('href', '/?node=d:north');
  });
});

describe('decideHierarchyBackMechanism (guard, pure — fully provable in JSDOM)', () => {
  it('REPLACE — empty log (cold deep link / refresh / freshly (re)mounted component)', () => {
    expect(decideHierarchyBackMechanism([], 1, 'd:north')).toBe('replace');
  });

  it('REPLACE — a single logged entry that IS the current slot (no predecessor observed yet)', () => {
    const log: HistoryAdjacencyEntry[] = [{ historyIndex: 1, nodeKey: 'd:north' }];
    expect(decideHierarchyBackMechanism(log, 1, 'd:north')).toBe('replace');
  });

  it("POP — the predecessor entry (log's last, current not yet logged) matches the canonical parent", () => {
    // Typical mid-render case: this render is deciding the mechanism for a
    // slot the effect has not logged yet (it logs AFTER this render).
    const log: HistoryAdjacencyEntry[] = [{ historyIndex: 0, nodeKey: 'd:north' }];
    expect(decideHierarchyBackMechanism(log, 1, 'd:north')).toBe('pop');
  });

  it('REPLACE — the predecessor entry does NOT match the canonical parent (non-adjacent jump / different city)', () => {
    const log: HistoryAdjacencyEntry[] = [{ historyIndex: 0, nodeKey: 'd:south' }];
    expect(decideHierarchyBackMechanism(log, 1, 'd:north')).toBe('replace');
  });

  it("POP — the predecessor is log[length-2] when the log's last entry already IS the current slot (post-effect-settle re-render)", () => {
    const log: HistoryAdjacencyEntry[] = [
      { historyIndex: 0, nodeKey: 'd:north' },
      { historyIndex: 1, nodeKey: 'a:whitefield' },
    ];
    expect(decideHierarchyBackMechanism(log, 1, 'd:north')).toBe('pop');
  });

  it('REPLACE — recency alone is not adjacency: a matching entry two slots back is NOT usable once a closer, non-matching entry has been logged', () => {
    const log: HistoryAdjacencyEntry[] = [
      { historyIndex: 0, nodeKey: 'd:north' },
      { historyIndex: 1, nodeKey: 'd:south' },
    ];
    // Current sits at slot 2; the entry immediately behind it (slot 1 =
    // d:south) does not match, even though 'd:north' was seen earlier.
    expect(decideHierarchyBackMechanism(log, 2, 'd:north')).toBe('replace');
  });

  it('fix-verify cycle 4 — REPLACE (fail closed) when the CURRENT history index is unavailable, even though the last logged entry matches the parent', () => {
    const log: HistoryAdjacencyEntry[] = [{ historyIndex: 0, nodeKey: 'd:north' }];
    expect(decideHierarchyBackMechanism(log, null, 'd:north')).toBe('replace');
  });

  it('fix-verify cycle 4 — REPLACE (fail closed) when the PREVIOUS entry was itself logged with an unavailable index, even though its nodeKey matches the parent', () => {
    const log: HistoryAdjacencyEntry[] = [
      { historyIndex: null, nodeKey: 'd:north' },
      { historyIndex: 1, nodeKey: 'a:whitefield' },
    ];
    expect(decideHierarchyBackMechanism(log, 1, 'd:north')).toBe('replace');
  });
});

describe('adjacency log identity model (pure — fix-verify cycle 4: identity is the history SLOT, not location.key or a repeated nodeKey)', () => {
  it('an async same-slot camera-fit REPLACE updates the existing entry IN PLACE — it must NOT append a duplicate', () => {
    // Models the exact defect: after Direction resolves at slot 1, an async
    // camera-fit REPLACE fires ~650-900ms later in the real app. It mints a
    // fresh `location.key` (react-router does this on every replace,
    // regardless of whether the path changed) but the browser history SLOT
    // (`window.history.state.idx`) stays 1 — the old location.key-keyed log
    // mis-recognised this as a brand new entry and pushed a duplicate; the
    // corrected model must update entry[1] in place instead.
    const log: HistoryAdjacencyEntry[] = [
      { historyIndex: 0, nodeKey: 'root' },
      { historyIndex: 1, nodeKey: 'd:north' },
    ];
    const historyIndex = 1; // same slot as the log's last entry — a REPLACE, not a PUSH
    const matchIndex = log.findIndex((entry) => entry.historyIndex === historyIndex);
    expect(matchIndex).toBe(1);
    log.splice(matchIndex + 1);
    log[matchIndex] = { historyIndex, nodeKey: 'd:north' };

    expect(log).toEqual([
      { historyIndex: 0, nodeKey: 'root' },
      { historyIndex: 1, nodeKey: 'd:north' },
    ]);
    // A subsequent Back from a child pushed at slot 2 must still correctly
    // prove adjacency against this (unduplicated) Direction entry.
    expect(decideHierarchyBackMechanism(log, 2, 'd:north')).toBe('pop');
  });

  it('returning to an already-logged slot truncates forward entries rather than appending a duplicate/evicting the still-needed predecessor', () => {
    // Model the AC5.3 log shape directly: after City->Direction->Area (two
    // pushes, slots 0/1/2) and one POP back to slot 1 (Direction), the log
    // must read back exactly [root, direction] — never grow past its true
    // history depth, and never have evicted 'root' before the second Back
    // needs it.
    const log: HistoryAdjacencyEntry[] = [
      { historyIndex: 0, nodeKey: 'root' },
      { historyIndex: 1, nodeKey: 'd:north' },
      { historyIndex: 2, nodeKey: 'a:whitefield' },
    ];

    const historyIndex = 1;
    const currentNodeKey = 'd:north';
    const matchIndex = log.findIndex((entry) => entry.historyIndex === historyIndex);
    expect(matchIndex).toBe(1);
    log.splice(matchIndex + 1);
    log[matchIndex] = { historyIndex, nodeKey: currentNodeKey };

    expect(log).toEqual([
      { historyIndex: 0, nodeKey: 'root' },
      { historyIndex: 1, nodeKey: 'd:north' },
    ]);

    // The second Back now correctly proves adjacency against 'root', which
    // survived because truncation — not a fixed 2-entry cap — governs
    // eviction.
    expect(decideHierarchyBackMechanism(log, 1, 'root')).toBe('pop');
  });

  it('the SAME canonical node occupying a DIFFERENT (non-adjacent) history slot gets its own distinct log entry, and a repeated nodeKey several slots back is NOT usable as adjacency proof', () => {
    const log: HistoryAdjacencyEntry[] = [
      { historyIndex: 0, nodeKey: 'd:north' },
      { historyIndex: 5, nodeKey: 'd:south' },
    ];
    const historyIndex = 10; // a cold/non-adjacent REPLACE landing back on 'd:north' at a brand new slot
    const matchIndex = log.findIndex((entry) => entry.historyIndex === historyIndex);
    expect(matchIndex).toBe(-1);
    log.push({ historyIndex, nodeKey: 'd:north' });

    expect(log).toEqual([
      { historyIndex: 0, nodeKey: 'd:north' },
      { historyIndex: 5, nodeKey: 'd:south' },
      { historyIndex: 10, nodeKey: 'd:north' },
    ]);
    // 'd:north' appears at slot 0, but the entry IMMEDIATELY preceding the
    // current slot (10) is slot 5 ('d:south'), which does not match — a
    // guard that inferred adjacency from a repeated node key would wrongly
    // POP here; the corrected model correctly REPLACEs.
    expect(decideHierarchyBackMechanism(log, historyIndex, 'd:north')).toBe('replace');
  });

  it('a same-slot guard REPLACE to a genuinely DIFFERENT node updates the entry in place, never leaving a stale nodeKey behind', () => {
    const log: HistoryAdjacencyEntry[] = [
      { historyIndex: 0, nodeKey: 'root' },
      { historyIndex: 1, nodeKey: 'd:north' },
    ];
    const historyIndex = 1;
    const matchIndex = log.findIndex((entry) => entry.historyIndex === historyIndex);
    log.splice(matchIndex + 1);
    log[matchIndex] = { historyIndex, nodeKey: 'd:south' };

    expect(log).toEqual([
      { historyIndex: 0, nodeKey: 'root' },
      { historyIndex: 1, nodeKey: 'd:south' },
    ]);
  });
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname + location.search}</div>;
}

interface HarnessProps {
  node: NavigationNodeResponse | null;
  buildHref: (nodeKey: string) => string | null;
  navigateRef: { current: ReturnType<typeof useNavigate> | null };
  /**
   * Fix-verify cycle 3 — a changing key forces `HierarchyBackButton` to
   * unmount/remount, reproducing `DiscoverAreasJourneyPanel`'s real
   * loading-branch behaviour (see module doc). Defaults to a stable value so
   * the pre-cycle-3 tests below (which never force a remount) are unaffected.
   */
  backButtonKey?: string;
}

/**
 * Threads a captured `navigate` out to the test so it can simulate real app
 * navigations. Owns the history-adjacency log itself via
 * `useHierarchyBackAdjacencyLog` — the SAME hook `useAreasNavigationJourney`
 * calls internally — so this Harness plays the role of the stable
 * `useAreasNavigationJourney` instance in `MapDiscovery.tsx`: it survives
 * `HierarchyBackButton` unmounting/remounting below it, exactly like the real
 * app (fix-verify cycle 3). The log itself now keys identity off
 * `window.history.state.idx` (fix-verify cycle 4), which tests drive
 * explicitly alongside each simulated `navigate()` call — see the module doc.
 */
function Harness({ node, buildHref, navigateRef, backButtonKey = 'stable' }: HarnessProps) {
  const navigate = useNavigate();
  navigateRef.current = navigate;
  const historyAdjacencyLog = useHierarchyBackAdjacencyLog(node);
  return (
    <>
      <LocationProbe />
      <HierarchyBackButton key={backButtonKey} node={node} buildHref={buildHref} historyAdjacencyLog={historyAdjacencyLog} />
    </>
  );
}

describe('guarded conditional POP — component wiring (hierarchy_back_guarded_pop ruling)', () => {
  it('a proven-adjacent child->Back does not destroy the child entry; Forward still restores it (MemoryRouter is JSDOM-visible, but this is NOT a real-browser window.history proof — see module doc)', () => {
    const directionNode = makeNode({
      nodeKey: 'd:north',
      nodeType: 'DIRECTION',
      displayLabel: 'North Bangalore',
      ancestry: [{ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 }],
    });
    const areaNode = makeNode({}); // Whitefield, parent d:north

    const buildHref = vi.fn((k: string) => `?node=${k}`);
    const navigateRef: HarnessProps['navigateRef'] = { current: null };

    window.history.replaceState({ idx: 0 }, '', '/discover?node=d:north');

    const { rerender } = render(
      <MemoryRouter initialEntries={['/discover?node=d:north']}>
        <Harness node={directionNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=d:north');

    // Simulate the real app: goToNode PUSHes to the Area's URL immediately
    // (slot 0 -> slot 1)...
    act(() => {
      navigateRef.current?.('/discover?node=a:whitefield');
    });
    window.history.replaceState({ idx: 1 }, '', '/discover?node=a:whitefield');
    // ...then, once resolve/counts settle (an async gap), the journey hook's
    // `node` becomes Area — the SAME location, a later `node` prop update.
    rerender(
      <MemoryRouter initialEntries={['/discover?node=d:north']}>
        <Harness node={areaNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );

    const link = screen.getByTestId('areas-hierarchy-back');
    expect(link).toHaveAttribute('aria-label', 'Back to North Bangalore');

    fireEvent.click(link);

    // A proven POP lands on Direction's ORIGINAL entry...
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=d:north');

    // ...and — unlike a REPLACE — leaves the child's entry intact for Forward.
    act(() => {
      navigateRef.current?.(1);
    });
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=a:whitefield');
  });

  it('fix-verify cycle 4 (regression) — an async same-slot camera-fit REPLACE does not corrupt the guard: Back still POPs and Forward still restores the child', () => {
    // This is the exact defect this cycle fixes: a delayed, same-slot
    // camera-fit REPLACE for BOTH the Direction and the Area hop, each
    // mirrored here by a MemoryRouter `replace` navigation (which always
    // mints a fresh `location.key`) paired with a `window.history` update
    // that leaves the SLOT (`idx`) unchanged — proving the log does not
    // duplicate either entry, so the guard still POPs correctly afterward.
    const directionNode = makeNode({
      nodeKey: 'd:north',
      nodeType: 'DIRECTION',
      displayLabel: 'North Bangalore',
      ancestry: [{ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 }],
    });
    const areaNode = makeNode({}); // Whitefield, parent d:north

    const buildHref = vi.fn((k: string) => `?node=${k}`);
    const navigateRef: HarnessProps['navigateRef'] = { current: null };

    window.history.replaceState({ idx: 0 }, '', '/discover?node=d:north');

    const { rerender } = render(
      <MemoryRouter initialEntries={['/discover?node=d:north']}>
        <Harness node={directionNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=d:north');

    // Delayed camera-fit REPLACE for Direction itself: same slot (0), new
    // location.key. Must not push a second entry for slot 0.
    act(() => {
      navigateRef.current?.('/discover?node=d:north', { replace: true });
    });
    window.history.replaceState({ idx: 0 }, '', '/discover?node=d:north');
    rerender(
      <MemoryRouter initialEntries={['/discover?node=d:north']}>
        <Harness node={directionNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );

    // goToNode PUSHes to the Area URL immediately (slot 0 -> slot 1)...
    act(() => {
      navigateRef.current?.('/discover?node=a:whitefield');
    });
    window.history.replaceState({ idx: 1 }, '', '/discover?node=a:whitefield');
    rerender(
      <MemoryRouter initialEntries={['/discover?node=d:north']}>
        <Harness node={areaNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );

    // ...then, ~650-900ms later in the real app, the delayed camera-fit
    // REPLACE fires for Area: same slot (1), new location.key.
    act(() => {
      navigateRef.current?.('/discover?node=a:whitefield', { replace: true });
    });
    window.history.replaceState({ idx: 1 }, '', '/discover?node=a:whitefield');
    rerender(
      <MemoryRouter initialEntries={['/discover?node=d:north']}>
        <Harness node={areaNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );

    const link = screen.getByTestId('areas-hierarchy-back');
    expect(link).toHaveAttribute('aria-label', 'Back to North Bangalore');

    fireEvent.click(link);

    // A proven POP lands on Direction's ORIGINAL entry — this fails if the
    // same-slot REPLACEs above corrupted the log into duplicate entries
    // (the parent lookup would then land on the wrong/duplicate entry and
    // fall back to REPLACE, per the real defect this cycle fixes).
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=d:north');

    // ...and Forward still restores Area, proving the POP did not destroy
    // the child's own (correctly de-duplicated) entry either.
    act(() => {
      navigateRef.current?.(1);
    });
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=a:whitefield');
  });

  it('an unproven guard (cold-loaded Area, no logged predecessor at this slot) REPLACEs instead of popping — Forward cannot restore anything, because nothing was pushed for it to restore', () => {
    const areaNode = makeNode({});
    const buildHref = vi.fn((k: string) => `?node=${k}`);
    const navigateRef: HarnessProps['navigateRef'] = { current: null };

    // A cold page load is not necessarily slot 0 — simulate landing several
    // slots deep from unrelated prior browsing.
    window.history.replaceState({ idx: 7 }, '', '/discover?node=a:whitefield');

    render(
      <MemoryRouter initialEntries={['/discover?node=a:whitefield']}>
        <Harness node={areaNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId('areas-hierarchy-back'));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=d:north');

    // No child entry was ever pushed for this cold load, so Forward is a
    // genuine no-op — nothing to restore, unlike the guarded-POP case above.
    act(() => {
      navigateRef.current?.(1);
    });
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=d:north');
  });

  it('AC5.3 — TWO CONSECUTIVE Back presses: City -> Direction -> Area (2 pushes), Back to Direction, Back AGAIN to City — both POP, not just the first', () => {
    const cityNode = makeNode({
      nodeKey: 'root',
      nodeType: 'ROOT',
      displayLabel: 'Bangalore',
      ancestry: [],
    });
    const directionNode = makeNode({
      nodeKey: 'd:north',
      nodeType: 'DIRECTION',
      displayLabel: 'North Bangalore',
      ancestry: [{ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 }],
    });
    const areaNode = makeNode({}); // Whitefield, parent d:north

    const buildHref = vi.fn((k: string) => `?node=${k}`);
    const navigateRef: HarnessProps['navigateRef'] = { current: null };

    window.history.replaceState({ idx: 0 }, '', '/discover');

    // Mount at the city root, then drill in with two real PUSHes, letting the
    // resolved `node` follow each push (as the real app's URL-driven journey
    // hook would), so the adjacency log is built up exactly as it would be on
    // the real AC5.3 chain.
    const { rerender } = render(
      <MemoryRouter initialEntries={['/discover']}>
        <Harness node={cityNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );

    act(() => {
      navigateRef.current?.('/discover?node=d:north');
    });
    window.history.replaceState({ idx: 1 }, '', '/discover?node=d:north');
    rerender(
      <MemoryRouter initialEntries={['/discover']}>
        <Harness node={directionNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );

    act(() => {
      navigateRef.current?.('/discover?node=a:whitefield');
    });
    window.history.replaceState({ idx: 2 }, '', '/discover?node=a:whitefield');
    rerender(
      <MemoryRouter initialEntries={['/discover']}>
        <Harness node={areaNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=a:whitefield');

    // First Back: Area -> Direction. Must be a real POP (proven-adjacent). A
    // real browser's `window.history.state.idx` updates ATOMICALLY with the
    // popstate-driven re-render — pre-set it here (rather than after the
    // click) so the click's own synchronous re-render already observes the
    // new slot, exactly as it would in a real browser.
    window.history.replaceState({ idx: 1 }, '', '/discover?node=d:north');
    fireEvent.click(screen.getByTestId('areas-hierarchy-back'));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=d:north');

    // The real POP restores Direction's ORIGINAL history entry and creates no
    // new one — reflect that in the harness by handing back the Direction
    // node for this same (now-current) location, exactly as the real
    // URL-driven journey hook would resolve it.
    rerender(
      <MemoryRouter initialEntries={['/discover']}>
        <Harness node={directionNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );

    // Second Back, from the RESTORED Direction view: must ALSO be a POP, all
    // the way to City root — not a REPLACE that stamps a duplicate root entry
    // over Direction's slot (the defect fix-verify cycle 3 exists to fix).
    // Pre-set the slot for the same atomicity reason as the first Back above.
    window.history.replaceState({ idx: 0 }, '', '/discover');
    fireEvent.click(screen.getByTestId('areas-hierarchy-back'));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover');

    // Forward after the second Back must still restore Direction — proof
    // that the second Back was a genuine POP, not a REPLACE that clobbered
    // Direction's entry with a second root entry.
    act(() => {
      navigateRef.current?.(1);
    });
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=d:north');
  });

  it('AC5.4 — THREE consecutive Back presses: City -> Direction -> LocalDestination -> Area, each Back POPs one level', () => {
    const cityNode = makeNode({ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', ancestry: [] });
    const directionNode = makeNode({
      nodeKey: 'd:north',
      nodeType: 'DIRECTION',
      displayLabel: 'North Bangalore',
      ancestry: [{ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 }],
    });
    const localDestNode = makeNode({
      nodeKey: 'c:north-cluster',
      nodeType: 'CLUSTER',
      displayLabel: 'Whitefield Belt',
      ancestry: [
        { nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 },
        { nodeKey: 'd:north', nodeType: 'DIRECTION', displayLabel: 'North Bangalore', displayOrder: 1 },
      ],
    });
    const areaNode = makeNode({
      ancestry: [
        { nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 },
        { nodeKey: 'd:north', nodeType: 'DIRECTION', displayLabel: 'North Bangalore', displayOrder: 1 },
        { nodeKey: 'c:north-cluster', nodeType: 'CLUSTER', displayLabel: 'Whitefield Belt', displayOrder: 2 },
      ],
    }); // parent is now the local destination, not d:north directly

    const buildHref = vi.fn((k: string) => `?node=${k}`);
    const navigateRef: HarnessProps['navigateRef'] = { current: null };

    window.history.replaceState({ idx: 0 }, '', '/discover');

    const { rerender } = render(
      <MemoryRouter initialEntries={['/discover']}>
        <Harness node={cityNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );

    act(() => {
      navigateRef.current?.('/discover?node=d:north');
    });
    window.history.replaceState({ idx: 1 }, '', '/discover?node=d:north');
    rerender(
      <MemoryRouter initialEntries={['/discover']}>
        <Harness node={directionNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );

    act(() => {
      navigateRef.current?.('/discover?node=c:north-cluster');
    });
    window.history.replaceState({ idx: 2 }, '', '/discover?node=c:north-cluster');
    rerender(
      <MemoryRouter initialEntries={['/discover']}>
        <Harness node={localDestNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );

    act(() => {
      navigateRef.current?.('/discover?node=a:whitefield');
    });
    window.history.replaceState({ idx: 3 }, '', '/discover?node=a:whitefield');
    rerender(
      <MemoryRouter initialEntries={['/discover']}>
        <Harness node={areaNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=a:whitefield');

    // Back #1: Area -> LocalDestination. Pre-set the target slot before the
    // click (not after) — a real browser's `window.history.state.idx`
    // updates atomically with the popstate-driven re-render, and the click's
    // own synchronous re-render (with the still-stale `areaNode` prop, for
    // one commit) must already observe the new slot for its log truncation
    // to land correctly.
    window.history.replaceState({ idx: 2 }, '', '/discover?node=c:north-cluster');
    fireEvent.click(screen.getByTestId('areas-hierarchy-back'));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=c:north-cluster');
    rerender(
      <MemoryRouter initialEntries={['/discover']}>
        <Harness node={localDestNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );

    // Back #2: LocalDestination -> Direction.
    window.history.replaceState({ idx: 1 }, '', '/discover?node=d:north');
    fireEvent.click(screen.getByTestId('areas-hierarchy-back'));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=d:north');
    rerender(
      <MemoryRouter initialEntries={['/discover']}>
        <Harness node={directionNode} buildHref={buildHref} navigateRef={navigateRef} />
      </MemoryRouter>,
    );

    // Back #3: Direction -> City root.
    window.history.replaceState({ idx: 0 }, '', '/discover');
    fireEvent.click(screen.getByTestId('areas-hierarchy-back'));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover');
  });

  it('fix-verify cycle 3 (regression) — the guard still POPs when HierarchyBackButton itself unmounts and remounts between the drill-down and the Back press', () => {
    // Reproduces the real defect: DiscoverAreasJourneyPanel's OWN
    // isLoading/isError/!node early-return branches never render
    // HierarchyBackButton, so every drill-down unmounts it for one commit
    // while the new node's resolve/counts fetch is in flight, then remounts
    // it fresh once resolved. A component-local ref reset to `[]` on that
    // remount and always chose REPLACE in the real browser. Here the log is
    // owned by `Harness` via `useHierarchyBackAdjacencyLog` — the same hook
    // `useAreasNavigationJourney` calls — and a CHANGING `backButtonKey`
    // forces `HierarchyBackButton` to unmount/remount between the push and
    // the Back press, exactly like the real loading-branch transition.
    const directionNode = makeNode({
      nodeKey: 'd:north',
      nodeType: 'DIRECTION',
      displayLabel: 'North Bangalore',
      ancestry: [{ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 }],
    });
    const areaNode = makeNode({}); // Whitefield, parent d:north

    const buildHref = vi.fn((k: string) => `?node=${k}`);
    const navigateRef: HarnessProps['navigateRef'] = { current: null };

    window.history.replaceState({ idx: 0 }, '', '/discover?node=d:north');

    const { rerender } = render(
      <MemoryRouter initialEntries={['/discover?node=d:north']}>
        <Harness node={directionNode} buildHref={buildHref} navigateRef={navigateRef} backButtonKey="direction" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=d:north');

    // goToNode PUSHes to the Area URL immediately...
    act(() => {
      navigateRef.current?.('/discover?node=a:whitefield');
    });
    window.history.replaceState({ idx: 1 }, '', '/discover?node=a:whitefield');
    // ...then, once resolve/counts settle, `node` becomes Area for this same
    // location — AND `backButtonKey` changes, forcing HierarchyBackButton to
    // unmount and remount, exactly as DiscoverAreasJourneyPanel's own
    // loading-branch transition does in the real app. `Harness` (the stable
    // journey-owner stand-in) is NOT remounted — only the button is.
    rerender(
      <MemoryRouter initialEntries={['/discover?node=d:north']}>
        <Harness node={areaNode} buildHref={buildHref} navigateRef={navigateRef} backButtonKey="area" />
      </MemoryRouter>,
    );

    const link = screen.getByTestId('areas-hierarchy-back');
    expect(link).toHaveAttribute('aria-label', 'Back to North Bangalore');

    fireEvent.click(link);

    // A proven POP lands on Direction's ORIGINAL entry...
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=d:north');

    // ...and, unlike a REPLACE, leaves the child's entry intact for Forward —
    // this is the assertion that fails against the pre-fix component-local
    // ref (Forward would be a no-op there, since nothing was ever pushed for
    // it to restore).
    act(() => {
      navigateRef.current?.(1);
    });
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/discover?node=a:whitefield');
  });
});
