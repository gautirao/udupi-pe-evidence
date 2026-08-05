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
import { ROOT_NODE_KEY } from '@/features/discover/navigation/types';

export interface NavigationLevelPanelProps {
  journey: Pick<
    UseAreasNavigationJourneyResult,
    'node' | 'levelKind' | 'children' | 'resolutionNotice' | 'nodeCount' | 'selectNode'
  >;
  representativeAreaNamesByNodeKey?: ReadonlyMap<string, string[]>;
  selectedNodeKey?: string | null;
  hoveredNodeKey?: string | null;
  onHoverChange?: (nodeKey: string | null) => void;
  /**
   * Issue #2084 (AC6) — display name of the current city, used ONLY for the
   * city-ROOT eyebrow ("DISCOVER {cityLabel}"). Optional so every existing
   * caller/test that never resolves the literal city root (the vast
   * majority — Direction/Local-Destination/Area headings are unaffected by
   * this prop) keeps compiling and rendering unchanged. Falls back to a
   * generic "this city" only for the rare case a root-node caller omits it.
   */
  cityLabel?: string;
}

export function NavigationLevelPanel({
  journey,
  representativeAreaNamesByNodeKey,
  selectedNodeKey = null,
  hoveredNodeKey = null,
  onHoverChange,
  cityLabel,
}: NavigationLevelPanelProps) {
  const { node, levelKind, children, resolutionNotice, nodeCount, selectNode } = journey;

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

  // Issue #2084 (AC6) — the synthetic city ROOT is the ONE node whose heading
  // leads with the mock's invitational pattern (eyebrow + question) instead
  // of the node-scoped name/count heading every other level keeps. City-wide
  // counts are NOT repeated here — they already live in the persistent
  // JourneySwitcher's metrics strip (CQ3), one owner, not two.
  const isCityRoot = node.nodeKey === ROOT_NODE_KEY;

  // Issue #2084 (AC7) — a section eyebrow + count restored above the child
  // list, at every level this component renders (city-root, Direction,
  // Local-Destination). Counts `children.length` — the SAME bounded list
  // rendered below, never `discoverAreas.length`/`cityTotal` (AC10) — so the
  // label can never disagree with what is actually on screen.
  const sectionLabel =
    children.length === 0
      ? null
      : levelKind === 'directions'
        ? 'Directions'
        : levelKind === 'clusters'
          ? `Local destinations in ${node.displayLabel}`
          : levelKind === 'areas'
            ? `Areas in ${node.displayLabel}`
            : null;

  return (
    <div data-testid="navigation-level-panel" data-node-key={node.nodeKey}>
      <NavigationResolutionNotice notice={resolutionNotice} />
      <div className="mb-3" data-testid="navigation-level-heading">
        {isCityRoot ? (
          <>
            <p
              className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground"
              data-testid="navigation-level-root-eyebrow"
            >
              Discover {cityLabel ?? 'this city'}
            </p>
            <h2
              className="mt-1 font-['Fraunces',_ui-serif,_Georgia,_serif] text-xl font-semibold text-foreground"
              data-testid="navigation-level-root-heading"
            >
              Where do you want to explore?
            </h2>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
      {sectionLabel != null && (
        <div
          className="mb-2 flex items-center justify-between border-b border-border pb-2"
          data-testid="navigation-level-section-label"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {sectionLabel}
          </span>
          <span
            className="text-[11px] font-medium text-muted-foreground"
            data-testid="navigation-level-section-count"
          >
            {children.length}
          </span>
        </div>
      )}
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
