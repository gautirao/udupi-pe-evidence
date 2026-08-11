/**
 * Issue #2129 (code-reviewer cycle 3) — usePreviewSheetOcclusion.
 *
 * Extracted out of MapDiscovery.tsx specifically so the reset-on-identity-
 * change invariant below is unit-testable in isolation (MapDiscovery's own
 * render tree is not practically unit-testable — react-leaflet mocked, huge
 * component graph).
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

  it('adopts the real measured height once onHeightChange fires, rounding up (never under-reserving)', () => {
    const { result } = renderHook(
      ({ isOpen, id }) => usePreviewSheetOcclusion(isOpen, id),
      { initialProps: { isOpen: true, id: 'listing-a' as string | null } },
    );

    act(() => {
      result.current.onHeightChange(193.2);
    });

    expect(result.current.previewOcclusionPx).toBe(194);
  });

  // ─── Issue #2129 cycle 3 HIGH finding — direct marker-to-marker swap ───
  // useMarkerSelection.ts's selectMarkerSibling swaps the previewed listing
  // id WITHOUT ever closing the sheet (isPreviewSheetOpen stays true the
  // whole time). A reset effect keyed only on isPreviewSheetOpen would never
  // fire here, letting listing A's stale measured height leak into listing
  // B's newly-rendered (possibly taller) content — reproducing the original
  // #2129 under-reservation for the transient window before B's own
  // ResizeObserver callback lands. This is the exact regression this test
  // proves does NOT happen.
  it('resets the measured height when the previewed listing identity changes WHILE the sheet stays continuously open (direct marker-to-marker swap)', () => {
    const { result, rerender } = renderHook(
      ({ isOpen, id }) => usePreviewSheetOcclusion(isOpen, id),
      { initialProps: { isOpen: true, id: 'listing-a' as string | null } },
    );

    // Listing A opens and measures a real height (e.g. a full-content card).
    act(() => {
      result.current.onHeightChange(220);
    });
    expect(result.current.previewOcclusionPx).toBe(220);

    // selectMarkerSibling swaps straight to listing B — isPreviewSheetOpen
    // NEVER flips false; only the previewed listing's identity changes.
    rerender({ isOpen: true, id: 'listing-b' });

    // Must NOT still be A's stale 220px — falls back to the safe constant
    // until B's own ResizeObserver reports its real height.
    expect(result.current.previewOcclusionPx).toBe(MOBILE_LISTING_PREVIEW_OCCLUSION_PX);

    // B's sheet instance measures its own (here, shorter) real content.
    act(() => {
      result.current.onHeightChange(160);
    });
    expect(result.current.previewOcclusionPx).toBe(160);
  });

  it('does NOT reset the measured height on a re-render with the SAME open state and listing id (no spurious remeasure-fallback flicker)', () => {
    const { result, rerender } = renderHook(
      ({ isOpen, id }) => usePreviewSheetOcclusion(isOpen, id),
      { initialProps: { isOpen: true, id: 'listing-a' as string | null } },
    );

    act(() => {
      result.current.onHeightChange(180);
    });
    expect(result.current.previewOcclusionPx).toBe(180);

    // Some unrelated parent re-render — same isOpen, same id.
    rerender({ isOpen: true, id: 'listing-a' });

    expect(result.current.previewOcclusionPx).toBe(180);
  });

  it('resets on close (isPreviewSheetOpen -> false) so the NEXT open never starts from a stale height', () => {
    const { result, rerender } = renderHook(
      ({ isOpen, id }) => usePreviewSheetOcclusion(isOpen, id),
      { initialProps: { isOpen: true, id: 'listing-a' as string | null } },
    );

    act(() => {
      result.current.onHeightChange(220);
    });
    expect(result.current.previewOcclusionPx).toBe(220);

    rerender({ isOpen: false, id: null });
    expect(result.current.previewOcclusionPx).toBe(0);

    // Reopening with a DIFFERENT (shorter) listing must start from the
    // fallback, not the previous session's 220px.
    rerender({ isOpen: true, id: 'listing-c' });
    expect(result.current.previewOcclusionPx).toBe(MOBILE_LISTING_PREVIEW_OCCLUSION_PX);
  });
});
