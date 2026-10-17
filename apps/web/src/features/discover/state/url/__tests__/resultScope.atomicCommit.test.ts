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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { projectUrlFilters } from '@/features/discover/selectors/urlFiltersProjection';
import { toDiscoverUrlFilters } from '../filters';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { useDiscoverActions } from '@/features/discover/context/useDiscoverContext';
import { useResultScopeController } from '@/features/discover/area-selected/controllers/useResultScopeController';

// #2750 PR-5 T3 (2015-N6c) mounts the REAL DiscoverProvider + useResultScopeController; the controller's only
// data dependency is the areas lookup behind the Return label, so that single hook is stubbed with one area.
vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({
    data: {
      city: 'bangalore',
      areas: [
        {
          areaKey: 'IN|KA|Bengaluru|Hebbal', name: 'Hebbal', geoCenterLat: 13.04, geoCenterLon: 77.59,
          minLat: 13.0, minLon: 77.55, maxLat: 13.08, maxLon: 77.63, listingCount: 5, schoolCount: 1,
        },
      ],
    },
    isLoading: false,
  })),
}));

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
      navigate: useNavigate(),
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

// ─── #2750 PR-5 B1 T1 destination tests (area URL domain) ─────────────────────
// Rows: 1483-N1 (startOver), 1483-N2 (explicit empty scope=), group-results-N1 (groupResults=1).
// The area domain fires a default-journey hierarchy probe (api.get) when no journey/scope is in the URL.
// A real dev backend on :8085 could answer 404 and flip journey, so every fetch is made to fail like an
// offline network (a non-404 error keeps the optimistic 'area-first' default the control arms rely on).
describe('#2750 PR-5 T1 — area URL domain (startOver / explicit scope= / groupResults)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline (test)'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // #2750 PR-5 1483-N1
  it('startOver clears journey, groupId, areaKey and filters in one REPLACE, keeping city and rent intent', () => {
    const { result } = renderFacade(
      '/discover?city=udupi&journey=area-first&groupId=south-udupi&areaKey=IN%7CKA%7CUdupi%7CManipal&type=apartment&intent=rent&lat=13.3&lon=74.8&zoom=14',
    );
    const beforeKey = result.current.location.key;

    act(() => {
      result.current.urlState[1].startOver();
    });

    // Exactly city + rent intent survive; journey/groupId/areaKey/type/lat/lon/zoom are all gone.
    expect(result.current.location.search).toBe('?city=udupi&intent=rent');
    expect(result.current.location.key).not.toBe(beforeKey);
    expect(result.current.navigationType).toBe('REPLACE');

    // Second arm: no intent in the URL -> only city is kept (buy is the omitted default).
    const second = renderFacade(
      '/discover?city=udupi&journey=area-first&groupId=south-udupi&areaKey=IN%7CKA%7CUdupi%7CManipal&type=apartment',
    );
    act(() => {
      second.result.current.urlState[1].startOver();
    });
    expect(second.result.current.location.search).toBe('?city=udupi');
    expect(second.result.current.navigationType).toBe('REPLACE');
  });

  // #2750 PR-5 1483-N2 (also the hierarchy-N1 alias)
  it('an explicit empty scope= suppresses the area-first default journey and is not rewritten', () => {
    const { result } = renderFacade('/discover?city=udupi&scope=');

    expect(result.current.urlState[0].journey).toBeNull();
    // The sentinel is read, never rewritten away or replaced by journey=area-first.
    expect(result.current.location.search).toBe('?city=udupi&scope=');

    // Control arm: no scope param -> the virtual default journey is area-first.
    const control = renderFacade('/discover?city=udupi');
    expect(control.result.current.urlState[0].journey).toBe('area-first');
    expect(control.result.current.location.search).toBe('?city=udupi');
  });

  // #2750 PR-5 group-results-N1
  it('groupResults=1 is read from a cold-load URL and enterGroupResults PUSHes it', () => {
    const cold = renderFacade(
      '/discover?city=udupi&journey=area-first&groupId=south-udupi&groupResults=1',
    );
    expect(cold.result.current.urlState[0].groupResults).toBe(true);
    expect(new URLSearchParams(cold.result.current.location.search).get('groupResults')).toBe('1');

    // Control arm: same URL without the param -> undefined, until enterGroupResults() PUSHes it.
    const { result } = renderFacade('/discover?city=udupi&journey=area-first&groupId=south-udupi');
    expect(result.current.urlState[0].groupResults).toBeUndefined();
    const beforeKey = result.current.location.key;

    act(() => {
      result.current.urlState[1].enterGroupResults();
    });

    const search = new URLSearchParams(result.current.location.search);
    expect(search.get('groupResults')).toBe('1');
    expect(search.get('groupId')).toBe('south-udupi');
    expect(result.current.location.key).not.toBe(beforeKey);
    expect(result.current.navigationType).toBe('PUSH');
    expect(result.current.urlState[0].groupResults).toBe(true);
  });
});

