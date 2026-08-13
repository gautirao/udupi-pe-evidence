/**
 * Issue #2129 (code-reviewer cycle 5, BLOCKING) — integration regression.
 *
 * Wires the REAL usePreviewSheetOcclusion hook to the REAL
 * MobileListingPreviewSheet component (no mocked onHeightChange, no manual
 * synthetic call anywhere in this file) and reproduces the exact defect the
 * cycle-5 review caught: a direct marker-to-marker swap (sheet stays
 * mounted, same DOM node, same ResizeObserver instance) where listing B's
 * real rendered height happens to be IDENTICAL to listing A's. A delta-only
 * ResizeObserver would never fire again for that swap, leaving
 * previewOcclusionPx pinned on the safe-fallback constant indefinitely —
 * silently recreating the original #2129 occlusion gap.
 *
 * This test proves the fix holds end-to-end at the hook+component boundary:
 * previewOcclusionPx correctly reflects B's real measured height after the
 * swap, with NO manual/synthetic onHeightChange call in this file — only a
 * mocked `getBoundingClientRect` (the DOM measurement primitive itself) and
 * a real `rerender`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePreviewSheetOcclusion } from './usePreviewSheetOcclusion';
import { MobileListingPreviewSheet } from '@/features/discover/views/mobile/MobileListingPreviewSheet';
import type {
  SelectedListingPreview,
  SelectedListingPreviewAnon,
  SelectedListingPreviewAuthed,
} from '@/features/discover/navigation/selectedListingPreview';
import { MOBILE_LISTING_PREVIEW_OCCLUSION_PX } from '@/shared/map/zoomPolicy';

// jsdom doesn't implement ResizeObserver — an inert stub is enough here:
// this test's guarantee comes from the sheet's synchronous
// useLayoutEffect-driven report, not from ever firing a ResizeObserver
// callback (that would be the OLD, insufficient mechanism this test exists
// to rule out).
class InertResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const LISTING_A: SelectedListingPreviewAnon = {
  kind: 'anon',
  id: 'listing-a',
  title: 'Listing A',
  primaryImageUrl: null,
  propertyType: 'apartment',
  bedrooms: 2,
  areaLabel: 'Manipal',
  trustBadge: 'verified',
  priceBand: '₹1-2Cr',
};

const LISTING_B: SelectedListingPreviewAuthed = {
  kind: 'authed',
  id: 'listing-b',
  title: 'Listing B',
  primaryImageUrl: null,
  propertyType: 'house',
  bedrooms: 3,
  areaLabel: 'Malpe',
  trustBadge: null,
  pricePaise: 8_000_000_00,
};

/** Mounts the real hook + real sheet together, same shape as MapDiscovery.tsx's own wiring (no `key` on the sheet — same instance reused across a preview swap). */
function Harness({ preview, isOpen }: { preview: SelectedListingPreview | null; isOpen: boolean }) {
  const { previewOcclusionPx, onHeightChange } = usePreviewSheetOcclusion(
    isOpen && !!preview,
    preview?.id ?? null,
  );
  return (
    <div>
      <div data-testid="occlusion-value">{previewOcclusionPx}</div>
      {isOpen && preview && (
        <MobileListingPreviewSheet
          preview={preview}
          onDismiss={() => {}}
          onViewDetails={() => {}}
          onHeightChange={onHeightChange}
        />
      )}
    </div>
  );
}

describe('usePreviewSheetOcclusion + MobileListingPreviewSheet — integration (Issue #2129 cycle 5)', () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    globalThis.ResizeObserver = InertResizeObserverStub as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.restoreAllMocks();
  });

  it('reflects the real measured height for listing A on first open', () => {
    Element.prototype.getBoundingClientRect = vi
      .fn()
      .mockReturnValue({ height: 194, width: 390, top: 0, bottom: 0, left: 0, right: 0, x: 0, y: 0, toJSON() {} });

    render(<Harness preview={LISTING_A} isOpen />);

    expect(screen.getByTestId('occlusion-value')).toHaveTextContent('194');
  });

  it('THE FIX: after a direct A -> B swap (sheet stays mounted) where B renders at the SAME height as A, previewOcclusionPx reflects B\'s real measurement — not stuck at the 150px fallback — with NO manual onHeightChange call', () => {
    // Same mocked height throughout — the exact case that broke: a
    // delta-only ResizeObserver never fires because there is no size DELTA
    // between A's and B's real layout box.
    Element.prototype.getBoundingClientRect = vi
      .fn()
      .mockReturnValue({ height: 194, width: 390, top: 0, bottom: 0, left: 0, right: 0, x: 0, y: 0, toJSON() {} });

    const { rerender } = render(<Harness preview={LISTING_A} isOpen />);
    expect(screen.getByTestId('occlusion-value')).toHaveTextContent('194');

    // Direct marker-to-marker swap: same Harness instance, same sheet
    // instance (no key change) — only the `preview` prop changes, exactly
    // useMarkerSelection.ts's selectMarkerSibling path.
    rerender(<Harness preview={LISTING_B} isOpen />);

    // Must NOT be '150' (the safe-fallback constant a broken build would
    // show here, since no resize event would ever fire) and must NOT still
    // be a stale '194' left over from A by coincidence of the SAME wrong
    // reason — it must be B's OWN real, freshly-measured 194.
    expect(screen.getByTestId('occlusion-value')).not.toHaveTextContent(String(MOBILE_LISTING_PREVIEW_OCCLUSION_PX));
    expect(screen.getByTestId('occlusion-value')).toHaveTextContent('194');
  });

  it('control case: a same-height A -> B swap where B is DELIBERATELY given a DIFFERENT real height still resolves correctly (rules out a test that would pass by accident)', () => {
    const rectSpy = vi
      .fn()
      .mockReturnValue({ height: 194, width: 390, top: 0, bottom: 0, left: 0, right: 0, x: 0, y: 0, toJSON() {} });
    Element.prototype.getBoundingClientRect = rectSpy;

    const { rerender } = render(<Harness preview={LISTING_A} isOpen />);
    expect(screen.getByTestId('occlusion-value')).toHaveTextContent('194');

    rectSpy.mockReturnValue({ height: 230, width: 390, top: 0, bottom: 0, left: 0, right: 0, x: 0, y: 0, toJSON() {} });
    rerender(<Harness preview={LISTING_B} isOpen />);

    expect(screen.getByTestId('occlusion-value')).toHaveTextContent('230');
  });
});
