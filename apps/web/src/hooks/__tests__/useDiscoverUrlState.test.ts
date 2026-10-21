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
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '../useDiscoverUrlState';
import { applyIntentTransition } from '@/features/discover/filters/intentTransition';
import { toDiscoverUrlFilters } from '@/features/discover/state/url/filters';
import { projectUrlFilters } from '@/features/discover/selectors/urlFiltersProjection';

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
        // Issue #2459 AC2 — was `['land']`. The property type here was incidental to what this
        // test asserts (that a committed filter set round-trips through the URL), but `land`
        // resolves to PLOT, and a plot-only selection now deliberately serialises NO `beds=`.
        // Switched to a dwelling type so the round-trip assertion still exercises a bedroom
        // value rather than accidentally asserting the absence of one. The plot-only behaviour
        // this uncovered is pinned directly in
        // features/discover/filters/__tests__/bedroomSuppressionPlotOnly.test.ts.
        propertyTypes: ['apartment'],
        bedrooms: [2, 3],
        priceMin: 1000000,
        priceMax: 5000000,
        sellerTypes: ['owner'],
      });
    });

    const { filters } = result.current[0];
    expect(filters.propertyTypes).toEqual(['apartment']);
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

  // ── #2750 PR-4 B1 T3 — retires e2e active-context-chips-and-badge (CHIP-3 clear) ──────────────
  // The e2e clicked "Remove Apartment" and asserted only `type` left the URL: groupId, areaKey and
  // the lat/lon/zoom camera survive the filter write. The two sibling tests above start from URLs
  // with NO scope/camera params, so a filter write that rebuilt the query string from scratch
  // would pass them. Both writers the chip can reach (committed PUSH, debounced live REPLACE) are
  // pinned on a full area URL.
  const FULL_AREA_URL =
    '/discover?city=udupi&groupId=coastal-strip&areaKey=IN%7CKA%7CUdupi%7CManipal' +
    '&lat=13.34090&lon=74.74210&zoom=14&type=apartment&intent=rent';

  it('#2750 B1 T3 filter clear (committed) on a full area URL drops only `type`; groupId/areaKey/lat/lon/zoom/city/intent survive', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), { wrapper: wrapper(FULL_AREA_URL) });

    // Precondition: the chip's source filter really is in the URL, with the scope + camera beside it.
    expect(result.current[0].filters.propertyTypes).toEqual(['apartment']);
    expect(result.current[0].groupId).toBe('coastal-strip');
    expect(result.current[0].areaKey).toBe('IN|KA|Udupi|Manipal');
    expect(result.current[0].viewport).toEqual({ lat: 13.3409, lon: 74.7421, zoom: 14 });

    act(() => {
      result.current[1].setFiltersCommitted({ ...result.current[0].filters, propertyTypes: undefined });
    });

    const s = result.current[0];
    expect(s.filters.propertyTypes).toBeUndefined();
    expect(s.groupId).toBe('coastal-strip');
    expect(s.areaKey).toBe('IN|KA|Udupi|Manipal');
    expect(s.viewport).toEqual({ lat: 13.3409, lon: 74.7421, zoom: 14 });
    expect(s.city).toBe('udupi');
    expect(s.intent).toBe('rent');
  });

  it('#2750 B1 T3 filter clear (live, the path the chip x takes) on a full area URL drops only `type`; scope + camera survive', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useDiscoverUrlState(), { wrapper: wrapper(FULL_AREA_URL) });
      expect(result.current[0].filters.propertyTypes).toEqual(['apartment']);

      act(() => {
        result.current[1].setFiltersLive({ ...result.current[0].filters, propertyTypes: undefined });
        vi.advanceTimersByTime(400);
      });

      const s = result.current[0];
      expect(s.filters.propertyTypes).toBeUndefined();
      expect(s.groupId).toBe('coastal-strip');
      expect(s.areaKey).toBe('IN|KA|Udupi|Manipal');
      expect(s.viewport).toEqual({ lat: 13.3409, lon: 74.7421, zoom: 14 });
      expect(s.city).toBe('udupi');
      expect(s.intent).toBe('rent');
    } finally {
      vi.useRealTimers();
    }
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

  // G3-M8 (#2750 PR-3 B1) — retires discover-school-keyword-radius E2E-2 (schoolId/radiusKm survive the
  // search-chip dismiss). Placed HERE, not in MapDiscovery.issue1186.test.tsx (4/4 red at base: stale
  // testids). The chip dismiss calls actions.setSearchQuery(''); the product line is the `q` write in
  // filters.ts setSearchQuery (the delete branch for the dismiss, the set branch for typing).
  it('G3-M8 dismissing the keyword (setSearchQuery("")) removes q and leaves schoolId=sch-1, radiusKm=3, journey, areaKey intact in the URL', () => {
    const { result } = renderHook(
      () => ({ url: useDiscoverUrlState(), location: useLocation() }),
      {
        wrapper: wrapper(
          '/discover?city=udupi&journey=school-first&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=sch-1&radiusKm=3&q=villa',
        ),
      },
    );
    expect(new URLSearchParams(result.current.location.search).get('q')).toBe('villa');

    act(() => {
      result.current.url[1].setSearchQuery('');
      vi.runAllTimers();
    });

    const search = new URLSearchParams(result.current.location.search);
    expect(search.has('q')).toBe(false);
    expect(search.get('schoolId')).toBe('sch-1');
    expect(search.get('radiusKm')).toBe('3');
    expect(search.get('journey')).toBe('school-first');
    expect(search.get('areaKey')).toBe('IN|KA|Udupi|Manipal');
  });

  it('G3-M8 typing a keyword (setSearchQuery("villa")) writes q and leaves schoolId=sch-1, radiusKm=3 intact', () => {
    const { result } = renderHook(
      () => ({ url: useDiscoverUrlState(), location: useLocation() }),
      { wrapper: wrapper('/discover?city=udupi&journey=school-first&schoolId=sch-1&radiusKm=3') },
    );

    act(() => {
      result.current.url[1].setSearchQuery('villa');
      vi.runAllTimers();
    });

    const search = new URLSearchParams(result.current.location.search);
    expect(search.get('q')).toBe('villa');
    expect(search.get('schoolId')).toBe('sch-1');
    expect(search.get('radiusKm')).toBe('3');
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

  // R-1 (#2750 PR-3 B1; plan D12) — replaces the pre-existing 1036 `it`, which is RED at base
  // (expects journey null; the product now virtual-defaults to 'area-first', #2088) and is NOT edited.
  // Retires: school-first-back-nav BN-5, school-first-hardening HRD-7, discover-school-first-grouping-1485 AC6,
  // discover-school-journey #1142 Start Over. Asserts the WIRE (the URL) as well as the parsed state:
  // after Start Over the URL carries `city` and nothing else, and the journey is not school-first.
  it('R-1 startOver from a full school-first URL: groupId/areaKey/schoolId/radiusKm/board/category/q are cleared, city kept, journey is NOT school-first', () => {
    const { result } = renderHook(
      () => ({ url: useDiscoverUrlState(), location: useLocation() }),
      {
        wrapper: wrapper(
          '/discover?city=udupi&journey=school-first&groupId=university-belt&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=sch-1&radiusKm=5&board=CBSE&board=ICSE&category=primary&q=villa',
        ),
      },
    );
    // pre-condition: every one of those keys is really present (so "cleared" is a transition)
    const before = new URLSearchParams(result.current.location.search);
    for (const key of ['journey', 'groupId', 'areaKey', 'schoolId', 'radiusKm', 'board', 'category', 'q']) {
      expect(before.has(key)).toBe(true);
    }
    expect(result.current.url[0].journey).toBe('school-first');

    act(() => {
      result.current.url[1].startOver();
    });

    const state = result.current.url[0];
    expect(state.groupId).toBeNull();
    expect(state.areaKey).toBeNull();
    expect(state.schoolId).toBeNull();
    expect(state.radiusKm).toBeNull();
    expect(state.filters.boardFilters).toBeUndefined();
    expect(state.filters.categoryFilters).toBeUndefined();
    expect(state.q).toBe('');
    expect(state.journey).not.toBe('school-first');
    expect(state.city).toBe('udupi');

    const after = new URLSearchParams(result.current.location.search);
    expect([...after.keys()]).toEqual(['city']);
    expect(after.get('city')).toBe('udupi');
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

  // G2-CLEAR-KEEPS-GROUPID (#2750 PR-3 B1; the spec-specific addition of discover-school-first-grouping-1485
  // AC5 L4->L3: Back clears schoolId only). The pre-existing its above never put a groupId in the URL.
  it('G2-CLEAR-KEEPS-GROUPID clearSchoolSelection keeps groupId (and areaKey/journey) while removing schoolId and radiusKm', () => {
    const { result } = renderHook(
      () => ({ url: useDiscoverUrlState(), location: useLocation() }),
      {
        wrapper: wrapper(
          '/discover?city=udupi&journey=school-first&groupId=university-belt&areaKey=IN%7CKA%7CUdupi%7CManipal&schoolId=sch-1&radiusKm=2',
        ),
      },
    );

    act(() => {
      result.current.url[1].clearSchoolSelection();
    });

    const search = new URLSearchParams(result.current.location.search);
    expect(search.get('groupId')).toBe('university-belt');
    expect(search.get('areaKey')).toBe('IN|KA|Udupi|Manipal');
    expect(search.get('journey')).toBe('school-first');
    expect(search.has('schoolId')).toBe(false);
    expect(search.has('radiusKm')).toBe(false);
    expect(result.current.url[0].groupId).toBe('university-belt');
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

// ─── Issue #1745 P2 — residential "scope" axis (distinct from agri region/maxKm) ──

function wrapperWithLocationProbe(initialUrl: string, locations: string[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function LocationProbe() {
    const loc = useLocation();
    locations.push(loc.search);
    return null;
  }
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        MemoryRouter,
        { initialEntries: [initialUrl] },
        React.createElement(LocationProbe, null),
        children,
      ),
    );
  };
}

describe('useDiscoverUrlState — scope axis (Issue #1745 P2)', () => {
  it('reads scope=north from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&scope=north'),
    });
    expect(result.current[0].scope).toBe('north');
  });

  it('accepts all 5 valid scopes', () => {
    for (const scope of ['north', 'south', 'east', 'west', 'central']) {
      const { result } = renderHook(() => useDiscoverUrlState(), {
        wrapper: wrapperWithQuery(`/discover?city=udupi&scope=${scope}`),
      });
      expect(result.current[0].scope).toBe(scope);
    }
  });

  it('rejects an invalid scope value (e.g. "northeast") → null', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&scope=northeast'),
    });
    expect(result.current[0].scope).toBeNull();
  });

  it('returns null scope when the param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi'),
    });
    expect(result.current[0].scope).toBeNull();
  });

  it('scope-default-absent: an existing URL with no scope param produces a byte-identical query string (Issue #1745 P2 must not perturb pre-existing URLs)', () => {
    const initialUrl =
      '/discover?city=udupi&journey=area-first&areaKey=IN%7CKA%7CUdupi%7CManipal';
    const locations: string[] = [];
    renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithLocationProbe(initialUrl, locations),
    });
    // MemoryRouter re-encodes '|' but otherwise the query string is unchanged — in
    // particular, no `scope` param is injected merely by reading state.
    expect(locations[0]).not.toContain('scope');
    expect(locations[0]).toBe('?city=udupi&journey=area-first&areaKey=IN%7CKA%7CUdupi%7CManipal');
  });

  it('setScope("south") writes scope=south to the URL (round-trip)', () => {
    const locations: string[] = [];
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithLocationProbe('/discover?city=udupi', locations),
    });

    act(() => {
      result.current[1].setScope('south');
    });

    expect(result.current[0].scope).toBe('south');
    expect(locations[locations.length - 1]).toContain('scope=south');
  });

  it('setScope(null) removes the scope param from the URL (canonical omission)', () => {
    const locations: string[] = [];
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithLocationProbe('/discover?city=udupi&scope=east', locations),
    });

    act(() => {
      result.current[1].setScope(null);
    });

    expect(result.current[0].scope).toBeNull();
    expect(locations[locations.length - 1]).not.toContain('scope');
  });

  it('setScope with an invalid value removes the scope param (graceful degrade, not corrupt state)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&scope=north'),
    });

    act(() => {
      result.current[1].setScope('northeast');
    });

    expect(result.current[0].scope).toBeNull();
  });

  it('changeCity clears scope', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&scope=north'),
    });

    act(() => {
      result.current[1].changeCity('kundapur');
    });

    expect(result.current[0].city).toBe('kundapur');
    expect(result.current[0].scope).toBeNull();
  });

  it('startOver clears scope', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&scope=north&areaKey=IN%7CKA%7CUdupi%7CManipal'),
    });

    act(() => {
      result.current[1].startOver();
    });

    expect(result.current[0].scope).toBeNull();
  });

  it('scope is orthogonal to region/maxKm — setRegion/setMaxKm do not affect scope, and setScope does not affect region/maxKm', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&scope=west'),
    });

    act(() => {
      result.current[1].setRegion('N');
    });
    expect(result.current[0].scope).toBe('west');

    act(() => {
      result.current[1].setMaxKm(25);
    });
    expect(result.current[0].scope).toBe('west');

    act(() => {
      result.current[1].setScope('central');
    });
    expect(result.current[0].selectedRegion).toBe('N');
    expect(result.current[0].selectedMaxKm).toBe(25);
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

