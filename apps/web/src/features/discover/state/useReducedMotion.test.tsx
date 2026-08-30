import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReducedMotion } from './useReducedMotion';

type Listener = (e: MediaQueryListEvent) => void;

function mockMatchMedia(initialMatches: boolean) {
  let changeListener: Listener | null = null;
  const addEventListener = vi.fn((event: string, listener: Listener) => {
    if (event === 'change') changeListener = listener;
  });
  const removeEventListener = vi.fn((event: string, listener: Listener) => {
    if (event === 'change' && changeListener === listener) changeListener = null;
  });

  const mql = {
    matches: initialMatches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener,
    removeEventListener,
  };

  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;

  return {
    mql,
    addEventListener,
    removeEventListener,
    fireChange: (matches: boolean) => {
      act(() => {
        changeListener?.({ matches } as MediaQueryListEvent);
      });
    },
  };
}

describe('useReducedMotion', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it('returns true when matchMedia reports matches=true', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('returns false when matchMedia reports matches=false', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('updates the returned value when the change listener fires', () => {
    const { fireChange } = mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    fireChange(true);
    expect(result.current).toBe(true);

    fireChange(false);
    expect(result.current).toBe(false);
  });

  it('removes the change listener on unmount', () => {
    const { addEventListener, removeEventListener } = mockMatchMedia(false);
    const { unmount } = renderHook(() => useReducedMotion());

    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    const registeredListener = addEventListener.mock.calls[0][1];

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith('change', registeredListener);
  });

  it('does not throw when window.matchMedia is undefined (SSR guard)', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(() => renderHook(() => useReducedMotion())).not.toThrow();
  });
});
