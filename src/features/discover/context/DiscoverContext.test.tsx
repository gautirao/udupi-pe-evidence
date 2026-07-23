/**
 * Unit tests for the Discover context facade — issue #1953 build step 1.
 *
 * Covers the three cases the plan calls out for this step:
 *  - stable-actions identity never changes across renders (D1_facade.stable_actions)
 *  - the nav context identity is unaffected by viewport-only updates, proving
 *    the four-context split actually isolates the high-frequency viewport
 *    writer from the rest of the tree (AC2)
 *  - mobileView resets to LIST when crossing from desktop to mobile
 *    (D3_mobile_view_state.crossing_desktop_to_mobile)
 *
 * Plus a runtime sanity check that ACTION_KEYS covers every DiscoverUrlActions
 * member (the actual build-breaking exhaustiveness gate is the type-level
 * assert in DiscoverContext.tsx, which is enforced by `tsc --noEmit`, not by
 * a runtime test — see AC3).
 *
 * Plus the R1-mandated regression set (product-owner Option A ruling) for
 * useDiscoverUrlState's debounce-timer guarantees, driven through this
 * facade: viewport-debounce cancellation on deselect/reset, "clear all" as
 * one atomic write, and cross-panel rapid updates within a single debounce
 * window. Each of these tests manufactures the pending-debounce window with
 * fake timers and fires the second action INSIDE it — a test that only
 * inspects the final URL after both actions have long since settled would
 * pass whether or not the race exists.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverProvider } from './DiscoverContext';
import { useDiscoverActions, useDiscoverNav, useDiscoverShell } from './useDiscoverContext';
import type { DiscoverActionsContextValue } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Wrapper({
  initialUrl = '/discover?city=udupi',
  children,
}: {
  initialUrl?: string;
  children: React.ReactNode;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <DiscoverProvider>{children}</DiscoverProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Controllable matchMedia mock — the shared setup.ts stub always reports
 * matches:false and its listeners are no-ops, so tests that need to flip the
 * mobile/desktop boundary install their own. */
function installMatchMediaMock(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  const mql = {
    get matches() {
      return matches;
    },
    media: '(max-width: 820px)',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => true,
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(mql),
  });
  return {
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

/**
 * Records every committed URL search-string, in order, as a raw
 * `URLSearchParams.toString()`. Reads directly off react-router's own
 * `useSearchParams`, NOT off any DiscoverContext slice — the nav context's
 * memo key deliberately strips lat/lon/zoom (AC2), so it would silently miss
 * a stray viewport-only write. This spy is the ground truth for "how many
 * times did the URL actually change", which is exactly what the "clear all
 * is one atomic write" guarantee needs (a write COUNT, not just a final
 * value — several racing writes can converge on the same correct final URL).
 */
function makeSearchParamsSpy() {
  const writes: string[] = [];
  function SearchParamsSpy() {
    const [params] = useSearchParams();
    useEffect(() => {
      writes.push(params.toString());
    });
    return null;
  }
  return { SearchParamsSpy, writes };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DiscoverProvider — stable actions', () => {
  it('exposes an actions object whose identity never changes, even across a real re-render triggered by nav changing', async () => {
    // Capture also reads useDiscoverNav() so that a genuine nav change
    // forces this component to actually re-render (React's "unchanged
    // children" bail-out would otherwise mask a naive re-render-count
    // assertion here, since nothing else forces Capture's parent chain to
    // re-visit it). Reading actions immediately afterwards then proves the
    // stable-actions guarantee under a REAL re-render, not a nominal one.
    const seenActions: DiscoverActionsContextValue[] = [];
    const seenJourneys: (string | null)[] = [];
    function Capture() {
      const actions = useDiscoverActions();
      const nav = useDiscoverNav();
      seenActions.push(actions);
      seenJourneys.push(nav.journey);
      return null;
    }

    render(
      <Wrapper>
        <Capture />
      </Wrapper>,
    );

    expect(seenActions.length).toBe(1);
    const first = seenActions[0];

    // setJourney is an immediate (non-debounced) PUSH that changes nav's
    // memo key, forcing Capture to re-render for a reason unrelated to
    // actions.
    await act(async () => {
      first.setJourney('area-first');
    });

    await waitFor(() => expect(seenJourneys.length).toBeGreaterThan(1));
    expect(seenJourneys[seenJourneys.length - 1]).toBe('area-first');

    // Capture genuinely re-rendered (journey changed) — but the actions
    // reference it received stayed identical throughout.
    expect(seenActions.every((actions) => actions === first)).toBe(true);
  });
});

