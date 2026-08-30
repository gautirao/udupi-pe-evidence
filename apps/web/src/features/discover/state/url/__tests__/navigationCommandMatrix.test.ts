/**
 * Navigation command → history-effect MATRIX — Issue #1956 PR 2 (pass 1).
 *
 * This file's job is to make an INVISIBLE property falsifiable before any UI
 * exists to make it visible. The property is:
 *
 *   ONE domain action performs EXACTLY ONE `setUrlParams` invocation — or ZERO
 *   for a genuine no-op — and NEVER TWO.
 *
 * ── WHY THE COUNT COLUMN IS THE POINT ──
 * `setUrlParams` is react-router's `setSearchParams`, which NAVIGATES
 * synchronously on every invocation. Two domain writes in one handler are two
 * history entries in one tick, and the second updater's `prev` may not observe
 * the first. Both failure modes have ALREADY been observed in this exact area:
 * the salvage worktree's notes record a "D-2 sibling sweep" and a breadcrumb
 * crumb that pushed twice, so "the user had to press Back twice to undo one
 * click". Neither is visible in a delta-only assertion — the FINAL URL is
 * identical whether it took one write or two. Only the count catches it.
 *
 * That is also why `enterAreasJourney` exists at all: entering the canonical
 * Areas journey means writing `journey` AND `node`, and `setJourney`
 * (state/url/area.ts) is itself a PUSH — so composing the two would be two
 * entries for one click. Row `enter-journey-atomic` pins that it is one.
 *
 * ── HOW ──
 * A COUNTING SPY stands in for `setUrlParams`. It records every invocation with
 * its `{ replace }` flag and applies the functional updater to the current
 * params, so the resulting delta is observable per call. The domain hooks are
 * exercised directly against a hand-built `UrlDomainCtx` rather than through the
 * router: a real router coalesces and re-renders, which is exactly the
 * observability the count column needs to not have.
 *
 * Each row asserts all four of: invocation COUNT, the `{ replace }` flag, the
 * exact resulting `URLSearchParams` delta, and the state of the pending viewport
 * debounce timer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { UrlDebounceTimers, UrlDomainCtx } from '../_shared';
import {
  useNavigationUrlDomain,
  buildNodeHrefFromParams,
  isWritableNodeKey,
  MAX_NODE_KEY_BYTES,
} from '../navigation';
import { useViewportUrlDomain } from '../viewport';
import { useAreaUrlDomain } from '../area';

// ── Real node keys, taken from the server's own grammar ──────────────────────
// apps/api/.../navigation/NavigationKeys.java: `a:` + area_key, `d:` + slug(region_key),
// `c:` + slug + ':' + slug; NavigationController.ROOT_NODE_KEY = 'root'.
// The AREA key is a REAL V106-seeded Bangalore area_key: pipe-delimited, mixed
// case, and (for multi-word localities) containing spaces.
const ROOT_KEY = 'root';
const DIRECTION_KEY = 'd:north';
const AREA_KEY = 'a:IN|KA|Bengaluru|Whitefield';
const AREA_KEY_WITH_SPACE = 'a:IN|KA|Bengaluru|Electronic City';
const CLUSTER_KEY = 'c:north:hebbal-kempapura';

// ── Counting spy over setUrlParams ───────────────────────────────────────────

interface RecordedCall {
  replace: boolean | undefined;
  params: URLSearchParams;
}

interface Harness {
  ctx: UrlDomainCtx;
  calls: RecordedCall[];
  timers: UrlDebounceTimers;
  /** The params as they stand after every recorded call has been applied. */
  currentParams: () => URLSearchParams;
}

function timerRef(): MutableRefObject<ReturnType<typeof setTimeout> | null> {
  return { current: null };
}

