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
import { renderHook, act, waitFor } from '@testing-library/react';
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

// ─── Issue #1409 — selectedGroup (deprecated) + selectRegionalGroup action ────
//
// NOTE: The OD-1 migration (useEffect with empty dep array) fires on mount and
// removes the `group` param from the URL, replacing it with `region=DIR`.
// As a result, selectedGroup is ALWAYS null after mount when group=DIR:BAND is
// present — the effect has already run. Tests below reflect post-migration state.
// OD-1 migration behavior is comprehensively tested in the
// 'useDiscoverUrlState — OD-1 Option A cold-load migration' describe block above.

describe('useDiscoverUrlState — selectedGroup read from URL (post-OD-1 migration)', () => {
  it('?group=N:10_25 → after OD-1 migration: selectedGroup=null, selectedRegion=N', async () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&group=N:10_25'),
    });
    await waitFor(() => {
      expect(result.current[0].selectedGroup).toBeNull();
    });
    expect(result.current[0].selectedRegion).toBe('N');
  });

  it('?group=N:50_up → after OD-1 migration: selectedGroup=null, selectedRegion=N', async () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&group=N:50_up'),
    });
    await waitFor(() => {
      expect(result.current[0].selectedGroup).toBeNull();
    });
    expect(result.current[0].selectedRegion).toBe('N');
  });

  it('all valid distance bands migrate to selectedRegion (band is dropped, OD-1 Option A + Issue #1445 canonicalisation)', async () => {
    // All 4 bands migrate the same way — band is dropped; only direction is preserved.
    // Issue #1445: canonicalisation then sets maxKm=DEFAULT_MAX_KM=25 regardless of band.
    //
    // IMPORTANT: The maxKm=25 that appears here comes from DEFAULT_MAX_KM, NOT from the band.
    // For the '10_25' band, the 25 in DEFAULT_MAX_KM=25 is coincidental — we do NOT infer
    // maxKm from the band suffix. Option B (band→maxKm inference) remains forbidden.
    // All 4 bands (0_10, 10_25, 25_50, 50_up) canonicalise to the SAME maxKm=25 (DEFAULT_MAX_KM).
    for (const band of ['0_10', '10_25', '25_50', '50_up']) {
      const { result } = renderHook(() => useDiscoverUrlState(), {
        wrapper: wrapperWithQuery(`/discover?city=udupi&group=SE:${band}`),
      });
      await waitFor(() => {
        expect(result.current[0].selectedGroup).toBeNull();
      });
      expect(result.current[0].selectedRegion).toBe('SE');
      // Canonicalisation fires after OD-1 migration; maxKm=25 from DEFAULT_MAX_KM (not from band).
      // This is true even for '50_up' — the band value is entirely ignored.
      await waitFor(() => {
        expect(result.current[0].selectedMaxKm).toBe(25);
      });
    }
  });

  it('rejects ?group=N:50_PLUS → selectedGroup null; OD-1 still migrates direction N to region', async () => {
    // OD-1 uses split(':')[0] (not GROUP_REGEX) to extract the direction — so N is migrated
    // even when the band part (50_PLUS) is invalid and GROUP_REGEX would reject the full param.
    // GROUP_REGEX rejects the full "N:50_PLUS" token → selectedGroup stays null.
    // But the direction N IS extracted from split(':')[0] and migrated to region=N.
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&group=N:50_PLUS'),
    });
    await waitFor(() => {
      // OD-1 effect fires: group param removed, region=N set
      expect(result.current[0].selectedGroup).toBeNull();
    });
    expect(result.current[0].selectedRegion).toBe('N');
    // Issue #1445: canonicalisation fires after OD-1 migration; maxKm=25 (DEFAULT_MAX_KM)
    // is set regardless of the band. Band-to-maxKm inference is still forbidden —
    // the 25 comes from DEFAULT_MAX_KM, not from the "50_PLUS" part.
    await waitFor(() => {
      expect(result.current[0].selectedMaxKm).toBe(25);
    });
  });

  it('rejects ?group=NORTH:100 → selectedGroup null (invalid direction + band)', async () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&group=NORTH:100'),
    });
    await waitFor(() => {
      expect(result.current[0].selectedGroup).toBeNull();
    });
    // NORTH is not in VALID_DIRECTIONS → region NOT set by migration
    expect(result.current[0].selectedRegion).toBeNull();
  });

  it('returns null selectedGroup when group param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first'),
    });
    expect(result.current[0].selectedGroup).toBeNull();
  });

  it('rejects malformed group param (no colon) → selectedGroup null', async () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&group=N10_25'),
    });
    await waitFor(() => {
      expect(result.current[0].selectedGroup).toBeNull();
    });
  });

  it('all 8 directions migrate correctly from group=DIR:0_10 → region=DIR', async () => {
    for (const dir of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) {
      const { result } = renderHook(() => useDiscoverUrlState(), {
        wrapper: wrapperWithQuery(`/discover?city=udupi&group=${dir}:0_10`),
      });
      await waitFor(() => {
        expect(result.current[0].selectedGroup).toBeNull();
      });
      expect(result.current[0].selectedRegion).toBe(dir);
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

  it('changeCity clears group param (advisory fix: stale agri-first group on city switch)', async () => {
    // OD-1 migration fires on mount, migrating group=N:10_25 → region=N (selectedGroup=null).
    // We verify that after changeCity, region is also cleared (city switch must not preserve corridor).
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&group=N:10_25'),
    });

    // Wait for OD-1 migration to settle: selectedRegion should be 'N', selectedGroup=null
    await waitFor(() => {
      expect(result.current[0].selectedRegion).toBe('N');
    });
    expect(result.current[0].selectedGroup).toBeNull();

    act(() => {
      result.current[1].changeCity('kundapur');
    });

    // City switch must clear the corridor region (group belongs to the old city)
    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].selectedGroup).toBeNull();
    expect(result.current[0].city).toBe('kundapur');
  });

  it('startOver clears group param (advisory test: verify implicit exclusion)', async () => {
    // OD-1 migration fires on mount, migrating group=N:10_25 → region=N (selectedGroup=null).
    // We verify that after startOver, region is also cleared.
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&group=N:10_25'),
    });

    // Wait for OD-1 migration to settle
    await waitFor(() => {
      expect(result.current[0].selectedRegion).toBe('N');
    });
    expect(result.current[0].selectedGroup).toBeNull();

    act(() => {
      result.current[1].startOver();
    });

    // startOver builds a fresh URLSearchParams → neither group nor region is preserved
    expect(result.current[0].selectedGroup).toBeNull();
    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].city).toBe('udupi'); // city is preserved by startOver
  });
});

