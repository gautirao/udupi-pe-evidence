/**
 * Wire-to-strict normalization — Issue #1956 PR 2.
 *
 * The gap under test is not hypothetical: `NavigationNodeResponse` is
 * `@JsonInclude(NON_NULL)` server-side, so a null-valued field is OMITTED from
 * the JSON. `JSON.parse` therefore yields `undefined` for it, while every strict
 * type in ../types.ts promises `null`. A consumer writing `node.bounds === null`
 * is FALSE for a node the server considers boundless — the whole class of bug
 * these two functions close.
 *
 * The fixtures below are built from `JSON.parse(JSON.stringify(...))` of a body
 * with the fields ABSENT, rather than from a hand-written object literal with
 * `undefined` values, so the test exercises the real absent-key path.
 */
import { describe, it, expect } from 'vitest';
import { normalizeNavigationNode, normalizeNavigationResolveResponse } from '../normalize';
import type { NavigationNodeWire, NavigationResolveResponseWire } from '../types';

/** A DIRECTION node exactly as the server serialises it: the five nullable fields absent. */
const DIRECTION_WIRE_JSON = JSON.stringify({
  nodeKey: 'd:north',
  nodeType: 'DIRECTION',
  displayLabel: 'North Bangalore',
  depth: 0,
  ancestry: [],
  children: [
    {
      nodeKey: 'a:IN|KA|Bengaluru|Hebbal',
      nodeType: 'AREA',
      displayLabel: 'Hebbal',
      displayOrder: 1,
    },
  ],
  revisionId: 8,
});

/** An AREA leaf with every optional field PRESENT — the normalizer must pass them through. */
const AREA_WIRE_JSON = JSON.stringify({
  nodeKey: 'a:IN|KA|Bengaluru|Hebbal',
  nodeType: 'AREA',
  displayLabel: 'Hebbal',
  depth: 1,
  regionKey: 'north',
  ancestry: [
    { nodeKey: 'd:north', nodeType: 'DIRECTION', displayLabel: 'North Bangalore', displayOrder: 1 },
  ],
  nextLevelType: 'LISTINGS',
  children: [],
  revisionId: 8,
  bounds: {
    centreLat: 13.04,
    centreLon: 77.59,
    minLat: 13.0,
    minLon: 77.55,
    maxLat: 13.08,
    maxLon: 77.63,
  },
  descendantAreaKeys: ['IN|KA|Bengaluru|Hebbal'],
  areaKey: 'IN|KA|Bengaluru|Hebbal',
});

describe('normalizeNavigationNode', () => {
  it('maps every omitted nullable field to a real null, never undefined', () => {
    const wire = JSON.parse(DIRECTION_WIRE_JSON) as NavigationNodeWire;
    // Precondition: the fields really are ABSENT on the wire, not present-and-null.
    expect('bounds' in wire).toBe(false);
    expect('nextLevelType' in wire).toBe(false);

    const node = normalizeNavigationNode(wire);

    for (const field of [
      'regionKey',
      'nextLevelType',
      'bounds',
      'descendantAreaKeys',
      'areaKey',
    ] as const) {
      expect(node[field], `${field} must normalise to null`).toBeNull();
      expect(node[field], `${field} must not stay undefined`).not.toBeUndefined();
    }
  });

  it('preserves the non-nullable fields verbatim', () => {
    const node = normalizeNavigationNode(JSON.parse(DIRECTION_WIRE_JSON) as NavigationNodeWire);
    expect(node.nodeKey).toBe('d:north');
    expect(node.nodeType).toBe('DIRECTION');
    expect(node.displayLabel).toBe('North Bangalore');
    expect(node.depth).toBe(0);
    expect(node.revisionId).toBe(8);
    expect(node.ancestry).toEqual([]);
    expect(node.children).toHaveLength(1);
  });

  it('passes present optional fields through unchanged — it fills gaps, it does not rewrite', () => {
    const wire = JSON.parse(AREA_WIRE_JSON) as NavigationNodeWire;
    const node = normalizeNavigationNode(wire);
    expect(node.regionKey).toBe('north');
    expect(node.nextLevelType).toBe('LISTINGS');
    expect(node.bounds).toEqual(wire.bounds);
    expect(node.descendantAreaKeys).toEqual(['IN|KA|Bengaluru|Hebbal']);
    expect(node.areaKey).toBe('IN|KA|Bengaluru|Hebbal');
  });

  it('distinguishes an absent field from a present zero/empty value', () => {
    // `descendantAreaKeys: []` is a REAL empty list, not an absence, and must not
    // be collapsed to null by an over-eager falsy check.
    const wire = JSON.parse(
      JSON.stringify({
        ...(JSON.parse(DIRECTION_WIRE_JSON) as Record<string, unknown>),
        descendantAreaKeys: [],
        regionKey: '',
      }),
    ) as NavigationNodeWire;
    const node = normalizeNavigationNode(wire);
    expect(node.descendantAreaKeys).toEqual([]);
    expect(node.regionKey).toBe('');
  });
});