function makeHarness(initialSearch: string): Harness {
  let params = new URLSearchParams(initialSearch);
  const calls: RecordedCall[] = [];

  const timers: UrlDebounceTimers = {
    viewport: timerRef(),
    filtersLive: timerRef(),
    search: timerRef(),
  };

  // Matches react-router's SetURLSearchParams contract: a value or a functional
  // updater, plus NavigateOptions. Every domain in this facade uses the
  // functional form; the value form is handled for completeness.
  const setUrlParams = vi.fn((nextInit: unknown, navigateOpts?: { replace?: boolean }) => {
    const next =
      typeof nextInit === 'function'
        ? (nextInit as (prev: URLSearchParams) => URLSearchParams)(new URLSearchParams(params))
        : new URLSearchParams(nextInit as string);
    params = new URLSearchParams(next);
    calls.push({ replace: navigateOpts?.replace, params: new URLSearchParams(next) });
  });

  const ctx: UrlDomainCtx = {
    urlParams: new URLSearchParams(initialSearch),
    // The spy is structurally compatible with SetURLSearchParams; the cast is
    // confined to this test harness and never reaches production code.
    setUrlParams: setUrlParams as unknown as UrlDomainCtx['setUrlParams'],
    timers,
    // No domain under test touches the query client; a null stand-in keeps the
    // harness free of a TanStack provider.
    queryClient: null as unknown as QueryClient,
    reads: { city: 'bangalore' },
    // Issue #2083 RC_A part 2 — mirrors the facade's "always-current" ref.
    // Starts equal to `urlParams`; a test that wants to exercise the
    // stale-`prev`-vs-live-params distinction mutates this directly (see the
    // AC5 test below), the same way a real navigation would update it on the
    // facade's next render.
    liveUrlParamsRef: { current: new URLSearchParams(initialSearch) },
  };

  return { ctx, calls, timers, currentParams: () => new URLSearchParams(params) };
}

/** Sorted `key=value` pairs — a stable, order-independent view of a param set. */
function entriesOf(p: URLSearchParams): string[] {
  return [...p.entries()].map(([k, v]) => `${k}=${v}`).sort();
}

/** The exact delta between two param sets, as explicit added/removed lists. */
function deltaOf(before: URLSearchParams, after: URLSearchParams) {
  const b = new Set(entriesOf(before));
  const a = new Set(entriesOf(after));
  return {
    added: [...a].filter((e) => !b.has(e)).sort(),
    removed: [...b].filter((e) => !a.has(e)).sort(),
  };
}

/** Arms a fake viewport debounce so "was it cancelled?" is observable. */
function armViewportTimer(timers: UrlDebounceTimers): void {
  timers.viewport.current = setTimeout(() => {
    throw new Error('the armed viewport debounce fired — it should have been cancelled');
  }, 10_000);
}

// ── The matrix ───────────────────────────────────────────────────────────────

/**
 * A starting URL that carries a viewport AND a stale agri `listing` peek, so
 * every row's delta shows whether those were dropped.
 */
const START =
  'city=bangalore&journey=area-first&areasPreview=1&node=d%3Anorth' +
  '&lat=12.97&lon=77.59&zoom=13&listing=abc-123&type=house';

/** Same as START but with no `node=` — see the differential describe block. */
const DIFFERENTIAL_START =
  'city=bangalore&journey=area-first&areasPreview=1' +
  '&lat=12.97&lon=77.59&zoom=13&listing=abc-123&type=house';

interface MatrixRow {
  id: string;
  /** Starting query string for this row. */
  start: string;
  /** Performs the ONE domain action under test. */
  invoke: (h: Harness) => void;
  /** How many `setUrlParams` invocations this action may perform. NEVER 2. */
  expectedCalls: number;
  /** The `{ replace }` flag on that invocation. Undefined when there is none. */
  expectedReplace?: boolean;
  expectedAdded?: string[];
  expectedRemoved?: string[];
  /**
   * Whether a viewport debounce armed before the action is cancelled by it.
   * FALSE is a real, documented behaviour for two rows, not an omission — see
   * the per-row note.
   */
  cancelsViewportTimer: boolean;
  note?: string;
}

function renderNavigation(h: Harness) {
  return renderHook(() => useNavigationUrlDomain(h.ctx)).result;
}

