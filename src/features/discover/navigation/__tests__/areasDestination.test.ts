import { describe, expect, it } from 'vitest';

import {
  SCHOOL_COUNT_LEVELS,
  buildAreasDestination,
  dedupeAreas,
  dedupeListings,
  dedupeSchools,
  distinctSchoolCountForNode,
  levelReceivesSchoolCount,
  listingCountForNode,
  type AreasDestinationLevel,
} from '../areasDestination';
import type { NavigationCountsResponse, NavigationNodeCount } from '../types';

/* ─────────────────────── AC1.10 — the three dedup identities ────────────────── */

describe('dedup identities', () => {
  it('areas dedup on area_key', () => {
    const areas = [
      { areaKey: 'whitefield', displayLabel: 'Whitefield' },
      { areaKey: 'varthur', displayLabel: 'Varthur' },
      { areaKey: 'whitefield', displayLabel: 'Whitefield (dup)' },
    ];
    expect(dedupeAreas(areas).map((a) => a.areaKey)).toEqual(['whitefield', 'varthur']);
  });

  it('listings dedup on canonical listing identity', () => {
    const listings = [{ listingId: 'L1' }, { listingId: 'L2' }, { listingId: 'L1' }];
    expect(dedupeListings(listings).map((l) => l.listingId)).toEqual(['L1', 'L2']);
  });

  it('schools dedup on stable school identity', () => {
    const schools = [{ schoolId: 'S9' }, { schoolId: 'S9' }, { schoolId: 'S3' }];
    expect(dedupeSchools(schools).map((s) => s.schoolId)).toEqual(['S9', 'S3']);
  });

  it('dedup is FIRST-WINS and order-preserving', () => {
    const areas = [
      { areaKey: 'a', rank: 1 },
      { areaKey: 'b', rank: 2 },
      { areaKey: 'a', rank: 99 },
    ];
    expect(dedupeAreas(areas)).toEqual([
      { areaKey: 'a', rank: 1 },
      { areaKey: 'b', rank: 2 },
    ]);
  });

  it('never mutates the input array', () => {
    const areas = [{ areaKey: 'a' }, { areaKey: 'a' }];
    dedupeAreas(areas);
    expect(areas).toHaveLength(2);
  });

  it('handles an empty list', () => {
    expect(dedupeAreas([])).toEqual([]);
    expect(dedupeListings([])).toEqual([]);
    expect(dedupeSchools([])).toEqual([]);
  });
});

/* ───────────── totals are SERVER-computed, never re-derived client-side ─────── */

describe('server-computed totals', () => {
  const counts: NavigationCountsResponse = {
    nodeKey: 'c:whitefield-belt',
    // The server's own rolled-up total for this node.
    count: 41,
    schoolCount: 9,
    // The whole-city per-area map. Summing the member areas below gives 44, NOT
    // 41 — because the rollup is a UNIQUE-LEAF-AREA fold and the map is a raw
    // per-area lookup. This divergence is exactly why the frontend must not add.
    areaCounts: { whitefield: 20, varthur: 12, kadugodi: 12 },
    // The school-dimension mirror. It sums to 13 against a node `schoolCount` of
    // 9, and that gap is CORRECT: the server's parent rollup is a UNION-DISTINCT
    // over descendant areas, so a school inside two of these areas counts once
    // for the cluster but appears under both keys. The map over-counts by
    // construction — another reason the frontend must never add it up.
    areaSchoolCounts: { whitefield: 5, varthur: 4, kadugodi: 4 },
    children: [
      { nodeKey: 'a:whitefield', count: 20, schoolCount: 5, matchingAreaCount: 1 },
      { nodeKey: 'a:varthur', count: 12, schoolCount: 4, matchingAreaCount: 1 },
      { nodeKey: 'a:kadugodi', count: 12, schoolCount: 4, matchingAreaCount: 1 },
    ],
    revisionId: 8,
  };

  it('reports the SERVER listing total, not the sum of the per-area map', () => {
    const clientSum = Object.values(counts.areaCounts).reduce((a, b) => a + b, 0);
    expect(clientSum).toBe(44);

    const destination = buildAreasDestination({
      level: 'area-cluster',
      nodeKey: counts.nodeKey,
      displayLabel: 'Whitefield Belt',
      serverListingCount: counts.count,
      serverSchoolCount: counts.schoolCount,
      areaKeys: Object.keys(counts.areaCounts),
    });

    expect(destination.listingCount).toBe(41);
    expect(destination.listingCount).not.toBe(clientSum);
  });

  it('reports the SERVER distinct-school total, not the sum of children', () => {
    const childSum = counts.children.reduce((total, c) => total + c.schoolCount, 0);
    expect(childSum).toBe(13);

    const node: NavigationNodeCount = {
      nodeKey: counts.nodeKey,
      count: counts.count,
      schoolCount: counts.schoolCount,
      matchingAreaCount: 3,
    };

    // Distinctness across the cluster's member areas is already applied
    // server-side: the parent's schoolCount unions on school identity across its
    // descendant areas, so a school reachable under two children is counted once
    // there and twice across `children[]`. Summing the children double-counts.
    // Canonical statement: NavigationCountsResponse.areaSchoolCounts in ../types.
    expect(distinctSchoolCountForNode(node)).toBe(9);
    expect(distinctSchoolCountForNode(node)).not.toBe(childSum);
  });

  it('reads the listing total off `count` — there is deliberately no listingCount alias', () => {
    const node: NavigationNodeCount = { nodeKey: 'a:x', count: 7, schoolCount: 2, matchingAreaCount: 1 };
    expect(listingCountForNode(node)).toBe(7);
    expect(Object.keys(node)).toEqual(['nodeKey', 'count', 'schoolCount', 'matchingAreaCount']);
    expect(Object.keys(node)).not.toContain('listingCount');
  });

  it('carries both server counts through completely unmodified', () => {
    const destination = buildAreasDestination({
      level: 'area',
      nodeKey: 'a:whitefield',
      displayLabel: 'Whitefield',
      serverListingCount: 0,
      serverSchoolCount: 0,
      areaKeys: ['whitefield'],
    });
    expect(destination.listingCount).toBe(0);
    expect(destination.schoolCount).toBe(0);
  });
});

