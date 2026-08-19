import { describe, it, expect } from 'vitest';
import {
  resolveDiscoverMarkerScope,
  type DiscoverMarkerScope,
  type DiscoverMarkerScopeInput,
} from '../markerScope';
import { ROOT_NODE_KEY } from '@/features/discover/navigation/types';

/** Every field defaults to the "nothing special is happening" baseline; override per-case. */
function makeInput(overrides: Partial<DiscoverMarkerScopeInput> = {}): DiscoverMarkerScopeInput {
  return {
    sourceMode: 'live',
    journey: null,
    schoolId: null,
    rawNodeParam: null,
    resolvedNodeKey: null,
    groupAreaKeys: undefined,
    ...overrides,
  };
}

/** enabled === scope.kind !== 'unresolved' — mirrors useDiscoverFilteredMarkers.ts's own predicate. */
function enabledFor(scope: DiscoverMarkerScope): boolean {
  return scope.kind !== 'unresolved';
}

describe('resolveDiscoverMarkerScope — table-driven over every scope variant (Issue #2185 S2)', () => {
  const cases: Array<{ name: string; input: Partial<DiscoverMarkerScopeInput>; expected: DiscoverMarkerScope }> = [
    {
      name: 'no node, no group, no journey special-case -> city (deliberately unscoped, rule 7)',
      input: {},
      expected: { kind: 'city' },
    },
    {
      name: 'preview mode + a resolved node -> node scope, not city (rule 1 — #2202/#2215 node wire representation)',
      input: { sourceMode: 'preview', resolvedNodeKey: 'n:cluster-1' },
      expected: { kind: 'node', nodeKey: 'n:cluster-1' },
    },
    {
      name: 'preview mode + a resolved node AND a resolved legacy group -> node wins over areas (rule 1 mirrors rule 5-before-6)',
      input: { sourceMode: 'preview', resolvedNodeKey: 'n:cluster-1', groupAreaKeys: ['IN|KA|Udupi|Manipal'] },
      expected: { kind: 'node', nodeKey: 'n:cluster-1' },
    },
    {
      name: 'preview mode + a resolved node AND a cold-loading legacy group ([]) -> node still wins (rule 1)',
      input: { sourceMode: 'preview', resolvedNodeKey: 'n:cluster-1', groupAreaKeys: [] },
      expected: { kind: 'node', nodeKey: 'n:cluster-1' },
    },
    {
      name: 'preview mode + node mid-resolution (rawNodeParam set, resolvedNodeKey null) -> unresolved/node-resolving (rule 1)',
      input: { sourceMode: 'preview', rawNodeParam: 'n:cluster-1', resolvedNodeKey: null },
      expected: { kind: 'unresolved', reason: 'node-resolving' },
    },
    {
      name: 'preview mode + no node + a resolved legacy group -> areas (rule 1 fallback, unchanged #2192 behavior)',
      input: { sourceMode: 'preview', groupAreaKeys: ['IN|KA|Udupi|Manipal'] },
      expected: { kind: 'areas', areaKeys: ['IN|KA|Udupi|Manipal'] },
    },
    {
      name: 'preview mode + no node + no group -> city (rule 1 fallback, unchanged)',
      input: { sourceMode: 'preview' },
      expected: { kind: 'city' },
    },
    {
      name: 'school-first + schoolId set -> city (rule 2 — radius owns the scope)',
      input: { journey: 'school-first', schoolId: 'school-123', resolvedNodeKey: 'n:cluster-1' },
      expected: { kind: 'city' },
    },
    {
      name: 'school-first WITHOUT schoolId -> falls through (not rule 2)',
      input: { journey: 'school-first', schoolId: null, resolvedNodeKey: 'n:cluster-1' },
      expected: { kind: 'node', nodeKey: 'n:cluster-1' },
    },
    {
      name: 'agri-first -> city (rule 3), even with a resolved node',
      input: { journey: 'agri-first', resolvedNodeKey: 'n:cluster-1' },
      expected: { kind: 'city' },
    },
    {
      name: 'a node= is present in the URL but not yet resolved -> unresolved/node-resolving (rule 4)',
      input: { rawNodeParam: 'n:cluster-1', resolvedNodeKey: null },
      expected: { kind: 'unresolved', reason: 'node-resolving' },
    },
    {
      name: 'a resolved AREA-leaf node -> node scope (rule 5) — THE core #2185 fix',
      input: { rawNodeParam: 'n:area-1', resolvedNodeKey: 'n:area-1' },
      expected: { kind: 'node', nodeKey: 'n:area-1' },
    },
    {
      name: 'a resolved CLUSTER node (no rawNodeParam needed once resolved) -> node scope (rule 5)',
      input: { resolvedNodeKey: 'n:cluster-1' },
      expected: { kind: 'node', nodeKey: 'n:cluster-1' },
    },
    {
      name: 'resolvedNodeKey === ROOT -> NOT a node scope, falls through to rule 6/7',
      input: { resolvedNodeKey: ROOT_NODE_KEY },
      expected: { kind: 'city' },
    },
    {
      name: 'resolvedNodeKey === ROOT with a resolved legacy group -> falls through to the legacy areas arm (rule 6)',
      input: { resolvedNodeKey: ROOT_NODE_KEY, groupAreaKeys: ['IN|KA|Udupi|Manipal'] },
      expected: { kind: 'areas', areaKeys: ['IN|KA|Udupi|Manipal'] },
    },
    {
      name: 'legacy group resolved (no node) -> areas scope (rule 6)',
      input: { groupAreaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Karkala'] },
      expected: { kind: 'areas', areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Karkala'] },
    },
    {
      name: 'legacy group focused but its areas have not resolved yet ([]) -> unresolved/group-cold-load (rule 6)',
      input: { groupAreaKeys: [] },
      expected: { kind: 'unresolved', reason: 'group-cold-load' },
    },
    {
      name: 'no group producer active (undefined) and no node -> city (rule 7)',
      input: { groupAreaKeys: undefined },
      expected: { kind: 'city' },
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    const scope = resolveDiscoverMarkerScope(makeInput(input));
    expect(scope).toEqual(expected);
    // The most dangerous failure mode is a silently-DISABLED query — assert
    // the resulting `enabled` boolean alongside the scope on every case.
    expect(enabledFor(scope)).toBe(expected.kind !== 'unresolved');
  });
});

describe('resolveDiscoverMarkerScope — rule 2: school-first + school + a node ALSO present (Issue #2185 S2 requirement 4)', () => {
  it('a canonical node present in the URL AND a school selected still resolves to city — no nodeKey and no areaKeys reach the request', () => {
    const scope = resolveDiscoverMarkerScope(
      makeInput({
        journey: 'school-first',
        schoolId: 'school-42',
        rawNodeParam: 'n:cluster-9',
        resolvedNodeKey: 'n:cluster-9',
        groupAreaKeys: ['IN|KA|Udupi|Manipal'],
      }),
    );
    expect(scope).toEqual({ kind: 'city' });
    expect(scope).not.toHaveProperty('nodeKey');
    expect(scope).not.toHaveProperty('areaKeys');
  });
});

describe('resolveDiscoverMarkerScope — rule 1: preview mode ignores journey, applies node-then-group precedence (#2202/#2215)', () => {
  it('preview mode ignores journey state, and a resolved node wins over a resolved legacy group', () => {
    const scope = resolveDiscoverMarkerScope(
      makeInput({
        sourceMode: 'preview',
        journey: 'area-first',
        rawNodeParam: 'n:area-1',
        resolvedNodeKey: 'n:area-1',
        groupAreaKeys: ['IN|KA|Udupi|Manipal'],
      }),
    );
    expect(scope).toEqual({ kind: 'node', nodeKey: 'n:area-1' });
  });

  it('preview mode with a resolved node and no legacy group -> node scope (preview now has a node wire representation, #2202/#2215)', () => {
    const scope = resolveDiscoverMarkerScope(
      makeInput({
        sourceMode: 'preview',
        journey: 'area-first',
        rawNodeParam: 'n:area-1',
        resolvedNodeKey: 'n:area-1',
        groupAreaKeys: undefined,
      }),
    );
    expect(scope).toEqual({ kind: 'node', nodeKey: 'n:area-1' });
  });
});

describe('resolveDiscoverMarkerScope — preview + legacy group precedence (Issue #2185/#2192 required coverage)', () => {
  it('preview mode + non-empty groupAreaKeys -> resolves to areas scope with those exact keys, not city', () => {
    const scope = resolveDiscoverMarkerScope(
      makeInput({
        sourceMode: 'preview',
        groupAreaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Karkala'],
      }),
    );
    expect(scope).toEqual({
      kind: 'areas',
      areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Karkala'],
    });
  });

  it('preview mode + empty/unresolved groupAreaKeys -> resolves to the unresolved/group-cold-load state, not city', () => {
    const scope = resolveDiscoverMarkerScope(
      makeInput({
        sourceMode: 'preview',
        groupAreaKeys: [],
      }),
    );
    expect(scope).toEqual({ kind: 'unresolved', reason: 'group-cold-load' });
  });
});

describe('resolveDiscoverMarkerScope — rule 3 / AC6: agri-first byte-identical to pre-#2185 behaviour', () => {
  it('agri-first -> city with no nodeKey/areaKeys, even with a resolved node and a legacy group both present', () => {
    const scope = resolveDiscoverMarkerScope(
      makeInput({
        journey: 'agri-first',
        rawNodeParam: 'n:area-1',
        resolvedNodeKey: 'n:area-1',
        groupAreaKeys: ['IN|KA|Udupi|Manipal'],
      }),
    );
    expect(scope).toEqual({ kind: 'city' });
  });
});

describe('resolveDiscoverMarkerScope — precedence: never a node scope AND an areas scope simultaneously', () => {
  it('a legacy groupId (resolved) + a CLUSTER-node state (also resolved) resolves to exactly ONE scope — the node scope wins (rule 5 before rule 6)', () => {
    const scope = resolveDiscoverMarkerScope(
      makeInput({
        resolvedNodeKey: 'n:cluster-1',
        groupAreaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Karkala'],
      }),
    );
    expect(scope).toEqual({ kind: 'node', nodeKey: 'n:cluster-1' });
    // Never both a nodeKey and an areaKeys field on the same resolved scope.
    expect(scope).not.toHaveProperty('areaKeys');
  });
});

describe('resolveDiscoverMarkerScope — rule 4 transition: unresolved -> node, enabled flips true', () => {
  it('while resolving: unresolved/node-resolving, enabled=false', () => {
    const scope = resolveDiscoverMarkerScope(
      makeInput({ rawNodeParam: 'n:area-1', resolvedNodeKey: null }),
    );
    expect(scope).toEqual({ kind: 'unresolved', reason: 'node-resolving' });
    expect(enabledFor(scope)).toBe(false);
  });

  it('once resolvedNode arrives: node scope, enabled=true', () => {
    const scope = resolveDiscoverMarkerScope(
      makeInput({ rawNodeParam: 'n:area-1', resolvedNodeKey: 'n:area-1' }),
    );
    expect(scope).toEqual({ kind: 'node', nodeKey: 'n:area-1' });
    expect(enabledFor(scope)).toBe(true);
  });
});

describe('resolveDiscoverMarkerScope — is pure', () => {
  it('does not mutate the input groupAreaKeys array', () => {
    const groupAreaKeys = ['IN|KA|Udupi|Manipal'];
    const input = makeInput({ groupAreaKeys });
    resolveDiscoverMarkerScope(input);
    expect(groupAreaKeys).toEqual(['IN|KA|Udupi|Manipal']);
  });

  it('never throws on any input combination in the table above', () => {
    expect(() => resolveDiscoverMarkerScope(makeInput())).not.toThrow();
  });
});
