import { describe, it, expect } from 'vitest';
import { haversineKm, sortByDistanceKmAscending } from './geo';

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

// Issue #1974 — sortByDistanceKmAscending powers "nearest to school first"
// ordering in SchoolSelectedPanel/AreaSchoolCombinedPanel.
describe('sortByDistanceKmAscending', () => {
  interface Item {
    id: string;
    distanceKm: number | null | undefined;
  }

  const distanceOf = (item: Item) => item.distanceKm;

  it('orders items ascending by distance', () => {
    const items: Item[] = [
      { id: 'a', distanceKm: 5 },
      { id: 'b', distanceKm: 1 },
      { id: 'c', distanceKm: 3 },
    ];
    const result = sortByDistanceKmAscending(items, distanceOf);
    expect(result.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts null/undefined/NaN-distance items after all finite-distance items, regardless of input position', () => {
    const items: Item[] = [
      { id: 'no-coords-1', distanceKm: null },
      { id: 'far', distanceKm: 10 },
      { id: 'no-coords-2', distanceKm: undefined },
      { id: 'near', distanceKm: 2 },
      { id: 'no-coords-3', distanceKm: NaN },
    ];
    const result = sortByDistanceKmAscending(items, distanceOf);
    // Finite-distance items first, ascending.
    expect(result.slice(0, 2).map((i) => i.id)).toEqual(['near', 'far']);
    // Non-finite-distance items last, as a set (exact order asserted separately below).
    expect(new Set(result.slice(2).map((i) => i.id))).toEqual(
      new Set(['no-coords-1', 'no-coords-2', 'no-coords-3']),
    );
  });

  it('keeps original relative order for items with an identical finite distance (stable tie-break)', () => {
    const items: Item[] = [
      { id: 'z-tie', distanceKm: 4 },
      { id: 'a-lead', distanceKm: 1 },
      { id: 'a-tie', distanceKm: 4 },
    ];
    const result = sortByDistanceKmAscending(items, distanceOf);
    // 'z-tie' appeared before 'a-tie' in the input at the same distance (4), so it
    // must still precede 'a-tie' after sorting — proves a stable sort, not an
    // id/label-based tiebreak.
    expect(result.map((i) => i.id)).toEqual(['a-lead', 'z-tie', 'a-tie']);
  });

  it('keeps original relative order when every item is non-finite (all null/undefined/NaN)', () => {
    const items: Item[] = [
      { id: 'third', distanceKm: NaN },
      { id: 'first', distanceKm: null },
      { id: 'second', distanceKm: undefined },
    ];
    const result = sortByDistanceKmAscending(items, distanceOf);
    expect(result.map((i) => i.id)).toEqual(['third', 'first', 'second']);
  });

  it('does not mutate the input array', () => {
    const items: Item[] = [
      { id: 'a', distanceKm: 5 },
      { id: 'b', distanceKm: 1 },
    ];
    const original = [...items];
    sortByDistanceKmAscending(items, distanceOf);
    expect(items).toEqual(original);
  });
});
