import { describe, expect, it } from 'vitest';

import {
  isFinalAreaNodeType,
  isStructuralNodeType,
  nodeLevelKind,
} from '../nodeLevelKind';
import type { NavigationNodeType, NextLevelType } from '../types';

describe('nodeLevelKind', () => {
  it.each<[NextLevelType, string]>([
    ['DIRECTION', 'directions'],
    ['CLUSTER', 'clusters'],
    ['AREA', 'areas'],
    ['LISTINGS', 'listings'],
    [null, 'empty'],
  ])('maps nextLevelType=%s to %s', (nextLevelType, expected) => {
    expect(nodeLevelKind({ nextLevelType })).toBe(expected);
  });

  it('dispatches on TYPE, not depth — a Direction (nextLevelType=AREA, the live Bangalore shape) and a Local Destination (nextLevelType=CLUSTER, one level deeper) genuinely produce DIFFERENT kinds, proving the dispatch actually varies with the input rather than being depth-hardcoded', () => {
    // Rewritten (Issue #2086 qa-fast finding) — the prior version called
    // nodeLevelKind TWICE WITH AN IDENTICAL ARGUMENT ({ nextLevelType: 'AREA' })
    // under two different variable names, so it provided zero coverage of the
    // dispatch logic: it would pass equally well against a hardcoded
    // `depth === 0 ? 'directions' : depth === 1 ? 'areas' : ...` implementation
    // that never reads `nextLevelType` at all, so long as both calls happened
    // to land on the 'AREA' branch. This version genuinely varies the
    // scenario — a Direction whose next level is AREA (today's live shape) vs
    // a Local Destination whose next level is CLUSTER (the deeper shape once
    // a Local Destination sits under a Direction) — and asserts they resolve
    // to correspondingly DIFFERENT kinds, which only a real dispatch on
    // `nextLevelType` can satisfy.
    const underDirection = nodeLevelKind({ nextLevelType: 'AREA' });
    const underLocalDestination = nodeLevelKind({ nextLevelType: 'CLUSTER' });
    expect(underDirection).toBe('areas');
    expect(underLocalDestination).toBe('clusters');
    expect(underDirection).not.toBe(underLocalDestination);
  });

  it('accepts an argument that carries no depth field at all', () => {
    // Type-level guarantee: the parameter is Pick<..., 'nextLevelType'>, so a
    // depth branch is not writable inside the function even by accident. This
    // compiles only because depth is not required.
    const arg: { nextLevelType: NextLevelType } = { nextLevelType: 'CLUSTER' };
    expect(nodeLevelKind(arg)).toBe('clusters');
  });

  it('treats a null next level as a real designed empty level, not an error', () => {
    expect(nodeLevelKind({ nextLevelType: null })).toBe('empty');
  });
});

describe('structural vs final-area node types', () => {
  it.each<[NavigationNodeType, boolean]>([
    ['ROOT', true],
    ['DIRECTION', true],
    ['CLUSTER', true],
    ['AREA', false],
  ])('isStructuralNodeType(%s) === %s', (nodeType, expected) => {
    expect(isStructuralNodeType(nodeType)).toBe(expected);
  });

  it.each<[NavigationNodeType, boolean]>([
    ['ROOT', false],
    ['DIRECTION', false],
    ['CLUSTER', false],
    ['AREA', true],
  ])('isFinalAreaNodeType(%s) === %s', (nodeType, expected) => {
    expect(isFinalAreaNodeType(nodeType)).toBe(expected);
  });
});