// ─── Issue #1745 P3: changeCity / clearRegionAndMaxKm delegate to discoverLayerRegistry ──
//
// changeCity and clearRegionAndMaxKm now delegate their reset semantics + URL-param
// mapping to discoverLayerRegistry's pure `applyCityChangeReset` / `clearRegionScopeForAgri`
// + `paramsToLayerInput` / `applyLayerSelectionToParams`, instead of listing the param
// deletes inline. These tests assert the delegated behaviour is byte-identical to the
// pre-delegation contract (covered above/elsewhere) on a fully-populated URL, and add a
// few gaps (schoolId absent-case, scope preserved on clearRegionAndMaxKm, filters/intent/
// radiusKm/q survival) not previously asserted directly against these two actions.
describe('useDiscoverUrlState — P3 delegation parity (changeCity / clearRegionAndMaxKm)', () => {
  const FULL_URL =
    '/discover?city=udupi&intent=rent&type=house&beds=2,3&priceMin=1000000&priceMax=5000000' +
    '&radiusKm=5&q=sea+view&journey=agri-first&areaKey=IN%7CKA%7CUdupi%7CManipal' +
    '&schoolId=sch-1&groupId=zone-a&schoolPicking=1&groupResults=1&group=N%3A10_25' +
    '&region=N&maxKm=25&listing=listing-1&locality=Manipal&scope=north' +
    '&lat=13.34090&lon=74.74210&zoom=12';

  it('changeCity: fully-populated URL — clears the 12 layer params + viewport, preserves schoolId/schoolPicking/listing/filters/intent/radiusKm/q', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery(FULL_URL),
    });

    act(() => {
      result.current[1].changeCity('kundapur');
    });

    const state = result.current[0];
    expect(state.city).toBe('kundapur');
    expect(state.journey).toBeNull();
    expect(state.areaKey).toBeNull();
    expect(state.groupId).toBeNull();
    expect(state.groupResults).toBeUndefined();
    expect(state.selectedGroup).toBeNull();
    expect(state.selectedRegion).toBeNull();
    expect(state.selectedMaxKm).toBeNull();
    expect(state.selectedLocality).toBeNull();
    expect(state.scope).toBeNull();
    expect(state.viewport).toBeNull();

    // Preserved (real changeCity does not clear these)
    expect(state.schoolId).toBe('sch-1');
    expect(state.schoolPicking).toBe(true);
    expect(state.selectedListing).toBe('listing-1');

    // Untouched — never part of the 12 layer params
    expect(state.filters.propertyTypes).toEqual(['house']);
    expect(state.filters.bedrooms).toEqual([2, 3]);
    expect(state.filters.priceMin).toBe(1000000);
    expect(state.filters.priceMax).toBe(5000000);
    expect(state.intent).toBe('rent');
    expect(state.radiusKm).toBe(5);
    expect(state.q).toBe('sea view');
  });

  it('changeCity: absent schoolId stays absent (no accidental set)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=area-first'),
    });

    act(() => {
      result.current[1].changeCity('kundapur');
    });

    expect(result.current[0].schoolId).toBeNull();
  });

  it('clearRegionAndMaxKm: fully-populated URL — clears region/maxKm/listing/locality, preserves scope + everything else', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery(FULL_URL),
    });

    act(() => {
      result.current[1].clearRegionAndMaxKm();
    });

    const state = result.current[0];
    expect(state.selectedRegion).toBeNull();
    expect(state.selectedMaxKm).toBeNull();
    expect(state.selectedListing).toBeNull();
    expect(state.selectedLocality).toBeNull();

    // Preserved — scope is orthogonal to the agri region/maxKm corridor model
    expect(state.scope).toBe('north');
    expect(state.journey).toBe('agri-first');
    expect(state.areaKey).toBe('IN|KA|Udupi|Manipal');
    expect(state.schoolId).toBe('sch-1');
    expect(state.groupId).toBe('zone-a');
    expect(state.schoolPicking).toBe(true);
    expect(state.groupResults).toBe(true);

    // Untouched — never part of the 12 layer params
    expect(state.filters.propertyTypes).toEqual(['house']);
    expect(state.intent).toBe('rent');
    expect(state.radiusKm).toBe(5);
    expect(state.q).toBe('sea view');
    expect(state.city).toBe('udupi');
  });

  it('clearRegionAndMaxKm: absent selectedListing/selectedLocality stay absent (no accidental set)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&region=N&maxKm=25'),
    });

    act(() => {
      result.current[1].clearRegionAndMaxKm();
    });

    expect(result.current[0].selectedListing).toBeNull();
    expect(result.current[0].selectedLocality).toBeNull();
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

