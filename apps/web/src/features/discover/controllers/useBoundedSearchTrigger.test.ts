import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBoundedSearchTrigger } from './useBoundedSearchTrigger';

describe('useBoundedSearchTrigger (#2142 Commit 3 — moved verbatim from MapDiscovery.tsx)', () => {
  it('starts false (does not auto-fire on mount)', () => {
    const { result } = renderHook(() => useBoundedSearchTrigger());
    expect(result.current.boundedSearchTriggered).toBe(false);
  });

  it('handleBoundedSearch sets the flag true (the bounded-search CTA path)', () => {
    const { result } = renderHook(() => useBoundedSearchTrigger());
    act(() => {
      result.current.handleBoundedSearch();
    });
    expect(result.current.boundedSearchTriggered).toBe(true);
  });

  it('setBoundedSearchTriggered is exposed for external reset call sites (handleAreaFirstBack, journey-hook resets)', () => {
    const { result } = renderHook(() => useBoundedSearchTrigger());
    act(() => {
      result.current.handleBoundedSearch();
    });
    expect(result.current.boundedSearchTriggered).toBe(true);
    act(() => {
      result.current.setBoundedSearchTriggered(false);
    });
    expect(result.current.boundedSearchTriggered).toBe(false);
  });

  it('handleBoundedSearch is referentially stable across re-renders (useCallback)', () => {
    const { result, rerender } = renderHook(() => useBoundedSearchTrigger());
    const first = result.current.handleBoundedSearch;
    rerender();
    expect(result.current.handleBoundedSearch).toBe(first);
  });
});
