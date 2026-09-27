import { describe, it, expect } from 'vitest';
import { RADIUS_OPTIONS, snapRadiusKm } from './radiusOptions';

describe('RADIUS_OPTIONS', () => {
  it('is exactly [3, 5, 10] (ReTrends redesign)', () => {
    expect(RADIUS_OPTIONS).toEqual([3, 5, 10]);
  });
});

describe('snapRadiusKm', () => {
  it.each<[number | null | undefined, number]>([
    [null, 3],
    [undefined, 3],
    [0, 3],
    [1, 3],
    [2, 3],
    [3, 3],
    [4, 3],
    [5, 5],
    [7, 5],
    [8, 10],
    [10, 10],
    [15, 10],
    [NaN, 3],
  ])('snapRadiusKm(%p) === %i', (input, expected) => {
    expect(snapRadiusKm(input)).toBe(expected);
  });
});
