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
  type AreaMarkerForcedInput,
  type AreaMarkerGroupBounds,
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

// ─── Issue #1815 — demoteCollidingRepresentatives (representative label-rect
// collision/demote pass) ─────────────────────────────────────────────────────
//
// Fixture strategy: a lookup-based `project` decouples collision geometry
// (pixel spacing, fully controlled) from lat/lon (which drives quadrant
// assignment + rank tie-breaking) so collisions are exactly predictable
// instead of relying on fragile linear-projection math.
//
// Layout: 4 quadrants (NE/NW/SE/SW) around a groupBounds centroid of
// (5,5). NE gets 8 areas, NW/SE/SW get 7 each = 29 areas total (16-30 band).
// Within a quadrant, areas are laid out in a single pixel row spaced 60px
// apart — narrow enough that grid bucketing (110px cells) pairs consecutive
// areas into the same cell (2 members: a rep-designate + a same-cell dot),
// and wide enough that adjacent cells' rep-designates (120px apart) collide
// under the 184x72 label footprint (176+8 x 64+8), while non-adjacent cells
// (240px+) do not. Quadrants are offset far apart (2000px) so cross-quadrant
// collisions never happen. Areas are assigned STRICTLY DECREASING counts in
// quadrant order [NE, NW, SE, SW] then ascending index, so NE areas
// out-rank every other quadrant's areas — this makes the cap-fill and
// collision-processing order fully deterministic and hand-verifiable.

const DENSE_BOUNDS: AreaMarkerGroupBounds = { minLat: 0, maxLat: 10, minLon: 0, maxLon: 10 };

/** Lookup-based project(): decouples pixel-space collision geometry from
 * lat/lon (quadrant/rank) geometry. Keyed by exact lat/lon pair. */
function makeLookupProject(
  entries: { lat: number; lon: number; x: number; y: number }[],
): (lat: number, lon: number) => AreaMarkerProjection {
  const map = new Map<string, AreaMarkerProjection>();
  for (const e of entries) map.set(`${e.lat}|${e.lon}`, { x: e.x, y: e.y });
  return (lat: number, lon: number): AreaMarkerProjection => {
    const pt = map.get(`${lat}|${lon}`);
    if (!pt) throw new Error(`No projection registered for lat=${lat} lon=${lon}`);
    return pt;
  };
}

// Issue #1815 soft-veto follow-up: pxBase offset widened from 2000 to 6000.
// At 2000, NE's own 8-member row under SPREAD_FIXTURE's 300px spacing spans
// x=[0, 2100] — which encroaches within the 256px collision footprint of
// NW's block starting at x=2000 (NE's cap-selected members reach x=1800,
// only 200px from NW-0). Under the OLD isLastInQuadrant exemption this
// latent cross-quadrant collision was silently swept under the rug (NW's
// sole non-forced rep was unconditionally kept, never collision-checked).
// Now that no-overlap always wins (no quadrant exemption), that real
// collision is correctly detected — which is exactly the intended new
// behaviour, but it broke this fixture's own "guarantees zero collisions"
// contract. 6000 gives ample headroom for both DENSE_FIXTURE (max internal
// span ~480px) and SPREAD_FIXTURE (max internal span ~2400px) with no
// encroachment in either case.
const QUADRANTS = [
  { name: 'NE', latBase: 6, lonBase: 6, pxBase: { x: 0, y: 0 }, count: 8 },
  { name: 'NW', latBase: 6, lonBase: 4, pxBase: { x: 6000, y: 0 }, count: 7 },
  { name: 'SE', latBase: 4, lonBase: 6, pxBase: { x: 0, y: 6000 }, count: 7 },
  { name: 'SW', latBase: 4, lonBase: 4, pxBase: { x: 6000, y: 6000 }, count: 7 },
] as const;

/** rowSpacingPx=60 (dense — guarantees adjacent-cell rep collisions).
 * rowSpacingPx=300 (spread — guarantees zero collisions, every area its
 * own grid cell, cap is reached exactly). */
function buildQuadrantFixture(rowSpacingPx: number): { areas: RankableArea[]; project: ReturnType<typeof makeLookupProject> } {
  const areas: RankableArea[] = [];
  const projectionEntries: { lat: number; lon: number; x: number; y: number }[] = [];
  let globalIndex = 0;
  for (const q of QUADRANTS) {
    for (let i = 0; i < q.count; i++) {
      const id = `${q.name}-${i}`;
      const lat = q.latBase + i * 0.001;
      const lon = q.lonBase + i * 0.001;
      const count = 1000 - globalIndex * 5;
      areas.push({ id, name: id, count, lat, lon });
      projectionEntries.push({ lat, lon, x: q.pxBase.x + i * rowSpacingPx, y: q.pxBase.y });
      globalIndex++;
    }
  }
  return { areas, project: makeLookupProject(projectionEntries) };
}

const DENSE_FIXTURE = buildQuadrantFixture(60);
const SPREAD_FIXTURE = buildQuadrantFixture(300);

