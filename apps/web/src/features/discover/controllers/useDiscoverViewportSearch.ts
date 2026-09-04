import { useCallback, useRef } from 'react';
import type { ResultScope, CommittedResultScope } from '@/features/discover/state/resultScope';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';

export interface UseDiscoverViewportSearchParams {
  /** From useDiscoverViewportTracker() — the debounced live map bbox, or null before the first settle. */
  mapBbox: [number, number, number, number] | null;
  /**
   * From useDiscoverMapData()'s CameraIntent — null until the first
   * PROGRAMMATIC camera move (fitTick/area-select/etc) publishes one. Only
   * `.seq` is consumed (see `cameraSeq` derivation below), to distinguish
   * "the map moved because we told it to" from "the user panned/zoomed" so a
   * programmatic move never falsely marks the viewport dirty. Accepting the
   * raw CameraIntent (rather than a pre-derived seq number) keeps this
   * hook's composition-file call site a plain object literal — see
   * useDiscoverPageComposition.ts's compositionHookScope.guard.test.ts,
   * which forbids any derivation logic in that file.
   */
  cameraIntent: CameraIntent | null;
  /**
   * From nav.resultScope (Issue #2016) — the whole CommittedResultScope
   * wrapper, possibly undefined before the URL domain has resolved. Only
   * `.active` is consumed (see `activeScope` derivation below); accepting
   * the raw wrapper (rather than a pre-derived ResultScope) keeps this
   * hook's composition-file call site a plain object literal — see the
   * CameraIntent doc above for the same rationale.
   */
  resultScope: CommittedResultScope | undefined;
  /** From nav.resultScope actions (Issue #2016) — commits a new scope to the URL. */
  commitResultScope: (scope: ResultScope, opts?: { history: 'push' | 'replace' }) => void;
  /**
   * From useDiscoverViewportTracker() — issue #2426 fix-cycle-2. Cancels any
   * pending debounced `mapBbox` update and seeds it synchronously with the
   * bounds passed in. Called from `activate()` with the exact bounds being
   * committed, so a settle that predates the commit can't land afterward
   * and fabricate a dirty viewport with no new user gesture. Optional so
   * existing callers/tests that don't exercise this path stay unaffected.
   */
  commitBbox?: (bbox: [number, number, number, number]) => void;
  /**
   * From useDiscoverViewportTracker() — issue #2426 fix cycle 4. A
   * monotonically increasing counter bumped once per genuine user camera
   * gesture (dragstart/wheel/touchstart/dblclick/zoom-control-click/
   * camera-keydown — see PropertyMap's BoundsWatcher doc comment for the
   * exact set). `isDirty` requires this to have advanced past the value
   * recorded at the last baseline reset, closing a third fabricated-dirty
   * source `commitBbox` alone cannot: a genuine NEW settle (e.g. trailing
   * drag inertia) landing shortly AFTER a commit, with no further real user
   * input, must not re-dirty the viewport. Defaults to 0 (never dirty from
   * gesture alone) if omitted, for callers/tests that don't exercise this.
   */
  userCameraGestureSeq?: number;
}

export interface UseDiscoverViewportSearchResult {
  /**
   * True only at a navigation level where "search this area" is a
   * meaningful scoped result set — i.e. a committed AREA_SET, POLYGON, or
   * VIEWPORT ResultScope is active (Issue #2016). VIEWPORT is included so
   * the Airbnb-style "search again as you pan" flow keeps working after the
   * user has already committed one VIEWPORT scope and pans further (Issue
   * #2015 repeated-search fix). False at City root, Direction,
   * top-of-Schools/Agri journeys, and any other level with no committed
   * scope. The CTA must never render, and the viewport must never be
   * activatable, while this is false.
   */
  isEligible: boolean;
  /** True once the live viewport has drifted past tolerance from the last committed/reset baseline. Always false when !isEligible. */
  isDirty: boolean;
  /** Commits the current mapBbox as a VIEWPORT result scope (AC2/AC7 — single request, replace-history). No-op when !isEligible. */
  activate: () => void;
}

