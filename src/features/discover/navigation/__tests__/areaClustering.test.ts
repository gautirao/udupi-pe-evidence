/**
 * areaClustering.test.ts — Issue #1956 PR 3 (Slice 4).
 */
import { describe, it, expect } from 'vitest';
import {
  clusterAreaMembers,
  clusterVisibleAreaMembers,
  isUsableCentroid,
  boundsOfMembers,
  footprintsIntersect,
  footprintRectAt,
  AREA_CARD_FOOTPRINT_WIDTH_PX,
  AREA_CARD_FOOTPRINT_HEIGHT_PX,
  type ClusterableAreaMember,
  type ProjectFn,
} from '../areaClustering';

/** Identity-ish projection: 1 degree == 1000px, so nearby areas land in the same/different grid cells predictably. */
const project: ProjectFn = (lat, lon) => ({ x: lon * 1000, y: lat * 1000 });

function member(overrides: Partial<ClusterableAreaMember> & { areaKey: string }): ClusterableAreaMember {
  return {
    nodeKey: `a:${overrides.areaKey}`,
    // Issue #1943 (Slice B+C merge) — the AREA path's adapter convention:
    // identityKey = areaKey, so every existing test's areaKey-based
    // assertions (sort order, cellKey, membership) stay meaningful
    // unchanged. See the golden characterisation test below for the actual
    // byte-identity proof.
    identityKey: overrides.areaKey,
    displayLabel: overrides.areaKey,
    lat: 13.0,
    lon: 77.6,
    listingCount: 1,
    displayOrder: 0,
    schoolCount: 0,
    ...overrides,
  };
}

