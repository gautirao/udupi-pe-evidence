import React from 'react';
import { cn } from '@/lib/utils';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';

interface IntentSelectorProps {
  intent: DiscoverIntent;
  onIntentChange: (intent: DiscoverIntent) => void;
}

const OPTIONS: { value: DiscoverIntent; label: string }[] = [
  { value: 'buy', label: 'Buy' },
  { value: 'rent', label: 'Rent' },
];

export function IntentSelector({ intent, onIntentChange }: IntentSelectorProps) {
  return (
    <div
      className="flex items-center gap-2.5"
      data-testid="intent-selector"
      role="group"
      aria-label="Looking to"
    >
      <span className="text-xs text-muted-foreground font-medium shrink-0">Looking to</span>
      {/* Compact segmented pill control — selected segment lifts to a white pill (Figma). */}
      <div className="inline-flex items-center rounded-full bg-muted p-0.5">
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
                'rounded-full px-4 py-1 text-xs font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                selected
                  ? 'bg-card text-foreground shadow-sm'
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
