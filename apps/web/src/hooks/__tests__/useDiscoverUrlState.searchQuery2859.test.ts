/**
 * #2859 batch B5 (umbrella #2750) — L55 K2.debounce hop: typing a keyword updates the LIVE search state first
 * and commits `q` to the URL only after the URL-side debounce, as a REPLACE (not a history entry).
 *
 * Both halves of the Discover split-brain are composed exactly as the page wires them
 * (useDiscoverSearchState({ urlQ: urlState.q, setUrlSearch: urlActions.setSearchQuery })), inside a
 * MemoryRouter, in ONE it:
 *   LIVE path : useDiscoverSearchState.searchQuery (immediate) / debouncedSearch (250 ms) — badge + map;
 *   URL path  : useDiscoverUrlState -> features/discover/state/url/filters.ts setSearchQuery (300 ms) —
 *               read from location.search, with useNavigationType() proving REPLACE.
 * Fake timers make the boundary exact; nothing else is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useDiscoverUrlState } from '../useDiscoverUrlState';
import { useDiscoverSearchState } from '@/features/discover/state/useDiscoverSearchState';

const COLD_URL = '/discover?city=udupi&areaKey=udupi%7Cmanipal';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(
    QueryClientProvider,
    { client: qc },
    React.createElement(MemoryRouter, { initialEntries: [COLD_URL] }, children),
  );
}

describe('keyword typing: LIVE first, URL q after the debounce, as a REPLACE (#2859 B5 L55 K2.debounce)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline (test)'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('handleSearchChange("villa"): LIVE searchQuery at once, debouncedSearch at 250 ms, URL q absent at 299 ms and present at 300 ms via REPLACE; areaKey kept', () => {
    const { result } = renderHook(
      () => {
        const [urlState, urlActions] = useDiscoverUrlState();
        const search = useDiscoverSearchState({ urlQ: urlState.q, setUrlSearch: urlActions.setSearchQuery });
        return { urlState, search, location: useLocation(), navType: useNavigationType() };
      },
      { wrapper },
    );
    const q = () => new URLSearchParams(result.current.location.search).get('q');
    const keyBefore = result.current.location.key;

    expect(q()).toBeNull();
    expect(result.current.search.searchQuery).toBe('');
    // Control for the REPLACE assertion below: before typing, no navigation has happened yet.
    expect(result.current.navType).toBe('POP');

    act(() => {
      result.current.search.handleSearchChange('villa');
    });
    // LIVE: the input value is immediate; the URL has not moved.
    expect(result.current.search.searchQuery).toBe('villa');
    expect(q()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.search.debouncedSearch).toBe('villa');
    expect(q()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(49);
    });
    expect(q()).toBeNull(); // 299 ms: still not committed

    act(() => {
      vi.advanceTimersByTime(1);
    });
    // URL: committed at 300 ms, as a REPLACE of the current entry, sibling scope kept.
    expect(q()).toBe('villa');
    expect(result.current.urlState.q).toBe('villa');
    expect(result.current.navType).toBe('REPLACE');
    expect(result.current.location.key).not.toBe(keyBefore);
    expect(new URLSearchParams(result.current.location.search).get('areaKey')).toBe('udupi|manipal');
  });
});
