import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  isViewportDirty,
  useDiscoverViewportSearch,
  type UseDiscoverViewportSearchParams,
} from './useDiscoverViewportSearch';
import { useDiscoverViewportTracker } from './useDiscoverViewportTracker';
import type { CommittedResultScope, ResultScope } from '@/features/discover/state/resultScope';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';

// [s, w, n, e] — matches useDiscoverViewportTracker's mapBbox convention.
const BASE_BBOX: [number, number, number, number] = [12.9, 77.5, 13.0, 77.6];

// MUST-HAVE #2 (PR review 5085561270) — an AREA_SET scope is the eligible
// baseline for these tests: most of this suite exercises dirty-detection and
// activation mechanics that are orthogonal to eligibility, so the default
// param set is eligible and the dedicated 'eligibility gating' block below
// covers the ineligible (City root/Direction/top-of-journey) states.
const ELIGIBLE_SCOPE: ResultScope = { kind: 'AREA_SET', areaKeys: ['test-area'] };

// The hook only ever reads `.seq` off a CameraIntent — the rest of the
// fields are irrelevant to this suite, but a full literal keeps this a real
// CameraIntent rather than a cast.
function makeCameraIntent(seq: number): CameraIntent {
  return { seq, bounds: null, center: [12.95, 77.55], framing: 'leaf' };
}

// The hook only ever reads `.active` off a CommittedResultScope — `previous`
// is irrelevant to this suite and always null here.
function makeResultScope(active: ResultScope): CommittedResultScope {
  return { active, previous: null };
}

function makeParams(
  overrides: Partial<UseDiscoverViewportSearchParams> = {},
): UseDiscoverViewportSearchParams {
  return {
    mapBbox: BASE_BBOX,
    cameraIntent: null,
    resultScope: makeResultScope(ELIGIBLE_SCOPE),
    commitResultScope: vi.fn(),
    ...overrides,
  };
}

describe('isViewportDirty', () => {
  it('is false for an identical bbox', () => {
    expect(isViewportDirty(BASE_BBOX, BASE_BBOX)).toBe(false);
  });

  it('is false for a small drift within tolerance', () => {
    const current: [number, number, number, number] = [12.901, 77.501, 13.001, 77.601];
    expect(isViewportDirty(BASE_BBOX, current)).toBe(false);
  });

  it('is true once the center drifts past the tolerance ratio', () => {
    // Shift the whole bbox north by ~half its height — a real pan, not noise.
    const current: [number, number, number, number] = [12.95, 77.5, 13.05, 77.6];
    expect(isViewportDirty(BASE_BBOX, current)).toBe(true);
  });

  it('is true once the area changes past the tolerance ratio (zoom)', () => {
    // Same center, area roughly doubled.
    const current: [number, number, number, number] = [12.85, 77.45, 13.05, 77.65];
    expect(isViewportDirty(BASE_BBOX, current)).toBe(true);
  });

  it('is false for a degenerate (zero-area) reference bbox', () => {
    const zeroRef: [number, number, number, number] = [12.9, 77.5, 12.9, 77.5];
    expect(isViewportDirty(zeroRef, BASE_BBOX)).toBe(false);
  });
});