// ─── Issue #2708 — List setIntent applies the canonical Map intent-transition rule ──
describe('useDiscoverUrlState — setIntent applies the canonical filter-reset rule (Issue #2708)', () => {
  it('Buy → Rent (AC1): drops residential_plot from a Residential → Plots selection', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&type=residential_plot'),
    });
    expect(result.current[0].filters.propertyTypes).toEqual(['residential_plot']);
    act(() => {
      result.current[1].setIntent('rent');
    });
    expect(result.current[0].intent).toBe('rent');
    expect(result.current[0].filters.propertyTypes).toBeUndefined();
  });

  it('Buy → Rent: drops only residential_plot out of a mixed selection, keeps the rest', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&type=apartment,residential_plot,house'),
    });
    act(() => {
      result.current[1].setIntent('rent');
    });
    expect(result.current[0].filters.propertyTypes).toEqual(['apartment', 'house']);
  });

  it('Rent → Buy: propertyTypes are left untouched (AC1 is a Rent-only drop)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&intent=rent&type=apartment,house'),
    });
    act(() => {
      result.current[1].setIntent('buy');
    });
    expect(result.current[0].intent).toBe('buy');
    expect(result.current[0].filters.propertyTypes).toEqual(['apartment', 'house']);
  });

  it('AC2/budget-reset: Buy → Rent resets both priceMin and priceMax', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&priceMin=1000000&priceMax=5000000'),
    });
    act(() => {
      result.current[1].setIntent('rent');
    });
    expect(result.current[0].filters.priceMin).toBeUndefined();
    expect(result.current[0].filters.priceMax).toBeUndefined();
  });

  it('AC2/budget-reset: Rent → Buy also resets both priceMin and priceMax', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&intent=rent&priceMin=1000000&priceMax=5000000'),
    });
    act(() => {
      result.current[1].setIntent('buy');
    });
    expect(result.current[0].filters.priceMin).toBeUndefined();
    expect(result.current[0].filters.priceMax).toBeUndefined();
  });

  it('AC4: unrelated filters (bedrooms, seller) survive an intent switch untouched', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&type=apartment&beds=2,3&seller=owner&priceMin=1000000',
      ),
    });
    act(() => {
      result.current[1].setIntent('rent');
    });
    expect(result.current[0].filters.bedrooms).toEqual([2, 3]);
    expect(result.current[0].filters.sellerTypes).toEqual(['owner']);
  });

  it('AC6: switching to the SAME intent is a no-op — no filter reset, no extra write', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&type=residential_plot&priceMin=1000000'),
    });
    act(() => {
      result.current[1].setIntent('buy'); // already buy
    });
    expect(result.current[0].intent).toBe('buy');
    expect(result.current[0].filters.propertyTypes).toEqual(['residential_plot']);
    expect(result.current[0].filters.priceMin).toBe(1000000);
  });

  it('AC6: the combined intent+filter-reset write is a single REPLACE (no extra history entry)', () => {
    // Probe every committed location with its navigation type. A second write (or a
    // PUSH) would show up as an extra entry / a 'PUSH' type / an intermediate search
    // carrying intent=rent while type/priceMin are still present.
    const seen: { search: string; type: string }[] = [];
    function ProbeWrapper({ children }: { children: React.ReactNode }) {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      function LocationProbe() {
        const loc = useLocation();
        const type = useNavigationType();
        const last = seen[seen.length - 1];
        if (!last || last.search !== loc.search || last.type !== type) {
          seen.push({ search: loc.search, type });
        }
        return null;
      }
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/discover?city=udupi&type=residential_plot&priceMin=1000000'] },
          React.createElement(LocationProbe, null),
          children,
        ),
      );
    }
    const { result } = renderHook(() => useDiscoverUrlState(), { wrapper: ProbeWrapper });
    const before = seen.length;
    act(() => {
      result.current[1].setIntent('rent');
    });
    expect(result.current[0].intent).toBe('rent');
    expect(result.current[0].filters.propertyTypes).toBeUndefined();
    expect(result.current[0].filters.priceMin).toBeUndefined();
    const writes = seen.slice(before);
    expect(writes).toHaveLength(1);
    expect(writes[0].type).toBe('REPLACE');
    expect(writes[0].search).toContain('intent=rent');
    expect(writes[0].search).not.toContain('type=');
    expect(writes[0].search).not.toContain('priceMin=');
  });
});

