/**
 * NavigationChildCard — Issue #1956 PR 2 (Slice 3).
 *
 * The destination card for a single direct child of the resolved navigation
 * node (a DIRECTION, CLUSTER/"Local Destination", or AREA).
 *
 * ── LOCKED COMPOSITION ──
 *   • Primary text is ONE OR TWO prominent canonical AREA names for a
 *     structural (DIRECTION/CLUSTER) destination — `representativeAreaNames`,
 *     when supplied, wins over the structural `displayLabel`. An AREA child's
 *     own `displayLabel` already IS a canonical area name, so it is always the
 *     primary text regardless of `representativeAreaNames` (AC3.2, AC3.6 — no
 *     "North of North" concatenation is ever built here; every name is a
 *     server-supplied string, verbatim).
 *   • The right-panel's explicit direction/destination heading is NOT this
 *     component's job — `NavigationChildList`/`NavigationLevelPanel` render it
 *     separately (AC3.4) so map and panel share the same node identity without
 *     this card re-stating it.
 *   • Journey-aware counts: a structural (DIRECTION/CLUSTER) child shows the
 *     journey-aware LISTING count (`formatListingCount`) as its own line, and
 *     ADDITIONALLY the LOCKED areas-with-matches copy (`N areas with matches` /
 *     `No matches with current filters` — `presentStructuralLevel`) whenever
 *     `matchingAreaCount` is derivable, never a `+N` form (that belongs to
 *     PR-3's visual clusters). When `matchingAreaCount` is `null` the areas
 *     line is simply omitted — the listing count is NEVER suppressed for want
 *     of the areas count (count_display_defect_2026_07_29 follow-up, pass 4).
 *     When `matchingAreaCount` is exactly 0, the locked zero literal renders
 *     ALONE (no separate "0 listings" line — a zero matching-area count
 *     guarantees a zero listing count too; see the field doc on
 *     `matchingAreaCount`). A leaf AREA child shows only its own listing count
 *     and never the areas-with-matches line.
 *   • Exactly one of `href`/`onSelect` fires per click (T4) — this card is
 *     `onSelect`-only by construction; it renders no `<a href>`, so a
 *     map-click and a panel-card click can never double-dispatch.
 */
import { cn } from '@/lib/utils';
import { School } from 'lucide-react';
import {
  formatListingCount,
  type AreasNavigationChild,
} from '@/features/discover/navigation/useAreasNavigationJourney';
import {
  presentStructuralLevel,
  type StructuralLevelIdentity,
} from '@/features/discover/navigation/journeyVisibility';

export interface NavigationChildCardProps {
  child: AreasNavigationChild;
  /**
   * 1-2 representative canonical AREA names for a structural destination.
   * Ignored for an AREA child (its own `displayLabel` is already the name).
   * Omit/empty when no representative-name data source is wired yet — the
   * card falls back to the structural `displayLabel` rather than fabricating
   * a name.
   */
  representativeAreaNames?: string[];
  isSelected?: boolean;
  isHighlighted?: boolean;
  onSelect: (nodeKey: string) => void;
  onHoverChange?: (nodeKey: string | null) => void;
}

function primaryLabelFor(child: AreasNavigationChild, representativeAreaNames?: string[]): string {
  if (child.isLeafArea) {
    return child.displayLabel;
  }
  const names = (representativeAreaNames ?? []).filter((n) => n.trim().length > 0).slice(0, 2);
  return names.length > 0 ? names.join(', ') : child.displayLabel;
}

export function NavigationChildCard({
  child,
  representativeAreaNames,
  isSelected = false,
  isHighlighted = false,
  onSelect,
  onHoverChange,
}: NavigationChildCardProps) {
  const primaryLabel = primaryLabelFor(child, representativeAreaNames);

  const identity: StructuralLevelIdentity = {
    nodeKey: child.nodeKey,
    nodeType: child.nodeType,
    displayLabel: child.displayLabel,
    parentNodeKey: null,
    displayOrder: child.displayOrder,
  };
  // BLOCKING FIX (count_display_defect_2026_07_29): matchingAreaCount, never
  // listingCount, feeds the AREAS-WITH-MATCHES line — a Direction's listing
  // total is not its matching-area count (1,736 listings across 12 areas must
  // render "12 areas with matches", not "1736 areas with matches").
  // `child.matchingAreaCount` is `null` when that exact count is not
  // derivable from currently available data (see its field doc in
  // useAreasNavigationJourney.ts) — in that case the areas line is omitted
  // rather than showing an invented or mislabeled number.
  const structuralPresentation = child.isLeafArea || child.matchingAreaCount == null
    ? null
    : presentStructuralLevel(identity, child.matchingAreaCount);

  // count_display_defect_2026_07_29 (pass 4 follow-up): the areas line being
  // unavailable must NEVER suppress the journey-aware LISTING count too — the
  // two are separate lines (locked marker composition: areas line, then
  // listings line). The only time the listing line is withheld for a
  // structural child is when the areas line is showing the LOCKED zero
  // literal, so that literal renders alone rather than alongside a redundant
  // "No listings yet" (a zero matching-area count guarantees zero listings).
  const showListingsLine = child.isLeafArea || !structuralPresentation?.isZeroContent;
  const areasLabel = structuralPresentation?.countLabel ?? null;
  const listingsLabel = showListingsLine ? formatListingCount(child.listingCount) : null;

  return (
    <button
      type="button"
      data-testid={`navigation-child-card-${child.nodeKey}`}
      data-node-key={child.nodeKey}
      aria-pressed={isSelected}
      onClick={() => onSelect(child.nodeKey)}
      onMouseEnter={() => onHoverChange?.(child.nodeKey)}
      onMouseLeave={() => onHoverChange?.(null)}
      onFocus={() => onHoverChange?.(child.nodeKey)}
      onBlur={() => onHoverChange?.(null)}
      className={cn(
        'w-full text-left rounded-lg border bg-card p-3 shadow-sm transition-colors',
        'hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        isSelected && 'border-primary ring-1 ring-primary',
        isHighlighted && !isSelected && 'border-primary/40 bg-primary/5',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm text-foreground truncate">{primaryLabel}</span>
      </div>
      {areasLabel != null && (
        <div
          className="mt-1 text-xs text-muted-foreground"
          data-testid={`navigation-child-card-count-${child.nodeKey}`}
        >
          {areasLabel}
        </div>
      )}
      {listingsLabel != null && (
        <div
          className="mt-1 text-xs text-muted-foreground"
          data-testid={`navigation-child-card-listings-${child.nodeKey}`}
        >
          {listingsLabel}
        </div>
      )}
      {child.schoolCount != null && child.schoolCount > 0 && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <School className="h-3 w-3" aria-hidden="true" />
          <span>{child.schoolCount} schools</span>
        </div>
      )}
    </button>
  );
}
