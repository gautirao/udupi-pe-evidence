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
  /**
   * Issue #1953 build step 6 — override the wrapper's data-testid. Defaults to
   * the existing 'intent-selector' so every current call site (DiscoverRightPanel's
   * top strip, GuidedEntryPanel's controls card, etc.) is unaffected. Needed because
   * DiscoverControlBar now mounts its OWN persistent IntentSelector alongside these
   * per-panel ones — without a distinct testid the two collide under the same
   * data-testid at every panel state, breaking existing single-match test queries.
   * Child button testids (`intent-selector-{buy,rent}`) are intentionally left
   * untouched — no existing test queries those per-instance, so no collision there.
   */
  testId?: string;
  /**
   * Issue #1953 FIX1 — additional className merged onto the "Looking to"
   * label span (only rendered when hideLabel is false). Lets a consumer
   * hide the label responsively (e.g. `hidden lg:inline` in
   * DiscoverControlBar, which needs the label gone at <lg widths to fit
   * city + Buy/Rent + the mobile map trigger on one line) without a second
   * hideLabel value per breakpoint. Optional; other call sites are
   * unaffected when omitted.
   */
  labelClassName?: string;
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
  testId = 'intent-selector',
  labelClassName,
}: IntentSelectorProps) {
  return (
    <div
      className={cn('flex items-center gap-2.5', fill && 'w-full', className)}
      data-testid={testId}
      role="group"
      aria-label="Looking to"
    >
      {!hideLabel && (
        <span
          className={cn('text-xs text-muted-foreground font-medium shrink-0', labelClassName)}
        >
          Looking to
        </span>
      )}
      {/* Segmented control (ReTrends mock): warm bordered track, selected segment lifts
          to a white pill with a soft shadow. */}
      <div
        className={cn(
          'inline-flex items-center gap-0.5 rounded-lg border border-border bg-[hsl(var(--input-bg))] p-1',
          fill && 'flex w-full h-11',
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
                'rounded-md px-4 py-1.5 text-sm font-semibold transition-all flex items-center justify-center',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                fill && 'flex-1 h-full py-0',
                selected
                  ? 'bg-[#1B2A45] text-white shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900 bg-transparent font-medium',
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
