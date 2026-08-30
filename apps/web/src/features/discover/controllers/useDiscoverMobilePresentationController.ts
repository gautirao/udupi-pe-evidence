import { useState } from 'react';
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
}: UseDiscoverMobilePresentationControllerParams) {
  // Issue #1956 PR-5 (Slice 5, AC5.10/AC5.10c) — the mobile Map-mode preview
  // sheet's data. Reported UP by DiscoverAreasJourneyPanel's own
  // AreaLeafListingsSurface (via the panel surface's
  // onSelectedListingPreviewChange), which derives it from its own
  // ALREADY-FETCHED DiscoverCityListingItem[] — this page issues NO second
  // query and does not re-derive the preview itself. Plain useState (never
  // the URL): the underlying selection is URL-backed (`nav.selectedListing`,
  // OQ6 ruling — KEEP the existing listing= PUSH peek), so this state is a
  // pure, harmless PROJECTION of that URL value re-synced by the panel's own
  // effect whenever nav.selectedListing/the area's result set changes; it is
  // never itself written to the URL/history.
  //
  // Issue #2142 (correction pass) — moved here from MapDiscovery.tsx. This
  // controller is the #2129 mobile-preview-occlusion owner and every other
  // consumer of this state is downstream of it, so the state and the geometry
  // it drives now sit together; the setter is re-exported for the panel
  // surface's report-up callback.
  const [selectedListingPreview, setSelectedListingPreview] =
    useState<SelectedListingPreview | null>(null);

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
    selectedListingPreview,
    setSelectedListingPreview,
    mobileMapTriggerRef,
    bottomOcclusionPx,
    isPreviewSheetOpen,
    previewOcclusionPx,
    handlePreviewSheetHeightChange,
  };
}
