/**
 * Unit tests for geo.ts — destinationPoint + buildSectorPolygon
 *
 * Tests:
 * 1. destinationPoint N → lat increases, lon stays close
 * 2. destinationPoint E → lon increases, lat stays close
 * 3. destinationPoint S → lat decreases, lon stays close
 * 4. buildSectorPolygon N maxKm=10: first vertex = centroid (apex)
 * 5. buildSectorPolygon N maxKm=50: first arc vertex is ~NNW (~337.5°)
 * 6. buildSectorPolygon N maxKm=50: N-WRAP — arc spans 0° meridian
 * 7. buildSectorPolygon NW maxKm=100: outermost vertex ≈ 100 km from centroid
 * 8. All 8 directions: > 20 vertices
 */

import { describe, it, expect } from 'vitest';
import { destinationPoint, buildSectorPolygon, haversineKm } from '../geo';

const UDUPI_LAT = 13.3409;
const UDUPI_LON = 74.7421;

// ─── destinationPoint ────────────────────────────────────────────────────────

describe('destinationPoint', () => {
  it('bearing=0 (N) → lat increases, lon stays approximately the same', () => {
    const [lat, lon] = destinationPoint(UDUPI_LAT, UDUPI_LON, 0, 10);
    expect(lat).toBeGreaterThan(UDUPI_LAT);
    expect(lon).toBeCloseTo(UDUPI_LON, 1);
  });

  it('bearing=90 (E) → lon increases, lat stays approximately the same', () => {
    const [lat, lon] = destinationPoint(UDUPI_LAT, UDUPI_LON, 90, 10);
    expect(lon).toBeGreaterThan(UDUPI_LON);
    expect(lat).toBeCloseTo(UDUPI_LAT, 1);
  });

  it('bearing=180 (S) → lat decreases, lon stays approximately the same', () => {
    const [lat, lon] = destinationPoint(UDUPI_LAT, UDUPI_LON, 180, 10);
    expect(lat).toBeLessThan(UDUPI_LAT);
    expect(lon).toBeCloseTo(UDUPI_LON, 1);
  });

  it('bearing=270 (W) → lon decreases, lat stays approximately the same', () => {
    const [lat, lon] = destinationPoint(UDUPI_LAT, UDUPI_LON, 270, 10);
    expect(lon).toBeLessThan(UDUPI_LON);
    expect(lat).toBeCloseTo(UDUPI_LAT, 1);
  });

  it('distance=0 returns the origin point', () => {
    const [lat, lon] = destinationPoint(UDUPI_LAT, UDUPI_LON, 45, 0);
    expect(lat).toBeCloseTo(UDUPI_LAT, 5);
    expect(lon).toBeCloseTo(UDUPI_LON, 5);
  });

  it('round-trip: N 10 km, then S 10 km ≈ origin', () => {
    const [lat2, lon2] = destinationPoint(UDUPI_LAT, UDUPI_LON, 0, 10);
    const [lat3, lon3] = destinationPoint(lat2, lon2, 180, 10);
    expect(lat3).toBeCloseTo(UDUPI_LAT, 2);
    expect(lon3).toBeCloseTo(UDUPI_LON, 2);
  });
});

// ─── buildSectorPolygon ───────────────────────────────────────────────────────

describe('buildSectorPolygon — apex (first vertex = centroid)', () => {
  it('N maxKm=10: first vertex equals centroid (apex at origin)', () => {
    const polygon = buildSectorPolygon(UDUPI_LAT, UDUPI_LON, 'N', 10);
    expect(polygon[0][0]).toBeCloseTo(UDUPI_LAT, 5);
    expect(polygon[0][1]).toBeCloseTo(UDUPI_LON, 5);
  });

  it('NW maxKm=25: first vertex equals centroid', () => {
    const polygon = buildSectorPolygon(UDUPI_LAT, UDUPI_LON, 'NW', 25);
    expect(polygon[0][0]).toBeCloseTo(UDUPI_LAT, 5);
    expect(polygon[0][1]).toBeCloseTo(UDUPI_LON, 5);
  });
});