const WIDE_VIEWPORT = { width: 1200, height: 900 };
const NARROW_VIEWPORT = { width: 400, height: 800 };

function baseInput(
  fixture: { areas: RankableArea[]; project: ReturnType<typeof makeLookupProject> },
  viewport: { width: number; height: number },
  forced: AreaMarkerForcedInput = {},
) {
  return {
    areas: fixture.areas,
    project: fixture.project,
    viewport,
    zoom: 14,
    forced,
    groupBounds: DENSE_BOUNDS,
  };
}

/** Per-label footprint model used by demoteCollidingRepresentatives (Issue
 * #1815 round 2) — mirrors areaMarkerBucketing.ts's private
 * REP_LABEL_FOOTPRINT_BASE_PX/CHAR_PX/TRUNCATE_MAX_CHARS + LABEL_MIN_GAP_PX
 * constants exactly. Round 1 used a single fixed REP_LABEL_FOOTPRINT_W=248
 * for every rep (itself a fix for CHIP_W=176, the area-cluster CHIP
 * footprint, which under-sized real representative pills). Live E2E then
 * showed the flat 248 over-demoted short-named reps (reserving more width
 * than their real ~198px pill needs), collapsing a 29-area dense group to 1
 * labelled pill. Round 2 makes the width PER-LABEL, tracking each rep's own
 * (possibly-truncated) name length like the real makeAreaCard pill does.
 * MUST BE KEPT IN SYNC with those production constants — if they change
 * again, update these too or these tests silently stop testing the real
 * collision box. */
const REP_LABEL_FOOTPRINT_BASE_PX = 107;
const REP_LABEL_FOOTPRINT_CHAR_PX = 7;
const REP_LABEL_TRUNCATE_MAX_CHARS = 18;
const FOOTPRINT_H = 44 + 8;

function estimateFootprintWidth(name: string): number {
  const chars = Math.min(name.length, REP_LABEL_TRUNCATE_MAX_CHARS);
  return REP_LABEL_FOOTPRINT_BASE_PX + chars * REP_LABEL_FOOTPRINT_CHAR_PX + 8; // +LABEL_MIN_GAP_PX
}

function footprintsOverlap(
  a: AreaMarkerProjection,
  aName: string,
  b: AreaMarkerProjection,
  bName: string,
): boolean {
  const aw = estimateFootprintWidth(aName);
  const bw = estimateFootprintWidth(bName);
  return Math.abs(a.x - b.x) * 2 < aw + bw && Math.abs(a.y - b.y) * 2 < FOOTPRINT_H + FOOTPRINT_H;
}

// ── 1. ZERO-OVERLAP (AC1) ───────────────────────────────────────────────────

describe('#1815 demoteCollidingRepresentatives — zero-overlap (AC1)', () => {
  it('no two representatives have overlapping label footprints after computeAreaMarkers on a dense fixture', () => {
    const result = computeAreaMarkers(baseInput(DENSE_FIXTURE, WIDE_VIEWPORT));
    expect(result.representatives.length).toBeGreaterThan(1);
    for (let i = 0; i < result.representatives.length; i++) {
      for (let j = i + 1; j < result.representatives.length; j++) {
        const a = result.representatives[i];
        const b = result.representatives[j];
        const pxA = DENSE_FIXTURE.project(a.lat, a.lon);
        const pxB = DENSE_FIXTURE.project(b.lat, b.lon);
        expect(footprintsOverlap(pxA, a.name, pxB, b.name)).toBe(false);
      }
    }
  });

  it('no two representatives overlap on the narrow viewport either', () => {
    const result = computeAreaMarkers(baseInput(DENSE_FIXTURE, NARROW_VIEWPORT));
    for (let i = 0; i < result.representatives.length; i++) {
      for (let j = i + 1; j < result.representatives.length; j++) {
        const a = result.representatives[i];
        const b = result.representatives[j];
        const pxA = DENSE_FIXTURE.project(a.lat, a.lon);
        const pxB = DENSE_FIXTURE.project(b.lat, b.lon);
        expect(footprintsOverlap(pxA, a.name, pxB, b.name)).toBe(false);
      }
    }
  });
});

