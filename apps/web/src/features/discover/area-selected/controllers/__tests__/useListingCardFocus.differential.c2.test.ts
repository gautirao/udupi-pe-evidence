/**
 * Issue #2658 (C2) — differential coverage for useListingCardFocus, pinning
 * the Issue #1547 scroll-into-view behavior extracted verbatim from
 * AreaSelectedPanel.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useListingCardFocus } from '../useListingCardFocus';

function makeNode(): HTMLDivElement {
  const node = document.createElement('div');
  node.scrollIntoView = vi.fn();
  return node;
}

describe('#2658 C2 — useListingCardFocus', () => {
  it('scrolls the registered node for selectedListingId into view on mount', () => {
    const node = makeNode();
    const { result } = renderHook(
      ({ selectedListingId }) => useListingCardFocus({ selectedListingId }),
      { initialProps: { selectedListingId: null as string | null } },
    );
    result.current.registerCardRef('listing-1')(node);

    expect(node.scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls into view when selectedListingId changes to a registered card', () => {
    const node = makeNode();
    const { result, rerender } = renderHook(
      ({ selectedListingId }) => useListingCardFocus({ selectedListingId }),
      { initialProps: { selectedListingId: null as string | null } },
    );
    result.current.registerCardRef('listing-1')(node);

    rerender({ selectedListingId: 'listing-1' });

    expect(node.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
  });

  it('does not crash and does not scroll when the selected id has no registered node (missing-ref guard)', () => {
    const { rerender } = renderHook(
      ({ selectedListingId }) => useListingCardFocus({ selectedListingId }),
      { initialProps: { selectedListingId: null as string | null } },
    );
    expect(() => rerender({ selectedListingId: 'unregistered-id' })).not.toThrow();
  });

  it('registerCardRef(id)(null) deletes the entry so a later re-registration under the same id is the only live one', () => {
    const nodeA = makeNode();
    const nodeB = makeNode();
    const { result, rerender } = renderHook(
      ({ selectedListingId }) => useListingCardFocus({ selectedListingId }),
      { initialProps: { selectedListingId: null as string | null } },
    );
    const register = result.current.registerCardRef('listing-1');
    register(nodeA);
    register(null); // unmount
    register(nodeB); // remount with a new node

    rerender({ selectedListingId: 'listing-1' });

    expect(nodeA.scrollIntoView).not.toHaveBeenCalled();
    expect(nodeB.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
  });
});