const ROWS: MatrixRow[] = [
  {
    id: 'goToChild(direction) — City root → DIRECTION, the live Bangalore level 0',
    start: 'city=bangalore&node=root&lat=12.97&lon=77.59&zoom=11&listing=abc-123',
    invoke: (h) => renderNavigation(h).current.actions.goToNode(DIRECTION_KEY),
    expectedCalls: 1,
    expectedReplace: false,
    expectedAdded: [`node=${DIRECTION_KEY}`],
    expectedRemoved: ['lat=12.97', 'listing=abc-123', 'lon=77.59', 'node=root', 'zoom=11'],
    cancelsViewportTimer: true,
    note:
      'REGRESSION GUARD for the salvage defect: its key validator accepted only ' +
      '`root`/`a:`/`c:`, so a `d:` Direction key was "malformed" and the write ' +
      'SILENTLY DELETED node=. Live Bangalore is City → DIRECTION → AREA, so that ' +
      'would have broken every first click of this journey.',
  },
  {
    id: 'goToNodeReplacingCurrent(direction) — Issue #1943 singleton auto-advance: SAME delta as goToNode, but REPLACE',
    start: 'city=bangalore&node=root&lat=12.97&lon=77.59&zoom=11&listing=abc-123',
    invoke: (h) => renderNavigation(h).current.actions.goToNodeReplacingCurrent(DIRECTION_KEY),
    expectedCalls: 1,
    expectedReplace: true,
    expectedAdded: [`node=${DIRECTION_KEY}`],
    expectedRemoved: ['lat=12.97', 'listing=abc-123', 'lon=77.59', 'node=root', 'zoom=11'],
    cancelsViewportTimer: true,
    note:
      'PR #2368 owner ruling (2026-08-28) — the automatic transition fired when ' +
      'the current rendered state resolves to a singleton must REPLACE, never ' +
      'PUSH: that state was never a destination the user chose, so it must not ' +
      'occupy its own history slot (a PUSH would let Back land back on it and ' +
      'immediately auto-re-advance forward again). Byte-identical delta to ' +
      "goToChild(direction) above — same applyNodeDelta, only the history mode " +
      'differs.',
  },
  {
    id: 'goToNodeReplacingCurrent(sameNodeAsCurrent) — ZERO writes, same no-op guard as goToNode',
    start: START,
    invoke: (h) => renderNavigation(h).current.actions.goToNodeReplacingCurrent(DIRECTION_KEY),
    expectedCalls: 0,
    cancelsViewportTimer: true,
  },
  {
    id: 'goToChild(area) — DIRECTION → AREA, the live level 1',
    start: START,
    invoke: (h) => renderNavigation(h).current.actions.goToNode(AREA_KEY),
    expectedCalls: 1,
    expectedReplace: false,
    expectedAdded: [`node=${AREA_KEY}`],
    expectedRemoved: ['lat=12.97', 'listing=abc-123', 'lon=77.59', 'node=d:north', 'zoom=13'],
    cancelsViewportTimer: true,
  },
  {
    id: 'goToAncestor(parent) — AREA crumb → its DIRECTION parent',
    start: `city=bangalore&journey=area-first&node=${encodeURIComponent(AREA_KEY)}&lat=12.97&lon=77.59&zoom=15`,
    invoke: (h) => renderNavigation(h).current.actions.goToAncestorNode(DIRECTION_KEY),
    expectedCalls: 1,
    expectedReplace: false,
    expectedAdded: [`node=${DIRECTION_KEY}`],
    expectedRemoved: ['lat=12.97', 'lon=77.59', `node=${AREA_KEY}`, 'zoom=15'],
    cancelsViewportTimer: true,
  },
  {
    id: 'goToAncestor(city-root) — writes node=root, does NOT delete the param',
    start: START,
    invoke: (h) => renderNavigation(h).current.actions.goToAncestorNode(ROOT_KEY),
    expectedCalls: 1,
    expectedReplace: false,
    expectedAdded: ['node=root'],
    expectedRemoved: ['lat=12.97', 'listing=abc-123', 'lon=77.59', 'node=d:north', 'zoom=13'],
    cancelsViewportTimer: true,
    note:
      "'root' is a REAL server key (NavigationController.ROOT_NODE_KEY), not an " +
      'absence. Deleting the param instead would lose the distinction between ' +
      '"at the city top level" and "not in the hierarchy at all".',
  },
  {
    id: 'reset() — clearNode drops the cursor entirely',
    start: START,
    invoke: (h) => renderNavigation(h).current.actions.clearNode(),
    expectedCalls: 1,
    expectedReplace: false,
    expectedAdded: [],
    expectedRemoved: ['lat=12.97', 'listing=abc-123', 'lon=77.59', 'node=d:north', 'zoom=13'],
    cancelsViewportTimer: true,
  },
  {
    id: 'goToNode(sameNodeAsCurrent) — ZERO writes, but the race defence STILL runs',
    start: START,
    invoke: (h) => renderNavigation(h).current.actions.goToNode(DIRECTION_KEY),
    expectedCalls: 0,
    cancelsViewportTimer: true,
    note:
      'The count here is 0, not 1: re-pushing an identical node= is ' +
      "indistinguishable from history's perspective from a second navigation, so " +
      'it would cost the user a second Back press for one click. The timer ' +
      'cancellation is deliberately HOISTED ABOVE the no-op guard — a debounce ' +
      'armed by a pan just before the re-click must not land afterwards.',
  },
  {
    id: 'enter-journey-atomic — enterAreasJourney writes journey AND node in ONE push',
    start: 'city=bangalore&lat=12.97&lon=77.59&zoom=11&listing=abc-123',
    invoke: (h) => renderNavigation(h).current.actions.enterAreasJourney(DIRECTION_KEY),
    expectedCalls: 1,
    expectedReplace: false,
    expectedAdded: ['journey=area-first', `node=${DIRECTION_KEY}`],
    expectedRemoved: ['lat=12.97', 'listing=abc-123', 'lon=77.59', 'zoom=11'],
    cancelsViewportTimer: true,
    note:
      'THE reason this action exists. Composing setJourney (a PUSH, area.ts) with ' +
      'a node write would be TWO synchronous navigations in one tick: two history ' +
      'entries for one click, and the second updater may not observe the first.',
  },
  {
    id: "setJourney('area-first') — one PUSH, and does NOT cancel the viewport debounce",
    start: 'city=bangalore',
    invoke: (h) => renderHook(() => useAreaUrlDomain(h.ctx)).result.current.actions.setJourney('area-first'),
    expectedCalls: 1,
    expectedReplace: false,
    expectedAdded: ['journey=area-first'],
    expectedRemoved: [],
    cancelsViewportTimer: false,
    note:
      'Pre-existing, deliberate behaviour (area.ts): a journey switch is not a ' +
      'camera move, so it preserves the viewport and therefore has no reason to ' +
      'cancel a pending commit. Recorded here as FALSE rather than omitted, so the ' +
      "contrast with enterAreasJourney's TRUE is explicit rather than accidental.",
  },
  {
    id: 'reportViewport() — one debounced REPLACE, never a push',
    start: 'city=bangalore&node=d%3Anorth',
    invoke: (h) => {
      renderHook(() => useViewportUrlDomain(h.ctx)).result.current.actions.reportViewport({
        lat: 12.9716,
        lon: 77.5946,
        zoom: 13,
      });
      vi.advanceTimersByTime(300);
    },
    expectedCalls: 1,
    expectedReplace: true,
    expectedAdded: ['lat=12.97160', 'lon=77.59460', 'zoom=13'],
    expectedRemoved: [],
    cancelsViewportTimer: false,
    note:
      'The viewport is bookmarkable but is NOT a history destination — a pan must ' +
      'never cost a Back press. This row also arms and CONSUMES its own timer ' +
      '(that is the action under test), so "cancelled" is not the right question.',
  },
];

