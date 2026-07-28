/**
 * Issue #1956 PR 1 (FE-1) — derivePanelContent preview-gate NON-REGRESSION matrix.
 *
 * PR 1 builds the `node=` / `areasPreview=1` seam and the deployment preview
 * capability gate. It ships NO new UI and, critically, must not perturb panel
 * routing for a single existing entry point (AC1.1 / AC1.14).
 *
 * `derivePanelContent` is a pure function whose 15 panel states are resolved in
 * ORDER-DEPENDENT priority (agri-first branch first, then school-first, then
 * area-first, then the journey-less cold-load inferences). That ordering is the
 * real risk surface: anything inserted above the legacy area-first branch
 * silently reroutes every entry point below it. This matrix pins the ordering
 * from the outside.
 *
 * WHAT EVERY CELL ASSERTS — the same single thing: `derivePanelContent` returns
 * exactly the value it returns today, for every combination of
 *   • the deployment preview capability env var (enabled / disabled)
 *   • `areasPreview` (absent / true)
 *   • `node` (absent / canonical key / whitespace-only)
 *   • the five AC1.1 entry points (+ two adjacent-journey control cells)
 * i.e. NEITHER the new params NOR the capability flag changes routing in PR 1.
 *
 * Expectations are written out EXPLICITLY per entry point. They are deliberately
 * NOT computed by calling the function under test a second time, and deliberately
 * NOT snapshotted — a snapshot would silently re-baseline the exact regression
 * this file exists to catch.
 *
 * The capability dimension is expressed by stubbing the raw
 * `VITE_DISCOVER_AREAS_PREVIEW` env var rather than by importing the capability
 * module, so this file is valid both before and after the capability module
 * exists — it was authored and run GREEN as a baseline before any PR 1
 * production change landed.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { derivePanelContent } from '@/features/discover/utils/discoverPanelState';
import type { DiscoverPanelContent } from '@/features/discover/utils/discoverPanelState';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

/** Minimal legal DiscoverUrlState — every entry point below is a delta on this. */
function baseUrlState(): DiscoverUrlState {
  return {
    city: 'bangalore',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: null,
    groupId: null,
    selectedGroup: null,
    intent: 'buy',
    scope: null,
  };
}

/**
 * Applies the new-param deltas via Object.assign rather than an object literal
 * so this file compiles identically before and after `node` / `areasPreview`
 * are added to DiscoverUrlState (object-literal excess-property checking would
 * otherwise reject the pre-change form). No `as` cast is involved.
 */
function withParams(
  base: DiscoverUrlState,
  extra: Record<string, unknown>,
): DiscoverUrlState {
  return Object.assign({}, base, extra);
}

const CANONICAL_NODE_KEY = 'a:bangalore-whitefield';

interface EntryPoint {
  /** AC1.1 label */
  name: string;
  /** legacy param delta on top of baseUrlState() */
  state: Partial<DiscoverUrlState>;
  /** the value derivePanelContent returns TODAY — written out, never computed */
  expected: DiscoverPanelContent;
}

const ENTRY_POINTS: EntryPoint[] = [
  {
    // (a) plain ?city=bangalore&journey=area-first
    name: 'a/plain-area-first',
    state: { journey: 'area-first' },
    expected: 'area-groups-landing',
  },
  {
    // (b) direct area search — journey=area-first + areaKey resolved by search
    name: 'b/direct-area-search',
    state: { journey: 'area-first', areaKey: 'bangalore-whitefield' },
    expected: 'area-selected',
  },
  {
    // (c) ?areaKey= deep link with journey ABSENT
    //     (AreaCtaBlock / AreaGuide / AreaGuideHero producers)
    name: 'c/areaKey-deeplink-journeyless',
    state: { areaKey: 'bangalore-whitefield' },
    expected: 'area-selected',
  },
  {
    // (d) journey-less ?groupId=
    name: 'd/groupId-deeplink-journeyless',
    state: { groupId: 'whitefield-belt' },
    expected: 'area-groups-landing',
  },
  {
    // (e) adjacent-journey control — school-first
    name: 'e1/school-first-control',
    state: { journey: 'school-first' },
    expected: 'school-browse',
  },
  {
    // (e) adjacent-journey control — agri-first
    name: 'e2/agri-first-control',
    state: { journey: 'agri-first' },
    expected: 'agri-landing',
  },
];

const CAPABILITY_CELLS: { label: string; envValue: string | undefined }[] = [
  { label: 'capability ENABLED', envValue: '1' },
  { label: 'capability DISABLED', envValue: undefined },
];

const AREAS_PREVIEW_CELLS: { label: string; value: true | undefined }[] = [
  { label: 'areasPreview absent', value: undefined },
  { label: 'areasPreview=1', value: true },
];

const NODE_CELLS: { label: string; value: string | null }[] = [
  { label: 'node absent', value: null },
  { label: 'node canonical', value: CANONICAL_NODE_KEY },
  { label: 'node whitespace-only', value: '  ' },
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('derivePanelContent — #1956 PR 1 preview-gate non-regression matrix', () => {
  describe.each(CAPABILITY_CELLS)('$label', ({ envValue }) => {
    describe.each(AREAS_PREVIEW_CELLS)('$label', ({ value: areasPreview }) => {
      describe.each(NODE_CELLS)('$label', ({ value: node }) => {
        it.each(ENTRY_POINTS)(
          'routes $name to $expected, unchanged',
          ({ state, expected }) => {
            if (envValue === undefined) {
              vi.stubEnv('VITE_DISCOVER_AREAS_PREVIEW', '');
            } else {
              vi.stubEnv('VITE_DISCOVER_AREAS_PREVIEW', envValue);
            }

            const urlState = withParams({ ...baseUrlState(), ...state }, {
              node,
              areasPreview,
            });

            expect(derivePanelContent(urlState)).toBe(expected);
          },
        );
      });
    });
  });
});

/**
 * Whitespace discipline — the existing branches guard `groupId?.trim()`, and the
 * new `node` read must adopt the SAME discipline: a whitespace-only value is
 * treated exactly like an absent one and must not disturb priority order.
 * (The matrix above already covers the `node` half across all 24 combinations;
 * these cells pin the legacy guards they mirror so a future edit cannot relax
 * one side without the other going red.)
 */
describe('derivePanelContent — whitespace-only params are treated as absent', () => {
  it('whitespace-only groupId in school-first does NOT route to school-group-areas', () => {
    expect(
      derivePanelContent({ ...baseUrlState(), journey: 'school-first', groupId: '   ' }),
    ).toBe('school-browse');
  });

  it('whitespace-only groupId in area-first group-results does NOT route to area-group-results', () => {
    expect(
      derivePanelContent(
        withParams({ ...baseUrlState(), journey: 'area-first', groupId: '   ' }, {
          groupResults: true,
        }),
      ),
    ).toBe('area-groups-landing');
  });

  it('whitespace-only node is indistinguishable from an absent node for routing', () => {
    const absent = derivePanelContent(
      withParams({ ...baseUrlState(), journey: 'area-first' }, { node: null }),
    );
    const whitespace = derivePanelContent(
      withParams({ ...baseUrlState(), journey: 'area-first' }, { node: '   ' }),
    );
    // Both are pinned to the explicit legacy value, not to each other.
    expect(absent).toBe('area-groups-landing');
    expect(whitespace).toBe('area-groups-landing');
  });
});
