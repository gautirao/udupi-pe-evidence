/**
 * Issue #2762 PR-E regression coverage.
 *
 * THE BUG: `applyResultScopeCommit` (resultScope.ts) writes `rprev` from
 * whatever scope is currently active ("outgoing") UNCONDITIONALLY, with no
 * check for whether `outgoing` is itself a transient VIEWPORT scope. On a
 * SECOND consecutive "Search this area" (VIEWPORT -> VIEWPORT) commit, the
 * `rprev` written by the FIRST viewport commit (which correctly held the
 * previously-active NAMED scope, e.g. an AREA_SET) is overwritten with the
 * FIRST viewport's own bounds — permanently losing the named scope. "Return
 * to <area>" then restores a raw, unlabelled bounding box instead of the
 * area the user actually came from.
 *
 * THE FIX: `applyResultScopeCommit` only overwrites `rprev` when the
 * outgoing scope is itself a NAMED scope (AREA_SET or POLYGON), or when no
 * `rprev` is currently set — never when outgoing is VIEWPORT and a
 * previously-saved `rprev` already exists.
 *
 * Uses the same real-facade-through-a-real-MemoryRouter pattern as
 * resultScope.atomicCommit.test.ts (sibling file) rather than mocking
 * urlActions, since the bug is specifically about how successive REAL
 * `setUrlParams` commits interact through `rprev`.
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

function renderFacade(initialUrl: string) {
  return renderHook(
    () => ({
      urlState: useDiscoverUrlState(),
      location: useLocation(),
    }),
    { wrapper: wrapper(initialUrl) },
  );
}

const VIEWPORT_A = { kind: 'VIEWPORT' as const, bounds: { s: 12.9, w: 77.5, n: 13.0, e: 77.6 } };
const VIEWPORT_B = { kind: 'VIEWPORT' as const, bounds: { s: 12.91, w: 77.51, n: 13.01, e: 77.61 } };

describe('applyResultScopeCommit — Issue #2762 rprev VIEWPORT-overwrite regression', () => {
  it('a second consecutive VIEWPORT commit preserves rprev as the original NAMED scope, not the first VIEWPORT', () => {
    // Start already holding a committed AREA_SET scope (Koramangala-equivalent fixture area).
    const { result } = renderFacade(
      '/discover?city=bangalore&rscope=areas&rareas=IN%7CKA%7CBengaluru%7CHebbal',
    );

    // First "Search this area" — VIEWPORT A. Per resultScope.ts's own
    // documented AC7 behaviour, viewport activation commits with
    // { history: 'replace' }.
    act(() => {
      result.current.urlState[1].commitResultScope(VIEWPORT_A, { history: 'replace' });
    });

    let search = new URLSearchParams(result.current.location.search);
    expect(search.get('rscope')).toBe('vp');
    // The outgoing AREA_SET must have been captured into rprev here.
    expect(search.get('rprev')).toBe('areas:IN|KA|Bengaluru|Hebbal');

    // Second consecutive "Search this area" — VIEWPORT B.
    act(() => {
      result.current.urlState[1].commitResultScope(VIEWPORT_B, { history: 'replace' });
    });

    search = new URLSearchParams(result.current.location.search);
    expect(search.get('rscope')).toBe('vp');
    // THE REGRESSION ASSERTION: rprev must still resolve to the original
    // named AREA_SET (Hebbal) — NOT be overwritten with VIEWPORT A's bounds.
    // Under the pre-fix code this fails: rprev becomes `vp:<viewport-A-bounds>`.
    expect(search.get('rprev')).toBe('areas:IN|KA|Bengaluru|Hebbal');
  });

  it('"Return to <area>" (re-committing the AREA_SET rprev pointed at) does not leave rprev self-referential', () => {
    // Issue #2762 PR-E code-review finding (fix-verify cycle 1) — the naive
    // "preserve existingRprev across an outgoing VIEWPORT" fix made rprev
    // self-referential on the single most common path through this feature:
    // AREA_SET(Hebbal) -> "Search this area" -> VIEWPORT (rprev=Hebbal,
    // correct) -> user clicks "Return to Hebbal", which re-commits
    // AREA_SET(Hebbal) as the new active scope via decodePrev(rprev). At
    // THAT commit, outgoing is still VIEWPORT and existingRprev is still
    // "Hebbal" (nothing wrote to it between the two commits) — so the naive
    // fix rewrote rprev="Hebbal" AGAIN, identical to the scope simultaneously
    // becoming active. resolveReturnLabel then keeps rendering "Return to
    // Hebbal" even though the user is already on Hebbal.
    const { result } = renderFacade(
      '/discover?city=bangalore&rscope=areas&rareas=IN%7CKA%7CBengaluru%7CHebbal',
    );

    // "Search this area" while on Hebbal.
    act(() => {
      result.current.urlState[1].commitResultScope(VIEWPORT_A, { history: 'replace' });
    });
    let search = new URLSearchParams(result.current.location.search);
    expect(search.get('rprev')).toBe('areas:IN|KA|Bengaluru|Hebbal');

    // "Return to Hebbal" — re-commits the SAME AREA_SET rprev currently points at.
    act(() => {
      result.current.urlState[1].commitResultScope({
        kind: 'AREA_SET',
        areaKeys: ['IN|KA|Bengaluru|Hebbal'],
      });
    });

    search = new URLSearchParams(result.current.location.search);
    expect(search.get('rscope')).toBe('areas');
    expect(search.get('rareas')).toBe('IN|KA|Bengaluru|Hebbal');
    // THE ASSERTION: rprev must NOT equal the scope just committed as active
    // (self-referential) — the user is already on Hebbal, so there is
    // nothing meaningful left to "return to" and rprev should be absent.
    expect(search.get('rprev')).not.toBe('areas:IN|KA|Bengaluru|Hebbal');
    expect(search.has('rprev')).toBe(false);
  });
});