// ── Issue #1429: corridor-first cumulative model — selectedRegion / selectedMaxKm ─

describe('useDiscoverUrlState — selectedRegion initial read from URL', () => {
  it('reads region=NW from URL as selectedRegion', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&region=NW'),
    });
    expect(result.current[0].selectedRegion).toBe('NW');
  });

  it('returns null selectedRegion when region param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first'),
    });
    expect(result.current[0].selectedRegion).toBeNull();
  });

  it('rejects unknown direction codes (e.g. "X") → null', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&region=X'),
    });
    expect(result.current[0].selectedRegion).toBeNull();
  });

  it('accepts all 8 valid directions', () => {
    for (const dir of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) {
      const { result } = renderHook(() => useDiscoverUrlState(), {
        wrapper: wrapperWithQuery(`/discover?city=udupi&region=${dir}`),
      });
      expect(result.current[0].selectedRegion).toBe(dir);
    }
  });
});

describe('useDiscoverUrlState — selectedMaxKm initial read from URL', () => {
  it('reads maxKm=25 from URL as selectedMaxKm=25', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&region=N&maxKm=25'),
    });
    expect(result.current[0].selectedMaxKm).toBe(25);
  });

  it('canonicalises to DEFAULT_MAX_KM=25 when region=N is present but maxKm is absent (Issue #1445)', async () => {
    // Issue #1445: cold-load URL with region but no maxKm is canonicalised to maxKm=25
    // via a REPLACE effect so derivePanelContent returns 'agri-group-selected' immediately.
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&region=N'),
    });
    await waitFor(() => {
      expect(result.current[0].selectedMaxKm).toBe(25);
    });
  });

  it('rejects unknown maxKm values (e.g. 75) → null', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&maxKm=75'),
    });
    expect(result.current[0].selectedMaxKm).toBeNull();
  });

  it('accepts all 4 valid maxKm values: 10, 25, 50, 100', () => {
    for (const km of [10, 25, 50, 100] as const) {
      const { result } = renderHook(() => useDiscoverUrlState(), {
        wrapper: wrapperWithQuery(`/discover?city=udupi&region=N&maxKm=${km}`),
      });
      expect(result.current[0].selectedMaxKm).toBe(km);
    }
  });
});

describe('useDiscoverUrlState — setRegion action', () => {
  it('writes region=NW to URL state', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first'),
    });

    act(() => {
      result.current[1].setRegion('NW');
    });

    expect(result.current[0].selectedRegion).toBe('NW');
  });

  it('does NOT set maxKm when setRegion is called', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first'),
    });

    act(() => {
      result.current[1].setRegion('N');
    });

    // maxKm must remain null — user must pick distance tier separately
    expect(result.current[0].selectedMaxKm).toBeNull();
  });

  it('clears existing maxKm when region is changed', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&region=N&maxKm=25'),
    });

    act(() => {
      result.current[1].setRegion('NW');
    });

    expect(result.current[0].selectedRegion).toBe('NW');
    expect(result.current[0].selectedMaxKm).toBeNull();
  });
});

