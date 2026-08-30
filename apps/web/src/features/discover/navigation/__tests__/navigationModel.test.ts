import { describe, expect, it, vi } from 'vitest';

import {
  listingAreaKeys,
  nodeCursorOutcomeFromResolution,
  resolveNodeCursor,
  validateNavigationHierarchy,
  type HierarchyNodeShape,
} from '../navigationModel';
import * as navigationModel from '../navigationModel';

/* ─────────────────────────────── fixtures ─────────────────────────────── */

function direction(nodeKey: string): HierarchyNodeShape {
  return { nodeKey, nodeType: 'DIRECTION', depth: 0, parentNodeKey: null };
}

function area(nodeKey: string, parentNodeKey: string, depth = 1): HierarchyNodeShape {
  return { nodeKey, nodeType: 'AREA', depth, parentNodeKey };
}

function cluster(nodeKey: string, parentNodeKey: string, depth = 1): HierarchyNodeShape {
  return { nodeKey, nodeType: 'CLUSTER', depth, parentNodeKey };
}

/** The live Bangalore shape: City -> DIRECTION (depth 0) -> AREA (depth 1). */
const LIVE_BANGALORE_SLICE: HierarchyNodeShape[] = [
  direction('d:central'),
  direction('d:n'),
  direction('d:e'),
  direction('d:s'),
  direction('d:w'),
  area('a:indiranagar', 'd:e'),
  area('a:whitefield', 'd:e'),
  area('a:jayanagar', 'd:s'),
  area('a:hebbal', 'd:n'),
];

function codes(nodes: readonly HierarchyNodeShape[], maxSafetyDepth?: number): string[] {
  return validateNavigationHierarchy(nodes, { maxSafetyDepth }).problems.map((p) => p.code);
}

/* ─────────────────────────────── listingAreaKeys ─────────────────────────────── */