describe('buildSectorPolygon — N direction arc (critical: N-wrap)', () => {
  it('N maxKm=50: first arc vertex is at ~337.5° bearing (NNW)', () => {
    const polygon = buildSectorPolygon(UDUPI_LAT, UDUPI_LON, 'N', 50);
    // Polygon is [apex, ...arcVertices, apex]
    // First arc vertex at index 1 should be at bearing ~337.5 from centroid
    const arcFirst = polygon[1];
    // At 337.5°, we expect lat > centroid (north component) and lon < centroid (west component)
    expect(arcFirst[0]).toBeGreaterThan(UDUPI_LAT); // north
    expect(arcFirst[1]).toBeLessThan(UDUPI_LON);    // west of centre
  });

  it('N maxKm=50: last arc vertex is at ~22.5° bearing (NNE)', () => {
    const polygon = buildSectorPolygon(UDUPI_LAT, UDUPI_LON, 'N', 50);
    // Last arc vertex is polygon[polygon.length - 2] (before closing apex)
    const arcLast = polygon[polygon.length - 2];
    // At 22.5°, we expect lat > centroid (north) and lon > centroid (east)
    expect(arcLast[0]).toBeGreaterThan(UDUPI_LAT); // north
    expect(arcLast[1]).toBeGreaterThan(UDUPI_LON); // east of centre
  });

  it('N maxKm=50: N-WRAP — arc vertices span the 0°/360° meridian (some bearings > 350°, some < 10°)', () => {
    // Build expected arc points at key bearings
    const nw_vertex = destinationPoint(UDUPI_LAT, UDUPI_LON, 337.5, 50); // ~NNW
    const n_vertex = destinationPoint(UDUPI_LAT, UDUPI_LON, 0, 50);      // due N
    const ne_vertex = destinationPoint(UDUPI_LAT, UDUPI_LON, 22.5, 50);  // ~NNE

    const polygon = buildSectorPolygon(UDUPI_LAT, UDUPI_LON, 'N', 50);
    const arcVertices = polygon.slice(1, -1); // exclude apex + closing apex

    // Should have at least 23 vertices (45° / 2° step + 1)
    expect(arcVertices.length).toBeGreaterThanOrEqual(23);

    // Arc should contain NNW (337.5°) and NNE (22.5°) points
    const hasNNW = arcVertices.some(
      ([lat, lon]) => Math.abs(lat - nw_vertex[0]) < 0.05 && Math.abs(lon - nw_vertex[1]) < 0.05,
    );
    const hasN = arcVertices.some(
      ([lat, lon]) => Math.abs(lat - n_vertex[0]) < 0.05 && Math.abs(lon - n_vertex[1]) < 0.05,
    );
    const hasNNE = arcVertices.some(
      ([lat, lon]) => Math.abs(lat - ne_vertex[0]) < 0.05 && Math.abs(lon - ne_vertex[1]) < 0.05,
    );

    expect(hasNNW).toBe(true);
    expect(hasN).toBe(true);
    expect(hasNNE).toBe(true);
  });
});

describe('buildSectorPolygon — NW maxKm=100 outer arc distance', () => {
  it('NW maxKm=100: outermost arc vertices are approximately 100 km from centroid (±2 km)', () => {
    const polygon = buildSectorPolygon(UDUPI_LAT, UDUPI_LON, 'NW', 100);
    const arcVertices = polygon.slice(1, -1);

    for (const [lat, lon] of arcVertices) {
      const dist = haversineKm(UDUPI_LAT, UDUPI_LON, lat, lon);
      expect(dist).toBeGreaterThan(98);
      expect(dist).toBeLessThan(102);
    }
  });
});

describe('buildSectorPolygon — all 8 directions have > 20 vertices', () => {
  const directions: Array<'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'> = [
    'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW',
  ];

  for (const dir of directions) {
    it(`direction=${dir} produces > 20 vertices`, () => {
      const polygon = buildSectorPolygon(UDUPI_LAT, UDUPI_LON, dir, 50);
      expect(polygon.length).toBeGreaterThan(20);
    });
  }

  it('arc vertices are sampled at 2° steps (≥23 arc points for 45° span)', () => {
    for (const dir of directions) {
      const polygon = buildSectorPolygon(UDUPI_LAT, UDUPI_LON, dir, 25);
      const arcVertices = polygon.slice(1, -1);
      expect(arcVertices.length).toBeGreaterThanOrEqual(23);
    }
  });
});

describe('buildSectorPolygon — closed polygon', () => {
  it('first and last vertex are the same (closed)', () => {
    const polygon = buildSectorPolygon(UDUPI_LAT, UDUPI_LON, 'SE', 50);
    expect(polygon[0]).toEqual(polygon[polygon.length - 1]);
  });
});

describe('buildSectorPolygon — NE direction sanity', () => {
  it('NE sector centre arc vertex is to the NE of centroid', () => {
    const polygon = buildSectorPolygon(UDUPI_LAT, UDUPI_LON, 'NE', 50);
    const arcVertices = polygon.slice(1, -1);
    const mid = arcVertices[Math.floor(arcVertices.length / 2)];
    // NE: lat > centroid, lon > centroid
    expect(mid[0]).toBeGreaterThan(UDUPI_LAT);
    expect(mid[1]).toBeGreaterThan(UDUPI_LON);
  });
});
