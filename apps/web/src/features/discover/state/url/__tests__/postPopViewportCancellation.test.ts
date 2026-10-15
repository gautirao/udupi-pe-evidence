/**
 * Issue #2083 RC_A part 1 — universal post-transition cancellation of the
 * pending viewport-debounce commit.
 *
 * The 300ms `reportViewport` debounce (viewport.ts) was, before this fix,
 * cancelled ONLY by a handful of per-writer synchronous calls
 * (navigation.ts's `writeNode`/`enterAreasJourney`, area.ts's
 * `deselectArea`). A browser Back (a POP) calls none of them, so an armed
 * timer could survive the pop and flush a stale camera onto the NEW history
 * entry (AC4).
 *
 * This exercises the REAL facade (`useDiscoverUrlState`) against a REAL
 * `MemoryRouter` POP (`navigate(-1)`) — not a hand-built domain-hook ctx
 * (see `navigationCommandMatrix.test.ts` for that level) — because the fix
 * lives in an effect keyed on `useLocation().key`, which only exists inside
 * the facade and cannot be exercised through an isolated domain hook.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';

function makeWrapper(initialEntries: string[], initialIndex: number) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const navigateRef: { current: ((delta: number) => void) | null } = { current: null };
  function NavCapture() {
    const navigate = useNavigate();
    navigateRef.current = (delta: number) => navigate(delta);
    return null;
  }
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        MemoryRouter,
        { initialEntries, initialIndex },
        React.createElement(NavCapture, null),
        children,
      ),
    );
  }
  return { Wrapper, navigateRef };
}

describe('#2083 RC_A part 1 — a viewport debounce armed just before a browser Back never lands on the popped-to entry (AC4)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('POP (navigate(-1)) cancels the pending commit — no stale lat/lon/zoom is stamped onto the entry Back landed on', () => {
    const { Wrapper, navigateRef } = makeWrapper(
      ['/discover?city=bangalore&node=root', '/discover?city=bangalore&node=d%3Anorth'],
      1,
    );
    const { result } = renderHook(() => useDiscoverUrlState(), { wrapper: Wrapper });

    // Arm the 300ms viewport debounce — simulates the user panning right
    // before pressing Back — WITHOUT letting it flush yet.
    act(() => {
      result.current[1].reportViewport({ lat: 12.9, lon: 77.6, zoom: 14 });
    });

    // Browser Back — a POP. No domain writer sees this call; only the
    // facade's `location.key`-keyed effect can catch it.
    act(() => {
      navigateRef.current?.(-1);
    });

    // Advance well past the 300ms debounce.
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Landed back on node=root, which must carry NO lat/lon/zoom — a
    // surviving flush would have stamped the pre-Back camera onto it.
    expect(result.current[0].node).toBe('root');
    expect(result.current[0].viewport).toBeNull();
  });

  it('a normal pan with NO navigation still persists — the cancellation is transition-scoped, not blanket', () => {
    const { Wrapper } = makeWrapper(['/discover?city=bangalore&node=root'], 0);
    const { result } = renderHook(() => useDiscoverUrlState(), { wrapper: Wrapper });

    act(() => {
      result.current[1].reportViewport({ lat: 12.9, lon: 77.6, zoom: 14 });
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current[0].viewport).toEqual({ lat: 12.9, lon: 77.6, zoom: 14 });
  });

  // Issue #2083 (code-review Finding 4) — documents a known, ACCEPTED
  // trade-off of the universal `location.key` cancellation: it is keyed on
  // ANY history transition, not just a POP, so an unrelated SYNCHRONOUS URL
  // write (e.g. a filter toggle's `setFiltersCommitted`, which PUSHes
  // immediately) landing within the 300ms viewport debounce window also
  // cancels that pending pan — even though no POP occurred and the pan
  // itself was never reverted.
  //
  // This is intentional, not a bug: the alternative (scoping the
  // cancellation to POP transitions only, e.g. via history.action) would
  // reopen exactly the race AC4 closes for `navigate(-1)`/`<Link replace>`
  // paths that arrive through the same `location.key` effect with no
  // distinguishing signal available to this hook. A dropped pan is silently
  // recoverable (the user just re-pans); a stale camera stamped onto the
  // wrong history entry is not.
  it('an unrelated synchronous URL write (filter toggle) within the debounce window also drops the pending pan — accepted trade-off, not a POP-only guard', () => {
    const { Wrapper } = makeWrapper(['/discover?city=bangalore&node=root'], 0);
    const { result } = renderHook(() => useDiscoverUrlState(), { wrapper: Wrapper });

    // Arm the 300ms viewport debounce — simulates the user panning.
    act(() => {
      result.current[1].reportViewport({ lat: 12.9, lon: 77.6, zoom: 14 });
    });

    // An UNRELATED synchronous write — a filter toggle's committed Apply,
    // NOT a POP/browser-Back. Still changes `location.key` (a PUSH), so the
    // universal cancellation effect fires.
    act(() => {
      result.current[1].setFiltersCommitted({ propertyTypes: ['apartment'] });
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // The pan is intentionally absent — dropped by the same guard that
    // protects POP transitions, per the trade-off documented above.
    expect(result.current[0].viewport).toBeNull();
    // The unrelated write itself DID land — proves this isn't a broader
    // "nothing writes" failure, only the viewport commit was cancelled.
    expect(result.current[0].filters.propertyTypes).toEqual(['apartment']);
  });

  // #2750 PR-4 B1 T1 (issue-2674-mobile-viewport-debounce-orphan, facade half). The map unmount
  // (DiscoverMapCanvas, mobile List<->Map toggle) is NOT a URL navigation, so neither the per-writer
  // cancels nor the `location.key` guard above fire for it: the only thing that disarms the armed
  // 300ms debounce is the explicit `cancelViewportCommit()` action the canvas calls on unmount.
  it('#2674: an explicit cancelViewportCommit() after a pan disarms the debounce — no lat/lon/zoom is written 400ms later (no navigation involved)', () => {
    const { Wrapper } = makeWrapper(['/discover?city=bangalore&node=root'], 0);
    const { result } = renderHook(() => useDiscoverUrlState(), { wrapper: Wrapper });

    act(() => {
      result.current[1].reportViewport({ lat: 12.9, lon: 77.6, zoom: 14 });
    });
    // The map closes to List: the canvas's unmount cleanup calls exactly this.
    act(() => {
      result.current[1].cancelViewportCommit();
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current[0].viewport).toBeNull();
  });
});
