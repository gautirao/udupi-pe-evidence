import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAreaSearchState } from './useAreaSearchState';

// Issue #1955 Areas PR A — admin City Launch Preview regression guard.
//
// This hook must stay a PURE local UI-state debounce (no fetch, no
// DiscoverDataSourceContext coupling) so it is already preview-safe by
// construction: direct area search filters client-side over data fetched by
// useDiscoverAreas (which IS preview-aware — see
// src/hooks/useDiscoverAreas.ts), never issues its own request. If this hook
// ever grows a fetch, that fetch would silently bypass
// DiscoverDataSourceProvider and leak live data into an admin preview
// (CityLaunchPreview.tsx) — this spy on '@/lib/api' catches that class of
// regression even though no current code path calls api.get from here.
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

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

  it('Issue #1955 — never calls api.get; stays a pure local debounce with no endpoint coupling (preview-safety guard)', async () => {
    const { api } = await import('@/lib/api');
    const { result } = renderHook(() => useAreaSearchState());

    act(() => {
      result.current.setAreaSearchQuery('manipal');
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.debouncedAreaSearchQuery).toBe('manipal');
    expect(api.get).not.toHaveBeenCalled();
  });
});
