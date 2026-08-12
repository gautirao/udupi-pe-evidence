/**
 * Issue #1823 — unit coverage for the pure predicates added to zoomPolicy.ts:
 * `isRestoreAuthoritative` (the #2083 restore-wins-on-POP guard, consolidated
 * to a single publish-boundary check) and `resolveMarkerRevealMode` (a
 * pure, unwired input function for #1762's marker-mode transition).
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  isRestoreAuthoritative,
  getPageNavigationType,
  resolveMarkerRevealMode,
  CLUSTER_DISABLE_AT_ZOOM,
  computeCameraPadding,
  DESKTOP_CAMERA_PADDING,
  MOBILE_CAMERA_PADDING,
} from './zoomPolicy';

describe('Issue #1823 — isRestoreAuthoritative', () => {
  it('POP + a persisted viewport + a warm (non-cold) session -> true (restore is authoritative, suppress the fit)', () => {
    expect(
      isRestoreAuthoritative({
        historyAction: 'POP',
        viewport: { lat: 1, lon: 1, zoom: 10 },
        isColdNavigate: false,
      }),
    ).toBe(true);
  });

  it('POP + no viewport -> false (nothing to restore, fit normally)', () => {
    expect(isRestoreAuthoritative({ historyAction: 'POP', viewport: null, isColdNavigate: false })).toBe(
      false,
    );
    expect(
      isRestoreAuthoritative({ historyAction: 'POP', viewport: undefined, isColdNavigate: false }),
    ).toBe(false);
  });

  it('PUSH + a viewport -> false (a forward navigation is never a restoration)', () => {
    expect(
      isRestoreAuthoritative({
        historyAction: 'PUSH',
        viewport: { lat: 1, lon: 1, zoom: 10 },
        isColdNavigate: false,
      }),
    ).toBe(false);
  });

  it('PUSH + no viewport -> false', () => {
    expect(
      isRestoreAuthoritative({ historyAction: 'PUSH', viewport: null, isColdNavigate: false }),
    ).toBe(false);
  });

  it('undefined historyAction (no history metadata at all) -> false', () => {
    expect(
      isRestoreAuthoritative({
        historyAction: undefined,
        viewport: { lat: 1, lon: 1, zoom: 10 },
        isColdNavigate: false,
      }),
    ).toBe(false);
  });

  // Issue #2143 — react-router reports 'POP' as the INITIAL action on every
  // hard page load (typed URL, bookmark, new tab), indistinguishable from a
  // genuine Back/Forward by historyAction alone. isColdNavigate is the
  // caller-computed signal that tells them apart.
  it('#2143: POP + a viewport + a cold navigation -> false (never trust an inherited viewport on a fresh hard load)', () => {
    expect(
      isRestoreAuthoritative({
        historyAction: 'POP',
        viewport: { lat: 1, lon: 1, zoom: 10 },
        isColdNavigate: true,
      }),
    ).toBe(false);
  });
});

// Issue #2143 — getPageNavigationType's degrade-to-undefined fallback. Callers
// (useDiscoverCameraOrchestration.ts's isColdNavigate composite) must treat
// undefined the same as 'navigate' (untrusted/cold) — never crash and never
// silently trust a viewport just because the API was unavailable.
describe('Issue #2143 — getPageNavigationType (Performance API unavailable/throwing fallback)', () => {
  const performanceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');

  afterEach(() => {
    if (performanceDescriptor) {
      Object.defineProperty(globalThis, 'performance', performanceDescriptor);
    }
  });

  it('returns undefined when performance.getEntriesByType is missing (older browser / minimal test env)', () => {
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: { ...globalThis.performance, getEntriesByType: undefined },
    });
    expect(getPageNavigationType()).toBeUndefined();
  });

  it('returns undefined (does not throw) when performance.getEntriesByType itself throws', () => {
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: {
        ...globalThis.performance,
        getEntriesByType: () => {
          throw new Error('Navigation Timing unavailable in this environment');
        },
      },
    });
    expect(() => getPageNavigationType()).not.toThrow();
    expect(getPageNavigationType()).toBeUndefined();
  });

  it('composed with isRestoreAuthoritative: an undefined page navigation type resolves conservatively (isColdNavigate stays true, fit still fires)', () => {
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: { ...globalThis.performance, getEntriesByType: undefined },
    });
    const pageNavType = getPageNavigationType();
    // Mirrors useDiscoverCameraOrchestration.ts's composite: no in-app
    // transition observed yet, and the page's own nav type is neither
    // 'reload' nor 'back_forward' (undefined falls into that "neither" case).
    const isColdNavigate =
      pageNavType !== 'reload' && pageNavType !== ('back_forward' as typeof pageNavType);
    expect(isColdNavigate).toBe(true);
    expect(
      isRestoreAuthoritative({
        historyAction: 'POP',
        viewport: { lat: 1, lon: 1, zoom: 10 },
        isColdNavigate,
      }),
    ).toBe(false);
  });
});

describe('Issue #1823 — resolveMarkerRevealMode', () => {
  // Issue #1823 (fix cycle 1) — the prior NEUTRAL_MARKER_COUNT of 50 only
  // stayed non-triggering (density <= threshold) for the one hand-picked
  // 1200x800 tuple; at a realistic 1440x900 desktop viewport the same count
  // drops density below MARKER_REVEAL_DENSITY_THRESHOLD_PER_10K_PX and flips
  // the zoom<threshold branch to 'individualPins', silently invalidating the
  // "reproduces today's zoom-only behaviour" claim. Cycle 1 moved it to 100
  // specifically because 100 stays ABOVE the density threshold (dense) at
  // both viewport sizes — which was "non-triggering" only because the OLD
  // implementation short-circuited on zoom BEFORE ever computing density at
  // zoom >= CLUSTER_DISABLE_AT_ZOOM, so a dense count never got the chance
  // to matter there.
  //
  // PR #2128 final review (HIGH fix) — that short-circuit is exactly the bug
  // this cycle fixes: density is now checked unconditionally, before zoom,
  // so a dense set (100 IS dense: 1.04 markers/10k px² at 1200x800, 0.77 at
  // 1440x900, both > the 0.5 threshold) now correctly returns
  // 'clusteredOverview' regardless of zoom — which is the fix working as
  // intended, not a regression. That makes 100 the WRONG choice for a test
  // whose entire point is proving zoom still decides the outcome for a
  // genuinely NEUTRAL (non-dense) count. Recalibrated to 40, which stays
  // non-dense at both tuples (0.42 at 1200x800, 0.31 at 1440x900, both <
  // 0.5) — the true minimal fix here was the recalibration, not the
  // production code; see resolveMarkerRevealMode's own new dense-set test
  // below for the behaviour 100 would now actually exercise.
  const NEUTRAL_MARKER_COUNT = 40;
  const NEUTRAL_VIEWPORT_W = 1200;
  const NEUTRAL_VIEWPORT_H = 800;
  const REALISTIC_DESKTOP_VIEWPORT_W = 1440;
  const REALISTIC_DESKTOP_VIEWPORT_H = 900;
  const NO_EXTENT = null;

  it('equivalence with today\'s CLUSTER_DISABLE_AT_ZOOM boolean: zoom >= threshold -> individualPins', () => {
    for (const [w, h] of [
      [NEUTRAL_VIEWPORT_W, NEUTRAL_VIEWPORT_H],
      [REALISTIC_DESKTOP_VIEWPORT_W, REALISTIC_DESKTOP_VIEWPORT_H],
    ]) {
      expect(
        resolveMarkerRevealMode(CLUSTER_DISABLE_AT_ZOOM, NEUTRAL_MARKER_COUNT, w, h, NO_EXTENT),
      ).toBe('individualPins');

      expect(
        resolveMarkerRevealMode(CLUSTER_DISABLE_AT_ZOOM + 1, NEUTRAL_MARKER_COUNT, w, h, NO_EXTENT),
      ).toBe('individualPins');
    }
  });

  // PR #2128 final review (HIGH fix) — retitled from "equivalence with
  // today's zoom boolean" (its cycle-1 name). Post-fix, `clusteredOverview`
  // below the zoom threshold is no longer something zoom decides on its
  // own: a genuinely non-dense count (NEUTRAL_MARKER_COUNT) returns
  // 'individualPins' at EITHER zoom regime (see the "high marker count
  // spread over a large viewport stays individualPins" test) — the only
  // way to observe 'clusteredOverview' for a real (non-zero-area) viewport
  // is via density. This test now honestly exercises that: a DENSE count
  // (500, reused from the dedicated dense-set tests above) stays
  // clusteredOverview below the threshold too, across both viewport tuples
  // — the density decision, not a zoom-only one.
  it('a dense marker set stays clusteredOverview below the zoom threshold too (holds across realistic viewport sizes) — density-driven, not a zoom-only decision', () => {
    const DENSE_MARKER_COUNT = 500;
    for (const [w, h] of [
      [NEUTRAL_VIEWPORT_W, NEUTRAL_VIEWPORT_H],
      [REALISTIC_DESKTOP_VIEWPORT_W, REALISTIC_DESKTOP_VIEWPORT_H],
    ]) {
      expect(
        resolveMarkerRevealMode(CLUSTER_DISABLE_AT_ZOOM - 1, DENSE_MARKER_COUNT, w, h, NO_EXTENT),
      ).toBe('clusteredOverview');
    }
  });

  it('documents the intended divergence: a lower marker count on a wider realistic viewport (1440x900) lets density override the zoom floor', () => {
    // Same "50 markers, zoom below threshold" shape the old (coincidental)
    // equivalence test used — at 1200x800 this still returns
    // 'clusteredOverview' (matching zoom-only behaviour), but at 1440x900 the
    // lower density flips it to 'individualPins'. This is signal (c) — the
    // density tiebreaker — intentionally overriding the zoom floor, not a
    // bug; see resolveMarkerRevealMode's JSDoc for the signal priority order.
    expect(
      resolveMarkerRevealMode(CLUSTER_DISABLE_AT_ZOOM - 1, 50, NEUTRAL_VIEWPORT_W, NEUTRAL_VIEWPORT_H, NO_EXTENT),
    ).toBe('clusteredOverview');
    expect(
      resolveMarkerRevealMode(
        CLUSTER_DISABLE_AT_ZOOM - 1,
        50,
        REALISTIC_DESKTOP_VIEWPORT_W,
        REALISTIC_DESKTOP_VIEWPORT_H,
        NO_EXTENT,
      ),
    ).toBe('individualPins');
  });

  // PR #2128 final review (HIGH fix) — the reviewer's required case: a
  // dense/high-count marker set must NOT reveal all pins solely because
  // zoom crossed CLUSTER_DISABLE_AT_ZOOM. Before this fix, the zoom check
  // was an unconditional early return ABOVE the density check, so a
  // 500/1000-marker set at this exact viewport would have incorrectly
  // returned 'individualPins' the moment zoom reached the threshold.
  it('a dense 500-marker set stays clusteredOverview AT the zoom threshold — density overrides zoom, not the other way round', () => {
    expect(
      resolveMarkerRevealMode(CLUSTER_DISABLE_AT_ZOOM, 500, NEUTRAL_VIEWPORT_W, NEUTRAL_VIEWPORT_H, NO_EXTENT),
    ).toBe('clusteredOverview');
  });

  it('a dense 1000-marker set stays clusteredOverview ABOVE the zoom threshold — density overrides zoom, not the other way round', () => {
    expect(
      resolveMarkerRevealMode(CLUSTER_DISABLE_AT_ZOOM + 1, 1000, NEUTRAL_VIEWPORT_W, NEUTRAL_VIEWPORT_H, NO_EXTENT),
    ).toBe('clusteredOverview');
  });

  // Companion case: proves the fix above did NOT come at the cost of the
  // original zoom-only behaviour for a genuinely non-dense set — high zoom
  // + low/neutral density must still reveal individual pins. Reuses
  // NEUTRAL_MARKER_COUNT (recalibrated to 40, non-dense at both tuples —
  // see that constant's own comment), the SAME inputs the equivalence test
  // above already exercises.
  it('a non-dense marker set still reveals individualPins at/above the zoom threshold (the fix does not disable zoom entirely)', () => {
    expect(
      resolveMarkerRevealMode(CLUSTER_DISABLE_AT_ZOOM, NEUTRAL_MARKER_COUNT, NEUTRAL_VIEWPORT_W, NEUTRAL_VIEWPORT_H, NO_EXTENT),
    ).toBe('individualPins');
    expect(
      resolveMarkerRevealMode(
        CLUSTER_DISABLE_AT_ZOOM + 1,
        NEUTRAL_MARKER_COUNT,
        REALISTIC_DESKTOP_VIEWPORT_W,
        REALISTIC_DESKTOP_VIEWPORT_H,
        NO_EXTENT,
      ),
    ).toBe('individualPins');
  });

  it('a low marker count stays legible regardless of zoom (signal (b) overrides the zoom floor)', () => {
    expect(
      resolveMarkerRevealMode(1, 3, NEUTRAL_VIEWPORT_W, NEUTRAL_VIEWPORT_H, NO_EXTENT),
    ).toBe('individualPins');
  });

  it('a high marker count in a small viewport falls back to clusteredOverview (signal (c) density tiebreaker)', () => {
    expect(
      resolveMarkerRevealMode(CLUSTER_DISABLE_AT_ZOOM - 1, 500, 320, 240, NO_EXTENT),
    ).toBe('clusteredOverview');
  });

  it('a high marker count spread over a large viewport stays individualPins (low density)', () => {
    expect(
      resolveMarkerRevealMode(CLUSTER_DISABLE_AT_ZOOM - 1, 20, NEUTRAL_VIEWPORT_W, NEUTRAL_VIEWPORT_H, NO_EXTENT),
    ).toBe('individualPins');
  });

  it('degenerate zero-area viewport does not throw and falls back to clusteredOverview', () => {
    expect(
      resolveMarkerRevealMode(CLUSTER_DISABLE_AT_ZOOM - 1, NEUTRAL_MARKER_COUNT, 0, 0, NO_EXTENT),
    ).toBe('clusteredOverview');
  });
});

// PR #2128 final review (HIGH fix) — computeCameraPadding no longer accepts
// a `bottomOcclusionPx` argument: a single `padding: [x, y]` fitBounds tuple
// is NOT directional in Leaflet (it applies to both top and bottom), so
// baking occlusion into this tuple applied it at double the intended cost.
// The real asymmetric-padding assertion (occlusion added to ONLY
// `paddingBottomRight`, via Leaflet's actual directional API) now lives in
// PropertyMap.areaPanner.test.tsx, at AreaPanner's real fitBounds call site.
// This describe block just confirms the plain width-responsive behaviour
// this function reverted to is unchanged.
describe('Issue #1823 — computeCameraPadding (width-responsive tiers only)', () => {
  it('desktop vs mobile tiers, and undefined degrades to desktop', () => {
    expect(computeCameraPadding(1440)).toEqual(DESKTOP_CAMERA_PADDING);
    expect(computeCameraPadding(600)).toEqual(MOBILE_CAMERA_PADDING);
    expect(computeCameraPadding(undefined)).toEqual(DESKTOP_CAMERA_PADDING);
  });
});