// Issue #2015 — tolerance thresholds are a judgment call (no explicit UX
// spec numbers in the issue), validated against CameraIntent.seq gating so
// a programmatic camera move never trips these. See approved-plan.toml
// [risks].
const CENTER_DRIFT_TOLERANCE_RATIO = 0.15;
const AREA_DELTA_TOLERANCE_RATIO = 0.2;

/**
 * Pure dirty-detection: compares a `current` bbox against a `reference`
 * baseline bbox using two independent ratios —
 *   - center-drift-ratio: distance between bbox centers, normalized by the
 *     reference bbox's diagonal length.
 *   - area-delta-ratio: absolute change in bbox area, normalized by the
 *     reference bbox's area.
 * `true` (dirty) if EITHER ratio exceeds its tolerance. A degenerate
 * reference bbox (zero-length diagonal/area) never reports dirty — there is
 * no meaningful baseline to drift from.
 *
 * Bbox tuples are `[s, w, n, e]`, matching mapBbox's existing convention
 * (useDiscoverViewportTracker.ts) and ResultScope's VIEWPORT bounds shape.
 */
export function isViewportDirty(
  reference: [number, number, number, number],
  current: [number, number, number, number],
): boolean {
  const [refS, refW, refN, refE] = reference;
  const [curS, curW, curN, curE] = current;

  const refWidth = refE - refW;
  const refHeight = refN - refS;
  const refDiagonal = Math.hypot(refWidth, refHeight);
  if (refDiagonal <= 0) return false;

  const refCenterLat = (refS + refN) / 2;
  const refCenterLon = (refW + refE) / 2;
  const curCenterLat = (curS + curN) / 2;
  const curCenterLon = (curW + curE) / 2;
  const centerDriftRatio = Math.hypot(curCenterLat - refCenterLat, curCenterLon - refCenterLon) / refDiagonal;
  if (centerDriftRatio > CENTER_DRIFT_TOLERANCE_RATIO) return true;

  const refArea = Math.abs(refWidth * refHeight);
  if (refArea <= 0) return false;
  const curArea = Math.abs((curE - curW) * (curN - curS));
  const areaDeltaRatio = Math.abs(curArea - refArea) / refArea;
  return areaDeltaRatio > AREA_DELTA_TOLERANCE_RATIO;
}

/**
 * Issue #2015 — "Search this area" viewport activation controller.
 *
 * Owns dirty-detection (AC1) and one-shot activation (AC2/AC7) for the
 * VIEWPORT result scope. Deliberately does NOT own mapBbox itself (that
 * stays in useDiscoverViewportTracker) or the committed scope (that stays
 * in the #2016 URL domain) — this hook is pure glue between the two.
 *
 * Baseline tracking: `referenceBboxRef` holds the bbox the live `mapBbox`
 * is compared against. It resets (goes back to null, then re-seeds from the
 * next non-null mapBbox) whenever `cameraSeq` changes — a programmatic
 * camera move invalidates any user-drift baseline — or whenever the
 * committed scope's *identity* changes, which covers `activate()` itself:
 * committing a scope changes `activeScope.kind` (or, for a repeated VIEWPORT
 * commit where the kind stays 'VIEWPORT', changes `activeScope.bounds` — see
 * `scopeSignature` below), so the baseline re-seeds to the just-committed
 * bbox and `isDirty` correctly goes false immediately (CTA hides right after
 * activation, matching AC2's "exactly one refetch"). This also covers a
 * *second* VIEWPORT commit after the user pans further past an already-
 * active VIEWPORT scope (Issue #2015 repeated-search fix) — the kind alone
 * wouldn't change (VIEWPORT → VIEWPORT), so the signature must also carry
 * the bounds.
 *
 * All of this is plain derived-value computation done during render (refs
 * mutated idempotently, comparing against the previous render's stored
 * value) — no `useEffect` is needed since nothing here has a side effect on
 * mount/unmount, only a read of live params.
 */
