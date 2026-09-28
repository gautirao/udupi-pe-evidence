/**
 * Issue #2660 (C3) — `useAreasJourneyHierarchy` exercised on its own, with no
 * providers, no listings hooks and no result sources: proof that the Areas
 * journey's hierarchy/node-navigation decisions are testable independently of
 * listings orchestration (#2660 DoD bullet 1).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAreasJourneyHierarchy } from '../useAreasJourneyHierarchy';
import type { UseAreasJourneyHierarchyParams } from '../useAreasJourneyHierarchy';
import { makeAreaLeafNode, makeJourney } from '@/features/discover/areas-journey/testing/areasJourneyPanelTestAdapter';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

function params(overrides: Partial<UseAreasJourneyHierarchyParams> = {}): UseAreasJourneyHierarchyParams {
  return {
    journey: makeJourney(),
    focusedClusterMemberAreaKeys: null,
    isNodeListingsActive: false,
    clearNodeListings: vi.fn(),
    ...overrides,
  };
}

// Raw node children carry areaKey/centroid; the journey's enriched children
// carry display data — the SAME split the map and panel both read.
const CLUSTER_NODE: NavigationNodeResponse = makeAreaLeafNode({
  nodeKey: 'd:north',
  nodeType: 'DIRECTION',
  areaKey: null,
  bounds: null,
  children: [
    { nodeKey: 'c1', displayLabel: 'One', listingCount: 2, schoolCount: 0, displayOrder: 0, areaKey: 'area-1', centreLat: 1, centreLon: 1 },
    { nodeKey: 'c2', displayLabel: 'Two', listingCount: 3, schoolCount: 0, displayOrder: 1, areaKey: 'area-2', centreLat: 1, centreLon: 1 },
  ] as never,
});
const CLUSTER_CHILDREN = [
  { nodeKey: 'c1', displayLabel: 'One', listingCount: 2, schoolCount: 0, displayOrder: 0 },
  { nodeKey: 'c2', displayLabel: 'Two', listingCount: 3, schoolCount: 0, displayOrder: 1 },
] as unknown as UseAreasNavigationJourneyResult['children'];

describe('useAreasJourneyHierarchy', () => {
  it('resolves an AREA leaf to the area-leaf branch with a memoised AreaPoint', () => {
    const journey = makeJourney({ node: makeAreaLeafNode() });
    const { result, rerender } = renderHook((p: UseAreasJourneyHierarchyParams) => useAreasJourneyHierarchy(p), {
      initialProps: params({ journey }),
    });
    expect(result.current.branch).toBe('area-leaf');
    expect(result.current.selectedAreaPoint?.areaKey).toBe('IN|KA|Bangalore|Manipal');

    const first = result.current.selectedAreaPoint;
    rerender(params({ journey }));
    // Same node identity -> same AreaPoint identity (FIX CYCLE 2 Finding 7).
    expect(result.current.selectedAreaPoint).toBe(first);
  });

  it('derives the focused cluster from exactly the member areaKeys the map reported, and prefers it over the level', () => {
    const journey = makeJourney({ node: CLUSTER_NODE, children: CLUSTER_CHILDREN });
    const { result } = renderHook(() =>
      useAreasJourneyHierarchy(params({ journey, focusedClusterMemberAreaKeys: ['area-2'] })),
    );
    expect(result.current.branch).toBe('cluster-focus');
    expect(result.current.focusedCluster?.members.map((m) => m.nodeKey)).toEqual(['c2']);
  });

  it('has no focused cluster (and renders the level) when no member keys are focused', () => {
    const journey = makeJourney({ node: CLUSTER_NODE, children: CLUSTER_CHILDREN });
    const { result } = renderHook(() => useAreasJourneyHierarchy(params({ journey })));
    expect(result.current.focusedCluster).toBeNull();
    expect(result.current.branch).toBe('level');
  });

  describe('#2087 eligibility-clear effect', () => {
    const ineligible = makeAreaLeafNode({
      ...CLUSTER_NODE,
      descendantAreaKeys: Array.from({ length: 20 }, (_, i) => `area-${i}`),
    });

    it('clears nodeListings for an ineligible node — even while a cluster is REALLY focused (T7: no cluster-focus guard)', () => {
      const clearNodeListings = vi.fn();
      const { result } = renderHook(() =>
        useAreasJourneyHierarchy(
          params({
            journey: makeJourney({ node: ineligible, children: CLUSTER_CHILDREN }),
            isNodeListingsActive: true,
            focusedClusterMemberAreaKeys: ['area-1'],
            clearNodeListings,
          }),
        ),
      );
      // Positive control: the premise "a cluster is focused" actually holds —
      // without it, a cluster-focus guard on the effect would pass unnoticed.
      expect(result.current.focusedCluster).not.toBeNull();
      expect(result.current.branch).toBe('cluster-focus');
      expect(clearNodeListings).toHaveBeenCalledTimes(1);
    });

    it('does not clear when nodeListings is inactive', () => {
      const clearNodeListings = vi.fn();
      renderHook(() =>
        useAreasJourneyHierarchy(params({ journey: makeJourney({ node: ineligible }), clearNodeListings })),
      );
      expect(clearNodeListings).not.toHaveBeenCalled();
    });

    it('does not clear an eligible node, and routes it to the node-listings branch', () => {
      const clearNodeListings = vi.fn();
      const eligible = makeAreaLeafNode({ nodeType: 'DIRECTION', areaKey: null, bounds: null, descendantAreaKeys: ['a1'] });
      const { result } = renderHook(() =>
        useAreasJourneyHierarchy(
          params({ journey: makeJourney({ node: eligible }), isNodeListingsActive: true, clearNodeListings }),
        ),
      );
      expect(clearNodeListings).not.toHaveBeenCalled();
      expect(result.current.branch).toBe('node-listings');
    });
  });
});
