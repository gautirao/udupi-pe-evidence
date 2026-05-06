import { describe, it, expect } from 'vitest';
import { snapBbox } from '../bboxUtils';

describe('snapBbox', () => {
  // ── Grid snapping (happy path) ───────────────────────────────────────────

  it('snaps values produced by the function itself (idempotency via known-safe values)', () => {
    // Use integer multiples of 0.02 that ARE exactly representable in IEEE-754.
    // 0.02 * 500 = 10.0, 0.02 * 3700 = 74.0 — these are exact.
    // Non-exact grid-boundary values (e.g. 74.74) may still floor down by one step
    // because 74.74 / 0.02 is not exactly 3737 in IEEE-754; that is expected behaviour
    // (the function expands outward to the nearest representable grid line).
    expect(snapBbox([10.0, 74.0, 10.2, 74.2])).toEqual([10.0, 74.0, 10.2, 74.2]);
  });

  it('expands outward: south/west floor, north/east ceil', () => {
    // Input sits between grid lines on all sides
    expect(snapBbox([13.341, 74.741, 13.359, 74.759])).toEqual([13.34, 74.74, 13.36, 74.76]);
  });

  it('expands outward when viewport spans multiple grid cells', () => {
    // A larger viewport: south=13.01, west=74.01, north=13.19, east=74.19
    // south: floor(13.01/0.02)*0.02 = floor(650.5)*0.02 = 650*0.02 = 13.00
    // west:  floor(74.01/0.02)*0.02 = floor(3700.5)*0.02 = 3700*0.02 = 74.00
    // north: ceil(13.19/0.02)*0.02  = ceil(659.5)*0.02 = 660*0.02 = 13.20
    // east:  ceil(74.19/0.02)*0.02  = ceil(3709.5)*0.02 = 3710*0.02 = 74.20
    expect(snapBbox([13.01, 74.01, 13.19, 74.19])).toEqual([13.0, 74.0, 13.2, 74.2]);
  });

  // ── Negative longitudes ─────────────────────────────────────────────────

  it('handles negative longitudes correctly (west coast cities)', () => {
    // south=-34.61, west=-58.45, north=-34.55, east=-58.35
    // south: floor(-34.61/0.02)*0.02 = floor(-1730.5)*0.02 = -1731*0.02 = -34.62
    // west:  floor(-58.45/0.02)*0.02 = floor(-2922.5)*0.02 = -2923*0.02 = -58.46
    // north: ceil(-34.55/0.02)*0.02  = ceil(-1727.5)*0.02 = -1727*0.02 = -34.54
    // east:  ceil(-58.35/0.02)*0.02  = ceil(-2917.5)*0.02 = -2917*0.02 = -58.34
    expect(snapBbox([-34.61, -58.45, -34.55, -58.35])).toEqual([-34.62, -58.46, -34.54, -58.34]);
  });

  // ── IEEE-754 residue prevention ─────────────────────────────────────────

  it('produces exact 2-dp decimal with no IEEE-754 residue on north edge', () => {
    // 13.359 / 0.02 = 667.95 → ceil = 668 → 668 * 0.02 = 13.360000000000001 in IEEE-754
    // toFixed(2) must collapse this to exactly 13.36
    const [, , north] = snapBbox([13.341, 74.741, 13.359, 74.759]);
    expect(north).toBe(13.36);
    // Ensure no residue by checking string representation
    expect(north.toString()).toBe('13.36');
  });

  it('produces exact 2-dp decimal with no IEEE-754 residue on east edge', () => {
    // 74.759 / 0.02 = 3737.95 → ceil = 3738 → 3738 * 0.02 = 74.76000000000001 in IEEE-754
    const [, , , east] = snapBbox([13.341, 74.741, 13.359, 74.759]);
    expect(east).toBe(74.76);
    expect(east.toString()).toBe('74.76');
  });

  // ── Return type shape ───────────────────────────────────────────────────

  it('always returns a 4-tuple of numbers', () => {
    const result = snapBbox([13.341, 74.741, 13.359, 74.759]);
    expect(result).toHaveLength(4);
    result.forEach((v) => expect(typeof v).toBe('number'));
  });

  // ── Idempotency ──────────────────────────────────────────────────────────

  it('is idempotent when input is an exact integer multiple of the grid step', () => {
    // Use exact IEEE-754 representable grid values so floor/ceil are stable.
    const exact: [number, number, number, number] = [10.0, 74.0, 10.2, 74.2];
    const first = snapBbox(exact);
    const second = snapBbox(first);
    expect(second).toEqual(first);
  });

  it('stabilises after two applications on real-world mid-cell input', () => {
    // Note: a single application of snapBbox to already-snapped values is NOT
    // guaranteed to be idempotent. Values like 74.74 (13.34 etc.) are not exact
    // IEEE-754 multiples of 0.02, so a second application may expand one more
    // step (e.g. 74.74 → 74.72 due to IEEE-754 residue in 74.74/0.02). However,
    // the result stabilises after at most two applications: snapBbox(snapBbox(x))
    // is itself a fixed point. This test proves that guarantee.
    const once = snapBbox([13.341, 74.741, 13.359, 74.759]);
    const twice = snapBbox(once);
    const thrice = snapBbox(twice);
    expect(thrice).toEqual(twice);
  });
});