describe('listingAreaKeys', () => {
  it('uses an AREA leaf OWN areaKey, never its (deliberately empty) descendantAreaKeys', () => {
    expect(listingAreaKeys({ areaKey: 'indiranagar', descendantAreaKeys: [] })).toEqual([
      'indiranagar',
    ]);
  });

  it('uses descendantAreaKeys for a structural node', () => {
    expect(listingAreaKeys({ areaKey: null, descendantAreaKeys: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('normalises the synthetic root null descendantAreaKeys to an empty array', () => {
    expect(listingAreaKeys({ areaKey: null, descendantAreaKeys: null })).toEqual([]);
  });
});

/* ────────────────────── AC1.6 — validator: detect and REPORT ────────────────── */

describe('validateNavigationHierarchy — the live shape', () => {
  it('accepts the live City -> DIRECTION -> AREA Bangalore shape', () => {
    const report = validateNavigationHierarchy(LIVE_BANGALORE_SLICE);
    expect(report).toEqual({ valid: true, problems: [] });
  });

  it('accepts the legal City -> DIRECTION -> Local Destination -> AREA shape', () => {
    const report = validateNavigationHierarchy([
      direction('d:e'),
      cluster('c:whitefield-belt', 'd:e', 1),
      area('a:whitefield', 'c:whitefield-belt', 2),
      area('a:varthur', 'c:whitefield-belt', 2),
    ]);
    expect(report.valid).toBe(true);
  });
});

describe('validateNavigationHierarchy — max depth (invariant #11)', () => {
  // NOTE: the salvage source carried "valid capability" cases at depth 5 and
  // depth 8. Those are RETIRED — they encoded a hierarchy that does not and will
  // not exist. What survives is the operator knob's arithmetic, which is still
  // real: allowed depth is maxSafetyDepth + 1 because depth 0 is always the
  // DIRECTION level. Both cases below therefore also trip the FIXED contract
  // ceiling of depth 2, which is exactly the point: the two checks are
  // independent and a deep tree fails both.
  it('max-5: maxSafetyDepth=5 allows depth <= 6 and reports depth 7', () => {
    const atSix: HierarchyNodeShape = { nodeKey: 'x', nodeType: 'AREA', depth: 6, parentNodeKey: 'd:e' };
    const atSeven: HierarchyNodeShape = { nodeKey: 'y', nodeType: 'AREA', depth: 7, parentNodeKey: 'd:e' };

    expect(codes([direction('d:e'), atSix], 5)).not.toContain('MAX_DEPTH_VIOLATION');
    expect(codes([direction('d:e'), atSeven], 5)).toContain('MAX_DEPTH_VIOLATION');
  });

  it('max-6: maxSafetyDepth=6 allows depth <= 7 and reports depth 8', () => {
    const atSeven: HierarchyNodeShape = { nodeKey: 'y', nodeType: 'AREA', depth: 7, parentNodeKey: 'd:e' };
    const atEight: HierarchyNodeShape = { nodeKey: 'z', nodeType: 'AREA', depth: 8, parentNodeKey: 'd:e' };

    expect(codes([direction('d:e'), atSeven], 6)).not.toContain('MAX_DEPTH_VIOLATION');
    expect(codes([direction('d:e'), atEight], 6)).toContain('MAX_DEPTH_VIOLATION');
  });

  it('skips the safety-depth check entirely when no maxSafetyDepth is supplied', () => {
    expect(codes(LIVE_BANGALORE_SLICE)).not.toContain('MAX_DEPTH_VIOLATION');
  });

  it('is independent of the fixed contract ceiling — a tree can pass #11 and fail #14(e)', () => {
    const deepArea: HierarchyNodeShape = {
      nodeKey: 'a:deep',
      nodeType: 'AREA',
      depth: 3,
      parentNodeKey: 'c:x',
    };
    const report = validateNavigationHierarchy(
      [direction('d:e'), cluster('c:x', 'd:e', 1), deepArea],
      { maxSafetyDepth: 9 },
    );
    const reported = report.problems.map((p) => p.code);
    expect(reported).not.toContain('MAX_DEPTH_VIOLATION');
    expect(reported).toContain('INVALID_HIERARCHY_SHAPE');
  });
});

describe('validateNavigationHierarchy — third CLUSTER level (invariant #14(e))', () => {
  const thirdClusterTree: HierarchyNodeShape[] = [
    direction('d:e'),
    cluster('c:outer', 'd:e', 1),
    cluster('c:inner', 'c:outer', 2),
    area('a:one', 'c:inner', 3),
    area('a:two', 'c:inner', 3),
  ];

  it('REPORTS a third CLUSTER level rather than accepting it', () => {
    const report = validateNavigationHierarchy(thirdClusterTree);
    expect(report.valid).toBe(false);
    const clusterProblem = report.problems.find(
      (p) => p.nodeKey === 'c:inner' && p.code === 'INVALID_HIERARCHY_SHAPE',
    );
    expect(clusterProblem?.message).toContain('may only occupy depth 1');
  });

  it('does NOT silently flatten or normalise the invalid tree away (AC1.6)', () => {
    const snapshot = structuredClone(thirdClusterTree);
    const report = validateNavigationHierarchy(thirdClusterTree);

    // The input is untouched: no re-parenting, no depth rewriting, no dropping.
    expect(thirdClusterTree).toEqual(snapshot);
    // The report is a REPORT — it carries no corrected node list to render from.
    expect(Object.keys(report).sort()).toEqual(['problems', 'valid']);
    // And there is no repair door anywhere in the module.
    for (const exportName of Object.keys(navigationModel)) {
      expect(exportName).not.toMatch(/normali[sz]e|repair|flatten|collapse|fix/i);
    }
  });
});

describe('validateNavigationHierarchy — one-child parents (invariant #4)', () => {
  it('REPORTS a CLUSTER with exactly one child', () => {
    const report = validateNavigationHierarchy([
      direction('d:e'),
      cluster('c:solo', 'd:e', 1),
      area('a:only', 'c:solo', 2),
    ]);
    expect(report.problems.map((p) => p.code)).toContain('ONE_CHILD_CLUSTER');
  });

  it('ACCEPTS a DIRECTION with exactly one child — a single-area region is legitimate', () => {
    const report = validateNavigationHierarchy([direction('d:w'), area('a:only', 'd:w')]);
    expect(report).toEqual({ valid: true, problems: [] });
  });

  it('accepts a CLUSTER with two children', () => {
    const report = validateNavigationHierarchy([
      direction('d:e'),
      cluster('c:pair', 'd:e', 1),
      area('a:one', 'c:pair', 2),
      area('a:two', 'c:pair', 2),
    ]);
    expect(report.valid).toBe(true);
  });
});

describe('validateNavigationHierarchy — node kinds and roots', () => {
  it('reports an unrecognised node type and stops reasoning about that node', () => {
    const report = validateNavigationHierarchy([
      // The synthetic ROOT is a wire-only node and is NOT a persisted kind, so it
      // is not a valid member of a hierarchy slice.
      { nodeKey: 'root', nodeType: 'ROOT', depth: -1, parentNodeKey: null },
    ]);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0].code).toBe('INVALID_HIERARCHY_SHAPE');
    expect(report.problems[0].message).toContain('DIRECTION, CLUSTER, AREA');
  });

  it('reports a non-DIRECTION root — the flat City -> AREA incident shape', () => {
    const report = validateNavigationHierarchy([
      { nodeKey: 'a:flat', nodeType: 'AREA', depth: 0, parentNodeKey: null },
    ]);
    expect(report.problems.map((p) => p.code)).toContain('MISSING_DIRECTION_ANCESTOR');
  });

  it('reports a DIRECTION that is not at depth 0', () => {
    const report = validateNavigationHierarchy([
      direction('d:e'),
      { nodeKey: 'd:nested', nodeType: 'DIRECTION', depth: 1, parentNodeKey: 'd:e' },
    ]);
    expect(
      report.problems.some(
        (p) => p.nodeKey === 'd:nested' && p.message.includes('expected 0'),
      ),
    ).toBe(true);
  });

  it('reports a node whose named parent is absent from the slice', () => {
    const report = validateNavigationHierarchy([area('a:orphan', 'd:missing')]);
    expect(report.problems.map((p) => p.code)).toContain('ORPHAN_NODE');
  });

  it('reports every problem it finds rather than stopping at the first', () => {
    const report = validateNavigationHierarchy([
      direction('d:e'),
      cluster('c:bad', 'd:e', 2),
      area('a:deep', 'c:bad', 5),
    ]);
    expect(report.problems.length).toBeGreaterThan(2);
  });
});

/* ────────────────────── AC1.5 — the stale-node ladder ──────────────────────── */

describe('resolveNodeCursor — the stale-node ladder', () => {
  const known = new Set(['d:e', 'c:whitefield-belt', 'a:whitefield']);
  const isKnownNode = (key: string) => known.has(key);

  it('no node= at all resolves to the city root with NO notice', () => {
    expect(
      resolveNodeCursor({ requestedNodeKey: null, isKnownNode, ancestorKeysOf: () => [] }),
    ).toEqual({
      requestedNodeKey: null,
      resolvedNodeKey: null,
      rung: 'city-root',
      notice: null,
    });
  });

  it('a known key is an EXACT hit with no notice', () => {
    const outcome = resolveNodeCursor({
      requestedNodeKey: 'a:whitefield',
      isKnownNode,
      ancestorKeysOf: () => ['d:e', 'c:whitefield-belt'],
    });
    expect(outcome.rung).toBe('exact');
    expect(outcome.resolvedNodeKey).toBe('a:whitefield');
    expect(outcome.notice).toBeNull();
  });

  it('the literal synthetic root key is an exact city-root hit, not staleness', () => {
    const outcome = resolveNodeCursor({
      requestedNodeKey: 'root',
      isKnownNode,
      ancestorKeysOf: () => [],
    });
    expect(outcome).toEqual({
      requestedNodeKey: 'root',
      resolvedNodeKey: null,
      rung: 'exact',
      notice: null,
    });
  });

  it('a stale key walks to its NEAREST valid ancestor and raises a non-blocking notice', () => {
    const outcome = resolveNodeCursor({
      requestedNodeKey: 'a:retired',
      isKnownNode,
      // root-first — the nearest valid ancestor is the LAST known entry.
      ancestorKeysOf: () => ['d:e', 'c:whitefield-belt'],
    });
    expect(outcome.rung).toBe('ancestor');
    expect(outcome.resolvedNodeKey).toBe('c:whitefield-belt');
    expect(outcome.notice).toEqual({
      blocking: false,
      rung: 'ancestor',
      requestedNodeKey: 'a:retired',
      resolvedNodeKey: 'c:whitefield-belt',
    });
  });

  it('skips stale intermediate ancestors and lands on the deepest still-valid one', () => {
    const outcome = resolveNodeCursor({
      requestedNodeKey: 'a:retired',
      isKnownNode,
      ancestorKeysOf: () => ['d:e', 'c:gone', 'c:also-gone'],
    });
    expect(outcome.rung).toBe('ancestor');
    expect(outcome.resolvedNodeKey).toBe('d:e');
  });

  it('TERMINUS: no valid ancestor at all falls through to the city root, still non-blocking', () => {
    const outcome = resolveNodeCursor({
      requestedNodeKey: 'a:ancient',
      isKnownNode,
      ancestorKeysOf: () => ['d:removed', 'c:removed'],
    });
    expect(outcome).toEqual({
      requestedNodeKey: 'a:ancient',
      resolvedNodeKey: null,
      rung: 'city-root',
      notice: {
        blocking: false,
        rung: 'city-root',
        requestedNodeKey: 'a:ancient',
        resolvedNodeKey: null,
      },
    });
  });

  it('TERMINUS: an unknown key with NO known ancestry at all reaches the city root', () => {
    const outcome = resolveNodeCursor({
      requestedNodeKey: 'a:never-existed',
      isKnownNode,
      ancestorKeysOf: () => [],
    });
    expect(outcome.rung).toBe('city-root');
    expect(outcome.notice?.blocking).toBe(false);
  });

  it('never treats the synthetic root key as an "ancestor" rung', () => {
    const outcome = resolveNodeCursor({
      requestedNodeKey: 'a:retired',
      isKnownNode: (key) => key === 'root',
      ancestorKeysOf: () => ['root'],
    });
    expect(outcome.rung).toBe('city-root');
    expect(outcome.resolvedNodeKey).toBeNull();
  });

  it('never throws for any stale input — the ladder always terminates', () => {
    const spy = vi.fn(() => false);
    expect(() =>
      resolveNodeCursor({
        requestedNodeKey: 'garbage',
        isKnownNode: spy,
        ancestorKeysOf: () => ['a', 'b', 'c'],
      }),
    ).not.toThrow();
  });
});

describe('nodeCursorOutcomeFromResolution — the server-resolved ladder', () => {
  const node = (nodeKey: string, depth: number) => ({ nodeKey, depth });

  it('EXACT yields no notice', () => {
    expect(
      nodeCursorOutcomeFromResolution('a:whitefield', 'EXACT', node('a:whitefield', 1)),
    ).toEqual({
      requestedNodeKey: 'a:whitefield',
      resolvedNodeKey: 'a:whitefield',
      rung: 'exact',
      notice: null,
    });
  });

  it('ALIAS (reserved rung) is treated as exact, not as staleness', () => {
    const outcome = nodeCursorOutcomeFromResolution('a:old-name', 'ALIAS', node('a:new-name', 1));
    expect(outcome.rung).toBe('exact');
    expect(outcome.notice).toBeNull();
  });

  it('ANCESTOR yields an ancestor rung and a non-blocking notice', () => {
    const outcome = nodeCursorOutcomeFromResolution('a:retired', 'ANCESTOR', node('d:e', 0));
    expect(outcome.rung).toBe('ancestor');
    expect(outcome.resolvedNodeKey).toBe('d:e');
    expect(outcome.notice).toEqual({
      blocking: false,
      rung: 'ancestor',
      requestedNodeKey: 'a:retired',
      resolvedNodeKey: 'd:e',
    });
  });

  it('CITY_ROOT yields a null resolved key and the city-root notice', () => {
    const outcome = nodeCursorOutcomeFromResolution('a:ancient', 'CITY_ROOT', node('root', -1));
    expect(outcome.resolvedNodeKey).toBeNull();
    expect(outcome.rung).toBe('city-root');
    expect(outcome.notice?.rung).toBe('city-root');
  });

  it('detects the city root from the synthetic depth even if the rung says ANCESTOR', () => {
    const outcome = nodeCursorOutcomeFromResolution('a:ancient', 'ANCESTOR', node('root', -1));
    expect(outcome.rung).toBe('city-root');
    expect(outcome.resolvedNodeKey).toBeNull();
  });
});