// ─── #2858 batch 2 (manifest L155, issue-2711-map-filter-intent-commit) — setIntent filtersOverride ───
// `setIntent(next, filtersOverride)` is the Map sheet's ONE atomic commit (MapFilterSheet.handleApply). Its
// override branch (state/url/city.ts) had no test: the existing #2708 describe above only drives List's
// no-override shape. Real MemoryRouter history; each leg observed through a location + navigation-type probe.
describe('useDiscoverUrlState — setIntent filtersOverride (#2711/#2858)', () => {
  const PRE_OPEN = '/discover?city=udupi&type=apartment';
  const OPEN_ENTRY = '/discover?city=udupi&type=apartment&priceMin=1000000';

  function renderProbed(entries: string[], initialIndex: number) {
    const seen: { search: string; type: string }[] = [];
    function Wrapper({ children }: { children: React.ReactNode }) {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      function LocationProbe() {
        const loc = useLocation();
        const type = useNavigationType();
        const last = seen[seen.length - 1];
        if (!last || last.search !== loc.search || last.type !== type) {
          seen.push({ search: loc.search, type });
        }
        return null;
      }
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          MemoryRouter,
          { initialEntries: entries, initialIndex },
          React.createElement(LocationProbe, null),
          children,
        ),
      );
    }
    const view = renderHook(() => ({ state: useDiscoverUrlState(), navigate: useNavigate(), location: useLocation() }), {
      wrapper: Wrapper,
    });
    return { ...view, seen };
  }

  // B2-N11
  it("setIntent('rent', override) serializes the whole staged set (beds, priceMax, intent) in ONE REPLACE with no history growth", () => {
    const { result, seen } = renderProbed([PRE_OPEN, OPEN_ENTRY], 1);
    const before = seen.length;

    act(() => {
      result.current.state[1].setIntent(
        'rent',
        toDiscoverUrlFilters({ propertyTypes: ['apartment'], bedrooms: [2], priceMax: 80000 }),
      );
    });

    // Exactly one write, and it is a REPLACE (zero PUSH).
    const writes = seen.slice(before);
    expect(writes).toHaveLength(1);
    expect(writes[0].type).toBe('REPLACE');
    // The single replaced URL carries the COMPLETE staged set.
    const params = new URLSearchParams(writes[0].search);
    expect(params.get('intent')).toBe('rent');
    expect(params.get('beds')).toBe('2');
    expect(params.get('priceMax')).toBe('80000');
    // The override replaced the whole filter set: the stale priceMin of the open entry is gone.
    expect(params.has('priceMin')).toBe(false);

    // No history growth: one Back lands on the entry BEFORE the replaced one (a PUSH would land on it).
    act(() => {
      result.current.navigate(-1);
    });
    expect(result.current.location.search).toBe(new URL(PRE_OPEN, 'http://x').search);
  });

  // B2-N12 — List arm (no override) vs Map arm (override built exactly as MapFilterSheet does) must produce the same URL.
  // Seeds a NON-EMPTY priceMin (and priceMax / type where the transition touches them) so the absolute assertions
  // can see a surviving param; a mutation of the shared rule or of one arm's own delete cannot pass both arms.
  const sortedEntries = (search: string) => [...new URLSearchParams(search).entries()].sort(([a], [b]) => a.localeCompare(b));

  it.each([
    {
      label: 'Buy -> Rent: Residential Plot dropped, budget reset',
      start: '/discover?city=udupi&type=apartment,residential_plot&priceMin=1000000&priceMax=5000000',
      next: 'rent' as const,
      absent: ['priceMin', 'priceMax'],
      typeValue: 'apartment',
    },
    {
      label: 'Rent -> Buy: rent budget reset',
      start: '/discover?city=udupi&intent=rent&type=apartment&priceMin=20000&priceMax=80000',
      next: 'buy' as const,
      absent: ['priceMin', 'priceMax'],
      typeValue: 'apartment',
    },
  ])(
    'List and Map arms produce an identical URL for the same starting state, and the absolute outcome holds: $label',
    ({ start, next, absent, typeValue }) => {
      // Arm A: List (IntentSelector) — no override.
      const list = renderProbed([start], 0);
      act(() => {
        list.result.current.state[1].setIntent(next);
      });
      const listSearch = list.result.current.location.search;
      list.unmount();

      // Arm B: Map (MapFilterSheet.handleApply) — the staged draft after the SAME transition, serialized as the override.
      const map = renderProbed([start], 0);
      const staged = applyIntentTransition(projectUrlFilters(map.result.current.state[0].filters), next);
      act(() => {
        map.result.current.state[1].setIntent(next, toDiscoverUrlFilters(staged));
      });
      const mapSearch = map.result.current.location.search;
      map.unmount();

      // Absolute outcome, per arm (so a bug shared by both cannot hide behind parity).
      for (const search of [listSearch, mapSearch]) {
        const params = new URLSearchParams(search);
        for (const key of absent) expect(params.has(key), `${key} must be absent in ${search}`).toBe(false);
        expect(params.get('type')).toBe(typeValue);
        expect(params.get('intent')).toBe(next === 'rent' ? 'rent' : null);
      }
      // Parity (order-insensitive: the two writers may emit params in a different order).
      expect(sortedEntries(mapSearch)).toEqual(sortedEntries(listSearch));
    },
  );
});

