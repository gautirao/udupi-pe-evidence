import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useDiscoverUrlState } from '../useDiscoverUrlState';
import type { DiscoverUrlState, DiscoverUrlActions } from '../useDiscoverUrlState';
import type { SchoolResult } from '../useSchoolSearch';

// ─── Import hook AFTER type imports ───────────────────────────
import { useDiscoverPageState } from '../useDiscoverPageState';

// ─── Helpers ──────────────────────────────────────────────────

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
    ...overrides,
  };
}

function makeUrlActions(overrides: Partial<DiscoverUrlActions> = {}): DiscoverUrlActions {
  return {
    changeCity: vi.fn(),
    setCity: vi.fn(),
    selectArea: vi.fn(),
    deselectArea: vi.fn(),
    reportViewport: vi.fn(),
    setFiltersLive: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setSchoolParams: vi.fn(),
    setSchoolJourney: vi.fn(),
    setSearchQuery: vi.fn(),
    setJourney: vi.fn(),
    selectGroup: vi.fn(),
    setBoardFilters: vi.fn(),
    setCategoryFilters: vi.fn(),
    clearAreaContext: vi.fn(),
    clearSchoolContext: vi.fn(),
    startOver: vi.fn(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDiscoverPageState — pagination', () => {
  it('initial_page_is_zero', () => {
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions(),
      }),
    );
    expect(result.current.page).toBe(0);
  });

  it('page_resets_to_zero_on_filter_change', () => {
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions(),
      }),
    );

    act(() => {
      result.current.setPage(3);
    });
    expect(result.current.page).toBe(3);

    act(() => {
      result.current.handleFiltersChange({});
    });
    expect(result.current.page).toBe(0);
  });

  it('page_resets_to_zero_on_city_change', () => {
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions(),
      }),
    );

    act(() => {
      result.current.setPage(2);
    });
    expect(result.current.page).toBe(2);

    act(() => {
      result.current.handleCityChange('manipal');
    });
    expect(result.current.page).toBe(0);
  });

  it('handleAreaClick_preserves_refinement_filters', () => {
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions(),
      }),
    );

    // Seed refinement filters before clicking an area.
    act(() => {
      result.current.handleFiltersChange({ propertyTypes: ['house'], priceMin: 1_000_000 });
    });
    expect(result.current.filters.propertyTypes).toEqual(['house']);
    expect(result.current.filters.priceMin).toBe(1_000_000);

    act(() => {
      result.current.handleAreaClick({
        areaKey: 'IN|KA|Udupi|Manipal',
        areaLabel: 'Manipal',
        geo_center_lat: 13.34,
        geo_center_lon: 74.74,
        bbox: null,
      });
    });

    // Refinements survive; localities key is absent (not set, so no need to assert its removal).
    expect(result.current.filters.propertyTypes).toEqual(['house']);
    expect(result.current.filters.priceMin).toBe(1_000_000);
  });

  it('handleAreaSelect_preserves_refinement_filters', () => {
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions(),
      }),
    );

    act(() => {
      result.current.handleFiltersChange({ propertyTypes: ['apartment'], bedrooms: [2, 3] });
    });

    act(() => {
      result.current.handleAreaSelect({
        areaKey: 'IN|KA|Udupi|Manipal',
        areaLabel: 'Manipal',
        geo_center_lat: 13.34,
        geo_center_lon: 74.74,
        bbox: null,
      });
    });

    expect(result.current.filters.propertyTypes).toEqual(['apartment']);
    expect(result.current.filters.bedrooms).toEqual([2, 3]);
  });

  it('handleAreaClick_drops_localities_but_keeps_other_filters', () => {
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions(),
      }),
    );

    // Directly set filters including localities to verify the drop behaviour.
    act(() => {
      result.current.setFilters({ propertyTypes: ['land'], localities: ['Udupi Town'], priceMax: 5_000_000 });
    });

    act(() => {
      result.current.handleAreaClick({
        areaKey: 'IN|KA|Udupi|Manipal',
        areaLabel: 'Manipal',
        geo_center_lat: 13.34,
        geo_center_lon: 74.74,
        bbox: null,
      });
    });

    expect(result.current.filters.localities).toBeUndefined();
    expect(result.current.filters.propertyTypes).toEqual(['land']);
    expect(result.current.filters.priceMax).toBe(5_000_000);
  });

  it('page_resets_to_zero_on_area_deselect', () => {
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions(),
      }),
    );

    // Select an area first so selectedArea is non-null
    act(() => {
      result.current.handleAreaSelect({
        areaKey: 'IN|KA|Udupi|Manipal',
        areaLabel: 'Manipal',
        geo_center_lat: 13.34,
        geo_center_lon: 74.74,
        bbox: null,
      });
    });

    act(() => {
      result.current.setPage(1);
    });
    expect(result.current.page).toBe(1);

    act(() => {
      result.current.handleAreaBack();
    });
    expect(result.current.page).toBe(0);
  });
});

