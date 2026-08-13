import { useRegionGuideState } from '@/features/discover/state/useRegionGuideState';
import { useReducedMotion } from '@/features/discover/state/useReducedMotion';

export interface UseDiscoverRegionGuideControllerParams {
  /**
   * From `useDiscoverMapLayerController` — true while the map is showing a
   * region overview. The guidance card/ring only exist in that state, so this
   * controller is called AFTER the layer controller (its pre-split position
   * was earlier, but nothing consumed its outputs in between — verified).
   */
  isRegionOverview: boolean;
}

/**
 * Issue #2142 (correction pass) — split out of the former
 * `useDiscoverMapPresentationController`.
 *
 * OWNS the issue #1808 region-guidance affordance end to end: the
 * arm/dismiss/nonce state (issue #1824 Slice S2b), reduced-motion detection
 * (#1808 §8 / Slice S2a), AND the two visibility derivations that used to sit
 * on MapDiscovery.tsx 400 lines away from the state they read.
 *
 * SOLE OWNER of the #1808 deep-link-vs-pick distinction: the ring/helper fire
 * only on an actual map/panel pick, never on deep-link/refresh (design §5/§9,
 * AC5). That rule is expressed exactly once, in `regionGuideRingActive` below
 * — no other file may re-derive `regionSelectSource !== 'deeplink'`.
 */
export function useDiscoverRegionGuideController({
  isRegionOverview,
}: UseDiscoverRegionGuideControllerParams) {
  // Issue #1824 S2b — regionSelectSource/regionSelectNonce/regionGuideDismissed/armRegionSelect.
  const { view: regionGuideView, commands: regionGuideCommands } = useRegionGuideState();
  const { regionSelectSource, regionSelectNonce, regionGuideDismissed } = regionGuideView;
  const { armRegionSelect, dismissRegionGuide } = regionGuideCommands;

  // Issue #1808 §8 / #1824 Slice S2a — reduced-motion detection for the guidance ring/nudge.
  const prefersReducedMotion = useReducedMotion();

  // Issue #1808 — the ring/helper (not the card/legend) fire only on an actual
  // map/panel pick, never on deep-link/refresh (design §5/§9, AC5).
  const regionGuideVisible = isRegionOverview && !regionGuideDismissed;
  const regionGuideRingActive = regionGuideVisible && regionSelectSource !== 'deeplink';

  return {
    regionSelectSource,
    regionSelectNonce,
    regionGuideDismissed,
    armRegionSelect,
    dismissRegionGuide,
    prefersReducedMotion,
    regionGuideVisible,
    regionGuideRingActive,
  };
}