/* ───────────────────────── the typed destination model ─────────────────────── */

describe('buildAreasDestination', () => {
  it('dedupes member area keys on the way in', () => {
    const destination = buildAreasDestination({
      level: 'area-cluster',
      nodeKey: 'c:x',
      displayLabel: 'X',
      serverListingCount: 3,
      serverSchoolCount: 1,
      areaKeys: ['whitefield', 'varthur', 'whitefield'],
    });
    expect(destination.areaKeys).toEqual(['whitefield', 'varthur']);
  });

  it('defaults sharedMarkerSelected to false', () => {
    expect(
      buildAreasDestination({
        level: 'area',
        nodeKey: 'a:x',
        displayLabel: 'X',
        serverListingCount: 1,
        serverSchoolCount: 1,
        areaKeys: [],
      }).sharedMarkerSelected,
    ).toBe(false);
  });

  it('a selected shared-marker variant is the SAME level with a flag, not a new level', () => {
    const base = buildAreasDestination({
      level: 'area',
      nodeKey: 'a:x',
      displayLabel: 'X',
      serverListingCount: 1,
      serverSchoolCount: 4,
      areaKeys: ['x'],
    });
    const sharedMarker = buildAreasDestination({
      level: 'area',
      nodeKey: 'a:x',
      displayLabel: 'X',
      serverListingCount: 1,
      serverSchoolCount: 4,
      areaKeys: ['x'],
      sharedMarkerSelected: true,
    });
    expect(sharedMarker.level).toBe(base.level);
    expect(sharedMarker.sharedMarkerSelected).toBe(true);
    // The shared-marker variant still receives its school count.
    expect(sharedMarker.schoolCount).toBe(4);
  });
});

describe('which levels receive school counts (exhaustive)', () => {
  const ALL_LEVELS: AreasDestinationLevel[] = [
    'city-root',
    'direction',
    'local-destination',
    'area-cluster',
    'area',
    'listings',
  ];

  it('exactly Direction, Local Destination, visual AREA cluster and individual AREA', () => {
    expect([...SCHOOL_COUNT_LEVELS]).toEqual([
      'direction',
      'local-destination',
      'area-cluster',
      'area',
    ]);
  });

  it.each(ALL_LEVELS)('levelReceivesSchoolCount(%s) matches the exhaustive list', (level) => {
    expect(levelReceivesSchoolCount(level)).toBe(SCHOOL_COUNT_LEVELS.includes(level));
  });

  it('NOWHERE ELSE: city-root and listings never receive a school count', () => {
    expect(levelReceivesSchoolCount('city-root')).toBe(false);
    expect(levelReceivesSchoolCount('listings')).toBe(false);
  });

  it('drops a school count supplied for a level that does not receive one', () => {
    const destination = buildAreasDestination({
      level: 'listings',
      nodeKey: 'a:x',
      displayLabel: 'X',
      serverListingCount: 12,
      serverSchoolCount: 4,
      areaKeys: ['x'],
    });
    expect(destination.schoolCount).toBeNull();
    // The PRIMARY metric is unaffected.
    expect(destination.listingCount).toBe(12);
  });

  it('school count is optional SECONDARY metadata — a missing one is null, not zero', () => {
    const destination = buildAreasDestination({
      level: 'direction',
      nodeKey: 'd:central',
      displayLabel: 'Central Bangalore',
      serverListingCount: 200,
      serverSchoolCount: null,
      areaKeys: [],
    });
    expect(destination.schoolCount).toBeNull();
    expect(destination.listingCount).toBe(200);
  });
});