describe('useDiscoverViewportSearch', () => {
  it('is not dirty on first render (baseline seeds from the first mapBbox)', () => {
    const { result } = renderHook(() => useDiscoverViewportSearch(makeParams()));
    expect(result.current.isDirty).toBe(false);
  });

  it('is not dirty while mapBbox is still null', () => {
    const { result } = renderHook(() => useDiscoverViewportSearch(makeParams({ mapBbox: null })));
    expect(result.current.isDirty).toBe(false);
  });

  it('becomes dirty once the live mapBbox drifts past tolerance from the baseline (AC1)', () => {
    const { result, rerender } = renderHook(
      (props: UseDiscoverViewportSearchParams) => useDiscoverViewportSearch(props),
      { initialProps: makeParams() },
    );
    expect(result.current.isDirty).toBe(false);

    const driftedBbox: [number, number, number, number] = [12.95, 77.5, 13.05, 77.6];
    // A real drift is always accompanied by the gesture that caused it
    // (fix cycle 4's gating requires userCameraGestureSeq to have advanced).
    rerender(makeParams({ mapBbox: driftedBbox, userCameraGestureSeq: 1 }));

    expect(result.current.isDirty).toBe(true);
  });

  it('does not mark dirty for a bbox change driven by a programmatic camera move (cameraSeq bump)', () => {
    const { result, rerender } = renderHook(
      (props: UseDiscoverViewportSearchParams) => useDiscoverViewportSearch(props),
      { initialProps: makeParams({ cameraIntent: makeCameraIntent(1) }) },
    );
    expect(result.current.isDirty).toBe(false);

    // A programmatic fit bumps cameraSeq AND settles mapBbox to the new
    // framed bounds in the same update — this must re-baseline, not mark dirty.
    const programmaticBbox: [number, number, number, number] = [12.5, 77.0, 13.5, 78.0];
    rerender(makeParams({ cameraIntent: makeCameraIntent(2), mapBbox: programmaticBbox }));

    expect(result.current.isDirty).toBe(false);
  });

  it('activate() does nothing when mapBbox is null', () => {
    const commitResultScope = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverViewportSearch(makeParams({ mapBbox: null, commitResultScope })),
    );

    result.current.activate();

    expect(commitResultScope).not.toHaveBeenCalled();
  });

  it('activate() commits a VIEWPORT scope from the live bbox with replace-style history (AC2/AC7)', () => {
    const commitResultScope = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverViewportSearch(makeParams({ mapBbox: BASE_BBOX, commitResultScope })),
    );

    result.current.activate();

    const expectedScope: ResultScope = {
      kind: 'VIEWPORT',
      bounds: { s: BASE_BBOX[0], w: BASE_BBOX[1], n: BASE_BBOX[2], e: BASE_BBOX[3] },
    };
    expect(commitResultScope).toHaveBeenCalledTimes(1);
    expect(commitResultScope).toHaveBeenCalledWith(expectedScope, { history: 'replace' });
  });

  it('re-baselines and clears isDirty once activeScope.kind changes (CTA hides right after activation)', () => {
    const { result, rerender } = renderHook(
      (props: UseDiscoverViewportSearchParams) => useDiscoverViewportSearch(props),
      { initialProps: makeParams() },
    );

    const driftedBbox: [number, number, number, number] = [12.95, 77.5, 13.05, 77.6];
    rerender(makeParams({ mapBbox: driftedBbox, userCameraGestureSeq: 1 }));
    expect(result.current.isDirty).toBe(true);

    // Simulate the commit landing: activeScope flips to VIEWPORT with the
    // just-committed (drifted) bbox as the new live mapBbox.
    rerender(
      makeParams({
        mapBbox: driftedBbox,
        userCameraGestureSeq: 1,
        resultScope: makeResultScope({
          kind: 'VIEWPORT',
          bounds: { s: driftedBbox[0], w: driftedBbox[1], n: driftedBbox[2], e: driftedBbox[3] },
        }),
      }),
    );

    expect(result.current.isDirty).toBe(false);
  });

  it('supports a repeated VIEWPORT search: stays eligible, re-baselines, and re-commits fresh bounds on a second activation (Issue #2015 regression)', () => {
    const commitResultScope = vi.fn();
    const { result, rerender } = renderHook(
      (props: UseDiscoverViewportSearchParams) => useDiscoverViewportSearch(props),
      { initialProps: makeParams({ mapBbox: BASE_BBOX, commitResultScope }) },
    );

    // 1. Commit a VIEWPORT scope from an eligible AREA_SET baseline.
    result.current.activate();
    expect(commitResultScope).toHaveBeenCalledTimes(1);
    expect(commitResultScope).toHaveBeenNthCalledWith(
      1,
      {
        kind: 'VIEWPORT',
        bounds: { s: BASE_BBOX[0], w: BASE_BBOX[1], n: BASE_BBOX[2], e: BASE_BBOX[3] },
      },
      { history: 'replace' },
    );

    // The commit lands: activeScope flips to the just-committed VIEWPORT.
    rerender(
      makeParams({
        mapBbox: BASE_BBOX,
        commitResultScope,
        resultScope: makeResultScope({
          kind: 'VIEWPORT',
          bounds: { s: BASE_BBOX[0], w: BASE_BBOX[1], n: BASE_BBOX[2], e: BASE_BBOX[3] },
        }),
      }),
    );

    // 2. Clean re-baseline immediately at the committed bounds.
    expect(result.current.isDirty).toBe(false);
    expect(result.current.isEligible).toBe(true);

    // 3. The user pans further, drifting materially past tolerance from the
    // committed VIEWPORT bounds.
    const driftedBbox: [number, number, number, number] = [12.5, 77.0, 13.5, 78.0];
    rerender(
      makeParams({
        mapBbox: driftedBbox,
        userCameraGestureSeq: 1,
        commitResultScope,
        resultScope: makeResultScope({
          kind: 'VIEWPORT',
          bounds: { s: BASE_BBOX[0], w: BASE_BBOX[1], n: BASE_BBOX[2], e: BASE_BBOX[3] },
        }),
      }),
    );

    // 4. Regression guard: previously isEligible would have been false here
    // (VIEWPORT was excluded from eligibility), permanently hiding the CTA
    // after the first commit. isDirty must go true again and isEligible
    // must stay true.
    expect(result.current.isDirty).toBe(true);
    expect(result.current.isEligible).toBe(true);

    // 5. A second activation commits the NEW drifted bounds exactly once
    // more — not accumulated/duplicated on top of the first commit.
    result.current.activate();

    expect(commitResultScope).toHaveBeenCalledTimes(2);
    expect(commitResultScope).toHaveBeenNthCalledWith(
      2,
      {
        kind: 'VIEWPORT',
        bounds: { s: driftedBbox[0], w: driftedBbox[1], n: driftedBbox[2], e: driftedBbox[3] },
      },
      { history: 'replace' },
    );
  });
});

