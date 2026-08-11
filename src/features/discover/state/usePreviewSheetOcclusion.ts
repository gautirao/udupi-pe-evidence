import { useCallback, useState } from 'react';
import { MOBILE_LISTING_PREVIEW_OCCLUSION_PX } from '@/shared/map/zoomPolicy';

export interface UsePreviewSheetOcclusionResult {
  /**
   * The reservation (px) PropertyMap.tsx's usable-viewport wrapper must clip
   * by. 0 when the sheet isn't open; while open, the sheet's own real
   * measured height once available, else the safe fallback below.
   */
  previewOcclusionPx: number;
  /**
   * Wire straight through to MobileListingPreviewSheet's `onHeightChange`
   * prop. Takes the reporting listing's own id (see this hook's own doc
   * comment for why a bare height number isn't enough).
   */
  onHeightChange: (listingId: string, heightPx: number) => void;
}

/**
 * Issue #2129 (code-reviewer cycle 3) — MobileListingPreviewSheet is
 * intrinsic-height (no max-h/scroll — its own module doc), so its real
 * rendered height varies with content (trust badge row, price band vs
 * sign-in prompt, bedroom count, …) and measured ~194px in browser evidence,
 * not the fixed MOBILE_LISTING_PREVIEW_OCCLUSION_PX=150 guess a prior cycle
 * used. That fixed guess under-reserved by the difference, leaving a band of
 * the map's own "usable" viewport still physically covered by the sheet on
 * top of it.
 *
 * `measurement` is fed by the sheet's own measurement effects
 * (`onHeightChange` below) reporting its real border-box height. Extracted
 * out of MapDiscovery.tsx into its own hook (Issue #1824 Slice S2a
 * precedent, useReducedMotion.ts) specifically so the invariants below are
 * unit-testable in isolation — MapDiscovery.tsx's own render tree is not
 * practically unit-testable (react-leaflet mocked, huge component graph).
 *
 * Issue #2129 (code-reviewer cycle 3, HIGH finding, fixed) — a stale
 * measured height must never leak across a DIRECT marker-to-marker sibling
 * swap (`useMarkerSelection.ts`'s `selectMarkerSibling`, which calls
 * `setSelectedListing(sibling.id)` while the sheet stays continuously
 * mounted — `isPreviewSheetOpen` never flips false).
 *
 * Issue #2129 (code-reviewer cycle 5, BLOCKING, fixed) — cycle 3's first fix
 * used a separate "reset measuredHeight to null whenever
 * isPreviewSheetOpen/previewedListingId changes" effect. That had two
 * defects: (a) nothing GUARANTEES a fresh report ever arrives after the
 * reset — MobileListingPreviewSheet's ResizeObserver only fires on an
 * actual box-size DELTA, and the sheet's root DOM node is reused across the
 * swap, so if listing B renders at the EXACT SAME height as listing A (very
 * plausible: same property type, both authed-with-price, etc.), no resize
 * event ever fires and the reservation stays pinned on the safe-fallback
 * constant indefinitely — silently recreating the original occlusion gap;
 * (b) even if the sheet is separately fixed to guarantee a synchronous
 * report on every identity change (see MobileListingPreviewSheet.tsx), a
 * plain reset-effect run as an ordinary (passive) `useEffect` can fire
 * AFTER that report already landed (React runs child `useLayoutEffect`s
 * before any component's passive `useEffect`s in a commit) and unconditionally
 * null out the freshly-measured value — a race that would erase a CORRECT
 * measurement, not just a stale one.
 *
 * The fix: there is no reset effect at all. `measurement` is stored keyed by
 * WHICH listing it was measured for (`{ listingId, height }`), and
 * `measuredHeight` below is a plain synchronous DERIVATION — it reads the
 * stored measurement only when its `listingId` matches the currently
 * previewed listing, otherwise it is `null` (never a stale cross-listing
 * value) by construction, not by timing. There is nothing to race: a report
 * for the CURRENT listing is simply accepted the instant it arrives; a
 * report that arrives late for a listing that is no longer current is
 * simply never read. MobileListingPreviewSheet.tsx pairs this with a
 * synchronous (`useLayoutEffect`, not the delta-only `ResizeObserver`
 * alone) report on every distinct `preview.id`, guaranteeing at least one
 * fresh, correctly-tagged report per listing regardless of whether its
 * height happens to numerically match the previous listing's.
 */
export function usePreviewSheetOcclusion(
  isPreviewSheetOpen: boolean,
  previewedListingId: string | null,
): UsePreviewSheetOcclusionResult {
  const [measurement, setMeasurement] = useState<{ listingId: string; height: number } | null>(null);

  const onHeightChange = useCallback((listingId: string, heightPx: number) => {
    // Math.ceil — never under-reserve on a sub-pixel measurement; a
    // fractional px of the map peeking out from under the sheet is the same
    // defect this fix exists to close.
    setMeasurement({ listingId, height: Math.ceil(heightPx) });
  }, []);

  // Structural rejection of stale/foreign measurements — see the doc
  // comment above. No effect, no reset, nothing to race.
  const measuredHeight =
    measurement != null && measurement.listingId === previewedListingId ? measurement.height : null;

  const previewOcclusionPx = isPreviewSheetOpen
    ? (measuredHeight ?? MOBILE_LISTING_PREVIEW_OCCLUSION_PX)
    : 0;

  return { previewOcclusionPx, onHeightChange };
}