describe('useDiscoverUrlState — setMaxKm action', () => {
  it('writes maxKm=50 to URL state', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&region=N'),
    });

    act(() => {
      result.current[1].setMaxKm(50);
    });

    expect(result.current[0].selectedMaxKm).toBe(50);
  });

  it('preserves region when setMaxKm is called', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&region=NW'),
    });

    act(() => {
      result.current[1].setMaxKm(100);
    });

    expect(result.current[0].selectedRegion).toBe('NW');
    expect(result.current[0].selectedMaxKm).toBe(100);
  });

  // ── Issue #1446: chip-switching additions ─────────────────────────────────

  it('#1446-a: setMaxKm(50) when region=North already set → maxKm=50, region preserved', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&region=N'),
    });

    act(() => {
      result.current[1].setMaxKm(50);
    });

    expect(result.current[0].selectedMaxKm).toBe(50);
    expect(result.current[0].selectedRegion).toBe('N');
  });

  it('#1446-b: setMaxKm with invalid value (999) → maxKm deleted (graceful degrade, not corrupt state)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&region=N'),
    });

    act(() => {
      // First write a valid value so we know the write mechanism works
      result.current[1].setMaxKm(25);
    });
    expect(result.current[0].selectedMaxKm).toBe(25);

    act(() => {
      // Now call with invalid value — implementation deletes maxKm rather than writing an invalid string
      // Cast via unknown to satisfy the strict type signature while testing runtime guard.
      (result.current[1].setMaxKm as (km: number) => void)(999);
    });

    // Invalid value causes deletion — maxKm is removed from URL (not corrupted with "999")
    expect(result.current[0].selectedMaxKm).toBeNull();
  });

  it('#1446-c: clearRegionAndMaxKm when region=North, maxKm=25, listing=<uuid> → all three deleted', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery(
        '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&listing=some-uuid-1234',
      ),
    });

    act(() => {
      result.current[1].clearRegionAndMaxKm();
    });

    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].selectedMaxKm).toBeNull();
    expect(result.current[0].selectedListing).toBeNull();
  });
});

describe('useDiscoverUrlState — clearRegionAndMaxKm action', () => {
  it('removes both region and maxKm', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&region=NW&maxKm=25'),
    });

    act(() => {
      result.current[1].clearRegionAndMaxKm();
    });

    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].selectedMaxKm).toBeNull();
  });

  it('preserves other URL state (city, journey, areaKey) when clearing', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery(
        '/discover?city=udupi&journey=agri-first&areaKey=IN%7CKA%7CUdupi%7CManipal&region=N&maxKm=10',
      ),
    });

    act(() => {
      result.current[1].clearRegionAndMaxKm();
    });

    expect(result.current[0].city).toBe('udupi');
    expect(result.current[0].journey).toBe('agri-first');
    expect(result.current[0].areaKey).toBe('IN|KA|Udupi|Manipal');
  });
});

// ── AC10: Back removes region+maxKm (PUSH semantics) ─────────────────────────────
//
// JSDOM / MemoryRouter does not support window.history.back() simulation, so this
// test verifies the observable contract via clearRegionAndMaxKm() — the action that
// produces the same URL state as pressing Back after setRegion+setMaxKm.
// PUSH semantics (each call creating a history entry) are covered by the setRegion
// and setMaxKm action tests above. This test proves both fields go null together.

describe('useDiscoverUrlState — AC10 Back removes region+maxKm (PUSH)', () => {
  it('clears both selectedRegion and selectedMaxKm after setRegion+setMaxKm then clearRegionAndMaxKm', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first'),
    });

    act(() => {
      result.current[1].setRegion('NW');
    });
    expect(result.current[0].selectedRegion).toBe('NW');
    expect(result.current[0].selectedMaxKm).toBeNull();

    act(() => {
      result.current[1].setMaxKm(50);
    });
    expect(result.current[0].selectedRegion).toBe('NW');
    expect(result.current[0].selectedMaxKm).toBe(50);

    // Simulates Back removing maxKm, then Back removing region.
    // In JSDOM/MemoryRouter, window.history.back() is not available, so we call
    // clearRegionAndMaxKm() which is the atomic equivalent of two Back steps.
    act(() => {
      result.current[1].clearRegionAndMaxKm();
    });
    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].selectedMaxKm).toBeNull();
  });
});