describe('useDiscoverViewportSearch + useDiscoverViewportTracker — trailing-debounce fabricated-dirty regression (Issue #2426 fix-cycle-2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Reproduces the exact sequence captured from a live failing e2e run:
  // settle A lands (its debounced mapBbox update completes), settle B's own
  // debounced update is still pending when activate() commits using
  // whatever mapBbox held at that instant (settle A's value), then B's
  // pending update fires. Without commitBbox cancelling B, mapBbox jumps to
  // B's bounds — which never matched what was committed — and isDirty
  // fabricates true with zero further user gesture.
  it('a settle pending at commit time must not fabricate isDirty after it lands; a genuine new pan still does', () => {
    const commitResultScope = vi.fn();
    // resultScope is threaded through rerender props (mirroring how the URL
    // domain drives it in the real app); tracker/search stay the SAME
    // hook instances across the whole sequence.
    const { result, rerender } = renderHook(
      (resultScope: CommittedResultScope) => {
        const tracker = useDiscoverViewportTracker({ mobileView: 'MAP', city: 'bangalore' });
        const search = useDiscoverViewportSearch({
          mapBbox: tracker.mapBbox,
          cameraIntent: null,
          resultScope,
          commitResultScope,
          commitBbox: tracker.commitBbox,
          userCameraGestureSeq: tracker.userCameraGestureSeq,
        });
        return { tracker, search };
      },
      { initialProps: makeResultScope(ELIGIBLE_SCOPE) },
    );

    // Establish a baseline bbox first — the very first settle seeds the
    // dirty-reference (mirrors the committed AREA_SET's initial map view,
    // before any pan has happened).
    act(() => {
      result.current.tracker.handleBoundsChange(BASE_BBOX);
      vi.advanceTimersByTime(300);
    });
    expect(result.current.search.isDirty).toBe(false);

    // Settle A: a genuine pan (drag) settles and its debounced update
    // lands, drifting materially past tolerance from the baseline — CTA
    // visible. The drag itself bumps userCameraGestureSeq (fix cycle 4).
    const settleA: [number, number, number, number] = [12.95, 77.5, 13.05, 77.6];
    act(() => {
      result.current.tracker.handleUserCameraGesture();
      result.current.tracker.handleBoundsChange(settleA);
      vi.advanceTimersByTime(300);
    });
    expect(result.current.tracker.mapBbox).toEqual(settleA);
    expect(result.current.search.isDirty).toBe(true);

    // Settle B: trailing pan momentum from the SAME gesture — its own
    // debounced update is scheduled but has NOT landed yet.
    const settleB: [number, number, number, number] = [12.955, 77.505, 13.055, 77.605];
    act(() => {
      result.current.tracker.handleBoundsChange(settleB);
    });

    // activate() commits using settle A (the only value mapBbox has held so
    // far) and, via commitBbox, cancels settle B's still-pending update.
    act(() => {
      result.current.search.activate();
    });
    expect(commitResultScope).toHaveBeenCalledWith(
      { kind: 'VIEWPORT', bounds: { s: settleA[0], w: settleA[1], n: settleA[2], e: settleA[3] } },
      { history: 'replace' },
    );

    // The commit landing changes activeScope on the next render — mirror
    // that by re-rendering with the committed VIEWPORT scope active (the
    // same tracker/search instances; only the resultScope prop changes).
    rerender(
      makeResultScope({
        kind: 'VIEWPORT',
        bounds: { s: settleA[0], w: settleA[1], n: settleA[2], e: settleA[3] },
      }),
    );
    expect(result.current.search.isDirty).toBe(false);

    // Settle B's pending update (if it had NOT been cancelled) would land
    // here, 300ms after it was scheduled. Advancing past that point must
    // not fabricate a dirty viewport — it was cancelled at commit time.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(
      result.current.search.isDirty,
      'a settle pending at commit time must not fabricate isDirty once it (would have) landed',
    ).toBe(false);
    expect(
      result.current.tracker.mapBbox,
      'the cancelled settle B must never overwrite mapBbox with bounds that were never committed',
    ).toEqual(settleA);

    // A genuine NEW pan (with its own gesture) after the commit must still
    // correctly mark dirty.
    const genuineNewPan: [number, number, number, number] = [12.5, 77.0, 13.5, 78.0];
    act(() => {
      result.current.tracker.handleUserCameraGesture();
      result.current.tracker.handleBoundsChange(genuineNewPan);
      vi.advanceTimersByTime(300);
    });
    expect(
      result.current.search.isDirty,
      'a genuine new pan after the commit must still correctly mark the viewport dirty',
    ).toBe(true);
  });

  // Team-lead ruling (fix cycle 4) — the third fabricated-dirty variant:
  // commitBbox only cancels a debounce timer already pending at the exact
  // commit instant. It does nothing about a genuine NEW settle that fires
  // shortly AFTER the commit (e.g. trailing drag inertia continuing past
  // when the drag visually ended) with no further real user gesture. This
  // reproduces the captured live-run sequence: drag settles A/B, commit,
  // then an inertia settle C lands with NO gesture in between — must not
  // fabricate isDirty. A genuine gesture + settle afterward must still mark
  // dirty, and a programmatic fit after commit must still re-baseline
  // without requiring a gesture.
  it('a genuine new settle landing after commit with no further user gesture must not fabricate isDirty (Issue #2426 fix cycle 4)', () => {
    const commitResultScope = vi.fn();
    const { result, rerender } = renderHook(
      (props: { resultScope: CommittedResultScope; cameraIntent: CameraIntent | null }) => {
        const tracker = useDiscoverViewportTracker({ mobileView: 'MAP', city: 'bangalore' });
        const search = useDiscoverViewportSearch({
          mapBbox: tracker.mapBbox,
          cameraIntent: props.cameraIntent,
          resultScope: props.resultScope,
          commitResultScope,
          commitBbox: tracker.commitBbox,
          userCameraGestureSeq: tracker.userCameraGestureSeq,
        });
        return { tracker, search };
      },
      { initialProps: { resultScope: makeResultScope(ELIGIBLE_SCOPE), cameraIntent: null } },
    );

    // Baseline settle (no drift yet).
    act(() => {
      result.current.tracker.handleBoundsChange(BASE_BBOX);
      vi.advanceTimersByTime(300);
    });

    // Settles A and B: two drag-driven settles from the SAME gesture, both
    // landed (B's debounce already resolved, unlike the earlier test).
    const settleA: [number, number, number, number] = [12.95, 77.5, 13.05, 77.6];
    const settleB: [number, number, number, number] = [12.955, 77.505, 13.055, 77.605];
    act(() => {
      result.current.tracker.handleUserCameraGesture();
      result.current.tracker.handleBoundsChange(settleA);
      vi.advanceTimersByTime(300);
    });
    act(() => {
      result.current.tracker.handleBoundsChange(settleB);
      vi.advanceTimersByTime(300);
    });
    expect(result.current.search.isDirty).toBe(true);

    // Commit using B's already-landed bbox.
    act(() => {
      result.current.search.activate();
    });
    expect(commitResultScope).toHaveBeenCalledWith(
      { kind: 'VIEWPORT', bounds: { s: settleB[0], w: settleB[1], n: settleB[2], e: settleB[3] } },
      { history: 'replace' },
    );
    rerender({
      resultScope: makeResultScope({
        kind: 'VIEWPORT',
        bounds: { s: settleB[0], w: settleB[1], n: settleB[2], e: settleB[3] },
      }),
      cameraIntent: null,
    });
    expect(result.current.search.isDirty).toBe(false);

    // Settle C: a genuine NEW moveend (trailing drag inertia) fires and its
    // debounce lands — but with NO gesture event in between. This is the
    // captured live-run failure mode: commitBbox cannot help here since C
    // was never pending at commit time; it's a fresh call afterward.
    const settleC: [number, number, number, number] = [12.933, 77.531, 13.048, 77.646];
    act(() => {
      result.current.tracker.handleBoundsChange(settleC);
      vi.advanceTimersByTime(300);
    });
    expect(
      result.current.search.isDirty,
      'a settle landing after commit with no further user gesture must not fabricate isDirty',
    ).toBe(false);

    // Now a genuine gesture + settle DOES mark dirty.
    const settleD: [number, number, number, number] = [12.5, 77.0, 13.5, 78.0];
    act(() => {
      result.current.tracker.handleUserCameraGesture();
      result.current.tracker.handleBoundsChange(settleD);
      vi.advanceTimersByTime(300);
    });
    expect(
      result.current.search.isDirty,
      'a genuine gesture followed by a settle must still correctly mark the viewport dirty',
    ).toBe(true);

    // A programmatic fit (cameraIntent.seq bump) after this must still
    // re-baseline WITHOUT requiring a gesture — it re-seeds the reference
    // from whatever mapBbox already is, so isDirty goes false immediately.
    act(() => {
      rerender({
        resultScope: makeResultScope({
          kind: 'VIEWPORT',
          bounds: { s: settleB[0], w: settleB[1], n: settleB[2], e: settleB[3] },
        }),
        cameraIntent: makeCameraIntent(1),
      });
    });
    expect(
      result.current.search.isDirty,
      'a programmatic fit must re-baseline without requiring a user gesture',
    ).toBe(false);
  });
});

