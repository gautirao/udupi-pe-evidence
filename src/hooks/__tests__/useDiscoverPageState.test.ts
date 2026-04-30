import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DiscoverUrlState, DiscoverUrlActions } from '../useDiscoverUrlState';

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
    ...overrides,
  };
}

function makeUrlActions(overrides: Partial<DiscoverUrlActions> = {}): DiscoverUrlActions {
  return {
    setCity: vi.fn(),
    selectArea: vi.fn(),
    deselectArea: vi.fn(),
    reportViewport: vi.fn(),
    setFiltersLive: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setSchoolParams: vi.fn(),
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
