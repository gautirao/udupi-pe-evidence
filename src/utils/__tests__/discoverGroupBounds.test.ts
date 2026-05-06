/**
 * Unit tests for computeGroupBounds
 *
 * Covers all required edge cases from the A3 spec:
 *   - 0 members → null
 *   - 1 member with bbox → area.bbox
 *   - 1 member without bbox → center ± 0.05 deg margin
 *   - 2 members both with bbox → merged bbox
 *   - 5 members → all-inclusive bbox
 *   - Partial membership (some areaKeys not in discoverAreas) → no crash, bounds for available only
 */

import { describe, it, expect } from 'vitest';
import { computeGroupBounds, GROUP_BOUNDS_SYNTHETIC_KEY } from '../discoverGroupBounds';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeArea(
  areaKey: string,
  lat: number,
  lon: number,
  bbox: [[number, number], [number, number]] | null = null,
): AreaPoint {
  return {
    areaKey,
    areaLabel: areaKey,
    geo_center_lat: lat,
    geo_center_lon: lon,
    bbox,
  };
}

const MANIPAL = makeArea('manipal', 13.35, 74.79, [[13.32, 74.76], [13.38, 74.82]]);
const UDUPI   = makeArea('udupi',   13.34, 74.74, [[13.31, 74.71], [13.37, 74.77]]);
const KARKALA = makeArea('karkala', 13.20, 74.99, [[13.17, 74.96], [13.23, 75.02]]);
const KUNDAPUR = makeArea('kundapur', 13.62, 74.69, [[13.59, 74.66], [13.65, 74.72]]);
const HEBRI   = makeArea('hebri',   13.52, 74.99, [[13.49, 74.96], [13.55, 75.02]]);

/** Area with no bbox — center-only fallback. */
const NO_BBOX = makeArea('no-bbox', 13.00, 74.80, null);

const MARGIN = 0.05;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeGroupBounds — 0 members', () => {
  it('returns null for an empty array', () => {
    expect(computeGroupBounds([])).toBeNull();
  });
});

describe('computeGroupBounds — 1 member with bbox', () => {
  it('returns a synthetic AreaPoint whose bbox matches the single member bbox', () => {
    const result = computeGroupBounds([MANIPAL]);
    expect(result).not.toBeNull();
    expect(result!.bbox).toEqual([[13.32, 74.76], [13.38, 74.82]]);
  });

  it('sets geo_center to the midpoint of the member bbox', () => {
    const result = computeGroupBounds([MANIPAL]);
    expect(result!.geo_center_lat).toBeCloseTo((13.32 + 13.38) / 2);
    expect(result!.geo_center_lon).toBeCloseTo((74.76 + 74.82) / 2);
  });
});

describe('computeGroupBounds — 1 member without bbox', () => {
  it('returns center ± FALLBACK_MARGIN bbox', () => {
    const result = computeGroupBounds([NO_BBOX]);
    expect(result).not.toBeNull();

    const [[s, w], [n, e]] = result!.bbox!;
    expect(s).toBeCloseTo(NO_BBOX.geo_center_lat - MARGIN);
    expect(w).toBeCloseTo(NO_BBOX.geo_center_lon - MARGIN);
    expect(n).toBeCloseTo(NO_BBOX.geo_center_lat + MARGIN);
    expect(e).toBeCloseTo(NO_BBOX.geo_center_lon + MARGIN);
  });
});

describe('computeGroupBounds — 2 members both with bbox', () => {
  it('merges bboxes into the outermost bounds', () => {
    const result = computeGroupBounds([MANIPAL, UDUPI]);
    expect(result).not.toBeNull();

    const [[s, w], [n, e]] = result!.bbox!;
    // S = min of both south edges
    expect(s).toBeCloseTo(Math.min(13.32, 13.31));
    // W = min of both west edges
    expect(w).toBeCloseTo(Math.min(74.76, 74.71));
    // N = max of both north edges
    expect(n).toBeCloseTo(Math.max(13.38, 13.37));
    // E = max of both east edges
    expect(e).toBeCloseTo(Math.max(74.82, 74.77));
  });
});