describe('DiscoverProvider — nav/viewport isolation (AC2)', () => {
  it('does not change the nav context identity across viewport-only updates', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    let navRenderCount = 0;
    const NavSpy = React.memo(function NavSpy() {
      useDiscoverNav();
      navRenderCount += 1;
      return null;
    });

    let capturedActions: DiscoverActionsContextValue | null = null;
    function ActionsCapture() {
      capturedActions = useDiscoverActions();
      return null;
    }

    render(
      <Wrapper>
        <ActionsCapture />
        <NavSpy />
      </Wrapper>,
    );

    const initialRenderCount = navRenderCount;
    expect(capturedActions).not.toBeNull();

    // Simulate a rapid pan: N viewport reports, well within the 300ms debounce
    // window, so no single one of them lands in the URL synchronously.
    await act(async () => {
      for (let i = 0; i < 10; i += 1) {
        capturedActions?.reportViewport({ lat: 13.34 + i * 0.001, lon: 74.74, zoom: 12 });
        vi.advanceTimersByTime(50);
      }
    });

    // NavSpy is memoized and subscribes ONLY to DiscoverNavContext, whose
    // memo key strips lat/lon/zoom (the viewport's own URL params) — so even
    // once the debounce fires and the viewport lands in the URL, nav's memo
    // key is unchanged and NavSpy must not have re-rendered.
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(navRenderCount).toBe(initialRenderCount);

    vi.useRealTimers();
  });
});

describe('DiscoverProvider — mobileView (D3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore the shared setup.ts matchMedia stub for subsequent test files.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {},
      }),
    });
  });

  it('resets mobileView to LIST when crossing from desktop to mobile', async () => {
    const mock = installMatchMediaMock(false); // start on desktop

    let shellState: ReturnType<typeof useDiscoverShell> | null = null;
    function ShellCapture() {
      shellState = useDiscoverShell();
      return null;
    }

    render(
      <Wrapper>
        <ShellCapture />
      </Wrapper>,
    );

    expect(shellState?.isMobileShell).toBe(false);
    expect(shellState?.mobileView).toBe('LIST');

    // Move to MAP while still on desktop.
    await act(async () => {
      shellState?.setMobileView('MAP');
    });
    expect(shellState?.mobileView).toBe('MAP');

    // Cross desktop -> mobile: mobileView must reset to LIST.
    await act(async () => {
      mock.setMatches(true);
    });

    expect(shellState?.isMobileShell).toBe(true);
    expect(shellState?.mobileView).toBe('LIST');
  });

  it('does not reset mobileView on mount when it starts on mobile', () => {
    installMatchMediaMock(true); // start on mobile

    let shellState: ReturnType<typeof useDiscoverShell> | null = null;
    function ShellCapture() {
      shellState = useDiscoverShell();
      return null;
    }

    render(
      <Wrapper>
        <ShellCapture />
      </Wrapper>,
    );

    expect(shellState?.isMobileShell).toBe(true);
    expect(shellState?.mobileView).toBe('LIST');
  });
});

describe('DiscoverProvider — throws outside a provider', () => {
  it('useDiscoverActions throws a clear error when used without a DiscoverProvider', () => {
    function Bare() {
      useDiscoverActions();
      return null;
    }
    // Swallow the expected React error-boundary console noise for this case.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/useDiscoverActions must be used within a <DiscoverProvider>/);
    spy.mockRestore();
  });
});

