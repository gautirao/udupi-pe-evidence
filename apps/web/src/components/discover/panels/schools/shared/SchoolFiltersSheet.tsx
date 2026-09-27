/**
 * SchoolFiltersSheet — the Filters trigger + Sheet, shared verbatim by
 * SchoolSelectedPanel and AreaSchoolCombinedPanel (Issue #2661 commit 4, no
 * logic/JSX changes vs. the original inline copies — only the data-testid
 * prefix differs per caller, preserved via `testId`).
 */
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { ReactNode } from 'react';

export interface SchoolFiltersSheetProps {
  filtersContent?: ReactNode;
  /** "school-filters-trigger" for SchoolSelectedPanel, "combined-filters-trigger" for AreaSchoolCombinedPanel. */
  testId: string;
}

export function SchoolFiltersSheet({ filtersContent, testId }: SchoolFiltersSheetProps) {
  if (!filtersContent) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        {/* Issue #2717 — mobile (<821px, matches the project's 820px shell breakpoint)
            needs a >=44px touch target for WCAG 2.5.5, but the visible chip must stay
            h-7 to match its Start over/Back neighbours (no extra toolbar row, no
            wrapping at 375x667). `before:` pseudo-element expands only the HIT AREA
            (9px on every side -> 46px+), absolutely positioned so it adds no layout
            width/height of its own. Desktop (>=821px) is untouched — the before:
            rules are all gated behind the max-[820px] variant. */}
        <Button
          variant="outline"
          size="sm"
          data-testid={testId}
          className="relative h-7 gap-1.5 px-2 text-xs max-[820px]:before:absolute max-[820px]:before:inset-[-9px] max-[820px]:before:content-['']"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        {filtersContent}
      </SheetContent>
    </Sheet>
  );
}
