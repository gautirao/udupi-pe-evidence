/**
 * Unit tests for areaMarkerBucketing.ts (Issue #1810 Stage 2A).
 *
 * Coverage:
 * - computeClusterChipPlacements: determinism, offset-only-on-collision,
 *   leader threshold (>=16px), chip-merge on footprint overlap, true
 *   centroid/anchor never mutated.
 * - computeAreaMarkers: representatives are never offset (their positions
 *   always equal their true geo_center — this module has no representative
 *   offset field at all, by construction) and recompute-on-zoom-only.
 */

import { describe, it, expect } from 'vitest';
import {
  computeAreaMarkers,
  computeClusterChipPlacements,
  type AreaCluster,
  type AreaMarkerProjection,
  type RankableArea,
} from '../areaMarkerBucketing';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeArea(id: string, count: number, lat: number, lon: number): RankableArea {
  return { id, name: id, count, lat, lon };
}

function makeCluster(cellKey: string, memberIds: string[], anchorLat: number, anchorLon: number): AreaCluster {
  return {
    cellKey,
    areas: memberIds.map((id, i) => makeArea(id, i + 1, anchorLat, anchorLon)),
    dominantName: memberIds[0],
    count: memberIds.length,
    anchor: { lat: anchorLat, lon: anchorLon },
  };
}

/** Deterministic pixel-grid projection: 1 degree == 1000px, no rounding surprises. */
function gridProject(lat: number, lon: number): AreaMarkerProjection {
  return { x: lon * 1000, y: lat * 1000 };
}

// ── computeClusterChipPlacements ────────────────────────────────────────────

describe('computeClusterChipPlacements — determinism', () => {
  it('same viewport + dataset => identical output across repeated calls', () => {
    const clusters = [
      makeCluster('0:0', ['a1', 'a2'], 13.0, 77.0),
      makeCluster('1:0', ['b1', 'b2'], 13.0002, 77.0),
      makeCluster('2:2', ['c1', 'c2'], 13.05, 77.05),
    ];
    const run1 = computeClusterChipPlacements(clusters, gridProject);
    const run2 = computeClusterChipPlacements(clusters, gridProject);
    expect(run2.placements).toEqual(run1.placements);
    expect(run2.clusters.map((c) => c.cellKey)).toEqual(run1.clusters.map((c) => c.cellKey));
  });

  it('output does not depend on input array order (re-sorted by cellKey internally)', () => {
    const clusters = [
      makeCluster('2:2', ['c1', 'c2'], 13.05, 77.05),
      makeCluster('0:0', ['a1', 'a2'], 13.0, 77.0),
      makeCluster('1:0', ['b1', 'b2'], 13.0002, 77.0),
    ];
    const forward = computeClusterChipPlacements(clusters, gridProject);
    const reversed = computeClusterChipPlacements([...clusters].reverse(), gridProject);
    expect(reversed.placements).toEqual(forward.placements);
  });
});

describe('computeClusterChipPlacements — offset only on a real footprint collision', () => {
  it('a single, isolated cluster is never offset (offsetX/Y = 0, no leader)', () => {
    const clusters = [makeCluster('5:5', ['solo1', 'solo2'], 13.5, 77.5)];
    const { placements } = computeClusterChipPlacements(clusters, gridProject);
    expect(placements['5:5']).toEqual({ offsetX: 0, offsetY: 0, showLeader: false });
  });

  it('two clusters whose centroids project far apart (no footprint overlap) both stay at offset (0,0)', () => {
    // 176x64 chip footprint — centroids 2000px apart in x guarantee no overlap.
    const clusters = [
      makeCluster('0:0', ['a1', 'a2'], 13.0, 77.0),
      makeCluster('9:0', ['b1', 'b2'], 13.0, 79.0),
    ];
    const { placements } = computeClusterChipPlacements(clusters, gridProject);
    expect(placements['0:0']).toEqual({ offsetX: 0, offsetY: 0, showLeader: false });
    expect(placements['9:0']).toEqual({ offsetX: 0, offsetY: 0, showLeader: false });
  });

  it('two clusters with colliding footprints: the second-processed one is offset away from (0,0)', () => {
    // cellKey '0:0' sorts before '1:0' — '0:0' is placed first at its true
    // centroid; '1:0' collides (only 0.2px apart in this projection) and must move.
    const clusters = [
      makeCluster('0:0', ['a1', 'a2'], 13.0, 77.0),
      makeCluster('1:0', ['b1', 'b2'], 13.0002, 77.0),
    ];
    const { placements, clusters: outClusters } = computeClusterChipPlacements(clusters, gridProject);
    expect(placements['0:0']).toEqual({ offsetX: 0, offsetY: 0, showLeader: false });
    expect(placements['1:0']).toBeDefined();
    const moved = placements['1:0'];
    expect(moved.offsetX !== 0 || moved.offsetY !== 0).toBe(true);
    // Both chips still present (no merge — a zero-overlap candidate existed).
    expect(outClusters.map((c) => c.cellKey).sort()).toEqual(['0:0', '1:0']);
  });
});