// ── Issue #1956 PR 2 (Slice 5) additions ─────────────────────────────────────
//
// AC5.5/AC5.10/AC5.11 extensions. The Slice 5 HierarchyBackButton control
// itself uses `<Link replace>` (a react-router navigation, never a bare
// `setUrlParams`/`window.history` call — see its own component test suite),
// so it has no row here. What DOES belong in this matrix is the underlying
// domain-action behaviour Slice 5 depends on: goToAncestorNode's existing
// no-op guard also covers ancestor jumps (not just goToNode), a cold harness
// with NO prior history still produces the correct single write (AC5.5), and
// the camera/pan write path (reportViewport) never touches `node=` at all
// (AC5.11 — programmatic camera fits and ordinary panning must create NO
// hierarchy history effect).
describe('#1956 PR 2 (Slice 5) — goToAncestorNode shares the same loop-prevention guard as goToNode', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('goToAncestorNode(sameNodeAsCurrent) — ZERO writes (AC5.10 duplicate-history-churn guard also covers ancestor jumps)', () => {
    const h = makeHarness(START); // START carries node=d:north
    armViewportTimer(h.timers);

    renderNavigation(h).current.actions.goToAncestorNode(DIRECTION_KEY);

    expect(h.calls.length, 'no-op: the target IS the already-active node').toBe(0);
    expect(h.timers.viewport.current, 'the race defence still runs on the no-op path').toBeNull();
  });
});

