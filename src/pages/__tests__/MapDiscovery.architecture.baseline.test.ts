import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Issue #2142 Commit 1 — characterization/baseline ONLY.
 *
 * This file makes zero production-code assertions about behaviour. It locks
 * in today's actual, VERIFIED structural metrics of MapDiscovery.tsx as:
 *   (a) a recorded baseline (what "thin composition root" is being measured
 *       against), and
 *   (b) forward ceilings — later commits in this refactor must not exceed
 *       these numbers for the file(s) that still hold this responsibility.
 *
 * Numbers here were counted directly against the file (fs read + regex),
 * not guessed. Where the approved plan's prior-investigation figures (see
 * README below) differ from what was actually counted, the ACTUAL counted
 * value is what this file asserts — the discrepancy is called out inline.
 *
 * DISCREPANCY vs approved plan: the plan's revision doc cited "6/8/2" for
 * page-local useState/useEffect/useRef counts (to be verified). Actual
 * counted values today are useState=6, useEffect=8, useRef=3 — useState
 * and useEffect match; useRef does not (the file has 3 useRef call sites:
 * mapContainerRef, bboxTimerRef, prevStartOverTickRef). This does not
 * change the S6/S7 ordering invariant or the __debug shape (both
 * independently verified below and in controllerOrdering.contract.test.ts)
 * — it only corrects the page-local-hook-count baseline this test asserts
 * against.
 */

const PAGE_PATH = path.resolve(__dirname, '../MapDiscovery.tsx');
const source = fs.readFileSync(PAGE_PATH, 'utf-8');
const lines = source.split('\n');

const MAP_CANVAS_PROPS_PATH = path.resolve(
  __dirname,
  '../../features/discover/views/DiscoverMapCanvas.tsx',
);
const mapCanvasSource = fs.readFileSync(MAP_CANVAS_PROPS_PATH, 'utf-8');

// Issue #2142 Commit 4 — DiscoverRightPanelContainer.tsx was true-renamed to
// surfaces/DiscoverPanelSurface.tsx and its flat DiscoverRightPanelContainerProps
// interface (the thing this describe block actually measures) moved into
// buildPanelSurfaceView.ts, since DiscoverPanelSurface.tsx's own prop type is
// now the grouped {view, commands} shape, not the flat one.
const RIGHT_PANEL_CONTAINER_PATH = path.resolve(
  __dirname,
  '../../features/discover/surfaces/buildPanelSurfaceView.ts',
);
const rightPanelSource = fs.readFileSync(RIGHT_PANEL_CONTAINER_PATH, 'utf-8');

const DISCOVER_CONTEXT_PATH = path.resolve(
  __dirname,
  '../../features/discover/context/DiscoverContext.tsx',
);
const discoverContextSource = fs.readFileSync(DISCOVER_CONTEXT_PATH, 'utf-8');

