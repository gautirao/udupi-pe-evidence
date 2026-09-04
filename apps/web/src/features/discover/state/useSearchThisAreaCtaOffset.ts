import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { DISCOVER_MAP_CONTEXT_OVERLAY_TOP_OFFSET_PX } from '@/components/discover/DiscoverMapContextOverlay';

export interface UseSearchThisAreaCtaOffsetResult {
  /**
   * Issue #2419 (PR-2) — the `top` for `ActiveScopeChip`: the rung directly
   * BELOW the breadcrumb and the AREA_SET chip strip, and ABOVE the CTA.
   *
   * The chip needs its own rung rather than sharing the CTA's. A committed
   * POLYGON chip and a dirty-viewport CTA can be on screen together, and
   * `AreaSetChips` collapses to zero height exactly when the chip is visible
   * (POLYGON or VIEWPORT committed means the AREA_SET draft is empty), so
   * nothing in this stack was reserving space for it. An earlier revision of
   * PR-2 handed the chip `ctaTopOffsetPx` verbatim, which put both on the
   * SAME row — the collision this hook exists to prevent.
   */
  scopeChipTopOffsetPx: number;
  /**
   * Issue #2419 (PR-2) — the `top` for the draw-mode / blocked-draft overlay:
   * the rung below the CTA.
   *
   * Also its own rung, for a reason that is easy to miss: redrawing a
   * COMMITTED polygon shows the overlay while the chip still reads COMMITTED,
   * because the chip renders from the URL scope and that does not change
   * until the new shape is accepted. Chip, CTA and overlay can all be up at
   * once.
   */
  drawOverlayTopOffsetPx: number;
  /**
   * CALLBACK ref for the `ActiveScopeChip` element — attach it directly, do
   * not read `.current`.
   *
   * A callback rather than a RefObject because the chip mounts and unmounts
   * with the committed scope, and a once-on-mount effect cannot measure an
   * element that appears later. See the implementation for the failure this
   * prevents (PR review of head `1ac34643`).
   */
  scopeChipRef: (el: HTMLDivElement | null) => void;
  /**
   * The `top` (px, relative to the map container) `SearchThisAreaCta` must
   * render at so it never overlaps `DiscoverMapContextOverlay` (the
   * breadcrumb / mobile-list-button row), `AreaSetChips` (the "Selected
   * areas" chip strip), or `ActiveScopeChip` above it. Always a safe fallback
   * before the first
   * real measurement lands.
   */
  ctaTopOffsetPx: number;
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
  // Issue #2419 (PR-2) — measured HEIGHT, not bottom: the scope chip is
  // positioned FROM this hook's own output, so measuring its bottom would
  // feed the result back into its own input and oscillate. Its height is
  // independent of where it is placed.
  const [scopeChipHeightPx, setScopeChipHeightPx] = useState(0);
  const chipsRowRef = useRef<HTMLDivElement | null>(null);
  const scopeChipObserverRef = useRef<ResizeObserver | null>(null);

  const onBreadcrumbHeightChange = useCallback((heightPx: number) => {
    // Math.ceil — never under-reserve on a sub-pixel measurement.
    setBreadcrumbHeightPx(Math.ceil(heightPx));
  }, []);

  /**
   * Issue #2419 (PR-2) — a CALLBACK ref, not a RefObject, because the chip
   * mounts and unmounts with the committed scope.
   *
   * PR review of head `1ac34643` found the bug this shape exists to prevent.
   * The previous version read `scopeChipRef.current` inside a layout effect
   * keyed on the map container, which runs ONCE. On the ordinary AREA_SET ->
   * POLYGON transition the chip does not exist yet at that moment, so it was
   * never measured and never observed: the height stayed 0 and the CTA landed
   * back on the chip's row — precisely the collision the stack was added for.
   *
   * A container resize is NOT a usable mount signal either: the chip is
   * absolutely positioned, so mounting it does not change the container's box
   * and the ResizeObserver never fires.
   *
   * React calls this with the element on mount and with `null` on unmount, so
   * measurement and observation are driven by the element's own lifecycle and
   * cannot depend on what happened to exist at setup time.
   */
  const scopeChipRef = useCallback((el: HTMLDivElement | null) => {
    scopeChipObserverRef.current?.disconnect();
    scopeChipObserverRef.current = null;

    if (!el) {
      // Unmounted (no committed scope, or AREA_SET) — reserve nothing, so the
      // CTA moves straight back up to the chip's rung.
      setScopeChipHeightPx(0);
      return;
    }

    setScopeChipHeightPx(Math.ceil(el.getBoundingClientRect().height));

    if (typeof ResizeObserver === 'undefined') return;
    // Keeps tracking the chip's OWN size after mount — its "Return to <long
    // area names>" label wraps to a second line on the narrow viewport.
    const ro = new ResizeObserver(() => {
      setScopeChipHeightPx(Math.ceil(el.getBoundingClientRect().height));
    });
    ro.observe(el);
    scopeChipObserverRef.current = ro;
  }, []);

  // The callback ref above owns the chip observer's lifetime, but an unmount
  // of the whole map half never calls it with `null` — React only does that
  // when the element itself goes away while the component lives on.
  useEffect(() => () => scopeChipObserverRef.current?.disconnect(), []);

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
    // The scope chip is deliberately NOT measured here — see `scopeChipRef`
    // above for why a once-on-mount effect cannot see an element that mounts
    // later. Both refs this effect does use are stable for the component's
    // lifetime, so the observer is set up once rather than recreated every
    // render.
  }, [mapContainerRef]);

  const breadcrumbBottomPx =
    breadcrumbHeightPx > 0 ? DISCOVER_MAP_CONTEXT_OVERLAY_TOP_OFFSET_PX + breadcrumbHeightPx : 0;

  // Issue #2419 (PR-2) — a real stacking CHAIN, one rung per element, rather
  // than one shared offset handed to everything. Each rung starts below the
  // previous element's actual bottom, so any of them can be absent (or grow a
  // second line) without the others colliding.
  //
  //   breadcrumb / AREA_SET chips
  //     └─ scope chip
  //          └─ "Search this area" CTA
  //               └─ draw-mode / blocked-draft overlay
  const scopeChipTopOffsetPx =
    Math.max(breadcrumbBottomPx, chipsRowBottomPx, FALLBACK_TOP_OFFSET_PX) + CLEARANCE_GAP_PX;

  const ctaTopOffsetPx =
    scopeChipHeightPx > 0
      ? scopeChipTopOffsetPx + scopeChipHeightPx + CLEARANCE_GAP_PX
      : scopeChipTopOffsetPx;

  // The overlay is the widest element here and the one that most obviously
  // reads as broken when it lands on something, so it takes the bottom rung
  // unconditionally rather than trying to detect whether the CTA is up.
  const drawOverlayTopOffsetPx = ctaTopOffsetPx + CTA_ROW_HEIGHT_PX + CLEARANCE_GAP_PX;

  return {
    ctaTopOffsetPx,
    scopeChipTopOffsetPx,
    drawOverlayTopOffsetPx,
    onBreadcrumbHeightChange,
    chipsRowRef,
    scopeChipRef,
  };
}
