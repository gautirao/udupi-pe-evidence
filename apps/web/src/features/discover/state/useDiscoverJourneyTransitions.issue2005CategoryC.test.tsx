/**
 * Issue #2005 (Slice 2 PR6) — Category C (tests-only) regression coverage for
 * useDiscoverJourneyTransitions.ts. ZERO production edits to this file — see
 * the approved plan; #1956 owns eventual dep-array consolidation.
 *
 * This file targets the ONE site with no prior coverage in the colocated
 * useDiscoverJourneyTransitions.test.tsx (which already thoroughly covers
 * schoolById restore (:494/(viii)), deferred areaKey hydration (:552/(ix)),
 * and journey-change teardown (:636)):
 *
 *   :441 — sync URL board filters into local schoolBoardFilter.
 *     "urlBoardKey alone captures the contents; setSchoolBoardFilter is
 *      stable." deps: [urlBoardKey] (= urlBoardFilters.join('|')).
 *     Assert: on urlBoardKey change, one setSchoolBoardFilter call; no
 *     spurious re-fire on an object-identity-only change (new array, same
 *     joined content).
 *
 * Also adds one canonical cross-site assertion for :552 (deferred areaKey
 * hydration) and :636 (journey-change teardown): each fires EXACTLY ONE
 * camera-adjacent state update per real navigation, and does not double-fire
 * on a re-render that changes nothing relevant — the "exactly one intent per
 * navigation" invariant the plan calls out for Category C generally.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDiscoverJourneyTransitions, type UseDiscoverJourneyTransitionsParams } from './useDiscoverJourneyTransitions';
import type { DiscoverUrlActions, DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

function makeUrlActions(overrides: Partial<DiscoverUrlActions> = {}): DiscoverUrlActions {
  return {
    startOver: vi.fn(),
    clearSchoolSelection: vi.fn(),
    clearAreaSelection: vi.fn(),
    selectGroup: vi.fn(),
    setSchoolParams: vi.fn(),
    setSchoolJourney: vi.fn(),
    clearSchoolContext: vi.fn(),
    clearAreaContext: vi.fn(),
    setBoardFilters: vi.fn(),
    deselectArea: vi.fn(),
    ...overrides,
  } as unknown as DiscoverUrlActions;
}

function makeUrlState(overrides: Partial<DiscoverUrlState> = {}): DiscoverUrlState {
  return {
    city: 'udupi',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: null,
    groupId: null,
    selectedGroup: null,
    intent: 'buy',
    ...overrides,
  } as DiscoverUrlState;
}

function makeArea(overrides: Partial<AreaPoint> = {}): AreaPoint {
  return {
    areaKey: 'IN|KA|Udupi|Manipal',
    areaLabel: 'Manipal',
    geo_center_lat: 13.35,
    geo_center_lon: 74.79,
    bbox: null,
    ...overrides,
  };
}

function makeParams(
  overrides: Partial<UseDiscoverJourneyTransitionsParams> = {},
): UseDiscoverJourneyTransitionsParams {
  return {
    urlState: makeUrlState(),
    urlActions: makeUrlActions(),
    selectedSchool: null,
    filters: {} as PropertyFilters,
    setSelectedArea: vi.fn(),
    setSelectedSchool: vi.fn(),
    setFilters: vi.fn(),
    setSchoolBoardFilter: vi.fn(),
    setPanToArea: vi.fn(),
    resetMapTick: 0,
    pendingAreaKeyRef: { current: null },
    initialViewportRef: { current: null },
    initialViewportWasBareAreaRef: { current: false },
    resolveSignal: 0,
    handleSchoolSelect: vi.fn(),
    schools: [],
    queryClient: { getQueryData: vi.fn(() => undefined) } as unknown as UseDiscoverJourneyTransitionsParams['queryClient'],
    schoolById: undefined,
    schoolByIdError: null,
    discoverAreas: [],
    areasLoading: false,
    urlBoardFilters: [],
    schoolBoardFilter: [],
    panelContent: 'guided-entry',
    city: 'udupi',
    toast: vi.fn(),
    boundedSearchTriggered: false,
    setBoundedSearchTriggered: vi.fn(),
    ...overrides,
  };
}

describe('useDiscoverJourneyTransitions.ts:441 — [urlBoardKey] trigger (Category C)', () => {
  it('syncs local schoolBoardFilter when urlBoardFilters content changes', () => {
    const setSchoolBoardFilter = vi.fn();
    const params = makeParams({
      urlBoardFilters: ['CBSE'],
      schoolBoardFilter: [],
      setSchoolBoardFilter,
    });
    const { rerender } = renderHook((p) => useDiscoverJourneyTransitions(p), {
      initialProps: params,
    });

    expect(setSchoolBoardFilter).toHaveBeenCalledTimes(1);
    expect(setSchoolBoardFilter).toHaveBeenCalledWith(['CBSE']);

    // urlBoardFilters gains ICSE — content changes (new joined key) — must sync again.
    setSchoolBoardFilter.mockClear();
    rerender({
      ...params,
      urlBoardFilters: ['CBSE', 'ICSE'],
      schoolBoardFilter: ['CBSE'], // reflects the previous sync having "landed"
    });
    expect(setSchoolBoardFilter).toHaveBeenCalledTimes(1);
    expect(setSchoolBoardFilter).toHaveBeenCalledWith(['CBSE', 'ICSE']);
  });

  it('does not re-sync when urlBoardFilters is a NEW array with the SAME joined content (object-identity-only change)', () => {
    const setSchoolBoardFilter = vi.fn();
    // schoolBoardFilter already matches urlBoardFilters' content — the guard
    // `schoolBoardFilter.join('|') !== urlBoardKey` is false, so even though
    // urlBoardKey is unchanged as a STRING, no re-sync should occur.
    const params = makeParams({
      urlBoardFilters: ['CBSE'],
      schoolBoardFilter: ['CBSE'],
      setSchoolBoardFilter,
    });
    const { rerender } = renderHook((p) => useDiscoverJourneyTransitions(p), {
      initialProps: params,
    });
    expect(setSchoolBoardFilter).not.toHaveBeenCalled();

    // A brand-new array reference with the SAME joined content ('CBSE') —
    // urlBoardKey (the trigger) is an unchanged STRING, so the effect must
    // not re-fire.
    rerender({ ...params, urlBoardFilters: ['CBSE'] });
    expect(setSchoolBoardFilter).not.toHaveBeenCalled();
  });

  it('does not sync on an unrelated re-render (urlBoardKey stable)', () => {
    const setSchoolBoardFilter = vi.fn();
    const params = makeParams({
      urlBoardFilters: [],
      schoolBoardFilter: [],
      setSchoolBoardFilter,
      city: 'udupi',
    });
    const { rerender } = renderHook((p) => useDiscoverJourneyTransitions(p), {
      initialProps: params,
    });
    expect(setSchoolBoardFilter).not.toHaveBeenCalled();

    rerender({ ...params, city: 'bangalore' });
    expect(setSchoolBoardFilter).not.toHaveBeenCalled();
  });
});

describe('useDiscoverJourneyTransitions.ts — Category C cross-site invariant: exactly one intent per navigation', () => {
  it(':552 deferred areaKey hydration fires setSelectedArea exactly once per resolveSignal advance, not on an unrelated re-render', () => {
    const setSelectedArea = vi.fn();
    const setPanToArea = vi.fn();
    const area = makeArea();
    const params = makeParams({
      discoverAreas: [area],
      areasLoading: false,
      pendingAreaKeyRef: { current: area.areaKey },
      resolveSignal: 1,
      setSelectedArea,
      setPanToArea,
    });
    const { rerender } = renderHook((p) => useDiscoverJourneyTransitions(p), {
      initialProps: params,
    });

    expect(setSelectedArea).toHaveBeenCalledTimes(1);
    expect(setSelectedArea).toHaveBeenCalledWith(area);

    // Unrelated re-render (same resolveSignal, same discoverAreas, pending
    // already consumed/null by the hook's own ref mutation) must not re-fire.
    rerender({ ...params, city: 'bangalore' });
    expect(setSelectedArea).toHaveBeenCalledTimes(1);
  });

  it(':636 journey-change teardown clears a stale school overlay exactly once on the transition, not again on a subsequent unrelated re-render', () => {
    const setSelectedSchool = vi.fn();
    const setFilters = vi.fn();
    const school = { id: 'sch-1', name: 'Test School', board: 'CBSE', boardType: null, latitude: 13.35, longitude: 74.79, address: 'Manipal', distanceKm: 1 };
    const params = makeParams({
      urlState: makeUrlState({ journey: 'area-first', schoolId: null }),
      selectedSchool: school,
      filters: { schoolLat: 13.35, schoolLon: 74.79, schoolRadiusKm: 3 } as PropertyFilters,
      setSelectedSchool,
      setFilters,
    });
    const { rerender } = renderHook((p) => useDiscoverJourneyTransitions(p), {
      initialProps: params,
    });
    // Mount is the "prev===current" baseline — the ref seeds to the initial
    // journey/schoolId, so no teardown fires purely from mounting already-clean.
    expect(setSelectedSchool).not.toHaveBeenCalled();

    // Simulate the actual transition this effect guards against: switching
    // FROM school-first TO agri-first while a school overlay is still locally
    // active (the #1940 bug scenario) — journey/schoolId both change.
    rerender({
      ...params,
      urlState: makeUrlState({ journey: 'agri-first', schoolId: null }),
    });
    expect(setSelectedSchool).toHaveBeenCalledTimes(1);
    expect(setSelectedSchool).toHaveBeenCalledWith(null);

    // Further unrelated re-render (journey/schoolId unchanged) must not re-fire.
    setSelectedSchool.mockClear();
    rerender({
      ...params,
      urlState: makeUrlState({ journey: 'agri-first', schoolId: null }),
      city: 'bangalore',
    });
    expect(setSelectedSchool).not.toHaveBeenCalled();
  });
});
