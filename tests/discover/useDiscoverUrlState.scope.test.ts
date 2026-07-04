/**
 * useDiscoverUrlState — scope REPLACE semantics (Issue #1745 P8)
 *
 * P8 changes `setScope` from PUSH to REPLACE (matching `setIntent`), so that
 * selecting/switching/clearing a landing macro-region card does not stack
 * browser-history entries. Covers the tests_required items from the approved
 * Batch A plan:
 *   (a) selecting scope updates the URL
 *   (b) switching between scopes does not stack multiple history entries
 *   (c) browser back/forward remains sane after scope changes
 *   (d) startOver() clears scope
 *   (e) agri region= is untouched by any scope= change
 */
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';

interface NavLogEntry {
  search: string;
  navigationType: string;
}

function wrapperWithNavProbe(initialUrl: string, log: NavLogEntry[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function NavProbe() {
    const location = useLocation();
    const navigationType = useNavigationType();
    log.push({ search: location.search, navigationType });
    return null;
  }

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        MemoryRouter,
        { initialEntries: [initialUrl] },
        React.createElement(NavProbe, null),
        children,
      ),
    );
  };
}

describe('useDiscoverUrlState — setScope REPLACE semantics (Issue #1745 P8)', () => {
  it('(a) selecting a scope updates the URL', () => {
    const log: NavLogEntry[] = [];
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithNavProbe('/discover?city=udupi', log),
    });

    act(() => {
      result.current[1].setScope('north');
    });

    expect(result.current[0].scope).toBe('north');
    expect(log[log.length - 1].search).toContain('scope=north');
  });

  it('accepts a real area-group-slug regionKey value (Batch A AC2 — not just the 5 fixed direction tokens)', () => {
    const log: NavLogEntry[] = [];
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithNavProbe('/discover?city=udupi', log),
    });

    act(() => {
      result.current[1].setScope('university-belt');
    });

    // Round-trips through setScope → isValidScope's SCOPE_SLUG_PATTERN branch → URL →
    // read-side coerceScope, proving a real backend regionKey slug (not a direction token
    // or one of the 5 fixed tokens) is accepted end-to-end.
    expect(result.current[0].scope).toBe('university-belt');
    expect(log[log.length - 1].search).toContain('scope=university-belt');
  });

  it('(b) switching between scopes does not stack history entries (every write is REPLACE, never PUSH)', () => {
    const log: NavLogEntry[] = [];
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithNavProbe('/discover?city=udupi', log),
    });

    act(() => {
      result.current[1].setScope('north');
    });
    act(() => {
      result.current[1].setScope('south');
    });
    act(() => {
      result.current[1].setScope('central');
    });

    expect(result.current[0].scope).toBe('central');
    // Every navigation recorded after the initial mount must be REPLACE — a PUSH
    // here would mean a scope switch stacked a phantom browser-history entry.
    const navTypesAfterMount = log.slice(1).map((entry) => entry.navigationType);
    expect(navTypesAfterMount.length).toBeGreaterThan(0);
    expect(navTypesAfterMount.every((type) => type === 'REPLACE')).toBe(true);
    expect(navTypesAfterMount).not.toContain('PUSH');
  });

  it('(c) back/forward remains sane: a single Back after several scope changes returns to the pre-selection state, not an intermediate scope', () => {
    // Because every setScope call is a REPLACE (not a PUSH), the entry the user
    // landed on before touching scope is still the ONLY entry behind the current
    // one — asserting REPLACE-only navigation types (as in (b)) is the JSDOM/
    // MemoryRouter-safe equivalent of "no phantom Back steps were created"
    // (MemoryRouter does not support window.history.back() simulation — see the
    // existing AC10 precedent in src/hooks/__tests__/useDiscoverUrlState.test.ts).
    const log: NavLogEntry[] = [];
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithNavProbe('/discover?city=udupi&journey=area-first', log),
    });

    act(() => {
      result.current[1].setScope('east');
    });
    act(() => {
      result.current[1].setScope('west');
    });
    act(() => {
      result.current[1].setScope(null);
    });

    expect(result.current[0].scope).toBeNull();
    // journey (set before any scope interaction) must still be intact — proves
    // the REPLACE writes only ever touched `scope`, never clobbered other state
    // the way an extra PUSH-based navigation stack could.
    expect(result.current[0].journey).toBe('area-first');
    const navTypesAfterMount = log.slice(1).map((entry) => entry.navigationType);
    expect(navTypesAfterMount.every((type) => type === 'REPLACE')).toBe(true);
  });

  it('(d) startOver() clears scope', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithNavProbe('/discover?city=udupi&scope=north', []),
    });

    act(() => {
      result.current[1].startOver();
    });

    expect(result.current[0].scope).toBeNull();
  });

  it('(e) agri region= is untouched by scope= changes, and vice versa', () => {
    const { result } = renderHook(() => useDiscoverUrlState(), {
      wrapper: wrapperWithNavProbe('/discover?city=udupi&journey=agri-first&region=N&maxKm=25', []),
    });

    act(() => {
      result.current[1].setScope('central');
    });
    expect(result.current[0].scope).toBe('central');
    expect(result.current[0].selectedRegion).toBe('N');
    expect(result.current[0].selectedMaxKm).toBe(25);

    act(() => {
      result.current[1].setRegion('SW');
    });
    expect(result.current[0].selectedRegion).toBe('SW');
    // scope must survive an unrelated agri region= change
    expect(result.current[0].scope).toBe('central');

    act(() => {
      result.current[1].setScope(null);
    });
    expect(result.current[0].scope).toBeNull();
    // clearing scope must not disturb the agri region/maxKm axis
    expect(result.current[0].selectedRegion).toBe('SW');
  });
});
