/**
 * DiscoverAreasJourneyPanel — Issue #1956 PR 2 (Slice 3, AC3.1-AC3.10).
 *
 * Hosts the canonical Areas hierarchy right-panel surface: the city-root
 * Direction surface and, once a Direction/Local Destination is selected, the
 * level below it. This component owns NONE of the navigation state itself —
 * it receives the ONE `useAreasNavigationJourney` result its caller resolved,
 * so the map (which reads the same hook instance) and this panel can never
 * diverge on node identity or counts (AC3.4/AC3.9/T3).
 *
 * Covers all four required UI states: loading (skeleton), error (message +
 * retry), empty (no children at this level — a real, designed state, not an
 * error), and success (`NavigationLevelPanel`).
 *
 * Invariant 8 — this panel renders NO result-scope controls (Edit areas /
 * Clear selected areas / Add nearby areas / Draw search area / Search this
 * area / Create alert); those belong to #2016/#2017/#2019.
 */
import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NavigationLevelPanel } from '@/components/discover/navigation/NavigationLevelPanel';
import { HierarchyBackButton } from '@/components/discover/navigation/HierarchyBackButton';
import { formatListingCount } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import { presentClusterRepresentatives } from '@/features/discover/navigation/representativeNames';
import type { ClusterableAreaMember } from '@/features/discover/navigation/areaClustering';
import { isMemberEligible } from '@/features/discover/navigation/journeyVisibility';

/**
 * One visual AREA cluster's member set, as focused by a map cluster-marker
 * click (Issue #1956 PR 3, Slice 4). `members` and `countLabel` are derived
 * HERE, below, from the SAME `journey.node.children`/`journey.children` the
 * map's `AreaDestinationMarkerLayer` reads and the SAME
 * `presentClusterRepresentatives` function it calls internally — filtered to
 * exactly the `focusedClusterMemberAreaKeys` the map's own visual clustering
 * (pan/zoom-dependent pixel grouping) reported back, so map and panel can
 * never disagree on the visible set or the total (AC4.12).
 */
export interface FocusedAreaClusterSummary {
  members: ReadonlyArray<{
    nodeKey: string;
    areaKey: string;
    displayLabel: string;
    listingCount: number;
  }>;
  /** The exact "+N areas with matches" / "N areas with matches" copy the map cluster marker shows. */
  countLabel: string;
}

export interface DiscoverAreasJourneyPanelProps {
  journey: UseAreasNavigationJourneyResult;
  representativeAreaNamesByNodeKey?: ReadonlyMap<string, string[]>;
  selectedNodeKey?: string | null;
  hoveredNodeKey?: string | null;
  onHoverChange?: (nodeKey: string | null) => void;
  /**
   * Issue #1956 PR 2 (Slice 5) — the pure href builder for the visible
   * in-app hierarchy Back control (`urlActions.buildNodeHref`, unchanged).
   * See `HierarchyBackButton`'s module doc for why this control resolves the
   * server-declared canonical parent rather than browser history.
   */
  buildNodeHref: (nodeKey: string) => string | null;
  /**
   * Issue #1956 PR 3 (bounded state-lift, AC4.12/AC4.5) — the ONE focused
   * visual-AREA-cluster identity the caller (MapDiscovery) owns alongside
   * `hoveredNavigationNodeKey`, mirrored unchanged from
   * `AreaMarkerLayer`'s/`AreaDestinationMarkerLayer`'s own
   * `focusedClusterMemberAreaKeys`/`onClusterFocusChange` prop pair. When
   * non-null, a visual AREA cluster is currently focused (a map cluster
   * marker was clicked) — this panel renders ONLY that cluster's member
   * subset (derived below via `presentClusterRepresentatives`), with its own
   * distinct testid (`areas-cluster-focus-panel`, NEVER
   * `navigation-level-panel`) plus a "Show all areas" control that clears
   * focus by calling `onClusterFocusChange(null)`. `node=`/breadcrumb/
   * `historyAdjacencyLog` are completely untouched by this — focus is
   * presentation-only (AC4.5 item 4).
   */
  focusedClusterMemberAreaKeys?: readonly string[] | null;
  /** Fired to clear focus (`null`) or, for parity with the map's own callback shape, report a new member set. A caller that owns this state feeds it straight back into `focusedClusterMemberAreaKeys` to keep the map and panel in lock-step. */
  onClusterFocusChange?: (memberAreaKeys: readonly string[] | null) => void;
}