// ── 1b. OLD-FOOTPRINT REGRESSION GUARD (the live-E2E #1815 bug) ────────────
//
// The original production fix used the area-cluster CHIP footprint
// (CHIP_W=176/CHIP_H=64 => 184x72 incl. gap) to collision-check
// REPRESENTATIVE labels too. Real representative pills are wider/shorter
// (observed 218-233px x ~36.5px), so a same-row pair separated by
// ~190-250px screen px would NOT collide under the old 184px-wide box and
// would incorrectly survive as two overlapping representatives in a real
// browser — the exact live-E2E defect. Production now models the
// representative footprint PER-LABEL (round 2 — estimateRepFootprintWidth),
// so this test uses two LONG (18-char, i.e. truncation-cap-length) names —
// near the per-label model's own maximum width (~241px), close to round 1's
// flat 248px — so the historical 220px blind-spot window is still
// meaningfully exercised. This test plants such a pair in that window and
// proves current production code demotes one of them.
describe('#1815 demoteCollidingRepresentatives — old-footprint regression guard (bug window ~190-250px)', () => {
  const OLD_FOOTPRINT_W = 176 + 8; // pre-fix CHIP_W + gap — the buggy, too-narrow box
  const OLD_FOOTPRINT_H = 64 + 8;

  function oldFootprintsOverlap(a: AreaMarkerProjection, b: AreaMarkerProjection): boolean {
    return (
      Math.abs(a.x - b.x) * 2 < OLD_FOOTPRINT_W + OLD_FOOTPRINT_W &&
      Math.abs(a.y - b.y) * 2 < OLD_FOOTPRINT_H + OLD_FOOTPRINT_H
    );
  }

  // Band 9-15 (simple top-N rank slice, no grid-cell mechanics) keeps the
  // fixture minimal. bug-a/bug-b are the two colliding, same-rank-tier,
  // NON-forced rep-designates, 220px apart on the same row (dx=220, dy=0),
  // each with an 18-character (truncation-cap-length) name so their
  // per-label estimated width (~241px each) sits near the round-1 flat
  // footprint's value:
  //  - old box (184x72):            220 >= 184 => NO collision (the round-1 bug).
  //  - per-label box (~241x52 each): 220 <  241+241/2-ish combined => collision (the fix).
  // 6 filler areas share bug-a/bug-b's quadrant (NE) and rank tier, spaced
  // 500px apart so they never collide with bug-a/bug-b or each other — this
  // keeps NE's non-forced-rep count well above 1 (no quadrant exemption
  // exists any more post-soft-veto, but the spacing still proves this isn't
  // an accidental multi-way pileup). 2 more low-rank areas pad the fixture
  // to the 9-15 band without affecting the top-8 slice.
  const BUG_A_NAME = 'ThanisandraHennur1'; // 18 chars = the estimate's own truncation cap — near-max per-label width
  const BUG_B_NAME = 'ThanisandraHennur2';
  const bugAreas: RankableArea[] = [
    { id: 'bug-a', name: BUG_A_NAME, count: 100, lat: 6, lon: 6 },
    { id: 'bug-b', name: BUG_B_NAME, count: 99, lat: 6.001, lon: 6.001 },
    { id: 'filler-1', name: 'filler-1', count: 90, lat: 6.01, lon: 6.01 },
    { id: 'filler-2', name: 'filler-2', count: 85, lat: 6.02, lon: 6.02 },
    { id: 'filler-3', name: 'filler-3', count: 80, lat: 6.03, lon: 6.03 },
    { id: 'filler-4', name: 'filler-4', count: 75, lat: 6.04, lon: 6.04 },
    { id: 'filler-5', name: 'filler-5', count: 70, lat: 6.05, lon: 6.05 },
    { id: 'filler-6', name: 'filler-6', count: 65, lat: 6.06, lon: 6.06 },
    { id: 'low-1', name: 'low-1', count: 10, lat: 6.07, lon: 6.07 },
    { id: 'low-2', name: 'low-2', count: 5, lat: 6.08, lon: 6.08 },
  ];
  const bugProject = makeLookupProject([
    { lat: 6, lon: 6, x: 0, y: 0 },
    { lat: 6.001, lon: 6.001, x: 220, y: 0 }, // bug-b: 220px from bug-a, same y
    { lat: 6.01, lon: 6.01, x: 1000, y: 0 },
    { lat: 6.02, lon: 6.02, x: 1500, y: 0 },
    { lat: 6.03, lon: 6.03, x: 2000, y: 0 },
    { lat: 6.04, lon: 6.04, x: 2500, y: 0 },
    { lat: 6.05, lon: 6.05, x: 3000, y: 0 },
    { lat: 6.06, lon: 6.06, x: 3500, y: 0 },
    { lat: 6.07, lon: 6.07, x: 4000, y: 0 },
    { lat: 6.08, lon: 6.08, x: 4500, y: 0 },
  ]);
  const bugInput = {
    areas: bugAreas,
    project: bugProject,
    viewport: WIDE_VIEWPORT,
    zoom: 14,
    forced: {},
    groupBounds: DENSE_BOUNDS,
  };

  it('sanity check: bug-a/bug-b (18-char names) sit in the old-buggy-but-new-caught window', () => {
    const pxA = bugProject(6, 6);
    const pxB = bugProject(6.001, 6.001);
    const dx = Math.abs(pxA.x - pxB.x);
    expect(dx).toBe(220);
    expect(dx).toBeGreaterThanOrEqual(OLD_FOOTPRINT_W); // old (round-1-precursor) box: no collision
    const aw = estimateFootprintWidth(BUG_A_NAME);
    const bw = estimateFootprintWidth(BUG_B_NAME);
    expect(dx * 2).toBeLessThan(aw + bw); // per-label box: collision
    expect(oldFootprintsOverlap(pxA, pxB)).toBe(false); // would have been MISSED pre-fix
    expect(footprintsOverlap(pxA, BUG_A_NAME, pxB, BUG_B_NAME)).toBe(true); // IS caught post-fix
  });

  it('current (fixed) production code demotes exactly one of bug-a/bug-b — never keeps both as overlapping representatives', () => {
    const result = computeAreaMarkers(bugInput);

    const aIsRep = result.representatives.some((r) => r.id === 'bug-a');
    const bIsRep = result.representatives.some((r) => r.id === 'bug-b');
    // Never both — this is what the old 184px footprint would have gotten
    // wrong (both would have survived as overlapping representatives).
    expect(aIsRep && bIsRep).toBe(false);
    // At least one survives as a representative (the higher-ranked, bug-a).
    expect(aIsRep || bIsRep).toBe(true);
    expect(aIsRep).toBe(true);
    expect(bIsRep).toBe(false);

    // The demoted one (bug-b) reappears in dots/clusters — never silently dropped.
    const bInDots = result.dots.some((a) => a.id === 'bug-b');
    const bInClusters = result.clusters.some((c) => c.areas.some((a) => a.id === 'bug-b'));
    expect(bInDots || bInClusters).toBe(true);
  });
});

