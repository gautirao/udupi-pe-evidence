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
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NavigationLevelPanel } from '@/components/discover/navigation/NavigationLevelPanel';
import { HierarchyBackButton } from '@/components/discover/navigation/HierarchyBackButton';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';

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
}

export function DiscoverAreasJourneyPanel({
  journey,
  representativeAreaNamesByNodeKey,
  selectedNodeKey = null,
  hoveredNodeKey = null,
  onHoverChange,
  buildNodeHref,
}: DiscoverAreasJourneyPanelProps) {
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
