/**
 * Issue #2660 (C3) — the visual-AREA-cluster focus branch of the Areas
 * journey, moved verbatim (JSX, copy, testids, order) out of
 * `DiscoverAreasJourneyPanel`. Presentation only: cluster focus never writes
 * `node=`/breadcrumb/`historyAdjacencyLog` (AC4.5 item 4) — selecting a member
 * dispatches through the ONE canonical `selectNode`, and "Show all" calls the
 * caller's `changeFocus(null)` (a `{replace:true}` URL write per #2088 BR6).
 */
import { Button } from '@/components/ui/button';
import { HierarchyBackButton } from '@/components/discover/navigation/HierarchyBackButton';
import { formatListingCount } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { FocusedAreaClusterSummary } from './deriveFocusedAreaClusterSummary';

export interface AreaClusterFocusPanelProps {
  view: {
    /** The resolved canonical node the focused cluster belongs to. */
    node: NavigationNodeResponse;
    /** The canonical journey state this focus is a presentation subset of. */
    journey: Pick<UseAreasNavigationJourneyResult, 'nodeCount' | 'children' | 'historyAdjacencyLog'>;
    /** The focused cluster's member subset + count copy (see `deriveFocusedAreaClusterSummary`). */
    cluster: FocusedAreaClusterSummary;
    cityLabel?: string;
  };
  commands: {
    selectNode: UseAreasNavigationJourneyResult['selectNode'];
    buildNodeHref: (nodeKey: string) => string | null;
    /** The caller's cluster-focus writer; `null` clears focus. */
    changeFocus?: (memberAreaKeys: readonly string[] | null) => void;
  };
}

export function AreaClusterFocusPanel({ view, commands }: AreaClusterFocusPanelProps) {
  const { node, journey, cluster: focusedCluster, cityLabel } = view;
  // Issue #2083 RC_D — region heading + listing-count subtitle from the SAME
  // `journey.nodeCount` NavigationLevelPanel reads, so the two can never disagree.
  const clusterHeadingListingsLabel =
    journey.nodeCount != null ? formatListingCount(journey.nodeCount.listingCount) : null;
  return (
    <div className="p-4" data-testid="areas-cluster-focus-panel">
      <HierarchyBackButton
        node={node}
        buildHref={commands.buildNodeHref}
        cityLabel={cityLabel ?? 'the city'}
        historyAdjacencyLog={journey.historyAdjacencyLog}
        className="mb-3"
      />
      <div className="mb-3" data-testid="areas-cluster-focus-heading">
        <h2 className="text-base font-semibold text-foreground">{node.displayLabel}</h2>
        {clusterHeadingListingsLabel != null && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="areas-cluster-focus-heading-listings"
          >
            {clusterHeadingListingsLabel}
          </p>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-3" data-testid="areas-cluster-focus-summary">
        {focusedCluster.countLabel}
      </p>
      {/* Issue #2088 (AC4) — the member subset is a SPATIAL/zoom-driven subset
          of `journey.children`'s complete, uncapped set (the same count "Show
          all" restores), never a filtered result set of its own. */}
      <p className="text-xs text-muted-foreground mb-3" data-testid="areas-cluster-focus-subset-note">
        {focusedCluster.members.length} area{focusedCluster.members.length === 1 ? '' : 's'} in this map view
      </p>
      <ul className="space-y-2">
        {focusedCluster.members.map((member) => (
          <li key={member.nodeKey}>
            <button
              type="button"
              data-testid={`areas-cluster-focus-member-${member.nodeKey}`}
              data-node-key={member.nodeKey}
              className="w-full text-left rounded-lg border bg-card p-3 shadow-sm hover:border-primary/60"
              onClick={() => commands.selectNode(member.nodeKey)}
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
        // Issue #2088 (BR6) — a clear is a `{replace:true}` URL write in the
        // caller, never a hierarchy navigation.
        onClick={() => commands.changeFocus?.(null)}
      >
        Show all {journey.children.length} area{journey.children.length === 1 ? '' : 's'}
      </Button>
    </div>
  );
}
