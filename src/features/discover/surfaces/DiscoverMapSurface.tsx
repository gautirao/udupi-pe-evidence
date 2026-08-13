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
            className="absolute bottom-20 left-1/2 z-[500] -translate-x-1/2 rounded-full border border-border bg-background/95 px-4 py-2 text-sm font-medium shadow-md"
          >
            Recenter on {view.overlays.recenter.label}
          </button>,
          view.overlays.recenter.portalTarget,
        )}
    </>
  );
}