describe('isUsableCentroid', () => {
  it('accepts a normal in-range coordinate', () => {
    expect(isUsableCentroid(13.04, 77.59)).toBe(true);
  });

  it('rejects null/undefined', () => {
    expect(isUsableCentroid(null, 77.59)).toBe(false);
    expect(isUsableCentroid(13.04, undefined)).toBe(false);
    expect(isUsableCentroid(undefined, undefined)).toBe(false);
  });

  it('rejects (0, 0) Null Island', () => {
    expect(isUsableCentroid(0, 0)).toBe(false);
  });

  it('rejects out-of-range lat/lon', () => {
    expect(isUsableCentroid(91, 0.5)).toBe(false);
    expect(isUsableCentroid(-91, 0.5)).toBe(false);
    expect(isUsableCentroid(10, 181)).toBe(false);
    expect(isUsableCentroid(10, -181)).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(isUsableCentroid(Number.NaN, 77.59)).toBe(false);
    expect(isUsableCentroid(13.04, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('rejects a coordinate outside a supplied plausibility box', () => {
    const bounds = { minLat: 12.8, maxLat: 13.2, minLon: 77.4, maxLon: 77.8 };
    expect(isUsableCentroid(13.0, 77.6, bounds)).toBe(true);
    expect(isUsableCentroid(40.7, -74.0, bounds)).toBe(false); // New York, wildly outside Bangalore
  });
});

describe('clusterAreaMembers', () => {
  it('returns empty clusters/omitted for zero members', () => {
    const result = clusterAreaMembers([], project, 12);
    expect(result.clusters).toEqual([]);
    expect(result.omitted).toEqual([]);
  });

  it('places exactly one visible member into its own single-member cell', () => {
    const m = member({ areaKey: 'alpha', lat: 13.0, lon: 77.6 });
    const result = clusterAreaMembers([m], project, 12);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].members).toEqual([m]);
    expect(result.clusters[0].anchor).toEqual({ lat: 13.0, lon: 77.6 });
  });

  it('groups members by areaKey identity, never by displayLabel, even when labels deliberately disagree', () => {
    // Two members share a displayLabel; a third has a label that looks like
    // it belongs to the first. Membership must still track areaKey only.
    const m1 = member({ areaKey: 'zzz-key-1', displayLabel: 'Whitefield', lat: 13.0, lon: 77.6 });
    const m2 = member({ areaKey: 'aaa-key-2', displayLabel: 'Whitefield', lat: 13.0005, lon: 77.6005 });
    const m3 = member({ areaKey: 'mmm-key-3', displayLabel: 'Not Whitefield At All', lat: 13.0002, lon: 77.6002 });
    const result = clusterAreaMembers([m1, m2, m3], project, 16);
    expect(result.clusters).toHaveLength(1);
    const keys = result.clusters[0].members.map((m) => m.areaKey);
    expect(keys).toEqual(['aaa-key-2', 'mmm-key-3', 'zzz-key-1']); // areaKey-sorted, not label-sorted
  });

  it('is deterministic across repeated calls with identical input', () => {
    const members = [
      member({ areaKey: 'c', lat: 13.01, lon: 77.61 }),
      member({ areaKey: 'a', lat: 13.01, lon: 77.61 }),
      member({ areaKey: 'b', lat: 13.05, lon: 77.65 }),
    ];
    const first = clusterAreaMembers(members, project, 12);
    const second = clusterAreaMembers(members.slice().reverse(), project, 12);
    expect(second).toEqual(first);
  });

  it('breaks ties by areaKey when every member sits at the identical coordinate', () => {
    const members = [
      member({ areaKey: 'gamma', lat: 13.0, lon: 77.6 }),
      member({ areaKey: 'alpha', lat: 13.0, lon: 77.6 }),
      member({ areaKey: 'beta', lat: 13.0, lon: 77.6 }),
    ];
    const result = clusterAreaMembers(members, project, 12);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].members.map((m) => m.areaKey)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('groups near-identical coordinates within one grid cell', () => {
    const members = [
      member({ areaKey: 'a1', lat: 13.0, lon: 77.6 }),
      member({ areaKey: 'a2', lat: 13.0001, lon: 77.6001 }),
    ];
    const result = clusterAreaMembers(members, project, 16, { cellSizePx: 64 });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].members).toHaveLength(2);
  });

  it('splits members whose projected pixels land in different grid cells', () => {
    const members = [
      member({ areaKey: 'a1', lat: 13.0, lon: 77.6 }),
      member({ areaKey: 'a2', lat: 14.0, lon: 78.6 }), // far away at this projection scale
    ];
    const result = clusterAreaMembers(members, project, 12, { cellSizePx: 64 });
    expect(result.clusters).toHaveLength(2);
  });

  it('omits a member with a null centroid, siblings still render', () => {
    const good = member({ areaKey: 'good', lat: 13.0, lon: 77.6 });
    const bad = member({ areaKey: 'bad', lat: null as unknown as number, lon: 77.6 });
    const result = clusterAreaMembers([good, bad], project, 12);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].members).toEqual([good]);
    expect(result.omitted).toEqual([bad]);
  });

  it('omits a member with an undefined centroid, siblings still render', () => {
    const good = member({ areaKey: 'good', lat: 13.0, lon: 77.6 });
    const bad = member({ areaKey: 'bad', lat: undefined as unknown as number, lon: undefined as unknown as number });
    const result = clusterAreaMembers([good, bad], project, 12);
    expect(result.clusters).toHaveLength(1);
    expect(result.omitted).toEqual([bad]);
  });

  it('omits a (0, 0) Null Island coordinate', () => {
    const good = member({ areaKey: 'good', lat: 13.0, lon: 77.6 });
    const nullIsland = member({ areaKey: 'null-island', lat: 0, lon: 0 });
    const result = clusterAreaMembers([good, nullIsland], project, 12);
    expect(result.clusters).toHaveLength(1);
    expect(result.omitted.map((m) => m.areaKey)).toEqual(['null-island']);
  });

  it('never fabricates a position for an omitted member — omitted members carry no synthesized coordinate', () => {
    const bad = member({ areaKey: 'bad', lat: 0, lon: 0 });
    const result = clusterAreaMembers([bad], project, 12);
    expect(result.clusters).toEqual([]);
    expect(result.omitted).toEqual([bad]);
  });
});

