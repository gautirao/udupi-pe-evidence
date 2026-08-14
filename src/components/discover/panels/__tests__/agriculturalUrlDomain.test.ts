/**
 * URL round-trip tests for the agricultural URL domain's destination-key identity
 * (Issue #2151 PR C, C-F1) — src/features/discover/state/url/agricultural.ts.
 *
 * This file lives under src/components/discover/panels/__tests__/ (not alongside
 * agricultural.ts) because this PR's allowed edit globs grant a test-file location
 * only there; src/features/discover/state/url/__tests__/** (where sibling domain
 * tests like school.setSchoolJourney.test.ts live) is outside this PR's scope.
 *
 * Driven through the public useDiscoverUrlState() facade (mirrors the existing
 * school.setSchoolJourney.test.ts pattern) rather than constructing a UrlDomainCtx
 * by hand, since the facade IS the real integration surface AgriGroupSelectedPanel
 * and useDiscoverAgriController consume.
 *
 * Covers:
 * - Legacy `locality=` cold-load migrates to canonical `destKey=` exactly once, but ONLY when
 *   the legacy value already looks like a real area_key (e.g. `IN|KA|Udupi|Manipal`).
 * - Legacy `town=` cold-load migrates to canonical `destKey=` exactly once, same area_key gate.
 * - A legacy `locality=`/`town=` value that is free-text display text (not area_key-shaped) is
 *   DROPPED — the legacy params are removed but `destKey` is left unset, never fabricated from
 *   display text (GitHub-reviewer-confirmed bug fix, Issue #2151).
 * - Migration does not oscillate/re-fire across subsequent unrelated re-renders.
 * - An already-canonical `destKey=` wins over a simultaneously-present legacy value
 *   (no permanent dual-canonical state).
 * - setLocality writes the canonical param and clears legacy params.
 * - clearLocality removes the canonical param.
 * - GitHub-reviewer-24 follow-up finding (same PR #2160): the render-scope `selectedLocality`
 *   fallback used above the migration effects must apply the SAME AREA_KEY_FORMAT guard as the
 *   migration effect — a free-text legacy value must never be exposed as `selectedLocality`, not
 *   even transiently on the very first render before the migration effect has had a chance to
 *   run (the read side of the bug; the write side was fixed first).
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';

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

/** Renders useDiscoverUrlState alongside useLocation so tests can inspect the raw search string. */
function renderWithLocation(initialUrl: string) {
  return renderHook(
    () => ({ urlState: useDiscoverUrlState(), location: useLocation() }),
    { wrapper: wrapper(initialUrl) },
  );
}