export function useDiscoverViewportSearch({
  mapBbox,
  cameraIntent,
  resultScope,
  commitResultScope,
  commitBbox,
  userCameraGestureSeq = 0,
}: UseDiscoverViewportSearchParams): UseDiscoverViewportSearchResult {
  const referenceBboxRef = useRef<[number, number, number, number] | null>(null);
  const lastCameraSeqRef = useRef<number | null>(null);
  const lastScopeSignatureRef = useRef<string | null>(null);
  // Issue #2426 fix cycle 4 — the userCameraGestureSeq value at the last
  // baseline reset. isDirty additionally requires the live seq to have
  // advanced PAST this, i.e. a genuine gesture happened since. See the
  // gating note on `userCameraGestureSeq` in the params doc above.
  const committedGestureSeqRef = useRef(0);

  // See the CameraIntent/CommittedResultScope param docs above — these two
  // derivations deliberately live here (a controller), not in the
  // composition file that constructs this hook's params.
  const cameraSeq = cameraIntent?.seq ?? 0;
  const activeScope = resultScope?.active ?? null;

  const scopeKind = activeScope?.kind ?? null;
  // A VIEWPORT scope's `kind` doesn't change across a repeated VIEWPORT
  // commit (VIEWPORT → VIEWPORT with new bounds), so the reset signature
  // folds in the bounds for that one case — every other kind changes (or
  // stays identical) exactly when the plain kind does.
  const scopeSignature =
    activeScope?.kind === 'VIEWPORT'
      ? `VIEWPORT:${activeScope.bounds.s}:${activeScope.bounds.w}:${activeScope.bounds.n}:${activeScope.bounds.e}`
      : scopeKind;
  if (lastCameraSeqRef.current !== cameraSeq || lastScopeSignatureRef.current !== scopeSignature) {
    lastCameraSeqRef.current = cameraSeq;
    lastScopeSignatureRef.current = scopeSignature;
    referenceBboxRef.current = null;
    committedGestureSeqRef.current = userCameraGestureSeq;
  }

  if (referenceBboxRef.current === null && mapBbox) {
    referenceBboxRef.current = mapBbox;
  }

  // Issue #2015 MUST-HAVE #2 (PR review 5085561270) — "search this area"
  // only makes sense once a scoped result set is showing. Reuses the
  // canonical #2016 ResultScope contract rather than inventing a parallel
  // navigation-level signal: AREA_SET/POLYGON/VIEWPORT are the scope kinds
  // that represent a committed, bounded set of results (as opposed to City
  // root / Direction / top-of-Schools / top-of-Agri, all of which carry
  // activeScope === null until a scope is committed). VIEWPORT is included
  // (Issue #2015 repeated-search fix) so re-activating "search this area"
  // after panning further from an already-committed VIEWPORT scope works.
  const isEligible = scopeKind === 'AREA_SET' || scopeKind === 'POLYGON' || scopeKind === 'VIEWPORT';

  // Issue #2426 fix cycle 4 — dirty requires BOTH a bbox drift past
  // tolerance AND a genuine user camera gesture since the last baseline
  // reset. Without the gesture gate, a settle that lands after a commit
  // with no further real user input (a trailing-inertia settle, or a
  // stale debounced update `commitBbox` didn't catch) would still flip
  // isDirty purely from bbox comparison — exactly the fabricated-dirty
  // class this issue rules out.
  const isDirty =
    isEligible &&
    mapBbox !== null &&
    referenceBboxRef.current !== null &&
    userCameraGestureSeq > committedGestureSeqRef.current
      ? isViewportDirty(referenceBboxRef.current, mapBbox)
      : false;

  const activate = useCallback(() => {
    if (!isEligible || !mapBbox) return;
    const [s, w, n, e] = mapBbox;
    // Issue #2426 fix-cycle-2 — cancel any pending debounced mapBbox update
    // and re-seed it synchronously with the EXACT bounds being committed,
    // before commitResultScope fires. Without this, a settle that predates
    // this activation (e.g. trailing pan momentum) can still have its own
    // debounced update in flight; if it lands after this commit, it moves
    // mapBbox to a value that never matched what was committed, fabricating
    // a dirty viewport with no further user gesture.
    commitBbox?.([s, w, n, e]);
    commitResultScope({ kind: 'VIEWPORT', bounds: { s, w, n, e } }, { history: 'replace' });
  }, [isEligible, mapBbox, commitResultScope, commitBbox]);

  return { isEligible, isDirty, activate };
}