describe('clusterVisibleAreaMembers — visibility applied before clustering', () => {
  it('excludes a zero-listing-count member from the Areas journey before it reaches the grid', () => {
    const eligible = member({ areaKey: 'has-listings', listingCount: 5, lat: 13.0, lon: 77.6 });
    const zeroContent = member({ areaKey: 'zero-listings', listingCount: 0, lat: 13.0, lon: 77.6 });
    const result = clusterVisibleAreaMembers([eligible, zeroContent], 'areas', project, 12);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].members).toEqual([eligible]);
    expect(result.hidden).toEqual([zeroContent]);
  });

  it('includes a zero-school-count member in the Schools journey to preserve canonical geography', () => {
    const eligible = member({ areaKey: 'has-schools', listingCount: 0, schoolCount: 3, lat: 13.0, lon: 77.6 });
    // Issue 2125 blocker: Do not hide/reparent zero-school nodes merely because Schools is active.
    const zeroContent = member({ areaKey: 'zero-schools', listingCount: 9, schoolCount: 0, lat: 13.1, lon: 77.7 });
    const result = clusterVisibleAreaMembers([eligible, zeroContent], 'schools', project, 12);
    expect(result.clusters.length).toBeGreaterThanOrEqual(1);
    expect(result.clusters.flatMap((c) => c.members)).toContainEqual(eligible);
    expect(result.clusters.flatMap((c) => c.members)).toContainEqual(zeroContent);
    expect(result.hidden).toEqual([]);
  });

  it('a hidden member never appears in a cluster nor in the omitted-centroid list', () => {
    const zeroContent = member({ areaKey: 'zero', listingCount: 0, lat: 13.0, lon: 77.6 });
    const result = clusterVisibleAreaMembers([zeroContent], 'areas', project, 12);
    expect(result.clusters).toEqual([]);
    expect(result.omitted).toEqual([]);
    expect(result.hidden).toEqual([zeroContent]);
  });
});

describe('boundsOfMembers', () => {
  it('returns null for an empty list', () => {
    expect(boundsOfMembers([])).toBeNull();
  });

  it('computes the union bounds of member centroids', () => {
    const members = [
      member({ areaKey: 'a', lat: 13.0, lon: 77.5 }),
      member({ areaKey: 'b', lat: 13.2, lon: 77.7 }),
    ];
    expect(boundsOfMembers(members)).toEqual({ minLat: 13.0, minLon: 77.5, maxLat: 13.2, maxLon: 77.7 });
  });
});

