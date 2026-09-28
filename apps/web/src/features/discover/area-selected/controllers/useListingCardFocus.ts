import { useCallback, useEffect, useRef } from 'react';

export interface UseListingCardFocusArgs {
  selectedListingId: string | null;
}

/**
 * Issue #2658 (C2) — the listing-card scroll-into-view behavior extracted
 * from AreaSelectedPanel (Issue #1547): scroll the selected card into view
 * when selection is driven from the map marker side.
 *
 * `hoveredListingId` is NOT part of this controller — in the source it is a
 * plain pass-through prop forwarded straight to `PropertyCard` with no local
 * state or effect of its own, so there is nothing here to extract for it.
 *
 * `cardRefs` is a plain ref (not state) keyed by listing id, matching the
 * source exactly; `registerCardRef` returns the ref-callback each card's
 * wrapper `<div ref={...}>` attaches, guarding the missing-ref case so a
 * marker click (or a card unmounting) never crashes.
 */
export function useListingCardFocus({ selectedListingId }: UseListingCardFocusArgs) {
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  useEffect(() => {
    if (!selectedListingId) return;
    const node = cardRefs.current.get(selectedListingId);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedListingId]);

  const registerCardRef = useCallback(
    (listingId: string) => (node: HTMLDivElement | null) => {
      if (node) cardRefs.current.set(listingId, node);
      else cardRefs.current.delete(listingId);
    },
    [],
  );

  return { registerCardRef };
}

export type ListingCardFocusController = ReturnType<typeof useListingCardFocus>;
