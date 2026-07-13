import type { RefObject } from 'react';
import { MarkerPopoverCard } from '@/components/discover/MarkerPopoverCard';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

/**
 * Issue #1824 Slice S8 — thin wrapper over MarkerPopoverCard (~L3275-3308).
 * PURE: the eligibility gate derivation + markerPopoverStepper computation
 * stay page-owned (#1798 render/capture-gate parity); this component only
 * receives the resolved booleans/values and assembles the `stepper` object
 * MarkerPopoverCard expects.
 */
export interface DiscoverMapMarkerPopoverProps {
  isMarkerPopoverEligible: boolean;
  selectedMarkerListing: PropertyListingWithImages | null;
  markerPixelPos: { x: number; y: number } | null;
  mapContainerRef: RefObject<HTMLDivElement | null>;
  isAuthenticated: boolean;
  handlePopoverDismiss: () => void;
  navigate: (path: string) => void;
  markerPopoverStepper: { index: number; total: number } | null;
  handleStepMarkerListing: (direction: -1 | 1) => void;
  showMarkerInList: (id: string) => void;
}

export function DiscoverMapMarkerPopover({
  isMarkerPopoverEligible,
  selectedMarkerListing,
  markerPixelPos,
  mapContainerRef,
  isAuthenticated,
  handlePopoverDismiss,
  navigate,
  markerPopoverStepper,
  handleStepMarkerListing,
  showMarkerInList,
}: DiscoverMapMarkerPopoverProps) {
  // a3 — Marker popover mini card. Gated to listing-marker clicks via
  // isMarkerPopoverEligible (Issue #1798 PR-C): journey !== agri-first,
  // areaKey set, and (no school selected OR journey === area-first) — the
  // same condition used by the click-capture gates that populate
  // markerPixelPos/selectedMarkerListing, so render eligibility can never
  // drift from capture eligibility again. School-first (3 desynced marker
  // tiers) and agri-first (own peek/panel) are intentionally excluded.
  // Area/cluster/count marker clicks never populate markerPixelPos, so they
  // stay popup-free regardless. ONE popover at a time; clicking a new marker
  // replaces it. Dismiss: X button (inside card), Escape key, map-background
  // click (onClick on this container div).
  return (
    <>
      {isMarkerPopoverEligible &&
        selectedMarkerListing != null &&
        markerPixelPos != null && (
          <MarkerPopoverCard
            listing={selectedMarkerListing}
            isAuthenticated={isAuthenticated}
            markerPixelPos={markerPixelPos}
            mapContainerRef={mapContainerRef}
            onDismiss={handlePopoverDismiss}
            onViewDetails={(id) => navigate(`/listing/${id}`)}
            stepper={
              markerPopoverStepper != null
                ? {
                    index: markerPopoverStepper.index,
                    total: markerPopoverStepper.total,
                    onPrev: () => handleStepMarkerListing(-1),
                    onNext: () => handleStepMarkerListing(1),
                  }
                : null
            }
            onShowInList={showMarkerInList}
          />
        )}
    </>
  );
}