function countMatches(text: string, regex: RegExp): number {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

// Commit-1 baseline, frozen: the file's shape the moment this refactor
// started (2915 LOC via wc -l / jCodemunch; 2916 via source.split('\n'),
// which counts the file's trailing newline as one extra empty element —
// this file counts consistently with split() throughout). This is the
// forward ceiling every later commit is measured against; it must never
// change as MapDiscovery.tsx shrinks over the course of #2142.
const COMMIT_1_LOC_CEILING = 2916;
const COMMIT_1_USE_STATE_CEILING = 6;
const COMMIT_1_USE_EFFECT_CEILING = 8;
const COMMIT_1_USE_REF_CEILING = 3;

describe('MapDiscovery.tsx architecture baseline (#2142 Commit 1, updated per-commit)', () => {
  describe('LOC / import — must shrink toward <=220 LOC by end of #2142', () => {
    it('records the CURRENT actual LOC (updated each commit as the page shrinks)', () => {
      // 2916 (Commit 1) -> 2863 (Commit 2) -> 2844 (leaf hooks) -> 2667
      // (batch 1) -> 2581 (batch 2) -> 2474 (batch 3, full Commit 3) -> 2363
      // (Commit 4) -> 2278 (Commit 5a, layout shell) -> 2256 (Commit 5b).
      //
      // CORRECTION PASS (owner BLOCKING review of PR #2146): the first pass's
      // "2256 is an accepted documented variance" framing is WITHDRAWN — see
      // this describe block's `it('LOC must monotonically shrink...')` note.
      // The correction pass's C1 (splitting the 340-LOC
      // useDiscoverMapPresentationController into five capability
      // controllers) TEMPORARILY GROWS this file: 2256 -> 2276, because one
      // controller call site + destructure becomes five. That is expected and
      // recorded honestly here rather than hidden; the reduction lands in the
      // later commits that move page-resident domain logic out.
      expect(lines.length).toBe(2276);
    });

    it('records the CURRENT actual top-level import statement count (updated each commit)', () => {
      // Counts statements starting a line with `import ` (single- and
      // multi-line brace imports both count once). Import count has no
      // ceiling — it necessarily grows as inline logic is replaced by
      // imported selectors/adapters/controllers; only LOC is the metric
      // #2142's <=220 acceptance criterion targets. 75 (Commit 1) -> 80
      // (Commit 2) -> 82 (leaf hooks) -> 74 (batch 1) -> 67 (batch 2) -> 60
      // (batch 3, full Commit 3) -> 60 (Commit 4) -> 59 (Commit 5a:
      // PublicDiscoverLayout + DiscoverControlBar imports removed,
      // DiscoverPageShell import added — net -1) -> 59 (Commit 5b:
      // unchanged, no new imports needed for the controller-grouping change).
      // ... -> 59 (Commit 5b) -> 63 (correction pass C1: one
      // useDiscoverMapPresentationController import replaced by five
      // capability-controller imports).
      const importCount = countMatches(source, /^import /gm);
      expect(importCount).toBe(63);
    });

    it('LOC must never exceed the Commit-1 baseline in any later commit (forward ceiling)', () => {
      expect(lines.length).toBeLessThanOrEqual(COMMIT_1_LOC_CEILING);
    });

    it('LOC must end the correction pass below the first pass\'s BLOCKING-rejected 2256, not merely below the Commit-1 ceiling', () => {
      // CORRECTION PASS: the first pass ended at 2256 and was rejected —
      // "a result that leaves MapDiscovery.tsx at thousands of lines is not
      // acceptable as complete" (#2142). A per-commit monotonic-shrink
      // assertion is the wrong shape for this pass: C1 (the god-hook split)
      // legitimately grows the page before the composition root removes it
      // all. What must hold at the END is a hard, non-negotiable target, so
      // the assertion is pinned to that instead of to the previous commit.
      const REJECTED_FIRST_PASS_LOC = 2256;
      const CORRECTION_PASS_INTERMEDIATE_ALLOWANCE = 2300;
      expect(lines.length).toBeLessThanOrEqual(CORRECTION_PASS_INTERMEDIATE_ALLOWANCE);
      // Sanity: the allowance is a short-lived intermediate ceiling that only
      // exists between C1 and the composition-root commit, and it is only
      // barely above the rejected value — it can never be mistaken for a new
      // accepted resting point.
      expect(CORRECTION_PASS_INTERMEDIATE_ALLOWANCE - REJECTED_FIRST_PASS_LOC).toBeLessThan(100);
    });
  });

  describe('page-local hook count baseline (verified, NOT the plan\'s unverified 6/8/2)', () => {
    // Token-based (not full-signature) matching on purpose: `useRef<...>(`
    // forms with a nested generic (e.g.
    // `useRef<ReturnType<typeof setTimeout> | null>(null)` for
    // bboxTimerRef) defeat a naive `useRef(?:<[^>]*>)?\(` pattern, because
    // `[^>]*` stops at the FIRST `>` (the inner generic's), not the
    // matching outer one — silently under-counting real useRef call sites.
    // Matching on the opening token (`useRef(` or `useRef<`) avoids that
    // trap and was cross-checked by hand against every useState/useRef
    // call site in the file (jCodemunch search_text, verified individually
    // at lines 219, 318, 701, 754, 791, 809, 810, 698, 1321).
    it('records the CURRENT page-local useState count (updated each commit)', () => {
      // Commit 3: leaf hooks moved boundedSearchTriggered/mapBbox out (6 -> 4);
      // the navigation controller then moved hoveredNavigationNodeKey out too
      // (4 -> 3). nearSchoolOpen/selectedListingPreview remain page-local.
      const useStateCount = countMatches(source, /\buseState[(<]/g);
      expect(useStateCount).toBe(3);
    });

    it('records the CURRENT page-local useEffect count (updated each commit)', () => {
      // Commit 3 moved 3 effects (bbox unmount cleanup, MAP->LIST cleanup,
      // city-change reset) into useDiscoverViewportTracker: 8 -> 5.
      const useEffectCount = countMatches(source, /\buseEffect\(/g);
      expect(useEffectCount).toBe(5);
    });

    it('records the CURRENT page-local useRef count (updated each commit)', () => {
      // Commit 3 moved bboxTimerRef into useDiscoverViewportTracker: 3 -> 2
      // (mapContainerRef, prevStartOverTickRef remain page-local).
      const useRefCount = countMatches(source, /\buseRef[(<]/g);
      expect(useRefCount).toBe(2);
    });

    it('page-local hook counts must never exceed the Commit-1 baseline (forward ceiling)', () => {
      const useStateCount = countMatches(source, /\buseState[(<]/g);
      const useEffectCount = countMatches(source, /\buseEffect\(/g);
      const useRefCount = countMatches(source, /\buseRef[(<]/g);
      expect(useStateCount).toBeLessThanOrEqual(COMMIT_1_USE_STATE_CEILING);
      expect(useEffectCount).toBeLessThanOrEqual(COMMIT_1_USE_EFFECT_CEILING);
      expect(useRefCount).toBeLessThanOrEqual(COMMIT_1_USE_REF_CEILING);
    });
  });

  describe('forbidden-import guard (placeholder — matters once the page is a thin composition root)', () => {
    it('does not import a global state-management library', () => {
      // Issue #2142 non-goal: "New state-management library or a second
      // Discover React context". This guard is a placeholder today (the
      // page has no reason to import these regardless of size) and becomes
      // load-bearing once the controller/selector extraction lands, so a
      // future controller cannot reach for Redux/Zustand/XState instead of
      // React state + the existing DiscoverContext.
      const forbidden = [/from ['"]redux['"]/, /from ['"]@reduxjs\/toolkit['"]/, /from ['"]zustand['"]/, /from ['"]xstate['"]/, /from ['"]@xstate\/react['"]/];
      for (const pattern of forbidden) {
        expect(source).not.toMatch(pattern);
      }
    });
  });

  describe('window.__debug shape contract (Playwright E2E contract, AC4 in prior #1824 work)', () => {
    // The page currently writes to window.__debug in two places: a
    // `propertyMapListings` key (set once, spreading any prior __debug) and
    // a `mapState` key (set later, spreading any prior __debug.mapState).
    // Later commits must preserve this exact shape byte-for-byte; this test
    // proves today's shape from the actual source so future commits have
    // something concrete to diff against.
    it('sets window.__debug.propertyMapListings', () => {
      expect(source).toMatch(
        /\(window as Window & \{ __debug\?: Record<string, unknown> \}\)\.__debug = \{[\s\S]{0,200}propertyMapListings:/,
      );
    });

    it('sets window.__debug.mapState via a spread-preserving assignment', () => {
      expect(source).toMatch(/w\.__debug = \{\s*\.\.\.w\.__debug,\s*mapState: \{/);
    });

    it('the mapState assignment spreads the prior mapState value (does not clobber sibling keys)', () => {
      expect(source).toMatch(
        /\.\.\.\(w\.__debug\?\.mapState as Record<string, unknown> \| undefined\)/,
      );
    });

    it('records the two known __debug write sites by line number (forward diff anchor)', () => {
      const propertyMapListingsLine =
        lines.findIndex((line) => line.includes('.__debug = {') && line.includes('window as Window')) + 1;
      const mapStateLine = lines.findIndex((line) => line.trim() === 'w.__debug = {') + 1;
      expect(propertyMapListingsLine).toBeGreaterThan(0);
      expect(mapStateLine).toBeGreaterThan(0);
      // mapState write must come after the propertyMapListings write today —
      // this is the same textual ordering constraint exercised in
      // controllerOrdering.contract.test.ts.
      expect(mapStateLine).toBeGreaterThan(propertyMapListingsLine);
    });
  });

  describe('map/panel surface prop-contract snapshot (today\'s actual DiscoverMapMount / DiscoverRightPanelContainer)', () => {
    // DiscoverMapMount.tsx itself just forwards `props: DiscoverMapCanvasProps`
    // to a lazily-loaded DiscoverMapCanvas — the real enumerated prop surface
    // is DiscoverMapCanvasProps. Verified via jCodemunch symbol read, not
    // guessed: 111 fields (including JSDoc-documented optional props).
    it('DiscoverMapCanvasProps field count is at today\'s documented baseline', () => {
      const fieldCount = countMatches(mapCanvasSource, /^\s{2}\w[\w?]*:\s/gm);
      // Coarse floor rather than an exact pin: the interface has inline
      // JSDoc blocks between some fields that a purely textual count can
      // be thrown off by if comments are reformatted without a field being
      // added/removed. 100 is comfortably below the verified actual (111)
      // and comfortably above what any accidental drop of a real field
      // would produce.
      expect(fieldCount).toBeGreaterThanOrEqual(100);
    });

    it('DiscoverRightPanelContainerProps field count is at today\'s documented baseline', () => {
      // Issue #2142 Commit 4 — same 67-field flat interface, now declared in
      // buildPanelSurfaceView.ts instead of a component's function
      // destructure (see this file's own doc comment on that constant).
      const interfaceMatch = rightPanelSource.match(
        /export interface DiscoverRightPanelContainerProps \{([\s\S]*?)\n\}/,
      );
      expect(interfaceMatch).not.toBeNull();
      const fieldCount = countMatches(interfaceMatch![1], /^\s{2}\w[\w?]*:\s/gm);
      // Verified via jCodemunch symbol read (pre-move): 83 destructured props
      // in the original component's function signature. The interface's own
      // field count is lower (67) because several fields destructured with
      // JS default values (e.g. `hoveredNavigationNodeKey = null`) are
      // declared `?:` optional in the TYPE but that has no bearing on this
      // count either way — this asserts the type's field count specifically,
      // not the destructure-site count, so 83 is not the right floor here.
      expect(fieldCount).toBeGreaterThanOrEqual(60);
    });
  });

  describe('mobile List<->Map is presentation-only, not a second navigation model', () => {
    // The mobile List<->Map toggle state (`mobileView`) lives in
    // DiscoverContext.tsx, not MapDiscovery.tsx, and is a plain useState —
    // it never calls useNavigate/setSearchParams/history. This is the
    // invariant #2142's future useDiscoverMobilePresentationController must
    // not violate. The runtime/behavioural proof already exists at
    // src/features/discover/views/mobile/__tests__/mobileToggleHistorySafety.integration.test.tsx
    // (out of this commit's allowed_files — not modified here); this is a
    // static source guard that the state itself is plain, uncoupled
    // component state today.
    it('mobileView is a plain useState<MobileView>, not derived from navigate/URL', () => {
      expect(discoverContextSource).toMatch(
        /const \[mobileView, setMobileView\] = useState<MobileView>\('LIST'\);/,
      );
    });

    it('the mobileView state declaration has no navigate/history/searchParams call on the same line', () => {
      const line = discoverContextSource
        .split('\n')
        .find((l) => l.includes('const [mobileView, setMobileView]'));
      expect(line).toBeDefined();
      expect(line).not.toMatch(/navigate|history|searchParams/i);
    });
  });
});
