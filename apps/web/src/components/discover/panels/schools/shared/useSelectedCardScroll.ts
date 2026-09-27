/**
 * useSelectedCardScroll — dedups the 3 near-identical "scroll selected card into
 * view" effect copies found in SchoolsInAreaPanel (wrapper)/SchoolSelectedPanel/
 * AreaSchoolCombinedPanel (Issue #2661 commit 4, no logic changes vs. the
 * original inline copies).
 *
 * Issue #1547 / #1974 — card↔marker shared selection: when `selectedListingId`
 * matches a rendered card, that card is scrolled into view. Guards the
 * missing-ref case (selected listing filtered out of the current list).
 *
 * IMPORTANT (Rules of Hooks): this hook must be called UNCONDITIONALLY, above
 * any early return, in every panel that uses it — see AreaSchoolCombinedPanel's
 * skeleton early-return branch for the case this protects.
 */
import { useEffect, useRef } from 'react';

export function useSelectedCardScroll(selectedListingId: string | null | undefined) {
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  useEffect(() => {
    if (!selectedListingId) return;
    const node = cardRefs.current.get(selectedListingId);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedListingId]);

  return cardRefs;
}
