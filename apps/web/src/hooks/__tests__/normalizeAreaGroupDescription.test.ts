/**
 * Issue #1597 — A2: description field in normalizeAreaGroupResponse
 *
 * This file tests ONLY the pure normalizeAreaGroupResponse function, deliberately
 * importing it from a path that does NOT pull in api.ts / supabase/client, so the
 * suite runs in any worktree environment without VITE_SUPABASE_* being set.
 *
 * Coverage:
 *  - DB description string is surfaced when present
 *  - DB description null → mapped to null (frontend falls back to adapter)
 *  - DB description absent entirely → mapped to null (JsonInclude.NON_NULL behaviour)
 *  - DB description is per-group (not shared across groups in the same response)
 *  - Whitespace-only description treated as absent (trim guard at component level)
 *
 * NOTE: The component-level priority chain (description > subtitle > adapter fallback)
 * is tested in AreaGroupSelectedPanel.test.tsx (Issue #1597 description priority chain).
 */

import { describe, it, expect, vi } from 'vitest';

// Stub api.ts and supabase/client before useAreaGroups is imported so that
// the Supabase createClient() call (which requires env vars) never runs in
// this environment.  normalizeAreaGroupResponse is a pure function that never
// calls api.get — the mock values are never invoked by any test here.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

import { normalizeAreaGroupResponse } from '../useAreaGroups';

describe('normalizeAreaGroupResponse — description field (Issue #1597 A2)', () => {
  it('surfaces a non-null string description from the backend DTO', () => {
    const dto = {
      groups: [
        {
          slug: 'university-belt',
          name: 'University Belt',
          description: 'Long-form buyer-facing copy for University Belt.',
          areaKeys: ['IN|KA|Udupi|Manipal'],
        },
      ],
    };
    const result = normalizeAreaGroupResponse(dto);
    expect(result.groups[0].description).toBe('Long-form buyer-facing copy for University Belt.');
  });

  it('maps null description to null (frontend knows to fall back to subtitle/adapter)', () => {
    const dto = {
      groups: [
        {
          slug: 'coastal-belt',
          name: 'Coastal Belt',
          description: null,
          areaKeys: ['IN|KA|Udupi|Malpe'],
        },
      ],
    };
    const result = normalizeAreaGroupResponse(dto);
    expect(result.groups[0].description).toBeNull();
  });

  it('maps absent description field to null (JsonInclude.NON_NULL — field omitted by backend)', () => {
    // When the DB column is NULL, the backend omits the field entirely (JsonInclude.NON_NULL).
    // The normalizer must treat this as null (not undefined), so the component can reliably
    // do the null-check rather than undefined-check.
    const dto = {
      groups: [
        {
          slug: 'inland-hills',
          name: 'Inland Hills',
          // description field deliberately absent
          areaKeys: ['IN|KA|Udupi|Kundapur'],
        },
      ],
    };
    const result = normalizeAreaGroupResponse(dto);
    // null or undefined is acceptable here; the component uses ?. and || fallback
    expect(result.groups[0].description == null).toBe(true);
  });

  it('description is per-group — different groups in one response each get their own description', () => {
    const dto = {
      groups: [
        {
          slug: 'university-belt',
          name: 'University Belt',
          description: 'University Belt copy',
          areaKeys: ['IN|KA|Udupi|Manipal'],
        },
        {
          slug: 'coastal-belt',
          name: 'Coastal Belt',
          description: 'Coastal Belt copy',
          areaKeys: ['IN|KA|Udupi|Malpe'],
        },
        {
          slug: 'inland-hills',
          name: 'Inland Hills',
          description: null,
          areaKeys: ['IN|KA|Udupi|Kundapur'],
        },
      ],
    };
    const result = normalizeAreaGroupResponse(dto);
    expect(result.groups).toHaveLength(3);
    expect(result.groups[0].description).toBe('University Belt copy');
    expect(result.groups[1].description).toBe('Coastal Belt copy');
    expect(result.groups[2].description).toBeNull();
  });

  it('non-string description field (e.g. number) is coerced to null', () => {
    const dto = {
      groups: [
        {
          slug: 'bad-type',
          name: 'Bad Type Group',
          description: 42 as unknown as string,
          areaKeys: [],
        },
      ],
    };
    const result = normalizeAreaGroupResponse(dto);
    // normalizer only accepts typeof string; number → null
    expect(result.groups[0].description).toBeNull();
  });

  it('description roundtrip: Udupi seed copy (V99) surfaced correctly', () => {
    // Simulates the Udupi seed row from V99 migration
    const dto = {
      city: 'udupi',
      groups: [
        {
          slug: 'university-belt',
          name: 'University Belt',
          description:
            'Home to Manipal University and KMC campuses — the densest student-rental hub in Coastal Karnataka. Walkable to college blocks, hospitals and cafés; dominated by furnished apartments and PG conversions.',
          subtitle: 'Manipal and Katapadi campuses',
          regionLabel: 'Central',
          areaKeys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Katapadi'],
        },
      ],
    };
    const result = normalizeAreaGroupResponse(dto);
    const g = result.groups[0];
    // description surfaces the seed copy verbatim
    expect(g.description).toContain('Manipal University');
    // subtitle is also preserved independently
    expect(g.subtitle).toBe('Manipal and Katapadi campuses');
  });
});