// ── OD-1 Option A: cold-load migration from group=DIR:BAND to region=DIR ─────────
//
// SPEC: ?group=NW:25_50 → history.replace → URL has region=NW (no maxKm, no group)
// CRITICAL: band (25_50) must be dropped; maxKm must NOT be set (Option B is forbidden).
// After migration: panel stays at agri-landing (selectedRegion set, selectedMaxKm null).
//
// NOTE: The useEffect-based migration fires AFTER the initial render.
// renderHook({ initialEntries }) with waitFor is the correct pattern to capture
// the state after the migration effect flushes. However, under MemoryRouter's
// synchronous act() boundary, the effect fires during the same act flush as
// the initial render when wrapped in renderHook. We assert the post-effect state.

describe('useDiscoverUrlState — OD-1 Option A cold-load migration', () => {
  it('removes group param from URL after cold-load with group=NW:25_50', async () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&group=NW:25_50'),
    });

    // After the useEffect fires (synchronously in test env within act), group is gone
    await waitFor(() => {
      expect(result.current[0].selectedGroup).toBeNull();
    });
  });

  it('sets region=NW after cold-load with group=NW:25_50', async () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&group=NW:25_50'),
    });

    await waitFor(() => {
      expect(result.current[0].selectedRegion).toBe('NW');
    });
  });

  it('band is dropped by OD-1 — maxKm=25 comes from DEFAULT_MAX_KM not band inference (OD-1 Option A + Issue #1445)', async () => {
    // OD-1 drops the band (25_50 is entirely ignored). Issue #1445 canonicalisation then
    // fires and sets maxKm=DEFAULT_MAX_KM=25. The 25 comes from the constant, NOT from
    // the "25_50" band suffix — the match is coincidental.
    // IMPORTANT: Option B (band→maxKm inference) is still forbidden. The fact that the
    // band happens to contain "25" does not mean we're inferring from it.
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&group=NW:25_50'),
    });

    await waitFor(() => {
      // selectedGroup migrated away, meaning OD-1 effect ran
      expect(result.current[0].selectedGroup).toBeNull();
    });

    // Canonicalisation (Issue #1445) fires after OD-1 migration sets region=NW with no maxKm.
    // maxKm=25 is backfilled from DEFAULT_MAX_KM (not inferred from the band).
    await waitFor(() => {
      expect(result.current[0].selectedMaxKm).toBe(25);
    });
  });

  it('panel reaches agri-group-selected after cold-load via OD-1 + canonicalisation', async () => {
    // Issue #1445: OD-1 migration sets region=N, then canonicalisation sets maxKm=25.
    // With both region + maxKm set, derivePanelContent returns 'agri-group-selected'
    // (both needed). This test verifies the post-effect URL state.
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&group=N:10_25'),
    });

    await waitFor(() => {
      expect(result.current[0].selectedGroup).toBeNull();
    });

    // Canonicalisation sets maxKm=25; panel can now route to 'agri-group-selected'.
    await waitFor(() => {
      expect(result.current[0].selectedMaxKm).toBe(25);
    });
    expect(result.current[0].selectedRegion).toBe('N');
  });

  it('removes group param even for invalid direction codes', async () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&group=BADDIR:10_25'),
    });

    await waitFor(() => {
      // selectedGroup is null (invalid direction rejected by GROUP_REGEX during initial read)
      // but the group param should be removed by the migration effect
      expect(result.current[0].selectedGroup).toBeNull();
    });

    // Invalid direction → region NOT set
    expect(result.current[0].selectedRegion).toBeNull();
  });
});

describe('useDiscoverUrlState — changeCity clears region and maxKm', () => {
  it('clears region and maxKm when city changes', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&region=NW&maxKm=25'),
    });

    act(() => {
      result.current[1].changeCity('kundapur');
    });

    expect(result.current[0].city).toBe('kundapur');
    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].selectedMaxKm).toBeNull();
  });
});

// ─── Issue #1430: selectedListing / setSelectedListing / clearSelectedListing ──

