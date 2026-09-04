/**
 * Issue #2431 — the full Commercial-subtype URL round-trip, end to end.
 *
 * The other #2431 tests each cover one link in the chain: the URL domain reads and writes the
 * `subtype` param, and PropertyTypeFilter produces the right PropertyFilters. This file joins
 * them through the REAL `useDiscoverUrlState` and the REAL `useDiscoverPageState` inside a
 * MemoryRouter, so it exercises the bridge between the two shapes rather than mocking it.
 *
 * That bridge lives in useDiscoverPageState.ts, which this lane touched under a narrow,
 * explicitly granted exception limited to two additive `commercialSubtypes:` lines. Testing it
 * here is what makes that exception accountable: if either line is dropped in a future merge
 * conflict, these tests fail rather than the feature silently going inert.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '../useDiscoverUrlState';
import { useDiscoverPageState } from '../useDiscoverPageState';

const DEBOUNCE_MS = 300;

function wrapper(initialUrl: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(MemoryRouter, { initialEntries: [initialUrl] }, children),
    );
  };
}

/** Renders the real URL facade and the real page state together, wired as the page wires them. */
function renderPage(initialUrl: string) {
  return renderHook(
    () => {
      const [urlState, urlActions] = useDiscoverUrlState();
      const page = useDiscoverPageState({ urlState, urlActions });
      return { urlState, page, location: useLocation() };
    },
    { wrapper: wrapper(initialUrl) },
  );
}

function currentParams(result: { current: { location: { search: string } } }) {
  return new URLSearchParams(result.current.location.search);
}

describe('#2431 — URL round-trip through the real page state', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('COLD LOAD: ?type=commercial&subtype=SHOP hydrates into PropertyFilters', () => {
    const { result } = renderPage('/discover?city=bangalore&type=commercial&subtype=SHOP');

    expect(result.current.page.filters.commercialSubtypes).toEqual(['SHOP']);
    expect(result.current.page.filters.propertyTypes).toEqual(['commercial']);
  });

  it('COLD LOAD: both subtypes hydrate', () => {
    const { result } = renderPage('/discover?city=bangalore&subtype=SHOP,OFFICE');
    expect(result.current.page.filters.commercialSubtypes).toEqual(['SHOP', 'OFFICE']);
  });

  it('COLD LOAD: an unrecognised subtype hydrates as absent, not as a bad value', () => {
    const { result } = renderPage('/discover?city=bangalore&subtype=RESTAURANT');
    expect(result.current.page.filters.commercialSubtypes).toBeUndefined();
  });

  it('WRITE: selecting a subtype reaches the URL', () => {
    const { result } = renderPage('/discover?city=bangalore');

    act(() => {
      result.current.page.handleFiltersChange({
        propertyTypes: ['commercial'],
        commercialSubtypes: ['OFFICE'],
      });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 50);
    });

    expect(currentParams(result).get('subtype')).toBe('OFFICE');
  });

  it('ROUND TRIP: what is written is what is read back', () => {
    const { result } = renderPage('/discover?city=bangalore');

    act(() => {
      result.current.page.handleFiltersChange({
        propertyTypes: ['commercial'],
        commercialSubtypes: ['SHOP', 'OFFICE'],
      });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 50);
    });

    expect(currentParams(result).get('subtype')).toBe('SHOP,OFFICE');
    // Read back through the URL facade, not through local state — that is what makes this a
    // round trip rather than an echo of what was just set.
    expect(result.current.urlState.filters.commercialSubtypes).toEqual(['SHOP', 'OFFICE']);
  });

  it('CLEARING ON FAMILY SWITCH: leaving generic Commercial removes `subtype` from the URL', () => {
    // This is the condition the literal-subtype-semantics deviation was accepted on: a stale
    // subtype must never survive in the URL after the buyer leaves the Commercial family, or the
    // query would keep narrowing by a control that is no longer on screen.
    const { result } = renderPage('/discover?city=bangalore&type=commercial&subtype=SHOP');
    expect(result.current.page.filters.commercialSubtypes).toEqual(['SHOP']);

    // Exactly what PropertyTypeFilter emits when Commercial is unticked while Shop was selected.
    act(() => {
      result.current.page.handleFiltersChange({
        propertyTypes: undefined,
        commercialSubtypes: undefined,
      });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 50);
    });

    const params = currentParams(result);
    expect(params.has('subtype')).toBe(false);
    expect(params.has('type')).toBe(false);
  });

  it('CLEARING ON FAMILY SWITCH: switching to another property type also drops `subtype`', () => {
    const { result } = renderPage('/discover?city=bangalore&type=commercial&subtype=OFFICE');

    act(() => {
      result.current.page.handleFiltersChange({
        propertyTypes: ['apartment'],
        commercialSubtypes: undefined,
      });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 50);
    });

    const params = currentParams(result);
    expect(params.get('type')).toBe('apartment');
    expect(params.has('subtype')).toBe(false);
  });

  it('the subtype survives an unrelated filter change', () => {
    const { result } = renderPage('/discover?city=bangalore&type=commercial&subtype=SHOP');

    act(() => {
      result.current.page.handleFiltersChange({
        ...result.current.page.filters,
        priceMax: 9_000_000,
      });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 50);
    });

    const params = currentParams(result);
    expect(params.get('subtype')).toBe('SHOP');
    expect(params.get('priceMax')).toBe('9000000');
  });
});