export function DiscoverAreasJourneyPanel({
  journey,
  representativeAreaNamesByNodeKey,
  selectedNodeKey = null,
  hoveredNodeKey = null,
  onHoverChange,
  buildNodeHref,
  focusedClusterMemberAreaKeys = null,
  onClusterFocusChange,
}: DiscoverAreasJourneyPanelProps) {
  // Issue #1956 PR 3 (bounded state-lift, AC4.12) — derive the focused
  // cluster's member list + count copy from the SAME `journey.node.children`
  // (raw, carries `areaKey`)/`journey.children` (enriched, carries
  // `displayLabel`/`listingCount`/`schoolCount`/`displayOrder`) the map reads,
  // filtered to exactly the areaKeys `focusedClusterMemberAreaKeys` names —
  // never re-clustered here (clustering is pan/zoom-dependent pixel geometry
  // the map alone computes; this only looks up display data for the members
  // the map already chose). `presentClusterRepresentatives` is the SAME pure
  // function `AreaMarkerLayer` calls internally for its own cluster-marker
  // count copy, so the "N areas with matches" text can never drift between
  // map and panel (AC4.12). This panel only ever mounts for the area-first
  // journey (see `DiscoverRightPanelContainer`'s `showAreasNavigationJourney`
  // gate), so the eligibility dimension is always 'areas', never 'schools'.
  const focusedCluster = useMemo((): FocusedAreaClusterSummary | null => {
    if (!focusedClusterMemberAreaKeys || focusedClusterMemberAreaKeys.length === 0) return null;
    const rawByNodeKey = new Map((journey.node?.children ?? []).map((c) => [c.nodeKey, c] as const));
    const wanted = new Set(focusedClusterMemberAreaKeys);
    const clusterable: ClusterableAreaMember[] = [];
    for (const child of journey.children) {
      const raw = rawByNodeKey.get(child.nodeKey);
      // Minor fix-up (review) — the backend guarantees a non-null areaKey for
      // AREA children; a child missing one is SKIPPED rather than borrowing
      // its nodeKey as a stand-in areaKey (mirrors the coordinate fail-safe
      // in areaClustering.ts's isUsableCentroid — never fabricate identity).
      if (raw?.areaKey == null || !wanted.has(raw.areaKey)) continue;
      clusterable.push({
        nodeKey: child.nodeKey,
        areaKey: raw.areaKey,
        displayLabel: child.displayLabel,
        lat: raw.centreLat ?? Number.NaN,
        lon: raw.centreLon ?? Number.NaN,
        listingCount: child.listingCount,
        displayOrder: child.displayOrder,
        schoolCount: child.schoolCount,
      });
    }
    if (clusterable.length === 0) return null;
    // REQUIRED CHANGE 1 (AC4.12) — partition through the SAME journey-aware
    // eligibility predicate the map's clusterVisibleAreaMembers
    // (areaClustering.ts) applies BEFORE clustering, so a focused member that
    // has dropped to zero-content (e.g. a filter tightened) is excluded from
    // this panel exactly as it is excluded from the map's cluster. Falls back
    // to the normal level panel (returns null) when nothing eligible
    // survives — this panel only ever mounts for the areas journey (see
    // module doc), so the eligibility dimension is always 'areas'.
    const eligible = clusterable.filter((m) =>
      isMemberEligible(
        {
          areaKey: m.areaKey,
          displayLabel: m.displayLabel,
          eligibleListingCount: m.listingCount,
          eligibleSchoolCount: m.schoolCount ?? 0,
          displayOrder: m.displayOrder,
        },
        'areas',
      ),
    );
    if (eligible.length === 0) return null;
    // REQUIRED CHANGE 2 — pass the panel's REAL (post-eligibility) displayed
    // count as the limit so `presentClusterRepresentatives` never advertises
    // a hidden "+N" for rows that are ALL already on screen here. The map
    // marker (AreaMarkerLayer.tsx) keeps calling this with the default
    // MAX_REPRESENTATIVE_NAMES cap — unaffected by this change.
    const { countResult } = presentClusterRepresentatives(eligible, 'areas', eligible.length);
    return {
      members: eligible.map((m) => ({
        nodeKey: m.nodeKey,
        areaKey: m.areaKey,
        displayLabel: m.displayLabel,
        listingCount: m.listingCount,
      })),
      countLabel: countResult.label,
    };
  }, [focusedClusterMemberAreaKeys, journey.node, journey.children]);
  if (journey.isLoading) {
    return (
      <div className="p-4 space-y-3" data-testid="areas-journey-panel-loading">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (journey.isError) {
    return (
      <div
        className="p-4 flex flex-col items-center text-center gap-2"
        data-testid="areas-journey-panel-error"
      >
        <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          We couldn't load this area of the map. Please try again.
        </p>
        <Button variant="outline" size="sm" onClick={journey.refetch}>
          Retry
        </Button>
      </div>
    );
  }

  if (!journey.node) {
    // Disabled/not-yet-mounted — render nothing (the legacy panel is showing instead).
    return null;
  }

  if (focusedCluster) {
    return (
      <div className="p-4" data-testid="areas-cluster-focus-panel">
        <HierarchyBackButton
          node={journey.node}
          buildHref={buildNodeHref}
          historyAdjacencyLog={journey.historyAdjacencyLog}
          className="mb-3"
        />
        <p className="text-sm text-muted-foreground mb-3" data-testid="areas-cluster-focus-summary">
          {focusedCluster.countLabel}
        </p>
        <ul className="space-y-2">
          {focusedCluster.members.map((member) => (
            <li key={member.nodeKey}>
              <button
                type="button"
                data-testid={`areas-cluster-focus-member-${member.nodeKey}`}
                data-node-key={member.nodeKey}
                className="w-full text-left rounded-lg border bg-card p-3 shadow-sm hover:border-primary/60"
                onClick={() => journey.selectNode(member.nodeKey)}
              >
                <span className="font-medium text-sm text-foreground">{member.displayLabel}</span>
                <span className="block text-xs text-muted-foreground mt-1">
                  {formatListingCount(member.listingCount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          data-testid="areas-cluster-focus-clear"
          onClick={() => onClusterFocusChange?.(null)}
        >
          Show all areas
        </Button>
      </div>
    );
  }

  if (journey.children.length === 0) {
    return (
      <div className="p-4" data-testid="areas-journey-panel-empty">
        <HierarchyBackButton
          node={journey.node}
          buildHref={buildNodeHref}
          historyAdjacencyLog={journey.historyAdjacencyLog}
          className="mb-3"
        />
        <NavigationLevelPanel
          journey={journey}
          representativeAreaNamesByNodeKey={representativeAreaNamesByNodeKey}
          selectedNodeKey={selectedNodeKey}
          hoveredNodeKey={hoveredNodeKey}
          onHoverChange={onHoverChange}
        />
      </div>
    );
  }

  return (
    <div className="p-4" data-testid="areas-journey-panel">
      <HierarchyBackButton
        node={journey.node}
        buildHref={buildNodeHref}
        historyAdjacencyLog={journey.historyAdjacencyLog}
        className="mb-3"
      />
      <NavigationLevelPanel
        journey={journey}
        representativeAreaNamesByNodeKey={representativeAreaNamesByNodeKey}
        selectedNodeKey={selectedNodeKey}
        hoveredNodeKey={hoveredNodeKey}
        onHoverChange={onHoverChange}
      />
    </div>
  );
}
