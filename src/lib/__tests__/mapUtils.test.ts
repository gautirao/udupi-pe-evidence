import { describe, it, expect } from 'vitest';
import { computeFocusBounds, computeTopLocalities } from '../mapUtils';

// ─── computeFocusBounds ────────────────────────────────────────────────────

describe('computeFocusBounds', () => {
  const base = [
    { latitude: 13.3, longitude: 74.7, locality: 'Udupi' },
    { latitude: 13.4, longitude: 74.8, locality: 'Udupi' },
    { latitude: 13.1, longitude: 74.5, locality: 'Karkala' },
  ];

  it('returns null when localities array is empty', () => {
    expect(computeFocusBounds(base, [])).toBeNull();
  });

  it('returns null when no listing matches the locality', () => {
    expect(computeFocusBounds(base, ['Kundapur'])).toBeNull();
  });

  it('returns correct bounds for a single matched locality', () => {
    const result = computeFocusBounds(base, ['Udupi']);
    expect(result).toEqual([
      [13.3, 74.7], // [minLat, minLng]
      [13.4, 74.8], // [maxLat, maxLng]
    ]);
  });

  it('returns exact point bounds when only one listing matches (degenerate but valid)', () => {
    const result = computeFocusBounds(base, ['Karkala']);
    expect(result).toEqual([
      [13.1, 74.5],
      [13.1, 74.5],
    ]);
  });

  it('unions bounds across multiple selected localities', () => {
    const result = computeFocusBounds(base, ['Udupi', 'Karkala']);
    expect(result).toEqual([
      [13.1, 74.5], // min from Karkala
      [13.4, 74.8], // max from Udupi
    ]);
  });

  it('ignores listings without locality', () => {
    const listings = [
      { latitude: 13.3, longitude: 74.7, locality: null },
      { latitude: 13.4, longitude: 74.8, locality: 'Udupi' },
    ];
    const result = computeFocusBounds(listings, ['Udupi']);
    expect(result).toEqual([[13.4, 74.8], [13.4, 74.8]]);
  });

  it('returns null when listings array is empty', () => {
    expect(computeFocusBounds([], ['Udupi'])).toBeNull();
  });
});

// ─── computeTopLocalities ─────────────────────────────────────────────────

describe('computeTopLocalities', () => {
  const listings = [
    { locality: 'Udupi' },
    { locality: 'Udupi' },
    { locality: 'Udupi' },
    { locality: 'Karkala' },
    { locality: 'Karkala' },
    { locality: 'Kundapur' },
    { locality: 'Manipal' },
    { locality: 'Manipal' },
    { locality: 'Manipal' },
    { locality: 'Manipal' },
    { locality: 'Brahmavar' },
    { locality: 'Brahmavar' },
    { locality: 'Byndoor' },
  ];

  it('returns localities sorted by count descending', () => {
    const result = computeTopLocalities(listings);
    expect(result[0]).toEqual({ locality: 'Manipal', count: 4 });
    expect(result[1]).toEqual({ locality: 'Udupi', count: 3 });
  });

  it('returns at most 6 by default', () => {
    const result = computeTopLocalities(listings);
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it('respects custom n parameter', () => {
    const result = computeTopLocalities(listings, 2);
    expect(result).toHaveLength(2);
    expect(result[0].locality).toBe('Manipal');
    expect(result[1].locality).toBe('Udupi');
  });

  it('returns empty array for empty input', () => {
    expect(computeTopLocalities([])).toEqual([]);
  });

  it('skips listings without locality', () => {
    const result = computeTopLocalities([
      { locality: null },
      { locality: undefined },
      { locality: 'Udupi' },
    ]);
    expect(result).toEqual([{ locality: 'Udupi', count: 1 }]);
  });

  it('returns fewer than n when not enough distinct localities', () => {
    const result = computeTopLocalities([
      { locality: 'Udupi' },
      { locality: 'Karkala' },
    ], 6);
    expect(result).toHaveLength(2);
  });
});
