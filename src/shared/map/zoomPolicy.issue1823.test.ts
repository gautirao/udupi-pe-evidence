/**
 * Issue #1823 — unit coverage for the pure predicates added to zoomPolicy.ts:
 * `isRestoreAuthoritative` (the #2083 restore-wins-on-POP guard, consolidated
 * to a single publish-boundary check) and `resolveMarkerRevealMode` (a
 * pure, unwired input function for #1762's marker-mode transition).
 */
import { describe, it, expect } from 'vitest';
import {
  isRestoreAuthoritative,
  resolveMarkerRevealMode,
  CLUSTER_DISABLE_AT_ZOOM,
} from './zoomPolicy';

describe('Issue #1823 — isRestoreAuthoritative', () => {
  it('POP + a persisted viewport -> true (restore is authoritative, suppress the fit)', () => {
    expect(
      isRestoreAuthoritative({ historyAction: 'POP', viewport: { lat: 1, lon: 1, zoom: 10 } }),
    ).toBe(true);
  });

  it('POP + no viewport -> false (nothing to restore, fit normally)', () => {
    expect(isRestoreAuthoritative({ historyAction: 'POP', viewport: null })).toBe(false);
    expect(isRestoreAuthoritative({ historyAction: 'POP', viewport: undefined })).toBe(false);
  });

  it('PUSH + a viewport -> false (a forward navigation is never a restoration)', () => {
    expect(
      isRestoreAuthoritative({ historyAction: 'PUSH', viewport: { lat: 1, lon: 1, zoom: 10 } }),
    ).toBe(false);
  });

  it('PUSH + no viewport -> false', () => {
    expect(isRestoreAuthoritative({ historyAction: 'PUSH', viewport: null })).toBe(false);
  });

  it('undefined historyAction (no history metadata at all) -> false', () => {
    expect(
      isRestoreAuthoritative({ historyAction: undefined, viewport: { lat: 1, lon: 1, zoom: 10 } }),
    ).toBe(false);
  });
});

describe('Issue #1823 — resolveMarkerRevealMode', () => {
  // Issue #1823 (fix cycle 1) — the prior NEUTRAL_MARKER_COUNT of 50 only
  // stayed non-triggering (density <= threshold) for the one hand-picked
  // 1200x800 tuple; at a realistic 1440x900 desktop viewport the same count
  // drops density below MARKER_REVEAL_DENSITY_THRESHOLD_PER_10K_PX and flips
  // the zoom<threshold branch to 'individualPins', silently invalidating the
  // "reproduces today's zoom-only behaviour" claim. 100 stays above the
  // threshold (and above MARKER_REVEAL_COUNT_FLOOR) at both viewport sizes,
  // so it is genuinely non-triggering across realistic desktop widths.
  const NEUTRAL_MARKER_COUNT = 100;
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

  it('equivalence with today\'s CLUSTER_DISABLE_AT_ZOOM boolean: zoom < threshold -> clusteredOverview (holds across realistic viewport sizes)', () => {
    for (const [w, h] of [
      [NEUTRAL_VIEWPORT_W, NEUTRAL_VIEWPORT_H],
      [REALISTIC_DESKTOP_VIEWPORT_W, REALISTIC_DESKTOP_VIEWPORT_H],
    ]) {
      expect(
        resolveMarkerRevealMode(CLUSTER_DISABLE_AT_ZOOM - 1, NEUTRAL_MARKER_COUNT, w, h, NO_EXTENT),
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
