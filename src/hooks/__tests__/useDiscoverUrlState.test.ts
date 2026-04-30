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
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { useDiscoverUrlState } from '../useDiscoverUrlState';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wrapper(initialUrl: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      MemoryRouter,
      { initialEntries: [initialUrl] },
      children,
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
    expect(filters.sellerType).toBe('owner');
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
    expect(filters.sellerType).toBeUndefined();
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
        sellerType: 'owner',
      });
    });

    const { filters } = result.current[0];
    expect(filters.propertyTypes).toEqual(['land']);
    expect(filters.bedrooms).toEqual([2, 3]);
    expect(filters.priceMin).toBe(1000000);
    expect(filters.priceMax).toBe(5000000);
    expect(filters.sellerType).toBe('owner');
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
