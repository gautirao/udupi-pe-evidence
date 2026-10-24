/**
 * #2859 B7 (issue 285907) WEB slice B2 — discover-url-state, assertion url-state-6 (R_control replacement).
 *
 * url-state-6 is the NEGATIVE "a pending viewport debounce cannot re-write lat/lon/zoom after Back". The existing
 * useDiscoverUrlState.test.ts L199 asserts only the negative (viewport stays null): it never shows, in the same it,
 * that the deselect itself was visibly applied, so a harness that never applied the deselect would pass it too.
 * This it carries the positive control in the SAME it: the viewport is non-null and areaKey is set BEFORE, the
 * deselect is visibly applied (areaKey null, viewport null) BEFORE the timers run, and only then is the
 * pending-debounce negative read after the timers fire.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDiscoverUrlState } from '../useDiscoverUrlState';

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

describe('#2859 B7 url-state-6 — a pending viewport debounce cannot re-write the viewport after deselectArea (control in the same it)', () => {
  it('deselect is visibly applied (areaKey + viewport cleared) BEFORE the timers fire, and after they fire the viewport is still null', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useDiscoverUrlState(), {
        wrapper: wrapper('/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal&lat=13.34090&lon=74.74210&zoom=14'),
      });

      // BEFORE: area selected, viewport present.
      expect(result.current[0].areaKey).toBe('IN|KA|Udupi|Manipal');
      expect(result.current[0].viewport).not.toBeNull();

      act(() => {
        // a pan enqueues the debounced (300 ms) viewport write, then Back is clicked immediately
        result.current[1].reportViewport({ lat: 13.5, lon: 74.9, zoom: 12 });
        result.current[1].deselectArea();
      });

      // POSITIVE CONTROL (same it, before any timer fires): the deselect itself was applied.
      expect(result.current[0].areaKey).toBeNull();
      expect(result.current[0].viewport).toBeNull();

      act(() => {
        vi.runAllTimers();
      });

      // NEGATIVE: the pending debounce did not re-write the viewport (neither the old nor the panned values).
      expect(result.current[0].viewport).toBeNull();
      expect(result.current[0].areaKey).toBeNull();

      // PENDING-TIMER CONTROL (same it, same hook, same URL): WITHOUT the deselect, the very same reportViewport
      // leaves a debounce timer pending and that write DOES land once the timers fire. So the null above is the
      // deselect defeating a real pending write, not an empty timer queue.
      const control = renderHook(() => useDiscoverUrlState(), {
        wrapper: wrapper('/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal&lat=13.34090&lon=74.74210&zoom=14'),
      });
      act(() => {
        control.result.current[1].reportViewport({ lat: 13.5, lon: 74.9, zoom: 12 });
      });
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      act(() => {
        vi.runAllTimers();
      });
      expect(control.result.current[0].viewport).toEqual(expect.objectContaining({ lat: 13.5, lon: 74.9, zoom: 12 }));
    } finally {
      vi.useRealTimers();
    }
  });
});
