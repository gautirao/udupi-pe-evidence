import React from 'react';
import { ChevronLeft, X, GraduationCap, MapPin, Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

interface JourneyPill {
  label: string;
  icon: typeof GraduationCap;
  className: string;
}

// Journey pill — label + icon + tone. school-first uses the restrained plum accent
// (matches the ReTrends school-discovery mock "School-first" tag); area/agri keep
// their existing blue/green tones.
const JOURNEY_PILL: Record<DiscoverJourney, JourneyPill> = {
  'area-first': {
    label: 'Area-first',
    icon: MapPin,
    // ReTrends navy eyebrow (navy-100 surface + navy-800 ink) — matches the mock's
    // "Area-first" tag rather than a generic cool blue (Issue #1607 polish).
    className: 'bg-secondary text-secondary-foreground',
  },
  'school-first': {
    label: 'School-first',
    icon: GraduationCap,
    className: 'bg-[hsl(var(--plum-tint))] text-[hsl(var(--plum))]',
  },
  'agri-first': {
    label: 'Agricultural',
    icon: Sprout,
    className: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  },
};

interface PanelHeaderProps {
  title: string;
  journey?: DiscoverJourney | null;
  onStartOver?: () => void;
  /**
   * When provided, renders a "Back" link BELOW the title (matches the mock's
   * journey header, where the back affordance sits under the headline rather than
   * inline before it). Issue #1143 / school-results-design-polish.
   */
  onBack?: () => void;
  /** Previous-level name shown as "Back to {backLabel}" (e.g. "University Belt", "Manipal"). */
  backLabel?: string | null;
  /** Contextual chips rendered on the top row (e.g. active area/school pills). */
  activeContextChips?: React.ReactNode;
  /** Extra action buttons rendered to the right, before Start Over. */
  actions?: React.ReactNode;
}

export function PanelHeader({
  title,
  journey,
  onStartOver,
  onBack,
  backLabel,
  activeContextChips,
  actions,
}: PanelHeaderProps) {
  const showStartOver = journey != null && onStartOver != null;
  const pill = journey != null ? JOURNEY_PILL[journey] : null;
  const showTopRow = activeContextChips != null || actions != null || showStartOver;

  return (
    <div className="sticky top-0 z-20 flex-shrink-0 flex flex-col gap-2.5 bg-background border-b border-border/50 px-4 pt-3 pb-3.5">
      {/* Top row: context chips (left) + actions / Start over (right) */}
      {showTopRow && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">{activeContextChips}</div>
          {(actions != null || showStartOver) && (
            <div className="flex items-center gap-1.5 shrink-0">
              {actions}
              {showStartOver && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                  onClick={onStartOver}
                  aria-label="Start over and return to journey selection"
                  data-testid="start-over-button"
                >
                  Start over
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {/* Title + journey pill */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <h1 className="font-['Fraunces',_ui-serif,_Georgia,_serif] text-2xl font-semibold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {pill != null && (
          <span
            className={cn(
              'shrink-0 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold',
              pill.className,
            )}
          >
            <pill.icon className="h-3.5 w-3.5" aria-hidden />
            {pill.label}
          </span>
        )}
      </div>

      {/* Back link — below the title (mock placement) */}
      {onBack != null && (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel ? `Back to ${backLabel}` : 'Back'}
          data-testid="panel-header-back-button"
          className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          {backLabel ? `Back to ${backLabel}` : 'Back'}
        </button>
      )}
    </div>
  );
}