describe('computeClusterChipPlacements — leader line threshold (>=16px)', () => {
  it('showLeader is false when the chosen offset distance is 0 (no move)', () => {
    const clusters = [makeCluster('3:3', ['x1', 'x2'], 13.3, 77.3)];
    const { placements } = computeClusterChipPlacements(clusters, gridProject);
    expect(placements['3:3'].showLeader).toBe(false);
  });

  it('showLeader is true once a cluster is actually moved to a nonzero candidate', () => {
    const clusters = [
      makeCluster('0:0', ['a1', 'a2'], 13.0, 77.0),
      makeCluster('1:0', ['b1', 'b2'], 13.0002, 77.0),
    ];
    const { placements } = computeClusterChipPlacements(clusters, gridProject);
    const moved = placements['1:0'];
    const dist = Math.hypot(moved.offsetX, moved.offsetY);
    // All nonzero candidate offsets are >=56px by construction (ring radius),
    // comfortably above the 16px leader threshold.
    expect(dist).toBeGreaterThanOrEqual(16);
    expect(moved.showLeader).toBe(true);
  });
});

describe('computeClusterChipPlacements — chip merge on genuinely-full collision', () => {
  it('merges a cluster into its colliding neighbour when no zero-overlap candidate exists among the 15 offsets', () => {
    // Stack many clusters at (near-)identical projected points so every one of
    // the 15 deterministic candidates collides with an already-placed chip —
    // "genuinely full" (design-spec §3). Areas summed across the merge, no
    // cluster silently dropped.
    const clusters = Array.from({ length: 6 }, (_, i) =>
      makeCluster(`${i}:0`, [`m${i}a`, `m${i}b`], 13.0 + i * 0.0000001, 77.0),
    );
    const { clusters: outClusters, placements } = computeClusterChipPlacements(clusters, gridProject);
    // Fewer clusters than input — at least one merge occurred.
    expect(outClusters.length).toBeLessThan(clusters.length);
    // Total member-area count is conserved across the merge (no area silently dropped).
    const totalAreasIn = clusters.reduce((sum, c) => sum + c.areas.length, 0);
    const totalAreasOut = outClusters.reduce((sum, c) => sum + c.areas.length, 0);
    expect(totalAreasOut).toBe(totalAreasIn);
    // Every surviving cluster has a placement.
    for (const c of outClusters) {
      expect(placements[c.cellKey]).toBeDefined();
    }
  });
});

describe('computeClusterChipPlacements — true centroid/anchor never mutated', () => {
  it('every output cluster keeps the exact same anchor lat/lon as its input (offset is presentation-only)', () => {
    const clusters = [
      makeCluster('0:0', ['a1', 'a2'], 13.123456, 77.654321),
      makeCluster('1:0', ['b1', 'b2'], 13.1234561, 77.654321),
    ];
    const { clusters: outClusters } = computeClusterChipPlacements(clusters, gridProject);
    for (const out of outClusters) {
      const original = clusters.find((c) => c.cellKey === out.cellKey);
      expect(original).toBeDefined();
      expect(out.anchor).toEqual(original!.anchor);
    }
  });
});

// ── computeAreaMarkers — representatives are never offset ──────────────────

describe('computeAreaMarkers — representative positions always equal their true geo_center', () => {
  it('representatives carry the exact input lat/lon through unchanged (no offset field, no mutation)', () => {
    const areas: RankableArea[] = [
      makeArea('rep1', 10, 13.0, 77.0),
      makeArea('rep2', 8, 13.01, 77.01),
      makeArea('rep3', 6, 13.02, 77.02),
    ];
    const result = computeAreaMarkers({
      areas,
      project: gridProject,
      viewport: { width: 800, height: 600 },
      zoom: 13,
      forced: {},
      groupBounds: { minLat: 13.0, minLon: 77.0, maxLat: 13.02, maxLon: 77.02 },
    });
    for (const rep of result.representatives) {
      const original = areas.find((a) => a.id === rep.id);
      expect(original).toBeDefined();
      expect(rep.lat).toBe(original!.lat);
      expect(rep.lon).toBe(original!.lon);
    }
  });
});

describe('computeAreaMarkers — recompute-on-zoom-only contract (pure function, caller controls recompute)', () => {
  it('an unrelated call with the identical input (including zoom) yields byte-identical output — no jitter', () => {
    const input = {
      areas: [makeArea('a', 5, 13.0, 77.0), makeArea('b', 3, 13.01, 77.01)],
      project: gridProject,
      viewport: { width: 800, height: 600 },
      zoom: 13,
      forced: {},
      groupBounds: { minLat: 13.0, minLon: 77.0, maxLat: 13.01, maxLon: 77.01 },
    };
    const r1 = computeAreaMarkers(input);
    const r2 = computeAreaMarkers(input);
    expect(r2).toEqual(r1);
  });
});
