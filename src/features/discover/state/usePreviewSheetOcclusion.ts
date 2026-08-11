import { useCallback, useEffect, useState } from 'react';
import { MOBILE_LISTING_PREVIEW_OCCLUSION_PX } from '@/shared/map/zoomPolicy';

export interface UsePreviewSheetOcclusionResult {
  /**
   * The reservation (px) PropertyMap.tsx's usable-viewport wrapper must clip
   * by. 0 when the sheet isn't open; while open, the sheet's own real
   * measured height once available, else the safe fallback below.
   */
  previewOcclusionPx: number;
  /** Wire straight through to MobileListingPreviewSheet's `onHeightChange` prop. */
  onHeightChange: (heightPx: number) => void;
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
 * `measuredHeight` is fed by the sheet's own ResizeObserver (`onHeightChange`
 * below) reporting its real border-box height. Extracted out of
 * MapDiscovery.tsx into its own hook (Issue #1824 Slice S2a precedent,
 * useReducedMotion.ts) specifically so this reset-on-identity-change
 * invariant is unit-testable in isolation — MapDiscovery.tsx's own render
 * tree is not practically unit-testable (react-leaflet mocked, huge
 * component graph).
 *
 * Issue #2129 (code-reviewer cycle 3, HIGH finding) — a stale measured
 * height must never leak across a DIRECT marker-to-marker sibling swap
 * (`useMarkerSelection.ts`'s `selectMarkerSibling`, which calls
 * `setSelectedListing(sibling.id)` while the sheet stays continuously
 * mounted — `isPreviewSheetOpen` never flips false, so a reset keyed ONLY on
 * that flag misses this exact case, the one #2129 is about). The reset
 * effect below is therefore keyed on BOTH `isPreviewSheetOpen` AND
 * `previewedListingId` — a listing-identity change resets the measurement
 * even while the sheet stays open the whole time, falling back to the safe
 * MOBILE_LISTING_PREVIEW_OCCLUSION_PX constant for the one frame before the
 * new listing's own ResizeObserver callback lands (never under-reserves,
 * never serves the PREVIOUS listing's stale height for the new one's
 * content).
 */
export function usePreviewSheetOcclusion(
  isPreviewSheetOpen: boolean,
  previewedListingId: string | null,
): UsePreviewSheetOcclusionResult {
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  useEffect(() => {
    setMeasuredHeight(null);
  }, [isPreviewSheetOpen, previewedListingId]);

  const onHeightChange = useCallback((heightPx: number) => {
    // Math.ceil — never under-reserve on a sub-pixel measurement; a
    // fractional px of the map peeking out from under the sheet is the same
    // defect this fix exists to close.
    setMeasuredHeight(Math.ceil(heightPx));
  }, []);

  const previewOcclusionPx = isPreviewSheetOpen
    ? (measuredHeight ?? MOBILE_LISTING_PREVIEW_OCCLUSION_PX)
    : 0;

  return { previewOcclusionPx, onHeightChange };
}