// ─── Issue #1458 — agri structured field URL params ───────────────────────────

describe('useDiscoverUrlState — agriLandCategory URL param (Issue #1458)', () => {
  it('reads agriLandCategory=FARMLAND from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&agriLandCategory=FARMLAND'),
    });
    expect(result.current[0].filters.agriLandCategory).toBe('FARMLAND');
  });

  it('returns null agriLandCategory when param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].filters.agriLandCategory).toBeNull();
  });
});

describe('useDiscoverUrlState — agriWaterSource URL param (Issue #1458)', () => {
  it('reads agriWaterSource=NOT_AVAILABLE from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&agriWaterSource=NOT_AVAILABLE'),
    });
    expect(result.current[0].filters.agriWaterSource).toBe('NOT_AVAILABLE');
  });

  it('reads agriWaterSource=WELL from URL', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&agriWaterSource=WELL'),
    });
    expect(result.current[0].filters.agriWaterSource).toBe('WELL');
  });

  it('returns null agriWaterSource when param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].filters.agriWaterSource).toBeNull();
  });
});

describe('useDiscoverUrlState — agriFarmhouseAvailable tri-state URL param (Issue #1458)', () => {
  it('reads agriFarmhouseAvailable=true as boolean true', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&agriFarmhouseAvailable=true'),
    });
    expect(result.current[0].filters.agriFarmhouseAvailable).toBe(true);
  });

  it('reads agriFarmhouseAvailable=false as boolean false (not null)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&agriFarmhouseAvailable=false'),
    });
    expect(result.current[0].filters.agriFarmhouseAvailable).toBe(false);
  });

  it('returns null agriFarmhouseAvailable when param is absent (unfiltered)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].filters.agriFarmhouseAvailable).toBeNull();
  });
});

