/**
 * Issue #1955 (Areas PR A) — Zod schemas for the admin navigation hierarchy
 * contract (tree / diff / overrides). Valid + invalid payloads per schema.
 *
 * Code-review cycle 1 fix: rewritten against the SHIPPED backend DTOs
 * (NavigationPreviewTreeResponse, NavigationTreeDiffResponse,
 * AdminNavigationOverrideResponse) rather than an earlier, unverified guess
 * at their shape.
 */
import { describe, it, expect } from 'vitest';
import {
  navigationTreeResponseSchema,
  navigationDiffResponseSchema,
  navigationOverrideInputSchema,
  navigationOverridesResponseSchema,
  validationReportSchema,
} from '../navigationHierarchy';

const VALID_TREE = {
  revisionId: 42,
  validationStatus: 'VALID',
  validationErrors: [],
  nodes: [
    {
      nodeKey: 'c:north:manipal',
      nodeType: 'CLUSTER',
      parentNodeKey: null,
      regionKey: 'north',
      areaKey: null,
      displayLabel: 'North',
      depth: 0,
      ancestorKeys: [],
      representativeAreaKeys: ['manipal'],
      displayOrder: 0,
      descendantAreaCount: 1,
      bounds: { centreLat: 13.35, centreLon: 74.79, minLat: 13.3, minLon: 74.7, maxLat: 13.4, maxLon: 74.8 },
    },
    {
      nodeKey: 'a:manipal',
      nodeType: 'AREA',
      parentNodeKey: 'c:north:manipal',
      regionKey: 'north',
      areaKey: 'manipal',
      displayLabel: 'Manipal',
      depth: 1,
      ancestorKeys: ['c:north:manipal'],
      representativeAreaKeys: [],
      displayOrder: 0,
      descendantAreaCount: 0,
      bounds: { centreLat: 13.35, centreLon: 74.79, minLat: 13.34, minLon: 74.78, maxLat: 13.36, maxLon: 74.8 },
    },
  ],
};

