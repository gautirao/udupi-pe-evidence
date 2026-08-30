/**
 * Issue #2207 — pure mapping of node type -> valid override kinds. Covered
 * separately from NavigationHierarchyTree's integration tests since this is
 * the exhaustive source of truth for "Area-only actions must not appear for
 * a non-Area node" (and vice versa).
 */
import { describe, it, expect } from 'vitest';
import { getValidOverrideKindsForNode } from '../navigationHierarchyOverrideRules';

describe('getValidOverrideKindsForNode', () => {
  it('returns only Area-subject kinds for AREA nodes', () => {
    expect(getValidOverrideKindsForNode('AREA')).toEqual([
      'EXCLUDE_AREA',
      'REASSIGN_AREA_REGION',
      'MOVE_AREA',
    ]);
  });

  it('returns only Node-subject kinds for CLUSTER nodes', () => {
    expect(getValidOverrideKindsForNode('CLUSTER')).toEqual(['RELABEL', 'SET_REPRESENTATIVES']);
  });

  it('returns only Node-subject kinds for DIRECTION nodes', () => {
    expect(getValidOverrideKindsForNode('DIRECTION')).toEqual(['RELABEL', 'SET_REPRESENTATIVES']);
  });
});
