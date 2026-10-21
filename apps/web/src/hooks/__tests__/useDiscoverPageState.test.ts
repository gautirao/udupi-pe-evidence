import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    selectedGroup: null,
    intent: 'buy', // Issue #1494
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
    // Issue #1429 — corridor-first cumulative-distance actions.
    setRegion: vi.fn(),
    setMaxKm: vi.fn(),
    clearRegionAndMaxKm: vi.fn(),
    // Issue #1494 — buy/rent intent
    setIntent: vi.fn(),
    // Issue #2016 — result-scope commit
    commitResultScope: vi.fn(),
    ...overrides,
    // Cast: the Partial<DiscoverUrlActions> spread widens each property to
    // `fn | Mock<Procedure>`, which is not assignable to the exact action
    // signatures (pre-existing #1433 baseline shape). Assert the concrete type.
  } as DiscoverUrlActions;
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
      backOnMarket: true as const,
      newToMarket: true as const,
      reraRegistered: true as const,
      readyToMove: true as const,
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

// B2-N1 (#2858 batch 2, manifest L102 area-drilldown-stale-viewport-1821 AC2): the
// mount-time classification "was this a bare area-only deep link?" is DERIVED here
// (useDiscoverPageState.ts initialViewportWasBareAreaRef). Every other test injects
// the ref as a fixture, so a wrong derivation survived. Each operand of
// `!groupId && !scope && !!areaKey` gets its own row so dropping any one goes red.
describe('useDiscoverPageState — initialViewportWasBareAreaRef derivation (#1821)', () => {
  const AREA = 'IN|KA|Bengaluru|Devanahalli';
  it.each([
    { shape: 'bare areaKey only (no groupId, no scope)', url: { areaKey: AREA }, expected: true },
    { shape: 'areaKey + groupId', url: { areaKey: AREA, groupId: 'north-belt' }, expected: false },
    { shape: 'areaKey + scope', url: { areaKey: AREA, scope: 'region:north' }, expected: false },
    { shape: 'groupId only, no areaKey', url: { groupId: 'north-belt' }, expected: false },
    // No groupId/scope/areaKey at all: only the `!!areaKey` operand can make this false
    // (the groupId-only row above is already false via `!groupId`, so it cannot kill it).
    { shape: 'no areaKey, no groupId, no scope', url: {}, expected: false },
  ] as Array<{ shape: string; url: Partial<DiscoverUrlState>; expected: boolean }>)(
    'initialViewportWasBareAreaRef derivation (#1821): $shape -> $expected',
    ({ url, expected }) => {
      const { result } = renderHook(() =>
        useDiscoverPageState({
          urlState: makeUrlState(url),
          urlActions: makeUrlActions(),
        }),
      );
      expect(result.current.initialViewportWasBareAreaRef.current).toBe(expected);
    },
  );
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

  // G2-SPEC-DEFAULT-RADIUS (#2750 PR-3 B1; the spec-specific addition of discover-school-selected
  // E2E-5): a cold-loaded school with NO radius in the filters gets the default 3 km written into
  // filters.schoolRadiusKm (alongside lat/lon), so the listings request uses schoolRadiusKm=3. The
  // control arm keeps an already-set 5 (the fallback must not overwrite an explicit radius).
  it('G2-DEFAULT-RADIUS cold-load school with no radius: filters get schoolLat/Lon and schoolRadiusKm exactly 3', () => {
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState({ schoolId: 'sch-1', radiusKm: null }),
        urlActions: makeUrlActions(),
      }),
    );
    expect(result.current.filters.schoolRadiusKm).toBeUndefined();

    act(() => {
      result.current.setSelectedSchool(mockSchool);
    });

    expect(result.current.filters.schoolRadiusKm).toBe(3);
    expect(result.current.filters.schoolLat).toBe(13.3525);
    expect(result.current.filters.schoolLon).toBe(74.7864);
  });

  it('G2-DEFAULT-RADIUS control: an already-set radius of 5 is kept (the 3 km default does not overwrite it)', () => {
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState({ schoolId: 'sch-1', radiusKm: 5 }),
        urlActions: makeUrlActions(),
      }),
    );
    act(() => {
      result.current.setFilters({ schoolRadiusKm: 5 });
    });
    act(() => {
      result.current.setSelectedSchool(mockSchool);
    });

    expect(result.current.filters.schoolRadiusKm).toBe(5);
    expect(result.current.filters.schoolLat).toBe(13.3525);
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
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(MemoryRouter, { initialEntries: [initialUrl] }, children),
      );
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

  // G3-M5 (#2750 PR-3 B1) — the WRITER half. Retires discover-school-board-filter AC12-A (chip click
  // writes board=CBSE as a repeated param) and AC4 (removing the last board leaves no `board` key).
  // The reader half (hydrate) is the pre-existing 558 `it` above. Debounced write: fake timers.
  // NOTE: this file OOMs as a whole at base because of an unrelated pre-existing `it`
  // (handleAreaBack_clears_an_AREA_SET_scope_but_never_a_committed_POLYGON) — see G2G3-tests.md;
  // this `it` is run by name.
  it('G3-M5 setFiltersLive boardFilters writes REPEATED board params (CBSE; then CBSE+ICSE as two params, not comma-joined) and [] leaves no board key', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useHookAndLocation(), {
        wrapper: makeWrapper('/discover?city=udupi&journey=school-first&areaKey=IN|KA|Udupi|Manipal'),
      });

      act(() => {
        result.current.actions.setFiltersLive({ boardFilters: ['CBSE'] });
        vi.advanceTimersByTime(400);
      });
      expect(new URLSearchParams(result.current.location.search).getAll('board')).toEqual(['CBSE']);

      act(() => {
        result.current.actions.setFiltersLive({ boardFilters: ['CBSE', 'ICSE'] });
        vi.advanceTimersByTime(400);
      });
      expect(new URLSearchParams(result.current.location.search).getAll('board')).toEqual(['CBSE', 'ICSE']);

      act(() => {
        result.current.actions.setFiltersLive({ boardFilters: [] });
        vi.advanceTimersByTime(400);
      });
      const search = new URLSearchParams(result.current.location.search);
      expect(search.getAll('board')).toEqual([]);
      expect(search.has('board')).toBe(false);
      // the unrelated scope params were not disturbed by the filter write
      expect(search.get('areaKey')).toBe('IN|KA|Udupi|Manipal');
      expect(search.get('journey')).toBe('school-first');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useDiscoverPageState — Issue #2016 result-scope', () => {
  it('handleAreaClick_commits_a_single-area_AREA_SET_scope', () => {
    const commitResultScope = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions({ commitResultScope }),
      }),
    );

    act(() => {
      result.current.handleAreaClick({
        areaKey: 'IN|KA|Udupi|Manipal',
        areaLabel: 'Manipal',
        geo_center_lat: 13.34,
        geo_center_lon: 74.74,
        bbox: null,
      });
    });

    expect(commitResultScope).toHaveBeenCalledWith({
      kind: 'AREA_SET',
      areaKeys: ['IN|KA|Udupi|Manipal'],
    });
  });

  it('handleAreaBack_clears_an_AREA_SET_scope_but_never_a_committed_POLYGON', () => {
    const commitResultScope = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState({
          resultScope: {
            active: { kind: 'POLYGON', coordinates: [[12.9, 77.5], [12.95, 77.55], [12.9, 77.6]] },
            previous: null,
          },
        }),
        urlActions: makeUrlActions({ commitResultScope }),
      }),
    );

    act(() => {
      result.current.handleAreaBack();
    });

    expect(commitResultScope).not.toHaveBeenCalled();
  });

  it('handlePolygonDrawn_is_draft-only_and_commits_directly_when_nothing_was_previously_committed', () => {
    const commitResultScope = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions({ commitResultScope }),
      }),
    );

    const coords: [number, number][] = [[12.9, 77.5], [12.95, 77.55], [12.9, 77.6]];
    act(() => {
      result.current.handlePolygonDrawn(coords);
    });

    // No existing scope to replace -> commits immediately, no confirmation.
    expect(commitResultScope).toHaveBeenCalledWith({ kind: 'POLYGON', coordinates: coords });
    expect(result.current.isReplaceScopeConfirmOpen).toBe(false);
    expect(result.current.draftPolygon).toBeNull();
  });

  it('handlePolygonDrawn_surfaces_the_J3.3_confirmation_instead_of_committing_when_an_AREA_SET_is_already_active', () => {
    const commitResultScope = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState({
          resultScope: { active: { kind: 'AREA_SET', areaKeys: ['hebbal'] }, previous: null },
        }),
        urlActions: makeUrlActions({ commitResultScope }),
      }),
    );

    const coords: [number, number][] = [[12.9, 77.5], [12.95, 77.55], [12.9, 77.6]];
    act(() => {
      result.current.handlePolygonDrawn(coords);
    });

    // Draft only — no commit yet, no URL/filters write.
    expect(commitResultScope).not.toHaveBeenCalled();
    expect(result.current.isReplaceScopeConfirmOpen).toBe(true);
    expect(result.current.draftPolygon).toEqual(coords);
  });

  it('confirming_the_replacement_commits_the_draft_as_POLYGON', () => {
    const commitResultScope = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState({
          resultScope: { active: { kind: 'AREA_SET', areaKeys: ['hebbal'] }, previous: null },
        }),
        urlActions: makeUrlActions({ commitResultScope }),
      }),
    );

    const coords: [number, number][] = [[12.9, 77.5], [12.95, 77.55], [12.9, 77.6]];
    act(() => {
      result.current.handlePolygonDrawn(coords);
    });
    act(() => {
      result.current.handleConfirmReplaceScope();
    });

    expect(commitResultScope).toHaveBeenCalledWith({ kind: 'POLYGON', coordinates: coords });
    expect(result.current.isReplaceScopeConfirmOpen).toBe(false);
    expect(result.current.draftPolygon).toBeNull();
  });

  it('cancelling_the_replacement_discards_the_draft_and_never_commits', () => {
    const commitResultScope = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState({
          resultScope: { active: { kind: 'AREA_SET', areaKeys: ['hebbal'] }, previous: null },
        }),
        urlActions: makeUrlActions({ commitResultScope }),
      }),
    );

    const coords: [number, number][] = [[12.9, 77.5], [12.95, 77.55], [12.9, 77.6]];
    act(() => {
      result.current.handlePolygonDrawn(coords);
    });
    act(() => {
      result.current.handleCancelReplaceScope();
    });

    expect(commitResultScope).not.toHaveBeenCalled();
    expect(result.current.isReplaceScopeConfirmOpen).toBe(false);
    expect(result.current.draftPolygon).toBeNull();
  });

  it('filters.polygon_is_a_derived_projection_of_the_committed_scope_only — never written directly by the draft', () => {
    const { result } = renderHook(() =>
      useDiscoverPageState({
        urlState: makeUrlState(),
        urlActions: makeUrlActions(),
      }),
    );

    const coords: [number, number][] = [[12.9, 77.5], [12.95, 77.55], [12.9, 77.6]];
    act(() => {
      result.current.handlePolygonDrawn(coords);
    });

    // Nothing was committed (urlState.resultScope never changes in this unit
    // test — commitResultScope is a mock, not a real URL writer), so the
    // derived filters.polygon must stay absent even though a draft exists.
    expect(result.current.filters.polygon).toBeUndefined();
  });
});
