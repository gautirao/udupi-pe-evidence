import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { DISCOVER_MAP_CONTEXT_OVERLAY_TOP_OFFSET_PX } from '@/components/discover/DiscoverMapContextOverlay';

export interface UseSearchThisAreaCtaOffsetResult {
  /**
   * The `top` (px, relative to the map container) `SearchThisAreaCta` must
   * render at so it never overlaps `DiscoverMapContextOverlay` (the
   * breadcrumb / mobile-list-button row) or `AreaSetChips` (the "Selected
   * areas" chip strip). Always a safe fallback before the first real
   * measurement lands.
   *
   * Issue #2478 — this used to be a rung BELOW a floating scope chip
   * (`ActiveScopeChip`); that chip has been removed (its summary now lives
   * inside `AreaSelectedPanel` instead), so the CTA now occupies the rung the
   * chip used to sit on, directly below the breadcrumb / chip strip.
   * `ctaTopOffsetPx` therefore always resolves to
   * `max(breadcrumbBottomPx, chipsRowBottomPx, FALLBACK_TOP_OFFSET_PX) + CLEARANCE_GAP_PX`
   * — see the implementation below.
   */
  ctaTopOffsetPx: number;
  /**
   * Issue #2419 (PR-2) — the `top` for the draw-mode / blocked-draft overlay:
   * the rung below the CTA.
   */
  drawOverlayTopOffsetPx: number;
  /** Wire straight through to `DiscoverMapContextOverlay`'s `onHeightChange` prop. */
  onBreadcrumbHeightChange: (heightPx: number) => void;
  /**
   * Ref for the caller's existing `AreaSetChips` wrapper div (the
   * `top-14`/`top-24` positioned row in `DiscoverMapCanvas.tsx`) — measured
   * directly rather than via a reported height, since that wrapper already
   * owns its own responsive top offset and collapses to zero height when
   * `AreaSetChips` itself renders null (empty draft), so its real
   * `getBoundingClientRect()` is already the authoritative bottom edge with
   * no extra math needed.
   */
  chipsRowRef: RefObject<HTMLDivElement | null>;
}

// Safe floor before the first real measurement lands (matches the CTA's
// previous fixed `top-4` position) and the breathing room kept between the
// reserved chrome region and the CTA below it.
const FALLBACK_TOP_OFFSET_PX = 16;
const CLEARANCE_GAP_PX = 12;
/**
 * Issue #2419 (PR-2) — the CTA's own height, reserved so the draw overlay
 * clears it. A constant rather than a measurement because `SearchThisAreaCta`
 * is a single fixed-height `size="sm"` pill (h-8 = 32px) that never wraps,
 * and measuring it would mean the CTA feeding its own consumer's offset. Over-
 * reserving by a few pixels when the CTA is absent is harmless; the overlay
 * simply sits slightly lower.
 */
const CTA_ROW_HEIGHT_PX = 32;

/**
 * Issue #2426 — derives a safe `top` offset for `SearchThisAreaCta` from the
 * REAL rendered geometry of the chrome stacked above it (breadcrumb overlay,
 * then the AREA_SET chip strip when present), instead of a fixed offset
 * tuned for one viewport. Mirrors this codebase's established
 * "reserve-a-region-from-a-real-measurement" precedent
 * (`usePreviewSheetOcclusion.ts`, Issue #2129) rather than guessing a third
 * magic pixel constant alongside the ones `AreaSetChips.tsx`'s own
 * `top-14`/`top-24` breakpoints already needed one tuning cycle to get
 * right.
 *
 * `mapContainerRef` is the SAME ref `DiscoverMapCanvas.tsx` already attaches
 * to its map-half wrapper div (the `relative` positioning ancestor every
 * overlay here — including this hook's own `chipsRowRef` target — is
 * positioned against), used only to translate the chip row's viewport-
 * relative bounding rect into a container-relative offset.
 */
export function useSearchThisAreaCtaOffset(
  mapContainerRef: RefObject<HTMLDivElement | null>,
): UseSearchThisAreaCtaOffsetResult {
  const [breadcrumbHeightPx, setBreadcrumbHeightPx] = useState(0);
  const [chipsRowBottomPx, setChipsRowBottomPx] = useState(0);
  const chipsRowRef = useRef<HTMLDivElement | null>(null);

  const onBreadcrumbHeightChange = useCallback((heightPx: number) => {
    // Math.ceil — never under-reserve on a sub-pixel measurement.
    setBreadcrumbHeightPx(Math.ceil(heightPx));
  }, []);

  useLayoutEffect(() => {
    const containerEl = mapContainerRef.current;
    const chipsEl = chipsRowRef.current;
    if (!containerEl || !chipsEl) return;

    const recompute = () => {
      const containerTop = containerEl.getBoundingClientRect().top;
      const chipsRect = chipsEl.getBoundingClientRect();
      // Zero height (AreaSetChips rendered null — empty draft) means this
      // row contributes no clearance requirement of its own.
      setChipsRowBottomPx(chipsRect.height > 0 ? Math.ceil(chipsRect.bottom - containerTop) : 0);
    };

    recompute();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(recompute);
    ro.observe(chipsEl);
    ro.observe(containerEl);
    return () => ro.disconnect();
    // Both refs this effect uses are stable for the component's lifetime, so
    // the observer is set up once rather than recreated every render.
  }, [mapContainerRef]);

  const breadcrumbBottomPx =
    breadcrumbHeightPx > 0 ? DISCOVER_MAP_CONTEXT_OVERLAY_TOP_OFFSET_PX + breadcrumbHeightPx : 0;

  // Issue #2419 (PR-2) — a real stacking CHAIN, one rung per element, rather
  // than one shared offset handed to everything. Each rung starts below the
  // previous element's actual bottom, so any of them can be absent (or grow a
  // second line) without the others colliding.
  //
  // Issue #2478 removed the floating scope chip that used to occupy the rung
  // between the breadcrumb/chips row and the CTA, so the CTA now sits
  // directly on that rung:
  //
  //   breadcrumb / AREA_SET chips
  //     └─ "Search this area" CTA
  //          └─ draw-mode / blocked-draft overlay
  const ctaTopOffsetPx =
    Math.max(breadcrumbBottomPx, chipsRowBottomPx, FALLBACK_TOP_OFFSET_PX) + CLEARANCE_GAP_PX;

  // The overlay is the widest element here and the one that most obviously
  // reads as broken when it lands on something, so it takes the bottom rung
  // unconditionally rather than trying to detect whether the CTA is up.
  const drawOverlayTopOffsetPx = ctaTopOffsetPx + CTA_ROW_HEIGHT_PX + CLEARANCE_GAP_PX;

  return {
    ctaTopOffsetPx,
    drawOverlayTopOffsetPx,
    onBreadcrumbHeightChange,
    chipsRowRef,
  };
}
