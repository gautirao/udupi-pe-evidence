import { useState, type Dispatch, type SetStateAction } from 'react';
import { useAreasNavigationJourney } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import { useClusterFocusUrlParam } from '@/features/discover/state/url/clusterFocus';
import { buildNavigationCountsFilters } from '@/features/discover/adapters/navigationCountsFilters';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import type { DiscoverNavContextValue } from '@/features/discover/context/types';

export interface UseDiscoverNavigationControllerParams {
  /** Whole nav context object — mirrors how most existing hooks on this page already consume it. */
  nav: DiscoverNavContextValue;
  /** actions.goToNode from useDiscoverActions(). */
  goToNode: (nodeKey: string) => void;
  /** Issue #2083 RC_C — nav.intent mapped to backend listingPurpose; computed by the caller (page-global, not navigation-specific). */
  intentListingPurpose: string;
}

export interface UseDiscoverNavigationControllerResult {
  showAreasNavigationJourney: boolean;
  areasNavigationJourney: UseAreasNavigationJourneyResult;
  hoveredNavigationNodeKey: string | null;
  setHoveredNavigationNodeKey: Dispatch<SetStateAction<string | null>>;
  focusedClusterMemberAreaKeys: readonly string[] | null;
  setFocusedClusterMemberAreaKeys: (keys: readonly string[] | null) => void;
}

/**
 * Issue #2142 Commit 3 (C2, per approved plan) — moved verbatim out of
 * MapDiscovery.tsx. Wraps `useAreasNavigationJourney` (unchanged) +
 * `useClusterFocusUrlParam` (unchanged) + the `navigationCountsFilters`
 * adapter (Commit 2).
 *
 * Deliberately does NOT wrap `useDiscoverJourneyTransitions` (issue #1824
 * Slice S6 — the Back-ladder/Start-Over/school-first machinery) even though
 * it might read as "the other half of navigation" — the architect's
 * original plan already assigns that hook to `useDiscoverSchoolController`
 * (C5, second batch of this commit), and its own 15+ injected deps
 * (schools, discoverAreas, areasLoading, schoolById, city, panelContent,
 * etc.) are not resolvable at this controller's early call site anyway —
 * see MapDiscovery.tsx's own call-site comment for
 * useDiscoverJourneyTransitions for the full ordering rationale.
 *
 * Called EARLY (before useDiscoverPageState/`city` resolves) — matches
 * `useAreasNavigationJourney`'s pre-refactor position, since its output
 * (`areasNavigationJourney.node`) feeds `nodeAreaPoint`/
 * `isNodeAreaLeafActive` and `useDiscoverMapData`'s `nodeKey` param, both
 * of which also need to resolve early.
 */
export function useDiscoverNavigationController({
  nav,
  goToNode,
  intentListingPurpose,
}: UseDiscoverNavigationControllerParams): UseDiscoverNavigationControllerResult {
  // Issue #1956 PR 2 (Slice 3) — this is one of THREE identical gate sites
  // (this file, DiscoverRightPanelContainer.tsx, DiscoverMapCanvas.tsx) —
  // see DiscoverMapCanvas.tsx's own copy of this comment for why the
  // triplication is deliberate.
  const isSchoolsNavNodeLevel = nav.journey === 'school-first' && !nav.areaKey && !nav.schoolId;
  const showAreasNavigationJourney = nav.journey === 'area-first' || isSchoolsNavNodeLevel;

  // Issue #1956 PR 2 (Slice 3, pass 4, AC3.9) — the ONE ephemeral hover/focus
  // node_key, threaded unchanged to BOTH the map's AreaDestinationMarkerLayer
  // and the panel's NavigationChildCard list so a hover on either side
  // highlights the matching item on the other, by stable node_key. Plain
  // useState (never the URL) — hover creates no history entry and no camera fit.
  const [hoveredNavigationNodeKey, setHoveredNavigationNodeKey] = useState<string | null>(null);

  // Issue #1956 PR 3 (bounded state-lift, AC4.12/AC4.5) — the ONE focused
  // visual-AREA-cluster identity. Issue #2088 (commit 5) — migrated off plain
  // useState onto the clusterFocus URL domain so this presentation state
  // survives browser Back/Forward (AC6).
  const { clusterFocus: focusedClusterMemberAreaKeys, setClusterFocus: setFocusedClusterMemberAreaKeys } =
    useClusterFocusUrlParam();

  const navigationCountsFilters = buildNavigationCountsFilters(intentListingPurpose, nav.filters);

  const areasNavigationJourney = useAreasNavigationJourney({
    // Matches the established `nav.city || DEFAULT_CITY` idiom — `city`
    // (the defaulted local) isn't in scope this early pre-refactor either.
    city: nav.city || DEFAULT_CITY,
    requestedNodeKey: nav.rawNodeParam ?? null,
    onSelectNode: goToNode,
    filters: navigationCountsFilters,
    enabled: showAreasNavigationJourney,
  });

  return {
    showAreasNavigationJourney,
    areasNavigationJourney,
    hoveredNavigationNodeKey,
    setHoveredNavigationNodeKey,
    focusedClusterMemberAreaKeys,
    setFocusedClusterMemberAreaKeys,
  };
}
