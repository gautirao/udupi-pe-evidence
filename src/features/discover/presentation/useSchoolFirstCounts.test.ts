import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSchoolFirstCounts, type UseSchoolFirstCountsParams } from './useSchoolFirstCounts';

function makeParams(overrides: Partial<UseSchoolFirstCountsParams> = {}): UseSchoolFirstCountsParams {
  return {
    journey: 'school-first',
    groupId: null,
    selectedArea: null,
    focusedGroup: null,
    areasLoading: false,
    discoverAreas: [
      { areaKey: 'IN|KA|Udupi|Manipal', schoolCount: 3 } as UseSchoolFirstCountsParams['discoverAreas'][number],
      { areaKey: 'IN|KA|Udupi|Udupi', schoolCount: 5 } as UseSchoolFirstCountsParams['discoverAreas'][number],
    ],
    ...overrides,
  };
}

describe('useSchoolFirstCounts', () => {
  it('landing: sums schoolCount across all discoverAreas when no group/area/school selected', () => {
    const { result } = renderHook(() => useSchoolFirstCounts(makeParams()));
    expect(result.current.schoolFirstLandingSchoolCount).toBe(8);
  });

  it('landing: null while areasLoading', () => {
    const { result } = renderHook(() => useSchoolFirstCounts(makeParams({ areasLoading: true })));
    expect(result.current.schoolFirstLandingSchoolCount).toBeNull();
  });

  it('landing: null when journey is not school-first', () => {
    const { result } = renderHook(() => useSchoolFirstCounts(makeParams({ journey: 'area-first' })));
    expect(result.current.schoolFirstLandingSchoolCount).toBeNull();
  });

  it('zone: sums schoolCount across focusedGroup member areas when groupId is set', () => {
    const focusedGroup = { area_keys: ['IN|KA|Udupi|Manipal'] };
    const { result } = renderHook(() =>
      useSchoolFirstCounts(makeParams({ groupId: 'manipal-group', focusedGroup })),
    );
    expect(result.current.schoolFirstZoneSchoolCount).toBe(3);
  });

  it('zone: null when no focusedGroup resolves', () => {
    const { result } = renderHook(() =>
      useSchoolFirstCounts(makeParams({ groupId: 'manipal-group', focusedGroup: null })),
    );
    expect(result.current.schoolFirstZoneSchoolCount).toBeNull();
  });

  it('area: returns selectedArea.schoolCount when an area is selected', () => {
    const selectedArea = { schoolCount: 7 } as UseSchoolFirstCountsParams['selectedArea'];
    const { result } = renderHook(() => useSchoolFirstCounts(makeParams({ selectedArea })));
    expect(result.current.schoolFirstAreaSchoolCount).toBe(7);
  });

  it('area: null when no area is selected', () => {
    const { result } = renderHook(() => useSchoolFirstCounts(makeParams({ selectedArea: null })));
    expect(result.current.schoolFirstAreaSchoolCount).toBeNull();
  });

  it('schoolZoneLabels: always the dead empty array (Issue #1655)', () => {
    const { result } = renderHook(() => useSchoolFirstCounts(makeParams()));
    expect(result.current.schoolZoneLabels).toEqual([]);
  });

  // ── Memo-identity (AC-MEMO-IDENTITY) ──────────────────────────────────────
  it('schoolFirstLandingSchoolCount: identity-stable across a no-op rerender (primitive, but the memo itself must not re-run needlessly)', () => {
    const params = makeParams();
    const { result, rerender } = renderHook((p: UseSchoolFirstCountsParams) => useSchoolFirstCounts(p), {
      initialProps: params,
    });
    const first = result.current.schoolFirstLandingSchoolCount;
    rerender(params);
    expect(result.current.schoolFirstLandingSchoolCount).toBe(first);
  });

  it('schoolFirstLandingSchoolCount: recomputes (positive control) when discoverAreas changes', () => {
    const params = makeParams();
    const { result, rerender } = renderHook((p: UseSchoolFirstCountsParams) => useSchoolFirstCounts(p), {
      initialProps: params,
    });
    const first = result.current.schoolFirstLandingSchoolCount;
    expect(first).toBe(8);
    rerender({
      ...params,
      discoverAreas: [{ areaKey: 'IN|KA|Udupi|Manipal', schoolCount: 99 } as UseSchoolFirstCountsParams['discoverAreas'][number]],
    });
    expect(result.current.schoolFirstLandingSchoolCount).toBe(99);
    expect(result.current.schoolFirstLandingSchoolCount).not.toBe(first);
  });

  it('schoolFirstZoneSchoolCount: identity-stable across a no-op rerender', () => {
    const focusedGroup = { area_keys: ['IN|KA|Udupi|Manipal'] };
    const params = makeParams({ groupId: 'manipal-group', focusedGroup });
    const { result, rerender } = renderHook((p: UseSchoolFirstCountsParams) => useSchoolFirstCounts(p), {
      initialProps: params,
    });
    const first = result.current.schoolFirstZoneSchoolCount;
    rerender(params);
    expect(result.current.schoolFirstZoneSchoolCount).toBe(first);
  });

  it('schoolFirstZoneSchoolCount: recomputes (positive control) when focusedGroup changes', () => {
    const params = makeParams({ groupId: 'manipal-group', focusedGroup: { area_keys: ['IN|KA|Udupi|Manipal'] } });
    const { result, rerender } = renderHook((p: UseSchoolFirstCountsParams) => useSchoolFirstCounts(p), {
      initialProps: params,
    });
    const first = result.current.schoolFirstZoneSchoolCount;
    expect(first).toBe(3);
    rerender({ ...params, focusedGroup: { area_keys: ['IN|KA|Udupi|Udupi'] } });
    expect(result.current.schoolFirstZoneSchoolCount).toBe(5);
    expect(result.current.schoolFirstZoneSchoolCount).not.toBe(first);
  });

  it('schoolZoneLabels: identity-stable across a no-op rerender (dead useMemo(() => [], []))', () => {
    const params = makeParams();
    const { result, rerender } = renderHook((p: UseSchoolFirstCountsParams) => useSchoolFirstCounts(p), {
      initialProps: params,
    });
    const first = result.current.schoolZoneLabels;
    rerender(params);
    expect(result.current.schoolZoneLabels).toBe(first);
    // Positive control: even a completely different props object does not change
    // this memo's output identity, because its dep array is `[]` (verbatim from
    // the original dead code) — this is expected, not a bug.
    rerender(makeParams({ journey: 'area-first', discoverAreas: [] }));
    expect(result.current.schoolZoneLabels).toBe(first);
  });

  // ── S9b2-inverse: schoolFirstAreaSchoolCount is a PLAIN const, not memoized.
  it('schoolFirstAreaSchoolCount is a plain per-render value, not frozen useMemo output', () => {
    const selectedArea = { schoolCount: 7 } as UseSchoolFirstCountsParams['selectedArea'];
    const params = makeParams({ selectedArea });
    const { result, rerender } = renderHook((p: UseSchoolFirstCountsParams) => useSchoolFirstCounts(p), {
      initialProps: params,
    });
    const first = result.current.schoolFirstAreaSchoolCount;
    // No stability assertion is made deliberately — deriveSchoolFirstAreaSchoolCount is
    // called as a plain (non-memoized) expression on every render (verbatim from the
    // original page). A number primitive re-evaluating to the same value is expected.
    rerender(params);
    expect(result.current.schoolFirstAreaSchoolCount).toBe(first);
    expect(result.current.schoolFirstAreaSchoolCount).toBe(7);
  });
});
