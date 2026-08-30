import { useCallback } from 'react';
import { useDiscoverInteractionState } from '@/features/discover/state/useDiscoverInteractionState';
import { useAreaSearchState } from '@/features/discover/state/useAreaSearchState';
import type { AreaMarkerClusterInfo } from '@/components/map/AreaMarkerLayer';

/**
 * Issue #2142 (correction pass) — split out of the former
 * `useDiscoverMapPresentationController` (340 LOC / 39 return fields), which
 * merged five unrelated capabilities behind one name.
 *
 * OWNS: the ephemeral, never-URL-backed hover/emphasis state (issue #1824
 * Slice S1) + the panel<->map area-search box (issue #1798 PR-B / #1824 S2c)
 * + the non-splittable area-cluster chip click (issue #1806 FIX-5d).
 *
 * NEGATIVE INVARIANT (enforced by a static guard in
 * `__tests__/interactionControllerNoCamera.guard.test.ts`): this file must
 * NEVER import or call a camera producer (`publish*CameraIntent`,
 * `setPanToArea`, `useDiscoverCameraOrchestration`). Hover/emphasis and
 * cluster-chip selection are presentation-only concerns — the moment one of
 * them can move the camera, the #1823 camera-fit policy stops having a
 * single owner (`useDiscoverCameraController`).
 */
export function useDiscoverInteractionController() {
  // Issue #1824 Slice S1 — ephemeral hover/emphasis cluster (hoveredListingId,
  // hoveredAreaKeyForMap, highlightedAreaKeys) — never written to the URL.
  const { view: interactionView, commands: interactionCommands } = useDiscoverInteractionState();
  const { hoveredListingId, hoveredAreaKeyForMap, highlightedAreaKeys } = interactionView;

  // Issue #1806 (FIX-5d) — non-splittable area-cluster chip click -> highlight the
  // panel's member-area rows. Never drives any camera movement.
  const handleAreaClusterClick = useCallback((cluster: AreaMarkerClusterInfo) => {
    interactionCommands.setHighlightedAreas(cluster.areas.map((a) => a.areaKey));
  }, [interactionCommands]);

  // Issue #1798 PR-B / #1824 S2c — panel<->map area-marker plumbing.
  const { areaSearchQuery, debouncedAreaSearchQuery, setAreaSearchQuery } = useAreaSearchState();

  return {
    hoveredListingId,
    hoveredAreaKeyForMap,
    highlightedAreaKeys,
    interactionCommands,
    handleAreaClusterClick,
    areaSearchQuery,
    debouncedAreaSearchQuery,
    setAreaSearchQuery,
  };
}
