import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

const mockUseMobileMapOverlayShell = vi.hoisted(() => vi.fn());
const mockUsePreviewSheetOcclusion = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useMobileMapOverlayShell', () => ({ useMobileMapOverlayShell: mockUseMobileMapOverlayShell }));
vi.mock('@/features/discover/state/usePreviewSheetOcclusion', () => ({
  usePreviewSheetOcclusion: mockUsePreviewSheetOcclusion,
}));

import { useDiscoverMobilePresentationController } from './useDiscoverMobilePresentationController';

const TRIGGER_REF = { current: null };
const OCCLUSION_RESULT = { previewOcclusionPx: 0, onHeightChange: vi.fn() };

describe('useDiscoverMobilePresentationController (#2142 Commit 3 — moved verbatim from MapDiscovery.tsx, composition test)', () => {
  beforeEach(() => {
    mockUseMobileMapOverlayShell.mockReset().mockReturnValue({ triggerRef: TRIGGER_REF });
    mockUsePreviewSheetOcclusion.mockReset().mockReturnValue(OCCLUSION_RESULT);
  });

  it('passes mobileMapOpen as isOpen and onClose sets mobileView back to LIST', () => {
    const setMobileView = vi.fn();
    renderHook(() =>
      useDiscoverMobilePresentationController({
        mobileMapOpen: true,
        setMobileView,
        isMarkerPopoverEligible: false,
        selectedListingPreview: null,
      }),
    );
    expect(mockUseMobileMapOverlayShell).toHaveBeenCalledWith(
      expect.objectContaining({ isOpen: true }),
    );
    const onClose = mockUseMobileMapOverlayShell.mock.calls[0][0].onClose;
    onClose();
    expect(setMobileView).toHaveBeenCalledWith('LIST');
  });

  it('bottomOcclusionPx is MOBILE_LISTING_PREVIEW_OCCLUSION_PX only when mobileMapOpen AND isMarkerPopoverEligible', () => {
    const { result: neither } = renderHook(() =>
      useDiscoverMobilePresentationController({
        mobileMapOpen: false,
        setMobileView: vi.fn(),
        isMarkerPopoverEligible: false,
        selectedListingPreview: null,
      }),
    );
    expect(neither.current.bottomOcclusionPx).toBe(0);

    const { result: mapOnly } = renderHook(() =>
      useDiscoverMobilePresentationController({
        mobileMapOpen: true,
        setMobileView: vi.fn(),
        isMarkerPopoverEligible: false,
        selectedListingPreview: null,
      }),
    );
    expect(mapOnly.current.bottomOcclusionPx).toBe(0);

    const { result: both } = renderHook(() =>
      useDiscoverMobilePresentationController({
        mobileMapOpen: true,
        setMobileView: vi.fn(),
        isMarkerPopoverEligible: true,
        selectedListingPreview: null,
      }),
    );
    expect(both.current.bottomOcclusionPx).toBe(150);
  });

  it('isPreviewSheetOpen is true only when mobileMapOpen AND a selectedListingPreview exists', () => {
    const { result } = renderHook(() =>
      useDiscoverMobilePresentationController({
        mobileMapOpen: true,
        setMobileView: vi.fn(),
        isMarkerPopoverEligible: false,
        selectedListingPreview: { id: 'listing-1' } as never,
      }),
    );
    expect(result.current.isPreviewSheetOpen).toBe(true);
    expect(mockUsePreviewSheetOcclusion).toHaveBeenCalledWith(true, 'listing-1');
  });

  it('previewedListingId passed to usePreviewSheetOcclusion is null when no preview is selected', () => {
    renderHook(() =>
      useDiscoverMobilePresentationController({
        mobileMapOpen: true,
        setMobileView: vi.fn(),
        isMarkerPopoverEligible: false,
        selectedListingPreview: null,
      }),
    );
    expect(mockUsePreviewSheetOcclusion).toHaveBeenCalledWith(false, null);
  });

  // Static guard (code-reviewer flag on the Commit 1-3 gate): this
  // controller must never gain URL-write capability — the file's own
  // header comment documents "Map/List is not a second navigation model"
  // (issue #2088/#1953) as an invariant it must not violate. Source-regex
  // guard so a future edit that widens params to `actions:
  // DiscoverUrlActions` (or otherwise imports useDiscoverActions) fails a
  // test, not just a manual read.
  it('static guard: params expose no useDiscoverActions/DiscoverUrlActions history-write capability', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, './useDiscoverMobilePresentationController.ts'),
      'utf-8',
    );
    expect(source).not.toMatch(/useDiscoverActions/);
    expect(source).not.toMatch(/DiscoverUrlActions/);
    expect(source).not.toMatch(/\bactions\s*:/);
  });
});
