import type { ComponentType, SVGProps } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface DiscoverMapCrumb {
  /** Visible text for this crumb. */
  label: string;
  /** When set, renders this crumb as a react-router `<Link>` instead of a static span. */
  href?: string;
  /** Marks this as the terminal/current crumb — adds `aria-current="page"` (non-link crumbs only). */
  current?: boolean;
  /**
   * Visual treatment: 'muted' ancestor (default), 'strong' bold current,
   * 'school' plum accent, 'agri' evergreen accent (Issue #1745 Batch B — so
   * agri breadcrumbs aren't stuck on muted/strong like the other two journeys).
   */
  emphasis?: 'muted' | 'strong' | 'school' | 'agri';
  /** Optional truncation width for long labels, e.g. 'max-w-[160px]'. Applies `truncate` alongside it. */
  maxWidthClass?: string;
  /** React list key. When present, also emits a `data-testid="breadcrumb-seg-{key}"` on this crumb. */
  key?: string;
}

interface DiscoverMapBreadcrumbProps {
  /**
   * Ordered, already-resolved crumb list. This component never filters, fabricates, or
   * reorders segments — that responsibility belongs to the caller (see the school-journey
   * call site, which drops any segment whose label hasn't resolved yet).
   */
  segments: DiscoverMapCrumb[];
  /** Leading icon component (e.g. MapPin, GraduationCap). Size/shrink are fixed by this shell. */
  leadingIcon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Colour class applied to the leading icon. */
  leadingIconClassName?: string;
  /** 'default' = text-[13px] / gap-1.5 / h-3.5 chevrons. 'compact' = text-xs / gap-1 / h-3 chevrons. */
  density?: 'default' | 'compact';
  ariaLabel?: string;
  testId?: string;
  /** Overrides the chevron separator colour (default text-muted-foreground/60). */
  separatorClassName?: string;
  /**
   * Merged onto the pill container via `cn` (twMerge) — lets call sites tweak
   * padding/shadow/border/max-width without forking this component.
   */
  containerClassName?: string;
}

const BASE_CONTAINER =
  'flex select-none items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-2 text-[13px] shadow-sm backdrop-blur-sm';

/**
 * Shared floating map-overlay breadcrumb pill (Issue #1745 P4). Consolidates the three
 * previously-separate MAP-OVERLAY pills — MapGroupBreadcrumb (#1595/#1606),
 * AreaFirstLandingBreadcrumb (#1607), and SchoolJourneyBreadcrumb (school-radius overlay) —
 * into one presentational shell. Callers build the resolved `segments` list; this component
 * only renders it, and returns null when there is nothing to show (matching the school
 * breadcrumb's "nothing resolved yet" behaviour).
 */
export function DiscoverMapBreadcrumb({
  segments,
  leadingIcon: LeadingIcon,
  leadingIconClassName,
  density = 'default',
  ariaLabel = 'Breadcrumb',
  testId,
  separatorClassName,
  containerClassName,
}: DiscoverMapBreadcrumbProps) {
  if (segments.length === 0) return null;

  const isCompact = density === 'compact';
  const segmentGapClass = isCompact ? 'gap-1' : 'gap-1.5';

  return (
    <nav
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn(BASE_CONTAINER, isCompact && 'text-xs', containerClassName)}
    >
      <LeadingIcon
        className={cn('h-3.5 w-3.5 shrink-0', leadingIconClassName)}
        aria-hidden="true"
      />
      <ol className={cn('flex items-center overflow-hidden', segmentGapClass)}>
        {segments.map((seg, i) => {
          const emphasisClass =
            seg.emphasis === 'strong'
              ? 'font-semibold text-foreground'
              : seg.emphasis === 'school'
                ? 'font-semibold text-[hsl(var(--plum))]'
                : seg.emphasis === 'agri'
                  ? 'font-semibold text-[hsl(var(--evergreen))]'
                  : 'text-muted-foreground';
          const widthClass = cn('truncate', seg.maxWidthClass);
          const testIdAttr = seg.key ? `breadcrumb-seg-${seg.key}` : undefined;

          const crumb = seg.href ? (
            <Link
              to={seg.href}
              data-testid={testIdAttr}
              className={cn(
                emphasisClass,
                widthClass,
                'transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded',
              )}
            >
              {seg.label}
            </Link>
          ) : (
            <span
              data-testid={testIdAttr}
              aria-current={seg.current ? 'page' : undefined}
              className={cn(emphasisClass, widthClass)}
            >
              {seg.label}
            </span>
          );

          return (
            <li
              key={seg.key ?? `${seg.label}-${i}`}
              className={cn('flex min-w-0 items-center', segmentGapClass)}
            >
              {i > 0 && (
                <ChevronRight
                  className={cn(
                    isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5',
                    'shrink-0 text-muted-foreground/60',
                    separatorClassName,
                  )}
                  aria-hidden="true"
                />
              )}
              {crumb}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
