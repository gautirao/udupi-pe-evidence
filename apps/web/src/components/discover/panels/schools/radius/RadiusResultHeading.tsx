/**
 * RadiusResultHeading — moved verbatim from SchoolJourneyPanels.tsx (Issue #2661
 * commit 3, no logic/JSX changes).
 */
import { MapPin } from 'lucide-react';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';

export interface RadiusResultHeadingProps {
  listingCount: number;
  effectiveRadius: number;
  intent: DiscoverIntent;
  /** School name for the "Homes near {School}" heading (mock parity, cycle 2). Falls
   * back to the generic "this school" copy when the school hasn't resolved yet. */
  schoolName?: string | null;
}

export function RadiusResultHeading({ listingCount, effectiveRadius, intent, schoolName }: RadiusResultHeadingProps) {
  const target = schoolName?.trim() || 'this school';
  const headingText =
    intent === 'rent'
      ? `Rentals near ${target}`
      : `Homes near ${target}`;

  return (
    <div
      className="flex items-center justify-between px-4 py-2 border-b border-border"
      data-testid="radius-result-heading"
    >
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {headingText}
      </p>
      <p className="text-xs font-semibold tabular-nums text-muted-foreground">
        <span data-testid="radius-result-count">{listingCount}</span> within {effectiveRadius} km
      </p>
    </div>
  );
}