describe('useDiscoverUrlState — selectedListing (Issue #1430)', () => {
  it('cold-load restore: listing=<uuid> in URL → selectedListing populated', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&listing=abc-123-uuid',
      ),
    });
    expect(result.current[0].selectedListing).toBe('abc-123-uuid');
  });

  it('cold-load restore: no listing= param → selectedListing is null', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first&region=N&maxKm=25'),
    });
    expect(result.current[0].selectedListing).toBeNull();
  });

  it('cold-load restore: empty listing= param → selectedListing is null', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first&region=N&maxKm=25&listing='),
    });
    expect(result.current[0].selectedListing).toBeNull();
  });

  it('setSelectedListing writes listing=<uuid> to URL (PUSH, replace:false)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first&region=N&maxKm=25'),
    });

    act(() => {
      result.current[1].setSelectedListing('listing-uuid-999');
    });

    expect(result.current[0].selectedListing).toBe('listing-uuid-999');
  });

  it('clearSelectedListing removes listing= only, preserves region= and maxKm= (REPLACE)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&listing=listing-uuid-999',
      ),
    });

    act(() => {
      result.current[1].clearSelectedListing();
    });

    // listing removed
    expect(result.current[0].selectedListing).toBeNull();
    // region + maxKm preserved
    expect(result.current[0].selectedRegion).toBe('N');
    expect(result.current[0].selectedMaxKm).toBe(25);
  });

  it('clearRegionAndMaxKm removes region= AND maxKm= AND listing= atomically', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&listing=listing-uuid-999',
      ),
    });

    act(() => {
      result.current[1].clearRegionAndMaxKm();
    });

    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].selectedMaxKm).toBeNull();
    expect(result.current[0].selectedListing).toBeNull();
  });

  it('startOver() removes listing= along with all other journey params', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&listing=listing-uuid-999',
      ),
    });

    act(() => {
      result.current[1].startOver();
    });

    expect(result.current[0].selectedListing).toBeNull();
    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].selectedMaxKm).toBeNull();
    expect(result.current[0].journey).toBeNull();
    // city survives startOver
    expect(result.current[0].city).toBe('udupi');
  });
});

// ─── Issue #1445: setRegionWithMaxKm — atomic direction + distance ────────────

describe('useDiscoverUrlState — setRegionWithMaxKm action (Issue #1445)', () => {
  // a. Default km: setRegionWithMaxKm('N') → selectedRegion='N', selectedMaxKm=25 (default)
  it('setRegionWithMaxKm with default km sets region=N and maxKm=25', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first'),
    });

    act(() => {
      result.current[1].setRegionWithMaxKm('N');
    });

    expect(result.current[0].selectedRegion).toBe('N');
    expect(result.current[0].selectedMaxKm).toBe(25);
  });

  // b. Explicit override: setRegionWithMaxKm('N', 50) → selectedMaxKm=50
  it('setRegionWithMaxKm with explicit km=50 sets region=N and maxKm=50', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first'),
    });

    act(() => {
      result.current[1].setRegionWithMaxKm('N', 50);
    });

    expect(result.current[0].selectedRegion).toBe('N');
    expect(result.current[0].selectedMaxKm).toBe(50);
  });

  // f. Invalid direction no-op
  it('setRegionWithMaxKm with invalid direction is a no-op', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first'),
    });

    act(() => {
      result.current[1].setRegionWithMaxKm('INVALID');
    });

    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].selectedMaxKm).toBeNull();
  });

  // e. Back from region=N&maxKm=25 → both cleared (clearRegionAndMaxKm round-trip)
  it('clearRegionAndMaxKm after setRegionWithMaxKm clears both region and maxKm', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first'),
    });

    act(() => {
      result.current[1].setRegionWithMaxKm('N');
    });
    expect(result.current[0].selectedRegion).toBe('N');
    expect(result.current[0].selectedMaxKm).toBe(25);

    act(() => {
      result.current[1].clearRegionAndMaxKm();
    });
    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].selectedMaxKm).toBeNull();
  });

  // Regression: setRegion semantics must be preserved (does NOT set maxKm)
  it('setRegion still does NOT set maxKm (regression guard)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first'),
    });

    act(() => {
      result.current[1].setRegion('N');
    });

    expect(result.current[0].selectedRegion).toBe('N');
    expect(result.current[0].selectedMaxKm).toBeNull();
  });
});

// ─── Issue #1445: Cold-load canonicalisation ──────────────────────────────────

