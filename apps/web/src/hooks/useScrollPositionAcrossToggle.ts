import { useEffect, useRef, type RefObject } from 'react';

/**
 * Issue #1953 (build step 4) — preserves a scrollable element's `scrollTop`
 * across a boolean view toggle (the mobile List<->Map round trip): captures
 * `scrollTop` the instant `isAway` flips to `true` (leaving the scrollable
 * view for the Map overlay), and restores it the instant it flips back to
 * `false` (returning to List).
 *
 * Generic over any element ref so it stays reusable regardless of which
 * container ends up owning the actual scrollable list box — the caller
 * attaches `containerRef` to that element.
 */
export function useScrollPositionAcrossToggle(
  containerRef: RefObject<HTMLElement | null>,
  isAway: boolean,
) {
  const savedScrollTop = useRef(0);
  const wasAwayRef = useRef(isAway);

  useEffect(() => {
    const wasAway = wasAwayRef.current;
    if (!wasAway && isAway) {
      // Leaving the scrollable view — snapshot its position.
      if (containerRef.current) {
        savedScrollTop.current = containerRef.current.scrollTop;
      }
    } else if (wasAway && !isAway) {
      // Returning — restore the exact position captured on the way out.
      const el = containerRef.current;
      if (el) {
        el.scrollTop = savedScrollTop.current;
      }
    }
    wasAwayRef.current = isAway;
  }, [isAway, containerRef]);
}
