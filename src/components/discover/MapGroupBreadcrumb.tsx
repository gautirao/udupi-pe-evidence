import React from 'react';
import { ChevronRight, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MapGroupBreadcrumbProps {
  /** Human-readable city label (e.g. "Udupi"). */
  cityLabel: string;
  /** Selected neighbourhood-group display name (e.g. "University Belt"). */
  groupName: string;
  /**
   * Selected terminal area name (e.g. "Manipal"). When provided, a third
   * `› {areaName}` segment is appended and becomes the bold current crumb,
   * demoting the group to a muted ancestor — the area-first selected-area
   * map placement (Issue #1606). Omitted = selected-group step (Issue #1595).
   */
  areaName?: string | null;
  className?: string;
}

/**
 * Floating top-left map breadcrumb for the area-first drill-down (Issues #1595 / #1606).
 *
 * Shows the dynamic `City › Group` path on the map for the selected-group step, and
 * `City › Group › Area` once a terminal area is selected (mock placement), replacing the
 * generic area-indicator card in these states. Purely presentational + data-driven — the
 * progressive back-navigation lives in the right panel breadcrumb.
 */
export function MapGroupBreadcrumb({ cityLabel, groupName, areaName, className }: MapGroupBreadcrumbProps) {
  const hasArea = Boolean(areaName && areaName.trim());
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
      <span
        className={cn(
          'max-w-[160px] truncate',
          hasArea ? 'text-muted-foreground' : 'font-semibold text-foreground',
        )}
      >
        {groupName}
      </span>
      {hasArea && (
        <>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
          <span className="max-w-[160px] truncate font-semibold text-foreground">{areaName}</span>
        </>
      )}
    </nav>
  );
}
