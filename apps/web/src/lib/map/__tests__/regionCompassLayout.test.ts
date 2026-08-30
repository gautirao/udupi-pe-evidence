/**
 * Unit tests for the pure region compass-layout geometry (top-level Discover
 * map macro-region markers — city landing). Leaflet-free by design: only
 * plain trig against container-point primitives.
 */

import { describe, it, expect } from 'vitest';
import {
  compassPointFor,
  computeCompassLayout,
  computeSafeCompassRadius,
  isCentralRegionKey,
  CENTRAL_REGION_KEY,
} from '../regionCompassLayout';

const ALL_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('isCentralRegionKey', () => {
  it('true only for the exact CENTRAL region_key', () => {
    expect(isCentralRegionKey('CENTRAL')).toBe(true);
    expect(isCentralRegionKey(CENTRAL_REGION_KEY)).toBe(true);
    expect(isCentralRegionKey('N')).toBe(false);
    expect(isCentralRegionKey('central')).toBe(false); // backend region_key is uppercase — no case-folding
  });
});

describe('compassPointFor', () => {
  const layout = { centerX: 400, centerY: 300, radius: 100 };

  it('CENTRAL resolves to the exact layout centre', () => {
    expect(compassPointFor('CENTRAL', layout)).toEqual({ x: 400, y: 300 });
  });

  it('all 8 outer directions are equidistant from the centre, within floating-point tolerance', () => {
    for (const dir of ALL_DIRECTIONS) {
      const point = compassPointFor(dir, layout);
      expect(distance(point, { x: layout.centerX, y: layout.centerY })).toBeCloseTo(layout.radius, 9);
    }
  });

  it('North is vertically above Central (same x, smaller y — screen-space up)', () => {
    const north = compassPointFor('N', layout);
    expect(north.x).toBeCloseTo(layout.centerX, 9);
    expect(north.y).toBeCloseTo(layout.centerY - layout.radius, 9);
  });

  it('South is vertically below Central (same x, larger y — screen-space down)', () => {
    const south = compassPointFor('S', layout);
    expect(south.x).toBeCloseTo(layout.centerX, 9);
    expect(south.y).toBeCloseTo(layout.centerY + layout.radius, 9);
  });

  it('East and West are horizontally aligned with Central (same y)', () => {
    const east = compassPointFor('E', layout);
    const west = compassPointFor('W', layout);
    expect(east.y).toBeCloseTo(layout.centerY, 9);
    expect(west.y).toBeCloseTo(layout.centerY, 9);
    expect(east.x).toBeCloseTo(layout.centerX + layout.radius, 9);
    expect(west.x).toBeCloseTo(layout.centerX - layout.radius, 9);
  });

  it('diagonal directions land in their correct screen quadrant relative to Central', () => {
    const ne = compassPointFor('NE', layout);
    expect(ne.x).toBeGreaterThan(layout.centerX); // east-of-centre
    expect(ne.y).toBeLessThan(layout.centerY); // above-centre (screen-space up)

    const se = compassPointFor('SE', layout);
    expect(se.x).toBeGreaterThan(layout.centerX);
    expect(se.y).toBeGreaterThan(layout.centerY);

    const sw = compassPointFor('SW', layout);
    expect(sw.x).toBeLessThan(layout.centerX);
    expect(sw.y).toBeGreaterThan(layout.centerY);

    const nw = compassPointFor('NW', layout);
    expect(nw.x).toBeLessThan(layout.centerX);
    expect(nw.y).toBeLessThan(layout.centerY);
  });

  it('an unrecognised region_key does not throw and does not collapse to the layout centre', () => {
    // Issue #1956 AC6.9 — a silent centre fallback let unrelated unrecognised
    // codes stack on top of each other (and on the CENTRAL marker). The
    // fallback must still be "safe" (bounded, deterministic, on-circle) but
    // must NOT reproduce that collapse.
    const point = compassPointFor('bogus', layout);
    expect(point).not.toEqual({ x: 400, y: 300 });
    expect(distance(point, { x: layout.centerX, y: layout.centerY })).toBeCloseTo(layout.radius, 9);
  });

  it('two different unrecognised codes fall back to two different positions (no stacking)', () => {
    // This is the exact defect shape from AC6.9: three different unmatched
    // codes (SOUTHEAST/NORTHEAST/SOUTHWEST) all resolving to one identical
    // point. Proven directly against compassPointFor's fallback path here;
    // the client-side normalisation that keeps these three specific codes
    // OFF this fallback path in the first place is covered separately in
    // AreaMarkerLayer's own tests.
    const a = compassPointFor('SOUTHEAST', layout);
    const b = compassPointFor('NORTHEAST', layout);
    const c = compassPointFor('SOUTHWEST', layout);
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
    expect(a).not.toEqual(c);
  });

  it('an unrecognised code\'s fallback position is deterministic (same code -> same point every call)', () => {
    expect(compassPointFor('bogus', layout)).toEqual(compassPointFor('bogus', layout));
  });

  it('input ordering never matters — each key maps to the same point regardless of array order', () => {
    const forwardByKey = new Map(ALL_DIRECTIONS.map((d) => [d, compassPointFor(d, layout)]));
    const reversedByKey = new Map(
      [...ALL_DIRECTIONS].reverse().map((d) => [d, compassPointFor(d, layout)]),
    );
    for (const dir of ALL_DIRECTIONS) {
      expect(forwardByKey.get(dir)).toEqual(reversedByKey.get(dir));
    }
  });
});

describe('computeSafeCompassRadius', () => {
  it('clamps to the minimum radius on a very small/short container', () => {
    expect(computeSafeCompassRadius(200, 150)).toBeGreaterThanOrEqual(70);
  });

  it('clamps to the maximum radius on a very large container', () => {
    expect(computeSafeCompassRadius(4000, 4000)).toBeLessThanOrEqual(160);
  });

  it('grows with container size between the clamps', () => {
    const small = computeSafeCompassRadius(500, 500);
    const large = computeSafeCompassRadius(900, 900);
    expect(large).toBeGreaterThanOrEqual(small);
  });

  it('is governed by the constrained dimension (never overflows a short/narrow container)', () => {
    // A short (small-height) container is the binding constraint regardless
    // of how wide it is — the radius must shrink to fit vertically.
    const short = computeSafeCompassRadius(2000, 400);
    const tall = computeSafeCompassRadius(2000, 2000);
    expect(short).toBeLessThan(tall);

    // A narrow (small-width) container is likewise the binding constraint.
    const narrow = computeSafeCompassRadius(400, 2000);
    const wideEnough = computeSafeCompassRadius(2000, 2000);
    expect(narrow).toBeLessThan(wideEnough);
  });
});

describe('computeCompassLayout', () => {
  it('centres exactly on the container midpoint', () => {
    const layout = computeCompassLayout(800, 600);
    expect(layout.centerX).toBe(400);
    expect(layout.centerY).toBe(300);
  });

  it('produces a radius consistent with computeSafeCompassRadius for the same dimensions', () => {
    const layout = computeCompassLayout(1000, 700);
    expect(layout.radius).toBe(computeSafeCompassRadius(1000, 700));
  });
});
