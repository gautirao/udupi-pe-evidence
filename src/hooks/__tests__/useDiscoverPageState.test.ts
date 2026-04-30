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
    q: '',
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
    setSearchQuery: vi.fn(),
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
});
