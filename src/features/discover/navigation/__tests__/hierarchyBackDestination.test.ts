/**
 * hierarchyBackDestination — bug-fix coverage for the top-level Direction
 * "hierarchy Back disappears" defect (verified pre-existing on `main`, not a
 * #2147 regression).
 *
 * `resolveHierarchyBackDestination` is the ONE authoritative rule for where
 * the in-app hierarchy Back control points. These tests prove all four
 * canonical hierarchy positions in isolation, independent of React or the
 * POP/REPLACE navigation mechanism (owned separately by
 * `useAreasNavigationJourney.ts`/`HierarchyBackButton.tsx`).
 */
import { describe, it, expect } from 'vitest';
import { resolveHierarchyBackDestination, type HierarchyBackDestinationNode } from '../hierarchyBackDestination';
import { ROOT_NODE_KEY } from '../types';

function node(overrides: Partial<HierarchyBackDestinationNode>): HierarchyBackDestinationNode {
  return {
    nodeKey: 'a:some-area',
    nodeType: 'AREA',
    ancestry: [],
    ...overrides,
  };
}

describe('resolveHierarchyBackDestination', () => {
  it('1. synthetic ROOT — no Back destination', () => {
    const root = node({ nodeKey: ROOT_NODE_KEY, nodeType: 'ROOT', ancestry: [] });
    expect(resolveHierarchyBackDestination(root, 'Bangalore')).toBeNull();
  });

  it('2. top-level DIRECTION with empty ancestry — falls back to the synthetic ROOT, labelled with the city', () => {
    const direction = node({ nodeKey: 'd:central', nodeType: 'DIRECTION', ancestry: [] });
    expect(resolveHierarchyBackDestination(direction, 'Bangalore')).toEqual({
      nodeKey: ROOT_NODE_KEY,
      displayLabel: 'Bangalore',
    });
  });

  it('3. CLUSTER — resolves to the exact final server-declared ancestry entry (the parent DIRECTION)', () => {
    const cluster = node({
      nodeKey: 'c:central:some-cluster',
      nodeType: 'CLUSTER',
      ancestry: [{ nodeKey: 'd:central', displayLabel: 'Central Bangalore' }],
    });
    expect(resolveHierarchyBackDestination(cluster, 'Bangalore')).toEqual({
      nodeKey: 'd:central',
      displayLabel: 'Central Bangalore',
    });
  });

  it('4. AREA — resolves to the exact final server-declared ancestry entry (the canonical parent), never the whole chain', () => {
    const area = node({
      nodeKey: 'a:whitefield',
      nodeType: 'AREA',
      ancestry: [
        { nodeKey: 'd:east', displayLabel: 'East Bangalore' },
        { nodeKey: 'c:east:some-cluster', displayLabel: 'Some Local Destination' },
      ],
    });
    expect(resolveHierarchyBackDestination(area, 'Bangalore')).toEqual({
      nodeKey: 'c:east:some-cluster',
      displayLabel: 'Some Local Destination',
    });
  });

  it('a DIRECTION whose ancestry IS populated (server-declared) uses that ancestry, never the synthetic-root fallback', () => {
    const direction = node({
      nodeKey: 'd:central',
      nodeType: 'DIRECTION',
      ancestry: [{ nodeKey: ROOT_NODE_KEY, displayLabel: 'Bangalore' }],
    });
    expect(resolveHierarchyBackDestination(direction, 'Some Other City')).toEqual({
      nodeKey: ROOT_NODE_KEY,
      displayLabel: 'Bangalore',
    });
  });

  it('a non-DIRECTION node with empty ancestry (unexpected shape) has no Back destination — never guesses', () => {
    const orphan = node({ nodeKey: 'a:orphan', nodeType: 'AREA', ancestry: [] });
    expect(resolveHierarchyBackDestination(orphan, 'Bangalore')).toBeNull();
  });
});
