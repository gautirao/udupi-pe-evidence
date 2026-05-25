import { describe, it, expect } from 'vitest';
import { clampSchoolRadiusKm, MIN_SCHOOL_RADIUS_KM } from '../usePropertyListings';
import { haversineKm } from '@/lib/geo';

/**
 * Issue #1210 regression: a 0 km school radius must normalise to the minimum
 * supported radius (1 km) at the data-filter layer, so the radius-filtered listing
 * set reflects an effective 1 km radius instead of silently excluding everything.
 * Valid radii (1/2/3/5 km) must pass through unchanged.
 */
describe('clampSchoolRadiusKm (issue #1210)', () => {
  it('clamps 0 km to the minimum supported radius (1 km)', () => {
    expect(clampSchoolRadiusKm(0)).toBe(MIN_SCHOOL_RADIUS_KM);
    expect(MIN_SCHOOL_RADIUS_KM).toBe(1);
  });

  it('clamps negative and non-finite values to the minimum', () => {
    expect(clampSchoolRadiusKm(-3)).toBe(1);
    expect(clampSchoolRadiusKm(Number.NaN)).toBe(1);
    expect(clampSchoolRadiusKm(0.4)).toBe(1);
  });

  it.each([1, 2, 3, 5])('leaves valid radius %i km unchanged', (km) => {
    expect(clampSchoolRadiusKm(km)).toBe(km);
  });

  it('does not impose an upper bound (larger radii remain valid)', () => {
    expect(clampSchoolRadiusKm(25)).toBe(25);
  });

  // Demonstrate the end-to-end effect on the proximity-filtered listing set:
  // with a raw 0 km radius the haversine guard excludes a nearby listing, but the
  // clamped (1 km) radius includes it — matching what the UI now presents.
  it('the clamped radius includes a listing ~0.5 km from the school (raw 0 km would exclude it)', () => {
    const schoolLat = 13.3531;
    const schoolLon = 74.7935;
    // ~0.45 km north of the school.
    const listingLat = 13.3571;
    const listingLon = 74.7935;
    const dist = haversineKm(schoolLat, schoolLon, listingLat, listingLon);
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThanOrEqual(1);

    const rawRadius = 0;
    const effectiveRadius = clampSchoolRadiusKm(rawRadius);
    // Pre-fix consumption (raw 0): listing excluded.
    expect(dist <= rawRadius).toBe(false);
    // Post-fix consumption (clamped 1 km): listing included.
    expect(dist <= effectiveRadius).toBe(true);
  });
});