describe('navigationTreeResponseSchema', () => {
  it('parses a valid flat node list', () => {
    const result = navigationTreeResponseSchema.safeParse(VALID_TREE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodes).toHaveLength(2);
      expect(result.data.nodes[1].parentNodeKey).toBe('c:north:manipal');
    }
  });

  it('rejects a node missing a required field', () => {
    const invalid = {
      ...VALID_TREE,
      nodes: [{ ...VALID_TREE.nodes[0], displayLabel: undefined }],
    };
    expect(navigationTreeResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects an unknown nodeType', () => {
    const invalid = { ...VALID_TREE, nodes: [{ ...VALID_TREE.nodes[0], nodeType: 'REGION' }] };
    expect(navigationTreeResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a negative depth', () => {
    const invalid = { ...VALID_TREE, nodes: [{ ...VALID_TREE.nodes[0], depth: -1 }] };
    expect(navigationTreeResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a node missing bounds', () => {
    const { bounds: _drop, ...nodeWithoutBounds } = VALID_TREE.nodes[0];
    const invalid = { ...VALID_TREE, nodes: [nodeWithoutBounds] };
    expect(navigationTreeResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a node whose bounds is missing a required field', () => {
    const invalid = {
      ...VALID_TREE,
      nodes: [{ ...VALID_TREE.nodes[0], bounds: { ...VALID_TREE.nodes[0].bounds, maxLon: undefined } }],
    };
    expect(navigationTreeResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects the old nested {cityId, root} shape', () => {
    const legacyShape = {
      revisionId: 42,
      cityId: 7,
      root: { nodeKey: 'city', type: 'CLUSTER', children: [] },
    };
    expect(navigationTreeResponseSchema.safeParse(legacyShape).success).toBe(false);
  });
});

const VALID_DIFF = {
  revisionId: 42,
  against: 'BASE',
  overridesFingerprint: 'abc123',
  added: ['a:x'],
  removed: [],
  moved: [{ nodeKey: 'a:y', fromParentNodeKey: 'region:north', toParentNodeKey: 'region:south' }],
  relabeled: [{ nodeKey: 'a:z', fromLabel: 'Old', toLabel: 'New' }],
  representativeChanges: [
    { nodeKey: 'region:north', fromRepresentativeAreaKeys: ['a'], toRepresentativeAreaKeys: ['b', 'c'] },
  ],
};

describe('navigationDiffResponseSchema', () => {
  it('parses a valid structural diff with string added/removed', () => {
    const result = navigationDiffResponseSchema.safeParse(VALID_DIFF);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.added).toEqual(['a:x']);
    }
  });

  it('parses a diff with a null overridesFingerprint (zero-override revision)', () => {
    const result = navigationDiffResponseSchema.safeParse({ ...VALID_DIFF, overridesFingerprint: null });
    expect(result.success).toBe(true);
  });

  it('rejects the old object-shaped added/removed entries', () => {
    const invalid = {
      ...VALID_DIFF,
      added: [{ nodeKey: 'a:x', type: 'AREA', label: 'X', depth: 2, parentNodeKey: 'region:north' }],
    };
    expect(navigationDiffResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects an invalid `against` value', () => {
    const invalid = { ...VALID_DIFF, against: 'SOMETHING_ELSE' };
    expect(navigationDiffResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a diff missing overridesFingerprint entirely', () => {
    const { overridesFingerprint: _drop, ...invalid } = VALID_DIFF;
    expect(navigationDiffResponseSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('navigationOverrideInputSchema (discriminated union)', () => {
  it('accepts a valid EXCLUDE_AREA payload', () => {
    const result = navigationOverrideInputSchema.safeParse({
      kind: 'EXCLUDE_AREA',
      subjectAreaKey: 'IN|KA|Udupi|Manipal',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid SET_REPRESENTATIVES payload with a reason', () => {
    const result = navigationOverrideInputSchema.safeParse({
      kind: 'SET_REPRESENTATIVES',
      subjectNodeKey: 'region:north',
      newRepresentativeAreaKeys: ['a', 'b'],
      reason: 'better spread',
    });
    expect(result.success).toBe(true);
  });

  it('rejects EXCLUDE_AREA missing subjectAreaKey', () => {
    const result = navigationOverrideInputSchema.safeParse({ kind: 'EXCLUDE_AREA' });
    expect(result.success).toBe(false);
  });

  it('rejects RELABEL with an empty newLabel', () => {
    const result = navigationOverrideInputSchema.safeParse({
      kind: 'RELABEL',
      subjectNodeKey: 'region:north',
      newLabel: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    const result = navigationOverrideInputSchema.safeParse({ kind: 'DELETE_EVERYTHING', subjectAreaKey: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects a MOVE_AREA payload carrying REASSIGN_AREA_REGION fields instead of targetNodeKey', () => {
    const result = navigationOverrideInputSchema.safeParse({
      kind: 'MOVE_AREA',
      subjectAreaKey: 'x',
      targetRegionKey: 'region:south',
    });
    expect(result.success).toBe(false);
  });
});

describe('navigationOverridesResponseSchema', () => {
  it('parses a BARE array of applied overrides across different kinds, using `id`', () => {
    const result = navigationOverridesResponseSchema.safeParse([
      { kind: 'EXCLUDE_AREA', id: 1, applyOrder: 0, subjectAreaKey: 'x', reason: null },
      {
        kind: 'RELABEL',
        id: 2,
        applyOrder: 1,
        subjectNodeKey: 'region:north',
        newLabel: 'Greater North',
        reason: 'clarity',
      },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe(1);
    }
  });

  it('rejects the old {revisionId, overrides:[...]} wrapper shape', () => {
    const result = navigationOverridesResponseSchema.safeParse({
      revisionId: 42,
      overrides: [{ kind: 'EXCLUDE_AREA', overrideId: 1, subjectAreaKey: 'x', appliedAt: '2026-07-01T00:00:00Z' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an override record missing `id`', () => {
    const result = navigationOverridesResponseSchema.safeParse([
      { kind: 'EXCLUDE_AREA', applyOrder: 0, subjectAreaKey: 'x' },
    ]);
    expect(result.success).toBe(false);
  });

  it('tolerates the backend sending other kinds’ irrelevant fields as null alongside the record', () => {
    const result = navigationOverridesResponseSchema.safeParse([
      {
        kind: 'EXCLUDE_AREA',
        id: 1,
        applyOrder: 0,
        subjectAreaKey: 'x',
        subjectNodeKey: null,
        targetRegionKey: null,
        targetNodeKey: null,
        newLabel: null,
        newRepresentativeAreaKeys: null,
        reason: null,
        createdBy: 'a0000000-0000-0000-0000-000000000000',
      },
    ]);
    expect(result.success).toBe(true);
  });
});

describe('validationReportSchema', () => {
  it('parses a report with an `issues` array', () => {
    const result = validationReportSchema.safeParse({ issues: [{ message: 'Area not found' }] });
    expect(result.success).toBe(true);
  });

  it('parses a report with an `errors` array and passthrough fields', () => {
    const result = validationReportSchema.safeParse({
      errors: [{ code: 'AREA_NOT_FOUND', message: 'nope', nodeKey: 'area:x' }],
      valid: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an issue missing message', () => {
    const result = validationReportSchema.safeParse({ issues: [{ code: 'X' }] });
    expect(result.success).toBe(false);
  });
});