describe('#1956 PR 2 (Slice 5) — cold-deep-link convergence needs no prior history (AC5.5/AC5.6)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('a harness built from a single fresh AREA deep link (no prior node= transition) still writes the correct ancestor exactly once', () => {
    // "Cold" here means the harness starts directly at this URL — there is no
    // simulated prior navigation for goToAncestorNode to have been primed by.
    // A direct-search/cold-loaded AREA (AC5.5) resolves its parent from the
    // SERVER's ancestry, not from anything this harness remembers — this row
    // proves the write itself has no such dependency either.
    const h = makeHarness(
      `city=bangalore&journey=area-first&node=${encodeURIComponent(AREA_KEY)}&lat=12.97&lon=77.59&zoom=16`,
    );
    renderNavigation(h).current.actions.goToAncestorNode(DIRECTION_KEY);

    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].replace).toBe(false);
    expect(deltaOf(new URLSearchParams(h.ctx.urlParams), h.calls[0].params)).toEqual({
      added: [`node=${DIRECTION_KEY}`],
      removed: ['lat=12.97', 'lon=77.59', `node=${AREA_KEY}`, 'zoom=16'],
    });
  });

  it('refreshing (a brand-new harness at the SAME URL) computes the identical destination (AC5.6)', () => {
    const url = `city=bangalore&journey=area-first&node=${encodeURIComponent(AREA_KEY)}`;
    const first = makeHarness(url);
    renderNavigation(first).current.actions.goToAncestorNode(DIRECTION_KEY);

    const afterRefresh = makeHarness(url);
    renderNavigation(afterRefresh).current.actions.goToAncestorNode(DIRECTION_KEY);

    expect(first.calls[0].params.get('node')).toBe(afterRefresh.calls[0].params.get('node'));
    expect(afterRefresh.calls[0].params.get('node')).toBe(DIRECTION_KEY);
  });
});

describe('#1956 PR 2 (Slice 5) — camera/pan writes never touch node= (AC5.11)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('reportViewport (ordinary panning) leaves an existing node= completely untouched', () => {
    const h = makeHarness(`city=bangalore&node=${encodeURIComponent(DIRECTION_KEY)}`);
    renderHook(() => useViewportUrlDomain(h.ctx)).result.current.actions.reportViewport({
      lat: 12.9716,
      lon: 77.5946,
      zoom: 14,
    });
    vi.advanceTimersByTime(300);

    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].params.get('node')).toBe(DIRECTION_KEY);
    const delta = deltaOf(new URLSearchParams(`city=bangalore&node=${encodeURIComponent(DIRECTION_KEY)}`), h.calls[0].params);
    expect(delta.added.some((e) => e.startsWith('node='))).toBe(false);
    expect(delta.removed.some((e) => e.startsWith('node='))).toBe(false);
  });

  it('reportViewport never PUSHes — a pan/camera move creates no hierarchy history entry', () => {
    const h = makeHarness(`city=bangalore&node=${encodeURIComponent(DIRECTION_KEY)}`);
    renderHook(() => useViewportUrlDomain(h.ctx)).result.current.actions.reportViewport({
      lat: 1,
      lon: 2,
      zoom: 5,
    });
    vi.advanceTimersByTime(300);
    expect(h.calls[0].replace, 'viewport commits REPLACE — never a PUSH history entry').toBe(true);
  });
});

