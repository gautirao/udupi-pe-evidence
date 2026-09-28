/**
 * Issue #2660 (C3) — the Areas journey's HIERARCHY decisions, owned in one
 * place and testable without any listings/result-source machinery.
 *
 * Moved verbatim out of `DiscoverAreasJourneyPanel`'s body: the focused-cluster
 * derivation, the AREA-leaf `selectedAreaPoint` derivation, the #2087
 * node-eligibility clear effect, and the render-branch precedence. This hook
 * holds NO navigation state of its own — it only derives from the ONE
 * `useAreasNavigationJourney` result the caller resolved (#2142 canonical
 * node ownership is unchanged) and fires the caller's own clear command.
 *
 * T7 (characterization suite) — the eligibility-clear effect deliberately has
 * NO cluster-focus guard, and its dependency list is exactly the pre-extraction
 * one (`isNodeListingsActive`, eligibility, `node`, the clear command).
 */
import { useEffect, useMemo } from 'react';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import { deriveAreaPointFromNode } from '@/features/discover/navigation/nodeAreaPoint';
import { deriveFocusedAreaClusterSummary } from './deriveFocusedAreaClusterSummary';
import type { FocusedAreaClusterSummary } from './deriveFocusedAreaClusterSummary';
import { isNodeEligibleForBrowse } from './nodeBrowseEligibility';
import { selectAreasJourneyBranch } from './selectAreasJourneyBranch';
import type { AreasJourneyBranch } from './selectAreasJourneyBranch';

export interface UseAreasJourneyHierarchyParams {
  journey: Pick<UseAreasNavigationJourneyResult, 'isLoading' | 'isError' | 'node' | 'children'>;
  focusedClusterMemberAreaKeys: readonly string[] | null;
  isNodeListingsActive: boolean | undefined;
  clearNodeListings: (() => void) | undefined;
}

export interface AreasJourneyHierarchyDecision {
  branch: AreasJourneyBranch;
  focusedCluster: FocusedAreaClusterSummary | null;
  /** Non-null only when `journey.node` resolves to a canonical AREA leaf with bounds. */
  selectedAreaPoint: ReturnType<typeof deriveAreaPointFromNode>;
}

export function useAreasJourneyHierarchy({
  journey,
  focusedClusterMemberAreaKeys,
  isNodeListingsActive,
  clearNodeListings,
}: UseAreasJourneyHierarchyParams): AreasJourneyHierarchyDecision {
  const { node, children } = journey;

  // Issue #1956 PR 3 (AC4.12) — the focused cluster's member list + count copy,
  // looked up from the SAME node/children the map reads; never re-clustered here.
  const focusedCluster = useMemo(
    () => deriveFocusedAreaClusterSummary({ node, children }, focusedClusterMemberAreaKeys),
    [focusedClusterMemberAreaKeys, node, children],
  );

  // Issue #1956 PR-4 — pure re-derivation of the SAME node (memoised on its
  // identity, matching the page's own `nodeAreaPoint`; FIX CYCLE 2 Finding 7).
  const selectedAreaPoint = useMemo(() => deriveAreaPointFromNode(node), [node]);

  // Issue #2087 — a `nodeListings=1` URL on an ineligible node clears the flag
  // instead of rendering the bounded-browse surface (deep-link bypass guard).
  const nodeIsEligibleForBrowse = isNodeEligibleForBrowse(node);
  useEffect(() => {
    if (isNodeListingsActive && node && !nodeIsEligibleForBrowse) {
      clearNodeListings?.();
    }
  }, [isNodeListingsActive, nodeIsEligibleForBrowse, node, clearNodeListings]);

  const branch = selectAreasJourneyBranch({
    isLoading: journey.isLoading,
    isError: journey.isError,
    hasNode: node != null,
    hasFocusedCluster: focusedCluster != null,
    isNodeListingsActive,
    nodeIsEligibleForBrowse,
    hasSelectedAreaPoint: selectedAreaPoint != null,
    childrenLength: children.length,
  });

  return { branch, focusedCluster, selectedAreaPoint };
}