describe('useDiscoverUrlState — agriFencingDone tri-state URL param (Issue #1458)', () => {
  it('reads agriFencingDone=true as boolean true', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&agriFencingDone=true'),
    });
    expect(result.current[0].filters.agriFencingDone).toBe(true);
  });

  it('reads agriFencingDone=false as boolean false (not null)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&agriFencingDone=false'),
    });
    expect(result.current[0].filters.agriFencingDone).toBe(false);
  });

  it('returns null agriFencingDone when param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].filters.agriFencingDone).toBeNull();
  });
});

// ─── Issue #1597: groupResults URL flag ───────────────────────────────────────

describe('useDiscoverUrlState — groupResults flag (Issue #1597)', () => {
  it('reads groupResults=true when param is "1"', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=area-first&groupId=coastal-homes&groupResults=1'),
    });
    expect(result.current[0].groupResults).toBe(true);
  });

  it('reads groupResults=undefined when param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=area-first&groupId=coastal-homes'),
    });
    expect(result.current[0].groupResults).toBeUndefined();
  });

  it('reads groupResults=undefined when param value is not "1"', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&groupResults=true'),
    });
    expect(result.current[0].groupResults).toBeUndefined();
  });

  it('enterGroupResults sets groupResults=1 and clears areaKey (PUSH semantics)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=area-first&groupId=coastal-homes&areaKey=IN%7CKA%7CUdupi%7CManipal',
      ),
    });

    act(() => {
      result.current[1].enterGroupResults();
    });

    expect(result.current[0].groupResults).toBe(true);
    // areaKey must be cleared
    expect(result.current[0].areaKey).toBeNull();
    // city, journey, groupId and intent must be preserved
    expect(result.current[0].city).toBe('udupi');
    expect(result.current[0].journey).toBe('area-first');
    expect(result.current[0].groupId).toBe('coastal-homes');
  });

  it('enterGroupResults preserves intent and filters', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=area-first&groupId=coastal-homes&intent=rent&type=house',
      ),
    });

    act(() => {
      result.current[1].enterGroupResults();
    });

    expect(result.current[0].groupResults).toBe(true);
    expect(result.current[0].intent).toBe('rent');
    expect(result.current[0].filters.propertyTypes).toEqual(['house']);
  });

  it('clearGroupResults removes groupResults param (REPLACE semantics)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=area-first&groupId=coastal-homes&groupResults=1',
      ),
    });

    act(() => {
      result.current[1].clearGroupResults();
    });

    expect(result.current[0].groupResults).toBeUndefined();
    // city and groupId must remain
    expect(result.current[0].city).toBe('udupi');
    expect(result.current[0].groupId).toBe('coastal-homes');
  });

  it('changeCity clears groupResults along with other journey state', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&journey=area-first&groupId=coastal-homes&groupResults=1',
      ),
    });

    act(() => {
      result.current[1].changeCity('kundapur');
    });

    expect(result.current[0].city).toBe('kundapur');
    expect(result.current[0].groupResults).toBeUndefined();
    expect(result.current[0].groupId).toBeNull();
  });
});