describe('computeGroupBounds — 5 members', () => {
  it('produces all-inclusive bbox spanning all 5 members', () => {
    const members = [MANIPAL, UDUPI, KARKALA, KUNDAPUR, HEBRI];
    const result = computeGroupBounds(members);
    expect(result).not.toBeNull();

    const [[s, w], [n, e]] = result!.bbox!;

    // South: min of all south edges
    const expectedS = Math.min(13.32, 13.31, 13.17, 13.59, 13.49);
    // West: min of all west edges
    const expectedW = Math.min(74.76, 74.71, 74.96, 74.66, 74.96);
    // North: max of all north edges
    const expectedN = Math.max(13.38, 13.37, 13.23, 13.65, 13.55);
    // East: max of all east edges
    const expectedE = Math.max(74.82, 74.77, 75.02, 74.72, 75.02);

    expect(s).toBeCloseTo(expectedS);
    expect(w).toBeCloseTo(expectedW);
    expect(n).toBeCloseTo(expectedN);
    expect(e).toBeCloseTo(expectedE);
  });

  it('center is within the merged bbox', () => {
    const members = [MANIPAL, UDUPI, KARKALA, KUNDAPUR, HEBRI];
    const result = computeGroupBounds(members);
    const [[s, w], [n, e]] = result!.bbox!;
    expect(result!.geo_center_lat).toBeGreaterThanOrEqual(s);
    expect(result!.geo_center_lat).toBeLessThanOrEqual(n);
    expect(result!.geo_center_lon).toBeGreaterThanOrEqual(w);
    expect(result!.geo_center_lon).toBeLessThanOrEqual(e);
  });
});

describe('computeGroupBounds — partial membership', () => {
  it('computes bounds for available members only — does not crash on empty after filtering', () => {
    // Caller already filtered discoverAreas to group.area_keys — if none matched, array is empty.
    expect(computeGroupBounds([])).toBeNull();
  });

  it('computes bounds for the subset of areas that are available', () => {
    // Group has 3 area_keys but only 1 is in discoverAreas
    const result = computeGroupBounds([MANIPAL]);
    expect(result).not.toBeNull();
    expect(result!.bbox).toEqual([[13.32, 74.76], [13.38, 74.82]]);
  });

  it('handles mixed bbox/no-bbox members gracefully', () => {
    const result = computeGroupBounds([MANIPAL, NO_BBOX]);
    expect(result).not.toBeNull();

    const [[s, w], [n, e]] = result!.bbox!;
    // Manipal bbox contributes [13.32, 74.76] → [13.38, 74.82]
    // NO_BBOX contributes [12.95, 74.75] → [13.05, 74.85]
    expect(s).toBeCloseTo(Math.min(13.32, NO_BBOX.geo_center_lat - MARGIN));
    expect(w).toBeCloseTo(Math.min(74.76, NO_BBOX.geo_center_lon - MARGIN));
    expect(n).toBeCloseTo(Math.max(13.38, NO_BBOX.geo_center_lat + MARGIN));
    expect(e).toBeCloseTo(Math.max(74.82, NO_BBOX.geo_center_lon + MARGIN));
  });
});

describe('computeGroupBounds — return shape', () => {
  it('returned object has areaKey set to GROUP_BOUNDS_SYNTHETIC_KEY', () => {
    const result = computeGroupBounds([MANIPAL]);
    expect(result!.areaKey).toBe(GROUP_BOUNDS_SYNTHETIC_KEY);
  });

  it('returned object has an empty areaLabel (not displayed)', () => {
    const result = computeGroupBounds([MANIPAL]);
    expect(result!.areaLabel).toBe('');
  });
});
