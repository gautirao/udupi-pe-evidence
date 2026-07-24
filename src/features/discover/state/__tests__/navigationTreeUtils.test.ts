/**
 * Issue #1955 (Areas PR A) — pure NavigationTreeNode traversal helpers,
 * shared by NavigationHierarchyTree and the guided journey.
 *
 * Code-review cycle 1 fix: the server returns a FLAT `PreviewNode[]` list
 * (NavigationPreviewTreeResponse), never a nested {cityId, root} tree, and a
 * city has multiple top-level (region-scoped) nodes — a FOREST, not a
 * single-root tree. `buildNavigationForest` is exercised directly; the
 * single-root helpers are exercised via one of the built roots.
 */
import { describe, it, expect } from 'vitest';
import {
  buildNavigationForest,
  flattenNavigationTree,
  flattenNavigationForest,
  findNavigationNode,
  findNavigationNodeInForest,
  getNavigationAncestryPath,
  getNavigationAncestryPathInForest,
  getNavigationChildren,
  getNavigationChildrenInForest,
} from '../navigationTreeUtils';
import type { PreviewNode } from '@/lib/schemas/navigationHierarchy';

function previewNode(partial: Partial<PreviewNode> & Pick<PreviewNode, 'nodeKey'>): PreviewNode {
  return {
    nodeType: 'CLUSTER',
    parentNodeKey: null,
    regionKey: null,
    areaKey: null,
    displayLabel: partial.nodeKey,
    depth: 0,
    ancestorKeys: [],
    representativeAreaKeys: [],
    displayOrder: 0,
    descendantAreaCount: 0,
    bounds: { centreLat: 0, centreLon: 0, minLat: 0, minLon: 0, maxLat: 0, maxLon: 0 },
    ...partial,
  };
}

// One forest: two region roots (north, south); north has two AREA leaves.
const FLAT_NODES: PreviewNode[] = [
  previewNode({ nodeKey: 'region-south', displayOrder: 1 }),
  previewNode({ nodeKey: 'region-north', displayOrder: 0 }),
  previewNode({
    nodeKey: 'area-udupi-town',
    nodeType: 'AREA',
    parentNodeKey: 'region-north',
    areaKey: 'udupi-town',
    depth: 1,
    displayOrder: 1,
  }),
  previewNode({
    nodeKey: 'area-manipal',
    nodeType: 'AREA',
    parentNodeKey: 'region-north',
    areaKey: 'manipal',
    depth: 1,
    displayOrder: 0,
  }),
];

describe('buildNavigationForest', () => {
  it('links children under their parentNodeKey and sorts by displayOrder', () => {
    const forest = buildNavigationForest(FLAT_NODES);
    expect(forest.map((n) => n.nodeKey)).toEqual(['region-north', 'region-south']);
    const north = forest[0];
    expect(north.children.map((n) => n.nodeKey)).toEqual(['area-manipal', 'area-udupi-town']);
  });

  it('treats a node whose parentNodeKey is not in the list as its own root', () => {
    const orphan = previewNode({ nodeKey: 'orphan', parentNodeKey: 'does-not-exist' });
    const forest = buildNavigationForest([...FLAT_NODES, orphan]);
    expect(forest.map((n) => n.nodeKey)).toContain('orphan');
  });

  it('returns [] for an empty node list', () => {
    expect(buildNavigationForest([])).toEqual([]);
  });
});

describe('flattenNavigationTree / flattenNavigationForest', () => {
  it('walks a single root depth-first pre-order', () => {
    const forest = buildNavigationForest(FLAT_NODES);
    const north = forest[0];
    expect(flattenNavigationTree(north).map((n) => n.nodeKey)).toEqual([
      'region-north',
      'area-manipal',
      'area-udupi-town',
    ]);
  });

  it('walks every root in the forest', () => {
    const forest = buildNavigationForest(FLAT_NODES);
    expect(flattenNavigationForest(forest).map((n) => n.nodeKey)).toEqual([
      'region-north',
      'area-manipal',
      'area-udupi-town',
      'region-south',
    ]);
  });
});

describe('findNavigationNode / findNavigationNodeInForest', () => {
  it('finds a deeply nested node under a given root', () => {
    const forest = buildNavigationForest(FLAT_NODES);
    expect(findNavigationNode(forest[0], 'area-manipal')?.nodeKey).toBe('area-manipal');
  });

  it('finds a node across the whole forest, not just the first root', () => {
    const forest = buildNavigationForest(FLAT_NODES);
    expect(findNavigationNodeInForest(forest, 'region-south')?.nodeKey).toBe('region-south');
  });

  it('returns null for an absent key', () => {
    const forest = buildNavigationForest(FLAT_NODES);
    expect(findNavigationNodeInForest(forest, 'does-not-exist')).toBeNull();
  });
});

describe('getNavigationAncestryPath / getNavigationAncestryPathInForest', () => {
  it('returns the full Region→Area chain for a leaf', () => {
    const forest = buildNavigationForest(FLAT_NODES);
    const path = getNavigationAncestryPathInForest(forest, 'area-manipal').map((n) => n.nodeKey);
    expect(path).toEqual(['region-north', 'area-manipal']);
  });

  it('returns [] for an absent key', () => {
    const forest = buildNavigationForest(FLAT_NODES);
    expect(getNavigationAncestryPathInForest(forest, 'nope')).toEqual([]);
  });

  it('returns a single-element path for a root itself', () => {
    const forest = buildNavigationForest(FLAT_NODES);
    expect(getNavigationAncestryPath(forest[0], 'region-north').map((n) => n.nodeKey)).toEqual([
      'region-north',
    ]);
  });
});

describe('getNavigationChildren / getNavigationChildrenInForest', () => {
  it('returns direct children of a cluster node', () => {
    const forest = buildNavigationForest(FLAT_NODES);
    const children = getNavigationChildrenInForest(forest, 'region-north').map((n) => n.nodeKey);
    expect(children).toEqual(['area-manipal', 'area-udupi-town']);
  });

  it('returns [] for a leaf area node', () => {
    const forest = buildNavigationForest(FLAT_NODES);
    expect(getNavigationChildren(forest[0], 'area-manipal')).toEqual([]);
  });

  it('returns [] for an absent node key', () => {
    const forest = buildNavigationForest(FLAT_NODES);
    expect(getNavigationChildrenInForest(forest, 'nope')).toEqual([]);
  });
});
