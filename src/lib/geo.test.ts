import { describe, it, expect } from 'vitest';
import { haversineKm } from './geo';

describe('haversineKm', () => {
  it('returns 0 for the same point', () => {
    expect(haversineKm(13.3409, 74.7421, 13.3409, 74.7421)).toBe(0);
  });

  it('is symmetric: haversineKm(a, b) === haversineKm(b, a)', () => {
    const a = haversineKm(13.3409, 74.7421, 13.6218, 74.6943);
    const b = haversineKm(13.6218, 74.6943, 13.3409, 74.7421);
    expect(a).toBeCloseTo(b, 10);
  });

  it('matches a known distance: Udupi to Kundapur (~31.7 km)', () => {
    // Udupi (13.3409, 74.7421) -> Kundapur (13.6218, 74.6943)
    expect(haversineKm(13.3409, 74.7421, 13.6218, 74.6943)).toBeCloseTo(31.7, 1);
  });

  it('matches a known one-degree-latitude distance (~111.19 km)', () => {
    // One degree of latitude at the same longitude is ~111.19 km.
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 1);
  });
});