describe('useDiscoverPageState — initial filters from URL', () => {
  it('lazy-initialises filters from urlState on mount', () => {
    const urlFilters = {
      propertyTypes: ['house', 'apartment'] as ['house', 'apartment'],
      bedrooms: [2, 3],
      priceMin: 1_000_000,
      priceMax: 10_000_000,
      sellerTypes: ['owner', 'broker'],
      backOnMarket: true as true,
      newToMarket: true as true,
      reraRegistered: true as true,
      readyToMove: true as true,
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
    };

    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState({ filters: urlFilters }),
        urlActions: makeUrlActions(),
      }),
    );

    const f = result.current.filters;
    expect(f.propertyTypes).toEqual(['house', 'apartment']);
    expect(f.bedrooms).toEqual([2, 3]);
    expect(f.priceMin).toBe(1_000_000);
    expect(f.priceMax).toBe(10_000_000);
    expect(f.sellerTypes).toEqual(['owner', 'broker']);
    expect(f.backOnMarket).toBe(true);
    expect(f.newToMarket).toBe(true);
    expect(f.reraRegistered).toBe(true);
    expect(f.readyToMove).toBe(true);
    // dateFrom/dateTo converted from string to Date
    expect(f.dateFrom).toBeInstanceOf(Date);
    expect(f.dateFrom?.toISOString().slice(0, 10)).toBe('2025-01-01');
    expect(f.dateTo).toBeInstanceOf(Date);
    expect(f.dateTo?.toISOString().slice(0, 10)).toBe('2025-12-31');
  });

  it('leaves optional fields undefined when URL filters are empty', () => {
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState({ filters: {} }),
        urlActions: makeUrlActions(),
      }),
    );
    const f = result.current.filters;
    expect(f.sellerTypes).toBeUndefined();
    expect(f.backOnMarket).toBeUndefined();
    expect(f.dateFrom).toBeUndefined();
    expect(f.dateTo).toBeUndefined();
  });
});

describe('useDiscoverPageState — handleFiltersChange preserves school context', () => {
  it('school lat/lon/radius survive a property-filter change', () => {
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions(),
      }),
    );

    // Establish school context in filters first (simulates post-school-select state).
    act(() => {
      result.current.setFilters({
        schoolLat: 13.0,
        schoolLon: 77.5,
        schoolRadiusKm: 3,
        propertyTypes: [],
      });
    });

    // Apply a property filter while retaining existing school-context fields.
    act(() => {
      result.current.handleFiltersChange({
        ...result.current.filters,
        propertyTypes: ['house'],
      });
    });

    expect(result.current.filters.propertyTypes).toEqual(['house']);
    expect(result.current.filters.schoolLat).toBe(13.0);
    expect(result.current.filters.schoolLon).toBe(77.5);
    expect(result.current.filters.schoolRadiusKm).toBe(3);
  });

  it('bedrooms filter change does not clear schoolLat/Lon/RadiusKm', () => {
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions(),
      }),
    );

    act(() => {
      result.current.setFilters({
        schoolLat: 13.35,
        schoolLon: 74.79,
        schoolRadiusKm: 5,
      });
    });

    act(() => {
      result.current.handleFiltersChange({
        ...result.current.filters,
        bedrooms: [2, 3],
      });
    });

    expect(result.current.filters.bedrooms).toEqual([2, 3]);
    expect(result.current.filters.schoolLat).toBe(13.35);
    expect(result.current.filters.schoolLon).toBe(74.79);
    expect(result.current.filters.schoolRadiusKm).toBe(5);
  });
});