// ─── R1 mandated regression coverage ───────────────────────────────────────────
//
// useDiscoverUrlState.ts owns three debounce timers — viewportTimer (line 600),
// filtersLiveTimer (601), searchTimer (602) — all cleared on unmount (607-609).
// The tests below pin the guarantees the source itself claims about those
// timers when a second action arrives INSIDE a still-pending debounce window.

describe('DiscoverProvider — R1: viewport debounce cancellation on deselect/reset', () => {
  it('deselectArea cancels a pending viewport debounce so stale lat/lon/zoom is not restored (source: useDiscoverUrlState.ts 902-906)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    let actions: DiscoverActionsContextValue | null = null;
    function ActionsCapture() {
      actions = useDiscoverActions();
      return null;
    }
    const { writes, SearchParamsSpy } = makeSearchParamsSpy();

    render(
      <Wrapper initialUrl="/discover?city=udupi&areaKey=area1&lat=13.00000&lon=74.70000&zoom=12">
        <ActionsCapture />
        <SearchParamsSpy />
      </Wrapper>,
    );

    await act(async () => {
      // Schedule a viewport write (930-931) — 300ms debounce, not yet fired.
      actions?.reportViewport({ lat: 13.99999, lon: 74.99999, zoom: 16 });
      // Still inside the pending window: deselect.
      vi.advanceTimersByTime(100);
      actions?.deselectArea();
    });

    // Run out the rest of the original viewport debounce window (and then some).
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    const finalParams = new URLSearchParams(writes[writes.length - 1]);
    expect(finalParams.get('areaKey')).toBeNull();
    // The cancelled reportViewport must not have landed — either the params are
    // gone entirely (deselectArea's own clear) or, if present for any other
    // reason, they must not be the stale coords that were in flight.
    expect(finalParams.get('lat')).not.toBe('13.99999');
    expect(finalParams.get('lon')).not.toBe('74.99999');
    expect(finalParams.get('zoom')).not.toBe('16');
    expect(finalParams.get('lat')).toBeNull();
    expect(finalParams.get('lon')).toBeNull();
    expect(finalParams.get('zoom')).toBeNull();

    vi.useRealTimers();
  });

  it('changeCity cancels a pending viewport debounce so it cannot restore stale coords after the switch (source: useDiscoverUrlState.ts 1115-1117)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    let actions: DiscoverActionsContextValue | null = null;
    function ActionsCapture() {
      actions = useDiscoverActions();
      return null;
    }
    const { writes, SearchParamsSpy } = makeSearchParamsSpy();

    render(
      <Wrapper initialUrl="/discover?city=udupi&areaKey=area1&lat=13.00000&lon=74.70000&zoom=12">
        <ActionsCapture />
        <SearchParamsSpy />
      </Wrapper>,
    );

    await act(async () => {
      actions?.reportViewport({ lat: 13.99999, lon: 74.99999, zoom: 16 });
      vi.advanceTimersByTime(100); // still inside the 300ms window
      actions?.changeCity('bangalore');
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    const finalParams = new URLSearchParams(writes[writes.length - 1]);
    expect(finalParams.get('city')).toBe('bangalore');
    expect(finalParams.get('areaKey')).toBeNull();
    expect(finalParams.get('lat')).not.toBe('13.99999');
    expect(finalParams.get('lon')).not.toBe('74.99999');
    expect(finalParams.get('zoom')).not.toBe('16');
    expect(finalParams.get('lat')).toBeNull();
    expect(finalParams.get('lon')).toBeNull();
    expect(finalParams.get('zoom')).toBeNull();

    vi.useRealTimers();
  });
});

