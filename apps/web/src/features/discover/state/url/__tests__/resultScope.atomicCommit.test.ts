/**
 * Issue #2016 code-review Finding 5 (BLOCKING) regression coverage.
 *
 * THE BUG: useDiscoverPageState.ts's handleAreaClick/handleAreaSelect fired
 * `urlActions.selectArea(areaKey)` AND `urlActions.commitResultScope(...)`
 * as two INDEPENDENT `setUrlParams` calls in the same render. react-router-
 * dom's functional-updater `prev` is the searchParams closed over from the
 * render that produced that `setSearchParams` identity — not necessarily
 * reflecting the first call's write when both fire in the same tick (see
 * _shared.ts's `liveUrlParamsRef` doc). Net effect: `selectArea`'s
 * `areaKey=` write was silently lost, clobbered by `commitResultScope`'s
 * stale-`prev` rebuild. Symmetrically, `handleAreaBack` combined a REPLACE
 * (`deselectArea`) with a PUSH (`commitResultScope(null)`), breaking the
 * "one history entry per committed scope change" AC.
 *
 * THE FIX: `selectArea`/`deselectArea` (state/url/area.ts) now accept an
 * OPTIONAL `resultScope` delta folded into their OWN single `setUrlParams`
 * updater via the extracted `applyResultScopeCommit` pure function — one
 * write, one history entry, both deltas always land together.
 *
 * This test renders the REAL facade through a real MemoryRouter (not a
 * mocked urlActions object) because the bug was specifically about how TWO
 * REAL `setUrlParams` calls interact within react-router-dom, which a mock
 * cannot reproduce.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
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
      navigationType: useNavigationType(),
    }),
    { wrapper: wrapper(initialUrl) },
  );
}

describe('selectArea/deselectArea + commitResultScope — Issue #2016 Finding 5 regression', () => {
  it('selectArea(areaKey, resultScope) writes BOTH areaKey and rscope/rareas in ONE push — neither clobbers the other', () => {
    const { result } = renderFacade('/discover?city=bangalore');
    const beforeKey = result.current.location.key;

    act(() => {
      result.current.urlState[1].selectArea('IN|KA|Bengaluru|Hebbal', {
        kind: 'AREA_SET',
        areaKeys: ['IN|KA|Bengaluru|Hebbal'],
      });
    });

    const search = new URLSearchParams(result.current.location.search);
    // THE core regression: under the old two-independent-calls bug, at most
    // ONE of these two would survive (whichever call's stale `prev` won) —
    // never both. Asserting both are simultaneously present is sufficient
    // to falsify that failure mode.
    expect(search.get('areaKey')).toBe('IN|KA|Bengaluru|Hebbal');
    expect(search.get('rscope')).toBe('areas');
    expect(search.get('rareas')).toBe('IN|KA|Bengaluru|Hebbal');
    // One navigation, one history entry — a PUSH (selectArea's own semantics).
    expect(result.current.location.key).not.toBe(beforeKey);
    expect(result.current.navigationType).toBe('PUSH');
  });

  it('selectArea(areaKey) with NO resultScope argument leaves any already-committed scope completely untouched (omitted, not cleared)', () => {
    const { result } = renderFacade(
      '/discover?city=bangalore&rscope=poly&rpoly=12.90000%3A77.50000%3B12.95000%3A77.55000%3B12.90000%3A77.60000',
    );

    act(() => {
      result.current.urlState[1].selectArea('IN|KA|Bengaluru|Hebbal');
    });

    const search = new URLSearchParams(result.current.location.search);
    expect(search.get('areaKey')).toBe('IN|KA|Bengaluru|Hebbal');
    // Omitted resultScope argument -> pre-#2016-fix behaviour: the existing
    // committed POLYGON survives untouched, not silently cleared.
    expect(search.get('rscope')).toBe('poly');
  });

  it('deselectArea(resultScope) clears areaKey/lat/lon/zoom AND the AREA_SET scope in ONE replace — no extra history entry', () => {
    const { result } = renderFacade(
      '/discover?city=bangalore&areaKey=IN%7CKA%7CBengaluru%7CHebbal&lat=12.9&lon=77.5&zoom=14&rscope=areas&rareas=IN%7CKA%7CBengaluru%7CHebbal',
    );
    const beforeKey = result.current.location.key;

    act(() => {
      result.current.urlState[1].deselectArea(null);
    });

    const search = new URLSearchParams(result.current.location.search);
    expect(search.has('areaKey')).toBe(false);
    expect(search.has('lat')).toBe(false);
    expect(search.has('lon')).toBe(false);
    expect(search.has('zoom')).toBe(false);
    expect(search.has('rscope')).toBe(false);
    expect(search.has('rareas')).toBe(false);
    // The cleared scope is captured for J3.5-style restoration even here.
    expect(search.get('rprev')).toBe('areas:IN|KA|Bengaluru|Hebbal');
    // ONE navigation, a REPLACE (deselectArea's own semantics) — not a
    // second independent PUSH from a standalone commitResultScope(null).
    expect(result.current.location.key).not.toBe(beforeKey);
    expect(result.current.navigationType).toBe('REPLACE');
  });

  it('deselectArea() with NO resultScope argument leaves an already-committed scope untouched', () => {
    const { result } = renderFacade(
      '/discover?city=bangalore&areaKey=IN%7CKA%7CBengaluru%7CHebbal&rscope=areas&rareas=IN%7CKA%7CBengaluru%7CHebbal',
    );

    act(() => {
      result.current.urlState[1].deselectArea();
    });

    const search = new URLSearchParams(result.current.location.search);
    expect(search.has('areaKey')).toBe(false);
    // Omitted resultScope argument -> the committed scope survives untouched.
    expect(search.get('rscope')).toBe('areas');
  });
});
