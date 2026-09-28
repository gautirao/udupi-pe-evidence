/**
 * Issue #2658 (C2) — differential coverage for useResultScopeController,
 * pinning the exact behavior extracted verbatim from AreaSelectedPanel.tsx
 * (Issues #2016, #2017, #2018 slice 3, #2478 step 1, #2480).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

let mockResultScope: { active: unknown; previous: unknown } | undefined;
let mockNavCity: string;
const mockCommitResultScope = vi.fn();
const mockSetAreaSetCameraRestoreRequest = vi.fn();

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({ city: mockNavCity, resultScope: mockResultScope }),
  useDiscoverActions: () => ({ commitResultScope: mockCommitResultScope }),
  useDiscoverShell: () => ({ setAreaSetCameraRestoreRequest: mockSetAreaSetCameraRestoreRequest }),
}));

let mockAreasData: { areas: Array<Record<string, unknown>> } | undefined;
vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: () => ({ data: mockAreasData }),
}));

import { useResultScopeController } from '../useResultScopeController';

const hebbal = {
  areaKey: 'hebbal|city|udupi',
  name: 'Hebbal',
  geoCenterLat: 13.1,
  geoCenterLon: 74.1,
  minLat: 13.0,
  minLon: 74.0,
  maxLat: 13.2,
  maxLon: 74.2,
  listingCount: 5,
};
const jakkur = {
  areaKey: 'jakkur|city|udupi',
  name: 'Jakkur',
  geoCenterLat: 13.3,
  geoCenterLon: 74.3,
  minLat: null,
  minLon: null,
  maxLat: null,
  maxLon: null,
  listingCount: 2,
};

describe('#2658 C2 — useResultScopeController', () => {
  beforeEach(() => {
    mockCommitResultScope.mockClear();
    mockSetAreaSetCameraRestoreRequest.mockClear();
    mockNavCity = 'udupi';
    mockResultScope = undefined;
    mockAreasData = { areas: [hebbal, jakkur] };
  });

  it('resultScopeKind: VIEWPORT wins over an active POLYGON scope (P2 precedence)', () => {
    mockResultScope = { active: { kind: 'POLYGON', coordinates: [] }, previous: null };
    const { result } = renderHook(() => useResultScopeController({ city: 'udupi', isViewportScope: true }));
    expect(result.current.resultScopeKind).toBe('VIEWPORT');
  });

  it('resultScopeKind: AREA by default with no active scope', () => {
    const { result } = renderHook(() => useResultScopeController({ city: 'udupi', isViewportScope: false }));
    expect(result.current.resultScopeKind).toBe('AREA');
  });

  it('multiAreaKeys: null for a single-area AREA_SET, populated for 2+', () => {
    mockResultScope = { active: { kind: 'AREA_SET', areaKeys: ['a'] }, previous: null };
    const single = renderHook(() => useResultScopeController({ city: 'udupi', isViewportScope: false }));
    expect(single.result.current.multiAreaKeys).toBeNull();

    mockResultScope = { active: { kind: 'AREA_SET', areaKeys: ['a', 'b'] }, previous: null };
    const multi = renderHook(() => useResultScopeController({ city: 'udupi', isViewportScope: false }));
    expect(multi.result.current.multiAreaKeys).toEqual(['a', 'b']);
  });

  it('previousAreas: resolves AREA_SET previous areaKeys against useDiscoverAreas, in order, dropping unresolved keys', () => {
    mockResultScope = {
      active: null,
      previous: { kind: 'AREA_SET', areaKeys: ['jakkur|city|udupi', 'missing|city|udupi', 'hebbal|city|udupi'] },
    };
    const { result } = renderHook(() => useResultScopeController({ city: 'udupi', isViewportScope: false }));
    expect(result.current.previousAreas.map((a) => a.areaKey)).toEqual([
      'jakkur|city|udupi',
      'hebbal|city|udupi',
    ]);
    // bbox null-safety: jakkur has null min/max, hebbal has a real bbox.
    expect(result.current.previousAreas[0].bbox).toBeNull();
    expect(result.current.previousAreas[1].bbox).toEqual([
      [13.0, 74.0],
      [13.2, 74.2],
    ]);
  });

  it('previousAreas: empty for a non-AREA_SET previous scope', () => {
    mockResultScope = { active: null, previous: { kind: 'POLYGON', coordinates: [] } };
    const { result } = renderHook(() => useResultScopeController({ city: 'udupi', isViewportScope: false }));
    expect(result.current.previousAreas).toEqual([]);
  });

  it('returnLabel: three shapes, delegating to resolveReturnLabel', () => {
    mockResultScope = { active: null, previous: { kind: 'AREA_SET', areaKeys: ['hebbal|city|udupi'] } };
    const single = renderHook(() => useResultScopeController({ city: 'udupi', isViewportScope: false }));
    expect(single.result.current.returnLabel).toBe('Return to Hebbal');

    mockResultScope = { active: null, previous: { kind: 'POLYGON', coordinates: [] } };
    const polygon = renderHook(() => useResultScopeController({ city: 'udupi', isViewportScope: false }));
    expect(polygon.result.current.returnLabel).toBe('Return to previous search area');

    mockResultScope = { active: null, previous: null };
    const none = renderHook(() => useResultScopeController({ city: 'udupi', isViewportScope: false }));
    expect(none.result.current.returnLabel).toBeNull();
  });

  it('commands.returnToPrevious: commits the previous scope and, for a resolved single-area AREA_SET, records a one-shot camera restore request', () => {
    mockResultScope = {
      active: { kind: 'AREA_SET', areaKeys: ['hebbal|city|udupi'] },
      previous: { kind: 'AREA_SET', areaKeys: ['jakkur|city|udupi'] },
    };
    const { result } = renderHook(() => useResultScopeController({ city: 'udupi', isViewportScope: false }));
    result.current.commands.returnToPrevious();

    expect(mockCommitResultScope).toHaveBeenCalledWith({ kind: 'AREA_SET', areaKeys: ['jakkur|city|udupi'] });
    expect(mockSetAreaSetCameraRestoreRequest).toHaveBeenCalledWith({
      areaKey: 'jakkur|city|udupi',
      bounds: null,
      center: [13.3, 74.3],
    });
  });

  it('commands.returnToPrevious: issues NO camera restore request for a multi-area (N>1) previous AREA_SET', () => {
    mockResultScope = {
      active: null,
      previous: { kind: 'AREA_SET', areaKeys: ['hebbal|city|udupi', 'jakkur|city|udupi'] },
    };
    const { result } = renderHook(() => useResultScopeController({ city: 'udupi', isViewportScope: false }));
    result.current.commands.returnToPrevious();

    expect(mockCommitResultScope).toHaveBeenCalled();
    expect(mockSetAreaSetCameraRestoreRequest).not.toHaveBeenCalled();
  });

  it('commands.returnToPrevious: issues NO camera restore request when the single previous area does not resolve', () => {
    mockResultScope = {
      active: null,
      previous: { kind: 'AREA_SET', areaKeys: ['unresolved|city|udupi'] },
    };
    const { result } = renderHook(() => useResultScopeController({ city: 'udupi', isViewportScope: false }));
    result.current.commands.returnToPrevious();

    expect(mockCommitResultScope).toHaveBeenCalledWith({ kind: 'AREA_SET', areaKeys: ['unresolved|city|udupi'] });
    expect(mockSetAreaSetCameraRestoreRequest).not.toHaveBeenCalled();
  });

  it('commands.clearAreas: commits a null result scope', () => {
    const { result } = renderHook(() => useResultScopeController({ city: 'udupi', isViewportScope: false }));
    result.current.commands.clearAreas();
    expect(mockCommitResultScope).toHaveBeenCalledWith(null);
  });
});
