import type { RefObject } from 'react';
import { useMarkerSelection } from '@/features/discover/state/useMarkerSelection';
import type { DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

export interface UseDiscoverMarkerControllerParams {
  urlActions: DiscoverUrlActions;
  urlState: DiscoverUrlState;
  mapContainerRef: RefObject<HTMLDivElement | null>;
  /**
   * Issue #1956 PR-4 (risk R1) — the SAME leaf-identity boolean fed to the
   * page-level isMarkerPopoverEligible render gate, so the capture gate
   * (in useMarkerSelection) and the render gate can never drift on this arm.
   */
  isNodeAreaLeaf: boolean;
}

/**
 * Issue #2142 Commit 3 (C7, per approved plan) — moved verbatim out of
 * MapDiscovery.tsx. Wraps `useMarkerSelection` (issue #1824 Slice S5, EARLY
 * marker-selection cluster: selectedMarkerListing, markerPixelPos, the
 * markerListingCtxRef identity-stable-handler pattern, and
 * handleSelectMarkerListing/handleMarkerClickWithPosition/handlePopoverDismiss).
 *
 * Deliberately does NOT wrap `resolveMarkerPopover` (the S10b marker-resolve/
 * stepper pure function, invariants #2130/#2139) even though the plan's
 * invariant table assigns those to this controller — flagged to team-lead
 * and approved to defer: `resolveMarkerPopover` needs ~19 params spanning
 * nearly every other controller's output (mapZoom, groupResultsMarkers,
 * nodeListingsMarkers, markerListings/areaMarkerListings,
 * schoolRadiusFallbackMarkers, isMarkerPopoverEligible, this controller's
 * own selectedMarkerListing, etc.) and is already positioned as late as
 * possible in the page (see its own Issue #1939 relocation comment).
 * Bundling it here now would relocate a 19-field prop bag with zero
 * simplification — same reasoning as `useDiscoverJourneyTransitions` staying
 * inline pending the School controller. `resolveMarkerPopover`'s call site
 * stays untouched in MapDiscovery.tsx for this commit. The #2130/#2139
 * invariant tests already target `resolveMarkerPopover`/
 * `isMarkerPopoverEligible` directly, so invariant coverage is unaffected.
 *
 * Called EARLY (before useDiscoverPageState/`city` resolves) — same
 * position as its pre-refactor call site.
 */
export function useDiscoverMarkerController({
  urlActions,
  urlState,
  mapContainerRef,
  isNodeAreaLeaf,
}: UseDiscoverMarkerControllerParams) {
  return useMarkerSelection({
    urlActions,
    urlState,
    mapContainerRef,
    isNodeAreaLeaf,
  });
}
