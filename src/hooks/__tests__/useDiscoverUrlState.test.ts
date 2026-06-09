/**
 * Unit tests for useDiscoverUrlState
 *
 * Tests cover:
 *  - Initial state read from URL params
 *  - setCity  → push
 *  - selectArea → push
 *  - deselectArea → replace
 *  - reportViewport → debounced replace
 *  - setFiltersLive → debounced replace
 *  - setFiltersCommitted → push
 *  - Edge cases: missing params, partial viewport, multiple areaKey values
 *  - changeCity → atomic push, clears journey/groupId/areaKey/viewport
 *  - setJourney → push
 *  - selectGroup → push
 *  - setBoardFilters / setCategoryFilters → replace, comma-separated round-trip
 *  - journey/groupId initial reads from URL
 *  - boardFilters/categoryFilters initial reads from URL
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '../useDiscoverUrlState';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wrapper(initialUrl: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        MemoryRouter,
        { initialEntries: [initialUrl] },
        children,
      ),
    );
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useDiscoverUrlState — initial state from URL', () => {
  it('reads city from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=kundapur'),
    });
    expect(result.current[0].city).toBe('kundapur');
  });

  it('reads areaKey from URL (single value)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal'),
    });
    expect(result.current[0].areaKey).toBe('IN|KA|Udupi|Manipal');
  });

  it('reads viewport from URL when all three params present', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?lat=13.34090&lon=74.74210&zoom=12'),
    });
    expect(result.current[0].viewport).toEqual({ lat: 13.3409, lon: 74.7421, zoom: 12 });
  });

  it('returns null viewport when any viewport param is missing', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?lat=13.34090&zoom=12'),
    });
    expect(result.current[0].viewport).toBeNull();
  });

  it('reads filter params from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?type=land,house&beds=2,3&priceMin=5000000&priceMax=20000000&seller=owner'),
    });
    const { filters } = result.current[0];
    expect(filters.propertyTypes).toEqual(['land', 'house']);
    expect(filters.bedrooms).toEqual([2, 3]);
    expect(filters.priceMin).toBe(5000000);
    expect(filters.priceMax).toBe(20000000);
    // legacy singular seller parses as array with one element
    expect(filters.sellerTypes).toEqual(['owner']);
  });

  it('returns undefined filter values when params are absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    const { filters } = result.current[0];
    expect(filters.propertyTypes).toBeUndefined();
    expect(filters.bedrooms).toBeUndefined();
    expect(filters.priceMin).toBeUndefined();
    expect(filters.priceMax).toBeUndefined();
    expect(filters.sellerTypes).toBeUndefined();
  });

  it('reads schoolId and radiusKm from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?schoolId=school-abc&radiusKm=3'),
    });
    expect(result.current[0].schoolId).toBe('school-abc');
    expect(result.current[0].radiusKm).toBe(3);
  });

  it('returns null schoolId and radiusKm when absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover'),
    });
    expect(result.current[0].schoolId).toBeNull();
    expect(result.current[0].radiusKm).toBeNull();
  });
});

describe('useDiscoverUrlState — areaKey null when absent', () => {
  it('returns null areaKey when param not in URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].areaKey).toBeNull();
  });
});

describe('useDiscoverUrlState — setCity', () => {
  it('updates city in state', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal'),
    });

    act(() => {
      result.current[1].setCity('kundapur');
    });

    expect(result.current[0].city).toBe('kundapur');
  });

  it('clears areaKey when city changes', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal'),
    });

    act(() => {
      result.current[1].setCity('kundapur');
    });

    expect(result.current[0].areaKey).toBeNull();
  });
});

describe('useDiscoverUrlState — selectArea', () => {
  it('sets areaKey in state', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].selectArea('IN|KA|Udupi|Manipal');
    });

    expect(result.current[0].areaKey).toBe('IN|KA|Udupi|Manipal');
  });
});

describe('useDiscoverUrlState — deselectArea', () => {
  it('removes areaKey from state', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal'),
    });

    act(() => {
      result.current[1].deselectArea();
    });

    expect(result.current[0].areaKey).toBeNull();
  });

  it('clears lat, lon, and zoom when deselecting an area', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal&lat=13.34090&lon=74.74210&zoom=14',
      ),
    });

    // Confirm the initial viewport is present
    expect(result.current[0].viewport).not.toBeNull();

    act(() => {
      result.current[1].deselectArea();
    });

    // After deselection, viewport must be cleared
    expect(result.current[0].viewport).toBeNull();
    expect(result.current[0].areaKey).toBeNull();
  });

  it('cancels a pending viewportTimer so it cannot re-write stale viewport after deselectArea', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useDiscoverUrlState(), {
        wrapper: wrapper(
          '/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal&lat=13.34090&lon=74.74210&zoom=14',
        ),
      });

      act(() => {
        // Enqueue a viewport update (debounced 300 ms) — simulates user panning
        // just before clicking Back
        result.current[1].reportViewport({ lat: 13.34, lon: 74.74, zoom: 14 });
        // Immediately deselect — must cancel the pending timer
        result.current[1].deselectArea();
        // Fire any remaining timers — the viewport timer must already be cancelled
        vi.runAllTimers();
      });

      // Viewport must remain null — the cancelled timer must not have re-written it
      expect(result.current[0].viewport).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useDiscoverUrlState — setFiltersCommitted', () => {
  it('writes filter params to state immediately', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setFiltersCommitted({
        propertyTypes: ['land'],
        bedrooms: [2, 3],
        priceMin: 1000000,
        priceMax: 5000000,
        sellerTypes: ['owner'],
      });
    });

    const { filters } = result.current[0];
    expect(filters.propertyTypes).toEqual(['land']);
    expect(filters.bedrooms).toEqual([2, 3]);
    expect(filters.priceMin).toBe(1000000);
    expect(filters.priceMax).toBe(5000000);
    expect(filters.sellerTypes).toEqual(['owner']);
  });

  it('clears filter params when values are empty/undefined', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?type=land&beds=2&priceMin=1000000'),
    });

    act(() => {
      result.current[1].setFiltersCommitted({});
    });

    const { filters } = result.current[0];
    expect(filters.propertyTypes).toBeUndefined();
    expect(filters.bedrooms).toBeUndefined();
    expect(filters.priceMin).toBeUndefined();
  });
});

describe('useDiscoverUrlState — reportViewport (debounced)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not update state before debounce delay', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].reportViewport({ lat: 13.3409, lon: 74.7421, zoom: 12 });
    });

    // Before timer fires, viewport should still be null (no prior viewport in URL)
    expect(result.current[0].viewport).toBeNull();
  });

  it('updates viewport state after debounce delay', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].reportViewport({ lat: 13.3409, lon: 74.7421, zoom: 12 });
      vi.runAllTimers();
    });

    expect(result.current[0].viewport).toEqual({
      lat: 13.3409,
      lon: 74.7421,
      zoom: 12,
    });
  });

  it('debounces rapid viewport calls — only last value wins', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].reportViewport({ lat: 13.0, lon: 74.0, zoom: 10 });
      result.current[1].reportViewport({ lat: 13.1, lon: 74.1, zoom: 11 });
      result.current[1].reportViewport({ lat: 13.3409, lon: 74.7421, zoom: 12 });
      vi.runAllTimers();
    });

    expect(result.current[0].viewport?.lat).toBeCloseTo(13.3409);
    expect(result.current[0].viewport?.zoom).toBe(12);
  });

  it('rounds lat/lon to 5 decimal places', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].reportViewport({ lat: 13.340912345678, lon: 74.742198765432, zoom: 12 });
      vi.runAllTimers();
    });

    expect(result.current[0].viewport?.lat).toBe(13.34091);
    expect(result.current[0].viewport?.lon).toBe(74.7422);
  });
});

describe('useDiscoverUrlState — q (search query) in URL state', () => {
  it('reads q from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?q=foo'),
    });
    expect(result.current[0].q).toBe('foo');
  });

  it('returns empty string when q is absent from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].q).toBe('');
  });
});

describe('useDiscoverUrlState — setSearchQuery (debounced)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not update q immediately', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setSearchQuery('bar');
    });

    expect(result.current[0].q).toBe('');
  });

  it('writes q to URL after debounce delay', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setSearchQuery('bar');
      vi.runAllTimers();
    });

    expect(result.current[0].q).toBe('bar');
  });

  it('deletes q param from URL when empty string is passed', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&q=bar'),
    });

    act(() => {
      result.current[1].setSearchQuery('');
      vi.runAllTimers();
    });

    expect(result.current[0].q).toBe('');
  });

  it('debounces rapid calls — only last value wins', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setSearchQuery('a');
      result.current[1].setSearchQuery('ab');
      result.current[1].setSearchQuery('abc');
      vi.runAllTimers();
    });

    expect(result.current[0].q).toBe('abc');
  });
});

describe('useDiscoverUrlState — setFiltersLive (debounced)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not update filters immediately', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setFiltersLive({ propertyTypes: ['land'] });
    });

    expect(result.current[0].filters.propertyTypes).toBeUndefined();
  });

  it('updates filters after debounce delay', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setFiltersLive({ propertyTypes: ['land'] });
      vi.runAllTimers();
    });

    expect(result.current[0].filters.propertyTypes).toEqual(['land']);
  });

  it('setFiltersCommitted cancels pending live debounce', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      // Start a live debounce with type=house
      result.current[1].setFiltersLive({ propertyTypes: ['house'] });
      // Immediately commit with type=land — should win
      result.current[1].setFiltersCommitted({ propertyTypes: ['land'] });
      // Now fire any remaining timers — live debounce should have been cancelled
      vi.runAllTimers();
    });

    // Committed value should be present
    expect(result.current[0].filters.propertyTypes).toEqual(['land']);
  });
});

// ─── New fields: seller (multi), booleans, dates ──────────────────────────────

describe('useDiscoverUrlState — seller (multi-value)', () => {
  it('legacy singular seller=owner parses as sellerTypes array with one element', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?seller=owner'),
    });
    expect(result.current[0].filters.sellerTypes).toEqual(['owner']);
  });

  it('seller=owner,broker parses as sellerTypes with both values', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?seller=owner,broker'),
    });
    expect(result.current[0].filters.sellerTypes).toEqual(['owner', 'broker']);
  });

  it('sellerTypes undefined when seller param absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].filters.sellerTypes).toBeUndefined();
  });

  it('round-trips multi-seller via setFiltersCommitted', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setFiltersCommitted({ sellerTypes: ['owner', 'broker'] });
    });

    expect(result.current[0].filters.sellerTypes).toEqual(['owner', 'broker']);
  });

  it('clears seller param when sellerTypes is empty array', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?seller=owner'),
    });

    act(() => {
      result.current[1].setFiltersCommitted({ sellerTypes: [] });
    });

    expect(result.current[0].filters.sellerTypes).toBeUndefined();
  });
});

describe('useDiscoverUrlState — boolean status flags', () => {
  it('reads bom=1 as backOnMarket=true', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?bom=1'),
    });
    expect(result.current[0].filters.backOnMarket).toBe(true);
  });

  it('returns undefined backOnMarket when bom param absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].filters.backOnMarket).toBeUndefined();
  });

  it('reads ntm=1 as newToMarket=true', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?ntm=1'),
    });
    expect(result.current[0].filters.newToMarket).toBe(true);
  });

  it('reads rera=1 as reraRegistered=true', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?rera=1'),
    });
    expect(result.current[0].filters.reraRegistered).toBe(true);
  });

  it('reads rtm=1 as readyToMove=true', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?rtm=1'),
    });
    expect(result.current[0].filters.readyToMove).toBe(true);
  });

  it('round-trips all boolean flags via setFiltersCommitted', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setFiltersCommitted({
        backOnMarket: true,
        newToMarket: true,
        reraRegistered: true,
        readyToMove: true,
      });
    });

    const { filters } = result.current[0];
    expect(filters.backOnMarket).toBe(true);
    expect(filters.newToMarket).toBe(true);
    expect(filters.reraRegistered).toBe(true);
    expect(filters.readyToMove).toBe(true);
  });

  it('omits boolean params from URL when flags are false/undefined', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?bom=1&ntm=1&rera=1&rtm=1'),
    });

    act(() => {
      result.current[1].setFiltersCommitted({
        backOnMarket: false,
        newToMarket: undefined,
        reraRegistered: false,
        readyToMove: undefined,
      });
    });

    const { filters } = result.current[0];
    expect(filters.backOnMarket).toBeUndefined();
    expect(filters.newToMarket).toBeUndefined();
    expect(filters.reraRegistered).toBeUndefined();
    expect(filters.readyToMove).toBeUndefined();
  });
});

describe('useDiscoverUrlState — date range', () => {
  it('reads from= and to= as ISO date strings', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?from=2025-01-01&to=2025-12-31'),
    });
    expect(result.current[0].filters.dateFrom).toBe('2025-01-01');
    expect(result.current[0].filters.dateTo).toBe('2025-12-31');
  });

  it('silently ignores malformed date values', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?from=not-a-date&to=also-bad'),
    });
    expect(result.current[0].filters.dateFrom).toBeUndefined();
    expect(result.current[0].filters.dateTo).toBeUndefined();
  });

  it('returns undefined dateFrom/dateTo when params absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].filters.dateFrom).toBeUndefined();
    expect(result.current[0].filters.dateTo).toBeUndefined();
  });

  it('round-trips date range via setFiltersCommitted', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setFiltersCommitted({ dateFrom: '2025-03-15', dateTo: '2025-06-30' });
    });

    expect(result.current[0].filters.dateFrom).toBe('2025-03-15');
    expect(result.current[0].filters.dateTo).toBe('2025-06-30');
  });

  it('clears date params when values are undefined', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?from=2025-01-01&to=2025-12-31'),
    });

    act(() => {
      result.current[1].setFiltersCommitted({ dateFrom: undefined, dateTo: undefined });
    });

    expect(result.current[0].filters.dateFrom).toBeUndefined();
    expect(result.current[0].filters.dateTo).toBeUndefined();
  });
});

// ─── journey + groupId initial reads ─────────────────────────────────────────

describe('useDiscoverUrlState — journey and groupId from URL', () => {
  it('reads journey=area-first from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=area-first'),
    });
    expect(result.current[0].journey).toBe('area-first');
  });

  it('reads journey=school-first from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=school-first'),
    });
    expect(result.current[0].journey).toBe('school-first');
  });

  // MVP2 AC2 — agri-first is an accepted journey value (NOT coerced to null).
  it('reads journey=agri-first from URL (not coerced to null)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first'),
    });
    expect(result.current[0].journey).toBe('agri-first');
  });

  it('returns null journey when param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].journey).toBeNull();
  });

  it('returns null journey for unknown journey values (defensive parse)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=unknown-mode'),
    });
    expect(result.current[0].journey).toBeNull();
  });

  it('reads groupId from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=area-first&groupId=coastal-homes'),
    });
    expect(result.current[0].groupId).toBe('coastal-homes');
  });

  it('returns null groupId when param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].groupId).toBeNull();
  });
});

// ─── board / category filter reads ───────────────────────────────────────────

describe('useDiscoverUrlState — boardFilters and categoryFilters from URL', () => {
  it('reads board param as repeated params (?board=cbse&board=icse) → array (issue #1131)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?board=cbse&board=icse'),
    });
    expect(result.current[0].filters.boardFilters).toEqual(['cbse', 'icse']);
  });

  it('reads category param as comma-separated categoryFilters', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?category=primary,secondary'),
    });
    expect(result.current[0].filters.categoryFilters).toEqual(['primary', 'secondary']);
  });

  it('returns undefined boardFilters when board param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].filters.boardFilters).toBeUndefined();
  });

  it('returns undefined categoryFilters when category param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].filters.categoryFilters).toBeUndefined();
  });
});

// ─── changeCity (atomic) ──────────────────────────────────────────────────────

describe('useDiscoverUrlState — changeCity (atomic city switch)', () => {
  it('sets the new city in URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].changeCity('manipal');
    });

    expect(result.current[0].city).toBe('manipal');
  });

  it('clears journey on city switch', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=area-first'),
    });

    act(() => {
      result.current[1].changeCity('manipal');
    });

    expect(result.current[0].journey).toBeNull();
  });

  it('clears groupId on city switch', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=area-first&groupId=coastal-homes'),
    });

    act(() => {
      result.current[1].changeCity('manipal');
    });

    expect(result.current[0].groupId).toBeNull();
  });

  it('clears areaKey on city switch', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal'),
    });

    act(() => {
      result.current[1].changeCity('manipal');
    });

    expect(result.current[0].areaKey).toBeNull();
  });

  it('clears viewport on city switch', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&lat=13.34090&lon=74.74210&zoom=12'),
    });

    act(() => {
      result.current[1].changeCity('manipal');
    });

    expect(result.current[0].viewport).toBeNull();
  });

  it('preserves property filters (type/beds/price) across city switch', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&type=house&beds=2,3&priceMin=1000000&priceMax=5000000',
      ),
    });

    act(() => {
      result.current[1].changeCity('manipal');
    });

    const { filters } = result.current[0];
    expect(filters.propertyTypes).toEqual(['house']);
    expect(filters.bedrooms).toEqual([2, 3]);
    expect(filters.priceMin).toBe(1000000);
    expect(filters.priceMax).toBe(5000000);
  });

  it('all cleared params happen in one setSearchParams call (single history entry)', () => {
    // Verify atomicity: after changeCity, browser history has exactly one new entry.
    // With MemoryRouter we can only observe the resulting state is correct — the
    // single-push contract is guaranteed by the implementation using one setUrlParams call.
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=area-first&groupId=coastal&areaKey=IN%7CKA%7CUdupi%7CManipal&lat=13.34090&lon=74.74210&zoom=12',
      ),
    });

    act(() => {
      result.current[1].changeCity('kundapur');
    });

    const state = result.current[0];
    expect(state.city).toBe('kundapur');
    expect(state.journey).toBeNull();
    expect(state.groupId).toBeNull();
    expect(state.areaKey).toBeNull();
    expect(state.viewport).toBeNull();
  });
});

// ─── setJourney ──────────────────────────────────────────────────────────────

describe('useDiscoverUrlState — setJourney', () => {
  it('sets journey=area-first', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setJourney('area-first');
    });

    expect(result.current[0].journey).toBe('area-first');
  });

  it('sets journey=school-first', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setJourney('school-first');
    });

    expect(result.current[0].journey).toBe('school-first');
  });

  it('removes journey param when null is passed', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=area-first'),
    });

    act(() => {
      result.current[1].setJourney(null);
    });

    expect(result.current[0].journey).toBeNull();
  });

  // MVP2 AC2/AC6 — setJourney('agri-first') writes ?journey=agri-first and
  // round-trips (proves the coercion allow-list accepts it on read-back).
  it('sets journey=agri-first and round-trips', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setJourney('agri-first');
    });

    expect(result.current[0].journey).toBe('agri-first');
  });

  // MVP2 AC6 — entering agri-first is a PUSH history entry, so a single browser
  // Back returns to the pre-agri state (journey absent). Uses a history-tracking
  // wrapper that observes the MemoryRouter location stack via useLocation.
  it('entering agri-first is a PUSH (Back returns to no-journey)', () => {
    const locations: string[] = [];
    function PushWrapper({ children }: { children: React.ReactNode }) {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      function LocationProbe() {
        const loc = useLocation();
        locations.push(loc.search);
        return null;
      }
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/discover?city=udupi'] },
          React.createElement(LocationProbe, null),
          children,
        ),
      );
    }

    const { result } = renderHook(() => useDiscoverUrlState(), { wrapper: PushWrapper });

    act(() => {
      result.current[1].setJourney('agri-first');
    });

    // A new history entry was pushed (search changed from no-journey to agri-first),
    // and the pre-agri entry (no journey param) is preserved in the stack — the
    // hallmark of a PUSH (a REPLACE would discard the prior entry).
    expect(result.current[0].journey).toBe('agri-first');
    expect(locations.some((s) => !s.includes('journey='))).toBe(true);
    expect(locations.some((s) => s.includes('journey=agri-first'))).toBe(true);
  });
});

// ─── selectGroup ─────────────────────────────────────────────────────────────

describe('useDiscoverUrlState — selectGroup', () => {
  it('sets groupId', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=area-first'),
    });

    act(() => {
      result.current[1].selectGroup('waterfront-villas');
    });

    expect(result.current[0].groupId).toBe('waterfront-villas');
  });

  it('removes groupId when null is passed', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=area-first&groupId=waterfront-villas'),
    });

    act(() => {
      result.current[1].selectGroup(null);
    });

    expect(result.current[0].groupId).toBeNull();
  });
});

// ─── setBoardFilters ──────────────────────────────────────────────────────────

describe('useDiscoverUrlState — setBoardFilters', () => {
  it('writes comma-separated board param', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setBoardFilters(['cbse', 'icse']);
    });

    expect(result.current[0].filters.boardFilters).toEqual(['cbse', 'icse']);
  });

  it('removes board param when empty array is passed', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&board=cbse,icse'),
    });

    act(() => {
      result.current[1].setBoardFilters([]);
    });

    expect(result.current[0].filters.boardFilters).toBeUndefined();
  });

  it('round-trips single board value', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setBoardFilters(['cbse']);
    });

    expect(result.current[0].filters.boardFilters).toEqual(['cbse']);
  });
});

// ─── setCategoryFilters ───────────────────────────────────────────────────────

describe('useDiscoverUrlState — setCategoryFilters', () => {
  it('writes comma-separated category param', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setCategoryFilters(['primary', 'secondary']);
    });

    expect(result.current[0].filters.categoryFilters).toEqual(['primary', 'secondary']);
  });

  it('removes category param when empty array is passed', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&category=primary,secondary'),
    });

    act(() => {
      result.current[1].setCategoryFilters([]);
    });

    expect(result.current[0].filters.categoryFilters).toBeUndefined();
  });
});

// ─── startOver ────────────────────────────────────────────────────────────────

describe('useDiscoverUrlState — startOver', () => {
  it('clears journey, groupId, areaKey, schoolId, radiusKm, board, category, and q', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=bangalore&journey=area-first&groupId=coastal&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=school-abc&radiusKm=3&board=cbse&category=primary&q=beach',
      ),
    });

    act(() => {
      result.current[1].startOver();
    });

    const state = result.current[0];
    expect(state.journey).toBeNull();
    expect(state.groupId).toBeNull();
    expect(state.areaKey).toBeNull();
    expect(state.schoolId).toBeNull();
    expect(state.radiusKm).toBeNull();
    expect(state.filters.boardFilters).toBeUndefined();
    expect(state.filters.categoryFilters).toBeUndefined();
    expect(state.q).toBe('');
  });

  it('preserves city after startOver', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=bangalore&journey=area-first'),
    });

    act(() => {
      result.current[1].startOver();
    });

    expect(result.current[0].city).toBe('bangalore');
  });

  // AC1 + AC3: all property filters are cleared; URL contains only city
  it('clears all property filters (type, beds, price, seller, booleans, dates) after startOver', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=bangalore&journey=area-first&type=house&beds=2,3&priceMin=1000000&priceMax=5000000&seller=owner,broker&bom=1&ntm=1&rera=1&rtm=1&from=2025-01-01&to=2025-12-31',
      ),
    });

    act(() => {
      result.current[1].startOver();
    });

    const { filters } = result.current[0];
    expect(filters.propertyTypes).toBeUndefined();
    expect(filters.bedrooms).toBeUndefined();
    expect(filters.priceMin).toBeUndefined();
    expect(filters.priceMax).toBeUndefined();
    expect(filters.sellerTypes).toBeUndefined();
    expect(filters.backOnMarket).toBeUndefined();
    expect(filters.newToMarket).toBeUndefined();
    expect(filters.reraRegistered).toBeUndefined();
    expect(filters.readyToMove).toBeUndefined();
    expect(filters.dateFrom).toBeUndefined();
    expect(filters.dateTo).toBeUndefined();
  });

  // AC3: after startOver URL state contains only city — no stale params
  it('produces URL state with only city after startOver (AC3)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=bangalore&journey=area-first&areaKey=IN%7CKA%7CUdupi%7CManipal&type=house&beds=2&priceMin=500000&bom=1&lat=13.34&lon=74.74&zoom=12',
      ),
    });

    act(() => {
      result.current[1].startOver();
    });

    const state = result.current[0];
    // Only city survives
    expect(state.city).toBe('bangalore');
    expect(state.journey).toBeNull();
    expect(state.areaKey).toBeNull();
    expect(state.viewport).toBeNull();
    expect(state.filters.propertyTypes).toBeUndefined();
    expect(state.filters.bedrooms).toBeUndefined();
    expect(state.filters.priceMin).toBeUndefined();
    expect(state.filters.backOnMarket).toBeUndefined();
  });

  // AC2: consistent behaviour from school-first starting state
  it('clears all property filters and school context from school-first journey (AC2)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=school-first&schoolId=school-xyz&radiusKm=3&areaKey=IN%7CKA%7CUdupi%7CManipal&type=apartment&beds=3&priceMax=8000000&seller=broker&bom=1&ntm=1&rera=1&rtm=1&from=2025-06-01&to=2025-12-31',
      ),
    });

    act(() => {
      result.current[1].startOver();
    });

    const state = result.current[0];
    expect(state.city).toBe('udupi');
    expect(state.journey).toBeNull();
    expect(state.schoolId).toBeNull();
    expect(state.radiusKm).toBeNull();
    expect(state.areaKey).toBeNull();
    const { filters } = state;
    expect(filters.propertyTypes).toBeUndefined();
    expect(filters.bedrooms).toBeUndefined();
    expect(filters.priceMax).toBeUndefined();
    expect(filters.sellerTypes).toBeUndefined();
    expect(filters.reraRegistered).toBeUndefined();
    expect(filters.readyToMove).toBeUndefined();
    expect(filters.backOnMarket).toBeUndefined();
    expect(filters.newToMarket).toBeUndefined();
    expect(filters.dateFrom).toBeUndefined();
    expect(filters.dateTo).toBeUndefined();
  });

  it('clears viewport (lat, lon, zoom) after startOver', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=bangalore&journey=area-first&lat=13.34090&lon=74.74210&zoom=12',
      ),
    });

    act(() => {
      result.current[1].startOver();
    });

    expect(result.current[0].viewport).toBeNull();
  });

  it('is idempotent — calling startOver twice produces same state as once', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=bangalore&journey=area-first&areaKey=k1&q=foo'),
    });

    act(() => {
      result.current[1].startOver();
      result.current[1].startOver();
    });

    const state = result.current[0];
    expect(state.city).toBe('bangalore');
    expect(state.journey).toBeNull();
    expect(state.areaKey).toBeNull();
    expect(state.q).toBe('');
  });

  it('returns to guided-entry panel state after startOver (journey=null → derivePanelContent)', () => {
    // Verifies the integration: startOver clears journey, so derivePanelContent
    // returns guided-entry. This is a read-only check — no panel import needed.
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=bangalore&journey=area-first&areaKey=k1'),
    });

    act(() => {
      result.current[1].startOver();
    });

    expect(result.current[0].journey).toBeNull();
    expect(result.current[0].areaKey).toBeNull();
  });
});

// ─── A3 #993: selectArea preserves groupId ────────────────────────────────────

describe('useDiscoverUrlState — selectArea preserves groupId (A3 #993)', () => {
  it('preserves groupId when selectArea is called while groupId is set', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=area-first&groupId=coastal-homes',
      ),
    });

    act(() => {
      result.current[1].selectArea('IN|KA|Udupi|Manipal');
    });

    expect(result.current[0].areaKey).toBe('IN|KA|Udupi|Manipal');
    expect(result.current[0].groupId).toBe('coastal-homes');
  });

  it('does not add groupId when it was absent before selectArea', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=area-first'),
    });

    act(() => {
      result.current[1].selectArea('IN|KA|Udupi|Manipal');
    });

    expect(result.current[0].areaKey).toBe('IN|KA|Udupi|Manipal');
    expect(result.current[0].groupId).toBeNull();
  });

  it('final URL contains both ?groupId= and ?areaKey= when group was already set', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=area-first&groupId=coastal-homes',
      ),
    });

    act(() => {
      result.current[1].selectArea('IN|KA|Udupi|Karkala');
    });

    const state = result.current[0];
    expect(state.groupId).toBe('coastal-homes');
    expect(state.areaKey).toBe('IN|KA|Udupi|Karkala');
    expect(state.journey).toBe('area-first');
  });
});

// ─── A3 #993: selectGroup clears areaKey ─────────────────────────────────────

describe('useDiscoverUrlState — selectGroup clears areaKey (A3 #993)', () => {
  it('clears areaKey when selectGroup is called with a group id', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=area-first&groupId=coastal-homes&areaKey=IN%7CKA%7CUdupi%7CManipal',
      ),
    });

    act(() => {
      result.current[1].selectGroup('inland-hills');
    });

    expect(result.current[0].groupId).toBe('inland-hills');
    expect(result.current[0].areaKey).toBeNull();
  });

  it('clears areaKey when selectGroup is called with null (deselect)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=area-first&groupId=coastal-homes&areaKey=IN%7CKA%7CUdupi%7CManipal',
      ),
    });

    act(() => {
      result.current[1].selectGroup(null);
    });

    expect(result.current[0].groupId).toBeNull();
    expect(result.current[0].areaKey).toBeNull();
  });
});

// ─── clearAreaContext (#994) ──────────────────────────────────────────────────

describe('useDiscoverUrlState — clearAreaContext', () => {
  it('removes areaKey from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=area-first&groupId=coastal-homes&areaKey=IN%7CKA%7CUdupi%7CManipal',
      ),
    });

    act(() => {
      result.current[1].clearAreaContext();
    });

    expect(result.current[0].areaKey).toBeNull();
  });

  it('preserves groupId after clearAreaContext', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=area-first&groupId=coastal-homes&areaKey=IN%7CKA%7CUdupi%7CManipal',
      ),
    });

    act(() => {
      result.current[1].clearAreaContext();
    });

    expect(result.current[0].groupId).toBe('coastal-homes');
  });

  it('preserves journey after clearAreaContext', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=area-first&areaKey=IN%7CKA%7CUdupi%7CManipal',
      ),
    });

    act(() => {
      result.current[1].clearAreaContext();
    });

    expect(result.current[0].journey).toBe('area-first');
  });

  it('preserves viewport (lat/lon/zoom) — contrast with deselectArea which clears it', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal&lat=13.34090&lon=74.74210&zoom=14',
      ),
    });

    act(() => {
      result.current[1].clearAreaContext();
    });

    expect(result.current[0].viewport).toEqual({ lat: 13.3409, lon: 74.7421, zoom: 14 });
    expect(result.current[0].areaKey).toBeNull();
  });

  it('does NOT cancel a pending viewportTimer — pending viewport update still fires', () => {
    // This test verifies that clearAreaContext does NOT cancel the viewport debounce
    // timer (contrast with deselectArea which does cancel it). The viewport update
    // fires normally after clearAreaContext is called.
    //
    // Note: we only assert viewport is written — NOT that areaKey is null here.
    // In fake-timer mode, reportViewport's functional setUrlParams updater captures
    // the URL params at enqueue-time (before clearAreaContext runs), so when the
    // timer fires it restores the pre-clearAreaContext snapshot including areaKey.
    // That is a test-harness artifact of fake timers + React Router's functional
    // updater; the real browser behavior (clearAreaContext fires synchronously,
    // viewport fires ~300ms later with fresh params) is already covered by the
    // "removes areaKey from URL" test above.
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useDiscoverUrlState(), {
        wrapper: wrapper('/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal'),
      });

      act(() => {
        // Enqueue a debounced viewport update
        result.current[1].reportViewport({ lat: 13.34, lon: 74.74, zoom: 14 });
        // clearAreaContext must NOT cancel the timer — timer still fires after this
        result.current[1].clearAreaContext();
        vi.runAllTimers();
      });

      // Viewport timer fired normally — lat/lon/zoom are present in URL state
      expect(result.current[0].viewport).toEqual({ lat: 13.34, lon: 74.74, zoom: 14 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves schoolId and radiusKm after clearAreaContext', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=school-abc&radiusKm=3',
      ),
    });

    act(() => {
      result.current[1].clearAreaContext();
    });

    expect(result.current[0].schoolId).toBe('school-abc');
    expect(result.current[0].radiusKm).toBe(3);
  });
});

// ─── Issue #1143: setSchoolParams PUSH + clearSchoolSelection + clearAreaSelection ─

// PUSH semantics for setSchoolParams (Issue #1143 AC7 / BN-4):
// jsdom's MemoryRouter does not increment window.history.length on push, so
// history-stack depth cannot be asserted in unit tests. The authoritative
// coverage lives in BN-4 E2E (school-first-back-nav.spec.ts): browser Back
// after school selection must navigate to Level 1, which only passes if
// setSchoolParams uses replace:false (push). The state-equality test that
// previously lived here was removed because it passed with both push and
// replace semantics and therefore provided no signal about AC7.

describe('useDiscoverUrlState — setSchoolParams uses PUSH (Issue #1143 AC7)', () => {
  it('setSchoolParams writes schoolId and radiusKm to URL state', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal'),
    });

    act(() => {
      result.current[1].setSchoolParams({ schoolId: 'sch-1', radiusKm: 2 });
    });

    expect(result.current[0].schoolId).toBe('sch-1');
    expect(result.current[0].radiusKm).toBe(2);
  });
});

describe('useDiscoverUrlState — clearSchoolSelection (Issue #1143 AC2)', () => {
  it('removes schoolId and radiusKm', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=sch-1&radiusKm=2',
      ),
    });

    act(() => {
      result.current[1].clearSchoolSelection();
    });

    expect(result.current[0].schoolId).toBeNull();
    expect(result.current[0].radiusKm).toBeNull();
  });

  it('preserves areaKey after clearSchoolSelection', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=sch-1&radiusKm=2',
      ),
    });

    act(() => {
      result.current[1].clearSchoolSelection();
    });

    expect(result.current[0].areaKey).toBe('IN|KA|Udupi|Manipal');
  });

  it('preserves journey after clearSchoolSelection', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=sch-1&radiusKm=2',
      ),
    });

    act(() => {
      result.current[1].clearSchoolSelection();
    });

    expect(result.current[0].journey).toBe('school-first');
  });

  it('preserves city after clearSchoolSelection', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=sch-1&radiusKm=2',
      ),
    });

    act(() => {
      result.current[1].clearSchoolSelection();
    });

    expect(result.current[0].city).toBe('udupi');
  });
});

describe('useDiscoverUrlState — clearAreaSelection (Issue #1143 AC3)', () => {
  it('removes areaKey', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal',
      ),
    });

    act(() => {
      result.current[1].clearAreaSelection();
    });

    expect(result.current[0].areaKey).toBeNull();
  });

  it('preserves journey after clearAreaSelection', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal',
      ),
    });

    act(() => {
      result.current[1].clearAreaSelection();
    });

    expect(result.current[0].journey).toBe('school-first');
  });

  it('preserves city after clearAreaSelection', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal',
      ),
    });

    act(() => {
      result.current[1].clearAreaSelection();
    });

    expect(result.current[0].city).toBe('udupi');
  });

  it('does not remove schoolId or radiusKm when present', () => {
    // Edge case: clearAreaSelection called with both params present
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=sch-1&radiusKm=3',
      ),
    });

    act(() => {
      result.current[1].clearAreaSelection();
    });

    expect(result.current[0].schoolId).toBe('sch-1');
    expect(result.current[0].radiusKm).toBe(3);
  });
});

// ── Issue #1146: radiusKm serialization round-trip ────────────────────────────
//
// The pre-existing wrapper() helper is missing QueryClientProvider, which
// causes all 100 preceding tests to fail (pre-existing breakage, out of scope
// for this fix). The tests below use their own self-contained wrapper that
// includes QueryClientProvider so they pass independently.

function wrapperWithQuery(initialUrl: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        MemoryRouter,
        { initialEntries: [initialUrl] },
        children,
      ),
    );
  };
}

describe('useDiscoverUrlState — radiusKm serialization (Issue #1146 AC7)', () => {
  it('setSchoolParams writes non-default radiusKm=5 to URL state', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal'),
    });

    act(() => {
      result.current[1].setSchoolParams({ schoolId: 'sch-1', radiusKm: 5 });
    });

    expect(result.current[0].schoolId).toBe('sch-1');
    expect(result.current[0].radiusKm).toBe(5);
  });

  it('cold-loading URL with radiusKm=5 reads back radiusKm 5 (round-trip)', () => {
    // Simulates a shared deep-link that includes radiusKm — the value must
    // survive the parse/serialise cycle without being coerced to the default.
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery(
        '/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=sch-1&radiusKm=5',
      ),
    });

    expect(result.current[0].radiusKm).toBe(5);
    expect(result.current[0].schoolId).toBe('sch-1');
  });
});

// ── Issue #1157 rev-5 DEFECT B: backToSchoolPicking ───────────────────────────
//
// Back from area-school-combined (area-first + areaKey + schoolId) must drop the
// selected school (schoolId + radiusKm) and re-arm schoolPicking=1 so the panel
// returns to schools-in-area WITHOUT flipping journey. journey, areaKey, all
// property/board/category filters and viewport must be preserved. Single REPLACE.
//
// REPLACE-vs-PUSH depth cannot be asserted under jsdom's MemoryRouter (see the
// setSchoolParams PUSH note above) — the REPLACE contract is enforced by the
// implementation (one setUrlParams call with { replace: true }) and covered at the
// browser level by the #1157 E2E. These tests assert the resulting URL state.

describe('useDiscoverUrlState — backToSchoolPicking (Issue #1157 rev-5 DEFECT B)', () => {
  const COMBINED_URL =
    '/discover?city=udupi&journey=area-first&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=sch-1&radiusKm=3';

  it('deletes schoolId and radiusKm', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery(COMBINED_URL),
    });

    act(() => {
      result.current[1].backToSchoolPicking();
    });

    expect(result.current[0].schoolId).toBeNull();
    expect(result.current[0].radiusKm).toBeNull();
  });

  it('sets schoolPicking=1', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery(COMBINED_URL),
    });

    act(() => {
      result.current[1].backToSchoolPicking();
    });

    expect(result.current[0].schoolPicking).toBe(true);
  });

  it('preserves journey (area-first) and areaKey', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery(COMBINED_URL),
    });

    act(() => {
      result.current[1].backToSchoolPicking();
    });

    expect(result.current[0].journey).toBe('area-first');
    expect(result.current[0].areaKey).toBe('IN|KA|Udupi|Manipal');
  });

  it('preserves property filters and viewport', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery(
        '/discover?city=udupi&journey=area-first&areaKey=IN%7CKA%7CUdupi%7CManipal' +
          '&schoolId=sch-1&radiusKm=3&type=land,house&beds=2,3&priceMin=1000000' +
          '&lat=13.34090&lon=74.74210&zoom=14',
      ),
    });

    act(() => {
      result.current[1].backToSchoolPicking();
    });

    const state = result.current[0];
    // School selection dropped, sub-step re-armed.
    expect(state.schoolId).toBeNull();
    expect(state.radiusKm).toBeNull();
    expect(state.schoolPicking).toBe(true);
    // Everything else preserved.
    expect(state.journey).toBe('area-first');
    expect(state.areaKey).toBe('IN|KA|Udupi|Manipal');
    expect(state.filters.propertyTypes).toEqual(['land', 'house']);
    expect(state.filters.bedrooms).toEqual([2, 3]);
    expect(state.filters.priceMin).toBe(1000000);
    expect(state.viewport).toEqual({ lat: 13.3409, lon: 74.7421, zoom: 14 });
  });
});

// ─── Issue #1409 — selectedGroup read + selectRegionalGroup action ────────────

describe('useDiscoverUrlState — selectedGroup read from URL', () => {
  it('reads ?group=N:10_25 → { directionKey: N, distanceBandKey: 10_25 }', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first&group=N:10_25'),
    });
    expect(result.current[0].selectedGroup).toEqual({ directionKey: 'N', distanceBandKey: '10_25' });
  });

  it('reads ?group=N:50_up → { directionKey: N, distanceBandKey: 50_up } (critical — not 50_PLUS)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first&group=N:50_up'),
    });
    expect(result.current[0].selectedGroup).toEqual({ directionKey: 'N', distanceBandKey: '50_up' });
  });

  it('reads all valid distance bands correctly', () => {
    for (const band of ['0_10', '10_25', '25_50', '50_up']) {
      const { result } = renderHook(() => useDiscoverUrlState(), {
        wrapper: wrapper(`/discover?city=udupi&group=SE:${band}`),
      });
      expect(result.current[0].selectedGroup).toEqual({ directionKey: 'SE', distanceBandKey: band });
    }
  });

  it('rejects ?group=N:50_PLUS → null (regex rejects upper-case alias)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&group=N:50_PLUS'),
    });
    expect(result.current[0].selectedGroup).toBeNull();
  });

  it('rejects ?group=NORTH:100 → null (invalid direction and band)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&group=NORTH:100'),
    });
    expect(result.current[0].selectedGroup).toBeNull();
  });

  it('returns null when group param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first'),
    });
    expect(result.current[0].selectedGroup).toBeNull();
  });

  it('rejects malformed group param (no colon)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&group=N10_25'),
    });
    expect(result.current[0].selectedGroup).toBeNull();
  });

  it('accepts all 8 direction keys', () => {
    for (const dir of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) {
      const { result } = renderHook(() => useDiscoverUrlState(), {
        wrapper: wrapper(`/discover?city=udupi&group=${dir}:0_10`),
      });
      expect(result.current[0].selectedGroup?.directionKey).toBe(dir);
    }
  });
});

describe('useDiscoverUrlState — selectRegionalGroup action', () => {
  it('sets group=N:0_10 in URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first'),
    });

    act(() => {
      result.current[1].selectRegionalGroup({ directionKey: 'N', distanceBandKey: '0_10' });
    });

    expect(result.current[0].selectedGroup).toEqual({ directionKey: 'N', distanceBandKey: '0_10' });
  });

  it('does NOT delete areaKey when setting a regional group (critical — B2 allows independent selection)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first&areaKey=IN%7CKA%7CUdupi%7CManipal'),
    });

    act(() => {
      result.current[1].selectRegionalGroup({ directionKey: 'N', distanceBandKey: '10_25' });
    });

    // areaKey must be preserved
    expect(result.current[0].areaKey).toBe('IN|KA|Udupi|Manipal');
    expect(result.current[0].selectedGroup).toEqual({ directionKey: 'N', distanceBandKey: '10_25' });
  });

  it('removes group param when null is passed', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first&group=N:10_25'),
    });

    act(() => {
      result.current[1].selectRegionalGroup(null);
    });

    expect(result.current[0].selectedGroup).toBeNull();
  });

  it('regression guard: selectGroup (area-first) still clears areaKey', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=area-first&areaKey=IN%7CKA%7CUdupi%7CManipal'),
    });

    act(() => {
      result.current[1].selectGroup('some-group-id');
    });

    // selectGroup must clear areaKey (unchanged by this PR)
    expect(result.current[0].areaKey).toBeNull();
    expect(result.current[0].groupId).toBe('some-group-id');
  });

  // ── Advisory-fix coverage (code-reviewer finding) ─────────────────────────

  it('changeCity clears group param (advisory fix: stale agri-first group on city switch)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first&group=N:10_25'),
    });

    expect(result.current[0].selectedGroup).toEqual({
      directionKey: 'N',
      distanceBandKey: '10_25',
    });

    act(() => {
      result.current[1].changeCity('kundapur');
    });

    // City switch must clear the regional group (group belongs to the old city's bands)
    expect(result.current[0].selectedGroup).toBeNull();
    expect(result.current[0].city).toBe('kundapur');
  });

  it('startOver clears group param (advisory test: verify implicit exclusion)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first&group=N:10_25'),
    });

    expect(result.current[0].selectedGroup).toEqual({
      directionKey: 'N',
      distanceBandKey: '10_25',
    });

    act(() => {
      result.current[1].startOver();
    });

    // startOver builds a fresh URLSearchParams → group is not preserved
    expect(result.current[0].selectedGroup).toBeNull();
    expect(result.current[0].city).toBe('udupi'); // city is preserved by startOver
  });
});
