import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDiscoverSearchState } from './useDiscoverSearchState';

describe('useDiscoverSearchState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initialises searchQuery and debouncedSearch from urlQ', () => {
    const setUrlSearch = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverSearchState({ urlQ: 'manipal', setUrlSearch }),
    );

    expect(result.current.searchQuery).toBe('manipal');
    expect(result.current.debouncedSearch).toBe('manipal');
  });

  it('handleSearchChange updates searchQuery immediately, dual-writes to the URL, and debounces debouncedSearch by 250ms', () => {
    const setUrlSearch = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverSearchState({ urlQ: '', setUrlSearch }),
    );

    act(() => {
      result.current.handleSearchChange('foo');
    });

    expect(result.current.searchQuery).toBe('foo');
    expect(setUrlSearch).toHaveBeenCalledWith('foo');
    expect(setUrlSearch).toHaveBeenCalledTimes(1);
    // Local debounce has not fired yet.
    expect(result.current.debouncedSearch).toBe('');

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current.debouncedSearch).toBe('foo');
  });

  it('coalesces rapid successive inputs — only the last value lands after 250ms of quiet', () => {
    const setUrlSearch = vi.fn();
    const { result } = renderHook(() =>
      useDiscoverSearchState({ urlQ: '', setUrlSearch }),
    );

    act(() => {
      result.current.handleSearchChange('m');
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.debouncedSearch).toBe('');

    act(() => {
      result.current.handleSearchChange('ma');
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // Still under 250ms of quiet since the last keystroke.
    expect(result.current.debouncedSearch).toBe('');

    act(() => {
      result.current.handleSearchChange('map');
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current.debouncedSearch).toBe('map');
    expect(setUrlSearch).toHaveBeenCalledTimes(3);
    expect(setUrlSearch).toHaveBeenLastCalledWith('map');
  });

  it('reverse-syncs searchQuery (and then debouncedSearch) when urlQ changes externally', () => {
    const setUrlSearch = vi.fn();
    const { result, rerender } = renderHook(
      ({ urlQ }) => useDiscoverSearchState({ urlQ, setUrlSearch }),
      { initialProps: { urlQ: 'manipal' } },
    );

    expect(result.current.searchQuery).toBe('manipal');

    rerender({ urlQ: 'bar' });

    expect(result.current.searchQuery).toBe('bar');
    // Local debounce not yet elapsed.
    expect(result.current.debouncedSearch).toBe('manipal');

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current.debouncedSearch).toBe('bar');
  });

  it('reverse-syncs to an empty urlQ (URL-clear) and debounces to empty', () => {
    const setUrlSearch = vi.fn();
    const { result, rerender } = renderHook(
      ({ urlQ }) => useDiscoverSearchState({ urlQ, setUrlSearch }),
      { initialProps: { urlQ: 'manipal' } },
    );

    rerender({ urlQ: '' });

    expect(result.current.searchQuery).toBe('');

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current.debouncedSearch).toBe('');
  });

  it('keeps handleSearchChange identity stable across renders when setUrlSearch is stable', () => {
    const setUrlSearch = vi.fn();
    const { result, rerender } = renderHook(
      ({ urlQ }) => useDiscoverSearchState({ urlQ, setUrlSearch }),
      { initialProps: { urlQ: 'manipal' } },
    );

    const firstHandler = result.current.handleSearchChange;

    rerender({ urlQ: 'manipal' });

    expect(result.current.handleSearchChange).toBe(firstHandler);
  });

  it('clears the pending debounce timeout on unmount without throwing', () => {
    const setUrlSearch = vi.fn();
    const { result, unmount } = renderHook(() =>
      useDiscoverSearchState({ urlQ: '', setUrlSearch }),
    );

    act(() => {
      result.current.handleSearchChange('surathkal');
    });

    unmount();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(250);
      });
    }).not.toThrow();
  });
});
