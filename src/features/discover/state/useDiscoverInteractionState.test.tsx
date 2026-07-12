import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDiscoverInteractionState } from './useDiscoverInteractionState';

describe('useDiscoverInteractionState', () => {
  it('initializes with null/null/[] view state', () => {
    const { result } = renderHook(() => useDiscoverInteractionState());
    expect(result.current.view.hoveredListingId).toBeNull();
    expect(result.current.view.hoveredAreaKeyForMap).toBeNull();
    expect(result.current.view.highlightedAreaKeys).toEqual([]);
  });

  it('hoverListing sets and clears hoveredListingId only', () => {
    const { result } = renderHook(() => useDiscoverInteractionState());

    act(() => {
      result.current.commands.hoverListing('listing-1');
    });
    expect(result.current.view.hoveredListingId).toBe('listing-1');
    expect(result.current.view.hoveredAreaKeyForMap).toBeNull();
    expect(result.current.view.highlightedAreaKeys).toEqual([]);

    act(() => {
      result.current.commands.hoverListing(null);
    });
    expect(result.current.view.hoveredListingId).toBeNull();
  });

  it('hoverArea sets and clears hoveredAreaKeyForMap only', () => {
    const { result } = renderHook(() => useDiscoverInteractionState());

    act(() => {
      result.current.commands.hoverArea('area-key-1');
    });
    expect(result.current.view.hoveredAreaKeyForMap).toBe('area-key-1');
    expect(result.current.view.hoveredListingId).toBeNull();
    expect(result.current.view.highlightedAreaKeys).toEqual([]);

    act(() => {
      result.current.commands.hoverArea(null);
    });
    expect(result.current.view.hoveredAreaKeyForMap).toBeNull();
  });

  it('setHighlightedAreas sets highlightedAreaKeys only', () => {
    const { result } = renderHook(() => useDiscoverInteractionState());

    act(() => {
      result.current.commands.setHighlightedAreas(['area-a', 'area-b']);
    });
    expect(result.current.view.highlightedAreaKeys).toEqual(['area-a', 'area-b']);
    expect(result.current.view.hoveredListingId).toBeNull();
    expect(result.current.view.hoveredAreaKeyForMap).toBeNull();
  });

  it('clearHighlightedAreas empties the set', () => {
    const { result } = renderHook(() => useDiscoverInteractionState());

    act(() => {
      result.current.commands.setHighlightedAreas(['area-a', 'area-b']);
    });
    expect(result.current.view.highlightedAreaKeys).toEqual(['area-a', 'area-b']);

    act(() => {
      result.current.commands.clearHighlightedAreas();
    });
    expect(result.current.view.highlightedAreaKeys).toEqual([]);
  });

  it('keeps command callback identity stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useDiscoverInteractionState());

    const firstCommands = result.current.commands;

    rerender();

    expect(result.current.commands.hoverListing).toBe(firstCommands.hoverListing);
    expect(result.current.commands.hoverArea).toBe(firstCommands.hoverArea);
    expect(result.current.commands.setHighlightedAreas).toBe(firstCommands.setHighlightedAreas);
    expect(result.current.commands.clearHighlightedAreas).toBe(firstCommands.clearHighlightedAreas);
  });

  it('keeps command callback identity stable across state-changing re-renders', () => {
    const { result } = renderHook(() => useDiscoverInteractionState());

    const firstCommands = result.current.commands;

    act(() => {
      result.current.commands.hoverListing('listing-1');
    });
    act(() => {
      result.current.commands.setHighlightedAreas(['area-a']);
    });

    expect(result.current.commands.hoverListing).toBe(firstCommands.hoverListing);
    expect(result.current.commands.hoverArea).toBe(firstCommands.hoverArea);
    expect(result.current.commands.setHighlightedAreas).toBe(firstCommands.setHighlightedAreas);
    expect(result.current.commands.clearHighlightedAreas).toBe(firstCommands.clearHighlightedAreas);
  });

  // Guards against a real downstream regression: consumers (e.g. MapDiscovery's
  // handleAreaClusterClick) depend on the whole `commands` OBJECT, not just its
  // individual functions. If `commands` were a fresh object literal each render,
  // its identity would churn on every unrelated re-render, destabilising any
  // callback/effect keyed on `[commands]` (e.g. the Leaflet marker-rebuild
  // effect fed by onAreaClusterClick) even though the individual functions are
  // stable. This must FAIL if `commands` is returned as an inline literal.
  it('keeps the commands object itself referentially stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useDiscoverInteractionState());

    const firstCommands = result.current.commands;

    rerender();
    expect(result.current.commands).toBe(firstCommands);

    act(() => {
      result.current.commands.hoverListing('listing-1');
    });
    expect(result.current.commands).toBe(firstCommands);

    act(() => {
      result.current.commands.setHighlightedAreas(['area-a']);
    });
    expect(result.current.commands).toBe(firstCommands);
  });

  // AC3 / OQ1-OQ2 characterisation (Issue #1824 Slice S1):
  // The source MapDiscovery.tsx has NO effect or handler anywhere in the file that
  // resets highlightedAreaKeys on journey change, area-back, or start-over — it is
  // set exclusively by handleAreaClusterClick and otherwise persists until the next
  // cluster click or a full component remount. This test characterises that actual
  // (no-reset) behaviour so the extraction does not silently change it. Do NOT add
  // a reset here — that would be new behaviour, not a preserving extraction.
  it('characterises no-reset behaviour: highlightedAreaKeys persists once set until explicitly cleared', () => {
    const { result, rerender } = renderHook(() => useDiscoverInteractionState());

    act(() => {
      result.current.commands.setHighlightedAreas(['area-a', 'area-b']);
    });
    expect(result.current.view.highlightedAreaKeys).toEqual(['area-a', 'area-b']);

    // Simulate unrelated re-renders (e.g. a journey/URL change elsewhere in the
    // page) — the hook itself has no dependency on any external "journey" value,
    // so highlightedAreaKeys must NOT reset on its own.
    rerender();
    rerender();
    expect(result.current.view.highlightedAreaKeys).toEqual(['area-a', 'area-b']);

    // Only an explicit clearHighlightedAreas() (or a fresh cluster selection)
    // changes it.
    act(() => {
      result.current.commands.clearHighlightedAreas();
    });
    expect(result.current.view.highlightedAreaKeys).toEqual([]);
  });
});
