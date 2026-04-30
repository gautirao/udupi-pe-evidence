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
