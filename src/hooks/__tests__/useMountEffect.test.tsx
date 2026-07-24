import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMountEffect } from '../useMountEffect';

/**
 * Issue #2005 (Slice 2 PR6), Category A — regression coverage for the shared
 * mount-only-effect helper. The core contract: `callback` fires exactly once,
 * on mount, and NEVER again — even across N re-renders where the values the
 * callback closes over change. This is the "naive add-the-deps fix is wrong"
 * invariant: useMountEffect must behave exactly like `useEffect(fn, [])`.
 */
describe('useMountEffect', () => {
  it('runs the callback exactly once on mount', () => {
    const callback = vi.fn();
    renderHook(() => useMountEffect(callback));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not re-fire across N re-renders, even when referenced inputs change', () => {
    const callback = vi.fn();
    const { rerender } = renderHook(({ input }) => useMountEffect(() => callback(input)), {
      initialProps: { input: 'a' },
    });

    rerender({ input: 'b' });
    rerender({ input: 'c' });
    rerender({ input: 'd' });
    rerender({ input: 'e' });

    expect(callback).toHaveBeenCalledTimes(1);
    // Captures the mount-time value only — later re-renders' closures never run.
    expect(callback).toHaveBeenCalledWith('a');
  });

  it('a plain re-render with no prop change does not re-fire the callback', () => {
    const callback = vi.fn();
    const { rerender } = renderHook(() => useMountEffect(callback));

    rerender();
    rerender();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('each hook instance across separate mounts runs its own callback exactly once', () => {
    const callbackA = vi.fn();
    const callbackB = vi.fn();

    renderHook(() => useMountEffect(callbackA));
    renderHook(() => useMountEffect(callbackB));

    expect(callbackA).toHaveBeenCalledTimes(1);
    expect(callbackB).toHaveBeenCalledTimes(1);
  });
});
