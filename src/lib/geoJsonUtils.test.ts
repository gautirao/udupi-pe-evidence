import { describe, it, expect } from 'vitest';
import { toGeoJsonString, fromGeoJsonString, isValidPolygon } from './geoJsonUtils';

describe('toGeoJsonString', () => {
  it('converts [lat,lng][] to GeoJSON [lng,lat] closed ring', () => {
    const coords: [number, number][] = [
      [13.0, 74.0],
      [13.0, 74.1],
      [13.1, 74.1],
    ];
    const result = JSON.parse(toGeoJsonString(coords)!);
    expect(result.type).toBe('Polygon');
    // GeoJSON coordinate order is [lng, lat]
    expect(result.coordinates[0][0]).toEqual([74.0, 13.0]);
    expect(result.coordinates[0][1]).toEqual([74.1, 13.0]);
    expect(result.coordinates[0][2]).toEqual([74.1, 13.1]);
    // Closed ring — last point equals first
    expect(result.coordinates[0].at(-1)).toEqual([74.0, 13.0]);
    // 3 points + 1 closing = 4 entries
    expect(result.coordinates[0]).toHaveLength(4);
  });

  it('returns null for <3 distinct points (2 points)', () => {
    expect(toGeoJsonString([[13.0, 74.0], [13.1, 74.1]])).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(toGeoJsonString([])).toBeNull();
  });

  it('returns null for 1 point', () => {
    expect(toGeoJsonString([[13.0, 74.0]])).toBeNull();
  });

  it('serializes to valid JSON string', () => {
    const coords: [number, number][] = [
      [13.0, 74.0],
      [13.0, 74.1],
      [13.1, 74.1],
    ];
    const str = toGeoJsonString(coords);
    expect(typeof str).toBe('string');
    expect(() => JSON.parse(str!)).not.toThrow();
  });
});

describe('fromGeoJsonString', () => {
  it('round-trips back to [lat,lng][]', () => {
    const coords: [number, number][] = [
      [13.0, 74.0],
      [13.0, 74.1],
      [13.1, 74.1],
    ];
    const str = toGeoJsonString(coords)!;
    const back = fromGeoJsonString(str);
    expect(back).toEqual([
      [13.0, 74.0],
      [13.0, 74.1],
      [13.1, 74.1],
    ]);
  });

  it('returns [] for null', () => {
    expect(fromGeoJsonString(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(fromGeoJsonString(undefined)).toEqual([]);
  });

  it('returns [] for empty string', () => {
    expect(fromGeoJsonString('')).toEqual([]);
  });

  it('returns [] for malformed JSON', () => {
    expect(fromGeoJsonString('not-json')).toEqual([]);
  });

  it('returns [] for JSON without coordinates', () => {
    expect(fromGeoJsonString('{"type":"Polygon"}')).toEqual([]);
  });

  it('does not include the closing duplicate point', () => {
    const coords: [number, number][] = [
      [13.0, 74.0],
      [13.0, 74.1],
      [13.1, 74.1],
    ];
    const back = fromGeoJsonString(toGeoJsonString(coords)!);
    // Should have 3 points, not 4 (no closing duplicate)
    expect(back).toHaveLength(3);
  });
});

describe('isValidPolygon', () => {
  it('returns true for exactly 3 distinct points', () => {
    expect(isValidPolygon([[1, 2], [3, 4], [5, 6]])).toBe(true);
  });

  it('returns true for more than 3 distinct points', () => {
    expect(isValidPolygon([[1, 2], [3, 4], [5, 6], [7, 8]])).toBe(true);
  });

  it('returns false for 2 points', () => {
    expect(isValidPolygon([[1, 2], [3, 4]])).toBe(false);
  });

  it('returns false for 1 point', () => {
    expect(isValidPolygon([[1, 2]])).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(isValidPolygon([])).toBe(false);
  });

  it('ignores consecutive duplicate points when counting', () => {
    // [1,2] repeated twice (consecutive) → deduplicated to [[1,2],[3,4]] = 2 distinct → invalid
    expect(isValidPolygon([[1, 2], [1, 2], [3, 4]])).toBe(false);
    // Three genuinely distinct points interleaved with a repeated one → 3 distinct after dedup → valid
    expect(isValidPolygon([[1, 2], [3, 4], [5, 6], [5, 6]])).toBe(true);
  });

  it('returns true for polygon where first and last points match (non-consecutive)', () => {
    // [1,2], [3,4], [1,2] — first and last are identical but NOT consecutive duplicates.
    // isValidPolygon only deduplicates consecutive points, so this has 3 entries after dedup.
    // DrawControl never produces a closing ring; that is geoJsonUtils' responsibility.
    // Intended behaviour: valid (3 entries after consecutive-dedup).
    expect(isValidPolygon([[1, 2], [3, 4], [1, 2]])).toBe(true);
  });
});
