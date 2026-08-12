import { describe, it, expect } from 'vitest';
import { resolveEffectiveSelectedArea } from './effectiveArea';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

function makeArea(overrides: Partial<AreaPoint> = {}): AreaPoint {
  return {
    areaKey: 'IN|KA|Udupi|Manipal',
    areaLabel: 'Manipal',
    geo_center_lat: 13.35,
    geo_center_lon: 74.79,
    bbox: null,
    ...overrides,
  };
}

const AREA_A = makeArea();
const AREA_B = makeArea({ areaKey: 'IN|KA|Udupi|Kaup', areaLabel: 'Kaup' });

describe('resolveEffectiveSelectedArea (#2142 Commit 2 — moved from MapDiscovery.tsx unchanged)', () => {
  it('returns selectedArea when both are present (legacy wins)', () => {
    expect(resolveEffectiveSelectedArea(AREA_A, AREA_B)).toBe(AREA_A);
  });

  it('falls back to nodeAreaPoint when selectedArea is null', () => {
    expect(resolveEffectiveSelectedArea(null, AREA_B)).toBe(AREA_B);
  });

  it('falls back to nodeAreaPoint when selectedArea is undefined', () => {
    expect(resolveEffectiveSelectedArea(undefined, AREA_B)).toBe(AREA_B);
  });

  it('returns null when neither is present', () => {
    expect(resolveEffectiveSelectedArea(null, null)).toBeNull();
    expect(resolveEffectiveSelectedArea(undefined, undefined)).toBeNull();
  });
});
