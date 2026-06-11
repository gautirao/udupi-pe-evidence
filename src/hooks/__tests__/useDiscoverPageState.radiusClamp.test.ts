import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDiscoverPageState } from '../useDiscoverPageState';
import type {
  DiscoverUrlState,
  DiscoverUrlActions,
} from '../useDiscoverUrlState';
import type { SchoolResult } from '../useSchoolSearch';

// Minimal URL state — no school/area context, default city.
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
    ...overrides,
  };
}

// All actions are no-op spies; tests assert on the args passed to them.
function makeUrlActions(): DiscoverUrlActions {
  return {
    changeCity: vi.fn(),
    setCity: vi.fn(),
    selectArea: vi.fn(),
    deselectArea: vi.fn(),
    reportViewport: vi.fn(),
    setFiltersLive: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setSchoolParams: vi.fn(),
    clearSchoolSelection: vi.fn(),
    clearAreaSelection: vi.fn(),
    setSearchQuery: vi.fn(),
    setJourney: vi.fn(),
    selectGroup: vi.fn(),
    selectRegionalGroup: vi.fn(),
    // Issue #1429 — corridor-first cumulative-distance actions (successors to selectRegionalGroup).
    setRegion: vi.fn(),
    setRegionWithMaxKm: vi.fn(),
    setMaxKm: vi.fn(),
    clearRegionAndMaxKm: vi.fn(),
    // Issue #1430 — agri-group listing peek actions.
    setSelectedListing: vi.fn(),
    clearSelectedListing: vi.fn(),
    setBoardFilters: vi.fn(),
    setCategoryFilters: vi.fn(),
    clearAreaContext: vi.fn(),
    clearSchoolContext: vi.fn(),
    startOver: vi.fn(),
    enterSchoolPicking: vi.fn(),
    clearSchoolPicking: vi.fn(),
    backToSchoolPicking: vi.fn(),
    setSchoolJourney: vi.fn(),
  };
}

const mockSchool: SchoolResult = {
  id: 's1',
  name: 'Manipal Academy',
  board: null,
  boardType: null,
  latitude: 13.35,
  longitude: 74.79,
  address: 'Manipal, Udupi District, Karnataka',
  distanceKm: 0,
};

describe('useDiscoverPageState — school radius clamping (issue #1220)', () => {
  let urlActions: DiscoverUrlActions;

  beforeEach(() => {
    urlActions = makeUrlActions();
  });

  it('handleSchoolSelect propagates a clamped radius (0 → 1) to filters and URL', () => {
    const urlState = makeUrlState();
    const { result } = renderHook(() =>
      useDiscoverPageState({ urlState, urlActions }),
    );

    // Seed an invalid 0 km radius into filters, then select a school.
    act(() => {
      result.current.setFilters((prev) => ({ ...prev, schoolRadiusKm: 0 }));
    });
    act(() => {
      result.current.handleSchoolSelect(mockSchool);
    });

    expect(result.current.filters.schoolRadiusKm).toBe(1);
    expect(urlActions.setSchoolJourney).toHaveBeenCalledWith(
      expect.objectContaining({ radiusKm: 1 }),
    );
  });

  it('handleSchoolSelect leaves a valid radius unchanged', () => {
    const urlState = makeUrlState();
    const { result } = renderHook(() =>
      useDiscoverPageState({ urlState, urlActions }),
    );

    act(() => {
      result.current.setFilters((prev) => ({ ...prev, schoolRadiusKm: 5 }));
    });
    act(() => {
      result.current.handleSchoolSelect(mockSchool);
    });

    expect(result.current.filters.schoolRadiusKm).toBe(5);
    expect(urlActions.setSchoolJourney).toHaveBeenCalledWith(
      expect.objectContaining({ radiusKm: 5 }),
    );
  });

  it('cold-load restore clamps a 0 km radius (0 → 1) when syncing school into filters', () => {
    const urlState = makeUrlState();
    const { result } = renderHook(() =>
      useDiscoverPageState({ urlState, urlActions }),
    );

    // Simulate restore: selectedSchool set and an invalid radius present, but
    // schoolLat still undefined — the cold-load sync effect should fire.
    act(() => {
      result.current.setFilters((prev) => ({ ...prev, schoolRadiusKm: 0 }));
      result.current.setSelectedSchool(mockSchool);
    });

    expect(result.current.filters.schoolLat).toBe(mockSchool.latitude);
    expect(result.current.filters.schoolRadiusKm).toBe(1);
  });
});