describe('agricultural URL domain — destination-key migration (C-F1)', () => {
  it('migrates a legacy locality= that IS area_key-shaped to canonical destKey= exactly once on cold load', () => {
    const { result } = renderWithLocation(
      '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&locality=IN%7CKA%7CUdupi%7CManipal',
    );

    // Canonical field is populated from the legacy value, unchanged.
    expect(result.current.urlState[0].selectedLocality).toBe('IN|KA|Udupi|Manipal');
    // The raw URL no longer carries the legacy param — only the canonical one.
    const search = result.current.location.search;
    expect(search).toContain('destKey=IN');
    expect(search).not.toContain('locality=');
  });

  it('migrates a legacy town= that IS area_key-shaped to canonical destKey= exactly once on cold load', () => {
    const { result } = renderWithLocation(
      '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&town=IN%7CKA%7CUdupi%7CKota',
    );

    expect(result.current.urlState[0].selectedLocality).toBe('IN|KA|Udupi|Kota');
    const search = result.current.location.search;
    expect(search).toContain('destKey=IN');
    expect(search).not.toContain('town=');
  });

  it('drops a legacy locality= that is free-text (NOT area_key-shaped) instead of fabricating a destKey — GitHub-reviewer-confirmed bug fix (#2151)', () => {
    const { result } = renderWithLocation(
      '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&locality=Manipal',
    );

    // Free text must never be promoted to the canonical identity param.
    expect(result.current.urlState[0].selectedLocality).toBeNull();
    const search = result.current.location.search;
    expect(search).not.toContain('destKey=');
    expect(search).not.toContain('locality=');
  });

  it('drops a legacy town= that is free-text (NOT area_key-shaped) instead of fabricating a destKey', () => {
    const { result } = renderWithLocation(
      '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&town=Kota',
    );

    expect(result.current.urlState[0].selectedLocality).toBeNull();
    const search = result.current.location.search;
    expect(search).not.toContain('destKey=');
    expect(search).not.toContain('town=');
  });

  it('does NOT re-translate on a subsequent unrelated re-render (exactly-once, no oscillation)', () => {
    const { result } = renderWithLocation(
      '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&locality=IN%7CKA%7CUdupi%7CManipal',
    );

    expect(result.current.urlState[0].selectedLocality).toBe('IN|KA|Udupi|Manipal');
    const searchAfterMigration = result.current.location.search;
    expect(searchAfterMigration).toContain('destKey=IN');

    // Trigger an unrelated URL state change — this causes the whole facade (and every
    // domain hook sharing its urlParams/setUrlParams, including the agricultural
    // domain's migration effect, whose deps include urlParams) to re-run.
    act(() => {
      result.current.urlState[1].setMaxKm(50);
    });

    // The destination key must be UNCHANGED — no re-migration, no reset, no legacy
    // param reappearing. This is the once-ness assertion: a second effect firing would
    // be a no-op given the ref guard, but if it were NOT a no-op (the bug this guards
    // against), selectedLocality could reset to null or the legacy params could
    // reappear — neither happens.
    expect(result.current.urlState[0].selectedLocality).toBe('IN|KA|Udupi|Manipal');
    expect(result.current.urlState[0].selectedMaxKm).toBe(50);
    const searchAfterRerender = result.current.location.search;
    expect(searchAfterRerender).toContain('destKey=IN');
    expect(searchAfterRerender).not.toContain('locality=');
    expect(searchAfterRerender).not.toContain('town=');
  });

  it('an already-canonical destKey= wins over a simultaneously-present legacy locality= (no dual-canonical state)', () => {
    const { result } = renderWithLocation(
      '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&destKey=AlreadyCanonical&locality=Ignored',
    );

    // Canonical value is authoritative; the legacy value is never consulted once destKey exists.
    expect(result.current.urlState[0].selectedLocality).toBe('AlreadyCanonical');
  });

  it('setLocality writes the canonical destKey param and clears legacy locality/town params', () => {
    const { result } = renderWithLocation(
      '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&locality=IN%7CKA%7CUdupi%7COldTown',
    );

    // Let the cold-load migration settle first (area_key-shaped legacy value migrates unchanged).
    expect(result.current.urlState[0].selectedLocality).toBe('IN|KA|Udupi|OldTown');

    act(() => {
      result.current.urlState[1].setLocality('IN|KA|Udupi|Manipal');
    });

    expect(result.current.urlState[0].selectedLocality).toBe('IN|KA|Udupi|Manipal');
    const search = result.current.location.search;
    expect(search).toContain('destKey=IN');
    expect(search).not.toContain('locality=');
    expect(search).not.toContain('town=');
  });

  it('clearLocality removes the canonical destKey param', () => {
    const { result } = renderWithLocation(
      '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&destKey=IN%7CKA%7CUdupi%7CManipal',
    );

    expect(result.current.urlState[0].selectedLocality).toBe('IN|KA|Udupi|Manipal');

    act(() => {
      result.current.urlState[1].clearLocality();
    });

    expect(result.current.urlState[0].selectedLocality).toBeNull();
    expect(result.current.location.search).not.toContain('destKey=');
  });

  it('no legacy or canonical param present → selectedLocality is null, no migration write occurs', () => {
    const { result } = renderWithLocation('/discover?city=udupi&journey=agri-first&region=N&maxKm=25');

    expect(result.current.urlState[0].selectedLocality).toBeNull();
    expect(result.current.location.search).not.toContain('destKey=');
  });

  describe('render-scope selectedLocality fallback — free text must never leak, not even on the first render (reviewer-24 finding)', () => {
    it('a free-text legacy locality= is null on the VERY FIRST render, before the migration effect has run', () => {
      // Captures selectedLocality on every render pass, in render-body scope (not inside an
      // effect/act flush) — the first entry reflects the value the rest of the app would read
      // on mount, before the migration effect below has had any chance to clean up the URL.
      // This is the exact scenario reviewer-24 flagged: a query hook gated on
      // `enabled: !!selectedLocality` could fire with `areaKey=Manipal` on this first render.
      const renders: Array<string | null> = [];
      function useProbe() {
        const urlState = useDiscoverUrlState();
        renders.push(urlState[0].selectedLocality);
        return urlState;
      }

      const { result } = renderHook(() => useProbe(), {
        wrapper: wrapper('/discover?city=udupi&journey=agri-first&region=N&maxKm=25&locality=Manipal'),
      });

      // First render must never expose the free-text value as a "ready" destination identity.
      expect(renders[0]).toBeNull();
      // And the settled state (post-migration) stays null too — no regression vs. the existing
      // write-side coverage above.
      expect(result.current[0].selectedLocality).toBeNull();
      expect(result.current[1]).toBeDefined(); // actions object still present/usable
    });

    it('an area_key-shaped legacy town= is still exposed on the first render (preserves existing migration fallback)', () => {
      const renders: Array<string | null> = [];
      function useProbe() {
        const urlState = useDiscoverUrlState();
        renders.push(urlState[0].selectedLocality);
        return urlState;
      }

      renderHook(() => useProbe(), {
        wrapper: wrapper(
          '/discover?city=udupi&journey=agri-first&region=N&maxKm=25&town=IN%7CKA%7CUdupi%7CKota',
        ),
      });

      // A real area_key-shaped legacy value must still work as the first-render fallback —
      // this is the explicitly-required "preserve migration of already-area-key-shaped legacy
      // values" behaviour.
      expect(renders[0]).toBe('IN|KA|Udupi|Kota');
    });
  });
});