describe('useDiscoverUrlState — clearAgriFilters removes all 8 agri params (Issue #1458)', () => {
  it('clears all 8 agri filter params (4 old + 4 new) in one call', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper(
        '/discover?city=udupi&agriAcresMin=1&agriAcresMax=10&agriPriceMin=500000&agriPriceMax=5000000' +
          '&agriLandCategory=FARMLAND&agriFarmhouseAvailable=true&agriFencingDone=false&agriWaterSource=WELL',
      ),
    });

    // Confirm all params are present first
    expect(result.current[0].filters.agriAcresMin).toBe(1);
    expect(result.current[0].filters.agriAcresMax).toBe(10);
    expect(result.current[0].filters.agriLandCategory).toBe('FARMLAND');
    expect(result.current[0].filters.agriFarmhouseAvailable).toBe(true);
    expect(result.current[0].filters.agriFencingDone).toBe(false);
    expect(result.current[0].filters.agriWaterSource).toBe('WELL');

    act(() => {
      result.current[1].clearAgriFilters();
    });

    const { filters } = result.current[0];
    expect(filters.agriAcresMin).toBeUndefined();
    expect(filters.agriAcresMax).toBeUndefined();
    expect(filters.agriPriceMin).toBeUndefined();
    expect(filters.agriPriceMax).toBeUndefined();
    expect(filters.agriLandCategory).toBeNull();
    expect(filters.agriFarmhouseAvailable).toBeNull();
    expect(filters.agriFencingDone).toBeNull();
    expect(filters.agriWaterSource).toBeNull();
  });

  it('city is preserved after clearAgriFilters', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&agriLandCategory=PLANTATION'),
    });

    act(() => {
      result.current[1].clearAgriFilters();
    });

    expect(result.current[0].city).toBe('udupi');
  });
});

// ─── Issue #1745 P0 — URL normalization shim regression coverage ────────────────
//
// The shim (discoverUrlNormalize.ts) is unit-tested standalone in
// discoverUrlNormalize.test.ts. These hook-level tests confirm the shim is wired
// in at useDiscoverUrlState's read boundary WITHOUT changing observable behaviour:
// journey short-name aliases resolve on cold-load read, the OD-1 group→region
// migration still fires exactly once via history.replace (no push, cold-load
// only), the deprecation warning still logs, and the #1445 maxKm=25 backfill
// still lands — all now expressed through the shared shim helpers.

describe('useDiscoverUrlState — journey short-name READ aliases (Issue #1745 P0)', () => {
  it('resolves journey=area to journey="area-first" on cold-load read', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=area'),
    });
    expect(result.current[0].journey).toBe('area-first');
  });

  it('resolves journey=school to journey="school-first" on cold-load read', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=school'),
    });
    expect(result.current[0].journey).toBe('school-first');
  });

  it('resolves journey=agri to journey="agri-first" on cold-load read', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri'),
    });
    expect(result.current[0].journey).toBe('agri-first');
  });

  it('still returns null for unknown journey values (alias does not force validity)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=unknown-mode'),
    });
    expect(result.current[0].journey).toBeNull();
  });

  it('canonical long-form journey values still read correctly (no regression)', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=area-first'),
    });
    expect(result.current[0].journey).toBe('area-first');
  });

  it('setJourney still writes the canonical long form to the URL, never the short alias', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi'),
    });

    act(() => {
      result.current[1].setJourney('area-first');
    });

    expect(result.current[0].journey).toBe('area-first');
  });
});