describe('normalizeNavigationNode — Issue #1956 PR 3 widened NavigationChildSummary', () => {
  it('passes an AREA child\'s areaKey/centreLat/centreLon through unchanged (present-and-null included)', () => {
    const wire = JSON.parse(
      JSON.stringify({
        ...(JSON.parse(DIRECTION_WIRE_JSON) as Record<string, unknown>),
        children: [
          {
            nodeKey: 'a:IN|KA|Bengaluru|Hebbal',
            nodeType: 'AREA',
            displayLabel: 'Hebbal',
            displayOrder: 1,
            areaKey: 'IN|KA|Bengaluru|Hebbal',
            centreLat: 13.04,
            centreLon: 77.59,
          },
          {
            nodeKey: 'c:local-destination-1',
            nodeType: 'CLUSTER',
            displayLabel: 'Local Destination',
            displayOrder: 2,
            areaKey: null,
            centreLat: 13.1,
            centreLon: 77.6,
          },
        ],
      }),
    ) as NavigationNodeWire;

    const node = normalizeNavigationNode(wire);

    expect(node.children[0].areaKey).toBe('IN|KA|Bengaluru|Hebbal');
    expect(node.children[0].centreLat).toBe(13.04);
    expect(node.children[0].centreLon).toBe(77.59);
    // areaKey is present-and-null for a non-AREA child — never omitted, never coerced.
    expect(node.children[1].areaKey).toBeNull();
    expect(node.children[1].centreLat).toBe(13.1);
  });

  it('leaves a child with the three new fields entirely absent (undefined) untouched — no normalization runs on children', () => {
    const wire = JSON.parse(DIRECTION_WIRE_JSON) as NavigationNodeWire;
    const node = normalizeNavigationNode(wire);
    expect(node.children[0].areaKey).toBeUndefined();
    expect(node.children[0].centreLat).toBeUndefined();
    expect(node.children[0].centreLon).toBeUndefined();
  });
});

describe('normalizeNavigationResolveResponse', () => {
  it('normalises the inlined node and carries the resolution rung through', () => {
    const wire = JSON.parse(
      JSON.stringify({
        requested: 'a:IN|KA|Bengaluru|NoSuchArea',
        resolution: 'ANCESTOR',
        revisionId: 8,
        node: JSON.parse(DIRECTION_WIRE_JSON),
      }),
    ) as NavigationResolveResponseWire;

    const resolved = normalizeNavigationResolveResponse(wire);

    expect(resolved.requested).toBe('a:IN|KA|Bengaluru|NoSuchArea');
    expect(resolved.resolution).toBe('ANCESTOR');
    expect(resolved.revisionId).toBe(8);
    expect(resolved.node.bounds).toBeNull();
    expect(resolved.node.nextLevelType).toBeNull();
    expect(resolved.node.nodeKey).toBe('d:north');
  });
});