// ── 2. CAP / R1 (AC2 + refinement R1) ───────────────────────────────────────

describe('#1815 demoteCollidingRepresentatives — cap / R1 (AC2 + refinement R1)', () => {
  it('dense (colliding) fixture settles well under cap on a wide viewport (<=8) and total nav markers <=12', () => {
    const result = computeAreaMarkers(baseInput(DENSE_FIXTURE, WIDE_VIEWPORT));
    expect(result.representatives.length).toBeLessThanOrEqual(10);
    expect(result.representatives.length).toBeLessThanOrEqual(8);
    expect(result.representatives.length + result.clusters.length).toBeLessThanOrEqual(12);
  });

  it('dense (colliding) fixture stays <=8 representatives on a narrow (<=520px) viewport, total nav markers <=12', () => {
    const result = computeAreaMarkers(baseInput(DENSE_FIXTURE, NARROW_VIEWPORT));
    expect(result.representatives.length).toBeLessThanOrEqual(8);
    expect(result.representatives.length + result.clusters.length).toBeLessThanOrEqual(12);
  });

  it('collision-free (spread) fixture reaches the wide-viewport cap of 10 representatives', () => {
    const result = computeAreaMarkers(baseInput(SPREAD_FIXTURE, WIDE_VIEWPORT));
    expect(result.representatives.length).toBe(10);
    expect(result.representatives.length + result.clusters.length).toBeLessThanOrEqual(12);
  });

  it('collision-free (spread) fixture reaches the narrow-viewport cap of 8 representatives', () => {
    const result = computeAreaMarkers(baseInput(SPREAD_FIXTURE, NARROW_VIEWPORT));
    expect(result.representatives.length).toBe(8);
    expect(result.representatives.length + result.clusters.length).toBeLessThanOrEqual(12);
  });
});

// ── 3. FORCED-ALWAYS EXEMPTION (AC3/R4) ─────────────────────────────────────
//
// NE-2 is the rep-designate of NE's second grid cell (120px from NE-0, the
// top-ranked cell in the dominant NE quadrant) — hand-verified to collide
// with NE-0 and be the one demoted under plain (non-forced) ranking.

describe('#1815 demoteCollidingRepresentatives — forced-always exemption (AC3/R4)', () => {
  it('without forcing, NE-2 (a real footprint collision loser) is demoted out of representatives', () => {
    const result = computeAreaMarkers(baseInput(DENSE_FIXTURE, WIDE_VIEWPORT));
    expect(result.representatives.some((a) => a.id === 'NE-2')).toBe(false);
    const inDots = result.dots.some((a) => a.id === 'NE-2');
    const inCluster = result.clusters.some((c) => c.areas.some((a) => a.id === 'NE-2'));
    expect(inDots || inCluster).toBe(true);
  });

  it('with selectedId=NE-2, the same area is always kept as a representative, never demoted to dots/clusters', () => {
    const result = computeAreaMarkers(
      baseInput(DENSE_FIXTURE, WIDE_VIEWPORT, { selectedId: 'NE-2' }),
    );
    expect(result.representatives.some((a) => a.id === 'NE-2')).toBe(true);
    expect(result.dots.some((a) => a.id === 'NE-2')).toBe(false);
    expect(result.clusters.some((c) => c.areas.some((a) => a.id === 'NE-2'))).toBe(false);
  });

  it('with hoveredOrFocusedId=NE-2, the area is kept as a representative', () => {
    const result = computeAreaMarkers(
      baseInput(DENSE_FIXTURE, WIDE_VIEWPORT, { hoveredOrFocusedId: 'NE-2' }),
    );
    expect(result.representatives.some((a) => a.id === 'NE-2')).toBe(true);
  });

  it('with searchMatchIds containing NE-2, the area is kept as a representative', () => {
    const result = computeAreaMarkers(
      baseInput(DENSE_FIXTURE, WIDE_VIEWPORT, { searchMatchIds: new Set(['NE-2']) }),
    );
    expect(result.representatives.some((a) => a.id === 'NE-2')).toBe(true);
  });
});

