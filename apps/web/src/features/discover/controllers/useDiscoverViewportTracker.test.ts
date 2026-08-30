import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDiscoverViewportTracker } from './useDiscoverViewportTracker';

describe('useDiscoverViewportTracker (#2142 Commit 3 — moved verbatim from MapDiscovery.tsx)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with mapBbox null', () => {
    const { result } = renderHook(() => useDiscoverViewportTracker({ mobileView: 'LIST', city: 'udupi' }));
    expect(result.current.mapBbox).toBeNull();
  });

  it('handleBoundsChange debounces 300ms before setting mapBbox', () => {
    const { result } = renderHook(() => useDiscoverViewportTracker({ mobileView: 'LIST', city: 'udupi' }));
    act(() => {
      result.current.handleBoundsChange([12, 77, 13, 78]);
    });
    expect(result.current.mapBbox).toBeNull();
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current.mapBbox).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.mapBbox).toEqual([12, 77, 13, 78]);
  });

  it('a second handleBoundsChange call within the debounce window resets the timer (only the latest bbox wins)', () => {
    const { result } = renderHook(() => useDiscoverViewportTracker({ mobileView: 'LIST', city: 'udupi' }));
    act(() => {
      result.current.handleBoundsChange([1, 1, 1, 1]);
    });
    act(() => {
      vi.advanceTimersByTime(200);
      result.current.handleBoundsChange([2, 2, 2, 2]);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Original 300ms from the first call has elapsed, but it was cancelled.
    expect(result.current.mapBbox).toBeNull();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.mapBbox).toEqual([2, 2, 2, 2]);
  });

  it('resets mapBbox to null when city changes', () => {
    const { result, rerender } = renderHook(
      ({ city }: { city: string }) => useDiscoverViewportTracker({ mobileView: 'LIST', city }),
      { initialProps: { city: 'udupi' } },
    );
    act(() => {
      result.current.handleBoundsChange([1, 1, 1, 1]);
      vi.advanceTimersByTime(300);
    });
    expect(result.current.mapBbox).toEqual([1, 1, 1, 1]);
    rerender({ city: 'bangalore' });
    expect(result.current.mapBbox).toBeNull();
  });

  it('issue #1953 RH4: clears the pending debounce timer on the MAP->LIST transition so a stale bbox never lands after leaving MAP', () => {
    const { result, rerender } = renderHook(
      ({ mobileView }: { mobileView: 'LIST' | 'MAP' }) =>
        useDiscoverViewportTracker({ mobileView, city: 'udupi' }),
      { initialProps: { mobileView: 'MAP' as const } },
    );
    act(() => {
      result.current.handleBoundsChange([1, 1, 1, 1]);
    });
    rerender({ mobileView: 'LIST' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    // The pending setMapBbox from the MAP-era pan/zoom never lands.
    expect(result.current.mapBbox).toBeNull();
  });
});
