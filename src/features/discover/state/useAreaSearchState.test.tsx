import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAreaSearchState } from './useAreaSearchState';

describe('useAreaSearchState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with both areaSearchQuery and debouncedAreaSearchQuery empty', () => {
    const { result } = renderHook(() => useAreaSearchState());
    expect(result.current.areaSearchQuery).toBe('');
    expect(result.current.debouncedAreaSearchQuery).toBe('');
  });

  it('updates areaSearchQuery immediately but debounces debouncedAreaSearchQuery by 200ms', () => {
    const { result } = renderHook(() => useAreaSearchState());

    act(() => {
      result.current.setAreaSearchQuery('manipal');
    });

    expect(result.current.areaSearchQuery).toBe('manipal');
    expect(result.current.debouncedAreaSearchQuery).toBe('');

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.debouncedAreaSearchQuery).toBe('manipal');
  });

  it('coalesces rapid successive inputs — no intermediate debounced value lands', () => {
    const { result } = renderHook(() => useAreaSearchState());

    act(() => {
      result.current.setAreaSearchQuery('m');
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.debouncedAreaSearchQuery).toBe('');

    act(() => {
      result.current.setAreaSearchQuery('ma');
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // Still under 200ms of quiet since the last keystroke; intermediate 'm'
    // must never have landed.
    expect(result.current.debouncedAreaSearchQuery).toBe('');

    act(() => {
      result.current.setAreaSearchQuery('man');
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.debouncedAreaSearchQuery).toBe('man');
  });

  it('re-input before 200ms clears the pending timer so the intermediate value is never debounced', () => {
    const { result } = renderHook(() => useAreaSearchState());

    act(() => {
      result.current.setAreaSearchQuery('udupi');
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    act(() => {
      result.current.setAreaSearchQuery('udupi town');
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    // 300ms total elapsed, but only 150ms of quiet since the second input —
    // 'udupi' must never have been the debounced value.
    expect(result.current.debouncedAreaSearchQuery).toBe('');

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(result.current.debouncedAreaSearchQuery).toBe('udupi town');
  });

  it('debounces an empty string after clearing the query', () => {
    const { result } = renderHook(() => useAreaSearchState());

    act(() => {
      result.current.setAreaSearchQuery('kalyanpura');
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.debouncedAreaSearchQuery).toBe('kalyanpura');

    act(() => {
      result.current.setAreaSearchQuery('');
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.debouncedAreaSearchQuery).toBe('');
  });

  it('clears the pending timeout on unmount without throwing or updating after unmount', () => {
    const { result, unmount } = renderHook(() => useAreaSearchState());

    act(() => {
      result.current.setAreaSearchQuery('surathkal');
    });

    unmount();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(200);
      });
    }).not.toThrow();
  });
});