describe('useDiscoverPageState — handleFiltersChange with selectedSchool', () => {
  const mockSchool: SchoolResult = {
    id: 'sch-1',
    name: 'Manipal Public School',
    board: 'CBSE',
    boardType: null,
    latitude: 13.3525,
    longitude: 74.7864,
    address: 'Manipal, Udupi District',
    distanceKm: 1.2,
  };

  it('calls setSchoolParams with schoolId and new radiusKm when selectedSchool is set', () => {
    const setSchoolParams = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions({ setSchoolParams }),
      }),
    );

    // Establish selectedSchool in state (mirrors handleSchoolSelect side-effect).
    act(() => {
      result.current.setSelectedSchool(mockSchool);
    });

    // Call handleFiltersChange with a new schoolRadiusKm value.
    act(() => {
      result.current.handleFiltersChange({
        ...result.current.filters,
        schoolLat: mockSchool.latitude,
        schoolLon: mockSchool.longitude,
        schoolRadiusKm: 5,
      });
    });

    expect(setSchoolParams).toHaveBeenCalledWith({ schoolId: 'sch-1', radiusKm: 5 });
  });

  it('does NOT call setSchoolParams when selectedSchool is null', () => {
    const setSchoolParams = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions({ setSchoolParams }),
      }),
    );

    // No setSelectedSchool call — selectedSchool stays null.
    act(() => {
      result.current.handleFiltersChange({
        schoolLat: 13.35,
        schoolLon: 74.79,
        schoolRadiusKm: 5,
      });
    });

    expect(setSchoolParams).not.toHaveBeenCalled();
  });
});

describe('useDiscoverPageState — handleCityChange delegates to changeCity', () => {
  it('calls changeCity (not setCity) when city changes', () => {
    const changeCity = vi.fn();
    const setCity = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions({ changeCity, setCity }),
      }),
    );

    act(() => {
      result.current.handleCityChange('manipal');
    });

    expect(changeCity).toHaveBeenCalledWith('manipal');
    expect(setCity).not.toHaveBeenCalled();
  });
});

describe('useDiscoverPageState — handleFiltersChange passes all new fields to setFiltersLive', () => {
  it('passes multi-seller array to setFiltersLive without truncating', () => {
    const setFiltersLive = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions({ setFiltersLive }),
      }),
    );

    act(() => {
      result.current.handleFiltersChange({ sellerTypes: ['owner', 'broker'] });
    });

    expect(setFiltersLive).toHaveBeenCalledWith(
      expect.objectContaining({ sellerTypes: ['owner', 'broker'] }),
    );
  });

  it('converts dateFrom/dateTo Date objects to ISO strings for setFiltersLive', () => {
    const setFiltersLive = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions({ setFiltersLive }),
      }),
    );

    act(() => {
      result.current.handleFiltersChange({
        dateFrom: new Date('2025-03-15'),
        dateTo: new Date('2025-06-30'),
      });
    });

    expect(setFiltersLive).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: '2025-03-15',
        dateTo: '2025-06-30',
      }),
    );
  });

  it('passes boolean status flags through to setFiltersLive', () => {
    const setFiltersLive = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions({ setFiltersLive }),
      }),
    );

    act(() => {
      result.current.handleFiltersChange({
        backOnMarket: true,
        newToMarket: true,
        reraRegistered: true,
        readyToMove: true,
      });
    });

    expect(setFiltersLive).toHaveBeenCalledWith(
      expect.objectContaining({
        backOnMarket: true,
        newToMarket: true,
        reraRegistered: true,
        readyToMove: true,
      }),
    );
  });

  it('forwards boardFilters and categoryFilters to setFiltersLive', () => {
    const setFiltersLive = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions({ setFiltersLive }),
      }),
    );

    act(() => {
      result.current.handleFiltersChange({
        boardFilters: ['cbse', 'icse'],
        categoryFilters: ['primary', 'secondary'],
      });
    });

    expect(setFiltersLive).toHaveBeenCalledWith(
      expect.objectContaining({
        boardFilters: ['cbse', 'icse'],
        categoryFilters: ['primary', 'secondary'],
      }),
    );
  });
});

