import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockUseSchoolsByArea = vi.hoisted(() => vi.fn());
const mockUseDiscoverJourneyTransitions = vi.hoisted(() => vi.fn());
const mockUseSchoolListings = vi.hoisted(() => vi.fn());
const mockUseSchoolFirstCounts = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useSchoolsByArea', () => ({ useSchoolsByArea: mockUseSchoolsByArea }));
vi.mock('@/features/discover/state/useDiscoverJourneyTransitions', () => ({
  useDiscoverJourneyTransitions: mockUseDiscoverJourneyTransitions,
}));
vi.mock('@/features/discover/presentation/useSchoolListings', () => ({ useSchoolListings: mockUseSchoolListings }));
vi.mock('@/features/discover/presentation/useSchoolFirstCounts', () => ({
  useSchoolFirstCounts: mockUseSchoolFirstCounts,
}));

import { useDiscoverSchoolController } from './useDiscoverSchoolController';
import type { UseDiscoverSchoolControllerParams } from './useDiscoverSchoolController';

const SCHOOL_A = { id: 's1', board: 'CBSE', boardType: null };
const SCHOOL_B = { id: 's2', board: 'ICSE', boardType: null };

const SCHOOLS_QUERY_RESULT = { data: { pages: [{ schools: [SCHOOL_A, SCHOOL_B] }] } };
const JOURNEY_RESULT = { view: { startOverTick: 0 }, commands: {} };
const SCHOOL_LISTINGS_RESULT = { schoolListings: [], schoolRadiusFallbackMarkers: [] };
const SCHOOL_FIRST_COUNTS_RESULT = {
  schoolFirstLandingSchoolCount: null,
  schoolFirstZoneSchoolCount: null,
  schoolFirstAreaSchoolCount: null,
  schoolZoneLabels: [],
};

function baseParams(
  overrides: Partial<UseDiscoverSchoolControllerParams> = {},
): UseDiscoverSchoolControllerParams {
  return {
    urlState: { journey: null, groupId: null, schoolId: null } as never,
    urlActions: {} as never,
    selectedSchool: null,
    filters: {},
    setSelectedArea: vi.fn(),
    setSelectedSchool: vi.fn(),
    setFilters: vi.fn(),
    setSchoolBoardFilter: vi.fn(),
    setPanToArea: vi.fn(),
    resetMapTick: 0,
    pendingAreaKeyRef: { current: null },
    initialViewportRef: { current: undefined } as never,
    initialViewportWasBareAreaRef: { current: false },
    resolveSignal: 0,
    handleSchoolSelect: vi.fn(),
    queryClient: {} as never,
    schoolById: undefined,
    schoolByIdError: null,
    discoverAreas: [],
    areasLoading: false,
    nav: { journey: null, areaKey: null, schoolId: null, schoolPicking: null, filters: {} } as never,
    areasNavigationJourney: { node: null, children: [], isLoading: false, error: null, selectNode: vi.fn() } as never,
    handleAreaBack: vi.fn(),
    schoolBoardFilter: [],
    panelContent: 'guided-entry' as never,
    city: 'udupi',
    toast: vi.fn(),
    boundedSearchTriggered: false,
    setBoundedSearchTriggered: vi.fn(),
    isAuthenticated: true,
    areaListings: [],
    schoolRadiusListings: [],
    filteredListings: [],
    selectedArea: null,
    focusedGroup: null,
    ...overrides,
  };
}

