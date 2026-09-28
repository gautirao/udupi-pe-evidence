/**
 * Issue #2660 (C3) — the Areas journey's hierarchy LEVEL surface (Back control
 * + the current node's children), moved verbatim out of
 * `DiscoverAreasJourneyPanel`, where it was rendered twice with identical
 * bodies differing only in the wrapper testid: `areas-journey-panel-empty`
 * (a Direction/Local Destination with no children, or a node still resolving)
 * and `areas-journey-panel` (a level with children). Which of the two applies
 * is `selectAreasJourneyBranch`'s decision, not this component's.
 */
import { HierarchyBackButton } from '@/components/discover/navigation/HierarchyBackButton';
import { NavigationLevelPanel } from '@/components/discover/navigation/NavigationLevelPanel';
import type { NavigationLevelPanelProps } from '@/components/discover/navigation/NavigationLevelPanel';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

export interface AreaHierarchyLevelPanelProps {
  testId: 'areas-journey-panel-empty' | 'areas-journey-panel';
  view: {
    /** The resolved canonical node this level shows the children of. */
    node: NavigationNodeResponse;
    journey: Pick<
      UseAreasNavigationJourneyResult,
      'levelKind' | 'children' | 'resolutionNotice' | 'nodeCount' | 'historyAdjacencyLog'
    >;
    selectedNodeKey?: NavigationLevelPanelProps['selectedNodeKey'];
    hoveredNodeKey?: NavigationLevelPanelProps['hoveredNodeKey'];
    representativeAreaNamesByNodeKey?: NavigationLevelPanelProps['representativeAreaNamesByNodeKey'];
    cityLabel?: string;
  };
  commands: {
    selectNode: UseAreasNavigationJourneyResult['selectNode'];
    buildNodeHref: (nodeKey: string) => string | null;
    hoverNode?: NavigationLevelPanelProps['onHoverChange'];
    browseListings?: NavigationLevelPanelProps['onBrowseListings'];
  };
}

export function AreaHierarchyLevelPanel({ testId, view, commands }: AreaHierarchyLevelPanelProps) {
  const { node, journey, cityLabel } = view;
  return (
    <div className="p-4" data-testid={testId}>
      <HierarchyBackButton
        node={node}
        buildHref={commands.buildNodeHref}
        cityLabel={cityLabel ?? 'the city'}
        historyAdjacencyLog={journey.historyAdjacencyLog}
        className="mb-3"
      />
      <NavigationLevelPanel
        journey={{
          node,
          levelKind: journey.levelKind,
          children: journey.children,
          resolutionNotice: journey.resolutionNotice,
          nodeCount: journey.nodeCount,
          selectNode: commands.selectNode,
        }}
        representativeAreaNamesByNodeKey={view.representativeAreaNamesByNodeKey}
        selectedNodeKey={view.selectedNodeKey}
        hoveredNodeKey={view.hoveredNodeKey}
        onHoverChange={commands.hoverNode}
        cityLabel={cityLabel}
        onBrowseListings={commands.browseListings}
      />
    </div>
  );
}