describe('useDiscoverViewportSearch — eligibility gating (MUST-HAVE #2, PR review 5085561270)', () => {
  it('is not eligible, not dirty, and never fires commitResultScope at City root (activeScope null) even past drift tolerance', () => {
    const commitResultScope = vi.fn();
    const { result, rerender } = renderHook(
      (props: UseDiscoverViewportSearchParams) => useDiscoverViewportSearch(props),
      { initialProps: makeParams({ resultScope: makeResultScope(null), commitResultScope }) },
    );
    expect(result.current.isEligible).toBe(false);
    expect(result.current.isDirty).toBe(false);

    const driftedBbox: [number, number, number, number] = [12.95, 77.5, 13.05, 77.6];
    rerender(
      makeParams({ resultScope: makeResultScope(null), mapBbox: driftedBbox, commitResultScope }),
    );
    expect(result.current.isDirty).toBe(false);

    result.current.activate();
    expect(commitResultScope).not.toHaveBeenCalled();
  });

  it('is ineligible at Direction/top-of-Schools/top-of-Agri (no committed scope)', () => {
    const { result } = renderHook(() =>
      useDiscoverViewportSearch(makeParams({ resultScope: makeResultScope(null) })),
    );
    expect(result.current.isEligible).toBe(false);
  });

  it('is eligible once a committed AREA_SET scope is active', () => {
    const { result } = renderHook(() =>
      useDiscoverViewportSearch(
        makeParams({ resultScope: makeResultScope({ kind: 'AREA_SET', areaKeys: ['a', 'b'] }) }),
      ),
    );
    expect(result.current.isEligible).toBe(true);
  });

  it('is eligible once a committed POLYGON scope is active', () => {
    const { result } = renderHook(() =>
      useDiscoverViewportSearch(
        makeParams({
          resultScope: makeResultScope({
            kind: 'POLYGON',
            coordinates: [
              [12.9, 77.5],
              [13.0, 77.6],
            ],
          }),
        }),
      ),
    );
    expect(result.current.isEligible).toBe(true);
  });

  it('is eligible once a committed VIEWPORT scope is active (Issue #2015 repeated-search fix — the regression this test guards)', () => {
    const { result } = renderHook(() =>
      useDiscoverViewportSearch(
        makeParams({
          resultScope: makeResultScope({
            kind: 'VIEWPORT',
            bounds: { s: 12.9, w: 77.5, n: 13.0, e: 77.6 },
          }),
        }),
      ),
    );
    expect(result.current.isEligible).toBe(true);
  });

  it('going back to an ineligible level while dirty does not crash and flips isDirty/isEligible to false', () => {
    const { result, rerender } = renderHook(
      (props: UseDiscoverViewportSearchParams) => useDiscoverViewportSearch(props),
      { initialProps: makeParams() },
    );

    const driftedBbox: [number, number, number, number] = [12.95, 77.5, 13.05, 77.6];
    rerender(makeParams({ mapBbox: driftedBbox, userCameraGestureSeq: 1 }));
    expect(result.current.isEligible).toBe(true);
    expect(result.current.isDirty).toBe(true);

    // User navigates back up to City root — activeScope clears.
    expect(() =>
      rerender(
        makeParams({ mapBbox: driftedBbox, userCameraGestureSeq: 1, resultScope: makeResultScope(null) }),
      ),
    ).not.toThrow();
    expect(result.current.isEligible).toBe(false);
    expect(result.current.isDirty).toBe(false);
  });

  it('activate() no-ops when ineligible, even with a live mapBbox', () => {
    const commitResultScope = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverViewportSearch(makeParams({ resultScope: makeResultScope(null), commitResultScope })),
    );

    result.current.activate();

    expect(commitResultScope).not.toHaveBeenCalled();
  });
});

