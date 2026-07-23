import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AreaFirstBreadcrumbProps {
  /** Human-readable city label (e.g. "Udupi"). */
  cityLabel: string;
  /**
   * Issue #1745 4-level hierarchy — Macro region display name (e.g. "North Bangalore").
   */
  regionName?: string | null;
  /**
   * Selected neighbourhood-group display name (e.g. "University Belt").
   * Null/undefined when the area was reached without a group context — the
   * group crumb is omitted entirely so the trail stays truthful.
   */
  groupName?: string | null;
  /** Terminal area label (e.g. "Manipal"). Rendered as the current, non-clickable crumb. */
  areaLabel: string;
  /** Navigate to the Discover landing (Home crumb). */
  onHome?: () => void;
  /** Navigate to the city's area-first landing (city crumb). */
  onCity?: () => void;
  /** Navigate back to the macro region's zone list (region crumb). */
  onRegion?: () => void;
  /** Navigate back to the selected group's drill-down (group crumb). */
  onGroup?: () => void;
  className?: string;
}

/**
 * Progressive area-first breadcrumb for the selected-area results state (Issue #1606).
 *
 * Renders the true area-first hierarchy — Home › {City} › {Region} › {Group} › {Area} — replacing
 * the previous generic title-only context. Crumbs route back progressively where a
 * handler is supplied; the terminal area crumb is non-clickable (`aria-current="page"`).
 * The group crumb is omitted when no group context exists, so other area groups/areas
 * (and group-less deep-links) render a correct, shorter trail.
 *
 * Deliberately journey-agnostic in copy: no school-first wording ("Selected school")
 * and no stale generic crumbs that lose the group/area context.
 *
 * Issue #1953 build step 6 (AC9) — restyled to the same pill-and-chevron
 * container pattern as the floating map-overlay breadcrumb
 * (`DiscoverMapBreadcrumb.tsx`'s `BASE_CONTAINER`): one rounded-full pill
 * shell, chevron-separated crumbs inside. Renders ONLY hierarchy levels that
 * exist today (region/group crumbs already conditionally omitted above) —
 * no cluster-level crumb is added here, since that tier does not exist yet
 * (Areas Gate 3 is a separate, not-yet-approved feature). Every existing
 * data-testid, prop, and click-through behaviour is unchanged.
 */
export function AreaFirstBreadcrumb({
  cityLabel,
  regionName,
  groupName,
  areaLabel,
  onHome,
  onCity,
  onRegion,
  onGroup,
  className,
}: AreaFirstBreadcrumbProps) {
  const linkClass =
    'truncate rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const sep = (
    <ChevronRight
      className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50"
      aria-hidden="true"
    />
  );

  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="area-first-breadcrumb"
      className={cn(
        'flex select-none items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-2 text-[13px] shadow-sm',
        className,
      )}
    >
      <button
        type="button"
        onClick={onHome}
        disabled={!onHome}
        data-testid="breadcrumb-home"
        className={cn('inline-flex items-center gap-1', linkClass, !onHome && 'cursor-default')}
      >
        <Home className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Home</span>
      </button>

      {sep}

      <button
        type="button"
        onClick={onCity}
        disabled={!onCity}
        data-testid="breadcrumb-city"
        className={cn('max-w-[120px]', linkClass, !onCity && 'cursor-default')}
      >
        {cityLabel}
      </button>

      {regionName && (
        <>
          {sep}
          <button
            type="button"
            onClick={onRegion}
            disabled={!onRegion}
            data-testid="breadcrumb-region"
            className={cn('max-w-[130px]', linkClass, !onRegion && 'cursor-default')}
          >
            {regionName}
          </button>
        </>
      )}

      {groupName && (
        <>
          {sep}
          <button
            type="button"
            onClick={onGroup}
            disabled={!onGroup}
            data-testid="breadcrumb-group"
            className={cn('max-w-[140px]', linkClass, !onGroup && 'cursor-default')}
          >
            {groupName}
          </button>
        </>
      )}

      {sep}

      <span
        aria-current="page"
        data-testid="breadcrumb-area"
        className="max-w-[140px] truncate font-semibold text-foreground"
      >
        {areaLabel}
      </span>
    </nav>
  );
}
