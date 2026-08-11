/**
 * Issue #2129 — usePreviewSheetOcclusion.
 *
 * Extracted out of MapDiscovery.tsx specifically so the invariants below are
 * unit-testable in isolation (MapDiscovery's own render tree is not
 * practically unit-testable — react-leaflet mocked, huge component graph).
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePreviewSheetOcclusion } from './usePreviewSheetOcclusion';
import { MOBILE_LISTING_PREVIEW_OCCLUSION_PX } from '@/shared/map/zoomPolicy';

describe('usePreviewSheetOcclusion', () => {
  it('is 0 while the sheet is not open, regardless of any prior measurement', () => {
    const { result } = renderHook(
      ({ isOpen, id }) => usePreviewSheetOcclusion(isOpen, id),
      { initialProps: { isOpen: false, id: null as string | null } },
    );
    expect(result.current.previewOcclusionPx).toBe(0);
  });

  it('falls back to MOBILE_LISTING_PREVIEW_OCCLUSION_PX for the frame(s) before the first measurement lands', () => {
    const { result } = renderHook(
      ({ isOpen, id }) => usePreviewSheetOcclusion(isOpen, id),
      { initialProps: { isOpen: true, id: 'listing-a' as string | null } },
    );
    expect(result.current.previewOcclusionPx).toBe(MOBILE_LISTING_PREVIEW_OCCLUSION_PX);
  });

  it('adopts the real measured height once onHeightChange fires for the CURRENT listing, rounding up (never under-reserving)', () => {
    const { result } = renderHook(
      ({ isOpen, id }) => usePreviewSheetOcclusion(isOpen, id),
      { initialProps: { isOpen: true, id: 'listing-a' as string | null } },
    );

    act(() => {
      result.current.onHeightChange('listing-a', 193.2);
    });

    expect(result.current.previewOcclusionPx).toBe(194);
  });

  // ─── Issue #2129 cycle 3 HIGH finding — direct marker-to-marker swap ───
  // useMarkerSelection.ts's selectMarkerSibling swaps the previewed listing
  // id WITHOUT ever closing the sheet (isPreviewSheetOpen stays true the
  // whole time). A stale measurement from the PREVIOUS listing must never
  // leak into the new one's reservation.
  it('ignores a stale measurement from a PREVIOUS listing once the previewed identity changes WHILE the sheet stays continuously open', () => {
    const { result, rerender } = renderHook(
      ({ isOpen, id }) => usePreviewSheetOcclusion(isOpen, id),
      { initialProps: { isOpen: true, id: 'listing-a' as string | null } },
    );

    // Listing A opens and measures a real height (e.g. a full-content card).
    act(() => {
      result.current.onHeightChange('listing-a', 220);
    });
    expect(result.current.previewOcclusionPx).toBe(220);

    // selectMarkerSibling swaps straight to listing B — isPreviewSheetOpen
    // NEVER flips false; only the previewed listing's identity changes.
    // No onHeightChange call yet for B.
    rerender({ isOpen: true, id: 'listing-b' });

    // Must NOT still be A's stale 220px — falls back to the safe constant
    // until B's own measurement arrives.
    expect(result.current.previewOcclusionPx).toBe(MOBILE_LISTING_PREVIEW_OCCLUSION_PX);
  });

  // ─── Issue #2129 cycle 5 BLOCKING finding — the fix itself ─────────────
  // Cycle 3's first fix used a separate reset-on-identity-change effect,
  // which only cleared the stale value but relied on the SHEET to guarantee
  // a fresh report always arrives afterward (a delta-only ResizeObserver
  // does not, when the new listing's height matches the old one's — see
  // MobileListingPreviewSheet.test.tsx for that half of the fix). This
  // hook's own half of the fix is structural: a measurement is accepted
  // the instant it arrives FOR THE CURRENT listing, with no separate reset
  // effect that could race ahead of and erase it.
  it('accepts a measurement for the NEW listing the instant it arrives, even when reported in the SAME update as the identity change (no reset-effect race)', () => {
    const { result, rerender } = renderHook(
      ({ isOpen, id }) => usePreviewSheetOcclusion(isOpen, id),
      { initialProps: { isOpen: true, id: 'listing-a' as string | null } },
    );

    act(() => {
      result.current.onHeightChange('listing-a', 220);
    });
    expect(result.current.previewOcclusionPx).toBe(220);

    rerender({ isOpen: true, id: 'listing-b' });
    // B's own measurement — SAME height as A's, the exact case a delta-only
    // ResizeObserver would never re-fire for (covered structurally here,
    // independent of the sheet's own reporting mechanism).
    act(() => {
      result.current.onHeightChange('listing-b', 220);
    });

    expect(result.current.previewOcclusionPx).toBe(220);
  });

  it('rejects (ignores) a late-arriving measurement tagged for a listing that is NO LONGER the current one', () => {
    const { result, rerender } = renderHook(
      ({ isOpen, id }) => usePreviewSheetOcclusion(isOpen, id),
      { initialProps: { isOpen: true, id: 'listing-a' as string | null } },
    );

    act(() => {
      result.current.onHeightChange('listing-a', 220);
    });
    rerender({ isOpen: true, id: 'listing-b' });

    // A late ResizeObserver callback for the OLD listing id arrives after
    // the swap (e.g. a reflow that was already in flight) — must not be
    // read as B's height.
    act(() => {
      result.current.onHeightChange('listing-a', 999);
    });

    expect(result.current.previewOcclusionPx).toBe(MOBILE_LISTING_PREVIEW_OCCLUSION_PX);
  });

  it('does NOT lose the measured height on a re-render with the SAME open state and listing id (no spurious fallback flicker)', () => {
    const { result, rerender } = renderHook(
      ({ isOpen, id }) => usePreviewSheetOcclusion(isOpen, id),
      { initialProps: { isOpen: true, id: 'listing-a' as string | null } },
    );

    act(() => {
      result.current.onHeightChange('listing-a', 180);
    });
    expect(result.current.previewOcclusionPx).toBe(180);

    // Some unrelated parent re-render — same isOpen, same id.
    rerender({ isOpen: true, id: 'listing-a' });

    expect(result.current.previewOcclusionPx).toBe(180);
  });

  it('falls back to the safe constant on close, so the NEXT open never starts from a stale height', () => {
    const { result, rerender } = renderHook(
      ({ isOpen, id }) => usePreviewSheetOcclusion(isOpen, id),
      { initialProps: { isOpen: true, id: 'listing-a' as string | null } },
    );

    act(() => {
      result.current.onHeightChange('listing-a', 220);
    });
    expect(result.current.previewOcclusionPx).toBe(220);

    rerender({ isOpen: false, id: null });
    expect(result.current.previewOcclusionPx).toBe(0);

    // Reopening with a DIFFERENT listing, no measurement yet, must start
    // from the fallback, not the previous session's 220px.
    rerender({ isOpen: true, id: 'listing-c' });
    expect(result.current.previewOcclusionPx).toBe(MOBILE_LISTING_PREVIEW_OCCLUSION_PX);
  });
});
