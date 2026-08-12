import { useMobileMapOverlayShell } from '@/hooks/useMobileMapOverlayShell';
import { usePreviewSheetOcclusion } from '@/features/discover/state/usePreviewSheetOcclusion';
import { MOBILE_LISTING_PREVIEW_OCCLUSION_PX } from '@/shared/map/zoomPolicy';
import type { MobileView } from '@/features/discover/context/types';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';

export interface UseDiscoverMobilePresentationControllerParams {
  /** isMobileShell && mobileView === 'MAP' — computed at the page level from useDiscoverShell(). */
  mobileMapOpen: boolean;
  setMobileView: (view: MobileView) => void;
  /**
   * Reuses the SAME predicate as the desktop marker-popover render-eligibility
   * gate (issue #2128 review cycle 4, Finding 2) — deliberately NOT
   * `selectedListingPreview`, computed at the page level (shared with the
   * desktop marker concern, not mobile-specific), threaded in as an input.
   */
  isMarkerPopoverEligible: boolean;
  selectedListingPreview: SelectedListingPreview | null;
}

/**
 * Issue #2142 Commit 3 (C8, per approved plan) — moved verbatim out of
 * MapDiscovery.tsx. Wraps `useMobileMapOverlayShell` (mobile Map-mode
 * full-screen overlay shell) + `usePreviewSheetOcclusion` (issue #2129 —
 * bottomOcclusionPx proactive/previewOcclusionPx reactive viewport-clip
 * pair) + isPreviewSheetOpen.
 *
 * Does NOT wrap `useDiscoverShell()` itself (mobileView/isMobileShell/
 * setMobileView) — that's a plain context-facade hook, called directly at
 * the page level like the other whole-context-object consumers, not a
 * controller concern. `mobileView` specifically must stay available BEFORE
 * this controller runs, since useDiscoverViewportTracker (Commit 3, first
 * batch) already depends on it as an input.
 *
 * Called LATE (same position as its pre-refactor call site) — needs
 * `isMarkerPopoverEligible`, itself computed late at the page level.
 * `mobileMapOpen` has no early consumer between useDiscoverShell()'s call
 * site and here (verified: no reference in between), so moving
 * useMobileMapOverlayShell down to join the occlusion piece here is
 * behavior-preserving.
 *
 * Guard for issue #2088/#1953's invariant ("Map/List is not a second
 * navigation model"): this controller's params exclude any URL-write
 * capability from the discover-actions bundle — it only ever reads
 * `mobileMapOpen` and calls `setMobileView`, never touches the URL.
 */
export function useDiscoverMobilePresentationController({
  mobileMapOpen,
  setMobileView,
  isMarkerPopoverEligible,
  selectedListingPreview,
}: UseDiscoverMobilePresentationControllerParams) {
  const { triggerRef: mobileMapTriggerRef } = useMobileMapOverlayShell({
    isOpen: mobileMapOpen,
    onClose: () => setMobileView('LIST'),
  });

  // PR #2128 review cycle 4 (Finding 2, issue #1823) — proactive signal, true
  // for the WHOLE mobile Map-mode browsing session in an eligible journey.
  const bottomOcclusionPx = mobileMapOpen && isMarkerPopoverEligible ? MOBILE_LISTING_PREVIEW_OCCLUSION_PX : 0;

  // Issue #2129 (code-reviewer cycle 2, ADVISORY-FIX) — the SINGLE named
  // source of truth for "is MobileListingPreviewSheet actually mounted right now".
  const isPreviewSheetOpen = mobileMapOpen && !!selectedListingPreview;

  // Issue #2129 (code-reviewer cycle 3) — 0 unless isPreviewSheetOpen; while
  // open, prefers the sheet's real measured height over the fixed guess.
  const { previewOcclusionPx, onHeightChange: handlePreviewSheetHeightChange } =
    usePreviewSheetOcclusion(isPreviewSheetOpen, selectedListingPreview?.id ?? null);

  return {
    mobileMapTriggerRef,
    bottomOcclusionPx,
    isPreviewSheetOpen,
    previewOcclusionPx,
    handlePreviewSheetHeightChange,
  };
}
