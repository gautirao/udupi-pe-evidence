import React from 'react';
import { cn } from '@/lib/utils';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';

interface IntentSelectorProps {
  intent: DiscoverIntent;
  onIntentChange: (intent: DiscoverIntent) => void;
  /**
   * Issue #1588 — hide the inline "Looking to" label so the Discover landing controls
   * card can supply its own uppercase eyebrow label without duplication. Defaults to
   * false (label shown) to preserve the always-on top-strip usage.
   */
  hideLabel?: boolean;
  /**
   * Issue #1588 — stretch the segmented control to fill its column (landing controls
   * card, where Buy/Rent sits beside the city select). Default false = compact.
   */
  fill?: boolean;
  /** Optional wrapper className. */
  className?: string;
}

const OPTIONS: { value: DiscoverIntent; label: string }[] = [
  { value: 'buy', label: 'Buy' },
  { value: 'rent', label: 'Rent' },
];

export function IntentSelector({
  intent,
  onIntentChange,
  hideLabel = false,
  fill = false,
  className,
}: IntentSelectorProps) {
  return (
    <div
      className={cn('flex items-center gap-2.5', fill && 'w-full', className)}
      data-testid="intent-selector"
      role="group"
      aria-label="Looking to"
    >
      {!hideLabel && (
        <span className="text-xs text-muted-foreground font-medium shrink-0">Looking to</span>
      )}
      {/* Segmented control (ReTrends mock): warm bordered track, selected segment lifts
          to a white pill with a soft shadow. */}
      <div
        className={cn(
          'inline-flex items-center gap-0.5 rounded-lg border border-border bg-[hsl(var(--input-bg))] p-1',
          fill && 'flex w-full',
        )}
      >
        {OPTIONS.map(({ value, label }) => {
          const selected = intent === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              data-testid={`intent-selector-${value}`}
              onClick={() => onIntentChange(value)}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-semibold transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                fill && 'flex-1',
                selected
                  ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(24,16,12,0.12)] ring-1 ring-border/60'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
