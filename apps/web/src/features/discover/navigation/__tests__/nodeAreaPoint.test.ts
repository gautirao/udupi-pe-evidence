/**
 * Issue #1956 PR-4 — unit coverage for the pure node -> AreaPoint bridge.
 * Covers the five transitional states enumerated in nodeAreaPoint.ts's
 * module doc (team-lead-plan-pr4.toml "TRANSITIONAL STATES").
 */
import { describe, it, expect } from 'vitest';
import { deriveAreaPointFromNode, isResolvedAreaLeafNode } from '../nodeAreaPoint';
import type { NavigationNodeResponse } from '../types';

function makeNode(overrides: Partial<NavigationNodeResponse> = {}): NavigationNodeResponse {
  return {
    nodeKey: 'a:IN|KA|Bangalore|Manipal',
    nodeType: 'AREA',
    displayLabel: 'Manipal',
    depth: 2,
    regionKey: 'east',
    ancestry: [],
    nextLevelType: 'LISTINGS',
    children: [],
    revisionId: 1,
    bounds: {
      centreLat: 13.35,
      centreLon: 74.79,
      minLat: 13.3,
      minLon: 74.75,
      maxLat: 13.4,
      maxLon: 74.83,
    },
    descendantAreaKeys: null,
    areaKey: 'IN|KA|Bangalore|Manipal',
    ...overrides,
  };
}

describe('isResolvedAreaLeafNode', () => {
  it('(a) AREA node with non-null areaKey -> true', () => {
    expect(isResolvedAreaLeafNode(makeNode())).toBe(true);
  });

  it('(b) null node -> false', () => {
    expect(isResolvedAreaLeafNode(null)).toBe(false);
  });

  it('(b) AREA node with null areaKey -> false (never admitted on nodeType alone)', () => {
    expect(isResolvedAreaLeafNode(makeNode({ areaKey: null }))).toBe(false);
  });

  it('(e) DIRECTION node -> false, even with a non-null areaKey', () => {
    expect(
      isResolvedAreaLeafNode(makeNode({ nodeType: 'DIRECTION', areaKey: 'IN|KA|Bangalore|East' })),
    ).toBe(false);
  });
});

describe('deriveAreaPointFromNode', () => {
  it('(a) node resolved + bounds populated -> a real AreaPoint', () => {
    const point = deriveAreaPointFromNode(makeNode());
    expect(point).toEqual({
      areaKey: 'IN|KA|Bangalore|Manipal',
      areaLabel: 'Manipal',
      geo_center_lat: 13.35,
      geo_center_lon: 74.79,
      bbox: [
        [13.3, 74.75],
        [13.4, 74.83],
      ],
    });
  });

  it('(b) node null -> null', () => {
    expect(deriveAreaPointFromNode(null)).toBeNull();
  });

  it('(b) node.areaKey null (cold load / not a leaf) -> null', () => {
    expect(deriveAreaPointFromNode(makeNode({ areaKey: null }))).toBeNull();
  });

  it('(c) node.areaKey non-null but bounds null -> null, NEVER a partial AreaPoint', () => {
    expect(deriveAreaPointFromNode(makeNode({ bounds: null }))).toBeNull();
  });

  it('(d) bounds present but centreLat/centreLon null -> null', () => {
    expect(
      deriveAreaPointFromNode(
        makeNode({
          bounds: {
            centreLat: null,
            centreLon: null,
            minLat: 13.3,
            minLon: 74.75,
            maxLat: 13.4,
            maxLon: 74.83,
          },
        }),
      ),
    ).toBeNull();
  });

  it('(d) partial min/max (one null) -> valid AreaPoint with bbox null, not a crash', () => {
    const point = deriveAreaPointFromNode(
      makeNode({
        bounds: {
          centreLat: 13.35,
          centreLon: 74.79,
          minLat: null,
          minLon: 74.75,
          maxLat: 13.4,
          maxLon: 74.83,
        },
      }),
    );
    expect(point).toEqual({
      areaKey: 'IN|KA|Bangalore|Manipal',
      areaLabel: 'Manipal',
      geo_center_lat: 13.35,
      geo_center_lon: 74.79,
      bbox: null,
    });
  });

  it('(e) CLUSTER node (not an AREA leaf) -> null, never broadened past the AREA level', () => {
    expect(
      deriveAreaPointFromNode(makeNode({ nodeType: 'CLUSTER', areaKey: null, nextLevelType: 'AREA' })),
    ).toBeNull();
  });
});
