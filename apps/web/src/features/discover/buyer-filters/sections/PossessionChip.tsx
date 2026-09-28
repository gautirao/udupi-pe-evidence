import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PossessionChipProps {
  label: string;
  isSupported: boolean;
  isActive: boolean;
  onToggle: () => void;
}

/**
 * Issue #2658 (C3) — extracted verbatim from PropertyFilterGroups.tsx (Issue
 * #2023's possession chip, trailing edge of the TYPE row per the approved
 * mock).
 *
 * Code-review follow-up (unchanged behavior): not every calling surface can
 * actually filter on this (see `isSupported`). When unsupported the chip
 * renders muted/disabled with an explanatory title instead of toggling into
 * an active state that has no effect on the listings shown — an
 * active-looking chip that does nothing is a UX-honesty bug, not a cosmetic
 * one. A stale `filters.readyToMove=true` from a prior session/URL still
 * renders inert rather than silently clearing the user's URL state as a
 * side effect.
 */
export function PossessionChip({ label, isSupported, isActive, onToggle }: PossessionChipProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!isSupported}
      className={cn(
        'h-11 ml-auto min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
        !isSupported
          ? 'cursor-not-allowed opacity-50'
          : isActive
            ? 'border-evergreen bg-evergreen-tint text-evergreen shadow-sm hover:bg-evergreen-tint/80'
            : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
      )}
      onClick={isSupported ? onToggle : undefined}
      data-testid="quick-chip-ready-to-move"
      aria-pressed={isSupported && isActive}
      title={isSupported ? undefined : "Ready-to-move filtering isn't available in this view yet — try Browse all listings"}
    >
      {label}
    </Button>
  );
}
