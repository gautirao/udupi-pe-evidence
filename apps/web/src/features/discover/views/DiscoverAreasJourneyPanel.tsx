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
 *
 * Issue #2660 — this file is now only the Areas journey's branch dispatcher:
 *   - hierarchy decisions: `areas-journey/hierarchy/useAreasJourneyHierarchy`
 *   - hierarchy surfaces:  `AreaClusterFocusPanel`, `AreaHierarchyLevelPanel`
 *   - AREA-leaf results:   `areas-journey/results/AreaLeafListingsSurface`
 *     (result-source adaptation: `areaLeafResultSources.ts`)
 * Its public contract is `{view, commands}` — capability groups defined in
 * `areas-journey/contracts.ts`, replacing the former 48 flat props.
 */
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAreasJourneyHierarchy } from '@/features/discover/areas-journey/hierarchy/useAreasJourneyHierarchy';
import { AreaClusterFocusPanel } from '@/features/discover/areas-journey/hierarchy/AreaClusterFocusPanel';
import { AreaHierarchyLevelPanel } from '@/features/discover/areas-journey/hierarchy/AreaHierarchyLevelPanel';
import { AreaLeafListingsSurface } from '@/features/discover/areas-journey/results/AreaLeafListingsSurface';
import type {
  DiscoverAreasJourneyPanelCommands,
  DiscoverAreasJourneyPanelView,
} from '@/features/discover/areas-journey/contracts';
import { NodeListingsSurface } from './NodeListingsSurface';

/**
 * Issue #2660 (Commit 1) — moved verbatim to
 * `areas-journey/hierarchy/deriveFocusedAreaClusterSummary.ts`. Re-exported
 * here, unchanged, so this component's own 2 existing production importers
 * (`views/SchoolsNavigationJourneyPanel.tsx`,
 * `views/mobile/MobileClusterSheet.tsx`) need zero changes.
 */
export { deriveFocusedAreaClusterSummary } from '@/features/discover/areas-journey/hierarchy/deriveFocusedAreaClusterSummary';
export type { FocusedAreaClusterSummary } from '@/features/discover/areas-journey/hierarchy/deriveFocusedAreaClusterSummary';
export type {
  DiscoverAreasJourneyPanelCommands,
  DiscoverAreasJourneyPanelView,
} from '@/features/discover/areas-journey/contracts';

export interface DiscoverAreasJourneyPanelProps {
  view: DiscoverAreasJourneyPanelView;
  commands: DiscoverAreasJourneyPanelCommands;
}

export function DiscoverAreasJourneyPanel({ view, commands }: DiscoverAreasJourneyPanelProps) {
  // Read down to individual values: `view`/`commands` (and their groups) are
  // rebuilt by the caller on every render, so nothing below may depend on a
  // group object's identity — only on the values inside it (H1).
  const {
    journey,
    isNodeListingsActive,
    selectedNodeKey = null,
    hoveredNodeKey = null,
    representativeAreaNamesByNodeKey,
  } = view.hierarchy;
  const { focusedMemberAreaKeys = null } = view.cluster;
  const cityLabel = view.city.label;
  const { selectNode, retry: retryHierarchy, hoverNode } = commands.hierarchy;
  const { buildNodeHref, browseListings, clearNodeListings } = commands.navigation;

  // Issue #2660 (C3) — every hierarchy decision (focused-cluster summary,
  // AREA-leaf point, #2087 eligibility-clear effect, branch precedence) is
  // owned by `useAreasJourneyHierarchy`, derived from the ONE journey result
  // the caller resolved. The AREA-leaf listings surface (and its provider-
  // dependent hooks) only mounts when `selectedAreaPoint` is non-null.
  const { branch, focusedCluster, selectedAreaPoint } = useAreasJourneyHierarchy({
    journey,
    focusedClusterMemberAreaKeys: focusedMemberAreaKeys,
    isNodeListingsActive,
    clearNodeListings,
  });

  if (branch === 'loading') {
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

  if (branch === 'error') {
    return (
      <div
        className="p-4 flex flex-col items-center text-center gap-2"
        data-testid="areas-journey-panel-error"
      >
        <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          We couldn't load this area of the map. Please try again.
        </p>
        <Button variant="outline" size="sm" onClick={retryHierarchy}>
          Retry
        </Button>
      </div>
    );
  }

  if (branch === 'no-node' || !journey.node) {
    // Disabled/not-yet-mounted — render nothing (the legacy panel is showing instead).
    // (The `!journey.node` re-check is redundant with `branch` at runtime —
    // `selectAreasJourneyBranch` computes 'no-node' from the exact same
    // condition — but keeps TypeScript's null-narrowing for `journey.node`
    // in every branch below, which reading `branch` alone cannot provide.)
    return null;
  }

  if (branch === 'cluster-focus' && focusedCluster) {
    return (
      <AreaClusterFocusPanel
        view={{ node: journey.node, journey, cluster: focusedCluster, cityLabel }}
        commands={{ selectNode, buildNodeHref, changeFocus: commands.cluster.changeFocus }}
      />
    );
  }

  if (branch === 'node-listings' && journey.node) {
    return (
      <NodeListingsSurface
        node={journey.node}
        buildNodeHref={buildNodeHref}
        historyAdjacencyLog={journey.historyAdjacencyLog}
        committedFilters={view.results.filters}
        onCommittedFiltersChange={commands.results.changeFilters}
        onAddSchool={commands.schools.enterPicking}
        selectNode={selectNode}
        onSelectedListingPreviewChange={commands.results.reportSelectedListingPreview}
        onClearNodeListings={clearNodeListings}
      />
    );
  }

  // Issue #1956 PR-4 — has-listings branch, ordered BEFORE the structural
  // empty branch below. A canonical AREA leaf always has
  // `journey.children.length === 0` (it is the terminal destination), which is
  // why it would otherwise fall into "areas-journey-panel-empty". AC4.7's
  // zero-LISTING state is a DIFFERENT, normal listing empty state, rendered by
  // the leaf surface (via AreaSelectedPanel), never the structural "No matches
  // with current filters" literal that belongs to Direction/Local-Destination
  // levels only.
  if (branch === 'area-leaf' && selectedAreaPoint) {
    return (
      <AreaLeafListingsSurface
        view={{
          leaf: { areaPoint: selectedAreaPoint, node: journey.node, historyAdjacencyLog: journey.historyAdjacencyLog },
          // The results/schools groups are passed through whole: the leaf reads
          // every field of both.
          results: view.results,
          schools: view.schools,
        }}
        commands={{
          // Issue #1956 PR-5 (AC5.9) — the SAME canonical selectNode (AC3.9's
          // ONE selection action) every other affordance dispatches through.
          hierarchy: { selectNode },
          navigation: { buildNodeHref, startOver: commands.navigation.startOver },
          results: commands.results,
          schools: commands.schools,
        }}
      />
    );
  }

  // 'empty-level' (no children, no resolved AreaPoint) and 'level' render the
  // SAME hierarchy surface; only the wrapper testid differs.
  return (
    <AreaHierarchyLevelPanel
      testId={branch === 'empty-level' ? 'areas-journey-panel-empty' : 'areas-journey-panel'}
      view={{
        node: journey.node,
        journey,
        selectedNodeKey,
        hoveredNodeKey,
        representativeAreaNamesByNodeKey,
        cityLabel,
      }}
      commands={{ selectNode, buildNodeHref, hoverNode, browseListings }}
    />
  );
}
