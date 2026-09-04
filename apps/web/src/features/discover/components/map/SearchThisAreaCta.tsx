import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface SearchThisAreaCtaProps {
  /**
   * From useDiscoverViewportSearch().isEligible — MUST-HAVE #2 (PR review
   * 5085561270): true only at a navigation level with a committed
   * AREA_SET/POLYGON ResultScope. False at City root, Direction,
   * top-of-Schools/Agri. The CTA must never render when this is false,
   * regardless of isDirty.
   */
  isEligible: boolean;
  /** From useDiscoverViewportSearch().isDirty — AC1: only shown once the live viewport has drifted past tolerance. */
  isDirty: boolean;
  /** From useDiscoverViewportSearch().activate — AC2: commits exactly one VIEWPORT-scoped refetch. */
  onActivate: () => void;
  /**
   * Issue #2426 — `top` offset (px), computed by `useSearchThisAreaCtaOffset`
   * from the REAL rendered height of the breadcrumb overlay (and, when
   * present, the AREA_SET chip strip) above this CTA, so it never overlaps
   * either regardless of viewport width or how many lines the breadcrumb
   * wraps to. Optional and defaults to this component's original fixed
   * position so existing callers/tests keep compiling unchanged.
   */
  topOffsetPx?: number;
}

// Issue #2426 — matches this component's original fixed `top-4` position;
// used whenever a caller doesn't supply a measured `topOffsetPx`.
const DEFAULT_TOP_OFFSET_PX = 16;

/**
 * Issue #2015 — "Search this area" viewport activation CTA.
 *
 * Purely presentational: renders nothing while ineligible (MUST-HAVE #2) or
 * while the viewport hasn't drifted (AC1 — no auto-fetch from panning
 * alone), and defers all dirty-detection, eligibility, and activation logic
 * to useDiscoverViewportSearch. Top-anchored, floating over the map, so it
 * never collides with the bottom-anchored mobile List/Map toggle, zoom
 * controls, or attribution strip.
 *
 * Issue #2426 — `topOffsetPx` (rather than a fixed `top-4`) keeps this CTA
 * clear of the breadcrumb/AreaSetChips chrome stacked above it. See
 * `useSearchThisAreaCtaOffset`'s doc for why that's a real measurement
 * rather than another guessed breakpoint offset.
 */
export function SearchThisAreaCta({ isEligible, isDirty, onActivate, topOffsetPx }: SearchThisAreaCtaProps) {
  if (!isEligible || !isDirty) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-[1001] flex justify-center"
      style={{ top: topOffsetPx ?? DEFAULT_TOP_OFFSET_PX }}
    >
      <Button
        type="button"
        size="sm"
        onClick={onActivate}
        className="pointer-events-auto gap-1.5 rounded-full shadow-lg"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        Search this area
      </Button>
    </div>
  );
}
