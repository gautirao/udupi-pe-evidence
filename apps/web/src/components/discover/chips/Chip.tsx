import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Issue #2017 — extracted verbatim from ActiveContextChips.tsx so the multi-area
// AREA_SET chip strip (AreaSetChips.tsx) can reuse the same roving-focus chip
// primitive without reopening ActiveContextChips.tsx's own prop surface (guarded
// by a `@ts-expect-error` contract test asserting `selectedArea` is NOT part of
// its props — see ActiveContextChips.test.tsx). ActiveContextChips.tsx now
// imports Chip/ChipSpec from here unchanged.

/** One clearable chip's rendering spec, built before roving-focus indices are assigned. */
export interface ChipSpec {
  id: string;
  icon: React.ReactNode;
  label: string;
  onClear: () => void;
  testId?: string;
  dismissTestId?: string;
  emphasis?: boolean;
  /**
   * Issue #2459 AC6 rule 5 (owner ruling, PR #2502) — let the label WRAP inside the same
   * `max-w-[160px]` box instead of truncating it.
   *
   * OPT-IN, and defaulting to `false` on purpose: every existing caller keeps today's truncating
   * behaviour byte for byte, so this prop has no blast radius on them. That default is the whole
   * reason the ruling permitted touching this shared primitive at all — the alternative on the
   * table was forking it into `ActiveContextChips.tsx`, which would be a second declaration of the
   * roving focus, the four-key keydown handler, the styling and the dual `aria-label` that this
   * file's header says it was extracted to avoid.
   *
   * Width is UNCHANGED. The trade this buys is vertical: a label that needs more than one line
   * gets more than one line (2 lines = 36px, 3 = 54px at this font size) rather than losing its
   * tail to an ellipsis. Nothing about the text itself changes — no abbreviation, no rounding, no
   * rewritten numbers. The rejected alternatives all bought width or brevity by altering what the
   * buyer reads; this one alters only how many lines it occupies.
   *
   * `break-words` is required, not decorative: the multi-meaning labels contain a single
   * unbroken 24-character token (`built-up/warehouse/plot:`) that has no space to wrap at, and
   * would otherwise overflow the box rather than wrap inside it.
   */
  wrap?: boolean;
}

export interface RovingChipProps extends ChipSpec {
  tabIndex: number;
  onFocus: () => void;
  onArrow: (delta: number) => void;
  chipRef: React.Ref<HTMLDivElement>;
}

/** A single dismissable chip with roving-focus keyboard support (design §10). */
export function Chip({
  icon,
  label,
  onClear,
  testId,
  dismissTestId,
  emphasis,
  wrap = false,
  tabIndex,
  onFocus,
  onArrow,
  chipRef,
}: RovingChipProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onArrow(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onArrow(-1);
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      onClear();
    }
  };

  return (
    <div
      ref={chipRef}
      role="group"
      aria-label={`Active filter: ${label}`}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        'focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
        emphasis
          ? 'border border-[hsl(var(--copper))]/60 bg-secondary text-secondary-foreground'
          : 'bg-secondary text-secondary-foreground',
      )}
      data-testid={testId}
    >
      {icon}
      <span className={cn('max-w-[160px]', wrap ? 'whitespace-normal break-words' : 'truncate')}>
        {label}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-3.5 w-3.5 p-0 ml-0.5 hover:bg-transparent hover:text-foreground text-muted-foreground flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        tabIndex={-1}
        aria-label={`Remove ${label}`}
        data-testid={dismissTestId}
      >
        <X className="h-2.5 w-2.5" />
      </Button>
    </div>
  );
}