// ─── #2750 PR-5 B1 T2 — FC-5 (filters URL write, debounced REPLACE) ───────────────────────────────
// Fake timers are installed INSIDE the `it` and restored in this describe's afterEach, so they can never
// leak into the (real-timer) describes above or below.
describe('#2750 PR-5 T2 — filter chip dismiss URL write (FC-5)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline (test)'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // #2750 PR-5 FC-5
  it('writing filters without seller removes only seller from the URL, as a REPLACE after the 300 ms debounce', () => {
    vi.useFakeTimers();
    const { result } = renderFacade(
      '/discover?city=udupi&seller=owner&from=2025-01-15&to=2025-02-01&ntm=1&rera=1',
    );
    const keyBefore = result.current.location.key;
    expect(new URLSearchParams(result.current.location.search).get('seller')).toBe('owner');

    // What the chip dismiss does end to end: URL filters -> projected PropertyFilters, minus sellerTypes,
    // -> back to URL filters -> the facade's live (debounced) write.
    const projected = projectUrlFilters(result.current.urlState[0].filters);
    act(() => {
      result.current.urlState[1].setFiltersLive(
        toDiscoverUrlFilters({ ...projected, sellerTypes: undefined }),
      );
    });

    // Not before the debounce: nothing written, no navigation.
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(new URLSearchParams(result.current.location.search).get('seller')).toBe('owner');
    expect(result.current.location.key).toBe(keyBefore);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const search = new URLSearchParams(result.current.location.search);
    expect(search.has('seller')).toBe(false);
    // Siblings are untouched.
    expect(search.get('from')).toBe('2025-01-15');
    expect(search.get('to')).toBe('2025-02-01');
    expect(search.get('ntm')).toBe('1');
    expect(search.get('rera')).toBe('1');
    expect(search.get('city')).toBe('udupi');
    // A live/uncommitted edit REPLACEs: it is not a history destination.
    expect(result.current.location.key).not.toBe(keyBefore);
    expect(result.current.navigationType).toBe('REPLACE');
  });

  // #2750 PR-5 B1 fix-c1 FC-3 (date chip dismiss drops BOTH from and to; siblings kept), real facade writer path
  it('FC-3: writing filters without dateFrom/dateTo removes BOTH from and to from the URL and keeps ntm/rera/seller', () => {
    vi.useFakeTimers();
    const { result } = renderFacade(
      '/discover?city=udupi&seller=owner&from=2025-01-15&to=2025-02-01&ntm=1&rera=1',
    );
    const projected = projectUrlFilters(result.current.urlState[0].filters);
    expect(new URLSearchParams(result.current.location.search).get('to')).toBe('2025-02-01');

    act(() => {
      result.current.urlState[1].setFiltersLive(
        toDiscoverUrlFilters({ ...projected, dateFrom: undefined, dateTo: undefined }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    const search = new URLSearchParams(result.current.location.search);
    expect(search.has('from')).toBe(false);
    expect(search.has('to')).toBe(false);
    // Siblings are untouched.
    expect(search.get('seller')).toBe('owner');
    expect(search.get('ntm')).toBe('1');
    expect(search.get('rera')).toBe('1');
    expect(search.get('city')).toBe('udupi');
    expect(result.current.navigationType).toBe('REPLACE');
  });

  // #2750 PR-5 B1 fix-c1 FC-4 (new-to-market chip dismiss drops ntm; rera kept), real facade writer path
  it('FC-4: writing filters without newToMarket removes ntm from the URL and keeps rera/from/to/seller', () => {
    vi.useFakeTimers();
    const { result } = renderFacade(
      '/discover?city=udupi&seller=owner&from=2025-01-15&to=2025-02-01&ntm=1&rera=1',
    );
    const projected = projectUrlFilters(result.current.urlState[0].filters);
    expect(new URLSearchParams(result.current.location.search).get('ntm')).toBe('1');

    act(() => {
      result.current.urlState[1].setFiltersLive(
        toDiscoverUrlFilters({ ...projected, newToMarket: undefined }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    const search = new URLSearchParams(result.current.location.search);
    expect(search.has('ntm')).toBe(false);
    expect(search.get('rera')).toBe('1');
    expect(search.get('from')).toBe('2025-01-15');
    expect(search.get('to')).toBe('2025-02-01');
    expect(search.get('seller')).toBe('owner');
    expect(result.current.navigationType).toBe('REPLACE');
  });
});

// ─── #2750 PR-5 B1 T3— real history traversal across the area / result-scope URL writes ─────────────────
// url-state-N5 (selectArea is a PUSH), 2015-N6b (VIEWPORT activation REPLACEs), 2015-N6c (Return over a VIEWPORT
// PUSHes). Every Back/Forward below is the router's own navigate(-1)/navigate(1) on a real MemoryRouter history
// stack, never an assertion on a replace flag in a spy.
describe('#2750 PR-5 T3 — area / result-scope history semantics (real navigate(-1)/(1))', () => {
  const HEBBAL = 'IN|KA|Bengaluru|Hebbal';
  const VIEWPORT_BOUNDS = { s: 12.9, w: 77.5, n: 13.0, e: 77.6 };

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline (test)'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // #2750 PR-5 url-state-N5
  it('selectArea is a PUSH: real navigate(-1) removes areaKey and navigate(1) restores it', () => {
    const { result } = renderFacade('/discover?city=bangalore');
    expect(new URLSearchParams(result.current.location.search).has('areaKey')).toBe(false);

    act(() => {
      result.current.urlState[1].selectArea(HEBBAL);
    });
    expect(new URLSearchParams(result.current.location.search).get('areaKey')).toBe(HEBBAL);
    const typeAfterSelect = result.current.navigationType;

    // Back pops the selection entry: the pre-selection URL has no areaKey.
    act(() => {
      result.current.navigate(-1);
    });
    expect(new URLSearchParams(result.current.location.search).has('areaKey')).toBe(false);
    expect(result.current.location.search).toBe('?city=bangalore');

    // Forward replays the selection.
    act(() => {
      result.current.navigate(1);
    });
    expect(new URLSearchParams(result.current.location.search).get('areaKey')).toBe(HEBBAL);
    // And the select itself was recorded as a PUSH (a REPLACE would have left Back with nothing to pop).
    expect(typeAfterSelect).toBe('PUSH');
  });

  // #2750 PR-5 2015-N6b
  it('VIEWPORT commit with { history: \'replace\' } REPLACEs: one Back skips to the entry before the AREA_SET', () => {
    const { result } = renderFacade('/discover?city=bangalore');

    act(() => {
      result.current.urlState[1].commitResultScope({ kind: 'AREA_SET', areaKeys: [HEBBAL] });
    });
    expect(result.current.navigationType).toBe('PUSH');
    expect(new URLSearchParams(result.current.location.search).get('rscope')).toBe('areas');

    act(() => {
      result.current.urlState[1].commitResultScope({ kind: 'VIEWPORT', bounds: VIEWPORT_BOUNDS }, { history: 'replace' });
    });
    const typeAfterViewport = result.current.navigationType;
    expect(new URLSearchParams(result.current.location.search).get('rscope')).toBe('vp');

    // The VIEWPORT replaced the AREA_SET entry, so ONE Back lands on the entry before it (no scope at all).
    act(() => {
      result.current.navigate(-1);
    });
    expect(new URLSearchParams(result.current.location.search).has('rscope')).toBe(false);
    expect(result.current.location.search).toBe('?city=bangalore');
    // And the activation itself was recorded as a REPLACE.
    expect(typeAfterViewport).toBe('REPLACE');
  });

  // #2750 PR-5 2015-N6c
  it('Return to previous over a VIEWPORT is a PUSH: one Back lands on the VIEWPORT again', () => {
    const { result } = renderHook(
      () => ({
        controller: useResultScopeController({ city: 'bangalore', isViewportScope: true }),
        actions: useDiscoverActions(),
        location: useLocation(),
        navigationType: useNavigationType(),
        navigate: useNavigate(),
      }),
      {
        wrapper: function ProviderWrapper({ children }: { children: React.ReactNode }) {
          const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
          return React.createElement(
            QueryClientProvider,
            { client: queryClient },
            React.createElement(
              MemoryRouter,
              { initialEntries: ['/discover?city=bangalore'] },
              React.createElement(DiscoverProvider, null, children),
            ),
          );
        },
      },
    );
    const scopeOf = () => new URLSearchParams(result.current.location.search).get('rscope');

    // AREA_SET (PUSH) -> VIEWPORT (REPLACE, the entry now holds rscope=vp with the AREA_SET saved in rprev).
    act(() => {
      result.current.actions.commitResultScope({ kind: 'AREA_SET', areaKeys: [HEBBAL] });
    });
    act(() => {
      result.current.actions.commitResultScope({ kind: 'VIEWPORT', bounds: VIEWPORT_BOUNDS }, { history: 'replace' });
    });
    expect(scopeOf()).toBe('vp');
    expect(result.current.controller.activeScope?.kind).toBe('VIEWPORT');
    expect(result.current.controller.returnLabel).toBe('Return to Hebbal');

    act(() => {
      result.current.controller.commands.returnToPrevious();
    });
    expect(scopeOf()).toBe('areas');
    const typeAfterReturn = result.current.navigationType;

    // ONE Back lands on the VIEWPORT again (Return was a PUSH, not a REPLACE of the VIEWPORT entry).
    act(() => {
      result.current.navigate(-1);
    });
    expect(scopeOf()).toBe('vp');
    expect(typeAfterReturn).toBe('PUSH');
  });
});
