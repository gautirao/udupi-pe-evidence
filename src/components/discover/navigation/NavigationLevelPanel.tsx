/**
 * NavigationLevelPanel — Issue #1956 PR 2 (Slice 3).
 *
 * The level dispatcher: renders the CURRENT resolved node's heading (AC3.4 —
 * names the direction/destination explicitly and carries the SAME `node_key`
 * + counts the map uses, because both consume the ONE `node`/`nodeCount`
 * object `useAreasNavigationJourney` returned) plus its destination surface.
 * Issue #2086 removed the former 5/6 client-side truncation caps — the
 * surface now renders every server-guaranteed-bounded (<=15) child, sorted by
 * `displayOrder`, with a CSS-only scroll constraint (see the child-list
 * container below) standing in for the old caps.
 *
 * Dispatch is on `levelKind` (from `nodeLevelKind`, never on `node.depth`),
 * mirroring the rest of this navigation module's discipline.
 */
import { ArrowRight } from 'lucide-react';
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
  onBrowseListings?: () => void;
}

export function NavigationLevelPanel({
  journey,
  representativeAreaNamesByNodeKey,
  selectedNodeKey = null,
  hoveredNodeKey = null,
  onHoverChange,
  cityLabel,
  onBrowseListings,
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
  const isCityRoot = node.nodeKey === ROOT_NODE_KEY;

  // Issue #2087 — bounded local-scope Browse listings CTA. Use canonical descendant scope.
  const descendantAreaCount = node.descendantAreaKeys?.length ?? 0;
  const isEligibleForBrowse = !isCityRoot && descendantAreaCount > 0 && descendantAreaCount <= 15;

  // Issue #2084 (AC7)
  const sectionLabel =
    children.length === 0
      ? null
      : levelKind === 'directions'
        ? `Explore ${cityLabel ?? 'this city'}`
        : levelKind === 'clusters'
          ? `Local destinations in ${node.displayLabel}`
          : levelKind === 'areas'
            ? `Areas in ${node.displayLabel}`
            : null;
            
  const eyebrowText = levelKind === 'clusters' ? 'Local Destination' : levelKind === 'directions' ? 'Direction' : 'Areas';

  return (
    <div data-testid="navigation-level-panel" data-node-key={node.nodeKey} className="flex flex-col">
      <NavigationResolutionNotice notice={resolutionNotice} />
      
      <div className="mb-4" data-testid="navigation-level-heading">
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
          <div>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-primary">
                  {eyebrowText}
                </div>
                <h2 className="mt-1 font-['Fraunces',_ui-serif,_Georgia,_serif] text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
                  {node.displayLabel}
                </h2>
              </div>
              
              {nodeCount != null && (
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[22px] font-semibold leading-none text-foreground">
                    {nodeCount.listingCount}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">
                    listings
                  </div>
                  {isEligibleForBrowse && onBrowseListings != null && (
                    <button
                      type="button"
                      onClick={onBrowseListings}
                      data-testid="browse-node-listings-cta"
                      className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                    >
                      Browse all {nodeCount.listingCount} listings <ArrowRight className="h-[14px] w-[14px]" />
                    </button>
                  )}
                </div>
              )}
            </div>
            
            {levelKind === 'clusters' && (
              <p className="mt-2 max-w-[56ch] text-pretty text-[13px] leading-relaxed text-muted-foreground">
                Pick an area to see its homes. The dashed cluster on the map only zooms.
              </p>
            )}

            {nodeCount != null && nodeCount.matchingAreaCount != null && nodeCount.matchingAreaCount > 0 && headingAreasLabel != null && (
              <div className="mt-3 flex items-center gap-2.5 rounded-md bg-secondary/60 px-3 py-2 text-[12.5px] leading-snug text-foreground/80">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden="true" />
                <span className="flex-1" data-testid="navigation-level-heading-count">
                  {headingAreasLabel} here. Crowded markers are grouped on the map for legibility only.
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {sectionLabel != null && (
        <div
          className="mb-3 flex items-center justify-between border-b border-border pb-2"
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
        <div className="max-h-[480px] overflow-y-auto px-1 pb-1" data-testid="navigation-child-list-scroll">
          <NavigationChildList
            children={children}
            representativeAreaNamesByNodeKey={representativeAreaNamesByNodeKey}
            selectedNodeKey={selectedNodeKey}
            hoveredNodeKey={hoveredNodeKey}
            onSelect={selectNode}
            onHoverChange={onHoverChange}
          />
        </div>
      )}
    </div>
  );
}