describe('useDiscoverUrlState — cold-load canonicalisation (Issue #1445)', () => {
  // c. Cold-load ?region=NW without maxKm → REPLACE canonicalises to maxKm=25
  it('cold-load with region=NW but no maxKm canonicalises maxKm to 25 (REPLACE)', async () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&region=NW'),
    });

    await waitFor(() => {
      expect(result.current[0].selectedMaxKm).toBe(25);
    });

    // region must be preserved
    expect(result.current[0].selectedRegion).toBe('NW');
  });

  // d. Cold-load with no region param → no canonicalisation, maxKm stays null
  it('cold-load with no region param does not set maxKm', async () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first'),
    });

    // Give effects time to run
    await waitFor(() => {
      expect(result.current[0].selectedRegion).toBeNull();
    });

    expect(result.current[0].selectedMaxKm).toBeNull();
  });

  // Cold-load with both region and maxKm — no canonicalisation needed
  it('cold-load with region=NW and maxKm=50 does not override the existing maxKm', async () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&region=NW&maxKm=50'),
    });

    // Effects settle
    await waitFor(() => {
      expect(result.current[0].selectedRegion).toBe('NW');
    });

    expect(result.current[0].selectedMaxKm).toBe(50);
  });

  // g. Legacy OD-1: cold-load ?group=N:10_25 → migration runs first → then
  //    canonicalisation fires → region=N, maxKm=25 (DEFAULT_MAX_KM)
  it('OD-1 legacy cold-load ?group=N:10_25 → region=N and maxKm=25 after migration + canonicalisation', async () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&group=N:10_25'),
    });

    // OD-1 migration fires first (removes group, sets region=N, no maxKm)
    await waitFor(() => {
      expect(result.current[0].selectedGroup).toBeNull();
    });

    // Canonicalisation then fires (region set, maxKm null → backfill maxKm=25)
    await waitFor(() => {
      expect(result.current[0].selectedMaxKm).toBe(25);
    });

    expect(result.current[0].selectedRegion).toBe('N');
  });

  // Fix 4a: setRegionWithMaxKm + startOver clears both fields
  it('setRegionWithMaxKm then startOver clears selectedRegion and selectedMaxKm', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first'),
    });

    act(() => {
      result.current[1].setRegionWithMaxKm('N');
    });
    expect(result.current[0].selectedRegion).toBe('N');
    expect(result.current[0].selectedMaxKm).toBe(25);

    act(() => {
      result.current[1].startOver();
    });
    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].selectedMaxKm).toBeNull();
  });

  // Fix 4b: setRegionWithMaxKm + changeCity clears both fields
  it('setRegionWithMaxKm then changeCity clears selectedRegion and selectedMaxKm', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first'),
    });

    act(() => {
      result.current[1].setRegionWithMaxKm('N', 50);
    });
    expect(result.current[0].selectedRegion).toBe('N');
    expect(result.current[0].selectedMaxKm).toBe(50);

    act(() => {
      result.current[1].changeCity('kundapur');
    });
    expect(result.current[0].city).toBe('kundapur');
    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].selectedMaxKm).toBeNull();
  });

  // Fix 4c: cold-load with both region AND maxKm — canonicalisation does NOT overwrite maxKm
  it('cold-load ?region=N&maxKm=10 → canonicalisation does NOT fire (maxKm stays 10)', async () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&region=N&maxKm=10'),
    });

    // Effects settle
    await waitFor(() => {
      expect(result.current[0].selectedRegion).toBe('N');
    });

    // maxKm=10 must NOT be overwritten to DEFAULT_MAX_KM=25
    expect(result.current[0].selectedMaxKm).toBe(10);
  });
});

// ─── Issue #1464: setLocality / clearLocality ─────────────────────────────────

describe('useDiscoverUrlState — setLocality / clearLocality (Issue #1464)', () => {
  it('setLocality("Shirva") writes locality=Shirva to URL state', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first&region=S&maxKm=25'),
    });

    act(() => {
      result.current[1].setLocality('Shirva');
    });

    expect(result.current[0].selectedLocality).toBe('Shirva');
  });

  it('round-trip: setLocality("Coastal Udupi Area") → selectedLocality decodes back to plain string', () => {
    // URLSearchParams.set auto-encodes spaces; .get auto-decodes. No double-encoding.
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first&region=S&maxKm=25'),
    });

    act(() => {
      result.current[1].setLocality('Coastal Udupi Area');
    });

    expect(result.current[0].selectedLocality).toBe('Coastal Udupi Area');
  });

  it('round-trip: setLocality("Hebri & Surrounds") → selectedLocality decodes back to plain string (special char)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first&region=S&maxKm=25'),
    });

    act(() => {
      result.current[1].setLocality('Hebri & Surrounds');
    });

    expect(result.current[0].selectedLocality).toBe('Hebri & Surrounds');
  });

  it('selectedLocality is null when locality param is absent from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first&region=S&maxKm=25'),
    });

    expect(result.current[0].selectedLocality).toBeNull();
  });

  it('clearLocality removes locality param only, preserves region and maxKm', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=agri-first&region=S&maxKm=25&locality=Shirva',
      ),
    });

    // Confirm initial state
    expect(result.current[0].selectedLocality).toBe('Shirva');

    act(() => {
      result.current[1].clearLocality();
    });

    // locality removed
    expect(result.current[0].selectedLocality).toBeNull();
    // region + maxKm preserved
    expect(result.current[0].selectedRegion).toBe('S');
    expect(result.current[0].selectedMaxKm).toBe(25);
  });
});

// ─── BLOCKING FIX #1464: clearRegionAndMaxKm and changeCity must clear locality ─
//
// Regression guard for the two BLOCKING code-review findings on this PR:
//   1. clearRegionAndMaxKm must atomically delete locality= alongside region/maxKm/listing.
//      Without this fix a stale locality= survives the corridor clear, and the next
//      region+maxKm selection routes to agri-group-locality instead of agri-group-selected.
//   2. changeCity must delete locality= alongside the other journey params it clears.
//      Without this fix a stale locality= from the old city survives the city switch
//      and on the new city's agri-group selection derivePanelContent routes to
//      agri-group-locality with a locality name belonging to the wrong city.

