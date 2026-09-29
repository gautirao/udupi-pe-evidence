import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Layers, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { StartOverButton } from '@/components/discover/StartOverButton';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

export interface ToolbarProps {
  journey?: DiscoverJourney;
  trendsHref?: string;
  filtersContent?: ReactNode;
  onBack?: () => void;
  onStartOver?: () => void;
  cityLabel: string;
  /** Issue #2729 V2 fix — at the desktop-reskin floor the compact sticky toolbar already shows
   * every filter group inline (never inside this row's mobile Sheet), so the Sheet trigger here
   * is functionally dead weight — no filter capability is lost by hiding it, unlike `onBack`/
   * `onStartOver`, which stay reachable at every width. Defaults `false` (byte-identical to
   * every pre-existing caller that omits this prop). */
  hideFiltersSheet?: boolean;
}

/**
 * Issue #2658 (C3) — extracted verbatim from AreaSelectedPanel.tsx (Issue
 * #2596): the journey pill + Trends / Filters / Back / Start over row.
 * This row is the app's counterpart to the design kit's `ExpModeBar`,
 * which sits in the panel's FIXED top section directly above the filters
 * (ExpPanel.jsx L884-887) — the heading section renders BELOW the
 * quick-filter card, not here.
 *
 * `StartOverButton` always confirms before resetting here
 * (`hasSubstantialState`) — Issue #1817 AC8, because an area is selected
 * (deeper than a region) whenever this toolbar renders.
 */
export function Toolbar({
  journey,
  trendsHref,
  filtersContent,
  onBack,
  onStartOver,
  cityLabel,
  hideFiltersSheet = false,
}: ToolbarProps) {
  return (
    // Issue #2729 V2 fix — additive `min-[1366px]:` padding tightening only (every existing class
    // stays at every width, mobile/tablet byte-identical). Real-browser measurement found ~85px
    // of chrome needed recovering above the first card row at 1366×768 for the tallest
    // (Commercial) case; this row alone recovers 14px (pt-3.5→pt-1, pb-2→pb-1) — see
    // AreaSelectedPanel.tsx/CompactResultsHeader.tsx/WorkflowGroup.tsx/ListingsBody.tsx for the
    // matching tightening elsewhere, and the caller's own report for the running total and the
    // disclosed residual gap.
    <div className="px-4 pb-2 pt-3.5 min-[1366px]:pb-1 min-[1366px]:pt-1">
      {/* No `mb-*` here: this row is the section's only child, so the
          container's own `pb-3` supplies the whole gap. */}
      <div className="flex items-center justify-between gap-2">
        {journey === 'area-first' ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary-foreground">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Area-first
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1.5">
          {trendsHref && (
            <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
              <Link to={trendsHref}>
                <TrendingUp className="h-3.5 w-3.5" />
                Trends
              </Link>
            </Button>
          )}
          {filtersContent && !hideFiltersSheet && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-7 w-7">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="sr-only">Filters</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                {filtersContent}
              </SheetContent>
            </Sheet>
          )}
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onBack}
              aria-label="Back to areas"
              data-testid="back-button"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          {journey != null && onStartOver != null && (
            <StartOverButton
              onStartOver={onStartOver}
              hasSubstantialState
              cityLabel={cityLabel}
              className="h-7 gap-1.5 rounded-full border border-input px-2 text-xs text-muted-foreground hover:text-foreground"
            />
          )}
        </div>
      </div>
    </div>
  );
}
