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

  it('dispatches on TYPE, not depth — the same nextLevelType at any depth yields the same kind', () => {
    // The live Bangalore tree is City -> DIRECTION (depth 0) -> AREA (depth 1),
    // so "depth 1 == AREA" is TRUE today and would still pass a naive test. The
    // point of this one is that the function cannot see depth at all: the same
    // 'AREA' next level under a depth-1 CLUSTER must give the identical answer.
    const underDirection = nodeLevelKind({ nextLevelType: 'AREA' });
    const underLocalDestination = nodeLevelKind({ nextLevelType: 'AREA' });
    expect(underDirection).toBe('areas');
    expect(underLocalDestination).toBe('areas');
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
