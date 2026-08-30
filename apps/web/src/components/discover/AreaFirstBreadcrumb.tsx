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
 * (`DiscoverMapBreadcrumb.tsx`'s `BASE_CONTAINER`): a rounded-full pill
 * shell, chevron-separated crumbs inside. Renders ONLY hierarchy levels that
 * exist today (region/group crumbs already conditionally omitted above) —
 * no cluster-level crumb is added here, since that tier does not exist yet
 * (Areas Gate 3 is a separate, not-yet-approved feature). Every existing
 * data-testid, prop, and click-through behaviour is unchanged.
 *
 * Issue #1956 PR-5 (Slice 6, AC5.9) — below the `sm` breakpoint the pill
 * wraps across multiple lines (`rounded-2xl`) instead of staying a single
 * nowrap line, so no individual crumb needs to be clipped narrower than its
 * own content at a true 390px mobile viewport; the single-line, capped
 * (`max-w-[…]`), `rounded-full` pill is unchanged at `sm:` and above.
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
        // Issue #1956 PR-5 (Slice 6, AC5.9) — the single-line `min-w-0` +
        // per-crumb `max-w-*` + `truncate` combo (still used at `sm:` and up)
        // caps each crumb so a long trail ellipsizes instead of spilling past
        // this pill's rounded border. That is correct at desktop widths,
        // where the fixture data always has room, but at a true 390px mobile
        // viewport the arithmetic doesn't work: a genuine full-depth trail
        // (Home + "Bangalore" + "East Bangalore" + "East Bangalore Emerging"
        // + "Kannamangala - Whitefield Hoskote Road", 39 chars) needs ~700px+
        // of text on one line — no amount of shrink/cap tuning lets every
        // crumb render un-clipped in 390px of single-line space. AC5.9 does
        // NOT ask for one line; it asks for (a) the container to stay within
        // the viewport and (b) no INDIVIDUAL crumb to be clipped. Wrapping
        // (`flex-wrap`, mobile-only) satisfies both: the pill grows taller
        // instead of clipping, while its width stays bounded by its parent.
        // `sm:flex-nowrap` restores the exact prior single-line behaviour at
        // desktop widths, where it was already correct (visual-parity
        // preserved via `sm:rounded-full` too — `rounded-2xl` at mobile keeps
        // a wrapped, multi-line pill from rendering as an oversized stadium).
        'flex min-w-0 flex-wrap select-none items-center gap-1.5 rounded-2xl border border-border bg-card/95 px-3 py-2 text-[13px] shadow-sm sm:flex-nowrap sm:overflow-hidden sm:rounded-full',
        className,
      )}
    >
      <button
        type="button"
        onClick={onHome}
        disabled={!onHome}
        data-testid="breadcrumb-home"
        className={cn('inline-flex shrink-0 items-center gap-1', linkClass, !onHome && 'cursor-default')}
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
        className={cn('min-w-0 max-w-full sm:max-w-[120px]', linkClass, !onCity && 'cursor-default')}
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
            className={cn('min-w-0 max-w-full sm:max-w-[130px]', linkClass, !onRegion && 'cursor-default')}
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
            className={cn('min-w-0 max-w-full sm:max-w-[140px]', linkClass, !onGroup && 'cursor-default')}
          >
            {groupName}
          </button>
        </>
      )}

      {sep}

      <span
        aria-current="page"
        data-testid="breadcrumb-area"
        className="min-w-0 max-w-full truncate font-semibold text-foreground sm:max-w-[140px]"
      >
        {areaLabel}
      </span>
    </nav>
  );
}