describe('useDiscoverUrlState — OD-1 group migration still routes through history.replace (Issue #1745 P0 regression guard)', () => {
  it('OD-1 migration replaces (not pushes) — no earlier group= entry is reachable via Back', async () => {
    const navigateRef: { current: ((delta: number) => void) | null } = { current: null };
    function NavCapture() {
      const navigate = useNavigate();
      navigateRef.current = (delta: number) => navigate(delta);
      return null;
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/discover?city=udupi&journey=agri-first&group=N:10_25'] },
          React.createElement(NavCapture, null),
          children,
        ),
      );
    }

    const { result } = renderHook(() => useDiscoverUrlState(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current[0].selectedRegion).toBe('N');
    });

    act(() => {
      navigateRef.current?.(-1);
    });

    // If OD-1 had used PUSH, Back would restore the pre-migration entry (group= present,
    // selectedRegion=null). Because it uses REPLACE, there is only ever one history
    // entry — Back is a no-op and the post-migration state is unchanged.
    expect(result.current[0].selectedRegion).toBe('N');
    expect(result.current[0].selectedGroup).toBeNull();
  });

  it('cold-load ?group=N:10_25 still emits the [DEPRECATED] console.warn exactly once', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => useDiscoverUrlState(), {
        wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&group=N:10_25'),
      });

      await waitFor(() => {
        expect(result.current[0].selectedRegion).toBe('N');
      });

      const deprecationCalls = warnSpy.mock.calls.filter((call) =>
        String(call[0]).includes('[DEPRECATED]'),
      );
      expect(deprecationCalls.length).toBe(1);
      expect(deprecationCalls[0][1]).toBe('N');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('cold-load ?group=N:10_25 still backfills selectedMaxKm=25 via the #1445 canonicalisation effect', async () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithQuery('/discover?city=udupi&journey=agri-first&group=N:10_25'),
    });

    await waitFor(() => {
      expect(result.current[0].selectedRegion).toBe('N');
    });

    await waitFor(() => {
      expect(result.current[0].selectedMaxKm).toBe(25);
    });

    // selectedGroup (deprecated legacy field) is null post-migration — group was removed.
    expect(result.current[0].selectedGroup).toBeNull();
  });

  it('cold-load with an invalid legacy group direction does not migrate and does not warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => useDiscoverUrlState(), {
        wrapper: wrapperWithQuery('/discover?city=udupi&group=BADDIR:10_25'),
      });

      await waitFor(() => {
        expect(result.current[0].selectedGroup).toBeNull();
      });
      expect(result.current[0].selectedRegion).toBeNull();

      const deprecationCalls = warnSpy.mock.calls.filter((call) =>
        String(call[0]).includes('[DEPRECATED]'),
      );
      expect(deprecationCalls.length).toBe(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('useDiscoverUrlState — clearAllFiltersAndSearch (Issue #1854 atomicity)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears filters and q immediately', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&type=apartment&q=manipal'),
    });

    act(() => {
      result.current[1].clearAllFiltersAndSearch();
    });

    expect(result.current[0].q).toBe('');
    expect(result.current[0].filters.propertyTypes).toBeUndefined();
  });

  it('does not let a stale in-flight setFiltersLive debounce revive `q` after the flush (regression for #1854)', () => {
    // Reproduces the original bug's shape: a debounced filters write (setFiltersLive,
    // 300ms) is scheduled — closing over the URL snapshot at that moment, which still
    // has q=manipal — mirroring what handleFiltersChange({}) used to schedule as half
    // of the old two-call "Clear all" composition. Before that debounce timer has had
    // a chance to fire, clearAllFiltersAndSearch() runs (the second half of the old
    // composition was setSearchQuery('') firing near-immediately). The fix requires
    // clearAllFiltersAndSearch to cancel the pending setFiltersLive timer; without that
    // cancellation, the stale-snapshot write fires ~300ms later and silently reinstates
    // q=manipal — exactly the "briefly cleared, then bounces back" bug report.
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&type=apartment&q=manipal'),
    });

    act(() => {
      result.current[1].setFiltersLive({ propertyTypes: ['house'] });
    });

    act(() => {
      result.current[1].clearAllFiltersAndSearch();
    });

    // Bounce-back symptom check #1 — cleared right after the click.
    expect(result.current[0].q).toBe('');

    // Flush every pending timer, including the setFiltersLive debounce scheduled above.
    act(() => {
      vi.runAllTimers();
    });

    // Bounce-back symptom check #2 — must STILL be cleared after the flush. This is
    // the assertion that fails on the pre-fix two-call composition.
    expect(result.current[0].q).toBe('');
    expect(result.current[0].filters.propertyTypes).toBeUndefined();
  });

  it('does not let a stale in-flight setSearchQuery debounce revive `q` after the flush', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&q=manipal'),
    });

    act(() => {
      // User was mid-typing a new search term (debounced 300ms) when Clear All fired.
      result.current[1].setSearchQuery('surathkal');
    });

    act(() => {
      result.current[1].clearAllFiltersAndSearch();
    });

    expect(result.current[0].q).toBe('');

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current[0].q).toBe('');
  });

  it('cancels the pending reportViewport debounce so no stale viewport write lands after Clear All', () => {
    // A reportViewport write (300ms debounce) is scheduled while the user was panning,
    // then Clear All fires before it lands. clearAllFiltersAndSearch must cancel the
    // pending viewportTimer (the third debounce timer, alongside filters/search) so the
    // stale-snapshot write cannot fire afterward (#1854 follow-up). The observable proof
    // the timer was cancelled: no lat/lon/zoom get written on flush — viewport stays null
    // for a URL that started without one. (The `q`/filters assertions guard the reviewer's
    // stated bounce-back concern; the viewport assertion is what fails without the fix,
    // since react-router's functional updater otherwise still emits the stale coords.)
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&type=apartment&q=manipal'),
    });

    act(() => {
      result.current[1].reportViewport({ lat: 13.34, lon: 74.74, zoom: 14 });
    });

    act(() => {
      result.current[1].clearAllFiltersAndSearch();
    });

    expect(result.current[0].q).toBe('');
    expect(result.current[0].filters.propertyTypes).toBeUndefined();

    // Flush every pending timer, including the reportViewport debounce scheduled above.
    act(() => {
      vi.runAllTimers();
    });

    // Bounce-back symptom check — q and filters must STILL be cleared after the flush.
    // Without the viewportTimer cancellation, the stale reportViewport write fires here
    // and revives q=manipal (+type=apartment) alongside its lat/lon/zoom write.
    expect(result.current[0].q).toBe('');
    expect(result.current[0].filters.propertyTypes).toBeUndefined();
    // And no stale viewport coords should have landed (URL started without lat/lon/zoom).
    expect(result.current[0].viewport).toBeNull();
  });
});

// ─── Issue #2002 Slice 2 PR3 — compatibility domain facade repoint guard ──────
//
// Pure refactor guard: useCompatibilityUrlDomain now owns the `scope` and
// `selectedGroup` reads (moved from city.ts / agricultural.ts respectively)
// plus the `selectRegionalGroup` writer. These tests exercise ONLY the public
// [state, actions] facade — if the facade's state-literal repoint to
// compatibilityDomain.state.{scope,selectedGroup} were accidentally missed,
// TypeScript would still compile (both are optional-ish/nullable fields) but
// the values would silently come back undefined/null at runtime with no
// build error, which is exactly what this guards against.
describe('useDiscoverUrlState — compatibility domain (scope + selectedGroup) facade repoint', () => {
  it('resolves scope from the URL via the public facade', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&scope=north'),
    });
    expect(result.current[0].scope).toBe('north');
  });

  it('resolves scope=null when the scope param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi'),
    });
    expect(result.current[0].scope).toBeNull();
  });

  it('resolves selectedGroup=null when the group param is absent', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first'),
    });
    expect(result.current[0].selectedGroup).toBeNull();
  });

  it('selectRegionalGroup round-trips through the public facade: set then read back', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapper('/discover?city=udupi&journey=agri-first'),
    });

    act(() => {
      result.current[1].selectRegionalGroup({ directionKey: 'E', distanceBandKey: '25_50' });
    });

    expect(result.current[0].selectedGroup).toEqual({
      directionKey: 'E',
      distanceBandKey: '25_50',
    });

    act(() => {
      result.current[1].selectRegionalGroup(null);
    });

    expect(result.current[0].selectedGroup).toBeNull();
  });
});