// ─── Board-filter URL state (issue #1131) ─────────────────────
//
// These tests render the actual useDiscoverUrlState hook (not the mocked makeUrlActions
// helper) inside a MemoryRouter so we exercise real URLSearchParams parsing/serialisation.
// They cover three contractual properties:
//   1. Repeated ?board=CBSE&board=ICSE params hydrate filters.boardFilters as an array.
//   2. clearSchoolContext() preserves the `board` URL param (AC7).
//   3. startOver() removes the `board` URL param (AC11).

describe('useDiscoverUrlState — board filters (issue #1131)', () => {
  function makeWrapper(initialUrl: string) {
    // Use React.createElement so this file can remain .ts (no JSX).
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries: [initialUrl] }, children);
  }

  function useHookAndLocation() {
    const [state, actions] = useDiscoverUrlState();
    const location = useLocation();
    return { state, actions, location };
  }

  it('hydrates boardFilters from repeated ?board=CBSE&board=ICSE params', () => {
    const { result } = renderHook(() => useHookAndLocation(), {
      wrapper: makeWrapper('/discover?city=udupi&board=CBSE&board=ICSE'),
    });
    expect(result.current.state.filters.boardFilters).toEqual(['CBSE', 'ICSE']);
  });

  it('clearSchoolContext() preserves boardFilters (AC7)', () => {
    const { result } = renderHook(() => useHookAndLocation(), {
      wrapper: makeWrapper(
        '/discover?city=udupi&schoolId=sch-1&radiusKm=3&board=CBSE&board=ICSE',
      ),
    });

    act(() => {
      result.current.actions.clearSchoolContext();
    });

    // boardFilters must survive; schoolId and radiusKm must be removed.
    expect(result.current.state.filters.boardFilters).toEqual(['CBSE', 'ICSE']);
    expect(result.current.state.schoolId).toBeNull();
    expect(result.current.state.radiusKm).toBeNull();
    // URL search string still contains both board entries (repeated-param form).
    const search = new URLSearchParams(result.current.location.search);
    expect(search.getAll('board')).toEqual(['CBSE', 'ICSE']);
  });

  it('startOver() clears boardFilters (AC11)', () => {
    const { result } = renderHook(() => useHookAndLocation(), {
      wrapper: makeWrapper(
        '/discover?city=udupi&journey=school-first&areaKey=IN|KA|Udupi|Manipal&board=CBSE&board=ICSE',
      ),
    });

    act(() => {
      result.current.actions.startOver();
    });

    expect(result.current.state.filters.boardFilters).toBeUndefined();
    const search = new URLSearchParams(result.current.location.search);
    expect(search.getAll('board')).toEqual([]);
    // City is preserved; journey/areaKey are cleared per startOver contract.
    expect(result.current.state.city).toBe('udupi');
    expect(result.current.state.journey).toBeNull();
    expect(result.current.state.areaKey).toBeNull();
  });
});