describe('useDiscoverSchoolController (#2142 Commit 3 — moved verbatim from MapDiscovery.tsx, composition test)', () => {
  beforeEach(() => {
    mockUseSchoolsByArea.mockReset().mockReturnValue(SCHOOLS_QUERY_RESULT);
    mockUseDiscoverJourneyTransitions.mockReset().mockReturnValue(JOURNEY_RESULT);
    mockUseSchoolListings.mockReset().mockReturnValue(SCHOOL_LISTINGS_RESULT);
    mockUseSchoolFirstCounts.mockReset().mockReturnValue(SCHOOL_FIRST_COUNTS_RESULT);
  });

  // Issue #2142 (correction pass) — schoolsAreaKey/urlBoardFilters/categoryFilters
  // are no longer caller inputs; they are derived INSIDE the controller from
  // nav + panelContent. These assertions now drive those real derivations
  // rather than injecting their outputs, which is strictly stronger coverage.
  it('useSchoolsByArea is called with the DERIVED schoolsAreaKey/urlBoardFilters/categoryFilters and size=20', () => {
    renderHook(() =>
      useDiscoverSchoolController(
        baseParams({
          panelContent: 'schools-in-area' as never,
          nav: {
            journey: 'school-first',
            areaKey: 'IN|KA|Udupi|Manipal',
            schoolId: null,
            schoolPicking: null,
            filters: { boardFilters: ['CBSE'], categoryFilters: ['primary'] },
          } as never,
        }),
      ),
    );
    expect(mockUseSchoolsByArea).toHaveBeenCalledWith('IN|KA|Udupi|Manipal', ['CBSE'], ['primary'], 20);
  });

  it('derives schoolsAreaKey from the canonical AREA leaf when panelContent is NOT schools-in-area (#2124)', () => {
    renderHook(() =>
      useDiscoverSchoolController(
        baseParams({
          panelContent: 'guided-entry' as never,
          nav: { journey: 'area-first', areaKey: null, schoolId: null, schoolPicking: 1, filters: {} } as never,
          areasNavigationJourney: {
            node: { nodeType: 'AREA', areaKey: 'IN|KA|Udupi|Manipal' },
            children: [],
            isLoading: false,
            error: null,
            selectNode: vi.fn(),
          } as never,
        }),
      ),
    );
    expect(mockUseSchoolsByArea).toHaveBeenCalledWith('IN|KA|Udupi|Manipal', [], [], 20);
    expect(mockUseDiscoverJourneyTransitions).toHaveBeenCalledWith(
      expect.objectContaining({ hasResolvedCanonicalArea: true }),
    );
  });

  // G2-N11 (#2750 PR-3 B1) — retires discover-school-journey E2E-9 (area-first + areaKey must not
  // fetch schools-by-area). The fixture sets nav.areaKey (so a dropped panelContent guard WOULD fall
  // back to it) AND leaves the canonical AREA leaf unresolved (areasNavigationJourney.node null =>
  // canonicalSchoolsAreaKey undefined), so the `panelContent === 'schools-in-area'` guard is the ONLY
  // thing that yields undefined. Without both being explicit, dropping the guard stays green.
  it('G2-N11 panelContent=area-selected with nav.areaKey set and NO canonical AREA leaf: useSchoolsByArea gets areaKey undefined', () => {
    renderHook(() =>
      useDiscoverSchoolController(
        baseParams({
          panelContent: 'area-selected' as never,
          nav: {
            journey: 'area-first',
            areaKey: 'IN|KA|Udupi|Manipal',
            schoolId: null,
            schoolPicking: null,
            filters: {},
          } as never,
          areasNavigationJourney: { node: null, children: [], isLoading: false, error: null, selectNode: vi.fn() } as never,
        }),
      ),
    );
    expect(mockUseSchoolsByArea).toHaveBeenCalledWith(undefined, [], [], 20);
    expect(mockUseSchoolsByArea).not.toHaveBeenCalledWith('IN|KA|Udupi|Manipal', expect.anything(), expect.anything(), expect.anything());
  });

  it('G2-N11 control: the same nav with panelContent=schools-in-area DOES pass nav.areaKey (so the guard, not the fixture, produces undefined above)', () => {
    renderHook(() =>
      useDiscoverSchoolController(
        baseParams({
          panelContent: 'schools-in-area' as never,
          nav: {
            journey: 'area-first',
            areaKey: 'IN|KA|Udupi|Manipal',
            schoolId: null,
            schoolPicking: null,
            filters: {},
          } as never,
          areasNavigationJourney: { node: null, children: [], isLoading: false, error: null, selectNode: vi.fn() } as never,
        }),
      ),
    );
    expect(mockUseSchoolsByArea).toHaveBeenCalledWith('IN|KA|Udupi|Manipal', [], [], 20);
  });

  it('schools defaults to all fetched schools when urlBoardFilters is empty', () => {
    const { result } = renderHook(() => useDiscoverSchoolController(baseParams({ nav: { journey: null, areaKey: null, schoolId: null, schoolPicking: null, filters: {} } as never })));
    expect(result.current.schools).toEqual([SCHOOL_A, SCHOOL_B]);
  });

  it('schools is client-side filtered by urlBoardFilters (case-insensitive board match)', () => {
    const { result } = renderHook(() => useDiscoverSchoolController(baseParams({ nav: { journey: null, areaKey: null, schoolId: null, schoolPicking: null, filters: { boardFilters: ['cbse'] } } as never })));
    expect(result.current.schools).toEqual([SCHOOL_A]);
  });

  it('passes the internally-computed schools (not a caller field) into useDiscoverJourneyTransitions', () => {
    renderHook(() => useDiscoverSchoolController(baseParams({ nav: { journey: null, areaKey: null, schoolId: null, schoolPicking: null, filters: { boardFilters: ['ICSE'] } } as never })));
    expect(mockUseDiscoverJourneyTransitions).toHaveBeenCalledWith(
      expect.objectContaining({ schools: [SCHOOL_B] }),
    );
  });

  it('useSchoolListings reads journey/schoolId from urlState and isAuthenticated/areaListings/etc. from params', () => {
    renderHook(() =>
      useDiscoverSchoolController(
        baseParams({
          urlState: { journey: 'school-first', groupId: null, schoolId: 'school-1' } as never,
          isAuthenticated: false,
        }),
      ),
    );
    expect(mockUseSchoolListings).toHaveBeenCalledWith(
      expect.objectContaining({ journey: 'school-first', schoolId: 'school-1', isAuthenticated: false }),
    );
  });

  it('useSchoolFirstCounts reads journey/groupId from urlState and selectedArea/focusedGroup from params', () => {
    const focusedGroup = { id: 'g1' } as never;
    renderHook(() =>
      useDiscoverSchoolController(
        baseParams({
          urlState: { journey: 'school-first', groupId: 'g1', schoolId: null } as never,
          focusedGroup,
        }),
      ),
    );
    expect(mockUseSchoolFirstCounts).toHaveBeenCalledWith(
      expect.objectContaining({ journey: 'school-first', groupId: 'g1', focusedGroup }),
    );
  });

  it('returns the composed output from all 4 underlying hooks', () => {
    const { result } = renderHook(() => useDiscoverSchoolController(baseParams()));
    expect(result.current.journeyView).toBe(JOURNEY_RESULT.view);
    expect(result.current.journeyCommands).toBe(JOURNEY_RESULT.commands);
    expect(result.current.schoolListings).toBe(SCHOOL_LISTINGS_RESULT.schoolListings);
    expect(result.current.schoolFirstZoneSchoolCount).toBe(SCHOOL_FIRST_COUNTS_RESULT.schoolFirstZoneSchoolCount);
  });

  // #2750 PR-4 (retires e2e issue-2660 "School-within-Area": header Back at the picker is rung 2 —
  // clearSchoolPicking — never a full area dismissal). Each arm varies the two nav terms the ladder
  // reads and asserts WHICH of the three exits ran, so a reordered or collapsed ladder cannot pass.
  describe('handleAreaFirstBack ladder (#2660)', () => {
    function runBack(navOverrides: Record<string, unknown>) {
      const urlActions = { clearSchoolPicking: vi.fn(), backToSchoolPicking: vi.fn() };
      const handleAreaBack = vi.fn();
      const setSelectedSchool = vi.fn();
      const { result } = renderHook(() =>
        useDiscoverSchoolController(
          baseParams({
            urlActions: urlActions as never,
            handleAreaBack,
            setSelectedSchool,
            nav: {
              journey: 'area-first',
              areaKey: null,
              schoolId: null,
              schoolPicking: null,
              filters: {},
              ...navOverrides,
            } as never,
          }),
        ),
      );
      result.current.handleAreaFirstBack();
      return { urlActions, handleAreaBack, setSelectedSchool };
    }

    it('rung 2: schoolPicking set and NO schoolId clears school picking only (leaf listings return), not an area dismissal', () => {
      const { urlActions, handleAreaBack, setSelectedSchool } = runBack({ schoolPicking: 1 });

      expect(urlActions.clearSchoolPicking).toHaveBeenCalledTimes(1);
      expect(urlActions.backToSchoolPicking).not.toHaveBeenCalled();
      expect(handleAreaBack).not.toHaveBeenCalled();
      expect(setSelectedSchool).not.toHaveBeenCalled();
    });

    it('rung 1 wins: a selected school (schoolId) goes back to the picker (backToSchoolPicking) even while schoolPicking is also set', () => {
      const { urlActions, handleAreaBack, setSelectedSchool } = runBack({ schoolId: 's1', schoolPicking: 1 });

      expect(urlActions.backToSchoolPicking).toHaveBeenCalledTimes(1);
      expect(urlActions.clearSchoolPicking).not.toHaveBeenCalled();
      expect(handleAreaBack).not.toHaveBeenCalled();
      expect(setSelectedSchool).toHaveBeenCalledWith(null);
    });

    it('rung 3 (control): neither schoolId nor schoolPicking falls through to the canonical area back', () => {
      const { urlActions, handleAreaBack } = runBack({});

      expect(handleAreaBack).toHaveBeenCalledTimes(1);
      expect(urlActions.clearSchoolPicking).not.toHaveBeenCalled();
      expect(urlActions.backToSchoolPicking).not.toHaveBeenCalled();
    });
  });
});
