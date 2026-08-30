/**
 * Issue #1762 fix-cycle 5 — unit coverage for `computeSpiderfyDistanceMultiplier`,
 * the viewport-aware clamp added in response to a WORKDONE_REVIEW BLOCKING
 * finding: `spiderfyDistanceMultiplier:3.5` (fix-cycle 3) widened the
 * spiderfy fan radius uniformly with no upper bound tied to viewport size
 * or child count, so a denser coincident cluster tapped near a narrow
 * mobile viewport's edge could theoretically fan off-screen. See the
 * module-level comment above `computeSpiderfyDistanceMultiplier` in
 * `../zoomPolicy.ts` for the full derivation (mirrors
 * node_modules/leaflet.markercluster's own `_generatePointsCircle` leg-
 * length/chord formulas).
 */
import { describe, it, expect } from 'vitest';
import {
  computeSpiderfyDistanceMultiplier,
  SPIDERFY_DISTANCE_MULTIPLIER_BASE,
} from '../zoomPolicy';

describe('Issue #1762 fix-cycle 5 — computeSpiderfyDistanceMultiplier', () => {
  it('a spacious desktop viewport (1920x1080) never clamps below the fix-cycle-3 base, for any circle-mode count up to the spiral switchover', () => {
    for (let count = 2; count <= 8; count++) {
      expect(computeSpiderfyDistanceMultiplier(count, 1920, 1080)).toBe(SPIDERFY_DISTANCE_MULTIPLIER_BASE);
    }
  });

  it('a more modest 1366x768 desktop viewport stays at the base for every circle-mode count except the densest (8-member) one, which is only marginally clamped — the clamp is primarily a narrow-mobile-viewport concern, not a typical-desktop one', () => {
    for (let count = 2; count <= 7; count++) {
      expect(computeSpiderfyDistanceMultiplier(count, 1366, 768)).toBe(SPIDERFY_DISTANCE_MULTIPLIER_BASE);
    }
    const eightMember = computeSpiderfyDistanceMultiplier(8, 1366, 768);
    expect(eightMember).toBeLessThan(SPIDERFY_DISTANCE_MULTIPLIER_BASE);
    expect(eightMember).toBeGreaterThanOrEqual(3.3);
  });

  it('the exact fix-cycle-3 5-member coincident-cluster fixture (800x600 stub container) stays at the base, unchanged — regression guard for the already-shipped cycle-3 fix', () => {
    // Mirrors PropertyMap.clusterTapFit.test.tsx's mockClusterContainer
    // (800x600) and the cycle-3 test's childCount:5 coincident cluster.
    expect(computeSpiderfyDistanceMultiplier(5, 800, 600)).toBe(SPIDERFY_DISTANCE_MULTIPLIER_BASE);
  });

  it('a dense (8-member) coincident cluster on a narrow mobile viewport (390x844) is clamped BELOW the base, but not below the re-derived per-count pill-clearance floor', () => {
    const result = computeSpiderfyDistanceMultiplier(8, 390, 844);
    expect(result).toBeLessThan(SPIDERFY_DISTANCE_MULTIPLIER_BASE);
    // Re-derived floor for count=8 (chord = 2*legLength*sin(pi/8) >= 90px):
    // legLength >= 90/(2*sin(pi/8)) ≈ 117.6px -> multiplier ≈
    // 117.6*2*pi/(25*10) ≈ 2.955. Assert with headroom either side of that
    // hand-derivation so this test isn't brittle to float rounding.
    expect(result).toBeGreaterThanOrEqual(2.9);
    expect(result).toBeLessThan(3.5);
  });

  it('scales the clamp tighter as the viewport narrows further, for the same child count', () => {
    const mobile = computeSpiderfyDistanceMultiplier(8, 390, 844);
    const tinier = computeSpiderfyDistanceMultiplier(8, 320, 568);
    expect(tinier).toBeLessThanOrEqual(mobile);
    // Still never below the base's proven floor for this count.
    expect(tinier).toBeGreaterThanOrEqual(2.9);
  });

  it('spiral mode (childCount >= 9, leaflet.markercluster\'s own circle->spiral switchover) is deliberately left unclamped at the base, even on a narrow viewport', () => {
    expect(computeSpiderfyDistanceMultiplier(9, 320, 568)).toBe(SPIDERFY_DISTANCE_MULTIPLIER_BASE);
    expect(computeSpiderfyDistanceMultiplier(50, 320, 568)).toBe(SPIDERFY_DISTANCE_MULTIPLIER_BASE);
  });

  it('a degenerate (< 2 member) cluster and an invalid/zero viewport both fall back to the base rather than clamp against a bogus bound', () => {
    expect(computeSpiderfyDistanceMultiplier(1, 390, 844)).toBe(SPIDERFY_DISTANCE_MULTIPLIER_BASE);
    expect(computeSpiderfyDistanceMultiplier(8, 0, 0)).toBe(SPIDERFY_DISTANCE_MULTIPLIER_BASE);
    expect(computeSpiderfyDistanceMultiplier(8, -1, 844)).toBe(SPIDERFY_DISTANCE_MULTIPLIER_BASE);
  });

  it('never returns a value above the fix-cycle-3 base, for any count/viewport combination', () => {
    const counts = [2, 3, 4, 5, 6, 7, 8, 9, 20];
    const viewports: Array<[number, number]> = [
      [1920, 1080],
      [1366, 768],
      [390, 844],
      [320, 568],
      [768, 1024],
    ];
    for (const count of counts) {
      for (const [w, h] of viewports) {
        expect(computeSpiderfyDistanceMultiplier(count, w, h)).toBeLessThanOrEqual(
          SPIDERFY_DISTANCE_MULTIPLIER_BASE,
        );
      }
    }
  });
});