// #2750 PR-5 B1 T3 — issue-2015-search-this-area-viewport ("panning alone does NOT commit", e2e L209-216).
describe('useDiscoverViewportSearch — panning alone never commits (#2750 PR-5 2015-N9)', () => {
  // #2750 PR-5 2015-N9
  it('drift past tolerance with a user gesture sets isDirty but never calls commitResultScope until activate()', () => {
    const commitResultScope = vi.fn();
    const { result, rerender } = renderHook(
      (props: UseDiscoverViewportSearchParams) => useDiscoverViewportSearch(props),
      { initialProps: makeParams({ commitResultScope }) },
    );

    // Control arm: a gesture whose drift stays within tolerance is neither dirty nor a commit.
    const withinTolerance: [number, number, number, number] = [12.901, 77.501, 13.001, 77.601];
    rerender(makeParams({ commitResultScope, mapBbox: withinTolerance, userCameraGestureSeq: 1 }));
    expect(result.current.isDirty).toBe(false);
    expect(commitResultScope).not.toHaveBeenCalled();

    // The pan: past tolerance AND a real gesture (so the gesture gate does not mask a dirty-time commit).
    const driftedBbox: [number, number, number, number] = [12.95, 77.5, 13.05, 77.6];
    rerender(makeParams({ commitResultScope, mapBbox: driftedBbox, userCameraGestureSeq: 1 }));
    expect(result.current.isDirty).toBe(true);
    expect(commitResultScope).not.toHaveBeenCalled();

    // A further idle render with the same dirty viewport still commits nothing.
    rerender(makeParams({ commitResultScope, mapBbox: driftedBbox, userCameraGestureSeq: 1 }));
    expect(result.current.isDirty).toBe(true);
    expect(commitResultScope).not.toHaveBeenCalled();

    // Only the explicit activation commits, once, with the drifted bounds as a VIEWPORT REPLACE.
    act(() => {
      result.current.activate();
    });
    expect(commitResultScope).toHaveBeenCalledTimes(1);
    expect(commitResultScope).toHaveBeenCalledWith(
      { kind: 'VIEWPORT', bounds: { s: driftedBbox[0], w: driftedBbox[1], n: driftedBbox[2], e: driftedBbox[3] } },
      { history: 'replace' },
    );
  });
});