// ── 4. HOVER-STABILITY (R1 — reviewer's recommended regression) ────────────
//
// SW quadrant settles to exactly ONE non-forced representative (SW-0) under
// plain ranking — hand-verified: SW-0 and SW-2 are SW's two grid-stage
// rep-designates (120px apart, colliding); SW-2 loses. Hovering a DIFFERENT,
// non-representative area in SW (SW-5) must not change SW-0's fate, because
// the quadrant-exemption tally and the obstacle set are both seeded from
// NON-FORCED reps only.

describe('#1815 demoteCollidingRepresentatives — hover-stability (R1)', () => {
  it('SW quadrant settles to exactly one non-forced representative (SW-0) under plain ranking (fixture sanity check)', () => {
    const baseline = computeAreaMarkers(baseInput(DENSE_FIXTURE, WIDE_VIEWPORT));
    const swReps = baseline.representatives.filter((a) => a.id.startsWith('SW-'));
    expect(swReps.map((a) => a.id)).toEqual(['SW-0']);
  });

  it('hovering a DIFFERENT area (SW-5) in the same quadrant does not demote SW-0, and leaves the non-forced demoted set unchanged', () => {
    const baseline = computeAreaMarkers(baseInput(DENSE_FIXTURE, WIDE_VIEWPORT));
    const hovered = computeAreaMarkers(
      baseInput(DENSE_FIXTURE, WIDE_VIEWPORT, { hoveredOrFocusedId: 'SW-5' }),
    );

    // R (SW-0) is kept in both runs.
    expect(baseline.representatives.some((a) => a.id === 'SW-0')).toBe(true);
    expect(hovered.representatives.some((a) => a.id === 'SW-0')).toBe(true);

    // The set of demoted NON-forced reps (everything that isn't SW-5, which
    // is forced in the hovered run) is identical between the two runs.
    const nonForcedIds = (r: typeof baseline) =>
      [...r.representatives, ...r.dots, ...r.clusters.flatMap((c) => c.areas)]
        .map((a) => a.id)
        .filter((id) => id !== 'SW-5');
    const baselineDemoted = baseline.dots.map((a) => a.id).concat(baseline.clusters.flatMap((c) => c.areas.map((a) => a.id)));
    const hoveredDemotedNonForced = hovered.dots
      .map((a) => a.id)
      .concat(hovered.clusters.flatMap((c) => c.areas.map((a) => a.id)))
      .filter((id) => id !== 'SW-5');
    // SW-5 itself was already inside a cluster pre-hover (not a rep), so
    // excluding it from both sides makes the remaining demoted sets equal.
    expect(new Set(hoveredDemotedNonForced)).toEqual(new Set(baselineDemoted.filter((id) => id !== 'SW-5')));
    void nonForcedIds;
  });

  it('SW-5 itself is forced into representatives when hovered (sanity check the promotion actually happened)', () => {
    const hovered = computeAreaMarkers(
      baseInput(DENSE_FIXTURE, WIDE_VIEWPORT, { hoveredOrFocusedId: 'SW-5' }),
    );
    expect(hovered.representatives.some((a) => a.id === 'SW-5')).toBe(true);
  });
});

// ── 5. DETERMINISM (R8) ─────────────────────────────────────────────────────

describe('#1815 demoteCollidingRepresentatives — determinism (R8)', () => {
  it('identical input produces deeply-equal output across repeated calls (dense, colliding fixture)', () => {
    const input = baseInput(DENSE_FIXTURE, WIDE_VIEWPORT);
    const r1 = computeAreaMarkers(input);
    const r2 = computeAreaMarkers(input);
    const r3 = computeAreaMarkers(input);
    expect(r2).toEqual(r1);
    expect(r3).toEqual(r1);
  });

  it('identical input with a forced set is also deterministic across repeated calls', () => {
    const input = baseInput(DENSE_FIXTURE, WIDE_VIEWPORT, { hoveredOrFocusedId: 'SW-5' });
    const r1 = computeAreaMarkers(input);
    const r2 = computeAreaMarkers(input);
    expect(r2).toEqual(r1);
  });

  // Issue #1815 live-e2e diagnostic follow-up: the e2e observed a 29-area
  // dense group settling to a different pill count (4 then 1) across two
  // back-to-back fresh page loads. Before touching production code, isolate
  // whether the ALGORITHM itself could be the source — run it MANY times
  // (not just 2-3) on the same realistic 29-area dense/quadrant fixture and
  // assert byte-identical output every time. If this passes (expected, given
  // the module-level "no Math.random/Date, no Set/Map iteration-order
  // dependence" contract and the existing tests above), it proves the
  // variance is NOT algorithmic — it must come from DIFFERENT INPUT between
  // the two browser renders (i.e. project()/zoom/camera-settle timing in
  // AreaMarkerLayer.tsx or the e2e's own wait strategy), not from
  // computeAreaMarkers non-determinism.
  it('remains byte-identical across 10 repeated calls on the realistic 29-area dense fixture (isolates e2e pill-count variance to input/timing, not the algorithm)', () => {
    const input = baseInput(DENSE_FIXTURE, WIDE_VIEWPORT);
    const results = Array.from({ length: 10 }, () => computeAreaMarkers(input));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });
});

