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
// buildPanelSurfaceModel.ts, since DiscoverPanelSurface.tsx's own prop type is
// now the grouped {view, commands} shape, not the flat one.
const RIGHT_PANEL_CONTAINER_PATH = path.resolve(
  __dirname,
  '../../features/discover/surfaces/buildPanelSurfaceModel.ts',
);
const rightPanelSource = fs.readFileSync(RIGHT_PANEL_CONTAINER_PATH, 'utf-8');

const DISCOVER_CONTEXT_PATH = path.resolve(
  __dirname,
  '../../features/discover/context/DiscoverContext.tsx',
);
const discoverContextSource = fs.readFileSync(DISCOVER_CONTEXT_PATH, 'utf-8');

// Issue #2142 (correction pass) — the two window.__debug write effects moved
// out of MapDiscovery.tsx into their own single-owner controller.
const DEBUG_BRIDGE_PATH = path.resolve(
  __dirname,
  '../../features/discover/controllers/useDiscoverDebugBridge.ts',
);
const debugBridgeSource = fs.readFileSync(DEBUG_BRIDGE_PATH, 'utf-8');

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
      // "2256 is an accepted documented variance" framing is WITHDRAWN.
      //   C1 (five-way god-hook split)                 2256 -> 2276 (grows:
      //     one controller call site + destructure becomes five)
      //   C2 (page-context / area-groups / bounded-browse / page-state /
      //       map-data extraction)                     2276 -> 1944
      //   C3 (badge / journey-chrome / filter-chrome / marker-popover /
      //       debug-bridge + navigation, geography, school and
      //       mobile-presentation absorption)          1944 -> 1263
      //   C4 (useDiscoverPageComposition + thin root)  1263 ->   59
      expect(lines.length).toBe(59);
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
      // capability-controller imports) -> 53 (correction pass C2: the page no
      // longer imports the data hooks/selectors those controllers now own).
      const importCount = countMatches(source, /^import /gm);
      expect(importCount).toBe(6);
    });

    it('LOC must never exceed the Commit-1 baseline in any later commit (forward ceiling)', () => {
      expect(lines.length).toBeLessThanOrEqual(COMMIT_1_LOC_CEILING);
    });

    it('LOC is comfortably inside the <=220 acceptance criterion (#2142 DoD)', () => {
      // The first pass ended at 2256 and was BLOCKING-rejected — "a result
      // that leaves MapDiscovery.tsx at thousands of lines is not acceptable
      // as complete" (#2142). The intermediate allowance that covered C1's
      // temporary growth is retired now that the composition root has landed.
      expect(lines.length).toBeLessThanOrEqual(220);
    });

    it('imports ONLY the composition hook, the surfaces, and the route-level unsupported-city gate', () => {
      // Issue #2142 Commit 4 — the import-COUNT assertion above says how many;
      // this says which, which is the part that actually constrains the layer.
      // Anything outside these three prefixes means the page has started
      // reaching past its own layer again (a hook, a view, a selector, a
      // controller), which is how a composition root grows back into a god
      // component regardless of its line count.
      //
      // The Discover CONTEXT PROVIDER is deliberately absent from this list:
      // MapDiscovery.tsx does not mount it — <DiscoverProvider> wraps the route
      // in App.tsx (verified), so the page consumes no provider module at all.
      const ALLOWED_PREFIXES = [
        '@/features/discover/composition/',
        '@/features/discover/surfaces/',
        // The unsupported-city gate's renderer — the one thing the page's own
        // route guard renders, and the reason `if (` count is 1 rather than 0.
        '@/components/discover/CityNotSupported',
      ];
      const specifiers = [...source.matchAll(/^import[\s\S]*?from '([^']+)';/gm)].map((m) => m[1]);
      const strays = specifiers.filter(
        (spec) => !ALLOWED_PREFIXES.some((prefix) => spec.startsWith(prefix)),
      );
      expect(strays).toEqual([]);
      // ...and the scan really saw the imports (guard against a regex that
      // silently matches nothing).
      expect(specifiers.length).toBe(6);
    });

    it('the page is a composition ROOT, not a re-exported god component: it renders surfaces and nothing else', () => {
      // Structural, not cosmetic — these three together are what "thin"
      // actually means here.
      expect(source).toMatch(/useDiscoverPageComposition\(\)/);
      // Exactly one gate: the unsupported-city route guard.
      expect(countMatches(source, /\bif\s*\(/g)).toBe(1);
      // No data access of any kind.
      expect(source).not.toMatch(/from '@\/hooks\//);
      expect(source).not.toMatch(/from '@tanstack\/react-query'/);
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
    // CORRECTION PASS — all three are now ZERO, and that is the real
    // acceptance property, not a recorded number: a composition root owns no
    // state, runs no effect and holds no ref of its own. Every one of them
    // belongs to a named capability controller.
    it('the page holds NO local useState (every piece of state has a named controller owner)', () => {
      expect(countMatches(source, /\buseState[(<]/g)).toBe(0);
    });

    it('the page runs NO local useEffect (every effect has a named controller owner)', () => {
      expect(countMatches(source, /\buseEffect\(/g)).toBe(0);
    });

    it('the page holds NO local useRef', () => {
      expect(countMatches(source, /\buseRef[(<]/g)).toBe(0);
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
    // CORRECTION PASS — the two write sites moved off MapDiscovery.tsx into
    // controllers/useDiscoverDebugBridge.ts, so these assertions are REPOINTED
    // at that file rather than deleted. The contract they protect is unchanged:
    // a `propertyMapListings` key (set once, spreading any prior __debug) and a
    // `mapState` key (set later, spreading any prior __debug.mapState), in that
    // order.
    //
    // Additionally guarded here: the page itself must now contain ZERO
    // __debug write sites, so there can never be a second, unowned bridge.
    it('MapDiscovery.tsx no longer writes window.__debug at all (single owner)', () => {
      expect(source).not.toMatch(/__debug\s*=/);
    });

    it('the debug bridge sets window.__debug.propertyMapListings', () => {
      expect(debugBridgeSource).toMatch(
        /\(window as Window & \{ __debug\?: Record<string, unknown> \}\)\.__debug = \{[\s\S]{0,200}propertyMapListings:/,
      );
    });

    it('the debug bridge sets window.__debug.mapState via a spread-preserving assignment', () => {
      expect(debugBridgeSource).toMatch(/w\.__debug = \{\s*\.\.\.w\.__debug,\s*mapState: \{/);
    });

    it('the mapState assignment spreads the prior mapState value (does not clobber sibling keys)', () => {
      expect(debugBridgeSource).toMatch(
        /\.\.\.\(w\.__debug\?\.mapState as Record<string, unknown> \| undefined\)/,
      );
    });

    it('records the two known __debug write sites by line number (forward diff anchor)', () => {
      const bridgeLines = debugBridgeSource.split('\n');
      const propertyMapListingsLine =
        bridgeLines.findIndex((line) => line.includes('.__debug = {') && line.includes('window as Window')) + 1;
      const mapStateLine = bridgeLines.findIndex((line) => line.trim() === 'w.__debug = {') + 1;
      expect(propertyMapListingsLine).toBeGreaterThan(0);
      expect(mapStateLine).toBeGreaterThan(0);
      // mapState write must come after the propertyMapListings write — this is
      // the same textual ordering constraint exercised in
      // controllerOrdering.contract.test.ts.
      expect(mapStateLine).toBeGreaterThan(propertyMapListingsLine);
    });
  });

  describe('map/panel surface prop-contract snapshot (today\'s actual DiscoverMapMount / DiscoverRightPanelContainer)', () => {
    // Issue #2659 (D1) — DiscoverMapMount/DiscoverMapSurface used to forward
    // `props: DiscoverMapCanvasProps`, a hand-written 139-field flat
    // interface, to a lazily-loaded DiscoverMapCanvas. That flat interface is
    // now DELETED outright (not kept as a renamed catalogue type): the
    // capability interfaces it used to be `Pick<>`'d from are now the source
    // of truth in buildMapSurfaceModel.tsx, and DiscoverMapCanvasProps
    // narrows to `{ mapContainerRef, view, commands }`. This mirrors the
    // panel side's own already-established pattern two tests below ("the
    // flat DiscoverRightPanelContainerProps interface is GONE") — a field
    // COUNT on a hand-written flat interface is no longer the right
    // assertion once that interface stops being the source of truth.
    it('DiscoverMapCanvasProps is the narrow {mapContainerRef, view, commands} contract, not a re-inflated flat interface', () => {
      // The old field-count floor no longer applies: the flat interface is
      // gone, so a purely textual field count on this file would just count
      // the 3 top-level contract fields (a vacuous, always-passing assertion
      // once the interface is empty of any hand-written flat field). What
      // must hold instead is structural: the flat shape is genuinely absent,
      // and the nested contract is genuinely present.
      expect(mapCanvasSource).toMatch(
        /export interface DiscoverMapCanvasProps \{\s*mapContainerRef: RefObject<HTMLDivElement \| null>;\s*view: Omit<DiscoverMapSurfaceView, 'overlays'>;\s*commands: Omit<DiscoverMapSurfaceCommands, 'overlays'>;\s*\}/,
      );
      // A stray flat field (e.g. a reviewer re-adding one directly to this
      // interface instead of to its owning capability group in
      // buildMapSurfaceModel.tsx) would show up as a field line between the
      // interface's opening brace and its close — assert there is none.
      const ifaceMatch = mapCanvasSource.match(
        /export interface DiscoverMapCanvasProps \{([\s\S]*?)\n\}/,
      );
      expect(ifaceMatch).not.toBeNull();
      const ifaceBody = ifaceMatch ? ifaceMatch[1] : '';
      const flatFieldLines = ifaceBody
        .split('\n')
        .filter((line) => /^\s{2}\w[\w?]*:\s/.test(line))
        .filter((line) => !/^\s{2}(mapContainerRef|view|commands):/.test(line));
      expect(flatFieldLines).toEqual([]);
    });

    it('the flat DiscoverRightPanelContainerProps interface is GONE, replaced by controller-derived types', () => {
      // CORRECTION PASS (owner corrective point #3) — this used to assert a
      // field COUNT on a hand-written 67-field flat interface that the
      // composition root had to transcribe and the builders immediately
      // re-grouped: three hand-maintained copies of one field list, none of
      // them the source of truth. The interface is deleted; what replaces the
      // count assertion is a structural one.
      expect(rightPanelSource).not.toMatch(/interface DiscoverRightPanelContainerProps/);
    });

    it('the panel model derives its field set from the CONTROLLERS, not from a hand-written interface', () => {
      // The view/commands groups must Pick off PanelFields, and PanelFields
      // must be built from ReturnType<typeof useXController> slices — so a
      // controller renaming an output is a compile error here rather than a
      // silent drift.
      expect(rightPanelSource).toMatch(/type PanelFields =/);
      const controllerSlices = rightPanelSource.match(
        /ReturnType<typeof use[A-Za-z]+>/g,
      );
      expect(controllerSlices).not.toBeNull();
      expect(new Set(controllerSlices).size).toBeGreaterThanOrEqual(15);
      // ...and the builders take those grouped controller results as input.
      expect(rightPanelSource).toMatch(/export interface BuildPanelSurfaceModelParams \{/);
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
