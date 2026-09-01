/**
 * Issue #2016 code-review Finding 4 (BLOCKING) regression coverage.
 *
 * THE BUG: `state/url/resultScope.ts` used to re-decode `urlParams` into a
 * fresh `active` object on every render. `useDiscoverPageState.ts`'s effect
 * syncing the derived `filters.polygon` from `resultScope.active` compared
 * `resultScope.active.coordinates` by REFERENCE — a fresh object every
 * render means the comparison always fails, `setFilters` always fires,
 * triggering a re-render, which produces a NEW `active` object again — an
 * infinite render loop ("Maximum update depth exceeded"), reproducible by
 * loading (or refresh-restoring) any URL carrying `rscope=poly&rpoly=...`.
 *
 * THE FIX: `state/url/resultScope.ts` now `useMemo`s `active`/`previous` on
 * the raw param STRINGS (stable primitives across renders when the URL is
 * unchanged), so `resultScope.active` — and therefore
 * `resultScope.active.coordinates` — has a STABLE reference across renders
 * whenever the underlying scope hasn't actually changed.
 *
 * This test renders the REAL facade (useDiscoverUrlState) + useDiscoverPageState
 * through a real MemoryRouter — not mocked urlActions/urlState — because the
 * bug lived entirely in the interaction between the two, which a mocked
 * urlState (as most other useDiscoverPageState tests use) cannot reproduce.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { useDiscoverPageState } from '@/hooks/useDiscoverPageState';

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

describe('useDiscoverPageState + useDiscoverUrlState — Issue #2016 Finding 4 regression', () => {
  it('restoring a committed POLYGON scope from the URL renders without looping and filters.polygon identity stabilizes across re-renders', () => {
    const rpoly = '12.90000:77.50000;12.95000:77.55000;12.90000:77.60000';
    const url = `/discover?city=bangalore&rscope=poly&rpoly=${encodeURIComponent(rpoly)}`;

    // A genuine infinite loop throws "Maximum update depth exceeded" inside
    // this renderHook call itself (React bails out of runaway nested
    // setState within one commit) — simply reaching the assertions below is
    // part of the regression proof, not just their content.
    const { result, rerender } = renderHook(
      () => {
        const [urlState, urlActions] = useDiscoverUrlState();
        return useDiscoverPageState({ urlState, urlActions });
      },
      { wrapper: wrapper(url) },
    );

    expect(result.current.filters.polygon).toEqual([
      [12.9, 77.5],
      [12.95, 77.55],
      [12.9, 77.6],
    ]);
    const firstPolygonRef = result.current.filters.polygon;

    // Force additional re-renders (simulating an unrelated parent re-render)
    // — the exact identity check Finding 4 flags as broken.
    rerender();
    rerender();
    expect(result.current.filters.polygon).toBe(firstPolygonRef);

    // resultScope.active itself must also be reference-stable across
    // renders when the URL hasn't changed (the useCallback-deps smell the
    // same finding calls out at useDiscoverPageState.ts's handler callbacks).
    const activeRef = result.current.resultScope.active;
    rerender();
    expect(result.current.resultScope.active).toBe(activeRef);
  });

  it('a committed AREA_SET scope from the URL also renders without looping (control — this branch was already safe pre-fix)', () => {
    const url = '/discover?city=bangalore&rscope=areas&rareas=IN%7CKA%7CBengaluru%7CHebbal';

    const { result, rerender } = renderHook(
      () => {
        const [urlState, urlActions] = useDiscoverUrlState();
        return useDiscoverPageState({ urlState, urlActions });
      },
      { wrapper: wrapper(url) },
    );

    expect(result.current.resultScope.active).toEqual({
      kind: 'AREA_SET',
      areaKeys: ['IN|KA|Bengaluru|Hebbal'],
    });
    expect(result.current.filters.polygon).toBeUndefined();

    rerender();
    expect(result.current.filters.polygon).toBeUndefined();
  });
});