// ── 6. QUADRANT PRESERVATION — NOW SOFT, NO-OVERLAP ALWAYS WINS (R5/AC1) ───
//
// PRECEDENCE DECISION (Issue #1815 live-E2E follow-up, user-approved): the
// per-quadrant "≥1 representative" guarantee is no longer an absolute veto
// over a real footprint collision — see demoteCollidingRepresentatives' doc
// comment. A quadrant CAN legitimately drop to zero persistent
// representatives when its sole candidate collides with an already-kept one.
//
// The three tests below (DENSE_FIXTURE, wide + narrow viewport) still assert
// "≥1 rep per quadrant" and still PASS — but that is now a fixture property,
// not a guarantee the algorithm enforces: DENSE_FIXTURE's quadrants are
// pixel-offset far enough apart (see QUADRANTS above) that no cross-quadrant
// collision is ever geometrically possible, so each quadrant's sole survivor
// (the winner of its own INTRA-quadrant collision cascade) never collides
// with anything outside its quadrant either. The dedicated
// "quadrant can drop to zero" test below constructs a fixture where a
// cross-quadrant collision genuinely occurs, proving the new precedence.

describe('#1815 demoteCollidingRepresentatives — quadrant preservation holds in the NON-colliding case (R5, dense fixture)', () => {
  it('at least one representative remains in each of the 4 non-empty quadrants (dense fixture — no cross-quadrant collision exists)', () => {
    const result = computeAreaMarkers(baseInput(DENSE_FIXTURE, WIDE_VIEWPORT));
    for (const q of ['NE', 'NW', 'SE', 'SW']) {
      const inQuadrant = result.representatives.filter((a) => a.id.startsWith(`${q}-`));
      expect(inQuadrant.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('the dense group is never collapsed to zero representatives + a single cluster', () => {
    const result = computeAreaMarkers(baseInput(DENSE_FIXTURE, WIDE_VIEWPORT));
    expect(result.representatives.length).toBeGreaterThanOrEqual(4); // >= number of non-empty quadrants
    expect(result.clusters.length === 1 && result.representatives.length === 0).toBe(false);
  });

  it('quadrant preservation also holds on the narrow viewport (still no cross-quadrant collision)', () => {
    const result = computeAreaMarkers(baseInput(DENSE_FIXTURE, NARROW_VIEWPORT));
    for (const q of ['NE', 'NW', 'SE', 'SW']) {
      const inQuadrant = result.representatives.filter((a) => a.id.startsWith(`${q}-`));
      expect(inQuadrant.length).toBeGreaterThanOrEqual(1);
    }
    expect(result.clusters.length === 1 && result.representatives.length === 0).toBe(false);
  });

  it('the collision-free (spread) fixture also keeps at least one representative per quadrant with ZERO pairwise overlap (explicit non-colliding proof)', () => {
    const result = computeAreaMarkers(baseInput(SPREAD_FIXTURE, WIDE_VIEWPORT));
    for (const q of ['NE', 'NW', 'SE', 'SW']) {
      const inQuadrant = result.representatives.filter((a) => a.id.startsWith(`${q}-`));
      expect(inQuadrant.length).toBeGreaterThanOrEqual(1);
    }
    for (let i = 0; i < result.representatives.length; i++) {
      for (let j = i + 1; j < result.representatives.length; j++) {
        const repA = result.representatives[i];
        const repB = result.representatives[j];
        const pxA = SPREAD_FIXTURE.project(repA.lat, repA.lon);
        const pxB = SPREAD_FIXTURE.project(repB.lat, repB.lon);
        expect(footprintsOverlap(pxA, repA.name, pxB, repB.name)).toBe(false);
      }
    }
  });
});

// A minimal, hand-computed fixture: q-hi (NE) and q-lo (NW) are each the
// SOLE representative candidate of their own quadrant, but are placed only
// 100px apart on screen — a genuine cross-quadrant collision (100px is well
// inside the per-label collision footprint even for these short 4-char
// names, ~143px each => combined 286px). q-se/q-sw are each their quadrant's sole candidate too,
// but far away from everything (no collision). 4 low-rank fillers pad the
// fixture into the 9-15 band (band 1-8 is exempt from this pass entirely) and
// are placed far from everything so they never introduce a stray collision.
const SOFT_VETO_BOUNDS: AreaMarkerGroupBounds = { minLat: 0, maxLat: 10, minLon: 0, maxLon: 10 };
const softVetoAreas: RankableArea[] = [
  { id: 'q-hi', name: 'q-hi', count: 100, lat: 6, lon: 6 }, // NE
  { id: 'q-lo', name: 'q-lo', count: 90, lat: 6, lon: 4 }, // NW — collides with q-hi
  { id: 'q-se', name: 'q-se', count: 50, lat: 4, lon: 6 }, // SE — far, no collision
  { id: 'q-sw', name: 'q-sw', count: 40, lat: 4, lon: 4 }, // SW — far, no collision
  { id: 'filler-1', name: 'filler-1', count: 30, lat: 6.01, lon: 6.01 },
  { id: 'filler-2', name: 'filler-2', count: 25, lat: 6.02, lon: 6.02 },
  { id: 'filler-3', name: 'filler-3', count: 20, lat: 6.03, lon: 6.03 },
  { id: 'filler-4', name: 'filler-4', count: 15, lat: 6.04, lon: 6.04 },
  { id: 'filler-5', name: 'filler-5', count: 10, lat: 6.05, lon: 6.05 },
];
const softVetoProject = makeLookupProject([
  { lat: 6, lon: 6, x: 0, y: 0 }, // q-hi
  { lat: 6, lon: 4, x: 100, y: 0 }, // q-lo — 100px from q-hi (collides)
  { lat: 4, lon: 6, x: 9000, y: 9000 }, // q-se
  { lat: 4, lon: 4, x: 9500, y: 9500 }, // q-sw
  { lat: 6.01, lon: 6.01, x: 12000, y: 0 },
  { lat: 6.02, lon: 6.02, x: 13000, y: 0 },
  { lat: 6.03, lon: 6.03, x: 14000, y: 0 },
  { lat: 6.04, lon: 6.04, x: 15000, y: 0 },
  { lat: 6.05, lon: 6.05, x: 16000, y: 0 },
]);
const softVetoInput = {
  areas: softVetoAreas,
  project: softVetoProject,
  viewport: WIDE_VIEWPORT,
  zoom: 14,
  forced: {},
  groupBounds: SOFT_VETO_BOUNDS,
};

describe('#1815 demoteCollidingRepresentatives — a lone-quadrant representative CAN now drop to zero on a real collision (R5 soft-veto)', () => {
  it('sanity check: q-hi/q-lo sit inside the collision footprint (100px apart)', () => {
    const pxA = softVetoProject(6, 6);
    const pxB = softVetoProject(6, 4);
    expect(Math.abs(pxA.x - pxB.x)).toBe(100);
    expect(footprintsOverlap(pxA, 'q-hi', pxB, 'q-lo')).toBe(true);
  });

  it('q-lo (NW\'s sole candidate) is demoted despite being the last representative in its quadrant — no-overlap wins', () => {
    const result = computeAreaMarkers(softVetoInput);
    expect(result.representatives.some((a) => a.id === 'q-hi')).toBe(true);
    expect(result.representatives.some((a) => a.id === 'q-lo')).toBe(false);
    // NW now legitimately has ZERO representatives — the old absolute
    // per-quadrant veto would have kept q-lo regardless of the collision.
    const nwReps = result.representatives.filter((a) => a.id === 'q-lo');
    expect(nwReps.length).toBe(0);
  });

  it('the demoted q-lo is conserved — present in dots or a cluster, never silently dropped', () => {
    const result = computeAreaMarkers(softVetoInput);
    const inDots = result.dots.some((a) => a.id === 'q-lo');
    const inCluster = result.clusters.some((c) => c.areas.some((a) => a.id === 'q-lo'));
    expect(inDots || inCluster).toBe(true);
  });

  it('every surviving representative pair has zero footprint overlap (AC1 holds even though NW dropped to zero)', () => {
    const result = computeAreaMarkers(softVetoInput);
    expect(result.representatives.length).toBeGreaterThan(1);
    for (let i = 0; i < result.representatives.length; i++) {
      for (let j = i + 1; j < result.representatives.length; j++) {
        const repA = result.representatives[i];
        const repB = result.representatives[j];
        const pxA = softVetoProject(repA.lat, repA.lon);
        const pxB = softVetoProject(repB.lat, repB.lon);
        expect(footprintsOverlap(pxA, repA.name, pxB, repB.name)).toBe(false);
      }
    }
  });

  it('unrelated quadrants (SE, SW) are unaffected — each keeps its own sole, non-colliding representative', () => {
    const result = computeAreaMarkers(softVetoInput);
    expect(result.representatives.some((a) => a.id === 'q-se')).toBe(true);
    expect(result.representatives.some((a) => a.id === 'q-sw')).toBe(true);
  });

  it('conservation holds: representatives + dots + sum(cluster.areas) === input area count', () => {
    const result = computeAreaMarkers(softVetoInput);
    const clusterAreaCount = result.clusters.reduce((sum, c) => sum + c.areas.length, 0);
    const total = result.representatives.length + result.dots.length + clusterAreaCount;
    expect(total).toBe(softVetoAreas.length);
  });
});

// ── 7. CONSERVATION (R7) ────────────────────────────────────────────────────

describe('#1815 demoteCollidingRepresentatives — conservation (R7)', () => {
  it('representatives + dots + sum(cluster.areas) === input area count, no silent loss (dense fixture)', () => {
    const result = computeAreaMarkers(baseInput(DENSE_FIXTURE, WIDE_VIEWPORT));
    const clusterAreaCount = result.clusters.reduce((sum, c) => sum + c.areas.length, 0);
    const total = result.representatives.length + result.dots.length + clusterAreaCount;
    expect(total).toBe(DENSE_FIXTURE.areas.length);
  });

  it('conservation also holds on the narrow viewport and with a forced set active', () => {
    const result = computeAreaMarkers(
      baseInput(DENSE_FIXTURE, NARROW_VIEWPORT, { selectedId: 'NE-2', hoveredOrFocusedId: 'SW-5' }),
    );
    const clusterAreaCount = result.clusters.reduce((sum, c) => sum + c.areas.length, 0);
    const total = result.representatives.length + result.dots.length + clusterAreaCount;
    expect(total).toBe(DENSE_FIXTURE.areas.length);
  });

  it('no area id appears more than once across representatives/dots/clusters combined', () => {
    const result = computeAreaMarkers(baseInput(DENSE_FIXTURE, WIDE_VIEWPORT));
    const allIds = [
      ...result.representatives.map((a) => a.id),
      ...result.dots.map((a) => a.id),
      ...result.clusters.flatMap((c) => c.areas.map((a) => a.id)),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

// ── 8. BAND GATE (1-8 band skips the pass entirely) ─────────────────────────

describe('#1815 demoteCollidingRepresentatives — band gate (1-8 band is skipped)', () => {
  it('a 1-8-band fixture with two coincident points does NOT demote either — both remain representatives', () => {
    const areas: RankableArea[] = [
      { id: 'a1', name: 'a1', count: 10, lat: 1, lon: 1 },
      { id: 'a2', name: 'a2', count: 9, lat: 1, lon: 1 }, // exact coincident point with a1
      { id: 'a3', name: 'a3', count: 8, lat: 2, lon: 2 },
      { id: 'a4', name: 'a4', count: 7, lat: 3, lon: 3 },
      { id: 'a5', name: 'a5', count: 6, lat: 4, lon: 4 },
    ];
    // Coincident-point projection: a1/a2 land on the exact same pixel (worst
    // possible collision) — the 1-8 band gate must keep both anyway.
    const project = (lat: number, lon: number): AreaMarkerProjection => ({ x: lon * 1000, y: lat * 1000 });
    const result = computeAreaMarkers({
      areas,
      project,
      viewport: WIDE_VIEWPORT,
      zoom: 14,
      forced: {},
      groupBounds: { minLat: 1, minLon: 1, maxLat: 4, maxLon: 4 },
    });
    expect(result.band).toBe('1-8');
    expect(result.representatives.length).toBe(5);
    expect(result.representatives.some((a) => a.id === 'a1')).toBe(true);
    expect(result.representatives.some((a) => a.id === 'a2')).toBe(true);
    expect(result.clusters).toEqual([]);
    expect(result.dots).toEqual([]);
  });
});

// ── 9. TEMPORARY-PROMOTION-REVERTS (R6) ─────────────────────────────────────

describe('#1815 demoteCollidingRepresentatives — temporary-promotion-reverts (R6)', () => {
  it('a forced set is additive/session-scoped: recomputing with forced={} afterwards reverts to the plain deterministic layout', () => {
    const plain = computeAreaMarkers(baseInput(DENSE_FIXTURE, WIDE_VIEWPORT, {}));
    // Simulate "hover then un-hover": compute with a forced set active first...
    computeAreaMarkers(baseInput(DENSE_FIXTURE, WIDE_VIEWPORT, { hoveredOrFocusedId: 'SW-5' }));
    // ...then recompute with the forced set cleared — must equal the plain layout,
    // proving the function carries no hidden state across calls.
    const reverted = computeAreaMarkers(baseInput(DENSE_FIXTURE, WIDE_VIEWPORT, {}));
    expect(reverted).toEqual(plain);
  });

  it('reverting also holds for selectedId (not just hover)', () => {
    const plain = computeAreaMarkers(baseInput(DENSE_FIXTURE, NARROW_VIEWPORT, {}));
    computeAreaMarkers(baseInput(DENSE_FIXTURE, NARROW_VIEWPORT, { selectedId: 'NE-2' }));
    const reverted = computeAreaMarkers(baseInput(DENSE_FIXTURE, NARROW_VIEWPORT, {}));
    expect(reverted).toEqual(plain);
  });
});
