import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { deriveAreaPointFromNode } from '@/features/discover/navigation/nodeAreaPoint';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
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
  /**
   * Issue #1943 (singleton auto-advance, PR #2368 owner ruling 2026-08-28) —
   * actions.goToNodeReplacingCurrent from useDiscoverActions(). Reserved for
   * the automatic hierarchy transition; never for a user-initiated click.
   */
  goToNodeReplacingCurrent: (nodeKey: string) => void;
  /** Issue #2083 RC_C — nav.intent mapped to backend listingPurpose; computed by the caller (page-global, not navigation-specific). */
  intentListingPurpose: string;
}

export interface UseDiscoverNavigationControllerResult {
  showAreasNavigationJourney: boolean;
  /**
   * Issue #2142 SOLID follow-up (commit 2) — the panel surface used to
   * recompute this from `useDiscoverNav()` itself. It is NOT the same
   * predicate as `showAreasNavigationJourney` above (which also covers the
   * school-first node level, because BOTH journeys need the canonical
   * hierarchy fetched) — it is the narrower "the canonical AREA-first panel
   * is the one to mount" gate, and the two must stay distinct.
   */
  isAreaFirstJourneyActive: boolean;
  /** Issue #2142 SOLID follow-up (commit 2) — likewise recomputed by the panel surface until now. */
  isSchoolsNavNodeLevel: boolean;
  areasNavigationJourney: UseAreasNavigationJourneyResult;
  /**
   * Issue #1943 (singleton auto-advance) — REPLACE-mode counterpart to
   * `areasNavigationJourney.selectNode`, passed through unchanged for the
   * same reason `selectNode` is (AC3.9-style identity guarantee). Never
   * wired to a click affordance — only to the automatic transition.
   */
  autoAdvanceSelectNode: (nodeKey: string) => void;
  hoveredNavigationNodeKey: string | null;
  setHoveredNavigationNodeKey: Dispatch<SetStateAction<string | null>>;
  focusedClusterMemberAreaKeys: readonly string[] | null;
  setFocusedClusterMemberAreaKeys: (keys: readonly string[] | null) => void;
  /** Issue #1956 PR-4 (Option C) — the resolved canonical AREA leaf as an in-memory AreaPoint. */
  nodeAreaPoint: AreaPoint | null;
  /** Issue #1956 PR-4 — the ONE leaf-identity boolean; see the derivation comment for the R1 lock-step rule. */
  isNodeAreaLeafActive: boolean;
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
  goToNodeReplacingCurrent,
  intentListingPurpose,
}: UseDiscoverNavigationControllerParams): UseDiscoverNavigationControllerResult {
  // Issue #1956 PR 2 (Slice 3) — this is one of THREE identical gate sites
  // (this file, DiscoverRightPanelContainer.tsx, DiscoverMapCanvas.tsx) —
  // see DiscoverMapCanvas.tsx's own copy of this comment for why the
  // triplication is deliberate.
  const isSchoolsNavNodeLevel = nav.journey === 'school-first' && !nav.areaKey && !nav.schoolId;
  // Issue #2203 follow-up — symmetric agri-first counterpart to
  // `isSchoolsNavNodeLevel` above. Agri-first's geography-dependent leaf is
  // `selectedLocality` (the destKey-based locality selection, not
  // `areaKey`/`schoolId`) — see agricultural.ts's `PARAM_DEST_KEY`. Same
  // rationale: once a canonical AREA is picked via `goToNode` (now
  // `goToNodeAndClearAgriculturalLocality`, which never touches `journey`),
  // this stays true so the canonical hierarchy fetch (and `nodeAreaPoint`
  // derivation below) keeps running for agri-first too — it must NOT widen
  // `isNodeAreaLeafActive`, which stays hardcoded to `journey ===
  // 'area-first'` per the owner ruling on #2203.
  //
  // Review follow-up (PR #2211) — this flag also feeds `showAreasNavigationJourney`
  // below, which in turn is the `showAreasNavigationJourney` param
  // `useDiscoverCameraController` uses to gate `isSelectedNodeOutOfView`/the
  // "Recenter on <label>" affordance (same as `isSchoolsNavNodeLevel` already
  // did for school-first before this PR). So agri-first at the node level can
  // now trigger Recenter too — this is intentional, symmetric completion, not
  // a side effect limited to `nodeAreaPoint`/the hierarchy fetch.
  const isAgriNavNodeLevel = nav.journey === 'agri-first' && !nav.selectedLocality;
  // Issue #2142 SOLID follow-up (commit 2) — moved verbatim from
  // DiscoverPanelSurface.tsx, which derived the identical expression off its
  // own `useDiscoverNav()` read. Same input, same value; the surface now
  // consumes it through the panel model instead of re-deriving it.
  const isAreaFirstJourneyActive = nav.journey === 'area-first';
  const showAreasNavigationJourney = isAreaFirstJourneyActive || isSchoolsNavNodeLevel || isAgriNavNodeLevel;

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

  // Issue #1956 PR-4 (Option C) — pure bridge: the resolved canonical AREA
  // leaf -> an in-memory AreaPoint, feeding the EXISTING selectedArea-driven
  // listing/marker/popover machinery (see nodeAreaPoint.ts's module doc for
  // the full transitional-state contract). Only ever non-null while the
  // canonical Areas journey is active AND resolved to an AREA leaf — every
  // legacy areaKey-driven journey sees `null` here, unchanged.
  const nodeAreaPoint = useMemo(
    () => (showAreasNavigationJourney ? deriveAreaPointFromNode(areasNavigationJourney.node) : null),
    [showAreasNavigationJourney, areasNavigationJourney.node],
  );

  // Issue #1956 PR-4 — the ONE leaf-identity boolean shared by the
  // layer-registry containment field, the widened isMarkerPopoverEligible
  // render gate, and useMarkerSelection's capture gate/URL-write gate
  // (risk R1 — these MUST move in lock-step).
  //
  // FIX CYCLE 2 (opus review, blocking Finding 1) — this MUST derive from
  // `nodeAreaPoint != null`, not from `isResolvedAreaLeafNode` alone.
  // `isResolvedAreaLeafNode` only checks `nodeType === 'AREA' && areaKey !=
  // null`; it says nothing about `bounds`, which is independently nullable
  // (`NavigationBounds | null`, navigation/types.ts) and whose
  // centreLat/centreLon are themselves independently nullable. A resolved
  // AREA leaf with `bounds: null` (or a bounds object with a null centre)
  // satisfied the old `isResolvedAreaLeafNode` check while `nodeAreaPoint`
  // (nodeAreaPoint.ts, transitional states (c)/(d)) was already null for it
  // — so this boolean and the bridge disagreed, admitting the marker
  // popover and the 'all-areas' layer category with NO area context to back
  // them.
  //
  // Deliberate choice for the bounds-less leaf: it stays a NON-LEAF for
  // every purpose this boolean gates (popover eligibility, layer category,
  // URL-write gate) rather than rendering a partial/degraded listing
  // surface. Rationale: `nodeAreaPoint.ts` already treats a bounds-less
  // resolved AREA leaf as "no safe AreaPoint" (its own module doc, (c)/(d))
  // because `AreaPoint.geo_center_lat/lon` are non-nullable — there is no
  // safe centre to fit the map to or scope a listings query with. Treating
  // it as a leaf here would admit `effectiveMapLayerCategory ===
  // 'all-areas'` and a `listing=` URL write while every downstream
  // consumer that actually NEEDS geo data (fitBounds, area-scoped
  // listings) still has nothing to work with — worse than the current
  // "falls back to area-group-bubbles" state, which is at least a coherent,
  // navigable UI. `nodeAreaPoint != null` already implies
  // `isResolvedAreaLeafNode` (it calls that predicate internally), so this
  // is strictly narrower and requires no new import.
  const isNodeAreaLeafActive =
    showAreasNavigationJourney && nav.journey === 'area-first' && nodeAreaPoint != null;

  return {
    showAreasNavigationJourney,
    isAreaFirstJourneyActive,
    isSchoolsNavNodeLevel,
    areasNavigationJourney,
    autoAdvanceSelectNode: goToNodeReplacingCurrent,
    hoveredNavigationNodeKey,
    setHoveredNavigationNodeKey,
    focusedClusterMemberAreaKeys,
    setFocusedClusterMemberAreaKeys,
    nodeAreaPoint,
    isNodeAreaLeafActive,
  };
}
