/**
 * Issue #2660 (C3) — focused unit coverage for the Areas journey's pure
 * hierarchy decisions, independent of any listings/result-source machinery:
 * the render-branch precedence and the #2087 bounded-browse eligibility rule.
 */
import { describe, it, expect } from 'vitest';
import { selectAreasJourneyBranch } from '../selectAreasJourneyBranch';
import type { SelectAreasJourneyBranchInput } from '../selectAreasJourneyBranch';
import { isNodeEligibleForBrowse } from '../nodeBrowseEligibility';
import { ROOT_NODE_KEY } from '@/features/discover/navigation/types';
import { makeAreaLeafNode } from '@/features/discover/areas-journey/testing/areasJourneyPanelTestAdapter';

const SETTLED_LEVEL: SelectAreasJourneyBranchInput = {
  isLoading: false,
  isError: false,
  hasNode: true,
  hasFocusedCluster: false,
  isNodeListingsActive: false,
  nodeIsEligibleForBrowse: false,
  hasSelectedAreaPoint: false,
  childrenLength: 3,
};

describe('selectAreasJourneyBranch — precedence', () => {
  it.each<[string, Partial<SelectAreasJourneyBranchInput>, ReturnType<typeof selectAreasJourneyBranch>]>([
    ['loading beats everything', { isLoading: true, isError: true, hasFocusedCluster: true }, 'loading'],
    ['error beats no-node', { isError: true, hasNode: false }, 'error'],
    ['no-node beats cluster focus', { hasNode: false, hasFocusedCluster: true }, 'no-node'],
    [
      'cluster focus beats eligible node-listings and area-leaf',
      { hasFocusedCluster: true, isNodeListingsActive: true, nodeIsEligibleForBrowse: true, hasSelectedAreaPoint: true },
      'cluster-focus',
    ],
    [
      'eligible node-listings beats area-leaf',
      { isNodeListingsActive: true, nodeIsEligibleForBrowse: true, hasSelectedAreaPoint: true },
      'node-listings',
    ],
    [
      'INELIGIBLE node-listings falls through (never renders the browse surface)',
      { isNodeListingsActive: true, nodeIsEligibleForBrowse: false, childrenLength: 2 },
      'level',
    ],
    ['area-leaf beats empty-level', { hasSelectedAreaPoint: true, childrenLength: 0 }, 'area-leaf'],
    ['no children and no leaf point is the structural empty level', { childrenLength: 0 }, 'empty-level'],
    ['children present is the level', {}, 'level'],
  ])('%s', (_name, overrides, expected) => {
    expect(selectAreasJourneyBranch({ ...SETTLED_LEVEL, ...overrides })).toBe(expected);
  });
});

describe('isNodeEligibleForBrowse — #2087 bounded-browse rule', () => {
  const keys = (n: number) => Array.from({ length: n }, (_, i) => `a${i}`);

  it('is false for no node', () => {
    expect(isNodeEligibleForBrowse(null)).toBe(false);
  });

  it('is false for the city root even with an eligible descendant count', () => {
    expect(isNodeEligibleForBrowse(makeAreaLeafNode({ nodeKey: ROOT_NODE_KEY, descendantAreaKeys: keys(3) }))).toBe(false);
  });

  it.each([
    [null, false],
    [0, false],
    [1, true],
    [15, true],
    [16, false],
  ])('descendant count %s -> %s', (count, expected) => {
    const node = makeAreaLeafNode({ nodeType: 'DIRECTION', descendantAreaKeys: count == null ? null : keys(count) });
    expect(isNodeEligibleForBrowse(node)).toBe(expected);
  });
});
