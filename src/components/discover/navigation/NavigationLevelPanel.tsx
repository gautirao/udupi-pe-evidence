/**
 * NavigationLevelPanel — Issue #1956 PR 2 (Slice 3).
 *
 * The level dispatcher: renders the CURRENT resolved node's heading (AC3.4 —
 * names the direction/destination explicitly and carries the SAME `node_key`
 * + counts the map uses, because both consume the ONE `node`/`nodeCount`
 * object `useAreasNavigationJourney` returned) plus its bounded destination
 * surface. This is deliberately NOT a generic infinite-cluster picker: the
 * Direction surface is capped at 5, the Local Destination surface at 6 (both
 * enforced upstream by the hook, per AC3.5) and an AREA-level "surface" is a
 * plain child list with no structural count line.
 *
 * Dispatch is on `levelKind` (from `nodeLevelKind`, never on `node.depth`),
 * mirroring the rest of this navigation module's discipline.
 */
import { NavigationChildList } from './NavigationChildList';
import { NavigationResolutionNotice } from './NavigationResolutionNotice';
import {
  presentStructuralLevel,
  NO_MATCHES_WITH_CURRENT_FILTERS,
  type StructuralLevelIdentity,
} from '@/features/discover/navigation/journeyVisibility';
import {
  formatListingCount,
  type UseAreasNavigationJourneyResult,
} from '@/features/discover/navigation/useAreasNavigationJourney';

export interface NavigationLevelPanelProps {
  journey: Pick<
    UseAreasNavigationJourneyResult,
    'node' | 'levelKind' | 'children' | 'resolutionNotice' | 'nodeCount' | 'selectNode'
  >;
  representativeAreaNamesByNodeKey?: ReadonlyMap<string, string[]>;
  selectedNodeKey?: string | null;
  hoveredNodeKey?: string | null;
  onHoverChange?: (nodeKey: string | null) => void;
}

export function NavigationLevelPanel({
  journey,
  representativeAreaNamesByNodeKey,
  selectedNodeKey = null,
  hoveredNodeKey = null,
  onHoverChange,
}: NavigationLevelPanelProps) {
  const { node, children, resolutionNotice, nodeCount, selectNode } = journey;

  if (!node) {
    return null;
  }

  // BLOCKING FIX (count_display_defect_2026_07_29): this heading independently
  // reproduced the same defect as NavigationChildCard/AreaMarkerLayer — it was
  // captioning `nodeCount.listingCount` (a LISTING total) as "areas with
  // matches". `nodeCount.matchingAreaCount` is the real, honestly-derived count
  // (see its computation in useAreasNavigationJourney.ts, which reuses the same
  // `readDestinationCounts`/`listingEligibilityAccessor` visibility predicate
  // the map/panel destination-count machinery already shares) and is `null`
  // when that predicate genuinely cannot be applied (the synthetic city ROOT,
  // whose `descendantAreaKeys` the server omits by design) — the count line is
  // omitted in that case rather than showing a mislabeled or invented number.
  const identity: StructuralLevelIdentity = {
    nodeKey: node.nodeKey,
    nodeType: node.nodeType,
    displayLabel: node.displayLabel,
    parentNodeKey: node.ancestry.length > 0 ? node.ancestry[node.ancestry.length - 1].nodeKey : null,
    displayOrder: 0,
  };
  const headingPresentation =
    nodeCount == null || nodeCount.matchingAreaCount == null
      ? null
      : presentStructuralLevel(identity, nodeCount.matchingAreaCount);
  const headingAreasLabel = headingPresentation?.countLabel ?? null;
  // count_display_defect_2026_07_29 (pass 4 follow-up): this heading
  // reproduced the SAME wholesale-suppression defect as NavigationChildCard —
  // the areas-with-matches line being unavailable (matchingAreaCount null,
  // e.g. the synthetic city root) must never suppress the journey-aware
  // listing count too. Mirrors NavigationChildCard's areasLabel/listingsLabel
  // split exactly: both lines render when derivable, only the listing line
  // renders when the areas count is not, and the locked zero literal renders
  // alone (no separate "0 listings" line) when the areas count is exactly 0.
  const headingShowListingsLine = nodeCount != null && !headingPresentation?.isZeroContent;
  const headingListingsLabel = headingShowListingsLine ? formatListingCount(nodeCount.listingCount) : null;

  return (
    <div data-testid="navigation-level-panel" data-node-key={node.nodeKey}>
      <NavigationResolutionNotice notice={resolutionNotice} />
      <div className="mb-3" data-testid="navigation-level-heading">
        {/* AC3.4 — explicitly names the direction/destination; same node_key + counts as the map. */}
        <h2 className="text-base font-semibold text-foreground">{node.displayLabel}</h2>
        {headingAreasLabel != null && (
          <p className="text-sm text-muted-foreground" data-testid="navigation-level-heading-count">
            {headingAreasLabel}
          </p>
        )}
        {headingListingsLabel != null && (
          <p className="text-sm text-muted-foreground" data-testid="navigation-level-heading-listings">
            {headingListingsLabel}
          </p>
        )}
      </div>
      {children.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="navigation-level-empty">
          {NO_MATCHES_WITH_CURRENT_FILTERS}
        </p>
      ) : (
        <NavigationChildList
          children={children}
          representativeAreaNamesByNodeKey={representativeAreaNamesByNodeKey}
          selectedNodeKey={selectedNodeKey}
          hoveredNodeKey={hoveredNodeKey}
          onSelect={selectNode}
          onHoverChange={onHoverChange}
        />
      )}
    </div>
  );
}
