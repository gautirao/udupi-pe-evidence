import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useListingsSelection } from '../useListingsSelection';
import type { AdminListingRow } from '@/hooks/useAdminData';

function makeListing(id: string): AdminListingRow {
  return { id } as unknown as AdminListingRow;
}

describe('useListingsSelection', () => {
  it('starts with nothing selected', () => {
    const pageItems = [makeListing('a'), makeListing('b')];
    const { result } = renderHook(() => useListingsSelection(pageItems, 'all'));

    expect(result.current.selectedListings.size).toBe(0);
    expect(result.current.allOnPageSelected).toBe(false);
  });

  it('toggles an individual row in and out of selection', () => {
    const pageItems = [makeListing('a'), makeListing('b')];
    const { result } = renderHook(() => useListingsSelection(pageItems, 'all'));

    act(() => result.current.toggleSelect(pageItems[0]));
    expect(Array.from(result.current.selectedListings.keys())).toEqual(['a']);

    act(() => result.current.toggleSelect(pageItems[0]));
    expect(result.current.selectedListings.size).toBe(0);
  });

  it('selects and clears the whole page via toggleSelectAll', () => {
    const pageItems = [makeListing('a'), makeListing('b'), makeListing('c')];
    const { result } = renderHook(() => useListingsSelection(pageItems, 'all'));

    act(() => result.current.toggleSelectAll());
    expect(result.current.allOnPageSelected).toBe(true);
    expect(Array.from(result.current.selectedListings.keys()).sort()).toEqual(['a', 'b', 'c']);

    act(() => result.current.toggleSelectAll());
    expect(result.current.allOnPageSelected).toBe(false);
    expect(result.current.selectedListings.size).toBe(0);
  });

  it('clears selection when the active tab changes', () => {
    const pageItems = [makeListing('a'), makeListing('b')];
    const { result, rerender } = renderHook(
      ({ tab }: { tab: string }) => useListingsSelection(pageItems, tab),
      { initialProps: { tab: 'all' } },
    );

    act(() => result.current.toggleSelect(pageItems[0]));
    expect(result.current.selectedListings.size).toBe(1);

    rerender({ tab: 'published' });
    expect(result.current.selectedListings.size).toBe(0);
  });

  it('does not clear selection on a rerender that keeps the same tab', () => {
    const pageItems = [makeListing('a'), makeListing('b')];
    const { result, rerender } = renderHook(
      ({ tab }: { tab: string }) => useListingsSelection(pageItems, tab),
      { initialProps: { tab: 'all' } },
    );

    act(() => result.current.toggleSelect(pageItems[0]));
    rerender({ tab: 'all' });
    expect(result.current.selectedListings.size).toBe(1);
  });

  it('allows the bulk-action bar to clear selection directly via setSelectedListings', () => {
    const pageItems = [makeListing('a')];
    const { result } = renderHook(() => useListingsSelection(pageItems, 'all'));

    act(() => result.current.toggleSelect(pageItems[0]));
    expect(result.current.selectedListings.size).toBe(1);

    act(() => result.current.setSelectedListings(new Map()));
    expect(result.current.selectedListings.size).toBe(0);
  });
});