// ── UD-1 (fix-cycle-3) — deterministic collision-correction pass ──────────
// Merely enlarging the 64px grid cell is EXPLICITLY INSUFFICIENT: two
// boundary-adjacent points (e.g. x=63 and x=65) sit on opposite sides of a
// grid-cell boundary no matter how large the cell is, and the rendered CARDS
// (96-140px) are far bigger than the ~2px gap between them, so they overlap
// unless something MERGES the resulting clusters. `project` here mirrors the
// module-level `project` above (1 degree == 1000px), so `lon = 0.063` /
// `0.065` and `lat = 0.063` / `0.065` project to x/y = 63/65 exactly.
describe('clusterAreaMembers — UD-1 boundary-adjacent collision correction', () => {
  it('merges two members straddling an X grid-cell boundary (x=63 vs x=65 at a 64px cell) into ONE cluster', () => {
    const members = [
      member({ areaKey: 'left', lat: 13.0, lon: 0.063 }),
      member({ areaKey: 'right', lat: 13.0, lon: 0.065 }),
    ];
    const result = clusterAreaMembers(members, project, 16, { cellSizePx: 64 });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].members.map((m) => m.areaKey)).toEqual(['left', 'right']);
  });

  it('merges two members straddling a Y grid-cell boundary (y=63 vs y=65 at a 64px cell) into ONE cluster', () => {
    const members = [
      member({ areaKey: 'top', lat: 0.063, lon: 77.6 }),
      member({ areaKey: 'bottom', lat: 0.065, lon: 77.6 }),
    ];
    const result = clusterAreaMembers(members, project, 16, { cellSizePx: 64 });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].members.map((m) => m.areaKey)).toEqual(['bottom', 'top']);
  });

  it('merges two members straddling a DIAGONAL grid-cell corner (x=63/65, y=63/65) into ONE cluster', () => {
    const members = [
      member({ areaKey: 'corner-a', lat: 0.063, lon: 0.063 }),
      member({ areaKey: 'corner-b', lat: 0.065, lon: 0.065 }),
    ];
    const result = clusterAreaMembers(members, project, 16, { cellSizePx: 64 });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].members.map((m) => m.areaKey)).toEqual(['corner-a', 'corner-b']);
  });

  it('never merges two members whose footprints genuinely do not overlap on screen', () => {
    // Same members used by the existing "splits members whose projected
    // pixels land in different grid cells" test above (13.0,77.6) vs
    // (14.0,78.6) — 1000px apart at this projection, far beyond the
    // AREA_CARD_FOOTPRINT_WIDTH/HEIGHT_PX footprint, so the merge pass must
    // leave them as two separate clusters. This is the negative case that
    // proves the merge pass does not over-merge indiscriminately.
    const members = [
      member({ areaKey: 'a1', lat: 13.0, lon: 77.6 }),
      member({ areaKey: 'a2', lat: 14.0, lon: 78.6 }),
    ];
    const result = clusterAreaMembers(members, project, 12, { cellSizePx: 64 });
    expect(result.clusters).toHaveLength(2);
  });

  it('is deterministic across repeated calls with boundary-adjacent input in reversed order (AC4.15)', () => {
    const members = [
      member({ areaKey: 'right', lat: 13.0, lon: 0.065 }),
      member({ areaKey: 'left', lat: 13.0, lon: 0.063 }),
      member({ areaKey: 'far-away', lat: 20.0, lon: 90.0 }),
    ];
    const first = clusterAreaMembers(members, project, 16, { cellSizePx: 64 });
    const second = clusterAreaMembers(members.slice().reverse(), project, 16, { cellSizePx: 64 });
    expect(second).toEqual(first);
    // Repeat once more from the original order to rule out any hidden
    // mutable/global state affecting a second run.
    const third = clusterAreaMembers(members, project, 16, { cellSizePx: 64 });
    expect(third).toEqual(first);
  });

  // Item 3 (fix-cycle-4, test-gap) — every case above uses two mergeable
  // members plus at most one far-away member, so each resolves in exactly
  // ONE union; a fixed-point `while` loop reduced to a single scan-and-merge
  // pass (no re-scan after a merge) would still pass all of them. This case
  // requires a SECOND iteration to complete the merge, so it fails under
  // that specific regression.
  it('merges a TRANSITIVE CHAIN of three members — where the outer pair does not directly overlap — into ONE cluster (fails if the fixed-point loop is reduced to a single pass)', () => {
    // x-offsets 0, 70, 140 at this 1-degree==1000px projection: adjacent
    // pairs are 70px apart (< the 110px footprint width) and DO directly
    // overlap; the outer pair is 140px apart (> 110px) and does NOT directly
    // overlap. The merge pass's first `while` iteration can only find the
    // leftmost overlapping pair ('a','b' — sorted by areaKey) and merges it,
    // recomputing the combined centroid at x=35 (the arithmetic mean of 0 and
    // 70). That recomputed centroid is still within 110px of the third
    // member (105px away), so a SECOND iteration merges it too, producing
    // one final 3-member cluster. A single-pass implementation would stop
    // after merging only ('a','b'), leaving 'c' as a separate 2nd cluster —
    // exactly the regression this test is designed to catch.
    const members = [
      member({ areaKey: 'a', lat: 13.0, lon: 77.6 }),
      member({ areaKey: 'b', lat: 13.0, lon: 77.67 }),
      member({ areaKey: 'c', lat: 13.0, lon: 77.74 }),
    ];
    const result = clusterAreaMembers(members, project, 16, { cellSizePx: 64 });
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].members.map((m) => m.areaKey)).toEqual(['a', 'b', 'c']);
  });

  // Item 3 (fix-cycle-4, test-gap) — the durable guard: rather than asserting
  // a cluster-count proxy (every case above does), this asserts the ACTUAL
  // no-overlap invariant over every pair of returned clusters on a denser
  // fixture, mirroring the sibling all-pairs pattern at
  // src/lib/map/__tests__/areaMarkerBucketing.test.ts:345
  // ("no two representatives have overlapping label footprints"). This would
  // catch ANY implementation that produces the "right" cluster count by
  // coincidence but still leaves an overlapping pair on screen.
  it('produces clusters whose 110x100 bottom-center footprints never intersect, for every pair, on a dense fixture', () => {
    function rectAt(px: { x: number; y: number }) {
      const halfW = AREA_CARD_FOOTPRINT_WIDTH_PX / 2;
      return {
        left: px.x - halfW,
        right: px.x + halfW,
        top: px.y - AREA_CARD_FOOTPRINT_HEIGHT_PX,
        bottom: px.y,
      };
    }
    function intersects(a: ReturnType<typeof rectAt>, b: ReturnType<typeof rectAt>): boolean {
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }

    // A tight 3-member blob (all pairwise footprints overlap, must merge to
    // ONE cluster) plus three well-separated singles (each >110px from every
    // other cluster's final anchor, including the blob's post-merge centroid).
    const members = [
      member({ areaKey: 'blob-a', lat: 13.0, lon: 77.6 }),
      member({ areaKey: 'blob-b', lat: 13.005, lon: 77.62 }),
      member({ areaKey: 'blob-c', lat: 12.995, lon: 77.64 }),
      member({ areaKey: 'mid', lat: 13.0, lon: 78.2 }),
      member({ areaKey: 'far', lat: 13.3, lon: 78.8 }),
      member({ areaKey: 'far2', lat: 13.9, lon: 78.8 }),
    ];
    const result = clusterAreaMembers(members, project, 16, { cellSizePx: 64 });
    expect(result.clusters.length).toBeGreaterThan(1);

    for (let i = 0; i < result.clusters.length; i++) {
      for (let j = i + 1; j < result.clusters.length; j++) {
        const pxA = project(result.clusters[i].anchor.lat, result.clusters[i].anchor.lon);
        const pxB = project(result.clusters[j].anchor.lat, result.clusters[j].anchor.lon);
        expect(intersects(rectAt(pxA), rectAt(pxB))).toBe(false);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GOLDEN PRE-RENAME CHARACTERISATION — Issue #1943 (Slice B+C merge),
// [qa_requirements.characterisation_protocol] (team-lead-plan.toml).
//
// The areaKey -> identityKey rename in areaClustering.ts is a pure string
// substitution and is therefore INVISIBLE in code review; only a pre/post
// output comparison can prove it is inert. `GOLDEN_PRE_RENAME_OUTPUT` below
// was captured by literally running THIS test's fixture through
// `clusterVisibleAreaMembers` on the code as it stood immediately BEFORE the
// identityKey rename (commit boundary: this golden was committed in its own
// commit, strictly before the rename commit — see the PR's commit history).
// The fixture is deliberately DENSE enough to exercise real merging (not
// vacuous): 'blob-a'/'blob-b'/'blob-c' pairwise-overlap and merge into ONE
// 3-member cluster (mirrors the "produces clusters whose footprints never
// intersect" fixture above), and 'left'/'right' straddle a grid-cell
// boundary and merge via the UD-1 collision-correction pass (mirrors the
// "boundary-adjacent" fixtures above) — TWO independent real merges, not
// one. It also exercises every field of the result shape: a 3-member
// cluster, a 2-member (boundary-merged) cluster, a 1-member cluster, one
// `omitted` (bad coordinate) member, and one `hidden` (zero-listing-count,
// 'areas' journey) member.
// ═══════════════════════════════════════════════════════════════════════
describe('areaClustering — pre-rename golden characterisation (Issue #1943)', () => {
  const goldenFixtureMembers: ClusterableAreaMember[] = [
    member({ areaKey: 'blob-a', lat: 13.0, lon: 77.6, listingCount: 5, displayOrder: 0, schoolCount: 2 }),
    member({ areaKey: 'blob-b', lat: 13.005, lon: 77.62, listingCount: 3, displayOrder: 1, schoolCount: 0 }),
    member({ areaKey: 'blob-c', lat: 12.995, lon: 77.64, listingCount: 8, displayOrder: 2, schoolCount: 1 }),
    member({ areaKey: 'mid', lat: 13.0, lon: 78.2, listingCount: 1, displayOrder: 3, schoolCount: 0 }),
    member({ areaKey: 'left', lat: 13.0, lon: 0.063, listingCount: 4, displayOrder: 4, schoolCount: 0 }),
    member({ areaKey: 'right', lat: 13.0, lon: 0.065, listingCount: 2, displayOrder: 5, schoolCount: 0 }),
    member({ areaKey: 'zero-content', lat: 13.0, lon: 78.9, listingCount: 0, displayOrder: 6, schoolCount: 0 }),
    member({
      areaKey: 'bad-coord',
      lat: null as unknown as number,
      lon: 77.6,
      listingCount: 1,
      displayOrder: 7,
      schoolCount: 0,
    }),
  ];

  // Captured verbatim (JSON.stringify) from `clusterVisibleAreaMembers(
  // goldenFixtureMembers, 'areas', project, 13, { cellSizePx: 64 })` on the
  // pre-rename code — see the module doc above. Never hand-edited.
  const GOLDEN_PRE_RENAME_OUTPUT = {
    clusters: [
      {
        cellKey: 'z13:blob-a',
        members: [
          {
            nodeKey: 'a:blob-a',
            displayLabel: 'blob-a',
            lat: 13,
            lon: 77.6,
            listingCount: 5,
            displayOrder: 0,
            schoolCount: 2,
            areaKey: 'blob-a',
          },
          {
            nodeKey: 'a:blob-b',
            displayLabel: 'blob-b',
            lat: 13.005,
            lon: 77.62,
            listingCount: 3,
            displayOrder: 1,
            schoolCount: 0,
            areaKey: 'blob-b',
          },
          {
            nodeKey: 'a:blob-c',
            displayLabel: 'blob-c',
            lat: 12.995,
            lon: 77.64,
            listingCount: 8,
            displayOrder: 2,
            schoolCount: 1,
            areaKey: 'blob-c',
          },
        ],
        anchor: { lat: 13, lon: 77.62 },
      },
      {
        cellKey: 'z13:left',
        members: [
          {
            nodeKey: 'a:left',
            displayLabel: 'left',
            lat: 13,
            lon: 0.063,
            listingCount: 4,
            displayOrder: 4,
            schoolCount: 0,
            areaKey: 'left',
          },
          {
            nodeKey: 'a:right',
            displayLabel: 'right',
            lat: 13,
            lon: 0.065,
            listingCount: 2,
            displayOrder: 5,
            schoolCount: 0,
            areaKey: 'right',
          },
        ],
        anchor: { lat: 13, lon: 0.064 },
      },
      {
        cellKey: 'z13:mid',
        members: [
          {
            nodeKey: 'a:mid',
            displayLabel: 'mid',
            lat: 13,
            lon: 78.2,
            listingCount: 1,
            displayOrder: 3,
            schoolCount: 0,
            areaKey: 'mid',
          },
        ],
        anchor: { lat: 13, lon: 78.2 },
      },
    ],
    omitted: [
      {
        nodeKey: 'a:bad-coord',
        displayLabel: 'bad-coord',
        lat: null,
        lon: 77.6,
        listingCount: 1,
        displayOrder: 7,
        schoolCount: 0,
        areaKey: 'bad-coord',
      },
    ],
    hidden: [
      {
        nodeKey: 'a:zero-content',
        displayLabel: 'zero-content',
        lat: 13,
        lon: 78.9,
        listingCount: 0,
        displayOrder: 6,
        schoolCount: 0,
        areaKey: 'zero-content',
      },
    ],
  };

  it('exercises real merging, not a vacuous fixture (sanity check on the golden itself)', () => {
    // blob-a/b/c merged into ONE 3-member cluster (real overlap-driven
    // merge, not 3 singles) and left/right merged into ONE 2-member cluster
    // (real boundary-adjacent merge) — two independent merges.
    expect(GOLDEN_PRE_RENAME_OUTPUT.clusters).toHaveLength(3);
    expect(GOLDEN_PRE_RENAME_OUTPUT.clusters[0].members).toHaveLength(3);
    expect(GOLDEN_PRE_RENAME_OUTPUT.clusters[1].members).toHaveLength(2);
  });

  it('regenerates BYTE-IDENTICAL output to the pre-rename golden — proves the identityKey rename is inert for the areas path', () => {
    const actual = clusterVisibleAreaMembers(goldenFixtureMembers, 'areas', project, 13, { cellSizePx: 64 });
    const plain = JSON.parse(JSON.stringify(actual)) as typeof GOLDEN_PRE_RENAME_OUTPUT & {
      clusters: Array<{ members: Array<Record<string, unknown>> }>;
    };
    // The rename ADDS `identityKey` to every member — a real, additive shape
    // change the golden (captured before the field existed) cannot itself
    // contain. Assert that new field separately (it must equal `areaKey` for
    // every member — the AREA path's adapter contract), then strip it before
    // the byte-identity comparison so the golden proves the thing it exists
    // to prove: cellKey/order/anchor/omitted/hidden are UNCHANGED.
    const stripIdentityKey = (obj: Record<string, unknown>) => {
      const { identityKey, ...rest } = obj;
      expect(identityKey).toBe(obj.areaKey);
      return rest;
    };
    const normalised = {
      clusters: plain.clusters.map((cluster) => ({
        ...cluster,
        members: cluster.members.map(stripIdentityKey),
      })),
      omitted: plain.omitted.map((m) => stripIdentityKey(m as unknown as Record<string, unknown>)),
      hidden: plain.hidden.map((m) => stripIdentityKey(m as unknown as Record<string, unknown>)),
    };
    expect(normalised).toEqual(GOLDEN_PRE_RENAME_OUTPUT);
  });
});

describe('footprintsIntersect / footprintRectAt (shared collision-merge primitives used by clusterAreaMembers/mergeOverlappingCells)', () => {
  it('reports overlap for two rects that share screen space', () => {
    const a = footprintRectAt({ x: 100, y: 100 }, 172, 140);
    const b = footprintRectAt({ x: 150, y: 100 }, 172, 140);
    expect(footprintsIntersect(a, b)).toBe(true);
  });

  it('reports no overlap for two rects placed far enough apart', () => {
    const a = footprintRectAt({ x: 0, y: 100 }, 172, 140);
    const b = footprintRectAt({ x: 1000, y: 100 }, 172, 140);
    expect(footprintsIntersect(a, b)).toBe(false);
  });
});
