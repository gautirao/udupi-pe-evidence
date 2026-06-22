import React from 'react';
import { ChevronRight, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MapGroupBreadcrumbProps {
  /** Human-readable city label (e.g. "Udupi"). */
  cityLabel: string;
  /** Selected neighbourhood-group display name (e.g. "University Belt"). */
  groupName: string;
  className?: string;
}

/**
 * Floating top-left map breadcrumb for the area-first selected-group step (Issue #1595).
 *
 * Shows the dynamic `City › Group` path on the map (mock placement), replacing the
 * generic area-indicator card in this state. Purely presentational + data-driven —
 * the "Back to all neighbourhood groups" action lives in the right panel.
 */
export function MapGroupBreadcrumb({ cityLabel, groupName, className }: MapGroupBreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="map-group-breadcrumb"
      className={cn(
        'flex select-none items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-2 text-[13px] shadow-sm backdrop-blur-sm',
        className,
      )}
    >
      <MapPin className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--copper))]" aria-hidden="true" />
      <span className="truncate text-muted-foreground">{cityLabel}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      <span className="max-w-[160px] truncate font-semibold text-foreground">{groupName}</span>
    </nav>
  );
}
