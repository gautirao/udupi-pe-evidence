import { Suspense, lazy } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { MapSkeleton } from '@/components/discover/MapSkeleton';
import { MobileClusterSheet } from '@/features/discover/views/mobile/MobileClusterSheet';
import { MobileListingPreviewSheet } from '@/features/discover/views/mobile/MobileListingPreviewSheet';
import type { DiscoverMapCanvasProps } from '@/features/discover/views/DiscoverMapCanvas';
import type { DiscoverMapSurfaceView, DiscoverMapSurfaceCommands } from './buildMapSurfaceModel';

/**
 * Issue #2142 Commit 4 — renamed from DiscoverMapMount.tsx (per the approved
 * plan's rollback file-set). The shouldMount/Suspense/lazy real-unmount gate
 * below is preserved VERBATIM from that file (see its own prior doc comment,
 * git history). This surface additionally now owns MobileClusterSheet,
 * MobileListingPreviewSheet, and the recenter-button portal — see
 * buildMapSurfaceModel.ts's doc comment for why those live here rather than on
 * DiscoverOverlaySurface (DOM/stacking-context coupling with the map canvas,
 * team-lead ruling 2026-08-12). DiscoverMapCanvas itself is UNCHANGED: this
 * surface only reconstructs its exact flat prop shape from the grouped view/
 * commands contract before spreading it through.
 */
const LazyDiscoverMapCanvas = lazy(() =>
  import('../views/DiscoverMapCanvas').then((mod) => ({
    default: mod.DiscoverMapCanvas,
  })),
);

if (typeof window !== 'undefined' && window.innerWidth > 820) {
  void import('../views/DiscoverMapCanvas');
}

export interface DiscoverMapSurfaceProps {
  view: DiscoverMapSurfaceView;
  commands: DiscoverMapSurfaceCommands;
  mapContainerRef: RefObject<HTMLDivElement | null>;
}

export function DiscoverMapSurface({ view, commands, mapContainerRef }: DiscoverMapSurfaceProps) {
  const { isMobileShell, mobileView } = useDiscoverShell();
  const shouldMount = !isMobileShell || mobileView === 'MAP';
  // Issue #2698 — the SAME discriminator DiscoverMapCanvas uses (`!!mobileListButton`, supplied
  // only while the full-screen mobile Map is open), so the area recenter and the canvas's
  // right-hand column (city recenter, school-radius hint) can never disagree on "mobile".
  const isMobileMapOverlay = !!view.mobile.mobileListButton;

  const canvasProps: DiscoverMapCanvasProps = {
    ...view.camera,
    ...view.layers,
    ...view.navigation,
    ...view.schools,
    ...view.markers,
    ...view.status,
    ...view.mobile,
    ...view.regionGuide,
    ...commands.camera,
    ...commands.drawing,
    ...commands.navigation,
    ...commands.markers,
    ...commands.regionGuide,
    // Issue #2628 — the mobile Map "Filters" sheet's one canonical write command.
    ...commands.filters,
    mapContainerRef,
  };

  return (
    <>
      {view.overlays.mobileCluster.visible && (
        <MobileClusterSheet
          journey={view.overlays.mobileCluster.journey}
          focusedClusterMemberAreaKeys={view.overlays.mobileCluster.focusedClusterMemberAreaKeys}
          onClusterFocusChange={commands.overlays.onClusterFocusChange}
          eligibilityJourney={view.overlays.mobileCluster.eligibilityJourney}
        />
      )}
      {view.overlays.listingPreview.visible && view.overlays.listingPreview.preview && (
        <MobileListingPreviewSheet
          preview={view.overlays.listingPreview.preview}
          onDismiss={commands.overlays.onDismissPreview}
          onViewDetails={commands.overlays.onViewDetails}
          onHeightChange={commands.overlays.onPreviewHeightChange}
        />
      )}
      {shouldMount && (
        // Issue #2017 (owner-directed desktop rework) — AreaSetDraftProvider
        // moved UP to MapDiscovery.tsx (the common ancestor of this map tree
        // AND the panel tree, where AreaSetDraftPanel now also consumes this
        // same context on desktop) so both trees share ONE draft/nearby-
        // candidate instance instead of two independent, desynchronized
        // copies. See MapDiscovery.tsx's own comment for the full rationale.
        <Suspense fallback={<MapSkeleton />}>
          <LazyDiscoverMapCanvas {...canvasProps} />
        </Suspense>
      )}
      {view.overlays.recenter.visible &&
        view.overlays.recenter.portalTarget &&
        createPortal(
          <button
            type="button"
            data-testid="areas-recenter-button"
            onClick={commands.overlays.onRecenter}
            // Issue #2698 — centred at bottom-20 it covered the bottom-left map legend at
            // 375–412px. On the mobile Map it stacks in the right-hand column instead,
            // directly above the canvas's own "Recenter on <city>" button (bottom-[100px]).
            // Issue #2714 — desktop kept the centred bottom-20 placement, which sits in the
            // bottom-centre column #2714 reserves for the tip pill + count badge (and, at
            // narrower map widths than the #2698 evidence captured, risked reaching the
            // bottom-left legend the same way the mobile case above already had to move away
            // from). Per #2714's placement boundaries the bottom-right column stacks, bottom to
            // top: attribution, zoom, "Recenter on <city>" (now bottom-48), the school-radius
            // "more" hint (bottom-28, but taller — live-measured top edge 178px), the count
            // badge's right-anchored variant (now bottom-60, live-measured top edge 278px), then
            // this button — bottom-72 (288px) clears the badge's top edge with a 10px margin
            // (live-measured via Playwright; the badge, hint, city recenter and this button can
            // all render together in the anon school-radius "showing first N" + out-of-view-node
            // state), mirroring the mobile column's own stacking order.
            className={
              isMobileMapOverlay
                ? 'absolute bottom-[144px] right-[10px] z-[500] rounded-full border border-border bg-background/95 px-4 py-2 text-sm font-medium shadow-md'
                : 'absolute bottom-72 right-4 z-[500] rounded-full border border-border bg-background/95 px-4 py-2 text-sm font-medium shadow-md'
            }
          >
            Recenter on {view.overlays.recenter.label}
          </button>,
          view.overlays.recenter.portalTarget,
        )}
    </>
  );
}
