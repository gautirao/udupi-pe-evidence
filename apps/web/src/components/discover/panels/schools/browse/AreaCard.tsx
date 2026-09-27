/**
 * AreaCard — moved verbatim from SchoolJourneyPanels.tsx (Issue #2661 commit 3,
 * no logic/JSX changes).
 */
import { ChevronRight, GraduationCap, Home, MapPin } from 'lucide-react';

export function AreaCard({
  area,
  onClick,
}: {
  area: { areaKey: string; name: string; schoolCount: number; listingCount?: number };
  onClick: () => void;
}) {
  const hasListings = typeof area.listingCount === 'number';
  return (
    <button
      onClick={onClick}
      data-testid="area-card"
      className="group w-full text-left rounded-xl border border-border bg-card p-4 transition-all hover:border-plum/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-plum-tint text-plum">
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-foreground truncate">{area.name}</span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-plum"
              aria-hidden="true"
            />
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <GraduationCap className="h-3.5 w-3.5 shrink-0 text-plum" aria-hidden="true" />
              <span className="font-semibold text-foreground tabular-nums">{area.schoolCount}</span> school{area.schoolCount === 1 ? '' : 's'}
            </span>
            {hasListings && (
              <span className="flex items-center gap-1">
                <Home className="h-3.5 w-3.5 shrink-0 text-copper" aria-hidden="true" />
                <span className="font-semibold text-foreground tabular-nums">{area.listingCount}</span> listing{area.listingCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