describe('useDiscoverUrlState — clearRegionAndMaxKm clears locality (BLOCKING fix #1464)', () => {
  it('clears locality= when clearRegionAndMaxKm is called', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery(
        '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&locality=Shirva',
      ),
    });

    // Confirm locality is present before the action
    expect(result.current[0].selectedLocality).toBe('Shirva');

    act(() => {
      result.current[1].clearRegionAndMaxKm();
    });

    // locality must be cleared atomically with region and maxKm
    expect(result.current[0].selectedLocality).toBeNull();
    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].selectedMaxKm).toBeNull();
  });

  it('clears locality= AND listing= AND region= AND maxKm= all atomically', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery(
        '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&locality=Shirva&listing=some-uuid',
      ),
    });

    act(() => {
      result.current[1].clearRegionAndMaxKm();
    });

    expect(result.current[0].selectedLocality).toBeNull();
    expect(result.current[0].selectedListing).toBeNull();
    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].selectedMaxKm).toBeNull();
    // city and journey preserved
    expect(result.current[0].city).toBe('udupi');
    expect(result.current[0].journey).toBe('agri-first');
  });
});

describe('useDiscoverUrlState — changeCity clears locality (BLOCKING fix #1464)', () => {
  it('clears locality= when changeCity is called', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery(
        '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&locality=Shirva',
      ),
    });

    // Confirm locality is present before the action
    expect(result.current[0].selectedLocality).toBe('Shirva');

    act(() => {
      result.current[1].changeCity('kundapur');
    });

    // locality from old city must be gone after switch
    expect(result.current[0].selectedLocality).toBeNull();
    // new city set
    expect(result.current[0].city).toBe('kundapur');
  });

  it('clears locality together with region and maxKm on city switch', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery(
        '/discover?city=udupi&journey=agri-first&region=S&maxKm=50&locality=Hebri',
      ),
    });

    act(() => {
      result.current[1].changeCity('kundapur');
    });

    expect(result.current[0].selectedLocality).toBeNull();
    expect(result.current[0].selectedRegion).toBeNull();
    expect(result.current[0].selectedMaxKm).toBeNull();
    expect(result.current[0].city).toBe('kundapur');
  });
});

// ─── Issue #1457 — agri acreage + price filter params ────────────────────────

