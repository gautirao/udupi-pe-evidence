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
});
