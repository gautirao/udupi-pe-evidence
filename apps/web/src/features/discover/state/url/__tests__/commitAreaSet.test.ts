/**
 * Issue #2017 — multi-area AREA_SET "commit search" action.
 *
 * `commitAreaSet(areaKeys, { primaryAreaKey })` (state/url/area.ts) folds the
 * `areaKey` write and the `rscope`/`rareas` AREA_SET commit into ONE
 * `setUrlParams` call, mirroring `selectArea`'s atomic-fold pattern (see
 * resultScope.atomicCommit.test.ts / Issue #2016 code-review Finding 5) so
 * neither write can clobber the other and exactly one history entry is
 * produced per commit.
 *
 * This suite covers:
 *  1. Atomicity — a multi-key (N>1) commit writes areaKey + rscope + rareas
 *     together in one PUSH.
 *  2. Regression (MOST IMPORTANT) — an N=1 commit via commitAreaSet(['x'],
 *     { primaryAreaKey: 'x' }) is BYTE-FOR-BYTE identical, on every URL
 *     param the two actions both touch, to the pre-#2017 selectArea('x',
 *     { kind: 'AREA_SET', areaKeys: ['x'] }) path — the no-regression
 *     acceptance criterion, proven structurally rather than by inspection.
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

describe('commitAreaSet — Issue #2017 multi-area AREA_SET commit', () => {
  it('N>1 commit writes areaKey (primaryAreaKey) + rscope=areas + rareas (all keys) in ONE push — one history entry', () => {
    const { result } = renderFacade('/discover?city=bangalore');
    const beforeKey = result.current.location.key;

    act(() => {
      result.current.urlState[1].commitAreaSet(
        ['IN|KA|Bengaluru|Hebbal', 'IN|KA|Bengaluru|Yelahanka'],
        { primaryAreaKey: 'IN|KA|Bengaluru|Hebbal' },
      );
    });

    const search = new URLSearchParams(result.current.location.search);
    // Atomicity: under the two-independent-writes failure mode this suite
    // guards against, at most one of these three would survive a same-tick
    // race — asserting all three together falsifies that failure mode.
    expect(search.get('areaKey')).toBe('IN|KA|Bengaluru|Hebbal');
    expect(search.get('rscope')).toBe('areas');
    expect(search.get('rareas')).toBe('IN|KA|Bengaluru|Hebbal,IN|KA|Bengaluru|Yelahanka');
    // ONE navigation, a PUSH — commitAreaSet's own "commit search" semantics.
    expect(result.current.location.key).not.toBe(beforeKey);
    expect(result.current.navigationType).toBe('PUSH');
  });

  it('primaryAreaKey need not be the first areaKeys entry — areaKey always follows primaryAreaKey, rareas always follows insertion order', () => {
    const { result } = renderFacade('/discover?city=bangalore');

    act(() => {
      result.current.urlState[1].commitAreaSet(
        ['IN|KA|Bengaluru|Hebbal', 'IN|KA|Bengaluru|Yelahanka', 'IN|KA|Bengaluru|Malleshwaram'],
        { primaryAreaKey: 'IN|KA|Bengaluru|Yelahanka' },
      );
    });

    const search = new URLSearchParams(result.current.location.search);
    expect(search.get('areaKey')).toBe('IN|KA|Bengaluru|Yelahanka');
    expect(search.get('rareas')).toBe(
      'IN|KA|Bengaluru|Hebbal,IN|KA|Bengaluru|Yelahanka,IN|KA|Bengaluru|Malleshwaram',
    );
  });

  it('committing over an already-committed POLYGON scope captures the prior scope into rprev, in the same push', () => {
    const { result } = renderFacade(
      '/discover?city=bangalore&rscope=poly&rpoly=12.90000%3A77.50000%3B12.95000%3A77.55000%3B12.90000%3A77.60000',
    );

    act(() => {
      result.current.urlState[1].commitAreaSet(['IN|KA|Bengaluru|Hebbal'], {
        primaryAreaKey: 'IN|KA|Bengaluru|Hebbal',
      });
    });

    const search = new URLSearchParams(result.current.location.search);
    expect(search.get('rscope')).toBe('areas');
    expect(search.get('rareas')).toBe('IN|KA|Bengaluru|Hebbal');
    expect(search.has('rpoly')).toBe(false);
    expect(search.get('rprev')).not.toBeNull();
  });

  describe('N=1 no-regression: commitAreaSet(["x"], { primaryAreaKey: "x" }) === selectArea("x", { kind: "AREA_SET", areaKeys: ["x"] })', () => {
    const SINGLE_KEY = 'IN|KA|Bengaluru|Hebbal';

    it('produce IDENTICAL rscope/rareas/areaKey URL params from the same starting URL', () => {
      const viaCommit = renderFacade('/discover?city=bangalore');
      act(() => {
        viaCommit.result.current.urlState[1].commitAreaSet([SINGLE_KEY], {
          primaryAreaKey: SINGLE_KEY,
        });
      });
      const commitSearch = new URLSearchParams(viaCommit.result.current.location.search);

      const viaSelect = renderFacade('/discover?city=bangalore');
      act(() => {
        viaSelect.result.current.urlState[1].selectArea(SINGLE_KEY, {
          kind: 'AREA_SET',
          areaKeys: [SINGLE_KEY],
        });
      });
      const selectSearch = new URLSearchParams(viaSelect.result.current.location.search);

      // Byte-for-byte on every param either path can write.
      expect(commitSearch.get('areaKey')).toBe(selectSearch.get('areaKey'));
      expect(commitSearch.get('rscope')).toBe(selectSearch.get('rscope'));
      expect(commitSearch.get('rareas')).toBe(selectSearch.get('rareas'));
      expect(commitSearch.get('rprev')).toBe(selectSearch.get('rprev'));
      expect(commitSearch.get('rpoly')).toBe(selectSearch.get('rpoly'));
      expect(commitSearch.get('rvp')).toBe(selectSearch.get('rvp'));
      // Same full search string, not just the individual params checked above.
      expect(commitSearch.toString()).toBe(selectSearch.toString());
    });

    it('produce the SAME navigation semantics — one PUSH, one new history entry', () => {
      const viaCommit = renderFacade('/discover?city=bangalore');
      const commitBeforeKey = viaCommit.result.current.location.key;
      act(() => {
        viaCommit.result.current.urlState[1].commitAreaSet([SINGLE_KEY], {
          primaryAreaKey: SINGLE_KEY,
        });
      });

      const viaSelect = renderFacade('/discover?city=bangalore');
      const selectBeforeKey = viaSelect.result.current.location.key;
      act(() => {
        viaSelect.result.current.urlState[1].selectArea(SINGLE_KEY, {
          kind: 'AREA_SET',
          areaKeys: [SINGLE_KEY],
        });
      });

      expect(viaCommit.result.current.location.key).not.toBe(commitBeforeKey);
      expect(viaSelect.result.current.location.key).not.toBe(selectBeforeKey);
      expect(viaCommit.result.current.navigationType).toBe(viaSelect.result.current.navigationType);
      expect(viaCommit.result.current.navigationType).toBe('PUSH');
    });

    it('produce the SAME result over an already-committed prior scope (rprev capture identical)', () => {
      const startUrl =
        '/discover?city=bangalore&rscope=poly&rpoly=12.90000%3A77.50000%3B12.95000%3A77.55000%3B12.90000%3A77.60000';

      const viaCommit = renderFacade(startUrl);
      act(() => {
        viaCommit.result.current.urlState[1].commitAreaSet([SINGLE_KEY], {
          primaryAreaKey: SINGLE_KEY,
        });
      });
      const commitSearch = new URLSearchParams(viaCommit.result.current.location.search);

      const viaSelect = renderFacade(startUrl);
      act(() => {
        viaSelect.result.current.urlState[1].selectArea(SINGLE_KEY, {
          kind: 'AREA_SET',
          areaKeys: [SINGLE_KEY],
        });
      });
      const selectSearch = new URLSearchParams(viaSelect.result.current.location.search);

      expect(commitSearch.toString()).toBe(selectSearch.toString());
    });
  });
});
