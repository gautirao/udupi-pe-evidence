import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

const JOURNEY_LABELS: Record<DiscoverJourney, string> = {
  'area-first': 'By area',
  'school-first': 'By school',
};

const JOURNEY_PILL_CLASSES: Record<DiscoverJourney, string> = {
  'area-first':
    'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  'school-first':
    'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
};

interface PanelHeaderProps {
  title: string;
  journey?: DiscoverJourney | null;
  onStartOver?: () => void;
  /** Contextual chips rendered in the centre of the header (e.g. active area/school pills). */
  activeContextChips?: React.ReactNode;
  /** Extra action buttons rendered to the right of the title, before Start Over. */
  actions?: React.ReactNode;
}

export function PanelHeader({
  title,
  journey,
  onStartOver,
  activeContextChips,
  actions,
}: PanelHeaderProps) {
  const showStartOver = journey != null && onStartOver != null;

  return (
    <div className="sticky top-0 z-20 bg-card border-b border-border flex-shrink-0 flex items-center gap-2 px-4 py-3">
      {/* Title + optional journey pill */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <h2 className="text-sm font-semibold truncate">{title}</h2>
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