describe('#2083 RC_A part 2 — reportViewport flush reads LIVE params, never a stale `prev` closure (AC5)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('a param cleared AFTER the debounce is armed but BEFORE it flushes does not reappear', () => {
    const h = makeHarness('city=bangalore&node=d%3Anorth&type=house');
    renderHook(() => useViewportUrlDomain(h.ctx)).result.current.actions.reportViewport({
      lat: 12.9716,
      lon: 77.5946,
      zoom: 13,
    });

    // Simulates a real navigation landing on the URL BETWEEN scheduling and
    // flush — e.g. the user cleared the `type` filter. In react-router-dom
    // 6.30.1 this changes what the CLOSED-OVER `prev` (from the render that
    // produced this ctx's `setUrlParams` identity) would see vs. what is
    // actually live; `liveUrlParamsRef` is what the facade keeps current on
    // every render, so mutating it here is the correct simulation, not a
    // synthetic shortcut.
    h.ctx.liveUrlParamsRef.current = new URLSearchParams('city=bangalore&node=d%3Anorth');

    vi.advanceTimersByTime(300);

    expect(h.calls).toHaveLength(1);
    // The flush must reflect the LIVE params (type= already gone) — a
    // stale-`prev` flush would resurrect it.
    expect(h.calls[0].params.has('type'), 'a cleared filter must not be revived by the flush').toBe(false);
    expect(h.calls[0].params.get('lat')).toBe('12.97160');
    expect(h.calls[0].params.get('node')).toBe('d:north');
  });
});

describe('#1956 PR 2 — navigation command → history-effect matrix', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each(ROWS)('$id', (row) => {
    const h = makeHarness(row.start);
    const before = new URLSearchParams(row.start);

    // Every row that is not itself the viewport action arms a debounce first, so
    // "was the pending commit cancelled?" is a real observation rather than a
    // vacuous null check.
    if (row.cancelsViewportTimer) {
      armViewportTimer(h.timers);
      expect(h.timers.viewport.current, 'precondition: a debounce is armed').not.toBeNull();
    }

    row.invoke(h);

    // ── COLUMN 1: invocation COUNT. Never 2. ──
    expect(h.calls.length, `${row.id}: expected exactly ${row.expectedCalls} setUrlParams call(s)`).toBe(
      row.expectedCalls,
    );
    expect(h.calls.length, 'two navigations in one tick is the bug this matrix exists to catch').not.toBe(2);

    if (row.expectedCalls > 0) {
      // ── COLUMN 2: the { replace } flag. ──
      expect(h.calls[0].replace).toBe(row.expectedReplace);

      // ── COLUMN 3: the exact resulting delta. ──
      expect(deltaOf(before, h.calls[0].params)).toEqual({
        added: row.expectedAdded,
        removed: row.expectedRemoved,
      });
    }

    // ── COLUMN 4: the pending viewport debounce. ──
    if (row.cancelsViewportTimer) {
      expect(h.timers.viewport.current, `${row.id}: the pending viewport commit must be cancelled`).toBeNull();
    }
  });

  it('the matrix is non-vacuous and covers every navigation command', () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(9);
    const ids = ROWS.map((r) => r.id).join('\n');
    for (const required of [
      'goToChild(direction)',
      'goToChild(area)',
      'goToAncestor(parent)',
      'goToAncestor(city-root)',
      'reset()',
      'goToNode(sameNodeAsCurrent)',
      'enter-journey-atomic',
      'setJourney',
      'reportViewport()',
    ]) {
      expect(ids, `matrix is missing a row for ${required}`).toContain(required);
    }
  });

  it('NO row performs two setUrlParams calls (the whole-matrix restatement)', () => {
    for (const row of ROWS) {
      const h = makeHarness(row.start);
      row.invoke(h);
      expect(h.calls.length, `${row.id} performed ${h.calls.length} calls`).toBeLessThanOrEqual(1);
    }
  });
});