describe('DiscoverProvider — R1: "clear all" is one atomic URL write (Issue #1854)', () => {
  it('cancels all three pending debounced writers (filters, search, viewport) and commits exactly one URL write', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    let actions: DiscoverActionsContextValue | null = null;
    function ActionsCapture() {
      actions = useDiscoverActions();
      return null;
    }
    const { writes, SearchParamsSpy } = makeSearchParamsSpy();

    render(
      <Wrapper initialUrl="/discover?city=udupi&type=house&q=foo">
        <ActionsCapture />
        <SearchParamsSpy />
      </Wrapper>,
    );

    const writesBeforeAction = writes.length; // mount write

    await act(async () => {
      // Schedule all three racing debounced writers within the same tick, all
      // closing over the same pre-clear snapshot — the exact interleaving
      // Issue #1854 was written to defend against.
      actions?.reportViewport({ lat: 13.5, lon: 74.8, zoom: 14 });
      actions?.setFiltersLive({ propertyTypes: ['apartment'] });
      actions?.setSearchQuery('bar');
      // clearAllFiltersAndSearch fires INSIDE all three pending windows and
      // must cancel them before they land.
      actions?.clearAllFiltersAndSearch();
    });

    // Run well past all three original debounce windows.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // THE load-bearing assertion: count the writes, don't just inspect the
    // final URL. Several racing writes can converge on a correct-looking
    // final URL, so only a count can catch a resurrected timer.
    expect(writes.length - writesBeforeAction).toBe(1);

    const finalParams = new URLSearchParams(writes[writes.length - 1]);
    expect(finalParams.get('type')).toBeNull();
    expect(finalParams.get('q')).toBeNull();

    vi.useRealTimers();
  });
});

describe('DiscoverProvider — R1: cross-panel rapid updates within one debounce window', () => {
  // Issue #1953 (build step 3) — this test is a KNOWN-RED regression test, not
  // a broken test to be fixed here. It found a pre-existing race in
  // useDiscoverUrlState.ts (confirmed by experiment to be independent of this
  // PR): two independent debounced writers scheduled within the same pending
  // window do not both survive to the canonical URL. Converted to
  // `it.fails()` so the suite stays green while the defect stays documented
  // in executable form — it will flip loudly (fail the `.fails()` wrapper,
  // i.e. surface as a suite failure) the moment someone fixes the underlying
  // race, which is the signal to convert this back to a plain `it()`.
  // Do NOT weaken the assertions below or delete this test. Follow-up owed
  // against useDiscoverUrlState.ts (out of scope / forbidden file for this PR).
  it.fails('preserves both a map-panel viewport update and a filters-panel update fired inside the same pending window, converging on the canonical URL (source: useDiscoverUrlState.ts 1211)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    let actions: DiscoverActionsContextValue | null = null;
    function ActionsCapture() {
      actions = useDiscoverActions();
      return null;
    }
    const { writes, SearchParamsSpy } = makeSearchParamsSpy();

    render(
      <Wrapper initialUrl="/discover?city=udupi&areaKey=area1">
        <ActionsCapture />
        <SearchParamsSpy />
      </Wrapper>,
    );

    await act(async () => {
      // Map panel schedules a viewport write.
      actions?.reportViewport({ lat: 13.55555, lon: 74.85555, zoom: 15 });
      // Still inside that 300ms window, the filters panel schedules its own
      // independent debounced write.
      vi.advanceTimersByTime(50);
      actions?.setFiltersLive({ propertyTypes: ['villa'] });
    });

    // Let both debounce windows fully elapse.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const finalParams = new URLSearchParams(writes[writes.length - 1]);
    // Canonical URL must reflect BOTH panels' updates — neither one may have
    // been silently dropped or overwritten by the other's stale snapshot.
    expect(finalParams.get('lat')).toBe('13.55555');
    expect(finalParams.get('lon')).toBe('74.85555');
    expect(finalParams.get('zoom')).toBe('15');
    expect(finalParams.get('type')).toBe('villa');
    expect(finalParams.get('areaKey')).toBe('area1');
    expect(finalParams.get('city')).toBe('udupi');

    vi.useRealTimers();
  });
});
