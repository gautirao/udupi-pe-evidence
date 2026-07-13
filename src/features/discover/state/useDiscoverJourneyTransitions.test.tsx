import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDiscoverJourneyTransitions, type UseDiscoverJourneyTransitionsParams } from './useDiscoverJourneyTransitions';
import type { DiscoverUrlActions, DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { ApiError } from '@/lib/api';

// DiscoverUrlActions has a large surface; the hook only reads a handful of writers.
// Cast a minimal fixture (unavoidable — noted per CLAUDE.md), consistent with the
// S5 useMarkerSelection.test.tsx precedent.
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

function makeSchool(overrides: Partial<SchoolResult> = {}): SchoolResult {
  return {
    id: 'sch-1',
    name: 'Test School',
    board: 'CBSE',
    boardType: null,
    latitude: 13.35,
    longitude: 74.79,
    address: 'Manipal',
    distanceKm: 1,
    ...overrides,
  };
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

describe('useDiscoverJourneyTransitions', () => {
  it('(i) initial ticks/flags are at their documented initial values', () => {
    const { result } = renderHook(() => useDiscoverJourneyTransitions(makeParams()));

    expect(result.current.view.startOverTick).toBe(0);
    expect(result.current.view.areaRestoreTick).toBe(0);
    expect(result.current.view.cityRestoreTick).toBe(0);
    expect(result.current.view.composedResetMapTick).toBe(0);
    expect(result.current.view.boundedSearchTriggered).toBe(false);
    expect(result.current.view.schoolFirstOnBack).toBeUndefined();
  });

  it('(ii) startOver: bumps startOverTick, clears selection/filters, setPanToArea(null), and does NOT move areaRestoreTick/cityRestoreTick', () => {
    const startOver = vi.fn();
    const setSelectedSchool = vi.fn();
    const setSelectedArea = vi.fn();
    const setPanToArea = vi.fn();
    const setFilters = vi.fn();
    const setSchoolBoardFilter = vi.fn();
    const setBoundedSearchTriggered = vi.fn();
    const params = makeParams({
      urlActions: makeUrlActions({ startOver }),
      setSelectedSchool,
      setSelectedArea,
      setPanToArea,
      setFilters,
      setSchoolBoardFilter,
      setBoundedSearchTriggered,
    });
    const { result } = renderHook(() => useDiscoverJourneyTransitions(params));

    act(() => {
      result.current.commands.startOver();
    });

    expect(startOver).toHaveBeenCalledTimes(1);
    expect(setSelectedSchool).toHaveBeenCalledWith(null);
    expect(setSelectedArea).toHaveBeenCalledWith(null);
    expect(setPanToArea).toHaveBeenCalledWith(null);
    expect(setFilters).toHaveBeenCalledWith({});
    expect(setSchoolBoardFilter).toHaveBeenCalledWith([]);
    expect(setBoundedSearchTriggered).toHaveBeenCalledWith(false);
    expect(result.current.view.startOverTick).toBe(1);
    // Neither restore tick moves from Start Over.
    expect(result.current.view.areaRestoreTick).toBe(0);
    expect(result.current.view.cityRestoreTick).toBe(0);
  });

  it('(iii) backLevel2 with urlState.areaKey != null: areaRestoreTick increments, cityRestoreTick does NOT, school selection cleared', () => {
    const clearSchoolSelection = vi.fn();
    const setSelectedSchool = vi.fn();
    const params = makeParams({
      urlState: makeUrlState({ areaKey: 'IN|KA|Udupi|Manipal', journey: 'school-first' }),
      urlActions: makeUrlActions({ clearSchoolSelection }),
      setSelectedSchool,
    });
    const { result } = renderHook(() => useDiscoverJourneyTransitions(params));

    act(() => {
      result.current.commands.backLevel2();
    });

    expect(result.current.view.areaRestoreTick).toBe(1);
    expect(result.current.view.cityRestoreTick).toBe(0);
    expect(clearSchoolSelection).toHaveBeenCalledTimes(1);
    expect(setSelectedSchool).toHaveBeenCalledWith(null);
  });

  it('(iv) backLevel2 with urlState.areaKey == null: cityRestoreTick increments, areaRestoreTick does NOT (Bug-B branch)', () => {
    const params = makeParams({
      urlState: makeUrlState({ areaKey: null, journey: 'school-first' }),
    });
    const { result } = renderHook(() => useDiscoverJourneyTransitions(params));

    act(() => {
      result.current.commands.backLevel2();
    });

    expect(result.current.view.cityRestoreTick).toBe(1);
    expect(result.current.view.areaRestoreTick).toBe(0);
  });

  it('(v) backLevel1: cityRestoreTick increments + setPanToArea(null) + area cleared', () => {
    const clearAreaSelection = vi.fn();
    const setSelectedArea = vi.fn();
    const setPanToArea = vi.fn();
    const params = makeParams({
      urlActions: makeUrlActions({ clearAreaSelection }),
      setSelectedArea,
      setPanToArea,
    });
    const { result } = renderHook(() => useDiscoverJourneyTransitions(params));

    act(() => {
      result.current.commands.backLevel1();
    });

    expect(result.current.view.cityRestoreTick).toBe(1);
    expect(result.current.view.areaRestoreTick).toBe(0);
    expect(clearAreaSelection).toHaveBeenCalledTimes(1);
    expect(setSelectedArea).toHaveBeenCalledWith(null);
    expect(setPanToArea).toHaveBeenCalledWith(null);
  });

  it('(vi) backLevel0: cityRestoreTick increments + selectGroup(null)', () => {
    const selectGroup = vi.fn();
    const params = makeParams({ urlActions: makeUrlActions({ selectGroup }) });
    const { result } = renderHook(() => useDiscoverJourneyTransitions(params));

    act(() => {
      result.current.commands.backLevel0();
    });

    expect(result.current.view.cityRestoreTick).toBe(1);
    expect(selectGroup).toHaveBeenCalledWith(null);
  });

  it('(vii) composedResetMapTick === resetMapTick + startOverTick (additive)', () => {
    const params = makeParams({ resetMapTick: 5 });
    const { result } = renderHook(() => useDiscoverJourneyTransitions(params));

    expect(result.current.view.composedResetMapTick).toBe(5);

    act(() => {
      result.current.commands.startOver();
    });

    expect(result.current.view.startOverTick).toBe(1);
    expect(result.current.view.composedResetMapTick).toBe(6);
  });

  describe('(viii) schoolById restore/error effect', () => {
    it('500 ApiError clears schoolId and shows a destructive toast', () => {
      const setSchoolParams = vi.fn();
      const toast = vi.fn();
      const params = makeParams({
        urlState: makeUrlState({ schoolId: 'sch-1' }),
        urlActions: makeUrlActions({ setSchoolParams }),
        schoolByIdError: new ApiError('server error', 500, null),
        toast,
      });
      renderHook(() => useDiscoverJourneyTransitions(params));

      expect(setSchoolParams).toHaveBeenCalledWith(null);
      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });

    it('TypeError (network failure) clears schoolId and shows a destructive toast', () => {
      const setSchoolParams = vi.fn();
      const toast = vi.fn();
      const params = makeParams({
        urlState: makeUrlState({ schoolId: 'sch-1' }),
        urlActions: makeUrlActions({ setSchoolParams }),
        schoolByIdError: new TypeError('Failed to fetch'),
        toast,
      });
      renderHook(() => useDiscoverJourneyTransitions(params));

      expect(setSchoolParams).toHaveBeenCalledWith(null);
      expect(toast).toHaveBeenCalledTimes(1);
    });

    it('404 ApiError clears schoolId WITHOUT a toast', () => {
      const setSchoolParams = vi.fn();
      const toast = vi.fn();
      const params = makeParams({
        urlState: makeUrlState({ schoolId: 'sch-1' }),
        urlActions: makeUrlActions({ setSchoolParams }),
        schoolByIdError: new ApiError('not found', 404, null),
        toast,
      });
      renderHook(() => useDiscoverJourneyTransitions(params));

      expect(setSchoolParams).toHaveBeenCalledWith(null);
      expect(toast).not.toHaveBeenCalled();
    });

    it('success (schoolById resolved, no error): no clear, no toast, selectedSchool set from schoolById', () => {
      const setSchoolParams = vi.fn();
      const toast = vi.fn();
      const setSelectedSchool = vi.fn();
      const setFilters = vi.fn();
      const school = makeSchool();
      const params = makeParams({
        urlState: makeUrlState({ schoolId: 'sch-1', radiusKm: 3 }),
        urlActions: makeUrlActions({ setSchoolParams }),
        schoolById: school,
        schoolByIdError: null,
        selectedSchool: null,
        filters: {} as PropertyFilters,
        setSelectedSchool,
        setFilters,
        toast,
      });
      renderHook(() => useDiscoverJourneyTransitions(params));

      expect(setSchoolParams).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
      expect(setSelectedSchool).toHaveBeenCalledWith(school);
      expect(setFilters).toHaveBeenCalled();
    });

    it('absent (no schoolId): no clear, no toast, no-op', () => {
      const setSchoolParams = vi.fn();
      const toast = vi.fn();
      const setSelectedSchool = vi.fn();
      const params = makeParams({
        urlState: makeUrlState({ schoolId: null }),
        urlActions: makeUrlActions({ setSchoolParams }),
        schoolById: undefined,
        schoolByIdError: null,
        setSelectedSchool,
        toast,
      });
      renderHook(() => useDiscoverJourneyTransitions(params));

      expect(setSchoolParams).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalled();
      expect(setSelectedSchool).not.toHaveBeenCalled();
    });
  });

  describe('(ix) deferred areaKey hydration', () => {
    it('fresh non-bare viewport: match found -> setSelectedArea + setPanToArea fires', () => {
      const area = makeArea();
      const setSelectedArea = vi.fn();
      const setPanToArea = vi.fn();
      const params = makeParams({
        discoverAreas: [area],
        areasLoading: false,
        pendingAreaKeyRef: { current: area.areaKey },
        initialViewportRef: { current: { lat: 1, lon: 1, zoom: 10 } },
        initialViewportWasBareAreaRef: { current: false },
        setSelectedArea,
        setPanToArea,
      });
      renderHook(() => useDiscoverJourneyTransitions(params));

      expect(setSelectedArea).toHaveBeenCalledWith(area);
      expect(setPanToArea).toHaveBeenCalledWith(area);
      // One-shot: pendingAreaKeyRef is consumed.
      expect(params.pendingAreaKeyRef.current).toBeNull();
    });

    it('bare area-only prior viewport (#1821 AC2): match found -> setSelectedArea fires but setPanToArea is NOT overridden', () => {
      const area = makeArea();
      const setSelectedArea = vi.fn();
      const setPanToArea = vi.fn();
      const params = makeParams({
        discoverAreas: [area],
        areasLoading: false,
        pendingAreaKeyRef: { current: area.areaKey },
        initialViewportRef: { current: { lat: 1, lon: 1, zoom: 10 } },
        initialViewportWasBareAreaRef: { current: true },
        setSelectedArea,
        setPanToArea,
      });
      renderHook(() => useDiscoverJourneyTransitions(params));

      expect(setSelectedArea).toHaveBeenCalledWith(area);
      expect(setPanToArea).not.toHaveBeenCalled();
    });

    it('areasLoading: effect is a no-op (pending key preserved)', () => {
      const area = makeArea();
      const setSelectedArea = vi.fn();
      const params = makeParams({
        discoverAreas: [area],
        areasLoading: true,
        pendingAreaKeyRef: { current: area.areaKey },
        setSelectedArea,
      });
      renderHook(() => useDiscoverJourneyTransitions(params));

      expect(setSelectedArea).not.toHaveBeenCalled();
      expect(params.pendingAreaKeyRef.current).toBe(area.areaKey);
    });

    it('no match + city already synced: deselectArea fires', () => {
      const deselectArea = vi.fn();
      const params = makeParams({
        urlActions: makeUrlActions({ deselectArea }),
        urlState: makeUrlState({ city: 'udupi' }),
        city: 'udupi',
        discoverAreas: [],
        areasLoading: false,
        pendingAreaKeyRef: { current: 'IN|KA|Udupi|Nowhere' },
      });
      renderHook(() => useDiscoverJourneyTransitions(params));

      expect(deselectArea).toHaveBeenCalledTimes(1);
    });
  });

  it('selectSchoolById: resolved school sets selectedSchool + filters synchronously and resets boundedSearchTriggered', () => {
    const setSelectedSchool = vi.fn();
    const setFilters = vi.fn();
    const setSchoolParams = vi.fn();
    const setBoundedSearchTriggered = vi.fn();
    const school = makeSchool({ id: 'sch-42' });
    const params = makeParams({
      urlState: makeUrlState({ journey: 'school-first', schoolId: null }),
      urlActions: makeUrlActions({ setSchoolParams }),
      schools: [school],
      setSelectedSchool,
      setFilters,
      setBoundedSearchTriggered,
    });
    const { result } = renderHook(() => useDiscoverJourneyTransitions(params));

    act(() => {
      result.current.commands.selectSchoolById('sch-42');
    });

    expect(setSchoolParams).toHaveBeenCalledWith({ schoolId: 'sch-42', radiusKm: expect.any(Number) });
    expect(setSelectedSchool).toHaveBeenCalledWith(school);
    expect(setBoundedSearchTriggered).toHaveBeenCalledWith(false);
  });

  it('clearSchool / clearArea route through urlActions.clearSchoolContext / clearAreaContext', () => {
    const clearSchoolContext = vi.fn();
    const clearAreaContext = vi.fn();
    const params = makeParams({
      urlActions: makeUrlActions({ clearSchoolContext, clearAreaContext }),
    });
    const { result } = renderHook(() => useDiscoverJourneyTransitions(params));

    act(() => {
      result.current.commands.clearSchool();
    });
    expect(clearSchoolContext).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.commands.clearArea();
    });
    expect(clearAreaContext).toHaveBeenCalledTimes(1);
  });

  it('resetBoundedSearch: defaults to false, accepts true for the CTA arm path', () => {
    const setBoundedSearchTriggered = vi.fn();
    const params = makeParams({ setBoundedSearchTriggered });
    const { result } = renderHook(() => useDiscoverJourneyTransitions(params));

    act(() => {
      result.current.commands.resetBoundedSearch();
    });
    expect(setBoundedSearchTriggered).toHaveBeenLastCalledWith(false);

    act(() => {
      result.current.commands.resetBoundedSearch(true);
    });
    expect(setBoundedSearchTriggered).toHaveBeenLastCalledWith(true);
  });

  it('wrappedSchoolSelect: resets boundedSearchTriggered then delegates to the injected handleSchoolSelect', () => {
    const setBoundedSearchTriggered = vi.fn();
    const handleSchoolSelect = vi.fn();
    const school = makeSchool();
    const params = makeParams({ setBoundedSearchTriggered, handleSchoolSelect });
    const { result } = renderHook(() => useDiscoverJourneyTransitions(params));

    act(() => {
      result.current.commands.wrappedSchoolSelect(school);
    });

    expect(setBoundedSearchTriggered).toHaveBeenCalledWith(false);
    expect(handleSchoolSelect).toHaveBeenCalledWith(school);
  });

  describe('schoolFirstOnBack derivation', () => {
    it('undefined when journey !== school-first', () => {
      const params = makeParams({ urlState: makeUrlState({ journey: 'area-first' }), panelContent: 'school-selected' });
      const { result } = renderHook(() => useDiscoverJourneyTransitions(params));
      expect(result.current.view.schoolFirstOnBack).toBeUndefined();
    });

    it('resolves to backLevel2 for school-selected / area-school-combined', () => {
      const params = makeParams({ urlState: makeUrlState({ journey: 'school-first' }), panelContent: 'school-selected' });
      const { result } = renderHook(() => useDiscoverJourneyTransitions(params));
      expect(result.current.view.schoolFirstOnBack).toBeDefined();

      act(() => {
        result.current.view.schoolFirstOnBack?.();
      });
      // backLevel2 with areaKey null increments cityRestoreTick (Bug-B branch).
      expect(result.current.view.cityRestoreTick).toBe(1);
    });

    it('undefined at school-browse (Level 0)', () => {
      const params = makeParams({ urlState: makeUrlState({ journey: 'school-first' }), panelContent: 'school-browse' });
      const { result } = renderHook(() => useDiscoverJourneyTransitions(params));
      expect(result.current.view.schoolFirstOnBack).toBeUndefined();
    });
  });
});
