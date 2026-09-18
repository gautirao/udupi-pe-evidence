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
import React, { useState } from 'react';
import { ArrowRight, ChevronDown, X } from 'lucide-react';
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
  countKind?: 'listings' | 'schools';
}

export function NavigationLevelPanel({
  journey,
  representativeAreaNamesByNodeKey,
  selectedNodeKey = null,
  hoveredNodeKey = null,
  onHoverChange,
  cityLabel,
  onBrowseListings,
  countKind = 'listings',
}: NavigationLevelPanelProps) {
  const [isTipDismissed, setIsTipDismissed] = useState(false);
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
  
  let headingPrimaryLabel: string | null = null;
  if (countKind === 'schools') {
    headingPrimaryLabel = nodeCount != null && nodeCount.schoolCount != null ? String(nodeCount.schoolCount) : null;
  } else {
    headingPrimaryLabel = headingShowListingsLine && nodeCount != null ? String(nodeCount.listingCount) : null;
  }
  const headingPrimaryUnit = countKind === 'schools' ? 'schools' : 'listings';

  // Issue #2084 (AC6) — the synthetic city ROOT is the ONE node whose heading
  // leads with the mock's invitational pattern (eyebrow + question) instead
  // of the node-scoped name/count heading every other level keeps. City-wide
  // counts are NOT repeated here — they already live in the persistent
  const isCityRoot = node.nodeKey === ROOT_NODE_KEY;

  // Issue #2087 — bounded local-scope Browse listings CTA. Use canonical descendant scope.
  const descendantAreaCount = node.descendantAreaKeys?.length ?? 0;
  const isEligibleForBrowse = !isCityRoot && descendantAreaCount > 0 && descendantAreaCount <= 15;

  // Issue #2084 (AC7)
  const baseSectionLabel =
    children.length === 0
      ? null
      : levelKind === 'directions'
        ? `Explore ${cityLabel ?? 'this city'}`
        : levelKind === 'clusters'
          ? `Local destinations in ${node.displayLabel}`
          : levelKind === 'areas'
            ? `Areas in ${node.displayLabel}`
            : null;
            
  const sectionLabel = countKind === 'schools' && baseSectionLabel != null
    ? (levelKind === 'directions' ? `Explore schools in ${cityLabel ?? 'this city'}` : `Schools in ${node.displayLabel}`)
    : baseSectionLabel;
            
  const baseEyebrow = levelKind === 'clusters' ? 'Local Destination' : levelKind === 'directions' ? 'Direction' : 'Areas';
  const eyebrowText = countKind === 'schools' ? `Schools · ${node.displayLabel}` : baseEyebrow;
  const eyebrowColorClass = countKind === 'schools' ? 'text-[hsl(var(--plum))]' : 'text-primary';
  // Mock parity (ExpSchools.jsx L131): at an Area-child level the school title
  // is "Areas with schools in <node>", not the bare node label the eyebrow
  // above already carries.
  const nonRootTitle =
    countKind === 'schools' && levelKind === 'areas' ? `Areas with schools in ${node.displayLabel}` : node.displayLabel;

  return (
    <div data-testid="navigation-level-panel" data-node-key={node.nodeKey} className="flex flex-col">
      <NavigationResolutionNotice notice={resolutionNotice} />
      
      <div className="mb-4" data-testid="navigation-level-heading">
        {isCityRoot ? (
          <>
            <p
              className={`text-[12px] font-bold uppercase tracking-[0.06em] ${countKind === 'schools' ? 'text-[hsl(var(--plum))]' : 'text-muted-foreground'}`}
              data-testid="navigation-level-root-eyebrow"
            >
              {countKind === 'schools' ? `Schools · ${cityLabel ?? 'this city'}` : `Discover ${cityLabel ?? 'this city'}`}
            </p>
            <h2
              className="mt-1 font-['Fraunces',_ui-serif,_Georgia,_serif] text-xl font-semibold text-foreground"
              data-testid="navigation-level-root-heading"
            >
              {countKind === 'schools' ? 'Where do you want schools?' : 'Where do you want to explore?'}
            </h2>
            {countKind === 'schools' ? (
              nodeCount?.schoolCount != null && (
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{nodeCount.schoolCount} schools in these areas.</span> Pick a direction, or search a school by name in the bar above — knowing the school is always enough.
                </p>
              )
            ) : (
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Choose an area from the map or the list below. Click an area marker to explore — the map will zoom for you.
              </p>
            )}
          </>
        ) : (
          <div>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className={`text-[11px] font-bold uppercase tracking-[0.08em] ${eyebrowColorClass}`}>
                  {eyebrowText}
                </div>
                <h2 className="mt-1 font-['Fraunces',_ui-serif,_Georgia,_serif] text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
                  {nonRootTitle}
                </h2>
              </div>
              
              {nodeCount != null && (
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[22px] font-semibold leading-none text-foreground">
                    {headingPrimaryLabel ?? '0'}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">
                    {headingPrimaryUnit}
                  </div>
                  {isEligibleForBrowse && onBrowseListings != null && countKind === 'listings' && (
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
            
            {levelKind === 'clusters' && countKind !== 'schools' && (
              <p className="mt-2 max-w-[56ch] text-pretty text-[13px] leading-relaxed text-muted-foreground">
                Pick an area to see its homes. The dashed cluster on the map drills in when tapped.
              </p>
            )}

            {nodeCount != null && nodeCount.matchingAreaCount != null && nodeCount.matchingAreaCount > 0 && headingAreasLabel != null && countKind === 'listings' && (
              <div className="mt-3 flex items-center gap-2.5 rounded-md bg-secondary/60 px-3 py-2 text-[12.5px] leading-snug text-foreground/80">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden="true" />
                <span className="flex-1" data-testid="navigation-level-heading-count">
                  {headingAreasLabel} here. Crowded markers are grouped on the map for legibility only.
                </span>
              </div>
            )}
            {countKind === 'schools' && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2.5 rounded-md bg-secondary/60 px-3 py-2 text-[12.5px] leading-snug text-foreground/80">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--plum))]" aria-hidden="true" />
                  <span className="flex-1" data-testid="schools-inside-note">
                    School counts show schools located inside these areas. They are not a measure of distance from any home.
                  </span>
                </div>
                {levelKind === 'areas' && children.length > 0 && (
                  <div className="flex items-center gap-2.5 rounded-md bg-secondary/60 px-3 py-2 text-[12.5px] leading-snug text-foreground/80">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--plum))]" aria-hidden="true" />
                    <span className="flex-1" data-testid="schools-crowded-note">
                      {children.length} area{children.length === 1 ? '' : 's'} with schools here. Crowded markers are grouped on the map for legibility only.
                    </span>
                  </div>
                )}
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
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground/80">
            {sectionLabel}
          </span>
          <div className="flex items-center gap-2">
            {levelKind === 'directions' && countKind === 'listings' && (
              <button
                type="button"
                className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid="sort-areas-dropdown"
              >
                <span>Sort by Most listings</span>
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
            <span
              className="text-[11px] font-medium text-muted-foreground"
              data-testid="navigation-level-section-count"
            >
              {children.length}
            </span>
          </div>
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
            countKind={countKind}
          />
        </div>
      )}

      {!isTipDismissed && (
        <div
          data-testid="discover-tip-banner"
          className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--copper-border))] bg-[hsl(var(--copper-tint))] p-3 text-xs text-[hsl(var(--navy-800))] shadow-xs"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold text-[hsl(var(--copper-600))]">Tip:</span>
            <span>Explore by area to see property trends, schools, price insights and more.</span>
          </div>
          <button
            type="button"
            onClick={() => setIsTipDismissed(true)}
            aria-label="Dismiss tip"
            className="shrink-0 rounded p-1 text-[hsl(var(--copper-600))] hover:bg-[hsl(var(--copper-tint))]/80 hover:text-[hsl(var(--navy-800))] transition-colors"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
