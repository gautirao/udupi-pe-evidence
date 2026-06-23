import { ChevronRight, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface AreaFirstLandingBreadcrumbProps {
  /** Human-readable city label (e.g. "Udupi"). */
  cityLabel: string;
  /** Where the "Home" crumb routes (default "/"). */
  homeHref?: string;
  /**
   * Where the city crumb routes — the city-level Discover landing (journey cleared),
   * e.g. "/discover?city=udupi". Lets the visitor step back up one level.
   */
  cityHref: string;
  className?: string;
}

/**
 * Floating top-left map breadcrumb for the area-first CITY-LEVEL landing (Issue #1607).
 *
 * Reads "Home › {City} › Areas", matching the area-first landing context: Home and the
 * city crumb route progressively (Home → app home, City → the city Discover landing),
 * and the terminal "Areas" crumb represents the current page. Selected group/area crumbs
 * are intentionally NOT shown here — they only appear once the URL carries that state
 * (handled by MapGroupBreadcrumb / AreaIndicatorOverlay), so this never implies a
 * selection the user has not made.
 */
export function AreaFirstLandingBreadcrumb({
  cityLabel,
  homeHref = '/',
  cityHref,
  className,
}: AreaFirstLandingBreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="area-first-landing-breadcrumb"
      className={cn(
        'flex select-none items-center gap-1.5 rounded-full border border-border bg-card/95 px-3.5 py-2 text-[13px] shadow-md backdrop-blur-sm',
        className,
      )}
    >
      <MapPin className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--copper))]" aria-hidden="true" />
      <Link
        to={homeHref}
        className="text-muted-foreground transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        Home
      </Link>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      <Link
        to={cityHref}
        className="max-w-[140px] truncate text-muted-foreground transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        {cityLabel}
      </Link>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      <span aria-current="page" className="font-semibold text-foreground">
        Areas
      </span>
    </nav>
  );
}
