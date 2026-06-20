import React from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

const JOURNEY_LABELS: Record<DiscoverJourney, string> = {
  'area-first': 'By area',
  'school-first': 'By school',
  'agri-first': 'Agricultural land',
};

const JOURNEY_PILL_CLASSES: Record<DiscoverJourney, string> = {
  'area-first':
    'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  'school-first':
    'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  'agri-first':
    'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
};

interface PanelHeaderProps {
  title: string;
  journey?: DiscoverJourney | null;
  onStartOver?: () => void;
  /**
   * When provided, renders a Back chevron button before the title.
   * Used by school-first journey panels (Level 1 and Level 2) to step back
   * without a full Start Over reset. Issue #1143.
   */
  onBack?: () => void;
  /** Contextual chips rendered in the centre of the header (e.g. active area/school pills). */
  activeContextChips?: React.ReactNode;
  /** Extra action buttons rendered to the right of the title, before Start Over. */
  actions?: React.ReactNode;
}

export function PanelHeader({
  title,
  journey,
  onStartOver,
  onBack,
  activeContextChips,
  actions,
}: PanelHeaderProps) {
  const showStartOver = journey != null && onStartOver != null;

  return (
    <div className="sticky top-0 z-20 bg-card border-b border-border flex-shrink-0 flex items-center gap-2 px-4 py-3">
      {/* Optional Back button — rendered before the title for Level 1 / Level 2 school-first states */}
      {onBack != null && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          data-testid="panel-header-back-button"
          className="shrink-0 flex items-center justify-center h-6 w-6 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {/* Title + optional journey pill */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <h2 className="font-serif text-base font-semibold tracking-tight truncate">{title}</h2>
        {journey != null && (
          <span
            className={cn(
              'shrink-0 text-xs px-2 py-0.5 rounded-full font-medium',
              JOURNEY_PILL_CLASSES[journey],
            )}
          >
            {JOURNEY_LABELS[journey]}
          </span>
        )}
      </div>

      {/* Centre: context chips (A4 placeholder) */}
      {activeContextChips != null && (
        <div className="flex items-center gap-1.5">{activeContextChips}</div>
      )}

      {/* Right: extra actions + Start Over */}
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
  );
}