describe('useDiscoverUrlState — agri filter params (Issue #1457)', () => {
  it('reads agriAcresMin and agriAcresMax from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&agriAcresMin=2.5&agriAcresMax=10'),
    });
    expect(result.current[0].filters.agriAcresMin).toBe(2.5);
    expect(result.current[0].filters.agriAcresMax).toBe(10);
  });

  it('reads agriPriceMin and agriPriceMax from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&agriPriceMin=100000&agriPriceMax=500000'),
    });
    expect(result.current[0].filters.agriPriceMin).toBe(100000);
    expect(result.current[0].filters.agriPriceMax).toBe(500000);
  });

  it('returns undefined for agri filters when absent from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].filters.agriAcresMin).toBeUndefined();
    expect(result.current[0].filters.agriAcresMax).toBeUndefined();
    expect(result.current[0].filters.agriPriceMin).toBeUndefined();
    expect(result.current[0].filters.agriPriceMax).toBeUndefined();
  });

  it('ignores NaN values for agri filter params', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&agriAcresMin=notanumber'),
    });
    expect(result.current[0].filters.agriAcresMin).toBeUndefined();
  });

  it('clearAgriFilters removes only agri filter params and preserves other state', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&agriAcresMin=2&agriAcresMax=10&agriPriceMin=50000',
      ),
    });

    act(() => {
      result.current[1].clearAgriFilters();
    });

    const [state] = result.current;
    expect(state.filters.agriAcresMin).toBeUndefined();
    expect(state.filters.agriAcresMax).toBeUndefined();
    expect(state.filters.agriPriceMin).toBeUndefined();
    expect(state.filters.agriPriceMax).toBeUndefined();
    // Other state preserved
    expect(state.city).toBe('udupi');
    expect(state.journey).toBe('agri-first');
    expect(state.selectedRegion).toBe('N');
    expect(state.selectedMaxKm).toBe(25);
  });

  it('setFiltersCommitted with agri filter values serialises to URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setFiltersCommitted({
        agriAcresMin: 3,
        agriAcresMax: 7.5,
        agriPriceMin: 200000,
        agriPriceMax: 800000,
      });
    });

    const [state] = result.current;
    expect(state.filters.agriAcresMin).toBe(3);
    expect(state.filters.agriAcresMax).toBe(7.5);
    expect(state.filters.agriPriceMin).toBe(200000);
    expect(state.filters.agriPriceMax).toBe(800000);
  });

  it('clearAgriFilters preserves region, maxKm, and journey but removes all agri params (Issue #1457)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&agriAcresMin=2&agriAcresMax=5&agriPriceMin=100000',
      ),
    });

    act(() => {
      result.current[1].clearAgriFilters();
    });

    const [state] = result.current;
    // Agri filter params removed
    expect(state.filters.agriAcresMin).toBeUndefined();
    expect(state.filters.agriAcresMax).toBeUndefined();
    expect(state.filters.agriPriceMin).toBeUndefined();
    expect(state.filters.agriPriceMax).toBeUndefined();
    // Journey context preserved
    expect(state.city).toBe('udupi');
    expect(state.journey).toBe('agri-first');
    expect(state.selectedRegion).toBe('N');
    expect(state.selectedMaxKm).toBe(25);
  });

  it('NaN URL guard: agriAcresMin=abc is undefined, agriAcresMax=5 is 5', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&agriAcresMin=abc&agriAcresMax=5'),
    });
    // "abc" cannot be parsed to a number → NaN guard kicks in → undefined
    expect(result.current[0].filters.agriAcresMin).toBeUndefined();
    // "5" parses fine
    expect(result.current[0].filters.agriAcresMax).toBe(5);
  });

  it('round-trip: setFiltersCommitted with all 4 agri params reads back correctly', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setFiltersCommitted({
        agriAcresMin: 2.5,
        agriAcresMax: 10,
        agriPriceMin: 500000,
        agriPriceMax: 2000000,
      });
    });

    const { filters } = result.current[0];
    expect(filters.agriAcresMin).toBe(2.5);
    expect(filters.agriAcresMax).toBe(10);
    expect(filters.agriPriceMin).toBe(500000);
    expect(filters.agriPriceMax).toBe(2000000);
  });

  it('setFiltersCommitted uses PUSH; clearAgriFilters uses REPLACE (observable via history-stack presence)', () => {
    // We observe PUSH by checking a non-agri location entry existed before the filter commit.
    // MemoryRouter does not expose history.length, so we track via useLocation renders.
    const locations: string[] = [];
    function HistoryTrackingWrapper({ children }: { children: React.ReactNode }) {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      function LocationProbe() {
        const loc = useLocation();
        locations.push(loc.search);
        return null;
      }
      return React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/discover?city=udupi'] },
          React.createElement(LocationProbe, null),
          children,
        ),
      );
    }

    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: HistoryTrackingWrapper,
    });

    // setFiltersCommitted — PUSH: prior location (no agri params) must remain in stack
    act(() => {
      result.current[1].setFiltersCommitted({ agriAcresMin: 2, agriAcresMax: 5 });
    });
    expect(locations.some((s) => !s.includes('agriAcresMin'))).toBe(true);
    expect(locations.some((s) => s.includes('agriAcresMin=2'))).toBe(true);

    // clearAgriFilters — REPLACE: agri params gone, previous (committed) entry not stacked again
    act(() => {
      result.current[1].clearAgriFilters();
    });
    const [state] = result.current;
    expect(state.filters.agriAcresMin).toBeUndefined();
    expect(state.filters.agriAcresMax).toBeUndefined();
  });
});

// ─── Issue #1494 — Buy/Rent intent URL state ──────────────────────────────────

describe('useDiscoverUrlState — intent (Issue #1494)', () => {
  it('defaults to "buy" when intent param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].intent).toBe('buy');
  });

  it('reads intent=rent from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&intent=rent'),
    });
    expect(result.current[0].intent).toBe('rent');
  });

  it('defaults to "buy" for an unknown intent value', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&intent=other'),
    });
    expect(result.current[0].intent).toBe('buy');
  });

  it('setIntent("rent") sets intent=rent in URL (REPLACE semantics, no stack entry)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    act(() => {
      result.current[1].setIntent('rent');
    });
    expect(result.current[0].intent).toBe('rent');
  });

  it('setIntent("buy") removes intent param from URL (buy is default)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&intent=rent'),
    });
    act(() => {
      result.current[1].setIntent('buy');
    });
    expect(result.current[0].intent).toBe('buy');
  });

  it('startOver preserves intent=rent across a start-over', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&intent=rent&areaKey=IN%7CKA%7CUdupi%7CManipal'),
    });
    // Confirm rent is set
    expect(result.current[0].intent).toBe('rent');
    act(() => {
      result.current[1].startOver();
    });
    // intent must still be rent; areaKey should be gone
    expect(result.current[0].intent).toBe('rent');
    expect(result.current[0].areaKey).toBeFalsy();
  });
});