// ── The differential assertion ───────────────────────────────────────────────

describe('#1956 PR 2 — buildNodeHref is byte-identical to what goToNode writes', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  /**
   * This is what makes the copy-link / middle-click / cmd-click affordance
   * PROVABLY the same as the click affordance. Without it the two paths are two
   * hand-maintained param deltas that drift the first time one of them learns to
   * drop a new param — and the failure is invisible in normal use, because a
   * left-click and a middle-click on the same crumb are rarely compared.
   */
  it.each([ROOT_KEY, DIRECTION_KEY, AREA_KEY, AREA_KEY_WITH_SPACE, CLUSTER_KEY])(
    'href for %s === the URL the write produces',
    (key) => {
      // DIFFERENTIAL_START deliberately carries NO `node=`, so no row here can
      // collide with writeNode's same-node no-op guard and produce zero writes.
      const h = makeHarness(DIFFERENTIAL_START);
      const hook = renderNavigation(h);

      const href = hook.current.actions.buildNodeHref(key);
      hook.current.actions.goToNode(key);

      expect(h.calls).toHaveLength(1);
      expect(href).toBe(`?${h.calls[0].params.toString()}`);
    },
  );

  it('buildNodeHrefFromParams is pure — it never invokes setUrlParams', () => {
    const h = makeHarness(DIFFERENTIAL_START);
    const href = buildNodeHrefFromParams(h.ctx.urlParams, AREA_KEY);
    expect(href).toContain('node=');
    expect(h.calls).toHaveLength(0);
  });

  it('returns null (render no link) rather than an href the resolve endpoint would 400 on', () => {
    const params = new URLSearchParams(START);
    expect(buildNodeHrefFromParams(params, '')).toBeNull();
    expect(buildNodeHrefFromParams(params, 'javascript:alert(1)')).toBeNull();
  });
});

// ── The node-key validator, against the server's real grammar ────────────────

describe('#1956 PR 2 — isWritableNodeKey mirrors the server key grammar', () => {
  it.each([
    ['root — NavigationController.ROOT_NODE_KEY', ROOT_KEY],
    ['DIRECTION — NavigationKeys.directionNodeKey, "d:" + slug(region_key)', DIRECTION_KEY],
    ['DIRECTION, live Bangalore central', 'd:central'],
    ['DIRECTION, live Bangalore single-letter slugs', 'd:n'],
    ['AREA — NavigationKeys.areaNodeKey, "a:" + area_key (pipes, mixed case)', AREA_KEY],
    ['AREA with a space — V106 seeds "IN|KA|Bengaluru|Electronic City"', AREA_KEY_WITH_SPACE],
    ["AREA with an apostrophe — real place names carry punctuation", "a:IN|KA|Bengaluru|St John's Road"],
    ['CLUSTER — NavigationKeys.clusterNodeKeyBase, "c:" + slug + ":" + slug', CLUSTER_KEY],
  ])('accepts %s', (_label, key) => {
    expect(isWritableNodeKey(key)).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['an unprefixed bare slug', 'north'],
    ['a legacy groupId — never a node key', 'whitefield-belt'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['an HTML fragment', '<img onerror=x>'],
    ['a path-traversal attempt behind a valid prefix', 'c:../../x'],
  ])('rejects %s', (_label, key) => {
    expect(isWritableNodeKey(key)).toBe(false);
  });

  it('rejects a control character embedded in an otherwise valid key', () => {
    // Built via fromCharCode rather than typed inline, so the character under
    // test survives editors, diffs and copy-paste intact.
    const withNul = `a:IN|KA|Bengaluru|Whit${String.fromCharCode(0)}efield`;
    const withNewline = `a:IN|KA|Bengaluru|Whit${String.fromCharCode(10)}efield`;
    expect(isWritableNodeKey(withNul)).toBe(false);
    expect(isWritableNodeKey(withNewline)).toBe(false);
  });

  it('caps at the backend MAX_RESOLVE_NODE_PARAM_BYTES, measured in UTF-8 BYTES not .length', () => {
    const atCap = `a:${'x'.repeat(MAX_NODE_KEY_BYTES - 2)}`;
    expect(atCap.length).toBe(MAX_NODE_KEY_BYTES);
    expect(isWritableNodeKey(atCap), 'an at-cap key is still writable — this is a cap, not a reject').toBe(
      true,
    );
    expect(isWritableNodeKey(`${atCap}x`)).toBe(false);

    // Short in UTF-16 code units, oversized in UTF-8 bytes. A `.length`-only
    // check would wrongly accept this; real area_keys carry Kannada/Devanagari
    // place names, so this is not a hypothetical input shape.
    const multiByte = `a:${'ಬ'.repeat(100)}`;
    expect(multiByte.length).toBeLessThan(MAX_NODE_KEY_BYTES);
    expect(isWritableNodeKey(multiByte)).toBe(false);
  });
});

// ── The read layer: validated vs raw ─────────────────────────────────────────

describe('#1956 PR 2 — rawNodeParam keeps "malformed node=" distinct from "no node="', () => {
  it('a malformed node= reads as null on `node` but is PRESENT on `rawNodeParam`', () => {
    const h = makeHarness('city=bangalore&node=totally-bogus');
    const state = renderNavigation(h).current.state;
    expect(state.node).toBeNull();
    expect(state.rawNodeParam).toBe('totally-bogus');
  });

  it('an absent node= is null on BOTH — the two cases are what must stay distinguishable', () => {
    const h = makeHarness('city=bangalore');
    const state = renderNavigation(h).current.state;
    expect(state.node).toBeNull();
    expect(state.rawNodeParam).toBeNull();
  });

  it('a whitespace-only node= is null on both (blank is blank, not malformed)', () => {
    const h = makeHarness('city=bangalore&node=%20%20');
    const state = renderNavigation(h).current.state;
    expect(state.node).toBeNull();
    expect(state.rawNodeParam).toBeNull();
  });

  it('a valid key reads identically on both', () => {
    const h = makeHarness(`city=bangalore&node=${encodeURIComponent(AREA_KEY)}`);
    const state = renderNavigation(h).current.state;
    expect(state.node).toBe(AREA_KEY);
    expect(state.rawNodeParam).toBe(AREA_KEY);
  });
});

// ── AC1.3 restated at the write layer ────────────────────────────────────────

type NavActions = ReturnType<typeof useNavigationUrlDomain>['actions'];

describe('#1956 PR 2 — AC1.3 holds: the new writers never touch areasPreview', () => {
  it.each<[string, (a: NavActions) => void]>([
    ['goToNode', (a) => a.goToNode(AREA_KEY)],
    ['goToAncestorNode', (a) => a.goToAncestorNode(ROOT_KEY)],
    ['clearNode', (a) => a.clearNode()],
    ['enterAreasJourney', (a) => a.enterAreasJourney(DIRECTION_KEY)],
  ])('%s carries an existing areasPreview through untouched, and never adds one', (_name, invoke) => {
    const withFlag = makeHarness(START);
    invoke(renderNavigation(withFlag).current.actions);
    expect(withFlag.currentParams().get('areasPreview')).toBe('1');

    const withoutFlag = makeHarness('city=bangalore&journey=area-first&node=root');
    invoke(renderNavigation(withoutFlag).current.actions);
    expect(withoutFlag.currentParams().has('areasPreview')).toBe(false);
  });
});
